---
name: work-intake-and-slicing
description: Size new work, choose the planning artifacts it deserves, and cut it into task records a weaker implementer can finish. Use when starting any piece of work, when asked to plan, when a task feels too big, or before handing work to an implementer subagent.
---

# Work intake and slicing

Planning is proportional: the size of the work decides the paperwork. A one-line fix does not get a product brief, and a new capability does not get coded from a sentence.

## Size first

Ask these in order and stop at the first yes:

1. Does it change what the product is for, who uses it, or how it earns its place? That is a `product`.
2. Does it add something a user can newly do, across several parts of the system? That is a `capability`.
3. Does it change existing behaviour in one area? That is a `change`.
4. Otherwise it is a `fix`.

`/devsys-start` proposes a size with Jev and asks you to confirm. If you disagree, change it; the size is a judgement, not a rule.

## Artifacts follow size

- `fix`: a task record. The user is asked separately whether to waive fresh-context review for it; a yes is logged as a user-approved `review.unsatisfied` departure for that slice, a no keeps the review gate.
- `change`: task record, review, an ADR if a decision is hard to reverse.
- `capability`: add a brief-lite, journeys, an event model, and optionally lens review.
- `product`: the full set, including brief, decision register and architecture.

Skipping a recommended artifact is allowed and recorded: `devsys_record_departure` with gate `artifact.skipped:<artifact>` and the reason. The event model and architecture are never blocked by a gate; they are recommendations you accept or decline on the record.

## A plan longer than the code has written the code

If the plan spells out every line, it has become the implementation, and a reviewer cannot tell design from typing. A task record names files, interfaces, the first failing test and small steps. It does not contain the function bodies.

## One slice, one clean context

- Cut work into slices that each ship and release on their own.
- Do one slice per clean context. When a slice is done and released, start the next from its task record, not from the memory of the last.
- The implementer sees only its task record. If it needs something not in the record, the record is incomplete: fix the record, do not paste the conversation.

## Task records

Format: `## <id> — <title>` then the sections, each written as a bold label with the colon inside, `**Goal:**`, `**Files:**`, `**Interfaces:**`, `**First failing test:**`, `**Steps:**` (3 to 7, each reviewable alone), `**Run:**`, `**Expected:**`, `**Out of scope:**`.

- Goal is one observable sentence.
- Run is a command and Expected is its concrete result.
- No `TBD`.
- If describing the first failing test needs two tests, it is two tasks.

Run `devsys_task_check` on each record. `needs-detail` names what to sharpen; `too-big` means split before anyone implements.

## Where work items live

Use `devsys_work_item` for the backlog. It reads `[tracker] kind` from `.development-system.toml`: `repo-files` (default, `work/backlog.md` and `work/items/<id>.md`) or `github` issues. Jira and Linear are configurable but not implemented yet.

## Handing off

`/devsys-plan <slug>` writes `docs/plan/<slug>.md` in this structure and checks every task record. Then it stops for the user to review the plan. Only after they approve does it call `devsys_begin_work` (planning → implementing, which switches the review and red-first gates on) and start a goal to complete the plan, when a goal tool is available: a goal can begin implementing on its own, so it must not exist before the review.
