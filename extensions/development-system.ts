import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { renderStatus, renderStatusLine, STATUS_KEY } from "../src/context/status.ts";
import { applyPromptSection } from "../src/context/system-prompt.ts";
import { createSessionState } from "../src/state/session-state.ts";

const nonNegotiables = readFileSync(
  new URL("../principles/NON-NEGOTIABLES.md", import.meta.url),
  "utf8",
);

/** Composition root: wires modules, holds no logic. */
export function createDevelopmentSystem(pi: ExtensionAPI) {
  const state = createSessionState(pi);

  let lastCtx: ExtensionContext | undefined;

  const refreshStatus = () => {
    lastCtx?.ui.setStatus(STATUS_KEY, renderStatusLine(state.get()));
  };

  const rebuild = (ctx: ExtensionContext) => {
    lastCtx = ctx;
    state.rebuildFrom(
      ctx.sessionManager
        .getBranch()
        .flatMap((e) => (e.type === "custom" ? [{ customType: e.customType, data: e.data }] : [])),
    );
    refreshStatus();
  };

  state.onChange(refreshStatus);
  pi.on("session_start", (_event, ctx) => rebuild(ctx));
  pi.on("session_tree", (_event, ctx) => rebuild(ctx));

  pi.on("before_agent_start", (event) => {
    applyPromptSection(event, state.get(), nonNegotiables);
  });

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
