import { execFileSync } from "node:child_process";

function run(cmd: string, args: string[], opts: { input?: string } = {}): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    ...opts,
  });
}

export const git = (...args: string[]): string => run("git", args).trimEnd();
export const gh = (...args: string[]): string => run("gh", args).trimEnd();

export function truncate(text: string, max: number, keep: "head" | "tail" = "head"): string {
  if (text.length <= max) return text;
  return keep === "head"
    ? `${text.slice(0, max)}\n…[truncated]`
    : `[truncated]…\n${text.slice(text.length - max)}`;
}

/** CLI output: stdout for results, stderr for warnings and failures. */
export const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
export const warn = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

export function fail(message: string): never {
  warn(`\n✖ ${message}\n`);
  process.exit(1);
}

/**
 * Shrinks a unified diff to at most `max` characters by giving every file an equal share (at
 * least `floor`), so one huge file cannot hide the others. Each cut file ends with a marker, and
 * the result is hard-capped at `max` when there are too many files for even the floor share.
 */
export function budgetDiff(diff: string, max: number, floor = 300): string {
  if (diff.length <= max) return diff;
  const files = diff.split(/(?=^diff --git )/m).filter(Boolean);
  const share = Math.max(floor, Math.floor(max / Math.max(files.length, 1)));
  const joined = files
    .map((f) => (f.length <= share ? f : `${f.slice(0, share)}\n…[file truncated]\n`))
    .join("");
  const marker = "\n…[truncated]";
  return joined.length <= max ? joined : joined.slice(0, max - marker.length) + marker;
}
