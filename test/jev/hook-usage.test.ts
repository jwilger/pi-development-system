import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { Usage } from "@earendil-works/pi-ai";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const usage: Usage = {
  input: 5,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 6,
  cost: { input: 0.05, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.06 },
};

function setup(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "devsys-hook-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  });
  const fake = createFakePi({
    cwd: root,
    hasUI: false,
    classifiers: ["typesafe/jev-latest"],
    classifyUsage: usage,
    classifyAnswers: {
      intent: {
        type: "choice",
        choice: "new-work",
        confidence: 0.9,
        probabilities: { "new-work": 0.9 },
      },
    },
  });
  createDevelopmentSystem(fake.api);
  const prompt = () =>
    fake.emitAll({
      type: "before_agent_start",
      messageType: "user",
      prompt: "Build a calculator",
      systemPrompt: "",
      systemPromptOptions: {
        cwd: root,
        sections: {},
        appendSystemPrompt: "",
        promptGuidelines: [],
        selectedTools: [],
        hiddenTools: [],
        toolSnippets: {},
        toolGuidelines: {},
        contextFiles: [],
        skills: [],
      },
    });
  return { fake, prompt };
}

test("hook classifiers persist separate telemetry once and never rebill a cached answer", async (t) => {
  const { fake, prompt } = setup(t);
  await prompt();
  const entries = fake.entries.filter((entry) => entry.customType === "devsys-jev-hook-usage");
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0]?.data, {
    source: "intent",
    accounting: "custom-only",
    model: "typesafe/jev-latest",
    usage,
  });
  await prompt();
  assert.equal(fake.classifyCalls.count, 1);
  assert.equal(
    fake.entries.filter((entry) => entry.customType === "devsys-jev-hook-usage").length,
    1,
  );
});

test("an already-cancelled git hook blocks without asking for approval", async (t) => {
  const { fake } = setup(t);
  const controller = new AbortController();
  controller.abort();
  fake.ui.hasUI = true;
  Object.assign(fake.ctx, { signal: controller.signal });
  const results = await fake.emitAll({
    type: "tool_call",
    toolName: "bash",
    toolCallId: "cancelled-git",
    input: { command: "xargs git push" },
  });
  assert.match(JSON.stringify(results), /command classification cancelled/);
  assert.equal(fake.classifyCalls.count, 0);
  assert.equal(fake.ui.calls.filter((call) => call.kind === "confirm").length, 0);
});

test("a cancelled hook uses the current context signal without paying for a request", async (t) => {
  const { fake, prompt } = setup(t);
  const controller = new AbortController();
  controller.abort();
  Object.assign(fake.ctx, { signal: controller.signal });
  await prompt();
  assert.equal(fake.classifyCalls.count, 0);
  assert.equal(
    fake.entries.filter((entry) => entry.customType === "devsys-jev-hook-usage").length,
    0,
  );
});
