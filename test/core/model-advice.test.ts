import assert from "node:assert/strict";
import test from "node:test";
import { adviseModel, requiredSlot, tierOf } from "../../src/core/model-advice.ts";
import { defaultMatrix } from "../../src/core/models.ts";

const matrix = defaultMatrix();
const available = [
  { provider: "openai", id: "gpt-6-astra" },
  { provider: "openai", id: "gpt-6.1-sol" },
  { provider: "openai", id: "gpt-6.1-luna" },
  { provider: "anthropic", id: "claude-opus-5-5" },
  { provider: "anthropic", id: "claude-sonnet-5-5" },
  { provider: "anthropic", id: "claude-haiku-5" },
];

test("a model's tier is the lowest tier whose candidates list it", () => {
  assert.equal(tierOf(matrix, "openai/gpt-6-astra"), "frontier");
  assert.equal(tierOf(matrix, "openai/gpt-6.1-sol"), "strong");
  assert.equal(tierOf(matrix, "anthropic/claude-opus-5-5"), "strong");
  assert.equal(tierOf(matrix, "anthropic/claude-sonnet-5-5"), "strong");
  assert.equal(tierOf(matrix, "openai/gpt-6.1-luna"), "fast");
  assert.equal(tierOf(matrix, "anthropic/claude-haiku-5"), "fast");
  assert.equal(tierOf(matrix, "acme/unknown-1"), undefined);
});

test("phases map to slots; delivering and idle have none", () => {
  assert.equal(requiredSlot("planning"), "planning");
  assert.equal(requiredSlot("implementing"), "implementer");
  assert.equal(requiredSlot("reviewing"), "reviewer");
  assert.equal(requiredSlot("delivering"), undefined);
  assert.equal(requiredSlot("idle"), undefined);
  assert.equal(requiredSlot("intake"), undefined);
});

test("a lower tier than the phase needs gets a recommendation that never switches the model", () => {
  const advice = adviseModel({
    matrix,
    available,
    phase: "planning",
    model: "anthropic/claude-sonnet-5-5",
  });
  assert.ok(advice !== undefined);
  assert.match(advice, /planning on anthropic\/claude-sonnet-5-5 \(strong tier\)/);
  assert.match(advice, /frontier/);
  assert.match(advice, /openai\/gpt-6-astra/);
  assert.match(advice, /advisor/);
  assert.match(advice, /models\.phase-mismatch/);
});

test("the same or a higher tier gets no advice", () => {
  const strong = { matrix, available, phase: "implementing" as const };
  assert.equal(adviseModel({ ...strong, model: "openai/gpt-6.1-sol" }), undefined);
  assert.equal(adviseModel({ ...strong, model: "openai/gpt-6-astra" }), undefined);
  assert.equal(adviseModel({ ...strong, model: "anthropic/claude-sonnet-5-5" }), undefined);
});

test("a model the phase's own slot lists is fine even when it sits in a lower tier", () => {
  assert.equal(
    adviseModel({ matrix, available, phase: "planning", model: "anthropic/claude-opus-5-5" }),
    undefined,
  );
});

test("fast tier on a reviewer phase is flagged", () => {
  assert.match(
    adviseModel({ matrix, available, phase: "reviewing", model: "anthropic/claude-haiku-5" }) ?? "",
    /fast tier/,
  );
});

test("unknown models, unresolvable slots and no-slot phases are silent", () => {
  assert.equal(adviseModel({ matrix, available, phase: "planning", model: "acme/x" }), undefined);
  assert.equal(
    adviseModel({ matrix, available: [], phase: "planning", model: "anthropic/claude-haiku-5" }),
    undefined,
  );
  assert.equal(
    adviseModel({ matrix, available, phase: "delivering", model: "anthropic/claude-haiku-5" }),
    undefined,
  );
});

test("on an Anthropic-only machine planning on sonnet or haiku is flagged against opus", () => {
  const anthropic = available.filter((m) => m.provider === "anthropic");
  const sonnet = adviseModel({
    matrix,
    available: anthropic,
    phase: "planning",
    model: "anthropic/claude-sonnet-5-5",
  });
  assert.match(sonnet ?? "", /prefers anthropic\/claude-opus-5-5 \(frontier tier\)/);
  const haiku = adviseModel({
    matrix,
    available: anthropic,
    phase: "planning",
    model: "anthropic/claude-haiku-5",
  });
  assert.match(haiku ?? "", /haiku-5 \(fast tier\)/);
  assert.equal(
    adviseModel({
      matrix,
      available: anthropic,
      phase: "planning",
      model: "anthropic/claude-opus-5-5",
    }),
    undefined,
  );
});
