# ADR 0005: Event model slice schema v1 and extension handshake

- **Status:** accepted
- **Date:** 2026-10-08

## Context

Capability-sized work needs a checkable spec that turns into tests. The plan (Appendix D)
describes an event model as thin slices. A repo may already have a dedicated event-model
extension with its own validator, and two validators for one model would disagree.

## Decision

- A model is a directory of small YAML or JSON files, one slice each, in schema v1: `id`,
  `pattern` (state-change, state-view, automation), `actor`, `command`, `events`, `views`,
  `gwt`. The schema is a TypeBox schema in `src/planning/slice-schema.ts`, and
  `validateModel` reports eight stable codes (duplicate-id, unknown-ref, missing-origin,
  missing-destination, gwt-without-when, gwt-then-empty, orphan-event,
  pattern-field-mismatch).
- The builtin `devsys_event_model_check` tool is registered at `session_start` only when no tool
  named `event_model_validate` exists and `event_model.provider` is `"builtin"`. A provider
  extension registers `event_model_validate` in its factory; the contract is in
  `docs/event-model-extension-contract.md`.
- Validation reports problems; it never repairs a model. The skill tells the agent to ask
  rather than invent policy to make a check pass.

## Consequences

### Positive

- One validator per repo; a dedicated extension takes over without a conflict.
- Stable codes let prompts and tests refer to a failure by id.

### Negative

- Schema v1 is a public contract: changing a field name breaks existing models and providers.
- Detection happens at `session_start`, so a provider that registers its tool later is missed.

## Alternatives

- **Markdown-first models** — Rejected because research found them drifting from the code
  and impossible to check mechanically.
- **Always register the builtin tool** — Rejected because it would shadow or duplicate a
  dedicated provider.

## Revisit when

A second schema version is needed, or pi exposes a way to observe tools registered after
`session_start`.

## Related

Plan section 4 I10 and Appendix D; research 03 section 4.
