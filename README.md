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

## Development

```sh
nix develop
```
