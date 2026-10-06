import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  type Available,
  compareModelVersions,
  defaultMatrix,
  type ModelMatrix,
  renderMatrixToml,
  resolveCandidate,
  resolveSlot,
  SLOTS,
} from "../../src/core/models.ts";

const fixture = (name: string): Available[] =>
  JSON.parse(readFileSync(new URL(`../fixtures/models/${name}.json`, import.meta.url), "utf8"));

const ORDER: [string, string][] = [
  ["gpt-6.1-sol", "gpt-6-sol"],
  ["gpt-6-sol", "gpt-5.6-sol"],
  ["claude-opus-5-5", "claude-opus-5"],
  ["claude-opus-5", "claude-opus-4-8"],
  ["claude-opus-4-10", "claude-opus-4-9"],
  ["claude-haiku-4-5", "claude-haiku-4-5-20251001"],
  ["claude-haiku-4-5-20251101", "claude-haiku-4-5-20251001"],
  ["claude-opus-5", "claude-opus-4-5-20251101"],
];

for (const [higher, lower] of ORDER) {
  test(`compareModelVersions ${higher} > ${lower}`, () => {
    assert.ok(compareModelVersions(higher, lower) > 0);
    assert.ok(compareModelVersions(lower, higher) < 0);
  });
}

test("compareModelVersions is zero for equal ids", () => {
  assert.equal(compareModelVersions("gpt-6-sol", "gpt-6-sol"), 0);
});

const avail = (...ids: string[]): Available[] =>
  ids.map((s) => {
    const [provider = "", ...rest] = s.split("/");
    return { provider, id: rest.join("/") };
  });

test("resolveCandidate returns an exact match", () => {
  assert.equal(
    resolveCandidate("anthropic/claude-opus-5", avail("anthropic/claude-opus-5")),
    "anthropic/claude-opus-5",
  );
  assert.equal(
    resolveCandidate("anthropic/claude-opus-5", avail("anthropic/claude-opus-4")),
    undefined,
  );
});

test("resolveCandidate picks the newest id matching a family pattern", () => {
  const a = avail(
    "openai/gpt-5.6-sol",
    "openai/gpt-6.1-sol",
    "openai/gpt-6-sol",
    "openai/gpt-6-luna",
  );
  assert.equal(resolveCandidate("openai/gpt-*-sol", a), "openai/gpt-6.1-sol");
});

test("resolveCandidate prefers the undated alias over dated snapshots", () => {
  const a = avail("anthropic/claude-haiku-4-5-20251001", "anthropic/claude-haiku-4-5");
  assert.equal(resolveCandidate("anthropic/claude-haiku-*", a), "anthropic/claude-haiku-4-5");
});

test("resolveCandidate requires the provider to match and supports slashes in ids", () => {
  const a = avail("typesafe/jev-latest", "openrouter/typesafe/jev-latest");
  assert.equal(
    resolveCandidate("openrouter/typesafe/jev-latest", a),
    "openrouter/typesafe/jev-latest",
  );
  assert.equal(resolveCandidate("openai/gpt-*-sol", a), undefined);
});

const matrix = (overrides: Partial<Record<(typeof SLOTS)[number], string[]>>): ModelMatrix => ({
  ...defaultMatrix(),
  ...overrides,
});

test("resolveSlot falls through to the next candidate when a provider is absent", () => {
  const m = matrix({ strong: ["openai/gpt-*-sol", "anthropic/claude-sonnet-*"] });
  const r = resolveSlot(
    m,
    "strong",
    avail("anthropic/claude-sonnet-4-5", "anthropic/claude-sonnet-5-5"),
  );
  assert.deepEqual(r, {
    ok: true,
    value: { model: "anthropic/claude-sonnet-5-5", via: "anthropic/claude-sonnet-*" },
  });
});

test("resolveSlot follows @slot indirection", () => {
  const m = matrix({ strong: ["anthropic/claude-sonnet-*"], implementer: ["@strong"] });
  const r = resolveSlot(m, "implementer", avail("anthropic/claude-sonnet-5"));
  assert.deepEqual(r, {
    ok: true,
    value: { model: "anthropic/claude-sonnet-5", via: "anthropic/claude-sonnet-*" },
  });
});

test("resolveSlot reports a cycle instead of looping", () => {
  const m = matrix({ strong: ["@fast"], fast: ["@strong"] });
  const r = resolveSlot(m, "strong", avail("anthropic/claude-sonnet-5"));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "cycle");
});

test("resolveSlot reports an unresolvable slot", () => {
  const r = resolveSlot(defaultMatrix(), "strong", []);
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.error, { kind: "unresolvable", slot: "strong" });
});

test("resolveSlot reports an @reference to an unknown slot as unresolvable", () => {
  const m = matrix({ strong: ["@nonsense"] });
  const r = resolveSlot(m, "strong", avail("anthropic/claude-sonnet-5"));
  assert.equal(r.ok, false);
});

for (const name of ["current", "openai-only", "anthropic-only"]) {
  test(`defaultMatrix resolves every slot against the ${name} fixture`, () => {
    const available = fixture(name);
    for (const slot of SLOTS) {
      const r = resolveSlot(defaultMatrix(), slot, available);
      assert.equal(r.ok, true, `${name}: ${slot} unresolved`);
    }
  });
}

test("defaultMatrix picks the newest families on the current fixture", () => {
  const available = fixture("current");
  const pick = (slot: (typeof SLOTS)[number]) => {
    const r = resolveSlot(defaultMatrix(), slot, available);
    return r.ok ? r.value.model : undefined;
  };
  assert.equal(pick("frontier"), "openai/gpt-6-astra");
  assert.equal(pick("strong"), "openai/gpt-6.1-sol");
  assert.equal(pick("fast"), "openai/gpt-6-luna");
  assert.equal(pick("jev"), "typesafe/jev-latest");
});

test("the default matrix on an Anthropic-only machine uses Anthropic models", () => {
  const available = fixture("anthropic-only");
  for (const slot of SLOTS) {
    if (slot === "jev") continue;
    const r = resolveSlot(defaultMatrix(), slot, available);
    assert.ok(r.ok && r.value.model.startsWith("anthropic/"), `${slot}: ${JSON.stringify(r)}`);
  }
});

test("renderMatrixToml writes a [models] table that has one line per slot", () => {
  const text = renderMatrixToml(defaultMatrix());
  assert.match(text, /^\[models\]\n/);
  for (const slot of SLOTS) {
    assert.ok(
      text.split("\n").some((l) => l.startsWith(slot) && l.includes("= [")),
      slot,
    );
  }
});
