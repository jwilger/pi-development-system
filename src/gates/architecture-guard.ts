import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { Exec } from "../core/exec.ts";
import { resolveGit } from "../core/git-invocations.ts";
import { pushTargets } from "../core/push-command.ts";
import { err, ok, type Result } from "../core/result.ts";
import { architectureReviewGap } from "../review/architecture-evidence.ts";
import {
  inspectArchitecture,
  inspectAuthoritativeFastForward,
} from "../state/architecture-history.ts";
import { type DevsysConfig, loadConfig, POLICY_ONLY } from "../state/config.ts";
import type { SessionState } from "../state/session-state.ts";

type Refusal = { readonly block: true; readonly reason: string };
type Boundary = "commit" | "delivery" | "integration";
const refuse = (reason: string): Refusal => ({ block: true, reason });

function commandBoundary(command: string): Boundary | Refusal | undefined {
  // This literal CLI path cannot expose the immutable resulting commit before remote merge.
  // It is deliberately refused, not certified from the branch diff or the hosting UI's mode.
  if (/(?:^|[;&|]\s*)(?:command\s+)?gh\s+pr\s+merge\b/.test(command))
    return refuse(
      "architecture-resulting-history-unavailable: remote PR merge cannot establish its resulting commits before execution. Prepare and review separate immutable delivery units; a branch review does not approve a squash result.",
    );
  if (pushTargets(command).length > 0) {
    return /^git push [A-Za-z0-9][\w.-]* HEAD:[A-Za-z0-9][\w./-]*$/.test(command)
      ? "delivery"
      : refuse(
          "architecture-command-shape: use one explicit git push REMOTE HEAD:TRUNK for final delivery, or git push REMOTE HEAD:TOPIC for topic publication in pull-request mode. Remove extra options while keeping the intended destination. Compound calls, arbitrary sources, tags and implicit push settings cannot establish the inspected boundary.",
        );
  }
  if (/^git merge --ff-only [A-Za-z0-9][\w./-]*$/.test(command)) return "integration";
  const mutatesHistory = resolveGit(command).invocations.some((git) =>
    ["commit", "commit-tree", "merge", "cherry-pick", "revert", "am"].includes(git.sub),
  );
  if (!mutatesHistory) return undefined;
  // The supported version-check override changes hook input, never the inspected tree.
  // Its rationale is literal data, not authorization or a replacement for review.
  const commit =
    /^(?:JEV_OVERRIDE=('[^']+'|"[^"$`\\]+") )?git commit (?:-m|--message) (?:'[^']*'|"[^"$`\\]*")$/s.exec(
      command,
    );
  return commit !== null && (commit[1] === undefined || commit[1].slice(1, -1).trim() !== "")
    ? "commit"
    : refuse(
        "architecture-command-shape: stage separately, then use one plain git commit -m with a literal message, optionally prefixed by one quoted nonempty literal JEV_OVERRIDE rationale. The prefix is not owner approval or review. Compound calls, other assignments, alternate indices, implicit staging and uninspected commit makers cannot establish the resulting tree.",
      );
}

function isUnambiguousBranch(branch: string): boolean {
  return (
    /^[A-Za-z0-9][\w./-]*$/.test(branch) &&
    branch !== "HEAD" &&
    !/^(?:refs|heads|tags|remotes)\//.test(branch) &&
    !branch.includes("..") &&
    branch
      .split("/")
      .every(
        (part) =>
          part !== "" && !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock"),
      )
  );
}

/** Publication is transport, not inspection or semantic approval of a delivery result. */
function isTopicPublication(command: string, config: DevsysConfig): boolean {
  const match = /^git push ([A-Za-z0-9][\w.-]*) HEAD:([A-Za-z0-9][\w./-]*)$/.exec(command);
  const topic = match?.[2];
  if (
    config.delivery.mode !== "pull-request" ||
    match?.[1] !== config.delivery.remote ||
    topic === undefined ||
    topic === config.delivery.trunk ||
    !isUnambiguousBranch(topic) ||
    !isUnambiguousBranch(config.delivery.trunk)
  )
    return false;
  // Do not reinterpret a conflicting or ambiguous architecture authority as a topic.
  return (
    config.architecture === undefined ||
    config.architecture.trunkRef ===
      `refs/remotes/${config.delivery.remote}/${config.delivery.trunk}`
  );
}

/** Git resolves includes, config scopes and environment overrides; we never change them. */
async function publicationSetting(
  exec: Exec,
  cwd: string,
  key: string,
  type: "bool" | "bool-or-str",
): Promise<Result<string | undefined, Refusal>> {
  const indeterminate = () =>
    err(
      refuse(
        `architecture-publication-config: cannot establish effective ${key}; implicit additional publication must be ruled out before topic transport.`,
      ),
    );
  try {
    const setting = await exec("git", ["config", `--type=${type}`, "--get", key], {
      cwd,
      timeout: 5000,
    });
    // Git exits 1 without output for an absent key, not for an invalid boolean or read error.
    if (setting.code === 1 && setting.stdout === "" && setting.stderr === "") return ok(undefined);
    if (setting.code !== 0 || setting.stderr !== "") return indeterminate();
    const value = setting.stdout.trim();
    if (value === "" || (type === "bool" && value !== "false" && value !== "true"))
      return indeterminate();
    return ok(value);
  } catch {
    return indeterminate();
  }
}

/** Check the inherited environment at the same process boundary as Git, without exposing values. */
async function publicationSourceRefusal(exec: Exec, cwd: string): Promise<Refusal | undefined> {
  const refusal = refuse(
    "architecture-publication-config: cannot establish configuration-source equivalence with push. Inherited GIT_CONFIG redirects git config but not git push; an indeterminate environment read is also refused. No configuration or publication command was changed.",
  );
  try {
    const source = await exec(
      "node",
      ["-e", 'process.exit(Object.hasOwn(process.env, "GIT_CONFIG") ? 1 : 0)'],
      { cwd, timeout: 5000 },
    );
    if (source.code !== 0 || source.stdout !== "" || source.stderr !== "") return refusal;
  } catch {
    return refusal;
  }
  return;
}

/** A literal refspec does not disable implicit tags or cross-repository recursion. */
async function publicationConfigRefusal(exec: Exec, cwd: string): Promise<Refusal | undefined> {
  const source = await publicationSourceRefusal(exec, cwd);
  if (source !== undefined) return source;
  const tags = await publicationSetting(exec, cwd, "push.followTags", "bool");
  if (!tags.ok) return tags.error;
  if (tags.value === "true")
    return refuse(
      "architecture-publication-config: effective push.followTags=true may publish annotated tags beyond the literal topic refspec. This publication path requires it to be absent or false; no configuration or command was changed.",
    );
  const recursion = await publicationSetting(exec, cwd, "push.recurseSubmodules", "bool-or-str");
  if (!recursion.ok) return recursion.error;
  // An explicit non-publishing mode overrides submodule.recurse's on-demand default.
  if (recursion.value === "false" || recursion.value === "check") return;
  if (recursion.value === undefined) {
    const fallback = await publicationSetting(exec, cwd, "submodule.recurse", "bool");
    if (!fallback.ok) return fallback.error;
    if (fallback.value !== "true") return;
  }
  return refuse(
    "architecture-publication-config: submodule recursion may publish outside the literal topic repository, or its mode is unsupported. Effective push.recurseSubmodules must be disabled or check-only; absent configuration must not inherit submodule.recurse=true. No configuration or command was changed.",
  );
}

async function integrationRefusal(
  exec: Exec,
  cwd: string,
  command: string,
  config: DevsysConfig,
): Promise<Refusal | undefined> {
  const target = `${config.delivery.remote}/${config.delivery.trunk}`;
  const authority = `refs/remotes/${target}`;
  if (
    command !== `git merge --ff-only ${target}` ||
    (config.architecture !== undefined && config.architecture.trunkRef !== authority)
  )
    return refuse(
      "architecture-integration-target: only the configured authoritative remote trunk may be fast-forwarded; other history still requires inspection and review.",
    );
  const inspected = await inspectAuthoritativeFastForward(exec, cwd, authority);
  return inspected.ok ? undefined : refuse(`${inspected.error.kind}: ${inspected.error.message}`);
}

/** Pi action blocking, not an operating-system sandbox or a substitute for semantic review. */
export function registerArchitectureGuard(deps: {
  pi: ExtensionAPI;
  exec: Exec;
  state: SessionState;
}): void {
  deps.pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;
    const command = event.input.command.trim();
    const boundary = commandBoundary(command);
    if (boundary === undefined || typeof boundary !== "string") return boundary;
    const config = await loadConfig(ctx.cwd, POLICY_ONLY);
    if (!config.ok) return refuse(`architecture-config: ${config.error.message}`);
    if (boundary === "integration")
      return integrationRefusal(deps.exec, ctx.cwd, command, config.value);
    if (
      boundary === "delivery" &&
      command !== `git push ${config.value.delivery.remote} HEAD:${config.value.delivery.trunk}`
    ) {
      // Only this guard abstains: Git hard stops, push policy and message checks still run.
      // No inspection, review receipt or final-history binding is created by publication.
      if (isTopicPublication(command, config.value))
        return publicationConfigRefusal(deps.exec, ctx.cwd);
      return refuse(
        "architecture-push-target: only the configured remote/trunk delivery or a strict PR-mode HEAD topic publication is supported; other refs and conflicting authority require an explicitly supported inspection path.",
      );
    }
    const inspected = await inspectArchitecture(deps.exec, ctx.cwd, config.value.architecture, {
      kind: boundary,
    });
    if (!inspected.ok) return refuse(`${inspected.error.kind}: ${inspected.error.message}`);
    const violation = inspected.value.violations[0];
    if (violation !== undefined) return refuse(`${violation.kind}: ${violation.message}`);
    const required = Math.max(
      config.value.review.requiredCleanRounds,
      config.value.review.minRounds,
    );
    const reviewed =
      deps.state
        .get()
        .reviews?.some(
          (review) =>
            architectureReviewGap(
              { ...review, required: Math.max(required, review.required) },
              inspected.value.binding,
            ) === undefined,
        ) ?? false;
    if (!reviewed)
      return refuse(
        `architecture-semantic-review-required: independent review of this exact ${boundary === "commit" ? "staged tree" : "delivery result"} and complete pending history is missing, stale or insufficient. Start devsys_review_start with architectureBoundary ${boundary}, dispatch its fresh reviewer and record the result before retrying. File presence or a paired text edit does not establish substantive compliance.`,
      );
    return;
  });
}
