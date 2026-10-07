import assert from "node:assert/strict";
import test from "node:test";
import { judgeTestChange } from "../../src/jev/questions/test-change.ts";
import { loadFixture, realJev } from "../jev/fixture-runner.ts";

test("test-change fixture reaches 0.9 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("test-change");
  let passed = 0;
  for (const c of fixture.cases) {
    const r = await judgeTestChange(jev, {
      path: c.state.path ?? "",
      ...(c.state.before !== undefined ? { before: c.state.before } : {}),
      ...(c.state.after !== undefined ? { after: c.state.after } : {}),
      ...(c.state.recentFailure !== undefined ? { recentFailure: c.state.recentFailure } : {}),
    });
    const got = r.ok ? (r.value.weakens >= 0.7 ? `weakens:${r.value.motive}` : "ok") : "error";
    if (got === c.expected) passed++;
    else console.log("  miss:", c.state.path, "→", got, "expected", c.expected);
  }
  assert.ok(passed / fixture.cases.length >= 0.9, `${passed}/${fixture.cases.length}`);
});
