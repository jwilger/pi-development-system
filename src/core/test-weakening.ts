import { posix } from "node:path";
import { parse } from "shell-quote";

export type WeakeningSignals = { addsSkip: boolean; emptied: boolean };

const SKIP_MARKERS: readonly RegExp[] = [
  /\b(?:it|test|describe|context)\.(?:skip|todo)\b/,
  /\bx(?:it|describe|test)\(/,
  /#\[ignore\b/,
  /@pytest\.mark\.skip|@unittest\.skip|\bpytest\.skip\(/,
  /\bt\.Skip(?:Now|f)?\(/,
  /@Disabled\b|@Ignore\b/,
  /\bprocess\.exit\(/,
];

const countSkips = (text: string): number =>
  SKIP_MARKERS.reduce((n, re) => n + (text.match(new RegExp(re.source, "g"))?.length ?? 0), 0);

/** Deterministic weakening signals between two versions of a test file. */
export function weakeningSignals(before: string, after: string): WeakeningSignals {
  return {
    addsSkip: countSkips(after) > countSkips(before),
    emptied: before.trim() !== "" && after.trim() === "",
  };
}

/** Applies `edits` to `content` (first occurrence each, in order); unmatched edits are ignored. */
export function applyEdits(
  content: string,
  edits: ReadonlyArray<{ oldText: string; newText: string }>,
): string {
  return edits.reduce((text, e) => {
    const at = text.indexOf(e.oldText);
    return at < 0 ? text : text.slice(0, at) + e.newText + text.slice(at + e.oldText.length);
  }, content);
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

type Segment = { words: string[]; truncates: string[] };
type Token = { kind: "word"; value: string } | { kind: "op"; op: string };

/** Boundary decode of shell-quote's output into domain tokens; globs count as words. */
function tokenize(command: string): Token[] {
  return parse(command).flatMap((entry): Token[] => {
    if (typeof entry === "string") return [{ kind: "word", value: entry }];
    if ("pattern" in entry) return [{ kind: "word", value: entry.pattern }];
    if ("op" in entry) return [{ kind: "op", op: entry.op }];
    return [];
  });
}

const TRUNCATING = new Set([">", ">|"]);
const NON_TRUNCATING_REDIRECTS = new Set([">>", "<", ">&", "<&"]);

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
  "cd",
]);

const base = (word: string): string => word.slice(word.lastIndexOf("/") + 1);
const operands = (words: readonly string[]): string[] => words.filter((w) => !w.startsWith("-"));

/** Strips env assignments and wrappers so the real command is first. */
function realCommand(words: readonly string[]): string[] {
  let rest = [...words];
  for (;;) {
    while (rest[0] !== undefined && /^\w+=/.test(rest[0])) rest = rest.slice(1);
    const head = rest[0];
    if (head === undefined || !WRAPPERS.has(base(head))) return rest;
    const next = rest.findIndex((w, i) => i > 0 && KNOWN.has(base(w)) && !WRAPPERS.has(base(w)));
    const nextWrapper = rest.findIndex((w, i) => i > 0 && WRAPPERS.has(base(w)));
    if (nextWrapper > 0 && (next < 0 || nextWrapper < next)) rest = rest.slice(nextWrapper);
    else if (next > 0) return rest.slice(next);
    else return [];
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
  return [...starts, ...patterns];
}

const removers = (args: readonly string[]): string[] => operands(args);

const gitTargets = (args: readonly string[]): string[] => {
  let i = 0;
  while (args[i]?.startsWith("-")) i += args[i] === "-C" || args[i] === "-c" ? 2 : 1;
  const sub = args[i];
  return sub === "rm" || sub === "mv" ? operands(args.slice(i + 1)) : [];
};

const sedTargets = (args: readonly string[]): string[] =>
  args.some((a) => /^-[A-Za-z]*i|^--in-place/.test(a)) ? operands(args) : [];

const cpTargets = (args: readonly string[]): string[] =>
  args.includes("/dev/null") ? operands(args).slice(-1) : [];

const truncateTargets = (args: readonly string[]): string[] =>
  operands(args).filter((a) => !/^[+\-<>/%]?\d+$/.test(a));

const TARGETS: Readonly<Record<string, (args: readonly string[]) => string[]>> = {
  rm: removers,
  unlink: removers,
  trash: removers,
  rmdir: removers,
  mv: removers,
  tee: removers,
  truncate: truncateTargets,
  find: findTargets,
  sed: sedTargets,
  cp: cpTargets,
  git: gitTargets,
};

function commandTargets(words: readonly string[]): string[] {
  const [head, ...args] = words;
  if (head === undefined) return [];
  const targets = Object.hasOwn(TARGETS, base(head)) ? TARGETS[base(head)] : undefined;
  return targets === undefined ? [] : targets(args);
}

const joinCwd = (cwd: string, path: string): string =>
  cwd === "" || path.startsWith("/") ? path : posix.join(cwd, path);

function collect(command: string, startCwd: string, depth: number): string[] {
  const found: string[] = [];
  let cwd = startCwd;
  for (const seg of segments(command)) {
    const words = realCommand(seg.words);
    const head = words[0] === undefined ? "" : base(words[0]);
    if (head === "cd" && words[1] !== undefined) {
      cwd = joinCwd(cwd, words[1]);
      continue;
    }
    if (SHELLS.has(head) && depth < 3) {
      const at = words.findIndex((w, i) => i > 0 && /^-[A-Za-z]*c$/.test(w));
      const script = at < 0 ? undefined : words[at + 1];
      if (script !== undefined) found.push(...collect(script, cwd, depth + 1));
      continue;
    }
    found.push(...commandTargets(words).map((p) => joinCwd(cwd, p)));
    found.push(...seg.truncates.flatMap((p) => (p === "/dev/null" ? [] : [joinCwd(cwd, p)])));
  }
  return found;
}

/**
 * Paths a bash command removes, moves away, truncates or overwrites (best effort): rm/unlink/mv,
 * `git rm|mv`, `find -delete`, truncate, `sed -i`, tee and `>` redirects; sees through wrappers,
 * `bash -c`, `cd` and glob arguments.
 */
export function bashMutatedPaths(command: string): string[] {
  return collect(command, "", 0);
}
