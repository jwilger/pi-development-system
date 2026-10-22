import assert from "node:assert/strict";
import test from "node:test";
import {
  DIFFICULTY_QUESTION,
  judgeTaskRouting,
  RISK_QUESTION,
} from "../../src/jev/questions/route.ts";
import { loadFixture, questionHash, rateShortfall, realJev } from "../jev/fixture-runner.ts";

test("route fixture reaches 0.8 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("route");
  let passed = 0;
  const misses: string[] = [];
  for (const c of fixture.cases) {
    const r = await judgeTaskRouting(jev, {
      task: c.state.task ?? "",
      filesTouched: (c.state.files ?? "").split(",").filter(Boolean),
    });
    const got = r.ok ? `${r.value.difficulty}/${r.value.risk}` : "error";
    if (got === c.expected) passed++;
    else misses.push(`${c.state.task} → ${got}, expected ${c.expected}`);
  }
  assert.equal(rateShortfall(passed, fixture.cases.length, 0.8, misses), undefined);
});

test("routing boundaries hold across three fresh classifier caches", async () => {
  const fixtures = [loadFixture("route"), loadFixture("route-boundaries")];
  const hash = questionHash({ ...DIFFICULTY_QUESTION }) + questionHash({ ...RISK_QUESTION });
  for (const fixture of fixtures) assert.equal(fixture.questionHash, hash);
  for (let round = 1; round <= 3; round++) {
    const jev = await realJev();
    for (const c of fixtures.flatMap((fixture) => fixture.cases)) {
      const result = await judgeTaskRouting(jev, {
        task: c.state.task ?? "",
        filesTouched: (c.state.files ?? "").split(",").filter(Boolean),
      });
      assert.ok(result.ok, `round ${round}: classifier returned an error`);
      assert.equal(
        `${result.value.difficulty}/${result.value.risk}`,
        c.expected,
        `round ${round}: ${c.state.task}`,
      );
    }
  }
});
