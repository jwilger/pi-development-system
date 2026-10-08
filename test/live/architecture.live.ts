import assert from "node:assert/strict";
import test from "node:test";
import {
  ARCHITECTURE_THRESHOLD,
  judgeArchitectureShaping,
} from "../../src/jev/questions/architecture.ts";
import { loadFixture, rateShortfall, realJev } from "../jev/fixture-runner.ts";

test("architecture-shaping fixture reaches 0.8 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("architecture-shaping");
  let passed = 0;
  const misses: string[] = [];
  for (const c of fixture.cases) {
    const r = await judgeArchitectureShaping(jev, {
      diffStat: c.state.diffStat ?? "",
      diff: c.state.diff ?? "",
    });
    const got = r.ok && r.value >= ARCHITECTURE_THRESHOLD ? "architectural" : "local";
    if (got === c.expected) passed++;
    else misses.push(`${c.state.diffStat} → ${got}, expected ${c.expected}`);
  }
  assert.equal(rateShortfall(passed, fixture.cases.length, 0.8, misses), undefined);
});
