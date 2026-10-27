# ADR 0011: Optional Project primitives within the existing tracker

- **Status:** accepted by the owner, revision 0.2; supersedes the unapproved five-state proposal
- **Date:** 2026-10-27

## Context

`Tracker` currently exposes list/get/create/update/comment with a legacy status combining
issue lifecycle and an in-progress label. Projects add membership and independently
configurable fields; they do not justify a universal devsys operational workflow.
A work item can span multiple local execution/review slices and PRs.

The owner clarified that upstream supplies safe primitives and skills while repositories
own selection, priority, ownership, blocking and completion conventions. Local policy
cannot override devsys engineering hard stops.

## Proposed decision

Add optional advertised GitHub capabilities to the existing tracker boundary and expose
them through `devsys_work_item`. Preserve existing CRUD and non-Project backends.
Expose Project identity, field/option metadata, membership, paginated issue observations
and explicit enrollment, single-select set/clear and native assignment operations.
Comments and issue lifecycle remain separate explicit operations.

Do not define canonical workflow roles, option names, transitions, claimant identity or
priority. Local instructions choose how to compose operations. One Project field may
own a repository's workflow; do not mirror it into labels or a local state ledger.
Issues remain authoritative for descriptions/open-closed lifecycle. Raw field facts and
issue lifecycle are distinct. Legacy status is labeled a compatibility projection;
ambiguous in-progress writes in Project mode refuse with explicit-operation advice.

Use explicit node/field/option IDs, with human-readable metadata for confirmation.
Validate ownership/type before mutations. No ordinary operation creates labels, edits
schema, auto-enrolls, unarchives or repairs policy. Issues-only missing-label setup is
explicit too. No Project configured means no Project API calls. Initial mutations are
single-select only; unsupported types/actions are reported, not guessed.

Read complete connections or return incomplete/unknown diagnostics; surface archived,
redacted, foreign and non-issue content. Item API order is observation, not UI saved-view
priority. Callers explicitly choose filters; local instructions choose selection. No
automatic assignment, pick-next, reorder or scheduler. Native assignment and field
mutations are not atomic reservations, even with before/after observations.

Return confirmed effects, uncertain outcomes and safe re-read/retry guidance. Do not
undo intervening human changes or promise cross-resource transactions. A partial local
claiming sequence remains a repository-level recovery decision, not a hidden tool loop.

## Consequences

### Positive

- Coherent tracker entry point with optional capabilities, not a parallel tool family.
- Different repositories can use different boards and operational workflows.
- No duplicate authoritative workflow or implicit provisioning.

### Negative

- Legacy status needs an explicit compatibility/enforcement boundary in Project mode.
- Repositories must document their composition/authority rather than inheriting a queue.
- No atomic claiming, arbitrary field-schema editor or saved-view sorting replication.

## Alternatives

- **Five mandatory workflow roles and self-claim** — Superseded: mistakes local policy
  for a reusable integration contract.
- **Mirror Project state into labels** — Rejected: two independently writable authorities.
- **Separate Projects tool family or general workflow engine** — Rejected: fragments
  work-item behavior or exceeds scope.
- **Only raw gh guidance** — Insufficient for typed identity, completeness and recovery
  contracts that ordinary offline tests can verify.

## Revisit when

A real adoption needs atomic ownership, deterministic saved-view ranking or additional
field mutations. Propose the missing primitive explicitly rather than extending prose
into an executable workflow DSL.

## Related

- [Revision 0.2 plan](../plan/existing-application-adoption.md)
- [Local guidance](0012-snapshot-repository-review-guidance-into-fresh-reviewer-tasks.md)
- [Delivery evidence](0013-resumable-work-item-delivery-evidence-independent-of-slice-lifecycle.md)
