import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import type { Exec } from "../core/exec.ts";
import { afterReviewRound } from "../core/lifecycle.ts";
import { resolveSlot } from "../core/models.ts";
import type { Lens } from "../core/review.ts";
import {
  addRound,
  DEFAULT_LENSES,
  type Finding,
  nextAction,
  type ReviewState,
  selectLenses,
  startReview,
} from "../core/review.ts";
import {
  adoptSeverity,
  combinePackets,
  nitLines,
  reviewerTask,
  reviewLabel,
  reviewOf,
  upsertReview,
} from "../core/review-flow.ts";
import { parseReviewPacket, type ReviewPacket } from "../core/review-packet.ts";
import { isParseError, type SliceRef } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeLenses, judgeSeverity } from "../jev/questions/review.ts";
import { CONFIG_FILE, loadConfig } from "../state/config.ts";
import { availableModels } from "../state/models-command.ts";
import type { SessionState } from "../state/session-state.ts";
import { snapshotDiff } from "./digest.ts";
import type { SubmissionStore } from "./submissions.ts";

export type ReviewToolDeps = {
  state: SessionState;
  jev: (ctx: ExtensionContext) => Jev;
  exec: Exec;
  /** Results reviewers submitted with `devsys_submit_review`, read by `devsys_review_record`. */
  submissions: SubmissionStore;
  now?: () => Date;
};

const GATE_RANGE_NOTE =
  "Note: the commit gate checks the uncommitted diff (range HEAD). A review of another range does not clear it; review the default range before committing.";

const reply = (payload: string, isError = false) => ({
  content: [{ type: "text" as const, text: payload }],
  details: undefined,
  isError,
});

const sliceOf = (given: string | undefined, state: SessionState): SliceRef | undefined => {
  const slice = given?.trim() || state.get().activeSlice;
  return slice === undefined || slice === "" ? undefined : (slice as SliceRef);
};

const NO_SLICE =
  "no slice: pass `slice`, or start work on a slice first (there is no active slice)";

const NO_RESULT = (slice: string, round: number): string =>
  `no result for round ${round} of "${slice}": the reviewer submits it with devsys_submit_review before you record, or you pass its packet markdown in \`packets\``;

const StartParameters = Type.Object({
  slice: Type.Optional(
    Type.String({ description: "Slice being reviewed; defaults to the active slice." }),
  ),
  diffRange: Type.Optional(
    Type.String({
      description: "Git revision range to review; defaults to HEAD (all uncommitted changes).",
    }),
  ),
});

/** One path segment is at most 64 chars (src/subagents/orch/paths.ts); keep room for round and attempt. */
const pathSafe = (slice: string): string =>
  slice
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

type LensJudgement = Awaited<ReturnType<typeof judgeLenses>>;

/** Jev's lenses for the diff, or the defaults (with the reason) when Jev is offline or names none. */
function chooseLenses(judged: LensJudgement): { lenses: Lens[]; basis: string } {
  if (!judged.ok) {
    return {
      lenses: [...DEFAULT_LENSES],
      basis: `Jev unavailable (${judged.error.kind}); using the default lenses.`,
    };
  }
  const selected = selectLenses(judged.value);
  if (selected.length === 0) {
    return {
      lenses: [...DEFAULT_LENSES],
      basis: "Jev found no specific lens; using the defaults.",
    };
  }
  return { lenses: selected, basis: "Jev chose the lenses." };
}

/** The agent_spawn arguments for one reviewer round. */
function spawnPayload(input: {
  slice: SliceRef;
  round: number;
  lenses: Lens[];
  range: string;
  model: ReturnType<typeof resolveSlot>;
  now: Date;
}): Record<string, unknown> {
  return {
    // A fresh path per attempt: a failed spawn must not leave a thread that blocks the retry.
    path: `/review-${pathSafe(input.slice)}-r${input.round}-${input.now.getTime().toString(36)}`,
    type: "reviewer",
    task: reviewerTask({
      slice: input.slice,
      round: input.round,
      lenses: input.lenses,
      diffRange: input.range,
    }),
    ...(input.model.ok ? { model: input.model.value.model } : {}),
    thinkingLevel: "high",
    wait: true,
  };
}

type Reply = ReturnType<typeof reply>;
const replyText = (r: Reply): string => r.content.map((c) => c.text).join("\n");
type Config = Extract<Awaited<ReturnType<typeof loadConfig>>, { ok: true }>["value"];
type Snapshot = Extract<Awaited<ReturnType<typeof snapshotDiff>>, { ok: true }>["value"];
type Prepared = { slice: SliceRef; config: Config; range: string; snap: Snapshot };

const requiredRounds = (config: Config): number =>
  Math.max(config.review.requiredCleanRounds, config.review.minRounds);

const rangeOf = (given: string | undefined): string => given?.trim() || "HEAD";

/** The slice, config and diff snapshot both tools need, or the error reply that explains why not. */
async function prepare(
  deps: ReviewToolDeps,
  ctx: ExtensionContext,
  given: { slice?: string | undefined; diffRange?: string | undefined },
  failure: (range: string, error: string) => string,
): Promise<{ ok: true; value: Prepared } | { ok: false; reply: Reply }> {
  const slice = sliceOf(given.slice, deps.state);
  if (slice === undefined) return { ok: false, reply: reply(NO_SLICE, true) };
  const config = await loadConfig(ctx.cwd);
  if (!config.ok)
    return { ok: false, reply: reply(`${CONFIG_FILE}: ${config.error.message}`, true) };
  const range = rangeOf(given.diffRange);
  const snap = await snapshotDiff(deps.exec, ctx.cwd, range);
  if (!snap.ok) return { ok: false, reply: reply(failure(range, snap.error), true) };
  return { ok: true, value: { slice, config: config.value, range, snap: snap.value } };
}

const rangeNote = (range: string): string => (range === "HEAD" ? "" : ` ${GATE_RANGE_NOTE}`);

/** The reply for a round that must not start: already satisfied, or findings still open. */
function startRefusal(review: ReviewState, p: Prepared): Reply | undefined {
  const action = nextAction(review, p.snap.digest);
  if (action === "done") {
    return reply(
      `${reviewLabel(review)}. Review of ${p.slice} is already satisfied on this diff; nothing to run.${rangeNote(p.range)}`,
    );
  }
  if (action === "fix-findings") {
    return reply(
      `${reviewLabel(review)}. Round ${review.rounds.length} of ${p.slice} has blocking or should-fix findings and the diff has not changed since: fix them first, then start again. ` +
        "Re-running the review on unchanged code does not clear a finding. If a finding is wrong, record a `review.unsatisfied` departure with the evidence (devsys_record_departure).",
      true,
    );
  }
  return undefined;
}

async function startRound(
  deps: ReviewToolDeps,
  ctx: ExtensionContext,
  p: Prepared,
): Promise<Reply> {
  const judged = await judgeLenses(deps.jev(ctx), {
    diffStat: p.snap.stat,
    diffSample: p.snap.sample,
    profiles: deps.state.get().profiles ?? [],
  });
  const { lenses, basis } = chooseLenses(judged);
  const required = requiredRounds(p.config);
  const existing = reviewOf(deps.state.get(), p.slice) ?? startReview(p.slice, required);
  const review: ReviewState = { ...existing, required };
  // A new round only sees what reviewers submit after it began.
  deps.submissions.clear(p.slice);
  deps.state.update((s) => upsertReview(s, review));
  deps.state.update((s) => afterReviewRound(s, nextAction(review, p.snap.digest), p.slice));
  const refusal = startRefusal(review, p);
  if (refusal !== undefined) return refusal;

  const round = review.rounds.length + 1;
  const spawn = spawnPayload({
    slice: p.slice,
    round,
    lenses,
    range: p.range,
    model: resolveSlot(p.config.models, "reviewer", availableModels(ctx.modelRegistry)),
    now: deps.now?.() ?? new Date(),
  });
  const rangeArg = p.range === "HEAD" ? "" : ` and diffRange "${p.range}"`;
  return reply(
    [
      `${reviewLabel(review)}; round ${round}; diff ${p.snap.digest}. ${basis}`,
      `lenses: ${lenses.join(", ")}`,
      `Spawn the reviewer with agent_spawn using exactly this payload, then call devsys_review_record with slice "${p.slice}", diffDigest "${p.snap.digest}"${rangeArg}. The reviewer submits its result with devsys_submit_review, so pass no packets (only a markdown packet the reviewer returned instead goes in packets):`,
      JSON.stringify(spawn),
    ].join("\n"),
  );
}

/** `devsys_review_start`: Jev picks lenses for the diff; the reply carries the agent_spawn payload for a fresh reviewer. */
export function createReviewStartTool(
  deps: ReviewToolDeps,
): ToolDefinition<typeof StartParameters> {
  return {
    name: "devsys_review_start",
    label: "Start review round",
    description:
      "Begin a review round for a slice: computes the diff digest, chooses review lenses, and returns the agent_spawn payload for a fresh-context reviewer. Run that spawn, then call devsys_review_record (the reviewer submits its result with devsys_submit_review).",
    promptSnippet: "Start a fresh-context review round for a slice",
    parameters: StartParameters,
    exposure: "model-only",
    async execute(
      _id,
      params: Static<typeof StartParameters>,
      _signal,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      const prepared = await prepare(
        deps,
        ctx,
        params,
        (range, error) => `cannot read the diff for ${range}: ${error}`,
      );
      if (!prepared.ok) return prepared.reply;
      if (prepared.value.snap.stat.trim() === "")
        return reply(`the diff for ${prepared.value.range} is empty; nothing to review`, true);
      return startRound(deps, ctx, prepared.value);
    },
  };
}

const RecordParameters = Type.Object({
  slice: Type.Optional(
    Type.String({ description: "Slice reviewed; defaults to the active slice." }),
  ),
  packets: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Reviewer packets, verbatim markdown, for a reviewer that could not call devsys_submit_review. Results submitted through that tool for this round are read without being passed.",
    }),
  ),
  diffRange: Type.Optional(
    Type.String({ description: "The range that was reviewed; defaults to HEAD." }),
  ),
  diffDigest: Type.String({
    description:
      "The diff digest devsys_review_start reported for this round; the round is refused if the diff has changed since.",
  }),
});

async function adjusted(
  deps: ReviewToolDeps,
  ctx: ExtensionContext,
  findings: readonly Finding[],
  diffContext: string,
): Promise<{ findings: Finding[]; notes: string[] }> {
  const out: Finding[] = [];
  const notes: string[] = [];
  for (const f of findings) {
    const judged = await judgeSeverity(deps.jev(ctx), {
      finding: `[${f.severity}] ${f.lens} ${f.path ?? ""}${f.line === undefined ? "" : `:${f.line}`} — ${f.summary}`,
      diffContext,
    });
    const next = adoptSeverity(f, judged.ok ? judged.value : undefined);
    out.push(next.finding);
    if (next.note !== undefined) notes.push(next.note);
  }
  return { findings: out, notes };
}

const lensKey = (p: ReviewPacket): string => [...p.lenses].sort().join("\u0000");

/** Submitted results win over a markdown packet for the same lenses (a reviewer that did both). */
function mergeResults(
  markdown: readonly ReviewPacket[],
  submitted: readonly ReviewPacket[],
): { packets: ReviewPacket[]; dropped: number } {
  const taken = new Set(submitted.map(lensKey));
  const kept = markdown.filter((m) => !taken.has(lensKey(m)));
  return { packets: [...kept, ...submitted], dropped: markdown.length - kept.length };
}

/** Parses every packet, or the reply naming the first malformed one. */
function parsePackets(
  raw: readonly string[],
): { ok: true; value: ReviewPacket[] } | { ok: false; reply: Reply } {
  const packets: ReviewPacket[] = [];
  for (const [i, text] of raw.entries()) {
    const parsed = parseReviewPacket(text);
    if (isParseError(parsed))
      return { ok: false, reply: reply(`packet ${i + 1} is malformed: ${parsed.message}`, true) };
    packets.push(parsed);
  }
  return { ok: true, value: packets };
}

/** The refusal for a packet written for another slice or round, if there is one. */
function wrongPacket(packets: readonly ReviewPacket[], slice: SliceRef, expected: number) {
  const wrong = packets.findIndex((p) => p.round !== expected || p.slice !== slice);
  if (wrong === -1) return undefined;
  return reply(
    `packet ${wrong + 1} is for slice "${packets[wrong]?.slice}" round ${packets[wrong]?.round}; this is round ${expected} of slice "${slice}". A packet is recorded once, in the round it was written for; ask the reviewer for a packet with the right header.`,
    true,
  );
}

const countOf = (findings: readonly Finding[], sev: Finding["severity"]): number =>
  findings.filter((f) => f.severity === sev).length;

function recordSummary(
  review: ReviewState,
  findings: readonly Finding[],
  notes: readonly string[],
  p: Prepared,
): string {
  return [
    `Round ${review.rounds.length} recorded: ${countOf(findings, "blocking")} blocking, ${countOf(findings, "should-fix")} should-fix, ${countOf(findings, "nit")} nit, ${countOf(findings, "false-positive")} false-positive.`,
    reviewLabel(review),
    ...notes,
    ...nitLines(findings),
    `next: ${nextAction(review, p.snap.digest)}`,
    ...(p.range === "HEAD" ? [] : [GATE_RANGE_NOTE]),
  ].join("\n");
}

async function recordRound(
  deps: ReviewToolDeps,
  ctx: ExtensionContext,
  p: Prepared,
  packets: readonly ReviewPacket[],
): Promise<Reply> {
  const required = requiredRounds(p.config);
  const before = reviewOf(deps.state.get(), p.slice) ?? startReview(p.slice, required);
  const refusal = wrongPacket(packets, p.slice, before.rounds.length + 1);
  if (refusal !== undefined) return refusal;

  const merged = combinePackets(packets);
  const { findings, notes } = await adjusted(deps, ctx, merged.findings, p.snap.sample);
  const review = addRound(
    { ...before, required },
    {
      lenses: merged.lenses,
      findings,
      reviewedAt: (deps.now?.() ?? new Date()).toISOString(),
      diffDigest: p.snap.digest,
      files: p.snap.files,
    },
  );
  deps.state.update((s) => upsertReview(s, review));
  deps.state.update((s) => afterReviewRound(s, nextAction(review, p.snap.digest), p.slice));
  return reply(recordSummary(review, findings, notes, p));
}

/** `devsys_review_record`: parse packets, let Jev adjust severities, record the round. */
export function createReviewRecordTool(
  deps: ReviewToolDeps,
): ToolDefinition<typeof RecordParameters> {
  return {
    name: "devsys_review_record",
    label: "Record review round",
    description:
      "Record one review round from the reviewer's submitted result (or markdown packets): reads findings, lets Jev adjust severity when confident, and returns the clean-round count and the next action.",
    promptSnippet: "Record a reviewer packet as a review round",
    parameters: RecordParameters,
    exposure: "direct",
    async execute(
      _id,
      params: Static<typeof RecordParameters>,
      _signal,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      const slice = sliceOf(params.slice, deps.state);
      if (slice === undefined) return reply(NO_SLICE, true);
      const round = (reviewOf(deps.state.get(), slice)?.rounds.length ?? 0) + 1;
      const markdown = parsePackets(params.packets ?? []);
      if (!markdown.ok) {
        return deps.submissions.forRound(slice, round).length === 0
          ? markdown.reply
          : reply(
              `${replyText(markdown.reply)}. A submitted result for round ${round} is waiting: omit \`packets\` to record it.`,
              true,
            );
      }
      const { packets, dropped } = mergeResults(
        markdown.value,
        deps.submissions.forRound(slice, round),
      );
      if (packets.length === 0) return reply(NO_RESULT(slice, round), true);
      const prepared = await prepare(
        deps,
        ctx,
        params,
        (_range, error) => `cannot read the diff: ${error}`,
      );
      if (!prepared.ok) return prepared.reply;
      if (params.diffDigest !== prepared.value.snap.digest) {
        return reply(
          `the diff changed since the review started (reviewed ${params.diffDigest}, now ${prepared.value.snap.digest}); the reviewer did not see the current code. Run devsys_review_start again.`,
          true,
        );
      }
      const recorded = await recordRound(deps, ctx, prepared.value, packets);
      if (recorded.isError === true) return recorded;
      deps.submissions.clear(slice);
      return dropped === 0
        ? recorded
        : reply(
            `${replyText(recorded)}\nNote: ${dropped} markdown packet(s) for lenses already submitted were dropped; the submitted result is the one recorded.`,
          );
    },
  };
}
