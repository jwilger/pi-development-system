---
description: Run a fresh-context review round on the active slice and record the result
argument-hint: "[slice] [diffRange]"
---
Review the work in progress with the code-review skill.

1. Call `devsys_review_start` (slice and diff range: $ARGUMENTS; omit either to use the active slice and `HEAD`).
2. Run the `agent_spawn` payload it returns, unchanged.
3. Pass the reviewer's packet verbatim to `devsys_review_record` with the same `diffDigest` and `diffRange` the start reply gave.
4. Report `review: N/R clean` and the next action. If the next action is `fix-findings`, list each blocking and should-fix finding with its `path:line`.
