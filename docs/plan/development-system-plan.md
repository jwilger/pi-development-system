# pi-development-system — Delivery Plan

Status: DRAFT for author review (2026-10-06). Becomes the active plan once John
approves it. Basis: `docs/research/00-synthesis.md` (binding decisions D1–D13,
non-negotiables, Jev map) and research reports `docs/research/01..05`.

---

## 0. How to use this plan

**For pi-goal-x:** the goal is "complete every increment in
`docs/plan/development-system-plan.md`, in order, honouring §1". Each
increment is one goal task; its *Acceptance* list is the done criterion; its
*Release* step ends with a mandatory stop for the human.

**For the implementing model (expected: Claude Sonnet 5.5 — a capable but
less careful model than the one that wrote this):**

1. Read `docs/research/00-synthesis.md` fully before the first increment.
   Read the research report an increment cites only when that increment
   starts. Do not read all five reports up front (context rot).
2. Work **one increment at a time**, one task at a time, in the order given.
   Do not start the next increment's files early.
3. Every task lists `Files`, `Interfaces`, `First test`, `Run`, `Expected`.
   If any of those is missing or wrong when you get there, **stop and ask**
   rather than inventing. Never write `TODO`/`TBD` into shipped code.
4. Treat "Interfaces" signatures as contracts. You may add private helpers;
   you may not change an exported signature without recording a departure
   (after increment 1, with `devsys_record_departure`; before that, in
   `docs/decisions/2026-10.md` by hand using Appendix A).
5. When a task is done, mark its checkbox in §4 and update `## Progress`
   below. Only mark done when `Run` produced `Expected`. Paste the exact
   command output in the commit body if it is short.
6. If you are stuck for more than two attempts on the same test, do not
   loosen the test. Spawn an `advisor` subagent (stronger model) with the
   task text and your two failed attempts, or ask the user.

## Progress

- [x] I0 Foundation, principles, harness
- [x] I1 Departure ledger + hard-stop git guard
- [x] I2 Jev runtime core
- [x] I3 Delivery discipline (commit/push/CI gates, repo policy)
- [x] I4 Engineering skills + language profiles + TDD/test gates
- [x] I5 Vendored subagents with dynamic model/effort routing
- [x] I6 Review orchestration (fresh reviewer, lenses, recoverable clean streak)
- [x] I7 Anti-drift: verifier, compaction, model/phase recommendation
- [x] I7b Cleanup: no skips, no nit file, no warnings, subagent thread cap, resync removed
- [x] I8 Work sizing, slices, task records, tracker adapters, pi-goal-x hand-off
- [ ] I8b Codemode and ambient activation (nested-call guard tests, exposure pass, intent trigger, verifier nudges)
- [ ] I9 Product planning skills (brief, decisions, interview loop, lens review, journeys, ADR)
- [ ] I10 Event modelling lite (slice schema v1, validator, GWT → tests)
- [ ] I11 Design-system profile, threat modelling, skill lint, 1.0 readiness

---

## 1. Operating rules while executing this plan

These apply to building the extension itself. From I1 onward the extension
enforces several of them on its own development (dogfooding).

**R1 — TDD on the extension.** Every behaviour change starts with a failing
`node --test` test (`test/**/*.test.ts`). Exemptions (record in the commit
body, no gate yet): pure config, docs, vendored code copied verbatim,
generated fixtures.

**R2 — Functional core / imperative shell.** Decision logic lives in
`src/core/**` as pure functions over explicit types and is unit-tested
without pi. Side effects (pi API, fs, git, Jev network) live in thin adapters
(`src/gates`, `src/state`, `src/jev`, `src/context`, …). Tests for adapters
use the fake `ExtensionAPI` harness (Appendix G), not a live pi.

**R3 — Types.** Illegal states unrepresentable: discriminated unions for
`GateDecision`, `Phase`, `Sizing`, `Severity`, etc. No `any`, no `as` casts
except at the JSON/pi boundary with a parse function. Biome strict.

**R4 — Commits.** Conventional Commits with a rationale body (what/why),
small, one concern each (structural vs behavioural never mixed), **no AI
attribution trailers**. Lefthook runs typecheck/lint/test/version check; do not
bypass (`--no-verify` is a non-negotiable violation). Jev chooses the semver
bump on commit; add `Jev-Override: <reason>` only if Jev is unavailable.

**R5 — Push cadence.** Push to `main` after each green task (not only at the
end of an increment). If more than ~60 minutes pass without a push, stop and
ask whether the task is too big.

**R6 — Red CI holds work.** After pushing, check `gh run list --branch main
--limit 1`. If red, the next commit must be a fix for that failure (`fix(ci):
…`). Nothing else.

**R7 — Release ritual (end of every increment).** Appendix F. It ends by
running `pi update --extensions` and then **stopping** with the message:
"Increment N released as vX.Y.Z and updated locally. Please run `/reload`
(or restart pi) and tell me to continue." Do not continue until told.

**R8 — Review.** Before the release commit of each increment, spawn a
fresh-context `reviewer` subagent (pi-subagent-manager until I5; the vendored
one after) with: the increment's section of this plan, `git diff
<increment-start>..HEAD --stat`, and the instruction to report blocking /
should-fix / nit findings with `path:line`. Fix blocking and should-fix
findings; a nit is fixed now or dropped with a reason (I7b.3). Repeat until a review
returns no blocking/should-fix findings (from I6 the extension tracks the
streak; before that, do two consecutive clean reviews).

**R9 — ADRs.** Any architecture-shaping decision made while implementing gets
`docs/adr/NNNN-<slug>.md` using the template in `docs/adr/0000-template.md`
(created in I0).

**R10 — Headless safety.** Any guard must behave safely when `!ctx.hasUI`:
block with an instructive reason. Never auto-approve in headless mode.

**R11 — No secrets.** `TYPESAFE_API_KEY` and tokens never appear in fixtures,
logs, decision entries, subagent prompts, or commits. Fixtures hold Jev
*inputs and expected outputs*, never raw API responses containing keys.

---

## 2. Target repository layout

```text
package.json                  "pi": { extensions: ["./extensions/development-system.ts"], skills: ["./skills"], prompts: ["./prompts"] }
extensions/development-system.ts   composition root only (wires modules, no logic)
principles/                   NON-NEGOTIABLES.md, DEFAULTS.md (negative constraints + rationale; injected compactly)
skills/<name>/SKILL.md        lazy skills (+ references/ subdir when needed); profiles under skills/profile-<lang>/
prompts/*.md                  /devsys-start, /devsys-status, /devsys-models, /devsys-adr, /devsys-review, /devsys-plan, /devsys-release …
agents/*.md                   subagent definitions (vendored format): advisor, implementer, reviewer, researcher, lens-*
src/core/                     pure domain (types + decision functions)
src/gates/                    tool_call guards
src/jev/                      Jev wrapper over ctx.modelRegistry.classify() + question functions
src/core/models.ts            model matrix: slots, family patterns, latest-version resolution (pure)
src/state/                    session entries, decision-log writer, config loader
src/context/                  system-prompt section, context tail, compaction, turn_end verifier
src/subagents/                vendored pi-subagent-manager (I5) + VENDORED.md
src/review/                   review orchestration + clean streak
src/tracker/                  Tracker interface + adapters
src/planning/                 sizing, task records, slice schema + validator
test/                         node --test; test/harness/fake-pi.ts
evals/jev/<question>.json     fixtures per Jev question
docs/adr/                     this repo's ADRs; docs/decisions/ departure log + followups.md
docs/research/, docs/plan/    (existing)
```

Naming: all registered tools are prefixed `devsys_`; all custom session entry
types are prefixed `devsys-`; all status/widget keys `devsys`. Slash commands
are `/devsys-*`. Config file: `.development-system.toml` (repo root; new
schema v1, Appendix B).

Dependencies policy: pi host libs only as `peerDependencies: "*"`
(`@earendil-works/pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`,
`@sinclair/typebox`). Runtime deps allowed: `smol-toml`, `yaml`, `fuzzysort`,
`shell-quote` (last three for the vendored subagents). Adding any other
runtime dependency requires an ADR. **Jev is NOT a dependency**: pi ships Jev
as a classifier model (`typesafe/jev-latest`, `openrouter/typesafe/jev-latest`,
`opencode/jev-1.13`, `cloudflare-workers-ai/typesafe/jev`,
`vercel-ai-gateway/typesafe-ai/jev`) reachable via
`ctx.modelRegistry.classify()` — see `$D/docs/models.md` "Use classifier
models" and `$D/examples/extensions/jev-router.ts`. Using the host's
classifier path means any user with any of those credentials gets Jev, not
only TypeSafe key holders.

Model references policy: **no model id is hard-coded anywhere outside
`src/core/models.ts` defaults and `agents/*.md`**. Everything else asks the
matrix for a *slot* (Appendix B `[models]`).

---

## 3. Shared formats

All formats are defined once in the appendices and referenced by increments:
A decision-log entry + `devsys_record_departure` schema; B
`.development-system.toml` v1; C task record (weak-model-ready); D slice
schema v1; E Jev question catalogue + fixture policy; F release ritual; G fake
ExtensionAPI harness.

---

## 4. Increments

Each increment: **Goal → Why → Tasks (checkbox) → Acceptance → Release**.
Expected semver bump is advisory; Jev decides.

### I0 — Foundation, principles, harness  (expect 0.1.0)

**Goal.** A loadable extension that injects the non-negotiables into the
system prompt, exposes `/devsys-status`, keeps typed in-session state, and has
a test harness that lets every later increment be test-driven without a live
pi. **Why.** Everything after this is a gate, a skill, or a state transition;
they need a place to live and a way to be tested. Cite: research 04 §1–2, §6.

Tasks:

- [x] **I0.1 Package manifest.**
  Files: `package.json`, `tsconfig.json`, `biome.json`.
  Change: add `pi` manifest block (layout §2); peerDependencies for all five
  host libs with `"*"`; `dependencies` add `smol-toml`; keep existing scripts;
  `files` must include `extensions`, `src`, `skills`, `prompts`, `principles`,
  `agents`. Run: `npm run typecheck && npm run lint && npm test`.
  Expected: all green (zero tests is fine at this step).
- [x] **I0.2 Fake pi harness.**
  Files: `test/harness/fake-pi.ts`, `test/harness/fake-pi.test.ts`.
  Interfaces (Appendix G): `createFakePi(): { api: ExtensionAPI; emit<E extends ExtensionEvent>(event: E, ctx?: Partial<ExtensionContext>): Promise<unknown>; tools: Map<string, ToolDefinition>; commands: Map<string, RegisteredCommand>; entries: Array<{customType: string; data: unknown}>; ui: FakeUi }` where `FakeUi` has `confirmResponses: boolean[]`, `selectResponses: string[]`, `calls: Array<{kind: string; args: unknown[]}>`, and `hasUI: boolean`.
  First test: registering a handler via `api.on("tool_call", h)` and calling
  `emit({type:"tool_call", toolName:"bash", input:{command:"ls"}, toolCallId:"1"})`
  invokes `h` and returns its result. Run: `npm test`. Expected: pass.
- [x] **I0.3 Core types.**
  Files: `src/core/types.ts`, `test/core/types.test.ts`.
  Interfaces: `type Tier = "hard" | "soft" | "advisory"`;
  `type GateDecision = {kind:"allow"} | {kind:"block"; reason:string} | {kind:"require-departure"; gate:GateId; reason:string} | {kind:"require-user"; gate:GateId; reason:string}`;
  `type GateId = string & {readonly __brand:"GateId"}` with `parseGateId(s:string): GateId | ParseError`;
  `type Phase = "intake" | "planning" | "implementing" | "reviewing" | "delivering" | "idle"`;
  `type Sizing = "fix" | "change" | "capability" | "product"`;
  `type DevsysState = { phase: Phase; sizing?: Sizing; activeSlice?: SliceRef; openDepartures: Departure[]; jev: "online" | "offline" | "unknown"; lastPushAt?: string }`.
  First test: `parseGateId("")` returns a `ParseError`; `parseGateId("git.history-rewrite")` returns a branded id. Run/Expected: `npm test` pass.
- [x] **I0.4 State store on session entries.**
  Files: `src/state/session-state.ts`, `test/state/session-state.test.ts`.
  Interfaces: `createSessionState(api: ExtensionAPI): { get(): DevsysState; update(fn:(s:DevsysState)=>DevsysState): void; rebuildFrom(entries: ReadonlyArray<{customType:string; data:unknown}>): void }`. `update` appends a `devsys-state` custom entry with the full new state (small; last entry wins on rebuild). `rebuildFrom` is called from `session_start`/`session_tree` handlers using `ctx.sessionManager.getBranch()` (research 04 §2).
  First test: after two `update`s and `rebuildFrom(entries)`, `get()` equals the second state. Run/Expected: pass.
- [x] **I0.5 Principles files + system-prompt section.**
  Files: `principles/NON-NEGOTIABLES.md` (the ten items from synthesis §6, verbatim, ≤ 60 lines), `principles/DEFAULTS.md` (synthesis §7, one line each with rationale), `src/context/system-prompt.ts`, `test/context/system-prompt.test.ts`.
  Interfaces: `buildPromptSection(state: DevsysState, nonNegotiables: string): string` (pure); handler for `before_agent_start` sets `event.systemPromptOptions.sections["development-system"]` (mutate sections, do not return `systemPrompt`).
  First test: section contains all ten non-negotiable headings and the current phase. Run/Expected: pass.
- [x] **I0.6 `/devsys-status` command + status line.**
  Files: `src/context/status.ts`, `extensions/development-system.ts`, `prompts/devsys-status.md` (not needed if the command renders directly — prefer `pi.registerCommand("devsys-status", …)`).
  Behaviour: prints phase, sizing, active slice, open departures count, Jev status; `ctx.ui.setStatus("devsys", "devsys: <phase> · jev <status>")` on session start and state change.
  Test via harness: after `emit(session_start)`, `fakePi.ui.calls` contains a `setStatus` with key `devsys`. Run/Expected: pass.
- [x] **I0.7 ADR scaffolding for this repo.**
  Files: `docs/adr/0000-template.md` (Status/Date/Context/Decision/Consequences ±/Alternatives "Rejected because"/Revisit when/Related — research 03 §5), `docs/adr/0001-three-tier-enforcement.md`, `docs/adr/0002-jev-as-runtime-judgement.md`, `docs/adr/0003-vendor-subagent-manager.md`, `docs/decisions/followups.md` (empty list), `docs/decisions/README.md` (Appendix A format).
- [x] **I0.8 Composition root + smoke test.**
  Files: `extensions/development-system.ts`, `test/extension.test.ts`.
  Test: loading the default export against the fake pi registers `devsys-status` and handlers for `session_start`, `before_agent_start`. Run/Expected: pass.

Acceptance: `npm run check:build-gate && npm run typecheck && npm run lint && npm test` green; after release, `/devsys-status` works in this session and the system prompt (visible via `/debug` or by asking the model to quote its `development-system` section) contains the ten non-negotiables.

Release: Appendix F. STOP for reload.

### I1 — Departure ledger + hard-stop git guard  (expect 0.2.0)

**Goal.** The sanctioned escape hatch and the first hard stop. **Why.** The
escalation channel is what makes gates safe to add (research 05 B3); the git
guard is the highest-value irreversible-action stop. Cite: research 04 §3,
synthesis §5 D1/D2/D8, Appendix A.

- [x] **I1.1 Departure domain.**
  Files: `src/core/departure.ts`, `test/core/departure.test.ts`.
  Interfaces: `type Departure = { id: DepartureId; gate: GateId; tier: "soft"|"hard"; default: string; chosen: string; why: string; costIfWrong: string; approver: "agent"|"user"; scope: {kind:"slice"; slice: SliceRef} | {kind:"session"} | {kind:"once"; toolCallId: string}; revisitWhen?: string; recordedAt: string }`; `parseDeparture(input: unknown): Departure | ParseError`; `renderDepartureMarkdown(d: Departure): string` (Appendix A); `matchesPending(departures: Departure[], gate: GateId, now: string): Departure | undefined`.
  First test: `renderDepartureMarkdown` output matches the Appendix A fixture byte-for-byte. Run/Expected: pass.
- [x] **I1.2 Decision-log writer.**
  Files: `src/state/decision-log.ts`, `test/state/decision-log.test.ts`.
  Interfaces: `appendDecision(repoRoot: string, d: Departure, now: Date): Promise<{path: string}>` → appends to `docs/decisions/YYYY-MM.md`, creating header if absent. Test uses a temp dir. Run/Expected: pass.
- [x] **I1.3 `devsys_record_departure` tool.**
  Files: `src/gates/record-departure-tool.ts`, `test/gates/record-departure-tool.test.ts`.
  Parameters (TypeBox): `gate: string`, `chosen: string`, `why: string`, `costIfWrong: string`, `scope: "slice"|"session"|"once"`, `revisitWhen?: string`. Behaviour: parses → for `tier:"hard"` gates returns an error result telling the model this gate needs the user (`devsys_request_approval` in I1.5); for soft gates appends to decision log, appends `devsys-departure` entry, updates state `openDepartures`, returns the rendered markdown. `exposure: "always"`.
  First test: calling with a soft gate id results in one new decision-log line and one `devsys-departure` entry. Run/Expected: pass.
- [x] **I1.4 Git intent classifier (deterministic fast path).**
  Files: `src/core/git-intent.ts`, `test/core/git-intent.test.ts`.
  Interfaces: `type GitIntent = "history-rewrite" | "force-push" | "branch-delete-remote" | "destructive-reset" | "no-verify" | "ordinary" | "unknown"`; `classifyGitCommand(command: string): GitIntent` (tokenise with `shell-quote`, handle `&&`, `;`, `|`; `git push --force|-f|--force-with-lease`, `git commit --amend`, `git rebase`, `git reset --hard`, `git push origin :branch`/`--delete`, `--no-verify`, `git filter-branch`/`filter-repo`). Unknown/complex shell → `"unknown"`.
  First test: table-driven over ≥ 25 commands including obfuscations (`git -c x=y push -f`, `command git push --force`). Run/Expected: pass.
- [x] **I1.5 Hard-stop guard + approval tool.**
  Files: `src/gates/git-guard.ts`, `src/gates/request-approval-tool.ts`, `test/gates/git-guard.test.ts`.
  Behaviour: `tool_call` handler on `bash`: classify; `ordinary` → allow; `history-rewrite|force-push|branch-delete-remote|destructive-reset|no-verify` → if a `devsys-approval` entry for this exact command+gate exists in the current session and is unused → allow and mark used; else if `ctx.hasUI` → `ctx.ui.confirm("Development system — hard stop", "<command>\nGate: <gate>\nThis is irreversible. Approve once?")` → approve records a `Departure{tier:"hard", approver:"user", scope:{kind:"once"}}` to the decision log and allows; decline blocks with reason; `!ctx.hasUI` → block with reason `"hard stop <gate>: requires user approval; run interactively"`. `unknown` → allow in I1 (Jev takes this in I2).
  `devsys_request_approval` tool: lets the model *ask* for approval ahead of time (`gate`, `command`, `why`); shows the confirm dialog; records approval; returns outcome. Headless → returns "unavailable headless".
  First tests: (a) `git push --force` with no UI → blocked; (b) with `confirmResponses:[true]` → allowed and a decision-log entry written; (c) `git status` → allowed with no UI calls. Run/Expected: pass.
- [x] **I1.6 Context tail: open departures.**
  Files: `src/context/context-tail.ts`, `test/context/context-tail.test.ts`.
  Interfaces: `renderContextTail(state: DevsysState): string | undefined` (≤ 25 lines: phase, active slice, open departures as `gate — chosen (scope)`, "Jev: status", and the one-line reminder "Departures: call devsys_record_departure before acting against a default; hard stops need the user."). Handler on `context` appends a user-role message at the **end** of `event.messages` (research 04 §4: cache-friendly tail); nothing when state is idle with no departures.
  Test: with one open departure the tail names its gate. Run/Expected: pass.
- [x] **I1.7 Dogfood switch.** From here on, record departures from this plan with `devsys_record_departure`. Note in `docs/decisions/README.md`.

Acceptance: in this session after reload, `git push --force` is intercepted with a confirm dialog; `devsys_record_departure` appends to `docs/decisions/2026-10.md`; `/devsys-status` shows the open departure; after `/compact` the departure still appears in the context tail.

Release + STOP.

### I2 — Jev runtime core  (expect 0.3.0)

**Goal.** A robust Jev wrapper and the first two runtime judgements (shell
intent, test-weakening motive) wired into guards with deterministic fallback.
**Why.** D5, D12; regex-only gates are brittle, prose-only gates are
write-only. Cite: `$D/docs/models.md` "Use classifier models", `$D/docs/codemode.md` "Classify", `$D/examples/extensions/jev-router.ts`, typesafe skill (question design only), Appendix E.

- [x] **I2.1 Wrapper over the host classifier.**
  Files: `src/jev/client.ts`, `src/jev/models.ts`, `test/jev/client.test.ts`.
  Jev is reached through pi, never through an SDK: `ctx.modelRegistry.findOfType("classifier", provider, id)` + `ctx.modelRegistry.hasConfiguredAuth(model)` to pick a model, `ctx.modelRegistry.classify(model, {state, questions})` to ask. `classify()` never rejects — read `result.stopReason` (`"stop"|"error"|"aborted"`) and `result.errorMessage`. Question/answer types come from `@earendil-works/pi-ai` (`ClassifierChoiceQuestion {type:"choice"; instructions; criteria: Record<string,string>}`, `ClassifierBoolQuestion {type:"bool"; instructions; criteria:{true,false}}`, `ClassifierScoreQuestion {type:"score"; instructions; criteria: string[]}`; answers `{type:"choice"; choice; probabilities; confidence}` / `{type:"bool"; probability}` / `{type:"score"; score; confidence}`).
  Interfaces: `type JevAvailability = "online"|"offline"|"unknown"`; `resolveJevModel(registry: ClassifierRegistry, candidates: readonly string[]): ClassifierModel | undefined` (first `provider/id` in `candidates` that exists AND has configured auth; default candidate list in `src/jev/models.ts` = the five ids listed in §2, overridable by Appendix B `[models] jev`); `createJev(opts:{registry: ClassifierRegistry; candidates: readonly string[]; timeoutMs: number; cache: Map<string, ClassifierResult>; now(): number}): { ask(state: JsonObject, questions: Record<string, ClassifierQuestion>): Promise<Result<Record<string, ClassifierAnswer>, JevError>>; availability(): JevAvailability; model(): string | undefined }`. `ClassifierRegistry` is a narrow structural type (`findOfType`, `hasConfiguredAuth`, `classify`) satisfied by `ctx.modelRegistry` so tests pass a fake. `JevError = {kind:"no-model"} | {kind:"timeout"} | {kind:"provider"; message:string} | {kind:"aborted"}`. Caches by SHA-256 of JSON(state, questions). No resolvable model → `offline` immediately, no network.
  First test: fake registry with no authed classifier → `ask` returns `{kind:"no-model"}`, availability `offline`; fake registry with one → two identical asks call `classify` once; `stopReason:"error"` → `{kind:"provider"}`. Run/Expected: pass.
- [x] **I2.2 Question: shell intent.**
  Files: `src/jev/questions/shell-intent.ts`, `evals/jev/shell-intent.json`, `test/jev/shell-intent.test.ts`.
  Interface: `judgeShellIntent(jev, command: string): Promise<Result<{intent: GitIntent; confidence: number}, JevError>>` using `choice` over the `GitIntent` set (includes `"ordinary"` as no-match). Policy in code: confidence < 0.6 → `"unknown"`.
  Fixture: ≥ 12 cases `{command, expected}`. Fixture accuracy test lives in `test/live/` (run by `npm run test:jev`, never skipped; see I7b.2) and asserts ≥ 10/12; the question-hash pin is an offline test in `test/jev/`. The fixture runner needs a real classifier call outside a pi session: first try the SDK (`DefaultResourceLoader` + `createAgentSession` with `SessionManager.inMemory()`, then `session.modelRegistry` — verify the property exists in `$D/dist/core/sdk.d.ts`); if that is impractical, fall back to `pi -p --mode json` with a tiny fixture-runner extension that prints answers. Decide in this task and record the choice in `evals/jev/README.md`. Deterministic test: low-confidence mapping. Run/Expected: `npm test` pass; `npm run test:jev` pass with any Jev credential present.
- [x] **I2.3 Wire into git guard.** `unknown` from the fast path → Jev; Jev offline/low-confidence → if UI, `ctx.ui.confirm` ("Could not classify this command; approve?"), else block. Status line reflects Jev availability. Test with fake Jev returning `history-rewrite` → hard stop path. Run/Expected: pass.
- [x] **I2.4 Question: test-change motive.**
  Files: `src/jev/questions/test-change.ts`, `evals/jev/test-change.json`, `src/core/test-paths.ts` (`isTestPath(path, profile?)`).
  Interface: `judgeTestChange(jev, input:{path:string; before?: string; after?: string; recentFailure?: string}): Promise<Result<{weakens: number; motive: "requirement-change"|"gate-gaming"|"refactor"|"unclear"; confidence:number}, JevError>>` (noul + choice). Fixture ≥ 10 cases.
- [x] **I2.5 Test-change gate (soft → hard escalation).**
  Files: `src/gates/test-guard.ts`, `test/gates/test-guard.test.ts`.
  Behaviour on `edit`/`write`/`bash rm` touching a test path: if it deletes the file, adds skip/xit/`#[ignore]`/`.skip(`, or Jev `weakens ≥ 0.7`: motive `gate-gaming` (conf ≥ 0.6) → hard stop (non-negotiable 2, confirm dialog / headless block); otherwise → `require-departure` for gate `tests.weaken` unless a matching pending departure exists → allow. Jev offline → deterministic signals only; deletion/skip → `require-departure`; others allow.
  Tests: deletion without departure → blocked with reason naming `devsys_record_departure` and gate `tests.weaken`; with pending departure → allowed; fake Jev `gate-gaming` → hard stop. Run/Expected: pass.

Acceptance: `/devsys-status` shows `jev online (<provider>/<id>)` when any Jev credential is present and `jev offline` otherwise; deleting a test file in this repo without a recorded departure is blocked with an instructive reason; recording the departure then allows it.

Release + STOP.

### I3 — Delivery discipline  (expect 0.4.0)

**Goal.** Commit/push gates and repo policy: Conventional Commit with
rationale, no AI trailers, structural/behavioural separation, red-trunk hold,
delivery mode from `.development-system.toml`. **Why.** D9, non-negotiables
4, 6, 8. Cite: research 02 (workflow-and-commits), Appendix B.

- [x] **I3.1 Config loader.** Files: `src/state/config.ts`, `test/state/config.test.ts`. Interface: `loadConfig(repoRoot): Promise<Result<DevsysConfig, ConfigError>>` parsing Appendix B with defaults; unknown keys → error naming the key. Test: empty file → defaults; bad `delivery.mode` → error.
- [x] **I3.1a Model matrix (pure).** Files: `src/core/models.ts`, `test/core/models.test.ts`.
  Types: `type Slot = "frontier"|"strong"|"fast"|"planning"|"advisor"|"implementer"|"reviewer"|"lens"|"researcher"|"jev"`; ``type ModelRef = `${string}/${string}` ``; a candidate is a `ModelRef` whose id may contain `*` (family pattern, e.g. `openai-codex/gpt-*-sol`) or a slot reference `@strong`.
  Functions: `compareModelVersions(a: string, b: string): number` (natural order over numeric segments: `gpt-6.1-sol` > `gpt-6-sol` > `gpt-5.6-sol`; `claude-opus-5-5` > `claude-opus-5`; dated suffixes `-20251001` rank *below* the undated alias); `resolveCandidate(candidate: ModelRef, available: readonly {provider; id}[]): ModelRef | undefined` (exact match, or newest available id matching the pattern); `resolveSlot(matrix: ModelMatrix, slot: Slot, available): {model: ModelRef; via: ModelRef} | undefined` (first candidate in the slot's list that resolves; `@slot` indirection resolved recursively with a cycle check); `defaultMatrix(): ModelMatrix` (Appendix B defaults, families only, no dated ids); `renderMatrixToml(matrix): string`.
  Tests: version ordering table; pattern picks newest; slot falls through to next family when a provider is absent; `@slot` indirection; cycle → error; `defaultMatrix()` resolves every slot against a fixture of the current `pi --list-models` output *and* against an OpenAI-only fixture *and* an Anthropic-only fixture (`test/fixtures/models/*.json`).
- [x] **I3.1b `/devsys-models` command + `devsys_models` tool.** Files: `src/state/models-command.ts`, `test/state/models-command.test.ts`.
  `/devsys-models` (TUI): reads `ctx.modelRegistry.getAvailable()` (chat) and `getModelsOfType("classifier")` filtered by `hasConfiguredAuth`, resolves `defaultMatrix()` (or the existing `[models]` table if present) against them, shows a per-slot table `slot → resolved model (via candidate) · $in/$out per M` from the catalog, then `ctx.ui.select` per slot: *accept* / *pick another available model* / *pin exact id (no auto-roll)*; writes the `[models]` table into `.development-system.toml` (creating the file with defaults if absent) and appends a `devsys-config` entry. Headless (`!ctx.hasUI`): write defaults without prompting, print the table. `/devsys-models --check` prints the table and exits non-zero if any slot is unresolvable (used by `/devsys-status`).
  Tool `devsys_models({slot?})` returns resolved `{slot, model, via}` for the agent (used by I5.4 and I7).
  Tests with the fake harness: Anthropic-only registry → every slot resolves to an Anthropic model; empty registry → command reports unresolvable slots and does not write.
- [x] **I3.2 Commit message domain.** Files: `src/core/commit-message.ts`, tests. Interfaces: `parseConventionalCommit(msg): Result<{type; scope?; breaking; subject; body; trailers}, ParseError>`; `findForbiddenTrailers(msg): string[]` (`Co-Authored-By`, `Generated-By`, `Signed-off-by: *AI*`, configurable list); `hasRationaleBody(msg): boolean` (body ≥ 1 non-empty paragraph that is not a bullet list of files).
- [x] **I3.3 Jev questions: rationale + structural/behavioural mix.** Files: `src/jev/questions/commit.ts`, `evals/jev/commit-rationale.json`, `evals/jev/commit-mix.json`. Interface: `judgeCommit(jev, {message, diffStat, diff}): Promise<Result<{rationale:number; mixesStructuralAndBehavioural:number}, JevError>>` (two `noul`, same state, one call).
- [x] **I3.4 Commit guard.** Files: `src/gates/commit-guard.ts`, tests. On bash `git commit …`: extract message (`-m`, `-F`, heredoc); forbidden trailer → hard stop (non-negotiable 8; block with reason, no dialog needed — it is never approvable); not Conventional or no rationale → `require-departure` gate `commit.rationale`; Jev mix ≥ 0.7 → `require-departure` gate `commit.mixed-change`. Jev offline → skip Jev checks. Tests cover each branch.
- [x] **I3.5 Trunk state + push guard.** Files: `src/state/ci.ts` (`getTrunkStatus(exec, {remote, branch}): Promise<"green"|"red"|"pending"|"unknown">` via `gh run list --branch <b> --limit 1 --json status,conclusion,headSha`), `src/gates/push-guard.ts`, tests with fake exec. On `git push`: red trunk → allow only if the last commit type is `fix` and (Jev) `fixRelatedProbability ≥ 0.6` against the failing log (`gh run view --log-failed`), else hard stop (non-negotiable 4). Delivery mode `pull-request` → pushing to trunk directly → hard stop (non-negotiable 6). `local-only` → block push with reason. Records `lastPushAt` on success (via `tool_result`).
- [x] **I3.6 `/devsys-ci` command + CI watch.** Registers command that runs `gh run watch` for the pushed SHA (non-blocking status line updates) and writes `devsys-ci` entries. Minimal: status line `ci: pending/green/red (sha)`.
- [x] **I3.7 Skill `delivery-discipline`.** `skills/delivery-discipline/SKILL.md` (≤ 150 lines): trunk flow, commit message shape with examples, when to use `fix(ci)`, worktrees only when concurrency needs them, lefthook template reference (`references/lefthook.yml`). Negative constraints with rationale.

Acceptance: a commit with `Co-Authored-By` is blocked; a commit without body prompts for a departure; pushing on red trunk with an unrelated change is hard-stopped; this repo's `.development-system.toml` exists with `delivery.mode = "trunk"` and a `[models]` table written by `/devsys-models`; `/devsys-models --check` passes on this machine.

Release + STOP.

### I4 — Engineering skills, language profiles, TDD gates  (expect 0.5.0)

**Goal.** The engineering standards as lazy skills plus RED-first and
lint-suppression soft gates, with Rust and TypeScript profiles. **Why.** D3;
weak models need concrete idioms; prose alone is write-only so the two
cheapest deterministic gates back it. Cite: research 02 §1, research 05 Part
A (Beck, Wlaschin), Anthropic skills guidance (research 05 B1).

- [x] **I4.1 Skills (each ≤ 200 lines, negative constraints + rationale + one copyable checklist):** `skills/tdd-canon` (test list, one test at a time, RED applicability exemptions list copied from research 02 verbatim, Tidy-First separation), `skills/functional-core-imperative-shell`, `skills/semantic-types` (parse-don't-validate, illegal states unrepresentable, state machines), `skills/typed-errors` (errors as values; Wlaschin's five exceptions), `skills/strict-lints` (suppression needs a rationale comment), `skills/behaviour-tests` (black-box, vertical slice, never assert committed text, test desiderata).
- [x] **I4.2 Profiles:** `skills/profile-rust/SKILL.md` (+`references/`: nutype, thiserror, clippy pedantic/restriction set, cargo-mutants policy, test layout), `skills/profile-typescript/SKILL.md` (+references: branded types + parse fns, `Result` pattern, biome strict config, node:test/vitest layout, ESM). Each profile's description must say when it applies (file extensions) so pi's lazy loading triggers.
- [x] **I4.3 Profile detection.** `src/core/profile.ts`: `detectProfiles(repoRoot): Promise<Profile[]>` (Cargo.toml → rust; package.json/tsconfig → typescript). Context tail lists active profiles. Config may override (Appendix B `profiles`).
- [x] **I4.4 RED-first evidence tracker.** `src/state/test-evidence.ts`: observe `tool_result` of bash commands matching the profile's test runner (`cargo test`, `npm test`, `node --test`, `vitest`) and record `{at, exitCode, summary}` in state (`lastTestRun`). `src/gates/red-first-guard.ts`: on `edit`/`write` to a non-test source file while `phase === "implementing"` and `lastTestRun` is missing or green and no failing test was observed since the last source edit → `require-departure` gate `tdd.red-first` (soft) **unless** the edit matches a documented exemption class detectable deterministically (new test file, docs, config, generated). Must be low-noise: one departure per slice covers the slice (`scope: slice`). Tests cover: red observed → allow; green then edit → require-departure; pending slice departure → allow.
- [x] **I4.5 Lint-suppression guard.** `src/gates/lint-suppression-guard.ts`: edit/write introducing `#[allow(`, `// biome-ignore`, `// eslint-disable`, `@ts-ignore`, `@ts-expect-error` without a same-line/next-line rationale (`: <text>` ≥ 15 chars) → `require-departure` gate `lints.suppression`. Pure detector in `src/core/lint-suppression.ts` with table tests.
- [x] **I4.6 Skill lint test.** `test/skills.test.ts`: every `skills/**/SKILL.md` has frontmatter `name` + `description`, ≤ 500 lines, and every relative path it references exists (research 05: 23 % of rule files have stale paths).

Acceptance: in a TS repo, editing `src/x.ts` right after a green run prompts for a `tdd.red-first` departure; adding `// biome-ignore lint/x` without rationale prompts for `lints.suppression`; `/skill:profile-typescript` loads.

Release + STOP.

### I5 — Vendored subagents with dynamic model/effort routing  (expect 0.6.0)

**Goal.** Bring pi-subagent-manager into this package, add per-spawn `model`
and `thinkingLevel`, add devsys agent definitions and Jev-based routing.
**Why.** D6, D10. Cite: `~/.pi/agent/npm/node_modules/pi-subagent-manager`
(v0.14.0, MIT), research 04 §2, Appendix E (routing).

- [x] **I5.1 Vendor.** Copy `src/**` → `src/subagents/`, `agents/*.md` → `agents/`, `docs/custom-agents.md` → `docs/subagents/custom-agents.md`. Add `src/subagents/VENDORED.md` (upstream name, version 0.14.0, commit if discoverable, MIT notice, list of local modifications — keep it updated). Add deps `fuzzysort`, `shell-quote`, `yaml`. Keep tool names (`agent_spawn`, `agent_wait`, …) and the agents/*.md format **unchanged**. Run: `npm run typecheck`. Expected: green (fix import paths only). Register the vendored extension from the composition root. Record the departure from R1 (verbatim copy, no new tests) by hand in the commit body — this is an allowed exemption.
- [x] **I5.2 Per-spawn overrides.** In `src/subagents/orch/tools.ts` extend `agent_spawn` parameters with optional `model?: string` ("provider/id") and `thinkingLevel?: "off"|"minimal"|"low"|"medium"|"high"|"xhigh"|"max"`. In `src/subagents/orch/runtime.ts` `resolveInitialSettings(type, parentPath, restored, overrides?)`: overrides win over type preferences and inheritance; unavailable model → the existing clear error. `agent_types` output unchanged. Test: unit test of `resolveInitialSettings` with overrides (extract it to a pure function if needed). Run/Expected: pass.
- [x] **I5.3 Devsys agent definitions.** `agents/advisor.md` (slot `advisor`, high thinking; read-only; "give a decision with alternatives and cost-if-wrong"), `agents/implementer.md` (slot `implementer`, medium; receives exactly one task record; may edit; must end with Run/Expected evidence), `agents/reviewer.md` (slot `reviewer`; read-only; output format = Appendix A review packet: blocking/should-fix/nit with `path:line`), `agents/researcher.md` (keep upstream), `agents/lens-cagan.md`, `lens-torres.md`, `lens-perri.md`, `lens-pichler.md`, `lens-rumelt.md` (read-only; template from research 03 §3). `agents/*.md` `models:` preference lists are **families** (e.g. `openai-codex/gpt-*-sol, anthropic/claude-sonnet-*`), resolved with I3.1a `resolveCandidate` (patch `resolveInitialSettings` to call it — record in VENDORED.md). The devsys defaults for each agent map to a slot: advisor→`advisor`, implementer→`implementer`, reviewer→`reviewer`, researcher→`researcher`, lens-*→`lens`.
- [x] **I5.4 Jev routing.** `src/jev/questions/route.ts` + `evals/jev/route.json`: `judgeTaskRouting(jev, {task, filesTouched, riskSignals}): Result<{difficulty:"trivial"|"routine"|"complex"|"expert"; risk:"low"|"medium"|"high"; confidence}>`. `src/core/routing.ts`: `pickRoute(config.routing, difficulty, risk): {slot: Slot; thinkingLevel}` from the Appendix B `[routing]` table (values are **slots**, never model ids), then `resolveSlot` (I3.1a) against `ctx.modelRegistry.getAvailable()` → `{model: ModelRef; thinkingLevel; slot; via}`. Tool `devsys_route_task({task, files})` returns the recommendation so the coordinator passes `model`/`thinkingLevel` to `agent_spawn`. Jev offline → `routine/low`. Slot unresolvable → omit `model` (agent-type defaults apply) and say so in the result.
- [x] **I5.5 Skill `delegation`.** When to spawn advisor vs switch model (never switch), implementer gets one task record only, reviewer is always fresh-context, always call `devsys_route_task` before `agent_spawn` for implementer/reviewer; vendored docs linked.
- [x] **I5.6 Uninstall note.** README section: "This package replaces pi-subagent-manager; remove it from `~/.pi/agent/settings.json` packages to avoid duplicate tool registration." Acceptance step below includes the human doing that.

Acceptance: after reload (with pi-subagent-manager removed), `agent_spawn` accepts `model`/`thinkingLevel`; `devsys_route_task` returns a recommendation; a spawned `reviewer` with an explicit `model` (whatever `devsys_models({slot:"reviewer"})` resolved on this machine) reports that model in `agent_status`.

Release + STOP (ask the user to remove pi-subagent-manager before reload).

### I6 — Review orchestration  (expect 0.7.0)

**Goal.** Fresh-context review per slice with Jev-chosen lenses and a
recoverable clean streak. **Why.** D11. Cite: research 01 §5 (what was
fragile), research 03 §3 (review template), Appendix A review packet.

- [x] **I6.1 Review domain.** `src/core/review.ts`: `type Severity = "blocking"|"should-fix"|"nit"|"false-positive"`; `type Finding = {id; severity; path?; line?; summary; lens}`; `type ReviewRound = {n; lenses; findings; reviewedAt; diffDigest}`; `type ReviewState = {slice: SliceRef; rounds: ReviewRound[]; required: number}`; `cleanStreak(state): number` (rounds counted clean when no blocking/should-fix); `isSatisfied(state): boolean`; `nextAction(state, diffDigestNow): "review"|"fix-findings"|"done"|"stale-diff"`. Any change to the diff digest between rounds resets the streak **only if** the new round finds blocking/should-fix issues (rule: streak counts clean rounds on the *current* digest; a trivial fix commit does not throw away prior clean rounds unless findings reappear). Table tests.
- [x] **I6.2 Jev: lens selection + severity.** `src/jev/questions/review.ts`, fixtures `review-lenses.json`, `finding-severity.json`. `judgeLenses(jev, {diffStat, diffSample, profiles}): Result<Record<Lens, number>>` (`noul` per lens: security, concurrency, types, tests, api-contract, data-migration, ux, performance); `judgeSeverity(jev, {finding, diffContext}): Result<{severity; confidence}>`. Policy: lens applies at ≥ 0.5; severity default = reviewer's own if Jev offline.
- [x] **I6.3 Orchestration tools.** `devsys_review_start({slice, diffRange})` → computes digest, chooses lenses, returns the exact `agent_spawn` payloads (type `reviewer`, task text with packet format, routed model) for the coordinator to run; `devsys_review_record({slice, packets})` (verbatim reviewer packet markdown rather than pre-parsed JSON; the tool parses it) → parses the reviewer packet(s), Jev-adjusts severity, appends `devsys-review` entry, writes nits to `docs/decisions/followups.md`, returns `nextAction` and streak. Config `review.required_clean_rounds` default 3 (author's rule), `review.min_rounds` 1.
- [x] **I6.4 Pre-commit review soft gate.** In commit guard: if `phase === "implementing"|"reviewing"` and the active slice's review is not satisfied → `require-departure` gate `review.unsatisfied` (soft; override allowed with recorded reason). No review state for the slice → same gate.
- [x] **I6.5 Skill `code-review` + `prompts/devsys-review.md`.** Reviewer packet format, "report-only findings are nits", what resets the streak, how to run rounds; the slash command drives start → spawn → record.

Acceptance: `/devsys-review` on this repo spawns a reviewer, records a round, and `/devsys-status` shows `review: 1/3 clean`; committing with unsatisfied review prompts for a departure.

Release + STOP.

### I7 — Anti-drift: verifier, compaction, model/phase recommendation  (expect 0.8.0)

**Goal.** Detect unverified claims and drift at turn end, keep state through
compaction, and recommend (never switch) models per phase. **Why.** D10,
non-negotiable 3, research 05 B2/B3, research 04 §4.

- [x] **I7.1 Jev: claim verification + drift.** `src/jev/questions/turn.ts`, fixtures `claim-verification.json`, `drift.json`. `judgeTurn(jev, {assistantText, toolEvidence: Array<{tool; summary; exitCode?}>, activeSlice?: string}): Result<{unverifiedClaim: number; driftFromSlice: number}>`.
- [x] **I7.2 turn_end verifier.** `src/context/turn-verifier.ts`: on `turn_end`, if phase ∈ implementing/reviewing/delivering and Jev online: `unverifiedClaim ≥ 0.75` → return `{continue: true, entries:[custom_message "Development system: your last message claims X but no tool evidence shows it. Run the verification or restate without the claim."]}`; `driftFromSlice ≥ 0.75` → custom_message asking to either return to the slice or call `devsys_record_departure(scope.expansion)`. Hard limits: at most 1 continuation per turn, at most `verifier.max_per_session` (default 6) per session, never when the model's message itself is a question to the user. Tests with fake Jev.
- [x] **I7.3 Compaction (removed in I7b.4).** `src/context/compaction.ts`: on `session_before_compact` do **not** replace pi's summary; instead append our own `## Development System State` block (rendered from state: phase, sizing, slice, open departures, review streak, last test run, last push) into the compaction entry via the documented hook result shape (verify against `SessionBeforeCompactResult` at implementation time; if only full replacement is possible, build on pi's default summary text + our block). On `session_compact` send one `custom_message` "[devsys resync] …" with the same block. Tests via harness. *(As built: `SessionBeforeCompactResult` only allows replacing the whole summary, so pi's summary is left alone and the block is delivered only via the resync message; see `src/context/compaction.ts`.)*
- [x] **I7.4 Model/phase recommendation.** `src/context/model-advice.ts`: on `model_select` and on phase change, resolve the phase's slot (planning→`planning`, implementing→`implementer`, reviewing→`reviewer`) via `devsys_models` and compare *tier* (frontier/strong/fast — the tier list the current model resolves in), not exact id; a lower tier than the slot → one `custom_message` recommendation ("planning on <model> (strong tier) — the matrix prefers <resolved frontier model>; consider an advisor subagent, or continue (recorded departure `models.phase-mismatch`)"), max once per (phase, model). Higher tier than needed → no message. Never calls set-model.
- [x] **I7.5 Cadence check.** `src/context/cadence.ts`: if `phase === "implementing"` and `now - lastPushAt > config.cadence.push_minutes` (default 60) → one context-tail line "⚠ 73 min since last push — is this increment too big?" (advisory only).

Acceptance: a fabricated "all tests pass" with no test run in the turn triggers a corrective continuation; after `/compact` the state block is present and `/devsys-status` is unchanged.

Release + STOP.

### I7b — Cleanup before I8  (expect 0.41.0)

**Goal.** Close five gaps the author found after I7. **Why.** Non-negotiable 2
(a green gate must mean the same thing), non-negotiable 3, and the author's
rule that a finding is either fixed now or not worth fixing. Decisions made in
conversation with the author, recorded here as the source of truth.

- [x] **I7b.1 Subagent thread cap.** `src/subagents/orch/manager.ts:260`: finished threads are archived (dropped from the registry, oldest first, never one with a retained child) when `maxThreads` is reached. As built: an archived thread can no longer be resumed by `agent_steer`; its session file stays on disk. No new settings key. Record in `src/subagents/VENDORED.md`.
- [x] **I7b.2 No skipped tests.** Offline Jev fixture checks (question-hash pins, schema) always run in `npm test`. Live-model fixtures become `npm run test:jev`, which FAILS (not skips) without `TYPESAFE_API_KEY`; the pre-push hook and CI run it only when the diff touches Jev-facing paths (`src/jev/**`, `evals/jev/**`, `src/core/*intent*`, question text); skipped by path, never by `skip`. `npm test` reports 0 skipped. As built: live fixtures in `test/live/*.live.ts`; `scripts/run-jev-fixtures.ts` (lefthook pre-commit `--staged`, CI `--before <sha>`) skips by path with a message; `npm run test:jev` ran 10/10 with real Jev.
- [x] **I7b.3 Nit policy.** Reviewers report only demonstrable defects; every finding is fixed in the same round or rejected with a one-line reason in the packet. `devsys_review_record` stops writing `docs/decisions/followups.md`; delete the file after triaging its entries (fix what is worth fixing, drop the rest). Update `skills/code-review`, `agents/reviewer.md`, `reviewerTask`, `prompts/devsys-review.md`, D11 wording. As built: `devsys_review_record` reports nits in its reply (`nitLines`) and writes nothing; followups.md deleted; its still-real items were fixed in the triage commit that follows, the rest dropped.
- [x] **I7b.4 Remove compaction resync.** billion-context cancels pi's auto-compaction, so the resync is inert; the per-turn context tail already restates state. Delete `src/context/compaction.ts`, its tests and wiring; keep `renderStateBlock` only if still used. Amend I7.3 in this plan. As built: both files and the extension wiring are gone; `renderStateBlock` had no other user so it went too.
- [x] **I7b.5 Warnings are errors.** Broad biome rule groups at error severity with reasoned per-rule exceptions (spirit of emschwartz.me/your-clippy-config-should-be-stricter: enable the lints that stop panics/silent failures/escape hatches; do not enable whole contradictory categories; every suppression carries a reason); knip, markdownlint and an ast-grep/semgrep pass in lefthook and CI. In-session rule in `principles/NON-NEGOTIABLES.md` + skill `strict-lints`: `lens_diagnostics` findings must be fixed (or the stale cause found and fixed) before a commit; the commit guard consults lens diagnostics where available. Vendored `src/subagents`: ratchet — a checked list of still-exempt files may only shrink; any file touched must leave the list (typecheck + lint clean). *(As built: biome strict rule set at error in `biome.json`; knip and markdownlint (from nix) in lefthook and CI; pi-lens thresholds in `.pi-lens.json` with reasoned `pi-lens-ignore` lines; the ratchet is `test/subagents/nocheck-files.ts` + `test/subagents/ratchet.test.ts`; the in-session rule lives in skill `strict-lints`. The commit guard does NOT consult pi-lens: an extension cannot call another extension's diagnostics, so the rule is a skill instruction, not a gate.)*

Acceptance: `npm test` shows 0 skipped; a spawn succeeds after 70 finished threads; `docs/decisions/followups.md` is gone and no code writes it; no `[devsys resync]` anywhere; CI runs the new lint gates green; the ratchet list is committed.

Release + STOP. Fresh review rounds until CLEAN, as for every increment.

### I8 — Work sizing, slices, task records, trackers, pi-goal-x hand-off  (expect 0.9.0)

**Goal.** `/devsys-start` intake with proportional artifact recommendation,
slice/task records in the weak-model-ready format, tracker adapters, and a
plan hand-off to pi-goal-x. **Why.** D4, D7, research 05 B5, Appendix C.

- [x] **I8.1 Sizing domain.** `src/core/sizing.ts`: `recommendedArtifacts(sizing, config): ArtifactId[]` (fix: task-record; change: + adr-if-needed, review; capability: + brief-lite, journeys, event-model, lens-review-optional; product: full set). `ArtifactId` union. Table tests. As built: `recommendedArtifacts(sizing)` takes no `config` (nothing in config changes the set yet); `parseSizing` returns `Sizing | ParseError`.
- [x] **I8.2 Jev: sizing.** `src/jev/questions/sizing.ts`, fixture: `judgeSizing(jev, {request, repoSummary}): Result<{sizing; confidence; artifactNeed: Record<ArtifactId, number>}>`.
- [x] **I8.3 `/devsys-start` + `devsys_intake` tool.** Prompt template collects the request; tool returns sizing proposal + recommended artifacts; via `ctx.ui.select` the user confirms sizing (headless: proposal only). Sets `phase`, `sizing`, creates `activeSlice` placeholder. Skipping a recommended artifact later → `devsys_record_departure(artifact.skipped:<id>)` (soft). Event model and architecture artifacts are **never** blocked (D4). As built: after the user confirms size `fix`, a separate yes/no asks whether to skip fresh-context review; only a yes records a user-approved `review.unsatisfied` departure scoped to the new slice (I6.4 stays unchanged). Starting intake while another slice is implementing/reviewing asks for confirmation first.
- [x] **I8.4 Task record format + readiness.** `src/planning/task-record.ts`: `parseTaskRecord(md): Result<TaskRecord, ParseError>` (Appendix C sections: Goal, Files, Interfaces, First failing test, Steps, Run, Expected, Out of scope); `src/jev/questions/readiness.ts`: `judgeTaskReadiness(jev, record): Result<{readiness:"ready"|"needs-detail"|"too-big"; missing: string[]}>` (`score`). Tool `devsys_task_check({path})`. As built: readiness is six `bool` questions (goal, interfaces, first failing test, steps, run/expected check, too-big) combined, not one `score` question, because one narrow judgement per question (Appendix E rule) is more reliable than a single number; `parseTaskRecord(markdown, id?)` returns `TaskRecord | ParseError` (the codebase's parse convention) and finds the record named by `id` inside a plan file; `devsys_task_check` takes an optional `id`.
- [x] **I8.5 Tracker interface + adapters.** `src/tracker/types.ts`: `interface Tracker { kind; list(filter): Promise<WorkItem[]>; get(id): Promise<WorkItem>; create(item): Promise<WorkItem>; update(id, patch): Promise<WorkItem>; comment(id, body): Promise<void> }`; `src/tracker/repo-files.ts` (default: `work/backlog.md` + `work/items/<id>.md`); `src/tracker/github.ts` (via `gh issue …` with fake exec in tests). As built: every `Tracker` method returns `Promise<TrackerResult<…>>` (errors as values, per typed-errors) instead of throwing or returning the bare value. `config.tracker.kind` selects. Jira/Linear: define config shape only, mark "not implemented" with a clear error (follow-up).
- [x] **I8.6 pi-goal-x hand-off.** `prompts/devsys-plan.md`: instructs the model to write `docs/plan/<slug>.md` in this plan's structure (Appendix C per task) and, if the `create_goal` tool exists, call it with the objective "complete <path> honouring its §1". No file-format coupling to pi-goal-x (research 04 §5). As built: the objective reads "complete <path> honouring its Constraints and Progress checklist, one increment at a time, stopping after each increment's Release step", because generated plans have those sections rather than a numbered §1.
- [x] **I8.8 Begin work.** (added in review) `devsys_begin_work` moves `planning` → `implementing` for the active slice after plan approval; nothing else moved capability/product work out of `planning`, which left the review and red-first gates off for the largest work.
- [x] **I8.7 Skill `work-intake-and-slicing`.** Sizing questions, "a plan longer than the code has written the code", one slice per clean context, implementer sees only its task.

Acceptance: `/devsys-start "add X"` proposes `change` and lists artifacts; skipping event model records a departure; `devsys_task_check` flags a record missing `Run:`.

Release + STOP.

### I8b — Codemode and ambient activation  (expect 0.75.0)

**Goal.** Codemode (pi `codemode` tool, enabled in the author's settings) is
used where it saves context, and the system's capabilities trigger from what
the user is doing rather than from slash commands. **Why.** User decision
after I8; research 06 (`docs/research/06-codemode-and-ambient-use.md`).

- [x] **I8b.1 Nested-call guard tests.** `test/harness/fake-pi.ts` gains `ctx.executeTool(name, args)` that emits `tool_call`/`tool_result` with ids `<parent>/<n>` and `parentToolCallId`, as pi does for codemode scripts. Tests: nested `bash` `git push --force` is hard-stopped; nested `edit` on a test file hits the test guard; nested `npm test` updates `lastTestRun`; a claim after a nested green run is not flagged by the turn verifier; `ctx.ui.confirm` inside a nested call reaches the user. Any failure is fixed in the guard, never in the test. As built: `test/nested-calls.test.ts` drives the real extension through `fake.nestedExecutor(parentId, run)`; all guards held with no source change. `ctx.ui.confirm` reaching the user is proven by the approval test; the fake reuses the same ctx, so real pi context passing for nested calls stays an assumption from the docs.
- [x] **I8b.2 Exposure pass.** `model-only` for tools that talk to the user (`devsys_request_approval`, `devsys_intake`, `devsys_begin_work`, `devsys_review_start`); `codemode` exposure for rarely used tools (`devsys_work_item`, `devsys_models`, `devsys_task_check`, `devsys_route_task`); the rest stay `direct`. Namespace `devsys-judge` (`exposure: "codemode"`) wraps the existing Jev questions (`judge_sizing`, `judge_test_change`, `judge_lenses`, `judge_task_readiness`) so scripts get our redaction and clipping instead of raw `models.classify`. Test: `pi.getAllTools()` exposures match a table. As built: the rarely used tools register as `codemode` and a `session_start` handler (`src/gates/exposure.ts` `declareWithoutCodemode`) re-registers them as `direct` when `codemode` is not an active tool, so they are never unreachable; pi's tool state cannot be read while the extension loads. `src/jev/judge-tools.ts` holds the four judge tools (`judge_task_readiness` takes task-record markdown plus optional id). Table test: `test/exposure.test.ts` (checks registered definitions through the fake pi, not `pi.getAllTools()`).
- [x] **I8b.3 Intent trigger.** `src/jev/questions/intent.ts` + fixture: `judgeIntent(jev, {prompt, phase})` → `new-work | fix | review | question | continuation`. On `before_agent_start` with phase `idle` (or `new-work` ≥ 0.7 in any phase), append one guideline line to `systemPromptOptions` naming the tool to call (`devsys_intake` for new work/fix, `devsys_review_start` for review). Never for `question`/`continuation`. Phase-aware descriptions: a `model-only` tool `devsys` whose description is rewritten per phase through `prepareLoadout` (idle: intake; planning: task records + `devsys_begin_work`; implementing: red-first + verify; reviewing: review start/record; delivering: push/CI). Harness tests per phase. As built: `src/context/intent-trigger.ts` (`intentGuideline` pure, `applyIntentGuideline` pushes onto `systemPromptOptions.promptGuidelines`; slash commands are not judged; a fix inside a running slice earns no line), `src/context/phase-guide.ts` (`phaseGuide(phase)`), `src/context/devsys-tool.ts` (`devsys` model-only tool with `prepareLoadout` description per phase). Fixture `evals/jev/intent.json`, live test `test/live/intent.live.ts` passes with real Jev. Tests: `test/context/{intent-trigger,devsys-tool}.test.ts`, `test/jev/intent.test.ts`.
- [ ] **I8b.4 Verifier nudges.** Turn verifier adds two corrections (same limits as I7.2): "slice looks done, no review round for it" → names `devsys_review_start`; "architecture-shaping diff without an ADR" is reserved for I9.4's gate message (names `devsys_adr_new`). Fake-Jev tests.
- [ ] **I8b.5 Verify script + docs.** `skills/strict-lints/references/verify.md`: a codemode script template that runs the profile's checks in parallel and returns `{tool, exit, firstFailures}`; the test-evidence tracker records each nested run (I8b.1 proves it). README section "You do not need the slash commands"; plan §1 gains: every prompt template must also be reachable through a tool plus an ambient trigger.

Acceptance: with codemode on, a script that runs `git push --force` is blocked with the hard-stop reason; a plain "add X" request on an idle session gets the intake guideline line; `pi.getAllTools()` shows the exposure table.

Release + STOP.

### I9 — Product planning skills  (expect 0.10.0)

**Goal.** Brief, decision register, follow-ups, terminology, interview loop,
five-lens review orchestration, journey inventory, ADR command. **Why.**
Research 03 (what worked, what over-reached), research 05 Part A (Cagan,
Torres).

- [ ] **I9.1 Templates** under `skills/product-planning/references/`: `brief.md` (outcome, four risks, assumptions, non-goals, "deferral ≠ exclusion"), `decisions.md` (D/Q/F register), `followups.md` (P), `terminology.md`, `journeys.md` (J; "story of a user performing actions to achieve an outcome" test).
- [ ] **I9.2 Skill `product-planning`** (≤ 300 lines + references): interview loop rule verbatim — "update docs after each answer, ask one next question, yield"; agent must not over-edit the brief (D55–D58 lesson): edits limited to the answered question; every answer becomes a D-item.
- [ ] **I9.3 Lens review orchestration.** `prompts/devsys-lens-review.md` + `src/review/lens-review.ts`: returns a codemode script as the primary form (spawns the five lens agents, waits, writes the packets to the review file, returns only verdict lines and the path) and the five fresh `agent_spawn` payloads as fallback; builds the payloads (lens-* agents, routed models), round-1 template, round-2 peer exchange, synthesis R-table + one-question agenda; guardrail line "agreement among agents is useful critique, not customer evidence" included in every lens prompt. Jev `judgeLenses` variant for product lenses chooses a subset for `capability` sizing (all five for `product`).
- [ ] **I9.4 ADR command.** `prompts/devsys-adr.md` + `devsys_adr_new({title})` tool creating next-numbered file from `docs/adr/0000-template.md`; commit guard adds soft gate `adr.missing` when Jev `judgeArchitectureShaping(diffStat) ≥ 0.7` and no ADR file is in the diff (non-negotiable 9 is enforced as soft gate here because the judgement is probabilistic; record this in ADR-0004).
- [ ] **I9.5 Anti-leak lint.** `src/planning/brief-lint.ts`: brief must not contain solution-level detail markers (table names, endpoints, class names) — regex list + Jev `noul`; warning only.

Acceptance: `/devsys-lens-review` on a brief spawns five lens agents and produces `docs/product/reviews/<date>-round1.md`; `/devsys-adr "x"` creates `docs/adr/000N-x.md`.

Release + STOP.

### I10 — Event modelling lite  (expect 0.11.0)

**Goal.** Compact slice format, validator, derived Markdown, GWT → test
skeletons, replaceable by a future dedicated extension. **Why.** D13,
research 03 §4 lessons (keep schema small; "do not invent policy to make
validation pass"), research 05 (Dymitruk, Dilger).

- [ ] **I10.1 Schema v1** (Appendix D) as TypeBox in `src/planning/slice-schema.ts`; `parseSlice(json|yaml)`; validator codes ≤ 12 (missing-origin, missing-destination, gwt-without-when, orphan-event, duplicate-id, unknown-ref, …); `validateModel(slices): ValidationIssue[]` with the information-completeness check (every view field has an event origin; every command field has a source).
- [ ] **I10.2 Derivations.** `renderModelMarkdown(slices)` (swimlane table + per-slice GWT) and `renderMermaid(slices)`. Tool `devsys_event_model_check({dir})`.
- [ ] **I10.3 GWT → test skeleton skill** per profile (`skills/profile-rust/references/gwt-tests.md`, `skills/profile-typescript/references/gwt-tests.md`): one failing test per GWT scenario; "no spec in the model without an equivalent in code".
- [ ] **I10.4 Capability detection.** If a tool named `event_model_validate` (or config `event_model.provider != "builtin"`) exists, `/devsys-event-model` defers to it and the builtin tool is not registered. Document the handshake in `docs/event-model-extension-contract.md`.
- [ ] **I10.5 Skill `event-modelling`** (≤ 250 lines): 7 steps, three slice patterns, GWT shape, completeness check, never invent policy to satisfy the validator (ask instead), recorded departure `artifact.skipped:event-model` when skipped.

Acceptance: a sample model under `test/fixtures/event-model/` validates; an intentionally orphaned view field fails with `missing-origin`.

Release + STOP.

### I11 — Design-system profile, threat modelling, skill lint, 1.0 readiness  (expect 1.0.0)

- [ ] **I11.1 `skills/profile-design-system`** (Frost: tokens → components; AI constrained to DS materials; governance for 90 %-fit vs snowflake).
- [ ] **I11.2 `skills/threat-modelling`** (proportional; trust the single-owner machine; checklist; when to write `docs/security/threat-model.md`).
- [ ] **I11.3 Headless mode audit.** Test that every guard blocks safely with `hasUI:false`, including the nested-call paths from I8b.1.
- [ ] **I11.4 Jev fixture coverage test.** Every file in `src/jev/questions/` has a fixture in `evals/jev/` and the question text hash in the fixture matches (forces re-evaluation when a question changes — non-negotiable 10).
- [ ] **I11.5 README** (install, replace pi-subagent-manager, config reference, tiers, decision log, commands, agents), `CHANGELOG.md` generated from commits.
- [ ] **I11.6 1.0 readiness review.** Two fresh reviewers (one Sonnet, one strong) over the whole package against synthesis §10, run through the I9.3 script path; fix blocking; record remaining items as follow-ups.

Release (1.0.0) + STOP.

---

## 5. Deferred beyond 1.0

Jira/Linear adapters; a dedicated event-modelling extension (D13); promptfoo
style trajectory evals for skills (research 02 found the regex engine
brittle — revisit with pi SDK + fake provider when documented); mutation
testing integration per profile; Elixir/Python profiles; worktree manager;
babysit-PR flow for `pull-request` delivery mode beyond the push guard.

---

## Appendix A — Decision log entry, departure tool, review packet

Decision log file: `docs/decisions/YYYY-MM.md`. Entry (rendered by
`renderDepartureMarkdown`, fixture `test/fixtures/departure.md`):

```markdown
### 2026-10-06T17:12:00Z · tdd.red-first · soft · agent
- **Default:** write a failing test before changing src/core/x.ts
- **Chosen:** edit first; the change is a pure rename with no behaviour change
- **Why:** Tidy-First structural change; existing tests cover behaviour
- **Cost if wrong:** a behavioural change slips through without a test
- **Scope:** slice `I4.3` · **Revisit when:** the rename touches a public signature
```

Hard-stop approvals use the same shape with `hard · user` and `Scope: once
(<tool call id>)`.

`devsys_record_departure` parameters: `gate` (string, one of the registered
gate ids; the tool's description lists them), `chosen`, `why`, `costIfWrong`,
`scope` (`slice|session|once`), `revisitWhen?`. Returns the markdown and the
log path. Soft gates only; hard gates reply with instructions to use
`devsys_request_approval`.

Registered gate ids (grow per increment): `git.history-rewrite`,
`git.force-push`, `git.branch-delete-remote`, `git.destructive-reset`,
`git.no-verify`, `tests.weaken`, `commit.rationale`, `commit.mixed-change`,
`commit.forbidden-trailer`, `push.red-trunk`, `push.delivery-mode`,
`tdd.red-first`, `lints.suppression`, `review.unsatisfied`, `scope.expansion`,
`models.phase-mismatch`, `artifact.skipped:<artifact>`, `adr.missing`.

Reviewer packet (what a `reviewer` agent must output):

```markdown
## Review — <slice> — round <n> — lenses: <a, b>
### Sources inspected
- <path:line ranges>
### Findings
- [blocking|should-fix|nit] <lens> `<path>:<line>` — <one sentence> — <why it matters>
### Verdict
no-blocking | blocking
```

## Appendix B — `.development-system.toml` v1

```toml
version = 1

[delivery]
mode = "trunk"            # trunk | pull-request | local-only
trunk = "main"
remote = "origin"

[review]
required_clean_rounds = 3
min_rounds = 1

[tracker]
kind = "repo-files"       # repo-files | github | jira | linear
# github: repo = "owner/name"

[profiles]
override = []             # e.g. ["typescript"]; empty = detect

# ---- Model matrix (per project; written by /devsys-models, edit freely) ----
# Each slot = ordered candidates. A candidate is "provider/id", a family
# pattern "provider/gpt-*-sol" (resolves to the NEWEST available id), or a
# slot reference "@strong". The first candidate that resolves against the
# models this machine has credentials for wins, so one committed file works
# for collaborators with different accounts. Pin an exact id to stop auto-roll.
[models]
# capability tiers (defaults below are the shipped defaultMatrix(); both
# OpenAI families are tried via openai-codex (subscription) then openai (API))
frontier    = ["openai-codex/gpt-*-astra", "openai/gpt-*-astra", "anthropic/claude-fable-*", "anthropic/claude-opus-*", "openai-codex/gpt-*-sol", "openai/gpt-*-sol"]
strong      = ["openai-codex/gpt-*-sol", "openai/gpt-*-sol", "anthropic/claude-sonnet-*", "anthropic/claude-opus-*", "openai-codex/gpt-*-terra", "openai/gpt-*-terra"]
fast        = ["openai-codex/gpt-*-luna", "openai/gpt-*-luna", "anthropic/claude-haiku-*", "openai-codex/gpt-*-terra", "openai/gpt-*-terra", "@strong"]
# roles (what the system asks for; indirection keeps edits in one place)
planning    = ["@frontier"]          # brief, decisions, architecture, ADRs — main-agent recommendation (I7)
advisor     = ["@frontier"]          # escalation subagent, high thinking
implementer = ["@strong"]            # one task record at a time
reviewer    = ["anthropic/claude-opus-*", "anthropic/claude-sonnet-*", "openai-codex/gpt-*-sol", "openai/gpt-*-sol", "@strong"]  # prefer a DIFFERENT family from implementer
lens        = ["@strong"]            # product-lens reviewers
researcher  = ["@fast"]              # read-only, large context, cheap
jev         = ["typesafe/jev-latest", "openrouter/typesafe/jev-latest", "opencode/jev-1.13", "cloudflare-workers-ai/typesafe/jev", "vercel-ai-gateway/typesafe-ai/jev"]

[routing]                 # subagent routing: "<difficulty>/<risk>" = ["<slot>", "thinkingLevel"]
"trivial/low"    = ["fast",        "low"]
"trivial/*"      = ["implementer", "medium"]
"routine/low"    = ["implementer", "medium"]
"routine/*"      = ["strong",      "high"]
"complex/*"      = ["strong",      "high"]
"expert/*"       = ["frontier",    "high"]

[verifier]
max_per_session = 6

[cadence]
push_minutes = 60

[event_model]
provider = "builtin"
```

## Appendix C — Task record format (weak-model-ready)

```markdown
## <id> — <title>
**Goal:** one sentence, observable.
**Files:** exact paths to create/modify.
**Interfaces:** exported signatures (TypeScript/Rust) — contracts.
**First failing test:** path + test name + the assertion in words.
**Steps:** 3–7 imperative steps, smallest unit a reviewer could reject independently.
**Run:** exact command.
**Expected:** exact observable output/condition.
**Out of scope:** what not to touch.
```

Readiness rule: no `TBD`; every section present; `Run`/`Expected` concrete.

## Appendix D — Slice schema v1 (event-model lite)

```yaml
id: slice.signin.c01
pattern: state-change        # state-change | state-view | automation
actor: user                  # or system
command: { name: SignIn, fields: { email: string, password: secret } }
events:   [{ name: SignedIn, fields: { userId: id, at: timestamp } }]
views:    []                 # for state-view: { name, fields, sources: [event names] }
gwt:
  - given: [{ event: UserRegistered, let: { email: "a@b.c" } }]
    when:  { command: SignIn, let: { email: "a@b.c", password: "…" } }
    then:  [{ event: SignedIn }]
  - given: []
    when:  { command: SignIn, let: { email: "x@y.z" } }
    then:  [{ error: unknown-user }]
```

Completeness: every `views[].fields` key must appear in some `events[].fields`
of a referenced source; every `command.fields` key must come from the actor or
a view. Validator codes: `duplicate-id`, `unknown-ref`, `missing-origin`,
`missing-destination`, `gwt-without-when`, `gwt-then-empty`, `orphan-event`,
`pattern-field-mismatch`.

## Appendix E — Jev question catalogue and fixture policy

| id | primitive(s) | consumer | threshold in code |
|---|---|---|---|
| shell-intent | choice | git guard | conf ≥ 0.6 |
| test-change | noul + choice | test guard | weakens ≥ 0.7; gaming conf ≥ 0.6 |
| commit (rationale, mix) | noul ×2 | commit guard | mix ≥ 0.7 |
| fix-related (exists) | noul | push guard | ≥ 0.6 |
| route | choice ×2 | `devsys_route_task` | — |
| review-lenses | noul per lens | review start | ≥ 0.5 |
| finding-severity | choice | review record | conf ≥ 0.6 else reviewer's |
| turn (claim, drift) | noul ×2 | turn_end verifier | ≥ 0.75 |
| sizing | choice + noul per artifact | intake | — |
| readiness | noul ×6 (one per aspect; as built, not `score`) | task check | vague ≥ 0.6 |
| architecture-shaping | noul | adr soft gate | ≥ 0.7 |
| semver (exists) | choice | release | existing |

Rules: one narrow judgement per question; include a no-match outcome; batch
independent questions over the same state into one call; cache by content
hash; fixture `evals/jev/<id>.json` = `{questionHash, cases:[{state, expected}]}`,
run by `npm run test:jev` (never skipped; lefthook and CI run it when a Jev-facing path
changes), pass rate asserted per fixture (default ≥
0.8; safety-relevant `shell-intent`, `test-change` ≥ 0.9). Question text
change → fixture hash mismatch → test fails until fixture is re-run and
updated (non-negotiable 10).

## Appendix F — Release ritual (end of each increment)

1. Working tree clean; `npm run typecheck && npm run lint && npm test` green.
2. Fresh-context reviewer per R8 until clean.
3. Final commit for the increment (lefthook: Jev chooses bump; the commit
   body says "Increment N: <goal>").
4. `git push origin main`.
5. `gh run watch --exit-status` (or `gh run list --branch main --limit 1`
   until `completed/success`). Red → `fix(ci)` only.
6. Wait until `npm view @jwilger/pi-development-system version` equals the
   released version.
7. `pi update --extensions` (from bash; run from the repo root).
8. STOP. Message: "Increment N released as vX.Y.Z and updated locally. Please
   `/reload` and tell me to continue." Do nothing else until told.

## Appendix G — Fake ExtensionAPI harness sketch

```ts
// test/harness/fake-pi.ts
import type { ExtensionAPI, ExtensionContext, ExtensionEvent, ToolDefinition } from "@earendil-works/pi-coding-agent";

export function createFakePi(init?: { hasUI?: boolean; cwd?: string }) {
  const handlers = new Map<string, Array<(e: unknown, c: ExtensionContext) => unknown>>();
  const tools = new Map<string, ToolDefinition>();
  const commands = new Map<string, unknown>();
  const entries: Array<{ customType: string; data: unknown }> = [];
  const ui = { hasUI: init?.hasUI ?? true, confirmResponses: [] as boolean[], selectResponses: [] as string[], calls: [] as Array<{ kind: string; args: unknown[] }> };
  const ctx = {
    hasUI: ui.hasUI, cwd: init?.cwd ?? process.cwd(),
    ui: {
      confirm: async (...a: unknown[]) => { ui.calls.push({ kind: "confirm", args: a }); return ui.confirmResponses.shift() ?? false; },
      select:  async (...a: unknown[]) => { ui.calls.push({ kind: "select",  args: a }); return ui.selectResponses.shift(); },
      setStatus: (...a: unknown[]) => { ui.calls.push({ kind: "setStatus", args: a }); },
      setWidget: (...a: unknown[]) => { ui.calls.push({ kind: "setWidget", args: a }); },
      notify: (...a: unknown[]) => { ui.calls.push({ kind: "notify", args: a }); },
    },
    sessionManager: { getBranch: () => entries.map((e, i) => ({ type: "custom", customType: e.customType, data: e.data, id: String(i) })) },
  } as unknown as ExtensionContext;
  const api = {
    on: (event: string, h: (e: unknown, c: ExtensionContext) => unknown) => { handlers.set(event, [...(handlers.get(event) ?? []), h]); return () => {}; },
    registerTool: (t: ToolDefinition) => { tools.set(t.name, t); },
    registerCommand: (name: string, o: unknown) => { commands.set(name, o); },
    appendEntry: (customType: string, data: unknown) => { entries.push({ customType, data }); },
    sendMessage: () => {}, sendUserMessage: () => {}, setSessionName: () => {},
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
  } as unknown as ExtensionAPI;
  async function emit(event: ExtensionEvent, overrides?: Partial<ExtensionContext>) {
    let result: unknown;
    for (const h of handlers.get(event.type) ?? []) result = (await h(event, { ...ctx, ...overrides })) ?? result;
    return result;
  }
  return { api, ctx, emit, tools, commands, entries, ui };
}
```

Adapters that need `exec`, Jev, fs, or clock take them as parameters so tests
pass fakes; never mock modules globally.
