---
name: event-modelling
description: Model a capability as event-model slices (command, events, views, Given/When/Then) before building it, validate them, and turn each scenario into a failing test. Use when a capability or product has state changes, views or automations to design, when asked for an event model, or before writing tests for a command-and-event feature.
---

# Event modelling (lite)

An event model says what happens (events), what causes it (commands), and what people see (views), one thin
slice at a time. Here it is a set of small YAML or JSON files, one per slice, validated by
`devsys_event_model_check` and turned into tests. Keep it small: model what the work needs, not the whole
domain. If a repo has a dedicated event-model extension (a tool named `event_model_validate`), use that tool
instead.

## The three slice patterns

| Pattern | Shape | Has |
|---|---|---|
| `state-change` | an actor issues a command and events record the result | `command`, `events`, `gwt` |
| `state-view` | a view is built from events | `views` (each with `sources`), `gwt` optional |
| `automation` | the system reacts to events with a command | `actor: system`, `command`, `events`, `gwt` (its `given` names the triggering events) |

A slice file:

```yaml
id: slice.signin.c01
pattern: state-change
actor: user
command: { name: SignIn, fields: { email: string, password: secret } }
events:
  - { name: SignedIn, fields: { userId: id, at: timestamp } }
gwt:
  - given: [{ event: UserRegistered, let: { email: "a@b.c" } }]
    when: { command: SignIn, let: { email: "a@b.c", password: "pw" } }
    then: [{ event: SignedIn }]
```

Views list `{ name, fields, sources: [event names] }`. Ids are unique and stable (`slice.<name>.<c|v|a><nn>`).

## The seven steps

1. **Brainstorm the events** in past tense (`UserRegistered`, `SignedIn`), in the order they happen.
2. **Order them** into a story along time, and note which actor causes each.
3. **Add the commands** that cause the events, with the fields the actor supplies.
4. **Add the views** people read, naming the events each is built from.
5. **Cut slices**: one file per command, view or automation, each independently buildable.
6. **Write the scenarios**: Given (prior events), When (the one command), Then (events, an error, or a view).
7. **Validate and fix**: run `devsys_event_model_check` and resolve every error.

Put the files under `docs/event-model/` (or the directory the user names). Ask for the derived swimlane
Markdown or a Mermaid diagram with `render`; never edit derived views by hand.

## Given / When / Then

- `given`: events that already happened, with the values (`let`) that matter. Empty means no history.
- `when`: exactly one command, with its values. A `state-view` slice has none.
- `then`: at least one expectation: an `event`, an `error` (kebab-case id), or a `view`.

## Completeness

The validator checks that information has an origin and a destination:

- every field of a view appears in the fields of one of its source events (`missing-origin`);
- every field a system-run command needs comes from a view or an earlier event (`missing-origin`);
- every command produces at least one event (`missing-destination`);
- every name that a scenario or view mentions exists in some slice (`unknown-ref`);
- ids and names are unique (`duplicate-id`); scenarios have a `when` and a non-empty `then`
  (`gwt-without-when`, `gwt-then-empty`); a slice's fields match its pattern (`pattern-field-mismatch`);
- an event nothing reads is a warning (`orphan-event`): a view, a scenario or an automation should use it.

## Never invent policy to satisfy the validator

When a check fails because the model lacks a fact (where does this field come from? who sends this
command?), that is a question for the user, not a gap to fill. Do not add a field, an event or a rule only so
validation passes. Ask one question, record the answer in the model, and continue.

## From scenarios to tests

One failing test per scenario, with the gwt-tests reference of the active language profile
(`profile-typescript` or `profile-rust`). No spec in the model without an equivalent in code, and no
behaviour in code that the model does not cover. When they disagree, change the model first.

## Skipping

Event modelling is a planning artifact for `capability` and `product` work. Skipping it is a recorded
departure: `devsys_record_departure` with gate `artifact.skipped:event-model` and why it does not
fit (for example, no state changes or views to design).

## Checklist

- [ ] Every command, view and automation is its own slice file with a stable id
- [ ] `devsys_event_model_check` reports 0 errors; warnings read and answered
- [ ] No field, event or rule exists only to satisfy the validator
- [ ] Each scenario has a failing test, written before the code
