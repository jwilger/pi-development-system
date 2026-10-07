import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

/**
 * Tools registered with `exposure: "codemode"` are reachable only through the `codemode` tool.
 * When that tool is not active, the model could not reach them at all, so declare them directly.
 * Runs at session start: pi's tool state cannot be read while an extension loads.
 */
export function declareWithoutCodemode(pi: ExtensionAPI, tools: readonly ToolDefinition[]): void {
  if (pi.getActiveTools().includes("codemode")) return;
  for (const tool of tools) pi.registerTool({ ...tool, exposure: "direct" });
}
