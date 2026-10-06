# Synthesis — what pi-development-system is, and why

Status: accepted basis for `docs/plan/development-system-plan.md` (2026-10-06).
Inputs: research reports `01`–`05` in this directory and the author interview
(three rounds, 2026-10-06). This document is the *why*; the plan is the *what/when*.

## 1. One-paragraph thesis

pi-development-system encodes John Wilger's engineering and product-planning
practice as **defaults with reasons**, not as a cage. The model is expected to
exercise judgement grounded in those principles, but it may **never depart
silently**: every departure from the recommended approach is a first-class,
recorded decision (what / why / cost-if-wrong / approver), and a small set of
irreversible or integrity-breaking actions require the author's explicit
approval. Enforcement is layered — deterministic code where the harness can
see the action, Jev (TypeSafe System One) where the question is a judgement
about intent or quality, prose skills everywhere else — and the system is
built to survive long sessions, compaction, and a weaker implementation model.

## 2. Lessons taken from the previous system (research 01, 02)

Keep:
- The *standards* themselves (research 02 §4): honesty about verification,
  irreversibility discipline, FCIS, semantic types, typed errors, strict lints,
  behaviour-focused tests, rationale-bearing Conventional Commits with no AI
  trailers, red CI holds work, ADR per architecture-shaping decision,
  proportional threat modelling, eval-driven skill effectiveness.
- The idea that *advisory text is not durable authority* (ADR-0004) — but
  implement authority inside the pi extension (tool_call guards, session
  entries) instead of a sidecar MCP that can drift from the harness.
- Fresh-context review and the **clean-streak** rule (author: "it has shown to
  catch things on subsequent rounds").
- Delivery-mode awareness (trunk vs PR vs local), exact-SHA CI monitoring.

Drop or redesign (research 01 §5; ADR-0003, 0013→0015, 0014→0016):
- Per-edit checkpoint ledgers, hash identity, clean-baseline bootstrap,
  47 KB review contracts, "any finding resets the streak", fail-closed on
  unavailable remote state. These optimised unforgeable evidence over
  ergonomics and made normal work fail closed when state drifted.
- Forty KB of prose about operations the agent is told not to call. Prose must
  be negative constraints with a rationale, short, and loaded lazily.
- Harness-exclusive assumptions ("if fresh-context subagents are unavailable,
  stop"). Capabilities are detected; absence degrades, it does not halt.

## 3. Evidence that shaped the design (research 05 Part B)

- Negative constraints that name a command/path move behaviour; positive
  directives mostly do not (arXiv 2604.11088, 2610.04832). → Principles are
  written as "never X because Y", each with a rationale line.
- Instruction following decays with context size regardless of relevance;
  external checklists at gates beat self-checks 10/10 vs 5/10 (2607.17937).
  → Gates are external code + Jev, re-injected at the *end* of context.
- A sanctioned escalation channel cuts covert gaming 23.6 % → 5.3 %
  (2608.29460). → The departure ledger *is* that channel; blocking without an
  exit invites gaming.
- "CLAUDE.md is a write-only channel" (4–16 % of do-nots backed by controls).
  → Anything that matters is backed by a `tool_call` guard or a Jev check.
- Weak implementers need one slice per clean context, exact files/interfaces,
  the first failing test, `Run:`/`Expected:`, no TBDs, and a separate reviewer
  (superpowers, Anthropic long-running harness). → Plan/task format §8.
- Compaction is not sufficient; state must live in files and be re-synced.

## 4. Principles the system encodes (people → practice)

| Source | Encoded as |
|---|---|
| Cagan | Four risks checklist and outcome-over-output in the brief template; "build to learn vs build to earn" sizing question. |
| Torres | Decision register with assumptions; opportunity → ≥2 solutions compared before committing; one-question-at-a-time interview loop. |
| Frost | Design-system profile skill (tokens → components; AI constrained to DS materials). |
| Beck | Canon TDD skill (test list, one test, minimal change); Tidy-First structural/behavioural commit separation (Jev-checked); augmented-coding warning signs feed the drift detector. |
| Wlaschin | Semantic types / illegal states unrepresentable; typed errors as values; the extension's own state is an explicit state machine. |
| Dymitruk | Event model slices (command/view/automation), GWT per command, information-completeness check. |
| Dilger | Machine-readable slice files are authoritative; one slice per clean context; "no spec in the model without an equivalent in code". |
| Fowler | Decision provenance (chosen strategy, rejected alternatives, forcing constraints) ships with the work; "generation is cheap, confidence is not" → evidence before claims. |
| Farley | Slice as experiment; testability as a design gate. |

## 5. Decisions from the author interview (binding)

| # | Decision | Rationale / notes |
|---|---|---|
| D1 | Three enforcement tiers: **hard stop** (user approval), **soft gate** (agent records a departure, then proceeds), **advisory** (skills). | Hybrid "hard policy + sanctioned escape hatch" has the best evidence; ADR-0003 regret. |
| D2 | Hard stops = irreversible git/history ops + any departure from a **non-negotiable** (§6). Test weakening and scope changes are soft gates *unless* Jev judges the motive is making a gate pass (then it is the "no quality shortcuts" non-negotiable → hard stop). | Author choice, round 1. |
| D3 | Universal principles + **language profiles** (Rust, TypeScript first). | Weak models need concrete idioms; principles must not be Rust-flavoured. |
| D4 | Full planning stack available, **proportional by default**, and the system does **not enforce** event modelling or a particular architecture (both preferred; skipping is a recorded departure, never a block). | Foundry friction: 10 days of planning, invented slices. |
| D5 | Jev is a **runtime component** used for: intent classification at gates, artifact quality judgement, model/effort routing of subagents, drift/departure detection. Policy and thresholds live in deterministic code. | Author, rounds 1 and m00060. |
| D6 | Vendor pi-subagent-manager into this package (replace, not coexist; keep tool names and agent-file format so existing custom agents work) and make **any** changes that suit this extension — starting with per-spawn `model` and `thinkingLevel`. | Author, round 2. No separate package/dependency. |
| D7 | Work tracking: repo files + pi-goal-x by default; adapter interface so GitHub Issues / Jira / Linear can be the authority per project. | Author, round 2. |
| D8 | Departures and approvals live in a **committed decision log** (`docs/decisions/`) **and** a pi custom session entry (re-injected after compaction). ADRs stay separate for architecture-shaping decisions. | Author, round 2. |
| D9 | Default delivery: trunk — small commits, push on green, watch CI for the exact SHA, red CI holds unrelated work. Repo-local policy overrides. | Author, round 2. |
| D10 | Main-agent model: recommend + record, never auto-switch; prefer spawning an **advisor** subagent on a stronger model over switching the coordinator. | Author, round 3. |
| D11 | Review: fresh-context reviewer per slice with Jev-chosen lenses; **keep the clean-streak rule** but make it recoverable (only blocking/should-fix findings reset; nits → follow-ups; state persisted; soft-gate override allowed). | Author, round 3. |
| D12 | Jev unavailable/low-confidence → degrade to conservative deterministic checks and *ask* (TUI) or *block* (headless); never silent pass. | Author, round 3. |
| D13 | Event modelling ships as a compact JSON/YAML slice format with a small schema, **replaceable by a future dedicated event-modelling extension** (capability detection). | Author, round 3. |
| D14 | **Model matrix is per project**, written by `/devsys-models` into `.development-system.toml` `[models]`. Slots (`frontier/strong/fast` tiers + `planning/advisor/implementer/reviewer/lens/researcher/jev` roles) hold ordered candidates; candidates are family patterns (`openai-codex/gpt-*-sol`, `anthropic/claude-opus-*`) resolved to the **newest model this machine has credentials for**, so one committed file works for collaborators with different accounts. Shipped defaults use the latest OpenAI astra/sol/terra/luna and Anthropic fable/opus/sonnet/haiku families (tiering from catalog cost and pi's own `jev-router.ts` example: astra≈fable/opus = frontier; sol≈sonnet = strong; terra = mid; luna≈haiku = fast). No model id is hard-coded outside the defaults module and `agents/*.md`. **No provider/model allow/deny lists** — the matrix is the whole policy. `[routing]` maps difficulty/risk → slot + thinking level, never → model id. | Author, post-plan review. Supersedes the global-matrix + allow/deny idea. |
| D15 | **Jev is consumed through pi's classifier provider path** (`ctx.modelRegistry.findOfType("classifier", …)` + `classify()`), not through `@typesafe-ai/sdk`. Candidates in `[models] jev` default to `typesafe/jev-latest`, `openrouter/typesafe/jev-latest`, `opencode/jev-1.13`, `cloudflare-workers-ai/typesafe/jev`, `vercel-ai-gateway/typesafe-ai/jev`; first with credentials wins. Removes a runtime dependency and lets non-TypeSafe users get Jev gates. | Author: "if there is a jev provider, let's use it". |

## 6. Non-negotiables (tier 1 — departure requires the author)

Each is phrased as a negative constraint with its reason; this list is the
system-prompt section verbatim (kept short on purpose).

1. **Never rewrite pushed history or force-push** (amend/rebase/reset of pushed
   refs, `--force*`, branch deletion on shared remotes) — because it destroys
   other people's basis for trust.
2. **Never weaken verification to make a gate pass** (delete/skip/loosen tests,
   suppress a lint, change expected values to match output, bypass hooks with
   `--no-verify`) — because a green gate must mean the same thing afterwards.
   Changing a test because the *requirement* changed is a soft gate.
3. **Never claim something was verified, run, or green that was not** — because
   the record of evidence is the product; "evidence comes before claims".
4. **Never push on a red trunk** except a change whose purpose is fixing the
   failure — because unrelated work on red hides the signal.
5. **Never work around an unresolved gate** (stop, record, ask) — because a gate
   you can route around is not a gate.
6. **Never violate repo-local delivery policy** (delivery mode, protected
   branches, required reviews) — because the repo, not the tool, owns policy.
7. **Never let secrets leave the machine** in commits, logs, eval cases, or
   subagent prompts without sanitisation — because exfiltration is irreversible.
8. **Never commit without a rationale-bearing Conventional Commit message, and
   never add AI attribution trailers** (`Co-Authored-By`, `Generated-by`) —
   because the message is the durable why; attribution noise isn't.
9. **Never make an architecture-shaping decision without an ADR** (new
   dependency class, boundary change, persistence model, public contract) —
   because "Revisit when" is how decisions stay honest.
10. **Never ship model-visible instructions (skills/prompts/Jev questions)
    without the corresponding evidence check** (fixture or eval) — because
    effectiveness is eval-driven, not vibes.

## 7. Defaults with judgement (tier 2 — departure recorded by the agent)

RED-first applicability (with documented exemptions); FCIS; semantic types;
typed errors; structural vs behavioural commit separation; recommended
artifact set for the work's sizing (brief, decision register, journeys, event
model, lens review, ADR); fresh-context review before commit; clean-streak
depth; scope expansion from a review finding; lint suppression (needs
rationale comment); model↔phase pairing; threat-model depth; context budget;
"an hour without a pushed commit" cadence check; language-profile idioms.

## 8. Architecture of the extension (conceptual)

```
principles/*.md ─┐  (negative constraints + rationale; compact)
skills/**        ─┤─ loaded lazily; profiles per language/domain
prompts/*.md     ─┘  slash commands (/devsys-start, /devsys-adr, …)

extensions/development-system.ts   entry; wires the modules below
src/core/        pure domain: Phase, Sizing, Gate decisions (Allow | Block | RequireDeparture | RequireUser),
                 Departure, ReviewState (clean streak), Slice/Task records   ← FCIS "functional core"
src/gates/       tool_call guards (git, tests, commits, scope) → call core + jev, then UI/block
src/jev/         TypeSafe client wrapper: availability, timeouts, cache, fixtures; one narrow question per fn
src/state/       session custom entries (authority in-session) + docs/decisions writer + .development-system.toml
src/context/     system-prompt section, end-of-context tail (active slice, open departures, gate status),
                 compaction summary + post-compaction resync, turn_end verifier
src/subagents/   vendored pi-subagent-manager (+ per-spawn model/thinkingLevel, devsys agent defs, Jev routing)
src/review/      fresh reviewer orchestration, lens selection, finding severity, clean streak
src/tracker/     Tracker interface + adapters (repo-files, github; jira/linear later) + pi-goal-x hand-off
src/planning/    brief/decisions/journeys/event-model slice schema v1 + validator
src/core/models  model matrix: slots, family patterns, newest-version resolution (pure; D14)
test/            node --test; fake ExtensionAPI harness; Jev fixture evals (opt-in via DEVSYS_JEV_FIXTURES=1 + any Jev credential)
```

Key mechanics (research 04): guards return `{block, reason}` with an
*instructive* reason that names the tool to call (`devsys_record_departure`)
or the approval needed; headless (`!ctx.hasUI`) blocks by default; state of
record = `pi.appendEntry("devsys-*")` entries rebuilt in `session_start`; the
model sees state via a short `context` tail and a `before_agent_start`
system-prompt section; `session_before_compact` emits a `## Development System
State` block; `turn_end` may return `continue: true` **once** per turn, with a
per-session cap, when Jev flags an unverified claim or drift.

## 9. Jev usage map (runtime)

| Question (one narrow judgement each) | Primitive | Consumer | Fallback |
|---|---|---|---|
| Is this shell command a history rewrite / destructive op? | choice | git guard (after regex fast-path) | regex only; ambiguous → ask/block |
| Does this diff weaken or remove verification? Motive: requirement change vs gate gaming vs refactor? | noul + choice | test guard (tier 2 → tier 1 escalation) | any test-file deletion/skip → ask |
| Does this commit message carry rationale? Does the diff mix structural and behavioural change? | noul ×2 | commit guard | Conventional-Commit regex; no mix check |
| Does the assistant's last message claim verification unsupported by tool evidence? | noul | turn_end verifier | off (advisory) |
| Does the last turn deviate from the active slice / add unrequested scope? | noul | drift detector | off |
| Is this task record ready for a weaker implementer (files, interfaces, first test, Run/Expected)? | score | plan hand-off, subagent routing | checklist regex |
| Task difficulty / risk → slot + thinking level (slot → model via per-project matrix, D14) | choice ×2 | subagent router (`[routing]` in config) | `routine/low`; unresolvable slot → agent-type default |
| Which review lenses apply to this diff? | noul per lens | review orchestrator | core lenses only |
| Finding severity (blocking / should-fix / nit / false-positive) | choice | clean-streak accounting | all findings reset (old behaviour) |
| Which planning artifacts does this work need (sizing)? | choice + noul per artifact | /devsys-start | ask user |
| Semver bump (exists) | choice | release scripts | Jev-Override trailer |

Design rules: thresholds in code; always include a no-match outcome; run
independent questions over the same state in parallel; cache by content hash
within a session; every question has a fixture file under `evals/jev/`.

## 10. What "done" looks like for v1.0

- Author can open any repo, run `/devsys-start`, answer a sizing question,
  and get a recommended artifact set; skipping any is a recorded departure.
- Hard stops fire for the ten non-negotiables; soft gates for the defaults;
  decision log and ADRs accumulate in the repo and survive compaction.
- Subagents (advisor, implementer, reviewer, researcher, product lenses) are
  spawned with Jev-routed model/effort; reviews follow the recoverable clean
  streak.
- Plans produced for weaker models follow the task format and can be handed to
  pi-goal-x.
- The extension dogfoods itself: from increment 1 onward, its own development
  runs under its own gates.
