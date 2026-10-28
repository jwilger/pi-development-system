# S7 — Explicit single-select write

Approved adoption revision 0.2 / ADR0011. Depends on delivered S4/S5 and S6 membership read.

## S7 — Refuse foreign options without writes

**Goal:** project-set with an option belonging to another field returns an error and performs zero mutations.

**Files:** src/tracker/types.ts, src/tracker/github.ts, src/tracker/work-item-tool.ts, src/tracker/github-project-set.ts, test/tracker/project-set.test.ts, docs/plan/project-set.md

**Interfaces:** Export `ProjectSetRequest={readonly fieldId:string;readonly optionId?:string;readonly clear?:boolean}` and `ProjectSetResult={readonly kind:"confirmed"|"not-attempted"|"uncertain";readonly message:string;readonly before:ProjectMembership|null;readonly after:ProjectMembership|null}`. Optional `Tracker.projectSet(id:string,request:ProjectSetRequest):Promise<TrackerResult<ProjectSetResult>>`. Export `setProjectField(deps:{exec:Exec;cwd:string;repo:string;projectId:string},id:string,request:ProjectSetRequest):Promise<TrackerResult<ProjectSetResult>>` in new module. Public action project-set requires id, fieldId, and exactly one of optionId/nonempty or clear:true. Use inspectProject and observeProjectMembership before dispatch; field must belong to configured Project and be SINGLE_SELECT, option must belong to that field; membership must be present/unarchived and known. Set invokes updateProjectV2ItemFieldValue with explicit projectId/itemId/fieldId and singleSelectOptionId; clear invokes clearProjectV2ItemFieldValue. Validate acknowledgements and reread membership/metadata before confirmed result; every post-dispatch failure is uncertain with re-read-before-retry advice. Blocked preflight is not-attempted; tool marks blocked/uncertain errors. No automatic enrollment, unarchive, retry, rollback, lifecycle/label/assignment/rank/schema writes or exclusive-claim claims. A same-value request is a verified no-op. State that preflight/readback cannot eliminate concurrent remote races. Expose capability only with explicit repo and Project.

**First failing test:** In test/tracker/project-set.test.ts call createWorkItemTool in a temp configured repo with fake Exec. Two actual fields have disjoint options; request first field with second field's option. Assert isError=true, identity-specific diagnostic, and remote mutation count zero. Run to RED before production edits.

**Steps:**

1. Add test `foreign options are refused without mutations` in test/tracker/project-set.test.ts; run that file and retain RED before editing production.
2. Add ProjectSetRequest, ProjectSetResult and optional Tracker.projectSet with the exact signatures above in types.ts.
3. Implement setProjectField preflight in github-project-set.ts: inspect actual field/options, read named membership and refuse invalid identities before mutation.
4. In setProjectField implement exactly one set/clear mutation, strict acknowledgement parsing and membership readback; return uncertain after any dispatched failure.
5. In github.ts expose projectSet only when configured; in work-item-tool.ts add project-set dispatch and parameter exclusivity. Run the initial test GREEN.
6. Add the contract's success/no-op/clear/refusal/uncertainty cases to project-set.test.ts individually, running each test after its smallest repair.
7. Run all Run commands; record their exit codes and initial RED/GREEN here, then hand back without commit, push or workflow-state changes.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/project-set.test.ts test/tracker/project-membership.test.ts test/tracker/project-items.test.ts test/tracker/project.test.ts`; `npm run typecheck`; `npm run lint`; `npm run lint:knip`; `npm run lint:md`.

**Expected:** Initial rejected-action RED precedes code; afterward all named tests pass and listed gates exit zero. Foreign identity and incomplete preflight cause zero writes; ambiguous write cannot be reported confirmed. Unchanged CRUD tests remain intact.

**Out of scope:** Other field types, provisioning, implicit policy transitions, workflow vocabulary, live calls/downstream changes, README/package changes. Existing gh authority only; pass GraphQL variables as separate argv, validate all external JSON/identities, never log credentials.

## Implementation evidence

Implemented explicit single-select set/clear, verified same-value no-ops, identity-based
preflight refusal, strict mutation acknowledgement validation, and fresh membership
and metadata verification. Blocked and uncertain results are tool errors. Every
dispatched failure is uncertain and advises re-reading before an explicit retry.
Preflight/readback cannot eliminate concurrent remote races; no exclusive claim,
automatic enrollment, unarchive, retry, rollback, lifecycle, assignment, label, rank,
or schema write is performed.

The required public foreign-option test was written and run before production edits.
Initial RED was the missing public action, not a fabricated adapter failure:
`Error: unhandled case: "project-set"`. After implementation the same test passed,
asserting the specific foreign option/field identities and zero mutations.

All implementation edits stayed within the six listed files. The first combined
run exposed the exact capability expectation in `test/tracker/project.test.ts`
(55/56 passed). Work paused rather than changing that out-of-scope file. The
coordinator appended `project-set` to that expectation without removing old
assertions; the subsequent complete targeted run passed 56/56, including that test.
Initial lint failures were formatting, complexity, nested ternary, and shadowing;
formatting and behaviour-preserving helper extraction resolved them without
suppressions. No README/package, intake/workflow-state, commit/push, live GitHub,
or downstream operations were performed.

Raw command output is retained in the `/tmp/s7-*.log` files below for this checkout
session. Exit codes are recorded from the actual command results; `pipefail`
preserves the check's failure despite `tee`.

### RED, first GREEN, and incremental contracts

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-initial-red.log
Expected: Public foreign-option regression fails before production changes.
Actual: Exit 1; "tests 1", "pass 0", "fail 1"; 'Error: unhandled case: "project-set"'.
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-initial-green.log
Expected: Same public regression passes with identity-specific refusal and zero writes.
Actual: Exit 0; "foreign options are refused without mutations"; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='set writes exactly' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-set-success.log
Expected: One explicit set mutation and fresh verification.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='same-value' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-noop.log
Expected: Verified same-value set and clear produce zero writes.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='explicit clear' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-clear.log
Expected: Exactly one clear mutation, no set mutation, verified empty field.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='public parameters' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-parameters.log
Expected: Missing identities or nonexclusive set/clear parameters fail before Exec.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='foreign, unsupported' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-field-refusals.log
Expected: Foreign, unsupported, duplicate or malformed field/option identities cause zero writes.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='absent, archived' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-membership-refusals.log
Expected: Absent, archived, unknown and inconsistent memberships block both operations.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='incomplete or inaccessible' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-preflight-refusals.log
Expected: Incomplete/inaccessible preflight and unsafe issue identities cause zero writes.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='capability is exposed' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-capabilities.log
Expected: Explicit repository and Project are required; direct requests are validated.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='ambiguous dispatch' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-dispatch-uncertainty.log
Expected: Ambiguous dispatch is uncertain, without automatic retry; explicit retry re-observes.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='partial, malformed' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-acknowledgements.log
Expected: Invalid acknowledgements cannot confirm set or clear.
Actual: Exit 0; "pass 1", "fail 0".
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test --test-name-pattern='readback failures' test/tracker/project-set.test.ts 2>&1 | tee /tmp/s7-readback-uncertainty.log
Expected: Failed readback, metadata changes and observed remote races remain uncertain.
Actual: Exit 0; "pass 1", "fail 0".
```

### Coordinator full-tree verification

On the isolated S7 tree at source version 4.5.0, `npm test` passed 1,786 tests
with zero failures/skips. Typecheck, lint, Knip and Markdown lint all exited zero.
Active LSP probes checked all six changed TypeScript source/test files: six clean,
zero diagnostics. These are fresh local results, not CI/publication claims.

### Gates and scope blocker, preserved rather than hidden

```text
Run: set -o pipefail; npm run typecheck 2>&1 | tee /tmp/s7-typecheck.log
Expected: Typecheck exits zero.
Actual: Exit 0; "tsc --noEmit"; no diagnostics.
```

```text
Run: set -o pipefail; npm run lint 2>&1 | tee /tmp/s7-lint.log
Expected: Lint exits zero.
Actual: Exit 1; "Found 8 errors." Formatting, complexity, nested ternary and shadowing required repair.
```

```text
Run: set -o pipefail; npm run lint:knip 2>&1 | tee /tmp/s7-knip.log
Expected: Knip exits zero.
Actual: Exit 0; "knip"; no findings.
```

```text
Run: biome format --write src/tracker/types.ts src/tracker/github.ts src/tracker/work-item-tool.ts src/tracker/github-project-set.ts test/tracker/project-set.test.ts
Expected: Format only owned source/test files, using biome from PATH.
Actual: Exit 0; "Formatted 5 files in 6ms. Fixed 4 files."
```

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test test/tracker/project-set.test.ts test/tracker/project-membership.test.ts test/tracker/project-items.test.ts test/tracker/project.test.ts 2>&1 | tee /tmp/s7-targeted.log
Expected: All named tests pass.
Actual: Exit 1; "tests 56", "pass 55", "fail 1". Existing exact capabilities expectation omitted required project-set; coordinator resolved the out-of-scope test update.
```

```text
Run: set -o pipefail; npm run lint 2>&1 | tee /tmp/s7-lint-final.log
Expected: Lint exits zero after formatting and helper extraction.
Actual: Exit 0; "Checked 312 files in 1807ms. No fixes applied."
```

```text
Run: set -o pipefail; npm run typecheck 2>&1 | tee /tmp/s7-typecheck-final.log
Expected: Typecheck exits zero after helper extraction.
Actual: Exit 0; "tsc --noEmit"; no diagnostics.
```

```text
Run: set -o pipefail; npm run lint:md 2>&1 | tee /tmp/s7-markdown.log
Expected: Markdown lint exits zero.
Actual: Exit 0; "Linting: 109 files"; "Summary: 0 issues in 0 files".
```

### Final checks after coordinator's capability expectation update

```text
Run: set -o pipefail; node --experimental-transform-types --no-warnings --test test/tracker/project-set.test.ts test/tracker/project-membership.test.ts test/tracker/project-items.test.ts test/tracker/project.test.ts 2>&1 | tee /tmp/s7-targeted-final.log
Expected: All named tests pass, including expanded capability expectation.
Actual: Exit 0; "tests 56", "pass 56", "fail 0"; no skipped, cancelled or todo tests.
```

```text
Run: set -o pipefail; npm run typecheck 2>&1 | tee /tmp/s7-typecheck-handback.log
Expected: Typecheck exits zero.
Actual: Exit 0; "tsc --noEmit"; no diagnostics.
```

```text
Run: set -o pipefail; npm run lint 2>&1 | tee /tmp/s7-lint-handback.log
Expected: Lint exits zero.
Actual: Exit 0; "Checked 312 files in 1512ms. No fixes applied."
```

```text
Run: set -o pipefail; npm run lint:knip 2>&1 | tee /tmp/s7-knip-final.log
Expected: Knip exits zero.
Actual: Exit 0; "knip"; no findings.
```

```text
Run: set -o pipefail; npm run lint:md 2>&1 | tee /tmp/s7-markdown-final.log
Expected: Markdown lint exits zero after this evidence append.
Actual: Exit 0; "Linting: 106 files"; "Summary: 0 issues in 0 files". The package banner now reports 4.5.0; this implementer made no package/version changes.
```

**Not verified:** Live GitHub behaviour and downstream operations were intentionally
not exercised. No full repository test-suite claim is made; the required four-file
suite was run. No remaining implementation blocker was observed.
 Coordinator owns README/delivery.
