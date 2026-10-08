import { assertNever } from "./exhaustive.ts";
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

/** Capped at the requirement: extra clean rounds (after a late change) are not progress past "done". */
export const reviewLabel = (review: ReviewState): string =>
  `review: ${Math.min(cleanStreak(review), review.required)}/${review.required} clean`;

/**
 * Why a commit on this slice lacks a satisfied review, or `undefined` when the review is complete
 * on the diff as it is now (the `review.unsatisfied` soft gate is raised from this).
 */
export type DiffNow = {
  readonly digest: string;
  readonly files?: Readonly<Record<string, string>>;
};

// The departure log is the system's own record (devsys_record_departure writes it), not work under review.
export const DECISION_LOG = /^docs\/decisions\/\d{4}-\d{2}\.md$/;

/** Every file in the current diff was in the last round's diff, byte for byte: a part of what was reviewed. */
const coveredByLastRound = (review: ReviewState, now: DiffNow): boolean => {
  const reviewed = review.rounds.at(-1)?.files;
  if (reviewed === undefined || now.files === undefined) return false;
  return Object.entries(now.files).every(
    ([path, digest]) => reviewed[path] === digest || DECISION_LOG.test(path),
  );
};

export function reviewGap(state: DevsysState, slice: SliceRef, now: DiffNow): string | undefined {
  const review = reviewOf(state, slice);
  if (review === undefined || review.rounds.length === 0) {
    return `no review has been recorded for slice ${slice}`;
  }
  const action = nextAction(review, now.digest);
  switch (action) {
    case "done":
      return undefined;
    case "fix-findings":
      return `the last review round of slice ${slice} has blocking or should-fix findings still to fix`;
    case "stale-diff":
      // Committing a reviewed change in parts leaves a smaller diff made only of reviewed files.
      if (coveredByLastRound(review, now)) return undefined;
      return `the diff has changed since slice ${slice} was last reviewed; review it again`;
    case "review":
      return `slice ${slice} has ${cleanStreak(review)}/${review.required} clean review rounds`;
    default:
      return assertNever(action);
  }
}

const ESCAPES: Record<string, string> = { t: "\t", n: "\n", '"': '"', "\\": "\\" };

/** Undo git's C-style quoting of a path (`\"`, `\\`, `\t`, `\n`; octal bytes were already turned off with quotePath=false). */
const unquote = (path: string): string =>
  path.replace(/\\([tn"\\])/g, (_m, c: string) => ESCAPES[c] ?? c);

/** A unified diff cut into one text per file, keyed by the file's new path. */
export function splitDiffByFile(diff: string): Record<string, string> {
  const out: Record<string, string> = {};
  let path: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    if (path !== undefined) out[path] = lines.join("\n");
  };
  // git ends its output with a newline: drop it so the last section digests like any other.
  for (const line of diff.replace(/\n$/, "").split("\n")) {
    // Git quotes unusual paths ("b/na\303\257ve.md"); strip the quotes rather than lose the section.
    // Without renames both sides are the same path, which pins a path that contains " b/".
    const header =
      /^diff --git ("?)a\/(.*)\1 \1b\/\2\1$/.exec(line)?.[2] ??
      /^diff --git "?a\/.*?"? "?b\/(.*?)"?$/.exec(line)?.[1];
    if (header !== undefined) {
      flush();
      path = unquote(header);
      lines = [];
    }
    lines.push(line);
  }
  flush();
  return out;
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
const SEVERITY_ADOPT_CONFIDENCE = 0.8;

const counts = (severity: Severity): boolean =>
  severity === "blocking" || severity === "should-fix";

/**
 * Take Jev's severity only when it is confident and different, and never to lower a finding that
 * counts (blocking/should-fix) to one that does not: Jev reads a clipped diff, the reviewer read
 * the code. That disagreement is reported as a suggestion and the reviewer's severity stands.
 */
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
  const confidence = judged.confidence.toFixed(2);
  if (counts(finding.severity) && !counts(judged.severity)) {
    return {
      finding,
      note: `${finding.id}: Jev suggests ${judged.severity} instead of ${finding.severity} (confidence ${confidence}); the reviewer's severity stands, re-check the finding yourself`,
    };
  }
  return {
    finding: { ...finding, severity: judged.severity },
    note: `${finding.id}: Jev moved severity ${finding.severity} → ${judged.severity} (confidence ${confidence})`,
  };
}

const where = (f: Finding): string => {
  if (f.path === undefined) return "";
  const line = f.line === undefined ? "" : `:${f.line}`;
  return ` \`${f.path}${line}\``;
};

/**
 * Nits are never stored. Each is reported back so the coordinator fixes it now or drops it
 * with a stated reason; a finding nobody will act on is not worth recording.
 */
export function nitLines(findings: readonly Finding[]): string[] {
  const nits = findings.filter((f) => f.severity === "nit");
  if (nits.length === 0) return [];
  return [
    "Nits are not stored anywhere: fix each now, or drop it and say why in your reply.",
    ...nits.map((f) => `- nit ${f.lens}${where(f)} — ${f.summary}`),
  ];
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
    `See the change with \`git diff ${input.diffRange}\` (and \`git diff --stat ${input.diffRange}\`), plus any untracked files listed by \`git ls-files --others --exclude-standard\` (git diff does not show them; read them directly). Read the callers, callees and tests it depends on, no more.`,
    "Do not modify files; report demonstrable defects with a realistic trigger and the smallest local repair.",
    "Return exactly the review packet from your instructions, with exactly this header (slice and round must not change):",
    "",
    `## Review — ${input.slice} — round ${input.round} — lenses: ${lenses}`,
    "### Sources inspected",
    "- <path:line ranges>",
    "### Findings",
    "- [blocking|should-fix|nit] <lens> `<path>:<line>` — <one sentence> — <why it matters>",
    "### Verdict",
    "no-blocking | blocking",
    "",
    "Severity: blocking = demonstrable defect or broken non-negotiable; should-fix = real defect or missing test with a realistic trigger; nit = style or report-only. The verdict is `blocking` when any finding is blocking or should-fix, otherwise `no-blocking`. With zero findings (a valid result) write `- none` under Findings. Findings holds only finding lines: put what you checked and refuted under Sources inspected or after the verdict.",
  ].join("\n");
}
