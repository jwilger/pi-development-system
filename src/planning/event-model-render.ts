import type { Slice } from "./slice-schema.ts";

/** Derived views of an event model: a swimlane table with scenarios, and a diagram. Never edited by hand. */

const values = (let_: Record<string, unknown> | undefined): string => {
  const entries = Object.entries(let_ ?? {});
  return entries.length === 0
    ? ""
    : ` (${entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")})`;
};

type Scenario = Slice["gwt"][number];

const scenarioLines = (g: Scenario): string[] => [
  ...g.given.map((x) => `- Given ${x.event}${values(x.let)}`),
  ...(g.when ? [`- When ${g.when.command}${values(g.when.let)}`] : []),
  ...g.then.map((t) => {
    if ("error" in t) return `- Then error ${t.error}`;
    if ("view" in t) return `- Then view ${t.view}${values(t.let)}`;
    return `- Then ${t.event}${values(t.let)}`;
  }),
];

const cell = (text: string): string => (text === "" ? "" : ` ${text} `);

const row = (s: Slice): string =>
  `|${[
    s.id,
    s.pattern,
    s.actor,
    s.command?.name ?? "",
    s.events.map((e) => e.name).join(", "),
    s.views.map((v) => v.name).join(", "),
  ]
    .map(cell)
    .join("|")}|`
    .replace(/\|\|/g, "| |")
    .replace(/\| \|\|/g, "| | |");

/** The swimlane table (one row per slice), then each slice's scenarios as Given/When/Then lists. */
export function renderModelMarkdown(slices: readonly Slice[]): string {
  const table = [
    "| Slice | Pattern | Actor | Command | Events | Views |",
    "|---|---|---|---|---|---|",
    ...slices.map(row),
  ];
  const sections = slices.flatMap((s) => [
    `## ${s.id}`,
    "",
    ...s.gwt.flatMap((g, i) => [`Scenario ${i + 1}`, "", ...scenarioLines(g), ""]),
  ]);
  return `${[...table, "", ...sections].join("\n").trimEnd()}\n`;
}

/** Mermaid node ids hold letters, digits and underscores; the label carries the real name. */
const label = (name: string): string => `"${name.replace(/"/g, "#quot;")}"`;

/**
 * Commands to the events they produce, and events to the views that read them. Ids are numbered per name
 * (not derived from it), so names that differ only in punctuation or script are never merged into one node.
 */
export function renderMermaid(slices: readonly Slice[]): string {
  const ids = new Map<string, string>();
  const node = (prefix: string, name: string): string => {
    const key = `${prefix}:${name}`;
    const id = ids.get(key) ?? `${prefix}${ids.size + 1}`;
    ids.set(key, id);
    return `${id}[${label(name)}]`;
  };
  const lines = ["flowchart LR"];
  for (const s of slices) {
    if (s.command) {
      for (const e of s.events)
        lines.push(`  ${node("c", s.command.name)} --> ${node("e", e.name)}`);
    }
    for (const v of s.views) {
      for (const source of v.sources) lines.push(`  ${node("e", source)} --> ${node("v", v.name)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
