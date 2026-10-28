# pi-development-system

A [pi](https://pi.dev) extension package representing my seasoned approach to
software development using a full AI SDLC: work is sized, planned in proportion, built
test-first in small slices, reviewed by fresh-context reviewers and delivered by trunk-based
commits. Guards enforce what must hold; the rest is guidance with a recorded way out.

## Install

```sh
pi install npm:@jwilger/pi-development-system
```

Then `/reload`. To move to a newer release use
`pi install npm:@jwilger/pi-development-system@<version>`.

Jev, the classifier behind the judgements, is optional. Without a credential configured, the checks
that rest on a judgement do not run or fall back to a default: the motive behind a test change, whether a
diff needs an ADR, the quality of a commit rationale and whether a commit mixes changes, the intent
nudges, the verifier's check of the agent's own claims, and the lens and severity choices in review.
The status line shows `jev offline` when that is so. Everything deterministic holds without Jev: the
hard stops, the delivery mode, the review streak, red-first and the slice life cycle.

## Replaces pi-subagent-manager

This package vendors `pi-subagent-manager` (MIT, see `src/subagents/VENDORED.md`)
and adds per-spawn `model` and `thinkingLevel`. **Remove the original from the
`packages` list in `~/.pi/agent/settings.json`** (the `npm:pi-subagent-manager`
entry), then `/reload`; otherwise both register `agent_spawn` and pi refuses the
duplicate.

## You do not need the slash commands

Everything the system offers is reachable without remembering a command. Describe the work in
plain words: when a prompt asks for new work, a fix or a review, the system adds a guideline
naming the tool to use (`devsys_intake`, `devsys_review_start`). A `devsys` tool always shows
what the current phase expects. When you say a slice is finished with no review round recorded,
it tells you to start one. The slash commands (`/devsys-start`, `/devsys-plan`, `/devsys-review`,
`/devsys-lens-review`, `/devsys-adr`, `/devsys-event-model`) are shortcuts to the same tools.

Skills cover the habits behind the gates: `tdd-canon`, `behaviour-tests`, `semantic-types`,
`typed-errors`, `functional-core-imperative-shell`, `strict-lints`, `delivery-discipline`, `delegation`,
`code-review`, the language profiles (`profile-rust`, `profile-typescript`), `profile-design-system` for UI
work (tokens, then components; build from the design system's materials and log a snowflake),
`threat-modelling` (proportional; a document only when the risk earns it) and the planning skills below.

Product planning has a skill (`product-planning`: brief, decision register, follow-ups,
terminology, journeys). `devsys_lens_review` plans a review of the brief by five product lenses and
writes the packets to `docs/product/reviews/`; `devsys_adr_new` creates the next numbered ADR, and
a commit that shapes the architecture without one is stopped by the soft gate `adr.missing`.

A reviewer subagent hands over its result with `devsys_submit_review` (typed arguments; a result that
contradicts itself or is for the wrong round is refused with an error id), and `devsys_review_record`
reads it. A markdown packet is still accepted (ADR 0006).

Event modelling has a skill (`event-modelling`: three slice patterns, Given/When/Then, completeness).
`devsys_event_model_check` validates a directory of slice files (schema v1) and renders the swimlane
Markdown or a Mermaid diagram; each profile's `gwt-tests` reference turns scenarios into failing tests.
A dedicated extension that offers `event_model_validate`, or `event_model.provider` in
`.development-system.toml`, replaces the builtin tool ([contract](https://github.com/jwilger/pi-development-system/blob/main/docs/event-model-extension-contract.md)).

A slice has a life cycle: `implementing` → `reviewing` (when a review round starts) → `delivering`
(review satisfied) → `idle`. Editing production source while delivering reopens `implementing`,
and red-first stays on throughout. A push of a clean tree closes a delivered slice by itself (a commit
in `local-only` mode; CI is not awaited), and `devsys_finish_slice` closes it explicitly or, with a
reason, abandons it. A plan's increments each end in a push, so each increment is its own slice: the
next one starts with `devsys_intake`.

`devsys_intake` does not interrupt autonomous work: Jev's size is used when Jev is at least 50%
confident, and the user is asked to pick only when it is less sure (or unavailable). A size decided up
front, such as in a goal's planning, is passed as `size` and skips the sizing question entirely.
Fix-sized work retains the required review rounds; intake never offers to waive them.

With `codemode` enabled (`"defaultTools": ["+codemode"]` in pi settings), rarely used tools are
reached through scripts. With `tool_search` instead, search activates them on demand. Without either
discovery tool, the rarely used tools are declared directly. This fallback is refreshed before each
model turn; enabling discovery withdraws only declarations added by the fallback, preserving tools
that were independently active. The `judge_*` Jev wrappers remain registered for scripts or explicit
search activation, never automatically added to the direct fallback. Sessions from before 1.7.0 lack
fallback ownership records: their existing rare-tool selections are preserved on upgrade. Explicitly
deactivate those selections if you want them available only through discovery.

## Configuration

`.development-system.toml` at the repository root (version 1). Every key is optional; an unknown
key is an error that names it. `/devsys-models` writes the `[models]` table for the models this
machine can use.

| Table | Keys | Meaning |
| --- | --- | --- |
| `[delivery]` | `mode` (`trunk`, `pull-request`, `local-only`), `trunk`, `remote` | Where work lands; the push guard follows it. `local-only` blocks every push. |
| `[review]` | `required_clean_rounds` (3), `min_rounds` (1), `thinking_level` (`high`) | The clean streak a slice needs before commit, and the effort of the reviewer and lens agents. |
| `[tracker]` | `kind` (`repo-files`, `github`; `jira` and `linear` are not implemented), `repo`, optional GitHub `project_id` | Backlog for `devsys_work_item`; opt-in read-only Project metadata.  |
| `[workflow]` | `guidance` (repository-relative file paths; default `[]`) | Explicit repository-owned workflow content for root and SDK child requests. |
| `[profiles]` | `override` | Languages to apply (`rust`, `typescript`); empty means detect. |
| `[models]` | one ordered candidate list per slot | See Model tiers below. |
| `[routing]` | `"<difficulty>/<risk>" = ["<slot>", "<thinking level>"]` | What `devsys_route_task` recommends for a subagent. |
| `[verifier]` | `max_per_session` (6) | Cap on Jev checks of the agent's own claims. |
| `[cadence]` | `push_minutes` (60) | Minutes without a push before the cadence nudge. |
| `[event_model]` | `provider` (`builtin`) | Another provider replaces the builtin validator. |

Machine-local models (an Ollama host only this machine reaches, say) do not belong in the committed
file. Put them in `development-system.toml` in pi's agent directory (`~/.pi/agent/`, or
`PI_CODING_AGENT_DIR`). That file may hold only `version` and `[models]`; each slot's candidates
there go ahead of the repository's on this pi, and `/devsys-models` shows them but never writes them
to the repository (ADR 0010).

```toml
version = 1
[models]
fast = ["my-ollama/qwen3-coder*"]
```

### Repository-owned workflow references

```toml
[workflow]
guidance = ["docs/workflow.md", "docs/delivery-policy.md"]
```

These explicit references transport local instructions; devsys does not interpret a
universal workflow schema. Before every root or SDK child request (including independent
children and resumed sessions), devsys loads current content with source paths, SHA-256
hashes and a snapshot identity. This is model guidance, not enforcement of arbitrary local
policies; it does not automatically reach external agent runtimes.

Files must be tracked by Git, repository-contained regular UTF-8 files. Absolute paths,
parent traversal, symlink escapes, untracked/missing files and invalid configuration
refuse preparation with repair advice. Limits are 32 KiB per file and 64 KiB combined;
there is no silent truncation or recursive link/include loading. Configured guidance
also refuses a full-system-prompt override, which would bypass section refresh; repair
the overriding extension to use named prompt sections instead. An empty list adds no
local workflow content. Review-specific guidance has its own contract; this setting does
not change typed review submission or grant permission to provision tracker resources.

### Discovering or defining the local workflow

Load the `project-workflow` skill when adopting devsys, replacing an existing
factory, or reconciling policy and automation. It inventories authorized sources
read-only, separates intent/configuration/execution, and escalates contradictions
or access gaps to the owner before operational changes. It proposes discoverable
version-controlled workflow/review documents, pointers and explicit integration
configuration without prescribing universal queue states or provisioning a board.

This is model guidance, not enforcement. See [the effect-eval evidence and opt-in
runner](evals/guidance/README.md) for tested behaviors, failed controls and limits.
The ordinary test suite never calls a live provider for these cases.

### GitHub Issues-only setup

With `[tracker] kind = "github"`, issue lifecycle is projected as `open`/`done`,
and an existing `in-progress` label marks active open issues. This is a compatibility
convention, not a Project workflow or proof of delivery. Ordinary tracker operations
never create or recolor labels.

Before using `status = "in-progress"`, an authorized repository owner must explicitly
review this convention and ensure the label exists in the target repository. For
example, after checking existing labels:

```sh
gh label list --repo OWNER/REPO
gh label create in-progress --repo OWNER/REPO
```

These are manual setup commands, not actions performed by `devsys_work_item`. Do not
force an existing label's settings. If an update fails, its original GitHub error is
returned; missing setup is only one possible cause (permissions or another edit may
have failed). Inspect the error, re-read the issue and repository setup, and retry
explicitly after resolving the cause. A failed edit does not trigger issue closure
or reopening; GitHub edits are not promised to be transactional. Repo-file tracking
requires no label setup. Project integration is not provided by this convention.

### Optional GitHub Project inspection

Issues remain work descriptions. To inspect an existing Projects v2 board, explicitly
configure its opaque GraphQL node id; neither its title nor its number is a global id:

```toml
[tracker]
kind = "github"
repo = "OWNER/REPO"
project_id = "PVT_REPLACE_WITH_ACTUAL_NODE_ID"
```

Call `devsys_work_item {action:"inspect"}` for the configured Project's owner login,
number, title, URL, field ids/types and single-select option ids/names. An optional
`fieldId` asserts that a field belongs to this Project; names never choose a field.
The returned capabilities describe currently implemented tool actions, not a workflow.
Without `project_id`, inspection returns `project:null` with no Project network call;
repo-file tracking works the same way. The option is invalid for non-GitHub trackers.

The read uses existing `gh` authentication and requires access to the Project, including
organization/SSO authorization where applicable. Classic tokens need `read:project`;
fine-grained tokens need the relevant organization/user Projects read permission.
Private issue access may require additional repository permissions for later operations.
No credential is stored by this extension, and inspection never provisions labels,
fields, options or membership. It does not select or claim issues or change board state.

All field pages are read (100 per page, maximum 100 pages). Missing/repeated cursors,
duplicate identities, malformed results, GraphQL partial errors and permission failures
return explicit errors, not a usable partial board. Correct access/configuration and
re-read before proceeding. Pages are observations, not an atomic snapshot or a lock;
humans can change the board concurrently. This metadata API introduces no canonical
status mapping and does not replace the Issues-only compatibility convention above.
Live smoke checks are optional: only invoke inspection after explicitly choosing a
Project you are authorized to read. Ordinary tests use fake process responses and need
no GitHub credentials.

### Read-only Project issue observations

`devsys_work_item({ action: "project-items" })` observes a configured Project's
repository issues. It requires both `tracker.repo` and `tracker.project_id` above;
repo-file and Issues-only tracking keep their existing behavior. Optional `lifecycle`
is `open` or `closed` and filters GitHub issue lifecycle only. To filter a single-select
value, supply both `fieldId` and `optionId` using identities returned by `inspect`:

```json
{"action":"project-items","lifecycle":"open","fieldId":"PVTSSF_example","optionId":"example-option"}
```

The result separates issue lifecycle, item archive status and raw Project values. It
includes issue/item node identities, number/title/URL and observed single-select,
text, number and date values. Other field values are explicitly `unsupported` with
their API type, not coerced into workflow states. A missing value does not prove a
workflow state. Field/option filters are validated against the configured Project;
legacy `status` is refused rather than silently interpreted as a Project filter.

Both archived and non-archived items are requested explicitly. Archived issues remain
observations with diagnostics; no item is selected, claimed, enrolled or unarchived.
Drafts, pull requests and foreign-repository issues are excluded with diagnostics.
Redacted/inaccessible content makes `eligibility` **unknown**, not an empty eligible
queue. Otherwise eligibility is **unassessed**: repositories decide their own criteria.
Returned API order is only an observation, not priority, rank or saved-view ordering.

All item pages and each relevant item's field-value pages are exhausted (100 per page,
maximum 100 pages per connection). Missing/repeated cursors, duplicate identities,
stale field/option identities, malformed/partial responses, process failures and
permission errors discard partial observations and return repair/re-read advice.
The metadata and item reads are not an atomic snapshot and do not reserve work.
Large boards can require many read requests; reaching the bound is an error, not
successful truncation. Correct permissions/configuration, then re-read. Existing `gh`
authentication and Project/private-issue read permissions apply as above. No board
writes or live credentials are needed by the ordinary tests; live smoke checks remain
explicitly chosen and opt-in. The API request shape is documented in GitHub's
[Projects GraphQL reference](https://docs.github.com/en/graphql/reference/projects).

## Model tiers

Models are asked for by slot, never by id. Three capability tiers (`frontier`, `strong`, `fast`)
and role slots built on them (`planning`, `advisor`, `implementer`, `reviewer`, `lens`,
`researcher`, `jev`). A slot is an ordered list of candidates: `provider/id`, a family pattern
such as `provider/gpt-*-sol` (the newest available id wins) or a slot reference such as `@strong`.
The first candidate this machine has credentials for is used, so one committed file works across
accounts. When routing a task or a spawn, a candidate whose known context window is too small is
skipped: the estimated request (8K tokens of overhead plus the task text and named files) must be at
most 60% of the window (ADR 0009). This lets a small local model come first in a slot and still
fall back to a cloud model for large work; `devsys_route_task` says which models it skipped. Pin an exact id to stop it rolling forward. `devsys_models` shows what each slot
resolves to, and the system recommends a model for a phase but never switches yours.

## Enforcement tiers

- **Hard stops** fire for the non-negotiables (`principles/NON-NEGOTIABLES.md`): rewriting
  published history, force-pushing, deleting remote branches, discarding work (`reset --hard`,
  `checkout`/`restore` of the whole tree, `clean -f`), `--no-verify`, forbidden commit trailers,
  committing a credential, pushing onto a red trunk, breaking the delivery mode.
  Only the user can approve one, once, and only with a UI: a headless run refuses.
- **Soft gates** guard the defaults (`principles/DEFAULTS.md`): weakening tests, commit rationale,
  mixed commits, red-first, lint suppression, an unreviewed slice, a missing ADR. A soft gate is
  passed by recording a departure with `devsys_record_departure` (what, why, cost if wrong, how
  long it applies). Scope drift and the model for the phase are softer still: the system nudges or
  advises. A skipped planning artifact is recorded when the agent records it; `devsys_begin_work`
  lists the recommended ones that have neither a file nor a recorded skip, and does not block.
- **Guidance** covers everything else: skills and the phase guide, never enforced.

What the tiers do not cover, so you can decide what to trust:

- **Not every non-negotiable is a hard stop.** Rewriting history, force-pushing, `--no-verify`,
  trailers, a red trunk and the delivery mode are stopped by code. A false claim of "done" is
  checked by a Jev turn verifier that nudges (and only with Jev), an architecture decision without
  an ADR is a soft gate (also Jev), and an evidence check on model-visible text is a CI test.
- **The secret stop reads known formats, not every secret.** A commit that adds a private key, a
  GitHub, AWS, Stripe, Google, Slack, GitLab or npm token, a JSON web token, a password inside a URL,
  a quoted literal assigned to a `secret`/`token`/`password`/`api_key` name, or a file such as `.env`
  or `*.pem` is a hard stop (`commit.secret`) that the user can approve once, for a test fixture that
  merely looks like a credential. An `agent_spawn` task carrying one is refused outright, with no
  approval, because a task is text the agent writes and can reword. A secret in another shape passes.
  Only content the commit adds is read; an untracked file is read only when the command stages it,
  and only when it is a regular file under 200 KB (a larger one is still checked by name).
  The scan runs before the command does, so a file the same command creates, or a repository it
  initialises with `git init`, is not seen.
- **Reviewer effort is configured, not judged.** Review and lens subagents run at the `[review]`
  `thinking_level` (default `high`) on the `reviewer` and `lens` slots; it is not routed by risk.
  `devsys_route_task` routes the implementer, and the coordinator must pass its result on. A plain
  `agent_spawn` with no `model` gets the model of the agent type's slot when the project configured
  that slot in `[models]`, passing over models whose context window the task text would already
  crowd; an unconfigured slot leaves the agent type's own list in force.
- **Subagents run unguarded.** A child session is started without extensions, so none of the guards
  runs inside it. The coordinator commits, pushes and delivers; a subagent's prompt tells it not to,
  and the coordinator reviews what it produced.
- **The red-trunk stop needs `gh`.** It reads CI through an authenticated `gh`; where `gh` is missing
  or offline the trunk reads as unknown and the push is not stopped on that ground.
- **A departure is the agent's own call.** `devsys_record_departure` waives a soft gate (also with no
  UI) and is written to the decision log; it is never available for a hard stop.
- **Gating starts at `devsys_intake`.** With no slice open, the review and red-first gates are off.
- **Command shape is read, not run.** The git guards classify the command text: aliases and
  `git config` that redirect a later command, shells reading stdin, and `python -c` or `node -e`
  that mention git are all treated as unclassifiable, so the user decides (headless: refused). A
  command the classifier cannot see into at all (a script file, another tool) is not covered.
  Commit messages are checked again at push time against what the remote lacks, so a commit made by
  `-C`, `--fixup`, `commit-tree` or an alias cannot carry an AI trailer or skip the rationale; a push
  in the same call as such a commit is refused, because the commit does not exist yet when it is checked.
- **A push source the shell builds is checked loosely.** `git push origin "$(cat sha)":refs/heads/x`
  checks every local branch for AI trailers, not the unnamed commit the expression may name (one made
  with `commit-tree` and on no branch). The unclassified-command prompt is the only stop there.
- **A push after a ref moves in the same call is checked against the refs as they were.**
  `git merge --ff-only feature && git push origin main` publishes commits on `feature` that the
  push check read before the call ran. Make the merge, switch or reset in one call and push in the next.
- **Editing gate configuration is not guarded** (`biome.json`, hooks, CI files); review catches it.

## Decision log

Every departure and approval is appended to `docs/decisions/YYYY-MM.md` in the repository, so the
reasons survive compaction and are reviewable. Architecture-shaping decisions get an ADR in
`docs/adr/` (`devsys_adr_new`); product decisions go in the decision register that the
`product-planning` skill describes.

## Commands

All of them are shortcuts to tools; none is required.

| Command | Does |
| --- | --- |
| `/devsys-start` | Size the work and propose the artifacts it needs. |
| `/devsys-plan` | Plan a capability or product, then begin work once approved. |
| `/devsys-review` | Run a fresh-context review round. |
| `/devsys-lens-review` | Five product lenses review the brief. |
| `/devsys-adr` | Create the next ADR. |
| `/devsys-event-model` | Validate and render an event model. |
| `/devsys-models` | Write the model matrix for this machine (`--check` to verify). |
| `/devsys-ci` | Watch CI for the pushed commit. |
| `/devsys-status` | Phase, slice, review streak, departures and Jev status. |
| `/agents` | The vendored subagent manager. |

## Agents

Spawn with `agent_spawn`; `devsys_route_task` picks the model and thinking level. `advisor` gives
read-only decision support, `implementer`, `coder` and `tasker` build (one task record each),
`reviewer` reviews a diff in fresh context and submits through `devsys_submit_review`,
`researcher` reads and cites, `architect` and `writer` design and draft, and the five `lens-*`
agents (Cagan, Torres, Pichler, Perri, Rumelt) review a product brief.

## Changelog

`CHANGELOG.md` is generated from the commit history by `npm run changelog`. A release is the commit that
changes the version, so run it after that commit exists; the file lists what has been committed so far.

## Development

The development lockfile and compatibility regression suite target **pi 1.4.0**.
Host-provided pi packages remain wildcard peers, as pi's package contract requires;
that declaration is not a claim that every older or future host release is tested.
TypeBox follows the version supplied by the tested pi host rather than an independently
upgraded copy.

```sh
nix develop
npm ci
npm run typecheck
npm test
npm run lint
npm run lint:knip
npm run lint:md
```
