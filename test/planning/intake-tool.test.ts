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

const choice = (label: string, confidence = 0.9): ClassifierAnswer => ({
  type: "choice",
  choice: label,
  probabilities: { [label]: 1 },
  confidence,
});
const needs = (p: number): Record<string, ClassifierAnswer> =>
  Object.fromEntries(
    Object.keys(ARTIFACT_QUESTIONS).map((k) => [
      k,
      { type: "bool", probability: p } as ClassifierAnswer,
    ]),
  );
const judging = (sizing: string, confidence: number, p: number): Jev => ({
  ask: async () => ok({ sizing: choice(sizing, confidence), ...needs(p) }),
  availability: () => "online",
  model: () => "fake/jev",
});
/** Jev is sure of its size: intake proceeds without asking. */
const online = (sizing: string, p = 0): Jev => judging(sizing, 0.9, p);
/** Jev is under 50% confident: the user is asked. */
const unsure = (sizing: string, p = 0): Jev => judging(sizing, 0.4, p);
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
  const { fake, state, run } = setup(unsure("capability"));
  fake.ui.selectResponses.push("capability");
  const r = await run({ request: "Let users share a saved report by link" });
  assert.notEqual(r.isError, true);
  assert.equal(state.get().sizing, "capability");
  assert.equal(state.get().phase, "planning");
  assert.equal(state.get().activeSlice, "let-users-share-a-saved-report-by-link");
  assert.match(textOf(r), /event-model/);
});

test("the user can pick a different size than the one proposed", async () => {
  const { fake, state, run } = setup(unsure("capability"));
  fake.ui.selectResponses.push("fix");
  await run({ request: "trim the email" });
  assert.equal(state.get().sizing, "fix");
  assert.equal(state.get().phase, "implementing");
  const select = fake.ui.calls.find((c) => c.kind === "select");
  assert.ok(select);
  assert.equal((select.args[1] as string[])[0], "capability");
});

test("a cancelled confirmation changes nothing", async () => {
  const { fake, state, run } = setup(unsure("change"));
  fake.ui.selectResponses.push(undefined);
  const r = await run({ request: "r" });
  assert.equal(state.get().phase, "idle");
  assert.equal(state.get().sizing, undefined);
  assert.match(textOf(r), /cancel/i);
});

test("headless returns the proposal only and leaves state alone", async () => {
  const { state, run } = setup(unsure("change"), false);
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
  const { fake, run } = setup(unsure("change", 0.9));
  fake.ui.selectResponses.push("change");
  assert.match(textOf(await run({ request: "r" })), /Also consider: .*event-model/);
});

test("an empty request is an error", async () => {
  const { run } = setup(unsure("change"));
  assert.equal((await run({ request: "  " })).isError, true);
});

test("a second intake with the same wording gets its own slice, not the old one's state", async () => {
  const { fake, state, run } = setup(unsure("change"));
  fake.ui.selectResponses.push("change", "change");
  fake.ui.confirmResponses.push(true);
  await run({ request: "trim the email" });
  assert.equal(state.get().activeSlice, "trim-the-email");
  await run({ request: "trim the email" });
  assert.equal(state.get().activeSlice, "trim-the-email-2");
});

test("a fix judged by an online Jev with no extra need lists nothing to consider", async () => {
  const { fake, run } = setup(unsure("fix", 0.01));
  fake.ui.selectResponses.push("fix");
  const r = await run({ request: "trim the email" });
  assert.doesNotMatch(textOf(r), /Also consider/);
});

test("confirming a fix records a user-approved review departure for that slice only", async () => {
  const { fake, state, run } = setup(unsure("fix"));
  fake.ui.selectResponses.push("fix");
  fake.ui.confirmResponses.push(true);
  const r = await run({ request: "trim the email on login" });
  const [dep] = state.get().openDepartures;
  assert.equal(dep?.gate, "review.unsatisfied");
  assert.equal(dep?.approver, "user");
  assert.deepEqual(dep?.scope, { kind: "slice", slice: "trim-the-email-on-login" });
  assert.match(textOf(r), /waived fresh-context review/);
});

test("sizes other than fix record no departure", async () => {
  const { fake, state, run } = setup(unsure("change"));
  fake.ui.selectResponses.push("change");
  await run({ request: "make retry configurable" });
  assert.deepEqual(state.get().openDepartures, []);
});

test("declining the waiver keeps the review gate for that fix", async () => {
  const { fake, state, run } = setup(unsure("fix"));
  fake.ui.selectResponses.push("fix");
  fake.ui.confirmResponses.push(false);
  const r = await run({ request: "trim the email on login" });
  assert.deepEqual(state.get().openDepartures, []);
  assert.match(textOf(r), /Review is NOT waived/);
  assert.match(JSON.stringify(fake.ui.calls), /Skip fresh-context review/);
});

test("a slice that is reviewed but not yet shipped still asks before it is replaced", async () => {
  const { fake, state, run } = setup(unsure("fix"));
  fake.ui.selectResponses.push("change");
  await run({ request: "make retry configurable" });
  state.update((s) => ({ ...s, phase: "delivering" }));
  fake.ui.selectResponses.push("fix");
  fake.ui.confirmResponses.push(false);
  const r = await run({ request: "typo in help text" });
  assert.equal(state.get().activeSlice, "make-retry-configurable");
  assert.match(textOf(r), /unchanged/);
});

test("intake in the middle of a slice asks first and leaves the slice alone when declined", async () => {
  const { fake, state, run } = setup(unsure("fix"));
  fake.ui.selectResponses.push("change");
  await run({ request: "make retry configurable" });
  fake.ui.selectResponses.push("fix");
  fake.ui.confirmResponses.push(false);
  const r = await run({ request: "typo in help text" });
  assert.equal(state.get().activeSlice, "make-retry-configurable");
  assert.match(textOf(r), /unchanged/);
  assert.deepEqual(state.get().openDepartures, []);
});

test("a confident Jev sizes the work without asking and says so", async () => {
  const { fake, state, run } = setup(online("capability"));
  const r = await run({ request: "build the thing" });
  assert.equal(fake.ui.calls.filter((c) => c.kind === "select").length, 0);
  assert.equal(state.get().sizing, "capability");
  assert.equal(state.get().phase, "planning");
  assert.match(textOf(r), /Jev judged capability \(confidence 0\.90\); proceeding without asking/);
});

test("Jev confidence just under one half asks, and exactly one half proceeds", async () => {
  const under = setup(judging("change", 0.49, 0));
  under.fake.ui.selectResponses.push("fix");
  await under.run({ request: "r" });
  assert.equal(under.state.get().sizing, "fix");
  const at = setup(judging("change", 0.5, 0));
  await at.run({ request: "r" });
  assert.equal(at.fake.ui.calls.filter((c) => c.kind === "select").length, 0);
  assert.equal(at.state.get().sizing, "change");
});

test("a size given up front skips the question, even when Jev is unsure or offline", async () => {
  for (const jev of [unsure("fix"), offline]) {
    const { fake, state, run } = setup(jev);
    const r = await run({ request: "r", size: "capability" });
    assert.equal(fake.ui.calls.filter((c) => c.kind === "select").length, 0);
    assert.equal(state.get().sizing, "capability");
    assert.match(textOf(r), /size given up front: capability/i);
  }
});

test("a size given up front is not overridden by a confident Jev", async () => {
  const { state, run } = setup(online("fix"));
  await run({ request: "r", size: "product" });
  assert.equal(state.get().sizing, "product");
});

test("an invalid size given up front is an error and changes nothing", async () => {
  const { state, run } = setup(online("change"));
  const r = await run({ request: "r", size: "huge" });
  assert.equal(r.isError, true);
  assert.equal(state.get().phase, "idle");
});

test("headless with a confident Jev applies the size", async () => {
  const { state, run } = setup(online("change"), false);
  const r = await run({ request: "r" });
  assert.equal(state.get().sizing, "change");
  assert.equal(state.get().phase, "implementing");
  assert.doesNotMatch(textOf(r), /not applied/i);
});

test("headless with a size given up front applies it", async () => {
  const { state, run } = setup(offline, false);
  await run({ request: "r", size: "fix" });
  assert.equal(state.get().sizing, "fix");
  assert.equal(state.get().reviews, undefined);
});

test("headless never replaces a slice in flight and never waives review", async () => {
  const { state, run } = setup(online("fix"), false);
  await run({ request: "first" });
  const r = await run({ request: "second" });
  assert.equal(state.get().activeSlice, "first");
  assert.match(textOf(r), /unchanged/);
  assert.equal(state.get().openDepartures.length, 0);
});

test("a fix decided without asking still asks the user about waiving review", async () => {
  const { fake, state, run } = setup(online("fix"));
  fake.ui.confirmResponses.push(true);
  await run({ request: "trim the email" });
  assert.equal(fake.ui.calls.filter((c) => c.kind === "confirm").length, 1);
  assert.equal(state.get().openDepartures.length, 1);
});
