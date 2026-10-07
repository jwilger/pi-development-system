import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { redactSecrets } from "../core/redact.ts";
import { summarizeOutput } from "../core/test-runner.ts";
import type { Phase } from "../core/types.ts";
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

/** True when the last non-empty line of the message ends with a question mark. */
export function asksUser(text: string): boolean {
  const last = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .at(-1);
  return last !== undefined && /\?[\s)"'*_`]*$/.test(last);
}

const claimMessage = (): string =>
  "Development system: your last message claims something was run, passed or done, but no tool evidence in this run shows it. Run the verification now, or restate without the claim.";

const driftMessage = (slice: string): string =>
  `Development system: your last message describes work beyond the active slice "${slice}". Either return to the slice, or call devsys_record_departure (gate scope.expansion) to record why the scope is growing.`;

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
    const summary = redactSecrets(summarizeOutput(text));
    const item: ToolEvidence =
      event.toolName === "bash"
        ? { tool: "bash", summary, exitCode: event.isError ? 1 : 0 }
        : { tool: event.toolName, summary };
    evidence = [...evidence, item].slice(-MAX_EVIDENCE);
  });

  deps.pi.on("turn_end", async (event, ctx) => {
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
      ...(judged.value.driftFromSlice >= VERIFIER_THRESHOLD && state.activeSlice !== undefined
        ? [note(driftMessage(state.activeSlice))]
        : []),
    ];
    if (entries.length === 0) return undefined;
    corrected += 1;
    justCorrected = true;
    return { continue: true, entries };
  });
}
