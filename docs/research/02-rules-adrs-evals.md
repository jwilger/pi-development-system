# Research 02 — ai-plugins rules, ADRs, and evals

Source repo: `/home/jwilger/src/ai-plugins` at commit `83f310a6ea2441649201478e3d296662a3506587` (2026-10-06); working tree clean for the inspected paths. All paths below are relative to that repo unless prefixed. Everything here is read from the files directly; "inference" is labelled where I go beyond the text.

Purpose: extract the author's engineering standards and the lessons embedded in his decision record, so a new opinionated pi extension can encode the *principles* (and let the model exercise judgement within them) rather than re-implementing the ai-plugins enforcement machinery.

---

## 1. Rules docs (`docs/rules/*.md`)

`docs/rules/README.md` declares these "the source of truth" that `AGENTS.md` links to, and states the overarching rule: **"never take quality shortcuts to save time. This is a portfolio-grade project; put in the effort and find a way to make it work."**

### 1.1 `docs/rules/functional-core-imperative-shell.md`
- Rule: "All business logic is **pure** (the functional core): no I/O, no side effects. All I/O and side effects live in the **imperative shell** at the edges."
- Effects the core needs use a **Step/Trampoline effect pattern**: "a pure state machine exposes `step()` / `resume(result)` returning `Yield(effect)` / `WaitForResult` / `Done(outcome)`; a thin shell loop performs the real I/O … The core only ever _describes_ effects — it never performs them."
- "Enforce this with the strongest mechanism the stack supports: module boundaries, package boundaries, dependency rules, tests, or lints." Core must be free of "direct filesystem, process, network, database, and clock access."
- EventCore section (Rust event-sourcing library used by Tiber): model the *domain transition*, not a "generic event envelope or persistence operation"; a `ModelCommand` names one intent, its `ModelState` holds only the facts needed to decide that intent; `evolve` folds events with no I/O; `decide` emits typed *facts*, "not commands, requests, mutable snapshots, or generic 'state published' payloads"; persist only via `execute()`; run the checked-model gate for every command lane; `CheckStatus::Verified` is "necessary but not sufficient"; the checker "does not prove the truth of handwritten branching inside `decide` or `evolve`" so cover every allowed/rejected transition with behavior tests through `eventcore::execute`, including concurrency conflicts at the real EventStore boundary; legacy snapshots only via an explicit one-way import boundary; rebuildable projections/caches/journals are "non-authoritative."
- Protects against: hidden side effects making logic untestable; "state published" god-events; mistaking a passing static checker for behavioral proof; sidecar state silently becoming authority.

### 1.2 `docs/rules/semantic-types.md`
- "Zero primitive-obsession. **Only semantic types** flow through the domain; primitives, built-ins, and structural types appear **only at the I/O boundaries**." "Parse external input into semantic types immediately at the boundary, and never re-validate downstream — the type is the proof."
- "A renamed representation is not a semantic type." Aliases like `type UserId = string` carry no proof; use "a named wrapper whose constructor is private and whose parser or smart constructor is the only way to obtain a value." Model exclusive alternatives as a closed sum type (`EmailContact(Email) | PhoneContact(PhoneNumber)`), never a record with independently optional fields.
- Rust specifics: `nutype` newtypes with `sanitize`/`validate`; inner types like `NonZeroU32`; `serde` allowed on semantic types "**but conversions happen only at I/O boundaries.**"
- Protects against: invalid states being representable; validation scattered/duplicated; type aliases giving false confidence.

### 1.3 `docs/rules/error-handling.md`
- "Errors are values." Railway-oriented (Wlaschin): `Result`, `?`, typed error enums converting upward via `#[from]`/`From`.
- "Derive `thiserror::Error` on every error enum; **never** hand-write `Display`." Messages are "**kebab-case, machine-readable identifiers** (e.g. `invalid-credentials`), not prose." "Never `.to_string()` an error (it discards the source chain)." "No blanket `Result<T>` alias — write the explicit `Result<T, E>`."
- Protects against: lost causal chains; prose errors that cannot be matched programmatically; hidden error types behind aliases.

### 1.4 `docs/rules/lints.md`
- "Posture: start strict, then decline individual lints case by case. Each suppression is a **documented project-policy decision**, not a convenience suppression." Keep generated files out of lint scope; "CI must run the repo's lint/format checks through `just ci`." Lint policy is stack-specific and lives in checked-in tool config.
- Protects against: an unreviewed exception surface; lint drift between local and CI.

### 1.5 `docs/rules/testing.md`
- "**Vertical slices, not layers.** Each unit of work delivers a user-observable behavior end-to-end. Plans are shaped around behaviors, never component waterfalls."
- Behavior tests are "**black-box**: they exercise the public surface and avoid private implementation details."
- "**One behavior step at a time:** get one observable behavior green with the fast developer gate passing (`just pre-commit`), **commit**, then move to the next step." Expensive suites (acceptance, mutation, release, browser, shell) run in CI after push.
- RED applicability (the judgement rule): "Start with RED only when adding or changing first-party production behavior and no existing failing test already proves the required change." Explicit exemptions: docs/metadata; functionality removal; documented third-party behavior; committed-file text/structure; a change already shown by a failing test; "straightforward CI workflow scripting, where executing CI is the test"; simple dev-environment utilities; behavior-preserving refactor with adequate green coverage.
- Removal protocol: remove functionality first, run unchanged suite, classify each failure; "Do not add a replacement test whose only assertion is that the capability is gone."
- "Tests assert application or library behavior, never facts copied from committed repository files." No tests that open committed docs/fixtures/manifests and check text. "Do not test CI workflow definitions or job structure; executing the workflow in CI is the test."
- Overgrown dev utilities: "extract it into an independently maintainable project … instead of growing a private utility test architecture indefinitely."
- Reviewers "apply the same applicability rules before reporting missing coverage or missing RED evidence."
- Protects against: ritual TDD where the test proves nothing; snapshot-of-committed-file tests; brittle implementation-coupled tests; over-removal during deletes; coverage theatre.

### 1.6 `docs/rules/evals-and-context.md`
- "**Effectiveness is eval-driven, not vibes.** No skill, command, or MCP-tool description ships until an **eval** validates it — triggering accuracy _and_ behavioral effectiveness, with variance analysis … 'Looks good' is not a passing condition."
- "**Minimum-necessary context.** … least context that stays effective … progressive disclosure, triggers-only descriptions, and reference material loaded on demand … reject context regressions that do not buy proportional effectiveness."
- "Match evaluation to the causal surface": live LLM evals only "when instructions, triggers, model-visible schemas or results, injected context, prompt construction, routing, or graders can change what a model does." Deterministic tests for "installation, packaging, process lifecycle, locking, paths, state directories, permissions, manifest synchronization." "A wiring dry run … is not behavior evidence." Mark live evals "not applicable rather than running them reflexively."
- Protects against: prompt bloat; unmeasured instruction changes; wasted provider quota on deterministic surfaces; treating dry-runs as evidence.

### 1.7 `docs/rules/proportional-threat-modeling.md`
- "Derive each review's blocking threat model from the actual intended deployment and usage." A finding blocks only with "a concrete trust boundary, a plausible in-model failure, and proportionate impact." Out-of-model premises become non-blocking observations and must not "expand implementation scope."
- Local single-owner tools "default to trusting the owner, repository, development environment, installed toolchain, `PATH`, environment variables, and local configuration." In scope: "Ordinary mistakes, stale state, cooperative concurrency, interruption, crashes, filesystem failures, and remote data loss." Out of scope unless declared: "Malicious local processes, intentional self-bypass, compromised local tools, adversarial open-file races, and crafted internal metadata."
- "In every context, prefer deleting unnecessary mechanisms and reducing surface area over hardening mechanisms the intended use does not need."
- Protects against: review-driven scope creep from imaginary adversaries; security theatre in dev tools.

### 1.8 `docs/rules/workflow-and-commits.md`
- "**Repository-local delivery policy wins.**" Precedence: current user direction (may narrow authorization) → repository-local instructions select direct-to-trunk / PR / local-only → specialist gates apply within that mode; a specialist "may not replace its workflow, commit cadence, or evidence level, or invent a pull request."
- "**One major change per worktree at a time.**"
- "**Trunk push CI by default; PR CI when explicitly configured.**" PR mode requires "≥1 approval plus automated code review/approval." "Delivery evidence still binds to the exact latest pushed revision and waits for its terminal result."
- "**Failed pushed CI holds unrelated work.**" Inspect exact job/step/logs, "record the causal diagnosis," then push only the diagnosed repair or rerun the unchanged revision; wait for terminal success before resuming.
- "**Rationale-bearing Conventional Commits.**" Non-empty body "explaining why … A subject-only message, or a body that merely repeats what changed, is not complete."
- "**One-hour scope check.**" If nothing pushed in an hour, "pause and ask whether the current increment is being over-engineered … the heuristic never permits skipping tests, review, or another required gate."
- "**No `Co-Authored-By` trailers** (and no other AI-attribution trailers)." Forge-agnostic (GitHub/Forgejo/GitLab peers). "**Document every architectural decision** as an ADR in `docs/adr/`."
- Protects against: agents inventing PRs or workflows the repo didn't ask for; parallel work masking red CI; commit history that loses the *why*; long unshipped increments.

---

## 2. ADRs (`docs/adr/0001`–`0018`)

Template (`docs/adr/template.md`): Status / Date / Context / Decision / Consequences (Positive/Negative) / Alternatives Considered / **Revisit when** / Related. The "Revisit when" section is mandated by `docs/rules/workflow-and-commits.md`.

**ADR-0001 Contain writable agent benchmarks** — Accepted, 2026-07-16. Decision: run writable coding turns only through a fail-closed Linux boundary (Bubblewrap namespaces, systemd user scopes with aggregate cgroup limits, hash-bound Nix closure, constant `/workspace` paths, staged copy-out, separate trusted scorer, allowlisted sanitized publication). Rationale: agent commands and generated code are untrusted even in a single-owner tool; protected assets are the provider credential, host checkout, hidden scorer controls, host availability, raw transcripts. Noted negatives: "require Linux, Bubblewrap, Nix, and a functioning systemd user manager"; runner "must maintain explicit runtime and tool-closure contracts as Codex, Promptfoo, or the benchmark toolchain changes"; provider evidence "slower and more expensive than a structural dry-run." **Flag: heavy process overhead and harness coupling** — the benchmark infra is a project in itself.

**ADR-0002 One fenced CI-recovery incident** — Accepted, 2026-07-25. Decision: CI-recovery facts live in Tiber's EventCore Git store on the `tiber` branch; one owner gets a 60-minute epoch-fenced lease, heartbeats ~15 min, picks exactly one action (causal repair or unchanged-SHA rerun); helpers can't push/rerun/release; only matching terminal-success proof releases the hold; fast-forward-only, never force-push; fails closed if Tiber/remote unavailable. Negatives: "A transient remote outage blocks recovery mutations"; "a Tiber-enabled project is required when this delivery hold is enabled." **Flag: brittleness/overhead** — a distributed-lock protocol for what is, for a single developer, usually "look at the failing job."

**ADR-0003 Separate development workflow into semantic capabilities** — "Superseded in part by ADR-0004." Decision: opt-in via `.development-system.toml` schema v3; "Plugin instructions and hooks are advisory. They do not establish caller identity … or authorize repository effects"; lifecycle states RED → implementation authorization → implementation → verification → review → delivery → terminal, with "A later mutation invalidates verification/review evidence and returns to RED"; every authoritative fact goes through an EventCore `ModelCommand`; JSON/SQLite only as rebuildable projections. The **"Superseded boundary experiment"** section is the key regret: "Earlier experiments used generated Codex agent profiles, a `PreToolUse` denial hook, and short-lived proof and activation files. They demonstrated some version-specific filtering behavior but not a stable, supported authority boundary. Treating that behavior as enforcement made normal Codex work fail closed when MCP startup or generated state drifted." **Flag: rigidity + harness coupling lesson** — hook-based enforcement broke ordinary work.

**ADR-0004 Make Tiber the standalone authority** — Accepted, 2026-08-10. Context: "Plugin instructions and hooks can advise a host agent but cannot reliably own identity, isolation, durable workflow state, recovery, or delivery." Decision: Tiber is a standalone harness and sole authority; the plugin is "a deterministic, repository-local advisory bootstrap and never changes global user settings." Alternatives rejected: "Codex boundary enforcement … because the required host guarantees are unsupported. Plugin-only orchestration … because advisory text is not durable authority." **Flag: the pivot** — from enforcing-in-the-host to building a whole harness. Lesson for a pi extension: decide up front whether you're advisory or authoritative, and don't pretend the former is the latter.

**ADR-0005 codex app-server as sole inference transport** — Accepted after a spike, 2026-08-10. Decision: `codex app-server` exclusively, isolated Codex home, pinned protocol range, tool calls parsed "as inert data"; never read/log credentials. Spike regret: "The first Phase 1 conclusion incorrectly equated protocol availability with effective authority." Live probe on Codex CLI 0.147.0 confirmed read-only profile + `approvalPolicy = "never"` denies writes. Consequence: "rerun the effective-authority probe for every supported Codex protocol/version range." **Flag: harness coupling** — authority depends on a version-pinned external protocol.

**ADR-0006 Fork Codex TUI presentation** — Accepted, 2026-08-10. Adapt `codex-tui` at commit `d06dc73290729d2bcb464b955a4cfd9992abc35d`, strip runtime/tool/sandbox deps, "The TUI consumes projections and emits intents only." Consequence: "Upstream UI changes require deliberate review and attribution." **Flag: maintenance overhead** of a fork.

**ADR-0007 Native task/workflow services** — Accepted, 2026-08-10. Extract `tiber-tasks-core`, `tiber-tasks-service`, `development-workflow-core`, `development-workflow-service`; CLI/MCP/dashboard/TUI are adapters; "Internal task and workflow actions call native typed services and never loop back through MCP or shell." Rationale: loopback "creates unnecessary serialization, process, authorization, and recovery boundaries." Principle reusable in pi: adapters call a typed core, never shell out to yourself.

**ADR-0008 Tiber as the MCP client** — Accepted, 2026-08-10. Pinned Rust RMCP client; stdio + localhost Streamable HTTP; exclude sampling, elicitation, MCP tasks. Consequence: "Protocol compatibility and ambiguous mutations become Tiber responsibilities."

**ADR-0009 Swappable memory, Hindsight first** — Accepted, 2026-08-10. `MemoryBackend` trait; Hindsight HTTP API 0.8.3; "memory is advisory, fallible, and not authoritative workflow state"; "never recall a turn into itself." Failures "visible but normally nonfatal."

**ADR-0010 x86_64 Linux only in v1** — Accepted, 2026-08-10. "A multi-platform v1 would dilute evidence and delay a trustworthy vertical slice." Keep isolation behind a platform port. Principle: precise support promise over aspirational one.

**ADR-0011 Hard cutover of `tiber` command** — Accepted, 2026-08-10. Atomic rename, "no aliases, compatibility crates, deprecated paths, or transition window." Rationale: compat windows "prolong ambiguity and duplicate support." Principle: author prefers one verified atomic migration over gradual deprecation.

**ADR-0012 Workspace-wide strict Clippy allowlist** — Accepted, 2026-08-10. `pedantic` + `restriction` at warning priority -1; `cargo clippy --workspace --all-targets --all-features -- -D warnings`; forbid unsafe; library code has no `unwrap`/`expect`/`panic`/`todo`/`unimplemented`; only `#[expect(clippy::lint_name, reason = "…")]`; "Workspace exceptions require an amendment to this ADR"; a repo check audits unapproved `allow`/`expect`. Consequence: "New warnings intentionally break the build until reviewed." (Note: `.coderabbit.yaml` describes the policy as `clippy::all`, `pedantic`, `nursery` denied — slightly different wording than the ADR; the ADR says nursery lints are "selected individually.")

**ADR-0013 Build binaries on the installed host** — **Superseded by ADR-0015**, 2026-08-14. Ship source + thin launchers; `just install-development-system-binaries` builds locally into XDG; launchers "never compile at runtime." Regret (from 0015's context): "made every normal installation compile two Rust workspaces locally. That imposed a Rust toolchain and dependency download on users who only needed to start the packaged MCPs." **Flag: process overhead pushed onto users; reversed within a month.**

**ADR-0014 Support Codex exclusively** — **Superseded by ADR-0016**, 2026-08-31. Drop Claude Code from Development System 6.0.0; "5.5.x is the final dual-harness release"; no shims. Rationale: duplicated packaging/routing/docs with no Claude behavior evals. Revisit "only through a new architectural decision backed by a concrete product need, an owned compatibility surface, and harness-specific behavior evidence." **Flag: harness coupling, reversed within a month** by portable packaging.

**ADR-0015 GitHub Release binaries** — Accepted, 2026-09-12; supersedes 0013, amended by 0016. One `linux-x86_64` musl bundle per plugin version; builder rejects ELF interpreters, dynamic libs, `/nix/store/` refs; SHA-256 sidecar; installer verifies before extraction; `--from-source` for other hosts; privileged workflow runs only on `workflow_run` success for exact current `main`; releases immutable. New runtime deps: "GitHub Releases, HTTPS, `curl`, `tar`, `sha256sum`, and `flock`."

**ADR-0016 Portable plugin-owned MCP packaging** — Accepted, 2026-09-29. Root `plugin.json` sole version authority; root `mcp.json` for both servers; hooks/presentation under `extensions.com.openai`; "other harnesses may use the portable components without a separate compatibility promise"; launchers repair binaries in `PLUGIN_DATA`; SSH agent socket path recorded in `PLUGIN_DATA` because "Codex filters local MCP process environments"; CI rejects plugin changes without a version bump; companions (GitHub, CodeRabbit) are installer choices, Superpowers excluded "because its workflow overlaps." Patterns borrowed from mcp-bin and Superpowers' `.version-bump.json`.

**ADR-0017 Recoverable, evidence-bound review orchestration** — Accepted (no date). Context admits real defects: Git object creation failed when only the review replica dir was writable; SQLite WAL needs a writable containing directory; "typed command folds dropped updated risk, lens, and clean-minimum material. The compatibility projection looked valid while the next command rejected its contract." Decision: replay exact operations with narrow writable authority; optimistic concurrency + idempotent receipts; **"Treat each 75-minute boundary as a progress assessment"** — continue via recorded continuation when no human decision is needed; "Timer continuation is never a waiver of review, security, signing, verification, or delivery gates"; persist rejected findings with stable identity + evidence so re-review doesn't re-litigate ("Identity and evidence determine reuse; wording similarity does not"); repair credit needs a confirmed prior defect + changed remediation + fresh evidence. Consequences: "Recovery requires the supported Linux bubblewrap runtime"; projection keeps only 64 round-history rows, so full-history totals are "unavailable." **Flag: brittleness** — sandbox-induced persistence failures and projection/command drift; **process overhead** — review-round accounting is elaborate.

**ADR-0018 Deliver as a pi package from the same plugin root** — Accepted, 2026-10-05. `package.json` with `pi.skills: ["./skills"]`, `pi.extensions: ["./pi/extension.ts"]`; `pi/extension.ts` is "a policy-free adapter" registering `mcp.json` servers with `direct` tool exposure, calling `bin/development-system session-start --harness pi` in the background, `/development-system doctor`; typed against "local structural types" (no pi runtime dep); Node test runner against a fake pi API. "Until pi behavior evidence exists, the pi package is experimental and Codex remains the only supported harness." Negatives: skills still carry Codex-specific text (`.codex/config.toml`); Codex `agents/*.toml` subagents unavailable in pi; "The structural pi types can drift from pi's real API." Rejected: separate pi dir (splits source of truth), reimplementing checks in TS ("duplicate deterministic policy in a second language").

### Cross-ADR lessons (inference, grounded in the flags above)
- **Advisory text ≠ enforcement** (0003/0004): hook-denial enforcement failed closed on drift; the author's answer was to build an authoritative harness, not to make hooks stricter.
- **Two ADRs reversed within ~30 days** (0013→0015, 0014→0016): user-facing setup cost and harness exclusivity were both over-corrections.
- **Fail-closed everywhere has a cost** (0001, 0002, 0005, 0017): outages, sandbox quirks, and protocol pins stall work. Each ADR records this honestly in Negatives.
- **Shared deterministic core, thin adapters** (0007, 0018): policy lives in one place; adapters don't re-implement it.
- **Precise promises** (0010, 0014, 0018): "experimental" and "unsupported" are used deliberately rather than claiming breadth.

---

## 3. Evals (`evals/`)

### How behaviors are tested
- **Promptfoo** is the harness (plan pins `promptfoo@0.121.17`; gpt-5.6 README pins 0.121.18 and Codex CLI/SDK 0.144.5). Provider is `openai:codex-sdk` (`evals/matrix.json` → `codex-gpt-6-sol`, default reasoning `medium`).
- **Behavior cases** live in `evals/fixtures/behavior/{development-discipline,development-system,full-marketplace,tiber,hyprland-computer-control}/cases.json` — 168 cases total (91/16/33/19/9). Every case has `case_id`, `behavior`, natural-language `prompt`, `tags`, `plugins`, `skills`, `coverage.kinds` (e.g. `natural-trigger`, `scope-boundary`, `core-behavior`, `adversarial-safety`, `baseline-ablation`), `valueGate` (`mode`: `standard` | `safety-critical` | `none`; `baselineLiftThreshold`, default 0.1 from `evals/matrix.json`), `minPassRate` (0.66/0.67 typical, 1.0 for safety/recovery), `semanticRubric`, `hardAssertions`, and `calibration.pass/fail` examples (161/168).
- **Loader** `evals/promptfoo/load-harness-cases.cjs`: expands each case × `EVAL_SAMPLES`, supports `EVAL_SKILL_INVOCATION_MODE` `natural` (default, prompt unchanged) vs `forced` (prefixes "Apply $plugin:skill and read its instructions"). Each test asserts (a) `javascript` → `assert-hard-guards.cjs`, (b) `llm-rubric` → `semanticRubric`. `min_pass_rate` collapses to 1 when samples==1.
- **Hard guards** `evals/promptfoo/assert-hard-guards.cjs` (14.5 KB): two assertion types — `forbiddenIntent` (regex patterns over the response, with elaborate exemptions: `isNegated`, `isApprovalGated`, `isHistoryRewriteApprovalGated` with revocation detection, `isSanitizationContext`, `isTiberOwnedWriteContext`, `isStructuredTiberRecoveryContext`, clause/sentence scoping) and `contains`. Observed: the negation/approval-gate handling is hundreds of lines of regex — this is the brittle part of the suite.
- **Canary** `evals/promptfoo/load-canary-cases.cjs` + `assert-full-marketplace-canary.cjs`: discovery-only prompt; asserts every plugin in `.agents/plugins/marketplace.json` and one representative skill are named. Explicitly "not a behavior eval."
- **Plugin modes** (`evals/matrix.json`): `no-plugins`, `targeted-plugins`, `full-marketplace` — enabling baseline-ablation (does the skill lift behavior vs. the bare model?). Manual budgets: `maxConcurrency: 2`, `samplesPerCase: 1`; improvement loop `maxIterations: 3`, `maxChangedFiles: 20` (`just improve-plugins` / `just improve-evals` with diff guards).
- **Benchmarks** (`evals/benchmarks/`): `downstream-code-quality` (ADR-0001 sandbox; 3 conditions × 3 samples on a Rust `expense-report` fixture; deterministic gates `source-rebuild, black-box-behavior, regression-tests, baseline-regression-replay, format, clippy, diff-scope, safety`; aggregates `success-rate, pass@3-capability, pass^3-reliability`; `"promotionEligible": false`; "Trusted scoring ignores model prose"); `change-preflight` (plugin-eval schema v2, `codex-cli` runner, verifier script hash-pinned via SHA-256 inside the command); `gpt-5.6-model-family` (execution vs grading model split, grader calibration against 8 frozen human labels incl. hostile prompt-injection answers; results marked "superseded"/provisional); `model-routing` (campaign with task families, case kinds `nominal, boundary, expected-error-or-refusal, partial-credit, adversarial, regression`, promotion gates like `critical_regressions_allowed: 0`, one-sided 95% CI on candidate-only failure ≤ 0.02).

### Categories of behavior checked (from tags/behaviors)
- **Scope discipline**: final-review doesn't fix out-of-scope suggestions or invent CI work; "Checks the original goal before turning advisory review feedback into additional implementation scope."
- **Safety-critical refusals** (minPassRate 1, `safety-critical`): `force-push-refusal`; `development-workflow-stops-at-unresolved-gates`; `development-system-eval-case-reporting-safety` (no raw secrets/transcripts posted); `agentic-tool-contracts-and-loops`; `development-discipline-verification-claim-scope` (don't claim more than verified).
- **TDD applicability**: `development-discipline-tdd-one-test-first` (reject tests-after), `development-discipline-red-applicability` ("Requires a new RED test only for uncovered first-party production behavior and chooses proportionate evidence for exempt changes"), functionality-removal regression safety, third-party/dev-utility exemptions.
- **Delivery mode precedence**: direct-to-trunk / PR / local-only; "Separates Development Discipline phase transitions from human or repository authorization."
- **CI failure recovery**: causal diagnosis, hold unrelated work, hard-stop when Tiber claim fails.
- **Proportionality**: threat model "requires in-model causal path"; `engineering-standards-applies-proportionate-regime` ("without inventing out-of-model local adversaries"); risk-proportionate review budget; 75-minute checkpoint decisions.
- **Model routing**: least-cost model that preserves quality; no silent downgrade; escalation.
- **Test quality**: behavior tests not CI-workflow tests; pre-existing finding handling.
- **Instruction writing**: "Rewrites vague gate-changing adjectives as operational predicates without academicizing the prose."
- **Interruptibility**: long gates observable; "immediately honors a user's scope correction."
- **Eval selection**: `eval-selection-matches-the-causal-surface` (minPassRate 1).
- **Tiber state integrity**: no direct `.tasks/` writes, no force-overwrite of sync conflicts, dry-run before scaffold apply, no install-time mutation.

### Implications for testing a new pi extension
- Split **deterministic** (packaging, registration, session hooks, paths, state files → plain unit/integration tests, as ADR-0018 does with a fake pi API) from **model-mediated** (instructions, triggers, injected context → sampled LLM evals). Don't run live evals for deterministic changes (`docs/rules/evals-and-context.md`).
- For model-mediated behavior: natural prompts (no "use skill X"), semantic rubric + a *small* deterministic hard guard for true invariants (force-push, secret leakage, claim scope), k samples with a `minPassRate`, calibration pass/fail examples, and a **baseline ablation** (no-extension vs extension) to prove lift. Set `minPassRate: 1` only for safety invariants.
- Keep hard guards minimal. The 14.5 KB regex negation engine in `assert-hard-guards.cjs` is evidence of how fast "deterministic" text guards become brittle; prefer trajectory/tool-call assertions (did it *call* `git push --force`?) over prose matching when the harness exposes them (the plan's Task 6 Step 5 already says "Prefer trajectory, trace, or `skill-used` assertions … when the provider exposes them").
- Have a **canary** that proves the extension actually loaded before trusting behavior numbers.
- Record provenance (model, effort, harness version, sample count) with results; treat dry-runs and skipped runs as "no evidence," per the plan's post-merge note that missing secrets meant "skipped live-eval runs are not behavior evidence."
- `.coderabbit.yaml` `evals/**` instruction: "Flag brittle keyword-only grading where a semantic rubric plus deterministic hard guard is more appropriate." Same posture.

### Repo gates (`justfile`, `lefthook.yml`, `.coderabbit.yaml`)
- `just ci` = `validate-marketplace github-actions hyprland-computer-control pi-extension tiber-harness-rust tiber-rust development-discipline-rust tiber-dashboard-smoke tiber-mutants bats`. `just pre-commit` is the fast developer gate ("deliberately excludes acceptance, release, browser, mutation, and shell suites; CI owns those"). `pi-extension` = `tsc -p plugins/development-system/pi/tsconfig.json` + `node --test scripts/tests/pi-extension.test.mts`. Mutation testing (`cargo mutants`) on `tiber-core` only — the pure core.
- `lefthook.yml`: `assert_lefthook_installed: true`, `no_auto_install: true`; pre-commit rejects committing `.codex/config.toml` ("generated machine-local configuration") then runs `just pre-commit`; post-checkout runs `scripts/worktree-bootstrap.sh`.
- `.coderabbit.yaml`: `request_changes_workflow: true` (needed so branch protection's required approval is satisfiable by the bot); path instructions enforce semver + manifest sync for `plugins/**`, docs-as-product-surface for `**/*.md`, least-privilege workflows, and tell the reviewer not to nitpick what clippy already enforces.

---

## 4. Non-negotiable standards vs. defaults-with-judgement

Classification rule I used: **non-negotiable** = stated with "never/must/only", enforced mechanically (CI gate, hard guard, `minPassRate: 1`, fail-closed), and no exemption list; **default-with-judgement** = the docs themselves supply applicability criteria, exemptions, "proportionate," heuristics, or "prefer."

### Non-negotiable (evidence)
1. **No quality shortcuts to save time** — `docs/rules/README.md` overarching rule; the only rule stated at the top level.
2. **No force-push / history rewrite without explicit case-by-case human authorization** — `force-push-refusal` is `safety-critical`, `minPassRate: 1`, hard-guarded; plan Task 5 Step 1; ADR-0002 "never force-pushes."
3. **Never claim more than was verified; dry-runs/skips are not evidence** — `development-discipline-verification-claim-scope` (minPassRate 1); `docs/rules/evals-and-context.md`; ADR-0001 "A dry-run … is not accepted as behavior evidence."
4. **Stop at unresolved gates** — `development-workflow-stops-at-unresolved-gates` safety-critical.
5. **Failed pushed CI holds unrelated work until terminal green** — `docs/rules/workflow-and-commits.md`; ADR-0002; `tiber-ci-recovery…hard-stop` case minPassRate 1.
6. **Functional core / imperative shell; core never performs I/O** — "All business logic is pure"; enforced "with the strongest mechanism the stack supports"; mutation testing targets only the core.
7. **Semantic types only in the domain; parse at the boundary** — "Zero primitive-obsession"; "A renamed representation is not a semantic type."
8. **Errors are typed values with preserved chains; no prose error messages; no hand-written Display** — `docs/rules/error-handling.md` ("never").
9. **Strict lints, `-D warnings`, every suppression reasoned; workspace exceptions need an ADR amendment** — ADR-0012; `docs/rules/lints.md`.
10. **Rationale-bearing Conventional Commit body; no AI-attribution trailers** — `docs/rules/workflow-and-commits.md`; `delivery-requires-rationale-bearing-commit-message` case.
11. **Repository-local delivery policy wins; never invent a PR/workflow** — same doc; delivery precedence cases.
12. **Tests assert behavior, never committed-file text; no CI-definition tests** — `docs/rules/testing.md`.
13. **No sidecar/mutable record as authority; projections are rebuildable** — FCIS EventCore section; ADR-0003/0004/0009.
14. **Every architectural decision gets an ADR with "Revisit when"** — `docs/rules/workflow-and-commits.md`; template.
15. **No secrets/raw transcripts leave the machine without sanitization and approval** — eval-case-reporting safety case minPassRate 1; ADR-0001 publication allowlist.
16. **Model-visible instructions ship only with eval evidence** — "No skill … ships until an eval validates it."

### Defaults with judgement (evidence)
1. **When to write a RED test** — `docs/rules/testing.md` gives an 8-item exemption list; `development-discipline-red-applicability` tests *choosing proportionate evidence*. The invariant is "don't skip RED because it's simple" (hard-guarded); the judgement is applicability.
2. **Threat-model scope** — "Derive … from the actual intended deployment"; local tools default to trusting the owner; the model must distinguish in-model vs out-of-model (`final-review-threat-model-requires-in-model-causal-path`).
3. **Live eval vs deterministic test** — "Match evaluation to the causal surface"; `eval-selection-matches-the-causal-surface`.
4. **Review depth/budget** — "risk-proportionate"; 75-minute checkpoint is a *progress assessment* ("ship, split, or escalate"), not a hard stop; multiple passes only for "explicitly exceptional dimensions."
5. **Scope expansion from review feedback** — "Checks the original goal before turning advisory review feedback into additional implementation scope"; out-of-model findings become non-blocking observations.
6. **One-hour scope check** — explicitly "a rough heuristic … Prefer a smaller semantic increment when possible."
7. **Context budget** — "least context that stays effective"; "reject context regressions that do not buy proportional effectiveness" — a tradeoff, not a number.
8. **Model/effort routing** — "least-cost supported model … that preserves accepted-task quality" with escalation; routing cases include `optional-mapping`.
9. **Lint suppression** — allowed with a documented tradeoff reason (judgement inside a strict frame).
10. **Dev-utility test depth** — "If a developer utility needs extensive tests … extract it" — a judgement about when a utility has outgrown its home.
11. **Removal work** — classify each failure; repair implementation if it removed too much.
12. **Memory recall** — "advisory, fallible" (ADR-0009).
13. **minPassRate 0.67 for most behaviors** — the suite itself tolerates stochastic variance on non-safety behaviors; only safety/recovery/claim-scope are 1.0.

Pattern (inference): the author draws a hard line around **irreversibility and honesty** (force-push, unverified claims, secret leakage, skipping gates, losing error/decision context) and around **architecture shape** (FCIS, semantic types, typed errors), while leaving **proportionality** (how much test, review, threat model, context, model) to grounded judgement with explicit criteria.

---

## 5. Open questions for the author

1. **Advisory vs authoritative for the pi extension.** ADR-0003/0004 concluded hooks "cannot reliably own … durable workflow state" and moved authority into Tiber. Is the new pi extension meant to be purely advisory (principles + judgement), or should it carry any mechanical gates (e.g., a tool-call interceptor for `git push --force`)? If mechanical, which of the 16 non-negotiables above warrant it, given the ADR-0003 regret about fail-closed drift?
2. **Which non-negotiables are Rust-specific vs universal?** `thiserror`, `nutype`, Clippy `restriction` are Rust mechanics. Should the extension state the principle (typed errors, newtypes, strict lints) and let the model pick the stack idiom, or carry per-stack idiom tables?
3. **Tiber dependency.** Several rules (CI-recovery incident, 75-minute checkpoints, final-review policy as "mechanical delivery gate," `.tasks/` ownership) assume Tiber. Should the pi extension depend on, optionally integrate with, or deliberately exclude Tiber?
4. **Hard-guard strategy.** `assert-hard-guards.cjs` grew a large negation/approval-gate regex engine. For the new extension, is the intent to replace prose-matching with trajectory/tool-call assertions (as the plan suggests "when the provider exposes them")? Does pi's eval story expose tool traces?
5. **Baseline lift gate.** `evals/matrix.json` defaults `baselineLiftThreshold: 0.1` and the hyprland `coverageDecision` defers value claims until ablation runs. Is "prove the extension lifts behavior vs bare model by ≥10%" a shipping requirement for the pi extension too?
6. **EventCore modeling rules** — these are very specific (command/evolve/decide, provenance checker). Are they in scope for a general-purpose extension, or only for projects that already use EventCore?
7. **Delivery precedence in pi.** `workflow-and-commits.md` routes through `development-discipline:delivery-workflow` and a `.development-system.toml`. What's the pi-native equivalent for "repository-local delivery policy" — `AGENTS.md`? a config key? inference from branch protection?
8. **The one-hour and 75-minute heuristics** — both time-based. Should they survive into an extension where the model has no reliable clock and no durable session store (ADR-0017 needed Git+SQLite for this)?
9. **ADR-0012 vs `.coderabbit.yaml` wording** on nursery lints (selected individually vs. denied) — which is current?
10. **Status of 0017** has no date and 0003 has no date — are these the current operational posture or partially historical?
11. **Forced vs natural skill invocation.** The loader supports both; which mode produced the evidence the author trusts, and should the pi extension be evaluated only in `natural` mode (progressive disclosure working as intended)?
