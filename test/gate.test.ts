import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ChainEntry,
  type CommitInfo,
  classifyChain,
  evaluateBrokenRange,
} from "../scripts/lib/gate.ts";

const e = (sha: string, state: ChainEntry["state"], runId?: number): ChainEntry =>
  runId === undefined ? { sha, state } : { sha, state, runId };

test("green when the newest commit passed", () => {
  assert.deepEqual(classifyChain([e("c", "success")]), { kind: "green" });
});

test("broken: reports oldest failure as the break and newest for logs", () => {
  const s = classifyChain([
    e("c", "failure", 3),
    e("b", "none"),
    e("a", "failure", 1),
    e("0", "success"),
  ]);
  assert.equal(s.kind, "broken");
  if (s.kind === "broken") {
    assert.equal(s.breakSha, "a");
    assert.equal(s.failure.runId, 3);
  }
});

test("pending when nothing failed but a run is in flight", () => {
  assert.deepEqual(classifyChain([e("b", "pending"), e("a", "success")]), {
    kind: "pending",
    sha: "b",
  });
});

test("broken wins over pending (fixes may stack on an in-flight fix)", () => {
  assert.equal(classifyChain([e("b", "pending"), e("a", "failure")]).kind, "broken");
});

test("unverified history is treated as green", () => {
  assert.deepEqual(classifyChain([e("b", "none"), e("a", "none")]), { kind: "green" });
});

const c = (sha: string | null, message: string, isNew = true): CommitInfo => ({
  sha,
  message,
  isNew,
});

test("fix(ci) commits are allowed and need a relevance check when new", () => {
  const v = evaluateBrokenRange([
    c("a".repeat(40), "fix(ci): one", false),
    c(null, "fix(ci): two"),
  ]);
  assert.deepEqual(v.violations, []);
  assert.equal(v.needsRelevance.length, 1);
});

test("a non-fix commit is a violation", () => {
  const v = evaluateBrokenRange([c("b".repeat(40), "feat: new", false), c(null, "fix(ci): x")]);
  assert.equal(v.violations.length, 1);
});

test("a reverted violation no longer counts, and the revert needs a relevance check", () => {
  const bad = "b".repeat(40);
  const v = evaluateBrokenRange([
    c(bad, "feat: new", false),
    c(null, `Revert "feat: new"\n\nThis reverts commit ${bad}.`),
  ]);
  assert.deepEqual(v.violations, []);
  assert.equal(v.needsRelevance.length, 1);
});

test("abbreviated sha in a revert message still matches", () => {
  const bad = "bcdef01".padEnd(40, "2");
  const v = evaluateBrokenRange([
    c(bad, "feat: new", false),
    c(null, 'Revert "feat: new"\n\nThis reverts commit bcdef01.'),
  ]);
  assert.deepEqual(v.violations, []);
});
