import type { DevsysState } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { type Intent, judgeIntent } from "../jev/questions/intent.ts";

/** Probability at or above which an intent is acted on. */
export const INTENT_AT = 0.7;

/**
 * Pure: the one line an intent earns, or undefined. Only an idle session is nudged: inside a running
 * slice a request cannot be told apart from an instruction for that slice, and a wrong nudge would
 * restart intake. Questions and continuations never earn a line.
 */
export function intentGuideline(
  intent: Intent,
  confidence: number,
  phase: DevsysState["phase"],
): string | undefined {
  if (confidence < INTENT_AT || phase !== "idle") return undefined;
  if (intent === "new-work" || intent === "fix") {
    return "This prompt asks for new work: call devsys_intake with the request before editing anything, so it is sized and the planning artifacts it needs are named.";
  }
  if (intent === "review") {
    return "This prompt asks for a review: call devsys_review_start for a fresh-context review instead of reviewing in this conversation.";
  }
  return undefined;
}

/**
 * Adapter: judge the prompt and return the line for this run's context tail (not the system prompt,
 * whose bytes every cached request shares). Idle sessions only, so a busy session pays no Jev call;
 * an offline or failing Jev adds nothing instead of delaying the run.
 */
export async function intentLineFor(
  prompt: string,
  state: DevsysState,
  jev: Jev,
): Promise<string | undefined> {
  if (state.phase !== "idle" || prompt.trim() === "" || jev.availability() === "offline") {
    return undefined;
  }
  const judged = await judgeIntent(jev, { prompt, phase: state.phase });
  if (!judged.ok) return undefined;
  return intentGuideline(judged.value.intent, judged.value.confidence, state.phase);
}
