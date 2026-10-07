import type { SliceRef } from "./types.ts";

/** Severity of one review finding. Only blocking and should-fix make a round unclean. */
export type Severity = "blocking" | "should-fix" | "nit" | "false-positive";

export const SEVERITIES: readonly Severity[] = ["blocking", "should-fix", "nit", "false-positive"];

export type Finding = {
  readonly id: string;
  readonly severity: Severity;
  readonly path?: string;
  readonly line?: number;
  readonly summary: string;
  readonly lens: string;
};

export type ReviewRound = {
  readonly n: number;
  readonly lenses: ReadonlyArray<string>;
  readonly findings: ReadonlyArray<Finding>;
  readonly reviewedAt: string;
  /** Digest of the diff the round reviewed (see `digestOf` in src/review/digest.ts). */
  readonly diffDigest: string;
};

export type ReviewState = {
  readonly slice: SliceRef;
  readonly rounds: ReadonlyArray<ReviewRound>;
  /** Consecutive clean rounds needed (config `review.required_clean_rounds`, at least `min_rounds`). */
  readonly required: number;
};

export type ReviewAction = "review" | "fix-findings" | "done" | "stale-diff";

export const isClean = (round: ReviewRound): boolean =>
  round.findings.every((f) => f.severity !== "blocking" && f.severity !== "should-fix");

/**
 * Trailing clean rounds. Real findings reset it; a changed diff alone does not, so a trivial fix
 * commit keeps the clean rounds already earned unless findings reappear (decision D11).
 */
export function cleanStreak(state: ReviewState): number {
  let streak = 0;
  for (let i = state.rounds.length - 1; i >= 0; i--) {
    const round = state.rounds[i];
    if (round === undefined || !isClean(round)) break;
    streak += 1;
  }
  return streak;
}

export const isSatisfied = (state: ReviewState): boolean =>
  state.rounds.length > 0 && cleanStreak(state) >= state.required;

/** What the coordinator should do next, given the digest of the diff as it is now. */
export function nextAction(state: ReviewState, diffDigestNow: string): ReviewAction {
  const last = state.rounds.at(-1);
  if (last === undefined) return "review";
  if (!isClean(last)) return last.diffDigest === diffDigestNow ? "fix-findings" : "review";
  if (!isSatisfied(state)) return "review";
  return last.diffDigest === diffDigestNow ? "done" : "stale-diff";
}

export const startReview = (slice: SliceRef, required: number): ReviewState => ({
  slice,
  required,
  rounds: [],
});

export const addRound = (state: ReviewState, round: Omit<ReviewRound, "n">): ReviewState => ({
  ...state,
  rounds: [...state.rounds, { ...round, n: state.rounds.length + 1 }],
});

/** Review lenses Jev can select (plan I6.2). A lens applies at probability ≥ LENS_THRESHOLD. */
export const LENSES = [
  "security",
  "concurrency",
  "types",
  "tests",
  "api-contract",
  "data-migration",
  "ux",
  "performance",
] as const;
export type Lens = (typeof LENSES)[number];
export const LENS_THRESHOLD = 0.5;

/** Lenses that apply when Jev is offline: the ones every change deserves. */
export const DEFAULT_LENSES: ReadonlyArray<Lens> = ["types", "tests"];

export const selectLenses = (probabilities: Readonly<Record<Lens, number>>): Lens[] =>
  LENSES.filter((lens) => probabilities[lens] >= LENS_THRESHOLD);
