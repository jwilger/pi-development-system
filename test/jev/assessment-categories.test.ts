import assert from "node:assert/strict";
import test from "node:test";
import { parseAssessment } from "../../src/jev/reasoning.ts";

const questions = {
  motive: {
    type: "choice" as const,
    instructions: "Purpose?",
    criteria: { refactor: "Retained coverage", unclear: "Insufficient evidence" },
  },
};
for (const [name, response, category] of [
  [
    "missing contract",
    { status: "unresolved", reason: "Need requirement D40" },
    "insufficient-evidence",
  ],
  [
    "unclear motive",
    {
      status: "resolved",
      reason: "Uncertain purpose",
      answers: {
        motive: {
          type: "choice",
          choice: "unclear",
          confidence: 0.9,
          probabilities: { refactor: 0.1, unclear: 0.9 },
        },
      },
    },
    "insufficient-evidence",
  ],
  [
    "low confidence",
    {
      status: "resolved",
      reason: "Low confidence",
      answers: {
        motive: {
          type: "choice",
          choice: "refactor",
          confidence: 0.6,
          probabilities: { refactor: 0.6, unclear: 0.4 },
        },
      },
    },
    "insufficient-evidence",
  ],
  [
    "contradictory chosen answer",
    {
      status: "resolved",
      reason: "Contradictory distribution",
      answers: {
        motive: {
          type: "choice",
          choice: "refactor",
          confidence: 0.9,
          probabilities: { refactor: 0.1, unclear: 0.9 },
        },
      },
    },
    "invalid-output",
  ],
  ["missing answer", { status: "resolved", reason: "Invalid", answers: {} }, "invalid-output"],
  ["malformed schema", { status: "resolved" }, "invalid-output"],
] as const) {
  test(`typed category distinguishes ${name}`, () => {
    const result = parseAssessment(JSON.stringify(response), questions);
    assert.ok(!result.ok && result.error.kind === "assessment-unresolved");
    assert.equal(result.error.category, category);
  });
}
