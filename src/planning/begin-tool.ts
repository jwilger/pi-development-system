import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import type { SessionState } from "../state/session-state.ts";
import { locationsOf, missingArtifacts } from "./missing-artifacts.ts";

const Parameters = Type.Object({});

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

/** A file, or a directory (path ends in `/`) holding at least one file. */
const existsIn =
  (cwd: string) =>
  (path: string): boolean => {
    const full = join(cwd, path);
    if (!existsSync(full)) return false;
    return path.endsWith("/") ? statSync(full).isDirectory() && readdirSync(full).length > 0 : true;
  };

/**
 * `devsys_begin_work`: the planning → implementing transition. Intake leaves capability and product work in
 * `planning`; the review and red-first gates only run while implementing, so without this step the largest work
 * would get the fewest gates. Call it once the user has approved the plan; when already implementing it is a harmless no-op.
 */
export function createBeginWorkTool(deps: {
  state: SessionState;
}): ToolDefinition<typeof Parameters> {
  const unaccounted = (cwd: string): string => {
    const { sizing, openDepartures } = deps.state.get();
    if (sizing === undefined) return "";
    const missing = missingArtifacts(sizing, {
      exists: existsIn(cwd),
      departedGates: openDepartures.map((d) => d.gate),
    });
    if (missing.length === 0) return "";
    return (
      ` Recommended planning artifacts with no file and no recorded skip: ${missing.map((id) => `${id} (${locationsOf(id).join(" or ")})`).join(", ")}.` +
      " Write each, or say it is skipped with devsys_record_departure (gate artifact.skipped:<artifact>); this does not block."
    );
  };
  return {
    name: "devsys_begin_work",
    label: "Begin implementing",
    description:
      "Move from planning to implementing once the user has approved the plan. This switches on the review and red-first gates for the active slice.",
    promptSnippet: "Start implementing after the plan is approved",
    parameters: Parameters,
    exposure: "model-only",
    execute(_id, _params: Static<typeof Parameters>, _signal, _update, ctx) {
      const { phase, activeSlice } = deps.state.get();
      if (phase === "implementing" && activeSlice !== undefined) {
        return Promise.resolve(
          reply(
            `Already implementing slice ${activeSlice}; the review and red-first gates are on.`,
          ),
        );
      }
      if (phase !== "planning" || activeSlice === undefined) {
        return Promise.resolve(
          reply(
            `Nothing to begin: phase is ${phase}${activeSlice === undefined ? " with no active slice" : ""}. Use devsys_intake to size new work first.`,
            true,
          ),
        );
      }
      deps.state.update((s) => ({ ...s, phase: "implementing" }));
      return Promise.resolve(
        reply(
          `Phase: implementing. Active slice: ${activeSlice}. Review and red-first gates are now on.${unaccounted(ctx.cwd)}`,
        ),
      );
    },
  };
}
