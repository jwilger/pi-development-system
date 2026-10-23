# Routing work to local models (Qwen3-Coder 30B, Qwen3 8B)

Status: research for the local-routing goal, written 2026-10-22.
Evidence: the inventory and live trials in `work/local-routing/` (models,
credentials, slot consumers, session token counts, trial transcripts), plus
the public sources listed at the end.

## 1. What is available

| Tier | Models (this machine) | Billing |
|---|---|---|
| Frontier | openai/gpt-6-astra, anthropic/claude-opus-5-5, claude-fable-5.1 | ChatGPT / Claude subscriptions (rate-limited) |
| Strong | openai/gpt-6.1-sol (272K), claude-sonnet-5-5 (1M) | subscriptions |
| Fast | openai/gpt-6-luna, claude-haiku-5-5 | subscriptions |
| Open-weight cloud | opencode-go: kimi-k3, glm-5.3, deepseek-v4-pro/v4.1-flash, qwen3.8-max/flash, … | OpenCode Go subscription |
| Local | Qwen3-Coder 30B (local) (Qwen3-Coder-30B-A3B, Q4_K_M), Qwen3 8B (local) (Qwen3-8B, Q4_K_M) | free; 32,768-token window; no reasoning mode |
| Classifier | typesafe/jev | out of scope (a different kind of model) |

## 2. Public evidence about the cloud tiers (October 2026)

- Real-SWE 1.1 (private enterprise codebases): Opus 5.5 at 56.8%, GPT-6
  Astra at 56.0%, Sonnet 5.5 at 51.2%, with GPT-6.1 Sol next.
- Terminal-Bench 4.0 (morphllm leaderboard): Claude Code + Opus 5.5 scores
  64.8% and + Sonnet 5.5 scores 61.8%. Codex + GPT-6.1 Sol ties GPT-6 Astra
  at 58.2%, at $1.92 per task, a fifth of Astra's cost.
- Senior SWE-Bench: on tasteful solves Opus 5.5 is ahead of Astra (39.3% vs
  36.8%), but Astra takes half the steps and output tokens.
- Haiku 5.5 vs GPT-6 Luna: both list at $0.10/$0.50 per M tokens. They tie on
  real jobs (93.8% vs 94.1%, Buoy). Haiku is far stronger on agentic and
  computer-use tasks (OSWorld 72.4% vs 48.9%) and faster. Luna is about 29%
  cheaper per job and better for long-running workers that replay history.
  Developer guidance: Haiku for short, bounded subagent calls, Luna for long
  workers.
- Qwen3-Coder-30B-A3B: 51.6% SWE-bench Verified with OpenHands and 100 turns,
  per the vendor. The claim is disputed (no reproduction details). Qwen3-32B
  scores 41–46% on the Aider polyglot benchmark without thinking; the 8B
  scores well below that. Local-agent guides report that small models "lose
  track of the plan on anything involving 3+ files or iterative feedback" and
  that quality degrades ("context rot") from ½–⅔ of the served window.

## 3. What the 32K window means here (measured)

- The coordinator's first request is 21–27K tokens (system prompt, skills,
  tool schemas). billion-context refused Qwen3-Coder 30B as coordinator at 29K
  tokens against a 24.5K usable window (32,768 minus the output reserve).
  **A local model can never be the coordinator.**
- The first request of a subagent session is 5.9–6.9K tokens on local models
  and about 10.5K on Opus (larger prompt). That leaves about 14–18K of working
  space before the ½–⅔ degradation zone, which is roughly 4–6 file reads.
- So a local subagent is viable only when its task text plus the files it
  must read fit in that budget. Routing must check this, not assume it.

## 4. Live trials (details in `work/local-routing/trials.md`)

| Trial | Qwen3-Coder 30B | Qwen3 8B |
|---|---|---|
| Single-shot summary / codegen / label | accurate; 27–29 tok/s; 16 s cold load | accurate; 29–49 tok/s; 6 s cold load |
| Researcher: read-only repo lookup with citations | **pass**: 40 s, 5 tool calls, correct path:line | not run; ruled out by the implementer result |
| Implementer: one-function TDD task | run 1: the stream was truncated mid tool call; run 2: **marginal pass** (178 s, 19 calls, tests green, weak test design) | **fail**: claimed done without editing anything |

## 5. Recommendations per activity

| Activity / slot | Consumers | Recommendation | Why |
|---|---|---|---|
| Coordinator (main session) | user | cloud only (unchanged) | does not fit 32K |
| frontier / planning / advisor | architect, advisor, tasker, `expert/*` routes | gpt-6-astra → opus-5-5 (unchanged) | top of Real-SWE; fewer steps than Opus |
| strong / implementer | implementer, coder, `routine`/`complex` routes | gpt-6.1-sol → sonnet-5-5 (unchanged) | Astra's score at a fifth of the cost; local failed multi-step TDD |
| reviewer | devsys_review_start | opus-5-5 → sonnet → sol (unchanged) | quality gate; needs reasoning and the whole diff |
| lens | product lenses | @strong (unchanged) | needs reasoning over long briefs |
| fast | `trivial/low` routes, researcher default | **Qwen3-Coder 30B first, when the task fits**, then luna → haiku | passed the read-only lookup trial; trivial single-file edits pass marginally; free |
| researcher | researcher agents | **@fast** (local first, when it fits) | bounded codebase lookups suit Qwen3-Coder 30B; web research overflows the window and falls back to cloud |
| jev | judge tools | unchanged | out of scope |

Where the local candidate lives: the local model's provider and model names
are specific to one machine, so the committed `.development-system.toml`
keeps a cloud-only matrix. The local pattern goes in the user config in pi's
agent directory (`~/.pi/agent/development-system.toml`, `[models] fast = [...]`),
which puts it ahead of the repo's `fast` candidates on that pi only
(ADR 0010). `researcher` follows through `@fast`.

Task-routing cells (`devsys_route_task`, shipped `[routing]` defaults, which
this repo keeps unchanged; the change is in which model each slot resolves to):

| Difficulty / risk | Route | Resolves to here | Local? |
|---|---|---|---|
| `trivial/low` | fast · low | Qwen3-Coder 30B when the estimate fits, else gpt-6-luna | yes, when it fits |
| `trivial/medium`, `trivial/high` | implementer · medium | gpt-6.1-sol | no; any risk needs a model that keeps red-first discipline |
| `routine/low` | implementer · medium | gpt-6.1-sol | no; local failed the multi-step TDD trial |
| `routine/medium`, `routine/high` | strong · high | gpt-6.1-sol | no |
| `complex/*` | strong · high | gpt-6.1-sol | no; needs reasoning and more than 32K |
| `expert/*` | frontier · high | gpt-6-astra | no |

Qwen3 8B is **not** put in any agentic slot. It claimed a TDD task was done
without doing it, which breaks non-negotiable 3. The extension makes no
single-shot text completions today, so the 8B has no consumer here. It
remains useful for the user's own ad-hoc use and for future single-shot
features (summaries, labels).

Routing rule for any context-limited model (implemented, ADR 0009): estimate
the request as 8,000 tokens of subagent overhead plus a quarter of the task
text's characters plus a quarter of the named files' bytes. Skip a candidate
when the estimate is more than 60% of its known context window, fall through
to the next candidate, and say so in `devsys_route_task`. The spawn guard can
only count the task text, because it cannot see the files a subagent will read.

## 6. Expected savings

The extension routes almost nothing to frontier models except planning,
advisor and `expert/*` work, which stay on the cloud. Local routing therefore
saves **fast-tier and some strong-tier** usage, not frontier usage:

| Activity / slot | Before | After | Expected change in cloud usage |
|---|---|---|---|
| researcher (codebase lookups) | gpt-6-luna | Qwen3-Coder 30B when it fits | most lookups leave the cloud; large or web research still falls back to Luna |
| `trivial/low` routed tasks (fast) | gpt-6-luna | Qwen3-Coder 30B when it fits | most move local; tasks naming large files stay on Luna |
| implementer / strong | gpt-6.1-sol | unchanged | none; local failed multi-step TDD |
| reviewer | claude-opus-5-5 | unchanged | none; the quality gate needs reasoning |
| lens | gpt-6.1-sol | unchanged | none |
| frontier / planning / advisor | gpt-6-astra | unchanged | none; frontier use is not reduced |
| coordinator | cloud | unchanged | none; does not fit 32K |

On a subscription plan this mostly spends less of the rate-limit allowance
rather than saving money. At list price the saving is small: Luna costs
$0.10/$0.50 per M tokens, so a 20K-token lookup costs well under a cent. The
honest result is that the 32K window and the trial failures limit local
models to the cheapest tier's work, at the price of latency (40 s vs a few
seconds, plus 6–16 s cold loads when the local machine swaps models).

## Sources

- realswe.com (Real-SWE 1.1, Oct 2026); morphllm.com/best-ai-coding-agents-2026;
  senior-swe-bench.snorkel.ai/agents; swe-marathon.org
- datacamp.com/blog/claude-haiku-5-5-vs-gpt-6-luna; buoy.gg/blog/claude-haiku-5-5-vs-gpt-6-luna;
  developersdigest.tech/blog/haiku-5-5-vs-gpt-6-luna-subagent; anthropic.com/claude-haiku-5-5
- huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct (+ discussion 30 on the 51.6% claim);
  aider.chat/2025/05/08/qwen3.html
- llmconfigurator.com context-engineering guide for local coding agents (32K budget split);
  dev.to Cline + LM Studio 32K guide (small-model failure modes)
