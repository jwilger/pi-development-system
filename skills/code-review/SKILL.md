---
name: code-review
description: How to review a slice before it is committed in this development system - fresh-context reviewer per round, Jev-chosen lenses, the review packet format, what resets the clean streak, and driving rounds with devsys_review_start and devsys_review_record. Use before committing a slice, when asked to review, or when interpreting reviewer findings.
---

# Code review

Every slice is reviewed by a **fresh-context reviewer** before it is committed.
The reviewer has not seen your reasoning, so it judges the diff, not your intent.
Review is a soft gate (`review.unsatisfied`): skipping it needs a recorded departure.

## Run a round

1. `devsys_review_start` (slice defaults to the active slice; `diffRange` defaults
   to `HEAD`: everything uncommitted, untracked files included; the commit gate
   checks that range, so use it for a review meant to clear a commit). It computes the
   diff digest, lets Jev choose lenses, and returns an exact `agent_spawn` payload.
2. Run that `agent_spawn` unchanged. The reviewer is a top-level agent, not a
   child of this conversation, so it does not inherit your context.
3. Pass the reviewer's packet, verbatim, to `devsys_review_record` with the
   `diffDigest` the start reply gave, and the same `diffRange` if you gave one
   (`packets: [...]`; all lens packets of one
   round in one call). A packet is recorded once, in the round its header names;
   if the diff changed since the start, the round is refused: start again.
4. Read the reply: `review: N/R clean` and `next:`.
   - `fix-findings`: fix every blocking and should-fix finding, then start a new round
     (starting again on an unchanged diff is refused).
   - `review`: the streak is short (or the diff changed with findings); start another round.
   - `stale-diff`: the diff changed after a satisfied review; one more round.
   - `done`: commit.

## The packet

```markdown
## Review — <slice> — round <n> — lenses: <a, b>
### Sources inspected
- <path:line ranges>
### Findings
- [blocking|should-fix|nit] <lens> `<path>:<line>` — <one sentence> — <why it matters>
### Verdict
no-blocking | blocking
```

A malformed packet is rejected with the reason; ask the reviewer to resend it.
The verdict must agree with the findings.

## Severity and the clean streak

- **blocking**: a demonstrable defect or a broken non-negotiable.
- **should-fix**: a real defect or missing test with a realistic trigger.
- **nit**: style or report-only. Nits never reset the streak; they go to
  `docs/decisions/followups.md`.
- **false-positive**: refuted; ignored.

Jev may raise a finding's severity when it is at least 0.8 confident; it never
lowers a finding to a severity that does not count (it only suggests, in the
reply, and you re-check it yourself). A round is clean when it has no blocking or should-fix findings.
The default is three consecutive clean rounds (`review.required_clean_rounds`).
Only real findings reset the count; a changed diff alone does not, so a small fix
commit keeps the clean rounds already earned unless findings come back.

## Rules of thumb

- Fix the findings before the next round. Do not argue a finding away; if it is
  wrong, record a `review.unsatisfied` departure with the evidence
  (`devsys_record_departure`). Starting a round again on an unchanged diff after
  findings is refused, so a finding is cleared by a fix, never by a re-roll.
- Do not widen a review into an audit of the tree. The reviewer reads the diff and
  what it depends on.
- Never edit the packet to make it pass.
