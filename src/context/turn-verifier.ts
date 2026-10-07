import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { redactSecrets } from "../core/redact.ts";
import { reviewOf } from "../core/review-flow.ts";
import { exitCodeOf, summarizeOutput } from "../core/test-runner.ts";
import type { DevsysState, Phase } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeTurn, type ToolEvidence } from "../jev/questions/turn.ts";
import type { SessionState } from "../state/session-state.ts";

const VERIFIER_THRESHOLD = 0.75;
export const DEFAULT_VERIFIER_MAX = 6;
const VERIFIER_ENTRY_TYPE = "devsys-verifier";
const VERIFIED_PHASES: ReadonlySet<Phase> = new Set(["implementing", "reviewing", "delivering"]);
const MAX_EVIDENCE = 60;

export type TurnVerifierDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  jev(ctx: ExtensionContext): Jev;
  maxPerSession(ctx: ExtensionContext): number | Promise<number>;
};

type Parts = { text: string; callsTools: boolean };

/** Text and tool-call presence of an assistant message; undefined for any other role. */
function assistantParts(message: AgentMessage): Parts | undefined {
  if (message.role !== "assistant") return undefined;
  const text = message.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
  return { text, callsTools: message.content.some((c) => c.type === "toolCall") };
}

const LIST_ITEM = /^(?:\d+[.)]|[-*+])\s/;

const QUESTION_END = /\?(?:\s*\([^()]{0,40}\))?[\s)"'*_`]*$/;
/** A lead-in that asks for a choice ("Want me to:", "Which next:"), not a status summary ("Changes:"). */
const CHOICE_LEAD_IN =
  /\b(?:want me to|would you like|should i|shall i|which|do you want|let me know|choose|pick)\b[^\n]*:\s*$/i;

/**
 * True when the message ends by asking the user something: the last non-empty line, or the last line
 * before an option list, ends with a question mark (optionally followed by a short parenthetical
 * like "(y/n)"), or a bare option list follows a lead-in that asks for a choice. A plain "Summary:" list is not a question.
 */
export function asksUser(text: string): boolean {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const last = lines.at(-1);
  if (last === undefined) return false;
  if (QUESTION_END.test(last)) return true;
  const lead = lines.filter((l) => !LIST_ITEM.test(l)).at(-1);
  if (lead === undefined) return false;
  return QUESTION_END.test(lead) || (LIST_ITEM.test(last) && CHOICE_LEAD_IN.test(lead));
}

const hasReviewRound = (state: DevsysState, slice: DevsysState["activeSlice"] & string): boolean =>
  (reviewOf(state, slice)?.rounds.length ?? 0) > 0;

/** True when a scope.expansion departure already covers the slice: the remedy the note asks for exists. */
const expansionRecorded = (state: DevsysState, slice: string): boolean =>
  state.openDepartures.some(
    (d) =>
      d.gate === "scope.expansion" &&
      (d.scope.kind === "session" || (d.scope.kind === "slice" && d.scope.slice === slice)),
  );

const claimMessage = (): string =>
  "Development system: your last message claims something was run, passed or done, but no tool evidence in this run shows it. Run the verification now, or restate without the claim.";

const driftMessage = (slice: string): string =>
  `Development system: your last message describes work beyond the active slice "${slice}". Either return to the slice, or call devsys_record_departure (gate scope.expansion) to record why the scope is growing.`;

const reviewMessage = (slice: string): string =>
  `Development system: your last message calls the slice "${slice}" finished, but no review round has been recorded for it. Call devsys_review_start for a fresh-context review before committing.`;

const TARGET_MAX = 120;

const note = (content: string) => ({
  type: "custom_message" as const,
  customType: VERIFIER_ENTRY_TYPE,
  content,
  display: true,
});

/** What a finished tool call proves, for Jev: the target, the output tail and (for bash) the real exit code. */
function evidenceOf(event: ToolResultEvent): ToolEvidence {
  const text = event.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
  const summary = summarizeOutput(text);
  const command = typeof event.input.command === "string" ? event.input.command : undefined;
  // exitCodeOf sees through `npm test | tail`, which would otherwise show a failing run as exit 0.
  const exitCode = exitCodeOf({
    isError: event.isError,
    text,
    structured: event.structuredContent,
    ...(command === undefined ? {} : { command }),
  });
  // Name what ran or which file: a check that passes silently (`tsc --noEmit`) prints nothing.
  const target = redactSecrets(
    command ?? (typeof event.input.path === "string" ? event.input.path : ""),
  )
    .replace(/\s+/g, " ")
    .slice(0, TARGET_MAX);
  const described = target === "" ? summary : `${target} → ${summary}`;
  return event.toolName === "bash"
    ? { tool: "bash", summary: described, exitCode }
    : { tool: event.toolName, summary: described };
}

/** The corrective notes a judged turn earns: an unverified claim, and drift not yet covered by a departure. */
function correctionsFor(
  judged: { unverifiedClaim: number; driftFromSlice: number; sliceDone: number },
  state: DevsysState,
) {
  const slice = state.activeSlice;
  const drifted =
    judged.driftFromSlice >= VERIFIER_THRESHOLD &&
    slice !== undefined &&
    !expansionRecorded(state, slice);
  return [
    ...(judged.unverifiedClaim >= VERIFIER_THRESHOLD ? [note(claimMessage())] : []),
    ...(drifted && slice !== undefined ? [note(driftMessage(slice))] : []),
    ...(slice !== undefined &&
    judged.sliceDone >= VERIFIER_THRESHOLD &&
    !hasReviewRound(state, slice)
      ? [note(reviewMessage(slice))]
      : []),
  ];
}

/**
 * At turn end, asks Jev whether the final message claims results no tool call supports, or wanders
 * from the active slice, and forces ONE corrective continuation. Bounded: never on a turn that
 * still calls tools, never on a question to the user, never twice in a row, never more than
 * `maxPerSession` times. Jev trouble means silence, not a block.
 */
export function registerTurnVerifier(deps: TurnVerifierDeps): void {
  let evidence: ToolEvidence[] = [];
  let corrected = 0;
  let justCorrected = false;

  deps.pi.on("session_start", () => {
    corrected = 0;
    justCorrected = false;
    evidence = [];
  });
  deps.pi.on("agent_start", () => {
    evidence = [];
    justCorrected = false;
  });
  deps.pi.on("tool_result", (event) => {
    evidence = [...evidence, evidenceOf(event)].slice(-MAX_EVIDENCE);
  });

  deps.pi.on("turn_end", async (event, ctx) => {
    // An aborted or errored turn is dropped by pi; judging it would delay the abort and spend a correction.
    if (event.outcome !== "completed") return undefined;
    const state = deps.state.get();
    if (!VERIFIED_PHASES.has(state.phase)) return undefined;
    const parts = assistantParts(event.message);
    if (parts === undefined || parts.callsTools || parts.text.trim() === "") return undefined;
    if (justCorrected) {
      justCorrected = false;
      return undefined;
    }
    if (asksUser(parts.text) || corrected >= (await deps.maxPerSession(ctx))) return undefined;
    const jev = deps.jev(ctx);
    if (jev.availability() === "offline") return undefined;
    const judged = await judgeTurn(jev, {
      assistantText: parts.text,
      toolEvidence: evidence,
      ...(state.activeSlice === undefined ? {} : { activeSlice: state.activeSlice }),
      checkDone:
        state.phase === "implementing" &&
        state.activeSlice !== undefined &&
        !hasReviewRound(state, state.activeSlice),
    });
    if (!judged.ok) return undefined;
    const entries = correctionsFor(judged.value, state);
    if (entries.length === 0) return undefined;
    corrected += 1;
    justCorrected = true;
    return { continue: true, entries };
  });
}
