import {
  type ExtensionAPI,
  type ExtensionContext,
  isBashToolResult,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { extractCommits } from "../core/commit-command.ts";
import type { Exec } from "../core/exec.ts";
import { closeSlice, reviewWaived } from "../core/lifecycle.ts";
import { pushTargets } from "../core/push-command.ts";
import { isSatisfied } from "../core/review.ts";
import { reviewOf } from "../core/review-flow.ts";
import type { DevsysState } from "../core/types.ts";
import { loadConfig } from "../state/config.ts";
import type { SessionState } from "../state/session-state.ts";

const SLICE_ENTRY_TYPE = "devsys-slice";

export type SliceCloseDeps = { pi: ExtensionAPI; state: SessionState; exec: Exec };

const IN_FLIGHT = new Set<DevsysState["phase"]>(["implementing", "reviewing", "delivering"]);

/** True when `git status` shows nothing to commit; `undefined` when git could not say. */
async function treeIsClean(exec: Exec, cwd: string): Promise<boolean | undefined> {
  const r = await exec("git", ["status", "--porcelain"], { cwd, timeout: 15_000 });
  return r.code === 0 ? r.stdout.trim() === "" : undefined;
}

/** Commits on HEAD that no branch of `remote` has; works without an upstream, `undefined` when git could not say. */
async function unpushedCommits(
  exec: Exec,
  cwd: string,
  remote: string,
): Promise<number | undefined> {
  const r = await exec("git", ["rev-list", "--count", "HEAD", "--not", `--remotes=${remote}`], {
    cwd,
    timeout: 15_000,
  });
  const n = Number(r.stdout.trim());
  return r.code === 0 && Number.isInteger(n) ? n : undefined;
}

/** No review is owed before this slice ships: its review is satisfied, or a departure waives it. */
function reviewCleared(state: DevsysState): boolean {
  if (state.activeSlice === undefined) return false;
  const review = reviewOf(state, state.activeSlice);
  return reviewWaived(state) || (review !== undefined && isSatisfied(review));
}

/** What delivered the slice: a commit when nothing leaves the machine, otherwise a push. */
const shipped = (mode: string, command: string): boolean =>
  mode === "local-only" ? extractCommits(command).length > 0 : pushTargets(command).length > 0;

const closedMessage = (slice: string, how: string): string =>
  `Slice ${slice} ${how}. Phase: idle; the next request starts new work with devsys_intake.`;

/**
 * Closes the slice when it ships: in any in-flight phase whose review is satisfied (`delivering`, or a session
 * saved before the life cycle existed) or waived by a recorded departure, a successful push (trunk, pull-request) or commit (local-only) that
 * leaves a clean working tree. CI is not awaited; the push guard already refuses to build on a red trunk.
 */
export function registerSliceClose(deps: SliceCloseDeps): void {
  deps.pi.on("tool_result", async (event, ctx) => {
    if (!isBashToolResult(event) || event.isError) return undefined;
    const state = deps.state.get();
    const { activeSlice, phase } = state;
    if (activeSlice === undefined || !IN_FLIGHT.has(phase)) return undefined;
    if (!reviewCleared(state)) return undefined;
    const config = await loadConfig(ctx.cwd);
    if (!(config.ok && shipped(config.value.delivery.mode, String(event.input.command)))) {
      return undefined;
    }
    if ((await treeIsClean(deps.exec, ctx.cwd)) !== true) return undefined;
    // A tags-only push, or a push of another branch, leaves this slice's commits where they were.
    if (config.value.delivery.mode !== "local-only") {
      if ((await unpushedCommits(deps.exec, ctx.cwd, config.value.delivery.remote)) !== 0)
        return undefined;
    }
    // The checks above awaited git; close only the slice they were about.
    if (deps.state.get().activeSlice !== activeSlice) return undefined;
    deps.state.update(closeSlice);
    deps.pi.sendMessage(
      {
        customType: SLICE_ENTRY_TYPE,
        content: closedMessage(activeSlice, "was delivered"),
        display: true,
      },
      { triggerTurn: false },
    );
    return undefined;
  });
}

const Parameters = Type.Object({
  abandon: Type.Optional(
    Type.Boolean({
      description:
        "Close the slice without delivering it. Needs a reason; the working tree is left as it is.",
    }),
  ),
  reason: Type.Optional(Type.String({ description: "Why the slice is abandoned (with abandon)." })),
});

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

/** Another slice became active while this one waited on the user or on git: leave it alone. */
const changedMeanwhile = (slice: string) =>
  reply(`Slice ${slice} is no longer the active slice; nothing was closed.`, true);

/** Why a slice cannot be finished yet, or `undefined` when it is reviewed, clean and pushed. */
async function finishBlocker(deps: Pick<SliceCloseDeps, "state" | "exec">, cwd: string) {
  const state = deps.state.get();
  const { activeSlice } = state;
  if (activeSlice === undefined) return undefined;
  if (!reviewCleared(state)) {
    return `slice ${activeSlice} has no satisfied review: finish the review rounds (devsys_review_start), or record a review.unsatisfied departure`;
  }
  const clean = await treeIsClean(deps.exec, cwd);
  if (clean !== true) {
    return clean === false
      ? "there are uncommitted changes: commit them first"
      : "git could not report the working tree status";
  }
  const config = await loadConfig(cwd);
  if (!config.ok) return `cannot read the delivery mode: ${config.error.message}`;
  if (config.value.delivery.mode === "local-only") return undefined;
  const ahead = await unpushedCommits(deps.exec, cwd, config.value.delivery.remote);
  if (ahead === undefined) {
    return "git could not say whether the commits are pushed";
  }
  return ahead > 0 ? `${ahead} commit(s) are not pushed yet: push first` : undefined;
}

/**
 * `devsys_finish_slice`: the explicit way to close a slice. The push guard closes a delivered slice by itself;
 * this covers what it cannot see (a push made outside pi, a slice that is dropped) and checks the same facts.
 */
export function createFinishSliceTool(
  deps: Pick<SliceCloseDeps, "state" | "exec">,
): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_finish_slice",
    label: "Finish slice",
    description:
      "Close the active slice and return to idle. Checks that its review is satisfied (or waived by a recorded departure), the tree is clean and the commits are pushed. With abandon and a reason it drops the slice without delivering it, after the user confirms.",
    promptSnippet: "Close the active slice once it is delivered, or abandon it",
    parameters: Parameters,
    exposure: "model-only",
    async execute(
      _id,
      params: Static<typeof Parameters>,
      _signal,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      const { activeSlice } = deps.state.get();
      if (activeSlice === undefined) {
        return reply("There is no active slice to finish. Start work with devsys_intake.", true);
      }
      if (params.abandon === true) {
        const reason = params.reason?.trim() ?? "";
        if (reason === "") return reply("abandoning a slice needs a reason: pass `reason`.", true);
        // Idle switches the review and red-first gates off, so only the user may drop an unfinished slice.
        if (!ctx.hasUI) {
          return reply(
            `Abandoning slice ${activeSlice} needs the user's confirmation and there is no interactive session; ask the user to run it.`,
            true,
          );
        }
        const go = await ctx.ui.confirm(
          "Abandon slice?",
          `Slice "${activeSlice}" would be closed without being delivered (${reason}). Its review and red-first gates stop applying; the working tree is left as it is.`,
        );
        if (!go) return reply(`Abandon declined; slice ${activeSlice} is unchanged.`, true);
        if (deps.state.get().activeSlice !== activeSlice) return changedMeanwhile(activeSlice);
        deps.state.update(closeSlice);
        return reply(
          `${closedMessage(activeSlice, `was abandoned (${reason})`)} The working tree was not touched.`,
        );
      }
      const blocker = await finishBlocker(deps, ctx.cwd);
      if (blocker !== undefined) {
        return reply(`Slice ${activeSlice} is not finished: ${blocker}.`, true);
      }
      if (deps.state.get().activeSlice !== activeSlice) return changedMeanwhile(activeSlice);
      deps.state.update(closeSlice);
      return reply(closedMessage(activeSlice, "is finished"));
    },
  };
}
