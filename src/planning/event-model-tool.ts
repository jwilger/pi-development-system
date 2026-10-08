import { readdir, readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { renderMermaid, renderModelMarkdown } from "./event-model-render.ts";
import { parseSlice, type Slice, type SliceFormat, validateModel } from "./slice-schema.ts";

const Parameters = Type.Object({
  dir: Type.String({
    description: "Directory of slice files (.yaml, .yml, .json), inside the repository.",
  }),
  render: Type.Optional(
    Type.Union([Type.Literal("markdown"), Type.Literal("mermaid")], {
      description: "Also return the derived swimlane Markdown or Mermaid diagram.",
    }),
  ),
});

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

const FORMATS: Record<string, SliceFormat> = { ".yaml": "yaml", ".yml": "yaml", ".json": "json" };

const insideRepo = (cwd: string, target: string): boolean => {
  const rel = relative(cwd, target);
  return !(rel.startsWith("..") || isAbsolute(rel));
};

type Loaded = { slices: Slice[]; problems: string[]; files: number };

async function loadSlices(dir: string, names: readonly string[]): Promise<Loaded> {
  const slices: Slice[] = [];
  const problems: string[] = [];
  for (const name of names) {
    const format = FORMATS[extname(name)];
    if (format === undefined) continue;
    const parsed = parseSlice(await readFile(join(dir, name), "utf8"), format);
    if (parsed.ok) slices.push(parsed.value);
    else problems.push(`${name}: ${parsed.error.message}`);
  }
  return { slices, problems, files: slices.length + problems.length };
}

const derived = (
  slices: readonly Slice[],
  render: Static<typeof Parameters>["render"],
): string[] => {
  if (render === "markdown") return [renderModelMarkdown(slices)];
  if (render === "mermaid") return [renderMermaid(slices)];
  return [];
};

/**
 * `devsys_event_model_check`: validates a directory of event-model-lite slices (schema v1) and can derive
 * the Markdown or Mermaid view. A dedicated event-model extension replaces it (see
 * docs/event-model-extension-contract.md).
 */
export function createEventModelCheckTool(): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_event_model_check",
    label: "Check event model",
    description:
      "Validate a directory of event-model slice files (schema v1: pattern, command, events, views, Given/When/Then) for unknown references, missing origins and destinations, empty scenarios and orphan events; optionally render the swimlane Markdown or a Mermaid diagram.",
    promptSnippet: "Validate event-model slices and render the derived views",
    parameters: Parameters,
    async execute(_id, params: Static<typeof Parameters>, _signal, _onUpdate, ctx) {
      const dir = resolve(ctx.cwd, params.dir);
      if (!insideRepo(ctx.cwd, dir)) return reply(`${params.dir} is outside the repository`, true);
      let names: string[];
      try {
        names = (await readdir(dir)).sort();
      } catch {
        return reply(`cannot read ${params.dir}: no such directory`, true);
      }
      const { slices, problems, files } = await loadSlices(dir, names);
      if (files === 0) return reply(`no slice files (.yaml, .yml, .json) in ${params.dir}`, true);
      const issues = validateModel(slices);
      const warnings = issues.filter((i) => i.severity === "warning").length;
      const errors = issues.length - warnings + problems.length;
      const lines = [
        `${slices.length} slices, ${errors} errors, ${warnings} warnings`,
        ...problems.map((p) => `- parse-error (error) ${p}`),
        ...issues.map((i) => `- ${i.code} (${i.severity}) ${i.slice}: ${i.message}`),
      ];
      const report = lines.join("\n");
      return reply([report, ...derived(slices, params.render)].join("\n\n"), errors > 0);
    },
  };
}
