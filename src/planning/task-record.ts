import { type ParseError, parseError } from "../core/types.ts";

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
const SECTION_LINE = /^\*\*([^:*]+):\*\*\s*(.*)$/;
const STEP = /^\s*(?:\d+[.)]|[-*])\s+(.*)$/;
const STEPS_MIN = 3;
const STEPS_MAX = 7;
/** Words that stand in for a command or an observable result. */
const PLACEHOLDER = /^(?:n\/?a|none|todo|tbc|-|…|\.\.\.|works?|it works|passes|ok)\.?$/i;

const isSection = (name: string): name is Section => SECTIONS.some((s) => s === name);

/** Splits the body into section texts keyed by name; text may continue over several lines. */
function splitSections(lines: readonly string[]): Map<Section, string> {
  const found = new Map<Section, string[]>();
  let current: string[] | undefined;
  for (const line of lines) {
    const match = SECTION_LINE.exec(line);
    const name = match?.[1]?.trim();
    if (match !== null && name !== undefined && isSection(name)) {
      current = match[2] === "" ? [] : [match[2] ?? ""];
      found.set(name, current);
    } else current?.push(line);
  }
  return new Map([...found].map(([name, text]) => [name, text.join("\n").trim()]));
}

const stripTicks = (text: string): string => text.replace(/^`+|`+$/g, "").trim();

const stepsOf = (text: string): string[] =>
  text.split("\n").flatMap((line) => {
    const item = STEP.exec(line)?.[1]?.trim();
    return item === undefined || item === "" ? [] : [item];
  });

function concrete(name: "Run" | "Expected", text: string): string | undefined {
  const bare = stripTicks(text);
  if (PLACEHOLDER.test(bare))
    return `${name} must be a concrete ${name === "Run" ? "command" : "observable result"}, not "${bare}"`;
  if (name === "Expected" && bare.split(/\s+/).length < 2) {
    return "Expected must say what is observed (at least two words, e.g. a count, output or exit status)";
  }
  return undefined;
}

const get = (sections: ReadonlyMap<Section, string>, s: Section): string => sections.get(s) ?? "";

/** Every readiness problem in the sections, so the author fixes them in one pass. */
function problemsOf(markdown: string, sections: ReadonlyMap<Section, string>): string[] {
  const problems: string[] = [];
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

/** Parses one task record, reporting every problem together. */
export function parseTaskRecord(markdown: string): TaskRecord | ParseError {
  const lines = markdown.split("\n");
  const headerAt = lines.findIndex((l) => l.startsWith("## "));
  const header = headerAt < 0 ? null : HEADER.exec(lines[headerAt] ?? "");
  if (header === null) {
    return parseError("header must be `## <id> — <title>` (an id, an em dash, then the title)");
  }
  const sections = splitSections(lines.slice(headerAt + 1));
  const problems = problemsOf(markdown, sections);
  if (problems.length > 0) return parseError(problems.join("; "));
  const text = (s: Section): string => get(sections, s);
  return {
    id: header[1] ?? "",
    title: header[2]?.trim() ?? "",
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
