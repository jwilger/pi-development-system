# S13a — Pure delivery-condition assessment

Approved revision 0.2 S13 / ADR0013. S13b adds one-shot observations/public tool; this pure slice does not claim the full capability is delivered.

## S13a — Distinguish pending merge and satisfied checks

**Goal:** An open PR remains pending when merge is explicitly required, even when every named current-head check passes.

**Files:** src/tracker/delivery-assessment.ts, test/tracker/delivery-assessment.test.ts, docs/plan/pr-assessment.md

**Interfaces:** Export these readonly types from delivery-assessment.ts: `PullRequestRef={repository:string;number:number}`; `CheckObservation={name:string;headOid:string;state:"success"|"pending"|"failure"|"unknown"}`; `PullRequestObservation={ref:PullRequestRef;url:string;headOid:string;base:string;state:"open"|"closed"|"merged";draft:boolean;mergedAt:string|null;mergeOid:string|null;checks:readonly CheckObservation[]}`; `DeliveryConditions={requireMerge?:boolean;targetBase?:string;requiredChecks?:readonly string[];manualRequirements?:readonly string[]}`; `ConditionState="satisfied"|"pending"|"failed"|"blocked"|"unknown"`; `ConditionAssessment={ref:PullRequestRef;name:string;status:ConditionState;message:string}`; `DeliveryAssessment={status:ConditionState|"unassessed";observations:readonly PullRequestObservation[];conditions:readonly ConditionAssessment[]}`. Export `assessDelivery(observations:readonly PullRequestObservation[],conditions:DeliveryConditions):DeliveryAssessment`. Pure synchronous/no I/O. No conditions or zero observations is unassessed. Contract decisions below; no implicit policy/default merge/check.

Decisions: For each PR independently, requireMerge:true passes only merged with nonempty mergeOid/mergedAt; closed-unmerged fails, open pending regardless auto-merge (draft blocked), inconsistent merged facts unknown. targetBase mismatch fails. Each named check requires nonempty headOid and all same-name observations bound to that exact head; missing/old/unknown is unknown, current failure failed, pending pending, all current success satisfied. Manual requirements are unknown/unsupported even if mechanical checks pass. Aggregate priority failed > blocked > unknown > pending > satisfied. No requested conditions is unassessed. Output retains observed facts and explanatory per-condition statuses; never asserts full issue completion/exclusive authority. Caller parses inputs at ingress in S13b; do not add files/network/config/throws here.

**First failing test:** New test/tracker/delivery-assessment.test.ts test `passing checks do not deliver an open PR` calls exported assessDelivery with an open PR, successful current-head CI, requireMerge:true and requiredChecks:["CI"]. Assert aggregate pending, merge pending, CI satisfied, unchanged input facts. Initial import fails before module exists; retain RED.

**Steps:**

1. Add `passing checks do not deliver an open PR` through assessDelivery in delivery-assessment.test.ts; run Run and retain missing-export RED.
2. Create delivery-assessment.ts with the stated types and assessDelivery; implement merge and named-check decisions needed for the first test, then run it GREEN.
3. Add test `old or absent checks stay unknown`; assert each gives unknown despite another passing check. Repair assessDelivery and rerun.
4. Add test `every same-name check must pass`; assert pending/failure dominates same-name success at the same head. Repair assessDelivery and rerun.
5. Add test `merge and base conditions are independent`; assert closed-unmerged failed, draft blocked, inconsistent merge unknown and wrong base failed in separate table rows. Repair and rerun.
6. Add tests `manual requirements cannot pass`, `all PRs must satisfy`, and `no policy is unassessed` one at a time, asserting exact statuses/condition reasons before each repair.
7. Run every Run command; append command/exit code plus first-test RED/GREEN evidence to this file. Report any gate failure without suppression or commit/push.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/delivery-assessment.test.ts`; `npm run typecheck`; `npm run lint`; `npm run lint:knip`; `npm run lint:md`.

**Expected:** Named test initially RED, then all checks exit zero. Current successful checks cannot make an open merge-required PR satisfied; missing/old/manual facts never pass. No filesystem/network, mutation, cached delivery status or new dependency.

**Out of scope:** S13b remote reader/tool integration, manifests, completion guard, instructions/README/package and downstream operations. Coordinator may need entry reachability integration for Knip before delivery; report it honestly rather than suppress unused exports.

## Implementation evidence — S13a

All commands ran with `cd /tmp/pi-development-system-pr-evidence` first. Only the two new module/test files and this evidence append were changed. The function is synchronous and performs no I/O; it preserves observations and evaluates only explicitly requested conditions. No S13b integration or full delivery claim is made.

### Public-function RED/GREEN sequence

Command for every row: `node --experimental-transform-types --no-warnings --test test/tracker/delivery-assessment.test.ts`.

| Test added | Initial exit / observed evidence | After repair exit / evidence |
| --- | --- | --- |
| `passing checks do not deliver an open PR` | 1: `ERR_MODULE_NOT_FOUND`, `Cannot find module '/tmp/pi-development-system-pr-evidence/src/tracker/delivery-assessment.ts'`; `tests 1`, `pass 0`, `fail 1` | 0: `✔ passing checks do not deliver an open PR`; `tests 1`, `pass 1`, `fail 0` |
| `old or absent checks stay unknown` | 1: `absent`, actual `satisfied`, expected `unknown` | 0: `tests 2`, `pass 2`, `fail 0` |
| `every same-name check must pass` | 1: actual `satisfied`, expected `pending` | 0: `tests 3`, `pass 3`, `fail 0` |
| `merge and base conditions are independent` | 1: `closed-unmerged`, actual `pending`, expected `failed` | 0: `tests 4`, `pass 4`, `fail 0` |
| `manual requirements cannot pass` | 1: actual `satisfied`, expected `unknown` | 0: `tests 5`, `pass 5`, `fail 0` |
| `all PRs must satisfy` | 0: `tests 6`, `pass 6`, `fail 0`; existing per-PR loop and priority already passed, so no repair or artificial RED | No repair needed |
| `no policy is unassessed` | 1: actual `satisfied`, expected `unassessed` | 0: `tests 7`, `pass 7`, `fail 0` |

### Formatting and gate results

- `biome check --write /tmp/pi-development-system-pr-evidence/src/tracker/delivery-assessment.ts /tmp/pi-development-system-pr-evidence/test/tracker/delivery-assessment.test.ts`: exit 1, `Excessive complexity of 38 detected (max: 25)`; formatted two files. Separate behavior-preserving extraction of check assessment reduced complexity to 26; second run exit 1, `Excessive complexity of 26 detected (max: 25)`. Extracted merge assessment separately; third run exit 0, `Checked 2 files`, `No fixes applied.` No suppression was added.
- `node --experimental-transform-types --no-warnings --test test/tracker/delivery-assessment.test.ts`: after extraction exit 0, `tests 7`, `pass 7`, `fail 0`; after typecheck repairs exit 0 again, `tests 7`, `pass 7`, `fail 0`.
- `npm run typecheck`: first exit 1, five `TS2532: Object is possibly 'undefined'` errors in the new test. Added an existence assertion, tuple fixtures and iterator-based indexing without removing any assertion. Rerun exit 0, `tsc --noEmit`, no diagnostics.
- `npm run lint`: first exit 0, `Checked 312 files in 312ms. No fixes applied.` Rerun after typecheck repairs exit 0, `Checked 312 files in 334ms. No fixes applied.`
- `npm run lint:knip`: both runs exit 1, `Unused exported types (4)`: `PullRequestRef`, `CheckObservation`, `ConditionState`, `ConditionAssessment`, all in `src/tracker/delivery-assessment.ts`. These exports are required by this task and remain intact. Knip did not report an unused module or unused `assessDelivery` export in these runs; this does not establish production entry reachability or S13b integration. No suppression, configuration change or artificial consumer was added.
- `npm run lint:md`: exit 0 before this append and exit 0 on rerun after the evidence append; both reported `Linting: 106 files`, `Summary: 0 issues in 0 files`.

Knip remains a failed gate. The pure slice is implemented, but the task's expected all-zero gates are not achieved. No commit, push, network, dependency, README/package, workflow, intake or downstream operation was performed.
