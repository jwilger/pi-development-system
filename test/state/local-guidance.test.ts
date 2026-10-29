import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { loadReviewGuidance, loadWorkflowGuidance } from "../../src/state/local-guidance.ts";

const execute = promisify(execFile);
const hash = (text: string): string => createHash("sha256").update(text).digest("hex");

async function repository(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "devsys-guidance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await execute("git", ["init", "--quiet", root]);
  await mkdir(join(root, "docs", "nested"), { recursive: true });
  return root;
}

async function track(root: string, path: string, content: string): Promise<void> {
  await writeFile(join(root, path), content);
  await execute("git", ["-C", root, "add", "--", path]);
}

test("review guidance combines workflow and concerns", async (t) => {
  const root = await repository(t);
  await track(root, "docs/workflow.md", "Workflow context.");
  await track(root, "docs/concern.md", "Review concern.");
  await writeFile(
    join(root, ".development-system.toml"),
    '[workflow]\nguidance = ["docs/workflow.md"]\n[review]\nguidance = ["docs/concern.md"]\n',
  );
  // A nested config must not replace repository-root configuration.
  await writeFile(join(root, "docs/nested/.development-system.toml"), "[review]\nguidance = []\n");
  const loaded = await loadReviewGuidance(join(root, "docs/nested"));
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.value.sources, [
    {
      category: "workflow",
      path: "docs/workflow.md",
      content: "Workflow context.",
      hash: hash("Workflow context."),
    },
    {
      category: "review",
      path: "docs/concern.md",
      content: "Review concern.",
      hash: hash("Review concern."),
    },
  ]);
  for (const source of loaded.value.sources) {
    assert.ok(loaded.value.section.includes(source.path));
    assert.ok(loaded.value.section.includes(source.content));
    assert.ok(loaded.value.section.includes(source.hash));
    assert.ok(loaded.value.section.includes(`Category: ${source.category}`));
  }
  await writeFile(join(root, "docs/concern.md"), "Changed concern.");
  const changed = await loadReviewGuidance(join(root, "docs/nested"));
  assert.ok(changed.ok);
  assert.notEqual(changed.value.identity, loaded.value.identity);
  assert.equal(changed.value.sources[1]?.hash, hash("Changed concern."));
});

async function configure(
  root: string,
  workflow: readonly string[],
  review: readonly string[],
): Promise<void> {
  await writeFile(
    join(root, ".development-system.toml"),
    `[workflow]\nguidance = ${JSON.stringify(workflow)}\n[review]\nguidance = ${JSON.stringify(review)}\n`,
  );
}

test("review identity binds category, configured path, content and order deterministically", async (t) => {
  const root = await repository(t);
  await track(root, "docs/first.md", "Same content.");
  await track(root, "docs/second.md", "Same content.");
  await configure(root, ["docs/first.md"], []);
  const workflow = await loadReviewGuidance(root);
  const repeated = await loadReviewGuidance(root);
  assert.ok(workflow.ok && repeated.ok);
  assert.deepEqual(repeated.value, workflow.value);
  assert.match(workflow.value.identity, /^[a-f0-9]{64}$/);

  await configure(root, [], ["docs/first.md"]);
  const category = await loadReviewGuidance(root);
  assert.ok(category.ok);
  assert.notEqual(category.value.identity, workflow.value.identity);
  await configure(root, [], ["docs/second.md"]);
  const path = await loadReviewGuidance(root);
  assert.ok(path.ok);
  assert.notEqual(path.value.identity, category.value.identity);

  await configure(root, [], ["docs/first.md", "docs/second.md"]);
  const ordered = await loadReviewGuidance(root);
  await configure(root, [], ["docs/second.md", "docs/first.md"]);
  const reversed = await loadReviewGuidance(root);
  assert.ok(ordered.ok && reversed.ok);
  assert.deepEqual(
    reversed.value.sources.map((source) => source.path),
    ["docs/second.md", "docs/first.md"],
  );
  assert.notEqual(reversed.value.identity, ordered.value.identity);

  await configure(root, [], []);
  const removed = await loadReviewGuidance(root);
  assert.ok(removed.ok);
  assert.deepEqual(removed.value.sources, []);
  assert.match(removed.value.section, /unconfigured/i);
  assert.notEqual(removed.value.identity, category.value.identity);
});

test("review guidance counts duplicate categorized paths against one combined byte budget", async (t) => {
  const root = await repository(t);
  // Multibyte content ensures limits are bytes, not JavaScript string lengths.
  await track(root, "docs/full.md", "é".repeat(16 * 1024));
  await track(root, "docs/extra.md", "x");
  await configure(root, ["docs/full.md"], ["docs/full.md"]);
  const boundary = await loadReviewGuidance(root);
  assert.ok(boundary.ok);
  assert.deepEqual(
    boundary.value.sources.map(({ path, category }) => ({ path, category })),
    [
      { path: "docs/full.md", category: "workflow" },
      { path: "docs/full.md", category: "review" },
    ],
  );
  await configure(root, ["docs/full.md"], ["docs/full.md", "docs/extra.md"]);
  const over = await loadReviewGuidance(root);
  assert.ok(!over.ok);
  assert.equal(over.error.kind, "guidance-error");
  assert.match(over.error.message, /64 KiB combined/);
  assert.match(over.error.message, /Repair/);
  assert.ok(!("value" in over));
});

test("review guidance rejects files above 32 KiB", async (t) => {
  const root = await repository(t);
  await track(root, "docs/large.md", "x".repeat(32 * 1024 + 1));
  await configure(root, [], ["docs/large.md"]);
  const loaded = await loadReviewGuidance(root);
  assert.ok(!loaded.ok);
  assert.match(loaded.error.message, /32 KiB per-file/);
  assert.equal(loaded.error.path, "docs/large.md");
});

for (const category of ["workflow", "review"] as const) {
  for (const scenario of [
    "missing",
    "removed",
    "untracked",
    "traversal",
    "absolute",
    "escaping symlink",
    "internal symlink",
    "directory",
    "invalid UTF-8",
  ] as const) {
    test(`review guidance rejects ${category} ${scenario} without a partial snapshot`, async (t) => {
      const root = await repository(t);
      await track(root, "docs/valid.md", "Valid context.");
      let path = "docs/bad.md";
      let message = /Cannot load repository guidance/;
      switch (scenario) {
        case "missing":
          break;
        case "removed":
          await track(root, path, "Removed context.");
          await rm(join(root, path));
          break;
        case "untracked":
          await writeFile(join(root, path), "Untracked context.");
          message = /untracked/;
          break;
        case "traversal":
          path = "../outside.md";
          message = /repository-relative contained path/;
          break;
        case "absolute":
          path = join(root, "docs/valid.md");
          message = /repository-relative contained path/;
          break;
        case "escaping symlink": {
          const outside = await mkdtemp(join(tmpdir(), "devsys-outside-"));
          t.after(() => rm(outside, { recursive: true, force: true }));
          await writeFile(join(outside, "context.md"), "Outside context.");
          await symlink(join(outside, "context.md"), join(root, path));
          await execute("git", ["-C", root, "add", "--", path]);
          message = /escapes the repository/;
          break;
        }
        case "internal symlink":
          await symlink("valid.md", join(root, path));
          await execute("git", ["-C", root, "add", "--", path]);
          message = /regular file/;
          break;
        case "directory":
          path = "docs";
          message = /regular file/;
          break;
        case "invalid UTF-8":
          await track(root, path, "Temporary valid context.");
          await writeFile(join(root, path), Buffer.from([0xc3, 0x28]));
          message = /valid UTF-8/;
          break;
        default:
          throw new Error(`Unhandled scenario: ${scenario}`);
      }
      await configure(
        root,
        category === "workflow" ? ["docs/valid.md", path] : ["docs/valid.md"],
        category === "review" ? [path] : [],
      );
      const loaded = await loadReviewGuidance(join(root, "docs/nested"));
      assert.ok(!loaded.ok);
      assert.equal(loaded.error.kind, "guidance-error");
      assert.match(loaded.error.message, message);
      assert.match(loaded.error.message, /Repair the configured guidance/);
      assert.ok(!("value" in loaded));
    });
  }
}

test("review guidance propagates configuration errors with repair advice", async (t) => {
  const root = await repository(t);
  await writeFile(join(root, ".development-system.toml"), '[review]\nguidance = [""]\n');
  const loaded = await loadReviewGuidance(root);
  assert.ok(!loaded.ok);
  assert.equal(loaded.error.kind, "guidance-error");
  assert.match(loaded.error.message, /review.guidance/);
  assert.match(loaded.error.message, /Repair/);
});

test("unconfigured review guidance works outside a repository", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "devsys-unconfigured-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const loaded = await loadReviewGuidance(root);
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.value.sources, []);
  assert.match(loaded.value.section, /unconfigured/i);
});

test("workflow-only snapshots retain their exact legacy identity and rendering", async (t) => {
  const root = await repository(t);
  await track(root, "docs/first.md", "First workflow.");
  await track(root, "docs/second.md", "Second workflow.");
  // A missing concern must not be read by the workflow-only loader.
  await configure(root, ["docs/second.md", "docs/first.md"], ["docs/missing.md"]);
  const loaded = await loadWorkflowGuidance(join(root, "docs/nested"));
  assert.ok(loaded.ok);
  const sources = [
    { path: "docs/second.md", content: "Second workflow.", hash: hash("Second workflow.") },
    { path: "docs/first.md", content: "First workflow.", hash: hash("First workflow.") },
  ];
  const identity = hash(
    JSON.stringify(sources.map((source) => ({ path: source.path, hash: source.hash }))),
  );
  assert.deepEqual(loaded.value, {
    sources,
    identity,
    section: [
      `Repository workflow snapshot: ${identity}`,
      ...sources.map(
        (source) => `Source: ${source.path}\nSHA256: ${source.hash}\n\n${source.content}`,
      ),
    ].join("\n\n"),
  });
  await configure(root, [], ["docs/missing.md"]);
  const empty = await loadWorkflowGuidance(root);
  assert.ok(empty.ok);
  assert.deepEqual(empty.value, {
    sources: [],
    identity: hash("[]"),
    section: "Repository workflow: unconfigured.",
  });
});
