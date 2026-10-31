# Architecture policy evidence (working implementation)

This is local implementation evidence, not a release or delivery record. Independent review is recorded separately by the development workflow; this report does not assert review completion. No consumer migration, extension installation, push or publication is authorized by these results.

## Deterministic and actual pi verification

- Integrated candidate `npm test`: **2,202 passed, 0 failed, 0 skipped**, after integrating the upstream test-guard repair. Local log `/tmp/pi-architecture-integrated-final-tests.log` is ephemeral, not a portable artifact.
- `npm run typecheck`, full repository Biome, knip, ast-grep and Markdown checks passed. Markdown checked 144 project documents; the owner approved keeping unrelated ignored worktrees outside both lint discovery scopes without disabling rules.
- The staged real-Jev fixture gate passed **20 tests, 0 failures, 0 skipped** (`/tmp/pi-architecture-jev-fixtures.log`). The version gate required and accepted the local candidate bump from 9.1.0 to 10.0.0; this is not publication authorization.
- Direct Biome 2.5.15 checks on changed TypeScript paths use existing Git ignores (`--vcs-enabled=true --vcs-client-kind=git --vcs-use-ignore-file=true`) so unrelated ignored worktrees are not treated as nested projects. Earlier `npx biome` invocations resolved a different package and are not relied on as lint evidence.
- `test/core/architecture-history.test.ts`: pairing, missing/empty/cosmetic updates, immutability, exact linked supersession, identity preservation, premerge edits, replacement retention and resulting-commit integrity. These are structural observations, not semantic correspondence proof.
- `test/state/architecture-history.test.ts`: real temporary Git histories, explicit adoption/authority, complete pending and proposed result chains, actual staged trees, valid and invalid squash, post-adoption audit, graft refusal, recorded-policy conflict and concurrent index/HEAD/authority movement.
- `test/gates/architecture-guard.test.ts`: actual pi SDK tool-call rejection before prohibited transport executes; production composition registration is also exercised by public integration fixtures.
- `test/review/architecture-integration.test.ts`: actual pi root/inherited child bridges, two separately dispatched lenses, refusal of incomplete rounds, authenticated semantic credit versus root/unrelated submissions, persistence/restoration, stale bindings and commit/delivery admission. Transport fixtures do not constitute remote pushes.
- `test/subagents/tool-caller.test.ts`: concurrent host-owned caller isolation and fresh/restored runtime attempts.
- `test/context/workflow-guidance.test.ts`: root/continuation/independent/restored requests, actual manual compaction with a summary omitting policy, and refusal of full-prompt replacement even without repository workflow configuration.
- `test/planning/adr-sequence.test.ts`: sequential decision creation in real repositories and actual pi same-turn tool calls; no overwrite or second uncommitted decision.

## Live instruction evaluations

Explicit model: `openai/gpt-6.1-sol`. Actual pi SDK sessions, 36 unchanged scenarios per condition; no automatic fallback. Provider calls completed successfully in both matrices. Requested thinking was `off`; evidence records effective provider settings rather than assuming they match.

| Evidence prefix | Baseline | Guided | Interpretation |
|---|---:|---:|---|
| `matrix-1793405842672-` | 31/36 | 34/36 | First run; guided false historical vetoes on `valid-pairing` and `split-delivery` were real failures. |
| `matrix-1793415897202-` | 31/36 | 36/36 | After clarifying current authority versus historical veto; same cases and expected answers, no weakened oracle. |

All failed cells remain alongside successful cells. Synthetic scenarios cover authority/backlinks/source tables/delegated requirements, intent/evidence, significant versus routine decisions, preservation and replacement, premerge edits, squash/result loss, sequential bootstrap and prospective adoption. This bounded synthetic matrix measures the shared instruction, not universal model reliability or every modified skill's effectiveness in isolation.

The initial unavailable-model artifacts also remain. Their empty model snapshots were caused by runner initialization disabling discovery, not absent user credentials. A public SDK regression now proves existing local configured models are discovered without catalog network access. A subsequent live cosmetic-update cell passed before the complete matrices ran. Evidence files contain synthetic prompts, bounded decisions, effective model identities and hashes; they are exclusive private files, with no credential values deliberately recorded.

## Known limits and deployment safety

- Prompts are instructions; structural checks are detection; registered `tool_call` refusals block only covered actions. None is an OS sandbox.
- External terminals, direct `pi.exec`, opaque scripts/aliases, child-local built-ins and unrecognized hosting/API commands remain outside recognized root admission paths. They must not be used to evade policy.
- Supported inspection uses linear post-adoption/result histories; unsupported topology and missing history fail closed. Literal remote PR merge is refused because the resulting immutable commits cannot be proved beforehand.
- Word-change and link heuristics do not prove substantive updates or all backlink forms. Independent semantic review remains mandatory, and authenticated assertions do not prove semantic truth.
- Git inputs are rechecked, not locked. Outside-process mutation, away-and-back changes between observations and the final inspection-to-execution interval remain limitations. Owner-supplied local refs/configuration are trust inputs.
- A live configuration compatibility incident proved that an older already-running extension rejects unknown keys on its next request. The owner's configuration revert is preserved. Upgrade and isolate-test the active runtime before authorized adoption; matching package version numbers alone are insufficient. No installed runtime or consuming project was modified for this capability.
- Merged records through 0016 are preserved. The sole new pending decision is 0017, paired with the substantive root architecture document. No final local commit or remote delivery is claimed here.
