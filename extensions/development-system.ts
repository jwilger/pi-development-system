// pi-lens-ignore: high-import-coupling -- composition root: it imports every module it wires, by design
import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { cadenceLine, DEFAULT_PUSH_MINUTES } from "../src/context/cadence.ts";
import { appendContextTail, renderContextTail } from "../src/context/context-tail.ts";
import { registerModelAdvice } from "../src/context/model-advice.ts";
import { renderStatus, renderStatusLine, STATUS_KEY } from "../src/context/status.ts";
import { applyPromptSection } from "../src/context/system-prompt.ts";
import { DEFAULT_VERIFIER_MAX, registerTurnVerifier } from "../src/context/turn-verifier.ts";
import { type Exec, timeoutAsFailure } from "../src/core/exec.ts";
import { defaultMatrix } from "../src/core/models.ts";
import { createApprovalStore } from "../src/gates/approvals.ts";
import { registerCommitGuard } from "../src/gates/commit-guard.ts";
import { registerGitGuard } from "../src/gates/git-guard.ts";
import { registerLintSuppressionGuard } from "../src/gates/lint-suppression-guard.ts";
import { registerPushGuard } from "../src/gates/push-guard.ts";
import { createRecordDepartureTool } from "../src/gates/record-departure-tool.ts";
import { registerRedFirstGuard } from "../src/gates/red-first-guard.ts";
import { createRequestApprovalTool } from "../src/gates/request-approval-tool.ts";
import { registerTestGuard } from "../src/gates/test-guard.ts";
import { createJevHolder } from "../src/jev/holder.ts";
import { createIntakeTool } from "../src/planning/intake-tool.ts";
import { createTaskCheckTool } from "../src/planning/task-check-tool.ts";
import { createReviewRecordTool, createReviewStartTool } from "../src/review/review-tools.ts";
import { registerCiCommand } from "../src/state/ci-command.ts";
import { loadConfig } from "../src/state/config.ts";
import { createModelsTool, registerModelsCommand } from "../src/state/models-command.ts";
import { detectProfiles } from "../src/state/profile-detect.ts";
import { createRouteTaskTool } from "../src/state/route-task-tool.ts";
import { createSessionState } from "../src/state/session-state.ts";
import { registerTestEvidence } from "../src/state/test-evidence.ts";
import piSubagent from "../src/subagents/index.ts";

const nonNegotiables = readFileSync(
  new URL("../principles/NON-NEGOTIABLES.md", import.meta.url),
  "utf8",
);

/** Composition root: wires modules, holds no logic. */
// pi-lens-ignore: high-fan-out -- composition root: wiring every module is its whole job
export function createDevelopmentSystem(pi: ExtensionAPI) {
  const state = createSessionState(pi);
  const approvals = createApprovalStore(pi);

  const jevHolder = createJevHolder();
  let jevModel: string | undefined;
  let lastCtx: ExtensionContext | undefined;
  let pushMinutes = DEFAULT_PUSH_MINUTES;

  const refreshStatus = () => {
    lastCtx?.ui.setStatus(STATUS_KEY, renderStatusLine(state.get(), jevModel));
  };

  const refreshProfiles = async (ctx: ExtensionContext) => {
    const config = await loadConfig(ctx.cwd);
    pushMinutes = config.ok ? config.value.cadence.pushMinutes : DEFAULT_PUSH_MINUTES;
    const override = config.ok ? config.value.profiles.override : [];
    const profiles = await detectProfiles(ctx.cwd, override);
    const current = state.get().profiles ?? [];
    if (profiles.join() !== current.join()) state.update((s) => ({ ...s, profiles }));
  };

  const rebuild = async (ctx: ExtensionContext) => {
    lastCtx = ctx;
    const entries = ctx.sessionManager
      .getBranch()
      .flatMap((e) => (e.type === "custom" ? [{ customType: e.customType, data: e.data }] : []));
    // Restore persisted state first: updating before it would append an empty state entry that wins.
    state.rebuildFrom(entries);
    approvals.rebuildFrom(entries);
    const probe = jevHolder.probe(ctx);
    jevModel = probe.model;
    state.update((s) => (s.jev === probe.availability ? s : { ...s, jev: probe.availability }));
    refreshStatus();
    await refreshProfiles(ctx);
  };

  state.onChange(refreshStatus);
  pi.on("session_start", (_event, ctx) => rebuild(ctx));
  pi.on("session_tree", (_event, ctx) => rebuild(ctx));

  pi.on("before_agent_start", (event) => {
    applyPromptSection(event, state.get(), nonNegotiables);
  });

  pi.on("context", (event) => {
    const now = Date.now();
    const cadence = cadenceLine(state.get(), now, pushMinutes);
    const messages = appendContextTail(
      event.messages,
      renderContextTail(state.get(), cadence),
      now,
    );
    return messages === undefined ? undefined : { messages };
  });

  const exec: Exec = async (command, args, options) =>
    timeoutAsFailure(await pi.exec(command, args, options));
  registerGitGuard({ pi, approvals, jev: (ctx) => jevHolder.forContext(ctx) });
  registerCommitGuard({
    pi,
    state,
    jev: (ctx) => jevHolder.forContext(ctx),
    exec,
  });
  registerCiCommand({
    pi,
    state,
    exec,
  });
  registerPushGuard({
    pi,
    state,
    approvals,
    jev: (ctx) => jevHolder.forContext(ctx),
    exec,
  });
  registerTestGuard({ pi, state, approvals, jev: (ctx) => jevHolder.forContext(ctx) });
  registerTestEvidence({ pi, state });
  registerModelAdvice({
    pi,
    state,
    matrix: async (ctx) => {
      const config = await loadConfig(ctx.cwd);
      return config.ok ? config.value.models : defaultMatrix();
    },
  });
  registerTurnVerifier({
    pi,
    state,
    jev: (ctx) => jevHolder.forContext(ctx),
    maxPerSession: async (ctx) => {
      const config = await loadConfig(ctx.cwd);
      return config.ok ? config.value.verifier.maxPerSession : DEFAULT_VERIFIER_MAX;
    },
  });
  registerRedFirstGuard({ pi, state });
  registerLintSuppressionGuard({ pi, state });
  pi.registerTool(createRecordDepartureTool({ pi, state }));
  pi.registerTool(createRequestApprovalTool({ pi, approvals }));
  pi.registerTool(createModelsTool());
  pi.registerTool(createRouteTaskTool({ jev: (ctx) => jevHolder.forContext(ctx) }));
  pi.registerTool(createIntakeTool({ state, jev: (ctx) => jevHolder.forContext(ctx) }));
  pi.registerTool(createTaskCheckTool({ jev: (ctx) => jevHolder.forContext(ctx) }));
  const reviewDeps = {
    state,
    jev: (ctx: ExtensionContext) => jevHolder.forContext(ctx),
    exec,
  } satisfies Parameters<typeof createReviewStartTool>[0];
  pi.registerTool(createReviewStartTool(reviewDeps));
  pi.registerTool(createReviewRecordTool(reviewDeps));
  registerModelsCommand(pi);
  piSubagent(pi);

  pi.registerCommand("devsys-status", {
    description: "Show development-system phase, sizing, slice, departures and Jev status",
    handler: (_args, ctx) => {
      ctx.ui.notify(renderStatus(state.get(), jevModel), "info");
      return Promise.resolve();
    },
  });

  return { state };
}

export default function developmentSystem(pi: ExtensionAPI): void {
  createDevelopmentSystem(pi);
}
