import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

const FALLBACK_ENTRY = "devsys-tool-fallback";
const hasDiscovery = (active: readonly string[]) =>
  active.some((name) => name === "codemode" || name === "tool_search");

/** Keep optional tools reachable without overriding independently activated declarations. */
export function registerDiscoveryFallback(
  pi: ExtensionAPI,
  tools: readonly ToolDefinition[],
): void {
  let discoveryActive: boolean | undefined;
  const automatic = new Set<string>();
  const synchronize = () => {
    const active = pi.getActiveTools();
    const discoverable = hasDiscovery(active);
    if (discoverable === discoveryActive) return;
    discoveryActive = discoverable;
    if (discoverable) {
      for (const tool of tools) {
        // A transient hidden registration withdraws only this declaration without
        // replacing the host loadout and discarding unrelated pending tools.
        if (automatic.has(tool.name)) pi.registerTool({ ...tool, exposure: "hidden" });
        pi.registerTool(tool);
      }
      automatic.clear();
    } else {
      for (const tool of tools) {
        if (!active.includes(tool.name)) automatic.add(tool.name);
        pi.registerTool({ ...tool, exposure: "direct" });
      }
    }
    pi.appendEntry(FALLBACK_ENTRY, [...automatic]);
  };
  const restore = (event: { type: "session_start" | "session_tree" }, ctx: ExtensionContext) => {
    const branch = ctx.sessionManager.getBranch();
    const entry = [...branch]
      .reverse()
      .find((item) => item.type === "custom" && item.customType === FALLBACK_ENTRY);
    // Pi activates newly registered direct tools that the target never mentioned.
    // Retain their live ownership, but let the target own recorded selections.
    const mentioned = new Set(
      branch.flatMap((item) =>
        item.type === "message" && item.message.role === "system"
          ? [...(item.message.toolsAdded ?? []), ...(item.message.toolsRemoved ?? [])].map(
              (tool) => tool.name,
            )
          : [],
      ),
    );
    const inherited =
      event.type === "session_tree"
        ? [...automatic].filter((name) => entry === undefined || !mentioned.has(name))
        : [];
    automatic.clear();
    for (const name of inherited) automatic.add(name);
    if (entry?.type === "custom" && Array.isArray(entry.data)) {
      // Persisted session data is untrusted; retain only names owned by this fallback.
      for (const name of entry.data) {
        if (typeof name === "string" && tools.some((tool) => tool.name === name))
          automatic.add(name);
      }
    }
    discoveryActive = undefined;
    // Reconcile discovery before the next run, after other startup handlers finish.
    if (!hasDiscovery(pi.getActiveTools())) synchronize();
    else if (automatic.size > 0) pi.appendEntry(FALLBACK_ENTRY, [...automatic]);
  };
  pi.on("session_start", restore);
  pi.on("session_tree", restore);
  pi.on("before_agent_start", synchronize);
  pi.on("turn_end", synchronize);
}
