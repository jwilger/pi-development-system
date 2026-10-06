---
name: tdd-canon
description: Test-driven development the way this system does it - a test list, one failing test at a time, minimal code to pass, structural changes kept apart from behavioural ones. Use before changing production behaviour, when deciding whether a change needs a RED test, or when tempted to write tests after the code.
---

# TDD (Canon)

The extension watches for this: while a slice is `implementing`, editing production
source after a green (or absent) test run asks for a `tdd.red-first` departure.
This skill is how to work so that gate never fires.

## The loop

1. **Write a test list** for the behaviour (plain bullets, in a scratch file or the
   task record). Add to it as you learn; never finish the list from memory.
2. **Turn exactly one item into a runnable test.** Deciding the test is where you
   design the interface: call the code the way a user of it would.
3. **Run it and watch it fail (RED) for the right reason.** A test that fails on a
   typo or missing import has proven nothing.
4. **Write the least code that passes** this test and all earlier ones (GREEN).
5. **Refactor** only while green, as its own *structural* step.
6. Cross the item off. Repeat until the list is empty.

## Do not

- Do not write several tests, then the code. One failing test at a time keeps each
  step small enough to be wrong cheaply.
- Do not write the code first and "add tests after". The test then describes what
  the code does, not what it should do, so it cannot catch the bug you just wrote.
- Do not make a failing test pass by weakening it (skip, delete, loosen an expected
  value, comment out). A green gate must mean the same thing afterwards; this is
  non-negotiable 2 and the `tests.weaken` gate.
- Do not mix structural and behavioural changes in one commit (Tidy First). Rename,
  move, reformat: commit. Then change behaviour: commit. Reviewers cannot see a
  behaviour change inside refactoring noise.
- Do not add behaviour nobody asked for because "it will be needed". Unrequested
  functionality is a warning sign of drift; scope is the steering wheel.

## When RED is not required

RED is for **adding or changing first-party production behaviour** when no existing
failing test already proves the required change. These are exempt, and the exemption
must be *named* in a recorded departure (scope `slice`; one departure covers the slice):

- docs or metadata only
- functionality removal (the proof is that nothing still depends on it)
- documented third-party behaviour you are only wiring up
- a test of committed-file text or structure (don't write such tests at all)
- a change already shown by a failing test you have just seen
- straightforward CI workflow scripting, where running CI is the test
- a simple development-environment utility
- a behaviour-preserving refactor with adequate green coverage

"It is simple" is not an exemption. Simple changes are where untested regressions live.

## Evidence the extension sees

It records each test-runner command (`cargo test`, `npm test`, `node --test`,
`vitest`, `pytest`, `go test`) with its exit code. After a *failing* run, source
edits flow freely; after a *passing* run, the next source edit needs a failing test
first. Run the new test before touching the source, and the evidence exists.

## Checklist

- [ ] Test list written, one item chosen
- [ ] Test fails, and for the intended reason (read the failure)
- [ ] Minimal code, test passes, earlier tests still pass
- [ ] Refactor done separately, tests still green
- [ ] Structural and behavioural changes in separate commits
- [ ] If RED was skipped: the exemption is named in a recorded departure
