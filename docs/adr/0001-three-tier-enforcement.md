# ADR 0001: Three-tier enforcement (hard / soft / advisory)

- **Status:** accepted
- **Date:** 2026-10-06

## Context

The predecessor system enforced everything fail-closed (per-edit ledgers,
PreToolUse denial). ADR-0003 there records the regret: normal work failed when
state drifted. Pure advisory text, conversely, is "a write-only channel"
(research 05 B4). Evidence says a hard policy with a sanctioned escape hatch
works best, and an escalation channel cuts covert gaming (23.6% to 5.3%).

## Decision

Three tiers. **Hard stop**: irreversible git/history operations and departure
from any non-negotiable require the author's explicit approval. **Soft gate**:
the agent may depart from a default only by recording what/why/cost-if-wrong.
**Advisory**: skills and prompts guide without blocking.

## Consequences

### Positive

- Departures are never silent; the decision log is the product.
- Normal work is not blocked by drifting state.

### Negative

- Soft gates rely on the agent recording honestly; mitigated by Jev checks.

## Alternatives

- **All fail-closed** — Rejected because ADR-0003 (predecessor) showed it fails normal work.
- **All advisory** — Rejected because advisory text is not durable authority.

## Revisit when

Soft-gate departures are routinely recorded without real justification.

## Related

`docs/research/00-synthesis.md` D1, D2, D8.
