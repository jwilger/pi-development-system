# PI14-4 — Execution-local classifier lifecycle

**Goal:** Modernize classifier cancellation and usage ownership without changing gate policy or classifier questions. Deliver the client foundation first; tool and hook consumers follow as independently reviewed increments before the goal task is complete.

**Files (foundation):** `src/jev/client.ts`, `src/jev/models.ts`, `src/core/models.ts`, `test/jev/client.test.ts`, ADR 0007.

**Interfaces:** Add optional `JevAskOptions` to `Jev.ask`: caller signal and synchronous usage callback. Preserve the existing typed answer/error result and shared holder/cache. No runtime dependency or host-private API.

**First failing test:** A pre-aborted caller receives `aborted` and causes no classifier request.

**Steps:**

1. Demonstrate and repair pre-abort, then bounded in-flight caller cancellation distinct from timeout; clean up listeners and timers.
2. Report each actual returned usage exactly once, including provider errors; no callback for cache hits or absent usage. Preserve the never-reject contract on callback failure.
3. Prevent shared caches from serving a different resolved model's answer. Preserve independent concurrent execution signals.
4. Resolve both default model lists against the current OpenRouter classifier identifier `~typesafe/jev-latest`, verified through the installed pi 1.4.0 runtime catalog.
5. Run targeted and full checks, active diagnostics, live Jev fixtures required by touched paths, fresh-context reviews, and deliver.

**Run:** `npm run typecheck && npm test && npm run lint && npm run lint:knip && npm run lint:md && direnv exec . npm run check:jev`.

**Expected:** All checks pass. Caller abort does not mark Jev offline. Timeout remains `timeout` even if the provider abort listener settles synchronously. No unhandled late rejection or late usage callback after a bounded request has finalized.

## Test list

- [ ] Pre-aborted caller never starts or receives a cached answer.
- [ ] In-flight abort settles even if the classifier ignores cancellation.
- [ ] Timeout stays distinct when abort causes an immediate provider result.
- [ ] Independent concurrent calls do not cross-cancel.
- [ ] Usage emitted once for a real request, never for cache hits.
- [ ] Error/aborted results with usage are billed; absent usage stays absent.
- [ ] Usage callback exceptions become typed errors, not rejections.
- [ ] Shared cache is isolated by resolved provider/model.
- [ ] Both configured default lists resolve the current OpenRouter alias.

## Follow-on increments (same approved goal task)

Thread execution-local options through question adapters and tools; aggregate only direct classifier usage on final tool results. Hooks use their own signal and explicit custom telemetry, not native totals. Verify actual SDK nested child usage exactly once. These are not claimed complete by the foundation increment.

## Boundary and risk

No new network or credential boundary. Existing redaction, bounded classifier inputs and conservative gate fallbacks remain. Cancellation cannot undo a provider charge: if a provider ignores abort and reports usage after the bounded request has finalized, that usage is unavailable to the final result and is not reconstructed. ADR 0007 records accounting ownership and the user-approved hook telemetry limitation.
