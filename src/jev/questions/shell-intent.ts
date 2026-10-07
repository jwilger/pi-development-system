import type { ClassifierChoiceQuestion } from "@earendil-works/pi-ai";
import type { GitIntent } from "../../core/git-intent.ts";
import { redactSecrets } from "../../core/redact.ts";
import { err, ok, type Result } from "../../core/result.ts";
import type { Jev, JevError } from "../client.ts";

const SHELL_INTENT_THRESHOLD = 0.6;

export const SHELL_INTENT_QUESTION: ClassifierChoiceQuestion = {
  type: "choice",
  instructions:
    "A coding agent is about to run the shell command in `command`. Which irreversible git operation, if any, would running it perform? Consider wrappers, subshells, variables, pipes and scripts. Choose `ordinary` when it performs none of them (including commands that only mention git text).",
  criteria: {
    "force-push":
      "Pushes with --force, --force-with-lease, --mirror, or a +refspec, overwriting remote history",
    "branch-delete-remote": "Deletes a branch or tag on a remote (push --delete, push :ref)",
    "history-rewrite": "Rewrites local history: commit --amend, rebase, filter-branch, filter-repo",
    "destructive-reset":
      "Discards work irrecoverably: reset --hard, clean -fd, checkout -- . over uncommitted changes",
    "no-verify":
      "Skips commit/push hooks: --no-verify, -n on commit, core.hooksPath override, LEFTHOOK=0 / HUSKY=0",
    ordinary: "None of the above; read-only or reversible work",
  },
};

const INTENTS: readonly GitIntent[] = [
  "force-push",
  "branch-delete-remote",
  "history-rewrite",
  "destructive-reset",
  "no-verify",
  "ordinary",
];

const isIntent = (value: string): value is GitIntent => INTENTS.some((i) => i === value);

/** Pure policy: a confident Jev choice maps to its intent; low confidence or an unknown label → `unknown`. */
export function intentFromChoice(choice: string, confidence: number): GitIntent {
  if (confidence < SHELL_INTENT_THRESHOLD) return "unknown";
  return isIntent(choice) ? choice : "unknown";
}

export async function judgeShellIntent(
  jev: Jev,
  command: string,
): Promise<Result<{ intent: GitIntent; confidence: number }, JevError>> {
  const asked = await jev.ask(
    { command: redactSecrets(command) },
    { intent: SHELL_INTENT_QUESTION },
  );
  if (!asked.ok) return asked;
  const answer = asked.value.intent;
  if (answer?.type !== "choice")
    return err({ kind: "provider", message: "missing shell-intent answer" });
  return ok({
    intent: intentFromChoice(answer.choice, answer.confidence),
    confidence: answer.confidence,
  });
}
