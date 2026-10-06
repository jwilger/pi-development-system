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
};

/** Observes the trunk's newest run until it settles (not pending) or the poll budget is spent. */
export async function watchCi(options: WatchOptions): Promise<CiState> {
  let last: CiState = { status: "unknown" };
  for (let poll = 0; poll < options.maxPolls; poll++) {
    const trunk = await getTrunkStatus(options.exec, {
      branch: options.branch,
      cwd: options.cwd,
    });
    last =
      trunk.headSha === undefined
        ? { status: trunk.status }
        : { status: trunk.status, sha: trunk.headSha };
    options.onObserved(last);
    if (last.status !== "pending") return last;
    await options.sleep(options.intervalMs);
  }
  return last;
}
