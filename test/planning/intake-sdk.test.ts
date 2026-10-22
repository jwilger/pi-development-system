import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { Type } from "typebox";
import { err } from "../../src/core/result.ts";
import type { Jev } from "../../src/jev/client.ts";
import { createIntakeTool } from "../../src/planning/intake-tool.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { deferred } from "../harness/deferred.ts";
import { offlineSession } from "../harness/offline-session.ts";

test("pi schedules intake mutations sequentially within a parallel tool batch", {
  timeout: 10000,
}, async (t) => {
  const entered = deferred();
  const release = deferred();
  const trace: string[] = [];
  const slow: Jev = {
    ask: async () => {
      entered.resolve();
      await release.promise;
      return err({ kind: "no-model" });
    },
    availability: () => "offline",
    model: () => undefined,
  };
  const host = await offlineSession(
    t,
    (pi) => {
      const state = createSessionState(pi);
      const tool = createIntakeTool({ pi, state, jev: () => slow });
      pi.registerTool({
        ...tool,
        execute: async (id, ...args) => {
          trace.push(`start:${id}`);
          const result = await tool.execute(id, ...args);
          trace.push(`end:${id}`);
          return result;
        },
      });
    },
    (_context, request) =>
      request === 0
        ? [
            {
              type: "toolCall",
              id: "first",
              name: "devsys_intake",
              arguments: { request: "first request" },
            },
            {
              type: "toolCall",
              id: "second",
              name: "devsys_intake",
              arguments: { request: "second request", size: "change" },
            },
          ]
        : [],
  );
  t.after(() => host.dispose());
  host.session.agent.toolExecution = "parallel";
  const pending = host.session.prompt("Run both requests");
  try {
    await entered.promise;
    await setImmediate();
  } finally {
    release.resolve();
  }
  await pending;
  assert.deepEqual(host.errors, []);
  assert.deepEqual(trace, ["start:first", "end:first", "start:second", "end:second"]);
  assert.equal(host.session.getLastAssistantText(), "done");
});

test("pi keeps ordinary waiting controls parallel", { timeout: 10000 }, async (t) => {
  const release = deferred();
  const trace: string[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      pi.registerTool({
        name: "waiting_control",
        label: "Waiting control",
        description: "An ordinary control that must not hold the sequential workflow queue.",
        parameters: Type.Object({}),
        async execute(id) {
          trace.push(`start:${id}`);
          if (id === "first") await release.promise;
          else release.resolve();
          trace.push(`end:${id}`);
          return { content: [{ type: "text", text: "ok" }], details: undefined };
        },
      });
    },
    (_context, request) =>
      request === 0
        ? [
            { type: "toolCall", id: "first", name: "waiting_control", arguments: {} },
            { type: "toolCall", id: "second", name: "waiting_control", arguments: {} },
          ]
        : [],
  );
  t.after(() => host.dispose());
  host.session.agent.toolExecution = "parallel";
  try {
    await host.session.prompt("Run both controls");
  } finally {
    release.resolve();
  }
  assert.deepEqual(host.errors, []);
  assert.deepEqual(trace, ["start:first", "start:second", "end:second", "end:first"]);
});
