import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAdrNewTool } from "../../src/planning/adr-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const TEMPLATE =
  "# ADR NNNN: <title>\n\n- **Status:** proposed | accepted | superseded by NNNN\n- **Date:** YYYY-MM-DD\n\n## Context\n";

const repo = (files: Record<string, string> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "adr-"));
  mkdirSync(join(dir, "docs/adr"), { recursive: true });
  for (const [name, text] of Object.entries({ "0000-template.md": TEMPLATE, ...files })) {
    writeFileSync(join(dir, "docs/adr", name), text);
  }
  const fake = createFakePi({ cwd: dir });
  const tool = createAdrNewTool({ now: () => new Date("2026-10-08T12:00:00Z") });
  const run = (title: string) =>
    tool.execute("c", { title } as never, undefined, undefined, fake.ctx as never);
  return { dir, run };
};

const text = (r: { content: { type: string; text?: string }[] }) => r.content[0]?.text ?? "";

test("it creates the next numbered ADR from the template and names the file", async () => {
  const { dir, run } = repo({ "0001-first.md": "x", "0002-second.md": "y" });
  const r = await run("Use SQLite for the cache");
  assert.notEqual(r.isError, true);
  assert.match(text(r), /docs\/adr\/0003-use-sqlite-for-the-cache\.md/);
  const written = readFileSync(join(dir, "docs/adr/0003-use-sqlite-for-the-cache.md"), "utf8");
  assert.match(written, /^# ADR 0003: Use SQLite for the cache$/m);
  assert.match(written, /^- \*\*Date:\*\* 2026-10-08$/m);
});

test("an invalid title writes nothing and says why", async () => {
  const { dir, run } = repo();
  const r = await run("!!!");
  assert.equal(r.isError, true);
  assert.equal(existsSync(join(dir, "docs/adr/0001-.md")), false);
});

test("without a template it refuses instead of inventing one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-"));
  mkdirSync(join(dir, "docs/adr"), { recursive: true });
  const fake = createFakePi({ cwd: dir });
  const tool = createAdrNewTool({ now: () => new Date() });
  const r = await tool.execute(
    "c",
    { title: "X y" } as never,
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.equal(r.isError, true);
  assert.match(text(r), /0000-template\.md/);
});

test("an existing file at the target is never overwritten", async () => {
  const { dir, run } = repo();
  const first = await run("Same title");
  assert.notEqual(first.isError, true);
  const again = await run("Same title");
  assert.notEqual(again.isError, true);
  assert.equal(existsSync(join(dir, "docs/adr/0001-same-title.md")), true);
  assert.equal(existsSync(join(dir, "docs/adr/0002-same-title.md")), true);
});

test("the tool runs one call at a time, so two ADRs in one turn cannot take the same number", () => {
  const tool = createAdrNewTool({ now: () => new Date() });
  assert.equal(tool.executionMode, "sequential");
});
