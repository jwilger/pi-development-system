import { createHash } from "node:crypto";
import type { Exec } from "../core/exec.ts";
import { err, ok, type Result } from "../core/result.ts";
import { splitDiffByFile } from "../core/review-flow.ts";

/** A short, stable identity for some text. Pure. */
export const digestOf = (text: string): string =>
  createHash("sha256").update(text).digest("hex").slice(0, 16);

export type DiffSnapshot = {
  /** Identity of everything reviewed: the tracked diff plus the content of untracked files. */
  digest: string;
  /** Per-file digests, tracked and untracked, keyed by path. */
  files: Record<string, string>;
  stat: string;
  sample: string;
};

const MAX_UNTRACKED = 200;

/**
 * The change in `range` (default `HEAD`: everything not yet committed) with its digest. `git diff`
 * leaves out untracked files, so for a range that includes the work tree they are listed and
 * content-hashed too; otherwise a new file would be committed unreviewed.
 */
export async function snapshotDiff(
  exec: Exec,
  cwd: string,
  range: string,
): Promise<Result<DiffSnapshot, string>> {
  try {
    const [diff, stat, others] = await Promise.all([
      exec("git", ["diff", range], { cwd, timeout: 15_000 }),
      exec("git", ["diff", "--stat", range], { cwd, timeout: 15_000 }),
      range === "HEAD"
        ? exec("git", ["ls-files", "--others", "--exclude-standard"], { cwd, timeout: 15_000 })
        : Promise.resolve({ code: 0, stdout: "", stderr: "" }),
    ]);
    if (diff.code !== 0) return err(diff.stderr.trim() || `git diff ${range} failed`);
    const untracked = others.code === 0 ? others.stdout.split("\n").filter((p) => p !== "") : [];
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(splitDiffByFile(diff.stdout))) {
      files[path] = digestOf(text);
    }
    if (untracked.length > 0) {
      const shown = untracked.slice(0, MAX_UNTRACKED);
      const hashes = await exec("git", ["hash-object", "--", ...shown], { cwd, timeout: 15_000 });
      const lines = hashes.code === 0 ? hashes.stdout.split("\n").filter((l) => l !== "") : [];
      for (const [i, path] of shown.entries()) files[path] = `new:${lines[i] ?? "unhashed"}`;
    }
    const names = Object.keys(files).sort();
    const untrackedStat = untracked.map((p) => ` ${p} (untracked)`).join("\n");
    return ok({
      digest: digestOf(names.map((p) => `${p}\0${files[p]}`).join("\n")),
      files,
      stat: [stat.stdout.trimEnd(), untrackedStat].filter((p) => p !== "").join("\n"),
      sample: diff.stdout.slice(0, 16_000),
    });
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause));
  }
}
