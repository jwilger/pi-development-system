---
description: Write the plan file for sized work, one task record per slice, and hand it to a goal
argument-hint: "<slug> [what the plan covers]"
---
Write the plan for the current work with the work-intake-and-slicing skill.

1. Slug and scope come from: $ARGUMENTS. If the slug is missing, derive one from the active slice and say which you chose.
2. Write `docs/plan/<slug>.md` with these sections: Goal and why; Constraints (what must not change); Increments, each shippable on its own and small enough to release, each with an **Acceptance** list (observable checks that say the increment is done) and a final Release step (commit, push, CI green, publish, update) followed by a STOP for the user; for every task a task record whose header is `## <id> — <title>` and whose sections are written exactly as `**Goal:**`, `**Files:**`, `**Interfaces:**`, `**First failing test:**`, `**Steps:**`, `**Run:**`, `**Expected:**`, `**Out of scope:**` (label and colon inside the bold, one section per label); a Progress checklist with one box per increment.
3. Write each task so that someone who sees only that task could finish it. Never write `TBD`.
4. Run `devsys_task_check` on every task record you wrote and fix each one until it says ready. Split any that come back too-big.
5. Stop and ask the user to review the plan before any implementation starts. Do not start a goal yet: a goal tool may continue on its own and begin implementing before the review.
6. Only after the user approves the plan: if a `create_goal` tool exists in this session, call it with the objective "complete docs/plan/<slug>.md honouring its Constraints and Progress checklist, one increment at a time, stopping after each increment's Release step". Otherwise tell the user the plan path so they can start a goal on it. Do not depend on any goal tool's file format.
