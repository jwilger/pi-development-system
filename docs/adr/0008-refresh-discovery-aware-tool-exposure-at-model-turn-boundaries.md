# ADR 0008: Refresh discovery-aware tool exposure at model-turn boundaries

- **Status:** proposed
- **Date:** 2026-10-22

## Context

The approved pi 1.4 modernization includes search-only startup and later activation changes. The existing one-time codemode check directly declared four optional tools even when tool search could discover them, and never withdrew that fallback after discovery became available.

## Decision

Treat active `codemode` or `tool_search` as discovery for the four optional development-system tools. Keep their codemode exposure when discovery is active; otherwise register them directly. Synchronize at session start, before agent start, and at turn end using public registration and active-tool APIs. Pi snapshots execution tools before `turn_start`, so that event is too late. Provider-facing fixtures assert the first request after a transition, not merely the final active list. Session start/tree restoration defers discovery reconciliation until `before_agent_start`. Withdrawal uses a synchronous hidden-then-codemode re-registration of owned tools, not `setActiveTools`: that API clears unrelated pending late registrations, including tools from MCP servers awaited by later `before_agent_start` hooks. The transient hidden registration never reaches a provider request; the tool is immediately restored as searchable and script-callable.

Track only declarations added by the automatic fallback. Persist their names as a `devsys-tool-fallback` custom entry, whitelist them on restoration, and restore from the current branch at session start. On tree navigation use the target branch's recorded ownership for tools mentioned by its system-message additions/removals. Retain live ownership for tools the target never mentioned (or when it predates ownership entries): pi treats these as new direct registrations, so they must not become independent selections merely by navigation. Save retained ownership immediately, even when withdrawal is deferred, so an intervening reload cannot lose it. When discovery returns, withdraw those declarations, not rare tools that were independently active before fallback. Changes to selection while the discovery mode is unchanged remain the host/user's decision. Judge wrappers keep their script-oriented exposure. No child permission or model-only execution boundary changes.

## Consequences

### Positive

- Search-only startup no longer expands the direct prompt surface unnecessarily.
- Newly enabled discovery removes stale fallback declarations before the next model request.
- Explicit tool activation survives mode transitions.
- Offline real-SDK fixtures cover discovery, activation, child allow/block policy, hidden tools and model-only restrictions.

### Negative

- Synchronization occurs at pre-run and post-turn boundaries, not immediately on every UI selection change.
- An independently repeated activation of an already automatically active tool cannot be distinguished through the public API. Fallback ownership remains automatic until the next discovery transition.
- The two supported discovery tool names are explicit; arbitrary third-party orchestrators do not suppress fallback.
- Sessions from before 1.7.0 have no ownership record. Active rare tools with unknown provenance are preserved as independent selections, not heuristically removed. New automatic additions are tracked; an existing selection must be explicitly deactivated to relinquish it.

## Alternatives

- **Startup-only check** — Rejected because it leaves stale direct declarations after activation changes.
- **Always direct exposure** — Rejected because it unnecessarily grows the model prompt.
- **Private active-tool change observer** — Rejected because no public event exists and host internals would create version coupling.

## Revisit when

Pi provides a public active-tool change event or a capability-based discovery contract, or adds another supported built-in discovery tool.

## Related

- [Modernization plan](../plan/pi-1.4-modernization.md)
- [Discovery task](../plan/pi14-6-discovery-policy.md)
- [Typed inherited execution boundary](0007-execution-local-classifier-cancellation-and-usage-ownership.md)
