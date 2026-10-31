import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { redactSecrets } from "../core/redact.ts";
import type { DevsysState } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { type Intent, judgeIntent, requestText } from "../jev/questions/intent.ts";

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
    return "Possible new work: inspect the active goal (using its tool when available), active slice and recent evidence first. Acceptance-criteria repairs continue existing work. Call devsys_intake only for genuinely new work, not merely because phase is idle or a classifier suggested it.";
  }
  if (intent === "review") {
    return "This prompt asks for a review: call devsys_review_start for a fresh-context review instead of reviewing in this conversation.";
  }
  return undefined;
}

/** Bounded public, model-visible context; never read another extension's private entries or files. */
function recentIntentEvidence(sessionManager?: ExtensionContext["sessionManager"]): string {
  const messages = sessionManager?.buildSessionProjection?.().messages ?? [];
  const text = messages
    .slice(-24)
    .map((message) => {
      if ("summary" in message) return message.summary;
      if (!("content" in message)) return "";
      const content = message.content;
      return typeof content === "string"
        ? content
        : content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n");
    })
    .join("\n");
  return redactSecrets(text).slice(-12000);
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
  sessionManager?: ExtensionContext["sessionManager"],
): Promise<string | undefined> {
  if (state.phase !== "idle" || requestText(prompt) === "") {
    return undefined;
  }
  const judged = await judgeIntent(jev, {
    prompt,
    phase: state.phase,
    activeSlice: state.activeSlice ?? "",
    recentEvidence: recentIntentEvidence(sessionManager),
  });
  if (!judged.ok) return undefined;
  return intentGuideline(judged.value.intent, judged.value.confidence, state.phase);
}
