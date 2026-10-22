import type { Usage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import type { Jev, JevAskOptions } from "./client.ts";

/** A facade for one invocation; never stored in the shared holder. */
function executionJev(jev: Jev, invocation: JevAskOptions): Jev {
  return {
    availability: () => jev.availability(),
    model: () => jev.model(),
    ask: (state, questions, options) => {
      const signals = [invocation.signal, options?.signal].filter((s) => s !== undefined);
      return jev.ask(state, questions, {
        ...(signals.length > 0 ? { signal: AbortSignal.any(signals) } : {}),
        onUsage: (usage) => {
          invocation.onUsage?.(usage);
          options?.onUsage?.(usage);
        },
      });
    },
  };
}

const optionalSum = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

function sumUsage(a: Usage, b: Usage): Usage {
  const cacheWrite1h = optionalSum(a.cacheWrite1h, b.cacheWrite1h);
  const reasoning = optionalSum(a.reasoning, b.reasoning);
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    totalTokens: a.totalTokens + b.totalTokens,
    ...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
    ...(reasoning === undefined ? {} : { reasoning }),
    cost: {
      input: a.cost.input + b.cost.input,
      output: a.cost.output + b.cost.output,
      cacheRead: a.cost.cacheRead + b.cost.cacheRead,
      cacheWrite: a.cost.cacheWrite + b.cost.cacheWrite,
      total: a.cost.total + b.cost.total,
    },
  };
}

/** Explicitly separate from native tool/session totals; never contains prompts or answers. */
export function hookJev(pi: ExtensionAPI, jev: Jev, ctx: ExtensionContext, source: string): Jev {
  return executionJev(jev, {
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
    onUsage: (usage) =>
      pi.appendEntry("devsys-jev-hook-usage", {
        source,
        accounting: "custom-only",
        model: jev.model(),
        usage,
      }),
  });
}

type JevDependency = { jev: (ctx: ExtensionContext) => Jev };

/** Preserve the complete tool declaration; each execute owns only its direct classifier calls. */
export function withJevToolUsage<P extends TSchema, D extends JevDependency>(
  deps: D,
  build: (scoped: D) => ToolDefinition<P>,
): ToolDefinition<P> {
  const tool = build(deps);
  return {
    ...tool,
    async execute(id, params, signal, onUpdate, ctx) {
      let usage: Usage | undefined;
      const jev = executionJev(deps.jev(ctx), {
        ...(signal === undefined ? {} : { signal }),
        onUsage: (reported) => {
          usage = usage === undefined ? reported : sumUsage(usage, reported);
        },
      });
      const scoped = build({ ...deps, jev: () => jev });
      const result = await scoped.execute(id, params, signal, onUpdate, ctx);
      return usage === undefined
        ? result
        : { ...result, usage: result.usage === undefined ? usage : sumUsage(result.usage, usage) };
    },
  };
}
