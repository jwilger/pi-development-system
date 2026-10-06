# ADR 0003: Vendor pi-subagent-manager

- **Status:** accepted
- **Date:** 2026-10-06

## Context

`agent_spawn` in pi-subagent-manager (v0.14.0, MIT) has no per-spawn `model` or
`thinkingLevel`; models come only from agent definition files. Routing by task
difficulty and risk needs both per spawn. A separate fork or package would add
a dependency and a tool-name collision.

## Decision

Vendor the package into `src/subagents/` (with `VENDORED.md` recording origin
and licence), keep tool names and the agent-file format so existing custom
agents keep working, and add per-spawn `model`/`thinkingLevel`. The original
package must be removed from settings when the vendored one ships (I5).

## Consequences

### Positive

- Coordinator controls model and effort per spawn; one package to install.

### Negative

- We own upstream merges and ~10k lines of TypeScript.

## Alternatives

- **Keep upstream, route via agent definitions** — Rejected because it cannot vary per task.
- **Separate fork package** — Rejected by the author: no fork or extra dependency.

## Revisit when

Upstream adds per-spawn overrides natively.

## Related

`docs/research/00-synthesis.md` D6; plan I5.
