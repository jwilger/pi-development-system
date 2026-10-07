import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { gateIds, lookupGate } from "../core/gates.ts";
import { isParseError, parseGateId } from "../core/types.ts";
import { type ApprovalStore, requestHardStop } from "./approvals.ts";

const Parameters = Type.Object({
  gate: Type.String({ description: "A hard gate id, e.g. git.force-push" }),
  command: Type.String({ description: "The exact command you intend to run afterwards" }),
  why: Type.String({ description: "Why this irreversible action is needed" }),
});

const text = (t: string, isError = false) => ({
  content: [{ type: "text" as const, text: t }],
  details: undefined,
  isError,
});

export type RequestApprovalDeps = { pi: ExtensionAPI; approvals: ApprovalStore; now?: () => Date };

/** `devsys_request_approval`: ask the user ahead of time to approve one hard-stop command. */
export function createRequestApprovalTool(
  deps: RequestApprovalDeps,
): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_request_approval",
    label: "Request approval",
    description:
      "Ask the user to approve one irreversible command (hard stop). Approval is single-use and " +
      "only valid for the exact command text. Unavailable when running headless.",
    promptSnippet: "Ask the user to approve an irreversible git command (hard stop)",
    parameters: Parameters,
    exposure: "model-only",
    async execute(toolCallId, params: Static<typeof Parameters>, _signal, _onUpdate, ctx) {
      const gate = parseGateId(params.gate);
      if (params.gate === "commit.forbidden-trailer") {
        return text(
          "commit.forbidden-trailer is never approvable: remove the AI attribution from the commit instead.",
          true,
        );
      }
      if (isParseError(gate) || gate.includes(":") || lookupGate(gate)?.tier !== "hard") {
        const hard = gateIds().filter((id) => lookupGate(id)?.tier === "hard");
        return text(`"${params.gate}" is not a hard gate. Hard gates: ${hard.join(", ")}`, true);
      }
      const outcome = await requestHardStop({
        pi: deps.pi,
        ctx,
        gate,
        command: params.command,
        why: params.why,
        toolCallId,
        ...(deps.now !== undefined ? { now: deps.now } : {}),
      });
      if (outcome.kind === "unavailable") {
        return text("unavailable headless: hard stops need an interactive user.", true);
      }
      if (outcome.kind === "declined") {
        return text(
          "The user declined. Do not run this command; propose a reversible alternative.",
          true,
        );
      }
      deps.approvals.grant(gate, params.command, outcome.departure.id);
      return text(`Approved once for gate ${gate}. Run exactly: ${params.command}`);
    },
  };
}
