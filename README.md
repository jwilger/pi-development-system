# pi-development-system

A [pi](https://pi.dev) extension package representing my seasoned approach to
software development using a full AI SDLC.

> **Status:** under construction (see `docs/plan/development-system-plan.md`).

## Replaces pi-subagent-manager

This package vendors `pi-subagent-manager` (MIT, see `src/subagents/VENDORED.md`)
and adds per-spawn `model` and `thinkingLevel`. **Remove the original from the
`packages` list in `~/.pi/agent/settings.json`** (the `npm:pi-subagent-manager`
entry), then `/reload`; otherwise both register `agent_spawn` and pi refuses the
duplicate.

## You do not need the slash commands

Everything the system offers is reachable without remembering a command. Describe the work in
plain words: when a prompt asks for new work, a fix or a review, the system adds a guideline
naming the tool to use (`devsys_intake`, `devsys_review_start`). A `devsys` tool always shows
what the current phase expects. When you say a slice is finished with no review round recorded,
it tells you to start one. The slash commands (`/devsys-start`, `/devsys-plan`, `/devsys-review`,
`/devsys-lens-review`, `/devsys-adr`) are shortcuts to the same tools.

Product planning has a skill (`product-planning`: brief, decision register, follow-ups,
terminology, journeys). `devsys_lens_review` plans a review of the brief by five product lenses and
writes the packets to `docs/product/reviews/`; `devsys_adr_new` creates the next numbered ADR, and
a commit that shapes the architecture without one is stopped by the soft gate `adr.missing`.

A slice has a life cycle: `implementing` → `reviewing` (when a review round starts) → `delivering`
(review satisfied) → `idle`. Editing production source while delivering reopens `implementing`,
and red-first stays on throughout. A push of a clean tree closes a delivered slice by itself (a commit
in `local-only` mode; CI is not awaited), and `devsys_finish_slice` closes it explicitly or, with a
reason, abandons it. A plan's increments each end in a push, so each increment is its own slice: the
next one starts with `devsys_intake`.

With `codemode` enabled (`"defaultTools": ["+codemode"]` in pi settings), rarely used tools are
reached through scripts and the `judge_*` Jev wrappers exist for scripts only; without codemode
the rarely used tools are declared directly and the wrappers are absent.

## Development

```sh
nix develop
```
