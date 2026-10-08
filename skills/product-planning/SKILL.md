---
name: product-planning
description: Plan a product or capability before building it - discovery interview, brief, decision register, follow-ups, terminology, journey inventory, lens review and ADRs. Use when sizing says capability or product, when asked for a brief or a discovery interview, when an answer must be recorded as a decision, or when a plan needs a product review.
---

# Product planning

Planning here finds out what is worth building. It is not a spec for code. The artifacts are a small set of
linked documents; each has one job and a template under `references/`.

| Artifact | Job | Template |
|---|---|---|
| Brief | The one narrative: outcome, customers, four risks, assumptions, scope, non-goals | [brief](references/brief.md) |
| Decision register | The spine: D (decisions), Q (questions), F (scheduling and exclusions) | [decisions](references/decisions.md) |
| Follow-ups | P items and R review findings: not lost, not now | [followups](references/followups.md) |
| Terminology | One meaning per word | [terminology](references/terminology.md) |
| Journeys | J items: a user, actions, an outcome | [journeys](references/journeys.md) |

Put them under `docs/product/` (`brief.md`, `decisions.md`, `followups.md`, `terminology.md`, `journeys.md`).
Copy a template only when the work needs that artifact: `capability` work gets a short brief and journeys,
`product` work gets the lot. Skipping one is a recorded departure (`artifact.skipped`).

## The interview loop

Quote this rule and follow it exactly:

> Update docs after each answer, ask one next question, yield.

1. Ask one question. Make it the most decision-relevant open Q item.
2. Stop. Wait for the answer. Do not ask a second question or guess ahead.
3. Record the answer as a D-item in the register, in the owner's words, and add a dated line to the interview log.
4. Edit the brief **only where the answered question touches it**. Bump its version. Nothing else changes.
5. Ask the next question and yield again.

Every answer becomes a D-item, including "no" and "not now" (a Deferred item with a revisit point).

## Do not over-edit the brief

The commonest failure is an agent that rewrites the brief between answers. It misframed the team, moved the
timing boundary, let later-phase ideas leak in and relocated the business case, and the owner had to find and
undo each one. So:

- An edit is limited to the answered question. If you notice something else that is wrong, add a Q item, do not fix it silently.
- Ideas for later go to follow-ups. Nothing speculative goes in the brief.
- Show the brief diff after each answer so the owner can see exactly what moved.
- The owner owns judgements about the domain; you own process and where things are filed.

## Outcome, risks, assumptions

- Open with an **outcome** (direction plus target), not a feature. State the problem to solve, not the solution to build.
- Assess the four risks (value, usability, feasibility, viability). "Unassessed" is a legal, recorded state.
- Write assumptions specifically; the smaller the assumption, the smaller the test. Test the riskiest first
  (critical to success, least evidence). Compare at least two solutions, and record why when you only had one.
- Say whether the work builds to learn (disposable, fewer gates) or builds to earn (full gates). That is a decision, never an inference.

## Deferral is not exclusion

Postponing the details of a capability does not remove it from scope. Only an explicit scope decision does.
A deferred item records who deferred it, why, the interim constraint and when to revisit. A non-goal is
something we decided not to do.

## Journeys

Cut the backlog from journeys, not features. A journey passes if it tells the story of a user performing a
set of actions to achieve an outcome. Decide journeys before generating tasks; feature-shaped backlogs had to
be thrown away and redone.

## Lens review

Run `devsys_lens_review` (or `/devsys-lens-review`) on the brief when the outcome, scope or risks are settled
enough to be wrong in an interesting way. Five fresh agents read it, each through one lens (Cagan, Torres,
Pichler, Perri, Rumelt). Round one is independent; round two is a peer exchange; you then synthesise an R table
and a one-question agenda, and the interview loop resumes. **Agreement among agents is useful critique, not
customer evidence.** Record rejected recommendations in the register instead of dropping them.

## Decisions that need an ADR

A decision about how the code is built that is hard to reverse (a boundary, a dependency, a data format, a
protocol) gets an ADR through `devsys_adr_new`. Product decisions stay in the register. Do not write an ADR
for something the register already holds, or the other way round.

## Status words

Everything produced here is "proposed" or "advisory" until a person approves a specific revision. Say
"readiness" for declared checks, "approval" for a person's decision on a named revision, and never let one
stand in for the other.
