# PI14-2 — Deterministic workflow mutations

## Goal

Concurrent pi 1.4 tool execution cannot replace a newer workflow or silently overwrite a review round. Keep subagent waiting/control tools parallel so a waiting parent cannot deadlock its children.

## Scope and interfaces

- First-party workflow-mutating tool factories: declare the host's `executionMode: "sequential"` contract.
- Intake: recheck workflow identity after asynchronous judgement and user confirmation before replacing work.
- Review start/record: recheck active workflow and targeted review after asynchronous diff reads and judgement, refusing stale calls without clearing submissions.
- Tests exercise the public tool interfaces; an isolated offline SDK provider checks host scheduling rather than emulating it.
- Preserve unrelated CI/test/availability updates; do not serialize waiting subagent controls or change pins/resume behavior.

## Test list and steps

1. Intake delayed during sizing refuses to replace a newer workflow; demonstrate RED, fix, rerun.
2. Intake delayed during replacement confirmation refuses a stale approval; preserve independent status updates.
3. A delayed review record cannot overwrite a competing recorded round; demonstrate RED, fix, rerun.
4. Delayed review start/record cannot move a newer active workflow or clear its submissions.
5. Real pi 1.4 scheduler runs workflow tools sequentially while parallel tools remain parallel.
6. Run full verification, active diagnostics, fresh-context reviews, then commit/push and observe CI.

## Verification

`npm run typecheck && npm test && npm run lint && npm run lint:knip && npm run lint:md && npm run check:jev && npm run check:build-gate && npm run check:version`

Expected: stale calls return an error and leave newer state intact; offline SDK reports no extension errors and deterministic call ordering. No source-text assertions or real credentials/network model calls.
