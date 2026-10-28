import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { Value } from "typebox/value";
import type { Exec } from "../../src/core/exec.ts";
import { createGithubTracker } from "../../src/tracker/github.ts";
import { setProjectField } from "../../src/tracker/github-project-set.ts";
import { createWorkItemTool } from "../../src/tracker/work-item-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const pageInfo = { hasNextPage: false, endCursor: null };
const issue = { id: "ISSUE_7", number: 7, url: "https://github.com/o/r/issues/7" };
const field = {
  __typename: "ProjectV2SingleSelectField",
  id: "FIELD_first",
  name: "First",
  dataType: "SINGLE_SELECT",
  options: [{ id: "OPTION_first", name: "First option" }],
};
const project = {
  __typename: "ProjectV2",
  id: "PVT_local",
  owner: { login: "o" },
  number: 1,
  title: "Board",
  url: "https://github.com/orgs/o/projects/1",
  fields: {
    nodes: [
      field,
      {
        ...field,
        id: "FIELD_second",
        name: "Second",
        options: [{ id: "OPTION_second", name: "Second option" }],
      },
    ],
    pageInfo,
  },
};
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
const response = (node: unknown) => ({ data: { node } });
type Call = { command: string; args: readonly string[] };
const has = (call: Call, part: string) => call.args.some((arg) => arg.includes(part));
type Remote = { optionId: string | null; mutations: number };
type Reply = { code: number; stdout: string; stderr: string };
type Options = {
  optionId?: string | null;
  configuration?: string;
  respond?: (call: Call, remote: Remote) => unknown;
  mutate?: (call: Call, remote: Remote) => unknown;
  failure?: (call: Call, remote: Remote) => Reply | undefined;
};
function defaultRead(call: Call, remote: Remote): unknown {
  if (call.args[0] === "issue") return issue;
  if (has(call, "fields(first:")) return response(project);
  if (has(call, "items(first:"))
    return response({
      __typename: "ProjectV2",
      id: "PVT_local",
      items: { nodes: [item], pageInfo },
    });
  return response({
    __typename: "ProjectV2Item",
    id: "ITEM_7",
    fieldValues: {
      nodes:
        remote.optionId === null
          ? []
          : [
              {
                __typename: "ProjectV2ItemFieldSingleSelectValue",
                field: { id: "FIELD_first" },
                optionId: remote.optionId,
                name: "First option",
              },
            ],
      pageInfo,
    },
  });
}

function setup(t: TestContext, options: Options = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-project-set-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(
    join(cwd, ".development-system.toml"),
    `version=1\n[tracker]\n${options.configuration ?? 'kind="github"\nrepo="o/r"\nproject_id="PVT_local"'}\n`,
  );
  const calls: Call[] = [];
  const remote: Remote = { optionId: options.optionId ?? null, mutations: 0 };
  const exec: Exec = (command, args) => {
    const call = { command, args };
    calls.push(call);
    const mutation = has(call, "mutation");
    if (mutation) remote.mutations++;
    const failure = options.failure?.(call, remote);
    if (failure !== undefined) return Promise.resolve(failure);
    let value: unknown;
    if (mutation) {
      remote.optionId = has(call, "clearProjectV2ItemFieldValue") ? null : "OPTION_first";
      value = options.mutate?.(call, remote) ?? {
        data: {
          [remote.optionId === null
            ? "clearProjectV2ItemFieldValue"
            : "updateProjectV2ItemFieldValue"]: {
            projectV2Item: { id: "ITEM_7", project: { id: "PVT_local" } },
          },
        },
      };
    } else {
      const observed = options.respond?.(call, remote);
      value = observed === undefined ? defaultRead(call, remote) : observed;
    }
    return Promise.resolve({ code: 0, stdout: JSON.stringify(value), stderr: "" });
  };
  const tool = createWorkItemTool({ exec });
  const fake = createFakePi({ cwd });
  const run = (request: Record<string, unknown>) =>
    tool.execute("test", request as never, undefined, undefined, fake.ctx as never);
  return { run, tool, calls, mutations: () => remote.mutations };
}
const parameters = {
  action: "project-set",
  id: "7",
  fieldId: "FIELD_first",
  optionId: "OPTION_first",
};
const clearParameters = { action: "project-set", id: "7", fieldId: "FIELD_first", clear: true };
const parsed = (result: { content: readonly { type: string; text?: string }[] }) =>
  JSON.parse(result.content.find((part) => part.type === "text")?.text ?? "null");

test("readback failures, changed metadata and remote races remain uncertain", async (t) => {
  const items = (nodes: unknown[]) =>
    response({ __typename: "ProjectV2", id: "PVT_local", items: { nodes, pageInfo } });
  const changes: ((call: Call) => unknown)[] = [
    (call) => (has(call, "items(first:") ? items([]) : undefined),
    (call) => (has(call, "items(first:") ? items([{ ...item, isArchived: true }]) : undefined),
    (call) => (has(call, "items(first:") ? items([{ ...item, id: "ITEM_other" }]) : undefined),
    (call) => (has(call, "items(first:") ? items([{ ...item, content: null }]) : undefined),
    (call) =>
      has(call, "fieldValues(first:")
        ? response({
            __typename: "ProjectV2Item",
            id: "ITEM_7",
            fieldValues: { nodes: [], pageInfo },
          })
        : undefined,
    (call) =>
      has(call, "fields(first:")
        ? response({ ...project, fields: { nodes: [{ ...field, options: [] }], pageInfo } })
        : undefined,
    (call) =>
      has(call, "fields(first:")
        ? response({ ...project, fields: { nodes: [], pageInfo } })
        : undefined,
    (call) =>
      has(call, "fields(first:")
        ? response({
            ...project,
            fields: {
              nodes: [
                {
                  __typename: "ProjectV2Field",
                  id: "FIELD_first",
                  name: "Changed",
                  dataType: "TEXT",
                },
              ],
              pageInfo,
            },
          })
        : undefined,
    (call) =>
      has(call, "items(first:") ? { errors: [{ message: "Readback denied" }] } : undefined,
    (call) => {
      if (call.args[0] === "issue") return { ...issue, id: "ISSUE_replaced" };
      return has(call, "items(first:")
        ? items([{ ...item, content: { ...item.content, id: "ISSUE_replaced" } }])
        : undefined;
    },
  ];
  for (const change of changes) {
    const host = setup(t, {
      respond: (call, remote) => (remote.mutations > 0 ? change(call) : undefined),
    });
    const result = await host.run(parameters);
    assert.equal(result.isError, true);
    assert.equal(parsed(result).kind, "uncertain");
    assert.match(parsed(result).message, /verif.*re-read.*before.*retry/i);
    assert.equal(host.mutations(), 1);
  }
  for (const connection of ["issue", "fields(first:", "items(first:", "fieldValues(first:"]) {
    const host = setup(t, {
      failure: (call, remote) =>
        remote.mutations > 0 && !has(call, "mutation") && has(call, connection)
          ? { code: 1, stdout: "", stderr: "Verification denied" }
          : undefined,
    });
    const result = await host.run(parameters);
    assert.equal(result.isError, true);
    assert.equal(parsed(result).kind, "uncertain");
    assert.equal(host.mutations(), 1);
  }
});

test("partial, malformed or mismatched acknowledgements never confirm set or clear", async (t) => {
  for (const request of [parameters, clearParameters]) {
    const name =
      request === parameters ? "updateProjectV2ItemFieldValue" : "clearProjectV2ItemFieldValue";
    const ack = {
      data: { [name]: { projectV2Item: { id: "ITEM_7", project: { id: "PVT_local" } } } },
    };
    for (const invalid of [
      {},
      { ...ack, errors: [{ message: "Partial write permission failure" }] },
      { ...ack, errors: "malformed" },
      { data: { [name]: null } },
      { data: { [name]: { projectV2Item: { id: "ITEM_other", project: { id: "PVT_local" } } } } },
      { data: { [name]: { projectV2Item: { id: "ITEM_7", project: { id: "PVT_other" } } } } },
    ]) {
      const host = setup(t, {
        optionId: request === parameters ? null : "OPTION_first",
        mutate: () => invalid,
      });
      const result = await host.run(request);
      assert.equal(result.isError, true);
      assert.equal(parsed(result).kind, "uncertain");
      assert.match(parsed(result).message, /re-read.*before.*retry/i);
      assert.equal(host.mutations(), 1);
    }
  }
});

test("ambiguous dispatch failures are uncertain and an explicit retry observes a no-op", async (t) => {
  const host = setup(t, {
    mutate: () => {
      throw new Error("timed out after remote set");
    },
  });
  const result = await host.run(parameters);
  assert.equal(result.isError, true);
  assert.equal(parsed(result).kind, "uncertain");
  assert.equal(parsed(result).after, null);
  assert.match(parsed(result).message, /timed out.*re-read.*before.*retry/i);
  assert.equal(host.mutations(), 1);
  const retry = await host.run(parameters);
  assert.notEqual(retry.isError, true);
  assert.match(parsed(retry).message, /no-op/);
  assert.equal(host.mutations(), 1);
  for (const output of [
    { code: 1, stdout: "", stderr: "permission changed during write" },
    { code: 0, stdout: "not json", stderr: "" },
  ]) {
    const broken = setup(t, { failure: (call) => (has(call, "mutation") ? output : undefined) });
    const failed = await broken.run(parameters);
    assert.equal(failed.isError, true);
    assert.equal(parsed(failed).kind, "uncertain");
    assert.match(parsed(failed).message, /re-read.*before.*retry/i);
    assert.equal(broken.mutations(), 1);
  }
});

test("capability is exposed only for an explicit repo and Project; direct calls validate requests", async (t) => {
  for (const configuration of [
    'kind="github"\nrepo="o/r"',
    'kind="github"\nproject_id="PVT_local"',
    'kind="repo-files"',
  ]) {
    const host = setup(t, { configuration });
    const result = await host.run(parameters);
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /requires.*Project.*repo/);
    assert.deepEqual(host.calls, []);
  }
  const noExec: Exec = () => {
    throw new Error("Exec must not run");
  };
  for (const deps of [{}, { repo: "o/r" }, { projectId: "PVT_local" }]) {
    const tracker = createGithubTracker({ exec: noExec, cwd: "/unused", ...deps });
    assert.equal(tracker.projectSet, undefined);
  }
  assert.equal(
    typeof createGithubTracker({
      exec: noExec,
      cwd: "/unused",
      repo: "o/r",
      projectId: "PVT_local",
    }).projectSet,
    "function",
  );
  for (const request of [
    { fieldId: "FIELD_first" },
    { fieldId: "", optionId: "OPTION_first" },
    { fieldId: "FIELD_first", optionId: "" },
    { fieldId: "FIELD_first", clear: false },
    { fieldId: "FIELD_first", optionId: "OPTION_first", clear: true },
  ]) {
    const result = await setProjectField(
      { exec: noExec, cwd: "/unused", repo: "o/r", projectId: "PVT_local" },
      "7",
      request,
    );
    assert.ok(result.ok);
    assert.equal(result.value.kind, "not-attempted");
  }
  const host = setup(t);
  const inspection = await host.run({ action: "inspect" });
  assert.ok(parsed(inspection).capabilities.includes("project-set"));
});

test("incomplete or inaccessible preflight and unsafe issue identities produce zero writes", async (t) => {
  for (const connection of ["issue", "fields(first:", "items(first:", "fieldValues(first:"]) {
    const host = setup(t, {
      failure: (call) =>
        has(call, connection)
          ? { code: 1, stdout: "", stderr: "Project permission denied" }
          : undefined,
    });
    const result = await host.run(parameters);
    assert.equal(result.isError, true);
    assert.equal(parsed(result).kind, "not-attempted");
    assert.match(parsed(result).message, /Project permission denied/);
    assert.equal(host.mutations(), 0);
  }
  const host = setup(t);
  for (const id of ["0", "-1", "01", "7e0", "--help", "9007199254740992", issue.url]) {
    const result = await host.run({ ...parameters, id });
    assert.equal(result.isError, true);
    assert.equal(parsed(result).kind, "not-attempted");
    assert.match(parsed(result).message, /positive safe GitHub issue number/);
    assert.equal(host.mutations(), 0);
  }
  for (const malformed of [
    { errors: [{ message: "Partial metadata denied" }] },
    response({
      ...project,
      fields: { nodes: [field], pageInfo: { hasNextPage: true, endCursor: null } },
    }),
    response({ ...project, id: "PVT_foreign" }),
  ]) {
    const broken = setup(t, {
      respond: (call) => (has(call, "fields(first:") ? malformed : undefined),
    });
    const result = await broken.run(parameters);
    assert.equal(result.isError, true);
    assert.equal(parsed(result).kind, "not-attempted");
    assert.equal(broken.mutations(), 0);
  }
});

test("absent, archived, unknown or inconsistent membership never permits a field write", async (t) => {
  for (const nodes of [
    [],
    [{ ...item, isArchived: true }],
    [{ ...item, content: null }],
    [item, { ...item, id: "ITEM_duplicate" }],
    [{ ...item, content: { ...item.content, id: "ISSUE_other" } }],
    [{ ...item, content: { ...item.content, url: "https://github.com/o/r/issues/8" } }],
  ]) {
    const host = setup(t, {
      respond: (call) =>
        has(call, "items(first:")
          ? response({ __typename: "ProjectV2", id: "PVT_local", items: { nodes, pageInfo } })
          : undefined,
    });
    for (const request of [parameters, clearParameters]) {
      const result = await host.run(request);
      assert.equal(result.isError, true);
      assert.equal(parsed(result).kind, "not-attempted");
      assert.equal(parsed(result).after, null);
      assert.equal(host.mutations(), 0);
    }
  }
});

test("foreign, unsupported and malformed field identities block without writes", async (t) => {
  for (const nodes of [
    [project.fields.nodes[1]],
    [{ __typename: "ProjectV2Field", id: "FIELD_first", name: "Text", dataType: "TEXT" }],
    [{ ...field, options: [] }],
    [field, field],
    [{ ...field, options: [field.options[0], field.options[0]] }],
  ]) {
    const host = setup(t, {
      respond: (call) =>
        has(call, "fields(first:")
          ? response({ ...project, fields: { nodes, pageInfo } })
          : undefined,
    });
    const result = await host.run(parameters);
    assert.equal(result.isError, true);
    assert.equal(parsed(result).kind, "not-attempted");
    assert.match(parsed(result).message, /field|option/);
    assert.equal(host.mutations(), 0);
  }
});

test("public parameters require id, fieldId and exactly one explicit set or clear", async (t) => {
  const host = setup(t);
  for (const request of [
    { action: "project-set", fieldId: "FIELD_first", optionId: "OPTION_first" },
    { ...parameters, id: "" },
    { ...parameters, fieldId: undefined },
    { ...parameters, fieldId: " " },
    { ...parameters, optionId: undefined },
    { ...parameters, optionId: "" },
    { ...parameters, optionId: " " },
    { ...parameters, clear: true },
    { ...parameters, clear: false },
    { ...clearParameters, clear: false },
  ]) {
    const result = await host.run(request);
    assert.equal(result.isError, true, JSON.stringify(request));
    assert.match(JSON.stringify(result.content), /needs (id|fieldId|exactly one)/);
  }
  assert.deepEqual(host.calls, []);
});

test("explicit clear uses only the clear mutation and verifies an empty field", async (t) => {
  const host = setup(t, { optionId: "OPTION_first" });
  const result = await host.run(clearParameters);
  assert.notEqual(result.isError, true);
  assert.equal(parsed(result).kind, "confirmed");
  assert.equal(parsed(result).before.membership.item.fields[0].optionId, "OPTION_first");
  assert.deepEqual(parsed(result).after.membership.item.fields, []);
  assert.equal(host.mutations(), 1);
  const mutation = host.calls.find((call) => has(call, "mutation"));
  assert.ok(mutation);
  assert.ok(has(mutation, "clearProjectV2ItemFieldValue"));
  assert.ok(!has(mutation, "updateProjectV2ItemFieldValue"));
  assert.ok(!has(mutation, "optionId="));
  for (const variable of ["projectId=PVT_local", "itemId=ITEM_7", "fieldId=FIELD_first"])
    assert.ok(mutation.args.includes(variable));
});

test("same-value set and already-clear requests are verified no-ops", async (t) => {
  for (const optionId of ["OPTION_first", null]) {
    const host = setup(t, { optionId });
    const result = await host.run(optionId === null ? clearParameters : parameters);
    assert.notEqual(result.isError, true);
    assert.equal(parsed(result).kind, "confirmed");
    assert.match(parsed(result).message, /verified same-value no-op/i);
    assert.deepEqual(parsed(result).before, parsed(result).after);
    assert.ok(host.calls.some((call) => has(call, "fieldValues(first:")));
    assert.equal(host.mutations(), 0);
  }
});

test("foreign options are refused without mutations", async (t) => {
  const host = setup(t);
  const result = await host.run({ ...parameters, optionId: "OPTION_second" });
  assert.equal(result.isError, true);
  assert.match(
    JSON.stringify(result.content),
    /option OPTION_second does not belong to field FIELD_first/,
  );
  assert.equal(host.mutations(), 0);
});

test("set writes exactly one explicit field mutation and confirms fresh readback", async (t) => {
  const host = setup(t);
  assert.ok(Value.Check(host.tool.parameters, parameters));
  const result = await host.run(parameters);
  assert.notEqual(result.isError, true);
  const value = parsed(result);
  assert.equal(value.kind, "confirmed");
  assert.deepEqual(value.before.membership.item.fields, []);
  assert.equal(value.after.membership.item.fields[0].optionId, "OPTION_first");
  assert.equal(value.before.membership.item.lifecycle, "open");
  assert.equal(value.after.membership.item.lifecycle, "open");
  assert.match(value.message, /cannot eliminate concurrent remote races/);
  assert.equal(host.mutations(), 1);
  const mutation = host.calls.find((call) => has(call, "mutation"));
  assert.ok(mutation);
  assert.equal(mutation.command, "gh");
  for (const variable of [
    "projectId=PVT_local",
    "itemId=ITEM_7",
    "fieldId=FIELD_first",
    "optionId=OPTION_first",
  ])
    assert.ok(mutation.args.includes(variable));
  const query = mutation.args.find((arg) => arg.startsWith("query="));
  assert.ok(query);
  assert.match(query, /updateProjectV2ItemFieldValue/);
  assert.match(query, /singleSelectOptionId:\$optionId/);
  assert.doesNotMatch(
    query,
    /PVT_local|ITEM_7|FIELD_first|OPTION_first|addProject|archive|label|assignee|position/i,
  );
  const later = host.calls.slice(host.calls.indexOf(mutation) + 1);
  assert.ok(later.some((call) => has(call, "fields(first:")));
  assert.ok(later.some((call) => has(call, "fieldValues(first:")));
  assert.ok(
    host.calls.every(
      (call) => has(call, "mutation") || call.args[0] === "issue" || has(call, "query="),
    ),
  );
});
