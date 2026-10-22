# PI14-4b — Classifier execution consumers

**Goal:** Attribute direct classifier usage to the execution that caused it and forward caller cancellation without changing gate decisions or classifier questions. Continue ADR 0007's approved native tool accounting and separate hook telemetry.

**Files:** `src/jev/execution.ts`, classifier-consuming tool factories, `extensions/development-system.ts`, behavioural tests and offline SDK tests.

**Interfaces:** Execution-local Jev facade carries signal and usage callback. A tool adapter constructs an invocation-local facade, attaches direct usage to its final result and preserves tool metadata. Hook factories use the current context signal and append `devsys-jev-hook-usage` custom entries, explicitly outside native totals. The shared holder never stores caller state.

**First failing test:** Calling `judge_lenses` returns provider usage on the first result and none on a cached answer.

**Steps:**

1. Prove and implement direct tool accounting, including aggregation of multiple classifier calls and returned errors.
2. Prove caller cancellation reaches classifiers; preserve independent concurrent callers.
3. Wire all classifier tools through the same boundary, retaining sequential execution metadata and gate behaviour.
4. Prove hook telemetry is custom-only and forwards the current turn signal.
5. Verify actual SDK nested usage exactly once, cache hits, and extension errors.
6. Run full checks, active diagnostics, fresh-context reviews, commit/push and observe CI green.

**Run:** `npm run typecheck && npm test && npm run lint && npm run lint:knip && npm run lint:md && direnv exec . npm run check:jev`.

**Expected:** Direct result usage includes each actual returned classifier call once; cached answers emit no usage. Native nested execution remains host-owned. Hook usage is persisted only as explicitly separate telemetry. Cancellation is bounded and does not leak between invocations.

## Test list

- Direct judge tool result usage; cached answer does not rebill.
- Tool caller cancellation and independent parallel invocation.
- Multiple direct requests aggregate optional token breakdowns and costs.
- Provider error results retain reported usage.
- Hook custom telemetry and turn cancellation.
- Real SDK nested tool usage counted exactly once.

## Risk and boundary

No new dependency, credential or network boundary. ADR 0007 defines ownership and late-provider-usage limitations. Existing conservative gate fallbacks remain unchanged.

## Approved delivery blocker: severity reliability

John selected a classifier repair after the unchanged live severity evaluation passed and then blocked commit at 6/8. Its blocking criterion includes all wrong behaviour, overlapping limited-impact should-fix; the runtime-trigger instruction also conflicts with actionable regression-test gaps.

- Clarify mutually distinguishable consequence and evidence criteria without changing severity labels or gate policy. Both blocking and should-fix still prevent delivery.
- Keep every existing fixture case, expected label and accuracy threshold; update only the question hash after changing the rubric.
- Add independent cases for limited impact, changed-default regression gaps, contradicted claims, serious defects and style-only suggestions, including misleading reviewer labels.
- Evaluate the added cases across three fresh classifier caches, then run the unchanged full live suite, full local gates and fresh-context review.

## Approved extension: remaining live classifier failures

After the severity repair passed its original evaluation and 48 fresh-cache judgments, the full live gate failed routing at 7/10. John approved including remaining live classifier failures before delivery.

- Distinguish mechanical edits from changes to existing security-policy parameters; classify actual changed behavior rather than infer payment risk from a checkout filename; explicitly cover shared concurrent job infrastructure.
- Keep every original routing case, expected label and 80% threshold. Add six independent routing boundary cases and require exact labels on original plus added cases across three fresh caches.
- The additive routing regression failed before the repair (`trivial/high` instead of `routine/high` for an existing security parameter). Both targeted routing tests passed afterward, including all 48 repeated judgments.
- Run the complete live gate and all local checks, then fresh-context review of both rubric repairs and the execution-consumer changes.
