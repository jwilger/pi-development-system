## per-lens-review — Isolate selected code-review lenses

**Goal:** Every selected code-review lens receives its own fresh session, and only a complete set of single-lens results advances the round.

**Files:** src/review/review-tools.ts, src/review/submit-tool.ts, src/core/review.ts, src/core/review-flow.ts, associated test/review and test/core coverage, skills/code-review/SKILL.md and review orchestration guidance/evals.

**Interfaces:** Review start returns an array of agent_spawn payloads; ReviewState carries an optional durable dispatch manifest; existing typed submission and markdown packet formats stay available.

**First failing test:** Starting a two-lens round returns two distinct payloads, each assigned one lens, with common scope and diff digest.

**Steps:**

1. Add the dispatch test and implement per-lens fan-out payloads.
2. Add incomplete-result and aggregation tests; persist the dispatch manifest and validate complete coverage before recording.
3. Validate typed submissions against the single-lens assignments and cover persistence and retries.
4. Update code-review instructions and evidence fixtures, run verification, and obtain required fresh-context review.

**Run:** npm test; npm run typecheck; npm run lint; npm run lint:md; node --experimental-transform-types --no-warnings --test test/eval/per-lens-guidance.live.ts

**Expected:** All commands pass; per-lens tests cover complete, missing, failed, duplicate and unexpected results with no loss of severity or snapshot checks.

**Out of scope:** Product-planning lens reviews, lens-selection changes, clean-round or delivery-policy changes.
