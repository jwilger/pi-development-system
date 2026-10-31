import assert from "node:assert/strict";
import test from "node:test";
import {
  addRound,
  cleanStreak,
  type Finding,
  isClean,
  isSatisfied,
  nextAction,
  parseReviewState,
  type ReviewInput,
  type ReviewRound,
  type ReviewState,
  startReview,
} from "../../src/core/review.ts";
import type { SliceRef } from "../../src/core/types.ts";

const slice = "I6.1" as SliceRef;
const finding = (severity: Finding["severity"], id = "f"): Finding => ({
  id,
  severity,
  summary: "s",
  lens: "types",
});
const round = (n: number, digest: string, ...findings: Finding[]): ReviewRound => ({
  n,
  lenses: ["types"],
  findings,
  reviewedAt: "2026-10-07T00:00:00Z",
  diffDigest: digest,
});
const state = (required: number, ...rounds: ReviewRound[]): ReviewState => ({
  slice,
  required,
  rounds,
});

test("only blocking and should-fix findings make a round unclean", () => {
  assert.equal(isClean(round(1, "a")), true);
  assert.equal(isClean(round(1, "a", finding("nit"), finding("false-positive"))), true);
  assert.equal(isClean(round(1, "a", finding("should-fix"))), false);
  assert.equal(isClean(round(1, "a", finding("blocking"))), false);
});

test("the streak counts trailing clean rounds and any real finding resets it", () => {
  const table: Array<[string, ReviewRound[], number]> = [
    ["no rounds", [], 0],
    ["one clean", [round(1, "a")], 1],
    ["three clean", [round(1, "a"), round(2, "a"), round(3, "a")], 3],
    ["finding last", [round(1, "a"), round(2, "a", finding("should-fix"))], 0],
    ["finding then clean", [round(1, "a", finding("blocking")), round(2, "b")], 1],
    [
      "clean, finding, clean x2",
      [round(1, "a"), round(2, "a", finding("blocking")), round(3, "b"), round(4, "b")],
      2,
    ],
    ["nits do not reset", [round(1, "a"), round(2, "a", finding("nit")), round(3, "a")], 3],
  ];
  for (const [name, rounds, expected] of table) {
    assert.equal(cleanStreak(state(3, ...rounds)), expected, name);
  }
});

test("a changed diff digest does not throw away prior clean rounds", () => {
  const s = state(3, round(1, "a"), round(2, "a"), round(3, "b"));
  assert.equal(cleanStreak(s), 3);
});

test("configured clean streak excludes prior input", () => {
  const first = {
    ...round(1, "a"),
    input: { diffDigest: "a", guidanceIdentity: "guidance-a", identity: "input-a" },
  };
  const second = {
    ...round(2, "a"),
    input: { diffDigest: "a", guidanceIdentity: "guidance-b", identity: "input-b" },
  };
  const changed = state(2, first, second);
  assert.equal(cleanStreak(changed), 1);
  assert.equal(isSatisfied(changed), false);
  const identical = state(2, first, { ...second, input: first.input });
  assert.equal(cleanStreak(identical), 2);
  assert.equal(isSatisfied(identical), true);
});

test("configured and legacy streaks stop at input boundaries and unclean rounds", () => {
  const input: ReviewInput = { diffDigest: "a", guidanceIdentity: "g", identity: "i" };
  const configured = (n: number, ...findings: Finding[]): ReviewRound => ({
    ...round(n, "a", ...findings),
    input,
  });
  const table: Array<[string, ReviewRound[], number]> = [
    ["legacy before configured", [round(1, "a"), configured(2)], 1],
    ["configured before legacy", [configured(1), round(2, "a")], 1],
    ["trailing configured only", [round(1, "a"), configured(2), configured(3)], 2],
    ["trailing legacy only", [configured(1), round(2, "a"), round(3, "b")], 2],
    ["unclean configured last", [configured(1), configured(2, finding("blocking"))], 0],
    [
      "unclean configured resets",
      [configured(1), configured(2, finding("should-fix")), configured(3)],
      1,
    ],
    ["configured nits count", [configured(1), configured(2, finding("nit"))], 2],
  ];
  for (const [name, rounds, expected] of table) {
    assert.equal(cleanStreak(state(2, ...rounds)), expected, name);
  }
});

test("isSatisfied needs the required number of clean rounds", () => {
  assert.equal(isSatisfied(state(3, round(1, "a"), round(2, "a"))), false);
  assert.equal(isSatisfied(state(3, round(1, "a"), round(2, "a"), round(3, "a"))), true);
  assert.equal(isSatisfied(state(1, round(1, "a"))), true);
  assert.equal(isSatisfied(state(0)), false, "zero rounds never satisfy, even if required is 0");
});

test("nextAction table", () => {
  const clean3 = [round(1, "a"), round(2, "a"), round(3, "a")];
  const table: Array<[string, ReviewState, string, string]> = [
    ["no rounds", state(3), "a", "review"],
    ["unclean last, same diff", state(3, round(1, "a", finding("blocking"))), "a", "fix-findings"],
    [
      "unclean last, diff changed (fixed)",
      state(3, round(1, "a", finding("blocking"))),
      "b",
      "review",
    ],
    ["clean but short", state(3, round(1, "a")), "a", "review"],
    ["clean but short, diff changed", state(3, round(1, "a")), "b", "review"],
    ["satisfied on current diff", state(3, ...clean3), "a", "done"],
    ["satisfied on an older diff", state(3, ...clean3), "b", "stale-diff"],
  ];
  for (const [name, s, digest, expected] of table) {
    assert.equal(nextAction(s, digest), expected, name);
  }
});

test("startReview and addRound build state immutably and number rounds", () => {
  const s0 = startReview(slice, 3);
  assert.deepEqual(s0, { slice, required: 3, rounds: [] });
  const s1 = addRound(s0, { lenses: ["types"], findings: [], reviewedAt: "t", diffDigest: "a" });
  assert.equal(s1.rounds[0]?.n, 1);
  const s2 = addRound(s1, { lenses: [], findings: [], reviewedAt: "t", diffDigest: "a" });
  assert.equal(s2.rounds[1]?.n, 2);
  assert.equal(s0.rounds.length, 0, "input is not mutated");
});

test("addRound keeps per-file digests only on the latest round", () => {
  const added = {
    lenses: ["types" as const],
    findings: [],
    reviewedAt: "t",
    diffDigest: "d",
    files: { "a.ts": "x" },
  };
  const s = addRound(addRound(startReview("s1" as SliceRef, 3), added), added);
  assert.equal(s.rounds[0]?.files, undefined);
  assert.deepEqual(s.rounds[1]?.files, { "a.ts": "x" });
});

const persistedInput: ReviewInput = {
  diffDigest: "a",
  guidanceIdentity: "guidance",
  identity: "validated-at-producer-not-parser",
};

test("parseReviewState accepts legacy state without adding input or pending", () => {
  const legacy = state(2, round(1, "a"));
  assert.deepEqual(parseReviewState(JSON.parse(JSON.stringify(legacy))), legacy);
});

test("parseReviewState retains round inputs and pending through JSON persistence", () => {
  const configured: ReviewState = {
    ...state(2, { ...round(1, "a"), input: persistedInput }),
    pending: { round: 2, range: "HEAD", input: persistedInput },
  };
  assert.deepEqual(parseReviewState(JSON.parse(JSON.stringify(configured))), configured);
  const pendingOnly: ReviewState = {
    ...state(2),
    pending: { round: 1, range: "HEAD~1..HEAD", input: persistedInput },
  };
  assert.deepEqual(parseReviewState(pendingOnly), pendingOnly);
});

const malformedInputs: Array<[string, unknown]> = [
  ["null", null],
  ["array", []],
  ["string", "input"],
  ["missing fields", {}],
  ["missing diffDigest", { guidanceIdentity: "g", identity: "i" }],
  ["missing guidanceIdentity", { diffDigest: "a", identity: "i" }],
  ["missing identity", { diffDigest: "a", guidanceIdentity: "g" }],
  ["non-string diffDigest", { ...persistedInput, diffDigest: 1 }],
  ["non-string guidanceIdentity", { ...persistedInput, guidanceIdentity: null }],
  ["non-string identity", { ...persistedInput, identity: 1 }],
  ["empty identity", { ...persistedInput, identity: "" }],
];
for (const [name, input] of malformedInputs) {
  test(`parseReviewState rejects ${name} round input`, () => {
    const parsed = parseReviewState({ ...state(2), rounds: [{ ...round(1, "a"), input }] });
    assert.ok("kind" in parsed);
  });
  test(`parseReviewState rejects ${name} pending input`, () => {
    const parsed = parseReviewState({
      ...state(2),
      pending: { round: 1, range: "HEAD", input },
    });
    assert.ok("kind" in parsed);
  });
}

test("parseReviewState rejects round input with a different diff digest", () => {
  const parsed = parseReviewState(state(2, { ...round(1, "other"), input: persistedInput }));
  assert.ok("kind" in parsed);
});

const malformedPending: Array<[string, unknown]> = [
  ["null", null],
  ["array", []],
  ["string", "pending"],
  ["missing round", { range: "HEAD", input: persistedInput }],
  ["string round", { round: "1", range: "HEAD", input: persistedInput }],
  ["zero round", { round: 0, range: "HEAD", input: persistedInput }],
  ["negative round", { round: -1, range: "HEAD", input: persistedInput }],
  ["fractional round", { round: 1.5, range: "HEAD", input: persistedInput }],
  ["NaN round", { round: Number.NaN, range: "HEAD", input: persistedInput }],
  ["infinite round", { round: Number.POSITIVE_INFINITY, range: "HEAD", input: persistedInput }],
  ["missing range", { round: 1, input: persistedInput }],
  ["non-string range", { round: 1, range: 1, input: persistedInput }],
  ["empty range", { round: 1, range: "", input: persistedInput }],
  ["missing input", { round: 1, range: "HEAD" }],
];
for (const [name, pending] of malformedPending) {
  test(`parseReviewState rejects ${name} pending`, () => {
    assert.ok("kind" in parseReviewState({ ...state(2), pending }));
  });
}

test("addRound consumes pending without losing earlier input metadata or mutating state", () => {
  const earlier = { ...round(1, "a"), input: persistedInput, files: { "a.ts": "x" } };
  const currentInput: ReviewInput = {
    diffDigest: "b",
    guidanceIdentity: "new-guidance",
    identity: "new-input",
  };
  const before: ReviewState = {
    ...state(2, earlier),
    pending: { round: 2, range: "HEAD", input: currentInput },
  };
  const added = { ...round(2, "b"), input: currentInput, files: { "a.ts": "y" } };
  const after = addRound(before, added);
  assert.equal(Object.hasOwn(after, "pending"), false);
  assert.deepEqual(after.rounds[0]?.input, persistedInput);
  assert.deepEqual(after.rounds[1], added);
  assert.equal(after.rounds[0]?.files, undefined);
  assert.equal(before.rounds[0], earlier);
  assert.deepEqual(before.rounds[0]?.files, { "a.ts": "x" });
  assert.deepEqual(before.pending, { round: 2, range: "HEAD", input: currentInput });
});

test("dispatch manifest survives persistence and is consumed only by an accepted round", () => {
  const dispatch = {
    round: 1,
    range: "HEAD",
    diffDigest: "a",
    inputIdentity: "input",
    lenses: ["types", "tests"],
  };
  const before: ReviewState = { ...state(2), dispatch };
  assert.deepEqual(parseReviewState(JSON.parse(JSON.stringify(before))), before);
  assert.equal(
    addRound(before, { lenses: ["types", "tests"], findings: [], reviewedAt: "t", diffDigest: "a" })
      .dispatch,
    undefined,
  );
  assert.deepEqual(before.dispatch, dispatch);
});

for (const dispatch of [
  null,
  {},
  { round: 2, range: "HEAD", diffDigest: "a", inputIdentity: "input", lenses: ["types"] },
  { round: 1, range: "HEAD", diffDigest: "a", inputIdentity: "input", lenses: [] },
  { round: 1, range: "HEAD", diffDigest: "a", inputIdentity: "input", lenses: ["types", "types"] },
  { round: 1, range: "HEAD", diffDigest: "a", inputIdentity: "input", lenses: [5] },
  { round: 1, range: "", diffDigest: "a", inputIdentity: "input", lenses: ["types"] },
]) {
  test(`invalid dispatch is rejected at persistence boundary: ${JSON.stringify(dispatch)}`, () => {
    assert.ok("kind" in parseReviewState({ ...state(1), dispatch }));
  });
}
