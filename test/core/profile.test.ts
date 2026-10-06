import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { detectProfiles, parseProfiles } from "../../src/core/profile.ts";

const repo = (files: string[]): string => {
  const dir = mkdtempSync(join(tmpdir(), "devsys-profile-"));
  for (const f of files) writeFileSync(join(dir, f), "");
  return dir;
};

test("Cargo.toml means rust", async () => {
  assert.deepEqual(await detectProfiles(repo(["Cargo.toml"])), ["rust"]);
});

test("package.json or tsconfig.json means typescript", async () => {
  assert.deepEqual(await detectProfiles(repo(["package.json"])), ["typescript"]);
  assert.deepEqual(await detectProfiles(repo(["tsconfig.json"])), ["typescript"]);
});

test("a polyglot repo gets both profiles in a stable order", async () => {
  assert.deepEqual(await detectProfiles(repo(["package.json", "Cargo.toml"])), [
    "rust",
    "typescript",
  ]);
});

test("an empty repo has no profile", async () => {
  assert.deepEqual(await detectProfiles(repo([])), []);
});

test("a non-empty override replaces detection", async () => {
  assert.deepEqual(await detectProfiles(repo(["Cargo.toml"]), ["typescript"]), ["typescript"]);
});

test("an empty override falls back to detection", async () => {
  assert.deepEqual(await detectProfiles(repo(["Cargo.toml"]), []), ["rust"]);
});

test("a missing directory has no profile instead of throwing", async () => {
  assert.deepEqual(await detectProfiles("/definitely/not/here"), []);
});

test("parseProfiles accepts known names and rejects others", () => {
  assert.deepEqual(parseProfiles(["rust", "typescript"]), ["rust", "typescript"]);
  assert.equal("kind" in parseProfiles(["cobol"]), true);
});
