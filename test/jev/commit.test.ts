import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import { judgeCommit } from "../../src/jev/questions/commit.ts";

const jevWith = (answers: Record<string, ClassifierAnswer> | undefined): Jev => ({
  ask: async () => (answers === undefined ? err({ kind: "provider", message: "x" }) : ok(answers)),
  availability: () => "online",
  model: () => "fake/jev",
});

const input = { message: "fix: x", diffStat: "a.ts | 2 +-", diff: "-a\n+b" };

test("judgeCommit returns both probabilities from one call", async () => {
  const jev = jevWith({
    rationale: { type: "bool", probability: 0.2 },
    mix: { type: "bool", probability: 0.9 },
  });
  assert.deepEqual(await judgeCommit(jev, input), {
    ok: true,
    value: { rationale: 0.2, mixesStructuralAndBehavioural: 0.9 },
  });
});

test("judgeCommit passes errors through and rejects wrong-typed answers", async () => {
  assert.equal((await judgeCommit(jevWith(undefined), input)).ok, false);
  const wrong = jevWith({
    rationale: { type: "bool", probability: 1 },
    mix: { type: "choice", choice: "a", probabilities: {}, confidence: 1 },
  });
  assert.equal((await judgeCommit(wrong, input)).ok, false);
});

test("judgeCommit sends secrets redacted and clips long diffs", async () => {
  let seen: Record<string, unknown> = {};
  const jev: Jev = {
    ask: async (state) => {
      seen = state;
      return ok({
        rationale: { type: "bool", probability: 1 },
        mix: { type: "bool", probability: 0 },
      });
    },
    availability: () => "online",
    model: () => "fake/jev",
  };
  await judgeCommit(jev, {
    message: "fix: x\n\nAuthorization: Bearer abcdef0123456789abcdef",
    diffStat: "",
    diff: "x".repeat(50_000),
  });
  assert.equal(String(seen.message).includes("abcdef0123456789abcdef"), false);
  assert.ok(String(seen.diff).length <= 8000);
});
