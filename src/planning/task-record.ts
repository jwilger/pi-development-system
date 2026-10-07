import { isParseError, type ParseError, parseError } from "../core/types.ts";

/** Appendix C of the plan: the one-task-per-implementer format a weaker model can follow. */
export type TaskRecord = {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly files: readonly string[];
  readonly interfaces: string;
  readonly firstFailingTest: string;
  readonly steps: readonly string[];
  readonly run: string;
  readonly expected: string;
  readonly outOfScope: string;
};

const SECTIONS = [
  "Goal",
  "Files",
  "Interfaces",
  "First failing test",
  "Steps",
  "Run",
  "Expected",
  "Out of scope",
] as const;
type Section = (typeof SECTIONS)[number];

const HEADER = /^## (\S+) [—-] (\S.*?)\s*$/;
const SECTION_LINE = /^\*\*([^:*]+)(?::\*\*|\*\*:)\s*(.*)$/;
/** Top-level list items only (CommonMark allows up to three spaces of indent); deeper items belong to the step above. */
const STEP = /^ {0,3}(?:\d+[.)]|[-*+])\s+(.*)$/;
const STEPS_MIN = 3;
const STEPS_MAX = 7;
/** Words that stand in for a command or an observable result. */
const PLACEHOLDER =
  /^(?:(?:tbd|tbc)\b.*|todo\s*(?::.*)?|n\/?a|none|-|…|\.\.\.|works?|it works|passes|ok)\.?$/i;

const isSection = (name: string): name is Section => SECTIONS.some((s) => s === name);

const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;
const HEADING = /^#{1,6}\s/;

/** Opening fence: its character and length. Backtick fences cannot carry backticks in the info string. */
const opening = (line: string): { char: string; length: number } | undefined => {
  const m = FENCE_LINE.exec(line);
  const run = m?.[1];
  if (run === undefined || (run.startsWith("`") && (m?.[2] ?? "").includes("`"))) return undefined;
  return { char: run.slice(0, 1), length: run.length };
};

/** A closing fence repeats the opening character at least as many times and carries no text. */
const closes = (line: string, open: { char: string; length: number }): boolean => {
  const m = FENCE_LINE.exec(line);
  const run = m?.[1];
  return (
    run?.startsWith(open.char) === true && run.length >= open.length && (m?.[2] ?? "").trim() === ""
  );
};

/** For each line, whether it sits inside (or on the edge of) a fenced code block, as CommonMark reads fences. */
const fencedFlags = (lines: readonly string[]): boolean[] => {
  let open: { char: string; length: number } | undefined;
  return lines.map((line) => {
    if (open === undefined) {
      open = opening(line);
      return open !== undefined;
    }
    if (closes(line, open)) open = undefined;
    return true;
  });
};

type Sections = { readonly text: Map<Section, string>; readonly duplicates: Section[] };

/** Splits the body into section texts keyed by name; text may continue over several lines. */
function splitSections(lines: readonly string[]): Sections {
  const found = new Map<Section, string[]>();
  const duplicates: Section[] = [];
  let current: string[] | undefined;
  const fenced = fencedFlags(lines);
  for (const [at, line] of lines.entries()) {
    const match = fenced[at] === true ? null : SECTION_LINE.exec(line);
    const name = match?.[1]?.trim();
    if (match !== null && name !== undefined && isSection(name)) {
      if (found.has(name)) duplicates.push(name);
      current = match[2] === "" ? [] : [match[2] ?? ""];
      found.set(name, current);
    } else current?.push(line);
  }
  // Leading indentation is kept so the first list item of a section is read like the others.
  const text = new Map(
    [...found].map(
      ([name, body]) =>
        [
          name,
          body
            .join("\n")
            .replace(/^\s*\n/, "")
            .trimEnd(),
        ] as const,
    ),
  );
  return { text, duplicates };
}

type Located = { readonly id: string; readonly title: string; readonly lines: readonly string[] };

/** Every `## <id> — <title>` block; any other heading (outside code fences) ends the block before it. */
function recordsIn(lines: readonly string[]): Located[] {
  const records: { id: string; title: string; lines: string[] }[] = [];
  let open: { id: string; title: string; lines: string[] } | undefined;
  const fenced = fencedFlags(lines);
  for (const [at, line] of lines.entries()) {
    if (fenced[at] !== true && HEADING.test(line)) {
      const header = HEADER.exec(line);
      open =
        header === null
          ? undefined
          : { id: header[1] ?? "", title: header[2]?.trim() ?? "", lines: [] };
      if (open !== undefined) records.push(open);
    } else open?.lines.push(line);
  }
  return records;
}

/** A command or result without its backticks, or the body of a fenced block (its info string dropped). */
const stripTicks = (text: string): string => {
  const lines = text.split("\n");
  const fence = opening(lines[0] ?? "");
  if (fence !== undefined) {
    const body = lines.slice(1);
    if (closes(body.at(-1) ?? "", fence)) body.pop();
    return body.join("\n").trim();
  }
  const trimmed = text.trim();
  if (/^`+$/.test(trimmed)) return "";
  // Only a text that is one code span is unwrapped; anything else is kept whole, ticks and all.
  const whole = /^(`+)([^`]+)\1$/.exec(trimmed);
  return whole?.[2]?.trim() ?? trimmed;
};

const stepsOf = (text: string): string[] => {
  const lines = text.split("\n");
  const fenced = fencedFlags(lines);
  // The first item sets the list's indent; an item two or more columns deeper is nested under a step.
  let base: number | undefined;
  return lines.flatMap((line, at) => {
    const item = fenced[at] === true ? undefined : STEP.exec(line)?.[1]?.trim();
    if (item === undefined || item === "") return [];
    const indent = line.length - line.trimStart().length;
    base ??= indent;
    return indent >= base + 2 ? [] : [item];
  });
};

function concrete(name: "Run" | "Expected", text: string): string | undefined {
  const bare = stripTicks(text);
  if (bare === "" || PLACEHOLDER.test(bare))
    return `${name} must be a concrete ${name === "Run" ? "command" : "observable result"}, not "${bare}"`;
  if (name === "Expected" && bare.split(/\s+/).length < 2) {
    return "Expected must say what is observed (at least two words, e.g. a count, output or exit status)";
  }
  return undefined;
}

const get = (sections: ReadonlyMap<Section, string>, s: Section): string => sections.get(s) ?? "";
const got = (sections: ReadonlyMap<Section, string>, s: Section): string => get(sections, s).trim();

/** Every readiness problem in the sections, so the author fixes them in one pass. */
function problemsOf(markdown: string, split: Sections): string[] {
  const sections = split.text;
  const problems: string[] = [];
  if (split.duplicates.length > 0) {
    problems.push(`duplicate section: ${[...new Set(split.duplicates)].join(", ")}`);
  }
  const missing = SECTIONS.filter((s) => got(sections, s) === "");
  if (missing.length > 0) problems.push(`missing section: ${missing.join(", ")}`);
  if (/\bTBD\b/.test(markdown)) problems.push("contains TBD; decide it or split the task");
  const steps = stepsOf(get(sections, "Steps"));
  if (!missing.includes("Steps") && (steps.length < STEPS_MIN || steps.length > STEPS_MAX)) {
    problems.push(`Steps must be ${STEPS_MIN}-${STEPS_MAX} steps, found ${steps.length}`);
  }
  for (const name of ["Run", "Expected"] as const) {
    const why = missing.includes(name) ? undefined : concrete(name, got(sections, name));
    if (why !== undefined) problems.push(why);
  }
  return problems;
}

const filesOf = (text: string): string[] =>
  text
    .split(/[,\n]/)
    .map((f) => stripTicks(f.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, "")))
    .filter((f) => f !== "");

const NO_HEADER = "header must be `## <id> — <title>` (an id, an em dash, then the title)";

function locate(markdown: string, id: string | undefined): Located | ParseError {
  const records = recordsIn(markdown.split("\n"));
  const names = records.map((r) => r.id).join(", ");
  if (id !== undefined) {
    const named = records.filter((r) => r.id === id);
    const [first] = named;
    if (first === undefined)
      return parseError(`no task record "${id}" (found: ${names || "none"})`);
    return named.length === 1
      ? first
      : parseError(`task record "${id}" appears ${named.length} times; ids must be unique`);
  }
  const [only, ...rest] = records;
  if (only === undefined) return parseError(NO_HEADER);
  return rest.length === 0
    ? only
    : parseError(`the file holds ${records.length} task records (${names}); name the one to check`);
}

/** Parses one task record (the only one in the file, or the one named by `id`), reporting every problem together. */
export function parseTaskRecord(markdown: string, id?: string): TaskRecord | ParseError {
  const found = locate(markdown.replace(/\r\n?/g, "\n"), id);
  if (isParseError(found)) return found;
  const split = splitSections(found.lines);
  const problems = problemsOf(`${found.id} ${found.title}\n${found.lines.join("\n")}`, split);
  if (problems.length > 0) return parseError(problems.join("; "));
  const text = (s: Section): string => got(split.text, s);
  return {
    id: found.id,
    title: found.title,
    goal: text("Goal"),
    files: filesOf(text("Files")),
    interfaces: text("Interfaces"),
    firstFailingTest: text("First failing test"),
    steps: stepsOf(get(split.text, "Steps")),
    run: stripTicks(text("Run")),
    expected: text("Expected"),
    outOfScope: text("Out of scope"),
  };
}
