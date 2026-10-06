import { parse } from "shell-quote";

export type WeakeningSignals = { addsSkip: boolean; emptied: boolean };

const SKIP_MARKERS: readonly RegExp[] = [
  /\b(?:it|test|describe|context)\.(?:skip|todo)\b/,
  /\bx(?:it|describe|test)\(/,
  /#\[ignore\b/,
  /@pytest\.mark\.skip|@unittest\.skip|\bpytest\.skip\(/,
  /\bt\.Skip(?:Now|f)?\(/,
  /@Disabled\b|@Ignore\b/,
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

const DELETERS = new Set(["rm", "unlink", "trash", "rmdir"]);

/** Paths a bash command removes via rm / unlink / `git rm` (best effort, per simple command). */
export function bashDeletedPaths(command: string): string[] {
  const paths: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const head = current[0] === "git" && current[1] === "rm" ? "rm" : current[0];
    const args = current[0] === "git" ? current.slice(2) : current.slice(1);
    if (head !== undefined && DELETERS.has(head)) {
      paths.push(...args.filter((a) => !a.startsWith("-")));
    }
    current = [];
  };
  for (const token of parse(command)) {
    if (typeof token === "string") current.push(token);
    else flush();
  }
  flush();
  return paths;
}
