import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import type { Exec } from "../core/exec.ts";
import { ok } from "../core/result.ts";
import { type TrackerResult, trackerError } from "../tracker/types.ts";

const Repository = Type.String({
  pattern: "^[A-Za-z0-9][A-Za-z0-9-]*/(?!\\.{1,2}$)[A-Za-z0-9_.-]+$",
});
const Ref = Type.Object(
  {
    repository: Repository,
    number: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  },
  { additionalProperties: false },
);
const Manifest = Type.Object(
  {
    version: Type.Literal(1),
    issue: Ref,
    pullRequests: Type.Array(Ref, { minItems: 1 }),
    manualRequirements: Type.Array(Type.String({ pattern: "\\S" })),
  },
  { additionalProperties: false },
);
type LoadedManifest = {
  readonly path: string;
  readonly hash: string;
  readonly manifest: Static<typeof Manifest>;
};

/** Find repository policy from nested cwd, including worktrees (.git is a file). */
export async function deliveryRoot(cwd: string): Promise<string> {
  let current = resolve(cwd);
  for (;;) {
    try {
      const marker = join(current, ".git");
      const stat = await lstat(marker);
      if (stat.isDirectory()) {
        if ((await lstat(join(marker, "HEAD"))).isFile()) return current;
      } else if (stat.isFile() && /^gitdir: .+\n?$/.test(await readFile(marker, "utf8"))) {
        return current;
      }
    } catch (cause) {
      if (!missing(cause)) throw cause;
    }
    const parent = dirname(current);
    if (parent === current) return resolve(cwd);
    current = parent;
  }
}
const missing = (cause: unknown): boolean =>
  cause instanceof Error && "code" in cause && cause.code === "ENOENT";
const fail = (message: string) =>
  trackerError(`Delivery manifest: ${message}. No writes attempted.`);

async function containedFile(root: string, path: string): Promise<boolean> {
  const rel = relative(root, path);
  if (isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) return false;
  // Reject symlink components as well as final symlinks; never follow an escape even temporarily.
  let current = root;
  for (const part of rel.split(/[\\/]/)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) return false;
  }
  return (await realpath(path)) === path;
}

/** Owner-authored, tracked working-tree content; nothing is cached or written. */
export async function loadDeliveryManifest(deps: {
  exec: Exec;
  cwd: string;
  repository: string;
  number: number;
  manifestDir?: string;
  required: boolean;
}): Promise<TrackerResult<LoadedManifest | null>> {
  if (deps.manifestDir === undefined)
    return deps.required ? fail("manifest_dir is required") : ok(null);
  const dir = deps.manifestDir;
  if (
    isAbsolute(dir) ||
    dir.includes("\\") ||
    dir.includes("\0") ||
    dir.split("/").some((part) => !part || part === "." || part === "..")
  )
    return fail("manifest_dir must be contained and root-relative");
  if (!Value.Check(Ref, { repository: deps.repository, number: deps.number }))
    return fail("invalid issue identity");
  try {
    const git = await deps.exec("git", ["rev-parse", "--show-toplevel"], {
      cwd: deps.cwd,
      timeout: 30_000,
    });
    if (git.code !== 0 || !git.stdout.trim()) return fail("cannot resolve Git root");
    const root = await realpath(git.stdout.trim());
    const path = join(root, dir, `${deps.number}.json`);
    let safe: boolean;
    try {
      safe = await containedFile(root, path);
    } catch (cause) {
      if (missing(cause)) return deps.required ? fail("required manifest is missing") : ok(null);
      throw cause;
    }
    if (!safe) return fail("manifest is not a contained regular file (symlinks forbidden)");
    const tracked = await deps.exec(
      "git",
      ["--literal-pathspecs", "ls-files", "--error-unmatch", "--", relative(root, path)],
      { cwd: root, timeout: 30_000 },
    );
    if (tracked.code !== 0) return fail("manifest must be Git-tracked");
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let bytes: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 32 * 1024)
        return fail("manifest must be regular and at most 32KiB");
      bytes = Buffer.alloc(32 * 1024 + 1);
      const read = await handle.read(bytes, 0, bytes.length, 0);
      bytes = bytes.subarray(0, read.bytesRead);
      if (bytes.length > 32 * 1024) return fail("manifest exceeds 32KiB");
    } finally {
      await handle.close();
    }
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(source);
    if (!Value.Check(Manifest, parsed)) return fail("invalid v1 manifest or unknown fields");
    if (parsed.issue.repository !== deps.repository || parsed.issue.number !== deps.number)
      return fail("issue identity mismatch");
    const ids = parsed.pullRequests.map((ref) => `${ref.repository.toLowerCase()}#${ref.number}`);
    if (new Set(ids).size !== ids.length) return fail("duplicate PR refs");
    return ok({ path, hash: createHash("sha256").update(bytes).digest("hex"), manifest: parsed });
  } catch {
    return fail("cannot read regular UTF-8 JSON manifest");
  }
}
