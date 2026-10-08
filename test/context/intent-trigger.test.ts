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
type Nudge = { message?: { customType: string; content: string; display: boolean } } | undefined;

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
  const out = (await fake.emitAll(event as never)).find((r) => (r as Nudge)?.message) as Nudge;
  return {
    guidelines: event.systemPromptOptions.promptGuidelines,
    sections: event.systemPromptOptions.sections as Record<string, string>,
    message: out?.message,
    tail: out?.message?.content ?? "",
    calls: fake.classifyCalls.count,
    fake,
    system,
  };
};

test("a plain request on an idle session returns the intake line as a one-shot message", async () => {
  const r = await run("add a --json flag to the export command", { label: "new-work" });
  assert.match(r.tail, /devsys_intake/);
  assert.equal(r.message?.customType, "devsys-nudge");
  assert.equal(r.message?.display, false);
});

test("the nudge never touches the system prompt sections or guidelines", async () => {
  const quiet = await run("how does the verifier work?", { label: "question" });
  const nudged = await run("add a --json flag to the export command", { label: "new-work" });
  assert.deepEqual(nudged.guidelines, []);
  assert.deepEqual(nudged.sections, quiet.sections);
});

test("a question gets no message at all", async () => {
  const r = await run("how does the verifier work?", { label: "question" });
  assert.equal(r.message, undefined);
});

test("a busy session is not judged at all: no Jev call is made", async () => {
  const r = await run("also add a test for the empty case", {
    label: "new-work",
    phase: "implementing",
  });
  assert.equal(r.calls, 0);
  assert.equal(r.message, undefined);
});

test("a Jev that is known to be offline costs no call; a failing one adds nothing", async () => {
  const fake = createFakePi({ classifiers: ["typesafe/jev-latest"], classifyAnswers: undefined });
  createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start" } as never);
  const event = () => ({
    type: "before_agent_start",
    prompt: "add a flag",
    systemPrompt: "",
    systemPromptOptions: { sections: {}, promptGuidelines: [] as string[] },
  });
  const nudges = async () =>
    (await fake.emitAll(event() as never)).filter((r) => (r as Nudge)?.message);
  assert.deepEqual(await nudges(), []);
  assert.equal(fake.classifyCalls.count, 1);
  // The first failure marked Jev offline; the next prompt must not pay for a call.
  assert.deepEqual(await nudges(), []);
  assert.equal(fake.classifyCalls.count, 1);
});

test("a bare skill block with no request after it costs no Jev call", async () => {
  const r = await run('<skill name="tdd" location="x">\nbody\n</skill>', { label: "new-work" });
  assert.equal(r.calls, 0);
  assert.equal(r.message, undefined);
});
