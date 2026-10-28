# Approved adoption S4 — implementation record

## S4 — Inspect optional Project identity

**Goal:** `devsys_work_item {action:"inspect",fieldId:"FIELD_foreign"}` refuses a field not belonging to the explicitly configured Project, while ordinary inspection returns complete Project metadata without writes.

**Files:** src/tracker/types.ts; src/tracker/select.ts; src/tracker/work-item-tool.ts; src/tracker/github.ts; new src/tracker/github-project.ts; src/state/config.ts; new test/tracker/project.test.ts; README.md; package.json; package-lock.json.

**Interfaces:** Preserve Tracker CRUD. Add optional `Tracker.inspect(fieldId?:string):Promise<TrackerResult<TrackerInspection>>`. `TrackerInspection` contains `kind:string`, `capabilities:readonly string[]` and `project:ProjectInspection|null`. `ProjectInspection` contains explicit `id:string`, `owner:string` (login), `number:number`, `title:string`, `url:string`, and `fields:readonly ProjectField[]`. `ProjectField` contains `id:string`, `name:string`, `dataType:string`, and `options?:readonly {id:string;name:string}[]` (present only for single-select fields). IDs are opaque parsed node ids, not workflow roles. Add optional `tracker.project_id` in TOML (GitHub only, nonempty opaque id; invalid configurations return config-error). No owner/title lookup, default field or option semantics. Expose action `inspect` plus optional `fieldId` in the existing work-item tool and render the result as JSON. Without Project configuration, project is null and inspection does no Project I/O. Capabilities list only implemented public actions. Repo-files keeps existing CRUD and gains inspection through the tool fallback; unsupported backends still fail selection.

New adapter `inspectProject(deps:{exec:Exec;cwd:string;projectId:string},fieldId?:string):Promise<TrackerResult<ProjectInspection>>` performs read-only `gh api graphql` with fixed query text and separate variables. Validate response JSON using the existing TypeBox dependency; errors/partial data, wrong/null typename/id, inaccessible owner/fields, invalid single-select options and malformed pagination return tracker-error with repair/re-read advice, never partial success. Confirm ProjectV2 identity, fetch all fields pages (100/page, 100-page hard bound), require advancing nonempty cursors and unique field/option identities. An explicit field absent from the complete configured Project returns an identity error naming both ids. Unsupported field types remain explicit metadata; no coercion or mutation. User-controlled values are never interpolated into GraphQL/shell. Existing Exec/gh credentials are the network boundary; no new dependency, secret transport or provisioning. ADR 0011 is approved and supplies the boundary decision.

**First failing test:** Through createWorkItemTool with a temporary tracker config `kind="github",repo="o/r",project_id="PVT_local"`, fake Exec returns a Project with `FIELD_local`. Request inspect with `FIELD_foreign`, assert isError and an identity error naming FIELD_foreign and PVT_local, and zero mutations. Current config rejects project_id before it can validate identity.

**Steps:**

1. Write and run the foreign-field public tool test in test/tracker/project.test.ts. Assert FIELD_foreign and PVT_local occur in an identity error, not a config error.
2. Add optional project_id parsing in src/state/config.ts. Reject non-GitHub use and invalid ids. Existing tracker configurations must parse unchanged.
3. Add the three inspection result types and optional inspect signature in src/tracker/types.ts. No existing CRUD signatures change.
4. Implement inspectProject in src/tracker/github-project.ts using the exact read-only response/pagination/error contract above. No write API is available in this adapter.
5. Wire GitHub's optional inspect method and work-item-tool.ts inspect dispatch. Re-run the first test; foreign-field refusal must now pass without any mutation request.
6. Exercise the metadata/compatibility/error test list below, one new test per RED/GREEN cycle. Assert returned observations and effects, not private implementation structure.
7. Run every command in Run. Document the API in README; deliver through the existing review/commit/push gates after zero test/type/lint failures.

Test list for step 6: valid Project owner/number/title/URL and field/option ids; unconfigured GitHub and repo-files with zero Exec calls; page-two fields; partial GraphQL errors; null/wrong node; malformed JSON/fields/options/pageInfo; repeated cursors/ids; gh permission/process failure; invalid/non-GitHub config; advertised inspect schema. Each cycle retains all preceding assertions. No extra action capabilities are advertised.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/project.test.ts test/tracker/work-item-tool.test.ts test/tracker/github.test.ts test/state/config.test.ts`; `npm test`; `npm run typecheck`; `npm run lint`; `npm run lint:knip`; `npm run lint:md`.

**Expected:** First test RED is a config error instead of foreign-field identity refusal. GREEN returns tracker-error naming the requested field and configured Project, complete successful metadata where authorized, and explicit incomplete/access/config errors otherwise. All ordinary tests require no GitHub credentials; zero writes in every inspection case. Full verification has zero failures/skips.

**Out of scope:** Project member/items, assignment, enrollment, set/clear, schema/label provisioning, state interpretation, saved views, implicit claims, live board access or downstream modifications. These remain later approved slices. No shipped model-visible instructions change in S4.
