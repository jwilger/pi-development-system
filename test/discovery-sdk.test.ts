import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentTools } from "@earendil-works/pi-ai";
import {
  createCodemodeExtension,
  createToolSearchExtension,
  type ExtensionAPI,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createDevelopmentSystem } from "../extensions/development-system.ts";
import { offlineSession } from "./harness/offline-session.ts";

const RARE = ["devsys_models", "devsys_route_task", "devsys_task_check", "devsys_work_item"];

test("search-only startup defers rare tools and real tool search activates the selected tool", async (t) => {
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      pi.on("session_start", () => pi.setActiveTools(["tool_search"]));
      createDevelopmentSystem(pi);
    },
    (_context, request) =>
      request === 0
        ? [
            {
              type: "toolCall",
              id: "search",
              name: "tool_search",
              arguments: { query: "devsys_models", limit: 1 },
            },
          ]
        : [],
  );
  for (const name of RARE) assert.ok(!host.session.getActiveToolNames().includes(name), name);
  await host.session.prompt("Find the model matrix tool.");
  assert.ok(host.session.getActiveToolNames().includes("devsys_models"));
  assert.deepEqual(host.errors, []);
});

test("discovery changes restore fallback and withdraw only automatic declarations", async (t) => {
  const offered: string[][] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      pi.on("session_start", () => pi.setActiveTools(["tool_search", "devsys_models"]));
      createDevelopmentSystem(pi);
    },
    (context) => {
      offered.push(getCurrentTools(context.messages).map((tool) => tool.name));
      return [];
    },
  );
  host.session.setActiveToolsByName(["devsys_models"]);
  await host.session.prompt("Discovery is off.");
  for (const name of RARE) {
    assert.ok(host.session.getActiveToolNames().includes(name), name);
    assert.ok(offered[0]?.includes(name), `first request after disabling discovery: ${name}`);
  }
  host.session.setActiveToolsByName([...host.session.getActiveToolNames(), "tool_search"]);
  await host.session.prompt("Discovery is back on.");
  const active = host.session.getActiveToolNames();
  assert.ok(active.includes("devsys_models"), "preserve independently activated tools");
  for (const name of RARE.slice(1)) {
    assert.ok(!active.includes(name), name);
    assert.ok(!offered[1]?.includes(name), `first request after enabling discovery: ${name}`);
  }
  assert.deepEqual(host.errors, []);
});

test("discovery activated by a tool changes the very next provider request", async (t) => {
  const offered: string[][] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      createDevelopmentSystem(pi);
      pi.registerTool({
        name: "enable_discovery",
        label: "Enable discovery",
        description: "Enable search for this SDK fixture",
        parameters: Type.Object({}),
        async execute() {
          pi.setActiveTools([...pi.getActiveTools(), "tool_search"]);
          return { content: [{ type: "text", text: "enabled" }], details: undefined };
        },
      });
    },
    (context, request) => {
      offered.push(getCurrentTools(context.messages).map((tool) => tool.name));
      return request === 0
        ? [{ type: "toolCall", id: "enable", name: "enable_discovery", arguments: {} }]
        : [];
    },
  );
  await host.session.prompt("Enable discovery during this run.");
  assert.equal(offered.length, 2);
  for (const name of RARE) {
    assert.ok(offered[0]?.includes(name), name);
    assert.ok(!offered[1]?.includes(name), `next request after a tool changes discovery: ${name}`);
  }
  assert.ok(offered[1]?.includes("tool_search"));
  assert.deepEqual(host.errors, []);
});

test("fallback ownership survives a real extension reload", async (t) => {
  const selection: { activate: (pi: ExtensionAPI) => void } = { activate: () => undefined };
  const offered: string[][] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      createDevelopmentSystem(pi);
      pi.on("session_start", () => selection.activate(pi));
    },
    (context) => {
      offered.push(getCurrentTools(context.messages).map((tool) => tool.name));
      return [];
    },
  );
  await host.session.prompt("Use fallback before reload.");
  for (const name of RARE) assert.ok(offered[0]?.includes(name), name);
  selection.activate = (pi) => pi.setActiveTools([...pi.getActiveTools(), "tool_search"]);
  await host.session.reload();
  await host.session.prompt("Use search after reload.");
  for (const name of RARE)
    assert.ok(!offered[1]?.includes(name), `stale fallback after reload: ${name}`);
  assert.deepEqual(host.errors, []);
});

test("discovery restoration does not discard pending late tool registrations", async (t) => {
  const selection: { activate: (pi: ExtensionAPI) => void } = { activate: () => undefined };
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      pi.on("session_start", () => selection.activate(pi));
      createDevelopmentSystem(pi);
      pi.on("session_start", () =>
        pi.registerTool({
          name: "late_fixture",
          label: "Late fixture",
          description: "Tool registering after fallback restoration",
          exposure: "codemode",
          parameters: Type.Object({}),
          async execute() {
            return { content: [], details: undefined };
          },
        }),
      );
    },
    () => [],
  );
  host.session.setActiveToolsByName([...host.session.getActiveToolNames(), "late_fixture"]);
  await host.session.prompt("Select a tool that registers late.");
  selection.activate = (pi) => pi.setActiveTools([...pi.getActiveTools(), "tool_search"]);
  await host.session.reload();
  assert.ok(
    host.session.getActiveToolNames().includes("late_fixture"),
    "preserve pending selection after reload",
  );
  await host.session.prompt("Start with discovery and the restored tool.");
  assert.ok(host.session.getActiveToolNames().includes("late_fixture"));
  for (const name of RARE) assert.ok(!host.session.getActiveToolNames().includes(name), name);
  assert.deepEqual(host.errors, []);
});

test("withdrawing fallback preserves tools arriving in a later before-agent hook", async (t) => {
  const selection: { activate: (pi: ExtensionAPI) => void } = { activate: () => undefined };
  const registerLate = (pi: ExtensionAPI) =>
    pi.registerTool({
      name: "late_before_agent",
      label: "Late before agent",
      description: "Pending tool registered by a later before-agent hook",
      exposure: "codemode",
      parameters: Type.Object({}),
      async execute() {
        return { content: [], details: undefined };
      },
    });
  const phase = { install: registerLate };
  const offered: string[][] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      pi.on("session_start", () => selection.activate(pi));
      createDevelopmentSystem(pi);
      phase.install(pi);
    },
    (context, request) => {
      offered.push(getCurrentTools(context.messages).map((tool) => tool.name));
      return request === 1
        ? [
            {
              type: "toolCall",
              id: "search",
              name: "tool_search",
              arguments: { query: "devsys_models", limit: 1 },
            },
          ]
        : [];
    },
  );
  host.session.setActiveToolsByName([...host.session.getActiveToolNames(), "late_before_agent"]);
  await host.session.prompt("Previously selected late tool.");
  selection.activate = (pi) => pi.setActiveTools([...pi.getActiveTools(), "tool_search"]);
  phase.install = (pi) => pi.on("before_agent_start", () => registerLate(pi));
  await host.session.reload();
  await host.session.prompt("Search after the pending tool connects.");
  assert.ok(offered[1]?.includes("late_before_agent"), "retain selection registered in later hook");
  for (const name of RARE) assert.ok(!offered[1]?.includes(name), name);
  assert.ok(offered[2]?.includes("devsys_models"), "fallback remains searchable immediately");
  assert.deepEqual(host.errors, []);
});

test("tree navigation cannot turn automatic fallback into an explicit selection", async (t) => {
  const offered: string[][] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      pi.on("session_start", () => pi.appendEntry("before-fallback", null));
      createDevelopmentSystem(pi);
    },
    (context) => {
      offered.push(getCurrentTools(context.messages).map((tool) => tool.name));
      return [];
    },
  );
  const target = host.session.sessionManager
    .getBranch()
    .find((entry) => entry.type === "custom" && entry.customType === "before-fallback");
  assert.ok(target);
  await host.session.prompt("Fallback on the first branch.");
  await host.session.navigateTree(target.id, { summarize: false });
  host.session.setActiveToolsByName([...host.session.getActiveToolNames(), "tool_search"]);
  await host.session.prompt("Discovery on the older branch.");
  for (const name of RARE)
    assert.ok(!offered[1]?.includes(name), `stale fallback after tree: ${name}`);
  assert.deepEqual(host.errors, []);
});

test("returning to a search-only branch withdraws fallback absent from that branch", async (t) => {
  const offered: string[][] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      pi.on("session_start", () => pi.setActiveTools(["tool_search"]));
      createDevelopmentSystem(pi);
    },
    (context) => {
      offered.push(getCurrentTools(context.messages).map((tool) => tool.name));
      return [];
    },
  );
  await host.session.prompt("Search-only branch.");
  const searchLeaf = host.session.sessionManager.getBranch().at(-1);
  assert.ok(searchLeaf);
  host.session.setActiveToolsByName([]);
  await host.session.prompt("Fallback on another branch.");
  for (const name of RARE) assert.ok(offered[1]?.includes(name), name);
  await host.session.navigateTree(searchLeaf.id, { summarize: false });
  await host.session.prompt("Return to the original search-only loadout.");
  assert.ok(offered[2]?.includes("tool_search"));
  for (const name of RARE)
    assert.ok(!offered[2]?.includes(name), `fallback introduced after this branch: ${name}`);
  assert.deepEqual(host.errors, []);
});

test("tree-restored fallback ownership survives reload before the next prompt", async (t) => {
  const offered: string[][] = [];
  const setup: { activate: (pi: ExtensionAPI) => void } = {
    activate: (pi) => pi.setActiveTools(["tool_search"]),
  };
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      pi.on("session_start", () => setup.activate(pi));
      createDevelopmentSystem(pi);
    },
    (context) => {
      offered.push(getCurrentTools(context.messages).map((tool) => tool.name));
      return [];
    },
  );
  await host.session.prompt("Search-only branch.");
  const searchLeaf = host.session.sessionManager.getBranch().at(-1);
  assert.ok(searchLeaf);
  host.session.setActiveToolsByName([]);
  await host.session.prompt("Fallback on another branch.");
  for (const name of RARE) assert.ok(offered[1]?.includes(name), name);
  await host.session.navigateTree(searchLeaf.id, { summarize: false });
  setup.activate = () => undefined;
  await host.session.reload();
  await host.session.prompt("Reloaded before resuming the search-only branch.");
  assert.ok(offered[2]?.includes("tool_search"));
  for (const name of RARE)
    assert.ok(!offered[2]?.includes(name), `owned before intervening reload: ${name}`);
  assert.deepEqual(host.errors, []);
});

test("returning to a discovery branch preserves a search-activated tool", async (t) => {
  const offered: string[][] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      createDevelopmentSystem(pi);
    },
    (context, request) => {
      offered.push(getCurrentTools(context.messages).map((tool) => tool.name));
      return request === 1
        ? [
            {
              type: "toolCall",
              id: "search",
              name: "tool_search",
              arguments: { query: "devsys_models", limit: 1 },
            },
          ]
        : [];
    },
  );
  await host.session.prompt("First branch uses fallback.");
  const beforeDiscovery = host.session.sessionManager.getBranch().at(-1);
  assert.ok(beforeDiscovery);
  host.session.setActiveToolsByName([...host.session.getActiveToolNames(), "tool_search"]);
  await host.session.prompt("Activate the selected tool through search.");
  const discoveryLeaf = host.session.sessionManager.getBranch().at(-1);
  assert.ok(discoveryLeaf);
  assert.ok(offered[2]?.includes("devsys_models"));
  await host.session.navigateTree(beforeDiscovery.id, { summarize: false });
  await host.session.navigateTree(discoveryLeaf.id, { summarize: false });
  await host.session.prompt("Continue on the discovery branch.");
  assert.ok(
    offered[3]?.includes("devsys_models"),
    "preserve the tool selected on the restored branch",
  );
  for (const name of RARE.slice(1)) assert.ok(!offered[3]?.includes(name), name);
  assert.deepEqual(host.errors, []);
});

test("upgrading a legacy session preserves selections with unknown ownership", async (t) => {
  const version: { install: ExtensionFactory } = {
    install(pi) {
      // Before 1.7.0 direct registration activated these without an ownership entry.
      for (const name of RARE) {
        pi.registerTool({
          name,
          label: name,
          description: "Legacy direct registration fixture",
          exposure: "direct",
          parameters: Type.Object({}),
          async execute() {
            return { content: [], details: undefined };
          },
        });
      }
    },
  };
  const offered: string[][] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      createToolSearchExtension()(pi);
      return version.install(pi);
    },
    (context) => {
      offered.push(getCurrentTools(context.messages).map((tool) => tool.name));
      return [];
    },
  );
  await host.session.prompt("Legacy session without provenance.");
  version.install = (pi) => {
    createDevelopmentSystem(pi);
  };
  await host.session.reload();
  host.session.setActiveToolsByName([...host.session.getActiveToolNames(), "tool_search"]);
  await host.session.prompt("Upgrade without guessing user intent.");
  for (const name of RARE)
    assert.ok(offered[1]?.includes(name), `preserve unowned selection: ${name}`);
  assert.deepEqual(host.errors, []);
});

test("late codemode activation withdraws fallback without declaring judge wrappers", async (t) => {
  const host = await offlineSession(
    t,
    (pi) => {
      createCodemodeExtension()(pi);
      createDevelopmentSystem(pi);
    },
    () => [],
  );
  for (const name of RARE) assert.ok(host.session.getActiveToolNames().includes(name), name);
  host.session.setActiveToolsByName([...host.session.getActiveToolNames(), "codemode"]);
  await host.session.prompt("Codemode is now available.");
  for (const name of [
    ...RARE,
    "judge_sizing",
    "judge_lenses",
    "judge_test_change",
    "judge_task_readiness",
  ]) {
    assert.ok(!host.session.getActiveToolNames().includes(name), name);
  }
  host.session.setActiveToolsByName([]);
  await host.session.prompt("No discovery tool remains.");
  for (const name of RARE) assert.ok(host.session.getActiveToolNames().includes(name), name);
  assert.deepEqual(host.errors, []);
});
