# Mandatory architecture and historical decision policy

## Approved outcome and scope

Projects using the extension must treat root `ARCHITECTURE.md` as their self-contained current architecture and goals, and ADRs as decision history. This capability reconciles existing instructions and adds supported pi workflow/delivery checks and independent semantic review. Publishing, pushing, releasing, modifying consuming projects, historical rewriting and retrospective reconstruction are not authorized.

This is a brief-lite and journey inventory for the confirmed goal. Architecture designs below are not implementation or delivery evidence. Implementation, public-behavior verification, independent review and local commit evidence are recorded in `docs/evidence/architecture-policy/README.md`. This plan itself is not enforcement evidence.

## Problem, outcome and risks

The present ADR-presence guidance does not establish current architecture authority, substantive correspondence, merged-record preservation or resulting-commit integrity. Success means a project gets one consistent policy and observable rejection of mechanically invalid actions at supported boundaries, with semantic review and honest limits.

- Value: reduce conflicting current requirements and loss of decision history; the owner's supplied policy establishes the requested outcome, not measured user adoption.
- Usability: onboarding must explain prospective adoption without demanding rewritten history.
- Feasibility: highest-risk assumptions are authoritative-history resolution, prospective resulting-commit inspection and supported pi action blocking. Verify these through actual harness behavior.
- Viability: preserve compatibility where safe; unsupported historical formats must fail explicitly rather than be rewritten automatically.
- Alternatives: instructions alone cannot meet the requested mechanical checks. Mechanical text heuristics alone cannot prove substantive correspondence. The required approach combines deterministic checks with independent semantic review.

## Journeys

- J1: An adopter inspects existing guidance and history, resolves authority and records a prospective adoption boundary with authorization; historical ADRs and unrelated work remain untouched.
- J2: A developer introduces one significant decision and its cumulative self-contained architecture update, verifies and independently reviews them, then creates one commit before starting the next decision.
- J3: A developer edits an unmerged decision alongside its corresponding architecture change, or replaces a merged decision with a new paired ADR and only marks the original superseded.
- J4: A reviewer checks substantive correspondence, architecture authority, rationale, significance and justified reconsideration on the exact proposed changes, separately from mechanical results.
- J5: A deliverer validates all pending and resulting trunk commits, including a prospective squash, and receives an actionable refusal rather than silently skipping history or losing replacement decisions.
- J6: Fresh, resumed, compacted and delegated pi work receives the same policy at the paths supported by the harness.

## Initial verified repository observations

- Checkout: `main`, HEAD `ad07f55`, tracking `origin/main`; symbolic `origin/HEAD` points to `origin/main`. Local repository is not shallow. This is an inspection result, not proof that a remote has been freshly fetched.
- No root `ARCHITECTURE.md` or `docs/architecture.md` was found at initial inspection. Existing numbered decisions `0001` through `0014` and `0000-template.md` are already in `origin/main`; preserve their merged records.
- `extensions/development-system.ts` is the composition root. It registers pi `tool_call` guards, named prompt sections and review/planning tools.
- `src/gates/commit-guard.ts` currently recognizes ADR additions by diff headers and uses a model-backed architecture-significance judgment. Presence is not substantive correspondence.
- `src/gates/push-guard.ts` checks delivery mode, trunk build status and pending commit messages; this is not yet architecture-history validation.
- Baseline `npm test`: 2,049 passed, 0 failed, 0 skipped. Detailed baseline log: `/tmp/pi-architecture-baseline-tests.log` (ephemeral local evidence).

## Required evidence matrix

| Requirement / scenario | Required observable evidence |
|---|---|
| Current architecture authority; no backlinks, source tables or delegated requirements | Instruction evaluations and independent semantic review of self-contained architecture |
| Intent versus verified implementation/delivery | Explicit labels in guidance and architecture; semantic review |
| Significance, historical rationale, rejected alternatives and reconsideration | Reviewer criteria and model-backed instruction evaluations |
| Valid paired addition; absent/empty/cosmetic update | Public workflow tests accepting a substantive reviewed pair and refusing invalid candidates |
| One new ADR per commit | Per-commit tests, not merely an aggregate diff |
| Merged edits, deletion, rename and reintroduction | Real Git history fixtures and supported pi rejection tests |
| Linked status-only supersession | Exact permitted status delta with the newly added replacement retained |
| Paired/unpaired premerge edits | Pending-history fixtures and exact-change review binding |
| Resulting squash violations and disappearing replacements | Prospective resulting-commit tests before delivery |
| Authoritative trunk; unavailable history; skipped pending commits | Explicit resolution and fail-closed tests |
| Safe paths and unsupported historical formats | Hostile-path/format fixtures; no rewriting or unintended writes |
| Sequential bootstrap | One decision, cumulative architecture, verification/review and commit before the next; instruction evaluation |
| Prospective adoption | Existing historical records remain byte-identical except later valid supersession; no retrospective reconstruction |
| Fresh/resumed/compacted/delegated contexts | Supported pi integration tests and instruction evaluations |
| Detection versus actual blocking | Actual pi-host rejection evidence and documented unenforced paths |

## Security considerations

Assets are the historical decision record, current architecture authority and trustworthy verification evidence. Inputs include model-supplied revisions/paths, repository contents and Git history. Risks include skipped commits, ref ambiguity, shell/path injection, symlink traversal, arbitrary object/path reads and unbounded history work. Use argument arrays, parsed bounded inputs, canonical repository-relative paths, immutable object identities and explicit failure results; do not execute repository-provided commands or rewrite files to repair policy failures. Ordinary shell/Git execution outside supported pi boundaries cannot be assumed blocked.

## Local implementation and evidence closure

Implementation commit `ca12e62d18c104887a23a23161d3d35450a3cea4` contains the shared authority/history instructions, prospective configuration and real Git inspection, supported pi commit/delivery refusals, exact-bound independent semantic evidence and fresh/restored/compacted/delegated request coverage. Its repository hooks passed, including 2,202 tests and 20 real-Jev fixtures. Fresh independent types/tests reviewers and a supplementary six-concern semantic reviewer returned no findings in the final implementation round. Only decision 0017 was introduced, paired with the substantive self-contained root architecture; upstream merged decisions remain unchanged.

A completion audit then found a contradictory optional-architecture instruction in the shipped start prompt and stale report status. The same-slice follow-up reconciles that prompt and extends the bounded evaluator to load and expand the actual template through pi, with public regressions and preserved live evidence. The evidence report maps each acceptance area to its checks and distinguishes local completion from remote delivery.

The owner's live-configuration revert and all three recovery stashes remain preserved. Installation, consumer adoption, push and release were not performed and require separate authorization. No retrospective history reconstruction or consumer modification is needed to close this local implementation.
