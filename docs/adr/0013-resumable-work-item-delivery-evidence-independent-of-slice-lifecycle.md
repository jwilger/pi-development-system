# ADR 0013: Opt-in resumable delivery evidence, separate from local slices

- **Status:** accepted by the owner, revision 0.2; supersedes the unapproved local-ledger design
- **Date:** 2026-10-27

## Context

Local slice closure checks reviewed, clean, pushed work but does not observe PR merge.
An issue may span many slices/PRs. Neither a pushed branch, an open PR nor issue closure
proves the repository's definition of delivered. That definition belongs to the project;
PR mode alone does not authorize universal merge/check/ownership requirements.

## Proposed decision

Retain local slice closure and fix misleading delivery wording. It does not mutate issue
or Project state. Add one-shot PR observations/condition assessment through the existing
work-item tool; no unattended poller, implicit merge or closing-keyword inference.

Inputs identify repository/PR and assessed revision. Report pending, failed, blocked,
unknown and satisfied conditions distinctly. Current head checks, merge commit and base
are distinct evidence; old-head success and unavailable required checks cannot pass.
Condition assessment is not an assertion that every local completion requirement is met.

For optional resumability and enforcement, propose repository-owned version-controlled
per-item JSON manifests in a configured directory. Store issue identity, required PR
references and explicit manual requirements, not workflow status or cached success.
Author/edit them explicitly like other project files. Fresh sessions/machines read the
same references; read-only checks may alternatively accept explicit references without
persistence. No hidden user-state ledger or automated issue-comment ledger.

Propose optional `[delivery.evidence]` settings for required manifest, merge, target base
and named passing checks across required PRs. `complete` requires explicit full-scope
confirmation and fresh configured evidence, then closes the issue only. Route legacy
done and explicit lifecycle-close writes through that guard when configured. Do not
infer which Project option means completed or change it automatically. Raw Project field
mutation is not a delivered-work claim and is not an enforcement path for whole-issue
completion. External gh/UI/automation writes are outside this client guard.

Without this configuration, preserve explicit legacy closure but describe delivery as
unconfigured/not evaluated, not proven. Unsupported human/product/deployment/review
conditions remain visible manual/unsupported requirements needing owner resolution, not
silently satisfied checks. Server rulesets and existing forge tools retain signing,
merge eligibility/reviews and merge-strategy authority; CodeRabbit is not universal.

Malformed/missing required manifests, mismatched issue identity, escaped paths, conflicting
references or changes since assessment refuse completion. Re-read remote evidence before
a guarded close; expose uncertain API outcomes and safe reconciliation. No atomic
cross-resource/remote-human-policy guarantee. Multiple explicit operations can partially
succeed; recover from observations without rolling back human edits.

## Consequences

### Positive

- Local slice completion remains useful and no longer masquerades as issue delivery.
- Optional references survive sessions/machines and remain reviewable with the project.
- Mechanical guarantees are scoped to explicit supported conditions/actions.

### Negative

- Versioned manifests add metadata/commit churn and intentional scope maintenance.
- The declared PR set cannot prove that no omitted work remains; owner scope confirmation
  is a separate responsibility.
- Client observations have races; manual/unsupported conditions are not mechanically proven.

## Alternatives

- **Mandatory machine-local ledger** — Superseded: unnecessary hidden persistence/authority
  boundary and relinking limitation; not an approved requirement.
- **Session-only links** — Insufficient for resumability where explicit evidence is used.
- **Infer every PR from closing keywords** — Rejected: PRs need not close parent issues.
- **Always require merge or wait inside finish_slice** — Rejected: imposes delivery policy
  and conflates work items with local slices.
- **Automated remote comments/labels as a ledger** — Rejected for this increment:
  avoid new remote writes/duplicate authority when reviewed local references suffice.

## Revisit when

The owner rejects versioned manifest churn, evidence needs unsupported deployment/review
proof or a real pilot requires stronger coordination. Choose a different explicit
reference boundary before implementation, not an implicit second workflow ledger.

## Related

- [Revision 0.2 plan](../plan/existing-application-adoption.md)
- [Project primitives](0011-optional-project-workflow-authority-within-the-existing-tracker.md)
