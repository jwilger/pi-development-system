import type { DevsysState } from "../core/types.ts";

export const STATUS_KEY = "devsys";

const jevLabel = (state: DevsysState, model: string | undefined): string =>
  state.jev === "online" && model !== undefined ? `online (${model})` : state.jev;

export const renderStatusLine = (state: DevsysState, jevModel?: string): string =>
  `devsys: ${state.phase} · jev ${jevLabel(state, jevModel)}`;

export const renderStatus = (state: DevsysState, jevModel?: string): string =>
  [
    "Development system status",
    `- phase: ${state.phase}`,
    `- sizing: ${state.sizing ?? "unset"}`,
    `- active slice: ${state.activeSlice ?? "none"}`,
    `- open departures: ${state.openDepartures.length}`,
    `- jev: ${jevLabel(state, jevModel)}`,
  ].join("\n");
