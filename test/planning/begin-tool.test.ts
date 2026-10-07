import assert from "node:assert/strict";
import test from "node:test";
import type { SliceRef } from "../../src/core/types.ts";
import { createBeginWorkTool } from "../../src/planning/begin-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const setup = () => {
  const fake = createFakePi({ cwd: "/tmp" });
  const state = createSessionState(fake.api);
  const tool = createBeginWorkTool({ state });
  return {
    state,
    run: () => tool.execute("c", {} as never, undefined, undefined, fake.ctx as never),
  };
};

test("after planning with an active slice, begin moves to implementing", async () => {
  const { state, run } = setup();
  state.update((s) => ({ ...s, phase: "planning", activeSlice: "s1" as SliceRef }));
  const r = await run();
  assert.notEqual(r.isError, true);
  assert.equal(state.get().phase, "implementing");
});

test("outside planning, or with no slice, begin changes nothing and says to size the work", async () => {
  const { state, run } = setup();
  const idle = await run();
  assert.equal(idle.isError, true);
  assert.equal(state.get().phase, "idle");
  state.update((s) => ({ ...s, phase: "reviewing", activeSlice: "s1" as SliceRef }));
  assert.equal((await run()).isError, true);
  assert.equal(state.get().phase, "reviewing");
});
