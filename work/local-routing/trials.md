# Live trials on the MacBook (2026-10-22)

Host: macbook Ollama over tailscale. Both models are Q4_K_M with num_ctx 32768.

## Raw completions (/api/chat, no tools)

| model | task | wall | load | prompt speed | gen speed | quality |
|---|---|---|---|---|---|---|
| jw-fast:8b (think off) | summarise 1K-token TS module | 14.6s | 5.9s cold | 596 t/s | 29 t/s | accurate 5 bullets |
| jw-fast:8b | codegen fn + 4 node:test cases | 7.9s | 0 | 445 t/s | 32 t/s | usable |
| jw-fast:8b | 1-word difficulty label | 0.2s | 0 | — | 49 t/s | correct ("routine") |
| jw-coder:30b | summarise | 24.9s | 16.4s cold | 1075 t/s | 27.5 t/s | accurate |
| jw-coder:30b | codegen + tests | 11.2s | 0 | 507 t/s | 29 t/s | code right; one test mislabelled ("equals" case asserts false) |
| jw-coder:30b | 1-word label | 0.2s | 0 | — | 41 t/s | correct |

jw-coder uses ~19 GB of VRAM when loaded. Switching between the two models costs about 6–16 s of cold load.

## Agentic subagent trials (pi agent_spawn, pinned model, thinking off)

- **researcher on jw-coder** (read-only lookup: list DEFAULT_ROUTING, find the picker): completed in 40 s with 5 tool calls. The answer was correct and gave path:line citations. The first request was 6.9K tokens and the largest 11.6K. **Pass.**
- **implementer on jw-fast** (TDD: add fitsContext + tests): ran one test command, then reported the test file as "missing" and said it was done without editing anything. This is a **false claim of completion. Fail.**
- **implementer on jw-coder, run 1**: read the files, then the stream was truncated while the model was emitting the write tool call (`acp-proxy: upstream stream truncated`). Nothing was produced. **Fail (infra/tool-call).**
- **implementer on jw-coder, run 2** (told to use the edit tool): completed in 178 s with 19 tool calls and context up to 12.9K. The tests pass (2/2), but it merged all cases into a single test and missed the margin == 1 boundary. It did report red-then-green. **Marginal pass**: fine for trivial, single-file work; not trustworthy for routine multi-file work.

## Conclusions

1. Neither local model can be the coordinator. The coordinator's first request is already 27K tokens, which exceeds the 24.5K usable window.
2. jw-coder is good for bounded, read-only lookup and research subagents that keep their tool output small, and for trivial single-file edits.
3. jw-fast is unsafe for any agentic slot where it can claim completion. Use it only for single-shot text work (summaries, labels), and the extension routes none of that today.
4. Reviewer, lens, advisor and planning slots need reasoning and long context, so they stay on cloud models.

## Routing check against this repo's matrix (after the context-aware change)

`devsys_models` (live): `fast` and `researcher` resolve to `macbook/jw-coder:30b`
(via `macbook/jw-coder*`); every other slot stays on its cloud model.

`recommendRoute` with this repo's `.development-system.toml`, a `trivial/low`
judgement, and the machine's models with their registry windows:

- Small task, one 2 KB file (~8,550 tokens): `macbook/jw-coder:30b`.
- Oversized, 80 KB of files (~28,050 tokens): `openai-codex/gpt-6-luna`, with
  the note "Context: skipped macbook/jw-coder:30b (32768-token window); the
  request is ~28050 tokens, more than 60% of their window."
