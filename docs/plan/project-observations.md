# S5 — Explicit read-only Project observations

Status: implemented; verification/review in progress under owner-approved revision 0.2, ADR 0011. S4 is delivered.

## S5 — Observe complete Project issue membership

**Goal:** Return complete, explicitly filtered, read-only Project issue observations through devsys_work_item, with unknowns/exclusions visible.

**Files:** src/tracker/types.ts; src/tracker/github-project-items.ts (new); src/tracker/github.ts; src/tracker/work-item-tool.ts; test/tracker/project-items.test.ts (new); test/tracker/project.test.ts; README.md; package.json; package-lock.json.

**Interfaces:** Add optional Tracker.projectItems(filter: ProjectItemFilter): Promise<TrackerResult<ProjectItems>>. ProjectItemFilter has optional lifecycle open/closed plus paired fieldId/optionId strings. ProjectItems has projectId, repository, order=api-observation-not-priority, eligibility=unassessed/unknown, issues and diagnostics. Issues contain itemId, issueId, number, title, url, lifecycle, archived and fields. Fields are tagged single-select/text/number/date/unsupported observations, with fieldId; single-select carries nullable optionId/name, text/date string value, number numeric value, unsupported typename. Diagnostics carry itemId, kind and explanatory message. Unsupported backends return a tool error without I/O. Do not add selection or mutation behavior.

**First failing test:** Public tool rejects project-items in its schema today. Assert it accepts lifecycle=open, fieldId=FIELD_local, optionId=OPTION_local, returns the matching issue lifecycle and raw option observation, and makes only read-only API calls.

**Steps:**

1. Add the first public-tool test in test/tracker/project-items.test.ts: lifecycle=open plus FIELD_local/OPTION_local returns only the open matching Issue, with lifecycle and field data separate. Run it and record RED.
2. Add the five observation/filter types and optional Tracker.projectItems in types.ts exactly as Interfaces specifies. Preserve existing CRUD signatures.
3. Implement observeProjectItems(deps:{exec:Exec;cwd:string;repo:string;projectId:string},filter:ProjectItemFilter):Promise<TrackerResult<ProjectItems>> in github-project-items.ts using the bounded response/diagnostic contract below.
4. Wire Tracker.projectItems in github.ts to observeProjectItems; missing repo/project config returns tracker-error before Exec. Advertise project-items only with both config identities.
5. Expose project-items in work-item-tool.ts with lifecycle and paired fieldId/optionId inputs and JSON rendering. Unsupported Tracker methods return an error without I/O. The first public test must now pass.
6. Exercise each Test list case below one at a time through the public tool. Add the failing assertion before its production change; keep earlier assertions. Each cycle proves one observed fact or one explicit refusal, with no writes.
7. Add the documented contract below to README.md: exact filters, diagnostics, unknown eligibility, pagination bounds, API-order caveat and permission recovery. No model guidance changes ship in this slice.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/project-items.test.ts test/tracker/project.test.ts test/tracker/github.test.ts test/tracker/work-item-tool.test.ts`; `npm test`; `npm run typecheck`; `npm run lint`; `npm run lint:knip`; `npm run lint:md`.

**Expected:** First RED is a rejected schema. GREEN exposes matching raw issue/Project facts with no writes, complete connections or explicit errors, and diagnostics rather than false empty eligibility. Ordinary verification has zero failures/skips and needs no credentials.

**Out of scope:** Selection/claims, assignment, enrollment, mutations, schema/rank/label provisioning, implicit filters, saved views, live board access and downstream changes.

### Outcome and boundary

Expose `project-items` on the existing `devsys_work_item` boundary. Optional
`lifecycle` (`open`/`closed`) and a paired `fieldId`/`optionId` filter are explicit
caller choices, never workflow roles. Require configured `tracker.repo` and
`tracker.project_id`; refuse unsupported backends without API calls. Preserve CRUD.

Return complete item and per-item field observations, in observed API order (not
priority or saved-view order). Preserve item/node/issue identities, lifecycle and
archive facts separately from raw Project values. Return exclusions for foreign
repositories, pull requests and drafts; redacted content makes eligibility unknown.
Archived issues remain observations, with diagnostics; nothing is selected or mutated.
Support read values for single-select, text, number and date. Other types return
explicit unsupported metadata, not invented values. Missing field entries do not
prove a workflow state.

## Test list / first RED

Through the public tool with offline Exec responses:

1. Public `project-items` accepts explicit filters and returns matching issue
   lifecycle and single-select values without any write or priority inference.
2. Exhaust item pages and independently paginated field values. Missing/repeated
   cursors, duplicate identities and safety-limit exhaustion are errors, not an
   empty/partial queue. Null nodes and partial GraphQL errors fail closed.
3. Filter validation rejects unpaired field/option IDs, foreign fields/options,
   unsupported field types and absent Project/repo configuration before item reads.
4. Archived/redacted/foreign/non-issue observations remain explicit diagnostics;
   redaction never proves no eligible work. Empty accessible projects are distinct.
5. Invalid JSON, process/permission errors and wrong node identity retain re-read
   repair advice. Existing non-Project operations and inspect remain compatible.

First failing test: public-tool schema/behavior for lifecycle plus raw-option
filtering; the existing schema does not admit `project-items`.

## Implementation seams

Optional `Tracker.projectItems` and output/input types in `src/tracker/types.ts`;
read-only adapter in `src/tracker/github-project-items.ts`; wiring in
`src/tracker/github.ts` and `src/tracker/work-item-tool.ts`. Tests use fake Exec,
not credentials. Do not change board schema, labels, issue lifecycle or rank.

## Threat and limitations

Inputs are explicit IDs validated before use, passed as gh argument arrays, never
shell-expanded. Query only the configured Project; compare issue repository before
reporting it as a candidate observation. API/process uncertainty must not become an
empty queue. Queries are bounded (100 pages per connection) and fail explicitly at
the bound. Reads are not atomic snapshots and cannot reserve work. Normal tests
need no network or token; live Project smoke tests are opt-in only and out of this
slice. No new dependency, persistence or architecture decision beyond ADR 0011.

## Recorded test-first evidence

The public schema/first observation and subsequent failure cases were introduced
incrementally before their production behavior. The tracker suite now passes 58
tests; the full offline run passes 1758 tests, with zero failures or skips.

A current GitHub schema check exposed the API's `archivedStates` default, which hides
archived items. A fake of that documented external default produced RED (the archived
issue was missing); explicitly requesting both archive states produced GREEN through
the public tool. A multi-select field/value fixture likewise produced RED on inspection;
recognizing its metadata while keeping its value explicitly unsupported produced GREEN.
Fresh review found that GitHub returns the built-in TITLE field as a text value.
A public-tool regression reproduced the refusal at RED; allowing TITLE as well as
TEXT for text values produced GREEN while retaining stale-type checks. No new field
mutation, workflow interpretation or live board access was introduced.

Source: [GitHub Projects GraphQL reference](https://docs.github.com/en/graphql/reference/projects),
checked 2026-10-28. Tests fake the external process boundary, not tracker implementation.
Current typecheck, Biome, knip and Markdown lint commands pass. Fresh review and remote
CI/release observation remain to be completed before slice delivery.

## Verification and delivery

Show RED then GREEN public behavior; run tracker suite, full offline tests,
typecheck, formatting and lint gates, changed-path diagnostics, required fresh
reviews, ordinary signed commit/push, and observe remote CI/release. Document all
limitations in the public tracker documentation. Do not mark the whole work item
complete merely because this read-only slice is pushed.
