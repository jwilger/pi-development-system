import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  judgeSolutionDetail,
  SOLUTION_DETAIL_QUESTION,
} from "../../src/jev/questions/solution-detail.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

const jevWith = (answers: Record<string, ClassifierAnswer> | undefined): Jev => ({
  ask: async () => (answers === undefined ? err({ kind: "provider", message: "x" }) : ok(answers)),
  availability: () => "online",
  model: () => "fake/jev",
});

test("the probability that the brief carries solution detail is returned", async () => {
  const jev = jevWith({ solution: { type: "bool", probability: 0.9 } });
  assert.deepEqual(await judgeSolutionDetail(jev, { brief: "b" }), { ok: true, value: 0.9 });
});

test("an error is passed through and a wrong-typed answer is refused", async () => {
  assert.equal((await judgeSolutionDetail(jevWith(undefined), { brief: "b" })).ok, false);
  const wrong = jevWith({
    solution: { type: "choice", choice: "a", probabilities: {}, confidence: 1 },
  });
  assert.equal((await judgeSolutionDetail(wrong, { brief: "b" })).ok, false);
});

test("secrets are redacted and a long brief is clipped before Jev sees it", async () => {
  let seen: Record<string, unknown> = {};
  const jev: Jev = {
    ask: async (state) => {
      seen = state;
      return ok({ solution: { type: "bool", probability: 0 } });
    },
    availability: () => "online",
    model: () => "fake/jev",
  };
  await judgeSolutionDetail(jev, {
    brief: `Authorization: Bearer abcdef0123456789abcdef ${"x".repeat(50_000)}`,
  });
  assert.equal(String(seen.brief).includes("abcdef0123456789abcdef"), false);
  assert.ok(String(seen.brief).length <= 8000);
});

test("the solution-detail fixture is pinned to the current question and has enough cases", () => {
  const fixture = loadFixture("solution-detail");
  assert.equal(fixture.questionHash, questionHash({ ...SOLUTION_DETAIL_QUESTION }));
  assert.ok(fixture.cases.length >= 10);
});
