import assert from "node:assert/strict";
import test from "node:test";
import type { ClassifierAnswer, ClassifierQuestion } from "@earendil-works/pi-ai";
import { err, ok } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import {
  CLAIM_QUESTION,
  DONE_QUESTION,
  DRIFT_QUESTION,
  judgeTurn,
} from "../../src/jev/questions/turn.ts";
import { loadFixture, questionHash } from "./fixture-runner.ts";

type Seen = { state: Record<string, unknown>; questions: string[] };
const bool = (probability: number): ClassifierAnswer => ({ type: "bool", probability });
const jevWith = (answers: Record<string, ClassifierAnswer> | undefined, seen?: Seen[]): Jev => ({
  ask: async (state, questions: Record<string, ClassifierQuestion>) => {
    seen?.push({ state, questions: Object.keys(questions) });
    return answers === undefined ? err({ kind: "provider", message: "x" }) : ok(answers);
  },
  availability: () => "online",
  model: () => "fake/jev",
});

test("judgeTurn returns both probabilities when a slice is active", async () => {
  const seen: Seen[] = [];
  const r = await judgeTurn(jevWith({ claim: bool(0.9), drift: bool(0.2) }, seen), {
    assistantText: "all tests pass",
    toolEvidence: [],
    activeSlice: "I7",
  });
  assert.deepEqual(r, {
    ok: true,
    value: { unverifiedClaim: 0.9, driftFromSlice: 0.2, sliceDone: 0 },
  });
  assert.deepEqual(seen[0]?.questions, ["claim", "drift"]);
});

test("without an active slice only the claim question is asked and drift is 0", async () => {
  const seen: Seen[] = [];
  const r = await judgeTurn(jevWith({ claim: bool(0.4) }, seen), {
    assistantText: "done",
    toolEvidence: [],
  });
  assert.deepEqual(r, {
    ok: true,
    value: { unverifiedClaim: 0.4, driftFromSlice: 0, sliceDone: 0 },
  });
  assert.deepEqual(seen[0]?.questions, ["claim"]);
  assert.equal("activeSlice" in (seen[0]?.state ?? {}), false);
});

test("evidence is rendered with exit codes, redacted, clipped and capped", async () => {
  const seen: Seen[] = [];
  const evidence = Array.from({ length: 50 }, (_, i) => ({
    tool: "bash",
    summary: `run ${i} ghp_${"a".repeat(36)} ${"x".repeat(1000)}`,
    exitCode: i === 49 ? 1 : 0,
  }));
  await judgeTurn(jevWith({ claim: bool(0) }, seen), {
    assistantText: `says ghp_${"b".repeat(36)} ${"y".repeat(20000)}`,
    toolEvidence: evidence,
  });
  const state = seen[0]?.state as { assistantText: string; toolEvidence: string[] };
  assert.ok(!state.assistantText.includes("ghp_"));
  assert.ok(state.assistantText.length <= 4000);
  assert.equal(state.toolEvidence.length, 30);
  assert.ok(state.toolEvidence.every((l) => l.length < 300 && !l.includes("ghp_")));
  assert.match(state.toolEvidence.at(-1) ?? "", /^bash exit 1: run 49/);
});

test("missing, mistyped or non-finite answers and Jev errors are errors", async () => {
  const input = { assistantText: "t", toolEvidence: [], activeSlice: "s" };
  assert.equal((await judgeTurn(jevWith({ drift: bool(0) }), input)).ok, false);
  assert.equal((await judgeTurn(jevWith({ claim: bool(0) }), input)).ok, false);
  assert.equal(
    (await judgeTurn(jevWith({ claim: bool(Number.NaN), drift: bool(0) }), input)).ok,
    false,
  );
  const choice: ClassifierAnswer = {
    type: "choice",
    choice: "a",
    probabilities: {},
    confidence: 1,
  };
  assert.equal((await judgeTurn(jevWith({ claim: choice, drift: bool(0) }), input)).ok, false);
  assert.equal((await judgeTurn(jevWith(undefined), input)).ok, false);
});

test("turn fixtures pin the current question text", () => {
  assert.equal(loadFixture("claim-verification").questionHash, questionHash({ ...CLAIM_QUESTION }));
  assert.equal(loadFixture("drift").questionHash, questionHash({ ...DRIFT_QUESTION }));
});

test("the done question is asked only on request and with a slice", async () => {
  const seen: Seen[] = [];
  const jev = jevWith({ claim: bool(0.1), drift: bool(0.1), done: bool(0.9) }, seen);
  const input = { assistantText: "finished", toolEvidence: [] };
  const asked = await judgeTurn(jev, { ...input, activeSlice: "I7", checkDone: true });
  assert.deepEqual(asked, {
    ok: true,
    value: { unverifiedClaim: 0.1, driftFromSlice: 0.1, sliceDone: 0.9 },
  });
  await judgeTurn(jev, { ...input, activeSlice: "I7" });
  await judgeTurn(jev, { ...input, checkDone: true });
  assert.deepEqual(
    seen.map((s) => s.questions),
    [["claim", "drift", "done"], ["claim", "drift"], ["claim"]],
  );
});

test("a missing done answer is an error, not a nudge", async () => {
  const r = await judgeTurn(jevWith({ claim: bool(0.1), drift: bool(0.1) }), {
    assistantText: "finished",
    toolEvidence: [],
    activeSlice: "I7",
    checkDone: true,
  });
  assert.equal(r.ok, false);
});

test("the done question is pinned", () => {
  assert.equal(loadFixture("done").questionHash, questionHash({ ...DONE_QUESTION }));
});
