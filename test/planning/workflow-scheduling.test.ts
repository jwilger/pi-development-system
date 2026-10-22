import assert from "node:assert/strict";
import test from "node:test";
import { err } from "../../src/core/result.ts";
import { createRecordDepartureTool } from "../../src/gates/record-departure-tool.ts";
import { createBeginWorkTool } from "../../src/planning/begin-tool.ts";
import { createFinishSliceTool } from "../../src/planning/slice-close.ts";
import { createReviewRecordTool, createReviewStartTool } from "../../src/review/review-tools.ts";
import { createSubmissionStore } from "../../src/review/submissions.ts";
import { createSubmitReviewTool } from "../../src/review/submit-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

// These are public scheduler contracts consumed by pi, not assertions about source structure.
test("workflow and submission mutations opt into pi's shared sequential queue", () => {
  const fake = createFakePi();
  const state = createSessionState(fake.api);
  const deps = {
    pi: fake.api,
    state,
    submissions: createSubmissionStore(),
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    jev: () => ({
      ask: async () => err({ kind: "no-model" as const }),
      availability: () => "offline" as const,
      model: () => undefined,
    }),
  };
  for (const tool of [
    createBeginWorkTool(deps),
    createFinishSliceTool(deps),
    createRecordDepartureTool(deps),
    createReviewStartTool(deps),
    createReviewRecordTool(deps),
    createSubmitReviewTool(deps),
  ]) {
    assert.equal(tool.executionMode, "sequential", tool.name);
  }
});
