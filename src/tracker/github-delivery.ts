import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import type { Exec } from "../core/exec.ts";
import { redactSecrets } from "../core/redact.ts";
import { ok } from "../core/result.ts";
import {
  assessDelivery,
  type CheckObservation,
  type DeliveryAssessment,
  type PullRequestObservation,
  type PullRequestRef,
} from "./delivery-assessment.ts";
import { type DeliveryRequest, type TrackerResult, trackerError } from "./types.ts";

type Deps = { exec: Exec; cwd: string };
const Name = Type.String({ pattern: "\\S" });
const Ref = Type.Object({
  repository: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9-]*/(?!\\.{1,2}$)[A-Za-z0-9_.-]+$" }),
  number: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
});
const Request = Type.Object(
  {
    refs: Type.Array(Ref, { minItems: 1 }),
    conditions: Type.Optional(
      Type.Object(
        {
          requireMerge: Type.Optional(Type.Boolean()),
          targetBase: Type.Optional(Name),
          requiredChecks: Type.Optional(Type.Array(Name)),
          manualRequirements: Type.Optional(Type.Array(Name)),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
const Oid = Type.String({ pattern: "^[a-fA-F0-9]{40}$" });
const Id = Type.String({ pattern: "^[A-Za-z0-9_+/=-]{1,256}$" });
// New enum tokens are evidence of an unknown state, never evidence of success.
const Enum = Type.String({ pattern: "^[A-Z][A-Z_]*$" });
const Context = Type.Union([
  Type.Object({
    __typename: Type.Literal("CheckRun"),
    id: Id,
    name: Name,
    status: Enum,
    conclusion: Type.Union([Enum, Type.Null()]),
  }),
  Type.Object({ __typename: Type.Literal("StatusContext"), id: Id, context: Name, state: Enum }),
]);
const Contexts = Type.Object({
  nodes: Type.Array(Context, { maxItems: 100 }),
  pageInfo: Type.Object({
    hasNextPage: Type.Boolean(),
    endCursor: Type.Union([Name, Type.Null()]),
  }),
});
const PullRequest = Type.Object({
  number: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  url: Name,
  headRefOid: Oid,
  baseRefName: Name,
  state: Type.Union([Type.Literal("OPEN"), Type.Literal("CLOSED"), Type.Literal("MERGED")]),
  isDraft: Type.Boolean(),
  mergedAt: Type.Union([Name, Type.Null()]),
  mergeCommit: Type.Union([Type.Object({ oid: Oid }), Type.Null()]),
  commits: Type.Object({
    nodes: Type.Array(
      Type.Object({
        commit: Type.Object({
          oid: Oid,
          statusCheckRollup: Type.Union([Type.Object({ contexts: Contexts }), Type.Null()]),
        }),
      }),
      { minItems: 1, maxItems: 1 },
    ),
  }),
});
const Envelope = Type.Object({
  data: Type.Object({ repository: Type.Object({ nameWithOwner: Name, pullRequest: PullRequest }) }),
  errors: Type.Optional(Type.Array(Type.Object({ message: Type.String() }))),
});
const Errors = Type.Object({
  errors: Type.Array(Type.Object({ message: Type.String() }), { minItems: 1 }),
});
const QUERY = `query($owner:String!,$repo:String!,$number:Int!,$cursor:String) {
  repository(owner:$owner,name:$repo) { nameWithOwner
    pullRequest(number:$number) { number url headRefOid baseRefName state isDraft mergedAt mergeCommit { oid }
      commits(last:1) { nodes { commit { oid statusCheckRollup {
        contexts(first:100,after:$cursor) { nodes { __typename
          ... on CheckRun { id name status conclusion }
          ... on StatusContext { id context state }
        } pageInfo { hasNextPage endCursor } }
      } } } }
    }
  }
}`;

// Preserve API diagnostics without echoing credential-shaped tokens, URLs with credentials, or terminal controls.
export const deliveryDiagnostic = (message: string): string =>
  redactSecrets(message)
    .replace(/(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/g, "https://[redacted]@")
    .split("")
    .map((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? " " : character,
    )
    .join("");

const unavailable = (detail: string) =>
  trackerError(
    `Delivery evidence is unknown: ${deliveryDiagnostic(detail)}. No writes attempted; re-read the explicit PRs after checking access and current-head evidence.`,
  );

function stateOf(context: Static<typeof Context>): CheckObservation["state"] {
  if (context.__typename === "StatusContext") {
    if (context.state === "SUCCESS") return "success";
    if (["PENDING", "EXPECTED"].includes(context.state)) return "pending";
    if (["ERROR", "FAILURE"].includes(context.state)) return "failure";
    return "unknown";
  }
  if (["QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED", "PENDING"].includes(context.status))
    return "pending";
  if (context.status !== "COMPLETED") return "unknown";
  if (context.conclusion === "SUCCESS") return "success";
  if (["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(context.conclusion ?? ""))
    return "failure";
  return "unknown";
}

function validUrl(url: string, ref: PullRequestRef): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      parsed.pathname.toLowerCase() === `/${ref.repository}/pull/${ref.number}`.toLowerCase()
    );
  } catch {
    return false;
  }
}

async function readPage(
  deps: Deps,
  ref: PullRequestRef,
  cursor: string | undefined,
): Promise<TrackerResult<Static<typeof Envelope>["data"]["repository"]>> {
  const [owner = "", repo = ""] = ref.repository.split("/");
  try {
    const out = await deps.exec(
      "gh",
      [
        "api",
        "graphql",
        "-f",
        `query=${QUERY}`,
        "-f",
        `owner=${owner}`,
        "-f",
        `repo=${repo}`,
        "-F",
        `number=${ref.number}`,
        ...(cursor === undefined ? [] : ["-f", `cursor=${cursor}`]),
      ],
      { cwd: deps.cwd, timeout: 30_000 },
    );
    if (out.code !== 0) return unavailable(out.stderr.trim() || `gh exited ${out.code}`);
    const parsed: unknown = JSON.parse(out.stdout);
    if (Value.Check(Errors, parsed))
      return unavailable(parsed.errors.map((error) => error.message).join("; "));
    if (!Value.Check(Envelope, parsed))
      return unavailable("incomplete or malformed GraphQL PR response");
    return ok(parsed.data.repository);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

function currentPage(
  repository: Static<typeof Envelope>["data"]["repository"],
  ref: PullRequestRef,
): TrackerResult<{ observed: PullRequestObservation; contexts: Static<typeof Contexts> | null }> {
  const pr = repository.pullRequest;
  if (
    repository.nameWithOwner.toLowerCase() !== ref.repository.toLowerCase() ||
    pr.number !== ref.number ||
    !validUrl(pr.url, ref)
  )
    return unavailable("PR repository/number/URL identity mismatch");
  if (
    pr.mergedAt !== null &&
    !(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(pr.mergedAt) &&
      Number.isFinite(Date.parse(pr.mergedAt))
    )
  )
    return unavailable("malformed mergedAt timestamp");
  if (pr.state !== "MERGED" && (pr.mergedAt !== null || pr.mergeCommit !== null))
    return unavailable("inconsistent PR merge facts");
  const commit = pr.commits.nodes[0]?.commit;
  if (commit === undefined || commit.oid !== pr.headRefOid)
    return unavailable("last commit oid does not equal PR current head");
  const states = { OPEN: "open", CLOSED: "closed", MERGED: "merged" } as const;
  return ok({
    observed: {
      ref,
      url: pr.url,
      headOid: pr.headRefOid,
      base: pr.baseRefName,
      state: states[pr.state],
      draft: pr.isDraft,
      mergedAt: pr.mergedAt,
      mergeOid: pr.mergeCommit?.oid ?? null,
      checks: [],
    },
    contexts: commit.statusCheckRollup?.contexts ?? null,
  });
}

function collectChecks(
  contexts: Static<typeof Contexts>,
  headOid: string,
  ids: Set<string>,
  checks: CheckObservation[],
): TrackerResult<void> {
  for (const context of contexts.nodes) {
    if (ids.has(context.id)) return unavailable(`duplicate context identity ${context.id}`);
    ids.add(context.id);
    checks.push({
      name: context.__typename === "CheckRun" ? context.name : context.context,
      headOid,
      state: stateOf(context),
    });
  }
  return ok(undefined);
}

/** One bounded read of all contexts for an explicitly named PR's current head. Not an atomic snapshot. */
export async function observePullRequest(
  deps: Deps,
  ref: PullRequestRef,
): Promise<TrackerResult<PullRequestObservation>> {
  if (!Value.Check(Ref, ref))
    return unavailable("invalid explicit OWNER/REPO or safe positive PR number");
  const cursors = new Set<string>();
  const ids = new Set<string>();
  const checks: CheckObservation[] = [];
  let cursor: string | undefined;
  let first: PullRequestObservation | undefined;
  for (let page = 0; page < 100; page++) {
    const raw = await readPage(deps, ref, cursor);
    if (!raw.ok) return raw;
    const current = currentPage(raw.value, ref);
    if (!current.ok) return current;
    const { observed, contexts } = current.value;
    if (first !== undefined && JSON.stringify(first) !== JSON.stringify(observed))
      return unavailable("PR identity/head/base/merge facts changed across pages");
    first = observed;
    if (contexts === null) {
      if (cursor !== undefined) return unavailable("rollup disappeared during pagination");
      return ok({ ...first, checks });
    }
    const collected = collectChecks(contexts, observed.headOid, ids, checks);
    if (!collected.ok) return collected;
    const info = contexts.pageInfo;
    if (info.endCursor !== null && cursors.has(info.endCursor))
      return unavailable("repeated cursor in contexts pagination");
    if (!info.hasNextPage) return ok({ ...first, checks });
    if (contexts.nodes.length === 0 || info.endCursor === null)
      return unavailable("incomplete contexts or missing/repeated cursor");
    cursors.add(info.endCursor);
    cursor = info.endCursor;
  }
  return unavailable("contexts exceed the 100-page read bound");
}

export async function observeDelivery(
  deps: Deps,
  request: DeliveryRequest,
): Promise<TrackerResult<DeliveryAssessment>> {
  if (!Value.Check(Request, request))
    return unavailable(
      "delivery-check requires nonempty explicit refs and valid nonempty condition names/base/manual entries",
    );
  const identities = request.refs.map((ref) => `${ref.repository.toLowerCase()}#${ref.number}`);
  if (new Set(identities).size !== identities.length)
    return unavailable("duplicate explicit PR refs");
  const observations: PullRequestObservation[] = [];
  for (const ref of request.refs) {
    const observed = await observePullRequest(deps, ref);
    if (!observed.ok) return observed;
    observations.push(observed.value);
  }
  return ok(assessDelivery(observations, request.conditions ?? {}));
}
