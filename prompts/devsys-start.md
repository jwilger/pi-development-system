---
description: Size new work and get the planning artifacts it needs before building
argument-hint: "<what you want done>"
---
Start new work with the work-intake-and-slicing skill.

1. Call `devsys_intake` with `request` set to: $ARGUMENTS (if empty, ask the user what they want done first).
2. Show the user the proposed size and artifacts. The tool asks them to confirm or change the size.
3. Follow the recommended artifacts in order. To skip one, call `devsys_record_departure` with gate `artifact.skipped:<artifact>` and the reason; do not skip silently. The event model and architecture are recommendations, never gates.
4. For `fix` and `change` the phase is already `implementing`: write the task record, then work it test-first.
