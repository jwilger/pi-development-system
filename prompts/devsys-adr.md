---
description: Record a hard-to-reverse technical decision as the next numbered ADR
argument-hint: "<decision title>"
---
Record an architecture decision with the product-planning skill.

1. Read `ARCHITECTURE.md` for current architecture and goals. Consult historical decisions for rationale or reconsideration; do not retry rejected ideas without a material context change. Resolve authoritative main/trunk and prospective adoption before changing historical records. Preserve existing history; stop and ask if authority or necessary history is unavailable.
2. Call `devsys_adr_new` with the title: $ARGUMENTS. It creates `docs/adr/NNNN-<slug>.md` from the template and returns the path. Do not start another decision before this one is verified, independently reviewed and committed with its architecture update.
3. Fill in Context (the forces and the problem), Decision (stated plainly), Consequences (positive and negative), Alternatives (each with why it was rejected) and Revisit when (a concrete condition). Historical links may live here, never as backlinks or delegated requirements in `ARCHITECTURE.md`.
4. Update `ARCHITECTURE.md` substantively to express the corresponding current requirements and goals self-contained, distinguishing intent from verified implementation and delivery. Set ADR status to `accepted` only when the user agrees; otherwise leave it `proposed`.
5. Verify and obtain independent semantic review of correspondence, self-contained authority, decision significance, preserved rationale and justified reconsideration. Commit exactly one new ADR with its cumulative architecture update. Every premerge ADR edit also requires its corresponding substantive architecture update in the same commit. Other ADR edits in an addition commit are limited to status-only supersession linked to this new decision.
6. Preserve merged records unchanged except that status-only supersession; never correct, delete or rename them. Replace mistakes through a new paired decision. Check resulting main/trunk commits, including squash results: separate delivery units rather than combining new decisions or dropping required updates. Report paths, evidence and remaining gaps without implying instructions alone mechanically enforce this policy.

Use an ADR for a boundary, dependency, data format or protocol that is hard to reverse. Product decisions belong in the decision register instead.
