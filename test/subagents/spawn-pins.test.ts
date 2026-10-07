import assert from "node:assert/strict";
import test from "node:test";
import { ThreadManager } from "../../src/subagents/orch/manager.ts";
import type { AgentDriver, AgentType, DriverOptions } from "../../src/subagents/types.ts";

const coder: AgentType = { name: "coder", description: "codes", systemPrompt: "code" };

function harness(limits: { maxThreads?: number } = {}) {
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
    ...limits,
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

import { createDriverFactory } from "../../src/subagents/orch/runtime.ts";

const sonnet = {
  provider: "anthropic",
  id: "claude-sonnet-5-5",
  api: "anthropic",
  reasoning: true,
};

function factory(mode: "pick-first-scoped" | "use-current" = "pick-first-scoped") {
  const models = [sonnet];
  const ctx = {
    model: sonnet,
    thinkingLevel: "medium",
    scopedModels: [],
    sessionManager: { getSessionId: () => "s" },
    modelRegistry: {
      getAvailable: () => models,
      find: (p: string, i: string) => models.find((m) => m.provider === p && m.id === i),
    },
  };
  // Partial ExtensionContext: settings resolution reads only these members.
  const rootContext = (): Parameters<typeof createDriverFactory>[0] extends () => infer C
    ? C
    : never => ctx as never;
  return createDriverFactory(rootContext, () => mode);
}

test("a pinned model wins even when the type's preference list matches nothing available", () => {
  const type: AgentType = {
    name: "reviewer",
    description: "r",
    systemPrompt: "r",
    models: ["ollama/nothing-here"],
    spawnOverrides: { model: "anthropic/claude-sonnet-5-5", thinkingLevel: "low" },
  };
  const settings = factory().resolveAgentSettings(type, "/root");
  assert.equal(settings.model, "anthropic/claude-sonnet-5-5");
  assert.equal(settings.thinkingLevel, "low");
});

test("an unpinned type with an unmatched preference list is still refused", () => {
  const type: AgentType = {
    name: "reviewer",
    description: "r",
    systemPrompt: "r",
    models: ["ollama/nothing-here"],
  };
  assert.throws(() => factory().resolveAgentSettings(type, "/root"));
});

test("the thread view reports the pins it was spawned with", async () => {
  const { manager } = harness();
  const view = await manager.spawn("/root", {
    path: "/root/pinned-view",
    type: "coder",
    task: "do it",
    model: "anthropic/claude-sonnet-5-5",
  });
  assert.deepEqual(manager.get("/root/pinned-view").pinned, {
    model: "anthropic/claude-sonnet-5-5",
  });
  assert.equal(view.pinned?.model, "anthropic/claude-sonnet-5-5");
});

test("an unpinned thread has no pinned field", async () => {
  const { manager } = harness();
  await manager.spawn("/root", { path: "/root/plain", type: "coder", task: "do it" });
  assert.equal(manager.get("/root/plain").pinned, undefined);
});

function resumeContext(model: { provider: string; modelId: string }) {
  return { model, thinkingLevel: "high" } as never;
}

test("a pinned model is re-applied on resume, even in use-current mode", () => {
  const type: AgentType = {
    name: "reviewer",
    description: "r",
    systemPrompt: "r",
    spawnOverrides: { model: "anthropic/claude-sonnet-5-5" },
  };
  const other = { provider: "openai", id: "other" };
  const ctx = {
    model: other,
    thinkingLevel: "medium",
    scopedModels: [],
    sessionManager: { getSessionId: () => "s" },
    modelRegistry: {
      getAvailable: () => [sonnet, other],
      find: (p: string, i: string) => [sonnet, other].find((m) => m.provider === p && m.id === i),
    },
  };
  for (const mode of ["use-current", "pick-first-scoped"] as const) {
    const f = createDriverFactory(
      () => ctx as never,
      () => mode,
    );
    const resumed = f.resolveInitialSettings(
      type,
      "/root",
      resumeContext({ provider: "openai", modelId: "inherited-from-root" }),
    );
    assert.equal(`${resumed.provider}/${resumed.id}`, "anthropic/claude-sonnet-5-5", mode);
    assert.equal(resumed.thinkingLevel, "high", "saved thinking level survives resume");
  }
});

test("an unpinned resumed thread keeps its restored model", () => {
  const type: AgentType = { name: "coder", description: "c", systemPrompt: "c" };
  const f = factory();
  const resumed = f.resolveInitialSettings(
    type,
    "/root",
    resumeContext({ provider: "openai", modelId: "kept" }),
  );
  assert.equal(`${resumed.provider}/${resumed.id}`, "openai/kept");
});

test("an empty /scoped-models scope does not hide every model", () => {
  const type: AgentType = {
    name: "reviewer",
    description: "r",
    systemPrompt: "r",
    models: ["anthropic/claude-sonnet-*"],
  };
  assert.equal(factory().resolveAgentSettings(type, "/root").model, "anthropic/claude-sonnet-5-5");
});

test("finished threads are archived to make room instead of blocking new spawns", async () => {
  const { manager } = harness({ maxThreads: 3 });
  for (let i = 0; i < 10; i++)
    await manager.spawn("/root", { path: `/root/t${i}`, type: "coder", task: "go" });
  const paths = manager.list().map((t) => t.path);
  assert.equal(paths.length, 3);
  assert.deepEqual(paths, ["/root/t7", "/root/t8", "/root/t9"]);
});

test("a finished parent is kept while a retained child exists", async () => {
  const { manager } = harness({ maxThreads: 2 });
  const view = (path: string, parent: string | null) => ({
    path,
    parent,
    owner: parent ?? "/root",
    type: "coder",
    state: "completed" as const,
    task: "go",
    status: "Done",
    createdAt: 1,
    updatedAt: 1,
    elapsedMs: 0,
    inputTokens: 0,
    outputTokens: 0,
  });
  manager.restore([
    { view: view("/root/parent", "/root"), definition: coder },
    { view: view("/root/parent/kid", "/root/parent"), definition: coder },
  ]);
  await manager.spawn("/root", { path: "/root/next", type: "coder", task: "go" });
  assert.deepEqual(
    manager.list().map((t) => t.path),
    ["/root/parent", "/root/next"],
  );
});

test("live threads still count: the limit refuses when nothing is finished", async () => {
  let release: (value: undefined) => void = () => undefined;
  const held = new Promise<undefined>((resolve) => {
    release = resolve;
  });
  const driver: AgentDriver = {
    prompt: () => held,
    steer: async () => undefined,
    snapshot: () => [],
    output: () => "",
    abort: async () => undefined,
    dispose: () => undefined,
    sendUpdate: () => undefined,
  };
  const manager = new ThreadManager({
    createDriver: async () => driver,
    rootSnapshot: () => [],
    getType: () => coder,
    toolsFor: () => [],
    maxThreads: 2,
  });
  await manager.spawn("/root", { path: "/root/a", type: "coder", task: "go", wait: false });
  await manager.spawn("/root", { path: "/root/b", type: "coder", task: "go", wait: false });
  await assert.rejects(
    manager.spawn("/root", { path: "/root/c", type: "coder", task: "go", wait: false }),
    /Total thread limit reached/,
  );
  release(undefined);
});

const done = (path: string, parent: string | null) => ({
  path,
  parent,
  owner: parent ?? "/root",
  type: "coder",
  state: "completed" as const,
  task: "go",
  status: "Done",
  createdAt: 1,
  updatedAt: 1,
  elapsedMs: 0,
  inputTokens: 0,
  outputTokens: 0,
});

test("spawning under a finished parent at the cap keeps that parent", async () => {
  const { manager } = harness({ maxThreads: 2 });
  manager.restore([
    { view: done("/root/a", "/root"), definition: coder },
    { view: done("/root/b", "/root"), definition: coder },
  ]);
  await manager.spawn("/root", { path: "/root/a/kid", type: "coder", task: "go" });
  const paths = manager.list().map((t) => t.path);
  assert.ok(paths.includes("/root/a"), "the parent of the new thread must survive");
  assert.ok(paths.includes("/root/a/kid"));
  assert.ok(!paths.includes("/root/b"), "the other finished thread made room");
});

test("a refused spawn archives nothing", async () => {
  const manager = new ThreadManager({
    createDriver: async () => {
      throw new Error("unused");
    },
    rootSnapshot: () => [],
    getType: (name) => {
      throw new Error(`Unknown agent type ${name}`);
    },
    toolsFor: () => [],
    maxThreads: 2,
  });
  manager.restore([
    { view: done("/root/a", "/root"), definition: coder },
    { view: done("/root/b", "/root"), definition: coder },
  ]);
  await assert.rejects(
    manager.spawn("/root", { path: "/root/c", type: "nope", task: "go" }),
    /Unknown agent type/,
  );
  assert.deepEqual(
    manager
      .list()
      .map((t) => t.path)
      .sort((a, b) => a.localeCompare(b)),
    ["/root/a", "/root/b"],
  );
});

test("an archived thread's driver is disposed", async () => {
  let disposed = 0;
  const manager = new ThreadManager({
    createDriver: async () => ({
      prompt: async () => undefined,
      steer: async () => undefined,
      snapshot: () => [],
      output: () => "done",
      abort: async () => undefined,
      dispose: () => {
        disposed += 1;
      },
      sendUpdate: () => undefined,
    }),
    rootSnapshot: () => [],
    getType: () => coder,
    toolsFor: () => [],
    maxThreads: 3,
  });
  for (let i = 0; i < 10; i++)
    await manager.spawn("/root", { path: `/root/t${i}`, type: "coder", task: "go" });
  await manager.shutdown();
  assert.equal(disposed, 10, "archived drivers are disposed when dropped, the rest at shutdown");
});

test("a thread whose driver is still being created is not archived", async () => {
  let created = 0;
  let disposed = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const manager = new ThreadManager({
    createDriver: async () => {
      created += 1;
      await gate;
      return {
        prompt: async () => undefined,
        steer: async () => undefined,
        snapshot: () => [],
        output: () => "done",
        abort: async () => undefined,
        dispose: () => {
          disposed += 1;
        },
        sendUpdate: () => undefined,
      };
    },
    rootSnapshot: () => [],
    getType: () => coder,
    toolsFor: () => [],
    maxThreads: 2,
  });
  manager.restore([
    { view: done("/root/a", "/root"), definition: coder },
    { view: done("/root/b", "/root"), definition: coder },
  ]);
  const observing = manager.observeTranscript("/root", "/root/a", () => undefined);
  await new Promise((resolve) => setImmediate(resolve));
  const spawned = manager.spawn("/root", {
    path: "/root/c",
    type: "coder",
    task: "go",
    wait: false,
  });
  await spawned;
  assert.ok(
    manager.list().some((t) => t.path === "/root/a"),
    "the thread being opened stays registered",
  );
  release?.();
  await observing.catch(() => undefined);
  await manager.shutdown();
  assert.equal(disposed, created, "every driver that was created is disposed");
});
