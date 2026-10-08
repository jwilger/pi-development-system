import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "../state/config.ts";
import { createEventModelCheckTool } from "./event-model-tool.ts";

/** The name of the builtin tool; a provider extension offers `event_model_validate` instead. */
export const EVENT_MODEL_TOOL = "devsys_event_model_check";
const PROVIDER_TOOL = "event_model_validate";

/**
 * The builtin event-model-lite validator is for repos that have nothing better: it steps aside when the config
 * names another provider, or when an extension registers `event_model_validate` (see
 * docs/event-model-extension-contract.md).
 */
export function usesBuiltinEventModel(provider: string, toolNames: readonly string[]): boolean {
  return provider === "builtin" && !toolNames.includes(PROVIDER_TOOL);
}

/**
 * Registers the builtin tool at session start, when every extension's tools are known and the repo's config
 * can be read: neither is available while the extension loads.
 */
export function registerEventModelProvider(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    const config = await loadConfig(ctx.cwd);
    const provider = config.ok ? config.value.eventModel.provider : "builtin";
    const names = pi.getAllTools().map((tool) => tool.name);
    if (usesBuiltinEventModel(provider, names)) {
      pi.registerTool(createEventModelCheckTool());
    } else if (!names.includes(PROVIDER_TOOL)) {
      ctx.ui.notify(
        `event_model.provider is "${provider}" but no ${PROVIDER_TOOL} tool is loaded: install that extension, or set provider = "builtin" to use ${EVENT_MODEL_TOOL}.`,
        "warning",
      );
    }
  });
}
