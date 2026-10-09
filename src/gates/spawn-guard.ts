import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { spawnModelFor } from "../core/agent-slots.ts";
import { credentialKinds } from "../core/secrets.ts";
import { loadConfig } from "../state/config.ts";
import { availableModels } from "../state/models-command.ts";

export type SpawnGuardDeps = { pi: ExtensionAPI };

/** The project's model for this agent type's slot, when one is configured and usable. */
async function configuredModel(ctx: ExtensionContext, type: string): Promise<string | undefined> {
  const config = await loadConfig(ctx.cwd);
  if (!config.ok) return undefined;
  return spawnModelFor(type, config.value.models, availableModels(ctx.modelRegistry));
}

/** A block when the text a subagent would receive carries a credential; kinds only, never the value. */
function refuseCredentials(
  text: string,
  what: string,
): { block: true; reason: string } | undefined {
  const kinds = credentialKinds(text);
  if (kinds.length === 0) return undefined;
  return {
    block: true,
    reason: `the ${what} contains ${kinds.join(", ")}. Subagent prompts must not carry credentials: name the environment variable or file that holds it instead, and send it again.`,
  };
}

/**
 * `agent_spawn` carries two of the system's promises. A task text never carries a credential (non-negotiable 7:
 * secrets do not leave the machine in subagent prompts). A spawn that names no model gets the model the project
 * configured for the agent type's slot in `[models]`, as the review and lens flows already do.
 */
export function registerSpawnGuard(deps: SpawnGuardDeps): void {
  deps.pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("agent_steer", event)) {
      const { message } = event.input as { message?: unknown };
      return refuseCredentials(typeof message === "string" ? message : "", "message");
    }
    if (!isToolCallEventType("agent_spawn", event)) return undefined;
    const { task, type, model } = event.input as {
      task?: unknown;
      type?: unknown;
      model?: unknown;
    };
    const refused = refuseCredentials(typeof task === "string" ? task : "", "task text");
    if (refused !== undefined) return refused;
    if (model !== undefined || typeof type !== "string") return undefined;
    const chosen = await configuredModel(ctx, type);
    if (chosen !== undefined) event.input.model = chosen;
    return undefined;
  });
}
