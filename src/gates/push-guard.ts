import { resolve } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isBashToolResult,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { parseConventionalCommit } from "../core/commit-message.ts";
import type { Exec } from "../core/exec.ts";
import { type PushTarget, pushTargets } from "../core/push-command.ts";
import { type GateId, isParseError, parseGateId } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { FIX_RELATED_THRESHOLD, judgeFixRelated } from "../jev/questions/fix-related.ts";
import { getFailureLog, getTrunkStatus } from "../state/ci.ts";
import { type DevsysConfig, loadConfig } from "../state/config.ts";
import type { SessionState } from "../state/session-state.ts";
import { type ApprovalStore, requestHardStop } from "./approvals.ts";

export type PushGuardDeps = {
  pi: ExtensionAPI;
  state: SessionState;
  approvals: ApprovalStore;
  jev: (ctx: ExtensionContext) => Jev;
  exec: Exec;
  now?: () => Date;
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
async function repairsRedTrunk(
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
    const { mode, trunk } = loaded.value.delivery;
    if (mode === "local-only") {
      return {
        block: true,
        reason: `delivery.mode is "local-only" in .development-system.toml: nothing is pushed. Change the mode with the user if this should be published.`,
      };
    }
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
    if (await repairsRedTrunk(deps, ctx, loaded.value, status.runId)) return undefined;
    return hardStop(deps, {
      ctx,
      toolCallId: event.toolCallId,
      command,
      gate: RED_TRUNK,
      why: `CI on ${trunk} is red (${status.headSha?.slice(0, 7) ?? "unknown sha"}) and this push is not a recognised fix for it`,
      costIfWrong: "unrelated work piles onto a broken build and hides the failure",
    });
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
