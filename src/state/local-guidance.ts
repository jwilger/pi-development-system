import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { err, ok, type Result } from "../core/result.ts";
import { configErrorText, loadConfig, POLICY_ONLY } from "./config.ts";

const execute = promisify(execFile);
const FILE_LIMIT = 32 * 1024;
const TOTAL_LIMIT = 64 * 1024;

export type GuidanceError = {
  readonly kind: "guidance-error";
  readonly message: string;
  readonly path?: string;
};
type GuidanceSource = {
  readonly path: string;
  readonly content: string;
  readonly hash: string;
};
export type GuidanceSnapshot = {
  readonly sources: readonly GuidanceSource[];
  readonly identity: string;
  readonly section: string;
};

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
const failure = (message: string, path?: string): Result<never, GuidanceError> =>
  err({
    kind: "guidance-error",
    message: `${message}. Repair the configured guidance and retry preparation.`,
    ...(path === undefined ? {} : { path }),
  });
const inside = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

function snapshot(sources: readonly GuidanceSource[]): GuidanceSnapshot {
  const identity = digest(JSON.stringify(sources.map(({ path, hash }) => ({ path, hash }))));
  const section =
    sources.length === 0
      ? "Repository workflow: unconfigured."
      : [
          `Repository workflow snapshot: ${identity}`,
          ...sources.map(
            (source) => `Source: ${source.path}\nSHA256: ${source.hash}\n\n${source.content}`,
          ),
        ].join("\n\n");
  return { sources, identity, section };
}

/** Explicit references only; does not discover instructions or interpret operational policy. */
async function loadGuidance(
  cwd: string,
  paths: readonly string[],
): Promise<Result<GuidanceSnapshot, GuidanceError>> {
  if (paths.length === 0) return ok(snapshot([]));
  try {
    const { stdout } = await execute("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
    const root = await realpath(stdout.replace(/\n$/, ""));
    const sources: GuidanceSource[] = [];
    let total = 0;
    for (const path of paths) {
      if (
        isAbsolute(path) ||
        path.split(/[\\/]/).includes("..") ||
        !inside(root, resolve(root, path))
      )
        return failure("Guidance must be a repository-relative contained path", path);
      const target = resolve(root, path);
      const canonical = await realpath(target);
      if (!inside(root, canonical)) return failure("Guidance escapes the repository", path);
      const expected = await lstat(target);
      if (!expected.isFile()) return failure("Guidance must be a regular file", path);
      const tracked = await execute("git", ["-C", root, "ls-files", "-z", "--", path]);
      if (!tracked.stdout.split("\0").includes(relative(root, target).split(sep).join("/")))
        return failure("Guidance is untracked; version it explicitly before use", path);
      const file = await open(
        canonical,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      let bytes: Buffer;
      try {
        const opened = await file.stat();
        if (
          !opened.isFile() ||
          opened.dev !== expected.dev ||
          opened.ino !== expected.ino ||
          !inside(root, await realpath(canonical))
        )
          return failure("Guidance changed or escaped during preparation", path);
        const buffer = Buffer.alloc(FILE_LIMIT + 1);
        const read = await file.read(buffer, 0, buffer.length, 0);
        bytes = buffer.subarray(0, read.bytesRead);
      } finally {
        await file.close();
      }
      if (bytes.length > FILE_LIMIT) return failure("Guidance exceeds 32 KiB per-file limit", path);
      total += bytes.length;
      if (total > TOTAL_LIMIT) return failure("Guidance exceeds 64 KiB combined limit", path);
      let content: string;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return failure("Guidance must be valid UTF-8", path);
      }
      sources.push({ path, content, hash: digest(content) });
    }
    return ok(snapshot(sources));
  } catch (cause) {
    return failure(
      `Cannot load repository guidance: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

export async function loadWorkflowGuidance(
  cwd: string,
): Promise<Result<GuidanceSnapshot, GuidanceError>> {
  // A session may start below the repository root; workflow paths belong to the root.
  let root = cwd;
  try {
    const { stdout } = await execute("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      env: { ...process.env, LC_ALL: "C" },
    });
    root = stdout.replace(/\n$/, "");
  } catch (cause) {
    const notRepository =
      cause instanceof Error &&
      "code" in cause &&
      cause.code === 128 &&
      "stderr" in cause &&
      typeof cause.stderr === "string" &&
      cause.stderr.includes("not a git repository (or any");
    if (!notRepository)
      return failure(
        `Cannot resolve repository root: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    // Only genuine non-repository sessions may use their own directory's defaults.
  }
  const config = await loadConfig(root, POLICY_ONLY);
  return config.ok
    ? loadGuidance(root, config.value.workflow.guidance)
    : failure(configErrorText(config.error));
}
