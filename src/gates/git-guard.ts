import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { classifyGitCommand, type GitIntent } from "../core/git-intent.ts";
import { redactSecrets } from "../core/redact.ts";
import { isParseError, parseGateId } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeShellIntent } from "../jev/questions/shell-intent.ts";
import { type ApprovalStore, requestHardStop } from "./approvals.ts";

const HARD: ReadonlySet<GitIntent> = new Set([
  "history-rewrite",
  "force-push",
  "branch-delete-remote",
  "destructive-reset",
  "no-verify",
]);

export type GitGuardDeps = {
  pi: ExtensionAPI;
  approvals: ApprovalStore;
  /** Jev for the current context; absent means the deterministic fast path only. */
  jev?: (ctx: ExtensionContext) => Jev;
  now?: () => Date;
};

/** Registers the `tool_call` hard stop for irreversible git operations in bash. */
export function registerGitGuard(deps: GitGuardDeps): void {
  deps.pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return undefined;
    const command = event.input.command;
    let intent = classifyGitCommand(command);
    if (intent === "unknown") {
      const judged =
        deps.jev === undefined ? undefined : await judgeShellIntent(deps.jev(ctx), command);
      if (judged?.ok === true && judged.value.intent !== "unknown") {
        intent = judged.value.intent;
      } else {
        const approved = ctx.hasUI
          ? await ctx.ui.confirm(
              "Development system — unclassified command",
              `${redactSecrets(command)}\nCould not classify this command (Jev ${judged?.ok === false ? `unavailable: ${judged.error.kind}` : "not confident"}). It may run an irreversible git operation. Approve?`,
            )
          : false;
        return approved
          ? undefined
          : {
              block: true,
              reason: ctx.hasUI
                ? "the user declined an unclassifiable command; propose a simpler, explicit git command"
                : "could not classify this command and Jev is unavailable or unsure; run interactively or use an explicit git command",
            };
      }
    }
    if (!HARD.has(intent)) return undefined;
    const gate = parseGateId(`git.${intent}`);
    if (isParseError(gate)) return { block: true, reason: gate.message };
    if (deps.approvals.consume(gate, command)) return undefined;
    const outcome = await requestHardStop({
      pi: deps.pi,
      ctx,
      gate,
      command,
      why: "approved interactively at the hard-stop dialog",
      toolCallId: event.toolCallId,
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    });
    if (outcome.kind === "approved") return undefined;
    return {
      block: true,
      reason:
        outcome.kind === "unavailable"
          ? `hard stop ${gate}: requires user approval; run interactively`
          : `hard stop ${gate}: the user declined this command. Do not retry it; propose a reversible alternative.`,
    };
  });
}
