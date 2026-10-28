import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { Value } from "typebox/value";
import type { Exec } from "../../src/core/exec.ts";
import { createWorkItemTool } from "../../src/tracker/work-item-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
  hasNextPage: false,
  endCursor: null,
};
const issue = { id: "ISSUE_7", number: 7, url: "https://github.com/o/r/issues/7" };
const item = {
  __typename: "ProjectV2Item",
  id: "ITEM_7",
  isArchived: false,
  content: {
    __typename: "Issue",
    ...issue,
    title: "Named issue",
    state: "OPEN",
    repository: { nameWithOwner: "o/r" },
  },
};
const project = {
  __typename: "ProjectV2",
  id: "PVT_local",
  owner: { login: "o" },
  number: 1,
  title: "Board",
  url: "https://github.com/orgs/o/projects/1",
  fields: { nodes: [], pageInfo },
};
const response = (node: unknown) => ({ data: { node } });
type Call = { command: string; args: readonly string[] };
type Remote = { enrolled: boolean; adds: number };
type Reply = { code: number; stdout: string; stderr: string };
type Options = {
  enrolled?: boolean;
  configuration?: string;
  respond?: (call: Call, remote: Remote) => unknown;
  add?: (remote: Remote) => unknown;
  failure?: (call: Call, remote: Remote) => Reply | undefined;
};
function setup(t: TestContext, options: Options = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-membership-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    `version=1\n[tracker]\n${options.configuration ?? 'kind="github"\nrepo="o/r"\nproject_id="PVT_local"'}\n`,
  );
  const calls: Call[] = [];
  const remote: Remote = { enrolled: options.enrolled ?? false, adds: 0 };
  const exec: Exec = (command, args) => {
    const call = { command, args };
    calls.push(call);
    const failure = options.failure?.(call, remote);
    if (failure !== undefined) return Promise.resolve(failure);
    let value: unknown;
    if (args.some((a) => a.includes("mutation"))) {
      remote.adds++;
      if (options.add !== undefined) {
        value = options.add(remote);
        return Promise.resolve({ code: 0, stdout: JSON.stringify(value), stderr: "" });
      }
      remote.enrolled = true;
      throw new Error("enrollment timed out after remote add");
    }
    value = options.respond?.(call, remote);
    if (value !== undefined)
      return Promise.resolve({ code: 0, stdout: JSON.stringify(value), stderr: "" });
    if (args[0] === "issue") value = issue;
    else if (args.some((a) => a.includes("fields(first:"))) value = response(project);
    else if (args.some((a) => a.includes("items(first:")))
      value = response({
        __typename: "ProjectV2",
        id: "PVT_local",
        items: { nodes: remote.enrolled ? [item] : [], pageInfo },
      });
    else
      value = response({
        __typename: "ProjectV2Item",
        id: "ITEM_7",
        fieldValues: { nodes: [], pageInfo },
      });
    return Promise.resolve({ code: 0, stdout: JSON.stringify(value), stderr: "" });
  };
  const tool = createWorkItemTool({ exec });
  const fake = createFakePi({ cwd });
  const run = (parameters: Record<string, unknown>) =>
    tool.execute("test", parameters as never, undefined, undefined, fake.ctx as never);
  return { run, tool, calls, adds: () => remote.adds };
}
const parsed = (result: { content: readonly { type: string; text?: string }[] }) =>
  JSON.parse(result.content.find((p) => p.type === "text")?.text ?? "null");

test("a timed-out enrollment is observed before an explicit retry", async (t) => {
  const host = setup(t);
  const parameters = { action: "project-enroll", id: "7" };
  assert.ok(Value.Check(host.tool.parameters, parameters), "public schema rejects project-enroll");
  const first = await host.run(parameters);
  assert.equal(first.isError, true);
  assert.equal(parsed(first).kind, "uncertain");
  assert.equal(parsed(first).outcome, "unknown");
  assert.match(parsed(first).message, /re-read.*before.*retry/i);
  const retry = await host.run(parameters);
  assert.notEqual(retry.isError, true);
  assert.equal(parsed(retry).kind, "not-attempted");
  assert.equal(parsed(retry).outcome, "already-member");
  assert.equal(parsed(retry).observation.membership.item.itemId, "ITEM_7");
  assert.equal(host.adds(), 1);
  const mutationIndex = host.calls.findIndex(({ args }) =>
    args.some((a) => a.includes("mutation")),
  );
  assert.ok(host.calls.slice(mutationIndex + 1).some(({ args }) => args[0] === "issue"));
});

const has = (call: Call, part: string) => call.args.some((a) => a.includes(part));
const items = (nodes: readonly unknown[], pagination = pageInfo) =>
  response({ __typename: "ProjectV2", id: "PVT_local", items: { nodes, pageInfo: pagination } });
const ack = {
  data: {
    addProjectV2ItemById: {
      item: {
        id: "ITEM_7",
        project: { id: "PVT_local" },
        content: { __typename: "Issue", id: "ISSUE_7" },
      },
    },
  },
};

test("member reads expose actual fields and archive facts; existing membership is a no-op", async (t) => {
  const host = setup(t, { enrolled: true });
  assert.ok(Value.Check(host.tool.parameters, { action: "project-member", id: "7" }));
  const read = await host.run({ action: "project-member", id: "7" });
  assert.notEqual(read.isError, true);
  assert.deepEqual(parsed(read), {
    projectId: "PVT_local",
    repository: "o/r",
    issue: { issueId: "ISSUE_7", number: 7, url: issue.url },
    membership: {
      kind: "present",
      item: {
        itemId: "ITEM_7",
        issueId: "ISSUE_7",
        number: 7,
        url: issue.url,
        title: "Named issue",
        lifecycle: "open",
        archived: false,
        fields: [],
      },
    },
  });
  const enrolled = await host.run({ action: "project-enroll", id: "7" });
  assert.notEqual(enrolled.isError, true);
  assert.equal(parsed(enrolled).outcome, "already-member");
  assert.equal(host.adds(), 0);
  assert.ok(host.calls.every((call) => !has(call, "mutation")));
  assert.deepEqual(host.calls[0], {
    command: "gh",
    args: ["issue", "view", "7", "--repo", "o/r", "--json", "id,number,url"],
  });
});

test("archived membership blocks enrollment without hiding read facts", async (t) => {
  const host = setup(t, {
    respond: (call) =>
      has(call, "items(first:") ? items([{ ...item, isArchived: true }]) : undefined,
  });
  const read = await host.run({ action: "project-member", id: "7" });
  assert.notEqual(read.isError, true);
  assert.equal(parsed(read).membership.item.archived, true);
  const result = await host.run({ action: "project-enroll", id: "7" });
  assert.equal(result.isError, true);
  assert.equal(parsed(result).kind, "not-attempted");
  assert.equal(parsed(result).outcome, "blocked");
  assert.match(parsed(result).message, /archived/i);
  assert.equal(host.adds(), 0);
});

test("redacted content is unknown, not proven absence or permission to add", async (t) => {
  const host = setup(t, {
    respond: (call) =>
      has(call, "items(first:") ? items([{ ...item, content: null }]) : undefined,
  });
  const read = await host.run({ action: "project-member", id: "7" });
  assert.equal(read.isError, true);
  assert.equal(parsed(read).membership.kind, "unknown");
  assert.equal(parsed(read).membership.diagnostics[0].kind, "redacted");
  const result = await host.run({ action: "project-enroll", id: "7" });
  assert.equal(result.isError, true);
  assert.equal(parsed(result).outcome, "blocked");
  assert.equal(parsed(result).observation.membership.kind, "unknown");
  assert.equal(host.adds(), 0);
});

test("invalid returned issue identities block before any Project read or mutation", async (t) => {
  for (const invalid of [
    { ...issue, number: 8 },
    { ...issue, number: 7.5 },
    { ...issue, id: "" },
    { ...issue, url: "https://github.com/foreign/repo/issues/7" },
    { ...issue, url: "https://github.com/o/r/issues/8" },
    { ...issue, url: "https://evil.example/o/r/issues/7" },
    { ...issue, url: "https://github.com/o/r/pull/7" },
    { ...issue, url: "https://github.com/o/r/issues/7?redirect=1" },
  ]) {
    const host = setup(t, { respond: (call) => (call.args[0] === "issue" ? invalid : undefined) });
    const result = await host.run({ action: "project-enroll", id: "7" });
    assert.equal(result.isError, true);
    assert.equal(parsed(result).outcome, "blocked", JSON.stringify(invalid));
    assert.equal(parsed(result).observation, null);
    assert.equal(host.calls.length, 1);
    assert.equal(host.adds(), 0);
  }
});

test("duplicate or inconsistent matching memberships are errors rather than idempotent success", async (t) => {
  for (const nodes of [
    [item, { ...item, id: "ITEM_duplicate" }],
    [{ ...item, content: { ...item.content, number: 8 } }],
    [{ ...item, content: { ...item.content, url: "https://github.com/o/r/issues/8" } }],
    [{ ...item, content: { ...item.content, id: "ISSUE_other" } }],
  ]) {
    const host = setup(t, {
      respond: (call) => (has(call, "items(first:") ? items(nodes) : undefined),
    });
    const read = await host.run({ action: "project-member", id: "7" });
    assert.equal(read.isError, true);
    const result = await host.run({ action: "project-enroll", id: "7" });
    assert.equal(result.isError, true);
    assert.equal(parsed(result).outcome, "blocked");
    assert.equal(host.adds(), 0);
  }
});

test("page-two membership and field values are observed before considering an add", async (t) => {
  const host = setup(t, {
    respond: (call) => {
      if (has(call, "fields(first:"))
        return response({
          ...project,
          fields: {
            nodes: [
              { __typename: "ProjectV2Field", id: "FIELD_text", name: "Notes", dataType: "TEXT" },
            ],
            pageInfo,
          },
        });
      if (has(call, "items(first:"))
        return call.args.includes("cursor=next-item")
          ? items([item])
          : items([], { hasNextPage: true, endCursor: "next-item" });
      if (has(call, "fieldValues(first:"))
        return response({
          __typename: "ProjectV2Item",
          id: "ITEM_7",
          fieldValues: {
            nodes: [
              {
                __typename: "ProjectV2ItemFieldTextValue",
                field: { id: "FIELD_text" },
                text: "Actual remote value",
              },
            ],
            pageInfo,
          },
        });
      return undefined;
    },
  });
  const result = await host.run({ action: "project-enroll", id: "7" });
  assert.notEqual(result.isError, true);
  assert.equal(parsed(result).outcome, "already-member");
  assert.deepEqual(parsed(result).observation.membership.item.fields, [
    { fieldId: "FIELD_text", type: "text", value: "Actual remote value" },
  ]);
  assert.ok(host.calls.some(({ args }) => args.includes("cursor=next-item")));
  assert.equal(host.adds(), 0);
});

test("permission failures during preflight block writes and preserve the access error", async (t) => {
  for (const connection of ["issue", "fields(first:", "items(first:", "fieldValues(first:"]) {
    const host = setup(t, {
      enrolled: true,
      failure: (call) =>
        has(call, connection)
          ? { code: 1, stdout: "", stderr: "Project permission denied" }
          : undefined,
    });
    const result = await host.run({ action: "project-enroll", id: "7" });
    assert.equal(result.isError, true);
    assert.equal(parsed(result).outcome, "blocked");
    assert.match(parsed(result).message, /Project permission denied/);
    assert.equal(host.adds(), 0);
  }
});

test("partial GraphQL mutation errors report uncertain effects, not success or preflight refusal", async (t) => {
  const host = setup(t, {
    add: (remote) => {
      remote.enrolled = true;
      return { ...ack, errors: [{ message: "Project write permission changed" }] };
    },
  });
  const result = await host.run({ action: "project-enroll", id: "7" });
  assert.equal(result.isError, true);
  assert.equal(parsed(result).kind, "uncertain");
  assert.equal(parsed(result).outcome, "unknown");
  assert.match(parsed(result).message, /Project write permission changed/);
  assert.equal(host.adds(), 1);
  const retry = await host.run({ action: "project-enroll", id: "7" });
  assert.notEqual(retry.isError, true);
  assert.equal(parsed(retry).outcome, "already-member");
  assert.equal(host.adds(), 1);
});

test("malformed or mismatched acknowledgements remain uncertain with no automatic retry", async (t) => {
  for (const acknowledgement of [
    {},
    { data: { addProjectV2ItemById: null } },
    { ...ack, errors: "malformed" },
    {
      data: {
        addProjectV2ItemById: {
          item: { ...ack.data.addProjectV2ItemById.item, project: { id: "PVT_other" } },
        },
      },
    },
    {
      data: {
        addProjectV2ItemById: {
          item: {
            ...ack.data.addProjectV2ItemById.item,
            content: { __typename: "Issue", id: "ISSUE_other" },
          },
        },
      },
    },
  ]) {
    const host = setup(t, { add: () => acknowledgement });
    const result = await host.run({ action: "project-enroll", id: "7" });
    assert.equal(result.isError, true);
    assert.equal(parsed(result).kind, "uncertain");
    assert.equal(parsed(result).outcome, "unknown");
    assert.match(parsed(result).message, /re-read.*before.*retry/i);
    assert.equal(host.adds(), 1);
  }
});

test("failed verification never confirms enrollment or retries the mutation", async (t) => {
  for (const verification of [
    items([]),
    items([{ ...item, isArchived: true }]),
    items([{ ...item, id: "ITEM_other" }]),
    items([{ ...item, content: null }]),
    { errors: [{ message: "Verification permission denied" }] },
    response({ __typename: "ProjectV2", id: "PVT_other", items: { nodes: [item], pageInfo } }),
  ]) {
    const host = setup(t, {
      add: (remote) => {
        remote.enrolled = true;
        return ack;
      },
      respond: (call, remote) =>
        remote.enrolled && has(call, "items(first:") ? verification : undefined,
    });
    const result = await host.run({ action: "project-enroll", id: "7" });
    assert.equal(result.isError, true);
    assert.equal(parsed(result).kind, "uncertain");
    assert.equal(parsed(result).outcome, "unknown");
    assert.match(parsed(result).message, /verif.*re-read.*before.*retry/i);
    assert.equal(host.adds(), 1);
    assert.equal(host.calls.filter((call) => has(call, "items(first:")).length, 2);
  }
});

test("proven absence adds once using explicit variables and confirms a fresh intended membership", async (t) => {
  const host = setup(t, {
    add: (remote) => {
      remote.enrolled = true;
      return ack;
    },
  });
  const absent = await host.run({ action: "project-member", id: "7" });
  assert.notEqual(absent.isError, true);
  assert.equal(parsed(absent).membership.kind, "absent");
  const result = await host.run({ action: "project-enroll", id: "7" });
  assert.notEqual(result.isError, true);
  assert.equal(parsed(result).kind, "confirmed");
  assert.equal(parsed(result).outcome, "enrolled");
  assert.equal(parsed(result).observation.membership.kind, "present");
  assert.equal(parsed(result).observation.membership.item.itemId, "ITEM_7");
  assert.equal(host.adds(), 1);
  const mutation = host.calls.find((call) => has(call, "mutation"));
  assert.ok(mutation);
  assert.equal(mutation.command, "gh");
  assert.ok(mutation.args.includes("projectId=PVT_local"));
  assert.ok(mutation.args.includes("contentId=ISSUE_7"));
  assert.ok(has(mutation, "addProjectV2ItemById"));
  const query = mutation.args.find((a) => a.startsWith("query="));
  assert.ok(query);
  assert.doesNotMatch(query, /PVT_local|ISSUE_7/);
  const index = host.calls.indexOf(mutation);
  assert.ok(host.calls.slice(index + 1).some((call) => has(call, "items(first:")));
});

test("both membership actions require an id and reject unsafe numbers before Exec", async (t) => {
  for (const action of ["project-member", "project-enroll"]) {
    const host = setup(t);
    const missing = await host.run({ action });
    assert.equal(missing.isError, true);
    assert.match(JSON.stringify(missing.content), /needs id/);
    for (const id of [
      "0",
      "-1",
      "1.5",
      "01",
      " 7",
      "+7",
      "7e0",
      "--help",
      issue.url,
      "9007199254740992",
    ]) {
      const result = await host.run({ action, id });
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result.content), /positive safe GitHub issue number/);
    }
    assert.deepEqual(host.calls, []);
  }
});

test("unconfigured Project or repository and other adapters refuse membership without Exec", async (t) => {
  for (const configuration of [
    'kind="github"\nrepo="o/r"',
    'kind="github"\nproject_id="PVT_local"',
    'kind="repo-files"',
  ]) {
    const host = setup(t, { configuration });
    for (const action of ["project-member", "project-enroll"]) {
      const result = await host.run({ action, id: "7" });
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result.content), /requires.*(repo|Project)/);
    }
    assert.deepEqual(host.calls, []);
  }
});

test("nonzero and malformed mutation output are uncertain after a single dispatch", async (t) => {
  for (const output of [
    { code: 1, stdout: "", stderr: "write permission denied" },
    { code: 0, stdout: "not json", stderr: "" },
  ]) {
    let dispatches = 0;
    const host = setup(t, {
      failure: (call) => {
        if (!has(call, "mutation")) return undefined;
        dispatches++;
        return output;
      },
    });
    const result = await host.run({ action: "project-enroll", id: "7" });
    assert.equal(result.isError, true);
    assert.equal(parsed(result).kind, "uncertain");
    assert.equal(parsed(result).outcome, "unknown");
    assert.match(parsed(result).message, /re-read.*before.*retry/i);
    assert.equal(dispatches, 1);
  }
});
