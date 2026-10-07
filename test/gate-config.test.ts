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

test("budgetDiff gives every file a share so a huge file cannot hide the others", () => {
  const big = `diff --git a/a b/a\n${"x\n".repeat(5000)}`;
  const small = "diff --git a/b b/b\n+new line\n";
  const out = budgetDiff(big + small, 4000);
  assert.ok(out.includes("+new line"));
  assert.ok(out.includes("[file truncated]"));
  assert.ok(out.length < 4000 + 100);
});

test("budgetDiff leaves a diff within budget untouched", () => {
  assert.equal(budgetDiff("diff --git a/a b/a\n+x\n", 1000), "diff --git a/a b/a\n+x\n");
});
