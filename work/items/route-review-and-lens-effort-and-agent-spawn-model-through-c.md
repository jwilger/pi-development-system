# Route review and lens effort, and agent_spawn model, through config

Status: open
Labels: follow-up, 1.0-readiness

Review and lens spawns hard-code thinkingLevel high (src/review/review-tools.ts:122-123, src/review/lens-review.ts:88). A plain agent_spawn with no model ignores the [models] matrix (src/subagents/orch/tools.ts:90-93). Resolve both from the matrix / [routing].

## Comments
