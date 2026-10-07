import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import type { DevsysConfig } from "../state/config.ts";
import { createGithubTracker } from "./github.ts";
import { createRepoFilesTracker } from "./repo-files.ts";
import { type Tracker, type TrackerResult, trackerError } from "./types.ts";

/** The adapter named by `[tracker] kind`. Jira and Linear are accepted in config but not built yet. */
export function createTracker(deps: {
  tracker: DevsysConfig["tracker"];
  exec: Exec;
  cwd: string;
}): TrackerResult<Tracker> {
  const { tracker, exec, cwd } = deps;
  switch (tracker.kind) {
    case "repo-files":
      return ok(createRepoFilesTracker(cwd));
    case "github":
      return ok(
        createGithubTracker({
          exec,
          cwd,
          ...(tracker.repo === undefined ? {} : { repo: tracker.repo }),
        }),
      );
    case "jira":
    case "linear":
      return trackerError(
        `tracker kind "${tracker.kind}" is not implemented yet; use "repo-files" or "github" in .development-system.toml`,
      );
    default:
      return trackerError(`unknown tracker kind "${String(tracker.kind satisfies never)}"`);
  }
}
