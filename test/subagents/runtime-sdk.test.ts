import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createInheritedToolSource } from "../../src/subagents/orch/inherited-tools.ts";
import { createDriverFactory } from "../../src/subagents/orch/runtime.ts";
import type { AgentDriver, DriverOptions } from "../../src/subagents/types.ts";
import { deferred } from "../harness/deferred.ts";
import { offlineSession } from "../harness/offline-session.ts";

const inheritedUsage = {
  input: 10,
  output: 2,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 12,
  cost: { input: 0.1, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.12 },
};

async function childHarness(t: TestContext, waitForAbort = false, block = false) {
  let child: AgentDriver | undefined;
  let factory: ReturnType<typeof createDriverFactory> | undefined;
  let options: DriverOptions | undefined;
  const trace: string[] = [];
  const events: Parameters<DriverOptions["onEvent"]>[0][] = [];
  const entered = deferred();
  const host = await offlineSession(
    t,
    (pi) => {
      const inherited = createInheritedToolSource(pi);
      let root: ExtensionContext | undefined;
      pi.on("session_start", (_event, ctx) => {
        root = ctx;
      });
      pi.on("tool_call", (event) => {
        if (event.toolName === "inherited_probe") {
          trace.push("parent permission");
          if (block) return { block: true, reason: "fixture parent policy" };
        }
        return undefined;
      });
      pi.on("tool_result", (event) => {
        if (event.toolName === "inherited_probe") trace.push("parent result");
      });
      pi.registerTool({
        name: "inherited_probe",
        label: "Inherited probe",
        description: "An inherited tool with parent hooks",
        parameters: Type.Object({}),
        async execute(_id, _args, signal) {
          trace.push("execute");
          if (waitForAbort) {
            t.assert.ok(signal);
            entered.resolve();
            await new Promise<void>((resolve) => {
              const aborted = () => {
                trace.push("aborted");
                resolve();
              };
              if (signal.aborted) aborted();
              else signal.addEventListener("abort", aborted, { once: true });
            });
          }
          return {
            content: [{ type: "text", text: "inherited success" }],
            details: undefined,
            usage: inheritedUsage,
          };
        },
      });
      pi.registerTool({
        name: "open_child",
        label: "Open child",
        description: "Prepare a detached child",
        parameters: Type.Object({}),
        prepareLoadout: inherited.captureLoadout,
        async execute(_id, _args, _signal, _update, ctx) {
          inherited.captureContext(ctx);
          factory = createDriverFactory(
            () => {
              t.assert.ok(root);
              return root;
            },
            () => "use-current",
            () => "allowed",
            inherited.snapshot,
          );
          options = {
            path: "/root/offline-child",
            parentPath: "/root",
            type: {
              name: "offline-child",
              description: "Offline SDK child",
              systemPrompt: "Exercise the inherited tool.",
              tools: { allow: ["inherited_probe"] },
              spawnOverrides: { model: "offline-devsys/pinned", thinkingLevel: "off" },
            },
            inherited: [],
            tools: [],
            signal: new AbortController().signal,
            shouldPause: () => false,
            onEvent: (event) => events.push(event),
          };
          child = await factory(options);
          return { content: [{ type: "text", text: "child ready" }], details: undefined };
        },
      });
    },
    (_context, request) => {
      if (request === 0)
        return [{ type: "toolCall", id: "spawn", name: "open_child", arguments: {} }];
      if (request === 2)
        return [{ type: "toolCall", id: "inherited", name: "inherited_probe", arguments: {} }];
      return [];
    },
  );
  t.after(() => child?.dispose());
  await host.session.prompt("Prepare a child, then finish this root turn.");
  t.assert.deepEqual(host.errors, []);
  t.assert.ok(child, JSON.stringify(host.session.messages));
  t.assert.ok(factory);
  t.assert.ok(options);
  t.assert.equal(host.session.isStreaming, false);
  return { host, child, factory, options, trace, events, entered };
}

test("detached SDK children inherit tools through parent hooks and resume their saved transcript", {
  timeout: 10000,
}, async (t) => {
  const h = await childHarness(t);
  await h.child.prompt("Run inherited probe, detached from the spawning tool.");
  assert.deepEqual(h.trace, ["parent permission", "execute", "parent result"]);
  assert.equal(h.child.output(), "done");
  const inheritedResult = h.child.snapshot().find((message) => message.role === "toolResult");
  assert.ok(inheritedResult?.role === "toolResult");
  assert.deepEqual(inheritedResult.usage, inheritedUsage);
  assert.equal(h.host.session.getSessionStats().tokens.total, 0);
  assert.equal(h.host.session.getSessionStats().cost, 0);
  assert.ok(
    h.child.snapshot().some((m) => m.role === "toolResult" && m.toolName === "inherited_probe"),
  );
  assert.equal(
    h.events.some((e) => e.kind === "error"),
    false,
  );
  const sessionFile = h.child.sessionFile;
  assert.ok(sessionFile);
  const previousLength = h.child.snapshot().length;
  const sessionLeafId = h.child.sessionLeafId;
  assert.ok(sessionLeafId);
  h.child.dispose();
  const resumed = await h.factory({
    ...h.options,
    sessionFile,
    sessionLeafId,
  });
  t.after(() => resumed.dispose());
  assert.equal(resumed.sessionFile, sessionFile);
  assert.equal(resumed.snapshot().length, previousLength);
  await resumed.prompt("Continue the retained conversation.");
  assert.equal(resumed.output(), "done");
  assert.ok(resumed.snapshot().length > previousLength);
  const assistant = resumed
    .snapshot()
    .filter((m) => m.role === "assistant")
    .at(-1);
  assert.equal(assistant?.provider, "offline-devsys");
  assert.equal(assistant?.model, "pinned");
  assert.equal(h.host.session.model?.id, "scripted", "the root must use a different model");
  assert.deepEqual(h.host.errors, []);
});

test("detached inherited execution cannot bypass a parent permission block", async (t) => {
  const h = await childHarness(t, false, true);
  await h.child.prompt("Try the operation denied by the parent policy.");
  assert.ok(h.trace.includes("parent permission"));
  assert.equal(h.trace.includes("execute"), false);
  const result = h.child.snapshot().find((message) => message.role === "toolResult");
  assert.ok(result?.role === "toolResult");
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /fixture parent policy/);
  assert.deepEqual(h.host.errors, []);
});

test("cancelling a detached SDK child aborts its inherited tool and disposal prevents reuse", {
  timeout: 10000,
}, async (t) => {
  const h = await childHarness(t, true);
  const pending = h.child.prompt("Run the inherited operation until cancelled.");
  const rejected = assert.rejects(pending, /Subagent run aborted/);
  await h.entered.promise;
  await h.child.abort();
  await rejected;
  assert.ok(h.trace.includes("aborted"));
  assert.deepEqual(h.host.errors, []);
  h.child.dispose();
  await assert.rejects(h.child.prompt("Not allowed after disposal"), /Subagent driver is disposed/);
});
