import assert from "node:assert/strict";
import test from "node:test";
import { judgeShellIntent } from "../../src/jev/questions/shell-intent.ts";
import { loadFixture, rateShortfall, realJev } from "../jev/fixture-runner.ts";

test("shell-intent fixture reaches 0.9 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("shell-intent");
  let passed = 0;
  const misses: string[] = [];
  for (const c of fixture.cases) {
    const r = await judgeShellIntent(jev, c.state.command ?? "");
    if (r.ok && r.value.intent === c.expected) passed++;
    else misses.push(`${c.state.command} → ${JSON.stringify(r)}, expected ${c.expected}`);
  }
  assert.equal(rateShortfall(passed, fixture.cases.length, 0.9, misses), undefined);
});
