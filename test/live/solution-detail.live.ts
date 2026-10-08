import assert from "node:assert/strict";
import test from "node:test";
import {
  judgeSolutionDetail,
  SOLUTION_DETAIL_THRESHOLD,
} from "../../src/jev/questions/solution-detail.ts";
import { loadFixture, rateShortfall, realJev } from "../jev/fixture-runner.ts";

test("solution-detail fixture reaches 0.8 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("solution-detail");
  let passed = 0;
  const misses: string[] = [];
  for (const c of fixture.cases) {
    const r = await judgeSolutionDetail(jev, { brief: c.state.brief ?? "" });
    const got = r.ok && r.value >= SOLUTION_DETAIL_THRESHOLD ? "solution" : "product";
    if (got === c.expected) passed++;
    else misses.push(`${(c.state.brief ?? "").slice(0, 50)} → ${got}, expected ${c.expected}`);
  }
  assert.equal(rateShortfall(passed, fixture.cases.length, 0.8, misses), undefined);
});
