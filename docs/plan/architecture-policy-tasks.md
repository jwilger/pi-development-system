# Architecture policy implementation tasks

## ADR sequencing through the public tool

### Goal

Refuse creation of another ADR while a previously added decision is still uncommitted. Preserve existing records and fail closed if Git history or safe paths cannot be resolved. This is one increment of the approved architecture policy, not complete enforcement.

### Files

`src/planning/adr-tool.ts`, `src/planning/adr.ts`, `extensions/development-system.ts`, `test/planning/adr-tool.test.ts`, `test/planning/adr-sequence.test.ts`.

### Interfaces

Keep `devsys_adr_new({title})` public input unchanged. Supply the existing `Exec` dependency at composition. Inspect immutable Git objects and pending paths before writes. Return an error result without changing files when a pending ADR or unavailable history prevents safe creation.

### First failing test

Call `createAdrNewTool` in a temporary real Git repository twice without committing the first decision. The second call must refuse and leave exactly the first new decision on disk. This currently creates two decisions.

### Steps

1. Add the public-behavior regression with real Git history and run it RED.
2. Add minimal pending-decision detection before writing, using argument arrays and typed results.
3. Extend tests for committed-first progress, missing history and safe paths; never infer substantive architecture compliance from a commit.
4. Reconcile the existing test that deliberately permits two pending ADRs with the approved changed requirement.
5. Run focused tests and active diagnostics; retain exact evidence for independent review of the complete policy slice.

### Run

`node --experimental-transform-types --no-warnings --test test/planning/adr-sequence.test.ts test/planning/adr-tool.test.ts`

### Expected

Second uncommitted decision is refused without writes; committing the first permits progress; existing records are unchanged. Unknown history and unsafe filesystem paths are refused.

### Out of scope

This task does not prove semantic review, substantive correspondence, complete delivery-history preservation or squash compliance. Those remain explicit work in `docs/plan/architecture-policy.md`. No push, release, publishing or consuming-project edits.
