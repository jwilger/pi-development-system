import type { Exec } from "../core/exec.ts";

export type TrunkStatus = {
  readonly status: "green" | "red" | "pending" | "unknown";
  readonly headSha: string | undefined;
};

const UNKNOWN: TrunkStatus = { status: "unknown", headSha: undefined };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const FAILED = new Set(["failure", "timed_out", "startup_failure", "action_required"]);

/** Parses `gh run list --json status,conclusion,headSha` output for the newest run. */
export function parseRunList(stdout: string): TrunkStatus {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return UNKNOWN;
  }
  const run = Array.isArray(parsed) ? parsed[0] : undefined;
  if (!isRecord(run)) return UNKNOWN;
  const headSha = typeof run.headSha === "string" ? run.headSha : undefined;
  if (run.status !== "completed") return { status: "pending", headSha };
  if (run.conclusion === "success") return { status: "green", headSha };
  if (typeof run.conclusion === "string" && FAILED.has(run.conclusion)) {
    return { status: "red", headSha };
  }
  return { status: "unknown", headSha };
}

/** CI state of the newest run on the trunk branch; `unknown` whenever `gh` cannot say. */
export async function getTrunkStatus(
  exec: Exec,
  where: { branch: string; cwd?: string },
): Promise<TrunkStatus> {
  try {
    const r = await exec(
      "gh",
      [
        "run",
        "list",
        "--branch",
        where.branch,
        "--limit",
        "1",
        "--json",
        "status,conclusion,headSha",
      ],
      { ...(where.cwd !== undefined ? { cwd: where.cwd } : {}), timeout: 15_000 },
    );
    return r.code === 0 ? parseRunList(r.stdout) : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

/** The failing log of the newest failed run, clipped; empty when unavailable. */
export async function getFailureLog(exec: Exec, cwd: string | undefined): Promise<string> {
  try {
    const r = await exec("gh", ["run", "view", "--log-failed"], {
      ...(cwd !== undefined ? { cwd } : {}),
      timeout: 30_000,
    });
    return r.code === 0 ? r.stdout.slice(-6000) : "";
  } catch {
    return "";
  }
}
