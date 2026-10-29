import assert from "node:assert/strict";
import test from "node:test";
import { parseProfiles } from "../../src/core/profile.ts";
import { isParseError } from "../../src/core/types.ts";

test("parseProfiles accepts elixir alongside existing profiles in supplied order", () => {
  assert.deepEqual(parseProfiles(["elixir"]), ["elixir"]);
  assert.deepEqual(parseProfiles(["elixir", "rust", "typescript"]), [
    "elixir",
    "rust",
    "typescript",
  ]);
});

test("parseProfiles still rejects unknown names alongside elixir", () => {
  assert.equal(isParseError(parseProfiles(["elixir", "cobol"])), true);
  assert.equal(isParseError(parseProfiles(["Elixir"])), true);
});
