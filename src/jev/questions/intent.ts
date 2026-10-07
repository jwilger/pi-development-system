import type { ClassifierChoiceQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { Jev, JevError } from "../client.ts";

export const INTENTS = ["new-work", "fix", "review", "question", "continuation"] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_QUESTION: ClassifierChoiceQuestion = {
  type: "choice",
  instructions:
    "What does the user's `prompt` ask the assistant to do, given the workflow `phase` the session is in? Judge the request itself, not its tone. A short reply that answers or approves what the assistant just said is a continuation.",
  criteria: {
    "new-work":
      "Asks to build, add, change, remove, rename or restructure something in the code, docs or configuration",
    fix: "Reports something broken, failing or wrong and wants it repaired",
    review: "Asks for existing work, a diff, a plan or a document to be reviewed or checked",
    question:
      "Asks for an explanation, information or an opinion and does not ask for any change to be made",
    continuation:
      "A short reply to the assistant's last message: a confirmation, a choice, 'continue', 'yes', 'go ahead', or an answer to its question",
  },
};

const PROMPT_MAX = 1500;
const isIntent = (value: string): value is Intent => INTENTS.some((i) => i === value);

export async function judgeIntent(
  jev: Jev,
  input: { prompt: string; phase: string },
): Promise<Result<{ intent: Intent; confidence: number }, JevError>> {
  const prompt = redactSecrets(input.prompt.slice(0, PROMPT_MAX * 2)).slice(0, PROMPT_MAX);
  const asked = await jev.ask({ prompt, phase: input.phase }, { intent: INTENT_QUESTION });
  if (!asked.ok) return asked;
  const answer = asked.value.intent;
  if (answer?.type !== "choice" || !isIntent(answer.choice)) {
    return err({ kind: "provider", message: "missing or unknown intent answer" });
  }
  return ok({ intent: answer.choice, confidence: answer.confidence });
}
