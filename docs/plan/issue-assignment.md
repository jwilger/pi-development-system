# S8 — Explicit nonexclusive issue assignment

Approved revision 0.2; no local workflow or exclusive-claim semantics are added.

## S8 — Assign only named collaborators

**Goal:** An explicit assignment changes only the named assignees while a concurrent Project field edit remains unchanged and no exclusive claim is reported.

**Files:** src/tracker/types.ts, src/tracker/github.ts, src/tracker/work-item-tool.ts, src/tracker/github-assignment.ts, test/tracker/assignment.test.ts, docs/plan/issue-assignment.md

**Interfaces:** `AssignmentRequest={readonly operation:"add"|"remove";readonly assignees:readonly string[]}`. `AssignmentResult={readonly kind:"confirmed"|"not-attempted"|"uncertain";readonly message:string;readonly before:readonly string[];readonly after:readonly string[]|null;readonly ownership:"not-exclusive"}`. Optional `Tracker.assign(id:string,request:AssignmentRequest):Promise<TrackerResult<AssignmentResult>>`; export `assignIssue(deps:{exec:Exec;cwd:string;repo:string},id:string,request:AssignmentRequest):Promise<TrackerResult<AssignmentResult>>` in github-assignment.ts. Public action assign requires id, operation and assignees. Validate positive safe integer issue id, nonempty unique explicit GitHub login list (no @me/switches/commas/empty); preflight verifies repository/number/URL identity and complete assignee read. Dispatch one gh issue edit --add-assignee or --remove-assignee with separate argv. Fresh readback must confirm requested membership and same issue identity, preserving unrelated assignees; no claim of atomicity. Any dispatched failure/timeout/partial/invalid acknowledgement/readback is uncertain with explicit reread-before-retry advice. Already-satisfied requests are no-op. Preflight failure writes nothing. No Project/label/lifecycle/schema writes. Advertise capability for configured GitHub repo even without Project; other adapters return unsupported. Tool errors on not-attempted refusal/uncertain, succeeds on verified no-op/confirmed. Other CRUD unchanged.

**First failing test:** New test/tracker/assignment.test.ts uses public createWorkItemTool/temp config/fake remote Exec. On explicit add of named alice, fake remote concurrently changes Project field to a human-selected value. Assert assignees now include alice, field retains human value, zero field/lifecycle operations, and result ownership is not-exclusive. Run rejected-action RED first.

**Steps:**

1. Add `assignment is not an exclusive claim` in test/tracker/assignment.test.ts through the public tool and retain RED.
2. Add AssignmentRequest/AssignmentResult and optional Tracker.assign to types.ts with the stated signatures.
3. Implement assignIssue preflight in github-assignment.ts: validate inputs, read issue identity and complete current assignees without writes.
4. In assignIssue dispatch one explicit assignment edit, then verify fresh assignees and identity; report uncertainty after ambiguous effects and no-op when already satisfied.
5. Wire github.ts capability and work-item-tool.ts action/parameters; run initial regression GREEN.
6. Add removal/no-op/unknown user/invalid ID/missing config/permission/timeout/incomplete readback tests individually; assert no implicit Project or lifecycle effects.
7. Run listed commands, record actual results and RED/GREEN here, return changed files without commits/pushes or workflow-state changes.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/assignment.test.ts test/tracker/github.test.ts test/tracker/work-item-tool.test.ts`; `npm run typecheck`; `npm run lint`; `npm run lint:knip`; `npm run lint:md`.

**Expected:** Initial public rejected-action RED precedes implementation; all named tests pass afterward and gates exit zero. Uncertain writes never become exclusive claims or automatic retries, existing lifecycle behavior remains intact.

**Out of scope:** Scheduling, self-assignment defaults, reservations/CAS, rank/field updates, provisioning, live downstream operations, README/package edits. Existing gh authority only; untrusted identities are parsed, argv is never shell-interpolated and no credentials are logged. Coordinator owns README/delivery.

## Resumed integration evidence

The coordinator integrated assignment into the current tracker without reverting
S6/S7 or the published devsys 5 policy changes. The exact capability expectation
now includes `assign`, retaining all previous entries. A public permission-error
regression failed on the lost `HTTP 403 forbidden` diagnostic before the reader
was changed to return typed errors preserving the original cause; it then passed.

On source version 5.1.0, fresh `npm test` passed 1,807 tests with zero failures or
skips (`/tmp/devsys-s8-resumed-test.log`). Typecheck, lint, Knip, Markdown lint and
both staged/unstaged whitespace checks exited zero. These are local results, not
CI/publication claims. Historical isolated-worker evidence below remains labeled
as such; its capability integration failure has been resolved, not suppressed.

## Implementation evidence

- Initial RED, before implementation, in the original isolated worktree:
  `node --experimental-transform-types --no-warnings --test test/tracker/assignment.test.ts`
  exited 1: `tests 1`, `pass 0`, `fail 1`, `Error: unhandled case: "assign"`.
- Initial regression GREEN after implementation:
  `node --experimental-transform-types --no-warnings --test test/tracker/assignment.test.ts test/tracker/github.test.ts test/tracker/work-item-tool.test.ts`
  exited 0: `tests 31`, `pass 31`, `fail 0`.
- Added and ran removal, no-op, unknown-user, invalid-input, missing-configuration,
  permission, timeout, incomplete-read, partial-edit, identity and acknowledgement
  cases individually through the public tool and fake Exec. Each targeted run
  exited 0 with `tests 1`, `pass 1`, `fail 0`. No live GitHub calls were made.
- After relocating the same worktree to
  `/tmp/pi-development-system-issue-assignment`, the full named regression command
  above exited 0: `tests 42`, `pass 42`, `fail 0`, `skipped 0`. The additional test
  count includes a containing public-tool test; its 11 subtests all execute.
- `npm run typecheck` exited 0 (`tsc --noEmit`).
- Initial `npm run lint` exited 1 with 19 local formatting/lint errors. Logical
  simplification, a shadowed-local rename, and moving test helpers into the
  containing test resolved them without suppressions or removed assertions.
  Final `npm run lint` exited 0: `Checked 310 files`, `No fixes applied`.
- `npm run lint:knip` exited 0 (`knip`).
- `npm run lint:md` initially exited 0. After recording this evidence, one extra
  trailing blank line produced MD012; removing it restored exit 0:
  `Summary: 0 issues in 0 files`.
- Additional tracker-wide check:
  `node --experimental-transform-types --no-warnings --test test/tracker/*.test.ts`
  exited 1: `tests 97`, `pass 96`, `fail 1`. The sole failure is the exact
  capability-list assertion in `test/tracker/project.test.ts:97`, which does not
  yet include the newly required `assign` capability. That file is outside S8's
  allowed files and was left unchanged for coordinator follow-up. No production
  behavior was weakened to preserve the old expectation.

Assignment preflight rejects incomplete connections rather than treating a
partial assignee list as complete. Dispatched errors remain uncertain with
reread-before-retry advice, never automatic retries or exclusive claims. The
fake remote's concurrent human Project field edit survives both add and remove;
no Project, label, or lifecycle operations are dispatched.
