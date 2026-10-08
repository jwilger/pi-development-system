import assert from "node:assert/strict";
import test from "node:test";
import { createPhaseTool, DEVSYS_TOOL_DESCRIPTION } from "../../src/context/devsys-tool.ts";
import type { Phase } from "../../src/core/types.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const EXPECT: Record<Phase, RegExp> = {
  idle: /devsys_intake/,
  intake: /devsys_begin_work/,
  planning: /devsys_begin_work/,
  implementing: /failing test first/,
  reviewing: /devsys_review_record/,
  delivering: /CI/,
};

for (const phase of Object.keys(EXPECT) as Phase[]) {
  test(`in ${phase} the call carries that phase's guidance`, async () => {
    const state = createSessionState(createFakePi().api);
    state.update((s) => ({ ...s, phase }));
    const tool = createPhaseTool({ state });
    const called = await tool.execute("c", {}, undefined, undefined, {} as never);
    const text = called.content[0]?.type === "text" ? called.content[0].text : "";
    assert.ok(text.includes(`phase: ${phase}`));
    assert.match(text, EXPECT[phase]);
  });
}

test("the description never changes with the phase (tool declarations head every request)", () => {
  const state = createSessionState(createFakePi().api);
  const tool = createPhaseTool({ state });
  assert.equal(tool.prepareLoadout, undefined);
  assert.equal(tool.description, DEVSYS_TOOL_DESCRIPTION);
  state.update((s) => ({ ...s, phase: "reviewing" }));
  assert.equal(createPhaseTool({ state }).description, DEVSYS_TOOL_DESCRIPTION);
});

test("the workflow guide is model-only, so a script cannot call it", () => {
  const tool = createPhaseTool({ state: createSessionState(createFakePi().api) });
  assert.equal(tool.exposure, "model-only");
});
