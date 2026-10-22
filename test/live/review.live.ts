import assert from "node:assert/strict";
import test from "node:test";
import { LENSES, selectLenses } from "../../src/core/review.ts";
import { judgeLenses, judgeSeverity, SEVERITY_QUESTION } from "../../src/jev/questions/review.ts";
import { loadFixture, questionHash, rateShortfall, realJev } from "../jev/fixture-runner.ts";

test("lens fixture: per-lens accuracy ≥ 0.85 with a real Jev", async () => {
  const jev = await realJev();
  let right = 0;
  let total = 0;
  const misses: string[] = [];
  for (const c of loadFixture("review-lenses").cases) {
    const r = await judgeLenses(jev, {
      diffStat: c.state.diffStat ?? "",
      diffSample: c.state.diffSample ?? "",
      profiles: [c.state.profiles ?? ""],
    });
    const expected = new Set(c.expected.split(",").filter(Boolean));
    for (const lens of LENSES) {
      total++;
      const picked = r.ok && selectLenses(r.value).includes(lens);
      if (picked === expected.has(lens)) right++;
      else
        misses.push(
          `${lens} ${picked ? "picked" : "skipped"} for ${c.state.diffStat?.split("\n")[0]}`,
        );
    }
  }
  assert.equal(rateShortfall(right, total, 0.85, misses), undefined);
});

test("severity fixture reaches 0.8 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("finding-severity");
  let passed = 0;
  const misses: string[] = [];
  for (const c of fixture.cases) {
    const r = await judgeSeverity(jev, {
      finding: c.state.finding ?? "",
      diffContext: c.state.diffContext ?? "",
    });
    if (r.ok && r.value.severity === c.expected) passed++;
    else
      misses.push(
        `${c.state.finding?.slice(0, 50)} → ${r.ok ? r.value.severity : "error"}, expected ${c.expected}`,
      );
  }
  assert.equal(rateShortfall(passed, fixture.cases.length, 0.8, misses), undefined);
});

test("severity boundaries hold across three fresh classifier caches", async () => {
  const fixtures = [loadFixture("finding-severity"), loadFixture("finding-severity-boundaries")];
  for (const fixture of fixtures) {
    assert.equal(fixture.questionHash, questionHash({ ...SEVERITY_QUESTION }));
  }
  for (let round = 1; round <= 3; round++) {
    const jev = await realJev();
    for (const c of fixtures.flatMap((fixture) => fixture.cases)) {
      const result = await judgeSeverity(jev, {
        finding: c.state.finding ?? "",
        diffContext: c.state.diffContext ?? "",
      });
      assert.ok(result.ok, `round ${round}: classifier returned an error`);
      assert.equal(result.value.severity, c.expected, `round ${round}: ${c.state.finding}`);
    }
  }
});
