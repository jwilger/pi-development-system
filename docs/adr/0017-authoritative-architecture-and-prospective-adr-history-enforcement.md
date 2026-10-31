# ADR 0017: Authoritative architecture and prospective ADR history enforcement

- **Status:** proposed
- **Date:** 2026-10-29

## Context

The extension currently supplies session principles, planning tools, independent review tasks and Git command guards, but its architecture guidance primarily asks whether a decision record exists. That does not establish a self-contained current architecture, preserve merged decision history, or ensure that resulting delivery commits retain paired architecture updates. Consumers can otherwise mistake historical decisions or unverified plans for current requirements and verified delivery.

Existing projects already have merged records in varying formats. Rewriting those records or reconstructing old commits would destroy precisely the history this policy must preserve. pi extensions can block supported tool calls and return tool failures, but are not operating-system sandboxes: extension-internal process execution and external commands need not traverse those hooks.

## Decision

Use root `ARCHITECTURE.md` as the self-contained authority for current architecture and goals; distinguish goals from verified implementation. Do not put ADR backlinks, decision-source tables or delegated current requirements in it. ADRs preserve context, decisions, rejected alternatives with reasons, consequences and reconsideration conditions, rather than compete with current requirements.

Adopt the architecture/history policy prospectively at an explicit authoritative main/trunk history boundary. Validate the full pending delivery range and the intended resulting commits, not a caller-selected suffix or aggregate diff alone. Freeze records already merged at that boundary, preserve historical identities and fail closed on missing necessary history or unsafe paths. Never rewrite unsupported historical formats to make a check pass.

Require one new decision per commit and its corresponding substantive architecture update; require the same pairing for premerge decision edits. Permit merged-record changes only for status-only supersession linked to the newly added replacement decision. Preserve the replacement through delivery. Bootstrap sequentially, reviewing and committing each cumulative, self-contained decision/update pair before creating the next decision.

Separate three controls: shared model-facing instructions; deterministic structural/history checks at supported workflow and delivery boundaries; and independent semantic review of correspondence, authority, decision significance, rationale and reconsideration. A structural pass is not proof of substantive correspondence, and instructions are not action blocking. Extend the existing review rounds with architecture-specific evidence bound to adoption, authoritative trunk, HEAD, staged tree and complete ordered source/resulting units; retain explained checks, sources and host-owned reviewer origin. Legacy ordinary review does not confer architecture-semantic credit. Carry child runtime ownership and a distinct execution attempt through the inherited pi tool bridge using asynchronous execution-local storage, not model-supplied identity fields; this avoids concurrent submissions borrowing each other's identity without adding a separate review service or dependency. Restored child runtimes receive new attempt identities. Exact-binding approval and expected-reviewer validation must precede commit and delivery admission. Integrate through pi-native tool calls, request context and independent child preparation. Document ordinary paths outside those controls instead of claiming universal enforcement.

Consumers must explicitly approve prospective migration. Detection must not mutate consuming projects, rewrite merged records or change unrelated work. Delivery units must preserve the same rules after squash or merge.

## Consequences

### Positive

- Development and review have one self-contained architectural authority.
- Historical rationale remains available without becoming a competing specification.
- Mechanically decidable violations can be rejected while semantic judgments remain explicit independent evidence.
- Existing projects can adopt the policy without losing their historical record.

### Negative

- Delivery needs sufficient authoritative Git history and may fail closed when it is unavailable.
- Multiple significant decisions require separate reviewed delivery units.
- Deterministic checks cannot establish substantive correspondence or prevent execution outside supported extension boundaries.
- Historical formats may need human migration decisions rather than automatic repair.

## Alternatives

- **ADRs as current specifications, with architecture backlinks** — Rejected because routine development would have to reconstruct requirements from historical, potentially superseded decisions.
- **Prompt-only compliance** — Rejected because instructions cannot mechanically reject malformed commits or unsafe delivery shapes.
- **Structural checks alone** — Rejected because file presence and changed bytes do not prove substantive correspondence, decision significance or preserved rationale.
- **Retrospective normalization and automatic ADR rewriting** — Rejected because it destroys history, alters consuming projects without consent and imposes reconstruction unrelated to prospective compliance.
- **An external harness-specific hook system** — Rejected because supported consumers run through pi; enforcement must use its actual APIs and state its limits.

## Revisit when

Reconsider the integration boundary if pi supplies an authoritative commit/delivery transaction API covering process execution, or if real host evaluation demonstrates that the supported boundaries cannot safely determine resulting commits. Reconsider historical-format handling only with an explicit migration proposal that preserves original merged records. A rejected approach is not reopened merely because implementing the selected approach is inconvenient.
