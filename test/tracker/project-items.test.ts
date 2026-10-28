import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { Value } from "typebox/value";
import type { Exec } from "../../src/core/exec.ts";
import { createWorkItemTool } from "../../src/tracker/work-item-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const pageInfo = { hasNextPage: false, endCursor: null };
const field = {
  __typename: "ProjectV2SingleSelectField",
  id: "FIELD_local",
  name: "Queue",
  dataType: "SINGLE_SELECT",
  options: [{ id: "OPTION_local", name: "Chosen by humans" }],
};
const project = {
  __typename: "ProjectV2",
  id: "PVT_local",
  owner: { login: "o" },
  number: 1,
  title: "Board",
  url: "https://github.com/orgs/o/projects/1",
  fields: { nodes: [field], pageInfo },
};
const rawValue = {
  __typename: "ProjectV2ItemFieldSingleSelectValue",
  field: { id: "FIELD_local" },
  optionId: "OPTION_local",
  name: "Chosen by humans",
};
const issue = (number: number, state = "OPEN") => ({
  __typename: "ProjectV2Item",
  id: `ITEM_${number}`,
  isArchived: false,
  content: {
    __typename: "Issue",
    id: `ISSUE_${number}`,
    number,
    title: `Issue ${number}`,
    url: `https://github.com/o/r/issues/${number}`,
    state,
    repository: { nameWithOwner: "o/r" },
  },
});
const response = (node: unknown) => ({ data: { node } });

type Call = { command: string; args: readonly string[] };
function setup(
  t: TestContext,
  respond?: (call: Call, index: number) => unknown,
  configuration = 'kind="github"\nrepo="o/r"\nproject_id="PVT_local"',
  failure?: {
    connection: string;
    output: Error | { code: number; stdout: string; stderr: string };
  },
) {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-items-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, ".development-system.toml"), `version=1\n[tracker]\n${configuration}\n`);
  const calls: Call[] = [];
  const exec: Exec = (command, args) => {
    const call = { command, args };
    calls.push(call);
    if (failure !== undefined && args.some((a) => a.includes(`${failure.connection}(first:`))) {
      if (failure.output instanceof Error) throw failure.output;
      return Promise.resolve(failure.output);
    }
    let value: unknown = respond?.(call, calls.length);
    if (value !== undefined)
      return Promise.resolve({ code: 0, stdout: JSON.stringify(value), stderr: "" });
    if (args.some((a) => a.includes("fields(first:"))) value = response(project);
    else if (args.some((a) => a.includes("items(first:")))
      value = response({
        __typename: "ProjectV2",
        id: "PVT_local",
        items: { nodes: [issue(1), issue(2, "CLOSED")], pageInfo },
      });
    else {
      const itemId = args.find((a) => a.startsWith("itemId="))?.slice(7);
      value = response({
        __typename: "ProjectV2Item",
        id: itemId,
        fieldValues: { nodes: [rawValue], pageInfo },
      });
    }
    return Promise.resolve({ code: 0, stdout: JSON.stringify(value), stderr: "" });
  };
  const fake = createFakePi({ cwd });
  const tool = createWorkItemTool({ exec });
  const run = (parameters: Record<string, unknown> = { action: "project-items" }) =>
    tool.execute("test", parameters as never, undefined, undefined, fake.ctx as never);
  return { run, calls, tool };
}
const parsed = (result: { content: readonly { type: string; text?: string }[] }) =>
  JSON.parse(result.content.find((p) => p.type === "text")?.text ?? "null");
const text = (result: { content: unknown }) => JSON.stringify(result.content);

test("explicit Project filters preserve lifecycle and raw field facts without selecting work", async (t) => {
  const host = setup(t);
  const parameters = {
    action: "project-items",
    lifecycle: "open",
    fieldId: "FIELD_local",
    optionId: "OPTION_local",
  };
  assert.ok(
    Value.Check(host.tool.parameters, parameters),
    "public schema must admit project-items and explicit filters",
  );
  const result = await host.run(parameters);
  assert.notEqual(result.isError, true, text(result));
  const observed = parsed(result);
  assert.equal(observed.order, "api-observation-not-priority");
  assert.equal(observed.eligibility, "unassessed");
  assert.equal(observed.issues.length, 1);
  assert.deepEqual(observed.issues[0], {
    itemId: "ITEM_1",
    issueId: "ISSUE_1",
    number: 1,
    title: "Issue 1",
    url: "https://github.com/o/r/issues/1",
    lifecycle: "open",
    archived: false,
    fields: [
      {
        fieldId: "FIELD_local",
        type: "single-select",
        optionId: "OPTION_local",
        name: "Chosen by humans",
      },
    ],
  });
  assert.ok(
    host.calls.every(
      ({ command, args }) =>
        command === "gh" &&
        args[0] === "api" &&
        args[1] === "graphql" &&
        !args.some((a) => a.includes("mutation")),
    ),
  );
});

test("standard Project Title text values do not make ordinary issue observations fail", async (t) => {
  const titleField = {
    __typename: "ProjectV2Field",
    id: "TITLE_local",
    name: "Title",
    dataType: "TITLE",
  };
  const host = setup(t, ({ args }) => {
    if (args.some((a) => a.includes("fields(first:")))
      return response({ ...project, fields: { nodes: [titleField, field], pageInfo } });
    if (!args.some((a) => a.includes("fieldValues(first:"))) return undefined;
    const itemId = args.find((a) => a.startsWith("itemId="))?.slice(7);
    return response({
      __typename: "ProjectV2Item",
      id: itemId,
      fieldValues: {
        nodes: [
          {
            __typename: "ProjectV2ItemFieldTextValue",
            field: { id: "TITLE_local" },
            text: "Ordinary issue title",
          },
          rawValue,
        ],
        pageInfo,
      },
    });
  });
  const result = await host.run();
  assert.notEqual(result.isError, true, text(result));
  assert.equal(parsed(result).issues.length, 2);
  assert.deepEqual(parsed(result).issues[0].fields[0], {
    fieldId: "TITLE_local",
    type: "text",
    value: "Ordinary issue title",
  });
});

test("Project item pagination is complete and preserves observed API order", async (t) => {
  const host = setup(t, ({ args }) => {
    if (!args.some((a) => a.includes("items(first:"))) return undefined;
    const next = args.includes("cursor=next-item");
    return response({
      __typename: "ProjectV2",
      id: "PVT_local",
      items: {
        nodes: [issue(next ? 3 : 1)],
        pageInfo: next ? pageInfo : { hasNextPage: true, endCursor: "next-item" },
      },
    });
  });
  const result = await host.run();
  assert.notEqual(result.isError, true, text(result));
  assert.deepEqual(
    parsed(result).issues.map((i: { number: number }) => i.number),
    [1, 3],
  );
});

test("each item's field-value connection is exhausted before explicit option filtering", async (t) => {
  const host = setup(t, ({ args }) => {
    if (!args.some((a) => a.includes("fieldValues(first:"))) return undefined;
    const next = args.includes("cursor=next-field");
    const itemId = args.find((a) => a.startsWith("itemId="))?.slice(7);
    return response({
      __typename: "ProjectV2Item",
      id: itemId,
      fieldValues: {
        nodes: next ? [rawValue] : [],
        pageInfo: next ? pageInfo : { hasNextPage: true, endCursor: "next-field" },
      },
    });
  });
  const result = await host.run({
    action: "project-items",
    fieldId: "FIELD_local",
    optionId: "OPTION_local",
  });
  assert.notEqual(result.isError, true, text(result));
  assert.equal(parsed(result).issues.length, 2);
  assert.equal(parsed(result).issues[0].fields[0].optionId, "OPTION_local");
  assert.equal(host.calls.filter(({ args }) => args.includes("cursor=next-field")).length, 2);
});

test("invalid field/option filters refuse before reading Project items", async (t) => {
  for (const filter of [
    { fieldId: "FIELD_local" },
    { optionId: "OPTION_local" },
    { fieldId: "FIELD_foreign", optionId: "OPTION_local" },
    { fieldId: "FIELD_local", optionId: "OPTION_foreign" },
  ]) {
    const host = setup(t);
    const result = await host.run({ action: "project-items", ...filter });
    assert.equal(result.isError, true, JSON.stringify(filter));
    assert.match(text(result), /field|option/i);
    assert.equal(
      host.calls.filter(({ args }) => args.some((a) => a.includes("items(first:"))).length,
      0,
    );
  }
  const host = setup(t, ({ args }) =>
    args.some((a) => a.includes("fields(first:"))
      ? response({
          ...project,
          fields: {
            nodes: [
              { __typename: "ProjectV2Field", id: "FIELD_local", name: "Notes", dataType: "TEXT" },
            ],
            pageInfo,
          },
        })
      : undefined,
  );
  const result = await host.run({
    action: "project-items",
    fieldId: "FIELD_local",
    optionId: "OPTION_local",
  });
  assert.equal(result.isError, true);
  assert.match(text(result), /single.select/i);
  assert.equal(host.calls.length, 1);
});

test("archive, redaction, foreign repository and non-issue items remain explicit observations", async (t) => {
  const foreign = issue(3);
  const host = setup(t, ({ args }) =>
    args.some((a) => a.includes("items(first:"))
      ? response({
          __typename: "ProjectV2",
          id: "PVT_local",
          items: {
            nodes: [
              { ...issue(1), isArchived: true },
              { ...issue(2), content: null },
              {
                ...foreign,
                content: { ...foreign.content, repository: { nameWithOwner: "other/repo" } },
              },
              { ...issue(4), content: { __typename: "PullRequest" } },
              { ...issue(5), content: { __typename: "DraftIssue" } },
            ],
            pageInfo,
          },
        })
      : undefined,
  );
  const result = await host.run();
  assert.notEqual(result.isError, true, text(result));
  const observed = parsed(result);
  assert.equal(observed.eligibility, "unknown", "redaction must not prove an empty eligible queue");
  assert.equal(observed.issues.length, 1);
  assert.equal(observed.issues[0].archived, true);
  assert.deepEqual(
    observed.diagnostics.map((d: { kind: string }) => d.kind),
    ["archived", "redacted", "foreign-repository", "pull-request", "draft"],
  );
  assert.equal(
    host.calls.filter(({ args }) => args.some((a) => a.includes("fieldValues(first:"))).length,
    1,
  );
});

test("archive observations explicitly include archived items hidden by GitHub's default connection filter", async (t) => {
  const host = setup(t, ({ args }) => {
    const query = args.find((a) => a.includes("items(first:"));
    if (query === undefined) return undefined;
    // Model the documented external API default: omitted archivedStates hides archives.
    const states = /archivedStates\s*:\s*\[([^\]]+)\]/
      .exec(query)?.[1]
      ?.split(",")
      .map((v) => v.trim()) ?? ["NOT_ARCHIVED"];
    return response({
      __typename: "ProjectV2",
      id: "PVT_local",
      items: {
        nodes: [
          ...(states.includes("NOT_ARCHIVED") ? [issue(1)] : []),
          ...(states.includes("ARCHIVED") ? [{ ...issue(2), isArchived: true }] : []),
        ],
        pageInfo,
      },
    });
  });
  const result = await host.run();
  assert.notEqual(result.isError, true, text(result));
  assert.deepEqual(
    parsed(result).issues.map((i: { number: number; archived: boolean }) => [i.number, i.archived]),
    [
      [1, false],
      [2, true],
    ],
  );
  assert.equal(parsed(result).diagnostics[0].kind, "archived");
});

test("duplicate item and field identities cannot become successful observations", async (t) => {
  for (const connection of ["items", "fieldValues"]) {
    const host = setup(t, ({ args }) => {
      if (!args.some((a) => a.includes(`${connection}(first:`))) return undefined;
      if (connection === "items")
        return response({
          __typename: "ProjectV2",
          id: "PVT_local",
          items: { nodes: [issue(1), issue(1)], pageInfo },
        });
      const itemId = args.find((a) => a.startsWith("itemId="))?.slice(7);
      return response({
        __typename: "ProjectV2Item",
        id: itemId,
        fieldValues: { nodes: [rawValue, rawValue], pageInfo },
      });
    });
    const result = await host.run();
    assert.equal(result.isError, true, connection);
    assert.match(text(result), /duplicate/i);
    assert.match(text(result), /re-read/);
  }
});

test("supported raw values and unsupported field types remain explicit without coercion", async (t) => {
  const fieldTypes: Record<string, string> = {
    ITERATION: "ProjectV2IterationField",
    MULTI_SELECT: "ProjectV2MultiSelectField",
  };
  const values = [
    rawValue,
    {
      __typename: "ProjectV2ItemFieldTextValue",
      field: { id: "TEXT_local" },
      text: "Not a workflow role",
    },
    { __typename: "ProjectV2ItemFieldNumberValue", field: { id: "NUMBER_local" }, number: 3 },
    { __typename: "ProjectV2ItemFieldDateValue", field: { id: "DATE_local" }, date: "2026-10-27" },
    { __typename: "ProjectV2ItemFieldIterationValue", field: { id: "ITERATION_local" } },
    { __typename: "ProjectV2ItemFieldMultiSelectValue", field: { id: "MULTI_SELECT_local" } },
  ];
  const host = setup(t, ({ args }) => {
    if (args.some((a) => a.includes("fields(first:")))
      return response({
        ...project,
        fields: {
          nodes: [
            field,
            ...["TEXT", "NUMBER", "DATE", "ITERATION", "MULTI_SELECT"].map((dataType) => ({
              __typename: fieldTypes[dataType] ?? "ProjectV2Field",
              id: `${dataType}_local`,
              name: dataType,
              dataType,
            })),
          ],
          pageInfo,
        },
      });
    if (!args.some((a) => a.includes("fieldValues(first:"))) return undefined;
    const itemId = args.find((a) => a.startsWith("itemId="))?.slice(7);
    return response({
      __typename: "ProjectV2Item",
      id: itemId,
      fieldValues: { nodes: values, pageInfo },
    });
  });
  const result = await host.run();
  assert.notEqual(result.isError, true, text(result));
  assert.deepEqual(parsed(result).issues[0].fields.slice(1), [
    { fieldId: "TEXT_local", type: "text", value: "Not a workflow role" },
    { fieldId: "NUMBER_local", type: "number", value: 3 },
    { fieldId: "DATE_local", type: "date", value: "2026-10-27" },
    {
      fieldId: "ITERATION_local",
      type: "unsupported",
      typename: "ProjectV2ItemFieldIterationValue",
    },
    {
      fieldId: "MULTI_SELECT_local",
      type: "unsupported",
      typename: "ProjectV2ItemFieldMultiSelectValue",
    },
  ]);
});

test("stale or foreign field identities and values require a re-read rather than false filtering", async (t) => {
  for (const value of [
    { ...rawValue, field: { id: "FIELD_foreign" } },
    { ...rawValue, optionId: "OPTION_foreign" },
    { __typename: "ProjectV2ItemFieldTextValue", field: { id: "FIELD_local" }, text: "wrong type" },
  ]) {
    const host = setup(t, ({ args }) => {
      if (!args.some((a) => a.includes("fieldValues(first:"))) return undefined;
      const itemId = args.find((a) => a.startsWith("itemId="))?.slice(7);
      return response({
        __typename: "ProjectV2Item",
        id: itemId,
        fieldValues: { nodes: [value], pageInfo },
      });
    });
    const result = await host.run();
    assert.equal(result.isError, true, JSON.stringify(value));
    assert.match(text(result), /field|option|type/i);
    assert.match(text(result), /re-read/);
  }
});

test("legacy status cannot silently become an ignored Project workflow filter", async (t) => {
  const host = setup(t);
  const result = await host.run({ action: "project-items", status: "in-progress" });
  assert.equal(result.isError, true);
  assert.match(text(result), /legacy|lifecycle/i);
  assert.deepEqual(host.calls, []);
});

function brokenObservation(connection: string, problem: string, args: readonly string[]): unknown {
  if (!args.some((a) => a.includes(`${connection}(first:`))) return undefined;
  if (problem === "null") return response(null);
  if (problem === "permission-only")
    return { errors: [{ message: "read:project permission denied" }] };
  if (problem === "malformed") return { errors: "broken", data: { node: null } };
  const id =
    connection === "items" ? "PVT_local" : args.find((a) => a.startsWith("itemId="))?.slice(7);
  const info = problem.includes("cursor")
    ? { hasNextPage: true, endCursor: problem === "missing-cursor" ? null : "same-cursor" }
    : pageInfo;
  const node = {
    __typename: connection === "items" ? "ProjectV2" : "ProjectV2Item",
    id: problem === "identity" ? "OTHER_node" : id,
    [connection]: { nodes: [], pageInfo: info },
  };
  return problem === "partial-errors"
    ? { ...response(node), errors: [{ message: "read:project permission denied" }] }
    : response(node);
}

test("item and field connections fail closed for cursors, identities, malformed nodes and GraphQL errors", async (t) => {
  for (const connection of ["items", "fieldValues"])
    for (const problem of [
      "missing-cursor",
      "repeated-cursor",
      "identity",
      "null",
      "partial-errors",
      "permission-only",
      "malformed",
    ]) {
      const host = setup(t, ({ args }) => brokenObservation(connection, problem, args));
      const result = await host.run();
      assert.equal(result.isError, true, `${connection}/${problem}`);
      assert.match(text(result), /re-read/);
      assert.match(text(result), /unknown/i);
      if (problem.includes("errors") || problem === "permission-only")
        assert.match(text(result), /read:project permission denied/);
    }
});

test("connection safety bounds refuse incomplete observations instead of silently cutting pages", async (t) => {
  for (const connection of ["items", "fieldValues"]) {
    const host = setup(t, ({ args }, index) => {
      if (!args.some((a) => a.includes(`${connection}(first:`))) return undefined;
      const id =
        connection === "items" ? "PVT_local" : args.find((a) => a.startsWith("itemId="))?.slice(7);
      return response({
        __typename: connection === "items" ? "ProjectV2" : "ProjectV2Item",
        id,
        [connection]: { nodes: [], pageInfo: { hasNextPage: true, endCursor: `cursor-${index}` } },
      });
    });
    const result = await host.run();
    assert.equal(result.isError, true);
    assert.match(text(result), /100-page limit/);
    assert.equal(
      host.calls.filter(({ args }) => args.some((a) => a.includes(`${connection}(first:`))).length,
      100,
    );
  }
});

test("process, permission and invalid JSON failures discard all partial item and field facts", async (t) => {
  for (const connection of ["items", "fieldValues"])
    for (const output of [
      new Error("process unavailable"),
      { code: 1, stdout: "", stderr: "read:project permission denied" },
      { code: 0, stdout: "not json", stderr: "" },
    ]) {
      const host = setup(t, undefined, undefined, { connection, output });
      const result = await host.run();
      assert.equal(result.isError, true);
      assert.match(text(result), /re-read/);
      assert.match(text(result), /no writes attempted/);
      assert.match(text(result), /unknown/i);
      if (output instanceof Error) assert.match(text(result), /process unavailable/);
      else if (output.code !== 0) assert.match(text(result), /read:project permission denied/);
    }
});

test("absent Project or repository config and unsupported backends perform no Project requests", async (t) => {
  for (const config of [
    'kind="repo-files"',
    'kind="github"\nrepo="o/r"',
    'kind="github"\nproject_id="PVT_local"',
  ]) {
    const host = setup(t, undefined, config);
    const result = await host.run();
    assert.equal(result.isError, true);
    assert.match(text(result), /requires|configured/i);
    assert.deepEqual(host.calls, []);
  }
});

test("an accessible empty Project is unassessed, not an access failure or eligible-work decision", async (t) => {
  const host = setup(t, ({ args }) =>
    args.some((a) => a.includes("items(first:"))
      ? response({ __typename: "ProjectV2", id: "PVT_local", items: { nodes: [], pageInfo } })
      : undefined,
  );
  const result = await host.run();
  assert.notEqual(result.isError, true, text(result));
  assert.equal(parsed(result).eligibility, "unassessed");
  assert.deepEqual(parsed(result).issues, []);
  assert.deepEqual(parsed(result).diagnostics, []);
});
