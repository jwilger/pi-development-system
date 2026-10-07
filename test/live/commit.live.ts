import assert from "node:assert/strict";
import test from "node:test";
import { judgeCommit } from "../../src/jev/questions/commit.ts";
import { loadFixture, realJev } from "../jev/fixture-runner.ts";

const score = async (
  name: string,
  pick: (v: { rationale: number; mixesStructuralAndBehavioural: number }) => string,
) => {
  const jev = await realJev();
  let passed = 0;
  const fixture = loadFixture(name);
  for (const c of fixture.cases) {
    const r = await judgeCommit(jev, {
      message: c.state.message ?? "",
      diffStat: c.state.diffStat ?? "",
      diff: c.state.diff ?? "",
    });
    if (r.ok && pick(r.value) === c.expected) passed++;
  }
  return { passed, total: fixture.cases.length };
};

test("commit-rationale fixture reaches 0.8 with a real Jev", async () => {
  const r = await score("commit-rationale", (v) => (v.rationale >= 0.5 ? "rationale" : "none"));
  assert.ok(r.passed / r.total >= 0.8, `${r.passed}/${r.total}`);
});

test("commit-mix fixture reaches 0.8 with a real Jev", async () => {
  const r = await score("commit-mix", (v) =>
    v.mixesStructuralAndBehavioural >= 0.7 ? "mixed" : "clean",
  );
  assert.ok(r.passed / r.total >= 0.8, `${r.passed}/${r.total}`);
});
