import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { isParseError } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { judgeTaskReadiness } from "../jev/questions/readiness.ts";
import { parseTaskRecord } from "./task-record.ts";

const Parameters = Type.Object({
  path: Type.String({
    description: "Path to the task record markdown file, inside the repository.",
  }),
  id: Type.Optional(
    Type.String({
      description: "Which task record to check when the file (such as a plan) holds several.",
    }),
  ),
});

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

const insideRepo = (cwd: string, target: string): boolean => {
  const rel = relative(cwd, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** Jev's aspect keys, named as the record's own sections so the author knows what to edit. */
const SECTION_OF: Readonly<Record<string, string>> = {
  goal: "Goal",
  interfaces: "Interfaces",
  firstFailingTest: "First failing test",
  steps: "Steps",
  check: "Run and Expected",
};

/** `devsys_task_check`: structural readiness is deterministic; Jev adds "specific enough" and "one task". */
export function createTaskCheckTool(deps: {
  jev: (ctx: ExtensionContext) => Jev;
}): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_task_check",
    label: "Check task record",
    description:
      "Check a task record file against the task-record format and judge whether a weaker implementer could act on it. " +
      "Run before handing a task record to an implementer subagent.",
    promptSnippet: "Check a task record is ready for an implementer",
    parameters: Parameters,
    exposure: "codemode",
    async execute(_id, params: Static<typeof Parameters>, _signal, _onUpdate, ctx) {
      const target = resolve(ctx.cwd, params.path);
      if (!insideRepo(ctx.cwd, target))
        return reply(`${params.path} is outside the repository`, true);
      let markdown: string;
      try {
        markdown = await readFile(target, "utf8");
      } catch (cause) {
        return reply(
          `cannot read ${params.path}: ${cause instanceof Error ? cause.message : String(cause)}`,
          true,
        );
      }
      const record = parseTaskRecord(markdown, params.id);
      if (isParseError(record))
        return reply(`${params.path} is not ready: ${record.message}`, true);
      const judged = await judgeTaskReadiness(deps.jev(ctx), record);
      if (!judged.ok) {
        return reply(
          `${record.id}: structure ok. Jev unavailable (${judged.error.kind}), so specificity and size were not judged; review the record yourself.`,
        );
      }
      const { readiness, missing } = judged.value;
      if (readiness === "ready")
        return reply(`${record.id}: ready. Structure ok and specific enough for an implementer.`);
      if (readiness === "too-big") {
        return reply(
          `${record.id}: too-big. Split it into task records that each need one failing test, then check each.`,
        );
      }
      const named = missing.map((m) => SECTION_OF[m] ?? m).join(", ");
      return reply(`${record.id}: needs-detail. Make these more specific: ${named}.`);
    },
  };
}
