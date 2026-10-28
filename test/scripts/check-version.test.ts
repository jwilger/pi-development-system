import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/check-version.ts", import.meta.url));
const sdk = import.meta.resolve("@typesafe-ai/sdk");

function repository(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "devsys-version-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  git("config", "core.hooksPath", "/dev/null");
  const manifest = (version: string) =>
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "example", version }));
  manifest("2.0.0");
  writeFileSync(join(dir, "README.md"), "Automatically creates the marker.\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "excluded baseline rationale");
  const base = git("rev-parse", "HEAD");
  git("tag", "v2.0.0");
  git("update-ref", "refs/remotes/origin/main", base);
  manifest("3.0.0");
  writeFileSync(join(dir, "README.md"), "Owners must create the marker explicitly.\n");
  git("add", ".");
  const message =
    "fix(tracker)!: remove automatic setup\n\nBREAKING CHANGE: create the marker before use.";
  git("commit", "--quiet", "-m", message);
  const head = git("rev-parse", "HEAD");
  const record = join(dir, "request.json");
  const preload = join(dir, "fake-sdk.mjs");
  writeFileSync(
    preload,
    `
    import { TypeSafeClient } from ${JSON.stringify(sdk)};
    import { writeFileSync } from 'node:fs';
    TypeSafeClient.prototype.systemOne = async ({ state }) => {
      writeFileSync(${JSON.stringify(record)}, JSON.stringify(state));
      return { answers: { breaking: {noul: 0.95}, feature: {noul: 0.05}, observable: {noul: 0.99} } };
    };
  `,
  );
  // Only the forge and SDK boundary are fake. Range, manifests, diff and commits use real git.
  const gh = join(dir, "gh");
  writeFileSync(
    gh,
    '#!/bin/sh\nprintf \'[{"id":1,"status":"completed","conclusion":"success"}]\'\n',
  );
  chmodSync(gh, 0o755);
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, ["--import", preload, script, ...args], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        TYPESAFE_API_KEY: "offline-test-key",
        JEV_OVERRIDE: "",
      },
    });
    const state: unknown =
      result.status === 0 ? JSON.parse(readFileSync(record, "utf8")) : undefined;
    return { state, result };
  };
  return { dir, git, base, head, message, run, manifest };
}

test("CI release classification receives rationale for exactly the compared commit range", (t) => {
  const repo = repository(t);
  const { state, result } = repo.run("--ci", "--before", repo.base, "--after", repo.head);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(state && typeof state === "object" && "commit_messages" in state);
  assert.equal(state.commit_messages, repo.message);
});

test("broken CI compares rationale from the last release, not just the latest push", (t) => {
  const repo = repository(t);
  const gh = join(repo.dir, "gh");
  writeFileSync(
    gh,
    '#!/bin/sh\nprintf \'[{"id":1,"status":"completed","conclusion":"failure"}]\'\n',
  );
  repo.manifest("3.0.1");
  writeFileSync(
    join(repo.dir, "README.md"),
    "Owners must create the marker explicitly. Retry after setup.\n",
  );
  repo.git("add", ".");
  const fix = "fix(ci): clarify setup and retry after the failed release";
  repo.git("commit", "--quiet", "-m", fix);
  const { state, result } = repo.run(
    "--ci",
    "--before",
    repo.head,
    "--after",
    repo.git("rev-parse", "HEAD"),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(state && typeof state === "object" && "commit_messages" in state);
  assert.equal(state.commit_messages, `${repo.message}\n\n---\n\n${fix}`);
  assert.ok("base_version" in state);
  assert.equal(state.base_version, "2.0.0");
});

test("staged classification includes committed range rationale but does not invent an index message", (t) => {
  const repo = repository(t);
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const fakeGit = join(repo.dir, "git");
  writeFileSync(
    fakeGit,
    `#!/bin/sh\nif [ "$1" = fetch ]; then exit 0; fi\nexec ${JSON.stringify(realGit)} "$@"\n`,
  );
  chmodSync(fakeGit, 0o755);
  writeFileSync(
    join(repo.dir, "README.md"),
    "Owners create the marker explicitly. Index-only additional instructions.\n",
  );
  repo.git("add", "README.md");
  const { state, result } = repo.run("--staged");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(state && typeof state === "object" && "commit_messages" in state);
  assert.equal(state.commit_messages, repo.message);
  assert.ok("diff" in state && typeof state.diff === "string");
  assert.match(state.diff, /Index-only additional instructions/);
});

test("uncommitted-only changes have no author rationale rather than the unrelated HEAD message", (t) => {
  const repo = repository(t);
  repo.git("update-ref", "refs/remotes/origin/main", repo.head);
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const fakeGit = join(repo.dir, "git");
  writeFileSync(
    fakeGit,
    `#!/bin/sh\nif [ "$1" = fetch ]; then exit 0; fi\nexec ${JSON.stringify(realGit)} "$@"\n`,
  );
  chmodSync(fakeGit, 0o755);
  repo.manifest("4.0.0");
  writeFileSync(join(repo.dir, "README.md"), "Index-only behavior change.\n");
  repo.git("add", "package.json", "README.md");
  const { state, result } = repo.run("--staged");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(state && typeof state === "object" && "commit_messages" in state);
  assert.equal(state.commit_messages, "");
});

test("low confidence remains a refusal even for a major version bump", (t) => {
  const repo = repository(t);
  const preload = join(repo.dir, "fake-sdk.mjs");
  writeFileSync(
    preload,
    `import {TypeSafeClient} from ${JSON.stringify(sdk)};
    TypeSafeClient.prototype.systemOne = async () => ({ answers: {
      breaking: {noul: 0.42}, feature: {noul: 0.9}, observable: {noul: 0.99}
    } });`,
  );
  const { result } = repo.run("--ci", "--before", repo.base, "--after", repo.head);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /confidence 0.58 < 0.6/);
});

test("classifier failure remains fail-closed", (t) => {
  const repo = repository(t);
  writeFileSync(
    join(repo.dir, "fake-sdk.mjs"),
    `import {TypeSafeClient} from ${JSON.stringify(sdk)};
    TypeSafeClient.prototype.systemOne = async () => { throw new Error("offline classifier unavailable"); };`,
  );
  const { result } = repo.run("--ci", "--before", repo.base, "--after", repo.head);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not ask Jev.*offline classifier unavailable/);
});
