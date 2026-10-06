import assert from "node:assert/strict";
import test from "node:test";
import { createSessionState } from "../../src/state/session-state.ts";
import { registerTestEvidence } from "../../src/state/test-evidence.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const now = () => new Date("2026-10-06T17:12:00Z");

const setup = () => {
  const fake = createFakePi();
  const state = createSessionState(fake.api);
  registerTestEvidence({ pi: fake.api, state, now });
  const result = (command: string, text: string, isError: boolean, extra: object = {}) =>
    fake.emit({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "c1",
      input: { command },
      content: [{ type: "text", text }],
      isError,
      details: undefined,
      ...extra,
    } as never);
  return { state, result };
};

test("a failing test run is recorded with exit code and summary", async () => {
  const { state, result } = setup();
  await result("npm test", "1 passed\n2 failed\n\nCommand exited with code 1", true);
  assert.deepEqual(state.get().lastTestRun, {
    at: "2026-10-06T17:12:00.000Z",
    exitCode: 1,
    summary: "1 passed | 2 failed",
  });
});

test("a passing run replaces a failing one", async () => {
  const { state, result } = setup();
  await result("cargo test", "boom\nCommand exited with code 101", true);
  await result("cargo test", "test result: ok. 3 passed", false);
  assert.equal(state.get().lastTestRun?.exitCode, 0);
});

test("commands that are not test runners are ignored", async () => {
  const { state, result } = setup();
  await result("npm run build", "ok", false);
  assert.equal(state.get().lastTestRun, undefined);
});

test("results of other tools are ignored", async () => {
  const { state, result } = setup();
  await result("npm test", "ok", false, { toolName: "read" });
  assert.equal(state.get().lastTestRun, undefined);
});

test("image content is skipped when summarising", async () => {
  const { state, result } = setup();
  await result("npm test", "", false, {
    content: [{ type: "image", data: "x", mimeType: "image/png" }],
  });
  assert.equal(state.get().lastTestRun?.summary, "");
});
