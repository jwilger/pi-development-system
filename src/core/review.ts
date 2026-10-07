import { type ParseError, parseError, type SliceRef } from "./types.ts";

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
  /** Per-file digests of the reviewed diff, so a commit of part of it is still covered. */
  readonly files?: Readonly<Record<string, string>>;
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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseFinding(input: unknown): Finding | ParseError {
  if (!isRecord(input)) return parseError("finding must be an object");
  const { id, severity, lens, summary, path, line } = input;
  if (typeof id !== "string" || typeof lens !== "string" || typeof summary !== "string") {
    return parseError("finding needs string id, lens and summary");
  }
  if (!SEVERITIES.includes(severity as Severity)) {
    return parseError(`unknown severity: ${String(severity)}`);
  }
  if (path !== undefined && typeof path !== "string")
    return parseError("finding path must be a string");
  if (line !== undefined && typeof line !== "number")
    return parseError("finding line must be a number");
  return {
    id,
    lens,
    summary,
    severity: severity as Severity,
    ...(path !== undefined ? { path } : {}),
    ...(line !== undefined ? { line } : {}),
  };
}

function parseFiles(input: unknown): Record<string, string> | undefined | null {
  if (input === undefined) return undefined;
  if (!isRecord(input)) return null;
  const out: Record<string, string> = {};
  for (const [path, digest] of Object.entries(input)) {
    if (typeof digest !== "string") return null;
    out[path] = digest;
  }
  return out;
}

function parseRound(input: unknown): ReviewRound | ParseError {
  if (!isRecord(input)) return parseError("round must be an object");
  const { n, lenses, findings, reviewedAt, diffDigest } = input;
  if (typeof n !== "number" || typeof reviewedAt !== "string" || typeof diffDigest !== "string") {
    return parseError("round needs number n and string reviewedAt and diffDigest");
  }
  if (!Array.isArray(lenses) || !lenses.every((l) => typeof l === "string")) {
    return parseError("round lenses must be an array of strings");
  }
  if (!Array.isArray(findings)) return parseError("round findings must be an array");
  const parsed: Finding[] = [];
  for (const raw of findings) {
    const finding = parseFinding(raw);
    if ("kind" in finding) return finding;
    parsed.push(finding);
  }
  const files = parseFiles(input.files);
  if (files === null) return parseError("round files must map paths to digest strings");
  return {
    n,
    lenses: lenses as string[],
    findings: parsed,
    reviewedAt,
    diffDigest,
    ...(files === undefined ? {} : { files }),
  };
}

/** Boundary parse for a persisted review (one slice's rounds). */
export function parseReviewState(input: unknown): ReviewState | ParseError {
  if (!isRecord(input)) return parseError("review must be an object");
  const { slice, required, rounds } = input;
  if (typeof slice !== "string" || slice === "") return parseError("review slice must be a string");
  if (typeof required !== "number" || !Number.isInteger(required) || required < 1) {
    return parseError("review required must be an integer of at least 1");
  }
  if (!Array.isArray(rounds)) return parseError("review rounds must be an array");
  const parsed: ReviewRound[] = [];
  for (const raw of rounds) {
    const round = parseRound(raw);
    if ("kind" in round) return round;
    parsed.push(round);
  }
  return { slice: slice as SliceRef, required, rounds: parsed };
}
