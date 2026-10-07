import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import type { Exec } from "../core/exec.ts";
import { resolveSlot } from "../core/models.ts";
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
  renderFollowups,
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

export type ReviewToolDeps = {
  state: SessionState;
  jev: (ctx: ExtensionContext) => Jev;
  exec: Exec;
  now?: () => Date;
};

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

/** `devsys_review_start`: Jev picks lenses for the diff; the reply carries the agent_spawn payload for a fresh reviewer. */
export function createReviewStartTool(
  deps: ReviewToolDeps,
): ToolDefinition<typeof StartParameters> {
  return {
    name: "devsys_review_start",
    label: "Start review round",
    description:
      "Begin a review round for a slice: computes the diff digest, chooses review lenses, and returns the agent_spawn payload for a fresh-context reviewer. Run that spawn, then pass the reviewer's packet to devsys_review_record.",
    promptSnippet: "Start a fresh-context review round for a slice",
    parameters: StartParameters,
    exposure: "direct",
    async execute(
      _id,
      params: Static<typeof StartParameters>,
      _signal,
      _onUpdate,
      ctx: ExtensionContext,
    ) {
      const slice = sliceOf(params.slice, deps.state);
      if (slice === undefined) return reply(NO_SLICE, true);
      const config = await loadConfig(ctx.cwd);
      if (!config.ok) return reply(`${CONFIG_FILE}: ${config.error.message}`, true);
      const range = params.diffRange?.trim() || "HEAD";
      const snap = await snapshotDiff(deps.exec, ctx.cwd, range);
      if (!snap.ok) return reply(`cannot read the diff for ${range}: ${snap.error}`, true);
      if (snap.value.stat.trim() === "")
        return reply(`the diff for ${range} is empty; nothing to review`, true);

      const judged = await judgeLenses(deps.jev(ctx), {
        diffStat: snap.value.stat,
        diffSample: snap.value.sample,
        profiles: deps.state.get().profiles ?? [],
      });
      const selected = judged.ok ? selectLenses(judged.value) : [];
      const lenses = selected.length > 0 ? selected : [...DEFAULT_LENSES];
      const basis = judged.ok
        ? selected.length > 0
          ? "Jev chose the lenses."
          : "Jev found no specific lens; using the defaults."
        : `Jev unavailable (${judged.error.kind}); using the default lenses.`;

      const required = Math.max(
        config.value.review.requiredCleanRounds,
        config.value.review.minRounds,
      );
      const existing = reviewOf(deps.state.get(), slice) ?? startReview(slice, required);
      const review: ReviewState = { ...existing, required };
      deps.state.update((s) => upsertReview(s, review));
      const action = nextAction(review, snap.value.digest);
      if (action === "done") {
        return reply(
          `${reviewLabel(review)}. Review of ${slice} is already satisfied on this diff; nothing to run.`,
        );
      }

      if (action === "fix-findings") {
        return reply(
          `${reviewLabel(review)}. Round ${review.rounds.length} of ${slice} has blocking or should-fix findings and the diff has not changed since: fix them first, then start again. ` +
            "Re-running the review on unchanged code does not clear a finding. If a finding is wrong, record a `review.unsatisfied` departure with the evidence (devsys_record_departure).",
          true,
        );
      }

      const round = review.rounds.length + 1;
      const resolved = resolveSlot(
        config.value.models,
        "reviewer",
        availableModels(ctx.modelRegistry),
      );
      const spawn = {
        // A fresh path per attempt: a failed spawn must not leave a thread that blocks the retry.
        path: `/review-${pathSafe(slice)}-r${round}-${(deps.now?.() ?? new Date()).getTime().toString(36)}`,
        type: "reviewer",
        task: reviewerTask({ slice, round, lenses, diffRange: range }),
        ...(resolved.ok ? { model: resolved.value.model } : {}),
        thinkingLevel: "high",
        wait: true,
      };
      return reply(
        [
          `${reviewLabel(review)}; round ${round}; diff ${snap.value.digest}. ${basis}`,
          `lenses: ${lenses.join(", ")}`,
          `Spawn the reviewer with agent_spawn using exactly this payload, then pass its packet to devsys_review_record with diffDigest "${snap.value.digest}"${range === "HEAD" ? "" : ` and diffRange "${range}"`}:`,
          JSON.stringify(spawn),
        ].join("\n"),
      );
    },
  };
}

const RecordParameters = Type.Object({
  slice: Type.Optional(
    Type.String({ description: "Slice reviewed; defaults to the active slice." }),
  ),
  packets: Type.Array(Type.String(), {
    description: "Reviewer packets, verbatim markdown: one per lens reviewer, all for one round.",
  }),
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

/** `devsys_review_record`: parse packets, let Jev adjust severities, record the round, file the nits. */
export function createReviewRecordTool(
  deps: ReviewToolDeps,
): ToolDefinition<typeof RecordParameters> {
  return {
    name: "devsys_review_record",
    label: "Record review round",
    description:
      "Record one review round from the reviewer's packet(s): parses findings, lets Jev adjust severity when confident, files nits in docs/decisions/followups.md, and returns the clean-round count and the next action.",
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
      if (params.packets.length === 0)
        return reply("no packets: pass the reviewer's packet markdown in `packets`", true);
      const packets: ReviewPacket[] = [];
      for (const [i, raw] of params.packets.entries()) {
        const parsed = parseReviewPacket(raw);
        if (isParseError(parsed))
          return reply(`packet ${i + 1} is malformed: ${parsed.message}`, true);
        packets.push(parsed);
      }
      const config = await loadConfig(ctx.cwd);
      if (!config.ok) return reply(`${CONFIG_FILE}: ${config.error.message}`, true);
      const snap = await snapshotDiff(deps.exec, ctx.cwd, params.diffRange?.trim() || "HEAD");
      if (!snap.ok) return reply(`cannot read the diff: ${snap.error}`, true);

      if (params.diffDigest !== snap.value.digest) {
        return reply(
          `the diff changed since the review started (reviewed ${params.diffDigest}, now ${snap.value.digest}); the reviewer did not see the current code. Run devsys_review_start again.`,
          true,
        );
      }
      const required = Math.max(
        config.value.review.requiredCleanRounds,
        config.value.review.minRounds,
      );
      const before = reviewOf(deps.state.get(), slice) ?? startReview(slice, required);
      const expected = before.rounds.length + 1;
      const wrong = packets.findIndex((p) => p.round !== expected || p.slice !== slice);
      if (wrong !== -1) {
        return reply(
          `packet ${wrong + 1} is for slice "${packets[wrong]?.slice}" round ${packets[wrong]?.round}; this is round ${expected} of slice "${slice}". A packet is recorded once, in the round it was written for; ask the reviewer for a packet with the right header.`,
          true,
        );
      }

      const merged = combinePackets(packets);
      const { findings, notes } = await adjusted(deps, ctx, merged.findings, snap.value.sample);
      // File the nits first: if this fails nothing is recorded and a retry cannot count the round twice.
      const followups = renderFollowups(slice, expected, findings);
      let reviewed = snap.value;
      if (followups !== undefined) {
        try {
          const dir = join(ctx.cwd, "docs", "decisions");
          await mkdir(dir, { recursive: true });
          await appendFile(join(dir, "followups.md"), followups);
        } catch (cause) {
          return reply(
            `could not write docs/decisions/followups.md (${cause instanceof Error ? cause.message : String(cause)}); the round was not recorded, retry`,
            true,
          );
        }
        // The file is part of the work tree, so writing it changed the diff. The round covers the
        // reviewed code plus its own follow-up note; otherwise `done` would be stale on arrival.
        const after = await snapshotDiff(deps.exec, ctx.cwd, params.diffRange?.trim() || "HEAD");
        if (!after.ok)
          return reply(`cannot read the diff after filing follow-ups: ${after.error}`, true);
        reviewed = after.value;
      }
      const review = addRound(
        { ...before, required },
        {
          lenses: merged.lenses,
          findings,
          reviewedAt: (deps.now?.() ?? new Date()).toISOString(),
          diffDigest: reviewed.digest,
          files: reviewed.files,
        },
      );
      deps.state.update((s) => upsertReview(s, review));
      const counts = (sev: Finding["severity"]) =>
        findings.filter((f) => f.severity === sev).length;
      return reply(
        [
          `Round ${review.rounds.length} recorded: ${counts("blocking")} blocking, ${counts("should-fix")} should-fix, ${counts("nit")} nit, ${counts("false-positive")} false-positive.`,
          reviewLabel(review),
          ...notes,
          `next: ${nextAction(review, reviewed.digest)}`,
        ].join("\n"),
      );
    },
  };
}
