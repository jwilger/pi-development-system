import {
  basename,
  DATA_ONLY,
  GLOBAL_WITH_VALUE,
  heredocDelimiter,
  isAssignment,
  KEYWORDS,
  live,
  OPAQUE,
  SHELLS,
  segments,
  splitLines,
  substitutions,
  WRAPPERS,
} from "./git-intent.ts";

export type GitInvocation = {
  readonly sub: string;
  readonly args: readonly string[];
  /** Directory the command runs in, relative to the starting one (from `cd` and `git -C`), when it moved. */
  readonly dir?: string;
  /** Index of the (newline-split) line of the top-level command this invocation sits on. */
  readonly line: number;
};

export type GitResolution = {
  readonly invocations: readonly GitInvocation[];
  /** True when git may run through something the parser cannot see into (xargs, `$CMD`, …). */
  readonly opaque: boolean;
};

type Collector = {
  invocations: GitInvocation[];
  opaque: boolean;
  dir: string | undefined;
  line: number;
};

const firstCommand = (tokens: readonly string[]): number => {
  const at = tokens.findIndex((t) => !(isAssignment(t) || WRAPPERS.has(t) || KEYWORDS.has(t)));
  return at < 0 ? tokens.length : at;
};

const gitIndex = (tokens: readonly string[]): number =>
  tokens.findIndex((t) => basename(t) === "git");

const joinDir = (base: string | undefined, next: string): string =>
  next.startsWith("/") || base === undefined ? next : `${base}/${next}`;

/** `git [global options] <sub> <args…>` (tokens start at the word after `git`). */
function visitGit(rest: readonly string[], into: Collector): void {
  let j = 0;
  let dir = into.dir;
  while (j < rest.length && (rest[j] ?? "").startsWith("-")) {
    if (rest[j] === "-C") dir = joinDir(dir, rest[j + 1] ?? ".");
    j += GLOBAL_WITH_VALUE.has(rest[j] ?? "") ? 2 : 1;
  }
  const sub = rest[j];
  if (sub === undefined) return;
  if (sub.startsWith("$")) into.opaque = true;
  else {
    const args = rest.slice(j + 1);
    const line = into.line;
    into.invocations.push(dir === undefined ? { sub, args, line } : { sub, args, dir, line });
  }
}

/** A shell or `eval`: its script is more command text to resolve. */
function visitScript(base: string, rest: readonly string[], into: Collector): void {
  if (base === "eval") {
    merge(into, resolveGit(rest.join(" ")));
    return;
  }
  const c = rest.findIndex((t) => /^-[A-Za-z]*c[A-Za-z]*$/.test(t));
  const script = c >= 0 ? rest[c + 1] : undefined;
  if (script !== undefined) merge(into, resolveGit(script));
}

/** `cd <dir>`: later git commands run there (a `$`-built target is unknowable, so it is ignored). */
function visitCd(rest: readonly string[], into: Collector): void {
  const target = rest.find((t) => !t.startsWith("-"));
  if (target === undefined || /[$`]/.test(target) || target === "-") return;
  into.dir = joinDir(into.dir, target);
}

function visitSegment(tokens: readonly string[], into: Collector): void {
  const head = tokens[firstCommand(tokens)];
  if (head === undefined) return;
  const rest = tokens.slice(firstCommand(tokens) + 1);
  const base = basename(head);
  if (head.startsWith("$")) into.opaque = true;
  else if (base === "cd") visitCd(rest, into);
  else if (SHELLS.has(base) || base === "eval") visitScript(base, rest, into);
  else if (OPAQUE.has(base)) into.opaque = into.opaque || gitIndex(rest) >= 0;
  else if (base === "git") visitGit(rest, into);
  else visitWrapped(base, rest, into);
}

/** Wrapper with options (`sudo -E git …`, `timeout 5 git …`): resolve from the git token. */
function visitWrapped(base: string, rest: readonly string[], into: Collector): void {
  const at = gitIndex(rest);
  if (!DATA_ONLY.has(base) && at >= 0) visitSegment(rest.slice(at), into);
}

function merge(into: Collector, other: GitResolution): void {
  into.invocations.push(...other.invocations.map((g) => ({ ...g, line: into.line })));
  if (other.opaque) into.opaque = true;
}

/**
 * Every `git <sub> <args…>` the shell command may run: simple commands, wrapped ones (`env`,
 * `timeout`, `if … then`), `bash -c`/`eval` scripts and `$(…)` substitutions. Heredoc bodies are data.
 */
export function resolveGit(command: string): GitResolution {
  const into: Collector = { invocations: [], opaque: false, dir: undefined, line: 0 };
  let heredocEnd: string | undefined;
  const lines = splitLines(command);
  for (const [index, line] of lines.entries()) {
    into.line = index;
    if (heredocEnd !== undefined) {
      if (line.trim() === heredocEnd) heredocEnd = undefined;
      continue;
    }
    for (const segment of segments(line)) visitSegment(segment, into);
    for (const body of substitutions(live(line, false))) merge(into, resolveGit(body));
    heredocEnd = heredocDelimiter(line) ?? heredocEnd;
  }
  return into;
}
