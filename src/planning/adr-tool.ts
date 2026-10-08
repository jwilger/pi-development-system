import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
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
export function createAdrNewTool(deps: { now: () => Date }): ToolDefinition<typeof Parameters> {
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
        template = await readFile(join(dir, TEMPLATE), "utf8");
      } catch {
        return reply(
          `${ADR_DIR}/${TEMPLATE} is missing, so there is nothing to start from; add the template first.`,
          true,
        );
      }
      try {
        const number = nextAdrNumber(await readdir(dir));
        const name = adrFileName(number, title.value);
        const date = deps.now().toISOString().slice(0, 10);
        await mkdir(dir, { recursive: true });
        // `wx`: fail rather than overwrite an ADR with the same file name (calls from other sessions).
        await writeFile(
          join(dir, name),
          renderAdr(template, { number, title: title.value, date }),
          {
            flag: "wx",
          },
        );
        return reply(
          `Created ${ADR_DIR}/${name} (status proposed). Fill in Context, Decision, Consequences, Alternatives and Revisit when. Leave the status proposed until the user agrees, then set it to accepted.`,
        );
      } catch (e) {
        return reply(`could not create the ADR: ${message(e)}`, true);
      }
    },
  };
}
