import assert from "node:assert/strict";
import test from "node:test";
import { judgeTaskReadiness } from "../../src/jev/questions/readiness.ts";
import { loadFixture, rateShortfall, realJev } from "../jev/fixture-runner.ts";

test("readiness fixture reaches 0.8 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("readiness");
  let passed = 0;
  const misses: string[] = [];
  for (const c of fixture.cases) {
    const r = await judgeTaskReadiness(jev, {
      id: "T",
      title: c.state.title ?? "",
      goal: c.state.goal ?? "",
      files: (c.state.files ?? "").split(",").filter(Boolean),
      interfaces: c.state.interfaces ?? "",
      firstFailingTest: c.state.firstFailingTest ?? "",
      steps: (c.state.steps ?? "").split("|").filter(Boolean),
      run: "npm test",
      expected: "passes with 0 failures",
      outOfScope: "nothing else",
    });
    const got = r.ok ? r.value.readiness : "error";
    if (got === c.expected) passed++;
    else misses.push(`${c.state.title} → ${got}, expected ${c.expected}`);
  }
  assert.equal(rateShortfall(passed, fixture.cases.length, 0.8, misses), undefined);
});
