import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SessionState } from "../state/session-state.ts";
import { renderStateBlock } from "./state-block.ts";

export const RESYNC_ENTRY_TYPE = "devsys-resync";

/**
 * pi lets `session_before_compact` only REPLACE the whole summary (summary, firstKeptEntryId,
 * tokensBefore), which would mean writing our own summariser and paying another model call. So the
 * summary is left to pi, and once it lands we re-state the working state as one message the next
 * request sees. State itself lives in session entries and the per-turn context tail, so nothing is
 * lost; this just makes it visible to the model again.
 */
export function registerCompactionResync(deps: { pi: ExtensionAPI; state: SessionState }): void {
  deps.pi.on("session_compact", () => {
    const state = deps.state.get();
    if (state.phase === "idle" && state.openDepartures.length === 0) return;
    deps.pi.sendMessage({
      customType: RESYNC_ENTRY_TYPE,
      content: `[devsys resync] Context was compacted. Current working state:\n\n${renderStateBlock(state)}`,
      display: true,
    });
  });
}
