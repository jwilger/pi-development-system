import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import { observeProjectItems } from "./github-project-items.ts";
import {
  type ProjectEnrollment,
  type ProjectMembership,
  type TrackerResult,
  trackerError,
} from "./types.ts";

type Deps = { exec: Exec; cwd: string; repo: string; projectId: string };
const Id = Type.String({ pattern: "^[A-Za-z0-9_+/=-]{1,256}$" });
const Issue = Type.Object({ id: Id, number: Type.Integer({ minimum: 1 }), url: Type.String() });
const Acknowledgement = Type.Object({
  data: Type.Object({
    addProjectV2ItemById: Type.Object({
      item: Type.Object({
        id: Id,
        project: Type.Object({ id: Id }),
        content: Type.Object({ __typename: Type.Literal("Issue"), id: Id }),
      }),
    }),
  }),
});
const MUTATION = `mutation($projectId:ID!,$contentId:ID!) {
  addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}) {
    item { id project { id } content { __typename ... on Issue { id } } }
  }
}`;
const why = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function resolveIssue(deps: Deps, id: string): Promise<TrackerResult<Static<typeof Issue>>> {
  if (!(deps.repo && deps.projectId))
    return trackerError("Project membership requires explicit tracker.repo and tracker.project_id");
  if (!(/^[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id))))
    return trackerError(`"${id}" is not a positive safe GitHub issue number`);
  try {
    const output = await deps.exec(
      "gh",
      ["issue", "view", id, "--repo", deps.repo, "--json", "id,number,url"],
      { cwd: deps.cwd, timeout: 30_000 },
    );
    if (output.code !== 0) return trackerError(output.stderr.trim() || `gh exited ${output.code}`);
    const parsed: unknown = JSON.parse(output.stdout);
    if (!Value.Check(Issue, parsed)) return trackerError("malformed issue identity");
    if (
      parsed.number !== Number(id) ||
      parsed.url.toLowerCase() !== `https://github.com/${deps.repo}/issues/${id}`.toLowerCase()
    )
      return trackerError("issue number or repository URL identity mismatch");
    return ok(parsed);
  } catch (error) {
    return trackerError(why(error));
  }
}

/** A fresh, complete observation of the named issue; never a write. */
export async function observeProjectMembership(
  deps: Deps,
  id: string,
): Promise<TrackerResult<ProjectMembership>> {
  const issue = await resolveIssue(deps, id);
  if (!issue.ok) return issue;
  const items = await observeProjectItems(deps, {});
  if (!items.ok) return items;
  const matches = items.value.issues.filter(
    (candidate) => candidate.issueId === issue.value.id || candidate.number === issue.value.number,
  );
  if (matches.length > 1) return trackerError("duplicate matching Project memberships");
  const item = matches[0];
  if (
    item !== undefined &&
    (item.issueId !== issue.value.id ||
      item.number !== issue.value.number ||
      item.url.toLowerCase() !== issue.value.url.toLowerCase())
  )
    return trackerError("Project membership issue identity mismatch");
  let membership: ProjectMembership["membership"] = { kind: "absent" };
  if (item !== undefined) membership = { kind: "present", item };
  else if (items.value.diagnostics.some((d) => d.kind === "redacted"))
    membership = { kind: "unknown", diagnostics: items.value.diagnostics };
  return ok({
    projectId: deps.projectId,
    repository: deps.repo,
    issue: { issueId: issue.value.id, number: issue.value.number, url: issue.value.url },
    membership,
  });
}

function acknowledgement(text: string, deps: Deps, issueId: string): TrackerResult<string> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed === "object" && parsed !== null && "errors" in parsed) {
    if (!Array.isArray(parsed.errors) || parsed.errors.length > 0)
      return trackerError(`GraphQL mutation errors: ${JSON.stringify(parsed.errors)}`);
  }
  if (!Value.Check(Acknowledgement, parsed)) return trackerError("malformed add acknowledgement");
  const item = parsed.data.addProjectV2ItemById.item;
  if (item.project.id !== deps.projectId || item.content.id !== issueId)
    return trackerError("add acknowledgement identity mismatch");
  return ok(item.id);
}

/** One explicit add at most. Once dispatched, any failure means uncertain remote effects. */
export async function enrollProjectIssue(
  deps: Deps,
  id: string,
): Promise<TrackerResult<ProjectEnrollment>> {
  const preflight = await observeProjectMembership(deps, id);
  const blocked = (message: string, observed: ProjectMembership | null) =>
    ok<ProjectEnrollment>({
      kind: "not-attempted",
      outcome: "blocked",
      message,
      observation: observed,
    });
  if (!preflight.ok) return blocked(preflight.error.message, null);
  const observation = preflight.value;
  const membership = observation.membership;
  if (membership.kind === "present") {
    if (membership.item.archived)
      return blocked("Archived membership; no unarchive or add attempted.", observation);
    return ok({
      kind: "not-attempted",
      outcome: "already-member",
      message: "Issue is already a nonarchived Project member; no write attempted.",
      observation: { ...observation, membership },
    });
  }
  if (membership.kind === "unknown")
    return blocked(
      "Membership is unknown because content is redacted; re-read before enrollment.",
      observation,
    );
  const uncertain = (message: string, latest: ProjectMembership | null = observation) =>
    ok<ProjectEnrollment>({
      kind: "uncertain",
      outcome: "unknown",
      message: `${message}. Effects are uncertain; re-read membership before any explicit retry. No automatic retry or rollback.`,
      observation: latest,
    });
  try {
    const output = await deps.exec(
      "gh",
      [
        "api",
        "graphql",
        "-f",
        `query=${MUTATION}`,
        "-f",
        `projectId=${deps.projectId}`,
        "-f",
        `contentId=${observation.issue.issueId}`,
      ],
      { cwd: deps.cwd, timeout: 30_000 },
    );
    if (output.code !== 0) return uncertain(output.stderr.trim() || `gh exited ${output.code}`);
    const ack = acknowledgement(output.stdout, deps, observation.issue.issueId);
    if (!ack.ok) return uncertain(ack.error.message);
    const verified = await observeProjectMembership(deps, id);
    if (!verified.ok) return uncertain(`Verification failed: ${verified.error.message}`);
    const latest = verified.value;
    const member = latest.membership;
    if (
      latest.issue.issueId !== observation.issue.issueId ||
      member.kind !== "present" ||
      member.item.archived ||
      member.item.itemId !== ack.value
    )
      return uncertain("Verification did not confirm the intended nonarchived membership", latest);
    return ok({
      kind: "confirmed",
      outcome: "enrolled",
      message: "Enrollment confirmed by a fresh nonarchived membership observation.",
      observation: { ...latest, membership: member },
    });
  } catch (error) {
    return uncertain(why(error));
  }
}
