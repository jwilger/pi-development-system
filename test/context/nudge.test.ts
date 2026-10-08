import assert from "node:assert/strict";
import test from "node:test";
import { renderNudge } from "../../src/context/nudge.ts";
import { initialState } from "../../src/core/types.ts";

const pushed = "2026-10-06T10:00:00.000Z";
const at = (minutes: number) => Date.parse(pushed) + minutes * 60_000;
const implementing = { ...initialState(), phase: "implementing" as const, lastPushAt: pushed };

test("nothing to say yields no message at all", () => {
  assert.equal(renderNudge(initialState(), at(0), 60, undefined, undefined), undefined);
  assert.equal(renderNudge(implementing, at(10), 60, undefined, undefined), undefined);
});

test("an intent line becomes a one-shot message", () => {
  const n = renderNudge(initialState(), at(0), 60, "call devsys_intake", undefined);
  assert.equal(n?.text, "[development-system]\ncall devsys_intake");
  assert.equal(n?.cadence, undefined);
});

test("the cadence warning is said once per bucket, not on every prompt", () => {
  const first = renderNudge(implementing, at(70), 60, undefined, undefined);
  assert.match(first?.text ?? "", /over 60 min/);
  const again = renderNudge(implementing, at(80), 60, undefined, first?.cadence);
  assert.equal(again, undefined);
  const later = renderNudge(implementing, at(95), 60, undefined, first?.cadence);
  assert.match(later?.text ?? "", /over 90 min/);
});

test("an intent line still goes out while the cadence text is unchanged", () => {
  const first = renderNudge(implementing, at(70), 60, undefined, undefined);
  const n = renderNudge(implementing, at(80), 60, "review it", first?.cadence);
  assert.equal(n?.text, "[development-system]\nreview it");
  assert.equal(n?.cadence, first?.cadence);
});
