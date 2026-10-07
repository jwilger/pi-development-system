import { createHash } from "node:crypto";
import type { Exec } from "../core/exec.ts";
import { err, ok, type Result } from "../core/result.ts";

/** A short, stable identity for a diff's text. Pure. */
export const digestOf = (diff: string): string =>
  createHash("sha256").update(diff).digest("hex").slice(0, 16);

export type DiffSnapshot = { digest: string; stat: string; sample: string };

/** The diff for `range` (default: everything not yet committed, `HEAD`), with its digest. */
export async function snapshotDiff(
  exec: Exec,
  cwd: string,
  range: string,
): Promise<Result<DiffSnapshot, string>> {
  try {
    const [diff, stat] = await Promise.all([
      exec("git", ["diff", range], { cwd, timeout: 15_000 }),
      exec("git", ["diff", "--stat", range], { cwd, timeout: 15_000 }),
    ]);
    if (diff.code !== 0) return err(diff.stderr.trim() || `git diff ${range} failed`);
    return ok({
      digest: digestOf(diff.stdout),
      stat: stat.stdout,
      sample: diff.stdout.slice(0, 16_000),
    });
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause));
  }
}
