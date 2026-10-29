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

```text
refactor(billing): extract invoice totals into a pure function

Totals were computed inline in three handlers, so each fix had to land three
times. Behaviour is unchanged (tests untouched); the next commit adds the
rounding rule on top of this seam.
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
3. If an hour passes without a pushed commit, inspect progress toward acceptance.
   Repeated planning or coordination without implementation evidence calls for
   simplifying to the next behavioral test or escalating one concrete blocker,
   not automatic splitting. Never bypass review or safety to meet the timer.

Do not start unrelated work while trunk CI is red. Fix it first; a red build
hides every later failure. A push to a red trunk is a hard stop unless the
commit is `fix(ci): …` (or another `fix`), touches only what the failing log names, and
stays small (an unpushed diff over 8000 characters is never exempt); Jev must read it as
only repairing the failing run, which needs the failing log and Jev online. Otherwise the
push is a hard stop. A call that commits and pushes together on a red trunk is refused outright (commit in one call, push in the next). If `gh`
is missing or unauthenticated, CI reads as unknown and the push is allowed:
check CI by other means before relying on it.

## Pull-request mode

Never push to the trunk directly (hard stop, gate `push.delivery-mode`). Push a
branch, open the PR, and wait for its checks.

## Local-only

Pushes are blocked. Commit locally, tell the user what is unpublished.

## Local closure is not delivery

`devsys_finish_slice` closes only the reviewed, clean local context (and, outside
local-only mode, checks that commits are pushed). It does **not** prove CI, PR
merge, Project terminal state, or whole-issue scope. A branch, push, open PR, or
one merged PR is not evidence that every required PR is delivered.

Inspect the repository's explicit workflow and delivery policy first. Where the
owner opts into delivery evidence, use its tracked, resumable issue manifest and
supported conditions through `devsys_work_item {action:"delivery-check",id}`;
caller-requested conditions cannot weaken configured policy. Missing, manual,
stale, changed, inaccessible, or unknown evidence is not success. Scope
confirmation is separate from PR evidence: use
`devsys_work_item {action:"complete",id,scopeConfirmed:true}` only after explicit
human confirmation of full issue scope and fresh configured evidence. Never infer a terminal Project update
or issue closure from local finish. With no evidence policy, say **unassessed**;
local-only repositories need not adopt a PR, merge, queue, or claim convention.
Assignment is not necessarily exclusive ownership.

Report local context, configured PR assessment, whole-issue scope, and the next
missing evidence separately. These instructions and public completion checks are
not a universal wall against raw external forge writes; do not bypass the
supported operation or invent external authority.

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
- [ ] Local closure distinguished from PR evidence and human-confirmed whole-issue scope
```
