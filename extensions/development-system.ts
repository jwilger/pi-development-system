import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendContextTail, renderContextTail } from "../src/context/context-tail.ts";
import { renderStatus, renderStatusLine, STATUS_KEY } from "../src/context/status.ts";
import { applyPromptSection } from "../src/context/system-prompt.ts";
import { createApprovalStore } from "../src/gates/approvals.ts";
import { registerCommitGuard } from "../src/gates/commit-guard.ts";
import { registerGitGuard } from "../src/gates/git-guard.ts";
import { createRecordDepartureTool } from "../src/gates/record-departure-tool.ts";
import { createRequestApprovalTool } from "../src/gates/request-approval-tool.ts";
import { registerTestGuard } from "../src/gates/test-guard.ts";
import { createJevHolder } from "../src/jev/holder.ts";
import { createModelsTool, registerModelsCommand } from "../src/state/models-command.ts";
import { createSessionState } from "../src/state/session-state.ts";

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

  const rebuild = (ctx: ExtensionContext) => {
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
  registerTestGuard({ pi, state, approvals, jev: (ctx) => jevHolder.forContext(ctx) });
  pi.registerTool(createRecordDepartureTool({ pi, state }));
  pi.registerTool(createRequestApprovalTool({ pi, approvals }));
  pi.registerTool(createModelsTool());
  registerModelsCommand(pi);

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
