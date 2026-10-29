import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import { configErrorText, loadConfig, POLICY_ONLY } from "../state/config.ts";
import { deliveryRoot, loadDeliveryManifest } from "../state/delivery-manifest.ts";
import type { DeliveryAssessment, PullRequestRef } from "./delivery-assessment.ts";
import { deliveryDiagnostic, observeDelivery } from "./github-delivery.ts";
import {
  type CompletionRequest,
  type CompletionResult,
  type ConfiguredDeliveryRequest,
  type TrackerResult,
  trackerError,
  type WorkItem,
} from "./types.ts";

type Deps = { exec: Exec; cwd: string; repo?: string };
const repositoryPattern = /^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;
const validId = (id: string): boolean =>
  /^[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id));

export async function completionConfig(deps: Deps) {
  const root = await deliveryRoot(deps.cwd);
  const config = await loadConfig(root, POLICY_ONLY);
  return config.ok
    ? ok({ root, config: config.value })
    : trackerError(configErrorText(config.error));
}

async function evidenceSnapshot(deps: Deps, request: ConfiguredDeliveryRequest) {
  if (!validId(request.id) || deps.repo === undefined || !repositoryPattern.test(deps.repo))
    return trackerError("Completion needs explicit tracker.repo and a positive safe issue number");
  const loaded = await completionConfig(deps);
  if (!loaded.ok) return loaded;
  const { root, config } = loaded.value;
  if (config.tracker.kind !== "github" || config.tracker.repo !== deps.repo)
    return trackerError(
      "Effective tracker configuration changed or does not match explicit repository; re-read configuration",
    );
  const policy = config.delivery.evidence;
  const manifest = await loadDeliveryManifest({
    exec: deps.exec,
    cwd: root,
    repository: deps.repo,
    number: Number(request.id),
    ...(policy?.manifest_dir === undefined ? {} : { manifestDir: policy.manifest_dir }),
    required: policy?.require_manifest === true,
  });
  if (!manifest.ok) return manifest;
  // Manifest loading crosses the async Git boundary; do not carry a policy read across it unchecked.
  const stable = await completionConfig(deps);
  if (!stable.ok) return stable;
  const fingerprint = JSON.stringify(config);
  if (stable.value.root !== root || JSON.stringify(stable.value.config) !== fingerprint)
    return trackerError(
      "Effective configuration changed during manifest loading; re-read before completion. No writes attempted.",
    );
  const declared = manifest.value?.manifest.pullRequests;
  if (declared !== undefined && request.refs !== undefined && !sameRefs(declared, request.refs))
    return trackerError(
      "Explicit refs conflict with the manifest's declared complete PR set; no writes attempted",
    );
  return ok({
    root,
    policy,
    manifest: manifest.value,
    refs: declared ?? request.refs,
    fingerprint,
  });
}
function sameRefs(left: readonly PullRequestRef[], right: readonly PullRequestRef[]): boolean {
  const keys = (refs: readonly PullRequestRef[]) =>
    refs.map((ref) => `${ref.repository.toLowerCase()}#${ref.number}`).sort();
  return JSON.stringify(keys(left)) === JSON.stringify(keys(right));
}

type Snapshot = Extract<Awaited<ReturnType<typeof evidenceSnapshot>>, { ok: true }>["value"];
async function assessSnapshot(
  deps: Deps,
  snapshot: Snapshot,
): Promise<TrackerResult<DeliveryAssessment>> {
  if (snapshot.policy === undefined)
    return trackerError(
      "Delivery evidence policy is unconfigured; explicit refs/conditions mode evaluates caller requests only",
    );
  const policy = snapshot.policy;
  if (snapshot.refs === undefined) {
    if (
      !(policy.require_manifest || policy.require_merged) &&
      policy.base === undefined &&
      policy.required_checks.length === 0
    )
      return ok({ status: "unassessed", observations: [], conditions: [] });
    return trackerError(
      "Delivery evidence requires a manifest or explicit PR refs; no writes attempted",
    );
  }
  const assessed = await observeDelivery(deps, {
    refs: snapshot.refs,
    conditions: {
      requireMerge: policy.require_merged,
      ...(policy.base === undefined ? {} : { targetBase: policy.base }),
      requiredChecks: policy.required_checks,
      manualRequirements: snapshot.manifest?.manifest.manualRequirements ?? [],
    },
  });
  if (!(assessed.ok && policy.require_manifest) || snapshot.manifest === null) return assessed;
  // Presence/references is an independent owner-selected condition, never an implicit merge gate.
  const conditions = [
    ...assessed.value.conditions,
    ...snapshot.refs.map((ref) => ({
      ref,
      name: "manifest",
      status: "satisfied" as const,
      message: "Required tracked manifest declares this PR.",
    })),
  ];
  return ok({
    ...assessed.value,
    conditions,
    status: assessed.value.status === "unassessed" ? "satisfied" : assessed.value.status,
  });
}

export async function configuredDeliveryCheck(
  deps: Deps,
  request: ConfiguredDeliveryRequest,
): Promise<TrackerResult<DeliveryAssessment>> {
  const snapshot = await evidenceSnapshot(deps, request);
  return snapshot.ok ? assessSnapshot(deps, snapshot.value) : snapshot;
}

const Issue = Type.Object({
  number: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  title: Type.String(),
  body: Type.Union([Type.String(), Type.Null()]),
  state: Type.Union([Type.Literal("OPEN"), Type.Literal("CLOSED")]),
  url: Type.String(),
  labels: Type.Array(Type.Object({ name: Type.String() })),
  comments: Type.Array(Type.Object({ body: Type.String() })),
});
async function issueRead(deps: Deps, id: string): Promise<TrackerResult<WorkItem>> {
  const out = await issueCommand(deps, [
    "view",
    id,
    "--json",
    "number,title,body,state,url,labels,comments",
  ]);
  if (!out.ok) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(out.value);
  } catch {
    return trackerError("Issue read returned malformed JSON");
  }
  if (
    !Value.Check(Issue, parsed) ||
    parsed.number !== Number(id) ||
    !issueIdentity(parsed, deps.repo ?? "")
  )
    return trackerError("Issue identity/lifecycle could not be verified");
  const labels = parsed.labels.map((label) => label.name);
  return ok({
    id,
    title: parsed.title,
    body: parsed.body ?? "",
    status: parsed.state === "CLOSED" ? "done" : openStatus(labels),
    labels: labels.filter((name) => name.toLowerCase() !== "in-progress"),
    comments: parsed.comments.map((comment) => comment.body),
  });
}
const openStatus = (labels: string[]) =>
  labels.some((name) => name.toLowerCase() === "in-progress")
    ? ("in-progress" as const)
    : ("open" as const);
function issueIdentity(issue: Static<typeof Issue>, repo: string): boolean {
  try {
    const url = new URL(issue.url);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.toLowerCase() === `/${repo}/issues/${issue.number}`.toLowerCase()
    );
  } catch {
    return false;
  }
}
async function issueCommand(deps: Deps, args: string[]): Promise<TrackerResult<string>> {
  try {
    const out = await deps.exec("gh", ["issue", ...args, "--repo", deps.repo ?? ""], {
      cwd: deps.cwd,
      timeout: 30_000,
    });
    return out.code === 0
      ? ok(out.stdout)
      : trackerError(
          deliveryDiagnostic(out.stderr.trim() || `gh issue ${args[0]} exit ${out.code}`),
        );
  } catch (cause) {
    return trackerError(deliveryDiagnostic(cause instanceof Error ? cause.message : String(cause)));
  }
}

/** One explicit issue close, no label/Project writes, retry, polling, or rollback. Remote races remain possible. */
export async function completeIssue(
  deps: Deps,
  id: string,
  request: CompletionRequest,
): Promise<TrackerResult<CompletionResult>> {
  if (request.scopeConfirmed !== true)
    return trackerError("complete requires scopeConfirmed:true for the whole issue scope");
  const snapshot = await evidenceSnapshot(deps, {
    id,
    ...(request.refs === undefined ? {} : { refs: request.refs }),
  });
  if (!snapshot.ok) return snapshot;
  const evidence: TrackerResult<CompletionResult["delivery"]> =
    snapshot.value.policy === undefined
      ? ok({ status: "unconfigured" })
      : await assessSnapshot(deps, snapshot.value);
  if (!evidence.ok) return evidence;
  if (evidence.value.status !== "unconfigured" && evidence.value.status !== "satisfied")
    return trackerError(
      `Delivery ${evidence.value.status}; configured evidence does not satisfy whole-issue completion. No writes attempted.`,
    );
  const before = await issueRead(deps, id);
  if (!before.ok) return before;
  // Last local check after *all* asynchronous observations (including the issue read).
  const fresh = await evidenceSnapshot(deps, {
    id,
    ...(request.refs === undefined ? {} : { refs: request.refs }),
  });
  if (!fresh.ok) return fresh;
  if (
    fresh.value.fingerprint !== snapshot.value.fingerprint ||
    fresh.value.manifest?.hash !== snapshot.value.manifest?.hash ||
    fresh.value.manifest?.path !== snapshot.value.manifest?.path
  )
    return trackerError(
      "Manifest or effective configuration changed during observation; re-read before completion. No writes attempted.",
    );
  const message =
    evidence.value.status === "unconfigured"
      ? "Delivery is unconfigured/not evaluated."
      : "Configured delivery evidence satisfied; unspecified owner policy is not assessed.";
  if (before.value.status === "done")
    return ok({
      kind: "confirmed",
      message: `Already closed; verified no-op. ${message}`,
      issue: before.value,
      delivery: evidence.value,
    });
  const closed = await issueCommand(deps, ["close", id]);
  if (!closed.ok)
    return ok({
      kind: "uncertain",
      message: `Close dispatched but outcome is uncertain: ${closed.error.message}. Re-read issue and evidence before any retry; no rollback attempted.`,
      issue: null,
      delivery: evidence.value,
    });
  const after = await issueRead(deps, id);
  if (!after.ok || after.value.status !== "done")
    return ok({
      kind: "uncertain",
      message: `Close dispatched but closure could not be verified: ${after.ok ? "issue remains open" : after.error.message}. Re-read issue and evidence; no retry or rollback attempted.`,
      issue: after.ok ? after.value : null,
      delivery: evidence.value,
    });
  return ok({
    kind: "confirmed",
    message: `Verified issue closure. ${message}`,
    issue: after.value,
    delivery: evidence.value,
  });
}
