import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createToolSearchExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createInheritedToolSource } from "../../src/subagents/orch/inherited-tools.ts";
import { createDriverFactory } from "../../src/subagents/orch/runtime.ts";
import type { AgentDriver } from "../../src/subagents/types.ts";
import { offlineSession } from "../harness/offline-session.ts";

for (const filtering of ["allowed", "all-except-blocked"] as const) {
  test(`child discovery respects ${filtering} policy and hidden/model-only boundaries`, async (t) => {
    let child: AgentDriver | undefined;
    const executed: string[] = [];
    const permissions: string[] = [];
    const host = await offlineSession(
      t,
      (pi) => {
        createToolSearchExtension()(pi);
        const inherited = createInheritedToolSource(pi);
        let root: ExtensionContext | undefined;
        pi.on("session_start", (_event, ctx) => {
          root = ctx;
          pi.setActiveTools(["open_child", "tool_search", "private_control"]);
        });
        pi.on("tool_call", (event) => {
          if (event.parentToolCallId) permissions.push(event.toolName);
        });
        for (const [name, exposure] of [
          ["allowed_probe", "deferred"],
          ["blocked_probe", "deferred"],
          ["hidden_probe", "hidden"],
          ["private_control", "model-only"],
        ] as const) {
          pi.registerTool({
            name,
            label: name,
            description: name,
            exposure,
            parameters: Type.Object({}),
            async execute() {
              executed.push(name);
              return { content: [{ type: "text", text: name }], details: undefined };
            },
          });
        }
        pi.registerTool({
          name: "open_child",
          label: "Open child",
          description: "Prepare a policy-limited child",
          parameters: Type.Object({}),
          prepareLoadout: inherited.captureLoadout,
          async execute(_id, _args, _signal, _update, ctx) {
            inherited.captureContext(ctx);
            const factory = createDriverFactory(
              () => {
                assert.ok(root);
                return root;
              },
              () => "use-current",
              () => filtering,
              inherited.snapshot,
            );
            child = await factory({
              path: "/root/discovery-child",
              parentPath: "/root",
              type: {
                name: "discovery-child",
                description: "Policy fixture",
                systemPrompt: "Exercise only the scripted tools.",
                tools: {
                  allow: ["tool_search", "allowed_probe", "blocked_probe", "private_control"],
                  block: ["blocked_probe"],
                },
                spawnOverrides: { model: "offline-devsys/pinned", thinkingLevel: "off" },
              },
              inherited: [],
              tools: [],
              signal: new AbortController().signal,
              shouldPause: () => false,
              onEvent: () => undefined,
            });
            return { content: [{ type: "text", text: "ready" }], details: undefined };
          },
        });
      },
      (_context, request) => {
        const name = [
          "open_child",
          undefined,
          "tool_search",
          "allowed_probe",
          "blocked_probe",
          "hidden_probe",
          "private_control",
        ][request];
        return name === undefined
          ? []
          : [
              {
                type: "toolCall",
                id: `call-${request}`,
                name,
                arguments: name === "tool_search" ? { query: "probe", limit: 10 } : {},
              },
            ];
      },
    );
    t.after(() => child?.dispose());
    await host.session.prompt("Prepare the policy fixture.");
    assert.ok(child, JSON.stringify(host.session.messages));
    await child.prompt("Exercise discovery and tool boundaries.");
    assert.deepEqual(executed, ["allowed_probe"]);
    assert.deepEqual(permissions, ["allowed_probe"], "only allowed execution reaches root hooks");
    const results = child.snapshot().filter((message) => message.role === "toolResult");
    for (const name of ["blocked_probe", "hidden_probe", "private_control"]) {
      const result = results.find((message) => message.toolName === name);
      assert.ok(result, name);
      assert.equal(result.isError, true, name);
    }
    const search = results.find((message) => message.toolName === "tool_search");
    assert.ok(search);
    assert.ok(!JSON.stringify(search.content).includes("blocked_probe"));
    assert.ok(!JSON.stringify(search.content).includes("hidden_probe"));
    assert.ok(!JSON.stringify(search.content).includes("private_control"));
    assert.deepEqual(host.errors, []);
  });
}
