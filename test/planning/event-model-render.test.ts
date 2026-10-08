import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderMermaid, renderModelMarkdown } from "../../src/planning/event-model-render.ts";
import { parseSlice, type Slice } from "../../src/planning/slice-schema.ts";

const model = (): Slice[] =>
  ["register.yaml", "signin.yaml", "sessions.yaml"].map((name) => {
    const parsed = parseSlice(
      readFileSync(new URL(`../fixtures/event-model/${name}`, import.meta.url), "utf8"),
      "yaml",
    );
    if (!parsed.ok) throw new Error(parsed.error.message);
    return parsed.value;
  });

test("the markdown has one swimlane row per slice and its scenarios in Given/When/Then", () => {
  const md = renderModelMarkdown(model());
  assert.match(md, /^\| Slice \| Pattern \| Actor \| Command \| Events \| Views \|$/m);
  assert.match(md, /^\| slice\.signin\.c01 \| state-change \| user \| SignIn \| SignedIn \| \|$/m);
  assert.match(md, /^\| slice\.sessions\.v01 \| state-view \| system \| \| \| ActiveSessions \|$/m);
  assert.match(md, /^## slice\.signin\.c01$/m);
  assert.match(md, /- Given UserRegistered \(email: "a@b\.c"\)/);
  assert.match(md, /- When SignIn \(email: "x@y\.z", password: "pw"\)/);
  assert.match(md, /- Then error unknown-user/);
  assert.match(md, /- Then view ActiveSessions \(userId: "u1"\)/);
});

test("the markdown is stable: the same model renders the same text", () => {
  assert.equal(renderModelMarkdown(model()), renderModelMarkdown(model()));
});

test("the diagram links each command to its events and each event to the views that read it", () => {
  const diagram = renderMermaid(model());
  assert.match(diagram, /^flowchart LR$/m);
  const out = /c\d+\["SignIn"\] --> (e\d+)\["SignedIn"\]/.exec(diagram);
  const into = /(e\d+)\["SignedIn"\] --> v\d+\["ActiveSessions"\]/.exec(diagram);
  assert.ok(out?.[1]);
  assert.equal(into?.[1], out[1]);
});

test("a name with characters mermaid cannot take in an id still renders as a valid node", () => {
  const [register] = model();
  assert.ok(register);
  const odd: Slice = {
    ...register,
    command: { name: 'Sign "in" now', fields: {} },
    events: [{ name: "Signed-In", fields: {} }],
  };
  const diagram = renderMermaid([odd]);
  assert.doesNotMatch(diagram, /"in"/);
  assert.match(diagram, /\bc\d+\["Sign #quot;in#quot; now"\]/);
});

test("names that differ only in characters mermaid cannot take in an id stay separate nodes", () => {
  const [register] = model();
  assert.ok(register);
  const slice = (command: string, event: string): Slice => ({
    ...register,
    command: { name: command, fields: {} },
    events: [{ name: event, fields: {} }],
  });
  const diagram = renderMermaid([
    slice("Do", "Sign-In"),
    slice("Do2", "Sign In"),
    slice("Do3", "注文確定"),
  ]);
  const ids = [...diagram.matchAll(/(e\d+)\["/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, 3);
  assert.match(diagram, /\["Sign-In"\]/);
  assert.match(diagram, /\["Sign In"\]/);
  assert.match(diagram, /\["注文確定"\]/);
});
