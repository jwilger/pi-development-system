import { parse } from "shell-quote";

export type GitIntent =
  | "history-rewrite"
  | "force-push"
  | "branch-delete-remote"
  | "destructive-reset"
  | "no-verify"
  | "ordinary"
  | "unknown";

/** Highest severity first. */
const SEVERITY: ReadonlyArray<GitIntent> = [
  "force-push",
  "branch-delete-remote",
  "history-rewrite",
  "destructive-reset",
  "no-verify",
  "unknown",
  "ordinary",
];

const worst = (a: GitIntent, b: GitIntent): GitIntent =>
  SEVERITY.indexOf(a) <= SEVERITY.indexOf(b) ? a : b;

/** Splits a command string on newlines that are outside quotes. */
function splitLines(command: string): string[] {
  const lines: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (const ch of command) {
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
      current += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === "\n") {
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  lines.push(current);
  return lines;
}

/** Tokens of one line grouped into simple commands (operators separate segments). */
function segments(line: string): string[][] {
  const result: string[][] = [[]];
  for (const token of parse(line, (name) => `$${name}`)) {
    if (typeof token === "string") result[result.length - 1]?.push(token);
    else if ("pattern" in token) result[result.length - 1]?.push(token.pattern);
    else if (!("comment" in token)) result.push([]);
  }
  return result.filter((s) => s.length > 0);
}

const WRAPPERS = new Set(["command", "sudo", "env", "time", "nohup", "exec", "builtin", "nice"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
const OPAQUE = new Set(["xargs", "ssh", "find", "parallel", "watch"]);
const GLOBAL_WITH_VALUE = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace"]);
const HOOK_SKIP_ENV = new Set(["LEFTHOOK=0", "HUSKY=0"]);

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const isAssignment = (t: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*=/.test(t);

function classifyGitArgs(globals: string[], sub: string | undefined, args: string[]): GitIntent {
  let intent: GitIntent = "ordinary";
  if (globals.some((g) => /^core\.hooksPath=/.test(g))) intent = worst(intent, "no-verify");
  if (args.includes("--no-verify")) intent = worst(intent, "no-verify");
  switch (sub) {
    case "push": {
      const shortFlags = args.filter((a) => /^-[A-Za-z]+$/.test(a));
      if (
        args.some((a) => /^--(force|force-with-lease|force-if-includes|mirror)\b/.test(a)) ||
        shortFlags.some((a) => a.includes("f")) ||
        args.some((a) => /^\+\S/.test(a))
      ) {
        return worst(intent, "force-push");
      }
      if (
        args.includes("--delete") ||
        shortFlags.includes("-d") ||
        args.some((a) => /^:\S/.test(a))
      ) {
        return worst(intent, "branch-delete-remote");
      }
      return intent;
    }
    case "commit":
      if (args.includes("--amend")) return worst(intent, "history-rewrite");
      if (args.some((a) => /^-[A-Za-z]*n[A-Za-z]*$/.test(a))) return worst(intent, "no-verify");
      return intent;
    case "rebase":
      return args.some((a) => ["--abort", "--continue", "--skip", "--quit"].includes(a))
        ? intent
        : worst(intent, "history-rewrite");
    case "filter-branch":
    case "filter-repo":
      return worst(intent, "history-rewrite");
    case "reset":
      return args.includes("--hard") ? worst(intent, "destructive-reset") : intent;
    default:
      return intent;
  }
}

function classifySegment(tokens: string[]): GitIntent {
  let hookSkip = false;
  let i = 0;
  for (;;) {
    const t = tokens[i];
    if (t === undefined) return "ordinary";
    if (isAssignment(t)) {
      if (HOOK_SKIP_ENV.has(t)) hookSkip = true;
      i++;
    } else if (WRAPPERS.has(t)) {
      i++;
    } else {
      break;
    }
  }
  const head = tokens[i] ?? "";
  const rest = tokens.slice(i + 1);
  const base = basename(head);
  const withHookSkip = (intent: GitIntent): GitIntent =>
    hookSkip ? worst(intent, "no-verify") : intent;
  if (head.startsWith("$") || base === "$GIT") return "unknown";
  if (SHELLS.has(base)) {
    const c = rest.indexOf("-c");
    const script = c >= 0 ? rest[c + 1] : undefined;
    return script !== undefined ? classifyGitCommand(script) : "ordinary";
  }
  if (base === "eval") return classifyGitCommand(rest.join(" "));
  if (OPAQUE.has(base)) return rest.some((t) => basename(t) === "git") ? "unknown" : "ordinary";
  if (base !== "git") return "ordinary";
  const globals: string[] = [];
  let j = 0;
  while (j < rest.length && (rest[j] ?? "").startsWith("-")) {
    const opt = rest[j] ?? "";
    if (GLOBAL_WITH_VALUE.has(opt)) {
      globals.push(rest[j + 1] ?? "");
      j += 2;
    } else {
      j++;
    }
  }
  const sub = rest[j];
  return withHookSkip(classifyGitArgs(globals, sub, rest.slice(j + 1)));
}

/** Classifies the most severe git intent in a shell command (deterministic fast path). */
export function classifyGitCommand(command: string): GitIntent {
  let intent: GitIntent = "ordinary";
  for (const line of splitLines(command)) {
    for (const segment of segments(line)) intent = worst(intent, classifySegment(segment));
  }
  return intent;
}
