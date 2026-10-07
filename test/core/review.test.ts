import assert from "node:assert/strict";
import test from "node:test";
import {
  addRound,
  cleanStreak,
  type Finding,
  isClean,
  isSatisfied,
  nextAction,
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
  const round = {
    lenses: ["types" as const],
    findings: [],
    reviewedAt: "t",
    diffDigest: "d",
    files: { "a.ts": "x" },
  };
  const s = addRound(addRound(startReview("s1" as SliceRef, 3), round), round);
  assert.equal(s.rounds[0]?.files, undefined);
  assert.deepEqual(s.rounds[1]?.files, { "a.ts": "x" });
});
