---
name: functional-core-imperative-shell
description: Functional core, imperative shell - keep decisions in pure functions and push all I/O to a thin outer layer that executes the effects. Use when designing a module, deciding where logic belongs, or when a test needs mocks or a real filesystem/network to check a business rule.
---

# Functional core, imperative shell

Decisions are data-in, data-out functions with no I/O. The shell reads the world,
calls the core, and performs what the core returned. This is what makes behaviour
testable without mocks and keeps the part that changes most (policy) easy to change.

## Shape

- **Core** (`src/core/`): pure. Takes values, returns values (including *descriptions*
  of effects). No `fs`, network, clock, randomness, environment, or logging.
- **Shell** (`src/<adapter>/`, entry points): reads input, calls the core, runs the
  returned effects, maps results to the outside world. Holds no business rules.
- **Effects as data:** when the core needs "then do X, then decide Y", return a
  step the shell executes and feeds back (a `Step`/continuation or a plain list of
  commands) rather than calling X itself.
- **Time, ids and randomness are inputs.** Pass `now`/`newId` in; tests then pass
  fixed values.

## Do not

- Do not call `Date.now()`, read env vars or touch the filesystem inside core logic.
  The test for the rule then needs a fake clock or temp dir, which means the rule is
  not isolated.
- Do not put a conditional business rule in the shell "because it is only one if".
  Rules accrete; the shell becomes the place nobody can test.
- Do not mock the core to test the shell. Give the shell real core code and fake only
  the outside world (the exec function, the clock, the UI).
- Do not let core types import shell types. Dependencies point inward only.

## Test consequence

Core tests are plain table tests: input in, expected value out, no setup. If a core
test needs setup, something impure leaked in. Shell tests check wiring: given this
outside-world response, the right effect was executed.

## Checklist

- [ ] The rule lives in a function with no I/O imports
- [ ] Time, ids and randomness arrive as parameters
- [ ] The shell contains no branching on business conditions
- [ ] Core tests need no mocks, temp files or network
- [ ] No inward-pointing import from core to shell
