# Inventory (2026-10-22)

## Credentials on this machine (provider → auth kind)

- anthropic: oauth (Claude subscription) — claude-fable-5/5-1, opus-4-5..5-5, sonnet-4-5..5-5, haiku-4-5/5-5 (1M ctx for 5.x)
- openai: oauth (ChatGPT subscription) — gpt-4.x, gpt-5..5.5, gpt-5.6-{luna,sol,terra}, gpt-6-{astra,luna,sol}, gpt-6.1-sol (272K), o-series
- opencode-go: api_key (OpenCode Go subscription) — deepseek-v4-pro, deepseek-v4.1-flash, glm-5.2/5.3/5.3-flash, kimi-k2.7-code, kimi-k3 (enabled), qwen3.7-plus, qwen3.8-flash/max, mimo-v2.5/2.6, minimax-m3, grok-4.7, hy3/hy4-preview, gemini-4-argon-contributor, muse-spark-1.2/1.3, step-5-preview, gpt-5.6-luna, gpt-6-luna, claude-haiku-5-5, beam-free, minimax-m3.1-flash-free
- typesafe: api_key (Jev classifier) — out of scope
- macbook (local Ollama, http over tailscale): jw-coder:30b (Qwen3-Coder-30B-A3B-Instruct Q4_K_M, MoE 3B active, tools, no thinking, num_ctx 32768), jw-fast:8b (Qwen3-8B Q4_K_M, dense, tools+thinking capable, num_ctx 32768). pi registers both with contextWindow 32768, maxTokens 16384 (default), reasoning:false.
- openai-codex provider has no credentials (patterns in the matrix fall through to openai/).

## Current resolution (devsys_models, shipped default matrix = repo matrix)

frontier/planning/advisor → openai/gpt-6-astra; strong/implementer/lens → openai/gpt-6.1-sol; fast/researcher → openai/gpt-6-luna; reviewer → anthropic/claude-opus-5-5; jev → typesafe/jev-latest.

## Default routing table (src/state/config.ts DEFAULT_ROUTING)

trivial/low → fast/low; `trivial/*` → implementer/medium; routine/low → implementer/medium; `routine/*` → strong/high; `complex/*` → strong/high; `expert/*` → frontier/high.

## Slot consumers

- All model use is through subagents (no direct completions in src/).
- spawn-guard (src/gates/spawn-guard.ts) → spawnModelFor(type): reviewer→reviewer, implementer/coder→implementer, researcher→researcher, advisor→advisor, architect/tasker→planning, lens-*→lens. Only overrides when project matrix differs from shipped default by outcome.
- devsys_route_task (src/state/route-task-tool.ts) → recommendRoute: Jev difficulty/risk → routing table → slot → model. Inputs: task, files, riskSignals.
- devsys_review_start (src/review/review-tools.ts:225) → reviewer slot.
- devsys_lens_review (src/review/lens-review-tool.ts:168) → lens slot.
- model-advice (src/core/model-advice.ts) → phase→slot (planning/implementer/reviewer) advisory to coordinator; tierOf uses frontier/strong/fast direct entries.
- /devsys-models + devsys_models (src/state/models-command.ts) report resolution.
- Agent definitions (agents/*.md) carry their own `models:` lists mirroring the defaults.

## Observed context pressure (real sessions)

- Subagent sessions (reviewer etc.) on opus: first request ≈10.2–10.6K input tokens before any work.
- Coordinator session with jw-coder:30b (2026-10-22T21-16 session): first request 27.2K tokens; after 4 tool calls hit billion-context 413 "context ~28997 tokens exceeds the model window 24576 (model=jw-coder:30b) … preflight compression could not bring it under". Effective window 24.5K = 32768 − output reserve. ⇒ local models cannot be the coordinator, and a subagent has only ~14K tokens of working space.
