# Fix repeated preparation of an unchanged review round

## Observed failure

The local session trace shows five `devsys_review_start` calls for slice
`integrate-and-deliver-approved-adoption`, round 1, digest `d3ce1821dbc1dfb7`,
between 2026-10-29T01:13:31Z and 01:14:57Z. `agent_types` calls intervened,
but no failed spawn justified a new handoff. Each response minted a fresh path.
The eventual reviewer completed, its result was recorded, and assignment commit
`0c248ea` remains local and unpushed.

`startRound` in `src/review/review-tools.ts` reclassified lenses, cleared the
submission store and returned a new spawn path on every request. It stored no
pending handoff. ADR0014 explicitly makes the two-process-attempt rule guidance,
not an activity monitor; it therefore did not prevent this tool loop. This is
not evidence that Pi replayed calls or that a spawn failed.

## Verification evidence

- New public repeated-start regression failed before implementation: lens assessment
  count was 2 instead of 1 (`a pending round must not be reclassified`).
- After implementation and review repair, all 43 review-tool tests passed. Controls cover a submitted
  result remaining recordable, a genuine next round, changed diff/range, independent
  sessions and existing configuration-change behavior. Existing tests were retained.
- Independent review found a workflow-transition invalidation defect. A new public
  regression failed when planning changed to implementing between starts; saving and
  comparing the post-start workflow fixed it without relaxing the review gate.
- Fresh full `npm test`: 1,811 passed, zero failures/skips
  (`/tmp/devsys-review-loop-full-test.log`).
- Typecheck passed. Initial lint found one test-formatting error; after formatting,
  typecheck, lint, Knip, Markdown and whitespace checks all passed.
- No live model or GitHub behavior is claimed from these deterministic tool-effect
  fixtures. This bounds repeated preparation; it is not a universal model-loop
  detector. Pending handoffs intentionally share submissions' process-local lifetime.

## LOOP — Preserve a pending review handoff

**Goal:** Repeating preparation of the same pending round/diff cannot mint another reviewer or discard its result; recording still advances the review normally.

**Files:** src/review/review-tools.ts, test/review/review-tools.test.ts, docs/plan/review-start-loop.md, package.json, package-lock.json

**Interfaces:** Existing tool parameters and persistent formats remain unchanged. Keep one internal pending handoff per session-state/slice, identified by current review object, range and diff digest. Repeated start returns an actionable error with the original handoff, or a record instruction when a result is waiting. It performs no new lens judgement, state update or submission clear. Cache lifetime matches in-memory submissions; it is not durable review evidence. Changed diff/range, a recorded round or replaced workflow/review invalidates reuse. Failed dispatch can reuse the same uncreated path; an existing failed child is resumed with agent_steer, not duplicated. Existing digest/severity/clean-round/commit safeguards remain authoritative.

**First failing test:** Public start tool is called twice with an advancing fake clock and fake Jev; assert same returned spawn path, unchanged state, exactly one lens assessment and explicit pending-next-action reply. Existing behavior returns a different path and repeats classification.

**Steps:**

1. Add and run the public repeated-start regression RED; keep existing tests unchanged.
2. Add minimal session-scoped handoff reuse in review-tools.ts and run that regression GREEN.
3. Add submitted-result preservation, changed-diff, next-round and independent-session controls one at a time; fix concrete failures without weakening assertions.
4. Run full offline tests, typecheck, lint, Knip, Markdown and active changed-path diagnostics; independently review the fix.

**Run:** `node --experimental-transform-types --no-warnings --test test/review/review-tools.test.ts`; `npm test`; `npm run typecheck`; `npm run lint`; `npm run lint:knip`; `npm run lint:md`.

**Expected:** Initial regression fails for repeated preparation, then all tests/checks pass. The original submitted result remains recordable, changed code still needs current review, and repeated start is not reported as new progress.

**Out of scope:** Generic loop monitor, automatic reviewer spawning, relaxed review gates, new dependency/persistence/public contract, unrelated adoption implementation or pushing the existing assignment commit. The observed LLM coordination failure is not claimed universally solved by bounded handoff behavior.
