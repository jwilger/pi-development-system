import assert from "node:assert/strict";
import test from "node:test";
import { judgeTestChange } from "../../src/jev/questions/test-change.ts";
import { loadFixture, rateShortfall, realJev } from "../jev/fixture-runner.ts";

type Judged = Awaited<ReturnType<typeof judgeTestChange>>;

const verdict = (r: Judged): string => {
  if (!r.ok) return "error";
  return r.value.weakens >= 0.7 ? `weakens:${r.value.motive}` : "ok";
};

test("test-change fixture reaches 0.9 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("test-change");
  let passed = 0;
  const misses: string[] = [];
  for (const c of fixture.cases) {
    const r = await judgeTestChange(jev, {
      path: c.state.path ?? "",
      ...(c.state.before !== undefined ? { before: c.state.before } : {}),
      ...(c.state.after !== undefined ? { after: c.state.after } : {}),
      ...(c.state.recentFailure !== undefined ? { recentFailure: c.state.recentFailure } : {}),
    });
    const got = verdict(r);
    if (got === c.expected) passed++;
    else misses.push(`${c.state.path} → ${got}, expected ${c.expected}`);
  }
  assert.equal(rateShortfall(passed, fixture.cases.length, 0.9, misses), undefined);
});
