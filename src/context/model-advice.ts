import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { adviseModel } from "../core/model-advice.ts";
import type { ModelMatrix } from "../core/models.ts";
import type { Phase } from "../core/types.ts";
import { availableModels } from "../state/models-command.ts";
import type { SessionState } from "../state/session-state.ts";

const ADVICE_ENTRY_TYPE = "devsys-model-advice";

export type ModelAdviceDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  matrix(ctx: ExtensionContext): Promise<ModelMatrix>;
};

type Seen = { ctx: ExtensionContext; model: { provider: string; id: string } | undefined };

/**
 * Recommends — never switches — when the coordinator's model tier is below what the phase's slot
 * resolves to. Runs on model_select and on phase change, at most once per (phase, model).
 */
export function registerModelAdvice(deps: ModelAdviceDeps): void {
  const told = new Set<string>();
  let last: Seen | undefined;
  let phase: Phase = deps.state.get().phase;

  const check = async (seen: Seen): Promise<void> => {
    const { model } = seen;
    const current = deps.state.get().phase;
    if (model === undefined) return;
    const ref = `${model.provider}/${model.id}`;
    const key = `${current}|${ref}`;
    if (told.has(key)) return;
    const advice = adviseModel({
      matrix: await deps.matrix(seen.ctx),
      available: availableModels(seen.ctx.modelRegistry),
      phase: current,
      model: ref,
    });
    if (advice === undefined) return;
    told.add(key);
    deps.pi.sendMessage(
      { customType: ADVICE_ENTRY_TYPE, content: advice, display: true },
      { triggerTurn: false },
    );
  };

  deps.pi.on("session_start", (_event, ctx) => {
    last = { ctx, model: ctx.model };
    phase = deps.state.get().phase;
  });
  deps.pi.on("model_select", async (event, ctx) => {
    last = { ctx, model: event.model };
    await check(last);
  });
  deps.state.onChange((state) => {
    if (state.phase === phase) return;
    phase = state.phase;
    if (last !== undefined) void check(last).catch(() => undefined);
  });
}
