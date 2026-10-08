---
description: Size new work and get the planning artifacts it needs before building
argument-hint: "<what you want done>"
---
Start new work with the work-intake-and-slicing skill.

1. Call `devsys_intake` with `request` set to: $ARGUMENTS (if empty, ask the user what they want done first).
2. Show the user the size and artifacts. Jev sizes the work and intake proceeds without asking when it is at least 50% confident; only a less confident Jev makes the tool ask the user to pick. If the size is already decided (say, in a goal's or plan's up-front planning), pass it as `size` and nobody is asked to size it (a `fix` still asks whether to waive review).
3. Produce the planning artifacts first (brief, decision register, journeys, event model, architecture, lens review, in that order, whichever are recommended), then the task record. `review` and `adr-if-needed` are not written up front: review happens on the finished slice, and an ADR when a decision needs one. To skip one, call `devsys_record_departure` with gate `artifact.skipped:<artifact>` and the reason; do not skip silently. The event model and architecture are recommendations, never gates.
4. For `capability` and `product` the phase stays `planning` while you produce the artifacts and the plan. The single point where it changes is the user approving the whole plan: then call `devsys_begin_work` so the review and red-first gates switch on (it does nothing if already implementing).
5. For a `fix` the user is also asked (when a user is present) whether to skip fresh-context review (it is logged if they say yes; if no, the slice needs its review rounds). For `fix` and `change` the phase is already `implementing`: write the task record, then work it test-first.
