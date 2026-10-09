import { resolve } from "node:path";
import { findForbiddenTrailerKeys, findForbiddenTrailers } from "../core/commit-message.ts";
import type { Exec } from "../core/exec.ts";
import { messageProblem } from "../core/message-problem.ts";
import type { PushTarget } from "../core/push-command.ts";
import type { ExcusedMessages } from "./excused-messages.ts";

type UnpushedCommit = { readonly merge: boolean; readonly message: string };

/** What is wrong with the messages of the commits a push would publish. */
export type PushMessageFindings = {
  /** AI-attribution trailers (non-negotiable 8): never a departure. */
  readonly forbidden: readonly string[];
  /** Why the first non-merge commit needs a `commit.rationale` departure, if one does. */
  readonly unexplained: string | undefined;
};

/** git prints these bytes for `%x1f` / `%x00`; the bytes themselves cannot be passed as an argument. */
const FIELD = "\u001f";
const RECORD = "\u0000";

/** `git log <ref> --not --remotes`: what that ref has that no remote-tracking branch has (upstream commits pulled into a fork are not this push's to judge). */
async function unpushedCommits(
  exec: Exec,
  cwd: string,
  ref: string,
): Promise<UnpushedCommit[] | undefined> {
  const log = await exec("git", ["log", ref, "--not", "--remotes", "--format=%P%x1f%B%x00", "--"], {
    cwd,
    timeout: 15_000,
  });
  if (log.code !== 0) return undefined; // a ref git cannot resolve: the push itself will fail
  return log.stdout
    .split(RECORD)
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [parents = "", ...message] = record.replace(/^\n/, "").split(FIELD);
      return { merge: parents.trim().split(/\s+/).length > 1, message: message.join(FIELD) };
    });
}

/** No remote-tracking branch at all (a first push): every commit looks unpushed, so only AI trailers are judged, never the rationale. */
async function knowsRemotes(exec: Exec, cwd: string): Promise<boolean> {
  const refs = await exec("git", ["for-each-ref", "--count=1", "refs/remotes"], {
    cwd,
    timeout: 5000,
  });
  return refs.code === 0 && refs.stdout.trim() !== "";
}

/** The refs a push sends: the named branches, HEAD for a bare push, every branch for `--all`. */
const refsOf = (t: PushTarget): string[] => {
  if (t.allBranches) return ["--branches"];
  if (t.tagsOnly) return ["--tags"];
  const named = t.sources.length === 0 ? ["HEAD"] : [...t.sources];
  return t.withTags === true ? [...named, "--tags"] : named;
};

/**
 * The messages of the commits the push would publish (what each target's refs have that its remote
 * lacks), however each was made: `-C`, `--fixup`, `commit-tree`, `merge -m`, an alias. Read-only.
 * Undefined when git cannot say (unknown ref). With no remote-tracking branch yet, only trailers are judged.
 */
export async function pushMessageFindings(
  exec: Exec,
  cwd: string,
  targets: readonly PushTarget[],
  excused: ExcusedMessages | undefined,
): Promise<PushMessageFindings | undefined> {
  const commits: UnpushedCommit[] = [];
  const unjudgedForRationale = new Set<UnpushedCommit>();
  let judged = false;
  for (const t of targets.filter((x) => !x.deleteOnly)) {
    const where = t.dir === undefined ? cwd : resolve(cwd, t.dir);
    const firstPush = !(await knowsRemotes(exec, where));
    for (const ref of refsOf(t)) {
      const found = await unpushedCommits(exec, where, ref);
      if (found === undefined) continue;
      judged = true;
      commits.push(...found);
      if (firstPush) for (const c of found) unjudgedForRationale.add(c);
    }
  }
  if (!judged) return undefined;
  const forbidden = commits.flatMap((c) => [
    ...findForbiddenTrailers(c.message),
    ...findForbiddenTrailerKeys(c.message),
  ]);
  const unexplained = commits
    .filter((c) => !(c.merge || unjudgedForRationale.has(c)) && excused?.has(c.message) !== true)
    .map((c) => messageProblem(c.message))
    .find((problem) => problem !== undefined);
  return { forbidden: [...new Set(forbidden)], unexplained };
}
