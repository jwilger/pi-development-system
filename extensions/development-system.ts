import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendContextTail, renderContextTail } from "../src/context/context-tail.ts";
import { renderStatus, renderStatusLine, STATUS_KEY } from "../src/context/status.ts";
import { applyPromptSection } from "../src/context/system-prompt.ts";
import { detectProfiles } from "../src/core/profile.ts";
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
import { registerCiCommand } from "../src/state/ci-command.ts";
import { loadConfig } from "../src/state/config.ts";
import { createModelsTool, registerModelsCommand } from "../src/state/models-command.ts";
import { createRouteTaskTool } from "../src/state/route-task-tool.ts";
import { createSessionState } from "../src/state/session-state.ts";
import { registerTestEvidence } from "../src/state/test-evidence.ts";
import piSubagent from "../src/subagents/index.ts";

const nonNegotiables = readFileSync(
  new URL("../principles/NON-NEGOTIABLES.md", import.meta.url),
  "utf8",
);

/** Composition root: wires modules, holds no logic. */
export function createDevelopmentSystem(pi: ExtensionAPI) {
  const state = createSessionState(pi);
  const approvals = createApprovalStore(pi);

  const jevHolder = createJevHolder();
  let jevModel: string | undefined;
  let lastCtx: ExtensionContext | undefined;

  const refreshStatus = () => {
    lastCtx?.ui.setStatus(STATUS_KEY, renderStatusLine(state.get(), jevModel));
  };

  const refreshProfiles = async (ctx: ExtensionContext) => {
    const config = await loadConfig(ctx.cwd);
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
    const messages = appendContextTail(event.messages, renderContextTail(state.get()), Date.now());
    return messages === undefined ? undefined : { messages };
  });

  registerGitGuard({ pi, approvals, jev: (ctx) => jevHolder.forContext(ctx) });
  registerCommitGuard({
    pi,
    state,
    jev: (ctx) => jevHolder.forContext(ctx),
    exec: (command, args, options) => pi.exec(command, args, options),
  });
  registerCiCommand({
    pi,
    state,
    exec: (command, args, options) => pi.exec(command, args, options),
  });
  registerPushGuard({
    pi,
    state,
    approvals,
    jev: (ctx) => jevHolder.forContext(ctx),
    exec: (command, args, options) => pi.exec(command, args, options),
  });
  registerTestGuard({ pi, state, approvals, jev: (ctx) => jevHolder.forContext(ctx) });
  registerTestEvidence({ pi, state });
  registerRedFirstGuard({ pi, state });
  registerLintSuppressionGuard({ pi, state });
  pi.registerTool(createRecordDepartureTool({ pi, state }));
  pi.registerTool(createRequestApprovalTool({ pi, approvals }));
  pi.registerTool(createModelsTool());
  pi.registerTool(createRouteTaskTool({ jev: (ctx) => jevHolder.forContext(ctx) }));
  registerModelsCommand(pi);
  piSubagent(pi);

  pi.registerCommand("devsys-status", {
    description: "Show development-system phase, sizing, slice, departures and Jev status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderStatus(state.get(), jevModel), "info");
    },
  });

  return { state };
}

export default function developmentSystem(pi: ExtensionAPI): void {
  createDevelopmentSystem(pi);
}
