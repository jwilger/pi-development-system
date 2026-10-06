import type { CommitInfo } from "./gate.ts";
import { git } from "./sh.ts";

/** Commits in `from..to`, oldest first. */
export function commitsBetween(from: string, to: string, isNew: boolean): CommitInfo[] {
  const shas = git("rev-list", "--reverse", `${from}..${to}`).split("\n").filter(Boolean);
  return shas.map((sha) => ({ sha, message: git("log", "-1", "--format=%B", sha), isNew }));
}

export const ZERO_SHA = /^0+$/;
