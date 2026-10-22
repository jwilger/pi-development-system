# ADR 0009: Context-window-aware slot resolution

- **Status:** accepted (design choices agreed by the user, 2026-10-22)
- **Date:** 2026-10-22

## Context

Slot resolution picks the first matrix candidate that this machine has
credentials for. Every model was assumed to fit any request. Local models
served over Ollama break that assumption. The MacBook's jw-coder:30b and
jw-fast:8b have 32,768-token windows, while every cloud model has 272K or
more. A subagent's first request is already 6–10K tokens, and quality degrades
from about ½–⅔ of the served window. A local model placed first in a slot would
be chosen even for work that cannot fit, and it fails partway through (see
`docs/research/07-local-model-routing.md`).

## Decision

- `Available` models carry an optional `contextWindow` taken from pi's model
  registry.
- Resolution can take an optional size estimate. A matched model whose known
  `contextWindow` is too small is skipped, and resolution continues with the
  next candidate. The skipped models are reported with the resolution. A model
  with no known window always fits. Without an estimate, resolution is
  unchanged.
- The fit rule is pure and uses constants in code, with no new configuration
  keys:
  `estimate = 8,000 (subagent overhead) + ceil(task chars / 4) + ceil(named file bytes / 4)`.
  A model fits when `estimate ≤ 0.6 × contextWindow`.
- `devsys_route_task` estimates from the task text plus the files it is given.
  The `agent_spawn` guard estimates from the task text and silently picks the
  first model that fits. `devsys_route_task` names any skipped models and why. `/devsys-models` and `devsys_models` show
  each resolved model's context window.
- Nothing names a particular local model. Which models come first is matrix
  configuration (repo-local `.development-system.toml`). The shipped defaults
  do not change.

## Consequences

### Positive

- A small-window model can sit first in a slot and still fall back to cloud
  models for large work, so cheap local inference gets used without manual
  pinning.
- Users without limited-context models see identical behaviour.

### Negative

- The estimate is coarse. The spawn guard cannot see the files a subagent will
  read later, so a task that looks small can still overflow partway through.
  That run then fails and must be re-spawned on a cloud model.
- `resolveSlot` gains an optional parameter, and resolutions gain a `skipped`
  list, which adds a little surface to a core function.

## Alternatives

- **Configurable `[context]` table** — Rejected for now, because no second
  user needs different numbers yet and it would widen the config contract.
- **A separate opt-in `local` slot** — Rejected, because it saves only when
  coordinators remember to pin it, and slots are meant to describe jobs, not
  hardware.
- **Order candidates only, accept overflow** — Rejected, because an overflowing
  local run wastes minutes and then fails.

## Revisit when

Local models with windows of 128K or more become the norm, or trials show the
0.6 margin or the 8K overhead is wrong (for example, frequent mid-task
overflows of local subagents that the estimate said would fit).

## Related

- `docs/research/07-local-model-routing.md`
- `work/local-routing/trials.md`
