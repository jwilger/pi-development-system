# ADR 0014: Bounded readiness and proportionate independent review

- Status: accepted
- Decision: owner approved this bounded policy replacement on 2026-10-29.

## Context

Task readiness clipped interfaces and steps, returned boolean section flags, and
instructed authors to rewrite until ready. A second prompt explicitly repeated
that loop. Test counts prescribed decomposition regardless of delivery overhead.
Three consecutive clean reviews were the default, including tiny changes. Cadence
only knew time since a previous push, yet suggested automatic splitting.

Delegation already permitted direct implementation; it was not a mandatory gate.
The actual correction is to remove contradictory loop instructions and connect
parallelism to usable delivery rather than introduce another planning framework.

## Decision

Structural task errors remain deterministic and actionable. Subjective readiness
is advisory; boolean flags cannot identify a concrete missing decision. Supply
complete redacted task context up to 32 KiB; beyond it, skip classification visibly
instead of silently clipping. No threshold reduction, favorable-result retries or
requirement to obtain `ready`. Missing public decisions still require one precise
question. A record aids a handoff, not indefinite specification refinement.

One substantive fresh-context clean review of the current diff is the default.
Real findings require fixes and review of those fixes. Existing digest, severity,
submission and departure safeguards remain. Explicit stronger settings remain
supported. A review already started keeps at least its recorded requirement even
if configuration or defaults subsequently decrease. Risk changes review depth and
expertise; extra rounds need a concrete unresolved risk, not an arbitrary streak.

Choose one usable increment, test first, implement directly with sufficient
context, verify, independently review and deliver. Split only at independently
deliverable integration boundaries after accounting for overhead. After two
process-only attempts without new implementation or acceptance evidence, simplify
to the next behavioral test or escalate one concrete blocker. This instruction is
model guidance, not a new activity-monitoring/enforcement subsystem. The elapsed
push timer asks for that diagnosis; it does not claim to detect planning activity.

## Consequences and safeguards

Tests that assumed an implicit three-round default now test one-round completion;
legacy multi-round scenarios explicitly configure three rounds. The fixture that
required internal signatures is replaced by an unresolved public error contract;
a multi-test single-capability control is added. Independent review, real-finding
resolution, stale-diff coverage, red-first, secrets protection, destructive-action
approvals, truthful evidence, delivery mode and verification-integrity gates are
not waived. This change does not finish or resume workflow adoption.

Synthetic tool-effect evaluation supplements unit tests; it observes action
selection rather than asserting Markdown phrases. It is not proof that a model
implemented real code or obeys every policy in production. See the bounded-flow
evidence for controls, identities and limitations.
