import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { createDevelopmentSystem } from "../extensions/development-system.ts";
import { registerTurnVerifier } from "../src/context/turn-verifier.ts";
import { ok } from "../src/core/result.ts";
import type { Jev } from "../src/jev/client.ts";
import { createSessionState } from "../src/state/session-state.ts";
import { createFakePi, type NestedRunner } from "./harness/fake-pi.ts";

// A codemode script calls `tools.bash(...)` / `tools.edit(...)`. pi runs those nested calls through
// the same tool_call and tool_result handlers as model-issued calls, so every guard must hold.

const TEST_FILE = "test/a.test.ts";
const ORIGINAL = "test('adds', () => {\n  assert.equal(add(1, 2), 3);\n});\n";
const succeed: NestedRunner = () => ({ text: "ok", isError: false });

const setup = (hasUI: boolean, run: NestedRunner = succeed) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-nested-"));
  mkdirSync(join(cwd, "test"));
  writeFileSync(join(cwd, TEST_FILE), ORIGINAL);
  const fake = createFakePi({ hasUI, cwd });
  const system = createDevelopmentSystem(fake.api);
  return { fake, system, script: fake.nestedExecutor("script-1", run) };
};

test("a nested force push is hard-stopped like a direct one", async () => {
  const { script } = setup(false);
  const result = await script("bash", { command: "git push --force origin main" });
  assert.equal(result.blocked, true);
  assert.match(result.reason ?? "", /hard stop git\.force-push/);
});

test("a nested force push asks the user, and an approval lets it run", async () => {
  const { fake, script } = setup(true);
  fake.ui.confirmResponses.push(true);
  const result = await script("bash", { command: "git push --force origin main" });
  assert.equal(result.blocked, false);
  assert.equal(fake.ui.calls.filter((c) => c.kind === "confirm").length, 1);
});

test("a nested edit that skips a test is blocked by the test guard", async () => {
  const { script } = setup(false);
  const result = await script("edit", {
    path: TEST_FILE,
    edits: [{ oldText: "test('adds'", newText: "test.skip('adds'" }],
  });
  assert.equal(result.blocked, true);
  assert.match(result.reason ?? "", /tests\.weaken/);
});

test("a nested rm of a test file is blocked by the test guard", async () => {
  const { script } = setup(false);
  const result = await script("bash", { command: `rm ${TEST_FILE}` });
  assert.equal(result.blocked, true);
  assert.match(result.reason ?? "", /tests\.weaken/);
});

test("a nested commit without a rationale is blocked by the commit guard", async () => {
  const { script } = setup(false);
  const result = await script("bash", { command: 'git commit -m "wip"' });
  assert.equal(result.blocked, true);
});

test("a nested test run is recorded as test evidence, and a nested failure is a failure", async () => {
  const run: NestedRunner = (_tool, input) =>
    input.command === "npm test"
      ? { text: "1 passed\n2 failed\n\nCommand exited with code 1", isError: true }
      : { text: "# pass 3", isError: false };
  const { system, script } = setup(false, run);
  await script("bash", { command: "npm test" });
  assert.equal(system.state.get().lastTestRun?.exitCode, 1);
  await script("bash", { command: "node --test" });
  assert.equal(system.state.get().lastTestRun?.exitCode, 0);
});

test("a claim after a nested green run reaches Jev with that run as evidence", async () => {
  const fake = createFakePi();
  const state = createSessionState(fake.api);
  state.update((s) => ({ ...s, phase: "implementing" }));
  const seen: unknown[] = [];
  const jev: Jev = {
    ask: async (s) => {
      seen.push(s);
      return ok({
        claim: { type: "bool", probability: 0.1 },
        drift: { type: "bool", probability: 0 },
      } satisfies Record<string, ClassifierAnswer>);
    },
    availability: () => "online",
    model: () => "fake/jev",
  };
  registerTurnVerifier({ pi: fake.api, state, jev: () => jev, maxPerSession: () => 6 });
  const script = fake.nestedExecutor("script-1", () => ({ text: "# pass 3", isError: false }));
  await script("bash", { command: "node --test" });
  const outcome = await fake.emit({
    type: "turn_end",
    outcome: "completed",
    turnIndex: 0,
    message: { role: "assistant", content: [{ type: "text", text: "All tests pass." }] },
    toolResults: [],
  } as never);
  assert.equal(outcome, undefined);
  assert.match(JSON.stringify(seen), /node --test/);
});
