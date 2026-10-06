/** Pure detector for lint/type-check suppressions that carry no written reason (gate `lints.suppression`). */

export type Suppression = {
  /** 1-based line in the text the suppression was found in. */
  readonly line: number;
  readonly marker: string;
  readonly text: string;
};

/** A reason shorter than this says nothing a reader could use. */
export const MIN_RATIONALE = 15;

type Kind = {
  readonly marker: string;
  readonly pattern: RegExp;
  /** The reason written on the marker's own line, if any. */
  readonly inline: (line: string, after: string) => string | undefined;
};

const lastGroup = (re: RegExp, text: string): string | undefined => re.exec(text)?.[1];

const KINDS: readonly Kind[] = [
  {
    marker: "#[allow(",
    pattern: /#!?\[allow\(/,
    inline: (line, after) =>
      lastGroup(/reason\s*=\s*"([^"]*)"/, line) ??
      lastGroup(/\)\]\s*\/\/\s*(.+)$/, after) ??
      lastGroup(/\)\]\s*\/\*\s*(.+?)\s*\*\/\s*$/, after),
  },
  {
    marker: "#![allow(",
    pattern: /#!\[allow\(/,
    inline: (line) => lastGroup(/reason\s*=\s*"([^"]*)"/, line),
  },
  {
    marker: "#[expect(",
    pattern: /#!?\[expect\(/,
    inline: (line, after) =>
      lastGroup(/reason\s*=\s*"([^"]*)"/, line) ?? lastGroup(/\)\]\s*\/\/\s*(.+)$/, after),
  },
  {
    marker: "biome-ignore",
    pattern: /\/\/\s*biome-ignore(?:-all|-start|-end)?\b/,
    inline: (_line, after) => lastGroup(/:\s*(.+)$/, after),
  },
  {
    marker: "eslint-disable",
    pattern: /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b/,
    inline: (_line, after) => lastGroup(/(?:\s--\s+|:\s+)(.+?)(?:\s*\*\/)?\s*$/, after),
  },
  {
    marker: "@ts-ignore",
    pattern: /@ts-ignore\b/,
    inline: (_line, after) => lastGroup(/^\s*:?\s*(.+?)(?:\s*\*\/)?\s*$/, after),
  },
  {
    marker: "@ts-expect-error",
    pattern: /@ts-expect-error\b/,
    inline: (_line, after) => lastGroup(/^\s*:?\s*(.+?)(?:\s*\*\/)?\s*$/, after),
  },
  {
    marker: "@ts-nocheck",
    pattern: /@ts-nocheck\b/,
    inline: (_line, after) => lastGroup(/^\s*:?\s*(.+?)(?:\s*\*\/)?\s*$/, after),
  },
];

// `#` opens a comment in shell/Python, but `#[` / `#!` start Rust attributes and shebangs.
const COMMENT_LINE = /^\s*(?:\/\/+|\/\*+|\*|#+(?![[!]))\s*(.*?)(?:\s*\*\/)?\s*$/;

const isSuppressionLine = (line: string): boolean => KINDS.some((k) => k.pattern.test(line));

/** Prose of a neighbouring comment line, unless that line is itself a suppression marker. */
function neighbourReason(line: string | undefined): string | undefined {
  if (line === undefined || isSuppressionLine(line)) return undefined;
  return COMMENT_LINE.exec(line)?.[1];
}

const long = (reason: string | undefined): boolean =>
  reason !== undefined && reason.trim().length >= MIN_RATIONALE;

function kindOf(line: string): Kind | undefined {
  // `#![allow(` also matches the `#[allow(` shape; the inner form is more specific and wins.
  const matched = KINDS.filter((k) => k.pattern.test(line));
  return matched.find((k) => k.marker === "#![allow(") ?? matched[0];
}

/** A rustfmt-wrapped `#[allow(\n  lint,\n  reason = "...",\n)]`: the reason sits on a later line. */
function wrappedReason(lines: readonly string[], index: number): boolean {
  const attr = lines.slice(index, index + 8);
  const end = attr.findIndex((l) => l.includes(")]"));
  const text = (end < 0 ? attr : attr.slice(0, end + 1)).join(" ");
  return long(lastGroup(/reason\s*=\s*"([^"]*)"/, text));
}

function reasonOf(kind: Kind, lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (/^\s*#!?\[(?:allow|expect)\(\s*$/.test(line) && wrappedReason(lines, index)) return true;
  const match = kind.pattern.exec(line);
  const after = match === null ? "" : line.slice(match.index + match[0].length);
  return (
    long(kind.inline(line, after)) ||
    long(neighbourReason(lines[index + 1])) ||
    long(neighbourReason(lines[index - 1]))
  );
}

/** Every suppression in `text` whose reason is missing or under {@link MIN_RATIONALE} characters. */
function unreasoned(text: string): Suppression[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index): Suppression[] => {
    const kind = kindOf(line);
    if (kind === undefined || reasonOf(kind, lines, index)) return [];
    return [{ line: index + 1, marker: kind.marker, text: line.trim() }];
  });
}

/**
 * Unreasoned suppressions that `after` adds relative to `before`: a suppression whose text already
 * occurred (as often) in `before` is not new, so touching a file never re-flags old debt.
 */
export function findUnreasonedSuppressions(before: string, after: string): Suppression[] {
  const known = new Map<string, number>();
  for (const s of unreasoned(before)) known.set(s.text, (known.get(s.text) ?? 0) + 1);
  return unreasoned(after).filter((s) => {
    const left = known.get(s.text) ?? 0;
    if (left === 0) return true;
    known.set(s.text, left - 1);
    return false;
  });
}
