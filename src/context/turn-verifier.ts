import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { redactSecrets } from "../core/redact.ts";
import { exitCodeOf, summarizeOutput } from "../core/test-runner.ts";
import type { DevsysState, Phase } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeTurn, type ToolEvidence } from "../jev/questions/turn.ts";
import type { SessionState } from "../state/session-state.ts";

export const VERIFIER_THRESHOLD = 0.75;
export const DEFAULT_VERIFIER_MAX = 6;
export const VERIFIER_ENTRY_TYPE = "devsys-verifier";
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
export function assistantParts(message: AgentMessage): Parts | undefined {
  if (message.role !== "assistant") return undefined;
  const text = message.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
  return { text, callsTools: message.content.some((c) => c.type === "toolCall") };
}

const LIST_ITEM = /^(?:\d+[.)]|[-*+])\s/;

/**
 * True when the message ends by asking the user something: the last non-empty line that is not an
 * option-list item ends with a question mark, optionally followed by a short parenthetical ("(y/n)").
 */
export function asksUser(text: string): boolean {
  const last = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !LIST_ITEM.test(l))
    .at(-1);
  return last !== undefined && /\?(?:\s*\([^()]{0,40}\))?[\s)"'*_`]*$/.test(last);
}

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

const TARGET_MAX = 120;

const note = (content: string) => ({
  type: "custom_message" as const,
  customType: VERIFIER_ENTRY_TYPE,
  content,
  display: true,
});

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
    const item: ToolEvidence =
      event.toolName === "bash"
        ? { tool: "bash", summary: described, exitCode }
        : { tool: event.toolName, summary: described };
    evidence = [...evidence, item].slice(-MAX_EVIDENCE);
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
    });
    if (!judged.ok) return undefined;
    const entries = [
      ...(judged.value.unverifiedClaim >= VERIFIER_THRESHOLD ? [note(claimMessage())] : []),
      ...(judged.value.driftFromSlice >= VERIFIER_THRESHOLD &&
      state.activeSlice !== undefined &&
      !expansionRecorded(state, state.activeSlice)
        ? [note(driftMessage(state.activeSlice))]
        : []),
    ];
    if (entries.length === 0) return undefined;
    corrected += 1;
    justCorrected = true;
    return { continue: true, entries };
  });
}
