import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createEventModelCheckTool } from "../../src/planning/event-model-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const FIXTURES = new URL("../fixtures/event-model/", import.meta.url).pathname;

const repo = () => {
  const dir = mkdtempSync(join(tmpdir(), "em-"));
  mkdirSync(join(dir, "docs/event-model"), { recursive: true });
  cpSync(FIXTURES, join(dir, "docs/event-model"), { recursive: true });
  const fake = createFakePi({ cwd: dir });
  const tool = createEventModelCheckTool();
  const run = (params: Record<string, unknown>) =>
    tool.execute("c", params as never, undefined, undefined, fake.ctx as never);
  return { dir, run };
};

const text = (r: { content: { type: string; text?: string }[] }) => r.content[0]?.text ?? "";

test("the sample model validates", async () => {
  const { run } = repo();
  const r = await run({ dir: "docs/event-model" });
  assert.notEqual(r.isError, true);
  assert.match(text(r), /3 slices, 0 errors, 0 warnings/);
});

test("an orphaned view field fails with missing-origin, naming the slice", async () => {
  const { dir, run } = repo();
  writeFileSync(
    join(dir, "docs/event-model/sessions.yaml"),
    "id: slice.sessions.v01\npattern: state-view\nactor: system\nviews:\n  - { name: ActiveSessions, fields: { userId: id, nickname: string }, sources: [SignedIn] }\n",
  );
  const r = await run({ dir: "docs/event-model" });
  assert.equal(r.isError, true);
  assert.match(text(r), /missing-origin/);
  assert.match(text(r), /slice\.sessions\.v01/);
  assert.match(text(r), /nickname/);
});

test("a file that does not parse is named with its reason, and the rest are still checked", async () => {
  const { dir, run } = repo();
  writeFileSync(join(dir, "docs/event-model/broken.yaml"), "id: x\npattern: nope\nactor: u\n");
  const r = await run({ dir: "docs/event-model" });
  assert.equal(r.isError, true);
  assert.match(text(r), /^- parse-error \(error\) broken\.yaml: .*pattern/m);
  assert.match(text(r), /3 slices/);
});

test("render asks for the derived markdown or diagram after the verdict", async () => {
  const { run } = repo();
  assert.match(
    text(await run({ dir: "docs/event-model", render: "markdown" })),
    /## slice\.signin\.c01/,
  );
  assert.match(text(await run({ dir: "docs/event-model", render: "mermaid" })), /flowchart LR/);
});

test("a directory outside the repository, a missing one, or one with no slices is an error", async () => {
  const { run } = repo();
  assert.equal((await run({ dir: "../elsewhere" })).isError, true);
  assert.equal((await run({ dir: "/etc" })).isError, true);
  assert.equal((await run({ dir: "docs/nothing-here" })).isError, true);
  const empty = repo();
  mkdirSync(join(empty.dir, "docs/empty"));
  const r = await empty.run({ dir: "docs/empty" });
  assert.equal(r.isError, true);
  assert.match(text(r), /no slice files/);
});

test("the reply is one line for the summary, then one line per issue with no blank lines between", async () => {
  const { dir, run } = repo();
  writeFileSync(join(dir, "docs/event-model/broken.yaml"), "id: x\npattern: nope\nactor: u\n");
  writeFileSync(join(dir, "docs/event-model/garbled.yaml"), "id: a: b\n");
  writeFileSync(
    join(dir, "docs/event-model/sessions.yaml"),
    "id: slice.sessions.v01\npattern: state-view\nactor: system\nviews:\n  - { name: ActiveSessions, fields: { nickname: string }, sources: [SignedIn] }\n",
  );
  const lines = text(await run({ dir: "docs/event-model" })).split("\n");
  assert.match(lines[0] ?? "", /^\d+ slices, \d+ errors, \d+ warnings$/);
  assert.equal(lines.filter((l) => l === "").length, 0);
  assert.ok(lines.slice(1).every((l) => /^- [a-z-]+ \((error|warning)\) /.test(l)));
});
