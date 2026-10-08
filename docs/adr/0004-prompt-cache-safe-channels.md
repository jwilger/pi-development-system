# ADR 0004: Prompt-cache-safe channels for extension context

- **Status:** accepted
- **Date:** 2026-10-08

## Context

Prompt-cache hits fell from ~92% to ~16% in long sessions. pi puts the
provider's cache breakpoint on the last message of each request and sends tool
declarations and the system prompt first. The extension's `context` handler
appended an unpersisted user-role tail at the end of every request whenever the
phase was not idle or a departure was open; that tail replaced the bytes under
the breakpoint on every call, so only the system prompt and tools (~30K tokens)
ever hit. The `devsys` tool also rewrote its description per phase, and the
system-prompt section mixed the static non-negotiables with volatile state.

## Decision

Only three channels may carry extension context to the model, each chosen for
how pi persists it:

1. **System prompt, two sections.** `development-system` holds the
   non-negotiables and is byte-identical for the life of a conversation.
   `development-system-state` holds phase, sizing, active slice, profiles and
   the open departures; pi diffs sections per run and appends only a changed
   one as a delta. Jev availability and anything that ticks stay out.
2. **A persisted one-shot message** returned from `before_agent_start`
   (`devsys-nudge`, display false) for the intent line and the cadence
   warning. The cadence text is bucketed to 30 minutes and said once per
   bucket.
3. **`pi.sendMessage(..., {triggerTurn:false})`** for advice raised outside a
   prompt (model advice), which pi persists in the branch.

No `context` handler. Tool descriptions, names and exposure do not change
during a run. Plan rule R13 states the invariant; tests in
`test/extension.test.ts` and `test/context/*` pin it.

## Consequences

### Positive

- The request prefix is stable across tool-call loops and across prompts
  unless workflow state changes; the state delta costs a few lines.
- Nudges are in the transcript, so a later reader sees why the model acted.

### Negative

- Open departures are in the system prompt, not at the end; a model that
  ignores the prompt's state section loses the reminder at the point of
  action. The departure gates still enforce it.
- A state change still resends the state section once.

## Alternatives

- **Keep the tail, mark it cache-safe** — impossible: pi, not the extension,
  places the breakpoint, and an unpersisted message can never be a prefix.
- **Persist the tail as a message on every state change** — rejected: it would
  grow the transcript with repeated reminders; the section delta is smaller.

## Revisit when

pi lets extensions place or move the cache breakpoint, or persists `context`
edits.

## Related

Plan §1 R13; billion-context's prefix-cache reports
(`~/.local/state/billion-context/bili.log`) are the evidence source.
