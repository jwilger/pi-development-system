# S13b — Revision-bound read-only PR observations

Approved revision 0.2 S13 / ADR0013. Depends on S13a pure assessment. No remote mutations.

## S13b — Expose explicit one-shot delivery-check

**Goal:** Public delivery-check of an open PR with armed auto-merge returns pending merge and zero writes; current-head checks do not prove merge or whole-issue delivery.

**Files:** src/tracker/types.ts, src/tracker/github.ts, src/tracker/work-item-tool.ts, src/tracker/github-delivery.ts, test/tracker/delivery.test.ts, test/tracker/project.test.ts, docs/plan/pr-reader.md

**Interfaces:** Reuse S13a exported PullRequestRef, PullRequestObservation, DeliveryConditions and DeliveryAssessment from delivery-assessment.ts. In types.ts export `DeliveryRequest={readonly refs:readonly PullRequestRef[];readonly conditions?:DeliveryConditions}` and optional `Tracker.deliveryCheck(request:DeliveryRequest):Promise<TrackerResult<DeliveryAssessment>>`. New github-delivery.ts exports `observePullRequest(deps:{exec:Exec;cwd:string},ref:PullRequestRef):Promise<TrackerResult<PullRequestObservation>>` and `observeDelivery(deps:{exec:Exec;cwd:string},request:DeliveryRequest):Promise<TrackerResult<DeliveryAssessment>>`. Public work-item action delivery-check accepts refs/conditions and returns JSON assessment; GitHub advertises capability without requiring Project. Validate explicit OWNER/REPO, safe positive PR number, nonempty unique refs and nonempty names/base/manual entries before Exec. No refs default or implicit policy. observeDelivery reads every explicit ref then calls pure assessDelivery; expected failures are TrackerError with unknown-evidence/re-read advice. Tool flags errors and never closes anything. Detailed read protocol below; existing CRUD/tool arguments and other adapters stay compatible.

Read protocol: gh GraphQL with separate argv variables reads repository nameWithOwner and PR number/url/headRefOid/baseRefName/state/isDraft/mergedAt/mergeCommit. Query commits(last:1).nodes.commit.oid and statusCheckRollup.contexts(first:100,after:cursor), with node id and typename, CheckRun name/status/conclusion or StatusContext context/state. Require last commit oid equals PR head on every page; retain stable identity/head/base/merge facts across pages. Null rollup means zero observed checks, not passing. Complete at most 100 pages; refuse cursor loops/duplicates/incomplete/malformed/null nodes and partial GraphQL errors. Validate all identities/enums/JSON at ingress. Contexts are bound to queried current commit. CheckRun completed SUCCESS -> success; queued/in_progress/waiting/requested/pending -> pending; failure/cancelled/timed_out/action_required -> failure; neutral/skipped/stale/unknown -> unknown. StatusContext SUCCESS/PENDING or EXPECTED/ERROR or FAILURE -> success/pending/failure; unsupported unknown. Keep meaningful original evidence in diagnostic; no credential logging. No cached success, remote write, polling, merge orchestration or claim of atomic snapshot. A changed head across pages refuses observation, never passes old checks. Missing checks/manual requirements use S13a unknown decisions. API failures remain unavailable evidence, not satisfied conditions.

**First failing test:** test/tracker/delivery.test.ts `armed auto-merge remains pending through public delivery-check` configures temp GitHub repo/fake Exec, requests explicit PR and requireMerge:true, returns open PR with autoMergeRequest present and current-head successful CI. Assert status pending/merge pending and zero mutation/issue-close commands. Missing action is initial RED.

**Steps:**

1. Add the named public-tool test in delivery.test.ts and retain rejected-action RED before editing production.
2. Add DeliveryRequest and optional Tracker.deliveryCheck in types.ts using S13a types; keep existing signatures intact.
3. Implement observePullRequest in github-delivery.ts with strict identity/current-commit parsing and complete bounded contexts pagination.
4. Implement observeDelivery request parsing and explicit-ref reads, then call assessDelivery without injecting policy defaults.
5. Wire github.ts capability and work-item-tool.ts action/parameters; extend the exact project.test.ts capability expectation and run first test GREEN.
6. Add focused second-page, changed-head, old-commit, malformed/partial/access-denied and multi-PR tests; assert unknown/error or exact condition states with zero writes.
7. Run all Run commands and record actual RED/GREEN/check evidence here; hand back without commit/push/workflow changes.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/delivery.test.ts test/tracker/delivery-assessment.test.ts test/tracker/project.test.ts`; `npm run typecheck`; `npm run lint`; `npm run lint:knip`; `npm run lint:md`.

**Expected:** Initial test RED; final tests/gates exit zero, pure assessor becomes reachable through public tool and no read mutates remote state. All evidence is explicit/revision-bound, no result claims whole-issue completion.

**Out of scope:** Manifest persistence/config (S14), guarded completion (S15), README/package/model-visible guidance or downstream operations. Existing gh authority and ADR0013 only; coordinator owns README/delivery.

### Actual S13b evidence

Implemented only the seven listed files. GitHub delivery-check is reachable through the public work-item tool without a Project dependency. Every requested PR is explicit; omitted conditions remain unassessed. The reader uses only GraphQL queries with separate argv variables, current-head commit equality, stable PR facts, complete bounded context pagination and fail-closed evidence errors. No remote mutations, issue closure, cached success, polling or whole-issue completion claim were added. S13a files were read but not changed; its assessor is now reached through the production delivery-check path. No Knip or lint suppression was added.

Initial public-test RED, before production edits:

```text
Run: node --experimental-transform-types --no-warnings --test test/tracker/delivery.test.ts
Expected: Missing delivery-check action is rejected.
Actual: exit 1; tests 1, pass 0, fail 1; "AssertionError [ERR_ASSERTION]: public action must accept delivery-check".
```

First minimal public-tool GREEN (before adding the failure matrix):

```text
Run: node --experimental-transform-types --no-warnings --test test/tracker/delivery.test.ts test/tracker/delivery-assessment.test.ts test/tracker/project.test.ts
Expected: Armed auto-merge stays pending; merge pending, CI satisfied, only query commands.
Actual: exit 0; tests 21, pass 21, fail 0; "armed auto-merge remains pending through public delivery-check" passed.
```

Focused tests cover second-page same-name failure; changed head/base/draft/lifecycle/merge facts; old last-commit evidence; null rollup; absent required checks/manual evidence; no configured policy; CheckRun and StatusContext state mappings; invalid/duplicate refs and empty condition entries before Exec; malformed/null/partial/denied responses; process and page-two failures; duplicate context IDs, cursor loops and disappearing rollups; the 100-page bound and a complete hundredth page; multi-PR assessment; and the direct observer. All observed Exec calls are asserted to be read-only GraphQL queries.

Additional test-first REDs and fixes:

- The explicit-ref matrix initially failed because `o/..` reached Exec; rejecting dot-only repository names made the 11-test delivery suite green.
- A terminal repeated-cursor test initially returned successful evidence (`false !== true` for isError); refusing repeated cursors before accepting the terminal page made it green.
- Initial Biome feedback required structural helper extraction and removal of non-null assertions; behavior stayed green. Initial Knip feedback identified the exported observer and two S13a condition types; direct observer coverage and typed public-test expectations exercise these exports without suppression.
- One intermediate typecheck rejected an unreachable error branch after an assertion had already narrowed the result. A single equivalent narrowing assertion now carries the result diagnostic; no test was weakened or skipped.

Final verification, all run from `/tmp/pi-development-system-pr-evidence`:

```text
Run: node --experimental-transform-types --no-warnings --test test/tracker/delivery.test.ts test/tracker/delivery-assessment.test.ts test/tracker/project.test.ts
Expected: Final targeted tests exit zero.
Actual: exit 0; "tests 34", "pass 34", "fail 0", "skipped 0".
```

```text
Run: npm run typecheck
Expected: Typecheck exits zero.
Actual: exit 0; "tsc --noEmit" with no diagnostics.
```

```text
Run: npm run lint
Expected: Biome exits zero without warnings or suppressions.
Actual: exit 0; "Checked 314 files in 222ms. No fixes applied."
```

```text
Run: npm run lint:knip
Expected: No unreachable assessor exports or unused exports.
Actual: exit 0; "knip" with no findings.
```

```text
Run: npm run lint:md
Expected: Markdown lint exits zero.
Actual: exit 0; "Linting: 107 files"; "Summary: 0 issues in 0 files".
```

Additional compatibility regression run:

```text
Run: npm test
Expected: Existing tracker/CRUD/tool arguments and other adapters remain compatible.
Actual: exit 0; "tests 1795", "pass 1795", "fail 0", "skipped 0".
```

Not verified: live GitHub execution or authenticated schema introspection (not run; no credentials or live GitHub operations used). Fake Exec tests exercise the query/response contract, not remote availability. No listed gate is blocked. No commit, push, intake, phase, downstream, package, README or instruction changes were made.
