import assert from "node:assert/strict";
import test from "node:test";
import type { ToolLoadout } from "@earendil-works/pi-coding-agent";
import { createPhaseTool } from "../../src/context/devsys-tool.ts";
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
  test(`in ${phase} the description and the call both carry that phase's guidance`, async () => {
    const state = createSessionState(createFakePi().api);
    state.update((s) => ({ ...s, phase }));
    const tool = createPhaseTool({ state });
    const changes = tool.prepareLoadout?.({} as ToolLoadout);
    const described = changes?.descriptions?.devsys ?? "";
    assert.ok(described.includes(`Current phase (${phase})`));
    assert.match(described, EXPECT[phase]);
    const called = await tool.execute("c", {}, undefined, undefined, {} as never);
    const text = called.content[0]?.type === "text" ? called.content[0].text : "";
    assert.ok(text.includes(`phase: ${phase}`));
    assert.match(text, EXPECT[phase]);
  });
}

test("the workflow guide is model-only, so a script cannot call it", () => {
  const state = createSessionState(createFakePi().api);
  assert.equal(createPhaseTool({ state }).exposure, "model-only");
});
