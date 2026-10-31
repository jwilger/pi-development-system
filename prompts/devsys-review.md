---
description: Run one fresh reviewer per selected lens on the active slice and record the complete round
argument-hint: "[slice] [diffRange]"
---
Review the work in progress with the code-review skill.

1. Call `devsys_review_start` (slice and diff range: $ARGUMENTS; omit either to use the active slice and `HEAD`; only the `HEAD` range clears the commit gate).
2. Run every `agent_spawn` payload in the returned array unchanged, one fresh top-level reviewer per selected lens. Launch all siblings with `wait: false` before calling `agent_wait` for each session; never combine the lens assignments. If the round was already prepared and sessions exist, wait for or resume those sessions instead of spawning duplicates.
3. Each reviewer submits its single-lens result with `devsys_submit_review`. Collect valid results from every selected lens before calling `devsys_review_record` once with the same `slice`, `diffDigest`, `diffRange` and `reviewInputIdentity` (when supplied) as the start reply. If reviewers returned markdown packets instead, pass all of those packets verbatim in the same `packets` array; typed submissions need not be passed again. Missing or failed lens results are not clean: preserve other results and wait for or retry the affected reviewer, never manufacture a clean packet.
4. Report `review: N/R clean` and the next action only after the complete round is recorded. If a lens is still missing or failed, report that incomplete status instead. If the next action is `fix-findings`, list each blocking and should-fix finding with its `path:line`.
