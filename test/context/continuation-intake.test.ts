import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createDevelopmentSystem } from "../../extensions/development-system.ts";
import { createFakePi } from "../harness/fake-pi.ts";

async function exercise(label: string, sessionManager = SessionManager.inMemory()) {
  const fake = createFakePi({
    classifiers: ["typesafe/jev-latest"],
    classifyAnswers: {
      // Supply the provider's complete choice distribution, as in existing intent hook tests.
      // Assertions are unchanged; this makes the new regression exercise a valid classifier reply.
      intent: {
        type: "choice",
        choice: label,
        confidence: 0.99,
        probabilities: Object.fromEntries(
          ["new-work", "fix", "review", "question", "continuation"].map((key) => [
            key,
            key === label ? 1 : 0,
          ]),
        ),
      },
    },
  });
  const system = createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start" } as never);
  const event = {
    type: "before_agent_start",
    messageType: "user",
    prompt: "repair the unfinished report",
    systemPrompt: "",
    systemPromptOptions: { sections: {}, promptGuidelines: [] },
  };
  const result = await fake.emit(event as never, { sessionManager });
  return { fake, system, result, sections: event.systemPromptOptions.sections };
}

test("idle classification is advisory: inspect active goal and evidence before intake", async () => {
  const { result } = await exercise("fix");
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /This prompt asks for new work:/);
  assert.match(text, /active goal/i);
  assert.match(text, /evidence/i);
  assert.match(text, /only.*new work/i);
});

test("compacted active-goal evidence reaches the intent provider, redacted, without changing workflow", async () => {
  const sessionManager = SessionManager.inMemory();
  sessionManager.appendCompaction(
    "Active goal: export command. Completion auditor: JSON output evidence report unfinished. api_key=synthetic-secret-value",
    null,
    1000,
  );
  sessionManager.appendCustomMessageEntry("goal-checkpoint", "Resume approved export work", false);
  const { fake, system, result } = await exercise("continuation", sessionManager);
  const input = JSON.stringify(fake.classifyCalls.contexts);
  assert.match(input, /export command/);
  assert.match(input, /Completion auditor/);
  assert.doesNotMatch(input, /synthetic-secret-value/);
  assert.equal(system.state.get().phase, "idle");
  assert.equal(system.state.get().activeSlice, undefined);
  assert.equal(result, undefined);
  assert.equal(fake.ui.calls.filter((call) => call.kind === "confirm").length, 0);
});

// These public-event regressions add lifecycle/state coverage without changing existing assertions.
// Even a wrong classifier must not cause mutation or replacement consent on a running slice.
test("review, auditor and verification repairs retain the restored active slice across lifecycle events", async () => {
  for (const phase of ["implementing", "reviewing", "delivering"] as const) {
    const fake = createFakePi({ classifiers: ["typesafe/jev-latest"] });
    const system = createDevelopmentSystem(fake.api);
    await fake.emit({ type: "session_start" } as never);
    system.state.update((state) => ({ ...state, phase, activeSlice: "approved-export" as never }));
    for (const type of ["session_start", "session_tree"] as const) {
      await fake.emit({ type } as never);
      for (const prompt of [
        "Repair the review finding required by acceptance",
        "Completion auditor found contradictory shipped guidance and unfinished evidence reports",
        "Verification failed; finish the approved behavior",
        "Checkpoint after compaction: resume the active goal",
        "Delayed reviewer notification: empty JSON output still fails acceptance",
      ]) {
        await fake.emit({
          type: "before_agent_start",
          messageType: "user",
          prompt,
          systemPrompt: "",
          systemPromptOptions: { sections: {}, promptGuidelines: [] },
        } as never);
        assert.equal(system.state.get().activeSlice, "approved-export");
        assert.equal(system.state.get().phase, phase);
      }
    }
    assert.equal(fake.classifyCalls.count, 0);
    assert.equal(fake.ui.calls.filter((call) => call.kind === "confirm").length, 0);
  }
});

test("custom delayed notifications never invoke intake classification even while idle", async () => {
  const fake = createFakePi({ classifiers: ["typesafe/jev-latest"] });
  const system = createDevelopmentSystem(fake.api);
  await fake.emit({ type: "session_start" } as never);
  await fake.emit({
    type: "before_agent_start",
    messageType: "custom",
    message: {
      role: "custom",
      customType: "review-completed",
      content: "repair findings",
      display: false,
      timestamp: 0,
    },
    systemPrompt: "",
    systemPromptOptions: { sections: {}, promptGuidelines: [] },
  } as never);
  assert.equal(fake.classifyCalls.count, 0);
  assert.equal(system.state.get().activeSlice, undefined);
  assert.equal(fake.ui.calls.filter((call) => call.kind === "confirm").length, 0);
});
