import type { DevsysState } from "../core/types.ts";
import { activeReview } from "./status.ts";

const MAX_DEPARTURES = 8;

/** The durable working state as a short markdown block, for compaction resync and the like. */
export function renderStateBlock(state: DevsysState): string {
  const departures = state.openDepartures.map(
    (d) => `  - ${d.gate} — ${d.chosen.replace(/\s+/g, " ")}`,
  );
  const shown =
    departures.length <= MAX_DEPARTURES
      ? departures
      : [
          ...departures.slice(0, MAX_DEPARTURES - 1),
          `  - …and ${departures.length - MAX_DEPARTURES + 1} more`,
        ];
  const run = state.lastTestRun;
  return [
    "## Development System State",
    `- phase: ${state.phase}`,
    `- sizing: ${state.sizing ?? "unset"}`,
    `- slice: ${state.activeSlice ?? "none"}`,
    `- open departures: ${state.openDepartures.length === 0 ? "none" : state.openDepartures.length}`,
    ...shown,
    `- ${activeReview(state) ?? "review: none"}`,
    `- last test run: ${run === undefined ? "none" : `exit ${run.exitCode} — ${run.summary}`}`,
    `- last push: ${state.lastPushAt ?? "none"}`,
  ].join("\n");
}
