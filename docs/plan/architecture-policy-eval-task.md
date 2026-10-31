## architecture-policy-eval — Model-backed architecture policy evaluation

**Goal:**

Provide and run a bounded model-backed pi SDK evaluation of the mandatory architecture policy's behavioral effect, with offline public-host regression tests and recorded provenance. This is instruction-effect evidence, not semantic truth, independent final review, or a universal enforcement claim.

**Files:**

- New `scripts/lib/architecture-eval.ts`
- New `scripts/eval-architecture.ts`
- New `test/context/architecture-eval.test.ts`
- New evidence under `docs/evidence/architecture-policy/` only if sanitized and uniquely named; otherwise temporary paths reported to parent.
- No edits to other files, dependencies, ADRs, package metadata, or repository state. No commits/pushes.

**Interfaces:**

Use the installed pi public SDK and production `applyWorkflowRequest` or shared `ARCHITECTURE_POLICY` path, not Codex APIs or a handwritten alternate policy. Read existing `scripts/eval-review.ts`, `scripts/lib/review-eval.ts`, `test/harness/offline-session.ts` as patterns; do not modify them. Build sanitized synthetic fixtures and a typed answer tool whose observable calls are assessed. Include baseline vs guidance conditions; do not manufacture a baseline failure if the model already knows a rule. Capture actual effective model, policy/source hashes, fixture, typed output, error/timeout/turn information and pass/fail. No hidden evaluator prompt containing expected answers. Baseline and guidance use the same scenario/task except policy injection. Reserve evidence before network use (exclusive creation, private mode), bound time/turns, disable retries/automatic compaction and unrelated tools, clean temporary roots. Fail closed on unavailable explicit model/credentials; no silent model fallback. Do not output credentials, environment values, or unrelated source/context.

Cases must cover valid substantive pairing; empty/cosmetic/missing updates; self-contained authority vs backlinks/source tables/delegation; corrections/deletion/renaming of merged records; significance vs routine choices; valid linked status-only supersession; paired vs unpaired premerge edits; multiple additions/resulting squash losses; rejected alternatives with or without material context change; sequential bootstrap; prospective migration preserving legacy records and unrelated work. Keep fixture truths unambiguous and machine assessment limited to observable expected decisions, with explanations retained for independent review. Never grade substantive truth merely from changed bytes.

CLI requires explicit provider/model/output (and case/condition if per-cell). Read runtime availability safely and use an explicit available model for a live bounded guidance run. If credentials/model unavailable, record failure and report the concrete blocker; do not claim a live evaluation ran or passed. Running an evaluation is authorized by the goal; publishing and consumer modification are not.

**First failing test:**

A real offline pi-session response chooses a forbidden action in a cosmetic-update scenario; evaluation assessment must fail. Scaffold imports if necessary, then observe an assertion failure for behavior, not missing-module failure, before implementing assessment.

**Steps:**

1. Read applicable TypeScript, behavior-testing and TDD skills; inspect the bounded existing runner and installed pi docs needed for APIs.
2. Build synthetic cases and pure assessment contract, test-first with valid and invalid observed tool calls, malformed/missing answers and no false pass on errors.
3. Integrate production policy into actual pi session context; offline tests capture actual requests and typed results, baseline vs guidance separation and fail-safe abort/errors.
4. Implement opt-in explicit live runner with bounded execution and sanitized, immutable provenance evidence; execute a live guidance evaluation if an available explicit model is usable.
5. Run focused tests, TypeScript and Biome for owned files; report exact commands, outputs/evidence and any unverified behavior.

**Run:**

`node --experimental-transform-types --no-warnings --test test/context/architecture-eval.test.ts`

`npm run typecheck`

`npx biome check scripts/lib/architecture-eval.ts scripts/eval-architecture.ts test/context/architecture-eval.test.ts`

Run the new live CLI with explicit resolved provider/model and unique output path, reporting the exact invocation without secret values.

**Expected:**

Focused offline tests and static checks exit zero. Live evidence reports actual model/cases and outcomes honestly, including baseline ceiling effects and failures; report any blocked live execution as missing evidence, not success.

**Out of scope:**

Guard/review integration, independent acceptance review, runtime provenance or semantic core edits, tracker/config/repository changes, dependency installation, publication and commits. You may not delegate. Parent owns all existing uncommitted work and another implementer owns the semantic core files; preserve both.
