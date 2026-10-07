# Vendored: pi-subagent-manager

- **Upstream:** `pi-subagent-manager` by Arnav Gupta, https://github.com/championswimmer/pi-subagent-manager
- **Version:** 0.14.0 (from the npm tarball; no git commit is discoverable in the package)
- **License:** MIT, Copyright (c) 2026 pi-subagent contributors. The notice is reproduced below and applies to this directory.
- **Why vendored:** decision D6 / ADR-0003. This package needs per-spawn `model` and `thinkingLevel`, which upstream does not offer.
- **Tool names and the `agents/*.md` format are kept unchanged** so existing habits and agent files keep working.
- This package replaces `pi-subagent-manager`. Remove `npm:pi-subagent-manager` from `~/.pi/agent/settings.json`, or both register `agent_spawn` and pi refuses the duplicate.

## Local modifications (keep this list current)

1. Every `*.ts` file starts with `// @ts-nocheck`: upstream compiles under looser options than this repo's strict `tsconfig.json` (`exactOptionalPropertyTypes`, `erasableSyntaxOnly`). `biome.json` excludes `src/subagents`. Both are deliberate: the code is verbatim, and reformatting or retyping it would make upstream diffs unreadable.
2. Relative `.js` import specifiers were rewritten to `.ts` (upstream relies on a TypeScript-aware loader; this repo's tests run under Node's native type stripping).
3. `prefs/config.ts`: the bundled-agents directory is `../../../agents/` (was `../../agents/`) because the sources moved one level deeper.
4. Per-spawn pins (I5.2): `types.ts` `AgentType.spawnOverrides` and `ThreadService.spawn` args gain `model`/`thinkingLevel`; `orch/tools.ts` `agent_spawn` schema exposes both; `orch/manager.ts` `spawn` validates them with `src/core/spawn-overrides.ts` and stores them on the cloned type (so saved threads keep them); `orch/runtime.ts` `resolveInitialSettings` skips the type's preference list when a model is pinned (via `modelSource` in `src/core/spawn-overrides.ts`, so resumed threads keep their model), applies the pin last for fresh spawns, and `createDriver` drops model preferences/scope policy when a model is pinned; `ThreadView.pinned` (`types.ts`) is filled in `orch/manager.ts` `view()` so `agent_status` reports the pins. A pin therefore bypasses `/scoped-models`.
5. Family preferences (I5.3): `prefs/models.ts` `selectPreferredModel` resolves each `models:` entry with `resolveCandidate` from `src/core/models.ts`, so `provider/gpt-*-sol` picks the newest available match; exact ids behave as before.

## MIT notice

MIT License

Copyright (c) 2026 pi-subagent contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
6. Empty scope (I5 review): `orch/runtime.ts` `availableScopedModels` treats an empty `/scoped-models` as no restriction (pi's meaning) instead of "matches nothing", because every devsys agent declares `models:` and would otherwise be unspawnable by default. Pinned models are also re-applied on resume (`resolveInitialSettings`), since a restored session may hold only inherited history.
