import assert from "node:assert/strict";
import test from "node:test";
import { ThreadManager } from "../../src/subagents/orch/manager.ts";
import type { AgentDriver, AgentType, DriverOptions } from "../../src/subagents/types.ts";

const coder: AgentType = { name: "coder", description: "codes", systemPrompt: "code" };

function harness() {
  const seen: DriverOptions[] = [];
  const driver: AgentDriver = {
    prompt: async () => undefined,
    steer: async () => undefined,
    snapshot: () => [],
    output: () => "done",
    abort: async () => undefined,
    dispose: () => undefined,
    sendUpdate: () => undefined,
  };
  const manager = new ThreadManager({
    createDriver: async (options) => {
      seen.push(options);
      return driver;
    },
    rootSnapshot: () => [],
    getType: () => coder,
    toolsFor: () => [],
  });
  return { manager, seen };
}

test("agent_spawn hands the driver the pinned model and thinking level", async () => {
  const { manager, seen } = harness();
  await manager.spawn("/root", {
    path: "/root/pinned",
    type: "coder",
    task: "do it",
    model: "anthropic/claude-sonnet-5-5",
    thinkingLevel: "high",
  });
  assert.deepEqual(seen[0]?.type.spawnOverrides, {
    model: "anthropic/claude-sonnet-5-5",
    thinkingLevel: "high",
  });
});

test("a spawn without pins leaves the type untouched", async () => {
  const { manager, seen } = harness();
  await manager.spawn("/root", { path: "/root/plain", type: "coder", task: "do it" });
  assert.equal(seen[0]?.type.spawnOverrides, undefined);
  assert.equal(coder.spawnOverrides, undefined);
});

test("a malformed pin is refused before any thread exists", async () => {
  const { manager } = harness();
  await assert.rejects(
    manager.spawn("/root", { path: "/root/bad", type: "coder", task: "x", thinkingLevel: "turbo" }),
    /thinkingLevel must be one of/,
  );
  assert.equal(manager.list().length, 0);
});
