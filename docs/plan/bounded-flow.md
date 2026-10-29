# Bounded devsys flow

Owner-approved scope: correct readiness and review loops, not paused workflow adoption.
One usable increment; no implementation subagents or adoption artifacts imported.

## BF1 — Bounded readiness and review

**Goal:** Ordinary work proceeds test-first to current independent review and delivery without subjective readiness or default clean-streak loops.
**Files:** src/jev/questions/readiness.ts, src/planning/task-check-tool.ts, src/state/config.ts, src/review/review-tools.ts, src/context/, skills/, prompts/devsys-plan.md, test/, evals/, scripts/eval-bounded-flow.ts, docs/adr/0014-bounded-readiness-and-proportionate-review.md
**Interfaces:** Preserve task-check and review tool APIs and explicit stronger configuration; readiness section flags become advisory, full redacted context replaces clipping, new reviews default to one clean round. In-flight requirements cannot decrease.
**First failing test:** test/planning/task-check-tool.test.ts asserts subjective flags do not prescribe rewrites; test/jev/readiness.test.ts asserts late decisions survive and oversized context is not classified; test/state/config.test.ts expects one default round. Initial run: four expected failures.
**Steps:**

1. Add behavioral regression tests for advisory feedback, input completeness and default review completion, retaining negative controls.
2. Align tools, model-visible guidance and review configuration; preserve current review and safety gates.
3. Run deterministic and live effect controls, independent review, local gates, commit and trunk delivery with CI/publication evidence.

**Run:** `npm test && npm run typecheck && npm run lint && npm run lint:knip`
**Expected:** Exit 0; default review completes once, defects/stale diffs/structural errors remain stopped; opt-in effect evidence reports its actual outcomes separately.
**Out of scope:** Resume adoption agents, import unfinished worktrees/stashes/patches, add a workflow framework, change safety approvals or weaken tests to obtain green.
