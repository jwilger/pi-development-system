import type { DevsysState } from "../core/types.ts";

export const STATUS_KEY = "devsys";

const jevLabel = (state: DevsysState, model: string | undefined): string =>
  state.jev === "online" && model !== undefined ? `online (${model})` : state.jev;

const ciLabel = (state: DevsysState): string | undefined => {
  const { ci } = state;
  if (ci === undefined || ci.status === "unknown") return undefined;
  const sha = ci.sha === undefined ? "" : ` (${ci.sha.slice(0, 7)})`;
  return `ci ${ci.status}${sha}`;
};

export const renderStatusLine = (state: DevsysState, jevModel?: string): string =>
  [`devsys: ${state.phase}`, `jev ${jevLabel(state, jevModel)}`, ciLabel(state)]
    .filter((part) => part !== undefined)
    .join(" · ");

export const renderStatus = (state: DevsysState, jevModel?: string): string =>
  [
    "Development system status",
    `- phase: ${state.phase}`,
    `- sizing: ${state.sizing ?? "unset"}`,
    `- active slice: ${state.activeSlice ?? "none"}`,
    `- open departures: ${state.openDepartures.length}`,
    `- jev: ${jevLabel(state, jevModel)}`,
    `- ci: ${ciLabel(state)?.slice(3) ?? "unknown"}`,
  ].join("\n");
