import {
  cleanStreak,
  type Finding,
  nextAction,
  type ReviewState,
  type Severity,
} from "./review.ts";
import type { ReviewPacket } from "./review-packet.ts";
import type { DevsysState, SliceRef } from "./types.ts";

/** Pure helpers around review state; the tools in src/review do the I/O. */

export const reviewOf = (state: DevsysState, slice: SliceRef): ReviewState | undefined =>
  state.reviews?.find((r) => r.slice === slice);

export const upsertReview = (state: DevsysState, review: ReviewState): DevsysState => {
  const others = (state.reviews ?? []).filter((r) => r.slice !== review.slice);
  return { ...state, reviews: [...others, review] };
};

export const reviewLabel = (review: ReviewState): string =>
  `review: ${cleanStreak(review)}/${review.required} clean`;

/**
 * Why a commit on this slice lacks a satisfied review, or `undefined` when the review is complete
 * on the diff as it is now (the `review.unsatisfied` soft gate is raised from this).
 */
export function reviewGap(
  state: DevsysState,
  slice: SliceRef,
  digestNow: string,
): string | undefined {
  const review = reviewOf(state, slice);
  if (review === undefined || review.rounds.length === 0) {
    return `no review has been recorded for slice ${slice}`;
  }
  switch (nextAction(review, digestNow)) {
    case "done":
      return undefined;
    case "fix-findings":
      return `the last review round of slice ${slice} has blocking or should-fix findings still to fix`;
    case "stale-diff":
      return `the diff has changed since slice ${slice} was last reviewed; review it again`;
    case "review":
      return `slice ${slice} has ${cleanStreak(review)}/${review.required} clean review rounds`;
  }
}

/** Packets from several lens reviewers in one round become one round of findings. */
export function combinePackets(packets: readonly ReviewPacket[]): {
  lenses: string[];
  findings: Finding[];
} {
  const lenses = [...new Set(packets.flatMap((p) => p.lenses))];
  const findings = packets.flatMap((packet, p) =>
    packet.findings.map((f) => ({ ...f, id: `${f.id}.${p + 1}` })),
  );
  return { lenses, findings };
}

/** Jev confidence needed before its severity replaces the reviewer's. */
export const SEVERITY_ADOPT_CONFIDENCE = 0.8;

/** Take Jev's severity only when it is confident and different; say what moved so it is never silent. */
export function adoptSeverity(
  finding: Finding,
  judged: { severity: Severity; confidence: number } | undefined,
): { finding: Finding; note?: string } {
  if (
    judged === undefined ||
    judged.confidence < SEVERITY_ADOPT_CONFIDENCE ||
    judged.severity === finding.severity
  ) {
    return { finding };
  }
  return {
    finding: { ...finding, severity: judged.severity },
    note: `${finding.id}: Jev moved severity ${finding.severity} → ${judged.severity} (confidence ${judged.confidence.toFixed(2)})`,
  };
}

const where = (f: Finding): string =>
  f.path === undefined ? "" : ` \`${f.path}${f.line === undefined ? "" : `:${f.line}`}\``;

/** The nits of a round, as a section for docs/decisions/followups.md. */
export function renderFollowups(
  slice: SliceRef,
  round: number,
  findings: readonly Finding[],
): string | undefined {
  const nits = findings.filter((f) => f.severity === "nit");
  if (nits.length === 0) return undefined;
  const lines = nits.map((f) => `- ${f.lens}${where(f)} — ${f.summary}`);
  return `\n## From ${slice} review round ${round}\n\n${lines.join("\n")}\n`;
}

/** The task text for a fresh reviewer: slice, lenses, how to see the diff, and the packet to return. */
export function reviewerTask(input: {
  slice: SliceRef;
  round: number;
  lenses: readonly string[];
  diffRange: string;
}): string {
  const lenses = input.lenses.join(", ");
  return [
    `Review slice ${input.slice}, round ${input.round}, through these lenses: ${lenses}.`,
    `See the change with \`git diff ${input.diffRange}\` (and \`git diff --stat ${input.diffRange}\`). Read the callers, callees and tests it depends on, no more.`,
    "Do not modify files; report demonstrable defects with a realistic trigger and the smallest local repair.",
    "Return exactly the review packet from your instructions:",
    "",
    `## Review — ${input.slice} — round ${input.round} — lenses: ${lenses}`,
    "### Sources inspected",
    "- <path:line ranges>",
    "### Findings",
    "- [blocking|should-fix|nit] <lens> `<path>:<line>` — <one sentence> — <why it matters>",
    "### Verdict",
    "no-blocking | blocking",
    "",
    "Severity: blocking = demonstrable defect or broken non-negotiable; should-fix = real defect or missing test with a realistic trigger; nit = style or report-only. Zero findings is a valid result.",
  ].join("\n");
}
