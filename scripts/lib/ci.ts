import { MAX_HISTORY_WALK, MAX_LOG_CHARS, WORKFLOW_FILE } from "./config.ts";
import { type BuildState, type ChainEntry, classifyChain, type RunState } from "./gate.ts";
import { gh, git, truncate } from "./sh.ts";

interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
}

/** CI result of the push workflow run for a commit. */
export function runStateOf(sha: string): { state: RunState; runId?: number } {
  const json = gh(
    "api",
    `repos/{owner}/{repo}/actions/workflows/${WORKFLOW_FILE}/runs?head_sha=${sha}&event=push&per_page=5`,
    "--jq",
    ".workflow_runs | map({id, status, conclusion})",
  );
  let runs: WorkflowRun[];
  try {
    runs = JSON.parse(json) as WorkflowRun[];
  } catch (error) {
    throw new Error(`Unexpected response listing workflow runs for ${sha}: ${String(error)}`);
  }
  const run = runs[0];
  if (!run) return { state: "none" };
  if (run.status !== "completed") return { state: "pending", runId: run.id };
  if (run.conclusion === "success") return { state: "success", runId: run.id };
  if (run.conclusion === "failure" || run.conclusion === "timed_out") {
    return { state: "failure", runId: run.id };
  }
  return { state: "none", runId: run.id }; // cancelled/skipped: unverified
}

/** Walk first-parent history from `tip` to the first green commit. */
export function buildStateAt(tip: string): BuildState {
  const shas = git("rev-list", "--first-parent", "-n", String(MAX_HISTORY_WALK), tip)
    .split("\n")
    .filter(Boolean);
  const chain: ChainEntry[] = [];
  for (const sha of shas) {
    const { state, runId } = runStateOf(sha);
    chain.push({ sha, state, ...(runId === undefined ? {} : { runId }) });
    if (state === "success") break;
  }
  return classifyChain(chain);
}

/** Tail of the failed job logs for a workflow run. */
export function failureLog(runId: number | undefined): string {
  if (runId === undefined) return "(no run id available)";
  try {
    return truncate(gh("run", "view", String(runId), "--log-failed"), MAX_LOG_CHARS, "tail");
  } catch {
    return "(failed-job log unavailable)";
  }
}
