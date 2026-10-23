# Live trials on the local machine (2026-10-22)

Host: local machine Ollama over tailscale. Both models are Q4_K_M with num_ctx 32768.

## Raw completions (/api/chat, no tools)

| model | task | wall | load | prompt speed | gen speed | quality |
|---|---|---|---|---|---|---|
| Qwen3 8B (think off) | summarise 1K-token TS module | 14.6s | 5.9s cold | 596 t/s | 29 t/s | accurate 5 bullets |
| Qwen3 8B | codegen fn + 4 node:test cases | 7.9s | 0 | 445 t/s | 32 t/s | usable |
| Qwen3 8B | 1-word difficulty label | 0.2s | 0 | — | 49 t/s | correct ("routine") |
| Qwen3-Coder 30B | summarise | 24.9s | 16.4s cold | 1075 t/s | 27.5 t/s | accurate |
| Qwen3-Coder 30B | codegen + tests | 11.2s | 0 | 507 t/s | 29 t/s | code right; one test mislabelled ("equals" case asserts false) |
| Qwen3-Coder 30B | 1-word label | 0.2s | 0 | — | 41 t/s | correct |

Qwen3-Coder 30B uses ~19 GB of VRAM when loaded. Switching between the two models costs about 6–16 s of cold load.

## Agentic subagent trials (pi agent_spawn, pinned model, thinking off)

- **researcher on Qwen3-Coder 30B** (read-only lookup: list DEFAULT_ROUTING, find the picker): completed in 40 s with 5 tool calls. The answer was correct and gave path:line citations. The first request was 6.9K tokens and the largest 11.6K. **Pass.**
- **implementer on Qwen3 8B** (TDD: add fitsContext + tests): ran one test command, then reported the test file as "missing" and said it was done without editing anything. This is a **false claim of completion. Fail.**
- **implementer on Qwen3-Coder 30B, run 1**: read the files, then the stream was truncated while the model was emitting the write tool call (`acp-proxy: upstream stream truncated`). Nothing was produced. **Fail (infra/tool-call).**
- **implementer on Qwen3-Coder 30B, run 2** (told to use the edit tool): completed in 178 s with 19 tool calls and context up to 12.9K. The tests pass (2/2), but it merged all cases into a single test and missed the margin == 1 boundary. It did report red-then-green. **Marginal pass**: fine for trivial, single-file work; not trustworthy for routine multi-file work.

## Conclusions

1. Neither local model can be the coordinator. The coordinator's first request is already 27K tokens, which exceeds the 24.5K usable window.
2. Qwen3-Coder 30B is good for bounded, read-only lookup and research subagents that keep their tool output small, and for trivial single-file edits.
3. Qwen3 8B is unsafe for any agentic slot where it can claim completion. Use it only for single-shot text work (summaries, labels), and the extension routes none of that today.
4. Reviewer, lens, advisor and planning slots need reasoning and long context, so they stay on cloud models.

## Routing check against this repo's matrix (final, 2026-10-23, after the GLM-5.3-Flash change)

Recorded from a headless pi session (`pi -p`) running the released extension
1.9.0 with this repo's committed matrix, the user config in pi's agent
directory (one `fast` pattern for the local Qwen3-Coder 30B) and the live
model registry. The local model's id is shown as `Qwen3-Coder 30B (local)`.
`openai-codex` has no credentials on this machine, so its patterns fall
through to `openai/`.

`devsys_models`:

```text
frontier: openai/gpt-6-astra (via openai/gpt-*-astra) · 272000-token window
strong: openai/gpt-6.1-sol (via openai/gpt-*-sol) · 272000-token window
fast: Qwen3-Coder 30B (local) (via the user-config pattern) · 32768-token window
planning: openai/gpt-6-astra (via openai/gpt-*-astra) · 272000-token window
advisor: openai/gpt-6-astra (via openai/gpt-*-astra) · 272000-token window
implementer: openai/gpt-6.1-sol (via openai/gpt-*-sol) · 272000-token window
reviewer: anthropic/claude-opus-5-5 (via anthropic/claude-opus-*) · 1000000-token window
lens: openai/gpt-6.1-sol (via openai/gpt-*-sol) · 272000-token window
researcher: Qwen3-Coder 30B (local) (via the user-config pattern) · 32768-token window
jev: typesafe/jev-latest (via typesafe/jev-latest) · 64000-token window
```

`devsys_route_task`:

- Small task ("Rename a local variable in one small helper", one 1 KB file):
  `Jev judged trivial/low. Slot "fast" resolves to Qwen3-Coder 30B (local)`,
  pass `{"thinkingLevel":"low"}` with the local model.
- Oversized task ("Read-only: list the exported function names in these
  files", eight modules, ~37K tokens): `Jev judged trivial/low. Slot "fast"
  resolves to opencode-go/glm-5.3-flash (via opencode-go/glm-5.3-flash).
  Context: skipped Qwen3-Coder 30B (local) (32768-token window); the request
  is ~37254 tokens, more than 60% of their window.` A second oversized task
  ("Fix a typo in a code comment", same files) gave the same route (~37242).
- The same eight files with "Rename a local variable…" were judged
  `trivial/medium` and routed to `implementer` → `openai/gpt-6.1-sol`, which is
  the shipped routing table working as intended (only `trivial/low` goes to
  `fast`).

Note: the session this goal ran in had extension 1.7.0 loaded (no user
config), so its own `devsys_models` showed `fast` → GLM-5.3-Flash. The
installed package was updated to 1.9.0 before the check above, and new pi
sessions pick up the local model.

## OpenCode Go trials (2026-10-23)

These are the same two agentic tasks as above: the read-only researcher lookup
(routing table, `resolveSlot`, `recommendRoute` with path:line), and the TDD
implementer task (`fitsBudget` with boundary tests, red then green) in a
throwaway fixture, at thinking level low. I re-ran each fixture's tests
myself afterwards; all were green, and each `budget.ts` had exactly one
`fitsBudget`.

| Model | Researcher | Implementer | Tests (re-run) |
|---|---|---|---|
| glm-5.3-flash | correct, 11 s, 45K in / 0.4K out | red then green, 15 s | 4 pass |
| glm-5.3 | not run | red then green, 20 s | 3 pass |
| beam-free | correct, 10 s | red then green, 13 s | 4 pass |
| mimo-v2.6-pro | correct, 29 s | red then green, 34 s | 4 pass |
| mimo-v2.6-flash | correct, 24 s | red then green, 39 s | 5 pass |
| qwen3.8-flash | correct, 24 s | red then green, 47 s | 5 pass |
| kimi-k2.7-code | correct, 29 s | red then green, 25 s | 3 pass |
| deepseek-v4.1-flash | 400 "This Go model requires Global regions" | same | — |
| minimax-m3.1-flash-free | 410 "has been deprecated" | same | — |
| longcat-2.5-preview-free | 402 "Endpoint is unavailable" | same | — |

Each trial is a single small task, so all it shows is that the model can work
as an agent in this harness. Quality on harder work is judged from Terminal-Bench 4.0
(docs/research/07-local-model-routing.md §4a).
