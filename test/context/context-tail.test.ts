import assert from "node:assert/strict";
import test from "node:test";
import { renderContextTail } from "../../src/context/context-tail.ts";
import { parseDeparture } from "../../src/core/departure.ts";
import { type DevsysState, initialState, isParseError } from "../../src/core/types.ts";

const departure = (gate: string, chosen: string) => {
  const d = parseDeparture({
    id: "d1",
    gate,
    tier: "soft",
    default: "x",
    chosen,
    why: "w",
    costIfWrong: "c",
    approver: "agent",
    scope: { kind: "session" },
    recordedAt: "2026-10-06T17:12:00Z",
  });
  if (isParseError(d)) throw new Error(d.message);
  return d;
};

test("an idle state with no departures yields no tail", () => {
  assert.equal(renderContextTail(initialState()), undefined);
});

test("an open departure is named by gate, choice and scope", () => {
  const state: DevsysState = {
    ...initialState(),
    openDepartures: [departure("tdd.red-first", "edit first")],
  };
  const tail = renderContextTail(state);
  assert.ok(tail);
  assert.match(tail, /tdd\.red-first — edit first \(session\)/);
  assert.match(tail, /devsys_record_departure/);
  assert.match(tail, /Jev: unknown/);
});

test("a non-idle phase renders the tail and it stays within 25 lines", () => {
  const many = Array.from({ length: 40 }, (_, i) => departure("tdd.red-first", `c${i}`));
  const tail = renderContextTail({
    ...initialState(),
    phase: "implementing",
    openDepartures: many,
  });
  assert.ok(tail);
  assert.ok(tail.split("\n").length <= 25);
  assert.match(tail, /phase: implementing/);
});

test("active profiles are listed in the tail", () => {
  const tail = renderContextTail({
    ...initialState(),
    phase: "implementing",
    profiles: ["rust", "typescript"],
  });
  assert.match(tail ?? "", /profiles: rust, typescript/);
});

test("no profiles line when none are active", () => {
  const tail = renderContextTail({ ...initialState(), phase: "implementing" });
  assert.doesNotMatch(tail ?? "", /profiles:/);
});
