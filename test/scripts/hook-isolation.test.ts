import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

test("the real test hook isolates temporary Git repositories from hook-local targets", (t) => {
  const root = mkdtempSync(join(tmpdir(), "devsys-hook-isolation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Never use the actual enclosing repository as the poisoned target, even in a hook.
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  const guardian = join(root, "guardian");
  const child = join(root, "child");
  const bin = join(root, "bin");
  for (const path of [guardian, child, bin]) mkdirSync(path);
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        ...args,
      ],
      { cwd, env: cleanEnv, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(guardian, "init", "-q");
  writeFileSync(join(guardian, "sentinel.txt"), "preserve this repository\n");
  git(guardian, "add", ".");
  git(guardian, "commit", "-qm", "guardian");
  const head = git(guardian, "rev-parse", "HEAD");
  const config = readFileSync(join(guardian, ".git/config"), "utf8");
  const index = readFileSync(join(guardian, ".git/index"));
  writeFileSync(join(child, "child.txt"), "isolated test repository\n");
  const npm = join(bin, "npm");
  writeFileSync(
    npm,
    `#!/bin/sh
set -eu
[ "$1" = test ]
git -C "$HOOK_CHILD" init -q
git -C "$HOOK_CHILD" add .
git -C "$HOOK_CHILD" -c core.hooksPath=/dev/null -c commit.gpgsign=false -c user.name=Child -c user.email=child@example.invalid commit -qm child
`,
  );
  chmodSync(npm, 0o755);
  const hook = parse(readFileSync(new URL("../../lefthook.yml", import.meta.url), "utf8")) as {
    "pre-commit": { commands: { test: { run: string } } };
  };
  const result = spawnSync("sh", ["-c", hook["pre-commit"].commands.test.run], {
    cwd: child,
    env: {
      ...cleanEnv,
      PATH: `${bin}:${process.env.PATH}`,
      HOOK_CHILD: child,
      GIT_DIR: join(guardian, ".git"),
      GIT_COMMON_DIR: join(guardian, ".git"),
      GIT_INDEX_FILE: join(guardian, ".git/index"),
      GIT_WORK_TREE: guardian,
      GIT_OBJECT_DIRECTORY: join(guardian, ".git/objects"),
      GIT_PREFIX: "nested/",
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(git(guardian, "rev-parse", "HEAD"), head);
  assert.equal(readFileSync(join(guardian, ".git/config"), "utf8"), config);
  assert.deepEqual(readFileSync(join(guardian, ".git/index")), index);
  assert.notEqual(git(child, "rev-parse", "HEAD"), head);
});
