import type { ClassifierBoolQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { Jev, JevError } from "../client.ts";

/** At or above this, a diff with no ADR in it is flagged (gate `adr.missing`). */
export const ARCHITECTURE_THRESHOLD = 0.7;

export type ArchitectureInput = { diffStat: string; diff: string };

const DIFF_CLIP = 8000;

export const ARCHITECTURE_QUESTION: ClassifierBoolQuestion = {
  type: "bool",
  instructions:
    "Read `diffStat` and `diff`. Does this change make an architecture-shaping decision that is hard to reverse: a new module boundary or layer, a new runtime dependency, a persisted data format or schema, a public protocol or interface contract, or a change to how components communicate?",
  criteria: {
    true: "The diff introduces or changes a boundary, dependency, data format or protocol that later code will build on and that would be costly to undo",
    false:
      "The diff is a bug fix, local refactor, test, documentation, formatting or feature work inside existing boundaries that is easy to change later",
  },
};

// Bound the text before redacting (redaction cost grows with run length); keep margin so a secret at the cut is still seen whole.
const clip = (text: string, max: number): string =>
  redactSecrets(text.slice(0, max * 2)).slice(0, max);

/** The probability that the diff shapes the architecture. */
export async function judgeArchitectureShaping(
  jev: Jev,
  input: ArchitectureInput,
): Promise<Result<number, JevError>> {
  const asked = await jev.ask(
    { diffStat: clip(input.diffStat, 2000), diff: clip(input.diff, DIFF_CLIP) },
    { architecture: ARCHITECTURE_QUESTION },
  );
  if (!asked.ok) return asked;
  const answer = asked.value.architecture;
  if (answer?.type !== "bool") {
    return err({ kind: "provider", message: "missing architecture answer" });
  }
  return ok(answer.probability);
}
