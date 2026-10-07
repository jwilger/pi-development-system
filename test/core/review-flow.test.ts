import assert from "node:assert/strict";
import { test } from "node:test";
import { addRound, type Finding, startReview } from "../../src/core/review.ts";
import {
  adoptSeverity,
  combinePackets,
  renderFollowups,
  reviewerTask,
  reviewGap,
  reviewLabel,
  reviewOf,
  upsertReview,
} from "../../src/core/review-flow.ts";
import { parseReviewPacket } from "../../src/core/review-packet.ts";
import { initialState, type SliceRef } from "../../src/core/types.ts";

const s1 = "s1" as SliceRef;
const finding = (severity: Finding["severity"], id = "types-1"): Finding => ({
  id,
  severity,
  lens: "types",
  summary: "something",
  path: "a.ts",
  line: 3,
});
const round = (findings: Finding[], diffDigest = "d1") => ({
  lenses: ["types"],
  findings,
  reviewedAt: "2026-10-06T00:00:00Z",
  diffDigest,
});

test("upsertReview replaces a slice's review and keeps the others", () => {
  const a = startReview(s1, 3);
  const b = startReview("s2" as SliceRef, 3);
  const state = upsertReview(upsertReview(initialState(), a), b);
  const updated = upsertReview(state, addRound(a, round([])));
  assert.equal(updated.reviews?.length, 2);
  assert.equal(reviewOf(updated, s1)?.rounds.length, 1);
  assert.equal(reviewOf(updated, "s2" as SliceRef)?.rounds.length, 0);
});

test("reviewLabel counts clean rounds against the requirement", () => {
  const r0 = startReview(s1, 3);
  assert.equal(reviewLabel(r0), "review: 0/3 clean");
  const r1 = addRound(r0, round([finding("nit")]));
  assert.equal(reviewLabel(r1), "review: 1/3 clean");
  assert.equal(reviewLabel(addRound(r1, round([finding("should-fix")]))), "review: 0/3 clean");
});

test("reviewGap names what is missing, and is silent when satisfied on this diff", () => {
  const none = reviewGap(initialState(), s1, "d1");
  assert.match(none ?? "", /no review/i);
  const done = [1, 2, 3].reduce((r) => addRound(r, round([])), startReview(s1, 3));
  const state = upsertReview(initialState(), done);
  assert.equal(reviewGap(state, s1, "d1"), undefined);
  assert.match(reviewGap(state, s1, "d2") ?? "", /changed since/i);
  const partial = upsertReview(initialState(), addRound(startReview(s1, 3), round([])));
  assert.match(reviewGap(partial, s1, "d1") ?? "", /1\/3/);
  const open = upsertReview(
    initialState(),
    addRound(startReview(s1, 3), round([finding("blocking")])),
  );
  assert.match(reviewGap(open, s1, "d1") ?? "", /fix/i);
});

const packet = (lens: string, body: string, verdict: string) =>
  `## Review — s1 — round 1 — lenses: ${lens}\n### Sources inspected\n- a.ts:1-9\n### Findings\n${body}\n### Verdict\n${verdict}\n`;

test("combinePackets merges lenses and findings with unique ids", () => {
  const p1 = parseReviewPacket(packet("types", "- [nit] types `a.ts:1` — x — y", "no-blocking"));
  const p2 = parseReviewPacket(
    packet(
      "tests",
      "- [should-fix] tests `b.ts:2` — x — y\n- [nit] types `a.ts:9` — z — w",
      "blocking",
    ),
  );
  assert.ok(!("kind" in p1) && !("kind" in p2));
  const merged = combinePackets([p1, p2]);
  assert.deepEqual(merged.lenses.toSorted(), ["tests", "types"]);
  assert.equal(merged.findings.length, 3);
  assert.equal(new Set(merged.findings.map((f: Finding) => f.id)).size, 3);
});

test("adoptSeverity follows Jev only when it is confident and says so", () => {
  const f = finding("blocking");
  assert.deepEqual(adoptSeverity(f, { severity: "nit", confidence: 0.5 }), { finding: f });
  assert.deepEqual(adoptSeverity(f, { severity: "blocking", confidence: 0.99 }), { finding: f });
  const moved = adoptSeverity(f, { severity: "false-positive", confidence: 0.95 });
  assert.equal(moved.finding.severity, "false-positive");
  assert.match(moved.note ?? "", /blocking → false-positive/);
  assert.deepEqual(adoptSeverity(f, undefined), { finding: f });
});

test("renderFollowups lists only nits, or nothing", () => {
  assert.equal(renderFollowups(s1, 1, [finding("blocking")]), undefined);
  const text = renderFollowups(s1, 2, [finding("nit"), finding("should-fix", "types-2")]) ?? "";
  assert.match(text, /From s1 review round 2/);
  assert.match(text, /a\.ts:3/);
  assert.doesNotMatch(text, /types-2/);
});

test("reviewerTask carries the slice, lenses, diff range and packet format", () => {
  const task = reviewerTask({ slice: s1, round: 2, lenses: ["types", "tests"], diffRange: "HEAD" });
  for (const part of [
    "s1",
    "round 2",
    "types, tests",
    "git diff HEAD",
    "### Verdict",
    "Do not modify",
  ]) {
    assert.ok(task.includes(part), part);
  }
});
