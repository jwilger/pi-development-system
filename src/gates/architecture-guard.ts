import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { Exec } from "../core/exec.ts";
import { resolveGit } from "../core/git-invocations.ts";
import { pushTargets } from "../core/push-command.ts";
import { architectureReviewGap } from "../review/architecture-evidence.ts";
import { inspectArchitecture } from "../state/architecture-history.ts";
import { loadConfig, POLICY_ONLY } from "../state/config.ts";
import type { SessionState } from "../state/session-state.ts";

type Refusal = { readonly block: true; readonly reason: string };
type Boundary = "commit" | "delivery";
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
          "architecture-command-shape: use one explicit git push REMOTE HEAD:TRUNK. Compound calls, arbitrary sources, tags and implicit push settings cannot establish the complete delivered history.",
        );
  }
  const mutatesHistory = resolveGit(command).invocations.some((git) =>
    ["commit", "commit-tree", "merge", "cherry-pick", "revert", "am"].includes(git.sub),
  );
  if (!mutatesHistory) return undefined;
  return /^git commit (?:-m|--message) (?:'[^']*'|"[^"$`\\]*")$/s.test(command)
    ? "commit"
    : refuse(
        "architecture-command-shape: stage separately, then use one plain git commit -m with a literal message. Compound calls, alternate indices, implicit staging and uninspected commit makers cannot establish the resulting tree.",
      );
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
    if (
      boundary === "delivery" &&
      command !== `git push ${config.value.delivery.remote} HEAD:${config.value.delivery.trunk}`
    )
      return refuse(
        "architecture-push-target: only the configured remote and trunk are admitted by this boundary; other refs require an explicitly supported inspection path.",
      );
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
