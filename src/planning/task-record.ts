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

const HEADER = /^## (\S+) [—-] (.+)$/;
const SECTION_LINE = /^\*\*([^:*]+)(?::\*\*|\*\*:)\s*(.*)$/;
const STEP = /^\s*(?:\d+[.)]|[-*])\s+(.*)$/;
const STEPS_MIN = 3;
const STEPS_MAX = 7;
/** Words that stand in for a command or an observable result. */
const PLACEHOLDER =
  /^(?:(?:todo|tbd|tbc)\b.*|n\/?a|none|-|…|\.\.\.|works?|it works|passes|ok)\.?$/i;

const isSection = (name: string): name is Section => SECTIONS.some((s) => s === name);

type Sections = { readonly text: Map<Section, string>; readonly duplicates: Section[] };

/** Splits the body into section texts keyed by name; text may continue over several lines. */
function splitSections(lines: readonly string[]): Sections {
  const found = new Map<Section, string[]>();
  const duplicates: Section[] = [];
  let current: string[] | undefined;
  for (const line of lines) {
    const match = SECTION_LINE.exec(line);
    const name = match?.[1]?.trim();
    if (match !== null && name !== undefined && isSection(name)) {
      if (found.has(name)) duplicates.push(name);
      current = match[2] === "" ? [] : [match[2] ?? ""];
      found.set(name, current);
    } else current?.push(line);
  }
  const text = new Map([...found].map(([name, body]) => [name, body.join("\n").trim()] as const));
  return { text, duplicates };
}

type Located = { readonly id: string; readonly title: string; readonly lines: readonly string[] };

/** Every `## <id> — <title>` block; any other `## ` heading ends the block before it. */
function recordsIn(lines: readonly string[]): Located[] {
  const records: { id: string; title: string; lines: string[] }[] = [];
  let open: { id: string; title: string; lines: string[] } | undefined;
  for (const line of lines) {
    if (line.startsWith("## ")) {
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

const stripTicks = (text: string): string => text.replace(/^`+|`+$/g, "").trim();

const stepsOf = (text: string): string[] =>
  text.split("\n").flatMap((line) => {
    const item = STEP.exec(line)?.[1]?.trim();
    return item === undefined || item === "" ? [] : [item];
  });

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

/** Every readiness problem in the sections, so the author fixes them in one pass. */
function problemsOf(markdown: string, split: Sections): string[] {
  const sections = split.text;
  const problems: string[] = [];
  if (split.duplicates.length > 0) {
    problems.push(`duplicate section: ${[...new Set(split.duplicates)].join(", ")}`);
  }
  const missing = SECTIONS.filter((s) => get(sections, s) === "");
  if (missing.length > 0) problems.push(`missing section: ${missing.join(", ")}`);
  if (/\bTBD\b/.test(markdown)) problems.push("contains TBD; decide it or split the task");
  const steps = stepsOf(get(sections, "Steps"));
  if (!missing.includes("Steps") && (steps.length < STEPS_MIN || steps.length > STEPS_MAX)) {
    problems.push(`Steps must be ${STEPS_MIN}-${STEPS_MAX} steps, found ${steps.length}`);
  }
  for (const name of ["Run", "Expected"] as const) {
    const why = missing.includes(name) ? undefined : concrete(name, get(sections, name));
    if (why !== undefined) problems.push(why);
  }
  return problems;
}

const filesOf = (text: string): string[] =>
  text
    .split(/[,\n]/)
    .map((f) => stripTicks(f.trim()))
    .filter((f) => f !== "");

const NO_HEADER = "header must be `## <id> — <title>` (an id, an em dash, then the title)";

function locate(markdown: string, id: string | undefined): Located | ParseError {
  const records = recordsIn(markdown.split("\n"));
  const names = records.map((r) => r.id).join(", ");
  if (id !== undefined) {
    return (
      records.find((r) => r.id === id) ??
      parseError(`no task record "${id}" (found: ${names || "none"})`)
    );
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
  const problems = problemsOf(found.lines.join("\n"), split);
  if (problems.length > 0) return parseError(problems.join("; "));
  const text = (s: Section): string => get(split.text, s);
  return {
    id: found.id,
    title: found.title,
    goal: text("Goal"),
    files: filesOf(text("Files")),
    interfaces: text("Interfaces"),
    firstFailingTest: text("First failing test"),
    steps: stepsOf(text("Steps")),
    run: stripTicks(text("Run")),
    expected: text("Expected"),
    outOfScope: text("Out of scope"),
  };
}
