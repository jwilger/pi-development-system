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
const SKILL_END = "</skill>";
const GAP = "\n…\n";

/**
 * Pi expands `/skill:name args` into `<skill …>body</skill>\n\nargs`; the body is the skill's own
 * instructions, not the request. Judge the text after it, and when a prompt is still long keep both
 * ends so a request that comes last is not clipped away.
 */
export function requestText(prompt: string): string {
  const trimmed = prompt.trimStart();
  const end = trimmed.startsWith("<skill ") ? trimmed.indexOf(SKILL_END) : -1;
  const text = (end === -1 ? trimmed : trimmed.slice(end + SKILL_END.length)).trim();
  if (text.length <= PROMPT_MAX) return text;
  const half = Math.floor((PROMPT_MAX - GAP.length) / 2);
  return `${text.slice(0, half)}${GAP}${text.slice(-half)}`;
}
const isIntent = (value: string): value is Intent => INTENTS.some((i) => i === value);

export async function judgeIntent(
  jev: Jev,
  input: { prompt: string; phase: string },
): Promise<Result<{ intent: Intent; confidence: number }, JevError>> {
  const prompt = requestText(redactSecrets(input.prompt));
  const asked = await jev.ask({ prompt, phase: input.phase }, { intent: INTENT_QUESTION });
  if (!asked.ok) return asked;
  const answer = asked.value.intent;
  if (answer?.type !== "choice" || !isIntent(answer.choice)) {
    return err({ kind: "provider", message: "missing or unknown intent answer" });
  }
  return ok({ intent: answer.choice, confidence: answer.confidence });
}
