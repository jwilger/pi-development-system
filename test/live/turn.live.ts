import assert from "node:assert/strict";
import test from "node:test";
import { judgeTurn, type ToolEvidence } from "../../src/jev/questions/turn.ts";
import { loadFixture, realJev } from "../jev/fixture-runner.ts";

const evidenceOf = (text: string): ToolEvidence[] =>
  text === ""
    ? []
    : text.split("\n").map((l) => {
        const m = /^(\w+)(?: exit (\d+))?: (.*)$/.exec(l);
        const base = { tool: m?.[1] ?? "bash", summary: m?.[3] ?? l };
        return m?.[2] === undefined ? base : { ...base, exitCode: Number(m[2]) };
      });

test("claim fixture reaches 0.8 at the 0.75 threshold with a real Jev", async () => {
  const jev = await realJev();
  const cases = loadFixture("claim-verification").cases;
  let right = 0;
  for (const c of cases) {
    const r = await judgeTurn(jev, {
      assistantText: c.state.assistantText ?? "",
      toolEvidence: evidenceOf(c.state.toolEvidence ?? ""),
    });
    const flagged = r.ok && r.value.unverifiedClaim >= 0.75;
    if (flagged === (c.expected === "claim")) right++;
    else console.log("  miss:", c.expected, (c.state.assistantText ?? "").slice(0, 60));
  }
  assert.ok(right / cases.length >= 0.8, `${right}/${cases.length}`);
});

test("drift fixture reaches 0.8 at the 0.75 threshold with a real Jev", async () => {
  const jev = await realJev();
  const cases = loadFixture("drift").cases;
  let right = 0;
  for (const c of cases) {
    const r = await judgeTurn(jev, {
      assistantText: c.state.assistantText ?? "",
      toolEvidence: evidenceOf(c.state.toolEvidence ?? ""),
      ...(c.state.activeSlice === undefined ? {} : { activeSlice: c.state.activeSlice }),
    });
    const flagged = r.ok && r.value.driftFromSlice >= 0.75;
    if (flagged === (c.expected === "drift")) right++;
    else console.log("  miss:", c.expected, (c.state.assistantText ?? "").slice(0, 60));
  }
  assert.ok(right / cases.length >= 0.8, `${right}/${cases.length}`);
});
