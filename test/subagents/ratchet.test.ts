import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { NOCHECK_FILES } from "./nocheck-files.ts";

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return walk(path);
    return e.name.endsWith(".ts") ? [path] : [];
  });

const exempt = (file: string): boolean => /^\/\/ @ts-nocheck/m.test(readFileSync(file, "utf8"));

test("only the listed vendored files may skip type checking", () => {
  const actual = walk("src/subagents").filter(exempt);
  const extra = actual.filter((f) => !NOCHECK_FILES.includes(f));
  assert.deepEqual(extra, [], "these files skip type checking but are not on the exempt list");
});

test("the exempt list holds no file that has since been cleaned or removed", () => {
  const stale = NOCHECK_FILES.filter((f) => {
    try {
      return !exempt(f);
    } catch {
      return true;
    }
  });
  assert.deepEqual(
    stale,
    [],
    "drop these lines: the files are type-clean or gone (the list may only shrink)",
  );
});
