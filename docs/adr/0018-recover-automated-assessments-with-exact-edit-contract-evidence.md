# ADR 0018: Recover automated assessments with exact-edit contract evidence

- **Status:** accepted
- **Date:** 2026-10-31

## Context

The normal test edit gate receives proposed file contents, recent failing output and recorded departures but not the approved product contract. The classifier and reasoning cascade reject unresolved motive before the gate can act on a resolved coverage judgment. All reasoning failures previously shared one kind and the hook exposed only prose. A caller could not supply the missing contract without inventing an authorization decision or changing an unrelated evidence channel.

## Decision

Retain assessment-unresolved as the outer fail-closed compatibility kind, with structured insufficient-evidence, invalid-output and infrastructure causes. Serialize a machine-readable recovery envelope alongside the hook's human diagnostic because the host hook accepts only a reason string. Introduce devsys_supply_test_contract to retain untrusted, redacted contract evidence for an exact workspace, slice, normalized test path and before/after content binding. It neither writes the test nor authorizes it; a subsequent normal edit reassesses all policy. Evidence is session-local and bounded; changed inputs require resubmission. Owner decisions remain separate departure/approval controls. Agent guidance directs finite evidence recovery before escalating concrete remaining external blockers, not uncertainty alone.

## Consequences

### Positive

- Recoverable uncertainty has an actionable path through the same gate, without granting permission.
- Invalid output and provider failure remain distinguishable while existing fail-closed consumers retain compatibility.

### Negative

- Session-local evidence must be resubmitted after reload and may be evicted from the bounded store.
- The extension cannot enforce an external goal plugin's lifecycle; model behavior requires an executable eval, not claims of universal compliance.
- Evidence remains model-supplied and does not establish that approval exists; assessments must treat it as untrusted context.

## Alternatives

- **Allow unresolved judgments** — Rejected because uncertainty is not permission and could hide genuine weakening.
- **Always ask the owner** — Rejected because classifier uncertainty does not create a product or policy decision.
- **Reuse departures as the only evidence channel** — Rejected because it conflates approved requirements with authorization to depart and cannot reliably repair unresolved assessment.
- **Persist unbound contract context** — Rejected because unrelated edits and restored sessions could inherit misleading evidence.
- **New outer error kinds for every cause** — Rejected for this repair because existing consumers explicitly fail closed on assessment-unresolved; changing that outer contract risks silent fallthrough.

## Revisit when

Reconsider serialization when the host provides structured hook errors. Reconsider session-local storage when multiple sessions need authenticated shared evidence and a defined lifetime. Reconsider the outer compatibility kind only with a complete consumer migration. A deterministic coverage-proof mechanism would justify reducing reliance on motive assessment; arbitrary low confidence would not.

## Related

Historical links to decisions, research or plan sections belong here, not in ARCHITECTURE.md. After merging into authoritative main/trunk, preserve this record unchanged except status-only supersession linked to a newly added replacement. Use a new decision and its paired architecture update for corrections. Add only one decision per resulting trunk commit; verify and independently review this decision and its cumulative architecture update before committing and introducing another.
