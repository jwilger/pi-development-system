import type { DevsysState } from "../core/types.ts";

export const STATUS_KEY = "devsys";

export const renderStatusLine = (state: DevsysState): string =>
  `devsys: ${state.phase} · jev ${state.jev}`;

export const renderStatus = (state: DevsysState): string =>
  [
    "Development system status",
    `- phase: ${state.phase}`,
    `- sizing: ${state.sizing ?? "unset"}`,
    `- active slice: ${state.activeSlice ?? "none"}`,
    `- open departures: ${state.openDepartures.length}`,
    `- jev: ${state.jev}`,
  ].join("\n");
