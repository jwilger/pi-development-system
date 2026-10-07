import assert from "node:assert/strict";
import test from "node:test";
import { LENSES, selectLenses } from "../../src/core/review.ts";
import { judgeLenses, judgeSeverity } from "../../src/jev/questions/review.ts";
import { loadFixture, realJev } from "../jev/fixture-runner.ts";

test("lens fixture: per-lens accuracy ≥ 0.85 with a real Jev", async () => {
  const jev = await realJev();
  let right = 0;
  let total = 0;
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
        console.log(
          "  miss:",
          lens,
          picked ? "picked" : "skipped",
          "for",
          c.state.diffStat?.split("\n")[0],
        );
    }
  }
  assert.ok(right / total >= 0.85, `${right}/${total}`);
});

test("severity fixture reaches 0.8 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("finding-severity");
  let passed = 0;
  for (const c of fixture.cases) {
    const r = await judgeSeverity(jev, {
      finding: c.state.finding ?? "",
      diffContext: c.state.diffContext ?? "",
    });
    if (r.ok && r.value.severity === c.expected) passed++;
    else
      console.log(
        "  miss:",
        c.state.finding?.slice(0, 50),
        "→",
        r.ok ? r.value.severity : "error",
        "expected",
        c.expected,
      );
  }
  assert.ok(passed / fixture.cases.length >= 0.8, `${passed}/${fixture.cases.length}`);
});
