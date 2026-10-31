import {
  type ArchitectureBinding,
  type ArchitectureReceipt,
  acceptArchitectureReceipt,
  bindArchitectureReview,
  checkArchitectureReview,
  type ReviewerOrigin,
} from "../core/architecture-review.ts";
import type { ReviewState } from "../core/review.ts";
import { type ParseError, parseError } from "../core/types.ts";
import type { ArchitectureInspectionRequest } from "../state/architecture-history.ts";

/** Issued by the host before dispatch; the session file is pinned on first authenticated use. */
export interface ArchitectureDispatch {
  readonly rootId: string;
  readonly threadPath: string;
  readonly attemptId: string;
  readonly sessionFile?: string;
}
export interface PendingArchitectureReview {
  readonly binding: ArchitectureBinding;
  readonly expected: ArchitectureDispatch;
  readonly request?: ArchitectureInspectionRequest;
}
export interface ArchitectureSubmission {
  readonly evidence?: unknown;
  readonly sources: readonly string[];
  readonly origin?: ReviewerOrigin;
  readonly receipt?: ArchitectureReceipt;
  readonly refusal?: string;
}
export interface ArchitectureRound extends PendingArchitectureReview {
  readonly submissions: readonly ArchitectureSubmission[];
}

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
function dispatch(v: unknown): v is ArchitectureDispatch {
  return (
    record(v) &&
    nonempty(v.rootId) &&
    nonempty(v.attemptId) &&
    typeof v.threadPath === "string" &&
    /^\/review-[a-z0-9-]{1,57}$/.test(v.threadPath) &&
    (v.sessionFile === undefined || nonempty(v.sessionFile))
  );
}
function origin(v: unknown): v is ReviewerOrigin {
  return (
    record(v) &&
    nonempty(v.rootId) &&
    nonempty(v.threadPath) &&
    nonempty(v.attemptId) &&
    nonempty(v.sessionFile)
  );
}

export function parsePendingArchitecture(input: unknown): PendingArchitectureReview | ParseError {
  if (!(record(input) && dispatch(input.expected)))
    return parseError("invalid architecture dispatch");
  const binding = bindArchitectureReview(input.binding);
  if (!(binding.ok && record(input.binding)) || input.binding.identity !== binding.value.identity)
    return parseError("invalid architecture binding");
  const request = input.request;
  if (
    request !== undefined &&
    (!record(request) ||
      (request.kind !== "commit" && request.kind !== "delivery") ||
      (request.kind === "commit" && request.resulting !== undefined) ||
      (request.resulting !== undefined &&
        !(Array.isArray(request.resulting) && request.resulting.every(nonempty))) ||
      request.kind !== binding.value.boundary)
  )
    return parseError("invalid architecture inspection request");
  return {
    binding: binding.value,
    expected: { ...input.expected },
    ...(request === undefined ? {} : { request: request as ArchitectureInspectionRequest }),
  };
}

export function parseArchitectureRound(input: unknown): ArchitectureRound | ParseError {
  const pending = parsePendingArchitecture(input);
  if ("kind" in pending) return pending;
  if (!(record(input) && Array.isArray(input.submissions)))
    return parseError("invalid architecture submissions");
  const submissions: ArchitectureSubmission[] = [];
  for (const item of input.submissions) {
    const submission = parseSubmission(item, pending);
    if ("kind" in submission) return submission;
    submissions.push(submission);
  }
  return { ...pending, submissions };
}

function parseSubmission(
  item: unknown,
  pending: PendingArchitectureReview,
): ArchitectureSubmission | ParseError {
  if (
    !(
      record(item) &&
      Array.isArray(item.sources) &&
      item.sources.every((s) => typeof s === "string")
    ) ||
    (item.origin !== undefined && !origin(item.origin)) ||
    (item.refusal !== undefined && !nonempty(item.refusal))
  )
    return parseError("invalid architecture submission");
  let receipt: ArchitectureReceipt | undefined;
  if (item.receipt !== undefined) {
    if (
      !(record(item.receipt) && origin(item.origin) && origin(pending.expected)) ||
      item.refusal !== undefined
    )
      return parseError("invalid architecture receipt origin");
    const accepted = acceptArchitectureReceipt(
      pending.binding,
      item.evidence,
      item.origin,
      pending.expected,
    );
    const persisted = acceptArchitectureReceipt(
      pending.binding,
      item.receipt.evidence,
      origin(item.receipt.origin) ? item.receipt.origin : undefined,
      pending.expected,
    );
    if (
      !(accepted.ok && persisted.ok) ||
      JSON.stringify(accepted.value) !== JSON.stringify(persisted.value)
    )
      return parseError("invalid architecture receipt");
    receipt = accepted.value;
  } else if (item.refusal === undefined)
    return parseError("architecture submission needs receipt or refusal");
  return {
    sources: item.sources,
    ...(item.evidence === undefined ? {} : { evidence: item.evidence }),
    ...(origin(item.origin) ? { origin: item.origin } : {}),
    ...(typeof item.refusal === "string" ? { refusal: item.refusal } : {}),
    ...(receipt === undefined ? {} : { receipt }),
  };
}

/** No Git inspection or semantic truth claim: checks host-associated, exact-binding clean suffix only. */
export function architectureReviewGap(
  review: ReviewState | undefined,
  binding: ArchitectureBinding,
): string | undefined {
  const canonical = bindArchitectureReview(binding);
  if (!canonical.ok || canonical.value.identity !== binding.identity)
    return "architecture structural failure: invalid binding; semantic evidence cannot repair it.";
  if (review === undefined)
    return "architecture semantic evidence missing: start an independent exact-binding review.";
  const receipts: unknown[] = [];
  const expected: ReviewerOrigin[] = [];
  const attempts = new Set<string>();
  for (const round of review.rounds) {
    const metadata = round.architecture;
    const parsed = metadata === undefined ? undefined : parseArchitectureRound(metadata);
    const clean = round.findings.every(
      (f) => f.severity !== "blocking" && f.severity !== "should-fix",
    );
    if (parsed === undefined || "kind" in parsed) {
      receipts.length = 0;
      expected.length = 0;
      continue;
    }
    const usable =
      clean &&
      parsed.binding.identity === binding.identity &&
      origin(parsed.expected) &&
      parsed.submissions.length > 0 &&
      parsed.submissions.every((s) => s.receipt !== undefined && s.refusal === undefined);
    if (!(usable && origin(parsed.expected))) {
      // An interruption resets the clean suffix, including legacy rounds and refused semantic results.
      receipts.length = 0;
      expected.length = 0;
      continue;
    }
    const key = JSON.stringify([
      parsed.expected.rootId,
      parsed.expected.threadPath,
      parsed.expected.attemptId,
    ]);
    if (attempts.has(key)) {
      receipts.length = 0;
      expected.length = 0;
      continue;
    }
    attempts.add(key);
    receipts.push(parsed.submissions[0]?.receipt);
    expected.push(parsed.expected);
  }
  const checked = checkArchitectureReview(binding, receipts, expected, review.required);
  return checked.ok
    ? undefined
    : `architecture semantic evidence missing or stale (${checked.error.kind}): ${checked.error.message}`;
}
