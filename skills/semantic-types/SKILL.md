---
name: semantic-types
description: Parse, don't validate - turn raw input into types that prove their own validity, and make illegal states unrepresentable. Use when modelling a domain, accepting external input (JSON, CLI args, files, env), writing a state machine, or seeing a string/number standing in for an id, path or status.
---

# Semantic types

The type is the proof. Validate once at the boundary and produce a value the compiler
knows is valid; everything inside the boundary then needs no re-checking and cannot
be handed something invalid.

## Rules

- **Parse at the edge.** One function per boundary takes `unknown` (or a raw string)
  and returns either the typed value or a typed error. This is the only place a cast
  (`as`) or `any` may appear, and it has a comment saying so.
- **No primitive obsession.** A branded/newtype `GateId`, `SliceRef`, `RepoPath` beats
  `string`. Two ids of different things must not be assignable to each other.
- **Make illegal states unrepresentable.** If a field only makes sense in one state,
  put it in that variant. "Has an email *or* a postal address" is a union, not two
  optional fields and a runtime check.
- **Explicit state machines.** States are a union of variants; transitions are
  functions `(State, Event) -> State`. No boolean flag combinations.
- **Constructors that can fail return a result** (`T | ParseError`, `Result<T, E>`),
  never throw for expected bad input.

## Do not

- Do not validate the same invariant in three places. If you re-check it, the type
  is not carrying the proof; strengthen the type.
- Do not use optional fields to model "sometimes present". Use a union keyed by a
  discriminant (`kind`).
- Do not cast to silence the compiler inside the core. A cast there hides a missing
  parse step.
- Do not add a new `string` field for something with rules (an id, a path, a status).
  Name the type first.

## Checklist

- [ ] Every external input passes through one parse function
- [ ] Parse functions return typed errors; only they cast
- [ ] Ids/paths/statuses are distinct types, not bare strings
- [ ] Mutually exclusive data lives in a discriminated union
- [ ] State transitions are total functions over a union
