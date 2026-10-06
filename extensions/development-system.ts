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
export default function developmentSystem(pi: ExtensionAPI): void {
  const state = createSessionState(pi);

  const refreshStatus = (ctx: ExtensionContext) => {
    ctx.ui.setStatus(STATUS_KEY, renderStatusLine(state.get()));
  };

  pi.on("session_start", (_event, ctx) => {
    state.rebuildFrom(ctx.sessionManager.getBranch().flatMap(toCustomEntry));
    refreshStatus(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    state.rebuildFrom(ctx.sessionManager.getBranch().flatMap(toCustomEntry));
    refreshStatus(ctx);
  });

  pi.on("before_agent_start", (event) => {
    applyPromptSection(event, state.get(), nonNegotiables);
  });

  pi.registerCommand("devsys-status", {
    description: "Show development-system phase, sizing, slice, departures and Jev status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderStatus(state.get()), "info");
    },
  });
}

function toCustomEntry(entry: unknown): Array<{ customType: string; data: unknown }> {
  if (typeof entry !== "object" || entry === null) return [];
  const e = entry as { type?: unknown; customType?: unknown; data?: unknown };
  return e.type === "custom" && typeof e.customType === "string"
    ? [{ customType: e.customType, data: e.data }]
    : [];
}
