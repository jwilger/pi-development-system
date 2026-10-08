---
description: Run the five product lenses over the brief and record the packets
argument-hint: "[brief path] [round 1|2]"
---
Review the product brief with the product-planning skill.

1. Call `devsys_lens_review` (brief path and round: $ARGUMENTS; omit either for `docs/product/brief.md` and round 1).
2. Run the codemode script it returns, unchanged. It spawns the lens agents, waits, writes the packets to `docs/product/reviews/<date>-round<n>.md` and returns only a verdict per lens and the path. If codemode is unavailable, use the `agent_spawn` payloads it lists.
3. Read the review file, not the agents' full output. Report each lens verdict and the findings with their `path:line`.
4. After round 2, write the synthesis (R-table and a one-question agenda) from the template in the reply, then ask the user that one question.

Agreement among agents is useful critique, not customer evidence.
