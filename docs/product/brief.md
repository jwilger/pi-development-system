# Brief: Repository-owned workflow adoption

- **Context:** Reusable devsys primitives/skills for adopting existing repositories.
- **Status:** v0.2 · proposed · 2026-10-27; supersedes unapproved v0.1 policy choices.
- **Not an authorization:** implementation requires explicit approval of plan revision 0.2.

## Outcome

An owner can discover or define the project's workflow and safely resume one existing
issue with devsys, preserving history, local verification/review and truthful delivery.
The upstream release succeeds when two materially different local workflows work with
the same primitives and a bounded one-issue pilot is documented with offline evidence.
No downstream setup or pilot is executed under this request.

## Customers and evidence

The requesting owner has an existing Elixir/Phoenix application managed by a Claude
factory and clarified that operational workflow belongs to the project, not upstream.
Read-only application rules and factory configuration corroborate local constraints;
current upstream code confirms the Project, explicit-guidance and Elixir gaps. The
factory-builder survey/owner-charter pattern informs discovery, not a station port.
See the [revised source-based plan](../plan/existing-application-adoption.md).
This is owner-requested capability work, not independent market evidence.

## Four risks

| Risk | Potential failure | Evidence / cheapest test |
| --- | --- | --- |
| Value | Replace the factory with another mandatory upstream workflow | Two contrasting local workflows; owner approves the ownership boundary |
| Usability | Agents invent policy from accidental board/config state | Conflicting legacy fixture: distinguish intent/observation and ask the owner |
| Feasibility | Overpromise completion, context transport or atomic claims | Fresh-agent effect evals and adverse public-interface evidence tests |
| Viability | Break hard stops or downstream delivery policy | Existing regression/gates; explicit local adoption blockers and enforcement limits |

## Assumptions and falsification

**Highest risk:** operational policy can remain local while reusable tools stay useful
and honest about what they enforce. Before release, exercise the two plan examples:
PR-delivered product work with explicit evidence guards, and human-led research with no
claim/merge prerequisite. Any invented universal ready state, self-assignment, auto-close,
priority convention or merge requirement disproves the boundary as implemented.

A separate high-risk test covers false completion: recreate tools across sessions using
two explicit PR references, one open/one merged, then change heads/remove checks/deny
access. No incomplete or unknown required condition may produce a guarded close. The
explicit versioned manifest is a proposed implementation choice, not an accepted premise.
Owner scope confirmation cannot mechanically prove the reference set is exhaustive.

Other assumptions requiring evidence:

- Explicit snapshots help fresh agents follow local policy: effect evals with defects,
  harmless controls, changed/missing guidance and attempted gate overrides.
- Discovery can identify contradictions without rewriting policy: evidence-backed owner
  escalation on representative fixtures, including inaccessible board configuration.
- Elixir profile advice can respect local commands/idioms without dependencies imposed:
  actual model decision fixtures, not Markdown string checks.

Owner approval is design authority, not evidence of usability, customer adoption or
model effectiveness. No downstream adoption has been observed in this goal.

## Scope and non-goals

Optional Project primitives inside the tracker; workflow-discovery skill and explicit
local-guidance transport; repository review concerns; Elixir/Phoenix profile; one-shot
PR evidence and opt-in narrow completion enforcement distinct from local slice closure.
Preserve Issues-only/repo-file tracking and existing engineering hard stops. Build to
full verification/release standards, not as a disposable prototype.

No downstream edits/GitHub mutations, factory port, scheduler, continuous worker, stall
framework, general workflow DSL or generic CI service. Exact states, ordering, claiming,
manual acceptance, rubrics, autonomy and factory-specific conventions remain local.

## Approval checkpoint

Approve/revise plan revision 0.2 and proposed ADRs 0011–0013, including local-guidance
transport, optional tracker capabilities, explicit enforcement boundary and optional
version-controlled PR-reference manifests. The earlier mandatory five-state queue,
self-claim/merge policy and local ledger are superseded, not tacitly approved.

## Journeys and supporting records

See [journeys](journeys.md), [decisions](decisions.md), [follow-ups](follow-ups.md),
[terminology](terminology.md) and the [implementation proposal](../plan/existing-application-adoption.md).
The prior [lens synthesis](reviews/2026-10-27-synthesis.md) reviewed revision 0.1; it is
historical critique, not approval or validation of this materially revised design.
