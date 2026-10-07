import assert from "node:assert/strict";
import { test } from "node:test";
import { addRound, type Finding, startReview } from "../../src/core/review.ts";
import {
  adoptSeverity,
  combinePackets,
  nitLines,
  reviewerTask,
  reviewGap,
  reviewLabel,
  reviewOf,
  splitDiffByFile,
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
  const none = reviewGap(initialState(), s1, { digest: "d1" });
  assert.match(none ?? "", /no review/i);
  const done = [1, 2, 3].reduce((r) => addRound(r, round([])), startReview(s1, 3));
  const state = upsertReview(initialState(), done);
  assert.equal(reviewGap(state, s1, { digest: "d1" }), undefined);
  assert.match(reviewGap(state, s1, { digest: "d2" }) ?? "", /changed since/i);
  const partial = upsertReview(initialState(), addRound(startReview(s1, 3), round([])));
  assert.match(reviewGap(partial, s1, { digest: "d1" }) ?? "", /1\/3/);
  const open = upsertReview(
    initialState(),
    addRound(startReview(s1, 3), round([finding("blocking")])),
  );
  assert.match(reviewGap(open, s1, { digest: "d1" }) ?? "", /fix/i);
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

test("adoptSeverity follows Jev only when confident and only upward or sideways", () => {
  const f = finding("blocking");
  assert.deepEqual(adoptSeverity(f, { severity: "nit", confidence: 0.5 }), { finding: f });
  assert.deepEqual(adoptSeverity(f, { severity: "blocking", confidence: 0.99 }), { finding: f });
  assert.deepEqual(adoptSeverity(f, undefined), { finding: f });
  const lowered = adoptSeverity(f, { severity: "false-positive", confidence: 0.95 });
  assert.equal(lowered.finding.severity, "blocking");
  assert.match(lowered.note ?? "", /suggests false-positive/);
  const raised = adoptSeverity(finding("nit"), { severity: "should-fix", confidence: 0.9 });
  assert.equal(raised.finding.severity, "should-fix");
  assert.match(raised.note ?? "", /nit → should-fix/);
  const sideways = adoptSeverity(finding("should-fix"), { severity: "blocking", confidence: 0.9 });
  assert.equal(sideways.finding.severity, "blocking");
});

test("a smaller diff made only of reviewed files is still covered (commit in parts)", () => {
  const reviewed = [1, 2, 3].reduce(
    (r) => addRound(r, { ...round([]), files: { "a.ts": "1", "b.ts": "2" } }),
    startReview(s1, 3),
  );
  const state = upsertReview(initialState(), reviewed);
  assert.equal(reviewGap(state, s1, { digest: "other", files: { "b.ts": "2" } }), undefined);
  assert.match(
    reviewGap(state, s1, { digest: "other", files: { "b.ts": "9" } }) ?? "",
    /changed since/,
  );
  assert.match(
    reviewGap(state, s1, { digest: "other", files: { "c.ts": "1" } }) ?? "",
    /changed since/,
  );
  assert.match(reviewGap(state, s1, { digest: "other" }) ?? "", /changed since/);
});

test("splitDiffByFile keys each file's section by its new path", () => {
  const diff = "diff --git a/a.ts b/a.ts\n+1\ndiff --git a/old b/new dir/b.ts\n+2";
  const parts = splitDiffByFile(diff);
  assert.deepEqual(Object.keys(parts), ["a.ts", "new dir/b.ts"]);
  assert.match(parts["a.ts"] ?? "", /\+1/);
});

test("splitDiffByFile keeps git-quoted paths as their own section", () => {
  const diff =
    'diff --git "a/na\\303\\257ve.md" "b/na\\303\\257ve.md"\n+1\ndiff --git a/b.ts b/b.ts\n+2';
  assert.equal(Object.keys(splitDiffByFile(diff)).length, 2);
  assert.match(Object.values(splitDiffByFile(diff))[0] ?? "", /\+1/);
});

test("nitLines reports only nits, or nothing", () => {
  assert.deepEqual(nitLines([finding("blocking")]), []);
  const lines = nitLines([finding("nit"), finding("should-fix", "types-2")]);
  assert.match(lines.join("\n"), /fix each now, or drop it and say why/);
  assert.match(lines.join("\n"), /a\.ts:3/);
  assert.doesNotMatch(lines.join("\n"), /types-2/);
});

test("reviewerTask carries the slice, lenses, diff range and packet format", () => {
  const task = reviewerTask({ slice: s1, round: 2, lenses: ["types", "tests"], diffRange: "HEAD" });
  for (const part of [
    "s1",
    "round 2",
    "types, tests",
    "git diff HEAD",
    "git ls-files --others --exclude-standard",
    "### Verdict",
    "Do not modify",
    "blocking or should-fix, otherwise `no-blocking`",
    "`- none`",
  ]) {
    assert.ok(task.includes(part), part);
  }
});

test("splitDiffByFile undoes git's escapes in quoted paths so staged and untracked keys agree", () => {
  const diff =
    'diff --git "a/q\\"uote.txt" "b/q\\"uote.txt"\n+1\ndiff --git "a/t\\tab" "b/t\\tab"\n+2';
  assert.deepEqual(Object.keys(splitDiffByFile(diff)), ['q"uote.txt', "t\tab"]);
});

test("splitDiffByFile keys a path that contains ' b/' by its real path", () => {
  const diff =
    "diff --git a/my b/f.txt b/my b/f.txt\n+1\ndiff --git a/x a/y b/z.txt b/x a/y b/z.txt\n+2";
  assert.deepEqual(Object.keys(splitDiffByFile(diff)), ["my b/f.txt", "x a/y b/z.txt"]);
});
