import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer, ClassifierQuestion } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import { judgeTaskReadiness, READINESS_QUESTIONS } from "../../src/jev/questions/readiness.ts";
import type { TaskRecord } from "../../src/planning/task-record.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

const record: TaskRecord = {
  id: "T1",
  title: "Trim emails",
  goal: "Login succeeds with a trailing space.",
  files: ["src/auth/login.ts"],
  interfaces: "normalizeEmail(raw: string): string",
  firstFailingTest: 'test/auth/login.test.ts "trims" asserts login resolves',
  steps: ["a", "b", "c"],
  run: "npm test",
  expected: "1 test passes",
  outOfScope: "passwords",
};
const bool = (probability: number): ClassifierAnswer => ({ type: "bool", probability });
const answers = (over: Record<string, number> = {}): Record<string, ClassifierAnswer> =>
  Object.fromEntries(Object.keys(READINESS_QUESTIONS).map((k) => [k, bool(over[k] ?? 0.05)]));
const jevWith = (a: Record<string, ClassifierAnswer> | undefined, seen?: unknown[]): Jev => ({
  ask: async (state, _q: Record<string, ClassifierQuestion>) => {
    seen?.push(state);
    return a === undefined ? err({ kind: "provider", message: "x" }) : ok(a);
  },
  availability: () => "online",
  model: () => "fake/jev",
});

test("the command and expected result reach Jev and an unconcrete check is named", async () => {
  const seen: unknown[] = [];
  const r = await judgeTaskReadiness(jevWith(answers({ check: 0.9 }), seen), record);
  assert.deepEqual(r.ok && r.value, { readiness: "needs-detail", missing: ["check"] });
  assert.match(JSON.stringify(seen), /"run":"npm test"/);
  assert.match(JSON.stringify(seen), /"expected":"1 test passes"/);
});

test("nothing vague and not too big is ready with nothing missing", async () => {
  const r = await judgeTaskReadiness(jevWith(answers()), record);
  assert.deepEqual(r, { ok: true, value: { readiness: "ready", missing: [] } });
});

test("vague aspects make it needs-detail and are named", async () => {
  const r = await judgeTaskReadiness(jevWith(answers({ interfaces: 0.9, goal: 0.7 })), record);
  assert.deepEqual(r.ok && r.value, {
    readiness: "needs-detail",
    missing: ["goal", "interfaces"],
  });
});

test("too big wins over vague aspects", async () => {
  const r = await judgeTaskReadiness(jevWith(answers({ tooBig: 0.8, goal: 0.9 })), record);
  assert.equal(r.ok && r.value.readiness, "too-big");
});

test("the record is redacted before Jev sees it", async () => {
  const seen: unknown[] = [];
  await judgeTaskReadiness(jevWith(answers(), seen), {
    ...record,
    goal: "use ghp_abcdefghijklmnopqrstuvwxyz0123456789ab",
  });
  assert.doesNotMatch(JSON.stringify(seen), /ghp_abcdef/);
});

test("a missing or mistyped answer and Jev errors are errors", async () => {
  const { tooBig: _omitted, ...partial } = answers();
  assert.equal((await judgeTaskReadiness(jevWith(partial), record)).ok, false);
  const bad = {
    ...answers(),
    goal: { type: "score", score: 1, confidence: 1 } as ClassifierAnswer,
  };
  assert.equal((await judgeTaskReadiness(jevWith(bad), record)).ok, false);
  assert.equal((await judgeTaskReadiness(jevWith(undefined), record)).ok, false);
});

test("question text matches the fixture's pinned hash", () => {
  const combined = Object.values(READINESS_QUESTIONS).map(questionHash).join("");
  assert.equal(loadFixture("readiness").questionHash, combined);
});

test("readiness sees complete redacted context, including decisions beyond old clipping limits", async () => {
  const seen: unknown[] = [];
  const complete = {
    ...record,
    interfaces: `${"contract ".repeat(250)}Final decision: use the existing public API.`,
    steps: [`${"detail ".repeat(60)}Assert both boundary cases.`, "implement", "verify"],
    outOfScope: "No migration; use ghp_abcdefghijklmnopqrstuvwxyz0123456789ab",
  };
  await judgeTaskReadiness(jevWith(answers(), seen), complete);
  assert.match(JSON.stringify(seen), /Final decision: use the existing public API/);
  assert.match(JSON.stringify(seen), /Assert both boundary cases/);
  assert.match(JSON.stringify(seen), /No migration/);
  assert.doesNotMatch(JSON.stringify(seen), /ghp_abcdef/);
});

test("oversize context is not silently clipped or classified", async () => {
  const seen: unknown[] = [];
  const result = await judgeTaskReadiness(jevWith(answers(), seen), {
    ...record,
    interfaces: "x".repeat(40_000),
  });
  assert.equal(result.ok, false);
  assert.equal(seen.length, 0);
});
