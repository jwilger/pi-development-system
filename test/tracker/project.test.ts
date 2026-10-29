import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { Value } from "typebox/value";
import type { Exec } from "../../src/core/exec.ts";
import { createWorkItemTool } from "../../src/tracker/work-item-tool.ts";
import { createFakePi } from "../harness/fake-pi.ts";

const project = {
  __typename: "ProjectV2",
  id: "PVT_local",
  owner: { login: "organization" },
  number: 12,
  title: "Existing board",
  url: "https://github.com/orgs/organization/projects/12",
  fields: {
    nodes: [
      {
        __typename: "ProjectV2SingleSelectField",
        id: "FIELD_local",
        name: "Queue",
        dataType: "SINGLE_SELECT",
        options: [{ id: "OPTION_local", name: "Human selected" }],
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
};

function setup(
  t: TestContext,
  response: unknown = { data: { node: project } },
  configuration = 'kind="github"\nrepo="o/r"\nproject_id="PVT_local"',
  failure?: Error | { code: number; stdout: string; stderr: string },
) {
  const cwd = mkdtempSync(join(tmpdir(), "devsys-project-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, ".development-system.toml"), `version=1\n[tracker]\n${configuration}\n`);
  const calls: { command: string; args: readonly string[] }[] = [];
  const exec: Exec = (command, args) => {
    calls.push({ command, args });
    if (failure instanceof Error) throw failure;
    if (failure !== undefined) return Promise.resolve(failure);
    const page: unknown = Array.isArray(response) ? response[calls.length - 1] : response;
    return Promise.resolve({ code: 0, stdout: JSON.stringify(page), stderr: "" });
  };
  const fake = createFakePi({ cwd });
  const tool = createWorkItemTool({ exec });
  const run = (parameters: Record<string, unknown>) =>
    tool.execute("test", parameters as never, undefined, undefined, fake.ctx as never);
  return { run, calls, tool };
}

const text = (result: { content: unknown }) => JSON.stringify(result.content);
const inspection = (result: { content: readonly { type: string; text?: string }[] }) =>
  JSON.parse(result.content.find((part) => part.type === "text")?.text ?? "null");

test("inspection refuses a field outside the configured Project without mutations", async (t) => {
  const host = setup(t);
  const result = await host.run({ action: "inspect", fieldId: "FIELD_foreign" });
  assert.equal(result.isError, true);
  assert.match(text(result), /FIELD_foreign.*PVT_local|PVT_local.*FIELD_foreign/);
  assert.ok(
    host.calls.every(
      ({ command, args }) =>
        command === "gh" &&
        args[0] === "api" &&
        args[1] === "graphql" &&
        !args.some((arg) => arg.includes("mutation")),
    ),
  );
});

test("inspection advertises its public schema and returns actual Project field and option identities", async (t) => {
  const host = setup(t);
  assert.ok(Value.Check(host.tool.parameters, { action: "inspect", fieldId: "FIELD_local" }));
  const result = await host.run({ action: "inspect", fieldId: "FIELD_local" });
  assert.notEqual(result.isError, true, text(result));
  assert.deepEqual(inspection(result).project, {
    id: project.id,
    owner: "organization",
    number: 12,
    title: project.title,
    url: project.url,
    fields: [
      {
        id: "FIELD_local",
        name: "Queue",
        dataType: "SINGLE_SELECT",
        options: [{ id: "OPTION_local", name: "Human selected" }],
      },
    ],
  });
  assert.equal(host.calls.length, 1);
  assert.deepEqual(inspection(result).capabilities, [
    "inspect",
    "list",
    "get",
    "create",
    "update",
    "comment",
    "delivery-check",
    "complete",
    "assign",
    "project-items",
    "project-member",
    "project-enroll",
    "project-set",
  ]);
});

test("Issues-only and repo-file inspection does not contact Projects or provision anything", async (t) => {
  for (const config of ['kind="github"\nrepo="o/r"', 'kind="repo-files"']) {
    const host = setup(t, null, config);
    const result = await host.run({ action: "inspect" });
    assert.notEqual(result.isError, true, text(result));
    assert.equal(inspection(result).project, null);
    assert.ok(!inspection(result).capabilities.includes("project-member"));
    assert.ok(!inspection(result).capabilities.includes("project-enroll"));
    const field = await host.run({ action: "inspect", fieldId: "FIELD_local" });
    assert.equal(field.isError, true);
    assert.match(text(field), /configured|project_id/);
    assert.deepEqual(host.calls, []);
  }
});

test("inaccessible, wrong or malformed Project observations fail closed", async (t) => {
  for (const response of [
    { data: { node: null } },
    { data: { node: { ...project, __typename: "Issue" } } },
    { data: { node: { ...project, id: "PVT_other" } } },
    { data: { node: { ...project, owner: null } } },
    { data: { node: { ...project, fields: null } } },
    {
      data: {
        node: {
          ...project,
          fields: { ...project.fields, nodes: [{ ...project.fields.nodes[0], options: null }] },
        },
      },
    },
    {
      data: {
        node: {
          ...project,
          fields: { ...project.fields, pageInfo: { hasNextPage: false, endCursor: 7 } },
        },
      },
    },
    { data: { node: project }, errors: "invalid errors" },
  ]) {
    const host = setup(t, response);
    const result = await host.run({ action: "inspect" });
    assert.equal(result.isError, true, JSON.stringify(response));
    assert.match(text(result), /Project PVT_local/);
    assert.match(text(result), /no writes attempted/);
    assert.equal(host.calls.length, 1);
  }
});

test("process, permission and invalid-JSON failures retain repair advice without writes", async (t) => {
  for (const failure of [
    new Error("process unavailable"),
    { code: 1, stdout: "", stderr: "read:project permission denied" },
    { code: 0, stdout: "not json", stderr: "" },
  ]) {
    const host = setup(t, null, undefined, failure);
    const result = await host.run({ action: "inspect" });
    assert.equal(result.isError, true);
    assert.match(text(result), /re-read/i);
    if (failure instanceof Error) assert.match(text(result), /process unavailable/);
    else if (failure.code !== 0) assert.match(text(result), /read:project permission denied/);
    assert.equal(host.calls.length, 1);
  }
});

test("malformed or non-GitHub Project configuration performs no network requests", async (t) => {
  for (const config of [
    'kind="repo-files"\nproject_id="PVT_local"',
    'kind="github"\nproject_id=""',
    'kind="github"\nproject_id="invalid value"',
    'kind="github"\nproject_id=42',
  ]) {
    const host = setup(t, null, config);
    const result = await host.run({ action: "inspect" });
    assert.equal(result.isError, true);
    assert.match(text(result), /project_id/);
    assert.deepEqual(host.calls, []);
  }
});

test("missing and repeated field cursors cannot return a partial observation", async (t) => {
  for (const cursor of [null, "", "same-cursor"]) {
    const node = {
      ...project,
      fields: { nodes: [], pageInfo: { hasNextPage: true, endCursor: cursor } },
    };
    const host = setup(t, [{ data: { node } }, { data: { node } }]);
    const result = await host.run({ action: "inspect" });
    assert.equal(result.isError, true);
    assert.match(text(result), /missing or repeated cursor/);
    assert.equal(host.calls.length, cursor === "same-cursor" ? 2 : 1);
  }
});

test("duplicate field and single-select option identities are refused instead of ambiguous success", async (t) => {
  const field = project.fields.nodes[0];
  assert.ok(field);
  const duplicates = [
    { ...project, fields: { ...project.fields, nodes: [field, field] } },
    {
      ...project,
      fields: {
        ...project.fields,
        nodes: [{ ...field, options: [...field.options, ...field.options] }],
      },
    },
  ];
  for (const node of duplicates) {
    const host = setup(t, { data: { node } });
    const result = await host.run({ action: "inspect" });
    assert.equal(result.isError, true, "duplicate identity must not become a usable inspection");
    assert.match(text(result), /duplicate/);
  }
});

test("partial GraphQL data with errors never becomes successful Project inspection", async (t) => {
  const host = setup(t, {
    data: { node: project },
    errors: [{ message: "insufficient organization Project permissions" }],
  });
  const result = await host.run({ action: "inspect" });
  assert.equal(result.isError, true, "partial API errors must not imply complete observations");
  assert.match(text(result), /insufficient organization Project permissions/);
  assert.match(text(result), /re-read/i);
});

test("non-select metadata stays uninterpreted and page-two failures discard partial observations", async (t) => {
  const node = {
    ...project,
    fields: {
      ...project.fields,
      nodes: [
        {
          __typename: "ProjectV2IterationField",
          id: "FIELD_iteration",
          name: "Cycle",
          dataType: "ITERATION",
        },
        { __typename: "ProjectV2Field", id: "FIELD_date", name: "Date", dataType: "DATE" },
      ],
    },
  };
  const host = setup(t, { data: { node } });
  const result = await host.run({ action: "inspect" });
  assert.notEqual(result.isError, true);
  assert.deepEqual(inspection(result).project.fields, [
    { id: "FIELD_iteration", name: "Cycle", dataType: "ITERATION" },
    { id: "FIELD_date", name: "Date", dataType: "DATE" },
  ]);
  const first = {
    ...project,
    fields: { ...project.fields, pageInfo: { hasNextPage: true, endCursor: "page-two" } },
  };
  const failed = setup(t, [
    { data: { node: first } },
    { errors: [{ message: "access revoked on page two" }] },
  ]);
  const partial = await failed.run({ action: "inspect" });
  assert.equal(partial.isError, true);
  assert.match(text(partial), /access revoked on page two/);
  assert.doesNotMatch(text(partial), /Human selected/);
  assert.equal(failed.calls.length, 2);
});

test("pagination limit refuses an incomplete Project rather than returning 100 partial pages", async (t) => {
  const pages = Array.from({ length: 100 }, (_, index) => ({
    data: {
      node: {
        ...project,
        fields: { nodes: [], pageInfo: { hasNextPage: true, endCursor: `cursor-${index}` } },
      },
    },
  }));
  const host = setup(t, pages);
  const result = await host.run({ action: "inspect" });
  assert.equal(result.isError, true);
  assert.match(text(result), /100-page limit/);
  assert.equal(host.calls.length, 100);
});

test("Project inspection exhausts field pages before accepting a field from page two", async (t) => {
  const second = {
    ...project,
    fields: {
      ...project.fields,
      nodes: [
        { __typename: "ProjectV2Field", id: "FIELD_second", name: "Summary", dataType: "TEXT" },
      ],
    },
  };
  const first = {
    ...project,
    fields: { ...project.fields, pageInfo: { hasNextPage: true, endCursor: "next-page" } },
  };
  const host = setup(t, [{ data: { node: first } }, { data: { node: second } }]);
  const result = await host.run({ action: "inspect", fieldId: "FIELD_second" });
  assert.notEqual(result.isError, true, text(result));
  assert.deepEqual(
    inspection(result).project.fields.map((field: { id: string }) => field.id),
    ["FIELD_local", "FIELD_second"],
  );
  assert.equal(host.calls.length, 2);
  assert.ok(host.calls[1]?.args.includes("cursor=next-page"));
});

test("Project metadata without an explicit repository does not advertise membership capabilities", async (t) => {
  const host = setup(t, undefined, 'kind="github"\nproject_id="PVT_local"');
  const result = await host.run({ action: "inspect" });
  assert.notEqual(result.isError, true);
  assert.equal(inspection(result).project.id, "PVT_local");
  assert.ok(!inspection(result).capabilities.includes("project-member"));
  assert.ok(!inspection(result).capabilities.includes("project-enroll"));
});
