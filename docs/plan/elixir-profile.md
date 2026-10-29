# Integrated Elixir/Phoenix adoption profile

Approved adoption revision 0.2 S10/S11, ADR0014 consolidation. Reuse /tmp/devsys-s10.patch and existing S3 isolated SDK evaluator. No new dependencies, architecture or workflow authority.

## ELX — Repository-aware idiomatic guidance with effects

**Goal:** Mix repositories detect/restore Elixir, and a bounded isolated model eval demonstrates idiomatic Elixir decisions and local-command precedence for ordinary domain and Phoenix changes, without pretending synthetic commands executed.

**Files:** src/core/profile.ts, src/core/types.ts, src/state/profile-detect.ts, src/state/session-state.ts, test/core/profile.test.ts, test/state/profile-detect.test.ts, test/state/session-state.test.ts, skills/profile-elixir/SKILL.md, scripts/eval-elixir.ts, scripts/lib/elixir-eval.ts, test/context/elixir-eval.test.ts, evals/elixir/, docs/plan/elixir-profile.md

**Interfaces:** Preserve existing profile APIs and add elixir consistently; S10 patch has exact implementation/tests and historical RED/GREEN. New evaluator exports runElixirCase using existing SDK sandbox/model selection patterns, plus pure fixture/trace assessment and valid redacted JSON serialization. CLI accepts fixture, baseline/skill mode, evidence output and explicit provider/model/thinking overrides, preserving configured model selection when omitted. Typed synthetic submit_elixir_plan records errorStyle (tagged-tuples/exceptions/result-class), businessLogic (pure-core/liveview/ecto-schema), testLevels (domain/property/liveview/browser), commands (strings), newDependencies (strings) and commandEvidence (explicitly NOT EXECUTED). Read_repository exposes only fixture facts; no real fs/shell/GitHub/extension authority. Assess typed decisions and exact fixture-owned allowed commands, not committed skill Markdown substrings. Record effective model/thinking, hashes, raw bounded redacted trace, pass/fail/timeout and sandbox-denied effects. Reuse Discovery evaluator primitives where sensible but do not change its public schema or weaken existing assertions.

**First failing test:** Reuse S10's observed detection/restoration RED, run its tests before applying the patch if practical. For new evaluator write one scripted SDK public runner test where a correctly typed plan follows fixture commands/idioms and a deliberately wrong Result-class/default-command plan fails; missing evaluator initially RED. Add denial/control cases individually.

**Steps:**

1. Inspect S10 patch and preserve its tests/evidence, then integrate profile identity changes without reverting published devsys5 policy or review changes.
2. Write the evaluator public-runner RED and minimal typed trace assessment/sandbox to GREEN, using existing isolated SDK test techniques and provenance.
3. Add safe profile-elixir guidance: local instructions/commands first, tagged tuples and pattern matching, pure domain core/thin effects, ExUnit and appropriate properties/LiveView/browser; repository-aware warnings/format/Credo/Dialyzer only when present, no imposed dependencies/layout/event sourcing.
4. Add ordinary Mix and Phoenix fixture cases plus harmless control, assess actual structured choices/tool calls and sandbox-denied authority. Synthetic commands must remain NOT EXECUTED.
5. Run finite explicit live baseline/skill cases once each using configured available models; preserve failures honestly, no reroll-to-pass or weakening criteria. Fix actual implementation/instruction defects only with added evidence.
6. Run offline/type/lint/knip/md checks; save exact full patch including untracked files with no external diff, reverse-check only. Append actual evidence here and return blockers, no commit/push.

**Run:** Existing S10 three test files plus test/context/elixir-eval.test.ts; npm run typecheck; npm run lint; npm run lint:knip; npm run lint:md; explicit live CLI runs against each committed fixture with baseline/skill evidence.

**Expected:** Profile identity regressions and offline evaluator tests pass; live evidence demonstrates bounded behavior including controls and honestly records any failed cases. Commands in evidence are selected plans, never claims of executed Mix verification. No skill ships without actual effect evidence.

**Out of scope:** README/package/CI/review/tracker edits, extra agents, commits/pushes/intake/state changes, downstream operations, live GitHub, dependency additions, mandatory application architecture. Worker owns only this integrated capability in its isolated worktree. Coordinator owns final integration/review/delivery. If a concrete policy/authority decision is missing, report it; subjective task flags are advisory, not rewrite-until-ready gates.

## Implementation and observed evidence

Implemented in the detached ELX worktree based on `8853245` (the supplied
worktree revision). Only the listed files changed, plus the explicitly authorized
`test/skills.test.ts` exception below. No shared Discovery evaluator, dependencies,
README/package/CI, review/tracker, delivery primitives or downstream files changed.

### Profile identity and guidance

- Reused `/tmp/devsys-s10.patch` implementation/tests, excluding its old task doc.
  Added `elixir` to the public profile union, parser registry, `mix.exs` markers and
  persisted-state parser. The existing detection algorithm needed no edit.
- Retained legacy Rust/TypeScript behavior, devsys5 defaults and existing assertions;
  tested mixed-language ordering, explicit overrides, unknown-profile rejection,
  detection-to-replay and legacy state restoration.
- Added `skills/profile-elixir/SKILL.md`: repository command authority, tagged tuples
  and pattern matching, pure domain core/thin effects, scoped ExUnit/property and
  LiveView/browser verification, no imposed dependencies/layout/architecture.
- The first full suite found a real integration contract gap: the shared skill
  description test accepted only `rs|ts|tsx|toml|json`, not `mix.exs`. It ran
  **1835 pass / 1 fail / 0 skip**. The user explicitly extended ownership only to
  `test/skills.test.ts` to add `ex|exs`, retaining all old alternatives and the
  assertion. The requirement-change departure is recorded centrally by the
  coordinator; this work does not edit that decision record.

### Test-first runner and protocol correction

Commands below ran from `/tmp/pi-development-system-elixir` using Node v24.21.0.
RED records are observed failures, not inferred pre-implementation results.

| Check | Observed RED | Observed GREEN |
| --- | --- | --- |
| `node --experimental-transform-types --no-warnings --test test/core/profile.test.ts test/state/profile-detect.test.ts test/state/session-state.test.ts` | 27 tests: 21 pass, 6 fail; e.g. `unknown profile: elixir` | Same command: 27 pass, 0 fail/skip |
| `node --experimental-transform-types --no-warnings --test test/context/elixir-eval.test.ts` | `ERR_MODULE_NOT_FOUND` for `scripts/lib/elixir-eval.ts`; 1 failed test file | Initial public SDK test: 1 pass; expanded runner/CLI suite subsequently 12 pass |
| `node --experimental-transform-types --no-warnings --test --test-name-pattern='CLI rejects' test/context/elixir-eval.test.ts` | `MODULE_NOT_FOUND` for `scripts/eval-elixir.ts` | Runner/CLI suite: 9 pass at that stage |
| `node --experimental-transform-types --no-warnings --test --test-name-pattern='submission boundary' test/context/elixir-eval.test.ts` | `1 !== 0`: explanatory command evidence was incorrectly recorded as a plan | After literal schema, focused suite below: 99 pass, 0 fail/skip |

The initial protocol accepted arbitrary nonempty `commandEvidence` strings even
though the existing strict scorer required exactly `NOT EXECUTED`. On explicit
user authorization, corrected the **submission protocol**, not the scorer:
`Type.String({ minLength: 1, maxLength: 1000 })` became
`Type.Literal("NOT EXECUTED")`. The added public SDK test submits malformed raw
tool arguments and proves rejection before the plan enters the trace. The strict
assessor comparison, all negative/no-execution tests, skill and prompts remain
unchanged. A test-only type-narrowing error during that change was corrected
before live calls.

The runner uses actual SDK sessions, isolated temporary cwd/agentDir, disabled user
resources/extensions/MCP, only `read_repository` and `submit_elixir_plan`, in-memory
settings/session, no retries/compaction, at most eight model turns and 90 seconds.
It records effective provider/model/thinking, fixture/runner/skill hashes, bounded
redacted raw messages, structured decisions, denied tools and provider/timeout
failures. The CLI uses configured model/thinking when overrides are omitted,
rejects partial/invalid arguments and existing output before model calls, and
writes new evidence exclusively. It imports the existing Discovery redaction
serializer without changing that evaluator's public schema.

Offline tests cover correct and wrong idioms/commands; wrong test scope, logic,
dependencies and execution claims; unavailable shell/filesystem/forge/mutation
tools; missing evidence, malformed/replacement reports, failure after a good plan,
secret redaction, turn bound, a pending SDK stream aborted by the wall clock,
ordinary Mix control, configured defaults and overwrite refusal. They do not
substitute for actual Elixir tests or credentialed provider evidence.

### Finite live evidence — all eight records retained

Each invocation was explicit, using the configured effective **openai/gpt-6.1-sol,
medium**. No provider/model/thinking override was supplied. Each original case ran
once; only the two failed skill cases received one newly authorized call after the
schema correction. No further live reruns were made.

Original command template, expanded once for each of the six table rows:

```sh
cd /tmp/pi-development-system-elixir
node --experimental-transform-types --no-warnings scripts/eval-elixir.ts --fixture CASE --condition MODE --output /tmp/elx-MODE-CASE.json
```

| Schema | Mode | Case | Result | Turns | Failed check |
| --- | --- | --- | --- | --- | --- |
| Original | baseline | mix | PASS | 5 | none |
| Original | baseline | phoenix | PASS | 4 | none |
| Original | baseline | control | PASS | 4 | none |
| Original | skill | mix | PASS | 4 | none |
| Original | skill | phoenix | FAIL | 4 | `not-executed` |
| Original | skill | control | FAIL | 4 | `not-executed` |
| Literal protocol | skill | phoenix | PASS | 4 | none |
| Literal protocol | skill | control | PASS | 4 | none |

The two original failures honestly stated `NOT EXECUTED.` followed by explanatory
text instead of the exact marker. Their idiom, pure-core, local-command, scoped-test,
dependency and sandbox checks passed. Those records are not rescored or overwritten.
The exact newly authorized commands, each executed once, were:

```sh
cd /tmp/pi-development-system-elixir
node --experimental-transform-types --no-warnings scripts/eval-elixir.ts --fixture phoenix --condition skill --output /tmp/elx-protocol-skill-phoenix.json
node --experimental-transform-types --no-warnings scripts/eval-elixir.ts --fixture control --condition skill --output /tmp/elx-protocol-skill-control.json
```

All eight calls selected tagged tuples and pure domain logic with no dependencies.
Mix selected domain/property checks and the two fixture-owned Nix/just commands;
Phoenix selected domain/LiveView and the two fixture-owned just commands; control
selected domain only and the two conventional Mix commands. No call attempted an
unavailable effect or encountered a provider error/timeout/transcript truncation.

Unmodified JSON copies are in `evals/elixir/evidence/original-*.json` and
`evals/elixir/evidence/protocol-skill-*.json`.
`evals/elixir/evidence/manifest.json` records each raw record's SHA-256, original
fixture/CLI/runner/skill hashes and failed checks, plus old/new runner and identical
scorer-source hashes. Copies were checked byte-for-byte against the `/tmp` originals.
The scorer-source hash is reconstructed from the saved old/current runner source,
not retroactively inserted in original live records. CLI-only complexity/type
refactors occurred between live batches; original per-record CLI hashes remain
unaltered. The skill hash is unchanged across all skill calls.

**Limits:** Original baseline and Mix successes are historical under the old
schema, not freshly verified under the new one. Baselines already passed, so no
causal improvement from the skill is claimed. These are finite structured planning
effects, not implementation quality or statistical evidence. Synthetic commands
are **NOT EXECUTED**: no Mix, ExUnit, property, LiveView or browser verification
occurred. Real application behavior and browser/UI rendering remain unverified.

### Final checks and handoff

- `node --experimental-transform-types --no-warnings --test test/core/profile.test.ts test/state/profile-detect.test.ts test/state/session-state.test.ts test/context/elixir-eval.test.ts test/skills.test.ts`: **99 pass, 0 fail/skip** (13 evaluator tests plus profile/skill checks).
- `npm test`: **1837 pass, 0 fail/skip** after the authorized extension-list and
  literal-protocol corrections. No tests deleted, skipped or assertions weakened.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 322 files, no fixes applied by the final check.
- `npm run lint:knip`: PASS. Its earlier unused-assessor-export finding was resolved
  with a direct pure-assessment regression test, not a suppression.
- `npm run lint:md`: PASS, 113 Markdown files, 0 issues.
- Final patch: `/tmp/devsys-elixir-profile.patch`, including allowed untracked
  files and excluding the preexisting `node_modules` symlink. Generation uses
  `--no-ext-diff --no-textconv --no-color`; only reverse application is checked.
  No commit, push, live GitHub operation or patch application to the coordinator's
  tree is performed here.
- Evidence-integrity check (`node -`, inline): PASS for eight byte-identical raw
  copies, both original failures retained, all fixture/skill hashes and both
  new-protocol runner/CLI hashes verified against current source files.
- `git diff --check`: PASS.
- `git apply --reverse --check /tmp/devsys-elixir-profile.patch`: PASS against the
  completed worktree; check only, no reverse application. Patch contains 24 files.
