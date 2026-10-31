import assert from "node:assert/strict";
import test from "node:test";
import { judgeIntent } from "../../src/jev/questions/intent.ts";
import { loadFixture, realJev } from "../jev/fixture-runner.ts";

test("all evidence-bearing intent fixtures preserve continuation and unrelated-work boundaries", async () => {
  const jev = await realJev();
  const cases = loadFixture("intent").cases.filter((entry) => entry.state.recentEvidence);
  assert.equal(cases.length, 7, "exercise every newly added evidence-bearing boundary case");
  for (const entry of cases) {
    const result = await judgeIntent(jev, {
      prompt: entry.state.prompt ?? "",
      phase: entry.state.phase ?? "",
      activeSlice: entry.state.activeSlice ?? "",
      recentEvidence: entry.state.recentEvidence ?? "",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) assert.equal(result.value.intent, entry.expected, entry.state.prompt ?? "");
  }
});

test("the same repair prompt is classified using approved-goal evidence rather than wording alone", async () => {
  const jev = await realJev();
  for (const [recentEvidence, expected] of [
    [
      "Focused approved goal: repair JSON export. The reviewer found its required empty-output case fails; this repair is necessary to complete acceptance.",
      "continuation",
    ],
    [
      "Focused approved goal: update the help documentation only. The user now requests an unrelated repair to JSON export; no existing acceptance criterion covers it.",
      "fix",
    ],
  ] as const) {
    const result = await judgeIntent(jev, {
      prompt: "Fix the empty JSON export output",
      phase: "idle",
      recentEvidence,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) assert.equal(result.value.intent, expected, recentEvidence);
  }
});
