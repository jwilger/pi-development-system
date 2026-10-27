# ADR 0012: Explicit local workflow and review guidance snapshots

- **Status:** accepted by the owner, revision 0.2; extends the unapproved review-only proposal
- **Date:** 2026-10-27

## Context

Fresh-context reviewers receive generated tasks and typed submission instructions, but
current review config has no explicit repository guidance input. Parent conversation or
ambient AGENTS.md discovery does not guarantee local concerns reach independent agents.
Project-owned operational workflow also needs a reliable version-controlled entry point.

## Proposed decision

Add optional `[workflow] guidance` and `[review] guidance` path arrays. The former points
to repository-owned operational instructions, the latter to supplementary review concerns.
AGENTS.md links to those sources rather than copying policy. Prose owns workflow meaning;
only narrow integration/evidence settings are parsed. No transition/runner DSL.

Use one shared loader: tracked regular UTF-8 files, repository containment after realpath,
explicitly listed references only, proposed 32 KiB/file and 64 KiB combined budget with
no truncation. Working-tree edits to tracked files count in the content identity; new
untracked proposals must become versioned before being treated as operational authority.
Missing/escaping/oversized configured inputs block affected preparation with a repair
message. No config retains legacy behavior while explicitly reporting operational policy
as unconfigured where needed. Missing policy never silently supplies a queue convention.

Refresh root context at the next agent turn. Include actual snapshots, paths and hashes
in devsys-created relevant fresh planner/implementer/reviewer tasks, including independent
roots and reviewer fallback payloads. Resumed tasks receive changed guidance before
proceeding. Do not claim control of unrelated agents or raw shell execution.

Bind review identity to diff and configured guidance paths/content. A change before
record/commit requires fresh rounds under the new identity. Preserve typed submission,
severity/verdict consistency, diff checks, clean-round rules and existing fallback.
Local concerns supplement existing lenses; no per-concern reviewer requirement or
application-specific defaults.

Skills teach evidence-backed discovery, owner decisions, reviewable local artifacts and
explicit migration/pilot steps. They distinguish intent/observation/inference/unknowns.
Semantic conflicts are surfaced by agents and resolved by the owner, not proven absent
by the loader. Contrary guidance cannot authorize overriding devsys hard stops.

## Consequences

### Positive

- Local workflow and concerns reach fresh agents without becoming universal defaults.
- Review input identity cannot silently change beneath a clean-round claim.
- One bounded loading contract, with discoverable versioned ownership.

### Negative

- Integration must cover root, fresh and resumed contexts, not just prompt helpers.
- Reading a document proves transport, not instruction effectiveness or consistency.
- Bounds/version-control requirement may require owners to shorten or reorganize inputs.

## Alternatives

- **Rely solely on ambient AGENTS.md** — Useful pointer, insufficient transport guarantee.
- **Only review guidance** — Insufficient after the clarified project-owned workflow goal.
- **Parse prose into transitions or hardcode downstream lenses** — Rejected as policy
  invention and unnecessary workflow machinery.
- **Path-only handoff** — Insufficient evidence that independent fresh agents saw content.

## Revisit when

Real repositories exceed the bounded context budget or cannot use these explicit pointers.
Effect evals must demonstrate actual discovery/local-guidance use before shipping skills;
input transport tests alone do not establish that behavior.

## Related

- [Revision 0.2 plan](../plan/existing-application-adoption.md)
- [Typed review submission](0006-structured-reviewer-results-through-a-typed-submit-tool.md)
