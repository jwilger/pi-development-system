import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, type TSchema, Type } from "typebox";
import type { Result } from "../core/result.ts";
import { isParseError } from "../core/types.ts";
import { parseTaskRecord } from "../planning/task-record.ts";
import type { Jev, JevError } from "./client.ts";
import { judgeTaskReadiness } from "./questions/readiness.ts";
import { judgeLenses } from "./questions/review.ts";
import { judgeSizing } from "./questions/sizing.ts";
import { judgeTestChange } from "./questions/test-change.ts";

/** Tool namespace that groups the Jev judgements for codemode scripts. */
const JUDGE_NAMESPACE = {
  name: "devsys-judge",
  description:
    "Jev judgements as data: probabilities and labels a script can branch on (sizing, test-change, lenses, task readiness).",
  instructions:
    'Each tool returns JSON text: the judgement. When Jev is unavailable the call rejects with a message holding {"error": …}, so wrap calls in try/catch or Promise.allSettled. Inputs are redacted and clipped before they reach Jev. Use these inside codemode scripts; they change no state.',
} as const;

type Deps = { jev: (ctx: ExtensionContext) => Jev };

const reply = (payload: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  details: undefined,
  isError,
});

const fromResult = (result: Result<unknown, JevError>) =>
  result.ok ? reply(result.value) : reply({ error: result.error }, true);

function judgeTool<P extends TSchema>(
  spec: {
    name: string;
    label: string;
    description: string;
    parameters: P;
  },
  run: (deps: Deps, params: Static<P>, ctx: ExtensionContext) => Promise<ReturnType<typeof reply>>,
  deps: Deps,
): ToolDefinition<P> {
  return {
    ...spec,
    exposure: "codemode",
    namespace: JUDGE_NAMESPACE,
    execute: (_id, params, _signal, _onUpdate, ctx) => run(deps, params, ctx),
  };
}

export function createJudgeTools(deps: Deps): ToolDefinition[] {
  const sizing = judgeTool(
    {
      name: "judge_sizing",
      label: "Judge sizing",
      description:
        "Size a request as fix, change, capability or product, with the probability each planning artifact is needed.",
      parameters: Type.Object({
        request: Type.String(),
        repoSummary: Type.Optional(Type.String()),
      }),
    },
    async (d, p, ctx) =>
      fromResult(
        await judgeSizing(d.jev(ctx), { request: p.request, repoSummary: p.repoSummary ?? "" }),
      ),
    deps,
  );
  const testChange = judgeTool(
    {
      name: "judge_test_change",
      label: "Judge test change",
      description:
        "Judge whether a change to a test file weakens what the tests verify. Omit `after` for a deleted file.",
      parameters: Type.Object({
        path: Type.String(),
        before: Type.Optional(Type.String()),
        after: Type.Optional(Type.String()),
        recentFailure: Type.Optional(Type.String()),
      }),
    },
    async (d, p, ctx) => fromResult(await judgeTestChange(d.jev(ctx), p)),
    deps,
  );
  const lenses = judgeTool(
    {
      name: "judge_lenses",
      label: "Judge review lenses",
      description: "Probability per review lens that it applies to a diff.",
      parameters: Type.Object({
        diffStat: Type.String(),
        diffSample: Type.String(),
        profiles: Type.Optional(Type.Array(Type.String())),
      }),
    },
    async (d, p, ctx) =>
      fromResult(
        await judgeLenses(d.jev(ctx), {
          diffStat: p.diffStat,
          diffSample: p.diffSample,
          profiles: p.profiles ?? [],
        }),
      ),
    deps,
  );
  const readiness = judgeTool(
    {
      name: "judge_task_readiness",
      label: "Judge task readiness",
      description:
        "Judge whether a task record (markdown, optionally one id out of a plan) is ready for an implementer: ready, needs-detail or too-big.",
      parameters: Type.Object({ markdown: Type.String(), id: Type.Optional(Type.String()) }),
    },
    async (d, p, ctx) => {
      const record = parseTaskRecord(p.markdown, p.id);
      if (isParseError(record)) return reply({ error: record.message }, true);
      return fromResult(await judgeTaskReadiness(d.jev(ctx), record));
    },
    deps,
  );
  // SAFETY: pi stores tools as ToolDefinition<TSchema>; each tool here only reads its own validated params.
  return [sizing, testChange, lenses, readiness] as unknown as ToolDefinition[];
}
