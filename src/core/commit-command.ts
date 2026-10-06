import { splitLines } from "./git-intent.ts";
import { parseShell } from "./shell-parse.ts";

export type CommitExtraction =
  | { readonly kind: "not-commit" }
  | { readonly kind: "message"; readonly message: string }
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "unknown" };

const HEREDOC =
  /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/g;
const GLOBAL_WITH_VALUE = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace"]);

/** Heredoc bodies are data: take them out so their quotes cannot confuse line splitting. */
function stripHeredocs(command: string): { rest: string; bodies: string[] } {
  const bodies: string[] = [];
  const rest = command.replace(HEREDOC, (_all, _quote, _tag, body: string) => {
    bodies.push(body);
    return "\n";
  });
  return { rest, bodies };
}

function segmentsOf(line: string): string[][] {
  const out: string[][] = [[]];
  for (const t of parseShell(line, (name) => `$${name}`)) {
    if (typeof t === "string") out.at(-1)?.push(t);
    else if ("op" in t && /^[<>]/.test(t.op)) continue;
    else if (!("comment" in t)) out.push([]);
  }
  return out.filter((s) => s.length > 0);
}

const WRAPPERS = new Set(["command", "sudo", "env", "time", "nohup", "exec", "builtin", "nice"]);
const isAssignment = (w: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w);
const isGit = (w: string): boolean => w === "git" || w.endsWith("/git");

/** Index of the word after `git [global options]`, when this segment's command is git. */
function subcommandIndex(segment: readonly string[]): number | undefined {
  const start = segment.findIndex((w) => !isAssignment(w) && !WRAPPERS.has(w));
  if (start === -1 || !isGit(segment[start] ?? "")) return undefined;
  let skipNext = false;
  for (let i = start + 1; i < segment.length; i++) {
    const w = segment[i] ?? "";
    if (skipNext) skipNext = false;
    else if (GLOBAL_WITH_VALUE.has(w)) skipNext = true;
    else if (!w.startsWith("-")) return i;
  }
  return undefined;
}

type Options = {
  messages: string[];
  trailers: string[];
  file: string | undefined;
  opaque: boolean;
};

function readOptions(args: readonly string[]): Options {
  const options: Options = { messages: [], trailers: [], file: undefined, opaque: false };
  const take = (value: string | undefined) => {
    if (value === undefined || /\$\(|`/.test(value)) options.opaque = true;
    else options.messages.push(value);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "-m" || a === "--message") take(args[++i]);
    else if (a.startsWith("--message=")) take(a.slice("--message=".length));
    else if (a === "-F" || a === "--file") options.file = args[++i];
    else if (a.startsWith("--file=")) options.file = a.slice("--file=".length);
    else if (a === "--trailer") options.trailers.push(args[++i] ?? "");
    else if (a.startsWith("--trailer=")) options.trailers.push(a.slice("--trailer=".length));
    else if (/^-[A-Za-z]*m$/.test(a)) take(args[++i]);
    else if (/^-[A-Za-z]*m./.test(a)) take(a.slice(a.indexOf("m") + 1));
  }
  return options;
}

/** The commit message a `git commit` shell command will use, or why it cannot be known. */
export function extractCommit(command: string): CommitExtraction {
  const { rest, bodies } = stripHeredocs(command);
  const heredoc = bodies[0]?.trim();
  for (const line of splitLines(rest)) {
    for (const segment of segmentsOf(line)) {
      const at = subcommandIndex(segment);
      if (at === undefined || segment[at] !== "commit") continue;
      const options = readOptions(segment.slice(at + 1));
      if (options.file === "-" && heredoc !== undefined)
        return { kind: "message", message: heredoc };
      if (options.file !== undefined) return { kind: "file", path: options.file };
      if (options.opaque) {
        return heredoc === undefined ? { kind: "unknown" } : { kind: "message", message: heredoc };
      }
      if (options.messages.length === 0) return { kind: "unknown" };
      const trailers = options.trailers.length === 0 ? "" : `\n\n${options.trailers.join("\n")}`;
      return { kind: "message", message: `${options.messages.join("\n\n")}${trailers}` };
    }
  }
  return { kind: "not-commit" };
}
