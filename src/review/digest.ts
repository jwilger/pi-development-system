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
    // Plain, parseable output whatever the user's git config says: an external diff driver or
    // forced colour removes the `diff --git` headers the per-file digests are cut from.
    const plain = ["-c", "core.quotePath=false", "diff", "--no-ext-diff", "--no-color"];
    const [diff, stat, others] = await Promise.all([
      exec("git", [...plain, "--full-index", "--no-renames", range], { cwd, timeout: 15_000 }),
      exec("git", [...plain, "--stat", range], { cwd, timeout: 15_000 }),
      range === "HEAD"
        ? exec("git", ["ls-files", "--others", "--exclude-standard"], { cwd, timeout: 15_000 })
        : Promise.resolve({ code: 0, stdout: "", stderr: "" }),
    ]);
    if (diff.code !== 0) return err(diff.stderr.trim() || `git diff ${range} failed`);
    if (others.code !== 0) return err(others.stderr.trim() || "git ls-files --others failed");
    const listed = others.stdout.split("\n").filter((p) => p !== "");
    // A nested repository is listed as `dir/` and has no blob to hash.
    const nested = listed.filter((p) => p.endsWith("/"));
    const untracked = listed.filter((p) => !p.endsWith("/"));
    if (untracked.length > MAX_UNTRACKED) {
      return err(
        `${untracked.length} untracked files (more than ${MAX_UNTRACKED}); commit or ignore some so they can be reviewed`,
      );
    }
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(splitDiffByFile(diff.stdout))) {
      files[path] = fileDigest(text);
    }
    if (diff.stdout.trim() !== "" && Object.keys(files).length === 0) {
      return err("could not read the diff: no per-file sections were found");
    }
    if (untracked.length > 0) {
      const hashes = await exec("git", ["hash-object", "--", ...untracked], {
        cwd,
        timeout: 15_000,
      });
      const lines = hashes.stdout.split("\n").filter((l) => l !== "");
      if (hashes.code !== 0 || lines.length !== untracked.length) {
        return err(hashes.stderr.trim() || "git hash-object could not hash every untracked file");
      }
      for (const [i, path] of untracked.entries()) files[path] = `new:${lines[i]}`;
    }
    const names = Object.keys(files).sort();
    const untrackedStat = [
      ...untracked.map((p) => ` ${p} (untracked)`),
      ...nested.map((p) => ` ${p} (nested repository, not reviewable)`),
    ].join("\n");
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

const NEW_FILE = /^new file mode .*\nindex 0+\.\.([0-9a-f]+)/m;

/** A new file digests as its blob, the same form an untracked file gets, so `git add` changes nothing. */
const fileDigest = (section: string): string => {
  const blob = NEW_FILE.exec(section)?.[1];
  return blob === undefined ? digestOf(section) : `new:${blob}`;
};
