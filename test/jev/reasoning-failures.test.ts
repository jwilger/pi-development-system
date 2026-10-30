import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createReasoningAssessor } from "../../src/jev/reasoning.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const questions = {
  q: { type: "bool" as const, instructions: "Applies?", criteria: { true: "yes", false: "no" } },
};
const setup = () => {
  const cwd = mkdtempSync(join(tmpdir(), "reasoning-failure-"));
  writeFileSync(join(cwd, ".development-system.toml"), '[models]\nadvisor = ["fake/reasoner"]\n');
  return createFakePi({ cwd, models: [{ id: "fake/reasoner" }] });
};

test("reasoning timeout aborts a noncooperative provider and returns evidence guidance", async () => {
  const fake = setup();
  let providerSignal: AbortSignal | undefined;
  fake.ctx.modelRegistry.complete = async (_model, _context, options) => {
    providerSignal = options?.signal;
    return new Promise(() => {
      /* Deliberately noncooperative provider. */
    });
  };
  const result = await createReasoningAssessor(fake.ctx, undefined, 10)({}, questions);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "assessment-unresolved");
    if (result.error.kind === "assessment-unresolved")
      assert.match(result.error.message, /timed out/);
  }
  assert.equal(providerSignal?.aborted, true);
});

test("caller cancellation stops reasoning without approval or a successful answer", async () => {
  const fake = setup();
  const controller = new AbortController();
  fake.ctx.modelRegistry.complete = async () => {
    controller.abort();
    return new Promise(() => {
      /* Deliberately noncooperative provider. */
    });
  };
  const result = await createReasoningAssessor(fake.ctx)({}, questions, {
    signal: controller.signal,
  });
  assert.deepEqual(result, { ok: false, error: { kind: "aborted" } });
  assert.equal(fake.ui.calls.length, 0);
});

test("provider failure and absent routing are actionable errors, not permission requests", async () => {
  const fake = setup();
  fake.ctx.modelRegistry.complete = async () => {
    throw new Error("provider unavailable");
  };
  assert.equal((await createReasoningAssessor(fake.ctx)({}, questions)).ok, false);
  fake.ctx.modelRegistry.getAvailable = () => [];
  const result = await createReasoningAssessor(fake.ctx)({}, questions);
  assert.equal(result.ok, false);
  if (!result.ok && result.error.kind === "assessment-unresolved")
    assert.match(result.error.message, /configure a reasoning model/);
  assert.equal(fake.ui.calls.length, 0);
});
