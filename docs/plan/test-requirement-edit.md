# Test requirement replacement through normal edit

## fix-test-requirement-edit — Preserve evidence through test interception

**Goal:** An evidenced, owner-approved requirement replacement passes normal edit interception without permitting unrelated verification weakening.

**Files:** `src/gates/test-guard.ts`, `src/jev/questions/test-change.ts`, `src/jev/reasoning.ts`, `src/jev/cascade.ts`, `src/core/test-runner.ts`, corresponding tests and evidence records.

**Interfaces:** Registered `tool_call` / `tool_result` handlers, `devsys_record_departure`, production Jev holder and reasoning provider boundary.

**First failing test:** In a temporary workspace, run a failing public CLI acceptance test, record the narrow requirement departure, then remove only the obsolete characterization via the registered edit interception path. Assert the provider receives the applicable departure and actual failure and that edit succeeds.

**Steps:**

1. Trace production hook, evidence recording, departure applicability, cascade and installed/runtime provenance.
2. Add and run the first failing regression with real filesystem effects and only provider I/O controlled.
3. Preserve applicable evidence through assessment, keeping departures distinct from permission to hide regressions.
4. Add rejection, malformed/unresolved/provider failure, unchanged-file and scope/edit binding cases.
5. Run checks and fresh-context review; record limitations and safe Ferrum resumption steps.

**Run:** `node --experimental-transform-types --no-warnings --test test/gates/test-requirement-edit.test.ts`; `npm test`; `npm run typecheck`; `npm run lint`.

**Expected:** Fixture requirement replacement succeeds through interception; required coverage weakening stays blocked; failed stages have safe distinct actionable diagnostics; rejected edits leave bytes unchanged.

**Out of scope:** Ferrum modifications, gate bypasses, confidence/threshold changes, speculative approval reuse, delivery-policy changes.

## Test list

- [x] Requirement replacement includes the scoped decision and actual RED evidence.
- [x] Still-required coverage loss is blocked even with a narrow departure.
- [x] Stale slice, spent once departure and changed edit cannot reuse authorization.
- [x] Unresolved evidence, malformed JSON/schema/answers, low confidence and provider failure are distinguishable without leaking secrets.
- [x] Rejection leaves file unchanged.
- [x] Nix-wrapped test execution is recognized and failure evidence retained.
