import assert from "node:assert/strict";
import test from "node:test";
import { cadenceLine } from "../../src/context/cadence.ts";
import { renderContextTail } from "../../src/context/context-tail.ts";
import { initialState } from "../../src/core/types.ts";

const pushed = "2026-10-06T10:00:00.000Z";
const at = (minutes: number) => Date.parse(pushed) + minutes * 60_000;
const implementing = { ...initialState(), phase: "implementing" as const, lastPushAt: pushed };

test("over the limit while implementing names the minutes since the last push", () => {
  assert.equal(
    cadenceLine(implementing, at(73), 60),
    "⚠ 73 min since last push — is this increment too big?",
  );
});

test("at or under the limit, other phases, no push yet or a bad timestamp say nothing", () => {
  assert.equal(cadenceLine(implementing, at(60), 60), undefined);
  assert.equal(cadenceLine({ ...implementing, phase: "reviewing" }, at(300), 60), undefined);
  assert.equal(cadenceLine({ ...initialState(), phase: "implementing" }, at(300), 60), undefined);
  assert.equal(cadenceLine({ ...implementing, lastPushAt: "yesterday" }, at(300), 60), undefined);
});

test("a clock that is before the push says nothing", () => {
  assert.equal(cadenceLine(implementing, at(-5), 60), undefined);
});

test("the context tail carries the cadence line when one is given", () => {
  const tail = renderContextTail(
    implementing,
    "⚠ 73 min since last push — is this increment too big?",
  );
  assert.match(tail ?? "", /73 min since last push/);
  assert.doesNotMatch(renderContextTail(implementing) ?? "", /since last push/);
});
