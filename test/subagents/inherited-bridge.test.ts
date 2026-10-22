import assert from "node:assert/strict";
import test from "node:test";
import { Type } from "typebox";
import {
  createInheritedToolSource,
  type InheritedToolSource,
} from "../../src/subagents/orch/inherited-tools.ts";
import { offlineSession } from "../harness/offline-session.ts";

test("the real SDK inherited snapshot preserves reachable tool metadata", async (t) => {
  let snapshot: InheritedToolSource | undefined;
  const parameters = Type.Object({ target: Type.String() });
  const outputSchema = Type.Object({ found: Type.Boolean() });
  const host = await offlineSession(
    t,
    (pi) => {
      const source = createInheritedToolSource(pi);
      pi.registerTool({
        name: "lookup",
        label: "Lookup",
        description: "Find an inventory entry",
        parameters,
        outputSchema,
        executionMode: "sequential",
        namespace: { name: "inventory", aliases: ["stock"] },
        annotations: { readOnlyHint: true, openWorldHint: false },
        promptGuidelines: ["Use lookup to inspect inventory."],
        reachesTools: (args) => [String(args.target)],
        prepareArguments: () => ({ target: "prepared-by-root" }),
        async execute() {
          return { content: [{ type: "text", text: "found" }], details: undefined };
        },
      });
      pi.registerTool({
        name: "capture",
        label: "Capture",
        description: "Capture the inherited loadout",
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
  await host.session.prompt("Capture tool metadata.");
  assert.deepEqual(host.errors, []);
  assert.ok(snapshot);
  const tool = snapshot.tools.find((candidate) => candidate.name === "lookup");
  assert.ok(tool);
  assert.equal(tool.prepareArguments, undefined, "only the root prepares inherited arguments");
  assert.deepEqual(tool.reachesTools?.({ target: "inventory" }), ["inventory"]);
  assert.deepEqual(tool.parameters, parameters);
  assert.deepEqual(tool.outputSchema, outputSchema);
  assert.equal(tool.executionMode, "sequential");
  assert.deepEqual(tool.namespace, { name: "inventory", aliases: ["stock"] });
  assert.deepEqual(tool.annotations, { readOnlyHint: true, openWorldHint: false });
  assert.deepEqual(tool.promptGuidelines, ["Use lookup to inspect inventory."]);
  assert.equal(tool.exposure, "direct");
  assert.equal(tool.defaultActive, true);
  assert.ok(snapshot.activeNames.includes("lookup"));
});
