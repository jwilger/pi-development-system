import { execFileSync } from "node:child_process";

export function run(cmd: string, args: string[], opts: { input?: string } = {}): string {
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

export function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}
