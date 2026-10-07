---
name: delegation
description: When and how to delegate work to subagents in this development system - advisor versus switching models, one task record per implementer, a fresh-context reviewer, and routing model and thinking level with devsys_route_task before agent_spawn. Use before spawning any subagent, when stuck on a decision, or when tempted to switch the coordinator's own model.
---

# Delegation

Subagents come from the vendored `agent_spawn` family (tool names and agent files
are the upstream ones; see `docs/subagents/custom-agents.md`). This system adds a
per-spawn `model` and `thinkingLevel`, agent types for each role, and a router.

## Decide first: do it, ask an advisor, or hand off

- **Do it yourself** when the task is small and you already hold the context.
- **Spawn `advisor`** when you are stuck on, or about to make, a design or
  trade-off decision. It is read-only and returns a recommendation, the
  alternatives it rejected and the cost if wrong. **Never switch the coordinator's
  own model to get a better opinion**: switching loses context and cache and is not
  recorded. If the matrix says a stronger model fits this phase, ask the advisor.
- **Spawn `implementer`** for one well-bounded task from a task record.
- **Spawn `reviewer`** for a diff, always with fresh context (see below).
- **Spawn `researcher`** for evidence-backed questions about code or the web.

## Route before you spawn

Call `devsys_route_task({task, files, riskSignals})` before `agent_spawn` for
implementer and reviewer work. It returns a slot, a thinking level and, when one
resolves on this machine, a model. Pass them through:

```text
agent_spawn({path: "/impl-add-flag", type: "implementer", task: "...",
             model: "<from route>", thinkingLevel: "<from route>"})
```

- Jev judges difficulty and risk; the project's `[routing]` table (slots, never
  model ids) decides. Jev offline means `routine/low`.
- If the result says the slot is unresolvable, spawning without a pin usually fails the
  same way (the agent's own `models:` list defaults to the same candidates). Run `/devsys-models`
  to fix the matrix, or pin a model you know works.
- A pin is an explicit choice: it bypasses `/scoped-models` and the agent's `models:`
  list, so only pin what the route (or you, with a stated reason) selected.
- You may override the route. Say why in your reply; overriding downwards for
  risky work is a judgement call worth a line in the decision log.

## The implementer gets exactly one task record

Give it the task, the files it may touch, the interfaces as signatures, the test to
write first, and the `Run:` / `Expected:` pairs that prove it. Nothing else: no
plan, no history. If it needs more it pauses and asks. It never commits or pushes;
you deliver after review.

## The reviewer is always fresh

A reviewer that watched the work being written shares its blind spots. A path
under `/root/...` inherits your whole conversation, so spawn reviewers and
implementers at a top-level independent path (one segment, for example
`/review-1` or `/impl-add-flag`): independent roots start with no history. Give it the diff
range and the packet format (`agents/reviewer.md`), and never tell it what you
concluded. Fix every blocking and should-fix finding, then ask for a new round.

## Parallel work

Spawn independent children with `wait: false` before waiting on any of them. Keep
the number of concurrent agents small; each one costs context and money.

## Do not

- Switch the coordinator's model instead of spawning an advisor.
- Spawn an implementer without a task record or a way to verify the result.
- Reuse a reviewer thread for the next round; start a new one.
- Hide a model downgrade for risky work; record it.
