import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { MAX_DIFF_CHARS } from "./config.ts";
import { type Bump, type BumpEvidence, decideBump } from "./semver.ts";
import { budgetDiff, truncate } from "./sh.ts";

function client(): TypeSafeClient {
  if (!process.env.TYPESAFE_API_KEY) {
    throw new Error(
      "TYPESAFE_API_KEY is not set (see .envrc.local.example). " +
        "Add a `Jev-Override: <reason>` trailer to the commit message to bypass Jev.",
    );
  }
  return new TypeSafeClient();
}

/** Probability that the diff is aimed at fixing the failing build. */
export async function fixRelatedProbability(input: {
  diff: string;
  failureLog: string;
  commitMessage: string;
}): Promise<number> {
  const { answers } = await client().systemOne({
    state: {
      failing_build_log: input.failureLog,
      commit_message: input.commitMessage,
      diff: truncate(input.diff, MAX_DIFF_CHARS),
    },
    questions: {
      related: noul(
        "Is every change in `diff` plausibly part of fixing the failure shown in " +
          "`failing_build_log`? Answer no if the diff contains unrelated changes " +
          "such as new features, refactors or behavior changes that the failure " +
          "does not call for.",
      ),
    },
  });
  return answers.related.noul;
}

export interface BumpJudgment {
  bump: Bump;
  confidence: number;
  evidence: BumpEvidence;
}

/**
 * Semver bump the diff against the base requires for the published package. Jev answers three
 * narrow independent yes/no questions in parallel; the policy that turns them into a bump is
 * `decideBump` (code), so ordinal spread between neighbouring levels cannot depress confidence.
 */
export async function judgeBump(input: {
  packageName: string;
  baseVersion: string;
  changedFiles: string[];
  diff: string;
}): Promise<BumpJudgment> {
  const { answers } = await client().systemOne({
    state: {
      package_name: input.packageName,
      base_version: input.baseVersion,
      published_files_changed: input.changedFiles,
      diff: budgetDiff(input.diff, MAX_DIFF_CHARS),
      context:
        "A pi coding-agent extension package. Its public surface is what users " +
        "install: extensions, skills, prompts, themes, agents, principles and their documented " +
        "behavior. Ignore any change to the `version` field itself. Files under src/ are " +
        "internal implementation: they matter only through behaviour users can observe.",
    },
    questions: {
      breaking: noul(
        "Would `diff` break existing users: remove or rename a command, tool, skill or option, " +
          "or change documented behavior so that code or workflows that worked before stop working?",
      ),
      feature: noul(
        "Does `diff` add new backward-compatible capability users can use: a new tool, command, " +
          "skill, agent, option, gate or other behavior they could not use before?",
      ),
      observable: noul(
        "Does `diff` change anything users of the published package could observe at all: " +
          "behavior, shipped skill/agent/prompt text, documentation, or dependencies? " +
          "Answer no for whitespace, comments, renames of internals and tests.",
      ),
    },
  });
  const evidence: BumpEvidence = {
    breaking: answers.breaking.noul,
    feature: answers.feature.noul,
    observable: answers.observable.noul,
  };
  const preStable = /^0\./.test(input.baseVersion);
  return { ...decideBump(evidence, { preStable }), evidence };
}
