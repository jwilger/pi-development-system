import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import type { SessionState } from "../state/session-state.ts";

const Parameters = Type.Object({});

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
});

/**
 * `devsys_begin_work`: the planning → implementing transition. Intake leaves capability and product work in
 * `planning`; the review and red-first gates only run while implementing, so without this step the largest work
 * would get the fewest gates. Call it once the user has approved the plan; when already implementing it is a harmless no-op.
 */
export function createBeginWorkTool(deps: {
  state: SessionState;
}): ToolDefinition<typeof Parameters> {
  return {
    name: "devsys_begin_work",
    label: "Begin implementing",
    description:
      "Move from planning to implementing once the user has approved the plan. This switches on the review and red-first gates for the active slice.",
    promptSnippet: "Start implementing after the plan is approved",
    parameters: Parameters,
    exposure: "direct",
    execute(_id, _params: Static<typeof Parameters>) {
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
          `Phase: implementing. Active slice: ${activeSlice}. Review and red-first gates are now on.`,
        ),
      );
    },
  };
}
