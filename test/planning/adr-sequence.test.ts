import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { type Exec, timeoutAsFailure } from "../../src/core/exec.ts";
import { createAdrNewTool } from "../../src/planning/adr-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";
import { offlineSession } from "../harness/offline-session.ts";

const repository = (t: TestContext) => {
  const cwd = mkdtempSync(join(tmpdir(), "adr-sequence-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`fixture git failed: ${result.stderr}`);
    return result.stdout;
  };
  git("init", "-b", "main");
  git("config", "user.name", "Policy Test");
  git("config", "user.email", "policy@example.invalid");
  mkdirSync(join(cwd, "docs/adr"), { recursive: true });
  writeFileSync(join(cwd, "docs/adr/0000-template.md"), "# ADR NNNN: <title>\n");
  git("add", ".");
  git("commit", "-m", "test: establish template");
  const exec: Exec = async (command, args, options) => {
    const result = spawnSync(command, args, { cwd: options?.cwd ?? cwd, encoding: "utf8" });
    return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  };
  const deps = { now: () => new Date("2026-10-29T12:00:00Z"), exec };
  const tool = createAdrNewTool(deps);
  const fake = createFakePi({ cwd });
  const context = {
    ...fake.ctx,
    tools: [],
    executeTool: async () => {
      throw new Error("The ADR tool must not invoke another tool");
    },
  };
  const run = (title: string) => tool.execute("adr", { title }, undefined, undefined, context);
  return { cwd, git, run };
};

test("a second decision is refused until the first has been committed", async (t) => {
  const { cwd, run } = repository(t);
  const first = await run("First boundary");
  assert.notEqual(first.isError, true);
  const original = readFileSync(join(cwd, "docs/adr/0001-first-boundary.md"), "utf8");
  const second = await run("Second boundary");
  assert.equal(second.isError, true);
  assert.match(JSON.stringify(second.content), /commit|uncommitted|pending/i);
  assert.equal(existsSync(join(cwd, "docs/adr/0002-second-boundary.md")), false);
  assert.equal(readFileSync(join(cwd, "docs/adr/0001-first-boundary.md"), "utf8"), original);
});

test("committing the first decision allows the next number without changing history", async (t) => {
  const { cwd, git, run } = repository(t);
  await run("First boundary");
  git("add", ".");
  git("commit", "-m", "test: record first fixture decision");
  const recorded = git("show", "HEAD:docs/adr/0001-first-boundary.md");
  const second = await run("Second boundary");
  assert.notEqual(second.isError, true);
  assert.equal(existsSync(join(cwd, "docs/adr/0002-second-boundary.md")), true);
  assert.equal(readFileSync(join(cwd, "docs/adr/0001-first-boundary.md"), "utf8"), recorded);
});

test("unavailable history refuses creation rather than guessing a new sequence", async (t) => {
  const { cwd, run } = repository(t);
  rmSync(join(cwd, ".git"), { recursive: true });
  const result = await run("Unknown history");
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /adr-history-unavailable/);
  assert.equal(existsSync(join(cwd, "docs/adr/0001-unknown-history.md")), false);
});

test("an ADR directory symlink cannot redirect creation outside its canonical path", async (t) => {
  const { cwd, git, run } = repository(t);
  git("mv", "docs", "elsewhere");
  symlinkSync("elsewhere", join(cwd, "docs"));
  const result = await run("Redirected boundary");
  assert.equal(result.isError, true);
  assert.equal(existsSync(join(cwd, "elsewhere/adr/0001-redirected-boundary.md")), false);
});

test("pi executes same-turn ADR requests sequentially and reports the second refusal", async (t) => {
  const { cwd } = repository(t);
  const host = await offlineSession(
    t,
    (pi) => {
      const exec: Exec = async (command, args, options) =>
        timeoutAsFailure(await pi.exec(command, args, options));
      pi.registerTool(createAdrNewTool({ exec, now: () => new Date("2026-10-29T12:00:00Z") }));
    },
    (_context, request) =>
      request === 0
        ? ["First", "Second"].map((title) => ({
            type: "toolCall" as const,
            id: title,
            name: "devsys_adr_new",
            arguments: { title },
          }))
        : [],
    () => cwd,
  );
  await host.session.prompt("Introduce these two architecture decisions.");
  const results = host.session.messages.flatMap((message) =>
    message.role === "toolResult" && message.toolName === "devsys_adr_new" ? [message] : [],
  );
  assert.equal(results.length, 2);
  assert.equal(results[0]?.isError, false);
  assert.equal(results[1]?.isError, true);
  assert.deepEqual(host.errors, []);
  assert.equal(existsSync(join(cwd, "docs/adr/0001-first.md")), true);
  assert.equal(existsSync(join(cwd, "docs/adr/0002-second.md")), false);
});
