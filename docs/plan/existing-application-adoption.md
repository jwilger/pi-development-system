# Existing-application adoption: revised gap analysis and proposed slices

Revision 0.2 — **approved for implementation by the owner on 2026-10-27**.
Supersedes revision 0.1. Approval covers this plan and ADRs 0011–0013; each selected
slice still requires task readiness, test-first evidence, verification and review.

## Outcome and ownership

Help an owner discover or define a repository-owned development workflow and resume an
existing issue safely. Upstream supplies integration primitives, evidence/error
contracts and skills. The repository supplies operational policy in version-controlled
instructions and narrow configuration where a tool must decide deterministically.
Devsys's engineering hard stops still apply; local workflow is not permission to bypass them.

Only this upstream repository may change. Simulac and the Claude plugin repository are
read-only examples. No downstream GitHub operations or migrations occur in this work.
No factory port, scheduler, continuous worker, stall classifier, general workflow DSL
or generic CI service. Metrics/history, rubrics, autonomy, application-path restrictions
and closeout/upkeep conventions remain downstream.

## What changed from revision 0.1

| Earlier proposal | Disposition in revision 0.2 |
| --- | --- |
| Existing tracker boundary; optional Projects; Issues own descriptions/lifecycle | Retained |
| Mandatory backlog/ready/in-progress/blocked/done mapping | Rejected; expose actual fields/options, no universal states or transitions |
| Queue is ready issues in API order | Rejected as policy; expose complete item observations and explicit filters; repository chooses eligibility and priority |
| Claim means self-assignment plus in-progress | Rejected; assignment and field changes are separate explicit primitives; repository defines claiming or no claiming |
| Human block always writes a reason comment and blocked state | Changed; comment/field primitives support the repository's chosen convention |
| Merge into trunk plus prescribed conditions defines delivery for everyone | Rejected; conditions must be explicitly selected; unsupported conditions remain visible guidance, not claimed enforcement |
| Required machine-local delivery ledger | Rejected; propose optional version-controlled reference manifests, with the tradeoff below |
| Fresh reviewers receive bounded local guidance, with input identity | Retained and extended to relevant agents/local workflow |
| Idiomatic Elixir profile and offline behavior tests/effect evals | Retained |
| Local slice closure is distinct from PR/work-item completion | Retained |
| Setup is a downstream checklist only | Changed; upstream workflow-discovery skill makes owner-led discovery and artifact creation reusable |

## Verified gaps and responsibility split

These source observations from the first investigation remain valid; no production code
changed during planning. Do not infer a new requirement from an old design proposal.

| Area | Already supported | Configuration/documentation only | Genuine upstream work | Repository responsibility |
| --- | --- | --- | --- | --- |
| Tracker | One `Tracker`; Issues and repo-file CRUD | Choose backend/repository | Optional Project observations and explicit operations through the existing tool | Issue scope, local selection/ownership/blocking conventions |
| Workflow | Local devsys execution phases; legacy open/in-progress/done tracker API | Existing engineering instructions and task records | Discovery skill; explicit local-guidance discovery/transport | Authoritative operational workflow, resolve contradictions |
| Projects | No Projects v2 integration | Existing gh authentication outside devsys | Project/field/option/member inspection, complete reads, explicit membership/field/assignment writes | Choose board/schema; explicitly authorize migration/automation changes |
| Review | Fresh task, lenses, typed submission, diff identity, clean rounds | Rounds and thinking level | Reliable bounded local guidance transport and identity | Domain/product concerns; no universal Simulac lenses |
| Language | Rust/TypeScript selection and overrides | Existing local-command precedence | Elixir profile, detection/restoration and effect evals | Commands, libraries, architecture, mutation/browser policy |
| Delivery | Trunk/PR/local-only modes; reviewed, clean, pushed slice closure | Delivery mode/remote/trunk | Honest slice wording; one-shot PR evidence; optional explicit completion checks/resumption | Meaning of delivered, full-scope confirmation, server/deployment policy |
| Verification | Injected Exec, offline public-interface tests, Jev/live fixtures | Existing npm gates | Fake-GitHub failure journeys; agent guidance effect harness/fixtures | Application domain and acceptance gates |

Source anchors (checked against current source):

- `src/tracker/types.ts`: `WORK_STATUSES`, `WorkItem`, `TrackerResult`, and
  `Tracker.list/get/create/update/comment`. No existing workflow-capability contract.
- `src/tracker/work-item-tool.ts`: exactly those public CRUD actions; no Project,
  assignment, evidence or completion operations.
- `src/state/config.ts`: tracker kind/repo and review rounds/thinking level, not the
  proposed workflow/guidance/Project/evidence keys.
- `src/tracker/github.ts`: 1000-item listing limit; incomplete open listings refused;
  implicit in-progress label creation on status update. Remove that implicit setup.
- `src/core/review-flow.ts` and `src/review/review-tools.ts`: generated fresh-context
  task has no explicit repository guidance snapshot.
- ADR 0006: typed review submission and fallback are existing contracts to preserve.
- `src/core/profile.ts`, `src/core/types.ts`, `src/state/session-state.ts`: Rust and
  TypeScript only; no dedicated Elixir profile.
- `src/planning/slice-close.ts`: successful reviewed clean pushes can close a local
  slice, including PR mode; message says "was delivered" without observing a PR merge.
- `extensions/development-system.ts`, `src/context/system-prompt.ts`,
  `src/subagents/index.ts`, `src/subagents/orch/runtime.ts`: integration points for
  root/fresh agent guidance. Do not rely on parent conversation inheritance alone.

Read-only downstream evidence: `../10kr-00003-simulac/AGENTS.md` names canonical rules,
Nix/just commands, signing, PR-only squash auto-merge, CodeRabbit/ci-result and
factory-only application edits. `factory/factory.yaml` carries separate factory policy.
Those restrictions need downstream owner resolution; installing devsys does not lift them.

Read-only factory-builder evidence:
`../10kr-claude-plugins/plugins/factory-builder/agents/factory-surveyor.md`,
`skills/10kr-build-factory/SKILL.md` and its `references/charter.md` distinguish survey,
owner charter, generation and dry run, with source-backed commands and reviewed local
artifacts. Reuse that discovery/approval pattern, **not** its default stations, loops,
verdict pairs, shadow modes, metrics or autonomy thresholds. Strengthen its command
evidence distinction: "seen in CI" is not the same as "executed successfully now".

Recorded baseline from the first investigation: `npm test` passed 1672 tests with zero
failures/skips; `npm run typecheck` passed. These are historical baseline results, not
verification of the proposed capabilities, all lint gates or model effects.

## Proposed contracts for approval

### 1. Discover or define a local workflow; do not generate an engine

Add one `project-workflow` skill with define, discover and maintain paths:

1. Survey guidance, task runners, CI, tracker/board observations and relevant automation
   read-only. Cite paths/revisions or sanitized API facts. Do not execute setup, mutate
   a board, run costly commands or expose secrets merely to discover policy.
2. Separate documented intent, observed configuration/behavior, inference and unknowns.
   A workflow file declaring a check does not prove it is required or passing. Existing
   labels/fields are evidence, not instructions to retain accidental policy.
3. Ask one consequential owner decision at a time. Resolve conflicting factory-only
   instructions, authority, ownership, selection and delivery meanings before proposing
   operational changes. Missing permissions remain unknown, not an empty board.
4. Propose a local workflow document, references to authoritative rules, narrow devsys
   config and an explicit migration/adoption plan. Show existing-file diffs; do not
   silently overwrite them. Each proposal remains unapproved until owner acceptance.
5. Prepare a single owner-selected pilot, with effects, stopping points and evidence.
   Performing downstream setup/pilot is outside this upstream goal.

Propose `[workflow] guidance = ["docs/development-workflow.md"]`. AGENTS.md should point
humans and agents to that config/document; it is not a second workflow specification.
Config is the deterministic discovery pointer, not a parser for prose transitions.
The local document defines selection, priority, ownership/claiming, human blocks,
completion, commands, authority, evidence locations and unsupported/manual conditions.
Do not require a fixed heading vocabulary or machine-readable transition language.

A shared loader resolves configured tracked, regular UTF-8 files inside the repository
(realpath containment), with proposed limits of 32 KiB/file and 64 KiB total across
workflow/review inputs, no silent truncation. Explicitly configured referenced documents
are loaded too; do not recursively follow arbitrary links. Uncommitted changes to a
tracked guidance file are allowed and included in its content identity; newly generated
untracked proposals are not yet operational authority.

Root guidance is refreshed at the next agent turn; devsys-created fresh planner,
implementer and reviewer tasks receive actual snapshots, paths and hashes, including
independent roots. Resumed agents receive changed guidance before another task proceeds.
Do not claim this controls unrelated external agents or arbitrary raw shell commands.

No workflow configured: retain legacy engineering behavior and report local workflow
as unconfigured when a policy-dependent action is requested. Do not invent a queue or
claim policy. Configured but unreadable/escaping/oversized files block affected task or
review preparation with repair instructions. Contradiction detection is agent guidance,
not a semantic validator: agents must surface conflicts and ask; config validation only
proves readable, bounded inputs. Existing hard stops outrank local contrary instructions.

### 2. One tracker boundary, optional Project primitives

Propose optional advertised capabilities on `Tracker`, implemented by GitHub and consumed
through `devsys_work_item`. Existing CRUD remains; no separate tracker tool family or
mandatory new backend for repo-file users. Final schemas follow these semantics:

| Proposed public action/input | Observable contract |
| --- | --- |
| `inspect` | Backend capabilities; Project owner/number/title/URL, node identity, fields/options/types; no provisioning |
| `project-items` | Complete visible issue/member observations; optional explicit issue lifecycle and single-select option filters; no workflow interpretation |
| `project-member` | Named issue's membership, archive/redaction diagnostics and actual fields; missing membership is not auto-enrollment |
| `project-enroll` | Explicit idempotent enrollment of the named issue in configured Project only |
| `project-set` | Explicit set/clear of one supported single-select field using actual field/option IDs; no transition inference |
| `assign` | Explicit add/remove of named native issue assignees; no implicit self-claim or field transition |
| existing `comment` | Explicit issue comment; reason/meaning determined locally |
| GitHub lifecycle update | Explicit open/close independently of Project field values; delivery guard applies only if explicitly configured below |

This increment supports single-select mutation, not arbitrary Project schema editing.
Return other field metadata/read values where supported; unsupported types are explicit,
not coerced to a status. IDs are explicit, names are inspectable for human confirmation.
An organization Project works via its node ID; normal operations do not look up by title.
Validate repository, Project, field and option identities before writing. No default
status field, canonical option set, state mapping or transition graph is supplied.

Issues own descriptions/lifecycle; Project fields own whichever workflow facts the
repository assigns them. No label mirror or local workflow ledger. Project observations
include lifecycle and raw Project fields separately. Legacy `status` is labeled a legacy
projection, never Project authority. In Project-configured mode `update status=in-progress`
refuses ambiguous label writes; explicit lifecycle inputs replace open/done ambiguity.
Legacy list/get remain usable to inspect Issues; `project-items` is the board view.
Issues-only/repo-file legacy statuses remain compatible and are not extended into a
universal vocabulary. In Issues-only mode missing marker labels return explicit setup
advice rather than creating them. No Project config means no Project API calls.

`project-items` exhausts relevant paginated connections or reports incomplete, with
cursor-loop/malformed/partial GraphQL failures. It presents API item order as an
observation, not priority or saved-view order. This increment does not reproduce UI
saved views or mutate rank. A local policy may explicitly use API order, select a named
issue, or choose priority from reported fields; unsupported deterministic sorting must
be disclosed, not simulated as a guarantee. Humans retain board/order control.

Archived items are diagnostics and cannot be mutated without a separately supported
explicit operation; this increment does not unarchive. Redacted/inaccessible content,
foreign repositories and non-issue item kinds remain visible exclusions/unknowns.
Do not return "no eligible work" if access/pagination prevents that conclusion.

Mutations affect only requested resources. Tools observe current facts before writing
and verify results; assignment/field changes are not atomic reservations. Repository
claiming can compose operations with an expected observation, but preflight is not CAS.
No exclusive ownership guarantee or lock. Separate operation results distinguish
confirmed effects, not-attempted effects and uncertain write outcomes. After a timeout,
re-read before retry; after partial failure, retry only missing authorized effects.
Never roll back an intervening human edit. Discovery never provisions labels/schema.

### 3. Local review concerns and local workflow reach fresh reviewers

Propose `[review] guidance = ["docs/review-guidance.md"]`, using the same bounded loader.
Workflow guidance and review guidance are distinct inputs with one shared source identity.
Include relevant workflow and actual review content in the generated task and fallback
payload; parent context or AGENTS.md discovery alone is not the transport guarantee.
Concerns supplement existing lenses; no per-concern agent or Simulac lens defaults.

Bind a review round to the diff digest plus the configured guidance paths/content hashes.
Changing either before record/commit invalidates the round and clean streak for that
identity. Preserve typed submission, verdict/severity checks, required rounds and fallback.
Guidance may influence findings; it cannot waive gates or manufacture review evidence.
No configuration keeps existing behavior. Effect evals, not transport tests alone,
establish whether fresh reviewers actually use local concerns.

### 4. Idiomatic Elixir/Phoenix profile

Add `elixir`: root `mix.exs` detection, override parsing and restored-state support,
including mixed-language repositories. Teach ExUnit behavior tests through public
interfaces; domain/property tests for invariants; Phoenix connection/LiveView/browser
acceptance where the user journey warrants them. Local Nix/just commands and repository
rules take precedence over suggested mix defaults.

Use immutable data, pattern matching, `{:ok, value}` / `{:error, reason}`, `with`, pure
decisions and thin I/O boundaries; supervision/exceptions are not expected domain errors.
Do not transplant Rust brands/error enums or TS Result wrappers. Recommend format checks,
compiler warnings as errors, Credo/Dialyzer where installed/configured and appropriate
mutation policy, without installing/mandating dependencies, event sourcing or a layout.
Clearly distinguish recommended guidance from gates actually enforced by local tooling.

### 5. Observe delivery truthfully; opt into narrow completion enforcement

Keep `finish_slice`'s existing local contract: reviewed, clean, pushed (or configured
local-only completion). Fix messages/docs so neither push nor slice finish is reported
as a delivered PR or completed issue. No implicit work-item writes on slice closure.

Extend the work-item tool with `delivery-check`: one-shot read of explicit PR references,
returning per-revision facts and assessed conditions. No polling service, auto-merge,
implicit closing-keyword inference or mandatory CodeRabbit. Report pending, failed,
blocked and unknown separately from a satisfied condition. An open PR is not merged;
armed auto-merge is not delivery. Missing checks/permissions cannot pass a required check.
PR head changes invalidate evidence tied to the old head. Distinguish current head checks,
merge commit and configured base; do not equate stale check success with delivery.

**Proposed optional resumption design, replacing the ledger:** explicit version-controlled
per-item JSON manifests under a configured repository directory. Store issue identity,
required PR references and any explicitly recorded manual requirements, not workflow
status, cached success or credentials. Author/edit manifests explicitly as ordinary local
files; no implicit issue comments or hidden state writes. A fresh session/checkout reads
the same references. Read-only checks may instead accept explicit references with no
manifest and no persistence claim. No inference that one linked PR covers the entire issue.

Tradeoff: versioned references are reviewable and survive machines, but add repository
metadata/commit churn and require intentional updates when PR scope changes. An absent,
invalid or conflicting manifest fails a configured guard; it is not reconstructed from
closing keywords. A reference changed concurrently invalidates the check. No claim of
an atomic transaction across a filesystem, GitHub APIs and human policy decisions.
ADR 0013 is proposed, not approved; reopen if this is unsuitable for the intended pilot.

Propose optional `[delivery.evidence]` configuration for the supported mechanical
conditions: required manifest, merged PR, target base and named passing checks for all
required PRs. Absence of this section imposes no universal PR-completion gate, even
in PR mode, and reports delivery assessment as unconfigured/not evaluated. Existing
explicit issue closure remains possible but must not be described as proof of delivery.

When configured, `complete` requires explicit full-scope confirmation and fresh evidence
for all declared required PRs; legacy done and explicit lifecycle-close writes pass the
same guard. `complete` closes the issue only; it does not guess a Project terminal field.
Project completion changes are explicit separate operations under local instructions.
Raw `project-set` is a field primitive, not a delivered-work assertion, and cannot prove
a repository's whole completion policy. This is an intentional enforcement boundary,
not a claim that every path to a board option is guarded.

Manual product acceptance, unresolved local policy, deployment evidence or unsupported
review conditions cannot silently count as mechanically passed. Report them as manual/
unsupported and require owner resolution under the local workflow; do not claim the
manifest can prove their truth. This increment enforces only supported configured
conditions through devsys issue-close/complete actions. It does not prevent direct gh,
UI, automation or human edits. GitHub rulesets enforce signing, merge eligibility,
required reviews and merge strategy; use existing forge tools for those operations.

## Proposed configuration and two contrasting local workflows

The following are future contracts; the current config parser rejects new keys. IDs
are placeholders; obtain real IDs read-only, then have the owner approve mappings.
No example is an upstream default or an instruction to change Simulac.

### Example A — PR-delivered product change

```toml
version = 1
[tracker]
kind = "github"
repo = "EXAMPLE/product"
[tracker.project]
id = "PVT_product"
[workflow]
guidance = ["docs/development-workflow.md"]
[review]
guidance = ["docs/review-guidance.md"]
[profiles]
override = ["elixir"]
[delivery]
mode = "pull-request"
trunk = "main"
remote = "origin"
[delivery.evidence]
manifest_dir = "docs/delivery"
require_manifest = true
require_merged = true
base = "main"
required_checks = ["ci-result"]
```

Local workflow A chooses a single-select Execution field with Proposed / Accepted /
Held / Published options. Candidate reads explicitly filter Accepted/open; a human
chooses priority. A developer explicitly adds their assignee and separately changes
Execution according to the approved local convention. Held uses a local reason-comment
convention. Multiple slices/PRs can serve one issue. Manifest references and passing
configured merge/check conditions plus explicit scope confirmation permit issue closure;
Published is a separate explicit Project update. Local guidance requests domain/UX
concerns; server rules enforce signing/squash/reviews. No special bot is universal.

### Example B — human-led research with no claim or merge prerequisite

```toml
version = 1
[tracker]
kind = "github"
repo = "EXAMPLE/research"
[tracker.project]
id = "PVT_research"
[workflow]
guidance = ["docs/research-workflow.md"]
[review]
guidance = ["docs/research-review.md"]
[delivery]
mode = "local-only"
```

Local workflow B chooses a Study field with Explore / Needs decision / Findings
accepted. A human names the issue; agents do not auto-pick, assign themselves or reorder
anything. Collaboration needs no exclusive claim. Blocking is an issue comment while
Study stays unchanged. Human acceptance governs moving to Findings accepted; the issue
may stay open for subsequent experiments. There is no PR or merge prerequisite, no
manifest guard, and no tool claim that human acceptance is mechanically verified.
If a PR is supplied for evidence inspection, the same one-shot primitive reports its
facts without redefining research completion. Local-only slice closure is not acceptance.

Both examples run on identical upstream code. Tests must prove no hidden ready state,
self-assignment, API-priority, merge prerequisite or auto-close appears in example B,
and no missing required evidence can close example A. Repo-file/Issues-only examples
remain regression coverage, not forced into either Project model.

## Independently deliverable test-first slices

These are approval-stage boundaries, with [draft task records](existing-application-adoption-tasks.md).
Before implementation/delegation, check and refine each approved record with
`devsys_task_check`. Finalize event-model scenarios for commands/views and the
proportional threat model at that point; do not use an event model to invent a state DSL.
One RED behavior at a time; structural changes stay separate.

| Slice | Public outcome / acceptance | First failing public test or effect eval |
| --- | --- | --- |
| S1 Explicit legacy setup | Missing Issues-only marker label yields setup error, no implicit provisioning; existing CRUD unchanged | Update in-progress with missing label fails without any label-create effect |
| S2 Local workflow input | Configured tracked guidance reaches root and an independent fresh task; invalid input blocks preparation | Fresh task in a temp repository receives its workflow and source identity with no inherited parent context |
| S3 Workflow discovery skill | Evidence/proposals, owner decisions and local artifacts without unauthorized effects | Contradictory factory-only docs/CI/board fixture causes evidence-backed owner question, not an invented replacement workflow |
| S4 Project inspection | Node/field/options/types and membership diagnostics, no writes | Inspect wrong-Project field returns actionable identity error and zero mutations |
| S5 Complete Project reads | Paginated items/fields, explicit filters, actual lifecycle, archive/redaction handling | Issue on page two matching a caller-selected noncanonical option appears; incomplete next page refuses a complete result |
| S6 Explicit enrollment | Named issue enrollment is explicit/idempotent; missing membership remains visible | Get/member does not enroll; explicit retry after an uncertain add first re-reads membership |
| S7 Explicit field mutation | Set/clear a supported actual field option, never schema provisioning or inferred transitions | Option belonging to another field refuses without mutations |
| S8 Explicit assignments | Named assignee add/remove only; no implicit workflow/claim policy; races disclosed | Assignment succeeds while a human changes a field: result does not claim exclusive ownership or overwrite the field |
| S9 Fresh review guidance | Local workflow/concerns arrive in actual/fallback reviewer tasks with input identity | Change a configured concern between review start and record: stale round is refused, no clean-round credit |
| S10 Elixir selection | Detect, override and restore elixir, including mixed profiles | A mix.exs repository selects elixir and survives session restoration |
| S11 Elixir guidance effect | Local commands, tuple errors, suitable public-interface/LiveView scope, no invented libraries | Model in a just/Nix fixture chooses declared commands and idiomatic expected error handling, not Rust/TS patterns |
| S12 Honest slice closure | Local clean/reviewed/pushed close neither says PR delivered nor writes an issue | PR-mode push closes local slice but reports only local completion and leaves issue/Project unchanged |
| S13 PR observations | One-shot evidence for explicit PRs/revisions, configured facts, no writes | Open PR with auto-merge armed reports pending merge, not delivered |
| S14 Resumable explicit references | Optional repository-owned manifests survive new sessions without workflow state | Recreate tools against a two-PR manifest: one merged/one open remains pending with no close effect |
| S15 Opt-in completion guard | Explicit configured conditions gate every supported issue-close path; other modes impose no invented merge rule | Example A missing a required check refuses legacy done/lifecycle-close/complete without closing the issue |
| S16 Local workflow contrast and adoption | Same tools support both examples with documented partial-effect recovery and owner-led pilot | Example B completes its explicit local actions with no assignment, merge lookup or implicit issue closure |

Run each targeted Node public-interface test via the existing test harness, then
`npm test`, `npm run typecheck` and applicable lint/structural/version/release gates.
Add effect-fixture execution to an explicit runnable model-eval command; name/document
the command in the implementing task record rather than pretending it exists today.

Mandatory adversarial additions, introduced vertically: GraphQL errors with partial data,
malformed results/cursor loops, permission/redaction/rate limits, archived/foreign items,
missing/changed field options, ambiguous write timeouts, reassignment, PR wrong repo/base,
changed heads, closed-unmerged, failed/missing checks, corrupt/escaped/conflicting manifests,
manifest changes before completion and direct external lifecycle/Project divergence.
Results show confirmed/unknown effects and safe reads/retries; no cross-API transaction
or invisible rollback. Ordinary tests use fake Exec and temporary repositories, not live
GitHub credentials and not assertions against committed implementation text.

Effect evals use actual task outputs/tool effects: new workflow, legacy conflicting
workflow, inaccessible board, changed guidance and unsupported completion evidence.
Fresh reviewer cases seed a domain defect plus harmless controls, inspect typed findings,
and include attempted gate override. Elixir cases check decisions, not literal mentions.
A shared harness/recorded model configuration reports inputs, actual behavior, failures
and repeats; safety cases must show no unauthorized mutation or false delivery. Paired
controls distinguish guidance influence from generic model behavior. File-presence/string
checks and existing Jev classifier fixtures are not substitutes. Record effect evidence
before shipping model-visible instructions; no effect result is asserted by this plan.

## Architecture, threat controls and approval

Proposed revisions to ADRs 0011–0013 cover optional capability boundaries, local-guidance
transport/identity and opt-in resumable delivery evidence. No new dependency class or
custom workflow execution engine is proposed. Their status remains **proposed**.

Threat controls: keep credentials inside gh; sanitize all logs/fixtures; use argv and
GraphQL variables, parse untrusted responses at ingress, contain guidance/manifest paths,
and never execute document-supplied commands merely by loading them. Distinguish agent
instructions from enforceable code; hostile local prose cannot authorize gate overrides.
Corrupt/inaccessible evidence is unknown/error, not success. No atomic reservation or
cross-resource transaction guarantee. Record control-linked tests before boundary code.

**Approval request:** approve or revise revision 0.2 and ADRs 0011–0013, especially the
local-guidance pointer/transport, raw optional Project capability, explicit enforcement
boundary and optional version-controlled manifest. Approval starts implementation; it
is not evidence of successful adoption. Material contract/scope changes require renewed
approval. Stop and ask on unresolved gates, conflicting authority, unsupported policy,
missing authorized permissions or a hard-to-reverse decision outside this proposal.

## Downstream adoption recipe — owner actions, not executed here

1. Invoke discovery against local rules/tooling/automation. Resolve factory-only edit
   restrictions and conflicting status writers with the owner before application work.
2. Approve a version-controlled local workflow and review concerns. Point AGENTS.md to
   them and configure workflow/review guidance, backend, Elixir and local delivery mode.
   Keep Nix/just, domain/mutation/browser gates and existing history.
3. Choose the board's actual fields/options from local needs; no five-state requirement.
   Inspect identity/options read-only, approve configuration, then separately authorize
   membership/schema/label migration or automation retirement. Preserve issues/history.
4. Authenticate gh with repository access and Project read/write authority as needed.
   Classic read:project supports queries; project supports writes; organization grants,
   app permissions and SSO may also apply. Diagnose effective access; never print tokens.
   Issues-only users provision their marker label explicitly if using that convention.
5. Choose one bounded issue. Follow local selection/ownership/blocking conventions using
   explicit primitives; confirm fresh agents/reviewers receive the approved local inputs.
6. Deliver reviewed slices through existing policy-compliant forge operations. If local
   completion requires merge/check evidence, configure the guard and explicitly record
   all required PRs; resume checks without inferring scope from one PR or push. For
   unsupported human/deployment conditions, obtain the required owner evidence instead
   of calling them mechanically satisfied.
7. Complete only the locally authorized actions. Inspect issue lifecycle and Project
   fields separately; after partial failures, re-read and retry missing authorized
   effects. The owner evaluates the pilot before broader adoption.

Live GitHub smoke checks are separate opt-in operations against authorized test resources,
not Simulac. Document grants, exact effects, cleanup owner and sanitized results. No live
smoke, guidance effectiveness or downstream adoption is claimed by this planning revision.
