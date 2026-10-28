# S6 — Explicit Project membership

Owner-approved adoption revision 0.2 and ADR 0011 cover this slice. S4/S5 are delivered.
No live downstream operations are authorized.

## S6 — Observe and explicitly enroll a named issue

**Goal:** After an explicit enrollment times out but remotely adds issue 7, retrying through the public tool reports existing membership and sends no second add mutation.

**Files:** src/tracker/types.ts; new src/tracker/github-project-membership.ts; src/tracker/github.ts; src/tracker/work-item-tool.ts; new test/tracker/project-membership.test.ts; test/tracker/project.test.ts; README.md; this task record. The coordinator handles package versions and delivery.

**Interfaces:** Add optional `Tracker.projectMember(id: string): Promise<TrackerResult<ProjectMembership>>` and `Tracker.projectEnroll(id: string): Promise<TrackerResult<ProjectEnrollment>>`. Add exported types in types.ts: `ProjectMembership` contains projectId, repository and issue `{issueId:string, number:number, url:string}` plus a discriminated membership: `{kind:"present", item:ProjectIssueObservation}`, `{kind:"absent"}` or `{kind:"unknown", diagnostics:readonly ProjectDiagnostic[]}`. Add `ProjectEnrollment` as a discriminated union of confirmed/enrolled, not-attempted/already-member, not-attempted/blocked and uncertain/unknown outcomes. Every variant contains an explanatory message and a membership observation or null; confirmed and already-member require a present observation. Keep expected errors as TrackerResult, never thrown. No mutation-attempt failure may be represented as an ordinary preflight refusal or success.

Export `observeProjectMembership(deps:{exec:Exec;cwd:string;repo:string;projectId:string},id:string):Promise<TrackerResult<ProjectMembership>>` and `enrollProjectIssue(deps:{exec:Exec;cwd:string;repo:string;projectId:string},id:string):Promise<TrackerResult<ProjectEnrollment>>` from the new module. Reuse `observeProjectItems` for complete, validated membership/field observations instead of duplicating pagination. Resolve the named issue through `gh issue view NUMBER --repo OWNER/REPO --json id,number,url`; accept positive safe integer issue numbers only (not URLs, switches, zero or fractional numbers), validate returned identity/number/repository URL before mutation. Refuse absent repo/Project config before Exec. No new configuration or dependency.

Public actions `project-member` and `project-enroll` require id and expose structured JSON; advertise both capabilities only with repo and Project configured. Member reads return actual fields/archive facts and never write. A complete scan with no matching issue is absent only when no redacted content prevents that conclusion; otherwise unknown. Duplicate matching memberships are an error. Enrollment preflight uses the same fresh observation: already present/unarchived is an idempotent no-op, archived or unknown is blocked with no write. Only proven absent issues can invoke `addProjectV2ItemById`, using explicit Project/content IDs as GraphQL variables in argv. Verify the response and re-read membership after a successful response; confirm only the intended item/issue/Project and nonarchived membership. All failures after dispatch (timeout/throw/nonzero/GraphQL partial errors/malformed output/failed verification) report uncertain effects with re-read-before-retry advice. Do not retry or roll back automatically. A later explicit retry re-reads first and must not add an already present issue. Tool outcomes blocked/unknown are errors containing the structured outcome; already-member/enrolled are successful. Existing CRUD and other adapters remain unchanged.

**First failing test:** In test/tracker/project-membership.test.ts add `a timed-out enrollment is observed before an explicit retry`. Invoke createWorkItemTool twice against fake Exec with temporary Project configuration. First add changes remote state then times out; assert uncertain. Retry must report existing membership and total add count exactly one. The current schema rejects project-enroll: record that RED before production edits.

**Steps:**

1. Write the named test in test/tracker/project-membership.test.ts with an in-memory Exec remote. Run the targeted test and retain the rejected-action RED output before editing production files.
2. In types.ts add ProjectMembership, ProjectEnrollment and the two optional Tracker methods with the signatures above; leave existing CRUD signatures unchanged.
3. In github-project-membership.ts implement observeProjectMembership: validate numeric id and returned issue identity, call observeProjectItems, and classify present/absent/unknown without writes.
4. In that module implement enrollProjectIssue: fresh preflight, idempotent or blocked refusal, one explicit add, acknowledgement validation and fresh verification; dispatch failures produce uncertain, never an automatic retry.
5. In github.ts wire the optional methods/capabilities. In work-item-tool.ts admit both actions, require id and render structured outcomes. Run the first test to GREEN.
6. Add member/no-op, archived/redacted, invalid identity, page-two, permission, partial GraphQL, malformed acknowledgement and failed-verification cases from the interface contract individually; observe each RED before its repair.
7. Document recovery/race limits in README and RED/GREEN evidence here; run every Run command and hand back results without committing, pushing or touching downstream resources.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/project-membership.test.ts test/tracker/project-items.test.ts test/tracker/project.test.ts test/tracker/github.test.ts test/tracker/work-item-tool.test.ts`; `npm test`; `npm run typecheck`; `npm run lint`; `npm run lint:knip`; `npm run lint:md`.

**Expected:** Initial RED rejects the new public action. After implementation all listed commands exit zero without skipped tests or live credentials; observable effects match the requested issue/Project, retries are idempotent, and unavailable or ambiguous evidence never becomes success or automatic retry.

**Out of scope:** Field writes, assignment/claim policy, unarchive, membership removal, provisioning/migration, live smoke checks, downstream changes, new workflow states, atomic reservations and implicit issue closure.

## Threat and recovery contract

The new write uses existing gh authority; no credentials are read or logged. Inputs are
validated and passed as argv/GraphQL variables. Identity/configuration/access failures
block writes. Returned API data is untrusted and parsed at ingress. Project reads are
complete but not atomic snapshots: preflight is not compare-and-swap and a concurrent
human edit cannot be reserved or rolled back. After ambiguous dispatch, explicitly
re-read before any retry. This slice adds no persistence or dependency boundary beyond
the already approved optional Tracker capability.

## Implementation evidence

All membership scenarios use the public tool with a temporary configuration and an
in-memory Exec remote. No live credentials, GitHub writes or downstream repositories
were used. Only S6-owned files were edited; versions, coordinator state and existing
CRUD/read gates were left alone.

### Initial RED and GREEN

The first test was written and run before production edits. Its remote adds the issue
and then throws a timeout; the public retry must report `already-member` with one add
in total.

```text
Run: node --experimental-transform-types --no-warnings --test test/tracker/project-membership.test.ts
Expected: Initial RED rejects project-enroll; after implementation the timeout/retry contract passes.
Actual: RED exit 1: "AssertionError [ERR_ASSERTION]: public schema rejects project-enroll"; "actual: false", "expected: true"; "tests 1", "pass 0", "fail 1", "skipped 0".
Actual: GREEN exit 0 after wiring: "✔ a timed-out enrollment is observed before an explicit retry"; "tests 1", "pass 1", "fail 0", "skipped 0". Fixture-only refactoring retained the same GREEN result.
```

### Incremental cases

Tests were added individually. Invalid issue identity and duplicate/inconsistent
membership tests exposed gaps and were repaired only after the recorded RED. Other
cases passed on their first run against the implementation; no RED is claimed for
those cases and no passing test was weakened to manufacture one.

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='member reads' test/tracker/project-membership.test.ts
Expected: Existing membership exposes observed identity/fields/archive facts and does not add.
Actual: First-run GREEN: "pass 1", "fail 0", "skipped 0".
```

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='archived membership' test/tracker/project-membership.test.ts
Expected: Archived facts remain visible; enrollment is blocked without an add.
Actual: First-run GREEN: "pass 1", "fail 0", "skipped 0".
```

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='redacted content' test/tracker/project-membership.test.ts
Expected: Redaction prevents proven absence and blocks enrollment without an add.
Actual: First-run GREEN: "pass 1", "fail 0", "skipped 0".
```

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='invalid returned issue' test/tracker/project-membership.test.ts
Expected: Invalid returned identities block before any Project read or mutation.
Actual: RED exit 1: "AssertionError [ERR_ASSERTION]: {\"id\":\"ISSUE_7\",\"number\":8,\"url\":\"https://github.com/o/r/issues/7\"}"; "actual: 'unknown'", "expected: 'blocked'"; "pass 0", "fail 1".
Actual: GREEN after validating the returned number and repository URL: "pass 1", "fail 0", "skipped 0".
```

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='duplicate or inconsistent' test/tracker/project-membership.test.ts
Expected: Duplicate or inconsistent matching observations are errors, not successful no-ops.
Actual: RED exit 1: "AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: false !== true"; "pass 0", "fail 1".
Actual: GREEN after rejecting duplicates and mismatched issue identities: "pass 1", "fail 0", "skipped 0".
```

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='page-two membership' test/tracker/project-membership.test.ts
Expected: Exhaust item pagination and include actual remote field values before considering an add.
Actual: First-run GREEN: "pass 1", "fail 0", "skipped 0".
```

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='permission failures' test/tracker/project-membership.test.ts
Expected: Preflight access errors block without writes and preserve the access diagnostic.
Actual: First-run GREEN: "pass 1", "fail 0", "skipped 0".
```

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='partial GraphQL mutation' test/tracker/project-membership.test.ts
Expected: Partial mutation errors are uncertain; a retry observes an already-added issue without another add.
Actual: First-run GREEN: "pass 1", "fail 0", "skipped 0".
```

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='malformed or mismatched acknowledgements' test/tracker/project-membership.test.ts
Expected: Invalid acknowledgements are uncertain, never success or automatic retry.
Actual: First-run GREEN: "pass 1", "fail 0", "skipped 0".
```

```text
Run: node --experimental-transform-types --no-warnings --test --test-name-pattern='failed verification' test/tracker/project-membership.test.ts
Expected: Absent, archived, wrong-item, redacted, inaccessible or wrong-Project verification is uncertain.
Actual: First-run GREEN: "pass 1", "fail 0", "skipped 0".
```

Remaining scenarios cover confirmed enrollment with noninterpolated variables, required
ids/unsafe numbers, absent configuration/other adapters, and nonzero/invalid JSON after
dispatch. These passed in the combined run. Existing capability expectations were
extended to include the new actions, and negative capability assertions were added
for Issues-only, repo-files and Project-without-repository configurations.

### Verification ledger

```text
Run: node --experimental-transform-types --no-warnings --test test/tracker/project-membership.test.ts test/tracker/project-items.test.ts test/tracker/project.test.ts test/tracker/github.test.ts test/tracker/work-item-tool.test.ts
Expected: Public membership behavior and existing read/CRUD/tool regressions pass without skips.
Actual: Initial combined run exit 1: "tests 73", "pass 72", "fail 1", "skipped 0". The existing capability array expected only project-items, not the two added actions.
Actual: After extending that expectation and adding the missing-repository capability check: exit 0, "tests 74", "pass 74", "fail 0", "skipped 0"; repeated after fixture type/format fixes with the same result.
```

```text
Run: npm test
Expected: All ordinary tests pass without live credentials or skipped tests.
Actual: Initial exit 0: "tests 1777", "pass 1777", "fail 0", "skipped 0".
Actual: Final implementation run exit 0: "tests 1783", "pass 1783", "fail 0", "skipped 0". Concurrent S10 tests account for the changing repository-wide count.
```

```text
Run: npm run typecheck
Expected: Exit zero with no TypeScript errors.
Actual: Initial exit 1: "test/tracker/project-membership.test.ts(231,37): error TS2352"; fixture endCursor inferred as null conflicted with a string cursor. Replaced the cast with an explicit string|null fixture type.
Actual: Final exit 0: "> tsc --noEmit" with no errors.
```

```text
Run: ./node_modules/.bin/biome check --write src/tracker/types.ts src/tracker/github-project-membership.ts src/tracker/github.ts src/tracker/work-item-tool.ts test/tracker/project-membership.test.ts test/tracker/project.test.ts
Expected: Format/lint only S6 source and tests.
Actual: Exit 127: "./node_modules/.bin/biome: No such file or directory". Used the environment-provided biome executable instead.
```

```text
Run: biome check --write src/tracker/types.ts src/tracker/github-project-membership.ts src/tracker/github.ts src/tracker/work-item-tool.ts test/tracker/project-membership.test.ts test/tracker/project.test.ts
Expected: Format/lint only S6 source and tests, without suppressions or weakened gates.
Actual: Exit 0: "Checked 6 files in 151ms. Fixed 3 files."
```

```text
Run: npm run lint
Expected: Exit zero without warnings or suppressions.
Actual: Initial exit 1: "Found 9 errors." Included own formatting/style issues and concurrent out-of-scope test/state/profile-detect.test.ts formatting. Own fixes stayed within S6; the other owner resolved the concurrent file.
Actual: Final exit 0: "Checked 311 files in 3s. No fixes applied."
```

```text
Run: npm run lint:knip
Expected: Exit zero without unused code/dependencies.
Actual: Initial and final exit 0: "> knip" with no findings.
```

```text
Run: npm run lint:md
Expected: Exit zero with no Markdown issues.
Actual: Exit 0: "Linting: 109 files"; "Summary: 0 issues in 0 files".
```

### Coordinator verification on the isolated S6 tree

After shelving the separately implemented S10 profile changes, the coordinator ran:

- `npm run typecheck`: exit 0.
- `npm run lint`, `npm run lint:knip`, `npm run lint:md`: exit 0 after moving parallel same-repository worktrees outside the root; no lint configuration changed. Nested root discovery had initially refused lint.
- The targeted five-file tracker command above: 74 passed, zero failures/skips.
- `npm test`: 1,774 passed, zero failures/skips (S10 tests are not in this tree).
- Active LSP probes on the six changed TypeScript source/test paths: six clean, zero diagnostics.

The source version is 4.4.0. These are fresh local results, not CI/publication evidence.
The implementation worker's final API request failed after its saved code/evidence;
this coordinator checked the artifacts rather than treating worker status as success.

### Not verified

Live GitHub/SSO permissions and concurrent-human races were not exercised: live checks
and downstream operations are explicitly out of scope. The unavailable local Biome
path was replaced by the installed executable and the full lint gate passed. No
remaining external verification blocker was observed in the final implementation run.
