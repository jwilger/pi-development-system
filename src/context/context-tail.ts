import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Departure, DevsysState } from "../core/types.ts";

const MAX_LINES = 25;
const REMINDER =
  "Departures: call devsys_record_departure before acting against a default; hard stops need the user.";

const scopeLabel = (d: Departure): string =>
  d.scope.kind === "slice" ? `slice ${d.scope.slice}` : d.scope.kind;

/** Small, cache-friendly reminder appended at the end of the context; undefined when nothing to say. */
export function renderContextTail(
  state: DevsysState,
  cadence?: string,
  note?: string,
): string | undefined {
  if (state.phase === "idle" && state.openDepartures.length === 0 && note === undefined) {
    return undefined;
  }
  const head = [
    "[development-system]",
    `phase: ${state.phase} · slice: ${state.activeSlice ?? "none"}`,
    `Jev: ${state.jev}`,
    ...((state.profiles?.length ?? 0) > 0 ? [`profiles: ${state.profiles?.join(", ")}`] : []),
  ];
  const tailLines = [
    ...(note === undefined ? [] : [note]),
    ...(cadence === undefined ? [] : [cadence]),
    REMINDER,
  ];
  const room = MAX_LINES - head.length - tailLines.length - 1;
  const lines = state.openDepartures.map(
    (d) => `- ${d.gate} — ${d.chosen.replace(/\s+/g, " ")} (${scopeLabel(d)})`,
  );
  const shown =
    lines.length <= room
      ? lines
      : [...lines.slice(0, room - 1), `- …and ${lines.length - room + 1} more`];
  return [...head, "Open departures:", ...shown, ...tailLines].join("\n");
}

/** Appends the tail as a user-role message at the end of `messages`. */
export function appendContextTail(
  messages: ReadonlyArray<AgentMessage>,
  tail: string | undefined,
  now: number,
): AgentMessage[] | undefined {
  if (tail === undefined) return undefined;
  return [...messages, { role: "user", content: tail, timestamp: now }];
}
