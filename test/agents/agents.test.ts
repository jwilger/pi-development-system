import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { defaultMatrix, flattenSlot, type Slot } from "../../src/core/models.ts";

type Agent = {
  name?: string;
  description?: string;
  models?: string[];
  thinkingLevel?: string;
  tools?: { allow?: string[] };
};

function load(name: string): { front: Agent; body: string } {
  const text = readFileSync(new URL(`../../agents/${name}.md`, import.meta.url), "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(match, `${name}.md has frontmatter`);
  return { front: parse(match[1] ?? "") as Agent, body: match[2] ?? "" };
}

const SLOT_OF: Record<string, Slot> = {
  advisor: "advisor",
  implementer: "implementer",
  reviewer: "reviewer",
  researcher: "researcher",
  "lens-cagan": "lens",
  "lens-torres": "lens",
  "lens-perri": "lens",
  "lens-pichler": "lens",
  "lens-rumelt": "lens",
};

for (const [name, slot] of Object.entries(SLOT_OF)) {
  test(`${name}: name matches file and models are the ${slot} slot's families`, () => {
    const { front } = load(name);
    assert.equal(front.name, name);
    assert.ok((front.description ?? "").length >= 40);
    assert.deepEqual(front.models, flattenSlot(defaultMatrix(), slot));
  });
}

test("read-only agents cannot edit or write", () => {
  for (const name of [
    "advisor",
    "reviewer",
    "researcher",
    ...Object.keys(SLOT_OF).filter((n) => n.startsWith("lens-")),
  ]) {
    const allow = load(name).front.tools?.allow ?? [];
    assert.ok(!allow.includes("edit") && !allow.includes("write"), `${name} must not edit`);
  }
});

test("implementer may edit and must end with Run/Expected evidence", () => {
  const { front, body } = load("implementer");
  assert.ok(front.tools?.allow?.includes("edit"));
  assert.match(body, /Run:/);
  assert.match(body, /Expected:/);
});

test("reviewer and lenses emit the review packet with a verdict line", () => {
  for (const name of ["reviewer", "lens-cagan", "lens-rumelt"]) {
    const { body } = load(name);
    assert.match(body, /### Sources inspected/);
    assert.match(body, /no-blocking \| blocking/);
  }
});
