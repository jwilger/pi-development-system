import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseProfiles } from "../../src/core/profile.ts";
import { detectProfiles } from "../../src/state/profile-detect.ts";
import { createSessionState } from "../../src/state/session-state.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const repo = (files: string[]): string => {
  const dir = mkdtempSync(join(tmpdir(), "devsys-profile-"));
  for (const f of files) writeFileSync(join(dir, f), "");
  return dir;
};

test("mix.exs detection survives persisted session-state replay", async (t) => {
  const dir = repo(["mix.exs"]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fake = createFakePi();
  const store = createSessionState(fake.api);
  const profiles = await detectProfiles(dir);
  store.update((state) => ({ ...state, profiles }));

  const restored = createSessionState(createFakePi().api);
  restored.rebuildFrom(fake.entries);
  assert.deepEqual(restored.get().profiles, ["elixir"]);
});

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

test("mixed-language detection appends elixir after existing profiles", async () => {
  assert.deepEqual(
    await detectProfiles(repo(["mix.exs", "tsconfig.json", "Cargo.toml", "package.json"])),
    ["rust", "typescript", "elixir"],
  );
});

test("an empty repo has no profile", async () => {
  assert.deepEqual(await detectProfiles(repo([])), []);
});

test("an Elixir lockfile without mix.exs has no profile", async () => {
  assert.deepEqual(await detectProfiles(repo(["mix.lock"])), []);
});

test("a non-empty override replaces detection", async () => {
  assert.deepEqual(await detectProfiles(repo(["Cargo.toml"]), ["typescript"]), ["typescript"]);
});

test("an explicit elixir override replaces detected profiles", async () => {
  assert.deepEqual(await detectProfiles(repo(["Cargo.toml", "package.json"]), ["elixir"]), [
    "elixir",
  ]);
  assert.deepEqual(await detectProfiles(repo(["mix.exs"]), ["rust"]), ["rust"]);
});

test("an empty override falls back to detection", async () => {
  assert.deepEqual(await detectProfiles(repo(["Cargo.toml"]), []), ["rust"]);
});

test("an unknown override still falls back to filesystem detection", async () => {
  assert.deepEqual(await detectProfiles(repo(["Cargo.toml", "mix.exs"]), ["elixir", "cobol"]), [
    "rust",
    "elixir",
  ]);
});

test("a missing directory has no profile instead of throwing", async () => {
  assert.deepEqual(await detectProfiles("/definitely/not/here"), []);
});

test("parseProfiles accepts known names and rejects others", () => {
  assert.deepEqual(parseProfiles(["rust", "typescript"]), ["rust", "typescript"]);
  assert.equal("kind" in parseProfiles(["cobol"]), true);
});
