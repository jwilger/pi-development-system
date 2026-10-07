import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { SessionState } from "../state/session-state.ts";
import { phaseGuide } from "./phase-guide.ts";

const BASE =
  "What the development system expects in the current workflow phase, and which tools to use. Call it when unsure what comes next.";

/** `devsys`: a model-only tool whose description is rewritten each turn with the current phase's guidance. */
export function createPhaseTool(deps: { state: SessionState }): ToolDefinition {
  return {
    name: "devsys",
    label: "Workflow guide",
    description: BASE,
    promptSnippet: "Show what the workflow expects in the current phase",
    parameters: Type.Object({}),
    exposure: "model-only",
    prepareLoadout: () => ({
      descriptions: {
        devsys: `${BASE} Current phase (${deps.state.get().phase}): ${phaseGuide(deps.state.get().phase)}`,
      },
    }),
    execute() {
      const { phase, sizing, activeSlice } = deps.state.get();
      const text = [
        `phase: ${phase}`,
        `sizing: ${sizing ?? "none"}`,
        `slice: ${activeSlice ?? "none"}`,
        phaseGuide(phase),
      ].join("\n");
      return Promise.resolve({ content: [{ type: "text" as const, text }], details: undefined });
    },
  };
}
