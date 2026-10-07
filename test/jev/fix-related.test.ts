import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  FIX_RELATED_QUESTION,
  FIX_RELATED_THRESHOLD,
  judgeFixRelated,
} from "../../src/jev/questions/fix-related.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

const jevAnswering = (answers: Record<string, ClassifierAnswer>) => {
  const seen: Record<string, string>[] = [];
  const jev: Jev = {
    ask: async (state) => {
      seen.push(state as Record<string, string>);
      return ok(answers);
    },
    availability: () => "online",
    model: () => "fake/jev",
  };
  return { jev, seen };
};
const input = { diff: "d", failingLog: "l", message: "fix: m" };

test("judgeFixRelated returns the probability", async () => {
  const { jev } = jevAnswering({ related: { type: "bool", probability: 0.8 } });
  const r = await judgeFixRelated(jev, input);
  assert.deepEqual(r, { ok: true, value: 0.8 });
  assert.equal(FIX_RELATED_THRESHOLD, 0.6);
});

test("judgeFixRelated redacts secrets and clips long input", async () => {
  const { jev, seen } = jevAnswering({ related: { type: "bool", probability: 1 } });
  await judgeFixRelated(jev, {
    diff: `${"x".repeat(20_000)}`,
    failingLog: "Authorization: Bearer abcdef0123456789abcdef",
    message: "fix: m",
  });
  assert.equal(String(seen[0]?.failingLog).includes("abcdef0123456789abcdef"), false);
  assert.ok(String(seen[0]?.diff).length <= 8000);
});

test("judgeFixRelated passes errors through and rejects wrong-typed answers", async () => {
  const offline: Jev = {
    ask: async () => err({ kind: "no-model" }),
    availability: () => "offline",
    model: () => undefined,
  };
  assert.deepEqual(await judgeFixRelated(offline, input), {
    ok: false,
    error: { kind: "no-model" },
  });
  const wrong = jevAnswering({
    related: { type: "choice", choice: "a", probabilities: {}, confidence: 1 },
  });
  assert.equal((await judgeFixRelated(wrong.jev, input)).ok, false);
});

test("the fix-related fixture is pinned to the current question", () => {
  assert.equal(loadFixture("fix-related").questionHash, questionHash({ ...FIX_RELATED_QUESTION }));
});
