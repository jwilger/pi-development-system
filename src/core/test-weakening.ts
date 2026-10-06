import { posix } from "node:path";
import { parseShell } from "./shell-parse.ts";

export type WeakeningSignals = { addsSkip: boolean; emptied: boolean; commentedOut: boolean };

const SKIP_MARKERS: readonly RegExp[] = [
  /\b(?:it|test|describe|context)\.(?:skip|only)\b/g,
  /\b(?:this|t|self|ctx)\.skip\(/g,
  /\bskip:\s*true\b/g,
  /\bskipTest\(/g,
  /(?<![.\w])f(?:it|describe)\(/g,
  /(?<![.\w])x(?:it|describe|test)\(/g,
  /#\[ignore\b/g,
  /@pytest\.mark\.(?:skip|skipif|xfail)|@unittest\.skip|\bpytest\.skip\(/g,
  /\bt\.Skip(?:Now|f)?\(/g,
  /@Disabled\b|@Ignore\b/g,
];

const countSkips = (text: string): number =>
  SKIP_MARKERS.reduce((n, re) => n + [...text.matchAll(re)].length, 0);

/** Lines that are neither blank, inside a C-style block comment, nor a line comment. */
function codeLineCount(text: string): number {
  let inBlock = false;
  let count = 0;
  for (const raw of text.split("\n")) {
    let line = raw.trim();
    let code = false;
    while (line !== "") {
      if (inBlock) {
        const end = line.indexOf("*/");
        if (end < 0) break;
        inBlock = false;
        line = line.slice(end + 2).trim();
      } else if (line.startsWith("//") || line.startsWith("#")) {
        break;
      } else if (line.startsWith("/*")) {
        inBlock = true;
        line = line.slice(2);
      } else {
        // A `/*` after code is more likely inside a string than a comment opener.
        code = true;
        break;
      }
    }
    if (code) count++;
  }
  return count;
}

const LINE_COMMENT = /^(?:\/\/+|#+|--|;+)\s?(.*)$/;

/** True when a line that was live code before survives only as a line comment after. */
function lineCommentedOut(before: string, after: string): boolean {
  const live = new Set(after.split("\n").map((l) => l.trim()));
  const beforeLines = new Set(before.split("\n").map((l) => l.trim()));
  return after.split("\n").some((raw) => {
    const rest = LINE_COMMENT.exec(raw.trim())?.[1]?.trim();
    return rest !== undefined && rest.length > 3 && beforeLines.has(rest) && !live.has(rest);
  });
}

/** Deterministic weakening signals between two versions of a test file. */
export function weakeningSignals(before: string, after: string): WeakeningSignals {
  return {
    addsSkip: countSkips(after) > countSkips(before),
    emptied: before.trim() !== "" && after.trim() === "",
    commentedOut:
      lineCommentedOut(before, after) ||
      (codeLineCount(after) < codeLineCount(before) && isPureAddition(before, after)),
  };
}

/** LF line endings and no trailing whitespace, so matching tolerates what pi's edit tool tolerates. */
export const normalizeText = (text: string): string =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

/**
 * Applies `edits` to normalised `content` (first occurrence each, in order). `undefined` when an
 * edit does not match, so callers can hand the change to a judge instead of assuming "no change".
 */
export function applyEdits(
  content: string,
  edits: ReadonlyArray<{ oldText: string; newText: string }>,
): string | undefined {
  let text = normalizeText(content);
  for (const e of edits) {
    const old = normalizeText(e.oldText);
    const at = old === "" ? -1 : text.indexOf(old);
    if (at < 0) return undefined;
    text = text.slice(0, at) + normalizeText(e.newText) + text.slice(at + old.length);
  }
  return text;
}

/** True when every line of `before` still appears (with multiplicity) in `after`. */
export function isPureAddition(before: string, after: string): boolean {
  const remaining = new Map<string, number>();
  for (const line of after.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
  for (const line of before.split("\n")) {
    const left = remaining.get(line) ?? 0;
    if (left === 0) return false;
    remaining.set(line, left - 1);
  }
  return true;
}

/** Lines of `after` not matched by a line of `before` (multiset difference, order preserved). */
export function addedLines(before: string, after: string): string[] {
  const remaining = new Map<string, number>();
  for (const line of before.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
  return after.split("\n").filter((line) => {
    const left = remaining.get(line) ?? 0;
    if (left === 0) return true;
    remaining.set(line, left - 1);
    return false;
  });
}

type Segment = { words: string[]; truncates: string[] };
type Token = { kind: "word"; value: string } | { kind: "op"; op: string };

/** Turns unquoted newlines into `;` (and joins backslash continuations) so shell-quote sees every command. */
function splitLines(command: string): string {
  let out = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < command.length; i++) {
    const c = command.charAt(i);
    if (quote === undefined && c === "\\" && command.charAt(i + 1) === "\n") {
      out += " ";
      i++;
    } else if (quote === undefined && c === "\\") {
      out += c + command.charAt(i + 1);
      i++;
    } else if (quote === undefined && (c === "'" || c === '"')) {
      quote = c;
      out += c;
    } else if (quote === c) {
      quote = undefined;
      out += c;
    } else if (quote === undefined && c === "\n") {
      out += ";";
    } else out += c;
  }
  return out;
}

/** Boundary decode of shell-quote's output into domain tokens; globs count as words. */
function tokenize(command: string): Token[] {
  return parseShell(splitLines(command)).flatMap((entry): Token[] => {
    if (typeof entry === "string") return [{ kind: "word", value: entry }];
    if ("pattern" in entry) return [{ kind: "word", value: entry.pattern }];
    if ("op" in entry) return [{ kind: "op", op: entry.op }];
    return [];
  });
}

const TRUNCATING = new Set([">", ">|", "&>"]);
const NON_TRUNCATING_REDIRECTS = new Set([">>", "&>>", "<", ">&", "<&"]);

/** Splits a shell line into simple commands; `>` targets are kept apart from arguments. */
function segments(command: string): Segment[] {
  const out: Segment[] = [];
  let words: string[] = [];
  let truncates: string[] = [];
  let redirect: "none" | "truncate" | "other" = "none";
  const flush = () => {
    if (words.length > 0 || truncates.length > 0) out.push({ words, truncates });
    words = [];
    truncates = [];
    redirect = "none";
  };
  for (const token of tokenize(command)) {
    if (token.kind === "word") {
      if (redirect === "truncate") truncates.push(token.value);
      else if (redirect === "none") words.push(token.value);
      redirect = "none";
    } else if (TRUNCATING.has(token.op)) redirect = "truncate";
    else if (NON_TRUNCATING_REDIRECTS.has(token.op)) redirect = "other";
    else flush();
  }
  flush();
  return out;
}

const WRAPPERS = new Set(["sudo", "env", "command", "nohup", "nice", "time", "exec", "doas"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash"]);
const KNOWN = new Set([
  ...WRAPPERS,
  ...SHELLS,
  "rm",
  "unlink",
  "trash",
  "rmdir",
  "mv",
  "git",
  "truncate",
  "find",
  "sed",
  "tee",
  "cp",
  "dd",
  "cd",
  "eval",
]);

const base = (word: string): string => word.slice(word.lastIndexOf("/") + 1);
const operands = (words: readonly string[]): string[] => words.filter((w) => !w.startsWith("-"));

const KEYWORDS = new Set(["then", "do", "else", "elif", "if", "while", "until", "{", "!"]);

/** Strips env assignments, shell keywords and wrappers so the real command is first. */
function realCommand(words: readonly string[]): string[] {
  let rest = [...words];
  for (;;) {
    const head = rest[0];
    if (head === undefined) return rest;
    if (/^\w+=/.test(head) || KEYWORDS.has(head)) rest = rest.slice(1);
    else if (base(head) === "timeout") {
      const at = rest.findIndex((w, i) => i > 0 && /^\d+[smhd]?$/.test(w));
      rest = at < 0 ? [] : rest.slice(at + 1);
    } else if (WRAPPERS.has(base(head))) {
      const next = rest.findIndex((w, i) => i > 0 && KNOWN.has(base(w)) && !WRAPPERS.has(base(w)));
      const nextWrapper = rest.findIndex((w, i) => i > 0 && WRAPPERS.has(base(w)));
      if (nextWrapper > 0 && (next < 0 || nextWrapper < next)) rest = rest.slice(nextWrapper);
      else return next > 0 ? rest.slice(next) : [];
    } else return rest;
  }
}

function findTargets(args: readonly string[]): string[] {
  const deletes =
    args.includes("-delete") || (args.includes("-exec") && args.some((a) => base(a) === "rm"));
  if (!deletes) return [];
  const starts: string[] = [];
  for (const a of args) {
    if (a.startsWith("-") || a === "(" || a === "!") break;
    starts.push(a);
  }
  const patterns = args.flatMap((a, i) =>
    ["-name", "-iname", "-path", "-ipath", "-regex"].includes(a) && args[i + 1] !== undefined
      ? [args[i + 1] ?? ""]
      : [],
  );
  // With name patterns the start directory is only where to look, not what is deleted.
  return patterns.length > 0 ? patterns : starts;
}

const removers = (args: readonly string[]): string[] => operands(args);

/** `mv src… dir/`: the trailing-slash destination is a directory receiving files, not a removal. */
const moveSources = (args: readonly string[]): string[] => {
  const ops = operands(args);
  return ops.length > 1 && ops.at(-1)?.endsWith("/") ? ops.slice(0, -1) : ops;
};

export type MutationKind = "remove" | "overwrite";
export type Mutation = { readonly path: string; readonly kind: MutationKind };

/** Commands whose targets cease to exist (or are emptied); every other target is rewritten in place. */
const REMOVING = new Set(["rm", "unlink", "trash", "rmdir", "mv", "truncate", "find", "git"]);

const gitTargets = (args: readonly string[]): string[] => {
  let i = 0;
  while (args[i]?.startsWith("-")) i += args[i] === "-C" || args[i] === "-c" ? 2 : 1;
  const sub = args[i];
  return sub === "rm" || sub === "mv" ? operands(args.slice(i + 1)) : [];
};

const teeTargets = (args: readonly string[]): string[] =>
  args.some((a) => a === "-a" || a === "--append") ? [] : operands(args);

const sedTargets = (args: readonly string[]): string[] => {
  if (!args.some((a) => /^-[A-Za-z]*i|^--in-place/.test(a))) return [];
  // Without -e/-f the first operand is the script, not a file.
  const scripted = args.some((a) => /^-[A-Za-z]*[ef]$|^--(?:expression|file)/.test(a));
  return scripted ? operands(args) : operands(args).slice(1);
};

/** The destination operand is overwritten, whatever the source is. */
const cpTargets = (args: readonly string[]): string[] => operands(args).slice(-1);

const ddTargets = (args: readonly string[]): string[] =>
  args.flatMap((a) => (a.startsWith("of=") ? [a.slice(3)] : []));

const truncateTargets = (args: readonly string[]): string[] =>
  operands(args).filter((a) => !/^[+\-<>/%]?\d+$/.test(a));

const TARGETS: Readonly<Record<string, (args: readonly string[]) => string[]>> = {
  rm: removers,
  unlink: removers,
  trash: removers,
  rmdir: removers,
  mv: moveSources,
  tee: teeTargets,
  truncate: truncateTargets,
  find: findTargets,
  sed: sedTargets,
  cp: cpTargets,
  dd: ddTargets,
  git: gitTargets,
};

function commandTargets(words: readonly string[]): Mutation[] {
  const [head, ...args] = words;
  if (head === undefined) return [];
  const name = base(head);
  const targets = Object.hasOwn(TARGETS, name) ? TARGETS[name] : undefined;
  const kind: MutationKind = REMOVING.has(name) ? "remove" : "overwrite";
  return targets === undefined ? [] : targets(args).map((path) => ({ path, kind }));
}

const joinCwd = (cwd: string, path: string): string =>
  cwd === "" || path.startsWith("/") ? path : posix.join(cwd, path);

/** With these (or nothing) as the command, a `>` redirect empties its target. */
const PRODUCES_NOTHING = new Set(["", ":", "true", "false"]);

function collect(command: string, startCwd: string, depth: number): Mutation[] {
  const found: Mutation[] = [];
  let cwd = startCwd;
  for (const seg of segments(command)) {
    const words = realCommand(seg.words);
    const head = words[0] === undefined ? "" : base(words[0]);
    if (head === "cd") {
      const target = operands(words.slice(1))[0] ?? "~";
      // A computed directory cannot be resolved statically; keep the current one.
      if (!/[$`]/.test(target)) cwd = joinCwd(cwd, target);
      continue;
    }
    if (head === "eval" && depth < 3) {
      found.push(...collect(words.slice(1).join(" "), cwd, depth + 1));
      continue;
    }
    if (SHELLS.has(head) && depth < 3) {
      const at = words.findIndex((w, i) => i > 0 && /^-[A-Za-z]*c$/.test(w));
      const script = at < 0 ? undefined : words[at + 1];
      if (script !== undefined) found.push(...collect(script, cwd, depth + 1));
      continue;
    }
    const redirectKind: MutationKind = PRODUCES_NOTHING.has(head) ? "remove" : "overwrite";
    found.push(...commandTargets(words).map((m) => ({ ...m, path: joinCwd(cwd, m.path) })));
    found.push(
      ...seg.truncates.flatMap((p): Mutation[] =>
        p === "/dev/null" ? [] : [{ path: joinCwd(cwd, p), kind: redirectKind }],
      ),
    );
  }
  return found;
}

/**
 * Paths a bash command removes, moves away, truncates or overwrites (best effort): rm/unlink/mv,
 * `git rm|mv`, `find -delete`, truncate, `sed -i`, tee and `>` redirects; sees through wrappers,
 * `bash -c`, `cd` and glob arguments.
 */
export function bashMutations(command: string): Mutation[] {
  return collect(command, "", 0);
}

export function bashMutatedPaths(command: string): string[] {
  return bashMutations(command).map((m) => m.path);
}
