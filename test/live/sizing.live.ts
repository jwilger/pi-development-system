import assert from "node:assert/strict";
import test from "node:test";
import { judgeSizing } from "../../src/jev/questions/sizing.ts";
import { loadFixture, rateShortfall, realJev } from "../jev/fixture-runner.ts";

test("sizing fixture reaches 0.8 with a real Jev", async () => {
  const jev = await realJev();
  const fixture = loadFixture("sizing");
  let passed = 0;
  const misses: string[] = [];
  for (const c of fixture.cases) {
    const r = await judgeSizing(jev, {
      request: c.state.request ?? "",
      repoSummary: c.state.repoSummary ?? "",
    });
    const got = r.ok ? r.value.sizing : "error";
    if (got === c.expected) passed++;
    else misses.push(`${c.state.request} → ${got}, expected ${c.expected}`);
  }
  assert.equal(rateShortfall(passed, fixture.cases.length, 0.8, misses), undefined);
});
