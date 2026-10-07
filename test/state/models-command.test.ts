import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONFIG_FILE, loadConfig } from "../../src/state/config.ts";
import {
  createModelsTool,
  type ModelCatalog,
  runModelsCommand,
} from "../../src/state/models-command.ts";
import { createFakePi, type FakePiOptions } from "../harness/fake-pi.ts";

const fixture = (name: string): { id: string }[] =>
  (
    JSON.parse(readFileSync(`test/fixtures/models/${name}.json`, "utf8")) as {
      provider: string;
      id: string;
    }[]
  ).map((m) => ({ id: `${m.provider}/${m.id}` }));

const setup = (models: NonNullable<FakePiOptions["models"]>, extra: FakePiOptions = {}) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-models-"));
  const fake = createFakePi({ cwd, models, ...extra });
  const catalog = fake.ctx.modelRegistry as unknown as ModelCatalog;
  const run = (args = "") => runModelsCommand(fake.api, fake.ctx as never, args, catalog);
  return { cwd, fake, run };
};

const notified = (fake: ReturnType<typeof createFakePi>) =>
  fake.ui.calls.filter((c) => c.kind === "notify").map((c) => String(c.args[0]));

test("headless run with an Anthropic-only registry resolves every slot and writes the file", async () => {
  const { cwd, fake, run } = setup(fixture("anthropic-only"), {
    hasUI: false,
    classifiers: ["typesafe/jev-latest"],
  });
  const outcome = await run();
  assert.equal(outcome.ok, true);
  assert.equal(outcome.written, true);
  const text = readFileSync(join(cwd, CONFIG_FILE), "utf8");
  assert.match(text, /\[delivery\]\nmode = "trunk"/);
  assert.match(text, /\n\[models\]\n/);
  const config = await loadConfig(cwd);
  assert.equal(config.ok, true);
  assert.match(outcome.table, /frontier\s+→ anthropic\/claude-fable-/);
  assert.equal(fake.entries.filter((e) => e.customType === "devsys-config").length, 1);
});

test("an empty registry reports unresolvable slots and writes nothing", async () => {
  const { cwd, fake, run } = setup([], { hasUI: false });
  const outcome = await run();
  assert.equal(outcome.ok, false);
  assert.equal(outcome.written, false);
  assert.equal(existsSync(join(cwd, CONFIG_FILE)), false);
  assert.match(notified(fake).join("\n"), /Unresolvable slots: .*frontier/);
  assert.equal(fake.entries.length, 0);
});

test("--check reports without writing, even when everything resolves", async () => {
  const { cwd, fake, run } = setup(fixture("current"), { classifiers: ["typesafe/jev-latest"] });
  const outcome = await run("--check");
  assert.equal(outcome.ok, true);
  assert.equal(outcome.written, false);
  assert.equal(existsSync(join(cwd, CONFIG_FILE)), false);
  assert.equal(fake.ui.calls.filter((c) => c.kind === "select").length, 0);
});

test("a malformed config is reported and left untouched", async () => {
  const { cwd, fake, run } = setup(fixture("current"), { hasUI: false });
  writeFileSync(join(cwd, CONFIG_FILE), "version = 1\n[delivery]\nmodee = 1\n");
  const outcome = await run();
  assert.equal(outcome.ok, false);
  assert.match(notified(fake).join("\n"), /delivery\.modee/);
  assert.match(readFileSync(join(cwd, CONFIG_FILE), "utf8"), /modee/);
});

test("existing config tables survive a write", async () => {
  const { cwd, run } = setup(fixture("current"), {
    hasUI: false,
    classifiers: ["typesafe/jev-latest"],
  });
  writeFileSync(
    join(cwd, CONFIG_FILE),
    'version = 1\n\n[delivery]\nmode = "pull-request"\n\n[verifier]\nmax_per_session = 5\n',
  );
  await run();
  const config = await loadConfig(cwd);
  assert.equal(config.ok && config.value.delivery.mode, "pull-request");
  assert.equal(config.ok && config.value.verifier.maxPerSession, 5);
});

test("interactively, 'accept this and all remaining slots' stops asking after one question", async () => {
  const { fake, run } = setup(fixture("current"), { classifiers: ["typesafe/jev-latest"] });
  fake.ui.selectResponses.push("accept this and all remaining slots");
  const outcome = await run();
  assert.equal(outcome.written, true);
  assert.equal(fake.ui.calls.filter((c) => c.kind === "select").length, 1);
});

test("interactively, pinning the current id puts the exact id first in the written slot", async () => {
  const { cwd, fake, run } = setup(fixture("current"), { classifiers: ["typesafe/jev-latest"] });
  fake.ui.selectResponses.push("pin the current exact id (no auto-roll)");
  fake.ui.selectResponses.push("accept this and all remaining slots");
  const outcome = await run();
  const pinned = /^frontier\s+→ (\S+)/m.exec(outcome.table)?.[1];
  assert.ok(pinned);
  const config = await loadConfig(cwd);
  assert.equal(config.ok && config.value.models.frontier[0], pinned);
});

test("devsys_models resolves one slot, all slots, and rejects unknown slots", async () => {
  const { fake } = setup(fixture("anthropic-only"), { classifiers: ["typesafe/jev-latest"] });
  const tool = createModelsTool();
  const call = (params: Record<string, unknown>) =>
    tool.execute("c", params as never, undefined, undefined, fake.ctx as never);
  const one = await call({ slot: "strong" });
  assert.notEqual(one.isError, true);
  assert.match(JSON.stringify(one.content), /strong: anthropic\//);
  const all = await call({});
  assert.equal(JSON.stringify(all.content).includes("reviewer:"), true);
  const bad = await call({ slot: "nope" });
  assert.equal(bad.isError, true);
});
