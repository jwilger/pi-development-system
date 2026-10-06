---
name: behaviour-tests
description: Tests that assert observable behaviour through public interfaces, built as vertical slices, never against committed file text or internal structure. Use when writing or reviewing a test, deciding what to assert, or when a refactor breaks tests that should not care.
---

# Behaviour tests

A test is an executable statement of behaviour a user of the code could observe.
It should survive any refactor that keeps that behaviour.

## Rules

- **Black-box.** Call the public interface; assert on outputs and observable effects.
  If the test must reach into private state, the interface is missing something.
- **Vertical slices.** Each test drives one user-visible capability from entry point to
  outcome, with real core code and only the *outside world* faked (exec, clock, UI).
- **Name the behaviour,** not the function: "a commit with a Co-Authored-By trailer is
  blocked", not "test checkCommit 3".
- **One reason to fail** per test, and a failure message that says what was expected.
- **Table tests for pure rules:** input, expected value, one row per case, including
  edge and hostile inputs (empty, huge, malformed, adversarial).
- **Tests go beside the code they prove** and run in the default test command.

## Desiderata (Beck) to trade off consciously

Tests should be isolated, deterministic, fast, readable, behavioural, structure-
insensitive and specific about failures. When two conflict, say which you picked.

## Do not

- Do not assert on committed file text or structure ("README contains X",
  "file has 40 lines"). It pins wording, not behaviour, and breaks on every edit.
  Exception: a lint test that checks a *contract* (skill frontmatter, referenced paths).
- Do not mock the unit under test, or assert that an internal function was called.
- Do not share mutable state between tests or rely on order.
- Do not snapshot big outputs you did not read. A snapshot nobody reviewed asserts nothing.
- Do not delete or skip a test to get green. Fix the code (gate `tests.weaken`).

## Checklist

- [ ] Asserts on outputs/effects through the public interface
- [ ] Named after the behaviour
- [ ] Only the outside world is faked
- [ ] Includes edge and hostile inputs for pure rules
- [ ] Survives a behaviour-preserving refactor
