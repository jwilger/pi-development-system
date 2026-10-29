import assert from "node:assert/strict";
import test from "node:test";
import {
  assessDelivery,
  type PullRequestObservation,
} from "../../src/tracker/delivery-assessment.ts";

function observation(overrides: Partial<PullRequestObservation> = {}): PullRequestObservation {
  return {
    ref: { repository: "o/r", number: 1 },
    url: "https://github.com/o/r/pull/1",
    headOid: "head-1",
    base: "main",
    state: "open",
    draft: false,
    mergedAt: null,
    mergeOid: null,
    checks: [{ name: "CI", headOid: "head-1", state: "success" }],
    ...overrides,
  };
}

test("passing checks do not deliver an open PR", () => {
  const observations = [observation()] as const;
  const conditions = { requireMerge: true, requiredChecks: ["CI"] };
  const before = structuredClone({ observations, conditions });
  const result = assessDelivery(observations, conditions);
  assert.equal(result.status, "pending");
  assert.deepEqual(result.conditions, [
    {
      ref: observations[0].ref,
      name: "merge",
      status: "pending",
      message: "Pull request is open; merge is required.",
    },
    {
      ref: observations[0].ref,
      name: "CI",
      status: "satisfied",
      message: "All observations for check CI succeeded at the current head.",
    },
  ]);
  assert.deepEqual(result.observations, before.observations);
  assert.deepEqual({ observations, conditions }, before);
});

test("old or absent checks stay unknown", () => {
  const cases: { label: string; pr: PullRequestObservation; message: string }[] = [
    {
      label: "absent",
      pr: observation(),
      message: "No observations for required check lint.",
    },
    {
      label: "old",
      pr: observation({
        checks: [
          { name: "CI", headOid: "head-1", state: "success" },
          { name: "lint", headOid: "old", state: "success" },
        ],
      }),
      message: "Check lint has observations not bound to the current head.",
    },
    {
      label: "empty head",
      pr: observation({
        headOid: "",
        checks: [
          { name: "CI", headOid: "", state: "success" },
          { name: "lint", headOid: "", state: "success" },
        ],
      }),
      message: "Current head is missing for check lint.",
    },
    {
      label: "unknown",
      pr: observation({
        checks: [
          { name: "CI", headOid: "head-1", state: "success" },
          { name: "lint", headOid: "head-1", state: "unknown" },
        ],
      }),
      message: "Check lint has an unknown current-head state.",
    },
    {
      label: "old alongside current",
      pr: observation({
        checks: [
          { name: "CI", headOid: "head-1", state: "success" },
          { name: "lint", headOid: "head-1", state: "success" },
          { name: "lint", headOid: "old", state: "success" },
        ],
      }),
      message: "Check lint has observations not bound to the current head.",
    },
  ];
  for (const { label, pr, message } of cases) {
    const result = assessDelivery([pr], { requiredChecks: ["CI", "lint"] });
    assert.equal(result.status, "unknown", label);
    assert.deepEqual(
      result.conditions[1],
      {
        ref: pr.ref,
        name: "lint",
        status: "unknown",
        message,
      },
      label,
    );
    assert.ok(result.conditions[0]);
    assert.equal(result.conditions[0].status, label === "empty head" ? "unknown" : "satisfied");
  }
});

test("every same-name check must pass", () => {
  for (const state of ["pending", "failure"] as const) {
    for (const reversed of [false, true]) {
      const checks = [
        { name: "CI", headOid: "head-1", state: "success" as const },
        { name: "CI", headOid: "head-1", state },
      ];
      const pr = observation({ checks: reversed ? checks.toReversed() : checks });
      const status = state === "failure" ? "failed" : "pending";
      const result = assessDelivery([pr], { requiredChecks: ["CI"] });
      assert.equal(result.status, status);
      assert.deepEqual(result.conditions, [
        {
          ref: pr.ref,
          name: "CI",
          status,
          message:
            state === "failure"
              ? "Check CI failed at the current head."
              : "Check CI is pending at the current head.",
        },
      ]);
    }
  }
  const pr = observation({
    checks: [
      { name: "CI", headOid: "head-1", state: "success" },
      { name: "CI", headOid: "head-1", state: "pending" },
      { name: "CI", headOid: "head-1", state: "failure" },
    ],
  });
  assert.equal(assessDelivery([pr], { requiredChecks: ["CI"] }).status, "failed");
});

test("merge and base conditions are independent", () => {
  const cases: {
    label: string;
    overrides: Partial<PullRequestObservation>;
    merge: "failed" | "blocked" | "unknown" | "satisfied" | "pending";
    message: string;
    base?: "failed";
  }[] = [
    {
      label: "closed-unmerged",
      overrides: { state: "closed" },
      merge: "failed",
      message: "Pull request is closed without a merge.",
    },
    {
      label: "draft",
      overrides: { draft: true },
      merge: "blocked",
      message: "Draft pull request cannot satisfy the merge requirement.",
    },
    {
      label: "missing merge facts",
      overrides: { state: "merged" },
      merge: "unknown",
      message: "Merged pull request lacks a merge OID or merge timestamp.",
    },
    {
      label: "empty merge OID",
      overrides: { state: "merged", mergeOid: "", mergedAt: "2026-01-01" },
      merge: "unknown",
      message: "Merged pull request lacks a merge OID or merge timestamp.",
    },
    {
      label: "empty merge timestamp",
      overrides: { state: "merged", mergeOid: "merge-1", mergedAt: "" },
      merge: "unknown",
      message: "Merged pull request lacks a merge OID or merge timestamp.",
    },
    {
      label: "merged",
      overrides: { state: "merged", mergeOid: "merge-1", mergedAt: "2026-01-01" },
      merge: "satisfied",
      message: "Pull request is merged with a merge OID and merge timestamp.",
    },
    {
      label: "wrong base",
      overrides: { base: "release" },
      merge: "pending",
      base: "failed",
      message: "Pull request is open; merge is required.",
    },
  ];
  for (const { label, overrides, merge, message, base = "satisfied" } of cases) {
    const pr = observation(overrides);
    const result = assessDelivery([pr], { requireMerge: true, targetBase: "main" });
    assert.equal(result.status, base === "failed" ? "failed" : merge, label);
    assert.deepEqual(
      result.conditions,
      [
        { ref: pr.ref, name: "merge", status: merge, message },
        {
          ref: pr.ref,
          name: "base",
          status: base,
          message:
            base === "failed"
              ? "Base release does not match required base main."
              : "Base matches required base main.",
        },
      ],
      label,
    );
  }
  const pr = observation({ state: "closed" });
  assert.equal(assessDelivery([pr], { targetBase: "main" }).status, "satisfied");
  assert.equal(assessDelivery([pr], { requiredChecks: ["CI"] }).status, "satisfied");
});

test("manual requirements cannot pass", () => {
  const pr = observation({ state: "merged", mergeOid: "merge-1", mergedAt: "2026-01-01" });
  const result = assessDelivery([pr], {
    requireMerge: true,
    targetBase: "main",
    requiredChecks: ["CI"],
    manualRequirements: ["Human approval", "Release verification"],
  });
  assert.equal(result.status, "unknown");
  assert.deepEqual(
    result.conditions.slice(0, 3).map((condition) => condition.status),
    ["satisfied", "satisfied", "satisfied"],
  );
  assert.deepEqual(
    result.conditions.slice(3),
    ["Human approval", "Release verification"].map((name) => ({
      ref: pr.ref,
      name,
      status: "unknown",
      message: `Manual requirement ${name} is unsupported; human assessment is required.`,
    })),
  );
});

test("all PRs must satisfy", () => {
  const merged = observation({ state: "merged", mergeOid: "merge-1", mergedAt: "2026-01-01" });
  const variants = [
    { pr: observation(), status: "pending", message: "Pull request is open; merge is required." },
    {
      pr: observation({ state: "merged" }),
      status: "unknown",
      message: "Merged pull request lacks a merge OID or merge timestamp.",
    },
    {
      pr: observation({ draft: true }),
      status: "blocked",
      message: "Draft pull request cannot satisfy the merge requirement.",
    },
    {
      pr: observation({ state: "closed" }),
      status: "failed",
      message: "Pull request is closed without a merge.",
    },
  ] as const;
  for (const { pr, status, message } of variants) {
    const other = { ...pr, ref: { repository: "other/repo", number: 2 } };
    for (const observations of [
      [merged, other],
      [other, merged],
    ]) {
      const result = assessDelivery(observations, { requireMerge: true, requiredChecks: ["CI"] });
      assert.equal(result.status, status);
      assert.deepEqual(result.observations, observations);
      assert.deepEqual(
        result.conditions.filter((condition) => condition.ref === other.ref),
        [
          { ref: other.ref, name: "merge", status, message },
          {
            ref: other.ref,
            name: "CI",
            status: "satisfied",
            message: "All observations for check CI succeeded at the current head.",
          },
        ],
      );
      assert.equal(result.conditions.length, 4);
    }
  }
  for (const [index, variant] of variants.entries()) {
    const result = assessDelivery(
      variants.slice(0, index + 1).map(({ pr }) => pr),
      { requireMerge: true },
    );
    assert.equal(result.status, variant.status);
  }
  assert.equal(assessDelivery([merged, merged], { requireMerge: true }).status, "satisfied");
});

test("no policy is unassessed", () => {
  const observations = [observation()] as const;
  for (const conditions of [
    {},
    { requireMerge: false },
    { requiredChecks: [], manualRequirements: [] },
  ]) {
    assert.deepEqual(assessDelivery(observations, conditions), {
      status: "unassessed",
      observations,
      conditions: [],
    });
  }
  assert.deepEqual(
    assessDelivery([], {
      requireMerge: true,
      targetBase: "main",
      requiredChecks: ["CI"],
      manualRequirements: ["approval"],
    }),
    {
      status: "unassessed",
      observations: [],
      conditions: [],
    },
  );
  assert.deepEqual(
    assessDelivery(observations, { requireMerge: false, requiredChecks: ["CI"] }).conditions,
    [
      {
        ref: observations[0].ref,
        name: "CI",
        status: "satisfied",
        message: "All observations for check CI succeeded at the current head.",
      },
    ],
  );
});
