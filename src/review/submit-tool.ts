import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { acceptArchitectureReceipt, type ReviewerOrigin } from "../core/architecture-review.ts";
import type { ReviewState } from "../core/review.ts";
import { reviewOf, upsertReview } from "../core/review-flow.ts";
import { packetFromSubmission } from "../core/review-submission.ts";
import type { SliceRef } from "../core/types.ts";
import type { SessionState } from "../state/session-state.ts";
import { inheritedToolCaller } from "../subagents/orch/tool-caller.ts";
import type { ArchitectureDispatch } from "./architecture-evidence.ts";
import type { SubmissionStore } from "./submissions.ts";

export const SubmitParameters = Type.Object({
  architectureEvidence: Type.Optional(
    Type.Unknown({
      description:
        "Exact-binding semantic evidence: bindingIdentity, ordered scoped units with six explained, cited checks, findings and verdict. Origin is host-owned, never an argument.",
    }),
  ),
  reviewInputIdentity: Type.Optional(
    Type.String({ description: "Exact configured input identity supplied in the reviewer task." }),
  ),
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
      severity: Type.Union([
        Type.Literal("blocking"),
        Type.Literal("should-fix"),
        Type.Literal("nit"),
        Type.Literal("false-positive"),
      ]),
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

function submissionOrigin(issued: ArchitectureDispatch, rootId: string) {
  const caller = inheritedToolCaller();
  const authenticated =
    caller !== undefined &&
    caller.rootId === rootId &&
    issued.rootId === rootId &&
    caller.threadPath === issued.threadPath &&
    /^\/review-[a-z0-9-]{1,57}$/.test(caller.threadPath) &&
    caller.parentPath === null &&
    caller.agentType === "reviewer" &&
    caller.attemptId === issued.attemptId &&
    typeof caller.sessionFile === "string" &&
    caller.sessionFile.trim() !== "" &&
    (issued.sessionFile === undefined || issued.sessionFile === caller.sessionFile);
  const host: ReviewerOrigin | undefined =
    caller !== undefined &&
    typeof caller.sessionFile === "string" &&
    caller.sessionFile.trim() !== ""
      ? {
          rootId: caller.rootId,
          threadPath: caller.threadPath,
          attemptId: caller.attemptId,
          sessionFile: caller.sessionFile,
        }
      : undefined;
  const expected =
    !authenticated || host === undefined
      ? undefined
      : { ...issued, sessionFile: issued.sessionFile ?? host.sessionFile };
  return { host, expected };
}

function selectedLens(dispatch: ReviewState["dispatch"], lenses: readonly string[]): boolean {
  return (
    dispatch === undefined || (lenses.length === 1 && dispatch.lenses.includes(lenses[0] ?? ""))
  );
}

function needsSemanticEvidence(expected: ArchitectureDispatch, evidence: unknown): boolean {
  return evidence !== undefined || inheritedToolCaller()?.threadPath === expected.threadPath;
}

function submit(
  deps: SubmitDeps,
  params: Static<typeof SubmitParameters>,
  getRootId: () => string,
) {
  const state = deps.state.get();
  const slice = params.slice as SliceRef;
  const review = reviewOf(state, slice);
  if (review === undefined && state.activeSlice !== slice) {
    return reply(
      `unknown-slice: "${params.slice}" is neither the active slice nor under review; use the slice name exactly as given in your task`,
      true,
    );
  }
  const expectedRound = (review?.rounds.length ?? 0) + 1;
  if (params.round !== expectedRound) {
    return reply(
      `wrong-round: this is for round ${params.round}, but round ${expectedRound} of "${params.slice}" is the one being reviewed; use the round number from your task`,
      true,
    );
  }
  const pending = review?.pending;
  const inputIdentity = pending?.input.identity ?? review?.dispatch?.inputIdentity;
  if (
    pending === undefined
      ? params.reviewInputIdentity !== inputIdentity
      : pending.round !== params.round || pending.input.identity !== params.reviewInputIdentity
  )
    return reply(
      "stale-review-input: use the exact current review input identity from your task.",
      true,
    );
  if (!selectedLens(review?.dispatch, params.lenses))
    return reply(
      "wrong-review-lens: submit exactly one selected lens from your reviewer task.",
      true,
    );
  const packet = packetFromSubmission(params);
  if ("id" in packet) return reply(`${packet.id}: ${packet.message}`, true);
  const architecture = pending?.architecture;
  if (
    architecture !== undefined &&
    needsSemanticEvidence(architecture.expected, params.architectureEvidence)
  ) {
    const { host, expected } = submissionOrigin(architecture.expected, getRootId());
    if (expected !== undefined && review !== undefined && pending !== undefined) {
      deps.state.update((s) =>
        upsertReview(s, {
          ...review,
          pending: { ...pending, architecture: { ...architecture, expected } },
        }),
      );
    }
    const accepted = acceptArchitectureReceipt(
      architecture.binding,
      params.architectureEvidence,
      host,
      expected,
    );
    deps.submissions.put(
      {
        ...packet,
        architecture: {
          ...(params.architectureEvidence === undefined
            ? {}
            : { evidence: params.architectureEvidence }),
          sources: packet.sources,
          ...(host === undefined ? {} : { origin: host }),
          ...(accepted.ok
            ? { receipt: accepted.value }
            : { refusal: `${accepted.error.kind}: ${accepted.error.message}` }),
        },
      },
      pending?.input.identity,
    );
    if (!accepted.ok)
      return reply(
        `architecture-${accepted.error.kind}: ${accepted.error.message} Ordinary findings retained; no semantic credit.`,
        true,
      );
  } else deps.submissions.put(packet, pending?.input.identity);
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
    executionMode: "sequential",
    execute(_id, params: Static<typeof SubmitParameters>, _signal, _update, ctx) {
      return Promise.resolve(submit(deps, params, () => ctx.sessionManager.getSessionId()));
    },
  };
}
