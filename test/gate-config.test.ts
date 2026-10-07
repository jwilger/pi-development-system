import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PUBLISHED_PATHS } from "../scripts/lib/config.ts";
import { budgetDiff } from "../scripts/lib/sh.ts";

test("every package.json `files` entry is covered by the version gate's published paths", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { files: string[] };
  for (const f of manifest.files) {
    assert.ok(
      PUBLISHED_PATHS.some((p) => p === `${f}/` || p === f),
      `${f} ships to npm but is not in PUBLISHED_PATHS`,
    );
  }
});

test("PUBLISHED_PATHS holds nothing but package.json files, the manifest and the README", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { files: string[] };
  const allowed = new Set([...manifest.files.map((f) => `${f}/`), "README.md", "package.json"]);
  for (const p of PUBLISHED_PATHS) assert.ok(allowed.has(p), `${p} is gated but not published`);
});

test("budgetDiff gives every file a share so a huge file cannot hide the others", () => {
  const big = `diff --git a/a b/a\n${"x\n".repeat(5000)}`;
  const small = "diff --git a/b b/b\n+new line\n";
  const out = budgetDiff(big + small, 4000);
  assert.ok(out.includes("+new line"));
  assert.ok(out.includes("[file truncated]"));
  assert.ok(out.length < 4000 + 100);
});

test("budgetDiff never exceeds max, even with hundreds of files", () => {
  const many = Array.from(
    { length: 300 },
    (_, i) => `diff --git a/f${i} b/f${i}\n${"y\n".repeat(900)}`,
  );
  assert.ok(budgetDiff(many.join(""), 60_000).length <= 60_000 + 20);
});

test("budgetDiff leaves a diff within budget untouched", () => {
  assert.equal(budgetDiff("diff --git a/a b/a\n+x\n", 1000), "diff --git a/a b/a\n+x\n");
});
