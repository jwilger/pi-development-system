import { Type } from "typebox";
import { Value } from "typebox/value";
import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import { inspectProject } from "./github-project.ts";
import { observeProjectMembership } from "./github-project-membership.ts";
import {
  type ProjectInspection,
  type ProjectMembership,
  type ProjectSetRequest,
  type ProjectSetResult,
  type TrackerResult,
  trackerError,
} from "./types.ts";

type Deps = { exec: Exec; cwd: string; repo: string; projectId: string };
const Id = Type.String({ pattern: "^[A-Za-z0-9_+/=-]{1,256}$" });
const Request = Type.Object({
  fieldId: Id,
  optionId: Type.Optional(Id),
  clear: Type.Optional(Type.Literal(true)),
});
const Item = Type.Object({ id: Id, project: Type.Object({ id: Id }) });
const UPDATE = `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!) {
  updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}) {
    projectV2Item { id project { id } }
  }
}`;
const CLEAR = `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!) {
  clearProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId}) {
    projectV2Item { id project { id } }
  }
}`;
const RACES =
  "Preflight and readback cannot eliminate concurrent remote races; no exclusive claim is made.";

function validateField(
  project: ProjectInspection,
  request: ProjectSetRequest,
): TrackerResult<void> {
  const field = project.fields.find((candidate) => candidate.id === request.fieldId);
  if (field === undefined)
    return trackerError(`field ${request.fieldId} does not belong to Project ${project.id}`);
  if (field.dataType !== "SINGLE_SELECT" || field.options === undefined)
    return trackerError(`field ${request.fieldId} is not a SINGLE_SELECT field with known options`);
  if (
    request.optionId !== undefined &&
    !field.options.some((option) => option.id === request.optionId)
  )
    return trackerError(`option ${request.optionId} does not belong to field ${request.fieldId}`);
  return ok(undefined);
}

function currentValue(
  observation: ProjectMembership,
  fieldId: string,
): TrackerResult<string | null> {
  const membership = observation.membership;
  if (membership.kind !== "present")
    return trackerError(`Membership is ${membership.kind}; no set or clear attempted`);
  if (membership.item.archived)
    return trackerError("Archived membership; no unarchive, set or clear attempted");
  const value = membership.item.fields.find((candidate) => candidate.fieldId === fieldId);
  if (value === undefined) return ok(null);
  return value.type === "single-select"
    ? ok(value.optionId)
    : trackerError(`field ${fieldId} has an unknown or non-single-select value`);
}

function acknowledgement(
  text: string,
  deps: Deps,
  itemId: string,
  clear: boolean,
): TrackerResult<void> {
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "errors" in parsed &&
    (!Array.isArray(parsed.errors) || parsed.errors.length > 0)
  )
    return trackerError(`GraphQL mutation errors: ${JSON.stringify(parsed.errors)}`);
  const name = clear ? "clearProjectV2ItemFieldValue" : "updateProjectV2ItemFieldValue";
  const schema = Type.Object({
    data: Type.Object({ [name]: Type.Object({ projectV2Item: Item }) }),
  });
  if (!Value.Check(schema, parsed)) return trackerError("malformed set/clear acknowledgement");
  const item = parsed.data[name]?.projectV2Item;
  if (item?.id !== itemId || item.project.id !== deps.projectId)
    return trackerError("set/clear acknowledgement identity mismatch");
  return ok(undefined);
}

/** One explicit single-select write at most; never enroll, unarchive, retry or roll back. */
export async function setProjectField(
  deps: { exec: Exec; cwd: string; repo: string; projectId: string },
  id: string,
  request: ProjectSetRequest,
): Promise<TrackerResult<ProjectSetResult>> {
  let before: ProjectMembership | null = null;
  let after: ProjectMembership | null = null;
  const blocked = (message: string) =>
    ok<ProjectSetResult>({
      kind: "not-attempted",
      message: `${message}. No writes attempted. ${RACES}`,
      before,
      after,
    });
  if (!(deps.repo && deps.projectId))
    return blocked("project-set requires explicit tracker.repo and tracker.project_id");
  if (
    !Value.Check(Request, request) ||
    (request.optionId !== undefined) === (request.clear === true)
  )
    return blocked(
      "project-set requires fieldId and exactly one of a nonempty optionId or clear:true",
    );
  const project = await inspectProject(deps, request.fieldId);
  if (!project.ok) return blocked(project.error.message);
  const valid = validateField(project.value, request);
  if (!valid.ok) return blocked(valid.error.message);
  const observed = await observeProjectMembership(deps, id);
  if (!observed.ok) return blocked(observed.error.message);
  before = observed.value;
  const current = currentValue(before, request.fieldId);
  if (!current.ok) return blocked(current.error.message);
  const desired = request.optionId ?? null;
  if (current.value === desired)
    return ok({
      kind: "confirmed",
      message: `Verified same-value no-op; no write attempted. ${RACES}`,
      before,
      after: before,
    });
  // currentValue proved presence; keep this guard explicit at the write boundary.
  if (before.membership.kind !== "present") return blocked("Membership is not present");
  const itemId = before.membership.item.itemId;
  const uncertain = (message: string) =>
    ok<ProjectSetResult>({
      kind: "uncertain",
      message: `${message}. Effects are uncertain; re-read membership and metadata before any explicit retry. No automatic retry or rollback. ${RACES}`,
      before,
      after,
    });
  try {
    const output = await deps.exec(
      "gh",
      [
        "api",
        "graphql",
        "-f",
        `query=${request.clear === true ? CLEAR : UPDATE}`,
        "-f",
        `projectId=${deps.projectId}`,
        "-f",
        `itemId=${itemId}`,
        "-f",
        `fieldId=${request.fieldId}`,
        ...(request.optionId === undefined ? [] : ["-f", `optionId=${request.optionId}`]),
      ],
      { cwd: deps.cwd, timeout: 30_000 },
    );
    if (output.code !== 0) return uncertain(output.stderr.trim() || `gh exited ${output.code}`);
    const ack = acknowledgement(output.stdout, deps, itemId, request.clear === true);
    if (!ack.ok) return uncertain(ack.error.message);
    const verified = await observeProjectMembership(deps, id);
    if (!verified.ok) return uncertain(`Verification failed: ${verified.error.message}`);
    after = verified.value;
    const metadata = await inspectProject(deps, request.fieldId);
    if (!metadata.ok) return uncertain(`Verification metadata failed: ${metadata.error.message}`);
    const validAfter = validateField(metadata.value, request);
    if (!validAfter.ok)
      return uncertain(`Verification metadata failed: ${validAfter.error.message}`);
    const value = currentValue(after, request.fieldId);
    if (
      !value.ok ||
      value.value !== desired ||
      after.issue.issueId !== before.issue.issueId ||
      after.membership.kind !== "present" ||
      after.membership.item.itemId !== itemId
    )
      return uncertain(
        "Verification did not confirm the intended nonarchived item and field value",
      );
    return ok({
      kind: "confirmed",
      message: `Explicit ${request.clear === true ? "clear" : "set"} confirmed by fresh membership and metadata reads. ${RACES}`,
      before,
      after,
    });
  } catch (error) {
    return uncertain(error instanceof Error ? error.message : String(error));
  }
}
