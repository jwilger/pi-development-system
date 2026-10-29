import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { isParseError } from "../core/types.ts";
import type { Jev } from "../jev/client.ts";
import { withJevToolUsage } from "../jev/execution.ts";
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
export function createTaskCheckTool(baseDeps: {
  jev: (ctx: ExtensionContext) => Jev;
}): ToolDefinition<typeof Parameters> {
  return withJevToolUsage(baseDeps, (deps) => ({
    name: "devsys_task_check",
    label: "Check task record",
    description:
      "Validate task-record structure and offer advisory handoff concerns. " +
      "Use for a handoff; subjective flags are not prerequisites for direct implementation. " +
      "Do not recheck unchanged records to obtain a favorable judgment.",
    promptSnippet: "Validate task structure; advisory handoff feedback",
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
          `${record.id}: structure ok. Jev unavailable or context exceeds the 32 KiB limit (${judged.error.kind}); readiness not judged. Advisory only: use the available context; ask once if a concrete missing decision prevents safe implementation.`,
        );
      }
      const { readiness, missing } = judged.value;
      if (readiness === "ready")
        return reply(`${record.id}: ready. Structure ok and specific enough for an implementer.`);
      if (readiness === "too-big") {
        return reply(
          `${record.id}: structure ok; too-big (advisory). Consider splitting only at independent deliverable and integration boundaries, accounting for handoff and review overhead. Multiple tests or functions alone do not justify splitting. Otherwise implement one usable increment; do not recheck to seek a favorable judgment.`,
        );
      }
      const named = missing.map((m) => SECTION_OF[m] ?? m).join(", ");
      return reply(
        `${record.id}: structure ok; needs-detail (advisory concerns: ${named}). These section flags do not identify a concrete missing decision. Use the record and repository context to proceed test-first; only if you can name a concrete missing decision that prevents safe implementation, ask one precise question. Do not rewrite or recheck solely to clear this judgment.`,
      );
    },
  }));
}
