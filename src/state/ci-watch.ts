import type { Exec } from "../core/exec.ts";
import type { CiState } from "../core/types.ts";
import { getTrunkStatus } from "./ci.ts";

export type WatchOptions = {
  exec: Exec;
  branch: string;
  cwd: string;
  /** Called with every observation, including the first. */
  onObserved: (observed: CiState) => void;
  sleep: (ms: number) => Promise<void>;
  intervalMs: number;
  maxPolls: number;
  /** The commit whose run is being waited for; runs of other commits count as still pending. */
  expectSha?: string | undefined;
};

/** Observes the trunk's newest run (for `expectSha`, when given) until it settles (not pending) or the poll budget is spent. */
export async function watchCi(options: WatchOptions): Promise<CiState> {
  let last: CiState = { status: "unknown" };
  for (let poll = 0; poll < options.maxPolls; poll++) {
    const trunk = await getTrunkStatus(options.exec, {
      branch: options.branch,
      cwd: options.cwd,
    });
    // `gh` missing or no runs at all (no sha) is unknown, not a run that has yet to appear.
    const stale =
      options.expectSha !== undefined &&
      trunk.headSha !== undefined &&
      trunk.headSha !== options.expectSha;
    const status = stale ? "pending" : trunk.status;
    last = trunk.headSha === undefined ? { status } : { status, sha: trunk.headSha };
    options.onObserved(last);
    if (last.status !== "pending") return last;
    await options.sleep(options.intervalMs);
  }
  return last;
}
