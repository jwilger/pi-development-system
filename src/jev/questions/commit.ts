import type { ClassifierBoolQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { Jev, JevError } from "../client.ts";

/** At or above this, the commit is treated as mixing structural and behavioural change. */
export const MIX_THRESHOLD = 0.7;
/** Below this a message that has a body is still treated as not carrying its rationale. */
export const RATIONALE_FLOOR = 0.3;

export type CommitInput = { message: string; diffStat: string; diff: string };
export type CommitJudgement = { rationale: number; mixesStructuralAndBehavioural: number };

const DIFF_CLIP = 8000;

export const RATIONALE_QUESTION: ClassifierBoolQuestion = {
  type: "bool",
  instructions:
    "Read the commit `message` in light of the change in `diffStat` and `diff`. Does the message explain WHY the change was made (the problem, constraint, decision or trade-off), rather than only restating WHAT changed?",
  criteria: {
    true: "The body gives a reason: the problem solved, the constraint, the alternative rejected or the trade-off accepted",
    false:
      "The message only names or lists what changed (file names, 'update X', 'fix bug', bullet list of edits) with no reason",
  },
};

export const MIX_QUESTION: ClassifierBoolQuestion = {
  type: "bool",
  instructions:
    "Does the change in `diffStat` and `diff` combine a structural change (rename, move, extract, reformat, dependency or config tidying that does not alter behaviour) with a behavioural change (new or altered logic, fixed bug, new feature) in the same commit?",
  criteria: {
    true: "Both a behaviour-preserving restructuring AND a behaviour change are present in the diff",
    false:
      "The diff is only structural, or only behavioural (including a behavioural change with its own tests and a minimal necessary signature tweak)",
  },
};

const clip = (text: string, max: number): string => redactSecrets(text).slice(0, max);

export async function judgeCommit(
  jev: Jev,
  input: CommitInput,
): Promise<Result<CommitJudgement, JevError>> {
  const asked = await jev.ask(
    {
      message: clip(input.message, 4000),
      diffStat: clip(input.diffStat, 2000),
      diff: clip(input.diff, DIFF_CLIP),
    },
    { rationale: RATIONALE_QUESTION, mix: MIX_QUESTION },
  );
  if (!asked.ok) return asked;
  const rationale = asked.value.rationale;
  const mix = asked.value.mix;
  if (rationale?.type !== "bool" || mix?.type !== "bool") {
    return err({ kind: "provider", message: "missing commit answers" });
  }
  return ok({
    rationale: rationale.probability,
    mixesStructuralAndBehavioural: mix.probability,
  });
}
