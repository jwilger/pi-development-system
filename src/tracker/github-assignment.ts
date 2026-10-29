import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import { type Exec, timeoutAsFailure } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import {
  type AssignmentRequest,
  type AssignmentResult,
  type TrackerResult,
  trackerError,
} from "./types.ts";

const LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const Issue = Type.Object({
  id: Type.String({ minLength: 1 }),
  number: Type.Integer({ minimum: 1 }),
  url: Type.String(),
  repository: Type.Object({ nameWithOwner: Type.String() }),
  assignees: Type.Object({
    nodes: Type.Array(Type.Object({ login: Type.String() })),
    totalCount: Type.Integer({ minimum: 0 }),
    pageInfo: Type.Object({ hasNextPage: Type.Literal(false) }),
  }),
});
const Response = Type.Object({
  data: Type.Object({ repository: Type.Object({ issue: Issue }) }),
  errors: Type.Optional(Type.Array(Type.Unknown(), { maxItems: 0 })),
});
const QUERY = `query($owner:String!,$name:String!,$number:Int!) {
  repository(owner:$owner,name:$name) { issue(number:$number) {
    id number url repository { nameWithOwner }
    assignees(first:100) { nodes { login } totalCount pageInfo { hasNextPage } }
  } }
}`;
type Deps = { exec: Exec; cwd: string; repo: string };
type Observation = Static<typeof Issue>;
const names = (issue: Observation): string[] => issue.assignees.nodes.map((node) => node.login);
const normalized = (logins: readonly string[]): string[] =>
  logins.map((login) => login.toLowerCase());
const unique = (logins: readonly string[]): boolean =>
  new Set(normalized(logins)).size === logins.length;

async function read(deps: Deps, id: string): Promise<TrackerResult<Observation>> {
  const [owner = "", name = ""] = deps.repo.split("/");
  try {
    const output = timeoutAsFailure(
      await deps.exec(
        "gh",
        [
          "api",
          "graphql",
          "-f",
          `query=${QUERY}`,
          "-f",
          `owner=${owner}`,
          "-f",
          `name=${name}`,
          "-F",
          `number=${id}`,
        ],
        { cwd: deps.cwd, timeout: 30_000 },
      ),
    );
    if (output.code !== 0) return trackerError(output.stderr.trim() || `gh exited ${output.code}`);
    const parsed: unknown = JSON.parse(output.stdout);
    if (typeof parsed === "object" && parsed !== null && "errors" in parsed) {
      if (!Array.isArray(parsed.errors) || parsed.errors.length > 0)
        return trackerError(`GraphQL issue observation errors: ${JSON.stringify(parsed.errors)}`);
    }
    if (!Value.Check(Response, parsed))
      return trackerError("Malformed or incomplete issue/assignee response");
    const issue = parsed.data.repository.issue;
    const logins = names(issue);
    if (
      issue.number !== Number(id) ||
      issue.repository.nameWithOwner.toLowerCase() !== deps.repo.toLowerCase() ||
      issue.url.toLowerCase() !== `https://github.com/${deps.repo}/issues/${id}`.toLowerCase() ||
      issue.assignees.totalCount !== logins.length ||
      !logins.every((login) => LOGIN.test(login)) ||
      !unique(logins)
    )
      return trackerError("Issue identity or complete assignee observation mismatch");
    return ok(issue);
  } catch (error) {
    return trackerError(error instanceof Error ? error.message : String(error));
  }
}

const result = (
  kind: AssignmentResult["kind"],
  message: string,
  before: readonly string[] = [],
  after: readonly string[] | null = null,
): TrackerResult<AssignmentResult> =>
  ok({ kind, message, before, after, ownership: "not-exclusive" });

/** Assignment is a verified membership observation, never an atomic or exclusive claim. */
export async function assignIssue(
  deps: Deps,
  id: string,
  request: AssignmentRequest,
): Promise<TrackerResult<AssignmentResult>> {
  if (!(/^[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id))))
    return result("not-attempted", "assign requires a positive safe integer issue id");
  if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?\/[a-z\d_.-]+$/i.test(deps.repo))
    return result("not-attempted", "assign requires an explicit owner/repository");
  if (
    (request.operation !== "add" && request.operation !== "remove") ||
    !Array.isArray(request.assignees) ||
    request.assignees.length === 0 ||
    !request.assignees.every((login) => typeof login === "string" && LOGIN.test(login)) ||
    !unique(request.assignees)
  )
    return result(
      "not-attempted",
      "assign requires add/remove and nonempty unique explicit GitHub logins (no @me, switches or commas)",
    );
  const initial = await read(deps, id);
  if (!initial.ok)
    return result(
      "not-attempted",
      `Assignment preflight could not verify issue identity and complete assignees: ${initial.error.message}; nothing was written. Check repository access and Issues permissions, then re-read before an explicit retry.`,
    );
  const before = names(initial.value);
  const requested = normalized(request.assignees);
  const satisfied = (logins: readonly string[]): boolean => {
    const current = normalized(logins);
    return requested.every((login) => current.includes(login) === (request.operation === "add"));
  };
  if (satisfied(before))
    return result(
      "confirmed",
      "Assignment already satisfied; no edit dispatched. This is not an exclusive claim.",
      before,
      before,
    );
  const uncertain = (why: string, observedAssignees: readonly string[] | null = null) =>
    result(
      "uncertain",
      `${why}. Re-read the issue before retrying; do not automatically retry. Assignment is not atomic or an exclusive claim.`,
      before,
      observedAssignees,
    );
  try {
    const edited = timeoutAsFailure(
      await deps.exec(
        "gh",
        [
          "issue",
          "edit",
          id,
          ...request.assignees.flatMap((login) => [`--${request.operation}-assignee`, login]),
          "--repo",
          deps.repo,
        ],
        { cwd: deps.cwd, timeout: 30_000 },
      ),
    );
    if (edited.code !== 0)
      return uncertain(
        `Assignment edit failed or timed out (exit ${edited.code}): ${edited.stderr.trim() || "no diagnostic available"}`,
      );
    if (edited.stdout.trim() !== initial.value.url)
      return uncertain("Assignment edit returned an invalid acknowledgement");
  } catch (error) {
    return uncertain(
      `Assignment edit did not complete: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const observed = await read(deps, id);
  if (!observed.ok)
    return uncertain(`Assignment readback could not verify evidence: ${observed.error.message}`);
  if (observed.value.id !== initial.value.id)
    return uncertain("Assignment readback could not verify the same issue and complete assignees");
  const after = names(observed.value);
  const unrelated = normalized(before).filter((login) => !requested.includes(login));
  if (!(satisfied(after) && unrelated.every((login) => normalized(after).includes(login))))
    return uncertain(
      "Assignment readback did not confirm requested membership and preservation of unrelated assignees",
      after,
    );
  return result(
    "confirmed",
    "Assignment verified by fresh readback; not atomic and not an exclusive claim.",
    before,
    after,
  );
}
