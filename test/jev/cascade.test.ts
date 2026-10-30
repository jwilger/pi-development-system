import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer, ClassifierQuestion } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import { withReasoningFallback } from "../../src/jev/cascade.ts";
import type { Jev } from "../../src/jev/client.ts";

const questions: Record<string, ClassifierQuestion> = {
  motive: {
    type: "choice",
    instructions: "Why change this test?",
    criteria: {
      "test-correction": "Fix an incorrect expectation without losing coverage",
      "gate-gaming": "Hide a regression",
      unclear: "Insufficient evidence",
    },
  },
};
const corrected: Record<string, ClassifierAnswer> = {
  motive: {
    type: "choice",
    choice: "test-correction",
    probabilities: { "test-correction": 0.96, "gate-gaming": 0.02, unclear: 0.02 },
    confidence: 0.94,
  },
};
const uncertain: Jev = {
  availability: () => "online",
  model: () => "typesafe/jev-latest",
  ask: async () =>
    ok({
      motive: {
        type: "choice",
        choice: "unclear",
        probabilities: { "test-correction": 0.3, "gate-gaming": 0.3, unclear: 0.4 },
        confidence: 0.1,
      },
    }),
};

test("ambiguous test correction reaches reasoning with evidence before returning an answer", async () => {
  const seen: unknown[] = [];
  const jev = withReasoningFallback(uncertain, async (evidence, asked) => {
    seen.push({ state: evidence, asked });
    return ok(corrected);
  });
  const state = {
    before: "height=5; padded rows",
    after: "height=5; exact rows without invented padding",
  };
  assert.deepEqual(await jev.ask(state, questions), ok(corrected));
  assert.deepEqual(seen, [{ state, asked: questions }]);
});

test("contradictory categorical answers reach reasoning instead of selecting an unsafe label", async () => {
  let calls = 0;
  const jev = withReasoningFallback(
    {
      ...uncertain,
      ask: async () =>
        ok({
          motive: {
            type: "choice",
            choice: "test-correction",
            confidence: 0.99,
            probabilities: { "test-correction": 0, "gate-gaming": 1, unclear: 0 },
          },
        }),
    },
    async () => {
      calls++;
      return ok(corrected);
    },
  );
  assert.deepEqual(await jev.ask({}, questions), ok(corrected));
  assert.equal(calls, 1);
});

test("confident answers do not pay for reasoning", async () => {
  const jev = withReasoningFallback({ ...uncertain, ask: async () => ok(corrected) }, async () => {
    assert.fail("unexpected reasoning call");
  });
  assert.deepEqual(await jev.ask({}, questions), ok(corrected));
});

test("classifier unavailability reaches reasoning, but cancellation and accounting failure do not", async () => {
  for (const kind of ["no-model", "timeout", "aborted", "usage-recording"] as const) {
    let calls = 0;
    const error = kind === "usage-recording" ? { kind, message: "ledger failed" } : { kind };
    const jev = withReasoningFallback({ ...uncertain, ask: async () => err(error) }, async () => {
      calls++;
      return ok(corrected);
    });
    const result = await jev.ask({}, questions);
    assert.equal(calls, kind === "aborted" || kind === "usage-recording" ? 0 : 1);
    assert.equal(result.ok, calls === 1);
  }
});

test("unresolved reasoning returns an error rather than inventing certainty", async () => {
  const jev = withReasoningFallback(uncertain, async () => uncertain.ask({}, questions));
  const result = await jev.ask({}, questions);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "assessment-unresolved");
});

test("reasoning exceptions become actionable unresolved results", async () => {
  const jev = withReasoningFallback(uncertain, async () => {
    throw new Error("provider bug");
  });
  const result = await jev.ask({}, questions);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "assessment-unresolved");
});

test("ambiguous booleans and scores and malformed answers all reach reasoning", async () => {
  for (const answer of [
    { type: "bool", probability: 0.5 },
    { type: "bool", probability: 0.72 },
    { type: "score", score: 0.6, confidence: 0.75 },
    { type: "score", score: 0.5, confidence: 0.2 },
    { type: "bool", probability: Number.NaN },
  ] as const) {
    const question: ClassifierQuestion =
      answer.type === "score"
        ? { type: "score", instructions: "Degree?", criteria: ["no", "yes"] }
        : { type: "bool", instructions: "Applies?", criteria: { true: "yes", false: "no" } };
    let calls = 0;
    const jev = withReasoningFallback(
      { ...uncertain, ask: async () => ok({ q: answer }) },
      async () => {
        calls++;
        return err({ kind: "assessment-unresolved", message: "Need more evidence" });
      },
    );
    assert.equal((await jev.ask({}, { q: question })).ok, false);
    assert.equal(calls, 1);
  }
});
