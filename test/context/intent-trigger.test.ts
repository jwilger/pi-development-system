import assert from "node:assert/strict";
import test from "node:test";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import { INTENT_AT, intentGuideline } from "../../src/context/intent-trigger.ts";
import type { Phase } from "../../src/core/types.ts";
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

test("only an idle session is nudged: in a running slice a request may be part of that slice", () => {
  for (const phase of ["intake", "planning", "implementing", "reviewing", "delivering"] as const) {
    assert.equal(intentGuideline("new-work", 0.99, phase), undefined);
    assert.equal(intentGuideline("fix", 0.99, phase), undefined);
    assert.equal(intentGuideline("review", 0.99, phase), undefined);
  }
  assert.equal(intentGuideline("new-work", INTENT_AT - 0.01, "idle"), undefined);
});

type Setup = { label?: string | undefined; phase?: Phase; offline?: boolean };

const run = async (prompt: string, opts: Setup = {}) => {
  const label = opts.label;
  const fake = createFakePi({
    classifiers: opts.offline === true ? [] : ["typesafe/jev-latest"],
    classifyAnswers:
      label === undefined
        ? undefined
        : { intent: { type: "choice", choice: label, probabilities: {}, confidence: 0.9 } },
  });
  const system = createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start" } as never);
  if (opts.phase !== undefined) {
    const phase = opts.phase;
    system.state.update((s) => ({ ...s, phase }));
  }
  const event = {
    type: "before_agent_start",
    prompt,
    systemPrompt: "",
    systemPromptOptions: { sections: {}, promptGuidelines: [] as string[] },
  };
  await fake.emit(event as never);
  const out = (await fake.emit({ type: "context", messages: [] } as never)) as
    | { messages: { content: string }[] }
    | undefined;
  return {
    guidelines: event.systemPromptOptions.promptGuidelines,
    tail: out?.messages.map((m) => m.content).join("\n") ?? "",
    fake,
    system,
  };
};

test("a plain request on an idle session puts the intake line in the context tail", async () => {
  const r = await run("add a --json flag to the export command", { label: "new-work" });
  assert.match(r.tail, /devsys_intake/);
});

test("the system prompt is left alone, so the provider's cache survives the nudge", async () => {
  const r = await run("add a --json flag to the export command", { label: "new-work" });
  assert.deepEqual(r.guidelines, []);
});

test("the line applies to one run only", async () => {
  const r = await run("add a --json flag", { label: "new-work" });
  await r.fake.emit({ type: "agent_end" } as never);
  const out = (await r.fake.emit({ type: "context", messages: [] } as never)) as unknown;
  assert.equal(out, undefined);
});

test("a question gets no line", async () => {
  assert.equal((await run("how does the verifier work?", { label: "question" })).tail, "");
});

test("a busy session is not judged at all", async () => {
  const r = await run("also add a test for the empty case", {
    label: "new-work",
    phase: "implementing",
  });
  assert.equal(r.tail.includes("devsys_intake"), false);
});

test("with Jev offline or failing the prompt goes through untouched", async () => {
  assert.equal((await run("add a flag", { offline: true })).tail, "");
  assert.equal((await run("add a flag", { label: undefined })).tail, "");
});
