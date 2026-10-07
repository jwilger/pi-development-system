import assert from "node:assert/strict";
import test from "node:test";
import { registerModelAdvice } from "../../src/context/model-advice.ts";
import { defaultMatrix } from "../../src/core/models.ts";
import type { Phase } from "../../src/core/types.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const MODELS = [
  { id: "openai/gpt-6-astra" },
  { id: "openai/gpt-6.1-sol" },
  { id: "anthropic/claude-sonnet-5-5" },
  { id: "anthropic/claude-haiku-5" },
];
const sonnet = { provider: "anthropic", id: "claude-sonnet-5-5" };
const astra = { provider: "openai", id: "gpt-6-astra" };

function setup() {
  const fake = createFakePi({ models: MODELS });
  const state = createSessionState(fake.api);
  registerModelAdvice({ pi: fake.api, state, matrix: async () => defaultMatrix() });
  const select = (model: unknown, phase?: Phase) =>
    fake
      .emit(
        { type: "model_select", model, previousModel: undefined, source: "set" } as never,
        {
          model,
        } as never,
      )
      .then(() => phase);
  const setPhase = async (phase: Phase, model: unknown) => {
    await fake.emit({ type: "session_start", reason: "startup" } as never, { model } as never);
    state.update((s) => ({ ...s, phase }));
    await new Promise((r) => setImmediate(r));
  };
  return { fake, state, select, setPhase };
}

const advice = (fake: ReturnType<typeof createFakePi>) =>
  fake.sentMessages.map((m) => JSON.stringify(m));

test("entering planning on a strong-tier model recommends once, and never sets the model", async () => {
  const t = setup();
  await t.setPhase("planning", sonnet);
  assert.equal(advice(t.fake).length, 1);
  assert.match(advice(t.fake)[0] ?? "", /models\.phase-mismatch/);
  t.state.update((s) => ({ ...s, phase: "idle" }));
  t.state.update((s) => ({ ...s, phase: "planning" }));
  await new Promise((r) => setImmediate(r));
  assert.equal(advice(t.fake).length, 1);
});

test("a frontier model in planning, or a phase without a slot, gets no advice", async () => {
  const t = setup();
  await t.setPhase("planning", astra);
  await t.setPhase("delivering", sonnet);
  assert.equal(advice(t.fake).length, 0);
});

test("selecting a lower-tier model while in a phase recommends; a new model asks again", async () => {
  const t = setup();
  t.state.update((s) => ({ ...s, phase: "planning" }));
  await t.select(sonnet);
  assert.equal(advice(t.fake).length, 1);
  await t.select(sonnet);
  assert.equal(advice(t.fake).length, 1);
  await t.select({ provider: "anthropic", id: "claude-haiku-5" });
  assert.equal(advice(t.fake).length, 2);
});

test("selecting a model while idle says nothing", async () => {
  const t = setup();
  await t.select(sonnet);
  assert.equal(advice(t.fake).length, 0);
});
