# Continuation-aware intake repair

## continuation-intake — Keep acceptance repairs in approved work

**Goal:** Continue approved goal/slice repairs without re-intake while preserving authorization for unrelated work.

**Files:** `src/context/intent-trigger.ts`, `src/jev/questions/intent.ts`, `src/context/system-prompt.ts`, `src/context/phase-guide.ts`, `src/planning/intake-tool.ts`, `src/planning/slice-close.ts`, intake prompts/skill, public hook tests, intent fixtures and live guidance evaluations.

**Interfaces:** Preserve the intake tool's parameters and replacement-consent boundary. Use the supported session projection for bounded, redacted contextual classification; no private goal storage or cross-session mutation. Guidance must require inspecting the focused goal when available, active slice and recent evidence before deciding scope.

**First failing test:** An idle hook supplied a compacted active-goal/evidence projection sends that evidence to the classifier and never emits an unconditional new-work assertion, even if the classifier says fix.

**Steps:**

1. Add public hook regressions for contextual classification and continuation-safe guidance.
2. Reconcile intake entry points, phase and closure text; pass supported session evidence to advisory classification.
3. Extend model-backed intent and shipped-guidance evaluations for repairs, lifecycle context and negative scope controls.
4. Run verification and independent review, repair findings in this slice, and report evidence and limits.

**Run:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run lint:knip`, `npm run lint:md`, intent live fixtures and intake guidance live evaluations.

**Expected:** Public behavior tests and relevant live evaluations pass; replacement consent remains intact; report separates advisory scope reasoning from mechanically enforced state/consent.

**Out of scope:** Architecture-policy session repairs; changing installed extensions or consumer projects; push, publish or release. No new authorization is implied by continuation or classifier output. Stop and ask for a concrete unresolved scope/authorization/blocker decision, not for remaining acceptance work or model uncertainty.
