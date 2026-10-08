import assert from "node:assert/strict";
import test from "node:test";
import { cadenceLine } from "../../src/context/cadence.ts";
import { initialState } from "../../src/core/types.ts";

const pushed = "2026-10-06T10:00:00.000Z";
const at = (minutes: number) => Date.parse(pushed) + minutes * 60_000;
const implementing = { ...initialState(), phase: "implementing" as const, lastPushAt: pushed };

test("over the limit while implementing names the elapsed time in 30-minute buckets", () => {
  assert.equal(
    cadenceLine(implementing, at(73), 60),
    "⚠ over 60 min since last push — is this increment too big?",
  );
  assert.equal(cadenceLine(implementing, at(89), 60), cadenceLine(implementing, at(61), 60));
  assert.match(cadenceLine(implementing, at(95), 60) ?? "", /over 90 min/);
});

test("at or under the limit, other phases, no push yet or a bad timestamp say nothing", () => {
  assert.equal(cadenceLine(implementing, at(60), 60), undefined);
  assert.equal(cadenceLine({ ...implementing, phase: "planning" }, at(200), 60), undefined);
  assert.equal(cadenceLine({ ...initialState(), phase: "implementing" }, at(200), 60), undefined);
  assert.equal(cadenceLine({ ...implementing, lastPushAt: "nope" }, at(200), 60), undefined);
});

test("a clock that is before the push says nothing", () => {
  assert.equal(cadenceLine(implementing, at(-5), 60), undefined);
});

test("a threshold under one bucket never reports less than the threshold", () => {
  assert.equal(
    cadenceLine(implementing, at(25), 20),
    "⚠ over 20 min since last push — is this increment too big?",
  );
});
