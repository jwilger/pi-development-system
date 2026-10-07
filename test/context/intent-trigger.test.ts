import assert from "node:assert/strict";
import test from "node:test";
import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import { INTENT_AT, intentGuideline } from "../../src/context/intent-trigger.ts";
import { createFakePi } from "../harness/fake-pi.ts";

test("new work and fixes in an idle session earn the intake line", () => {
  assert.match(intentGuideline("new-work", 0.9, "idle") ?? "", /devsys_intake/);
  assert.match(intentGuideline("fix", 0.9, "idle") ?? "", /devsys_intake/);
});

test("a review in an idle session earns the review line", () => {
  assert.match(intentGuideline("review", 0.9, "idle") ?? "", /devsys_review_start/);
});

test("questions and continuations never earn a line", () => {
  for (const phase of ["idle", "implementing", "planning"] as const) {
    assert.equal(intentGuideline("question", 0.99, phase), undefined);
    assert.equal(intentGuideline("continuation", 0.99, phase), undefined);
  }
});

test("a fix inside a running slice is part of that slice; new work is not", () => {
  assert.equal(intentGuideline("fix", 0.9, "implementing"), undefined);
  assert.match(intentGuideline("new-work", INTENT_AT, "implementing") ?? "", /devsys_intake/);
  assert.equal(intentGuideline("new-work", INTENT_AT - 0.01, "idle"), undefined);
});

const run = async (prompt: string, label: string | undefined) => {
  const fake = createFakePi({
    classifiers: ["typesafe/jev-latest"],
    classifyAnswers:
      label === undefined
        ? undefined
        : { intent: { type: "choice", choice: label, probabilities: {}, confidence: 0.9 } },
  });
  createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start" } as never);
  const event = {
    type: "before_agent_start",
    prompt,
    systemPrompt: "",
    systemPromptOptions: { sections: {}, promptGuidelines: [] as string[] },
  } as unknown as BeforeAgentStartEvent;
  await fake.emit(event);
  return event.systemPromptOptions.promptGuidelines;
};

test("a plain request on an idle session gets the intake guideline", async () => {
  const guidelines = await run("add a --json flag to the export command", "new-work");
  assert.equal(guidelines.length, 1);
  assert.match(guidelines[0] ?? "", /devsys_intake/);
});

test("a question gets no guideline", async () => {
  assert.deepEqual(await run("how does the verifier work?", "question"), []);
});

test("a slash command is not judged", async () => {
  assert.deepEqual(await run("/devsys-status", "new-work"), []);
});

test("with Jev unavailable the prompt goes through untouched", async () => {
  assert.deepEqual(await run("add a flag", undefined), []);
});
