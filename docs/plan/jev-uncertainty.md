# Jev uncertainty escalation

## jev-escalation — Reason before interrupting

**Goal:** Ambiguous classifier answers receive evidence-based LLM assessment before any human interruption, while real approval gates remain enforced.

**Files:** `src/jev/`, `src/gates/test-guard.ts`, `src/gates/git-guard.ts`, `src/planning/intake-tool.ts`, corresponding tests and classifier fixtures, and ADR 0015.

**Interfaces:** Preserve `Jev.ask`; introduce an injectable reasoning assessor returning typed resolved answers or an unresolved error. Production composition selects the configured advisor slot through the host registry.

**First failing test:** A low-confidence test-change judgment invokes the reasoning assessor and returns a legitimate correction without requesting approval.

**Steps:**

1. Add regression tests for ambiguous answers, correction evidence, cancellation and unavailable/unresolved assessment.
2. Implement a shared cascade with validated structured reasoning responses and bounded execution.
3. Wire configured advisor routing and retain separate usage provenance.
4. Audit every consumer and remove uncertainty-only human escalation, retaining actual permission gates.
5. Verify classifier fixtures, all checks and fresh-context review; release according to repository policy.

**Run:** `npm test && npm run typecheck && npm run lint && npm run check:jev && npm run eval:reasoning`.

The user approved keeping the configured-advisor live eval separate from CI: `npm run eval:reasoning` requires locally authenticated advisor credentials and is run explicitly before release. CI retains all deterministic fallback tests and the existing mandatory TypeSafe live fixtures (`npm run test:jev`); no existing test is skipped or relaxed. The advisor live eval covers correction, regression hiding and source-text prompt injection.

**Expected:** All checks pass, including regression coverage for the blank-line correction and genuine weakening safeguards.

**Out of scope:** Unrelated architecture-policy work in the original worktree, the external screenshot project, and relaxed verification thresholds.

## Test list

- Low-confidence choice/score and ambiguous boolean invoke reasoning before consumption.
- Unclear labels and invalid/missing answers invoke reasoning.
- Confident answers avoid unnecessary reasoning.
- Provider unavailability reaches reasoning; cancellation and accounting failures do not retry.
- Unresolved, malformed, missing-model and timed-out reasoning never grant permission or directly open human UI.
- Corrected padding/newline expectations preserve height and exact content assertions.
- Deletion, skip, empty tests and gate-gaming remain protected.
- Explicit irreversible-operation approval remains human-owned.

## Consumer audit

All extension consumers receive the shared holder cascade before applying their own policy. The audit found 18 judgment calls in 12 consumer modules, spanning 13 question modules.

| Consumer | Uncertainty after shared reasoning | Human-owned decisions retained |
| --- | --- | --- |
| `src/gates/test-guard.ts` | Ordinary edits block with evidence guidance when unresolved; stored failure evidence is forwarded. Structural deletion/skip protections remain. | Regression-hiding hard stops |
| `src/gates/git-guard.ts` | Unknown commands require explicit command/evidence, not blanket human permission. | Irreversible git operations |
| `src/gates/commit-guard.ts` | Unresolved commit/architecture judgments block independently of departure deduplication. | Secret and substantive commit gates |
| `src/gates/push-guard.ts` | Unresolved repair judgment blocks before red-trunk permission UI. | Confident non-repair red-trunk approvals |
| `src/planning/intake-tool.ts` | Unresolved sizing returns evidence guidance or accepts explicit size. | Replacing active work |
| `src/state/route-task-tool.ts` | Unresolved routing returns error rather than routine/low downgrade. | No uncertainty-only UI |
| `src/context/intent-trigger.ts` | Offline primary still reaches reasoning; unresolved result suppresses advisory nudge. | No uncertainty-only UI |
| `src/context/turn-verifier.ts` | Offline primary still reaches reasoning; unresolved result does not invent a correction. | No uncertainty-only UI |
| `src/jev/judge-tools.ts` | Sizing, test-change, lenses and readiness return typed result/error. | No uncertainty-only UI |
| `src/planning/task-check-tool.ts` | Unresolved readiness stays advisory; structural checks remain independent. | No uncertainty-only UI |
| `src/review/review-tools.ts` | Unresolved lenses retain conservative coverage; unresolved severity retains reviewer judgment. | Review cannot be waived by uncertain classification |
| `src/review/lens-review-tool.ts` | Unresolved product lenses retain all lenses; solution-detail classification remains advisory. | No uncertainty-only UI |

The standalone release scripts are also audited: `scripts/check-version.ts` and `scripts/build-gate.ts` consume `scripts/lib/jev.ts` for semver and repair judgments. They expose no human-input UI. Unavailable or insufficiently confident assessments fail closed with process evidence delivered to the coordinating LLM, which can inspect the diff, choose a sufficient version or repair the failure before retrying. CI remains fail-closed without interactive permission; existing explicit override policy is unchanged. These process gates do not use the extension holder and do not directly escalate uncertainty to a human.

## Threat assessment

Assets are gate authority, repository source and credentials. Classifier state is untrusted data crossing the existing authenticated model boundary. Reuse existing redaction/bounds, never send credentials or full session history, prohibit tools in the reasoning call, validate all returned fields against the question schema, and bound cancellation/timeouts. A reasoning answer is evidence for classification, never approval for an operation; human-owned gates still run after classification. If assessment cannot resolve the question, return an actionable model-facing error rather than authorizing or asking the human solely because the classifier was uncertain.
