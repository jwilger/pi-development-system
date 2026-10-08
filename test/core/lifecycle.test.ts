import assert from "node:assert/strict";
import test from "node:test";
import { type Departure, parseDeparture } from "../../src/core/departure.ts";
import {
  afterReviewRound,
  afterSourceEdit,
  closeSlice,
  reviewWaived,
} from "../../src/core/lifecycle.ts";
import {
  type DevsysState,
  initialState,
  isParseError,
  type SliceRef,
} from "../../src/core/types.ts";

const slice = "s1" as SliceRef;
const at = (phase: DevsysState["phase"], extra: Partial<DevsysState> = {}): DevsysState => ({
  ...initialState(),
  phase,
  sizing: "change",
  activeSlice: slice,
  ...extra,
});
const departure = (id: string, gate: string, scope: Departure["scope"]): Departure => {
  const parsed = parseDeparture({
    id,
    gate,
    tier: "soft",
    default: "d",
    chosen: "c",
    why: "w",
    costIfWrong: "x",
    approver: "agent",
    scope,
    recordedAt: "2026-10-08T00:00:00Z",
  });
  if (isParseError(parsed)) throw new Error(parsed.message);
  return parsed;
};

test("a review round that is not yet satisfied puts an implementing slice in reviewing", () => {
  assert.equal(afterReviewRound(at("implementing"), "review").phase, "reviewing");
  assert.equal(afterReviewRound(at("implementing"), "fix-findings").phase, "reviewing");
  assert.equal(afterReviewRound(at("reviewing"), "review").phase, "reviewing");
});

test("a satisfied review moves an implementing or reviewing slice to delivering", () => {
  assert.equal(afterReviewRound(at("implementing"), "done").phase, "delivering");
  assert.equal(afterReviewRound(at("reviewing"), "done").phase, "delivering");
});

test("new findings after a satisfied review take a delivering slice back to reviewing", () => {
  assert.equal(afterReviewRound(at("delivering"), "fix-findings").phase, "reviewing");
  assert.equal(afterReviewRound(at("delivering"), "stale-diff").phase, "reviewing");
  assert.equal(afterReviewRound(at("delivering"), "done").phase, "delivering");
});

test("review rounds never move planning, idle or a slice-less session", () => {
  assert.equal(afterReviewRound(at("planning"), "done").phase, "planning");
  assert.equal(afterReviewRound(at("idle"), "review").phase, "idle");
  const { activeSlice: _gone, ...none } = at("implementing");
  assert.equal(afterReviewRound(none, "done").phase, "implementing");
});

test("a round for another slice does not move the active one", () => {
  assert.equal(
    afterReviewRound(at("implementing"), "done", "other" as SliceRef).phase,
    "implementing",
  );
});

test("a source edit after review reopens implementing; other phases stay", () => {
  assert.equal(afterSourceEdit(at("delivering")).phase, "implementing");
  assert.equal(afterSourceEdit(at("reviewing")).phase, "reviewing");
  assert.equal(afterSourceEdit(at("implementing")).phase, "implementing");
});

test("closing returns to idle, forgets the slice and its slice-scoped departures only", () => {
  const state = at("delivering", {
    openDepartures: [
      departure("a", "review.unsatisfied", { kind: "slice", slice }),
      departure("b", "tdd.red-first", { kind: "slice", slice: "other" as SliceRef }),
      departure("c", "models.phase-mismatch", { kind: "session" }),
    ],
  });
  const closed = closeSlice(state);
  assert.equal(closed.phase, "idle");
  assert.equal(closed.activeSlice, undefined);
  assert.equal(closed.sizing, undefined);
  assert.deepEqual(
    closed.openDepartures.map((d) => d.id),
    ["b", "c"],
  );
});

test("a slice-scoped review.unsatisfied departure waives the review; others do not", () => {
  const waiver = departure("a", "review.unsatisfied", { kind: "slice", slice });
  assert.equal(reviewWaived(at("implementing", { openDepartures: [waiver] })), true);
  const other = departure("a", "review.unsatisfied", { kind: "slice", slice: "other" as SliceRef });
  assert.equal(reviewWaived(at("implementing", { openDepartures: [other] })), false);
  const gate = departure("a", "tdd.red-first", { kind: "slice", slice });
  assert.equal(reviewWaived(at("implementing", { openDepartures: [gate] })), false);
  const session = departure("a", "review.unsatisfied", { kind: "session" });
  assert.equal(reviewWaived(at("implementing", { openDepartures: [session] })), true);
});
