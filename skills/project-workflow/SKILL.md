---
name: project-workflow
description: Define a repository-owned development workflow, discover one in an existing application, or maintain it when evidence drifts. Use when adopting devsys, replacing an old delivery factory, reconciling policy with automation, or deciding which local workflow guidance agents should receive.
---

# Project-owned workflow

The repository owner owns operational policy. Devsys supplies reusable primitives,
verification and hard stops, not a universal queue or delivery factory. Discover or
agree the local workflow before translating it into configuration. Do not recreate an
old orchestrator station-for-station.

## Choose the path

- **Define:** little workflow exists. Ask the owner which outcome, actors, delivery
  constraints and verification commands matter; propose the smallest local policy.
- **Discover:** an existing application has policy, history or a prior factory. Begin
  read-only. Separate policy from current automation and historical accident.
- **Maintain:** an agreed workflow already exists. Compare changed sources with the
  approved policy and explain drift. Ask before changing its meaning or integrations.

A request to inspect, plan or adopt is not permission to change a board, issue, label,
repository setting or operational policy. Keep proposals separate from their execution.
An unanswered owner question never grants approval.

## Survey before prescribing

Read the available version-controlled entry points and relevant references. Inventory:

- Product/domain rules, acceptance criteria, ADRs and existing work descriptions.
- AGENTS.md, workflow/review guidance and legacy factory instructions.
- Local configuration, issue tracker and any optional Project integration.
- Tooling, command definitions, CI, tests, mutation policy and runtime prerequisites.
- Commit/signing requirements, branch/PR rules, reviews, merge and delivery evidence.
- Ownership/selection, priority/ordering, blocked work and how work is resumed.

Inspect only authorized repositories and resources. Use read-only forge operations
when needed and permitted. Do not provision anything during discovery. A missing or
permission-denied source is an evidence gap, not proof of an empty repository, queue or
board. State what is unavailable, why it matters and what access or evidence would help.
For an actual access failure, ask the owner explicitly for read access, an export or a
scope decision; merely writing "unknown" or saying you will ask later is not escalation.
Cite the inaccessible source in the question. Do not retry a denied write or provision
credentials, labels or a board.

Do not treat an old factory document as unquestionably current, or infer a new policy
from the absence of one. Current labels, states, directory layouts and station names
may be accidental; preserve durable work and history rather than their vocabulary.

## Distinguish evidence

For each material finding, cite its actual path or durable evidence reference and say
which kind it is:

- **Documented intent:** written policy, domain rules, owner decisions and comments.
- **Configured behavior:** what code, scripts, CI or settings would do. Configuration
  and comments are not proof that anything was executed or successfully delivered.
- **Executed behavior:** an observed command result, dated run, merged PR or other
  actual outcome. Give the revision/context; do not claim a run you did not observe.
- **Inference:** an interpretation supported by cited evidence, not established fact.
- **Unknown:** uninspected/unavailable evidence or an unresolved decision. Distinguish
  access failures, absent configuration and unknown runtime outcomes.

Quote source evidence verbatim when supplying a quotation. Put paraphrases and
interpretations in separately labelled explanation, not a quotation field. Never
upgrade configured verification into a claim that tests passed. If a discovery-report
interface is available, use it to retain these distinctions and evidence references;
otherwise provide the same report to the owner in prose.

## Resolve contradictions with the owner

Compare intent, configuration and observed outcomes. Report each contradiction with
both sources, its practical consequence and the smallest owner question needed to
resolve it. Examples include factory-only edit restrictions versus newer practices,
CI versus documented verification commands, and branch push versus required PR merge.
Do not silently select a winner or invent a replacement autonomy or state policy.

Ask the owner before operational recommendations that depend on an unresolved choice.
Record questions and pending answers explicitly; retain the current authority boundary
until the owner decides. Coherent evidence is not a contradiction: do not manufacture
conflicts or demand a policy replacement merely because devsys is being adopted.
Distinguish decisions needed now from approval that would be needed to enact a future
proposal. A read-only inventory can finish under coherent existing authority with no
owner decision required for that inventory, even while it lists uninspected topics and
future implementation approvals. Do not mark every future adoption question as blocking
the current inventory. Mark a current owner decision pending for a concrete conflict,
an access failure requiring owner help, or a requested operational change whose authority
is unresolved. Inaccessible evidence stays unknown until supplied or inspected.

## Propose discoverable local artifacts

After surveying, propose version-controlled **locations and purposes**, not silently
applied operational changes. Reuse existing authoritative documents where practical:

- A repository workflow document: agreed actors, selection/claiming/ownership, local
  states, blocked work, verification, delivery conditions and resumption procedure.
- Optional repository review guidance: local concerns and evidence expectations,
  supplementing devsys review without replacing typed submissions or clean rounds.
- A short AGENTS.md pointer to those sources, not another independently maintained
  copy of policy.
- The repository's `.development-system.toml` integration configuration, explicitly
  pointing `[workflow] guidance` and, when supported, `[review] guidance` at the agreed
  tracked sources. Suggest its location even when integrations are not yet decided;
  leave operational values unresolved rather than inventing them.

These are local artifact roles, not mandated paths or a universal workflow template.
Existing authoritative files may serve them. New proposals are not operational
instructions until reviewed, approved and versioned. After approval, explicitly stage
and deliver files according to repository policy; configured guidance must be tracked
before devsys can load it. Never bypass a missing/unreadable guidance error by dropping
configuration or relaxing a hard stop.

## Translate only approved decisions

Keep issue lifecycle, optional Project workflow, local slice/review phase, push and PR
merge/delivery separate. One issue can span several slices and PRs. A pushed branch or
opened PR is not proof that an issue is delivered. State which actor/authority owns
selection and priority, what explicit claiming means and which observations authorize
completion. Do not supply canonical state names where the repository has not chosen.

Before applying any integration, explain permissions, exact intended mutations,
recovery after partial failure and how to inspect the resulting state. Provisioning,
membership/status changes and migrations require explicit authorization; no implicit
labels, board schemas, queue reordering or issue closeout. References to tools that are
not installed/supported are proposals, not claims of enforcement.

Offer a bounded one-issue pilot with explicit selection, authorized operations,
verification, delivery evidence and a way to stop/resume. Keep project-specific review
rubrics, autonomy choices, metrics and historical factory formats local. No scheduler,
continuous worker loop, station framework or workflow DSL is needed.

For maintenance, update the same authoritative sources with the owner's decisions,
retain rationale and recheck configured guidance transport. Loader transport establishes
what agents received; it does not prove consistent policy, agent obedience or external
agent control. Report any guarantee that is guidance rather than enforcement.
