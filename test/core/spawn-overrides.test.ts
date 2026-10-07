import assert from "node:assert/strict";
import test from "node:test";
import {
  applySpawnOverrides,
  parseSpawnOverrides,
  THINKING_LEVELS,
} from "../../src/core/spawn-overrides.ts";
import { isParseError } from "../../src/core/types.ts";
import { THINKING_LEVELS as VENDORED_LEVELS } from "../../src/subagents/types.ts";

test("thinking levels match the vendored runtime's list", () => {
  assert.deepEqual([...THINKING_LEVELS], [...VENDORED_LEVELS]);
});

test("no override fields parse to undefined", () => {
  assert.equal(parseSpawnOverrides({}), undefined);
  assert.equal(parseSpawnOverrides({ model: undefined, thinkingLevel: undefined }), undefined);
});

test("valid model and thinking level parse", () => {
  assert.deepEqual(
    parseSpawnOverrides({ model: "anthropic/claude-sonnet-5-5", thinkingLevel: "high" }),
    {
      model: "anthropic/claude-sonnet-5-5",
      thinkingLevel: "high",
    },
  );
  assert.deepEqual(parseSpawnOverrides({ thinkingLevel: "max" }), { thinkingLevel: "max" });
});

test("malformed overrides are parse errors naming the field", () => {
  for (const bad of [{ model: "sonnet" }, { model: "" }, { model: 3 }, { model: "a b/c" }]) {
    const out = parseSpawnOverrides(bad);
    assert.ok(isParseError(out), JSON.stringify(bad));
    assert.match(out.message, /model/);
  }
  const level = parseSpawnOverrides({ thinkingLevel: "extreme" });
  assert.ok(isParseError(level));
  assert.match(level.message, /thinkingLevel.*off, minimal/);
});

test("overrides win over inherited model and thinking level", () => {
  const base = { provider: "openai", id: "gpt-5", thinkingLevel: "low" as const };
  assert.deepEqual(
    applySpawnOverrides(base, { model: "anthropic/claude-opus-4-1", thinkingLevel: "xhigh" }),
    {
      provider: "anthropic",
      id: "claude-opus-4-1",
      thinkingLevel: "xhigh",
    },
  );
});

test("a model id may itself contain slashes; only the first slash splits the provider", () => {
  const out = applySpawnOverrides(
    { provider: "x", id: "y", thinkingLevel: "off" },
    { model: "openrouter/anthropic/claude-sonnet" },
  );
  assert.deepEqual(out, {
    provider: "openrouter",
    id: "anthropic/claude-sonnet",
    thinkingLevel: "off",
  });
});

test("partial overrides leave the other fields alone; none returns the base", () => {
  const base = { provider: "openai", id: "gpt-5", thinkingLevel: "low" as const };
  assert.deepEqual(applySpawnOverrides(base, { thinkingLevel: "high" }), {
    ...base,
    thinkingLevel: "high",
  });
  assert.deepEqual(applySpawnOverrides(base, { model: "a/b" }), {
    provider: "a",
    id: "b",
    thinkingLevel: "low",
  });
  assert.deepEqual(applySpawnOverrides(base, undefined), base);
});
