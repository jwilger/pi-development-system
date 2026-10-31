import { createHash } from "node:crypto";
import { err, ok, type Result } from "./result.ts";
import type { Severity } from "./review.ts";

export type ArchitectureUnit =
  | { readonly kind: "commit"; readonly objectId: string }
  | { readonly kind: "staged-tree"; readonly objectId: string };

export interface ArchitectureBindingInput {
  readonly version: 1;
  readonly boundary: "commit" | "delivery";
  readonly adoption: { readonly trunkRef: string; readonly adoptedAt: string };
  readonly authority: string;
  readonly head: string;
  readonly tree: string;
  readonly source: readonly ArchitectureUnit[];
  readonly resulting: readonly ArchitectureUnit[];
}

export interface ArchitectureBinding extends ArchitectureBindingInput {
  readonly identity: string;
}

export interface ReviewerOrigin {
  readonly rootId: string;
  readonly threadPath: string;
  readonly sessionFile: string;
  readonly attemptId: string;
}

interface ArchitectureSourceReference {
  readonly objectId: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface ArchitectureSemanticCheck {
  readonly status: "satisfied" | "violated" | "not-applicable";
  readonly explanation: string;
  readonly sources: readonly ArchitectureSourceReference[];
}

interface ArchitectureUnitEvidence {
  readonly scope: "source" | "resulting";
  readonly unit: ArchitectureUnit;
  readonly checks: {
    readonly correspondence: ArchitectureSemanticCheck;
    readonly currentAuthority: ArchitectureSemanticCheck;
    readonly significance: ArchitectureSemanticCheck;
    readonly rationalePreservation: ArchitectureSemanticCheck;
    readonly reconsideration: ArchitectureSemanticCheck;
    readonly sequentialIntroduction: ArchitectureSemanticCheck;
  };
}

/** Model-authored assertions, never a source of reviewer origin or semantic truth. */
export interface ArchitectureSemanticEvidence {
  readonly bindingIdentity: string;
  readonly units: readonly ArchitectureUnitEvidence[];
  readonly findings: readonly { readonly severity: Severity; readonly summary: string }[];
  readonly verdict: "no-blocking" | "blocking";
}

/** Only the host may associate this evidence with an independently established origin. */
export interface ArchitectureReceipt {
  readonly evidence: ArchitectureSemanticEvidence;
  readonly origin: ReviewerOrigin;
}

/**
 * Proposed clean-receipt eligibility boundary: origin comes only from the host,
 * expectation from its dispatch record, and neither is authenticated here.
 * Syntactically concrete citations and asserted satisfaction do not establish semantic truth.
 */
export function acceptArchitectureReceipt(
  binding: ArchitectureBinding,
  evidence: unknown,
  hostOrigin: ReviewerOrigin | undefined,
  expectedReviewer: ReviewerOrigin | undefined,
): Result<ArchitectureReceipt, ArchitectureReviewError> {
  const canonical = bindArchitectureReview(binding);
  if (!canonical.ok) return canonical;
  if (canonical.value.identity !== binding.identity)
    return err({
      kind: "invalid-binding",
      message: "Binding identity does not match its canonical data.",
    });
  if (
    !(isOrigin(hostOrigin) && isOrigin(expectedReviewer)) ||
    hostOrigin.rootId !== expectedReviewer.rootId ||
    hostOrigin.threadPath !== expectedReviewer.threadPath ||
    hostOrigin.sessionFile !== expectedReviewer.sessionFile ||
    hostOrigin.attemptId !== expectedReviewer.attemptId
  ) {
    return err({
      kind: "reviewer-origin-mismatch",
      message: "Host origin must match the independently expected child reviewer and attempt.",
    });
  }
  if (!isEvidence(evidence)) {
    return err({
      kind: "semantic-evidence-required",
      message: "Independent exact-binding semantic evidence is required.",
    });
  }
  if (evidence.bindingIdentity !== binding.identity)
    return err({
      kind: "stale-binding",
      message: "Evidence does not identify this exact binding.",
    });
  const expected = new Set([
    ...binding.source.map((unit) => `source:${unitKey(unit)}`),
    ...binding.resulting.map((unit) => `resulting:${unitKey(unit)}`),
  ]);
  const actual = evidence.units.map((item) => `${item.scope}:${unitKey(item.unit)}`);
  if (
    actual.length !== expected.size ||
    new Set(actual).size !== actual.length ||
    actual.some((key) => !expected.has(key))
  ) {
    return err({
      kind: "unit-coverage-mismatch",
      message: "Evidence must cover every scoped unit exactly once and no others.",
    });
  }
  if (evidence.units.some((item) => item.checks.currentAuthority.status === "not-applicable")) {
    return err({
      kind: "current-authority-required",
      message: "Current authority must be evaluated for every unit.",
    });
  }
  if (
    evidence.units.some((item) =>
      checkNames.some((name) => item.checks[name].status === "violated"),
    )
  ) {
    return err({
      kind: "semantic-check-violated",
      message: "A reviewer reports a violated semantic check.",
    });
  }
  if (
    evidence.verdict === "blocking" ||
    evidence.findings.some(
      (finding) => finding.severity === "blocking" || finding.severity === "should-fix",
    )
  ) {
    return err({
      kind: "serious-findings",
      message: "Unresolved blocking or should-fix findings refuse clean credit.",
    });
  }
  return ok(
    Object.freeze({
      evidence: snapshotEvidence(evidence),
      origin: Object.freeze({
        rootId: hostOrigin.rootId,
        threadPath: hostOrigin.threadPath,
        sessionFile: hostOrigin.sessionFile,
        attemptId: hostOrigin.attemptId,
      }),
    }),
  );
}

export interface ArchitectureReviewError {
  readonly kind:
    | "semantic-evidence-required"
    | "invalid-binding"
    | "stale-binding"
    | "unit-coverage-mismatch"
    | "reviewer-origin-mismatch"
    | "current-authority-required"
    | "semantic-check-violated"
    | "serious-findings"
    | "clean-depth-insufficient"
    | "invalid-clean-depth";
  readonly message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const objectId = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const isUnit = (value: unknown): value is ArchitectureUnit =>
  isRecord(value) &&
  (value.kind === "commit" || value.kind === "staged-tree") &&
  objectId(value.objectId);
const unitKey = (unit: ArchitectureUnit): string => `${unit.kind}:${unit.objectId}`;
const isUnits = (value: unknown): value is readonly ArchitectureUnit[] =>
  Array.isArray(value) &&
  [...value].every(isUnit) &&
  new Set(value.map(unitKey)).size === value.length;

const checkNames = [
  "correspondence",
  "currentAuthority",
  "significance",
  "rationalePreservation",
  "reconsideration",
  "sequentialIntroduction",
] as const;

function snapshotCheck(check: ArchitectureSemanticCheck): ArchitectureSemanticCheck {
  return Object.freeze({
    status: check.status,
    explanation: check.explanation,
    sources: Object.freeze(
      check.sources.map((source) =>
        Object.freeze({
          objectId: source.objectId,
          path: source.path,
          startLine: source.startLine,
          endLine: source.endLine,
        }),
      ),
    ),
  });
}

function snapshotEvidence(evidence: ArchitectureSemanticEvidence): ArchitectureSemanticEvidence {
  return Object.freeze({
    bindingIdentity: evidence.bindingIdentity,
    units: Object.freeze(
      evidence.units.map((item) =>
        Object.freeze({
          scope: item.scope,
          unit: Object.freeze({ kind: item.unit.kind, objectId: item.unit.objectId }),
          checks: Object.freeze({
            correspondence: snapshotCheck(item.checks.correspondence),
            currentAuthority: snapshotCheck(item.checks.currentAuthority),
            significance: snapshotCheck(item.checks.significance),
            rationalePreservation: snapshotCheck(item.checks.rationalePreservation),
            reconsideration: snapshotCheck(item.checks.reconsideration),
            sequentialIntroduction: snapshotCheck(item.checks.sequentialIntroduction),
          }),
        }),
      ),
    ),
    findings: Object.freeze(
      evidence.findings.map((finding) =>
        Object.freeze({
          severity: finding.severity,
          summary: finding.summary,
        }),
      ),
    ),
    verdict: evidence.verdict,
  });
}

function isOrigin(value: unknown): value is ReviewerOrigin {
  return (
    isRecord(value) &&
    nonempty(value.rootId) &&
    nonempty(value.sessionFile) &&
    nonempty(value.attemptId) &&
    typeof value.threadPath === "string" &&
    value.threadPath !== "/root" &&
    /^\/(?:[^/\s]+)(?:\/[^/\s]+)*$/.test(value.threadPath) &&
    value.threadPath.split("/").every((part) => part !== "." && part !== "..")
  );
}

function isReference(value: unknown): value is ArchitectureSourceReference {
  return (
    isRecord(value) &&
    objectId(value.objectId) &&
    nonempty(value.path) &&
    typeof value.startLine === "number" &&
    Number.isInteger(value.startLine) &&
    value.startLine > 0 &&
    typeof value.endLine === "number" &&
    Number.isInteger(value.endLine) &&
    value.endLine >= value.startLine
  );
}

function isCheck(value: unknown): value is ArchitectureSemanticCheck {
  return (
    isRecord(value) &&
    (value.status === "satisfied" ||
      value.status === "violated" ||
      value.status === "not-applicable") &&
    nonempty(value.explanation) &&
    Array.isArray(value.sources) &&
    value.sources.length > 0 &&
    [...value.sources].every(isReference)
  );
}

function isUnitEvidence(value: unknown): value is ArchitectureUnitEvidence {
  if (!(isRecord(value) && isRecord(value.checks))) return false;
  const checks = value.checks;
  return (
    (value.scope === "source" || value.scope === "resulting") &&
    isUnit(value.unit) &&
    checkNames.every((name) => isCheck(checks[name]))
  );
}

function isFinding(value: unknown): value is ArchitectureSemanticEvidence["findings"][number] {
  return (
    isRecord(value) &&
    nonempty(value.summary) &&
    (value.severity === "blocking" ||
      value.severity === "should-fix" ||
      value.severity === "nit" ||
      value.severity === "false-positive")
  );
}

function isEvidence(value: unknown): value is ArchitectureSemanticEvidence {
  return (
    isRecord(value) &&
    nonempty(value.bindingIdentity) &&
    Array.isArray(value.units) &&
    [...value.units].every(isUnitEvidence) &&
    Array.isArray(value.findings) &&
    [...value.findings].every(isFinding) &&
    (value.verdict === "no-blocking" || value.verdict === "blocking")
  );
}

function isBindingInput(value: unknown): value is ArchitectureBindingInput {
  return (
    isRecord(value) &&
    value.version === 1 &&
    (value.boundary === "commit" || value.boundary === "delivery") &&
    isRecord(value.adoption) &&
    nonempty(value.adoption.trunkRef) &&
    objectId(value.adoption.adoptedAt) &&
    objectId(value.authority) &&
    objectId(value.head) &&
    objectId(value.tree) &&
    isUnits(value.source) &&
    isUnits(value.resulting)
  );
}

/** Proposed v1 contract. Host establishes history completeness and object kinds before binding. */
export function bindArchitectureReview(
  input: unknown,
): Result<ArchitectureBinding, ArchitectureReviewError> {
  if (!isBindingInput(input))
    return err({
      kind: "invalid-binding",
      message:
        "Binding requires v1 boundary data, full object identities and distinct units in each scope.",
    });
  const identity = createHash("sha256")
    .update("pi-development-system/architecture-semantic-review\u0000")
    .update(
      JSON.stringify([
        input.version,
        input.boundary,
        [input.adoption.trunkRef, input.adoption.adoptedAt],
        input.authority,
        input.head,
        input.tree,
        input.source.map((unit) => [unit.kind, unit.objectId]),
        input.resulting.map((unit) => [unit.kind, unit.objectId]),
      ]),
    )
    .digest("hex");
  const units = (values: readonly ArchitectureUnit[]) =>
    Object.freeze(
      values.map((unit) => Object.freeze({ kind: unit.kind, objectId: unit.objectId })),
    );
  return ok(
    Object.freeze({
      version: input.version,
      boundary: input.boundary,
      adoption: Object.freeze({
        trunkRef: input.adoption.trunkRef,
        adoptedAt: input.adoption.adoptedAt,
      }),
      authority: input.authority,
      head: input.head,
      tree: input.tree,
      source: units(input.source),
      resulting: units(input.resulting),
      identity,
    }),
  );
}

/**
 * Proposed eligibility check, not origin authentication or semantic judgment.
 * Expected reviewers are host-owned, chronological and aligned with receipt indices;
 * the host must establish independent ownership and distinct dispatch attempts.
 * Malformed/legacy receipts interrupt credit; earlier interruptions cannot erase a clean suffix.
 */
export function checkArchitectureReview(
  binding: ArchitectureBinding,
  receipts: readonly unknown[],
  expectedReviewers: readonly ReviewerOrigin[],
  requiredCleanDepth: number,
): Result<{ readonly cleanDepth: number }, ArchitectureReviewError> {
  if (!Number.isInteger(requiredCleanDepth) || requiredCleanDepth < 1)
    return err({
      kind: "invalid-clean-depth",
      message: "Required clean depth must be a positive integer.",
    });
  if (receipts.length === 0)
    return err({
      kind: "semantic-evidence-required",
      message: "Independent exact-binding semantic evidence is required.",
    });
  let cleanDepth = 0;
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const receipt = receipts[index];
    let accepted: Result<ArchitectureReceipt, ArchitectureReviewError>;
    if (!(isRecord(receipt) && "evidence" in receipt)) {
      accepted = err({
        kind: "semantic-evidence-required",
        message:
          "A host-associated semantic receipt is required; legacy review text gives no credit.",
      });
    } else {
      accepted = acceptArchitectureReceipt(
        binding,
        receipt.evidence,
        isOrigin(receipt.origin) ? receipt.origin : undefined,
        expectedReviewers[index],
      );
    }
    if (!accepted.ok) {
      if (cleanDepth === 0) return accepted;
      break;
    }
    cleanDepth += 1;
  }
  if (cleanDepth < requiredCleanDepth)
    return err({
      kind: "clean-depth-insufficient",
      message: "More consecutive eligible clean semantic receipts are required.",
    });
  return ok({ cleanDepth });
}
