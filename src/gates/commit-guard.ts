import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import {
  type CommitExtraction,
  commitDir,
  commitPaths,
  extractCommits,
} from "../core/commit-command.ts";
import { findForbiddenTrailerKeys, findForbiddenTrailers } from "../core/commit-message.ts";
import type { Exec } from "../core/exec.ts";
import { resolveGit } from "../core/git-invocations.ts";
import { messageProblem } from "../core/message-problem.ts";
import { DECISION_LOG, reviewGap } from "../core/review-flow.ts";
import { filesOfDiff, findSecrets, type PendingFile } from "../core/secrets.ts";
import { type GateId, isParseError, parseGateId } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { ARCHITECTURE_THRESHOLD, judgeArchitectureShaping } from "../jev/questions/architecture.ts";
import { judgeCommit, MIX_THRESHOLD, RATIONALE_FLOOR } from "../jev/questions/commit.ts";
import { snapshotDiff } from "../review/digest.ts";
import type { SessionState } from "../state/session-state.ts";
import { type ApprovalStore, requestHardStop } from "./approvals.ts";
import { departureUse } from "./departure-use.ts";
import type { ExcusedMessages } from "./excused-messages.ts";

export type CommitGuardDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  jev: (ctx: ExtensionContext) => Jev;
  exec: Exec;
  approvals: ApprovalStore;
  now?: (() => Date) | undefined;
  /** Messages whose missing rationale a departure excused here, so the push does not ask again. */
  excused?: ExcusedMessages | undefined;
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
const ADR_MISSING = gateId("adr.missing");

/** A new `docs/adr/NNNN-*.md` among the pending changes; editing an older ADR is not recording a new decision. */
const addsAdr = (diff: string): boolean =>
  /^diff --git a\/docs\/adr\/\d{4}-\S+\.md b\/\S+\n(?:new file mode|rename from |similarity index)/m.test(
    diff,
  );

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
  const problem = messageProblem(message);
  return problem === undefined ? [] : [{ gate: RATIONALE, why: problem }];
}

/** `-a`/`--all`, or a `git add` in the same command, widen the commit beyond what is staged. */
const stagesEverything = (command: string): boolean =>
  /\bgit\b[^;&|\n]*\bcommit\b[^;&|\n]*\s(?:-[a-zA-Z]*a[a-zA-Z]*|--all|--include)(?=\s|$|[;&|])/.test(
    command,
  );

/**
 * The pathspecs a `git add` in the command stages new files under: `.` for `-A` with no path, else the named
 * paths. Empty when nothing in the command can add an untracked file (`-u` stages only tracked files, `-n` nothing).
 */
const addedPathspecs = (command: string): string[] =>
  [...command.matchAll(/\bgit\s+add\b([^;&|\n]*)/g)].flatMap((m) => {
    const words = (m[1] ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/^(["'])(.*)\1$/, "$2")); // `git add "docs/adr/0005-x.md"` names the same file
    if (words.some((w) => ["-u", "--update", "-n", "--dry-run"].includes(w))) return [];
    const paths = words.filter((w) => !w.startsWith("-"));
    if (paths.length === 0) return words.some((w) => w === "-A" || w === "--all") ? ["."] : [];
    return paths.map((p) => p.replace(/^\.\//, "").replace(/\/$/, "") || ".");
  });

/** The option words of every `git add` in the command. */
const addWords = (command: string): string[] =>
  [...command.matchAll(/\bgit\s+add\b([^;&|\n]*)/g)].flatMap((m) =>
    (m[1] ?? "").trim().split(/\s+/).filter(Boolean),
  );

/** `git add -u` stages every change to tracked files, wherever it is. */
const updatesTracked = (command: string): boolean =>
  addWords(command).some((w) => w === "-u" || w === "--update");

/** `git add -f` stages a file the ignore rules would hide. */
const forcesIgnored = (command: string): boolean =>
  addWords(command).some((w) => w === "-f" || w === "--force" || /^-[A-Za-z]*f[A-Za-z]*$/.test(w));

/** `--stat` goes before any `--`, or git would read it as a file name. */
const withStat = (base: readonly string[]): string[] => {
  const at = base.indexOf("--");
  return at < 0 ? [...base, "--stat"] : [...base.slice(0, at), "--stat", ...base.slice(at)];
};

type PendingDiff = {
  stat: string;
  diff: string;
  untrackedAdr: boolean;
  /** Files the commit would add that git does not track yet. */
  untracked: readonly string[];
  /** Directory the paths of `untracked` are relative to. */
  root: string;
};

/** A leading `~` is the home directory, as the shell reads it. */
const homeExpanded = (dir: string): string =>
  dir === "~" || dir.startsWith("~/") ? join(homedir(), dir.slice(1)) : dir;

/** Which changes the commit takes: all tracked ones, only the paths it names or adds, or what is staged. */
function diffBases(o: {
  fixed: string[];
  all: boolean;
  named: string[];
  specs: string[];
}): string[][] {
  const { fixed, all, named, specs } = o;
  if (all) return [[...fixed, "HEAD"]];
  if (named.length > 0) return [[...fixed, "HEAD", "--", ...named]];
  if (specs.length > 0) {
    return [
      [...fixed, "--cached"],
      [...fixed, "HEAD", "--", ...new Set(specs)],
    ];
  }
  return [[...fixed, "--cached"]];
}

/** What is about to be committed: the staged changes, or every tracked change when the commit stages them itself. */
async function pendingDiff(
  exec: Exec,
  startDir: string,
  command: string,
): Promise<PendingDiff | undefined> {
  try {
    // The repository the commit runs in: `cd repo && git commit` or `git -C repo commit` is not the session's own.
    const moved = commitDir(command);
    const cwd = moved === undefined ? startDir : resolve(startDir, homeExpanded(moved));
    const specs = addedPathspecs(command);
    const named = commitPaths(command);
    const all = stagesEverything(command) || updatesTracked(command) || specs.includes(".");
    // Fixed prefixes and no external driver: `addsAdr` reads the headers, and git config can change them.
    // `core.quotePath=false` keeps a non-ASCII path readable instead of a quoted, escaped one.
    const fixed = [
      "-c",
      "core.quotePath=false",
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--src-prefix=a/",
      "--dst-prefix=b/",
    ];
    // Which changes the commit takes: all tracked ones, only the paths it names or adds, or what is staged.
    const bases = diffBases({ fixed, all, named, specs });
    const run = async (list: string[][]) => {
      const parts = await Promise.all(
        list.flatMap((base) => [
          exec("git", withStat(base), { cwd, timeout: 10_000 }),
          exec("git", base, { cwd, timeout: 10_000 }),
        ]),
      );
      const stats = parts.filter((_, i) => i % 2 === 0);
      const diffs = parts.filter((_, i) => i % 2 === 1);
      const ok = parts.every((r) => r.code === 0);
      return {
        code: ok ? 0 : 1,
        stat: stats.map((r) => r.stdout).join(""),
        diff: diffs.map((r) => r.stdout).join(""),
      };
    };
    const [first, untracked] = await Promise.all([
      run(bases),
      // `git diff HEAD` leaves out files git does not track yet, such as a new module or an ADR just created.
      specs.length > 0
        ? exec(
            "git",
            [
              "-c",
              "core.quotePath=false",
              "ls-files",
              "--others",
              ...(forcesIgnored(command) ? [] : ["--exclude-standard"]),
              "--",
              ...new Set(specs),
            ],
            { cwd, timeout: 10_000 },
          )
        : Promise.resolve(undefined),
    ]);
    // A repository with no commit yet has no HEAD to diff against; everything it holds is staged or untracked.
    const done =
      first.code !== 0 && bases.some((b) => b.includes("HEAD"))
        ? await run([[...fixed, "--cached"]])
        : first;
    const stat = { code: done.code, stdout: done.stat };
    const diff = { code: done.code, stdout: done.diff };
    if (stat.code !== 0 || diff.code !== 0) return undefined;
    const added = untracked?.code === 0 ? untracked.stdout.trim() : "";
    if (diff.stdout.trim() === "" && added === "") return undefined;
    return {
      stat:
        added === ""
          ? stat.stdout
          : // First, because Jev clips the stat: a long list of tracked files must not push new files out of view.
            `New files this commit adds (untracked):\n${added}\n\n${stat.stdout}`,
      diff: diff.stdout,
      untrackedAdr: /^docs\/adr\/\d{4}-\S+\.md$/m.test(added),
      untracked: added === "" ? [] : added.split("\n"),
      root: cwd,
    };
  } catch {
    return undefined;
  }
}

/** Non-negotiable 9 as a soft gate: the judgement is probabilistic, so a departure can answer it. */
async function adrNeeds(
  deps: CommitGuardDeps,
  ctx: ExtensionContext,
  pending: PendingDiff,
): Promise<Need[]> {
  if (addsAdr(pending.diff) || pending.untrackedAdr) return [];
  const judged = await judgeArchitectureShaping(deps.jev(ctx), {
    diffStat: pending.stat,
    diff: pending.diff,
  });
  if (!judged.ok || judged.value < ARCHITECTURE_THRESHOLD) return [];
  return [
    {
      gate: ADR_MISSING,
      why: "Jev reads this diff as an architecture-shaping decision (a boundary, dependency, data format or protocol) and it adds no ADR",
    },
  ];
}

async function jevNeeds(
  deps: CommitGuardDeps,
  ctx: ExtensionContext,
  message: string,
  bodyPresent: boolean,
  pending: PendingDiff | undefined,
): Promise<Need[]> {
  if (pending === undefined) return [];
  // Both ask Jev; run them together so a hung provider costs one timeout, not two.
  const [judged, adr] = await Promise.all([
    judgeCommit(deps.jev(ctx), { message, diffStat: pending.stat, diff: pending.diff }),
    adrNeeds(deps, ctx, pending),
  ]);
  const needs: Need[] = adr;
  if (!judged.ok) return needs;
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
  const inFlight = phase === "implementing" || phase === "reviewing" || phase === "delivering";
  if (!inFlight || activeSlice === undefined) return [];
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

const adrReason = (need: Need): string =>
  `${need.gate}: ${need.why}. Hard-to-reverse decisions are recorded as an ADR in the same change. ` +
  "Call devsys_adr_new with the decision's title, fill in the ADR and stage it. If this diff is not " +
  `architecture-shaping, call devsys_record_departure with gate "${need.gate}", what you are doing instead, ` +
  "why, and the cost if wrong; then retry.";

const commitReason = (need: Need): string =>
  `${need.gate}: ${need.why}. Commit messages carry their rationale and structural and behavioural ` +
  "changes go in separate commits. Fix the commit (split it, or write the why in the body), or if " +
  `departing is deliberate call devsys_record_departure with gate "${need.gate}", what you are doing ` +
  "instead, why, and the cost if wrong; then retry.";

function blockReason(need: Need): string {
  if (need.gate === REVIEW) return reviewReason(need);
  return need.gate === ADR_MISSING ? adrReason(need) : commitReason(need);
}

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
  pending: PendingDiff | undefined,
): Promise<Need[]> {
  const needs = messageNeeds(message);
  const bodyPresent = !needs.some((n) => n.why.startsWith("the message has no body"));
  const viaJev = await jevNeeds(deps, ctx, message, bodyPresent, pending);
  return [...needs, ...viaJev.filter((n) => !needs.some((m) => m.gate === n.gate))];
}

/** A message let through under a rationale departure is remembered, so its push is not asked again. */
function rememberExcused(deps: CommitGuardDeps, needs: readonly Need[], messages: string[]): void {
  if (!needs.some((n) => n.gate === RATIONALE)) return;
  for (const message of messages) deps.excused?.add(message);
}

const SECRET = gateId("commit.secret");

/** The untracked files a commit would add, as far as their content can be read (small regular files). */
function untrackedFiles(cwd: string, names: readonly string[]): PendingFile[] {
  return names.map((path) => {
    try {
      const file = resolve(cwd, path);
      const stat = statSync(file);
      if (!stat.isFile() || stat.size > 200_000) return { path, added: [] };
      return { path, added: readFileSync(file, "utf8").split("\n") };
    } catch {
      return { path, added: [] };
    }
  });
}

/**
 * Non-negotiable 7: a commit that adds a credential is a hard stop. The user may approve one commit
 * (a test fixture that merely looks like a credential); a departure recorded by the agent cannot.
 */
async function secretStop(
  deps: CommitGuardDeps,
  ctx: ExtensionContext,
  toolCallId: string,
  command: string,
  pending: PendingDiff | undefined,
): Promise<{ block: true; reason: string } | undefined> {
  if (pending === undefined) return undefined;
  const found = findSecrets([
    ...filesOfDiff(pending.diff),
    ...untrackedFiles(pending.root, pending.untracked),
  ]);
  if (found.length === 0) return undefined;
  // No pre-granted approval: `devsys_request_approval` shows only the command, and this dialog names the findings.
  const list = found.slice(0, 5).join("; ");
  const outcome = await requestHardStop({
    pi: deps.pi,
    ctx,
    gate: SECRET,
    command: `${command}\nThis commit would add: ${list}`,
    why: `approved interactively: ${list}`,
    toolCallId,
    costIfWrong: "a credential is committed and, once pushed, cannot be taken back",
    now: deps.now,
  });
  if (outcome.kind === "approved") return undefined;
  return {
    block: true,
    reason:
      outcome.kind === "unavailable"
        ? `hard stop ${SECRET}: requires user approval, run interactively. ${list}. Remove the credential (use an environment variable or an ignored file) and commit again.`
        : `hard stop ${SECRET}: the user declined this commit (${list}). Do not retry it; remove the credential from the change.`,
  };
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

    const pending = await pendingDiff(deps.exec, ctx.cwd, command);

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
      for (const need of await needsOf(deps, ctx, message, pending)) {
        if (!all.some((n) => n.gate === need.gate)) all.push(need);
      }
    }
    const uses = all.map((need) => ({ need, use: departureUse(deps.state, need.gate) }));
    const uncovered = uses.find(({ use }) => !use.hasOpen());
    if (uncovered !== undefined) return { block: true, reason: blockReason(uncovered.need) };
    // Asked last, so a commit the soft gates refuse is not approved (and logged) before it can run.
    const stop = await secretStop(deps, ctx, event.toolCallId, command, pending);
    if (stop !== undefined) return stop;
    for (const { use } of uses) use.consume();
    rememberExcused(deps, all, known);
    return undefined;
  });
}
