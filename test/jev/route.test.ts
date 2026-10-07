import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  DIFFICULTY_QUESTION,
  judgeTaskRouting,
  medianLabel,
  RISK_QUESTION,
} from "../../src/jev/questions/route.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

const choice = (label: string, confidence: number): ClassifierAnswer => ({
  type: "choice",
  choice: label,
  probabilities: {},
  confidence,
});
const jevWith = (answers: Record<string, ClassifierAnswer> | undefined): Jev => ({
  ask: async () => (answers === undefined ? err({ kind: "provider", message: "x" }) : ok(answers)),
  availability: () => "online",
  model: () => "fake/jev",
});

test("a confident judgement is returned as given", async () => {
  const jev = jevWith({ difficulty: choice("complex", 0.9), risk: choice("high", 0.8) });
  assert.deepEqual(await judgeTaskRouting(jev, { task: "t", filesTouched: [] }), {
    ok: true,
    value: { difficulty: "complex", risk: "high", confidence: 0.8 },
  });
});

test("ordinal answers use the weighted median, not the argmax", async () => {
  const spread: ClassifierAnswer = {
    type: "choice",
    choice: "expert",
    probabilities: { trivial: 0.1, routine: 0.2, complex: 0.3, expert: 0.4 },
    confidence: 0.4,
  };
  const jev = jevWith({ difficulty: spread, risk: choice("low", 0.9) });
  const r = await judgeTaskRouting(jev, { task: "t", filesTouched: [] });
  assert.equal(r.ok && r.value.difficulty, "complex");
});

test("medianLabel falls back to the label without probabilities and rejects unknown ones", () => {
  const levels = ["low", "medium", "high"] as const;
  assert.equal(medianLabel(levels, { choice: "high", probabilities: {} }), "high");
  assert.equal(medianLabel(levels, { choice: "bogus", probabilities: {} }), undefined);
  assert.equal(
    medianLabel(levels, { choice: "low", probabilities: { low: 0.4, medium: 0.4, high: 0.2 } }),
    "medium",
  );
});

test("unknown labels and wrong answer kinds are provider errors; Jev errors pass through", async () => {
  const bad = jevWith({ difficulty: choice("legendary", 0.9), risk: choice("low", 0.9) });
  assert.equal((await judgeTaskRouting(bad, { task: "t", filesTouched: [] })).ok, false);
  const wrong = jevWith({ difficulty: { type: "bool", probability: 1 }, risk: choice("low", 1) });
  assert.equal((await judgeTaskRouting(wrong, { task: "t", filesTouched: [] })).ok, false);
  assert.equal(
    (await judgeTaskRouting(jevWith(undefined), { task: "t", filesTouched: [] })).ok,
    false,
  );
});

test("the task text is redacted and clipped before it reaches Jev", async () => {
  let seen: Record<string, unknown> = {};
  const jev: Jev = {
    ask: async (state) => {
      seen = state;
      return ok({ difficulty: choice("routine", 1), risk: choice("low", 1) });
    },
    availability: () => "online",
    model: () => "fake/jev",
  };
  await judgeTaskRouting(jev, {
    task: `deploy with ghp_${"a".repeat(36)} ${"x".repeat(20000)}`,
    filesTouched: ["a.ts"],
  });
  assert.ok(!String(seen.task).includes("ghp_"));
  assert.ok(String(seen.task).length <= 4000);
});

const hash = () => questionHash({ ...DIFFICULTY_QUESTION }) + questionHash({ ...RISK_QUESTION });

test("fixture pins the current question text", () => {
  assert.equal(loadFixture("route").questionHash, hash());
});

test("medianLabel: an exact tie resolves to the higher level", async () => {
  const { medianLabel } = await import("../../src/jev/questions/route.ts");
  assert.equal(
    medianLabel(["low", "medium", "high"], {
      choice: "low",
      probabilities: { low: 0.5, medium: 0, high: 0.5 },
    }),
    "high",
  );
});
