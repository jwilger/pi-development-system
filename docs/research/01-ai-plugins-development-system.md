# Research 01 — `ai-plugins/plugins/development-system` (v6.12.5)

Source: `/home/jwilger/src/ai-plugins/plugins/development-system/` plus repo-level `AGENTS.md`, `.development-system.toml`, `.development-discipline/final-review.toml`, `docs/rules/*.md`. Read-only survey; all claims cite paths relative to the plugin root unless prefixed with `ai-plugins/`. Rust sources (54 files across `components/development-discipline/rust/` and `components/tiber/rust/crates/{tiber-cli,tiber-core,tiber-git,tiber-mcp,tiber-server}`) and `.plugin-eval/` fixture dirs (9 of them, e.g. `skills/tasks/.plugin-eval`, `components/development-discipline/skills/final-review/.plugin-eval`) were noted but not read.

---

## 1. Inventory

### Manifests / runtime surface
| Item | Purpose | Trigger |
|---|---|---|
| `plugin.json` | Codex Agent-Plugins manifest; `extensions.com.openai.hooks=./hooks/codex.json`; capabilities `["Read"]`; default prompts ("Set up this project with my standard development system", "Use my configured development workflow for this change", "Check this project for conflicting plugins and settings") | install |
| `package.json` | pi package: `pi.extensions: ["./pi/extension.ts"]`, `pi.skills: ["./skills"]` (component skills deliberately excluded — ADR-0018) | `pi install` |
| `mcp.json` | two stdio MCPs: `development-discipline` → `./bin/development-discipline-mcp --service plugin-advisory`; `tiber` → `./bin/tiber mcp stdio` | harness start |
| `hooks/codex.json` | single `SessionStart` hook → `bin/development-system session-start --project "$PWD" --format json`, 900 s timeout | every Codex session |
| `pi/extension.ts` | "This file owns no policy" (line 3): registers `mcp.json` servers with `exposure: "direct"`, runs `session-start --harness pi` in background, adds `/development-system doctor` | pi `session_start` |
| `bin/development-system` (275 lines) | `session-start` conflict inspector (warns on shadowing `mcp.json` entries, disabled hooks/MCP, other plugins; `supply_chain_recommendation ... install_only_development-system`), `setup` (preset `personal-trunk` only), binary repair | hook / doctor |
| `bin/tiber`, `bin/development-discipline-mcp`, `lib/installed-binary.sh` | self-repairing launchers for host-local Rust binaries in `$PLUGIN_DATA/ai-plugins/development-system/<version>/<host>/` (README "Host-local binaries") | MCP launch |
| `scripts/write-local-checkpoint.sh` (231), `transition-local-checkpoint.sh` (9), `record-checkpoint-failure.sh` (111), `checkpoint-operations.mjs` (1194), `checkpoint-record.jq` (92) | durable per-edit checkpoint ledger with flock + CAS (see §4) | agent-invoked |
| `scripts/replay-review-operation.{sh,md}` | bwrap-sandboxed replay of one failed `final_review.*` persistence op | persistence failure |
| `components/development-discipline/scripts/final-review-scope-hash.sh` | the ONLY sanctioned way to compute `diff_hash` for final review | before every `final_review.advance` |

### Agents (`agents/*.toml`, all `sandbox_mode="read-only"`)
- `advisor` — planning/tradeoff advisor; "Recommend a default path with reasoning; do not present neutral menus." May spawn explorer subagents (`max_depth=2 max_threads=4`).
- `bounded-helper` (`model-routing-bounded-helper`) — mechanical inventory/extraction/classification only; refuses if parent omits "finite input set, expected result, transformation/classification rule, and a separate deterministic method that can verify every result."
- `strong-reviewer` — architecture/security/safety/disputed-verification/readiness lens; "Do not silently substitute a different model."
- `strong-worker` — "Read-only strong-reasoning implementation planner that prepares isolated service requests."
- `substantive-worker` — "Read-only implementation planner that prepares structured workspace-editor requests" (body text still says "You may edit files inside the authorized workspace" — contradiction with its sandbox mode).

### Top-level skills (`skills/*/SKILL.md`) — the public routing index
| Skill | Purpose | Trigger (frontmatter) |
|---|---|---|
| `development-workflow` (40 KB + `references/workflow-rules.md`, `checkpoint-operations.md`) | the master per-edit checkpoint/TDD/review/CI state machine | "making repository changes, debugging, handling review feedback, verifying work, conducting final review, recovering CI, deciding the next development lifecycle step…" |
| `delivery` | commit/push/PR/tag/CI-readiness rules; routes to babysit-pr | delivery actions |
| `tasks` | Tiber task board; requires `[features].tiber = true` | "whenever Tiber or origin/tiber is mentioned", backlog admission, publication conflicts |
| `advisor` (+`references/playbook.md`) | spawn read-only advisor subagent for fuzzy planning | tradeoffs, scope, spec, ticket planning, "challenge this" |
| `setup` | `setup.preview` → review lefthook.yml → `setup.apply`; "Preview and confirmation are mandatory even if asked to skip them." | project bootstrap |
| `model-routing` (+`references/runtime-mappings.md`) | map agent roles → bounded/standard/strong tier + scrutiny; `[model_routing]` precedence | before spawning any subagent |
| `engineering-standards` | thin router to component contract; FC/IS, parse-don't-validate, typed errors, threat-model proportionality | "starting or substantially changing a serious project" |
| `worktrees` | linked-worktree rules (`git check-ignore -q -- <root>` before `git worktree add`) | concurrent mutable tasks / explicit request |
| `agentic-systems` (+`references/system-contracts.md`, `evaluation.md`) | LLM-system guardrails; requires `[features].agentic_systems = true` | LLM/RAG/agent/eval work |
| `eval-case-reporting` | scrub + preview + approve + post eval-case issue; requires `[features].eval_case_reporting = true` | surprising/brittle assistant behaviour |

### Component skills (`components/*/skills/**/SKILL.md`) — retained contracts, loaded by the routers above
- **development-discipline** (`components/development-discipline/README.md`: "John's personal workflow plugin… should replace the upstream `superpowers` variants"): `development-workflow` (phase router), `change-preflight`, `test-driven-development`, `verification-before-completion`, `final-review` (47 KB + `references/mcp-protocol.md` 41 KB), `delivery-workflow`, `rationale-commit-messages`, `receiving-code-review`, `systematic-debugging`, `ci-failure-follow-up`, `writing-skills`.
- **tiber**: `tiber` (operations contract), `new-task` (`disable-model-invocation: true`, allowed-tools = only `mcp__tiber__tiber_*`).
- **engineering-standards**: `engineering-standards` (guardrail), `scaffold` (+`references/playbook.md` per-ecosystem lint/mutation/nix recipes).
- **agentic-systems-engineering**: `agentic-systems-engineering` (+6 refs: agent-loops, contracts, cost-routing, delivery, eval-design, observability-security, rag), `evaluate-stochastic-systems`, `scaffold-agentic-evals` (promptfoo `0.121.19`), `agentic-delivery`.
- **babysit-pr**: forge-agnostic PR/MR loop (`scripts/detect-forge.sh`, bats tests).
- **worktrees**: `setup` (+`references/worktree-ready-setup.md`), `scripts/worktree-ports.sh`, bootstrap/teardown templates, retired no-op `worktree-guard.sh`.
- **eval-case-reporter**: `submit-eval-case` (+`references/scrubbing.md`).
- **advisor**: README only; skill lives at plugin root.

---

## 2. The workflow as encoded

### Phase order (from `components/development-discipline/skills/development-workflow/SKILL.md` "Usual sequence" and `skills/development-workflow/SKILL.md`)
0. **Session start / setup gate** — `SessionStart` hook warns about conflicts; plugin "is inert outside a Git repository or without a valid schema-3 `.development-system.toml`" (README). Setup = `setup.preview` → user reviews scopes + command catalog + generated `lefthook.yml` pre-commit/pre-push selections → `setup.apply confirmed: true` (`skills/setup/SKILL.md`). Never stages/commits config.
1. **Task intake (optional, Tiber)** — `tasks`/`new-task`: `tiber.search` all statuses first; create in `backlog`; product-manager-readable title; transition to `in-progress` before working; one active ticket (`AGENTS.md` "Backlog management"). Before any new task: last completed CI run on trunk must be success, else repository-wide hold (`ci-failure-follow-up`).
2. **Planning (optional)** — `advisor` subagent for fuzzy scope; outputs `recommendation|spec|ticket-plan` (playbook: "No 'TBD'"). Skipped for narrow bugs / "just build it".
3. **Change-preflight (mandatory for substantive change)** — `components/development-discipline/skills/change-preflight/SKILL.md`: emit `Change classification:` + all ten "Affected surfaces" rows (Behavior, Tests, Documentation, Configuration, Packaging, Release artifacts, Migrations, Operational startup, Evaluations, User workflows) each with relation. "Do not skip it merely because an edit is small."
4. **Delivery mode selection (early)** — `delivery-workflow`: current user direction > repo instructions (`AGENTS.md`, `.development-system.toml [delivery].mode`) > router > specialists. Modes: `direct-to-trunk` | `pull-request` | `local-only`. "Do not invent a pull request."
5. **Implementation loop (TDD + per-edit checkpoint)** — `test-driven-development/SKILL.md` 8-step loop; `skills/development-workflow/SKILL.md` state machine: `initialize` (clean baseline only) → `begin-edit` → `edit-pass`/`edit-fail`/`edit-invalid-test` → state `passing-awaiting-gates-or-review` → `lightweight-review-pass` (one fresh-context subagent, combined lenses incl. production-risk) → `commit-through-pre-commit-hook` (Lefthook runs the gate) → `committed` → `exact-verify-pass` (reviewed snapshot ≡ commit tree, message, signature) → `push` (Lefthook pre-push) / `record-local-delivery` → `pushed-or-delivery-mode-equivalent` → `ci-register`/`ci-observe` per exact SHA → next increment. States: `failing`, `awaiting-causal-edit`, `passing-awaiting-gates-or-review`, `committed`, `pushed-or-delivery-mode-equivalent`.
6. **Verification before completion** — every claim ("tests pass", "bug fixed", "ready") mapped to fresh, authoritative, scope-complete evidence; record shape `Verification record / Blocker / Claim limit`.
7. **CI follow-up (conditional, pre-emptive)** — a completed failed required job preempts everything: claim Tiber incident (`tiber.ci_recovery.claim`), heartbeat 15 min / 60 min lease, classify `caused|unrelated|transient`, exactly one of {tested causal repair, unchanged-SHA rerun}; "There is no diagnostic-commit path."
8. **Terminal (final) review (mandatory before any readiness claim)** — `final-review/SKILL.md`: only after ALL increments delivered; `workspace-reader.status` preflight attestation; `final_review.assess_risk` → scout → `plan` → one fresh-context subagent per lens per iteration (8 default lenses, `production-risk-footguns` always) → `filter_findings`/`advance` with `diff_hash` → verifier → ≥3 consecutive complete finding-free iterations. Any finding resets the streak; any source change = remediation → new checkpoint + full lens rerun. Optionally recorded in Tiber via `tiber.review.record` when `[final_review].minimum_clean_reviews` set.
9. **Delivery readiness** — exact-SHA terminal CI success + clean final review; PR mode → `babysit-pr` loop to merge; Tiber `close-from-trailers` closes `Closes:` tasks.
10. **Review feedback (conditional)** — `receiving-code-review`: verify each point, additive commits, reply in-thread.

### Gates between phases (mandatory unless noted)
- Setup preview/confirm (cannot skip even on request) → config exists.
- Clean baseline worktree before `initialize`; dirty = "recovery hold, not a bootstrap shortcut" (`skills/development-workflow/SKILL.md`).
- RED observed before production code (when RED applies; 8 exemptions).
- Focused test after *every* file edit; at `failing` only the causal edit is allowed; commit/push prohibited.
- Lightweight fresh-context review before every commit; "never run the same gate separately first".
- Lefthook pre-commit fires via real `git commit`; pre-push via real `git push`.
- Exact-identity verification after commit (tree/message/signature).
- CI bound to exact pushed OID; terminal success required.
- Final review attestation preflight (`contract_version >= 2`, `minimum_clean_iterations >= 3`, `durable_pending_assignment_recovery: true`) else fail closed.
- 3 clean iterations; `ship` budget choice "cannot bypass it" (README).
- Optional: Tiber task gate, backlog capacity, worktree isolation, agentic evals, eval-case reporting (all feature-flagged).

### Artifacts produced
- `.development-system.toml` (schema 3) + `lefthook.yml` (setup).
- Checkpoint ledger: `$(git rev-parse --git-common-dir)/development-system/checkpoints/<id>.latest` (`checkpoint-v1 {json}`), `.latest.operations/<op>.json` receipts, `.latest.pending-operation` journal.
- Change-preflight record (prose, fixed shape); Verification record; CI recovery record (Incident/Failure record/Diagnosis/Next action/Release proof).
- Commits: Conventional subject + rationale body, signed, no AI trailers.
- Final-review state on "separate local-only Git-backed EventCore authority", one SQLite report per worktree+work item in `$XDG_STATE_HOME`, `final_review.yield_report` / `final_review.out_of_scope_report`.
- Tiber events on orphan `tiber` branch (tasks, notes mirroring `checkpoint-v1`, reviews, CI incidents).
- ADRs (`docs/adr/NNNN-*.md`, MADR-lite) for every architecturally significant decision; eval artifacts under `evals/out/`, `site/evals/`.
- Optional: advisor spec/ticket-plan; sanitized eval-case GitHub issue.

---

## 3. Principles & standards (sharpest verbatim rules)

**TDD / testing**
- "New or changed first-party production behavior starts with a failing test unless a clear existing failure already proves the change." — `skills/development-workflow/references/workflow-rules.md`
- "RED must fail because the behavior is missing, not because of typos, compile errors, broken setup, or missing fixtures." / "No production code before the failing test has been observed when RED applies." / "You want to 'add tests after' | Stop; that is not TDD" — `components/development-discipline/skills/test-driven-development/SKILL.md`
- "A test is not black-box merely because it runs outside the production module; it must not read private symbols, source files, committed repository text, or workflow structure to infer behavior." — same file
- "Never open a committed repository file merely to assert expected text or structure." / "Never test CI workflow definitions or job structure." — same
- "Remove functionality before changing its tests." / "Never add a replacement test whose sole assertion is that the removed capability is absent." — `workflow-rules.md`
- "One test at a time." "One contract and failure reason per test." — TDD skill
- "Vertical slices, not layers… Never plan component-by-component waterfalls." — `components/engineering-standards/skills/engineering-standards/SKILL.md`
- Mutation testing: "100% actionable mutation score" with documented denominator (`engineering-standards/SKILL.md`, `ai-plugins/docs/rules/testing.md`).

**Architecture / types / errors** (`components/engineering-standards/skills/engineering-standards/SKILL.md`, `ai-plugins/docs/rules/`)
- "Functional core, imperative shell. Keep deterministic domain decisions referentially transparent… have the core return typed commands or effect descriptions and execute them in boundary adapters."
- `docs/rules/functional-core-imperative-shell.md`: "Step/Trampoline effect pattern: a pure state machine exposes `step()` / `resume(result)` returning `Yield(effect)` / `WaitForResult` / `Done(outcome)`"; EventCore `ModelCommand`/`evolve`/`decide` guidance.
- "Parse, don't validate… A type alias over a primitive or structural record is documentation, not invariant proof." / `docs/rules/semantic-types.md`: "Zero primitive-obsession… the type is the proof." (Rust: `nutype`).
- "Typed failure semantics. Return `Result`/`Either`-style values… Reserve exceptions or panics for programmer defects." / `docs/rules/error-handling.md`: thiserror, "Error messages are kebab-case, machine-readable identifiers", "Never `.to_string()` an error", "No blanket `Result<T>` alias".
- Lints: "Warnings-as-errors lint baseline… Relax an individual lint only through a narrowly scoped, reason-carrying suppression"; playbook: clippy `pedantic` + `restriction` + `nursery`, deny `unwrap_used/expect_used/panic/indexing_slicing`, `unsafe_code = "forbid"`, `#[expect(..., reason = "…")]`.
- ADRs "for every architecturally significant or hard-to-reverse decision… not for routine implementation choices."
- "Never take quality shortcuts to save time. Treat the work as a portfolio piece."

**Commits / delivery / trunk**
- "Every authored commit has a concise Conventional Commit subject and a non-empty body that explains why the change exists… Reject subject-only messages and bodies that merely restate the subject or diff." "Never add `Co-Authored-By` trailers." — `workflow-rules.md`
- "Require explicit case-by-case user authorization before amending any existing commit, whether or not it has been pushed." / "Never amend shared or default-branch history as a routine repair." — `delivery-workflow/SKILL.md`
- "Never force-push to a remote without explicit case-by-case human authorization… includes `--force-with-lease`." — `engineering-standards/SKILL.md`
- "`git commit` triggers the fast pre-commit checks and `git push` triggers the pre-push checks. Agents must not run the same gate commands separately unless the user explicitly requests a diagnostic run." — README
- "direct-to-trunk describes the delivery destination, not where development must occur" — `delivery-workflow`
- `AGENTS.md`: "If an hour passes without a pushed commit, pause and challenge whether the current increment is over-engineered; this is a scope heuristic, not permission to skip a gate."
- "One major change at a time." / "unrelated passing work is never batched for convenience" (TDD skill).

**Verification / evidence**
- "Evidence comes before claims." — `verification-before-completion/SKILL.md`
- "Never infer progress from an unbound green test or a clean worktree alone." — `skills/development-workflow/SKILL.md`
- "Missing evidence is unavailable, not zero." — same; "Missing evidence remains missing; never manufacture a PR, CI requirement, or remote action merely to make the modes look alike." — `delivery-workflow`
- "'Flaky' without a mechanism is not a diagnosis." — `ci-failure-follow-up`
- "After three failed fix attempts, stop and question the architecture or problem framing" — `systematic-debugging`

**Review orchestration**
- "Never reduce, skip, waive, or synthesize the required three consecutive complete finding-free review iterations because of user pressure, elapsed time, token or review budget, coordinator failure, or unavailable tooling." — `final-review/SKILL.md`
- "Never accept a defense only in the caller context." / fresh-context subagent per lens per iteration / always `production-risk-footguns`.
- Finding relevance: must state `caused|worsened|pre-existing|incidental`, mechanism, precondition, asset, deployment, impact; "Do not fix or backlog out-of-scope wishlist items."
- "Review feedback is technical input." / "Do not performatively agree." — `receiving-code-review`

**Threat modeling** (`docs/rules/proportional-threat-modeling.md`, `engineering-standards`)
- "For a local single-owner tool, trust the owner, machine, installed toolchain, PATH, environment, and configuration by default… do not block on malicious local processes, intentional self-bypass, or adversarial local races unless the project declares a stronger boundary." "prefer deleting unnecessary mechanisms… over hardening mechanisms the intended use does not need."

**Model routing / agents**
- "Agent definitions describe capabilities and boundaries; they do not pin a model or effort." "A model name, family, release date, price, availability listing, or effort setting alone proves no capability tier." Unavailable route → "report the route failure visibly. Do not silently substitute" — `skills/model-routing/SKILL.md`
- "Your explanation is not independent verification." — `agents/bounded-helper.toml`

**Evals / context**
- "Effectiveness is eval-driven, not vibes." "Minimum-necessary context." — `docs/rules/evals-and-context.md`; "One successful run is not reliability evidence." — `skills/agentic-systems`.
- Live evals only when change alters model-mediated behavior; deterministic infra → deterministic tests, record "live evals not applicable" (`AGENTS.md`, `workflow-rules.md`).

**Skill authoring** (`writing-skills/SKILL.md`)
- "If an adjective such as `relevant`, `material`, `adequate`, `appropriate`, `simple`, `broad`, `safe`, or `fresh` changes routing, scope, or a gate, replace it with an observable predicate."

**Backlog** (`AGENTS.md`, `tasks`)
- "Discovery identifies a candidate; it does not create an obligation." Strict total ordering, no ties; rank by "user pain, frequency, severity, blocking impact, leverage, confidence, cost, and overlap."

---

## 4. Enforcement mechanisms

### Deterministic (code-enforced)
| Mechanism | Blocks | Evidence required |
|---|---|---|
| `SessionStart` hook / `bin/development-system session-start` | nothing — emits `development_system.warning …` lines only | — |
| Config gate (`workspace-reader.status`) | MCP services inert without Git repo + schema-3 `.development-system.toml`; "Read-only repository inspection remains available in every state" | config file |
| `setup.preview`/`setup.apply` (Rust MCP) | writes only previewed config; rejects absolute/`..`/`.git`/symlink-escaping scopes; runner actions "never shell entrypoints, arbitrary suffixes, `git`, `gh`, or `glab`" | `confirmed: true`, previewed payload |
| Lefthook hooks (installed by setup) | `git commit` / `git push` fail when fast gate fails | real Git op output (receipt) |
| Checkpoint writer (`scripts/write-local-checkpoint.sh` + `checkpoint-operations.mjs`) | refuses stale generation/predecessor (CAS), malformed pending op ("recovery hold"), changed HEAD, missing/empty/in-worktree evidence file, invalid op ID (`/^[A-Za-z0-9._-]{1,128}$/`); `flock -w 30`; atomic rename + fsync; recomputes `tracked_sha256`/`untracked_sha256` | `command` + `receipt_file` (readable, nonempty, outside worktree) per op; does NOT verify tests/hooks ran — "evidence supplied by the caller, not independently attested by a log path" (`checkpoint-operations.md`) |
| `record-checkpoint-failure.sh` | same CAS; writes canonical `failing` with `causal-edit:` | failed command identity + evidence path + repair text |
| Final-review MCP (`final_review.*`, Rust) | rejects zero-lens plans, identifier-only lenses, caller-invented/triple-dot/index-only `diff_hash`, stale `state_ref`, post-completion transitions; normalizes schema-invalid lens/verifier results to malformed-result records that "invalidate the whole iteration, and reissue every selected lens"; `ship` rejected until 3 clean + terminal CI; 75-min server-timed budget checkpoint; split hold until `confirm_split` | `diff_hash` from `final-review-scope-hash.sh`, `current_changed_files`, caller attestation `fresh_context: true`/`closed_after_result: true`, `verifier_result`, `caller_decisions` |
| `final-review-scope-hash.sh` | dies on bad args; caps 20,000 files / 2 MiB inventory / 128 KiB git arg bytes | NUL-separated inventory file + baseline OID |
| Tiber (`tiber.*`, Rust, EventCore on orphan `tiber` branch) | optimistic concurrency (expected stream versions); ambiguous publication blocks all mutation until `tiber sync`; `[backlog].max_queued` refuses admission; `[final_review].minimum_clean_reviews` (floor 3, values 1–2 rejected, "no runtime bypass flag") blocks `transition done` and `close-from-trailers`; `claim:` only on in-progress; CI-recovery lease (60 min, server-timed) gates owner actions | signed commits to `origin/tiber`; `tiber.review.record` with reviewer identity, pathspec, commit range, fingerprints (`tiber-final-review-scope-v5`) |
| `new-task` allowed-tools whitelist | only `mcp__tiber__tiber_*` / `mcp__plugin_tiber_tiber__tiber_*`; no shell/file/web | — |
| Agent `sandbox_mode="read-only"` | all five subagents cannot mutate | — |
| `replay-review-operation.sh` (bwrap) | fixed writable paths; "IP networking is denied" | version-matched helper |

### Advisory (prose-only, relies on model compliance)
- Everything in `SKILL.md` files: RED-first, per-edit test, lightweight review, "never run the gate separately", change-preflight record shape, ten surface rows, commit message rules, no-amend, no force-push, model-routing tier selection ("coordinator instructions, not native MCP enforcement" — `runtime-mappings.md`), threat-model proportionality, worktree checks, backlog ordering, advisor behaviour.
- The author is explicit about this: MCP services and hooks "do not establish agent identity, isolate project tools, execute project mutations, or deny ordinary host capabilities" (README); "Mechanical transitions are not authorization" (`development-workflow` router); native `workflow.*`/`workspace-editor.*`/`project-runner.*` lifecycle is *not exposed* — "do not call or emulate" (`skills/development-workflow/SKILL.md`).
- Hybrid: the checkpoint ledger is deterministic about *ordering and identity* but trusts the model to supply truthful `command`/`receipt_file`.

---

## 5. Rigidity / fragility assessment

1. **Per-edit checkpoint ledger is extremely heavyweight.** `skills/development-workflow/SKILL.md` requires a durable `checkpoint-v1` write + focused test after *every* file edit, each via `transition-local-checkpoint.sh` with generation/predecessor CAS, receipts, and 23 operation kinds (`references/checkpoint-operations.md`). `write-local-checkpoint.sh` depends on 20+ host tools incl. `sync -f`, `flock`, `od`, `realpath`, and runs `checkpoint-operations.mjs recover` before every write. A model following this literally will spend most tokens on ledger bookkeeping; a model that skips it silently invalidates the whole chain (the ledger cannot detect a skipped step, only a mismatched hash). Fragile to: non-GNU coreutils, Node absent, `flock` absent (macOS), fsync-unfriendly filesystems.
2. **Dirty worktree = recovery hold.** `initialize` only on a clean baseline (`skills/development-workflow/SKILL.md`); any "unexplained source changes or a malformed predecessor remain a recovery hold" (README). Real sessions start dirty constantly (stash, WIP, editor temp files). This fights the agent on the very first step.
3. **Hash-identity brittleness.** `untracked_sha256` hashes *every* untracked non-ignored file by mode/path/blob; `exact-verify` demands reviewed snapshot ≡ commit tree. Formatters in Lefthook pre-commit mutate files → "new causal checkpoint, rerun whole chain" (`delivery-workflow`). Staging changes partitioning ("Staging changes snapshot partitioning; reconcile source identity rather than discarding work" — README). Hooks that reformat guarantee a loop.
4. **Final-review protocol is a 47 KB + 41 KB contract with version attestation.** The preflight (`contract_version >= 2`, `minimum_clean_iterations >= 3`, `durable_pending_assignment_recovery: true`) must be recited verbatim on mismatch ("A generic instruction to refresh… is not a complete fail-closed recovery record"). Any schema-invalid subagent result "invalidates the whole iteration, and reissues every selected lens" (`components/development-discipline/README.md`). With 8 lenses × ≥3 iterations × fresh-context subagents, one malformed JSON from one reviewer costs ≥8 more subagent runs. The skill itself admits "The existing serialized-state size limit remains a limitation for evidence-heavy sessions" (README) and ships a bwrap replay helper for persistence failures — evidence it breaks in practice.
5. **Three consecutive clean iterations where *any* finding (even out-of-scope, report-only, or rejected) is non-clean** (`skills/development-workflow/SKILL.md`; TRIVIAL findings "report only" yet still break the streak per final-review Loop). Reviewers are instructed to audit *surrounding* pre-existing test anti-patterns (tests-verification lens), nearly guaranteeing streak resets on legacy codebases. Cost scales superlinearly; no proportionality knob below 3.
6. **"Never run the gate separately."** README, TDD skill, delivery, verification all forbid running the pre-commit command manually. But the pre-commit *is* the fast test gate, so the agent cannot know whether the commit will pass without attempting it; a failed attempt then requires the `record-checkpoint-failure.sh` ceremony (README "Recover a failed checkpoint gate", 40 lines of shell). This forbids the obvious cheap diagnostic.
7. **Version-coupling and self-repair.** Hooks/launchers compare installed binaries to `plugin.json` version and auto-download/compile (900 s hook timeout). Stranded sessions need harness restart + fresh thread (README). The `.development-discipline/final-review.toml` and `[final_review.models.codex]` pin concrete model names (`gpt-5.6-sol`, `-terra`, `-luna`) despite the model-routing skill saying "The plugin does not prescribe model generations".
8. **Contradictory relation vocabularies.** `workflow-rules.md` relations: `directly-modified|consumes|generates-from|validates|ships|none`; `change-preflight/SKILL.md`: `directly-modified|generated-derivative|contract-consumer|operational-dependency|validation-evidence|none`. A compliance-minded model will stall on which set to use.
9. **Agent definition contradiction.** `agents/substantive-worker.toml` is `sandbox_mode="read-only"` yet says "You may edit files inside the authorized workspace"; the "workspace-editor" it is told to prepare requests for is unexposed ("retained as unexposed reusable components for the standalone Tiber harness" — README). Agents are planners for a runtime that doesn't exist yet.
10. **Mandatory fixed-shape prose records.** Ten preflight rows "even in an advisory answer", CI record with 5 fields "do not collapse or omit", verification record — these are good for determinism but generate boilerplate on trivial edits and are unverifiable (no parser checks them).
11. **Fail-closed on remote state.** `ci-failure-follow-up`: "If that remote state [`origin/tiber`] is unavailable, fail closed and take no recovery action." Offline or on a repo without Tiber configured, a red CI freezes *all* work, including unrelated local edits.
12. **Codex-sandbox assumptions leak everywhere**: raw `git commit-tree -S` approvals, `codex mcp list --json | jq` recovery recipes, `$PLUGIN_DATA`, `codex plugin marketplace upgrade`.
13. **Hidden Tiber future.** Many instructions describe `workflow.record_red`, `authorize_implementation`, etc. and then say "do not call or emulate" — dead weight that confuses routing and consumes the 40 KB skill budget, contradicting the author's own "minimum-necessary context" rule.
14. **Over-specified Git argv.** Exact argv arrays for `git diff --find-renames --find-copies --end-of-options <oid> --`, porcelain-v1 parsing rules for R/C entries, etc., live in prose. Any Git version nuance or path with special chars is a silent divergence that the MCP then rejects as a hash mismatch.

Net: the deterministic parts (CAS ledger, hash identity, MCP fail-closed) are *correct* but assume a perfectly disciplined caller and a pristine environment; the advisory parts are long, duplicated across root and component skills, and occasionally inconsistent. The system optimises for *unforgeable evidence* over *agent ergonomics*.

---

## 6. Vocabulary glossary

- **Tiber** — event-sourced (EventCore/eventcore-fs) task board + CI-incident + review-receipt authority on orphan Git branch `tiber`, published to `origin/tiber`; CLI `tiber` and MCP `tiber.*`. Planned to become the standalone harness owning "identity, isolation, workflow, memory, verification, and delivery" (README).
- **Development Discipline** — the Rust MCP (`development-discipline-mcp --service plugin-advisory`) exposing `workspace-reader.status`, `setup.*`, `final_review.*`; also the component holding the 12 discipline skills.
- **Task / ticket** — Tiber work item with statuses `backlog|in-progress|done|abandoned`, acceptance criteria, notes, subtasks, `Closes:` trailers; `work_item_id` in final review.
- **Checkpoint (`checkpoint-v1`)** — durable per-edit record at `<git-common-dir>/development-system/checkpoints/<checkpoint-id>.latest`; fields generation, predecessor_sha256, baseline_oid, snapshot hashes, state, test, gates, delivery, ci, next_action. **Checkpoint ID** = Tiber task ID or SHA-256(baseline_oid NUL request text).
- **Checkpoint state** — `failing` | `awaiting-causal-edit` | `passing-awaiting-gates-or-review` | `committed` | `pushed-or-delivery-mode-equivalent`.
- **Causal edit / causal repair** — the single edit permitted while `failing`, recorded as `causal-edit: <text>`.
- **invalid-test** — `failure_kind` when a RED test passes unexpectedly; next action `rewrite-invalid-test:`.
- **Bounded RED-to-GREEN pair** — test + implementation committed together when neither can pass alone.
- **Baseline / baseline_oid / baseline_commit** — immutable ticket-start commit; never fresh `origin/main`.
- **Delivery mode** — `local-only` | `direct-to-trunk` | `pull-request` (`.development-system.toml [delivery].mode`); **trunk_branch**.
- **Delivery plan** — advisor `ticket-plan` artifact (goal, approach, rejected alternatives, ordered tickets, non-goals, risks); also `delivery-tickets[-with-blocking-dependencies]` output of a review scope split.
- **Lightweight review** — one fresh-context subagent after each GREEN, before commit; never replaces terminal review.
- **Final / terminal review** — multi-lens, multi-iteration fresh-context review after all increments delivered; **lens** (8 defaults; `production-risk-footguns` mandatory); **iteration**; **clean streak** (≥3 consecutive complete finding-free); **verifier**; **scout** (pre_filter); **post_filter** (`final_review.filter_findings`).
- **Finding disposition** — `caused|worsened|pre-existing|incidental` × severity → block / backlog / report-only; **prior_defenses**, **caller_decisions** (`fixed|defended|accepted-risk`), **resolution_reopen**.
- **Review budget checkpoint** — server-timed 75-min boundary; `continue_review` / `ship|split|escalate`.
- **Scope split** — `split_required`, `split_candidates`, `scope_split_hold`, `confirm_split`.
- **diff_hash / scope hash** — output of `final-review-scope-hash.sh` over NUL file inventory; **tracked_sha256 / untracked_sha256** — checkpoint snapshot identity.
- **Exact-identity verification** — post-commit proof that reviewed snapshot ≡ commit (tree, message, signature).
- **Change-preflight** — mandatory ten-surface impact record with classification + relations.
- **Proportionality checkpoint** — four boundaries (user goal, AC, trust boundaries, exact completion claim) deciding whether a finding expands scope (`workflow-rules.md`).
- **CI hold / incident / lease / epoch** — repository-wide stop on failed pushed CI; Tiber-owned owner lease (60 min, 15-min heartbeats), classification `caused|unrelated|transient`, **release proof** = terminal success.
- **Receipt** — JSON in `.latest.operations/`; also Lefthook output as commit/push receipt.
- **Attestation** — `workspace-reader.status.final_review_protocol` fields; also per-assignment `fresh_context`/`closed_after_result`.
- **Model routing tier / scrutiny** — `bounded|standard|strong` × `ordinary|deeper|maximum`; `[model_routing]` keys `<tier>_model`, `<tier>_<scrutiny>_effort`.
- **Eval case** — sanitized GitHub issue (`[eval-case]:`) → future fixture in `evals/fixtures/`; **canary** (proves plugin loading) vs **behavior eval**; **pass@k / pass^k**.
- **Scopes** — `.development-system.toml [scopes.*]` categories `tests|source|documentation|developer_environment|build_output`.
- **Worktree root** — `[worktrees].root` (`.worktrees`), must be git-ignored.
- **Walking skeleton / data story** — agentic-delivery terms.
- **Recovery hold** — any state where the ledger refuses to proceed (dirty worktree, malformed predecessor, changed HEAD).

---

## 7. Codex-specific vs portable to pi

**Codex-specific (must be replaced):**
- `hooks/codex.json` SessionStart; `agents/*.toml` subagent format and `sandbox_mode`; Codex sandbox approval recipes (raw `git hash-object/commit-tree -S/update-ref` prefixes in Tiber README); `codex mcp list --json`, `codex plugin marketplace upgrade` recovery commands in README; `$PLUGIN_DATA`, `${PLUGIN_ROOT}` env conventions; `.codex/config.toml` managed MCP block removal in `setup.apply`; `[final_review.models.codex]` model names (`gpt-5.6-*`); `openai:codex-sdk` promptfoo provider and "Codex/ChatGPT subscription" standing authorization (`AGENTS.md`, agentic-systems-engineering README); `github:gh-address-comments` routing in babysit-pr; `disable-model-invocation`/`allowed-tools` frontmatter semantics in `new-task`; `development-system:<skill>` routing names; the entire "fresh-context subagent per lens" requirement — README: "Codex subagents are not yet available in pi"; `final-review` explicitly: "This skill requires a harness that can launch fresh-context subagents. If that capability is unavailable, stop."

**Already portable (reused by `pi/extension.ts` today):**
- `mcp.json` stdio launchers and `lib/installed-binary.sh` self-repair; `bin/development-system session-start --harness pi` (has pi-specific conflict rules already); the two Rust MCP servers themselves (Linux x86_64 only); `skills/` Markdown (loaded via `pi.skills`); shell helpers (checkpoint ledger, scope hash, worktree ports, detect-forge) — plain bash+jq+node; Lefthook config; `.development-system.toml` schema-3; `docs/rules/` and ADR conventions.

**Portable in spirit, needs re-encoding for pi:**
- Phase router + TDD + verification + commit/delivery rules (pure prose, harness-neutral once Codex names are removed).
- Model-routing contract (tier/scrutiny) — pi has its own model selection; the `[model_routing]` TOML could be reused but pi extension would need to implement spawn.
- Final review loop — needs pi subagent/sessions equivalent or a redesign (e.g. sequential fresh sessions via `pi.exec`), and the 47 KB protocol should be pared down.
- Lightweight review subagent — same dependency.
- Tiber integration — MCP works, but Tiber "targets Codex" (its README) and its signing-socket/sandbox docs assume Codex.
- Checkpoint ledger — portable code, but a pi extension could enforce ordering natively (tool hooks) instead of relying on prose + shell CAS, which is the author's stated pain point.

**Observed facts vs inference:** Everything in §§1–4, 6–7 is read directly from the cited files. §5 is my assessment, grounded in cited text; the "fights the agent" judgments are inferences from the rules' structure, not from observed sessions. Not inspected: Rust implementation (so MCP rejection behaviours are taken from skill/README prose), `.plugin-eval` fixtures, `checkpoint-operations.mjs` beyond its first 80 lines, `mcp-protocol.md` argument schemas in detail.
