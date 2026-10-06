import type { ClassifierBoolQuestion } from "@earendil-works/pi-ai";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { Jev, JevError } from "../client.ts";

/** At or above this, the unpushed change is treated as a fix for the red build. */
export const FIX_RELATED_THRESHOLD = 0.6;

export const FIX_RELATED_QUESTION: ClassifierBoolQuestion = {
  type: "bool",
  instructions:
    "Is every change in `diff` plausibly part of fixing the failure shown in `failingLog`? Answer false if the diff contains unrelated changes such as new features, refactors or behaviour changes that the failure does not call for.",
  criteria: {
    true: "The diff only touches what is needed to repair the failing build or test",
    false:
      "The diff includes work the failure does not call for (features, refactors, unrelated fixes)",
  },
};

export async function judgeFixRelated(
  jev: Jev,
  input: { diff: string; failingLog: string; message: string },
): Promise<Result<number, JevError>> {
  const asked = await jev.ask(
    {
      failingLog: redactSecrets(input.failingLog.slice(-8000)).slice(-4000),
      message: redactSecrets(input.message.slice(0, 4000)).slice(0, 2000),
      diff: redactSecrets(input.diff.slice(0, 16000)).slice(0, 8000),
    },
    { related: FIX_RELATED_QUESTION },
  );
  if (!asked.ok) return asked;
  const answer = asked.value.related;
  return answer?.type === "bool"
    ? ok(answer.probability)
    : err({ kind: "provider", message: "missing fix-related answer" });
}
