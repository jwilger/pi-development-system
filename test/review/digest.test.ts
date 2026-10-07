import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { snapshotDiff } from "../../src/review/digest.ts";

// Real git, because the defects here were about what git actually prints under a user's config.
const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  });

const exec: Exec = async (command, args, options) => {
  try {
    const stdout = execFileSync(command, args, { cwd: options?.cwd, encoding: "utf8" });
    return { code: 0, stdout, stderr: "" };
  } catch (cause) {
    const e = cause as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
};

const repo = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "devsys-digest-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "a.txt"), "one\n");
  writeFileSync(join(dir, "naïve.md"), "one\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
};

const digest = async (dir: string): Promise<string> => {
  const snap = await snapshotDiff(exec, dir, "HEAD");
  assert.ok(snap.ok, snap.ok ? "" : snap.error);
  return snap.value.digest;
};

test("editing a tracked file changes the digest, even with an external diff driver and colour forced", async () => {
  const dir = repo();
  git(dir, "config", "diff.external", "echo");
  git(dir, "config", "color.diff", "always");
  git(dir, "config", "color.ui", "always");
  writeFileSync(join(dir, "a.txt"), "one\ntwo\n");
  const before = await digest(dir);
  writeFileSync(join(dir, "a.txt"), "one\ntwo\nthree\n");
  assert.notEqual(await digest(dir), before);
});

test("diff.mnemonicPrefix and diff.noprefix do not stop the diff from being read", async () => {
  for (const [key, value] of [
    ["diff.mnemonicPrefix", "true"],
    ["diff.noprefix", "true"],
  ] as const) {
    const dir = repo();
    git(dir, "config", key, value);
    writeFileSync(join(dir, "a.txt"), "one\ntwo\n");
    const snap = await snapshotDiff(exec, dir, "HEAD");
    assert.ok(snap.ok, snap.ok ? "" : snap.error);
    assert.deepEqual(Object.keys(snap.value.files), ["a.txt"]);
  }
});

test("editing a file with a non-ASCII name changes the digest and keys it by its real path", async () => {
  const dir = repo();
  writeFileSync(join(dir, "naïve.md"), "one\ntwo\n");
  const first = await snapshotDiff(exec, dir, "HEAD");
  assert.ok(first.ok);
  assert.deepEqual(Object.keys(first.value.files), ["naïve.md"]);
  writeFileSync(join(dir, "naïve.md"), "one\ntwo\nthree\n");
  assert.notEqual(await digest(dir), first.value.digest);
});

test("a new file has the same per-file digest untracked and staged", async () => {
  const dir = repo();
  writeFileSync(join(dir, "u.txt"), "new\n");
  const untracked = await snapshotDiff(exec, dir, "HEAD");
  git(dir, "add", "u.txt");
  const staged = await snapshotDiff(exec, dir, "HEAD");
  assert.ok(untracked.ok && staged.ok);
  assert.equal(staged.value.files["u.txt"], untracked.value.files["u.txt"]);
  assert.equal(staged.value.digest, untracked.value.digest);
});

test("a nested repository is listed, not hashed, and does not fail the snapshot", async () => {
  const dir = repo();
  mkdirSync(join(dir, "nested"));
  git(join(dir, "nested"), "init", "-q");
  writeFileSync(join(dir, "nested", "f.txt"), "x\n");
  writeFileSync(join(dir, "u.txt"), "new\n");
  const snap = await snapshotDiff(exec, dir, "HEAD");
  assert.ok(snap.ok);
  assert.deepEqual(Object.keys(snap.value.files), ["u.txt"]);
  assert.match(snap.value.stat, /nested\/ \(nested repository/);
});

test("a snapshot that cannot hash an untracked file fails instead of ignoring it", async () => {
  const dir = repo();
  writeFileSync(join(dir, "u.txt"), "new\n");
  const failing: Exec = (command, args, options) =>
    args[0] === "hash-object"
      ? Promise.resolve({ code: 128, stdout: "", stderr: "fatal: cannot hash" })
      : exec(command, args, options);
  const snap = await snapshotDiff(failing, dir, "HEAD");
  assert.equal(snap.ok, false);
});

test("more untracked files than the cap fail instead of being left out", async () => {
  const dir = repo();
  for (let i = 0; i < 201; i++) writeFileSync(join(dir, `f${i}.txt`), `${i}\n`);
  const snap = await snapshotDiff(exec, dir, "HEAD");
  assert.equal(snap.ok, false);
  assert.match(snap.ok ? "" : snap.error, /untracked/);
});

test("a diff with no parseable file sections is an error, not an empty digest", async () => {
  const dir = repo();
  const noisy: Exec = (command, args, options) =>
    args.includes("--full-index")
      ? Promise.resolve({ code: 0, stdout: "some other format\n", stderr: "" })
      : exec(command, args, options);
  const snap = await snapshotDiff(noisy, dir, "HEAD");
  assert.equal(snap.ok, false);
});

test("untracked files with non-ASCII, quote or space in the name are digested by their real names", async () => {
  const dir = repo();
  for (const name of ["naïve-new.md", 'say "hi".txt', "with space.txt"]) {
    writeFileSync(join(dir, name), `${name}\n`);
  }
  const snap = await snapshotDiff(exec, dir, "HEAD");
  assert.ok(snap.ok, snap.ok ? "" : snap.error);
  assert.deepEqual(
    Object.keys(snap.value.files).sort(),
    ['say "hi".txt', "naïve-new.md", "with space.txt"].sort(),
  );
});

test("an untracked symlink digests as its link text, the same as once staged; a dangling one does not fail", async () => {
  const dir = repo();
  symlinkSync("a.txt", join(dir, "link"));
  symlinkSync("missing", join(dir, "dangling"));
  mkdirSync(join(dir, "d"));
  symlinkSync("d", join(dir, "dlink"));
  const untracked = await snapshotDiff(exec, dir, "HEAD");
  assert.ok(untracked.ok, untracked.ok ? "" : untracked.error);
  git(dir, "add", "-A");
  const staged = await snapshotDiff(exec, dir, "HEAD");
  assert.ok(staged.ok);
  for (const name of ["link", "dangling", "dlink"]) {
    assert.equal(untracked.value.files[name], staged.value.files[name], name);
  }
});

test("a single-revision range includes untracked files, a two-dot range does not", async () => {
  const dir = repo();
  writeFileSync(join(dir, "u.txt"), "new\n");
  const one = await snapshotDiff(exec, dir, "HEAD~0");
  const two = await snapshotDiff(exec, dir, "HEAD..HEAD");
  assert.ok(one.ok && two.ok);
  assert.ok("u.txt" in one.value.files);
  assert.equal("u.txt" in two.value.files, false);
});
