import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import type { Exec } from "../core/exec.ts";
import { adrFileName, nextAdrNumber, parseAdrTitle, renderAdr } from "./adr.ts";

const Parameters = Type.Object({
  title: Type.String({ description: "The decision, in a few words (one line)." }),
});

const ADR_DIR = "docs/adr";
const TEMPLATE = "0000-template.md";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * `devsys_adr_new`: the next numbered ADR, filled from `docs/adr/0000-template.md`. Numbering and the
 * file name are mechanical, so the model writes the decision and not the paperwork.
 */
export function createAdrNewTool(deps: {
  now: () => Date;
  exec: Exec;
}): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_adr_new",
    // pi runs a turn's tool calls in parallel; two calls would read the same directory and pick the same number.
    executionMode: "sequential",
    label: "New ADR",
    description:
      "Create the next numbered ADR in docs/adr from its template and return the path to fill in. Use for a hard-to-reverse technical decision (a boundary, dependency, data format or protocol); product decisions go in the decision register.",
    promptSnippet: "Create the next ADR from the template",
    parameters: Parameters,
    async execute(_id, params: Static<typeof Parameters>, _signal, _onUpdate, ctx) {
      const title = parseAdrTitle(params.title);
      if (!title.ok) return reply(title.error.message, true);
      const dir = join(ctx.cwd, ADR_DIR);
      let template: string;
      try {
        for (const path of [join(ctx.cwd, "docs"), dir]) {
          if (!(await lstat(path)).isDirectory()) {
            return reply(
              "adr-unsafe-path: docs/adr must use real directories, not symlinks.",
              true,
            );
          }
        }
        if (!(await lstat(join(dir, TEMPLATE))).isFile()) {
          return reply(
            "adr-unsafe-path: The template must be a regular file, not a symlink.",
            true,
          );
        }
        template = await readFile(join(dir, TEMPLATE), "utf8");
      } catch {
        return reply(
          `${ADR_DIR}/${TEMPLATE} is missing, so there is nothing to start from; add the template first.`,
          true,
        );
      }
      try {
        const history = await deps.exec(
          "git",
          ["ls-tree", "-rz", "--name-only", "HEAD", "--", ADR_DIR],
          { cwd: ctx.cwd, timeout: 10000 },
        );
        if (history.code !== 0) {
          return reply(
            "adr-history-unavailable: Resolve repository HEAD before creating a decision.",
            true,
          );
        }
        const recorded = history.stdout
          .split("\0")
          .filter(Boolean)
          .map((path) => basename(path));
        const files = await readdir(dir);
        const pending = files.filter(
          (file) => /^\d{4}-.+\.md$/.test(file) && file !== TEMPLATE && !recorded.includes(file),
        );
        if (pending.length > 0) {
          return reply(
            `adr-pending: Finish ${pending.join(", ")} and its substantive ARCHITECTURE.md update, verify and independently review them, then commit before creating another decision.`,
            true,
          );
        }
        const number = nextAdrNumber([...files, ...recorded]);
        const name = adrFileName(number, title.value);
        const date = deps.now().toISOString().slice(0, 10);
        // `wx`: fail rather than overwrite an ADR with the same file name (calls from other sessions).
        await writeFile(
          join(dir, name),
          renderAdr(template, { number, title: title.value, date }),
          {
            flag: "wx",
          },
        );
        return reply(
          `Created ${ADR_DIR}/${name} (status proposed). Fill in Context, Decision, Consequences, Alternatives and Revisit when. Leave the status proposed until the user agrees, then set it to accepted. Include its corresponding substantive ARCHITECTURE.md update in the same commit, with verification and independent semantic review before committing. ARCHITECTURE.md must stand alone as current requirements without ADR backlinks. Introduce only this decision now; commit it and its cumulative architecture update before starting another. After this ADR merges into authoritative main/trunk, preserve it unchanged except status-only supersession by a newly added replacement; correct mistakes through a new paired decision.`,
        );
      } catch (e) {
        return reply(`could not create the ADR: ${message(e)}`, true);
      }
    },
  };
}
