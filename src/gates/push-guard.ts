import { resolve } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isBashToolResult,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { extractCommits } from "../core/commit-command.ts";
import { parseConventionalCommit } from "../core/commit-message.ts";
import type { Exec } from "../core/exec.ts";
import { resolveGit, runsDefinedAlias } from "../core/git-invocations.ts";
import { type PushTarget, pushTargets } from "../core/push-command.ts";
import { type GateId, isParseError, parseGateId } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { FIX_RELATED_THRESHOLD, judgeFixRelated } from "../jev/questions/fix-related.ts";
import { getFailureLog, getTrunkStatus } from "../state/ci.ts";
import { type DevsysConfig, loadConfig } from "../state/config.ts";
import type { SessionState } from "../state/session-state.ts";
import { type ApprovalStore, requestHardStop } from "./approvals.ts";
import { departureUse } from "./departure-use.ts";
import type { ExcusedMessages } from "./excused-messages.ts";
import { type PushMessageFindings, pushMessageFindings } from "./push-messages.ts";

export type PushGuardDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  approvals: ApprovalStore;
  jev: (ctx: ExtensionContext) => Jev;
  exec: Exec;
  now?: () => Date;
  /** Messages `git commit` already excused by a departure; shared with the commit guard. */
  excused?: ExcusedMessages | undefined;
};

type Verdict = { readonly block: true; readonly reason: string } | undefined;

const gate = (id: string): GateId => {
  const parsed = parseGateId(id);
  if (isParseError(parsed)) throw new Error(parsed.message);
  return parsed;
};
const FIX_DIFF_LIMIT = 8000;
const RED_TRUNK = gate("push.red-trunk");
const DELIVERY_MODE = gate("push.delivery-mode");
const RATIONALE = gate("commit.rationale");

const COMMIT_MAKERS = new Set(["cherry-pick", "merge", "revert", "am", "commit-tree"]);

/** Flags that stop a commit-maker from writing a commit: a fast-forward, a staged-only result, or an abandoned run. */
const NO_COMMIT_FLAGS: Readonly<Record<string, readonly string[]>> = {
  merge: ["--ff-only", "--abort", "--quit", "--squash", "--no-commit"],
  "cherry-pick": ["--abort", "--quit", "-n", "--no-commit"],
  revert: ["--abort", "--quit", "-n", "--no-commit"],
  am: ["--abort", "--quit"],
};
const makesNoCommit = (g: { readonly sub: string; readonly args: readonly string[] }): boolean =>
  g.args.some((a) => NO_COMMIT_FLAGS[g.sub]?.includes(a) === true);

/** A push in the same call as commits whose messages the commit guard never reads (`commit -C`, `cherry-pick`). */
const createsUnseenCommits = (command: string): boolean => {
  const { invocations } = resolveGit(command);
  return (
    invocations.some((g) => COMMIT_MAKERS.has(g.sub) && !makesNoCommit(g)) ||
    runsDefinedAlias(command, resolveGit(command)) ||
    invocations.some(
      (g) =>
        g.sub === "commit" &&
        g.args.some((a) => expandsAtRunTime(a) && !command.includes(`'${a}'`)),
    ) ||
    extractCommits(command).some((e) => commitIsUnseen(command, e))
  );
};

/** `$(cat <<'EOF' …)` is the message itself (its body is read); any other `$(…)`, backtick or variable is only known once the call runs. */
const expandsAtRunTime = (arg: string): boolean =>
  /\$\(|`|\$\{?\w/.test(
    arg.replace(/\$\(\s*cat\s+#HD\d+\s*\)/g, "").replace(/\\[\s\S]/g, ""), // an escaped `\`` or `\$` is literal text
  );

/** A commit whose message the guard read before the call ran may still change: a `-F` file the same call writes. */
const commitIsUnseen = (command: string, e: ReturnType<typeof extractCommits>[number]): boolean => {
  if (e.kind === "unknown") return true;
  if (e.kind !== "file") return false;
  // Stdin, or a path the shell expands (`~/msg`), is a message the commit guard never read.
  if (e.path === "-" || /^~|[$`]/.test(e.path)) return true;
  return command.split(e.path).length > 2;
};

const forbiddenVerdict = (found: PushMessageFindings): Verdict =>
  found.forbidden.length === 0
    ? undefined
    : {
        block: true,
        reason:
          `commit.forbidden-trailer: this push would publish a commit that carries an AI attribution (${found.forbidden.join("; ")}). ` +
          "Commits in this repository have no Co-Authored-By or generated-by trailers and this is not something to depart from. " +
          "Remove the trailer from the unpushed commit, then push again.",
      };

/**
 * A commit with no rationale needs the departure `git commit` would have asked for. Checked before any
 * approval is asked (a refusal after the user approved would ask them again); spent only once the push
 * is otherwise allowed.
 */
const rationaleOwed = (deps: PushGuardDeps, found: PushMessageFindings): boolean =>
  found.unexplained !== undefined && !departureUse(deps.state, RATIONALE).hasOpen();

const rationaleRefusal = (found: PushMessageFindings): Verdict => ({
  block: true,
  reason:
    `commit.rationale: this push would publish a commit that fails the message rule (${found.unexplained}). ` +
    "Improve the unpushed message, or record a departure with devsys_record_departure (gate commit.rationale) and push again.",
});

async function currentBranch(exec: Exec, cwd: string): Promise<string | undefined> {
  try {
    const r = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, timeout: 5000 });
    const name = r.code === 0 ? r.stdout.trim() : "";
    return name === "" || name === "HEAD" ? undefined : name;
  } catch {
    return undefined;
  }
}

async function pushesTrunk(
  exec: Exec,
  cwd: string,
  targets: readonly PushTarget[],
  trunk: string,
): Promise<boolean> {
  for (const t of targets) {
    if (t.allBranches || t.branches.includes(trunk)) return true;
    const where = t.dir === undefined ? cwd : resolve(cwd, t.dir);
    if (t.tagsOnly) continue;
    if (t.branches.length === 0 || t.usesHead) {
      // No refspec: the current branch decides. When it cannot be read, assume it is the trunk.
      const branch = await currentBranch(exec, where);
      if (branch === undefined || branch === trunk) return true;
    }
  }
  return false;
}

/** Whether the unpushed work is a `fix` commit whose diff Jev reads as only repairing the red build. */
async function judgeRepair(
  deps: PushGuardDeps,
  ctx: ExtensionContext,
  config: DevsysConfig,
  runId: number | undefined,
): Promise<boolean> {
  const message = await deps.exec("git", ["log", "-1", "--format=%B"], {
    cwd: ctx.cwd,
    timeout: 5000,
  });
  const parsed = parseConventionalCommit(message.stdout);
  if (message.code !== 0 || !parsed.ok || parsed.value.type !== "fix") return false;
  const range = `${config.delivery.remote}/${config.delivery.trunk}..HEAD`;
  const diff = await deps.exec("git", ["diff", range], { cwd: ctx.cwd, timeout: 10_000 });
  // Jev only reads a bounded diff; a longer range could hide unrelated change past what it sees.
  if (diff.code !== 0 || diff.stdout.trim() === "" || diff.stdout.length > FIX_DIFF_LIMIT) {
    return false;
  }
  const failingLog = await getFailureLog(deps.exec, ctx.cwd, runId);
  if (failingLog.trim() === "") return false; // nothing to compare the diff against: fail closed
  const judged = await judgeFixRelated(deps.jev(ctx), {
    diff: diff.stdout,
    failingLog,
    message: message.stdout,
  });
  return judged.ok && judged.value >= FIX_RELATED_THRESHOLD;
}

/** Fails closed: any exec failure means the push is not shown to repair the red build. */
async function repairsRedTrunk(
  deps: PushGuardDeps,
  ctx: ExtensionContext,
  config: DevsysConfig,
  runId: number | undefined,
): Promise<boolean> {
  try {
    return await judgeRepair(deps, ctx, config, runId);
  } catch {
    return false;
  }
}

type HardStop = {
  readonly ctx: ExtensionContext;
  readonly toolCallId: string;
  readonly command: string;
  readonly gate: GateId;
  readonly why: string;
  readonly costIfWrong: string;
};

const declinedAdvice = (which: GateId): string =>
  which === RED_TRUNK ? "fix the red build first" : "open a pull request instead";

async function hardStop(deps: PushGuardDeps, stop: HardStop): Promise<Verdict> {
  const { gate: which, command } = stop;
  if (deps.approvals.consume(which, command)) return undefined;
  const outcome = await requestHardStop({
    pi: deps.pi,
    ctx: stop.ctx,
    gate: which,
    command,
    why: stop.why,
    toolCallId: stop.toolCallId,
    costIfWrong: stop.costIfWrong,
    now: deps.now,
  });
  if (outcome.kind === "approved") return undefined;
  if (outcome.kind === "unavailable") {
    return {
      block: true,
      reason: `hard stop ${which}: ${stop.why}. Requires user approval; run interactively`,
    };
  }
  return {
    block: true,
    reason: `hard stop ${which}: the user declined this push. Do not retry it; ${declinedAdvice(which)}.`,
  };
}

type PushCall = { readonly toolCallId: string; readonly input: { readonly command: string } };

/** Delivery-mode and red-trunk hard stops for a push onto the trunk. */
async function trunkVerdict(
  deps: PushGuardDeps,
  ctx: ExtensionContext,
  event: PushCall,
  config: DevsysConfig,
  targets: readonly PushTarget[],
): Promise<Verdict> {
  const { mode, trunk } = config.delivery;
  if (!(await pushesTrunk(deps.exec, ctx.cwd, targets, trunk))) return undefined;
  const command = event.input.command;
  if (mode === "pull-request") {
    return hardStop(deps, {
      ctx,
      toolCallId: event.toolCallId,
      command,
      gate: DELIVERY_MODE,
      why: `delivery.mode is "pull-request" but this pushes ${trunk}`,
      costIfWrong: "unreviewed work lands directly on the trunk",
    });
  }
  const status = await getTrunkStatus(deps.exec, { branch: trunk, cwd: ctx.cwd });
  if (status.status !== "red") return undefined;
  if (extractCommits(command).length > 0) {
    return {
      block: true,
      reason: `CI on ${trunk} is red and this call commits and pushes together, so the push cannot be judged as a fix for it. Commit first in one call, then push in the next.`,
    };
  }
  if (await repairsRedTrunk(deps, ctx, config, status.runId)) return undefined;
  return hardStop(deps, {
    ctx,
    toolCallId: event.toolCallId,
    command,
    gate: RED_TRUNK,
    why: `CI on ${trunk} is red (${status.headSha?.slice(0, 7) ?? "unknown sha"}) and this push is not a recognised fix for it`,
    costIfWrong: "unrelated work piles onto a broken build and hides the failure",
  });
}

/** Delivery-mode and red-trunk hard stops on `git push`; records when a push last succeeded. */
export function registerPushGuard(deps: PushGuardDeps): void {
  deps.pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return undefined;
    const targets = pushTargets(event.input.command);
    if (targets.length === 0) return undefined;
    const loaded = await loadConfig(ctx.cwd);
    if (!loaded.ok) {
      return { block: true, reason: `cannot read the delivery policy: ${loaded.error.message}` };
    }
    if (loaded.value.delivery.mode === "local-only") {
      return {
        block: true,
        reason: `delivery.mode is "local-only" in .development-system.toml: nothing is pushed. Change the mode with the user if this should be published.`,
      };
    }
    if (createsUnseenCommits(event.input.command)) {
      return {
        block: true,
        reason:
          "this call creates commits (cherry-pick, merge, revert, am, commit-tree or a commit with a message the guard cannot read) and pushes them together, so their messages cannot be checked first. Make the commits in one call, then push in the next.",
      };
    }
    // Read-only first: an AI trailer blocks before any approval or departure is spent.
    const found = await pushMessageFindings(deps.exec, ctx.cwd, targets, deps.excused);
    const refused = found === undefined ? undefined : forbiddenVerdict(found);
    if (refused !== undefined) return refused;
    if (found !== undefined && rationaleOwed(deps, found)) return rationaleRefusal(found);
    const stopped = await trunkVerdict(deps, ctx, event, loaded.value, targets);
    if (stopped !== undefined) return stopped;
    if (found?.unexplained !== undefined) departureUse(deps.state, RATIONALE).consume();
    return undefined;
  });

  deps.pi.on("tool_result", (event) => {
    if (!isBashToolResult(event) || event.isError) return undefined;
    if (pushTargets(String(event.input.command)).length === 0) return undefined;
    deps.state.update((s) => ({
      ...s,
      lastPushAt: (deps.now ?? (() => new Date()))().toISOString(),
    }));
    return undefined;
  });
}
