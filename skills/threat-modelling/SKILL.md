---
name: threat-modelling
description: Proportional threat modelling for a change - decide whether it needs one, ask four questions, and record the result only when the risk earns it. Use before designing or reviewing anything that touches authentication, authorisation, secrets, user data, a network boundary, file or process execution, payments, or a new dependency, or when asked for a threat model or security review.
---

# Threat modelling

Proportional on purpose. Most changes need thirty seconds of thought and no document.
A few need a page. None need a framework exercise.

## What this system trusts

This system runs on the author's single-owner machine. Trusted: the author, their
working tree, their credentials in pi, the local shell and git. Do not model an attacker
who already has that. Untrusted: everything that arrives from outside it. That means
network input, file contents from other people, dependency code, model output when it
becomes a command or a path, and anything a deployed service receives.

## Is a threat model needed?

Ask all four and count the yes answers:

1. Does the change add or move a **trust boundary** (a new input from outside, a new
   network call, a new account or role)?
2. Does it handle **secrets, personal data, money or authority** (login, permissions,
   keys, tokens, payments)?
3. Does it **execute or interpret** something it did not write (a shell command, a
   file path, a template, deserialised data, a plugin)?
4. Does it add a **dependency class** or change how packages are fetched or run?

No yes: no document. Note "no new trust boundary" in the task record and move on. One or
more yes: do the four questions below.

## The four questions

1. **What are we protecting?** Name the asset: the data, the authority, the money, the
   machine. If you cannot name one, the change probably does not need this.
2. **Who or what can reach it, and from where?** List the entry points and who controls
   each: users, other services, files, the model, a dependency.
3. **What could go wrong?** For each entry point, a line each for: pretending to be
   someone else, changing what should not change, denying that it happened, reading what
   should stay private, making it unavailable, gaining more authority than intended.
   Skip the ones that do not apply and say so.
4. **What stops it, and what is left?** Name the control that exists (a check, a limit,
   a permission, a test). Where there is none, decide: build one, accept the risk, or
   leave it to a named follow-up. An accepted risk is written down with its cost.

## Checklist for the usual suspects

- [ ] Input is parsed into a type at the boundary; length, size and shape limits exist.
- [ ] Secrets never reach logs, commit messages, eval fixtures or subagent prompts
      (non-negotiable 7); they are read from the environment or the credential store.
- [ ] A path or a command built from input cannot leave its directory or add
      arguments; use argument arrays, not string concatenation.
- [ ] Authority is checked on the server side of every boundary, not inferred from the
      client.
- [ ] A failure refuses safely: with no user to ask, the answer is no.
- [ ] Errors do not reveal more than the caller may know.
- [ ] New dependencies are pinned, maintained and needed; the install does not run code
      you did not intend.
- [ ] Each control has a test that fails when the control is removed.

## When to write `docs/security/threat-model.md`

Write it, or extend it, when the change has at least two yes answers above, or any
accepted risk you would want a reviewer to find later. Keep it to one page: assets,
entry points, the table from question 3 for what applies, controls with their test
names, accepted risks with who decided. Link it from the ADR when the decision shapes
the architecture. Otherwise the task record line is enough.

## Do not

- Do not produce a threat model for a change with no trust boundary to satisfy a process.
- Do not list generic threats that have no entry point in this system.
- Do not accept a risk silently; an unrecorded acceptance is an unmanaged one.
- Do not weaken a control to make a test or a gate pass (non-negotiable 2).
