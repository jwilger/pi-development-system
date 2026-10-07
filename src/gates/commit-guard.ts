import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { type CommitExtraction, extractCommits } from "../core/commit-command.ts";
import {
  findForbiddenTrailerKeys,
  findForbiddenTrailers,
  hasRationaleBody,
  parseConventionalCommit,
} from "../core/commit-message.ts";
import type { Exec } from "../core/exec.ts";
import { resolveGit } from "../core/git-invocations.ts";
import { DECISION_LOG, reviewGap } from "../core/review-flow.ts";
import { type GateId, isParseError, parseGateId } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeCommit, MIX_THRESHOLD, RATIONALE_FLOOR } from "../jev/questions/commit.ts";
import { snapshotDiff } from "../review/digest.ts";
import type { SessionState } from "../state/session-state.ts";
import { departureUse } from "./departure-use.ts";

export type CommitGuardDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  jev: (ctx: ExtensionContext) => Jev;
  exec: Exec;
};

type Need = { gate: GateId; why: string };

const gateId = (id: string): GateId => {
  const parsed = parseGateId(id);
  if (isParseError(parsed)) throw new Error(parsed.message);
  return parsed;
};

const RATIONALE = gateId("commit.rationale");
const MIXED = gateId("commit.mixed-change");
const REVIEW = gateId("review.unsatisfied");

const readMessageFile = (cwd: string, path: string): string | undefined => {
  try {
    const file = resolve(cwd, path);
    if (!statSync(file).isFile()) return undefined; // never read a FIFO or device (it can block)
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};

const messageOf = (extracted: CommitExtraction, cwd: string): string | undefined => {
  if (extracted.kind === "message") return extracted.message;
  return extracted.kind === "file" ? readMessageFile(cwd, extracted.path) : undefined;
};

/** Deterministic checks: Conventional subject and a prose rationale body. */
function messageNeeds(message: string): Need[] {
  const parsed = parseConventionalCommit(message);
  if (!parsed.ok) return [{ gate: RATIONALE, why: parsed.error.message }];
  return hasRationaleBody(message)
    ? []
    : [{ gate: RATIONALE, why: "the message has no body explaining why the change was made" }];
}

/** `-a`/`--all`, or a `git add` in the same command, widen the commit beyond what is staged. */
const stagesEverything = (command: string): boolean =>
  /\bgit\s+add\b/.test(command) ||
  /\bgit\b[^;&|\n]*\bcommit\b[^;&|\n]*\s(?:-[a-zA-Z]*a[a-zA-Z]*|--all|--include)(?=\s|$|[;&|])/.test(
    command,
  );

/** What is about to be committed: the staged changes, or every tracked change when the commit stages them itself. */
async function pendingDiff(
  exec: Exec,
  cwd: string,
  command: string,
): Promise<{ stat: string; diff: string } | undefined> {
  try {
    const base = stagesEverything(command) ? ["diff", "HEAD"] : ["diff", "--cached"];
    const [stat, diff] = await Promise.all([
      exec("git", [...base, "--stat"], { cwd, timeout: 10_000 }),
      exec("git", base, { cwd, timeout: 10_000 }),
    ]);
    if (stat.code !== 0 || diff.code !== 0 || diff.stdout.trim() === "") return undefined;
    return { stat: stat.stdout, diff: diff.stdout };
  } catch {
    return undefined;
  }
}

async function jevNeeds(
  deps: CommitGuardDeps,
  ctx: ExtensionContext,
  message: string,
  bodyPresent: boolean,
  command: string,
): Promise<Need[]> {
  const pending = await pendingDiff(deps.exec, ctx.cwd, command);
  if (pending === undefined) return [];
  const judged = await judgeCommit(deps.jev(ctx), {
    message,
    diffStat: pending.stat,
    diff: pending.diff,
  });
  if (!judged.ok) return [];
  const needs: Need[] = [];
  if (bodyPresent && judged.value.rationale < RATIONALE_FLOOR) {
    needs.push({ gate: RATIONALE, why: "Jev reads the body as restating what changed, not why" });
  }
  if (judged.value.mixesStructuralAndBehavioural >= MIX_THRESHOLD) {
    needs.push({
      gate: MIXED,
      why: "Jev reads this diff as mixing a structural change with a behavioural one",
    });
  }
  return needs;
}

/** While work is in flight, committing needs the slice review satisfied on the diff as it is now. */
async function reviewNeeds(
  deps: CommitGuardDeps,
  ctx: ExtensionContext,
  command: string,
): Promise<Need[]> {
  const { phase, activeSlice } = deps.state.get();
  if ((phase !== "implementing" && phase !== "reviewing") || activeSlice === undefined) return [];
  const snap = await snapshotDiff(deps.exec, ctx.cwd, "HEAD");
  // An unreadable diff cannot be compared; the gate asks for a departure rather than guessing.
  const gap = reviewGap(
    deps.state.get(),
    activeSlice,
    snap.ok ? { digest: snap.value.digest, files: snap.value.files } : { digest: "unknown" },
  );
  if (gap !== undefined) return [{ gate: REVIEW, why: gap }];
  // The review saw the work tree; a plain `git commit` records the index. A file staged and then edited
  // again would commit the older, unreviewed content.
  const names = await changedNames(deps.exec, ctx.cwd);
  if (names === undefined) {
    return [
      {
        gate: REVIEW,
        why: "cannot read which files are staged or edited, so the staged content cannot be compared with the reviewed work tree",
      },
    ];
  }
  const stale = stagedThenEdited(names, command, ctx.cwd);
  return stale.length === 0
    ? []
    : [
        {
          gate: REVIEW,
          why: `the staged content of ${stale.join(", ")} differs from the work tree that was reviewed (edited after \`git add\`, or only partly staged); stage it again, or depart if committing in parts is deliberate`,
        },
      ];
}

type Invocations = ReturnType<typeof resolveGit>["invocations"];

/** Files staged and also changed since staging; empty when the commit stages everything itself. */
const stagedThenEdited = (
  names: { staged: readonly string[]; unstaged: readonly string[] },
  command: string,
  cwd: string,
): string[] => {
  // Only what runs before or at the first commit can change what that commit records.
  const all = resolveGit(command).invocations;
  const firstCommit = all.findIndex((i) => i.sub === "commit");
  const upto = firstCommit === -1 ? all : all.slice(0, firstCommit + 1);
  if (stagesAllTracked(upto, cwd)) return [];
  // A path (or a directory holding it) that is an argument of the commit or add itself is committed or
  // re-staged from the work tree, which was reviewed. Message text is one argument and never equals a path.
  const named = upto
    .filter((i) => (i.sub === "commit" || i.sub === "add") && !isDryRun(i) && inThisDir(i, cwd))
    .flatMap((i) => i.args.flatMap((a) => (a.startsWith("-") ? [] : [cleanPath(a)])));
  const covered = (name: string) => named.some((n) => name === n || name.startsWith(`${n}/`));
  return names.staged.filter(
    (name) => names.unstaged.includes(name) && !covered(name) && !DECISION_LOG.test(name),
  );
};

const cleanPath = (arg: string): string => arg.replace(/^(\.\/)+/, "").replace(/\/+$/, "");
const isDryRun = (i: Invocations[number]): boolean =>
  i.sub === "add" && i.args.some((a) => a === "-n" || a === "--dry-run");
/** The invocation runs in the session's directory (no `cd`/`-C`, or one that leads back to it). */
const inThisDir = (i: Invocations[number], cwd: string): boolean =>
  i.dir === undefined || resolve(cwd, i.dir) === resolve(cwd);

const STAGE_ALL = new Set(["-A", "--all", "-u", "--update", "."]);
const BOOLEAN_SHORT = /[enqsvz]/;

/** `-a` inside a short-flag cluster such as `-sa`; a value-taking letter ends the cluster (`-mtab`, `-uall`). */
function clusterHasA(arg: string): boolean {
  if (!/^-[a-zA-Z]+$/.test(arg)) return false;
  for (const ch of arg.slice(1)) {
    if (ch === "a") return true;
    if (!BOOLEAN_SHORT.test(ch)) return false;
  }
  return false;
}

/**
 * The command re-stages every tracked change of this repository before it commits: `commit -a`, or
 * `git add -A|-u|.` with no pathspec, in this directory. Read from parsed invocations, not message text.
 */
function stagesAllTracked(invocations: Invocations, cwd: string): boolean {
  return invocations.some((i) => {
    if (!inThisDir(i, cwd) || isDryRun(i)) return false;
    if (i.sub === "commit") return i.args.some((a) => a === "--all" || clusterHasA(a));
    if (i.sub !== "add") return false;
    const paths = i.args.filter((a) => !a.startsWith("-"));
    return i.args.some((a) => STAGE_ALL.has(a)) && paths.every((a) => a === ".");
  });
}

async function changedNames(
  exec: Exec,
  cwd: string,
): Promise<{ staged: string[]; unstaged: string[] } | undefined> {
  try {
    const base = [
      "-c",
      "core.quotePath=false",
      "diff",
      "--no-ext-diff",
      "--name-only",
      "-z",
      "--ignore-submodules=dirty",
    ];
    const [staged, unstaged] = await Promise.all([
      exec("git", [...base, "--cached"], { cwd, timeout: 10_000 }),
      exec("git", base, { cwd, timeout: 10_000 }),
    ]);
    if (staged.code !== 0 || unstaged.code !== 0) return undefined;
    const split = (text: string) => text.split("\0").filter((n) => n !== "");
    return { staged: split(staged.stdout), unstaged: split(unstaged.stdout) };
  } catch {
    return undefined;
  }
}

const reviewReason = (need: Need): string =>
  `${need.gate}: ${need.why}. Each slice is reviewed by a fresh-context reviewer before it is committed. ` +
  "Run devsys_review_start, spawn the reviewer it describes, record the packet with devsys_review_record " +
  "and repeat until the review is satisfied. If skipping review is deliberate call devsys_record_departure " +
  `with gate "${need.gate}", what you are doing instead, why, and the cost if wrong; then retry.`;

const blockReason = (need: Need): string =>
  need.gate === REVIEW
    ? reviewReason(need)
    : `${need.gate}: ${need.why}. Commit messages carry their rationale and structural and behavioural ` +
      "changes go in separate commits. Fix the commit (split it, or write the why in the body), or if " +
      `departing is deliberate call devsys_record_departure with gate "${need.gate}", what you are doing ` +
      "instead, why, and the cost if wrong; then retry.";

const forbiddenReason = (found: readonly string[]): string =>
  `commit.forbidden-trailer: this commit carries an AI attribution (${found.join("; ")}). ` +
  "Commits in this repository have no Co-Authored-By or generated-by trailers and this is not " +
  "something to depart from. Remove the trailer and commit again.";

/** AI trailers in any message, --trailer value, or the command text itself (heredocs, printf, echo). */
function forbiddenIn(
  command: string,
  extractions: readonly CommitExtraction[],
  messages: readonly (string | undefined)[],
): string[] {
  const trailers = extractions.flatMap((e) => (e.kind === "unknown" ? e.trailers : []));
  const text = [...messages, ...trailers].join("\n");
  return [...findForbiddenTrailers(text), ...findForbiddenTrailerKeys(command)];
}

async function needsOf(
  deps: CommitGuardDeps,
  ctx: ExtensionContext,
  message: string,
  command: string,
): Promise<Need[]> {
  const needs = messageNeeds(message);
  const bodyPresent = !needs.some((n) => n.why.startsWith("the message has no body"));
  const viaJev = await jevNeeds(deps, ctx, message, bodyPresent, command);
  return [...needs, ...viaJev.filter((n) => !needs.some((m) => m.gate === n.gate))];
}

/** Soft gates on `git commit`: rationale, Conventional shape, structural/behavioural separation; AI trailers are refused. */
export function registerCommitGuard(deps: CommitGuardDeps): void {
  deps.pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return undefined;
    const command = event.input.command;
    const extractions = extractCommits(command);
    if (extractions.length === 0) return undefined;
    const messages = extractions.map((e) => messageOf(e, ctx.cwd));

    const forbidden = forbiddenIn(command, extractions, messages);
    if (forbidden.length > 0) return { block: true, reason: forbiddenReason(forbidden) };

    const known = messages.flatMap((m) => (m === undefined ? [] : [m]));
    const all: Need[] = await reviewNeeds(deps, ctx, command);
    // A -F file that cannot be read now (written by this same command, or stdin) cannot be checked.
    if (extractions.some((e, i) => e.kind === "file" && messages[i] === undefined)) {
      all.push({
        gate: RATIONALE,
        why: "the message file cannot be read before the commit runs, so its rationale cannot be checked; use -m or a heredoc",
      });
    }
    if (extractions.some((e) => e.kind === "unknown" && e.opaqueMessage)) {
      all.push({
        gate: RATIONALE,
        why: "the message is built by a substitution or variable and cannot be checked; use a literal -m or a heredoc",
      });
    }
    for (const message of known) {
      for (const need of await needsOf(deps, ctx, message, command)) {
        if (!all.some((n) => n.gate === need.gate)) all.push(need);
      }
    }
    const uses = all.map((need) => ({ need, use: departureUse(deps.state, need.gate) }));
    const uncovered = uses.find(({ use }) => !use.hasOpen());
    if (uncovered !== undefined) return { block: true, reason: blockReason(uncovered.need) };
    for (const { use } of uses) use.consume();
    return undefined;
  });
}
