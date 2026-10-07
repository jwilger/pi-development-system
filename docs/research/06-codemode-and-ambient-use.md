# Codemode and ambient use of the development system

Status: proposal, written while the goal was paused after I8 (0.74.1).
Sources: pi 1.1.0 `docs/codemode.md`, `docs/extensions.md` ("Tool exposure",
"Activate tools dynamically", `prepareLoadout`), `docs/settings.md`,
`examples/extensions/jev-router.ts`, and this repo's guards, verifier and
tools.

## 1. What codemode is, in our terms

- `codemode` is a tool whose input is a JavaScript script run in a QuickJS
  sandbox. The script calls other tools as `tools.<name>(args)` and classifiers
  as `models.classify(...)`. Only what the script returns reaches the model.
- Nested calls are real tool calls: they pass argument validation and the
  `tool_call` / `tool_result` handlers with `toolCallId = <parent>/<n>` and
  `parentToolCallId` set. They do **not** become transcript entries; the
  session keeps a bounded `nestedCalls` record (name, args, status, no results).
- `exposure` decides how a tool is reached: `direct` (declared + callable),
  `model-only` (declared, never callable from scripts — for tools that ask the
  user or orchestrate), `codemode` (callable, listed only in the codemode
  description), `deferred` (callable, found via `tool_search`), `hidden`.
- `codemode.mode: "on"` (default) keeps declared tools declared; `"only"` hides
  them and routes everything through scripts.
- Scripts have no fs/network/timers; `bash` resolves to structured
  `{output ≤ 1 MiB, exit_code, …}`; at most four model calls run at once.
- Enabled now in `~/.pi/agent/settings.json` (`defaultTools: ["+codemode"]`).

## 2. What holds today and what is unverified

| Area | Expectation | Status |
|---|---|---|
| Hard-stop git guard, commit/push/test/lint/red-first guards | fire for `tools.bash(...)` and `tools.edit(...)` inside scripts, because nested calls hit `tool_call` | plausible per docs, **no test** |
| Test evidence / turn verifier | `tool_result` for nested `bash` is seen, so a test run inside a script counts as evidence | plausible, **no test**; the verifier's `summarizeOutput` sees the full nested output, not the script's filtered return |
| Hard-stop confirm dialogs | `ctx.ui.confirm` from inside a nested call works (same ctx) | unverified |
| Approvals keyed by `toolCallId` | we key once-approvals by command text, not id — nested ids `<parent>/n` should not matter | verify |
| Subagents | vendored runtime strips `codemode`/`tool_search` from subagent tool sets | reviewers cannot use scripts; acceptable, make it a setting later |
| Jev from scripts | `models.classify` bypasses our redaction, clipping and fixture discipline | harmless for ad-hoc use; must not become a gate path |

## 3. Where codemode gives the extension real leverage

1. **Fan-out that stays out of context.** Lens reviews (I9.3) and the 1.0
   readiness review (I11.6) spawn several agents and collect packets. Today the
   coordinator issues N `agent_spawn` calls and reads N results into its own
   context. A script can spawn, wait, and return only the parsed verdict lines
   and the file path where the full packets were written. Proposal: the lens
   review tool returns a ready-to-run script (plus the spawn payloads for
   non-codemode sessions).
2. **Verification runs with filtering.** `npm test`, `tsc`, `biome`, `knip`
   produce thousands of lines; the model needs the summary and the first
   failures. A `devsys_verify` script template (or a skill snippet) runs the
   profile's checks in parallel, returns `{tool, exit, firstFailures[]}`, and
   the test-evidence tracker still records each nested run. This is the main
   day-to-day win and needs the evidence test in §2 first.
3. **Jev questions as a namespace.** Register our question catalogue
   (`judgeSizing`, `judgeTestChange`, `judgeLenses`, …) as tools with
   `exposure: "codemode"` under namespace `devsys-judge`, so scripts get our
   redaction and clipping instead of calling `models.classify` raw. Cheap: the
   questions exist; the tools are thin wrappers.
4. **Loadout by phase.** `prepareLoadout` lets an orchestrating tool rewrite
   tool descriptions while active. We can do the same with a single
   `model-only` tool `devsys` whose description changes with phase (idle:
   "call `devsys_intake` for new work"; implementing: "red first; verify with
   …"; reviewing: "run review start/record"). This is the mechanism for
   §4 below and needs no new slash commands.
5. **Exposure hygiene.** Tools the model should never call directly from a
   script because they talk to the user (`devsys_request_approval`,
   `devsys_intake` with its select/confirm, `devsys_begin_work`) become
   `model-only`. Rarely used tools (`devsys_work_item`, `devsys_models`,
   `devsys_task_check`, `devsys_route_task`) become `codemode` exposure to keep
   the declared list short. Guard-relevant behaviour is unaffected because
   guards hook `bash`/`edit`/`write`, not our tools.

Not worth doing: `store/load` (we already persist state as session entries);
`codemode.mode: "only"` as a default (it hides our tool guidelines from the
system prompt and makes every nudge in §4 harder to see).

## 4. "Just be used": removing the slash-command burden

Today the entry points are `/devsys-start`, `/devsys-plan`, `/devsys-review`
(and I9 adds `/devsys-lens-review`, `/devsys-adr`). Prompts are user-only;
the model cannot invoke them, so nothing happens unless the user remembers.
The tools already exist; what is missing is the trigger. Four triggers, all
inside pi's existing event model:

1. **Intent at turn start.** On `before_agent_start` when `phase` is `idle`
   (or the request clearly starts something new), ask Jev one question over the
   user prompt — "does this ask for new work, a fix, a review, a question, or
   a continuation?" — and add one guideline line to `systemPromptOptions`:
   "This looks like new work; call `devsys_intake` with the request before
   editing." Same pattern as `examples/extensions/jev-router.ts`, which
   classifies the first user message to pick a model.
2. **Phase-aware tool descriptions** (§3.4). The description the model reads is
   the strongest ambient cue pi offers; it costs no turns.
3. **Verifier nudges instead of commands.** The turn verifier already sends a
   correction when a claim lacks evidence. Add two more nudges: when the model
   says the slice is done and no review round exists → "start the fresh
   review (`devsys_review_start`)"; when the diff is architecture-shaping and
   no ADR is in it → the I9.4 gate message names `devsys_adr_new`.
4. **Skills do the rest.** Skills are listed by name+description in the system
   prompt; the model loads them when the description matches. Our skill
   descriptions must say *when* they apply ("Use when sizing new work…"),
   which the skill lint already checks. The product-planning, event-modelling
   and lens-review flows become skills plus tools; the prompts stay as optional
   shortcuts and are not required.

Keep: `/devsys-status`, `/devsys-ci`, `/devsys-models` (user-facing, read or
configure). Demote: `/devsys-start`, `/devsys-plan`, `/devsys-review`,
`/devsys-lens-review`, `/devsys-adr` to "shortcuts; the tools and nudges work
without them".

## 5. Proposed plan changes

Add increment **I8b — Codemode and ambient activation** before I9 (small,
mostly tests and wiring), and amend I9/I11:

- I8b.1 Tests: nested `tools.bash("git push --force")` is hard-stopped;
  nested `tools.edit` on a test file hits the test guard; a nested `npm test`
  updates `lastTestRun`; a claim after a nested green run is not flagged.
  (Fake pi gains `executeTool` that emits nested `tool_call`/`tool_result`
  with `<parent>/<n>` ids.)
- I8b.2 Exposure pass: `model-only` for user-facing tools, `codemode` for
  rarely used ones; `devsys-judge` namespace wrapping existing questions.
- I8b.3 Intent trigger on `before_agent_start` (one Jev question, fixture,
  live test) adding a guideline line; phase-aware descriptions via a
  `model-only` `devsys` tool with `prepareLoadout`.
- I8b.4 Verifier nudges: "slice looks done, no review" and the I9.4 ADR gate
  message naming the tool.
- I8b.5 Docs: README section "You do not need the slash commands"; plan
  §1 constraint: every prompt must have a tool-and-nudge path.
- I9.3 amendment: lens review tool returns a codemode script as the primary
  form; payload list as fallback. I11.6 readiness review runs through it.
- I11.3 amendment: headless audit includes nested-call paths.

Risk: the intent trigger adds one Jev call per idle-phase turn (cheap, cached
by prompt hash). Guard tests must come first; nothing in §3–4 ships before
I8b.1 is green.
