import type { ClassifierBoolQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { Jev, JevError } from "../client.ts";

/** At or above this, the brief is reported as carrying solution-level detail (a warning only). */
export const SOLUTION_DETAIL_THRESHOLD = 0.7;

export type SolutionDetailInput = { brief: string };

const BRIEF_CLIP = 8000;

export const SOLUTION_DETAIL_QUESTION: ClassifierBoolQuestion = {
  type: "bool",
  instructions:
    "Read `brief`, a product brief. Does it specify the solution rather than the problem: named database tables or columns, API endpoints, class or module names, framework or library choices, or step-by-step implementation design?",
  criteria: {
    true: "The brief prescribes how the system is built (tables, endpoints, classes, libraries, internal design) instead of, or in addition to, the outcome, users and risks",
    false:
      "The brief describes outcomes, users, journeys, constraints and risks in product terms; any technical mention is a stated constraint or a name the users themselves use",
  },
};

// Bound the text before redacting (redaction cost grows with run length); keep margin so a secret at the cut is still seen whole.
const clip = (text: string, max: number): string =>
  redactSecrets(text.slice(0, max * 2)).slice(0, max);

/** The probability that the brief contains solution-level detail. */
export async function judgeSolutionDetail(
  jev: Jev,
  input: SolutionDetailInput,
): Promise<Result<number, JevError>> {
  const asked = await jev.ask(
    { brief: clip(input.brief, BRIEF_CLIP) },
    { solution: SOLUTION_DETAIL_QUESTION },
  );
  if (!asked.ok) return asked;
  const answer = asked.value.solution;
  if (answer?.type !== "bool") {
    return err({ kind: "provider", message: "missing solution-detail answer" });
  }
  return ok(answer.probability);
}
