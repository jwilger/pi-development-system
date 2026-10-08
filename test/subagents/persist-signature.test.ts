import assert from "node:assert/strict";
import { test } from "node:test";
import { registrySignature } from "../../src/subagents/orch/persist-signature.ts";
import type { AgentType, SavedThread } from "../../src/subagents/types.ts";

type ThreadState = SavedThread["view"]["state"];

const definition = { name: "reviewer", prompt: "x".repeat(50) } as unknown as AgentType;

function thread(state: ThreadState, over: Partial<SavedThread["view"]> = {}): SavedThread {
  return {
    definition,
    view: {
      path: "/review-1",
      parent: null,
      owner: "/root",
      type: "reviewer",
      state,
      task: "t",
      status: "reading",
      createdAt: 1,
      ...over,
    },
  };
}

test("status and output churn on a live thread does not change the signature", () => {
  const before = registrySignature([thread("running", { status: "reading a.ts", output: "a" })]);
  const after = registrySignature([thread("running", { status: "reading b.ts", output: "ab" })]);
  assert.equal(before, after);
});

test("a thread starting, running or settling each change the signature", () => {
  const states = (["starting", "running", "completed"] as const).map((s) =>
    registrySignature([thread(s)]),
  );
  assert.equal(new Set(states).size, 3);
});

test("the output of a settled thread is part of the signature", () => {
  const a = registrySignature([thread("completed", { output: "one" })]);
  const b = registrySignature([thread("completed", { output: "two" })]);
  assert.notEqual(a, b);
});

test("a new thread changes the signature", () => {
  const one = registrySignature([thread("running")]);
  const two = registrySignature([thread("running"), thread("running", { path: "/review-2" })]);
  assert.notEqual(one, two);
});
