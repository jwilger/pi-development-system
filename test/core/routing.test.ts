import assert from "node:assert/strict";
import test from "node:test";
import { defaultMatrix } from "../../src/core/models.ts";
import { pickRoute, recommendRoute } from "../../src/core/routing.ts";

const routing = {
  "trivial/low": { slot: "fast", thinkingLevel: "low" },
  "trivial/*": { slot: "implementer", thinkingLevel: "medium" },
  "routine/*": { slot: "strong", thinkingLevel: "high" },
  "*/high": { slot: "frontier", thinkingLevel: "xhigh" },
} as const;

test("pickRoute prefers the exact key, then difficulty/*, then */risk", () => {
  assert.deepEqual(pickRoute(routing, "trivial", "low"), { slot: "fast", thinkingLevel: "low" });
  assert.deepEqual(pickRoute(routing, "trivial", "medium"), {
    slot: "implementer",
    thinkingLevel: "medium",
  });
  assert.deepEqual(pickRoute(routing, "complex", "high"), {
    slot: "frontier",
    thinkingLevel: "xhigh",
  });
});

test("pickRoute returns undefined when nothing matches", () => {
  assert.equal(pickRoute({}, "expert", "low"), undefined);
});

const available = [
  { provider: "anthropic", id: "claude-sonnet-5-5" },
  { provider: "anthropic", id: "claude-opus-5-1" },
];

test("recommendRoute resolves the slot to a model on this machine", () => {
  const r = recommendRoute({
    routing,
    matrix: defaultMatrix(),
    available,
    difficulty: "routine",
    risk: "low",
  });
  assert.equal(r.slot, "strong");
  assert.equal(r.thinkingLevel, "high");
  assert.equal(r.model, "anthropic/claude-sonnet-5-5");
});

test("recommendRoute omits the model and says why when the slot cannot resolve", () => {
  const r = recommendRoute({
    routing,
    matrix: defaultMatrix(),
    available: [],
    difficulty: "routine",
    risk: "low",
  });
  assert.equal(r.model, undefined);
  assert.match(r.note, /no model.*strong|strong.*unresolv/i);
});

test("recommendRoute with no matching route falls back to the implementer slot", () => {
  const r = recommendRoute({
    routing: {},
    matrix: defaultMatrix(),
    available,
    difficulty: "expert",
    risk: "high",
  });
  assert.equal(r.slot, "implementer");
  assert.match(r.note, /no routing entry/i);
});
