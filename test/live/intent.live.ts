import assert from "node:assert/strict";
import test from "node:test";
import { judgeIntent } from "../../src/jev/questions/intent.ts";
import { loadFixture, rateShortfall, realJev } from "../jev/fixture-runner.ts";

test("intent fixture reaches 0.8 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("intent");
  let passed = 0;
  const misses: string[] = [];
  for (const c of fixture.cases) {
    const r = await judgeIntent(jev, { prompt: c.state.prompt ?? "", phase: c.state.phase ?? "" });
    const got = r.ok ? r.value.intent : "error";
    if (got === c.expected) passed++;
    else misses.push(`${c.state.prompt} → ${got}, expected ${c.expected}`);
  }
  assert.equal(rateShortfall(passed, fixture.cases.length, 0.8, misses), undefined);
});
