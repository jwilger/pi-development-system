# Adoption revision 0.2 — proposed task records

These draft records outline the contracts in [the proposal](existing-application-adoption.md)
and proposed ADRs 0011–0013, only after explicit approval. New paths below are planned,
not claims that those files/commands exist today. Each slice ships independently through
the existing review/delivery gates; do not mark a work item complete merely for a push.

Readiness check: the initial draft returned `needs-detail` for all S1–S16. After owner
approval, S1 was refined and rechecked as `ready`; S2–S16 remain draft records,
principally interfaces and concrete implementation steps (S11/S15 also need sharper first
failing cases). These records are not ready for implementer handoff. Resolve the selected
slice's findings, finalize signatures/scenarios under the approved contract and rerun its
readiness check before implementation or delegation. Design approval does not waive that gate.

Shared acceptance: preserve existing tests and hard stops; fake Exec/temporary git repos
for ordinary tests, no live GitHub credentials. Add adversarial cases named in the plan
one behavior at a time. Model-visible changes require actual effect evidence with controls,
not only transport/string assertions. The proposed eval command is
`node --experimental-transform-types --no-warnings scripts/eval-guidance.ts --case CASE`;
S3 supplies its harness, fixtures and documented model/credential selection. Do not skip
it or claim success when credentials/evidence are unavailable; stop and ask.

Dependencies: S2 precedes S3/S9; S4 precedes S5–S8; S10 precedes S11; S13 precedes
S14/S15; S16 follows relevant capabilities. S1 and S12 can deliver independently.
All records also run npm test and npm run typecheck plus applicable repo gates after
GREEN; command-specific exit zero is evidence only for what actually ran.

## S1 — Make legacy label setup explicit

**Goal:** An Issues-only in-progress update never provisions a marker label; when GitHub refuses the edit, preserve its error and give conditional manual setup advice rather than treating a failed update as success.

**Files:** src/tracker/github.ts, test/tracker/github.test.ts, test/tracker/work-item-tool.test.ts, README.md, docs/event-model/adoption/legacy-setup.json

**Interfaces:** Modify only `updateIssue(gh: Gh, id: string, patch: WorkItemPatch): Promise<TrackerResult<WorkItem>>` in src/tracker/github.ts. Remove its label-create block. If edit fails and flags include adding IN_PROGRESS, return trackerError with the original error.message plus conditional owner setup/re-read advice; otherwise return edited unchanged. Keep public `createGithubTracker(deps: GithubTrackerDeps): Tracker` and `createWorkItemTool(deps: { exec: Exec }): ToolDefinition<typeof Parameters>` unchanged. No new types/configuration. Existing labels and issue lifecycle order remain unchanged. README documents manual label setup; event JSON models the same update command. No new trust boundary: existing gh authority is reduced, no secrets or new command interpolation.

**First failing test:** In test/tracker/work-item-tool.test.ts invoke createWorkItemTool with a temporary `[tracker] kind = "github", repo = "o/r"` config and fake Exec tracking repository labels. Initially no marker exists; gh label create would add it, gh issue edit fails if it is absent. Request `{action:"update", id:"7", status:"in-progress"}`. Assert isError=true, original missing-label error plus explicit setup/re-read advice, no label provisioning effect, no close/reopen and issue unchanged. Current code creates the label and incorrectly succeeds.

**Steps:**

1. Add test "missing marker setup is reported without provisioning" to test/tracker/work-item-tool.test.ts using fake Exec and temporary config. Run targeted tests; observe unexpected success RED.
2. Remove the label-create block in updateIssue. On failed --add-label in-progress edits, retain the gh error with conditional manual setup/re-read advice; other edit errors remain unchanged.
3. Replace the three label-provisioning tests under recorded requirement-change departure. Assert existing labels still update without label writes, permission errors remain visible, and no recoloring occurs.
4. Add owner-setup/retry and unrelated-edit-error cases through the public tool, one failing test at a time. Verify no lifecycle command follows any failed edit.
5. Add README setup documentation and the matching event JSON. Validate events, run the listed test/type/lint commands, obtain fresh review and deliver under trunk policy.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/github.test.ts test/tracker/work-item-tool.test.ts`; `npm test`; `npm run typecheck`; `npm run lint`; `npm run lint:md`.

**Expected:** The new missing-label test fails before production edits because isError is false and the label was created. After the change all targeted tests exit 0: absent labels remain absent, refusal retains GitHub's error and conditional owner setup advice, existing labels permit edits without provisioning, and other CRUD/lifecycle behavior is unchanged. No live GitHub credentials are required.

**Out of scope:** A provisioning tool, Project support, new workflow vocabulary, preflight label discovery, transactional retries or label recoloring.

## S2 — Transport repository-owned workflow input

**Goal:** Every root or devsys-created child model request receives the current configured tracked workflow content with paths and hashes, or preparation refuses before calling the model.

**Files:** src/state/config.ts; new src/state/local-guidance.ts; src/context/system-prompt.ts; extensions/development-system.ts; src/subagents/index.ts; src/subagents/orch/runtime.ts; new test/context/workflow-guidance.test.ts; test/harness/offline-session.ts; README.md; package.json; package-lock.json (new test names may be introduced where absent).

**Interfaces:** Extend `DevsysConfig` with `workflow: { guidance: readonly string[] }` (default empty), parsed by `parseConfig(source: string): Result<DevsysConfig, ConfigError>`. Add `loadWorkflowGuidance(cwd: string): Promise<Result<GuidanceSnapshot, GuidanceError>>`, returning paths/content SHA256 plus a combined identity and rendered section; use the shared loader for later review inputs. Root `before_agent_start` and SDK child's `before_agent_start` hook call the same preparation adapter, updating only a dedicated prompt section. Errors stop preparation with a stable id and repair advice; no shell interpolation, no inference of workflow semantics. Export `GuidanceSnapshot = { readonly sources: readonly { readonly path: string; readonly content: string; readonly hash: string }[]; readonly identity: string; readonly section: string }` and `GuidanceError = { readonly kind: "guidance-error"; readonly message: string; readonly path?: string }`; absent configuration yields an empty sources list and explicit unconfigured section. Add `applyWorkflowGuidance(event: BeforeAgentStartEvent, context: Pick<ExtensionContext, "cwd" | "abort">): Promise<void>` in src/context/system-prompt.ts; set `event.systemPromptOptions.sections["repository-workflow"]` on success and throw an Error containing stable guidance-error plus repair advice on failure (SDK hook boundary must abort model dispatch, not return ignored errors). Existing driver interfaces stay unchanged; refresh on each request, including automatic tool continuations and resumed tasks. A shared context_with_system adapter revalidates and emits only the changed named section; abort on errors there as well. Resolve repository-root configuration before reading paths so nested working directories cannot omit it. Config path arrays reject empty/non-string entries and unknown workflow keys. Loader uses execFile git argument arrays and root resolved from `git rev-parse --show-toplevel`; configured paths are relative to that root, no absolute or parent traversal; git ls-files verifies tracking. File limits use bytes, TextDecoder fatal UTF-8 decoding and no recursive links. Shared loader accepts an explicit path array internally so S9 can reuse the same boundaries.

**First failing test:** Through `createDriverFactory`, create an independent root in an offline SDK session backed by a temporary git repository, configure and git-add a workflow file, prompt the child, and capture the actual model request. Assert the request includes the workflow content, relative source path and SHA256. Current driver sends only type/task instructions.

**Steps:**

1. Add the named independent-child SDK test in test/context/workflow-guidance.test.ts. Capture TranscriptContext after git init/add of a configured workflow fixture; assert source/content/hash in the model input. Run it to missing-content RED.
2. Add optional workflow.guidance parsing to src/state/config.ts with empty default. In src/state/local-guidance.ts implement the specified loader and its file/error contracts; use argument arrays for git and bounded UTF-8 reads.
3. Implement applyWorkflowGuidance in src/context/system-prompt.ts; await it from the child extensionFactories before_agent_start hook in src/subagents/orch/runtime.ts. Run the independent-child test to GREEN without changing model selection.
4. Add root SDK transport RED, then await the same adapter in extensions/development-system.ts before_agent_start. Assert legacy principles/state sections remain unchanged and no-config requests remain usable.
5. Add tracked-edit and saved-child-resume cases one at a time; each captures actual model requests and checks updated content/hash. Fix refresh at turn boundaries if either is stale.
6. Add invalid-input cases individually from the test list below. Each must reject preparation with guidance-error and zero provider requests. Repair the loader only for the observed failure; run regressions after each GREEN.
7. Document paths, limits, refresh, repair and transport-only guarantees in README. Run the commands below, complete fresh reviews and deliver via existing policy. Instruction-effect evals remain S3/S9, not a claimed result here.

**Run:** `node --experimental-transform-types --no-warnings --test test/context/workflow-guidance.test.ts test/subagents/runtime-sdk.test.ts test/state/config.test.ts`; `npm test`; `npm run typecheck`; `npm run lint`; `npm run lint:md`.

**Expected:** Initial RED is missing workflow content in the actual independent-child request. After implementation all targeted/full tests exit zero; invalid configured inputs produce explicit preparation errors with no model request, valid tracked edits change source identity and the next root/resumed-child request contains the new content. Existing no-config sessions and adapters remain usable.

**Out of scope:** Semantic workflow parser, external-agent control, new skills/instructions, review clean-round changes and review-specific guidance binding (S9). Threat assessment: protects repository/private file boundaries and context availability; owner controls configured paths, files may be untrusted. Git tracking, realpath containment, regular-file/UTF-8 and bounded reads prevent accidental secret/outside-file inclusion and oversized context. No execution of guidance, no network authority or dependency added; semantic contradictions remain owner/agent responsibility. Test list: independent fresh transport; root transport; content refresh/resume; unconfigured compatibility; malformed config; missing/untracked; escaping/special paths; invalid UTF-8; per-file and combined limits.

## S3 — Teach owner-led workflow discovery

**Goal:** A discovery agent reports contradictions and asks the owner before proposing operational changes.

**Files:** new skills/project-workflow/SKILL.md and references; new scripts/eval-guidance.ts and scripts/lib/guidance-eval.ts; new evals/guidance/discovery/; package.json; new test/context/guidance-eval.test.ts; test/harness/offline-session.ts only if its existing actual-SDK fixture needs a compatible extension.

**Interfaces:** `createDiscoveryEval(fixture)` returns an ExtensionFactory registering evidence inspection, owner questions, structured discovery reporting and denied mutation/proposal tools, plus a prompt and result collector. Fixture inputs describe synthetic source contents or access errors; private expectations describe source categories, conflicts, unknowns and discoverable artifact roles. The collector scores actual tool effects and SDK messages, never skill-file substrings. Results contain input/skill identities, model identity, transcript, tool trace and individual checks; missing reports, provider errors and attempted mutation fail. This test-only format does not become a repository workflow protocol.

`eval-guidance.ts --case discovery-conflict|discovery-consistent|discovery-inaccessible --provider PROVIDER --model MODEL --condition baseline|skill|both [--output PATH]` runs isolated real SDK sessions with explicit model selection. Baseline has no project-workflow skill; skill mode loads the actual guidance, with no ambient user/repository resources. The sandbox exposes only synthetic evidence and denied mutation tools, not shell, filesystem mutation or GitHub credentials. Every selected case/condition must pass for exit zero; failure is retained honestly, not relabelled as a pass. Paired baseline results are comparative evidence, not a requirement that an otherwise capable baseline fail.

**First failing test:** An actual offline SDK discovery-conflict run that overlooks divergent factory docs/automation must fail its conflict-and-owner-question checks. Implement the collector to expose that failure before guidance exists; demonstrate a correct transcript passes, then exercise the actual model baseline and missing-skill case before writing the skill.

**Steps:**

1. Add one ordinary actual-SDK test through createDiscoveryEval: scripted model reads factory-only documentation and divergent automation, records a report with no conflict/question; expect failure. Run RED before adding the harness; implement only evidence inspection, reporting and observable scoring to pass this negative-control test.
2. Add a positive scripted discovery transcript: cite documented intent separately from configured automation, report the divergence, ask the owner and suggest version-controlled workflow/pointer/config locations without changing policy. Add cases individually for unread evidence citations, claimed execution, denied writes, unavailable evidence, missing reports and provider failure. All ordinary runs use fake model streams, no credentials/network.
3. Add the explicit opt-in CLI using ModelRuntime/createAgentSession, isolated resources and bounded runtime. Capture the live missing-skill failure and no-skill baseline on discovery-conflict before editing instructions. Preserve input hashes, selected model, transcript and check outcomes; do not claim causality if baseline also succeeds.
4. Write project-workflow guidance with define/discover/maintain branches. Survey authoritative docs versus observed configuration, classify inference/unknowns, cite contradictions and ask the owner before operational changes. Propose discoverable version-controlled workflow/review/config pointers only after decisions, distinguish issue/slice/delivery lifecycles and require explicit provisioning/pilot scope. Do not impose canonical state names, scheduling or factory stations.
5. Run live skill cases: conflict, coherent harmless control and inaccessible evidence. Fix only demonstrated instruction defects; do not loosen checks. Document model/credential selection, isolation, evidence limits and reproducible commands. Run targeted/full checks, required fresh reviews, commit, push and verify delivery.

**Test list / threat assessment:** Negative and positive tool effects; cited-but-unread sources; intent/config/execution distinction; pending owner decisions; coherent-control false positives; unavailable evidence versus empty facts; missing/invalid reports; provider errors; attempted policy mutation. Synthetic fixtures alone cross the model network boundary; credentials stay inside ModelRuntime and are never included in prompts/results. Real application, board and process execution tools are not available. Reports use existing redaction before output. Live runs are opt-in, default tests are offline. No dependency or application architecture boundary is added.

**Run:** `node --experimental-transform-types --no-warnings --test test/context/guidance-eval.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal. Effect case records satisfy the stated behavior and safety/harmless controls; absence of model evidence is not a pass.

**Out of scope:** Station templates, autonomous loops, migrating live boards or changing downstream repositories.

## S4 — Inspect optional Project identity

**Goal:** The work-item interface can inspect Project and field identities without mutations.

**Files:** src/tracker/types.ts; src/tracker/select.ts; src/tracker/work-item-tool.ts; new src/tracker/github-project.ts; src/state/config.ts; new test/tracker/project.test.ts (new test names may be introduced where absent).

**Interfaces:** Add optional `tracker.project_id` only for `kind = "github"`, a nonempty GitHub Project node ID (no title lookup). Extend `Tracker` with optional `inspect(fieldId?: string): Promise<TrackerResult<TrackerInspection>>`. Inspection returns backend kind, implemented action capabilities and an optional Project snapshot (id, owner login, number, title, URL, fields with ids/names/data types and single-select options). `devsys_work_item {action:"inspect", fieldId?:string}` renders this as JSON; ordinary repo-files and Issues-only inspection performs no Project requests. New `inspectProject(deps: {exec:Exec; cwd:string; projectId:string}, fieldId?:string)` in src/tracker/github-project.ts uses gh GraphQL query variables via argument arrays. Confirm node typename/id and complete every fields page before returning; an explicit foreign field refuses with tracker-error. No config defaults, field roles, option vocabulary or writes. Expose only implemented actions in capabilities; S5–S8 add theirs later.

**First failing test:** In new test/tracker/project.test.ts create a temporary configured GitHub tracker with `project_id="PVT_local"`, fake Exec returning that Project with field `FIELD_local`, and call the public tool with `{action:"inspect",fieldId:"FIELD_foreign"}`. Assert error naming the foreign field and Project, and zero mutation/label operations. Initially config refuses project_id before identity validation.

**Steps:**

1. Add the named public foreign-field test and run to the identity-contract RED; add only the config, inspect interface/tool dispatch and read-only GraphQL implementation needed for GREEN.
2. Add positive public inspection of owner/number/title/URL and typed field/option ids. Add unconfigured GitHub and repo-file inspections with zero Exec calls; preserve all existing CRUD tests.
3. Add fields pagination, duplicate/null/malformed pages, cursor loops, wrong node/id, partial GraphQL data+errors, inaccessible Project and failed gh cases individually. Refuse incomplete observations, retain permission diagnostics and advise repair/re-read without mutations.
4. Add config tests for invalid/non-GitHub project_id. Document actual config, permission requirements, optional field validation, unsupported mutation types and no workflow semantics. Run targeted/full/type/lint checks, fresh reviews and deliver under existing policy.

**Threat assessment:** Read-only network I/O uses the existing Exec/gh credential boundary; only explicit node/field ids leave the machine. Variables are never interpolated into GraphQL or shell. Validate external JSON, typename/id, pages and cursor progress; malformed/partial data cannot imply a usable Project. Limit pages and surface incomplete rather than looping. Credentials/private downstream contents are not logged. ADR 0011 authorizes the optional boundary; no dependency, provisioning or new model-visible guidance is added.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/project.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal.

**Out of scope:** Provisioning fields/options, queue interpretation or writes.

## S5 — Read complete Project observations

**Goal:** Explicitly filtered Project issue reads cover all pages or say incomplete.

**Files:** src/tracker/github-project.ts; src/tracker/work-item-tool.ts; test/tracker/project.test.ts (new test names may be introduced where absent).

**Interfaces:** project-items; lifecycle/raw fields distinct; API order is observation, not local priority.

**First failing test:** Public project-items with caller-selected noncanonical option includes a matching issue from page two, not a hidden ready-state filter.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/project.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal.

**Out of scope:** Saved-view reproduction, ranking mutations, implicit eligibility/claiming.

## S6 — Enroll explicit members safely

**Goal:** A named issue is enrolled only on request and uncertain retries re-read membership.

**Files:** src/tracker/github-project.ts; src/tracker/work-item-tool.ts; test/tracker/project.test.ts (new test names may be introduced where absent).

**Interfaces:** project-enroll and project-member; idempotent read-before-retry.

**First failing test:** After simulated enrollment timeout with a remotely successful add, retry observes membership and makes no duplicate add; ordinary member read never enrolls.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/project.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal.

**Out of scope:** Implicit unarchive, batch migration or schema creation.

## S7 — Mutate a named single-select field

**Goal:** A field mutation changes only an explicitly named valid field/option.

**Files:** src/tracker/github-project.ts; src/tracker/work-item-tool.ts; test/tracker/project.test.ts (new test names may be introduced where absent).

**Interfaces:** project-set set/clear; explicit IDs, no local-state semantics.

**First failing test:** Public project-set given an option from another field refuses without writes.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/project.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal.

**Out of scope:** Transition graph, automatic done/blocked conventions, other field mutation types.

## S8 — Manage explicit issue assignments

**Goal:** Requested assignment effects never masquerade as an exclusive claim or mutate workflow implicitly.

**Files:** src/tracker/github.ts; src/tracker/work-item-tool.ts; test/tracker/github.test.ts (new test names may be introduced where absent).

**Interfaces:** assign add/remove named assignees; before/after facts and uncertainty, no CAS guarantee.

**First failing test:** Public assignment succeeds while a human changes a Project field; reported result does not claim exclusivity or write that field.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/github.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal.

**Out of scope:** Self-claim defaults, locks or a composite universal claiming transaction.

## S9 — Apply local guidance to review identity

**Goal:** Fresh actual/fallback review tasks receive local workflow/concerns and stale inputs cannot earn clean-round credit.

**Files:** src/core/review-flow.ts; src/core/review.ts; src/review/review-tools.ts; src/gates/commit-guard.ts; test/review/; new evals/guidance/review/ (new test names may be introduced where absent).

**Interfaces:** ADR 0012 diff-plus-guidance identity, typed submissions and unchanged clean-round semantics.

**First failing test:** Start through createReviewStartTool, change configured concern, then record; expect stale-input refusal and no clean-round credit.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy. Also run the relevant review-local-concern effect case through the S3 harness before shipping instructions, recording actual model/tool behavior and harmless controls.

**Run:** `node --experimental-transform-types --no-warnings --test test/review/review-tools.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal. Effect case records satisfy the stated behavior and safety/harmless controls; absence of model evidence is not a pass.

**Out of scope:** New universal lenses, one reviewer per concern or changes to severity/verdict rules.

## S10 — Select and restore Elixir profile

**Goal:** A mix.exs repository selects elixir through detection, override and session restoration.

**Files:** src/core/profile.ts; src/core/types.ts; src/state/profile-detect.ts; src/state/session-state.ts; test/state/; test/core/ (new test names may be introduced where absent).

**Interfaces:** elixir added consistently to profile parsing/selection/restoration, mixed-language behavior preserved.

**First failing test:** Detect a temp repository containing mix.exs, persist/recreate session and observe elixir still selected.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy.

**Run:** `node --experimental-transform-types --no-warnings --test test/state/profile-detect.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal.

**Out of scope:** Elixir dependencies, application structure or new behavior guidance before its effect evidence.

## S11 — Teach idiomatic local-aware Elixir work

**Goal:** The Elixir profile leads to repository-defined commands and idiomatic expected-error handling.

**Files:** new skills/profile-elixir/SKILL.md; new evals/guidance/elixir/; scripts/eval-guidance.ts; README.md (new test names may be introduced where absent).

**Interfaces:** ExUnit/domain/property/LiveView/browser scope; local command authority and tuple errors.

**First failing test:** Run elixir-local-policy fixture: task uses declared just/Nix commands, tuple expected errors and an appropriate public behavior test; no invented dependency or Rust/TS pattern.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy. Also run the relevant elixir-local-policy effect case through the S3 harness before shipping instructions, recording actual model/tool behavior and harmless controls.

**Run:** `node --experimental-transform-types --no-warnings --test test/context/guidance-eval.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal. Effect case records satisfy the stated behavior and safety/harmless controls; absence of model evidence is not a pass.

**Out of scope:** Mandated event sourcing, test/property/mutation libraries or directory layout.

## S12 — Distinguish local slice closure

**Goal:** Reviewed clean pushes close a local slice without claiming PR delivery or touching an issue.

**Files:** src/planning/slice-close.ts; test/planning/slice-close.test.ts; skills/delivery-discipline/SKILL.md; evals/guidance/delivery/ (new test names may be introduced where absent).

**Interfaces:** Existing finish_slice checks stay intact; messages and instructions name only local completion.

**First failing test:** PR-mode push with satisfied local checks closes the slice, reports local completion only and performs zero work-item mutations.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy. Also run the relevant delivery-language effect case through the S3 harness before shipping instructions, recording actual model/tool behavior and harmless controls.

**Run:** `node --experimental-transform-types --no-warnings --test test/planning/slice-close.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal. Effect case records satisfy the stated behavior and safety/harmless controls; absence of model evidence is not a pass.

**Out of scope:** Waiting for merge inside finish_slice, new issue conditions or gate weakening.

## S13 — Observe PR evidence once

**Goal:** An explicit PR check reports revision-bound facts and uncertainty without writes.

**Files:** new src/tracker/github-delivery.ts; src/tracker/work-item-tool.ts; new test/tracker/delivery.test.ts (new test names may be introduced where absent).

**Interfaces:** delivery-check explicit refs/conditions; pending/failed/blocked/unknown/satisfied distinct.

**First failing test:** Open PR with armed auto-merge returns pending merge, never delivered or a close request.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/delivery.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal.

**Out of scope:** Polling, auto-merge orchestration, deployment proof or implied required conditions.

## S14 — Resume optional project-owned references

**Goal:** Explicit versioned PR-reference manifests survive a fresh session without cached workflow status.

**Files:** new src/state/delivery-manifest.ts; src/state/config.ts; src/tracker/work-item-tool.ts; test/tracker/delivery.test.ts (new test names may be introduced where absent).

**Interfaces:** ADR 0013 optional manifest directory/schema; version 1 issue identity, required PR refs, manual requirements.

**First failing test:** Recreate tools against a tracked two-PR manifest: one open/one merged remains pending and does not close the issue.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/delivery.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal.

**Out of scope:** Machine-local ledger, implicit remote metadata or closing-keyword inference.

## S15 — Guard opted-in issue completion

**Goal:** Configured supported conditions gate all devsys issue-close paths while unconfigured policies remain honestly unassessed.

**Files:** src/tracker/github-delivery.ts; src/tracker/github.ts; src/tracker/work-item-tool.ts; src/state/config.ts; test/tracker/delivery.test.ts (new test names may be introduced where absent).

**Interfaces:** complete explicit scope confirmation; guard legacy done/lifecycle-close only when configured; no inferred Project terminal option.

**First failing test:** With example A and a missing required check, each supported close entry point returns a condition failure and performs no issue close.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/delivery.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal.

**Out of scope:** Universal merge rule, automatic Project completion, proof of manual policy or external-write enforcement.

## S16 — Prove policy contrast and document adoption

**Goal:** Both local workflows work without upstream edits and the owner has an honest safe-pilot recipe.

**Files:** new test/tracker/workflow-contrast.test.ts; evals/guidance/workflows/; README.md; skills/project-workflow/references/; docs/plan/existing-application-adoption.md (new test names may be introduced where absent).

**Interfaces:** Examples A/B, partial-effect recovery, permission/enforcement boundaries and explicit opt-in smoke procedure.

**First failing test:** Example B explicit research actions cause no assignment, merge prerequisite or auto-close; example A guard remains active under the same code.

**Steps:**

1. Inspect the named current interfaces and create the single RED behavior above through the public entry point; for instruction-only behavior capture the failing effect case before editing guidance.
2. Implement only the contract required for that behavior, keeping policy local and decisions in the functional core; add the plan's relevant failure/recovery cases one at a time.
3. Run the targeted checks and regressions; refactor only while GREEN; obtain required fresh-context reviews and deliver under repository policy. Also run the relevant workflow-contrast effect case through the S3 harness before shipping instructions, recording actual model/tool behavior and harmless controls.

**Run:** `node --experimental-transform-types --no-warnings --test test/tracker/workflow-contrast.test.ts`; `npm test`; `npm run typecheck`.

**Expected:** Before implementation the named new behavior fails for the intended reason; after implementation the targeted tests and regressions exit 0 with no failures/skips, and the observable result matches Goal. Effect case records satisfy the stated behavior and safety/harmless controls; absence of model evidence is not a pass.

**Out of scope:** Executing Simulac adoption, implicit provisioning/migration, claiming live smoke or deployment evidence.
