import assert from "node:assert/strict";
import test from "node:test";
import { Value } from "typebox/value";
import type { SliceRef } from "../../src/core/types.ts";
import { createSubmissionStore } from "../../src/review/submissions.ts";
import { createSubmitReviewTool, SubmitParameters } from "../../src/review/submit-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const setup = (activeSlice: string | null = "s1") => {
  const fake = createFakePi();
  const state = createSessionState(fake.api);
  if (activeSlice !== null) state.update((s) => ({ ...s, activeSlice: activeSlice as SliceRef }));
  const submissions = createSubmissionStore();
  const tool = createSubmitReviewTool({ state, submissions });
  return {
    state,
    submissions,
    submit: (p: Record<string, unknown>) =>
      tool.execute("c", { ...GOOD, ...p } as never, undefined, undefined, fake.ctx as never),
  };
};
const GOOD = {
  slice: "s1",
  round: 1,
  lenses: ["types"],
  sources: ["a.ts:1-5"],
  findings: [],
  verdict: "no-blocking",
};
const text = (r: { content: readonly { type: string }[] }): string =>
  r.content.map((c) => ("text" in c && typeof c.text === "string" ? c.text : "")).join("\n");

test("the schema accepts a well-formed submission and rejects a bad severity or a zero line", () => {
  assert.equal(Value.Check(SubmitParameters, GOOD), true);
  const bad = { ...GOOD, findings: [{ lens: "types", severity: "major", summary: "x" }] };
  assert.equal(Value.Check(SubmitParameters, bad), false);
  const line0 = { ...GOOD, findings: [{ lens: "types", severity: "nit", line: 0, summary: "x" }] };
  assert.equal(Value.Check(SubmitParameters, line0), false);
  assert.equal(Value.Check(SubmitParameters, { ...GOOD, lenses: [] }), false);
});

test("a valid submission is kept for its round and acknowledged", async () => {
  const t = setup();
  const r = await t.submit({});
  assert.notEqual(r.isError, true);
  assert.match(text(r), /submitted.*s1.*round 1/i);
  assert.equal(t.submissions.forRound("s1" as SliceRef, 1).length, 1);
});

test("a resubmission for the same lenses replaces the first", async () => {
  const t = setup();
  await t.submit({});
  await t.submit({ findings: [{ lens: "types", severity: "nit", summary: "x" }] });
  const kept = t.submissions.forRound("s1" as SliceRef, 1);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.findings.length, 1);
});

test("a self-contradicting submission is refused with its stable id and keeps nothing", async () => {
  const t = setup();
  const r = await t.submit({ findings: [{ lens: "types", severity: "blocking", summary: "x" }] });
  assert.equal(r.isError, true);
  assert.match(text(r), /^verdict-contradicts-findings:/);
  assert.equal(t.submissions.forRound("s1" as SliceRef, 1).length, 0);
});

test("a submission for the wrong round is refused: a round is recorded once", async () => {
  const t = setup();
  const r = await t.submit({ round: 3 });
  assert.equal(r.isError, true);
  assert.match(text(r), /^wrong-round:.*round 3.*round 1/);
});

test("a round is expected after the rounds already recorded", async () => {
  const t = setup();
  t.state.update((s) => ({
    ...s,
    reviews: [
      {
        slice: "s1" as SliceRef,
        required: 3,
        rounds: [{ n: 1, lenses: [], findings: [], reviewedAt: "x", diffDigest: "d" }],
      },
    ],
  }));
  assert.equal((await t.submit({ round: 1 })).isError, true);
  assert.notEqual((await t.submit({ round: 2 })).isError, true);
});

test("a submission for a slice that is neither active nor under review is refused", async () => {
  const t = setup("s1");
  const r = await t.submit({ slice: "other" });
  assert.equal(r.isError, true);
  assert.match(text(r), /^unknown-slice:/);
  const none = setup(null);
  assert.match(text(await none.submit({})), /^unknown-slice:/);
});

test("a resubmission with overlapping lenses replaces the earlier one; disjoint lenses are kept", async () => {
  const t = setup();
  await t.submit({
    findings: [{ lens: "types", severity: "blocking", summary: "x" }],
    verdict: "blocking",
  });
  await t.submit({ lenses: ["types", "tests"], findings: [] });
  const kept = t.submissions.forRound("s1" as SliceRef, 1);
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0]?.findings, []);
  await t.submit({ lenses: ["ux"] });
  assert.equal(t.submissions.forRound("s1" as SliceRef, 1).length, 2);
});
