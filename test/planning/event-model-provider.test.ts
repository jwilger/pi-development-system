import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  EVENT_MODEL_TOOL,
  registerEventModelProvider,
  usesBuiltinEventModel,
} from "../../src/planning/event-model-provider.ts";
import { createFakePi } from "../harness/fake-pi.ts";

test("the builtin is used when the provider is builtin and no extension offers event_model_validate", () => {
  assert.equal(usesBuiltinEventModel("builtin", ["read", "bash"]), true);
});

test("a configured non-builtin provider takes over", () => {
  assert.equal(usesBuiltinEventModel("acme-modeller", ["read"]), false);
});

test("an extension tool named event_model_validate takes over even with the default provider", () => {
  assert.equal(usesBuiltinEventModel("builtin", ["read", "event_model_validate"]), false);
});

const session = async (opts: { toml?: string; allTools?: string[] }) => {
  const cwd = mkdtempSync(join(tmpdir(), "emp-"));
  if (opts.toml !== undefined) writeFileSync(join(cwd, ".development-system.toml"), opts.toml);
  const fake = createFakePi({ cwd, allTools: opts.allTools ?? [] });
  registerEventModelProvider(fake.api);
  await fake.emit({ type: "session_start" } as never);
  return fake;
};

test("with no provider configured the session offers devsys_event_model_check", async () => {
  const fake = await session({});
  assert.ok(fake.tools.has(EVENT_MODEL_TOOL));
});

test("a provider extension's event_model_validate means the builtin tool is not registered", async () => {
  const fake = await session({ allTools: ["event_model_validate"] });
  assert.equal(fake.tools.has(EVENT_MODEL_TOOL), false);
});

test("a configured provider means the builtin tool is not registered", async () => {
  const fake = await session({ toml: '[event_model]\nprovider = "acme-modeller"\n' });
  assert.equal(fake.tools.has(EVENT_MODEL_TOOL), false);
});

test("a configured provider whose tool is not loaded is reported, since nothing else will validate", async () => {
  const fake = await session({ toml: '[event_model]\nprovider = "acme-modeller"\n' });
  const warned = fake.ui.calls.filter((c) => c.kind === "notify");
  assert.equal(warned.length, 1);
  assert.match(JSON.stringify(warned[0]?.args), /acme-modeller.*event_model_validate/);
});

test("a configured provider whose tool is loaded, or the builtin, raises no warning", async () => {
  const loaded = await session({
    toml: '[event_model]\nprovider = "acme-modeller"\n',
    allTools: ["event_model_validate"],
  });
  assert.equal(loaded.ui.calls.filter((c) => c.kind === "notify").length, 0);
  assert.equal((await session({})).ui.calls.filter((c) => c.kind === "notify").length, 0);
});
