import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  judgeTestChange,
  MOTIVE_QUESTION,
  motiveFromChoice,
  WEAKENS_QUESTION,
} from "../../src/jev/questions/test-change.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

const jevWith = (answers: Record<string, ClassifierAnswer> | undefined): Jev => ({
  ask: async () => (answers === undefined ? err({ kind: "provider", message: "x" }) : ok(answers)),
  availability: () => "online",
  model: () => "fake/jev",
});

test("motive confidence below 0.6 maps to unclear; unknown label too", () => {
  assert.equal(motiveFromChoice("gate-gaming", 0.59), "unclear");
  assert.equal(motiveFromChoice("gate-gaming", 0.6), "gate-gaming");
  assert.equal(motiveFromChoice("bogus", 0.99), "unclear");
});

test("judgeTestChange combines the weakens probability and the motive", async () => {
  const jev = jevWith({
    weakens: { type: "bool", probability: 0.85 },
    motive: { type: "choice", choice: "gate-gaming", probabilities: {}, confidence: 0.9 },
  });
  assert.deepEqual(await judgeTestChange(jev, { path: "test/a.test.ts", before: "x" }), {
    ok: true,
    value: { weakens: 0.85, motive: "gate-gaming", confidence: 0.9 },
  });
});

test("judgeTestChange passes Jev errors through and rejects wrong-typed answers", async () => {
  assert.equal((await judgeTestChange(jevWith(undefined), { path: "t" })).ok, false);
  const wrong = jevWith({ weakens: { type: "bool", probability: 1 } });
  assert.equal((await judgeTestChange(wrong, { path: "t" })).ok, false);
});

const hash = () => questionHash({ ...MOTIVE_QUESTION }) + questionHash({ ...WEAKENS_QUESTION });

test("fixture pins the current question text", () => {
  assert.equal(loadFixture("test-change").questionHash, hash());
});

test("changeWindow keeps the changed region of a large file visible", async () => {
  const { changeWindow } = await import("../../src/jev/questions/test-change.ts");
  const body = Array.from({ length: 400 }, (_, i) => `line ${i}`);
  const after = [...body.slice(0, 399), "it.skip('last')"];
  const w = changeWindow(body.join("\n"), after.join("\n"));
  assert.match(w.before, /line 399/);
  assert.match(w.after, /it\.skip\('last'\)/);
  assert.ok(w.before.split("\n").length <= 100);
});
