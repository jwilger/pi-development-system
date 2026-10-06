import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import { intentFromChoice, judgeShellIntent } from "../../src/jev/questions/shell-intent.ts";

const fakeJev = (answer: ClassifierAnswer | undefined): Jev => ({
  ask: async () => (answer === undefined ? err({ kind: "no-model" }) : ok({ intent: answer })),
  availability: () => "online",
  model: () => "fake/jev",
});

test("confidence below 0.6 maps to unknown", () => {
  assert.equal(intentFromChoice("force-push", 0.59), "unknown");
  assert.equal(intentFromChoice("force-push", 0.6), "force-push");
});

test("an unexpected label maps to unknown", () => {
  assert.equal(intentFromChoice("rm-rf", 0.99), "unknown");
});

test("judgeShellIntent returns the confident intent", async () => {
  const jev = fakeJev({
    type: "choice",
    choice: "history-rewrite",
    probabilities: {},
    confidence: 0.9,
  });
  assert.deepEqual(await judgeShellIntent(jev, "git commit --amend"), {
    ok: true,
    value: { intent: "history-rewrite", confidence: 0.9 },
  });
});

test("judgeShellIntent passes Jev errors through", async () => {
  assert.deepEqual(await judgeShellIntent(fakeJev(undefined), "x"), {
    ok: false,
    error: { kind: "no-model" },
  });
});

test("judgeShellIntent treats a wrong-typed answer as a provider error", async () => {
  const r = await judgeShellIntent(fakeJev({ type: "bool", probability: 1 }), "x");
  assert.equal(r.ok, false);
});

import { SHELL_INTENT_QUESTION } from "../../src/jev/questions/shell-intent.ts";
import { fixturesEnabled, loadFixture, questionHash, realJev } from "./fixture-runner.ts";

test("fixture pins the current question text", { skip: !fixturesEnabled() }, () => {
  assert.equal(loadFixture("shell-intent").questionHash, questionHash(SHELL_INTENT_QUESTION));
});

test("shell-intent fixture reaches 0.9 with a real Jev", { skip: !fixturesEnabled() }, async () => {
  const jev = await realJev();
  const fixture = loadFixture("shell-intent");
  let passed = 0;
  for (const c of fixture.cases) {
    const r = await judgeShellIntent(jev, c.state.command ?? "");
    if (r.ok && r.value.intent === c.expected) passed++;
    else console.log("  miss:", c.state.command, "→", JSON.stringify(r), "expected", c.expected);
  }
  assert.ok(passed / fixture.cases.length >= 0.9, `${passed}/${fixture.cases.length}`);
});
