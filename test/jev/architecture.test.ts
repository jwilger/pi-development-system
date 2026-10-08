import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  ARCHITECTURE_QUESTION,
  judgeArchitectureShaping,
} from "../../src/jev/questions/architecture.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

const jevWith = (answers: Record<string, ClassifierAnswer> | undefined): Jev => ({
  ask: async () => (answers === undefined ? err({ kind: "provider", message: "x" }) : ok(answers)),
  availability: () => "online",
  model: () => "fake/jev",
});

const input = { diffStat: "src/a.ts | 2 +-", diff: "-a\n+b" };

test("the probability that the diff shapes the architecture is returned", async () => {
  const jev = jevWith({ architecture: { type: "bool", probability: 0.8 } });
  assert.deepEqual(await judgeArchitectureShaping(jev, input), { ok: true, value: 0.8 });
});

test("an error is passed through and a wrong-typed answer is refused", async () => {
  assert.equal((await judgeArchitectureShaping(jevWith(undefined), input)).ok, false);
  const wrong = jevWith({
    architecture: { type: "choice", choice: "a", probabilities: {}, confidence: 1 },
  });
  assert.equal((await judgeArchitectureShaping(wrong, input)).ok, false);
});

test("secrets are redacted and a long diff is clipped before Jev sees it", async () => {
  let seen: Record<string, unknown> = {};
  const jev: Jev = {
    ask: async (state) => {
      seen = state;
      return ok({ architecture: { type: "bool", probability: 0 } });
    },
    availability: () => "online",
    model: () => "fake/jev",
  };
  await judgeArchitectureShaping(jev, {
    diffStat: "Authorization: Bearer abcdef0123456789abcdef",
    diff: "x".repeat(50_000),
  });
  assert.equal(String(seen.diffStat).includes("abcdef0123456789abcdef"), false);
  assert.ok(String(seen.diff).length <= 8000);
});

test("the architecture fixture is pinned to the current question", () => {
  assert.equal(
    loadFixture("architecture-shaping").questionHash,
    questionHash({ ...ARCHITECTURE_QUESTION }),
  );
});
