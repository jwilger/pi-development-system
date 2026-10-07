import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import { ARTIFACT_QUESTIONS } from "../../src/jev/questions/sizing.ts";
import { createIntakeTool } from "../../src/planning/intake-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const choice = (label: string): ClassifierAnswer => ({
  type: "choice",
  choice: label,
  probabilities: { [label]: 1 },
  confidence: 0.9,
});
const needs = (p: number): Record<string, ClassifierAnswer> =>
  Object.fromEntries(
    Object.keys(ARTIFACT_QUESTIONS).map((k) => [
      k,
      { type: "bool", probability: p } as ClassifierAnswer,
    ]),
  );
const online = (sizing: string, p = 0): Jev => ({
  ask: async () => ok({ sizing: choice(sizing), ...needs(p) }),
  availability: () => "online",
  model: () => "fake/jev",
});
const offline: Jev = {
  ask: async () => err({ kind: "no-model" }),
  availability: () => "offline",
  model: () => undefined,
};

const setup = (jev: Jev, hasUI = true) => {
  const fake = createFakePi({ cwd: mkdtempSync(join(tmpdir(), "devsys-intake-")), hasUI });
  const state = createSessionState(fake.api);
  const tool = createIntakeTool({ pi: fake.api, state, jev: () => jev });
  const run = (params: Record<string, unknown>) =>
    tool.execute("c", params as never, undefined, undefined, fake.ctx as never);
  return { fake, state, run };
};
const textOf = (r: { content: readonly { type: string; text?: string }[] }): string =>
  r.content.map((c) => c.text ?? "").join("\n");

test("the confirmed size sets sizing, phase and a slice named after the request", async () => {
  const { fake, state, run } = setup(online("capability"));
  fake.ui.selectResponses.push("capability");
  const r = await run({ request: "Let users share a saved report by link" });
  assert.notEqual(r.isError, true);
  assert.equal(state.get().sizing, "capability");
  assert.equal(state.get().phase, "planning");
  assert.equal(state.get().activeSlice, "let-users-share-a-saved-report-by-link");
  assert.match(textOf(r), /event-model/);
});

test("the user can pick a different size than the one proposed", async () => {
  const { fake, state, run } = setup(online("capability"));
  fake.ui.selectResponses.push("fix");
  await run({ request: "trim the email" });
  assert.equal(state.get().sizing, "fix");
  assert.equal(state.get().phase, "implementing");
  const select = fake.ui.calls.find((c) => c.kind === "select");
  assert.ok(select);
  assert.equal((select.args[1] as string[])[0], "capability");
});

test("a cancelled confirmation changes nothing", async () => {
  const { fake, state, run } = setup(online("change"));
  fake.ui.selectResponses.push(undefined);
  const r = await run({ request: "r" });
  assert.equal(state.get().phase, "idle");
  assert.equal(state.get().sizing, undefined);
  assert.match(textOf(r), /cancel/i);
});

test("headless returns the proposal only and leaves state alone", async () => {
  const { state, run } = setup(online("change"), false);
  const r = await run({ request: "r" });
  assert.notEqual(r.isError, true);
  assert.equal(state.get().phase, "idle");
  assert.match(textOf(r), /Proposed sizing: change/);
  assert.match(textOf(r), /not applied/i);
});

test("Jev offline defaults to change, says so, and still asks the user", async () => {
  const { fake, state, run } = setup(offline);
  fake.ui.selectResponses.push("change");
  const r = await run({ request: "r" });
  assert.match(textOf(r), /Jev unavailable/);
  assert.equal(state.get().sizing, "change");
});

test("high-need artifacts beyond the table are offered as 'also consider'", async () => {
  const { fake, run } = setup(online("change", 0.9));
  fake.ui.selectResponses.push("change");
  assert.match(textOf(await run({ request: "r" })), /Also consider: .*event-model/);
});

test("an empty request is an error", async () => {
  const { run } = setup(online("change"));
  assert.equal((await run({ request: "  " })).isError, true);
});

test("a second intake with the same wording gets its own slice, not the old one's state", async () => {
  const { fake, state, run } = setup(online("change"));
  fake.ui.selectResponses.push("change", "change");
  await run({ request: "trim the email" });
  assert.equal(state.get().activeSlice, "trim-the-email");
  await run({ request: "trim the email" });
  assert.equal(state.get().activeSlice, "trim-the-email-2");
});

test("a fix judged by an online Jev with no extra need lists nothing to consider", async () => {
  const { fake, run } = setup(online("fix", 0.01));
  fake.ui.selectResponses.push("fix");
  const r = await run({ request: "trim the email" });
  assert.doesNotMatch(textOf(r), /Also consider/);
});

test("confirming a fix records a user-approved review departure for that slice only", async () => {
  const { fake, state, run } = setup(online("fix"));
  fake.ui.selectResponses.push("fix");
  const r = await run({ request: "trim the email on login" });
  const [dep] = state.get().openDepartures;
  assert.equal(dep?.gate, "review.unsatisfied");
  assert.equal(dep?.approver, "user");
  assert.deepEqual(dep?.scope, { kind: "slice", slice: "trim-the-email-on-login" });
  assert.match(textOf(r), /no review rounds for this fix/);
});

test("sizes other than fix record no departure", async () => {
  const { fake, state, run } = setup(online("change"));
  fake.ui.selectResponses.push("change");
  await run({ request: "make retry configurable" });
  assert.deepEqual(state.get().openDepartures, []);
});
