import { lstat } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import {
  type ArchitectureSnapshot,
  type ArchitectureViolation,
  checkArchitectureChange,
  checkArchitectureDelivery,
} from "../core/architecture-history.ts";
import {
  type ArchitectureBinding,
  type ArchitectureUnit,
  bindArchitectureReview,
} from "../core/architecture-review.ts";
import type { Exec } from "../core/exec.ts";
import { err, ok, type Result } from "../core/result.ts";
import { type ArchitecturePolicyConfig, parseConfig } from "./config.ts";

export type ArchitectureInspectionRequest =
  | { readonly kind: "commit" }
  | { readonly kind: "delivery"; readonly resulting?: readonly string[] };

export type ArchitectureReadError = {
  readonly kind:
    | "architecture-adoption-required"
    | "architecture-policy-conflict"
    | "architecture-history-unavailable"
    | "architecture-history-shape"
    | "architecture-unsafe-path"
    | "architecture-unsupported-format";
  readonly message: string;
};

export interface ArchitectureInspection {
  readonly binding: ArchitectureBinding;
  readonly authority: string;
  readonly head: string;
  readonly tree: string;
  readonly resulting: readonly string[];
  readonly pending: readonly string[];
  readonly violations: readonly ArchitectureViolation[];
}

type Read<T> = Result<T, ArchitectureReadError>;
type Git = (args: string[]) => Promise<Read<string>>;
const unavailable = (message: string): Read<never> =>
  err({ kind: "architecture-history-unavailable", message });
const objectId = (raw: string): Read<string> => {
  const id = raw.trim();
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id)
    ? ok(id)
    : unavailable("Git did not return a full object identity.");
};
const isDecision = (path: string): boolean =>
  path.startsWith("docs/adr/") && path !== "docs/adr/0000-template.md";
const safePath = (path: string): boolean =>
  !(
    path.includes("\\") ||
    [...path].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  );

async function blobContents(
  git: Git,
  hash: string,
  blobs: Map<string, string>,
): Promise<Read<string>> {
  const cached = blobs.get(hash);
  if (cached !== undefined) return ok(cached);
  const size = await git(["cat-file", "-s", hash]);
  if (!size.ok) return size;
  if (!/^\d+\s*$/.test(size.value) || Number(size.value) > 1_000_000)
    return err({
      kind: "architecture-unsupported-format",
      message:
        "A policy blob exceeds supported inspection bounds; do not rewrite it automatically.",
    });
  const read = await git(["cat-file", "blob", hash]);
  if (!read.ok) return read;
  if (read.value.includes("\0") || read.value.includes("\uFFFD"))
    return err({
      kind: "architecture-unsupported-format",
      message:
        "Policy records require losslessly readable UTF-8 text; preserve unsupported bytes and ask the owner.",
    });
  blobs.set(hash, read.value);
  return read;
}

async function verifyRecordedPolicy(
  git: Git,
  revisions: readonly string[],
  policy: ArchitecturePolicyConfig,
  blobs: Map<string, string>,
): Promise<Read<undefined>> {
  for (const revision of new Set(revisions)) {
    const listed = await git(["ls-tree", "-z", revision, "--", ".development-system.toml"]);
    if (!listed.ok) return listed;
    if (listed.value === "") continue;
    const hash = listed.value.match(
      /^100(?:644|755) blob ([a-f0-9]+)\t\.development-system\.toml\0$/,
    )?.[1];
    if (hash === undefined)
      return err({
        kind: "architecture-unsafe-path",
        message:
          "Recorded project policy must be a regular Git blob; preserve unsupported paths and ask the owner.",
      });
    const content = await blobContents(git, hash, blobs);
    if (!content.ok) return content;
    const parsed = parseConfig(content.value);
    if (!parsed.ok)
      return err({
        kind: "architecture-policy-conflict",
        message:
          "Recorded project policy cannot be safely interpreted; preserve it and ask the owner rather than replacing its adoption boundary.",
      });
    const recorded = parsed.value.architecture;
    if (
      recorded !== undefined &&
      (recorded.trunkRef !== policy.trunkRef || recorded.adoptedAt !== policy.adoptedAt)
    ) {
      return err({
        kind: "architecture-policy-conflict",
        message:
          "Inspection inputs conflict with a recorded authoritative trunk or adoption boundary; do not re-grandfather history by changing policy.",
      });
    }
  }
  return ok(undefined);
}

async function snapshot(
  git: Git,
  revision: string,
  blobs: Map<string, string>,
): Promise<Read<ArchitectureSnapshot>> {
  const listed = await git([
    "ls-tree",
    "-rz",
    "--full-tree",
    revision,
    "--",
    "ARCHITECTURE.md",
    "docs/adr",
  ]);
  if (!listed.ok) return listed;
  const decisions = new Map<string, string>();
  let architecture: string | undefined;
  for (const record of listed.value.split("\0").filter(Boolean)) {
    const entry = record.match(/^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/);
    const mode = entry?.[1],
      type = entry?.[2],
      hash = entry?.[3],
      path = entry?.[4];
    if (
      path === undefined ||
      hash === undefined ||
      !safePath(path) ||
      type !== "blob" ||
      (mode !== "100644" && mode !== "100755")
    ) {
      return err({
        kind: "architecture-unsafe-path",
        message:
          "Architecture and decision paths must be regular, safely represented Git blobs; preserve unsupported history and ask the owner.",
      });
    }
    if (path !== "ARCHITECTURE.md" && !isDecision(path)) continue;
    const content = await blobContents(git, hash, blobs);
    if (!content.ok) return content;
    if (path === "ARCHITECTURE.md") architecture = content.value;
    else decisions.set(path, content.value);
  }
  return ok({ architecture, decisions });
}

async function rejectGrafts(git: Git, cwd: string): Promise<Read<undefined>> {
  if (process.env.GIT_GRAFT_FILE !== undefined)
    return unavailable("Local history graft overrides cannot establish authoritative ancestry.");
  const path = await git(["rev-parse", "--git-path", "info/grafts"]);
  if (!path.ok) return path;
  try {
    await lstat(resolvePath(cwd, path.value.trim()));
    return unavailable(
      "Local history graft metadata must not redefine authoritative ancestry; preserve it and ask the owner.",
    );
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return ok(undefined);
    return unavailable("Could not establish the absence of local history graft metadata.");
  }
}

async function resolveHistory(
  git: Git,
  policy: ArchitecturePolicyConfig,
): Promise<Read<{ authority: string; head: string }>> {
  const resolve = async (revision: string): Promise<Read<string>> => {
    const found = await git(["rev-parse", "--verify", "--end-of-options", revision]);
    return found.ok ? objectId(found.value) : found;
  };
  const shallow = await git(["rev-parse", "--is-shallow-repository"]);
  if (!shallow.ok) return shallow;
  if (shallow.value.trim() !== "false")
    return unavailable(
      "Complete authoritative history is required; a shallow repository cannot establish immutable identities.",
    );
  const authority = await resolve(`${policy.trunkRef}^{commit}`);
  const adopted = await resolve(`${policy.adoptedAt}^{commit}`);
  const head = await resolve("HEAD^{commit}");
  if (!authority.ok) return authority;
  if (!adopted.ok) return adopted;
  if (!head.ok) return head;
  if (adopted.value !== policy.adoptedAt)
    return unavailable("The adoption boundary must identify the commit itself.");
  for (const relation of [
    { ancestor: adopted.value, descendant: authority.value },
    { ancestor: authority.value, descendant: head.value },
  ]) {
    const related = await git([
      "merge-base",
      "--is-ancestor",
      relation.ancestor,
      relation.descendant,
    ]);
    if (!related.ok)
      return unavailable(
        "The adoption boundary, authoritative trunk and HEAD must have established ancestry.",
      );
  }
  return ok({ authority: authority.value, head: head.value });
}

async function pendingCommits(git: Git, authority: string, head: string): Promise<Read<string[]>> {
  const listed = await git([
    "rev-list",
    "--reverse",
    "--topo-order",
    "--parents",
    `${authority}..${head}`,
  ]);
  if (!listed.ok) return listed;
  const pending: string[] = [];
  let parent = authority;
  for (const line of listed.value.trim().split("\n").filter(Boolean)) {
    const parts = line.split(" ");
    const id = objectId(parts[0] ?? "");
    if (!id.ok) return id;
    if (parts.length !== 2 || parts[1] !== parent)
      return err({
        kind: "architecture-history-shape",
        message:
          "This boundary supports complete linear pending history; do not skip or flatten an uninspected merge. Ask the owner to choose supported delivery units.",
      });
    pending.push(id.value);
    parent = id.value;
  }
  return ok(pending);
}

async function historicPaths(git: Git, authority: string): Promise<Read<Set<string>>> {
  const historical = await git([
    "log",
    "--no-show-signature",
    "--format=",
    "--name-only",
    "-z",
    authority,
    "--",
    "docs/adr",
  ]);
  if (!historical.ok) return historical;
  const historicalPaths = new Set<string>();
  for (const path of historical.value.split("\0").filter(Boolean)) {
    if (!(safePath(path) && path.startsWith("docs/adr/")))
      return err({
        kind: "architecture-unsafe-path",
        message:
          "Historical decision paths cannot be represented safely; preserve them and ask the owner.",
      });
    if (isDecision(path)) historicalPaths.add(path);
  }
  return ok(historicalPaths);
}

async function auditTrunk(
  git: Git,
  policy: ArchitecturePolicyConfig,
  authority: string,
  blobs: Map<string, string>,
): Promise<Read<readonly ArchitectureViolation[]>> {
  const commits = await pendingCommits(git, policy.adoptedAt, authority);
  if (!commits.ok) return commits;
  let before = await snapshot(git, policy.adoptedAt, blobs);
  if (!before.ok) return before;
  const historical = await historicPaths(git, policy.adoptedAt);
  if (!historical.ok) return historical;
  for (const revision of commits.value) {
    const after = await snapshot(git, revision, blobs);
    if (!after.ok) return after;
    const violations = checkArchitectureChange({
      before: before.value,
      after: after.value,
      mergedPaths: new Set(before.value.decisions.keys()),
      historicalPaths: historical.value,
    });
    if (violations.length > 0) return ok(violations);
    for (const path of after.value.decisions.keys()) historical.value.add(path);
    before = after;
  }
  return ok([]);
}

async function gitIdentity(git: Git, revision: string): Promise<Read<string>> {
  const found = await git(["rev-parse", "--verify", "--end-of-options", revision]);
  return found.ok ? objectId(found.value) : found;
}

type Units = {
  readonly source: readonly string[];
  readonly result: readonly string[];
  readonly tree: string;
};

async function deliveryUnits(
  git: Git,
  authority: string,
  head: string,
  pending: readonly string[],
  request: ArchitectureInspectionRequest,
): Promise<Read<Units>> {
  if (request.kind === "commit") {
    const staged = await git(["write-tree"]);
    if (!staged.ok) return staged;
    const tree = objectId(staged.value);
    return tree.ok
      ? ok({ source: [...pending, tree.value], result: [...pending, tree.value], tree: tree.value })
      : tree;
  }
  const tree = await gitIdentity(git, `${head}^{tree}`);
  if (!tree.ok) return tree;
  if (request.resulting === undefined)
    return ok({ source: pending, result: pending, tree: tree.value });
  if (pending.length > 0 && request.resulting.length === 0)
    return err({
      kind: "architecture-history-shape",
      message: "Resulting inputs cannot omit pending commits.",
    });
  const result: string[] = [];
  for (const revision of request.resulting) {
    const found = await gitIdentity(git, `${revision}^{commit}`);
    if (!found.ok) return found;
    result.push(found.value);
  }
  const tip = result.at(-1) ?? authority;
  const complete = await pendingCommits(git, authority, tip);
  if (!complete.ok) return complete;
  if (
    complete.value.length !== result.length ||
    complete.value.some((id, index) => id !== result[index])
  )
    return err({
      kind: "architecture-history-shape",
      message:
        "Resulting inputs must cover their entire ordered parent chain from authoritative trunk.",
    });
  const resultTree = await gitIdentity(git, `${tip}^{tree}`);
  if (!resultTree.ok) return resultTree;
  if (resultTree.value !== tree.value)
    return err({
      kind: "architecture-history-shape",
      message:
        "Resulting delivery must preserve the entire pending source tree, not only selected policy files.",
    });
  return ok({ source: pending, result, tree: tree.value });
}

async function readSnapshots(
  git: Git,
  revisions: readonly string[],
  blobs: Map<string, string>,
): Promise<Read<ArchitectureSnapshot[]>> {
  const snapshots: ArchitectureSnapshot[] = [];
  for (const revision of revisions) {
    const read = await snapshot(git, revision, blobs);
    if (!read.ok) return read;
    snapshots.push(read.value);
  }
  return ok(snapshots);
}

async function unchangedInputs(
  git: Git,
  policy: ArchitecturePolicyConfig,
  expected: { readonly authority: string; readonly head: string },
  index: string | undefined,
): Promise<Read<undefined>> {
  const current = await resolveHistory(git, policy);
  if (!current.ok) return current;
  if (current.value.authority !== expected.authority || current.value.head !== expected.head)
    return unavailable(
      "Authoritative trunk or HEAD moved during inspection; retry the complete review.",
    );
  if (index !== undefined) {
    const tree = await git(["write-tree"]);
    if (!tree.ok) return tree;
    if (tree.value !== index)
      return unavailable("The staged index moved during inspection; retry the complete review.");
  }
  return ok(undefined);
}

/** Integrate existing authoritative commits only; this never admits a newly authored result. */
export async function inspectAuthoritativeFastForward(
  exec: Exec,
  cwd: string,
  trunkRef: string,
): Promise<Read<undefined>> {
  const git: Git = async (args) => {
    try {
      const result = await exec("git", ["--no-replace-objects", ...args], { cwd, timeout: 10_000 });
      return result.code === 0
        ? ok(result.stdout)
        : unavailable("Cannot establish safe authoritative fast-forward ancestry.");
    } catch {
      return unavailable("Cannot execute authoritative fast-forward inspection.");
    }
  };
  const grafts = await rejectGrafts(git, cwd);
  if (!grafts.ok) return grafts;
  const replacements = await git(["for-each-ref", "--format=%(refname)", "refs/replace/"]);
  if (!replacements.ok) return replacements;
  if (replacements.value.trim() !== "")
    return unavailable("Replacement refs must not redefine integration ancestry.");
  const operand = trunkRef.replace(/^refs\/remotes\//, "");
  const resolvedOperand = await git([
    "rev-parse",
    "--symbolic-full-name",
    "--verify",
    "--end-of-options",
    operand,
  ]);
  if (!resolvedOperand.ok) return resolvedOperand;
  if (resolvedOperand.value.trim() !== trunkRef)
    return unavailable(
      "The merge operand is ambiguous or does not resolve to the authoritative remote-tracking ref.",
    );
  const head = await git(["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!head.ok) return head;
  const authority = await git([
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${trunkRef}^{commit}`,
  ]);
  if (!authority.ok) return authority;
  const headId = objectId(head.value);
  if (!headId.ok) return headId;
  const authorityId = objectId(authority.value);
  if (!authorityId.ok) return authorityId;
  const ancestor = await git(["merge-base", "--is-ancestor", headId.value, authorityId.value]);
  return ancestor.ok ? ok(undefined) : ancestor;
}

export async function inspectArchitecture(
  exec: Exec,
  cwd: string,
  policy: ArchitecturePolicyConfig | undefined,
  request: ArchitectureInspectionRequest,
): Promise<Result<ArchitectureInspection, ArchitectureReadError>> {
  if (policy === undefined)
    return err({
      kind: "architecture-adoption-required",
      message:
        "Inspect conflicts and obtain owner approval for prospective adoption with explicit authoritative trunk and boundary.",
    });
  const git: Git = async (args) => {
    try {
      const result = await exec("git", ["--no-replace-objects", ...args], { cwd, timeout: 10_000 });
      return result.code === 0
        ? ok(result.stdout)
        : unavailable(`Required Git history operation failed: ${args[0]}.`);
    } catch {
      return unavailable("Required Git history operation could not execute.");
    }
  };
  const grafts = await rejectGrafts(git, cwd);
  if (!grafts.ok) return grafts;
  const history = await resolveHistory(git, policy);
  if (!history.ok) return history;
  const { authority, head } = history.value;
  const initialIndex = request.kind === "commit" ? await git(["write-tree"]) : ok(undefined);
  if (!initialIndex.ok) return initialIndex;
  const pending = await pendingCommits(git, authority, head);
  if (!pending.ok) return pending;
  const historicalPaths = await historicPaths(git, authority);
  if (!historicalPaths.ok) return historicalPaths;
  const blobs = new Map<string, string>();
  const audit = await auditTrunk(git, policy, authority, blobs);
  if (!audit.ok) return audit;
  const trunk = await snapshot(git, authority, blobs);
  if (!trunk.ok) return trunk;
  const units = await deliveryUnits(git, authority, head, pending.value, request);
  if (!units.ok) return units;
  const recordedPolicy = await verifyRecordedPolicy(
    git,
    [authority, head, ...units.value.source, ...units.value.result],
    policy,
    blobs,
  );
  if (!recordedPolicy.ok) return recordedPolicy;
  const source = await readSnapshots(git, units.value.source, blobs);
  if (!source.ok) return source;
  const resulting = await readSnapshots(git, units.value.result, blobs);
  if (!resulting.ok) return resulting;
  const violations = checkArchitectureDelivery({
    trunk: trunk.value,
    pending: source.value,
    resulting: resulting.value,
    historicalPaths: historicalPaths.value,
  });
  const reviewUnits = (ids: readonly string[]) =>
    ids.map<ArchitectureUnit>((unitId, index) => ({
      kind: request.kind === "commit" && index === ids.length - 1 ? "staged-tree" : "commit",
      objectId: unitId,
    }));
  const binding = bindArchitectureReview({
    version: 1,
    boundary: request.kind,
    adoption: policy,
    authority,
    head,
    tree: units.value.tree,
    source: reviewUnits(units.value.source),
    resulting: reviewUnits(units.value.result),
  });
  if (!binding.ok)
    return err({
      kind: "architecture-history-shape",
      message: `Cannot bind inspected architecture review inputs: ${binding.error.kind}.`,
    });
  const unchanged = await unchangedInputs(git, policy, history.value, initialIndex.value);
  if (!unchanged.ok) return unchanged;
  return ok({
    binding: binding.value,
    authority,
    head,
    tree: units.value.tree,
    resulting: units.value.result,
    pending: pending.value,
    violations: [...audit.value, ...violations],
  });
}
