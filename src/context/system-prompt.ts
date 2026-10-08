import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import type { Departure, DevsysState } from "../core/types.ts";

/**
 * Two sections, kept apart on purpose. pi diffs system-prompt sections per run and appends
 * only the ones whose text changed, so the static section is paid for once per conversation
 * and only the small state section is resent when the workflow state moves. Nothing in either
 * may change from call to call within a run (that would break the provider's prefix cache).
 */
const PRINCIPLES_SECTION = "development-system";
const STATE_SECTION = "development-system-state";

const MAX_DEPARTURES = 12;
const REMINDER =
  "Call devsys_record_departure before acting against a default; hard stops need the user.";

const scopeLabel = (d: Departure): string =>
  d.scope.kind === "slice" ? `slice ${d.scope.slice}` : d.scope.kind;

/** Pure: the static principles section — byte-identical whatever the state. */
export function buildPrinciplesSection(nonNegotiables: string): string {
  return nonNegotiables.trim();
}

/**
 * Pure: the small state section. Jev availability is deliberately absent — it flaps, and the
 * status line already shows it. Timestamps and counters that tick are absent for the same reason.
 */
export function buildStateSection(state: DevsysState): string {
  const lines = [
    "## Workflow state at the start of this prompt (call the devsys tool for the live phase)",
    `- phase: ${state.phase}`,
    `- sizing: ${state.sizing ?? "none"}`,
    `- active slice: ${state.activeSlice ?? "none"}`,
    `- profiles: ${(state.profiles?.length ?? 0) > 0 ? state.profiles?.join(", ") : "none"}`,
  ];
  const open = state.openDepartures;
  if (open.length === 0) {
    lines.push("- open departures: none");
  } else {
    lines.push("- open departures:");
    const shown = open.slice(0, MAX_DEPARTURES);
    for (const d of shown) {
      lines.push(`  - ${d.gate} — ${d.chosen.replace(/\s+/g, " ")} (${scopeLabel(d)})`);
    }
    if (open.length > shown.length) lines.push(`  - …and ${open.length - shown.length} more`);
  }
  lines.push("", REMINDER);
  return lines.join("\n");
}

/** Adapter: sets both sections on a before_agent_start event (never returns systemPrompt). */
export function applyPromptSections(
  event: BeforeAgentStartEvent,
  state: DevsysState,
  nonNegotiables: string,
): void {
  event.systemPromptOptions.sections[PRINCIPLES_SECTION] = buildPrinciplesSection(nonNegotiables);
  event.systemPromptOptions.sections[STATE_SECTION] = buildStateSection(state);
}
