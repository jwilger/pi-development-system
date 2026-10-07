import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import type { DevsysState } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { type Intent, judgeIntent } from "../jev/questions/intent.ts";

/** Probability at or above which an intent is acted on. */
export const INTENT_AT = 0.7;

/** Pure: the one guideline line an intent earns in a phase, or undefined. Questions and continuations earn none. */
export function intentGuideline(
  intent: Intent,
  confidence: number,
  phase: DevsysState["phase"],
): string | undefined {
  if (confidence < INTENT_AT) return undefined;
  const idle = phase === "idle";
  if ((intent === "new-work" || intent === "fix") && (idle || intent === "new-work")) {
    return "This prompt asks for new work: call devsys_intake with the request before editing anything, so it is sized and the planning artifacts it needs are named.";
  }
  if (intent === "review" && idle) {
    return "This prompt asks for a review: call devsys_review_start for a fresh-context review instead of reviewing in this conversation.";
  }
  return undefined;
}

/** Slash commands and empty prompts are not judged. */
const judgeable = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  return trimmed !== "" && !trimmed.startsWith("/");
};

/** Adapter: judge the prompt, and add the line to this run's guidelines. Jev trouble adds nothing. */
export async function applyIntentGuideline(
  event: BeforeAgentStartEvent,
  state: DevsysState,
  jev: Jev,
): Promise<void> {
  if (!judgeable(event.prompt)) return;
  const judged = await judgeIntent(jev, { prompt: event.prompt, phase: state.phase });
  if (!judged.ok) return;
  const line = intentGuideline(judged.value.intent, judged.value.confidence, state.phase);
  if (line !== undefined) event.systemPromptOptions.promptGuidelines.push(line);
}
