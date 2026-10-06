import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { MAX_DIFF_CHARS } from "./config.ts";
import type { Bump } from "./semver.ts";
import { truncate } from "./sh.ts";

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
  probabilities: Record<Bump, number>;
}

/** Semver bump the diff against the base requires for the published package. */
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
      diff: truncate(input.diff, MAX_DIFF_CHARS),
      context:
        "A pi coding-agent extension package. Its public surface is what users " +
        "install: extensions, skills, prompts, themes and their documented behavior.",
    },
    questions: {
      bump: choice(
        "What is the smallest semantic-versioning bump that correctly describes " +
          "`diff` for users of the published package? Ignore any change to the " +
          "`version` field itself.",
        {
          none: "No effect on the published package's behavior or contents that users could observe (internal tooling, whitespace, comments, tests).",
          patch: "Backward-compatible bug fixes or documentation corrections.",
          minor:
            "Backward-compatible new functionality (new extension, skill, prompt, theme, command or option).",
          major:
            "Backward-incompatible changes that can break existing users (removed or renamed commands, changed behavior, dropped support).",
        },
      ),
    },
  });
  const a = answers.bump;
  return {
    bump: a.choice,
    confidence: a.confidence,
    probabilities: a.probabilities,
  };
}
