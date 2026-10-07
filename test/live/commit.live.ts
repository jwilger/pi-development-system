import assert from "node:assert/strict";
import test from "node:test";
import { judgeCommit, MIX_QUESTION, RATIONALE_QUESTION } from "../../src/jev/questions/commit.ts";
import { loadFixture, questionHash, realJev } from "../jev/fixture-runner.ts";

const judged = async (
  name: string,
  hash: string,
  pick: (v: { rationale: number; mixesStructuralAndBehavioural: number }) => string,
) => {
  assert.equal(loadFixture(name).questionHash, hash);
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
  assert.ok(passed / fixture.cases.length >= 0.8, `${passed}/${fixture.cases.length}`);
};

test("commit-rationale fixture reaches 0.8 with a real Jev", async () => {
  await judged("commit-rationale", questionHash({ ...RATIONALE_QUESTION }), (v) =>
    v.rationale >= 0.5 ? "rationale" : "none",
  );
});

test("commit-mix fixture reaches 0.8 with a real Jev", async () => {
  await judged("commit-mix", questionHash({ ...MIX_QUESTION }), (v) =>
    v.mixesStructuralAndBehavioural >= 0.7 ? "mixed" : "clean",
  );
});
