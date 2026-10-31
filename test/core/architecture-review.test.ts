import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  type ArchitectureBinding,
  type ArchitectureBindingInput,
  type ArchitectureSemanticCheck,
  type ArchitectureSemanticEvidence,
  acceptArchitectureReceipt,
  bindArchitectureReview,
  checkArchitectureReview,
  type ReviewerOrigin,
} from "../../src/core/architecture-review.ts";

// Test list: absent receipts; immutable exact identities; evidence shape/coverage;
// host provenance and attempt matching; semantic violations/findings; trailing depth.
const oid = (digit: string): string => digit.repeat(40);
const input = (): ArchitectureBindingInput => ({
  version: 1,
  boundary: "commit",
  adoption: { trunkRef: "refs/heads/main", adoptedAt: oid("a") },
  authority: oid("b"),
  head: oid("c"),
  tree: oid("d"),
  source: [{ kind: "commit", objectId: oid("e") }],
  resulting: [{ kind: "staged-tree", objectId: oid("d") }],
});
const binding = (value = input()): ArchitectureBinding => {
  const result = bindArchitectureReview(value);
  // Diagnostics for a broken test fixture, not an expected domain failure.
  if (!result.ok) throw new Error(`Invalid binding fixture: ${result.error.message}`);
  return result.value;
};

test("canonical identities bind every boundary field and ordered, scoped, explicitly typed unit", () => {
  const original = input();
  const base = binding(original);
  const expected = createHash("sha256")
    .update("pi-development-system/architecture-semantic-review\u0000")
    .update(
      JSON.stringify([
        1,
        "commit",
        ["refs/heads/main", oid("a")],
        oid("b"),
        oid("c"),
        oid("d"),
        [["commit", oid("e")]],
        [["staged-tree", oid("d")]],
      ]),
    )
    .digest("hex");
  assert.equal(base.identity, expected);
  assert.equal(
    binding({ ...original, adoption: { adoptedAt: oid("a"), trunkRef: "refs/heads/main" } })
      .identity,
    expected,
  );
  const variants: ArchitectureBindingInput[] = [
    { ...original, boundary: "delivery" },
    { ...original, adoption: { ...original.adoption, trunkRef: "refs/heads/trunk" } },
    { ...original, adoption: { ...original.adoption, adoptedAt: oid("f") } },
    { ...original, authority: oid("f") },
    { ...original, head: oid("f") },
    { ...original, tree: oid("f") },
    { ...original, source: [] },
    { ...original, resulting: [] },
    { ...original, source: original.resulting, resulting: original.source },
    { ...original, resulting: [{ kind: "commit", objectId: oid("d") }] },
  ];
  for (const variant of variants) assert.notEqual(binding(variant).identity, base.identity);
  const two = {
    ...original,
    source: [...original.source, { kind: "commit" as const, objectId: oid("f") }],
  };
  assert.notEqual(
    binding(two).identity,
    binding({ ...two, source: [...two.source].reverse() }).identity,
  );
});

test("a valid binding without accepted semantic receipts refuses approval", () => {
  const result = checkArchitectureReview(binding(), [], [], 1);
  assert.deepEqual(result, {
    ok: false,
    error: {
      kind: "semantic-evidence-required",
      message: "Independent exact-binding semantic evidence is required.",
    },
  });
});

test("binding retains a deeply frozen snapshot instead of caller-owned adoption and units", () => {
  const adoption = { trunkRef: "refs/heads/main", adoptedAt: oid("a") };
  const unit = { kind: "commit" as const, objectId: oid("e") };
  const source = [unit];
  const resulting = [{ kind: "staged-tree" as const, objectId: oid("d") }];
  const value = binding({ ...input(), adoption, source, resulting });
  adoption.adoptedAt = oid("f");
  unit.objectId = oid("f");
  source.push({ kind: "commit", objectId: oid("a") });
  resulting.pop();
  assert.equal(value.adoption.adoptedAt, oid("a"));
  assert.deepEqual(value.source, [{ kind: "commit", objectId: oid("e") }]);
  assert.deepEqual(value.resulting, [{ kind: "staged-tree", objectId: oid("d") }]);
  for (const part of [
    value,
    value.adoption,
    value.source,
    value.source[0],
    value.resulting,
    value.resulting[0],
  ]) {
    assert.equal(Object.isFrozen(part), true);
  }
  assert.equal(value.identity, binding().identity);
});

test("invalid binding data returns a typed refusal rather than hashing ambiguous identities", () => {
  const invalid: unknown[] = [
    null,
    {},
    { ...input(), version: 2 },
    { ...input(), boundary: "push" },
    { ...input(), adoption: { trunkRef: "", adoptedAt: oid("a") } },
    { ...input(), adoption: { trunkRef: "main", adoptedAt: "short" } },
    ...["authority", "head", "tree"].map((key) => ({ ...input(), [key]: "HEAD" })),
    { ...input(), source: [{ kind: "tree", objectId: oid("e") }] },
    { ...input(), source: [{ kind: "commit", objectId: "short" }] },
    { ...input(), source: [...input().source, ...input().source] },
    { ...input(), source: new Array(1) },
    { ...input(), resulting: new Array(1) },
  ];
  for (const value of invalid) {
    const result = bindArchitectureReview(value);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "invalid-binding");
  }
});

const origin = (attemptId = "attempt-1"): ReviewerOrigin => ({
  rootId: "root-session",
  threadPath: "/root/reviewer",
  sessionFile: "/sessions/reviewer.jsonl",
  attemptId,
});
const check = (
  status: ArchitectureSemanticCheck["status"] = "satisfied",
): ArchitectureSemanticCheck => ({
  status,
  explanation:
    "The cited current architecture states the introduced constraint independently of ADR history.",
  sources: [{ objectId: oid("d"), path: "ARCHITECTURE.md", startLine: 1, endLine: 4 }],
});
const evidence = (value = binding()): ArchitectureSemanticEvidence => ({
  bindingIdentity: value.identity,
  units: (["source", "resulting"] as const).flatMap((scope) =>
    value[scope].map((unit) => ({
      scope,
      unit,
      checks: {
        correspondence: check(),
        currentAuthority: check(),
        significance: check(),
        rationalePreservation: check(),
        reconsideration: check(),
        sequentialIntroduction: check(),
      },
    })),
  ),
  findings: [],
  verdict: "no-blocking",
});

test("complete explained semantic assertions can be retained with separately supplied host origin", () => {
  const bound = binding();
  const supplied = evidence(bound);
  const result = acceptArchitectureReceipt(bound, supplied, origin(), origin());
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { evidence: supplied, origin: origin() });
});

test("evidence must exactly cover every scoped source and resulting unit without duplicates or extras", () => {
  const bound = binding({ ...input(), resulting: input().source });
  const supplied = evidence(bound);
  const first = supplied.units[0];
  assert.ok(first);
  const cases: Array<[ArchitectureSemanticEvidence, string]> = [
    [
      { ...supplied, bindingIdentity: binding({ ...input(), head: oid("f") }).identity },
      "stale-binding",
    ],
    [{ ...supplied, units: [] }, "unit-coverage-mismatch"],
    [{ ...supplied, units: [first] }, "unit-coverage-mismatch"],
    [{ ...supplied, units: [...supplied.units, first] }, "unit-coverage-mismatch"],
    [{ ...supplied, units: [first, first] }, "unit-coverage-mismatch"],
    [
      {
        ...supplied,
        units: [...supplied.units, { ...first, unit: { kind: "commit", objectId: oid("f") } }],
      },
      "unit-coverage-mismatch",
    ],
    [
      {
        ...supplied,
        units: supplied.units.map((unit) => ({
          ...unit,
          unit: { kind: "staged-tree", objectId: unit.unit.objectId },
        })),
      },
      "unit-coverage-mismatch",
    ],
  ];
  assert.equal(acceptArchitectureReceipt(bound, supplied, origin(), origin()).ok, true);
  for (const [value, kind] of cases) {
    const result = acceptArchitectureReceipt(bound, value, origin(), origin());
    assert.equal(result.ok, false, kind);
    if (!result.ok) assert.equal(result.error.kind, kind);
  }
});

test("model text and model-supplied origin cannot replace independently expected child ownership", () => {
  const bound = binding();
  const supplied = { ...evidence(bound), origin: origin() };
  const cases: Array<[unknown, ReviewerOrigin | undefined, ReviewerOrigin, string]> = [
    [supplied, undefined, origin(), "reviewer-origin-mismatch"],
    [supplied, { ...origin(), threadPath: "/root" }, origin(), "reviewer-origin-mismatch"],
    [
      supplied,
      { ...origin(), threadPath: "/root/unrelated" },
      origin(),
      "reviewer-origin-mismatch",
    ],
    [supplied, { ...origin(), rootId: "other-root" }, origin(), "reviewer-origin-mismatch"],
    [
      supplied,
      { ...origin(), sessionFile: "/sessions/other.jsonl" },
      origin(),
      "reviewer-origin-mismatch",
    ],
    [supplied, origin("old-attempt"), origin(), "reviewer-origin-mismatch"],
    [
      supplied,
      { ...origin(), attemptId: "" },
      { ...origin(), attemptId: "" },
      "reviewer-origin-mismatch",
    ],
    [
      supplied,
      { ...origin(), threadPath: "/root" },
      { ...origin(), threadPath: "/root" },
      "reviewer-origin-mismatch",
    ],
    [
      supplied,
      { ...origin(), threadPath: "/elsewhere//child" },
      { ...origin(), threadPath: "/elsewhere//child" },
      "reviewer-origin-mismatch",
    ],
    ["Coordinator says reviewer approved.", origin(), origin(), "semantic-evidence-required"],
    [
      {
        lenses: ["architecture"],
        sources: ["ARCHITECTURE.md"],
        verdict: "no-blocking",
        findings: [],
      },
      origin(),
      origin(),
      "semantic-evidence-required",
    ],
  ];
  for (const [value, actual, expected, kind] of cases) {
    const result = acceptArchitectureReceipt(bound, value, actual, expected);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, kind);
  }
});

test("every check needs explained concrete references and only current authority forbids justified non-applicability", () => {
  const bound = binding();
  const supplied = evidence(bound);
  const first = supplied.units[0];
  assert.ok(first);
  const invalidChecks: unknown[] = [
    null,
    { ...check(), status: "approved" },
    { ...check(), explanation: " \n" },
    { ...check(), sources: [] },
    { ...check(), sources: new Array(1) },
    { ...check(), sources: ["ARCHITECTURE.md"] },
    {
      ...check(),
      sources: [{ objectId: "HEAD", path: "ARCHITECTURE.md", startLine: 1, endLine: 2 }],
    },
    { ...check(), sources: [{ objectId: oid("d"), path: " ", startLine: 1, endLine: 2 }] },
    {
      ...check(),
      sources: [{ objectId: oid("d"), path: "ARCHITECTURE.md", startLine: 0, endLine: 2 }],
    },
    {
      ...check(),
      sources: [{ objectId: oid("d"), path: "ARCHITECTURE.md", startLine: 2, endLine: 1 }],
    },
  ];
  for (const name of Object.keys(first.checks)) {
    for (const invalid of invalidChecks) {
      const value: unknown = {
        ...supplied,
        units: [
          { ...first, checks: { ...first.checks, [name]: invalid } },
          ...supplied.units.slice(1),
        ],
      };
      assert.equal(acceptArchitectureReceipt(bound, value, origin(), origin()).ok, false, name);
    }
    const value = {
      ...supplied,
      units: [
        { ...first, checks: { ...first.checks, [name]: check("not-applicable") } },
        ...supplied.units.slice(1),
      ],
    };
    const result = acceptArchitectureReceipt(bound, value, origin(), origin());
    assert.equal(result.ok, name !== "currentAuthority", name);
    if (!result.ok) assert.equal(result.error.kind, "current-authority-required");
    const missing: Record<string, ArchitectureSemanticCheck> = Object.fromEntries(
      Object.entries(first.checks).filter(([key]) => key !== name),
    );
    assert.equal(
      acceptArchitectureReceipt(
        bound,
        { ...supplied, units: [{ ...first, checks: missing }] },
        origin(),
        origin(),
      ).ok,
      false,
    );
  }
});

test("violated semantic checks and unresolved serious findings refuse clean credit regardless of verdict", () => {
  const bound = binding();
  const supplied = evidence(bound);
  const first = supplied.units[0];
  assert.ok(first);
  for (const name of Object.keys(first.checks)) {
    const value = {
      ...supplied,
      units: [
        { ...first, checks: { ...first.checks, [name]: check("violated") } },
        ...supplied.units.slice(1),
      ],
    };
    const result = acceptArchitectureReceipt(bound, value, origin(), origin());
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.equal(result.error.kind, "semantic-check-violated");
  }
  for (const severity of ["blocking", "should-fix", "nit", "false-positive"] as const) {
    const value = {
      ...supplied,
      findings: [{ severity, summary: "Review finding with retained rationale." }],
    };
    const result = acceptArchitectureReceipt(bound, value, origin(), origin());
    assert.equal(result.ok, severity === "nit" || severity === "false-positive", severity);
    if (!result.ok) assert.equal(result.error.kind, "serious-findings");
  }
  const blocked = acceptArchitectureReceipt(
    bound,
    { ...supplied, verdict: "blocking" },
    origin(),
    origin(),
  );
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.error.kind, "serious-findings");
});

test("eligible receipts snapshot full evidence and host origin without retaining model provenance", () => {
  const bound = binding();
  const sources = [{ objectId: oid("d"), path: "ARCHITECTURE.md", startLine: 1, endLine: 4 }];
  const details = { ...check(), sources };
  const supplied = evidence(bound);
  const first = supplied.units[0];
  assert.ok(first);
  const checks = { ...first.checks, correspondence: details };
  const units = [{ ...first, checks }, ...supplied.units.slice(1)];
  const findings = [{ severity: "nit" as const, summary: "Optional clarity." }];
  const host = { ...origin() };
  const result = acceptArchitectureReceipt(
    bound,
    { ...supplied, units, findings, origin: { threadPath: "/root" } },
    host,
    origin(),
  );
  assert.equal(result.ok, true);
  const source = sources[0];
  assert.ok(source);
  source.path = "changed.md";
  details.explanation = "changed";
  units.pop();
  const finding = findings[0];
  assert.ok(finding);
  finding.summary = "changed";
  host.attemptId = "changed";
  assert.equal(
    result.value.evidence.units[0]?.checks.correspondence.explanation,
    check().explanation,
  );
  assert.equal(
    result.value.evidence.units[0]?.checks.correspondence.sources[0]?.path,
    "ARCHITECTURE.md",
  );
  assert.equal(result.value.evidence.units.length, 2);
  assert.equal(result.value.evidence.findings[0]?.summary, "Optional clarity.");
  assert.deepEqual(result.value.origin, origin());
  assert.equal("origin" in result.value.evidence, false);
  const frozen = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) frozen(child);
  };
  frozen(result.value);
});

test("only the trailing consecutive exact-binding eligible clean receipts count toward required depth", () => {
  const bound = binding();
  const clean = (attempt: string) => ({ evidence: evidence(bound), origin: origin(attempt) });
  const stale = { ...clean("a"), evidence: evidence(binding({ ...input(), tree: oid("f") })) };
  const dirty = {
    ...clean("a"),
    evidence: {
      ...evidence(bound),
      findings: [{ severity: "should-fix", summary: "Unresolved." }],
    },
  };
  const cases: Array<
    [string, readonly unknown[], readonly ReviewerOrigin[], number, number | string]
  > = [
    ["one clean", [clean("a")], [origin("a")], 1, 1],
    ["two clean", [clean("a"), clean("b")], [origin("a"), origin("b")], 2, 2],
    ["short depth", [clean("a")], [origin("a")], 2, "clean-depth-insufficient"],
    ["stale latest", [clean("a"), stale], [origin("a"), origin("a")], 1, "stale-binding"],
    ["unclean latest", [clean("a"), dirty], [origin("a"), origin("a")], 1, "serious-findings"],
    [
      "dirty interrupts",
      [clean("a"), dirty, clean("c")],
      [origin("a"), origin("a"), origin("c")],
      2,
      "clean-depth-insufficient",
    ],
    [
      "stale interrupts",
      [stale, clean("b"), clean("c")],
      [origin("a"), origin("b"), origin("c")],
      2,
      2,
    ],
    ["legacy interrupts", ["markdown approval", clean("b")], [origin("a"), origin("b")], 1, 1],
    [
      "legacy last",
      [clean("a"), { lenses: ["architecture"], findings: [] }],
      [origin("a"), origin("b")],
      1,
      "semantic-evidence-required",
    ],
    [
      "missing host origin",
      [{ evidence: evidence(bound) }],
      [origin("a")],
      1,
      "reviewer-origin-mismatch",
    ],
    ["missing expected ownership", [clean("a")], [], 1, "reviewer-origin-mismatch"],
    [
      "wrong attempt",
      [clean("a"), clean("a")],
      [origin("a"), origin("b")],
      2,
      "reviewer-origin-mismatch",
    ],
  ];
  for (const [name, receipts, expected, required, outcome] of cases) {
    const result = checkArchitectureReview(bound, receipts, expected, required);
    if (typeof outcome === "number")
      assert.deepEqual(result, { ok: true, value: { cleanDepth: outcome } }, name);
    else {
      assert.equal(result.ok, false, name);
      if (!result.ok) assert.equal(result.error.kind, outcome, name);
    }
  }
});

test("invalid clean depth cannot bypass the semantic review requirement", () => {
  const bound = binding();
  const receipt = { evidence: evidence(bound), origin: origin() };
  for (const required of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = checkArchitectureReview(bound, [receipt], [origin()], required);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "invalid-clean-depth");
  }
});

test("a structurally forged binding cannot borrow another binding's evidence identity", () => {
  const original = binding();
  const forged = { ...original, tree: oid("f") };
  const result = acceptArchitectureReceipt(forged, evidence(original), origin(), origin());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "invalid-binding");
  const reviewed = checkArchitectureReview(
    forged,
    [{ evidence: evidence(original), origin: origin() }],
    [origin()],
    1,
  );
  assert.equal(reviewed.ok, false);
  if (!reviewed.ok) assert.equal(reviewed.error.kind, "invalid-binding");
});

test("malformed semantic envelopes cannot become eligible receipts", () => {
  const bound = binding();
  const supplied = evidence(bound);
  const malformed: unknown[] = [
    null,
    [],
    {},
    { ...supplied, verdict: "approved" },
    { ...supplied, findings: [{ severity: "info", summary: "Unknown severity." }] },
    { ...supplied, findings: [{ severity: "blocking", summary: " " }] },
    { ...supplied, findings: new Array(1) },
    { ...supplied, units: new Array(2) },
  ];
  for (const value of malformed) {
    const result = acceptArchitectureReceipt(bound, value, origin(), origin());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "semantic-evidence-required");
  }
});

// Requirement correction: independent top-level reviewers are not children of `/root/`.
// The host authenticates independence; this core matches the separately supplied expectation.
test("canonical non-root reviewer paths are eligible without a root prefix", () => {
  const bound = binding();
  for (const threadPath of [
    "/review-architecture",
    "/architecture-semantic-core",
    "/elsewhere/child",
    "/root/reviewer",
  ]) {
    const expected = { ...origin(), threadPath };
    const result = acceptArchitectureReceipt(bound, evidence(bound), expected, expected);
    assert.equal(result.ok, true, threadPath);
  }
  for (const threadPath of [
    "/",
    "/root",
    "/root/",
    "/root/.",
    "/root/reviewer/..",
    "/./root",
    "//root",
    "root/reviewer",
    "/reviewer/",
    "/reviewer//child",
    "/reviewer\nchild",
  ]) {
    const expected = { ...origin(), threadPath };
    const result = acceptArchitectureReceipt(bound, evidence(bound), expected, expected);
    assert.equal(result.ok, false, threadPath);
    if (!result.ok) assert.equal(result.error.kind, "reviewer-origin-mismatch");
  }
});
