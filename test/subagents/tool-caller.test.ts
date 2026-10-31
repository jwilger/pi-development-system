import assert from "node:assert/strict";
import test from "node:test";
import { Type } from "typebox";
import {
  createInheritedToolSource,
  type InheritedToolSource,
} from "../../src/subagents/orch/inherited-tools.ts";
import { createDriverFactory } from "../../src/subagents/orch/runtime.ts";
import {
  expectInheritedReviewer,
  type InheritedToolCaller,
  inheritedToolCaller,
  runWithInheritedToolCaller,
} from "../../src/subagents/orch/tool-caller.ts";
import type { AgentDriver, DriverOptions } from "../../src/subagents/types.ts";
import { offlineSession } from "../harness/offline-session.ts";

test("the pi inherited bridge preserves concurrent host caller provenance without giving root calls a child identity", async (t) => {
  let snapshot: InheritedToolSource | undefined;
  const observed: (InheritedToolCaller | undefined)[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      const source = createInheritedToolSource(pi);
      pi.registerTool({
        name: "observe_caller",
        label: "Observe",
        description: "Observe host provenance",
        parameters: Type.Object({}),
        async execute() {
          await Promise.resolve();
          observed.push(inheritedToolCaller());
          return { content: [{ type: "text", text: "observed" }], details: undefined };
        },
      });
      pi.registerTool({
        name: "capture",
        label: "Capture",
        description: "Capture the bridge",
        parameters: Type.Object({}),
        prepareLoadout: source.captureLoadout,
        async execute(_id, _args, _signal, _update, ctx) {
          source.captureContext(ctx);
          snapshot = source.snapshot();
          return { content: [{ type: "text", text: "captured" }], details: undefined };
        },
      });
    },
    (_context, request) =>
      request === 0 ? [{ type: "toolCall", id: "capture", name: "capture", arguments: {} }] : [],
  );
  await host.session.prompt("Capture the root execution bridge.");
  assert.deepEqual(host.errors, []);
  const tool = snapshot?.tools.find((candidate) => candidate.name === "observe_caller");
  assert.ok(tool);
  const first: InheritedToolCaller = {
    rootId: "root",
    threadPath: "/first-review",
    parentPath: null,
    agentType: "reviewer",
    sessionFile: "/first.jsonl",
    attemptId: "first-attempt",
  };
  const second: InheritedToolCaller = {
    ...first,
    threadPath: "/second-review",
    sessionFile: "/second.jsonl",
    attemptId: "second-attempt",
  };
  const execute = () => tool.execute("observe", {}, undefined, undefined, {} as never);
  await Promise.all([first, second].map((caller) => runWithInheritedToolCaller(caller, execute)));
  assert.deepEqual(observed, [first, second]);
  assert.equal(inheritedToolCaller(), undefined);
  await execute();
  assert.deepEqual(observed, [first, second, undefined]);
});

test("fresh and restored pi children supply runtime-owned identities to inherited root tools", async (t) => {
  let child: AgentDriver | undefined;
  let expectedAttempt: string | undefined;
  let restore: (() => Promise<AgentDriver>) | undefined;
  const observed: (InheritedToolCaller | undefined)[] = [];
  const host = await offlineSession(
    t,
    (pi) => {
      const source = createInheritedToolSource(pi);
      pi.registerTool({
        name: "observe_caller",
        label: "Observe",
        description: "Observe runtime provenance",
        parameters: Type.Object({}),
        async execute() {
          observed.push(inheritedToolCaller());
          return { content: [{ type: "text", text: "observed" }], details: undefined };
        },
      });
      pi.registerTool({
        name: "prepare_child",
        label: "Prepare",
        description: "Prepare a real child",
        parameters: Type.Object({}),
        prepareLoadout: source.captureLoadout,
        async execute(_id, _args, _signal, _update, ctx) {
          source.captureContext(ctx);
          const factory = createDriverFactory(
            () => ctx,
            () => "use-current",
            () => "allowed",
            () => source.snapshot(),
          );
          const options: DriverOptions = {
            path: "/independent-review",
            parentPath: null,
            type: {
              name: "reviewer",
              description: "Fixture",
              systemPrompt: "Inspect provenance.",
              tools: { allow: ["observe_caller"] },
              spawnOverrides: { model: "offline-devsys/pinned", thinkingLevel: "off" },
            },
            inherited: [],
            tools: [],
            signal: new AbortController().signal,
            shouldPause: () => false,
            onEvent: () => undefined,
          };
          expectedAttempt = expectInheritedReviewer(
            ctx.sessionManager.getSessionId(),
            options.path,
          ).attemptId;
          child = await factory(options);
          restore = () => {
            assert.ok(child);
            return factory({
              ...options,
              sessionFile: child.sessionFile,
              sessionLeafId: child.sessionLeafId ?? null,
            });
          };
          return { content: [{ type: "text", text: "prepared" }], details: undefined };
        },
      });
    },
    (_context, request) => {
      if (request === 0)
        return [{ type: "toolCall", id: "prepare", name: "prepare_child", arguments: {} }];
      if (request === 2 || request === 4)
        return [
          { type: "toolCall", id: `observe-${request}`, name: "observe_caller", arguments: {} },
        ];
      return [];
    },
  );
  t.after(() => child?.dispose());
  await host.session.prompt("Prepare the independent reviewer.");
  assert.ok(child, JSON.stringify(host.errors));
  await child.prompt("Observe host provenance.");
  const first = observed[0];
  assert.ok(first, "a real child must carry host provenance through the root execution bridge");
  assert.equal(first.threadPath, "/independent-review");
  assert.equal(first.parentPath, null);
  assert.equal(first.agentType, "reviewer");
  assert.equal(first.attemptId, expectedAttempt);
  assert.equal(first.sessionFile, child.sessionFile);
  assert.ok(first.rootId);
  assert.ok(first.attemptId);
  assert.ok(restore);
  child.dispose();
  child = await restore();
  await child.prompt("Observe the restored runtime provenance.");
  const second = observed[1];
  assert.ok(second);
  assert.equal(second.rootId, first.rootId);
  assert.equal(second.threadPath, first.threadPath);
  assert.equal(second.sessionFile, first.sessionFile);
  assert.notEqual(second.attemptId, first.attemptId);
  assert.equal(inheritedToolCaller(), undefined);
  assert.deepEqual(host.errors, []);
});
