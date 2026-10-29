# A bounded Simulac adoption pilot

This is an upstream recipe, not a report of work in Simulac. No Simulac code,
forge metadata, migrations, shell commands, tests, CI, or browser checks have
been executed here. The examples and effect runs are synthetic: **NOT
EXECUTED** against any downstream repository.

## Inspect before choosing policy

With the owner's permission, inspect the existing application and its versioned
workflow/review sources read-only. Identify the real tracker, current issue
labels, Project metadata, assignment conventions, delivery mode, authoritative
Elixir commands, and existing libraries. Do not import a factory workflow,
scheduler, schema provisioning service, new DSL, metrics mandate, or review
rubric. Owner choices, not the upstream examples, define acceptance.

Ask the owner to choose authoritative, versioned local workflow and review
sources, and track the selected guidance files. Keep references resumable by
path and version; do not treat a pasted mutable board description as a durable
contract. Review instructions should name the actual changed inputs, unresolved
questions, and a fresh independent reviewer context, rather than merely reusing
the implementer's conclusions. A clean local review is not delivery approval.

For an existing Elixir application, retain its own idiomatic gates: owner-chosen
format, compile/warnings, ExUnit, static-analysis, and Phoenix/UI checks where
applicable. Discover exact commands and versions from that app. Prefer existing
libraries and conventions; ask before adding dependencies. Do not claim any gate
passed without executing it and inspecting the result. Browser verification, if
required by local policy, needs an actual render rather than markup inspection.

## Choose the smallest compatible tracker surface

GitHub Issues-only use does not require a Project. Repository-file tracking is
also a valid local choice. If a Project is used, inspect its raw field IDs,
option IDs/types, membership, repository access, and token permissions first.
Single-select workflow values need not describe the issue lifecycle. Preserve
unrelated number, date, and text fields. Listing order is an observation, not a
ranked work queue. Assignment may be nonexclusive; no universal claim rule is
introduced by this recipe.

Before label, membership, workflow-field, permission, or other metadata
migrations, obtain explicit owner authorization, enumerate affected entities and
existing values, establish a recovery plan, and apply only separately approved
changes. Reading examples does not authorize enrollment or migration. Permission
failures and unknown fields are blockers, not a reason to silently invent a
schema or widen access.

## Distinguish three outcomes

1. **Local context:** the reviewed, clean local slice can finish. In nonlocal
   modes the public finish operation also checks pushed commits. This says
   nothing about all PRs, checks, Project terminal state, or whole-issue scope.
2. **Configured delivery evidence:** an owner may opt into tracked, versioned
   per-issue manifests referencing all required PRs. Choose only supported merge,
   branch-base, and current-head check conditions; manual requirements remain
   unknown until there is supported evidence. Persist references, not a cached
   green conclusion. One merged PR does not satisfy two required PRs.
3. **Whole issue:** separately ask the owner whether all intended scope has been
   covered. Only explicit confirmation and fresh configured evidence justify a
   separate public completion request. No local finish automatically closes an
   issue or sets a terminal Project field. Without an evidence policy, report
   delivery **unassessed**, not a universal PR blocker or an invented success.

See [product policy](../examples/product-pr/workflow.md),
[product configuration](../examples/product-pr/development-system.toml), and
[versioned two-PR reference](../examples/product-pr/7.json). Compare the same
public code with [research policy](../examples/research-local/workflow.md) and
[local-only configuration](../examples/research-local/development-system.toml).
These are contrasting owner choices, not required upstream defaults.

## One issue, explicit authority, recoverable stop

Start with one owner-selected issue and one bounded increment. Record the
selected issue, human scope, authoritative source versions, allowed reads and
writes, review inputs, gate commands, expected delivery evidence, and owner
escalation contact. Do not take an API-first item as permission or priority.
Keep external mutations disabled until each has explicit authority; a synthetic
model report never supplies that authority.

The integrated public operations are:

- `devsys_work_item {action:"get",id:"7"}` for the explicitly selected product
  issue, and `devsys_work_item {action:"project-items"}` for raw Project
  observations where a Project is configured. `inspect` exposes metadata; none
  of these reads selects priority or grants assignment authority.
- `devsys_finish_slice {}` for local context only, after actual local gates.
- `devsys_work_item {action:"delivery-check",id:"7"}` to resolve tracked policy,
  manifest, and fresh configured evidence. In id mode, caller conditions cannot
  override repository conditions. Raw `refs`/`conditions` requests are explicit
  caller-request assessments, not a substitute for the configured policy.
- `devsys_work_item {action:"complete",id:"7",scopeConfirmed:true}` is a separate
  whole-issue operation, **not authorized in either synthetic example**. It
  requires explicit human-confirmed full scope and freshly re-evaluated
  configured evidence. Do not try legacy `update` with `status:"done"` to bypass
  configured checks or introduce partial writes.

Use the real tracked workflow loader, not a replacement workflow engine.
Re-read configured evidence before proposing completion; a replayed manifest is
a resumable reference, not fresh CI or merge proof. Research names issue 14,
uses local-only mode without a delivery-evidence policy, and needs the owner's
scope answer rather than a fabricated PR reference.

On unknown evidence, missing permission, unsupported/manual requirements,
timeout, changed head/base/policy, or unavailable owner, stop the corresponding
claim. Preserve the failed observations and exact commands, report what remains
incomplete, and ask the owner for the concrete missing decision or access. Do
not retry into a success claim, force mutations, infer consent from silence, or
silently switch delivery modes. Resume with fresh evidence and fresh review if
the inputs changed. Raw external writes can bypass an instruction-level policy;
the public guarded completion path is not a universal forge enforcement wall.

## Evidence limits

The HFX evaluator runs the actual public work-item and local-finish tools in
isolated SDK sessions and uses the actual loader on tracked temporary files.
Only outside-world Git/forge results are synthetic. Model tools cannot execute
shell, CI, Mix, browser, pushes, GitHub writes, or downstream changes. Offline
controls prove the assessor rejects fabricated success and unauthorized calls;
live cells are finite observations, not a statistical uplift claim. A passing
baseline is acceptable. No downstream adoption or verification is implied.
