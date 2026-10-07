import { parseShell } from "./shell-parse.ts";

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

/** Splits a command string on newlines that are outside quotes; backslash-newline is a continuation. */
// biome-ignore-start lint/complexity/noExcessiveCognitiveComplexity: a shell lexer is one flat branch per character class; splitting it would scatter a single state machine across helpers
// pi-lens-ignore: high-complexity -- a shell lexer is one flat branch per character class; splitting it would scatter one state machine across helpers
export function splitLines(command: string): string[] {
  const lines: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < command.length; i++) {
    const ch = command.charAt(i);
    if (quote === '"' && ch === "\\") {
      current += ch + command.charAt(i + 1);
      i++;
    } else if (quote !== undefined) {
      if (ch === quote) quote = undefined;
      current += ch;
    } else if (ch === "\\" && command.charAt(i + 1) === "\n") {
      i++;
    } else if (ch === "#" && (current === "" || /\s$/.test(current))) {
      // A comment runs to the end of the line; quotes inside it do not open a quote.
      while (i < command.length && command.charAt(i) !== "\n") current += command.charAt(i++);
      i--;
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
// biome-ignore-end lint/complexity/noExcessiveCognitiveComplexity: end of the shell lexer above

const isRedirect = (op: string): boolean => /^[<>]/.test(op) && !op.endsWith("(");

/** Tokens of one line grouped into simple commands (operators separate segments; redirects and their operands are dropped). */
export function segments(line: string): string[][] {
  const result: string[][] = [[]];
  let skipOperand = false;
  for (const token of parseShell(line, (name) => `$${name}`)) {
    const current = result.at(-1);
    if (typeof token === "string" || "pattern" in token) {
      const text = typeof token === "string" ? token : token.pattern;
      if (!skipOperand) current?.push(text);
      skipOperand = false;
    } else if ("op" in token && isRedirect(token.op)) {
      // `2>&1`, `>/dev/null`: the file descriptor before it and the target after it are not arguments.
      if (/^\d+$/.test(current?.at(-1) ?? "")) current?.pop();
      skipOperand = true;
    } else if (!("comment" in token)) {
      result.push([]);
      skipOperand = false;
    }
  }
  return result.filter((s) => s.length > 0);
}

export const WRAPPERS = new Set([
  "command",
  "sudo",
  "env",
  "time",
  "nohup",
  "exec",
  "builtin",
  "nice",
]);
export const KEYWORDS = new Set([
  "then",
  "do",
  "else",
  "elif",
  "if",
  "while",
  "until",
  "{",
  "!",
  "time",
]);
export const DATA_ONLY = new Set([
  "echo",
  "printf",
  "cat",
  "grep",
  "rg",
  "man",
  "which",
  "type",
  "head",
  "tail",
]);
export const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
export const OPAQUE = new Set(["xargs", "ssh", "find", "parallel", "watch"]);
export const GLOBAL_WITH_VALUE = new Set([
  "-c",
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--super-prefix",
]);
const HOOK_SKIP_ENV = new Set(["LEFTHOOK=0", "HUSKY=0"]);

export const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
export const isAssignment = (t: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*=/.test(t);

/** True when `arg` is `name` or an unambiguous-looking git abbreviation of it (`--amen`, `--del=x`). */
const isLong = (arg: string, ...names: string[]): boolean => {
  const key = arg.split("=")[0] ?? "";
  return key.length >= 4 && key.startsWith("--") && names.some((n) => n.startsWith(key));
};

function classifyGitArgs(globals: string[], sub: string | undefined, args: string[]): GitIntent {
  let intent: GitIntent = "ordinary";
  if (globals.some((g) => /^core\.hookspath=/i.test(g))) intent = worst(intent, "no-verify");
  if (args.some((a) => isLong(a, "--no-verify"))) intent = worst(intent, "no-verify");
  switch (sub) {
    case "push": {
      const shortFlags = args.filter((a) => /^-[A-Za-z]+$/.test(a));
      if (
        args.some((a) =>
          isLong(a, "--force", "--force-with-lease", "--force-if-includes", "--mirror"),
        ) ||
        shortFlags.some((a) => a.includes("f")) ||
        args.some((a) => /^\+\S/.test(a))
      ) {
        return worst(intent, "force-push");
      }
      if (
        args.some((a) => isLong(a, "--delete")) ||
        shortFlags.includes("-d") ||
        args.some((a) => /^:\S/.test(a))
      ) {
        return worst(intent, "branch-delete-remote");
      }
      return intent;
    }
    case "commit":
      if (args.some((a) => isLong(a, "--amend"))) return worst(intent, "history-rewrite");
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
      return args.some((a) => isLong(a, "--hard")) ? worst(intent, "destructive-reset") : intent;
    default:
      return intent;
  }
}

/** Skips leading `NAME=value` words, wrappers and shell keywords; `index` is the command word (-1: none). */
function skipPrefix(tokens: string[]): { index: number; hookSkip: boolean } {
  let hookSkip = false;
  let index = 0;
  for (;;) {
    const t = tokens[index];
    if (t === undefined) return { index: -1, hookSkip };
    if (isAssignment(t)) {
      if (HOOK_SKIP_ENV.has(t)) hookSkip = true;
    } else if (!(WRAPPERS.has(t) || KEYWORDS.has(t))) {
      return { index, hookSkip };
    }
    index++;
  }
}

/** Git's global options (`-c k=v`, `-C dir`, flags) before the subcommand. */
function splitGlobals(rest: string[]): {
  globals: string[];
  sub: string | undefined;
  args: string[];
} {
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
  return { globals, sub: rest[j], args: rest.slice(j + 1) };
}

// pi-lens-ignore: high-fan-out -- the classifier dispatches one git word to many small predicates; it is a table, not coordination
function classifySegment(tokens: string[]): GitIntent {
  const { index: i, hookSkip } = skipPrefix(tokens);
  if (i < 0) return "ordinary";
  const head = tokens[i] ?? "";
  const rest = tokens.slice(i + 1);
  const base = basename(head);
  const withHookSkip = (found: GitIntent): GitIntent =>
    hookSkip ? worst(found, "no-verify") : found;
  if (head.startsWith("$") || base === "$GIT") return "unknown";
  if (SHELLS.has(base)) {
    const c = rest.findIndex((t) => /^-[A-Za-z]*c[A-Za-z]*$/.test(t));
    const script = c >= 0 ? rest[c + 1] : undefined;
    return script !== undefined ? classifyGitCommand(script) : "ordinary";
  }
  if (base === "eval") return classifyGitCommand(rest.join(" "));
  if (OPAQUE.has(base)) return rest.some((t) => basename(t) === "git") ? "unknown" : "ordinary";
  if (base !== "git") {
    if (DATA_ONLY.has(base)) return "ordinary";
    // Wrapper with options (`sudo -E git ...`, `timeout 5 git ...`): classify from the git token.
    const at = rest.findIndex((t) => basename(t) === "git");
    return at >= 0 ? withHookSkip(classifySegment(rest.slice(at))) : "ordinary";
  }
  const { globals, sub, args } = splitGlobals(rest);
  const dynamic =
    (sub ?? "").startsWith("$") ||
    (["push", "reset", "rebase"].includes(sub ?? "") &&
      args.some((t) => t.startsWith("$") || t.includes("`")));
  const intent = classifyGitArgs(globals, sub, args);
  return withHookSkip(dynamic ? worst(intent, "unknown") : intent);
}

/**
 * The parts of a line bash may still execute or treat as syntax: single-quoted text and
 * backslash-escaped characters are dropped; double-quoted text is kept unless `dropDouble`.
 */
// pi-lens-ignore: high-complexity -- a shell lexer is one flat branch per character class; splitting it would scatter one state machine across helpers
export function live(line: string, dropDouble: boolean): string {
  let out = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (quote === "'") {
      if (ch === "'") quote = undefined;
    } else if (ch === "\\") {
      i++;
    } else if (quote === '"') {
      if (ch === '"') quote = undefined;
      else if (!dropDouble) out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Bodies of `$(...)` and backtick substitutions anywhere in the text (quoted or not). */
export function substitutions(text: string): string[] {
  const bodies: string[] = [];
  for (let at = text.indexOf("$("); at >= 0; at = text.indexOf("$(", at + 2)) {
    let depth = 1;
    let end = at + 2;
    for (; end < text.length && depth > 0; end++) {
      const ch = text.charAt(end);
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    bodies.push(text.slice(at + 2, depth === 0 ? end - 1 : end));
  }
  for (const m of text.matchAll(/`([^`]*)`/g)) bodies.push(m[1] ?? "");
  return bodies;
}

const HEREDOC = /^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;

/** The delimiter of a heredoc started by an unquoted `<<` on this line, if any. */
// pi-lens-ignore: high-complexity -- a shell lexer is one flat branch per character class; splitting it would scatter one state machine across helpers
export function heredocDelimiter(line: string): string | undefined {
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
    } else if (ch === "\\") {
      i++;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (line.startsWith("<<<", i)) {
      i += 2;
    } else if (ch === "<" && line.charAt(i + 1) === "<") {
      return HEREDOC.exec(line.slice(i))?.[2];
    }
  }
  return undefined;
}

/** Classifies the most severe git intent in a shell command (deterministic fast path). */
export function classifyGitCommand(command: string): GitIntent {
  let intent: GitIntent = "ordinary";
  let heredocEnd: string | undefined;
  for (const line of splitLines(command)) {
    if (heredocEnd !== undefined) {
      if (line.trim() === heredocEnd) heredocEnd = undefined;
      continue;
    }
    for (const segment of segments(line)) intent = worst(intent, classifySegment(segment));
    for (const body of substitutions(live(line, false)))
      intent = worst(intent, classifyGitCommand(body));
    heredocEnd = heredocDelimiter(line) ?? heredocEnd;
  }
  return intent;
}
