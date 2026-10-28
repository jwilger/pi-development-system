import type {
  BeforeAgentStartEvent,
  ContextWithSystemEvent,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Departure, DevsysState } from "../core/types.ts";
import { loadWorkflowGuidance } from "../state/local-guidance.ts";

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

/** Preparation boundary: configured input errors must stop model dispatch, not omit policy. */
export async function applyWorkflowGuidance(
  event: BeforeAgentStartEvent,
  context: Pick<ExtensionContext, "cwd" | "abort">,
): Promise<void> {
  const result = await loadWorkflowGuidance(context.cwd);
  if (!result.ok) {
    // SDK reports hook exceptions without stopping the run; abort explicitly before dispatch.
    context.abort();
    // Fail fast: continuing would run without the owner's explicitly configured authority.
    throw new Error(`${result.error.kind}: ${result.error.message}`);
  }
  event.systemPromptOptions.sections["repository-workflow"] = result.value.section;
}

/** Request-local section replacement also covers automatic tool continuations. */
export async function applyWorkflowRequest(
  event: ContextWithSystemEvent,
  context: Pick<ExtensionContext, "cwd" | "abort">,
  options?: BeforeAgentStartEvent["systemPromptOptions"],
): Promise<{ messages: ContextWithSystemEvent["messages"] }> {
  const result = await loadWorkflowGuidance(context.cwd);
  if (!result.ok) {
    context.abort();
    throw new Error(`${result.error.kind}: ${result.error.message}`);
  }
  if (result.value.sources.length > 0 && options?.forceSystemPrompt !== undefined) {
    context.abort();
    throw new Error(
      "guidance-error: Configured workflow conflicts with a forced system prompt. Repair the overriding extension to use named sections and retry preparation.",
    );
  }
  const section = `<repository-workflow>\n${result.value.section}\n</repository-workflow>`;
  // Request-local patches are not persisted by the SDK. Replace this section in place so an
  // unchanged continuation preserves the previous request prefix rather than moving a tail patch.
  let installed = false;
  return {
    messages: event.messages.map((message) => {
      if (message.role !== "system") return message;
      const { "repository-workflow": _previous, ...others } = message.sections ?? {};
      const sections = installed ? others : { ...others, "repository-workflow": section };
      installed = true;
      return { ...message, sections };
    }),
  };
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
