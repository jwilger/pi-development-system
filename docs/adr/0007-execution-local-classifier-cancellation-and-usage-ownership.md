# ADR 0007: Execution-local classifier cancellation and usage ownership

- **Status:** accepted
- **Date:** 2026-10-22

## Context

Pi 1.4.0 returns optional classifier usage but does not account it automatically. Tool results support native usage; ordinary hooks have no public standalone usage recorder. Jev instances and caches are shared, while cancellation and accounting belong to a particular execution. The user approved native tool-result accounting plus separate custom hook telemetry rather than relying on private host APIs.

## Decision

Add execution-local options to `Jev.ask`: an optional caller signal and synchronous usage callback. Combine caller cancellation with a bounded timeout, preserving distinct typed errors. Report usage only for actual returned results, before interpreting provider errors; cache hits never rebill. Cache answers by resolved provider/model and input. Callback exceptions produce typed `usage-recording` errors, never rejected asks, and do not change shared provider availability.

Consumers will forward each invocation's signal and collector, never store them in the shared holder. Tool results aggregate only direct classifier calls: pi already aggregates nested `executeTool` usage. Hook usage will be written as explicitly named custom telemetry; custom entries do not contribute to native totals. The client foundation and consumer wiring are delivered separately.

## Consequences

### Positive

- Cancellation and usage cannot leak between concurrent callers.
- Existing answer/error consumers remain source-compatible.
- Supported pi APIs provide native tool accounting without double-counting children.

### Negative

- Hook telemetry is separate from native session cost totals.
- A bounded timeout/abort can finish before an uncooperative provider reports usage. Late usage is not sent to a finalized collector or fabricated; provider billing may exceed reported totals.
- Synchronous accounting callbacks must not throw; errors are surfaced as typed local failures and are not cached.

## Alternatives

- **Implicit global signal/collector** — Rejected because shared Jev instances serve concurrent tools and hooks.
- **Private session-manager usage writes** — Rejected because extensions receive a readonly manager and the host can change internals.
- **Attach hook costs to unrelated later tool results** — Rejected because not every hook has a corresponding tool result, especially blocked calls and turn-start/end work.

## Revisit when

Pi exposes a public hook usage recorder, accounts registry classifier calls automatically, or changes nested tool-result usage ownership.

## Related

- ADR 0002: Jev as a runtime judgement component.
- `docs/plan/pi14-4-classifier-lifecycle.md`.
- Tested public APIs: pi 1.4.0 `ClassifierResult.usage`, `AgentToolResult.usage`, `ExtensionContext.signal`.
