import assert from "node:assert/strict";
import test from "node:test";
import { SHELL_INTENT_QUESTION } from "../../src/jev/questions/shell-intent.ts";
import { parseAssessment } from "../../src/jev/reasoning.ts";

test("reasoning rejects a shell answer that labels a force push ordinary", () => {
  const result = parseAssessment(
    JSON.stringify({
      status: "resolved",
      reason: "contradictory",
      answers: {
        intent: {
          type: "choice",
          choice: "ordinary",
          confidence: 0.99,
          probabilities: Object.fromEntries(
            Object.keys(SHELL_INTENT_QUESTION.criteria).map((label) => [
              label,
              label === "force-push" ? 1 : 0,
            ]),
          ),
        },
      },
    }),
    { intent: SHELL_INTENT_QUESTION },
  );
  assert.equal(result.ok, false);
});

const questions = {
  weakens: {
    type: "bool" as const,
    instructions: "Coverage lost?",
    criteria: { true: "yes", false: "no" },
  },
};

test("reasoning requires evidence and valid answers; unresolved is an explicit error", () => {
  const resolved = parseAssessment(
    JSON.stringify({
      status: "resolved",
      reason: "Exact assertions remain; only invented padding is removed.",
      answers: { weakens: { type: "bool", probability: 0.02 } },
    }),
    questions,
  );
  assert.equal(resolved.ok, true);
  for (const text of [
    "not json",
    '{"status":"resolved","reason":"","answers":{"weakens":{"type":"bool","probability":0}}}',
    '{"status":"resolved","reason":"ok","answers":{"weakens":{"type":"bool","probability":2}}}',
    '{"status":"resolved","reason":"ok","answers":{}}',
    '{"status":"unresolved","reason":"The required behavior is not in evidence."}',
  ]) {
    const parsed = parseAssessment(text, questions);
    assert.equal(parsed.ok, false, text);
    if (!parsed.ok) assert.equal(parsed.error.kind, "assessment-unresolved");
  }
});
