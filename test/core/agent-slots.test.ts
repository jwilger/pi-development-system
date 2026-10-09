import assert from "node:assert/strict";
import test from "node:test";
import { slotForAgentType, spawnModelFor } from "../../src/core/agent-slots.ts";
import { defaultMatrix, type ModelMatrix } from "../../src/core/models.ts";

const available = [
  { provider: "acme", id: "big-2" },
  { provider: "acme", id: "small-1" },
];
const pinned = (slot: string, ...candidates: string[]): ModelMatrix => ({
  ...defaultMatrix(),
  [slot]: candidates,
});

test("each agent type asks for the slot that does its job", () => {
  for (const [type, slot] of [
    ["reviewer", "reviewer"],
    ["implementer", "implementer"],
    ["coder", "implementer"],
    ["researcher", "researcher"],
    ["advisor", "advisor"],
    ["architect", "planning"],
    ["tasker", "planning"],
    ["lens-cagan", "lens"],
    ["lens-rumelt", "lens"],
  ] as const) {
    assert.equal(slotForAgentType(type), slot, type);
  }
  assert.equal(slotForAgentType("writer"), undefined);
  assert.equal(slotForAgentType("my-own-agent"), undefined);
});

test("a slot the project configured resolves to a model it can use", () => {
  const matrix = pinned("reviewer", "acme/missing-1", "acme/big-*");
  assert.equal(spawnModelFor("reviewer", matrix, available), "acme/big-2");
});

test("a slot left at the shipped default is not forced over the agent type's own list", () => {
  assert.equal(spawnModelFor("reviewer", defaultMatrix(), available), undefined);
});

test("an unmapped agent type, or a slot that resolves to nothing, is left alone", () => {
  assert.equal(spawnModelFor("writer", pinned("reviewer", "acme/big-2"), available), undefined);
  assert.equal(spawnModelFor("reviewer", pinned("reviewer", "other/none-1"), available), undefined);
});

test("configuring a tier reaches the slots that point at it", () => {
  const matrix = { ...defaultMatrix(), strong: ["acme/big-2"] };
  assert.equal(spawnModelFor("implementer", matrix, available), "acme/big-2");
});
