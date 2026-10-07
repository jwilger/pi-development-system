import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorkItemTool } from "../../src/tracker/work-item-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const exec = () => Promise.resolve({ code: 0, stdout: "", stderr: "" });

const setup = (config?: string) => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-work-"));
  if (config !== undefined) writeFileSync(join(cwd, ".development-system.toml"), config);
  const fake = createFakePi({ cwd });
  const tool = createWorkItemTool({ exec });
  const run = (params: Record<string, unknown>) =>
    tool.execute("c", params as never, undefined, undefined, fake.ctx as never);
  const text = (r: Awaited<ReturnType<typeof run>>) => JSON.stringify(r.content);
  return { run, text };
};

test("create then list then get then comment then update, through the repo-files tracker", async () => {
  const { run, text } = setup();
  const created = await run({ action: "create", title: "Trim emails", body: "details" });
  assert.notEqual(created.isError, true);
  assert.match(text(created), /trim-emails/);
  assert.match(text(await run({ action: "list" })), /trim-emails.*Trim emails/);
  assert.match(text(await run({ action: "get", id: "trim-emails" })), /details/);
  assert.notEqual(
    (await run({ action: "comment", id: "trim-emails", body: "looking" })).isError,
    true,
  );
  assert.match(text(await run({ action: "get", id: "trim-emails" })), /looking/);
  const done = await run({ action: "update", id: "trim-emails", status: "done" });
  assert.match(text(done), /done/);
  assert.doesNotMatch(text(await run({ action: "list", status: "open" })), /trim-emails/);
});

test("each action names the argument it is missing", async () => {
  const { run, text } = setup();
  for (const [params, word] of [
    [{ action: "create" }, "title"],
    [{ action: "get" }, "id"],
    [{ action: "update", id: "x" }, "status"],
    [{ action: "comment", id: "x" }, "body"],
  ] as const) {
    const r = await run(params);
    assert.equal(r.isError, true);
    assert.match(text(r), new RegExp(word));
  }
});

test("an unknown id is an error from the tracker", async () => {
  const { run, text } = setup();
  const r = await run({ action: "get", id: "nope" });
  assert.equal(r.isError, true);
  assert.match(text(r), /nope/);
});

test("a tracker kind that is not implemented is an error naming the config file", async () => {
  const { run, text } = setup('version = 1\n[tracker]\nkind = "jira"\n');
  const r = await run({ action: "list" });
  assert.equal(r.isError, true);
  assert.match(text(r), /jira/);
});

test("a broken config is reported, not ignored", async () => {
  const { run, text } = setup("not = [valid");
  const r = await run({ action: "list" });
  assert.equal(r.isError, true);
  assert.match(text(r), /\.development-system\.toml/);
});
