import { isBuildFix, revertedShas, subjectOf } from "./commit.ts";

export type RunState = "success" | "failure" | "pending" | "none";

export interface ChainEntry {
  sha: string;
  state: RunState;
  runId?: number;
}

export type BuildState =
  | { kind: "green" }
  | { kind: "pending"; sha: string }
  /** `breakSha` is the oldest failing commit since the last green build. */
  | { kind: "broken"; breakSha: string; failure: ChainEntry };

/**
 * Classify the build from first-parent history, newest first, ending at the
 * first green commit (or the end of the walk).
 */
export function classifyChain(chain: ChainEntry[]): BuildState {
  const failures = chain.filter((c) => c.state === "failure");
  const oldest = failures.at(-1);
  const newest = failures[0];
  if (oldest && newest) {
    return { kind: "broken", breakSha: oldest.sha, failure: newest };
  }
  const pending = chain.find((c) => c.state === "pending");
  if (pending) return { kind: "pending", sha: pending.sha };
  return { kind: "green" };
}

export interface CommitInfo {
  /** null for a commit that does not exist yet (commit-msg hook). */
  sha: string | null;
  message: string;
  /** Commits being introduced now, as opposed to already on main. */
  isNew: boolean;
}

export interface BrokenVerdict {
  violations: string[];
  /** New commits that are build fixes and need Jev's relevance check. */
  needsRelevance: CommitInfo[];
}

/**
 * While the build is broken, every commit since the break must be a `fix(ci):`
 * (or revert) commit, unless a later commit reverted it. `commits` is oldest
 * first and excludes the breaking commit itself.
 */
export function evaluateBrokenRange(commits: CommitInfo[]): BrokenVerdict {
  const violations: string[] = [];
  const needsRelevance: CommitInfo[] = [];

  const reverted = (idx: number): boolean => {
    const sha = commits[idx]?.sha;
    if (!sha) return false;
    return commits
      .slice(idx + 1)
      .some((later) => revertedShas(later.message).some((r) => sha.toLowerCase().startsWith(r)));
  };

  commits.forEach((c, i) => {
    if (reverted(i)) return;
    const label = `${c.sha?.slice(0, 8) ?? "new commit"} "${subjectOf(c.message)}"`;
    if (!isBuildFix(c.message)) {
      violations.push(
        `${label} is not a fix(ci): commit and has not been reverted while the build is broken`,
      );
    } else if (c.isNew) {
      needsRelevance.push(c);
    }
  });
  return { violations, needsRelevance };
}
