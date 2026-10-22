# PI14-3 — Exercise the actual pi 1.4 SDK offline

**Goal:** Verify extension lifecycle and child sessions against the public pi 1.4 SDK without real credentials or model network requests.

**Files:** `test/harness/offline-session.ts`, `test/extension-sdk.test.ts`, `test/subagents/runtime-sdk.test.ts`.

**Interfaces:** `ExtensionAPI.sendMessage`, `AgentSession`, `createDriverFactory`, and the current inherited-tool source. Preserve existing pins, resume semantics and production behavior.

**First failing test:** Test-only coverage increment: new tests assert existing supported behavior. If a behavioral defect is discovered, demonstrate it before the smallest production repair.

**Steps:**

1. Reuse the offline provider and isolate the agent directory as well as credentials, resources and session storage; register cleanup before setup can fail.
2. Drive custom `sendMessage` with `triggerTurn` and assert prompt sections at the provider boundary and zero extension errors; verify error collection with a deliberately failing test extension.
3. Create real child drivers from an SDK root context, bridge inherited tools through parent hooks, and verify cancellation and disposal.
4. Persist and reopen a child transcript, verifying model pins, retained conversation and successful continuation.
5. Run targeted tests, all repository checks, fresh-context reviews and policy-compliant delivery. More specialized metadata and discovery cases remain with their subsequent approved slices.

**Run:** `npm run typecheck && npm test && npm run lint && npm run lint:knip && npm run lint:md`.

**Expected:** Offline SDK tests pass without extension errors except the explicitly injected diagnostic case. Parent hooks observe inherited execution; cancellation reaches the running tool; disposed drivers refuse new work; restored children continue retained history with the pinned model. All repository checks pass.

**Out of scope:** Classifier accounting, inherited boundary redesign, tool exposure policy changes, or wholesale vendored-runtime rewrite.
