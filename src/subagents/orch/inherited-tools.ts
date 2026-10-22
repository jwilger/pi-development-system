import type {
  ExtensionAPI,
  ExtensionToolContext,
  ToolDefinition,
  ToolLoadout,
} from "@earendil-works/pi-coding-agent";

/** A snapshot of the root's reachable tools, without loading its extensions again. */
export interface InheritedToolSource {
  tools: ToolDefinition[];
  activeNames: string[];
}

/**
 * Capture the public loadout API and a root execution bridge. Keep the bridge alive for
 * detached children, but always pass their signal rather than the spawning call's signal.
 * Built-ins and manager controls are replaced with child-local implementations by runtime.
 */
export function createInheritedToolSource(pi: ExtensionAPI) {
  let loadout: ToolLoadout | undefined;
  let context: ExtensionToolContext | undefined;
  return {
    captureLoadout(next: ToolLoadout) {
      loadout = next;
      return undefined;
    },
    captureContext(next: ExtensionToolContext) {
      context = next;
    },
    reset() {
      // session_start is emitted after the replacement loadout is prepared; do not
      // discard that fresh snapshot (or an unchanged loadout on /tree).
      context = undefined;
    },
    snapshot(): InheritedToolSource {
      if (!loadout) return { tools: [], activeNames: [] };
      const rootContext = context;
      const callable = new Set(loadout.callable.map((tool) => tool.name));
      const active = new Set(loadout.declared.map((tool) => tool.name));
      const info = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
      const tools: ToolDefinition[] = [];
      for (const tool of loadout.registered) {
        const exposure = loadout.getExposure(tool.name);
        // Inactive direct tools and hidden tools are not available in the root either.
        if (!(callable.has(tool.name) || active.has(tool.name))) continue;
        if (exposure === "hidden") continue;
        const metadata = info.get(tool.name);
        const namespace = loadout.getNamespace(tool.name);
        // The root execution pipeline applies argument preparation. Remove any
        // child-side shim so non-idempotent preparation runs only once.
        const { prepareArguments: _preparation, ...inherited } = {
          ...tool,
          prepareArguments: undefined,
        };
        tools.push({
          ...inherited,
          label: tool.label,
          exposure,
          ...(namespace === undefined ? {} : { namespace }),
          ...(metadata?.annotations === undefined ? {} : { annotations: metadata.annotations }),
          ...(metadata?.promptGuidelines === undefined
            ? {}
            : { promptGuidelines: metadata.promptGuidelines }),
          ...(metadata?.reachesTools === undefined ? {} : { reachesTools: metadata.reachesTools }),
          defaultActive: active.has(tool.name),
          async execute(_id, args, signal, onUpdate) {
            if (!callable.has(tool.name)) {
              // The SDK rejects nested model-only execution. Calling its captured
              // wrapper directly would bypass root permission/result hooks. Known
              // SDK orchestrators are instead recreated locally by runtime.
              throw new Error(
                `Cannot safely inherit model-only tool ${tool.name}: the SDK does not ` +
                  "provide a hook-preserving execution bridge. Run it in the main session.",
              );
            }
            const bridge = rootContext ?? context;
            if (!bridge) {
              throw new Error(
                "Inherited tool execution needs a main-session agent_* tool call first. " +
                  "Use agent_steer to resume this child instead of the thread dialog.",
              );
            }
            const outcome = await bridge.executeTool(tool.name, args, {
              ...(signal === undefined ? {} : { signal }),
              ...(onUpdate === undefined ? {} : { onUpdate }),
            });
            return { ...outcome.result, isError: outcome.isError };
          },
        });
      }
      return { tools, activeNames: [...active] };
    },
  };
}
