import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { SessionState } from "../state/session-state.ts";
import { phaseGuide } from "./phase-guide.ts";

/**
 * Static on purpose: tool declarations head every request, so a description that changed with the
 * phase would invalidate the provider's cache for the whole conversation. The phase lives in the
 * system prompt's state section; calling the tool returns the guidance for it.
 */
export const DEVSYS_TOOL_DESCRIPTION =
  "What the development system expects in the current workflow phase (the system prompt names it as of the start of the prompt; this call is live), and which tools to use. Call it when unsure what comes next.";

/** `devsys`: a model-only tool that returns the current phase's guidance. */
export function createPhaseTool(deps: { state: SessionState }): ToolDefinition {
  return {
    name: "devsys",
    label: "Workflow guide",
    description: DEVSYS_TOOL_DESCRIPTION,
    promptSnippet: "Show what the workflow expects in the current phase",
    parameters: Type.Object({}),
    exposure: "model-only",
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
