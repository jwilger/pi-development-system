# ADR 0002: Jev as a runtime judgement component

- **Status:** accepted
- **Date:** 2026-10-06

## Context

Many gates ask a judgement question (is this command a history rewrite? does
this diff weaken verification?) that regexes answer poorly. Jev returns typed
judgements and probabilities without text generation.

## Decision

Use Jev at runtime through pi's classifier-model path
(`ctx.modelRegistry.classify()`), one narrow question per call. Policy and
thresholds stay in deterministic code. Unavailable or low-confidence Jev
degrades to conservative deterministic checks and asks (TUI) or blocks
(headless); it never passes silently.

## Consequences

### Positive

- Any user with any Jev-capable provider credential gets the gates.
- No extra runtime dependency.

### Negative

- Judgements are probabilistic; each question needs a fixture.

## Alternatives

- **`@typesafe-ai/sdk` directly** — Rejected because it adds a dependency and excludes non-TypeSafe credentials.
- **Regex only** — Rejected because intent cannot be captured reliably.

## Revisit when

Pi's classifier path changes, or a gate's fixtures show unacceptable error rates.

## Related

`docs/research/00-synthesis.md` D5, D12, D15; plan Appendix E.
