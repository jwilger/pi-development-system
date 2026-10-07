import assert from "node:assert/strict";
import test from "node:test";
import { judgeTaskRouting } from "../../src/jev/questions/route.ts";
import { loadFixture, realJev } from "../jev/fixture-runner.ts";

test("route fixture reaches 0.8 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("route");
  let passed = 0;
  for (const c of fixture.cases) {
    const r = await judgeTaskRouting(jev, {
      task: c.state.task ?? "",
      filesTouched: (c.state.files ?? "").split(",").filter(Boolean),
    });
    const got = r.ok ? `${r.value.difficulty}/${r.value.risk}` : "error";
    if (got === c.expected) passed++;
    else console.log("  miss:", c.state.task, "→", got, "expected", c.expected);
  }
  assert.ok(passed / fixture.cases.length >= 0.8, `${passed}/${fixture.cases.length}`);
});
