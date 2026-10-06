import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { renderStatus, renderStatusLine, STATUS_KEY } from "../src/context/status.ts";
import { applyPromptSection } from "../src/context/system-prompt.ts";
import { createApprovalStore } from "../src/gates/approvals.ts";
import { registerGitGuard } from "../src/gates/git-guard.ts";
import { createRecordDepartureTool } from "../src/gates/record-departure-tool.ts";
import { createRequestApprovalTool } from "../src/gates/request-approval-tool.ts";
import { createSessionState } from "../src/state/session-state.ts";

const nonNegotiables = readFileSync(
  new URL("../principles/NON-NEGOTIABLES.md", import.meta.url),
  "utf8",
);

/** Composition root: wires modules, holds no logic. */
export function createDevelopmentSystem(pi: ExtensionAPI) {
  const state = createSessionState(pi);
  const approvals = createApprovalStore(pi);

  let lastCtx: ExtensionContext | undefined;

  const refreshStatus = () => {
    lastCtx?.ui.setStatus(STATUS_KEY, renderStatusLine(state.get()));
  };

  const rebuild = (ctx: ExtensionContext) => {
    lastCtx = ctx;
    const entries = ctx.sessionManager
      .getBranch()
      .flatMap((e) => (e.type === "custom" ? [{ customType: e.customType, data: e.data }] : []));
    state.rebuildFrom(entries);
    approvals.rebuildFrom(entries);
    refreshStatus();
  };

  state.onChange(refreshStatus);
  pi.on("session_start", (_event, ctx) => rebuild(ctx));
  pi.on("session_tree", (_event, ctx) => rebuild(ctx));

  pi.on("before_agent_start", (event) => {
    applyPromptSection(event, state.get(), nonNegotiables);
  });

  registerGitGuard({ pi, approvals });
  pi.registerTool(createRecordDepartureTool({ pi, state }));
  pi.registerTool(createRequestApprovalTool({ pi, approvals }));

  pi.registerCommand("devsys-status", {
    description: "Show development-system phase, sizing, slice, departures and Jev status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderStatus(state.get()), "info");
    },
  });

  return { state };
}

export default function developmentSystem(pi: ExtensionAPI): void {
  createDevelopmentSystem(pi);
}
