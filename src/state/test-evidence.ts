import { type ExtensionAPI, isBashToolResult } from "@earendil-works/pi-coding-agent";
import { exitCodeOf, isTestRunnerCommand, summarizeOutput } from "../core/test-runner.ts";
import type { SessionState } from "./session-state.ts";

export type TestEvidenceDeps = { pi: ExtensionAPI; state: SessionState; now?: () => Date };

/**
 * Records the outcome of every test-runner command in `lastTestRun`, so gates can ask "has this
 * session seen a failing test?" without trusting the model's say-so.
 */
export function registerTestEvidence(deps: TestEvidenceDeps): void {
  const now = deps.now ?? (() => new Date());
  deps.pi.on("tool_result", (event) => {
    if (!isBashToolResult(event)) return;
    const { command } = event.input;
    if (typeof command !== "string" || !isTestRunnerCommand(command)) return;
    const text = event.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
    const exitCode = exitCodeOf({
      isError: event.isError,
      text,
      structured: event.structuredContent,
      command,
    });
    deps.state.update((s) => ({
      ...s,
      lastTestRun: { at: now().toISOString(), exitCode, summary: summarizeOutput(text) },
    }));
  });
}
