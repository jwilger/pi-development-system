import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { classifyGitCommand, type GitIntent } from "../core/git-intent.ts";
import { isParseError, parseGateId } from "../core/types.ts";
import { type ApprovalStore, requestHardStop } from "./approvals.ts";

const HARD: ReadonlySet<GitIntent> = new Set([
  "history-rewrite",
  "force-push",
  "branch-delete-remote",
  "destructive-reset",
  "no-verify",
]);

export type GitGuardDeps = { pi: ExtensionAPI; approvals: ApprovalStore; now?: () => Date };

/** Registers the `tool_call` hard stop for irreversible git operations in bash. */
export function registerGitGuard(deps: GitGuardDeps): void {
  deps.pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return undefined;
    const command = event.input.command;
    const intent = classifyGitCommand(command);
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
