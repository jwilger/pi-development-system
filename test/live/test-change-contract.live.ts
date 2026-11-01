import assert from "node:assert/strict";
import test from "node:test";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { withReasoningFallback } from "../../src/jev/cascade.ts";
import { judgeTestChange } from "../../src/jev/questions/test-change.ts";
import { createReasoningAssessor } from "../../src/jev/reasoning.ts";
import { loadFixture, realJev } from "../jev/fixture-runner.ts";

test("D40 additive coverage resolves both questions through the real production cascade", {
  timeout: 120_000,
}, async () => {
  const fixture = loadFixture("test-change").cases.find((c) =>
    c.state.contractEvidence?.startsWith("D40 approved:"),
  );
  assert.ok(
    fixture,
    "The approved D40 contract must remain a mandatory case, not an aggregate allowance",
  );
  const modelRegistry = new ModelRegistry(await ModelRuntime.create());
  const jev = withReasoningFallback(
    await realJev(),
    createReasoningAssessor({ cwd: process.cwd(), modelRegistry }),
  );
  const result = await judgeTestChange(jev, {
    path: fixture.state.path ?? "",
    before: fixture.state.before ?? "",
    after: fixture.state.after,
    contractEvidence: fixture.state.contractEvidence,
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok(result.value.weakens <= 0.2, JSON.stringify(result.value));
  assert.equal(result.value.motive, "refactor");
  assert.ok(result.value.confidence >= 0.8, JSON.stringify(result.value));
});
