# Repository review guidance — integrated S9 delivery

Approved adoption revision 0.2 / ADR0012. This increment reuses the preserved
S9a/S9b/renderer work and integrates it directly under ADR0014; the earlier
preparatory subtasks do not require separate releases or readiness loops.

## Contract

- Optional `[review].guidance` defaults to an empty path list. Workflow and review
  sources share one 64 KiB budget, with 32 KiB per tracked, contained, regular UTF-8
  file. Categories, paths and content hashes define the guidance identity.
- Actual reviewer tasks and fallback instructions receive the snapshot and combined
  diff/guidance input identity. These are supplementary instructions, not proof of
  obedience or authority to override engineering hard stops.
- Successful start persists pending round/range/input identity. Typed submissions
  and fallback recording must match it; stored packets are partitioned by identity.
- Diff or guidance changes during asynchronous classification/adjustment refuse
  dispatch/recording without clearing a pending submission or earning clean credit.
- Clean credit belongs to its accepted input. Commit checks load current guidance
  before staged-file subset exceptions. Missing sources, changed content and removal
  of the final configured source cannot reuse old credit.
- Empty configuration preserves legacy submission and review behavior. Published
  devsys 5 default-one-round policy, explicit stronger settings, finding severities,
  state restoration and the pending-handoff loop fix remain intact.

## Evidence recorded during implementation

- Preserved pure-integration RED: stale input parsing assertion and missing new
  exports failed before source integration. After integration, 92 targeted tests
  passed, retaining current default-one-round tests.
- First new public-tool RED: after tracked concern content changed, the old tools
  incorrectly recorded a clean round. Fresh guidance/input validation fixed it.
- A typed-submission RED accepted the superseded identity before the matching-pending
  guard and identity-partitioned store were added; the combined submission/review
  regression set then passed 53 tests.
- Public controls exercise complete source transport, typed success, fallback
  identity/range, missing inputs, final-source removal and source changes while
  awaiting lens or severity judgments. The unchanged-input pending handoff is reused.
- Public commit-guard RED allowed a previously clean unchanged diff after concern
  content changed. Adding fresh guidance binding before existing review/subset
  decisions fixed it. Removing the final source or losing its file also blocks.
- Latest source-local run: all 78 public guidance/commit-guard tests passed with
  zero failures/skips (`/tmp/devsys-s9-commit-guard.log`). Dedicated existing staged,
  unstaged and subset commit tests remain unchanged. A one-use fixture-protocol
  correction decision is recorded in the decision log; no assertion was relaxed.

## Integrated local verification

At source version 5.2.0, the full suite passed **1,938 tests**, zero failures/skips
(`/tmp/devsys-review-elixir-final-test.log`). Typecheck, strict lint, Knip, Markdown
and whitespace checks passed after correcting one evaluator formatting issue. The
16 evaluator tests retain the strict negative controls. Six saved initialized
reviewer transcripts pass the corrected offline assessment with no new inference;
raw and first-derived failures remain immutable and explicitly labeled. This is
not a claim of guidance uplift or an all-pass raw model batch.

The bounded actual-SDK reviewer effect and controls are recorded separately in
[review-guidance-effects.md](review-guidance-effects.md) and `evals/review/`.
These local fixture results do not claim CI, publication, reviewer obedience or
live GitHub verification. Full integrated checks and independent review precede delivery.
