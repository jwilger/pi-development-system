import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { Exec } from "../../src/core/exec.ts";
import { inspectArchitecture } from "../../src/state/architecture-history.ts";
import { parseConfig } from "../../src/state/config.ts";

const architecture = "# Architecture\n\nThe shell performs I/O; the core makes pure decisions.\n";
const decision =
  "# ADR 0001: Boundary\n\n- **Status:** accepted\n\n## Context\nPreserve records.\n";
function repository(t: TestContext) {
  const cwd = mkdtempSync(join(tmpdir(), "architecture-history-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`fixture git failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-b", "main");
  git("config", "user.name", "Policy Test");
  git("config", "user.email", "policy@example.invalid");
  mkdirSync(join(cwd, "docs/adr"), { recursive: true });
  writeFileSync(join(cwd, "ARCHITECTURE.md"), architecture);
  writeFileSync(join(cwd, "docs/adr/0000-template.md"), "# ADR NNNN: <title>\n");
  git("add", ".");
  git("commit", "-m", "test: establish prospective adoption fixture");
  const anchor = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", anchor);
  const parsed = parseConfig(
    `[architecture]\ntrunk_ref = "refs/remotes/origin/main"\nadopted_at = "${anchor}"\n`,
  );
  if (!parsed.ok || parsed.value.architecture === undefined) throw new Error("fixture config");
  const policy = parsed.value.architecture;
  const exec: Exec = async (command, args, options) => {
    const result = spawnSync(command, args, { cwd: options?.cwd ?? cwd, encoding: "utf8" });
    return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  };
  const addDecision = (paired: boolean) => {
    writeFileSync(join(cwd, "docs/adr/0001-boundary.md"), decision);
    if (paired)
      writeFileSync(
        join(cwd, "ARCHITECTURE.md"),
        `${architecture}\nMerged decision records are immutable.\n`,
      );
    git("add", ".");
    git("commit", "-m", "test: record candidate decision");
  };
  return { cwd, git, anchor, policy, exec, addDecision };
}

test("unresolved adoption refuses inspection without choosing a trunk implicitly", async (t) => {
  const repo = repository(t);
  const result = await inspectArchitecture(repo.exec, repo.cwd, undefined, { kind: "delivery" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "architecture-adoption-required");
});

test("the adapter resolves authoritative history and validates every actual pending commit", async (t) => {
  const repo = repository(t);
  repo.addDecision(true);
  const result = await inspectArchitecture(repo.exec, repo.cwd, repo.policy, { kind: "delivery" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.authority, repo.anchor);
    assert.equal(result.value.pending.length, 1);
    assert.equal(result.value.binding.boundary, "delivery");
    assert.deepEqual(result.value.binding.adoption, repo.policy);
    assert.deepEqual(
      result.value.binding.source,
      result.value.pending.map((objectId) => ({ kind: "commit", objectId })),
    );
    assert.deepEqual(
      result.value.binding.resulting,
      result.value.resulting.map((objectId) => ({ kind: "commit", objectId })),
    );
    assert.deepEqual(result.value.violations, []);
  }
});

test("an unpaired pending commit is detected even if a later commit adds architecture text", async (t) => {
  const repo = repository(t);
  repo.addDecision(false);
  writeFileSync(join(repo.cwd, "ARCHITECTURE.md"), `${architecture}\nPreserve merged records.\n`);
  repo.git("add", ".");
  repo.git("commit", "-m", "test: late architecture update");
  const result = await inspectArchitecture(repo.exec, repo.cwd, repo.policy, { kind: "delivery" });
  assert.equal(result.ok, true);
  if (result.ok)
    assert.ok(
      result.value.violations.some(
        (violation) => violation.kind === "architecture-update-required",
      ),
    );
});

test("commit inspection validates the actual staged tree before creating a commit", async (t) => {
  const repo = repository(t);
  writeFileSync(join(repo.cwd, "docs/adr/0001-boundary.md"), decision);
  repo.git("add", ".");
  const result = await inspectArchitecture(repo.exec, repo.cwd, repo.policy, { kind: "commit" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(
      result.value.violations.some(
        (violation) => violation.kind === "architecture-update-required",
      ),
    );
    assert.equal(result.value.binding.boundary, "commit");
    assert.deepEqual(result.value.binding.source.at(-1), {
      kind: "staged-tree",
      objectId: result.value.tree,
    });
    assert.deepEqual(result.value.binding.resulting.at(-1), {
      kind: "staged-tree",
      objectId: result.value.tree,
    });
  }
  assert.equal(repo.git("rev-parse", "HEAD"), repo.anchor);
});

test("proposed resulting inputs cannot omit pending commits", async (t) => {
  const repo = repository(t);
  repo.addDecision(true);
  const result = await inspectArchitecture(repo.exec, repo.cwd, repo.policy, {
    kind: "delivery",
    resulting: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "architecture-history-shape");
});

test("a proposed squash is inspected as an actual resulting commit rather than a source aggregate", async (t) => {
  const repo = repository(t);
  repo.addDecision(true);
  writeFileSync(join(repo.cwd, "README.md"), "A separate documentation change.\n");
  repo.git("add", ".");
  repo.git("commit", "-m", "test: document the boundary");
  const proposed = repo.git(
    "commit-tree",
    repo.git("rev-parse", "HEAD^{tree}"),
    "-p",
    repo.anchor,
    "-m",
    "test: proposed resulting delivery",
  );
  const result = await inspectArchitecture(repo.exec, repo.cwd, repo.policy, {
    kind: "delivery",
    resulting: [proposed],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.pending.length, 2);
    assert.deepEqual(result.value.resulting, [proposed]);
    assert.deepEqual(result.value.violations, []);
  }
});

test("an actual proposed squash cannot combine two sequentially paired new decisions", async (t) => {
  const repo = repository(t);
  repo.addDecision(true);
  writeFileSync(join(repo.cwd, "docs/adr/0002-second.md"), decision.replace("0001", "0002"));
  writeFileSync(
    join(repo.cwd, "ARCHITECTURE.md"),
    `${architecture}\nMerged records are immutable and the second boundary owns delivery.\n`,
  );
  repo.git("add", ".");
  repo.git("commit", "-m", "test: introduce second decision separately");
  const proposed = repo.git(
    "commit-tree",
    repo.git("rev-parse", "HEAD^{tree}"),
    "-p",
    repo.anchor,
    "-m",
    "test: invalid combined delivery",
  );
  const result = await inspectArchitecture(repo.exec, repo.cwd, repo.policy, {
    kind: "delivery",
    resulting: [proposed],
  });
  assert.equal(result.ok, true);
  if (result.ok)
    assert.ok(result.value.violations.some((violation) => violation.kind === "multiple-new-adrs"));
});

test("local graft metadata cannot redefine the authoritative history inspected by the checker", async (t) => {
  const repo = repository(t);
  repo.addDecision(true);
  mkdirSync(join(repo.cwd, ".git/info"), { recursive: true });
  writeFileSync(join(repo.cwd, ".git/info/grafts"), `${repo.anchor}\n`);
  const result = await inspectArchitecture(repo.exec, repo.cwd, repo.policy, { kind: "delivery" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "architecture-history-unavailable");
});

test("a new adoption input cannot replace the policy already recorded in HEAD", async (t) => {
  const repo = repository(t);
  writeFileSync(
    join(repo.cwd, ".development-system.toml"),
    `[architecture]\ntrunk_ref = "${repo.policy.trunkRef}"\nadopted_at = "${repo.anchor}"\n`,
  );
  repo.git("add", ".");
  repo.git("commit", "-m", "test: record approved prospective policy");
  const current = repo.git("rev-parse", "HEAD");
  repo.git("update-ref", "refs/remotes/origin/main", current);
  const result = await inspectArchitecture(
    repo.exec,
    repo.cwd,
    { ...repo.policy, adoptedAt: current },
    { kind: "delivery" },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "architecture-policy-conflict");
});

for (const mutation of ["index", "head", "authority"] as const) {
  test(`concurrent ${mutation} movement refuses a mixed history inspection`, async (t) => {
    const repo = repository(t);
    repo.addDecision(true);
    let changed = false;
    const moving: Exec = async (command, args, options) => {
      const result = await repo.exec(command, args, options);
      if (!changed && args.includes("ls-tree")) {
        changed = true;
        if (mutation === "authority")
          repo.git("update-ref", repo.policy.trunkRef, repo.git("rev-parse", "HEAD"));
        else if (mutation === "head")
          repo.git("commit", "--allow-empty", "-m", "test: concurrent head movement");
        else {
          writeFileSync(join(repo.cwd, "unrelated.txt"), "Concurrent staged change.\n");
          repo.git("add", "unrelated.txt");
        }
      }
      return result;
    };
    const result = await inspectArchitecture(moving, repo.cwd, repo.policy, { kind: "commit" });
    assert.equal(changed, true);
    assert.equal(result.ok, false, "mixed snapshots cannot receive an admissible binding");
    if (!result.ok) assert.equal(result.error.kind, "architecture-history-unavailable");
  });
}

test("post-adoption trunk violations do not become a new grandfathered baseline", async (t) => {
  const repo = repository(t);
  repo.addDecision(true);
  repo.git("update-ref", "refs/remotes/origin/main", repo.git("rev-parse", "HEAD"));
  writeFileSync(
    join(repo.cwd, "docs/adr/0001-boundary.md"),
    `${decision}\nAn unauthorized merged correction.\n`,
  );
  writeFileSync(
    join(repo.cwd, "ARCHITECTURE.md"),
    `${architecture}\nA corresponding architecture edit cannot authorize history changes.\n`,
  );
  repo.git("add", ".");
  repo.git("commit", "-m", "test: simulate outside-path trunk violation");
  repo.git("update-ref", "refs/remotes/origin/main", repo.git("rev-parse", "HEAD"));
  const result = await inspectArchitecture(repo.exec, repo.cwd, repo.policy, { kind: "delivery" });
  assert.equal(result.ok, true);
  if (result.ok)
    assert.ok(
      result.value.violations.some((violation) => violation.kind === "adr-history-conflict"),
    );
});
