import assert from "node:assert/strict";
import test from "node:test";
import { FIX_RELATED_THRESHOLD, judgeFixRelated } from "../../src/jev/questions/fix-related.ts";
import { loadFixture, realJev } from "../jev/fixture-runner.ts";

test("fix-related fixture reaches 0.8 with a real Jev", async () => {
  const fixture = loadFixture("fix-related");
  const jev = await realJev();
  let passed = 0;
  for (const c of fixture.cases) {
    const r = await judgeFixRelated(jev, {
      diff: c.state.diff ?? "",
      failingLog: c.state.failingLog ?? "",
      message: c.state.message ?? "",
    });
    if (r.ok && (r.value >= FIX_RELATED_THRESHOLD ? "related" : "unrelated") === c.expected)
      passed++;
  }
  assert.ok(passed / fixture.cases.length >= 0.8, `${passed}/${fixture.cases.length}`);
});
