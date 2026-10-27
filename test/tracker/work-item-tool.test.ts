import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Exec } from "../../src/core/exec.ts";
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

test("missing marker setup is reported without provisioning", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-work-"));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    'version = 1\n[tracker]\nkind = "github"\nrepo = "o/r"\n',
  );
  const fake = createFakePi({ cwd });
  const repositoryLabels = new Set<string>();
  const issue = {
    number: 7,
    title: "Existing work",
    state: "CLOSED",
    labels: [] as { name: string }[],
  };
  const lifecycle: string[] = [];
  const githubExec: Exec = (_command, args) => {
    if (args[0] === "label" && args[1] === "create") repositoryLabels.add(args[2] ?? "");
    if (args[0] === "issue" && args[1] === "edit") {
      if (!repositoryLabels.has("in-progress")) {
        return Promise.resolve({ code: 1, stdout: "", stderr: "label in-progress not found" });
      }
      issue.labels = [{ name: "in-progress" }];
    }
    if (args[1] === "close" || args[1] === "reopen") {
      lifecycle.push(args[1]);
      issue.state = args[1] === "close" ? "CLOSED" : "OPEN";
    }
    return Promise.resolve({ code: 0, stdout: JSON.stringify(issue), stderr: "" });
  };
  const tool = createWorkItemTool({ exec: githubExec });
  const result = await tool.execute(
    "c",
    { action: "update", id: "7", status: "in-progress" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /label in-progress not found/);
  assert.match(JSON.stringify(result.content), /owner.*setup|owner.*create/i);
  assert.match(JSON.stringify(result.content), /re-read/i);
  assert.deepEqual([...repositoryLabels], []);
  assert.deepEqual(lifecycle, []);
  assert.deepEqual(issue, { number: 7, title: "Existing work", state: "CLOSED", labels: [] });

  // An owner performs setup outside the tool, then explicitly retries after re-reading.
  repositoryLabels.add("in-progress");
  const reread = await tool.execute(
    "r",
    { action: "get", id: "7" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.notEqual(reread.isError, true);
  const retried = await tool.execute(
    "retry",
    { action: "update", id: "7", status: "in-progress" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.notEqual(retried.isError, true);
  assert.match(JSON.stringify(retried.content), /in-progress/);
  assert.equal(issue.state, "OPEN");
  assert.deepEqual(issue.labels, [{ name: "in-progress" }]);
  assert.deepEqual(lifecycle, ["reopen"]);
});

test("an unrelated edit error stays unchanged and prevents issue closure", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-work-"));
  writeFileSync(join(cwd, ".development-system.toml"), 'version = 1\n[tracker]\nkind = "github"\n');
  const fake = createFakePi({ cwd });
  const mutations: string[] = [];
  const githubExec: Exec = (_command, args) => {
    if (args[1] !== "view") mutations.push(args.slice(0, 2).join(" "));
    return Promise.resolve(
      args[1] === "edit"
        ? { code: 1, stdout: "", stderr: "HTTP 403: edit forbidden" }
        : {
            code: 0,
            stdout: JSON.stringify({
              number: 7,
              title: "Existing work",
              state: "OPEN",
              labels: [],
            }),
            stderr: "",
          },
    );
  };
  const tool = createWorkItemTool({ exec: githubExec });
  const result = await tool.execute(
    "c",
    { action: "update", id: "7", title: "New title", status: "done" },
    undefined,
    undefined,
    fake.ctx as never,
  );
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /gh issue edit failed: HTTP 403: edit forbidden/);
  assert.doesNotMatch(JSON.stringify(result.content), /setup|owner|Re-read/);
  assert.deepEqual(mutations, ["issue edit"]);
});

test("a broken config is reported, not ignored", async () => {
  const { run, text } = setup("not = [valid");
  const r = await run({ action: "list" });
  assert.equal(r.isError, true);
  assert.match(text(r), /\.development-system\.toml/);
});
