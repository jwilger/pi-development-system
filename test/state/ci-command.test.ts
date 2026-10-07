import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { CI_ENTRY_TYPE, registerCiCommand, runCiWatch } from "../../src/state/ci-command.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const run = (status: string, conclusion: string) => ({
  code: 0,
  stdout: JSON.stringify([{ status, conclusion, headSha: "abcdef1234" }]),
  stderr: "",
});

const notices = (fake: ReturnType<typeof createFakePi>) =>
  fake.ui.calls
    .filter((c) => c.kind === "notify")
    .map((c) => ({ message: String(c.args[0]), level: String(c.args[1]) }));

const setup = (results: ReturnType<typeof run>[], trunk = "main") => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-ci-"));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    `version = 1\n[delivery]\ntrunk = "${trunk}"\n`,
  );
  const fake = createFakePi({ hasUI: true, cwd });
  const state = createSessionState(fake.api);
  let i = 0;
  const branches: string[] = [];
  const exec: Exec = async (cmd, args) => {
    if (cmd === "git") return { code: 0, stdout: "abcdef1234\n", stderr: "" };
    branches.push(args[args.indexOf("--branch") + 1] ?? "");
    return results[Math.min(i++, results.length - 1)] ?? run("completed", "success");
  };
  const deps = {
    pi: fake.api,
    state,
    exec,
    sleep: () => Promise.resolve(),
    intervalMs: 1,
    maxPolls: 5,
  };
  return { fake, state, deps, branches };
};

test("watching records each change in state and as a devsys-ci entry, then reports the result", async () => {
  const { fake, state, deps, branches } = setup(
    [run("in_progress", ""), run("in_progress", ""), run("completed", "success")],
    "trunk",
  );
  const final = await runCiWatch(deps, fake.ctx);
  assert.deepEqual(final, { status: "green", sha: "abcdef1234" });
  assert.deepEqual(state.get().ci, { status: "green", sha: "abcdef1234" });
  const entries = fake.entries.filter((e) => e.customType === CI_ENTRY_TYPE);
  assert.deepEqual(
    entries.map((e) => (e.data as { status: string }).status),
    ["pending", "green"],
  );
  assert.ok(branches.every((b) => b === "trunk"));
  assert.match(notices(fake).at(-1)?.message ?? "", /CI on trunk: green \(abcdef1\)/);
});

test("a red result is notified as an error", async () => {
  const { fake, deps } = setup([run("completed", "failure")]);
  await runCiWatch(deps, fake.ctx);
  assert.equal(notices(fake).at(-1)?.level, "error");
});

test("an unreadable config is reported and nothing is watched", async () => {
  const { fake, deps, branches } = setup([run("completed", "success")]);
  writeFileSync(
    join(fake.ctx.cwd, ".development-system.toml"),
    "version = 1\n[delivery]\nmode = 3\n",
  );
  assert.equal(await runCiWatch(deps, fake.ctx), undefined);
  assert.equal(branches.length, 0);
  assert.equal(notices(fake).at(-1)?.level, "error");
});

test("the /devsys-ci command is registered and returns without waiting for CI", async () => {
  const { fake, deps } = setup([run("in_progress", "")]);
  registerCiCommand(deps);
  const command = fake.commands.get("devsys-ci");
  assert.ok(command);
  await command.handler("", fake.ctx as never);
  assert.match(notices(fake)[0]?.message ?? "", /watching CI/);
});
