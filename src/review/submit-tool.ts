import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { SEVERITIES } from "../core/review.ts";
import { reviewOf } from "../core/review-flow.ts";
import { packetFromSubmission } from "../core/review-submission.ts";
import type { SliceRef } from "../core/types.ts";
import type { SessionState } from "../state/session-state.ts";
import type { SubmissionStore } from "./submissions.ts";

export const SubmitParameters = Type.Object({
  slice: Type.String({ description: "The slice you were asked to review, exactly as given." }),
  round: Type.Integer({ minimum: 1, description: "The round number you were asked to review." }),
  lenses: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    description: "Every lens you reviewed through.",
  }),
  sources: Type.Array(Type.String(), {
    description: "What you inspected (path:line ranges), and what you checked and refuted.",
  }),
  findings: Type.Array(
    Type.Object({
      lens: Type.String({ minLength: 1, description: "One of `lenses`." }),
      severity: Type.Union(SEVERITIES.map((s) => Type.Literal(s))),
      path: Type.Optional(Type.String({ description: "File the finding is about." })),
      line: Type.Optional(Type.Integer({ minimum: 1 })),
      summary: Type.String({
        minLength: 1,
        description: "One sentence: the defect, why it matters, and the smallest repair.",
      }),
    }),
    { description: "Empty when there is nothing to report." },
  ),
  verdict: Type.Union([Type.Literal("no-blocking"), Type.Literal("blocking")], {
    description: "`blocking` when any finding is blocking or should-fix, otherwise `no-blocking`.",
  }),
});

export type SubmitDeps = { state: SessionState; submissions: SubmissionStore };

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

function submit(deps: SubmitDeps, params: Static<typeof SubmitParameters>) {
  const state = deps.state.get();
  const slice = params.slice as SliceRef;
  const review = reviewOf(state, slice);
  if (review === undefined && state.activeSlice !== slice) {
    return reply(
      `unknown-slice: "${params.slice}" is neither the active slice nor under review; use the slice name exactly as given in your task`,
      true,
    );
  }
  const expected = (review?.rounds.length ?? 0) + 1;
  if (params.round !== expected) {
    return reply(
      `wrong-round: this is for round ${params.round}, but round ${expected} of "${params.slice}" is the one being reviewed; use the round number from your task`,
      true,
    );
  }
  const packet = packetFromSubmission(params);
  if ("id" in packet) return reply(`${packet.id}: ${packet.message}`, true);
  deps.submissions.put(packet);
  return reply(
    `submitted: ${params.slice} round ${params.round}, lenses ${params.lenses.join(", ")}, verdict ${params.verdict}, ${params.findings.length} finding(s). End with one short line.`,
  );
}

/** `devsys_submit_review`: a reviewer hands over its packet as validated arguments (ADR 0006). */
export function createSubmitReviewTool(deps: SubmitDeps): ToolDefinition<typeof SubmitParameters> {
  return {
    name: "devsys_submit_review",
    label: "Submit review result",
    description:
      "For reviewer subagents only: submit your review result as structured arguments. A result that contradicts itself or is for another round is refused with an error id; fix it and submit again. Then end with one short line.",
    promptSnippet: "Submit a review result (reviewer subagents)",
    parameters: SubmitParameters,
    exposure: "direct",
    execute(_id, params: Static<typeof SubmitParameters>) {
      return Promise.resolve(submit(deps, params));
    },
  };
}
