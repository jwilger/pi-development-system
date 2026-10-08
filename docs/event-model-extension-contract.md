# Event-model extension contract

The development system ships a small builtin event-model validator (`devsys_event_model_check`). A dedicated
event-model extension can replace it. This is the handshake.

## Detection

At session start the system uses the builtin tool only when both hold:

- `.development-system.toml` has no `[event_model] provider` other than `builtin` (the default), and
- no extension has registered a tool named `event_model_validate`.

A provider must register `event_model_validate` in its extension factory (at load time), not from a
`session_start` handler: the detection above runs in this system's `session_start` handler and cannot see a
tool that is registered later.

Either condition alone is enough to defer: the builtin tool is then not registered, and `/devsys-event-model`
tells the model to use the extension's tool.

## What a provider offers

A tool named `event_model_validate` that takes `dir` (a repository-relative directory of slice files) and
returns text whose first line reads `N slices, E errors, W warnings`, then one line per issue
(`- <code> (<severity>) <slice>: <message>`), and sets the tool error flag when `E > 0`. The builtin tool's
reply has the same shape, so prompts and skills do not care which one answered.

A provider should accept schema v1 slice files unchanged (see `docs/plan/development-system-plan.md`,
Appendix D) and may accept richer ones. It owns rendering; the system does not call it for Markdown.

## What the system keeps

The Given/When/Then test rule, the recorded departure `artifact.skipped` when modelling is skipped, and the
rule that a validator never forces an invented policy stay in the skill, whichever provider validates.

## Revisit when

A provider needs more than `dir` (for example a model file or a remote workspace).
