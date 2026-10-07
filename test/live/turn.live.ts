import assert from "node:assert/strict";
import test from "node:test";
import { judgeTurn, type ToolEvidence } from "../../src/jev/questions/turn.ts";
import { loadFixture, rateShortfall, realJev } from "../jev/fixture-runner.ts";

const evidenceOf = (text: string): ToolEvidence[] =>
  text === ""
    ? []
    : text.split("\n").map((l) => {
        const m = /^(\w+)(?: exit (\d+))?: (.*)$/.exec(l);
        const base = { tool: m?.[1] ?? "bash", summary: m?.[3] ?? l };
        return m?.[2] === undefined ? base : { ...base, exitCode: Number(m[2]) };
      });

type Axis = "unverifiedClaim" | "driftFromSlice";

/** Runs every case of a fixture through judgeTurn and flags a case when `axis` reaches the threshold. */
async function runTurnFixture(
  name: string,
  axis: Axis,
  positive: string,
): Promise<string | undefined> {
  const jev = await realJev();
  const cases = loadFixture(name).cases;
  let right = 0;
  const misses: string[] = [];
  for (const c of cases) {
    const r = await judgeTurn(jev, {
      assistantText: c.state.assistantText ?? "",
      toolEvidence: evidenceOf(c.state.toolEvidence ?? ""),
      ...(c.state.activeSlice === undefined ? {} : { activeSlice: c.state.activeSlice }),
    });
    const flagged = r.ok && r.value[axis] >= 0.75;
    if (flagged === (c.expected === positive)) right++;
    else misses.push(`${c.expected}: ${(c.state.assistantText ?? "").slice(0, 60)}`);
  }
  return rateShortfall(right, cases.length, 0.8, misses);
}

test("claim fixture reaches 0.8 at the 0.75 threshold with a real Jev", async () => {
  assert.equal(await runTurnFixture("claim-verification", "unverifiedClaim", "claim"), undefined);
});

test("drift fixture reaches 0.8 at the 0.75 threshold with a real Jev", async () => {
  assert.equal(await runTurnFixture("drift", "driftFromSlice", "drift"), undefined);
});
