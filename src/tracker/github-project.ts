import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import {
  type ProjectField,
  type ProjectInspection,
  type TrackerResult,
  trackerError,
} from "./types.ts";

const NodeId = Type.String({ pattern: "^[A-Za-z0-9_+/=-]{1,256}$" });
const Field = Type.Union([
  Type.Object({
    __typename: Type.Literal("ProjectV2SingleSelectField"),
    id: NodeId,
    name: Type.String(),
    dataType: Type.Literal("SINGLE_SELECT"),
    options: Type.Array(Type.Object({ id: NodeId, name: Type.String() })),
  }),
  Type.Object({
    __typename: Type.Union([
      Type.Literal("ProjectV2Field"),
      Type.Literal("ProjectV2IterationField"),
    ]),
    id: NodeId,
    name: Type.String(),
    dataType: Type.String(),
  }),
]);
const GraphqlErrors = Type.Object({
  errors: Type.Array(Type.Object({ message: Type.String() }), { minItems: 1 }),
});
const Page = Type.Object({
  data: Type.Object({
    node: Type.Object({
      __typename: Type.Literal("ProjectV2"),
      id: NodeId,
      owner: Type.Object({ login: Type.String({ minLength: 1 }) }),
      number: Type.Integer({ minimum: 1 }),
      title: Type.String(),
      url: Type.String(),
      fields: Type.Object({
        nodes: Type.Array(Field),
        pageInfo: Type.Object({
          hasNextPage: Type.Boolean(),
          endCursor: Type.Union([Type.String(), Type.Null()]),
        }),
      }),
    }),
  }),
});

const QUERY = `query($projectId:ID!,$cursor:String) {
  node(id:$projectId) {
    __typename
    ... on ProjectV2 {
      id number title url owner { ... on Organization { login } ... on User { login } }
      fields(first:100,after:$cursor) {
        nodes {
          __typename
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField { options { id name } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

function validateFieldIdentities(fields: readonly ProjectField[]): TrackerResult<void> {
  const ids = fields.map((field) => field.id);
  if (new Set(ids).size !== ids.length)
    return trackerError("duplicate Project field identity; re-read all pages");
  for (const field of fields) {
    const options = field.options?.map((option) => option.id) ?? [];
    if (new Set(options).size !== options.length)
      return trackerError(`duplicate option identity in field ${field.id}`);
  }
  return ok(undefined);
}

function parsePage(input: unknown): TrackerResult<Static<typeof Page>["data"]["node"]> {
  if (Value.Check(GraphqlErrors, input))
    return trackerError(input.errors.map((error) => error.message).join("; "));
  if (
    typeof input === "object" &&
    input !== null &&
    "errors" in input &&
    (!Array.isArray(input.errors) || input.errors.length > 0)
  )
    return trackerError("malformed GraphQL errors response");
  if (!Value.Check(Page, input))
    return trackerError("incomplete or malformed Project response; Project may be inaccessible");
  return ok(input.data.node);
}

/** Read-only GraphQL boundary; an absent field is never guessed or provisioned. */
export async function inspectProject(
  deps: { exec: Exec; cwd: string; projectId: string },
  fieldId?: string,
): Promise<TrackerResult<ProjectInspection>> {
  const failed = (why: string) =>
    trackerError(
      `Project ${deps.projectId}: ${why}. Repair configuration/access and re-read; no writes attempted.`,
    );
  if (!Value.Check(NodeId, deps.projectId)) return failed("invalid Project node id");
  try {
    const fields: ProjectField[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const output = await deps.exec(
        "gh",
        [
          "api",
          "graphql",
          "-f",
          `query=${QUERY}`,
          "-f",
          `projectId=${deps.projectId}`,
          ...(cursor === undefined ? [] : ["-f", `cursor=${cursor}`]),
        ],
        { cwd: deps.cwd, timeout: 30_000 },
      );
      if (output.code !== 0) return failed(output.stderr.trim() || `gh exited ${output.code}`);
      const parsed = parsePage(JSON.parse(output.stdout));
      if (!parsed.ok) return failed(parsed.error.message);
      const node = parsed.value;
      if (node.id !== deps.projectId) return failed(`node identity mismatch (${node.id})`);
      fields.push(
        ...node.fields.nodes.map((field) => ({
          id: field.id,
          name: field.name,
          dataType: field.dataType,
          ...("options" in field ? { options: field.options } : {}),
        })),
      );
      const identities = validateFieldIdentities(fields);
      if (!identities.ok) return failed(identities.error.message);
      if (!node.fields.pageInfo.hasNextPage) {
        if (fieldId !== undefined && !fields.some((field) => field.id === fieldId))
          return failed(`field ${fieldId} does not belong to this Project`);
        return ok({
          id: node.id,
          owner: node.owner.login,
          number: node.number,
          title: node.title,
          url: node.url,
          fields,
        });
      }
      const next = node.fields.pageInfo.endCursor;
      if (next === null || next === "" || cursors.has(next))
        return failed("incomplete fields pagination: missing or repeated cursor");
      cursors.add(next);
      cursor = next;
    }
    return failed("incomplete fields pagination: 100-page limit reached");
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
}
