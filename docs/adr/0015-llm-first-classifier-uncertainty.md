# ADR 0015: LLM-first classifier uncertainty

- **Status:** accepted
- **Date:** 2026-10-30

## Context

Jev is a fast semantic classifier, not an authority on requirements. Consumers currently sometimes turn missing or ambiguous judgments into human interruptions. A legitimate correction to invented test padding triggered this behavior despite preserving the intended assertions. All consumers need a consistent uncertainty policy without relaxing actual approvals.

## Decision

Compose production Jev instances with a shared reasoning cascade. Uncertain boolean, choice and score answers, explicit unknown/unclear labels, invalid answers and unavailable classifiers receive a bounded, tool-free LLM assessment using the configured advisor slot and the host model registry. The assessor sees only the already bounded/redacted classifier evidence and question definitions. It returns validated answers or an explicit unresolved result; it cannot approve an operation. Confidence in reasoning output is an assessment, not a calibrated Jev probability, and reasoning provenance and usage are recorded separately.

Unresolved assessment returns an actionable error to the coordinating LLM. Consumers must not directly ask humans solely for classifier uncertainty. Actual user-owned approvals (irreversible commands, replacement of active work, substantive policy departures) remain separate and enforced. Cancellation and accounting failures do not initiate another model call. No new runtime dependency or hard-coded model is introduced.

Add test-correction as a distinct motive: correcting an erroneous oracle while preserving intended behavioral coverage is not weakening. Retain structural protections for removed/skipped/emptied tests and regression-hiding changes.

## Consequences

### Positive

- One composition boundary applies reasoning-first policy to every production consumer.
- Honest uncertainty remains possible without making the human the default classifier.
- Coverage weakening cannot be approved merely by an uncertain model.

### Negative

- Ambiguous judgments cost a reasoning call and additional latency.
- Missing evidence or unavailable reasoning can still block an operation, with an actionable error rather than a permission dialog.
- Structured reasoning answers need validation and explicit provenance to avoid confusing them with calibrated classifier output.

## Alternatives

- **Lower thresholds** — Rejected because it changes risk tolerance without adding evidence.
- **Always ask humans** — Rejected because routine test corrections and classification are agent work.
- **Trust all test edits** — Rejected because it would permit verification weakening.
- **Separate fallback per consumer** — Rejected because inconsistent fallback policies caused the original problem.

## Revisit when

Measured fixture/eval results show that shared ambiguity thresholds or assessor evidence are insufficient for a consumer, or Pi gains a native typed reasoning-classifier primitive.

## Related

- [Task and threat assessment](../plan/jev-uncertainty.md)
