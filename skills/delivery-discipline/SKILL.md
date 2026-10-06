---
name: delivery-discipline
description: How to commit, push and release in this development system - trunk-based delivery, Conventional Commit messages that carry their rationale, handling a red build, and when worktrees are warranted. Use before committing, pushing, opening a pull request, or when CI is red.
---

# Delivery discipline

Delivery mode comes from `.development-system.toml` (`[delivery] mode`):
`trunk` (default), `pull-request`, or `local-only`. The repository's own policy
wins over any habit. The extension enforces the hard parts; this skill is how
to work with them.

## Commit messages

Shape: `type(scope): subject` then a body that says **why**.

```text
fix(auth): reject expired refresh tokens

Expired tokens were accepted for up to a minute because the clock check used
the issue time. Sessions outliving their grant is a security defect, so the
check now uses expiry; clock-skew tolerance is deliberately not added.
```

- Do not write a body that only restates the diff. The diff already says what;
  the body is the only place the reason survives.
- Do not add `Co-Authored-By`, "Generated with" or any AI trailer. This is
  never a departure; the guard blocks it outright.
- Do not mix structural changes (rename, move, reformat) with behavioural ones
  in one commit. Reviewers cannot see the behaviour change inside the noise.
  Tidy first, commit, then change behaviour.
- A body-less commit is allowed only through a recorded departure
  (`devsys_record_departure`, gate `commit.rationale`); say why in it.

## Trunk flow

1. Small increment, tests green locally, commit with rationale.
2. Push to trunk, then watch CI (`/devsys-ci`). A push is not done until CI is green.
3. If an hour passes without a pushed commit, stop and ask whether the
   increment is too big; split it.

Do not start unrelated work while trunk CI is red. Fix it first; a red build
hides every later failure. A push to a red trunk is a hard stop unless the
commit is `fix(ci): ...` and its diff only repairs the failing build. If `gh`
is missing or unauthenticated, CI reads as unknown and the push is allowed:
check CI by other means before relying on it.

## Pull-request mode

Never push to the trunk directly (hard stop, gate `push.delivery-mode`). Push a
branch, open the PR, and wait for its checks.

## Local-only

Pushes are blocked. Commit locally, tell the user what is unpublished.

## Worktrees

Use `.worktrees/<name>` only when two pieces of work genuinely run in
parallel. One increment at a time needs none; they add cleanup and confusion.

## Never

- `--no-verify`, `git push --force`, rewriting published history, deleting
  remote branches: hard stops needing the user's explicit approval each time.
- Weakening or deleting tests to get green (gate `tests.weaken`).
- Claiming CI passed without having looked at it.

## Checklist

Copy and tick:

```text
- [ ] Commit is one kind of change (structural or behavioural)
- [ ] Subject is Conventional; body explains why
- [ ] No AI trailer
- [ ] Local gates green (see references/lefthook.yml for the template)
- [ ] Pushed per delivery mode; CI watched to green
```
