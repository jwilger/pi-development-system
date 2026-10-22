# PI14-5 — Typed inherited-tool bridge

**Goal:** Retype the existing inherited-tool boundary against pi 1.4 and preserve available reachability and execution metadata without changing its detached, hook-preserving execution contract.

**Files:** `src/subagents/orch/inherited-tools.ts`, `test/subagents/inherited-bridge.test.ts`, existing offline SDK child tests, `test/subagents/nocheck-files.ts`, `biome.json`, `src/subagents/VENDORED.md` and release version files.

**First failing test:** A real SDK loadout snapshot preserves a registered tool's `reachesTools` function, schema, execution mode, namespace, annotations and prompt guidelines.

**Steps:**

1. Add the real SDK metadata regression and observe failure before production changes.
2. Remove the bridge's vendored type-check exemption and use exact optional-property construction. Recover metadata from supported public loadout/tool-info APIs.
3. Preserve root-only argument preparation, parent permission/result hooks, child-local cancellation, detached execution and model-only rejection. Exercise current SDK child, usage and resume regressions.
4. Shrink both exemption lists together and update vendoring notes; no broader vendor cleanup.
5. Run full checks, active diagnostics and fresh-context reviews; commit, push and observe CI.

**Expected:** Available reachability metadata survives inheritance. Existing detached parent hooks, cancellation, usage attribution and pinned resume tests remain green. No dependency or architecture boundary changes, so no new ADR is needed.
