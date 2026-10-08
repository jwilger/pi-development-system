---
description: Record a hard-to-reverse technical decision as the next numbered ADR
argument-hint: "<decision title>"
---
Record an architecture decision with the product-planning skill.

1. Call `devsys_adr_new` with the title: $ARGUMENTS. It creates `docs/adr/NNNN-<slug>.md` from the template and returns the path.
2. Fill in Context (the forces and the problem), Decision (stated plainly), Consequences (positive and negative), Alternatives (each with why it was rejected) and Revisit when (a concrete condition), then link related ADRs and plan sections.
3. Set the status to `accepted` only when the user has agreed; leave it `proposed` otherwise.
4. Report the path and a one-line summary of the decision.

Use an ADR for a boundary, dependency, data format or protocol that is hard to reverse. Product decisions belong in the decision register instead.
