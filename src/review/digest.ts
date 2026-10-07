import { createHash } from "node:crypto";
import { lstat, readlink } from "node:fs/promises";
import { join } from "node:path";
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

const PLAIN_DIFF = [
  "-c",
  "core.quotePath=false",
  "diff",
  "--no-ext-diff",
  "--no-color",
  // diff.mnemonicPrefix / diff.noprefix change the `a/` `b/` header prefixes the file keys are cut from.
  "--src-prefix=a/",
  "--dst-prefix=b/",
  // Every changed path gets a `diff --git` section: no submodule log summaries, no textconv that
  // can hide an edit whose converted text is unchanged.
  "--submodule=short",
  "--no-textconv",
  // diff.ignoreSubmodules=all would hide a bump that `git add` still stages.
  "--ignore-submodules=dirty",
];

type GitReads = { diff: string; stat: string; listed: string[] };

const NO_OUTPUT = { code: 0, stdout: "", stderr: "" };

/** The three git reads a snapshot is made of, or the error that stopped them. */
async function readGit(exec: Exec, cwd: string, range: string): Promise<Result<GitReads, string>> {
  // Plain, parseable output whatever the user's git config says: an external diff driver or
  // forced colour removes the `diff --git` headers the per-file digests are cut from.
  const [diff, stat, others] = await Promise.all([
    exec("git", [...PLAIN_DIFF, "--full-index", "--no-renames", range], { cwd, timeout: 15_000 }),
    exec("git", [...PLAIN_DIFF, "--stat", range], { cwd, timeout: 15_000 }),
    // Any range that ends in the work tree (HEAD, HEAD~1, a branch) leaves untracked files out of git diff.
    range.includes("..")
      ? Promise.resolve(NO_OUTPUT)
      : exec(
          "git",
          ["-c", "core.quotePath=false", "ls-files", "-z", "--others", "--exclude-standard"],
          { cwd, timeout: 15_000 },
        ),
  ]);
  if (diff.code !== 0) return err(diff.stderr.trim() || `git diff ${range} failed`);
  if (others.code !== 0) return err(others.stderr.trim() || "git ls-files --others failed");
  return ok({
    diff: diff.stdout,
    stat: stat.stdout,
    listed: others.stdout.split("\0").filter((p) => p !== ""),
  });
}

/** Per-file digests of the tracked diff; an unparseable non-empty diff is an error, never an empty digest. */
function trackedDigests(diff: string): Result<Record<string, string>, string> {
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries(splitDiffByFile(diff))) files[path] = fileDigest(text);
  if (diff.trim() !== "" && Object.keys(files).length === 0) {
    return err("could not read the diff: no per-file sections were found");
  }
  return ok(files);
}

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
    const git = await readGit(exec, cwd, range);
    if (!git.ok) return git;
    // A nested repository is listed as `dir/` and has no blob to hash.
    const nested = git.value.listed.filter((p) => p.endsWith("/"));
    const untracked = git.value.listed.filter((p) => !p.endsWith("/"));
    if (untracked.length > MAX_UNTRACKED) {
      return err(
        `${untracked.length} untracked files (more than ${MAX_UNTRACKED}); stage (git add) or ignore some so they can be reviewed`,
      );
    }
    const tracked = trackedDigests(git.value.diff);
    if (!tracked.ok) return tracked;
    const hashed = await hashUntracked(exec, cwd, untracked);
    if (!hashed.ok) return hashed;
    const files = { ...tracked.value, ...hashed.value };
    // Code-unit order, not locale order: the digest must not depend on the runtime's collation.
    const names = Object.keys(files).sort(byCodeUnit);
    const untrackedStat = [
      ...untracked.map((p) => ` ${p} (untracked)`),
      ...nested.map((p) => ` ${p} (nested repository, not reviewable)`),
    ].join("\n");
    return ok({
      digest: digestOf(names.map((p) => `${p}\0${files[p]}`).join("\n")),
      files,
      stat: [git.value.stat.trimEnd(), untrackedStat].filter((p) => p !== "").join("\n"),
      sample: git.value.diff.slice(0, 16_000),
    });
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause));
  }
}

const byCodeUnit = (a: string, b: string): number => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

/** Content digests (`new:<blob>`) of untracked files; symlinks are hashed by target, not followed. */
async function hashUntracked(
  exec: Exec,
  cwd: string,
  untracked: string[],
): Promise<Result<Record<string, string>, string>> {
  const files: Record<string, string> = {};
  const links = new Set<string>();
  for (const path of untracked) {
    const target = await linkTarget(cwd, path);
    if (target !== undefined) {
      files[path] = `new:${blobOf(target)}`;
      links.add(path);
    }
  }
  // `git hash-object <path>` follows symlinks (and fails on dangling ones), so links are hashed above.
  const regular = untracked.filter((p) => !links.has(p));
  if (regular.length === 0) return ok(files);
  const hashes = await exec("git", ["hash-object", "--", ...regular], { cwd, timeout: 15_000 });
  const lines = hashes.stdout.split("\n").filter((l) => l !== "");
  if (hashes.code !== 0 || lines.length !== regular.length) {
    return err(hashes.stderr.trim() || "git hash-object could not hash every untracked file");
  }
  for (const [i, path] of regular.entries()) files[path] = `new:${lines[i]}`;
  return ok(files);
}

const NEW_FILE = /^new file mode .*\nindex 0+\.\.([0-9a-f]+)/m;

/** A new file digests as its blob, the same form an untracked file gets, so `git add` changes nothing. */
const fileDigest = (section: string): string => {
  const blob = NEW_FILE.exec(section)?.[1];
  return blob === undefined ? digestOf(section) : `new:${blob}`;
};

/** The text of a symlink, or undefined when `path` is not one (or cannot be inspected). */
async function linkTarget(cwd: string, path: string): Promise<string | undefined> {
  try {
    const full = join(cwd, path);
    return (await lstat(full)).isSymbolicLink() ? await readlink(full) : undefined;
  } catch {
    return undefined;
  }
}

/** Git's blob id for some content: what `git add` stores for a symlink is its target text. */
const blobOf = (content: string): string =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest("hex");
