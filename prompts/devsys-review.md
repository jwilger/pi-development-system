---
description: Run a fresh-context review round on the active slice and record the result
argument-hint: "[slice] [diffRange]"
---
Review the work in progress with the code-review skill.

1. Call `devsys_review_start` (slice and diff range: $ARGUMENTS; omit either to use the active slice and `HEAD`; only the `HEAD` range clears the commit gate).
2. Run the `agent_spawn` payload it returns, unchanged.
3. The reviewer submits its result with `devsys_submit_review`; call `devsys_review_record` with the same `slice`, `diffDigest` and `diffRange` the start reply gave (no packets needed). Only if the reviewer returned a markdown packet instead, pass it verbatim in `packets`.
4. Report `review: N/R clean` and the next action. If the next action is `fix-findings`, list each blocking and should-fix finding with its `path:line`.
