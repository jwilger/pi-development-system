import { type Static, type TSchema, Type } from "typebox";
import { Value } from "typebox/value";
import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import { inspectProject } from "./github-project.ts";
import {
  type ProjectDiagnostic,
  type ProjectField,
  type ProjectIssueObservation,
  type ProjectItemFilter,
  type ProjectItems,
  type ProjectValue,
  type TrackerResult,
  trackerError,
} from "./types.ts";

type Deps = { exec: Exec; cwd: string; repo: string; projectId: string };
const Id = Type.String({ pattern: "^[A-Za-z0-9_+/=-]{1,256}$" });
const PageInfo = Type.Object({
  hasNextPage: Type.Boolean(),
  endCursor: Type.Union([Type.String(), Type.Null()]),
});
const Issue = Type.Object({
  __typename: Type.Literal("Issue"),
  id: Id,
  number: Type.Integer({ minimum: 1 }),
  title: Type.String(),
  url: Type.String(),
  state: Type.Union([Type.Literal("OPEN"), Type.Literal("CLOSED")]),
  repository: Type.Object({ nameWithOwner: Type.String() }),
});
const Item = Type.Object({
  __typename: Type.Literal("ProjectV2Item"),
  id: Id,
  isArchived: Type.Boolean(),
  content: Type.Union([
    Issue,
    Type.Object({
      __typename: Type.Union([Type.Literal("PullRequest"), Type.Literal("DraftIssue")]),
    }),
    Type.Null(),
  ]),
});
const Items = Type.Object({
  __typename: Type.Literal("ProjectV2"),
  id: Id,
  items: Type.Object({ nodes: Type.Array(Item), pageInfo: PageInfo }),
});
const RawField = Type.Object({ id: Id });
const Single = Type.Object({
  __typename: Type.Literal("ProjectV2ItemFieldSingleSelectValue"),
  field: RawField,
  optionId: Type.Union([Id, Type.Null()]),
  name: Type.Union([Type.String(), Type.Null()]),
});
const Text = Type.Object({
  __typename: Type.Literal("ProjectV2ItemFieldTextValue"),
  field: RawField,
  text: Type.String(),
});
const NumberValue = Type.Object({
  __typename: Type.Literal("ProjectV2ItemFieldNumberValue"),
  field: RawField,
  number: Type.Number(),
});
const DateValue = Type.Object({
  __typename: Type.Literal("ProjectV2ItemFieldDateValue"),
  field: RawField,
  date: Type.String(),
});
const Unsupported = Type.Object({
  __typename: Type.String({
    pattern:
      "^ProjectV2ItemField(?!SingleSelectValue$|TextValue$|NumberValue$|DateValue$)[A-Za-z]+Value$",
  }),
  field: RawField,
});
const RawValue = Type.Union([Single, Text, NumberValue, DateValue, Unsupported]);
const Fields = Type.Object({
  __typename: Type.Literal("ProjectV2Item"),
  id: Id,
  fieldValues: Type.Object({ nodes: Type.Array(RawValue), pageInfo: PageInfo }),
});
const GraphqlErrors = Type.Object({
  errors: Type.Array(Type.Object({ message: Type.String() }), { minItems: 1 }),
});
const Envelope = Type.Object({
  data: Type.Object({ node: Type.Unknown() }),
  errors: Type.Optional(Type.Array(Type.Object({ message: Type.String() }))),
});
const ITEM_QUERY = `query($projectId:ID!,$cursor:String) {
  node(id:$projectId) { __typename ... on ProjectV2 { id
    items(first:100,after:$cursor,archivedStates:[ARCHIVED,NOT_ARCHIVED]) { nodes { __typename id isArchived content {
      __typename ... on Issue { id number title url state repository { nameWithOwner } }
    } } pageInfo { hasNextPage endCursor } }
  } }
}`;
const FIELD_QUERY = `query($itemId:ID!,$cursor:String) {
  node(id:$itemId) { __typename ... on ProjectV2Item { id
    fieldValues(first:100,after:$cursor) { nodes { __typename
      ... on ProjectV2ItemFieldValueCommon { field { ... on ProjectV2FieldCommon { id } } }
      ... on ProjectV2ItemFieldSingleSelectValue { optionId name }
      ... on ProjectV2ItemFieldTextValue { text }
      ... on ProjectV2ItemFieldNumberValue { number }
      ... on ProjectV2ItemFieldDateValue { date }
    } pageInfo { hasNextPage endCursor } }
  } }
}`;

async function readNode<T extends TSchema>(
  deps: Deps,
  query: string,
  variable: string,
  id: string,
  schema: T,
  cursor?: string,
): Promise<TrackerResult<Static<T>>> {
  try {
    const output = await deps.exec(
      "gh",
      [
        "api",
        "graphql",
        "-f",
        `query=${query}`,
        "-f",
        `${variable}=${id}`,
        ...(cursor === undefined ? [] : ["-f", `cursor=${cursor}`]),
      ],
      { cwd: deps.cwd, timeout: 30_000 },
    );
    if (output.code !== 0) return trackerError(output.stderr.trim() || `gh exited ${output.code}`);
    const parsed: unknown = JSON.parse(output.stdout);
    if (Value.Check(GraphqlErrors, parsed))
      return trackerError(parsed.errors.map((e) => e.message).join("; "));
    if (!Value.Check(Envelope, parsed))
      return trackerError("incomplete or malformed GraphQL response");
    if ((parsed.errors?.length ?? 0) > 0)
      return trackerError(parsed.errors?.map((e) => e.message).join("; ") ?? "GraphQL errors");
    if (!Value.Check(schema, parsed.data.node))
      return trackerError("incomplete or malformed node response");
    return ok(parsed.data.node);
  } catch (error) {
    return trackerError(error instanceof Error ? error.message : String(error));
  }
}

function observedValue(raw: Static<typeof RawValue>): ProjectValue {
  const fieldId = raw.field.id;
  if (Value.Check(Single, raw))
    return { fieldId, type: "single-select", optionId: raw.optionId, name: raw.name };
  if (Value.Check(Text, raw)) return { fieldId, type: "text", value: raw.text };
  if (Value.Check(NumberValue, raw)) return { fieldId, type: "number", value: raw.number };
  if (Value.Check(DateValue, raw)) return { fieldId, type: "date", value: raw.date };
  return { fieldId, type: "unsupported", typename: raw.__typename };
}

function nextCursor(
  info: Static<typeof PageInfo>,
  seen: Set<string>,
): TrackerResult<string | undefined> {
  if (!info.hasNextPage) return ok(undefined);
  const next = info.endCursor;
  if (next === null || next === "" || seen.has(next))
    return trackerError("incomplete pagination: missing or repeated cursor");
  seen.add(next);
  return ok(next);
}

async function readItems(deps: Deps): Promise<TrackerResult<Static<typeof Item>[]>> {
  const items: Static<typeof Item>[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const node = await readNode(deps, ITEM_QUERY, "projectId", deps.projectId, Items, cursor);
    if (!node.ok) return node;
    if (node.value.id !== deps.projectId) return trackerError("Project node identity mismatch");
    items.push(...node.value.items.nodes);
    if (new Set(items.map((i) => i.id)).size !== items.length)
      return trackerError("duplicate Project item identity");
    const next = nextCursor(node.value.items.pageInfo, seen);
    if (!next.ok) return next;
    if (next.value === undefined) return ok(items);
    cursor = next.value;
  }
  return trackerError("incomplete items pagination: 100-page limit reached");
}

async function readValues(deps: Deps, itemId: string): Promise<TrackerResult<ProjectValue[]>> {
  const values: ProjectValue[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const node = await readNode(deps, FIELD_QUERY, "itemId", itemId, Fields, cursor);
    if (!node.ok) return node;
    if (node.value.id !== itemId) return trackerError("Project item identity mismatch");
    values.push(...node.value.fieldValues.nodes.map(observedValue));
    if (new Set(values.map((v) => v.fieldId)).size !== values.length)
      return trackerError("duplicate Project field identity");
    const next = nextCursor(node.value.fieldValues.pageInfo, seen);
    if (!next.ok) return next;
    if (next.value === undefined) return ok(values);
    cursor = next.value;
  }
  return trackerError("incomplete field-value pagination: 100-page limit reached");
}

function validateOption(
  fields: readonly ProjectField[],
  filter: ProjectItemFilter,
): TrackerResult<void> {
  if (filter.fieldId === undefined) return ok(undefined);
  const field = fields.find((f) => f.id === filter.fieldId);
  if (field?.dataType !== "SINGLE_SELECT" || field.options === undefined)
    return trackerError("explicit option filtering requires a single-select field");
  return field.options.some((o) => o.id === filter.optionId)
    ? ok(undefined)
    : trackerError(`option ${filter.optionId} does not belong to field ${filter.fieldId}`);
}

function validateValues(
  values: readonly ProjectValue[],
  fields: readonly ProjectField[],
): TrackerResult<void> {
  for (const value of values) {
    const field = fields.find((f) => f.id === value.fieldId);
    if (field === undefined)
      return trackerError(`field ${value.fieldId} is absent from inspected Project metadata`);
    if (value.type === "unsupported") continue;
    const expected = value.type === "single-select" ? "SINGLE_SELECT" : value.type.toUpperCase();
    const titleText = value.type === "text" && field.dataType === "TITLE";
    if (field.dataType !== expected && !titleText)
      return trackerError(`field ${field.id} type changed from inspected metadata`);
    if (
      value.type === "single-select" &&
      value.optionId !== null &&
      !field.options?.some((o) => o.id === value.optionId)
    )
      return trackerError(`option ${value.optionId} is absent from inspected field ${field.id}`);
  }
  return ok(undefined);
}

function itemDiagnostics(item: Static<typeof Item>, repo: string): ProjectDiagnostic[] {
  const add = (kind: ProjectDiagnostic["kind"], message: string): ProjectDiagnostic => ({
    itemId: item.id,
    kind,
    message,
  });
  const diagnostics: ProjectDiagnostic[] = item.isArchived
    ? [add("archived", "Archived item: observed only; no unarchive or mutation is supported.")]
    : [];
  const content = item.content;
  if (content === null)
    diagnostics.push(
      add("redacted", "Content is redacted or inaccessible; eligibility is unknown."),
    );
  else if (content.__typename === "PullRequest")
    diagnostics.push(add("pull-request", "Pull request excluded from issue observations."));
  else if (content.__typename === "DraftIssue")
    diagnostics.push(add("draft", "Draft item is not a repository issue."));
  else if (
    content.__typename === "Issue" &&
    content.repository.nameWithOwner.toLowerCase() !== repo.toLowerCase()
  )
    diagnostics.push(
      add(
        "foreign-repository",
        `Issue belongs to ${content.repository.nameWithOwner}, not configured ${repo}.`,
      ),
    );
  return diagnostics;
}

async function observe(
  deps: Deps,
  filter: ProjectItemFilter,
): Promise<TrackerResult<ProjectItems>> {
  const schema = Type.Object({
    lifecycle: Type.Optional(Type.Union([Type.Literal("open"), Type.Literal("closed")])),
    fieldId: Type.Optional(Id),
    optionId: Type.Optional(Id),
  });
  if (!Value.Check(schema, filter))
    return trackerError("invalid lifecycle, field or option filter");
  if ((filter.fieldId === undefined) !== (filter.optionId === undefined))
    return trackerError("fieldId and optionId must be supplied together");
  const inspected = await inspectProject(deps, filter.fieldId);
  if (!inspected.ok) return inspected;
  const valid = validateOption(inspected.value.fields, filter);
  if (!valid.ok) return valid;
  const items = await readItems(deps);
  if (!items.ok) return items;
  const issues: ProjectIssueObservation[] = [];
  const diagnostics: ProjectDiagnostic[] = [];
  for (const item of items.value) {
    diagnostics.push(...itemDiagnostics(item, deps.repo));
    const content = item.content;
    if (content === null || content.__typename !== "Issue") continue;
    if (content.repository.nameWithOwner.toLowerCase() !== deps.repo.toLowerCase()) continue;
    const fields = await readValues(deps, item.id);
    if (!fields.ok) return fields;
    const values = fields.value;
    const consistent = validateValues(values, inspected.value.fields);
    if (!consistent.ok) return consistent;
    const lifecycle = content.state === "OPEN" ? "open" : "closed";
    if (filter.lifecycle !== undefined && lifecycle !== filter.lifecycle) continue;
    if (
      filter.fieldId !== undefined &&
      !values.some(
        (v) =>
          v.fieldId === filter.fieldId &&
          v.type === "single-select" &&
          v.optionId === filter.optionId,
      )
    )
      continue;
    issues.push({
      itemId: item.id,
      issueId: content.id,
      number: content.number,
      title: content.title,
      url: content.url,
      lifecycle,
      archived: item.isArchived,
      fields: values,
    });
  }
  return ok({
    projectId: deps.projectId,
    repository: deps.repo,
    order: "api-observation-not-priority",
    eligibility: diagnostics.some((d) => d.kind === "redacted") ? "unknown" : "unassessed",
    issues,
    diagnostics,
  });
}

/** Observations only: no priority, eligibility, reservation or workflow interpretation. */
export async function observeProjectItems(
  deps: Deps,
  filter: ProjectItemFilter,
): Promise<TrackerResult<ProjectItems>> {
  const result = await observe(deps, filter);
  return result.ok
    ? result
    : trackerError(
        `Project ${deps.projectId}: ${result.error.message}. Repair access/configuration and re-read; no writes attempted. Eligibility is unknown.`,
      );
}
