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
front, such as in a goal's planning, is passed as `size` and skips the sizing question entirely (a `fix` still asks whether to waive review).

With `codemode` enabled (`"defaultTools": ["+codemode"]` in pi settings), rarely used tools are
reached through scripts and the `judge_*` Jev wrappers exist for scripts only; without codemode
the rarely used tools are declared directly and the wrappers are absent.

## Configuration

`.development-system.toml` at the repository root (version 1). Every key is optional; an unknown
key is an error that names it. `/devsys-models` writes the `[models]` table for the models this
machine can use.

| Table | Keys | Meaning |
| --- | --- | --- |
| `[delivery]` | `mode` (`trunk`, `pull-request`, `local-only`), `trunk`, `remote` | Where work lands; the push guard follows it. `local-only` blocks every push. |
| `[review]` | `required_clean_rounds` (3), `min_rounds` (1) | The clean streak a slice needs before commit. |
| `[tracker]` | `kind` (`repo-files`, `github`; `jira` and `linear` are not implemented), `repo` | Backlog for `devsys_work_item`. |
| `[profiles]` | `override` | Languages to apply (`rust`, `typescript`); empty means detect. |
| `[models]` | one ordered candidate list per slot | See Model tiers below. |
| `[routing]` | `"<difficulty>/<risk>" = ["<slot>", "<thinking level>"]` | What `devsys_route_task` recommends for a subagent. |
| `[verifier]` | `max_per_session` (6) | Cap on Jev checks of the agent's own claims. |
| `[cadence]` | `push_minutes` (60) | Minutes without a push before the cadence nudge. |
| `[event_model]` | `provider` (`builtin`) | Another provider replaces the builtin validator. |

## Model tiers

Models are asked for by slot, never by id. Three capability tiers (`frontier`, `strong`, `fast`)
and role slots built on them (`planning`, `advisor`, `implementer`, `reviewer`, `lens`,
`researcher`, `jev`). A slot is an ordered list of candidates: `provider/id`, a family pattern
such as `provider/gpt-*-sol` (the newest available id wins) or a slot reference such as `@strong`.
The first candidate this machine has credentials for is used, so one committed file works across
accounts. Pin an exact id to stop it rolling forward. `devsys_models` shows what each slot
resolves to, and the system recommends a model for a phase but never switches yours.

## Enforcement tiers

- **Hard stops** fire for the non-negotiables (`principles/NON-NEGOTIABLES.md`): rewriting
  published history, force-pushing, deleting remote branches, discarding work with `reset --hard`,
  `--no-verify`, forbidden commit trailers, pushing onto a red trunk, breaking the delivery mode.
  Only the user can approve one, once, and only with a UI: a headless run refuses.
- **Soft gates** guard the defaults (`principles/DEFAULTS.md`): weakening tests, commit rationale,
  mixed commits, red-first, lint suppression, an unreviewed slice, a missing ADR. A soft gate is
  passed by recording a departure with `devsys_record_departure` (what, why, cost if wrong, how
  long it applies). Scope drift, the model for the phase and a skipped planning artifact are
  softer still: the system nudges or advises, and a skipped artifact is recorded when the agent
  records it, not detected.
- **Guidance** covers everything else: skills and the phase guide, never enforced.

What the tiers do not cover, so you can decide what to trust:

- **Not every non-negotiable is a hard stop.** Rewriting history, force-pushing, `--no-verify`,
  trailers, a red trunk and the delivery mode are stopped by code. A false claim of "done" is
  checked by a Jev turn verifier that nudges (and only with Jev), an architecture decision without
  an ADR is a soft gate (also Jev), and an evidence check on model-visible text is a CI test.
- **Secrets are not scanned for.** Nothing stops `git add .env && git commit`. Secrets are redacted
  from the decision log and from what Jev sees, not from commits or subagent prompts.
- **Some work-discarding commands are not stopped.** `git checkout -- .`, `git restore .` and
  `git clean -fd` throw away uncommitted work like `reset --hard` does, but are classed ordinary.
- **Reviewer effort is fixed.** Review and lens subagents run at `high` thinking on the `reviewer`
  and `lens` slots; `devsys_route_task` routes the implementer, and the coordinator must pass its
  result on to `agent_spawn`. A plain `agent_spawn` with no `model` uses the agent type's own list,
  not the `[models]` matrix.
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

```sh
nix develop
```
