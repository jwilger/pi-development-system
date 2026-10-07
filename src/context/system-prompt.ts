import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import type { DevsysState } from "../core/types.ts";

const PROMPT_SECTION_NAME = "development-system";

/** Pure: renders the system-prompt section from current state. */
export function buildPromptSection(state: DevsysState, nonNegotiables: string): string {
  const slice = state.activeSlice ?? "none";
  return [
    nonNegotiables.trim(),
    "",
    "## Current state",
    `- phase: ${state.phase}`,
    `- active slice: ${slice}`,
    `- open departures: ${state.openDepartures.length}`,
    `- jev: ${state.jev}`,
  ].join("\n");
}

/** Adapter: mutates the section on a before_agent_start event (never returns systemPrompt). */
export function applyPromptSection(
  event: BeforeAgentStartEvent,
  state: DevsysState,
  nonNegotiables: string,
): void {
  event.systemPromptOptions.sections[PROMPT_SECTION_NAME] = buildPromptSection(
    state,
    nonNegotiables,
  );
}
