# Continuation-aware intake: implementation and verification

## Cause

The idle intent hook classified only the current prompt and local phase. The
classifier described continuation mainly as a short reply, while a fix could
mean any broken behavior. Several shipped entry points instructed the assistant
to intake all nontrivial work, and idle/closure text implied that no work remained.
Those instructions could contradict an approved goal's unfinished acceptance work.

## Repair

- Advisory idle intent classification now includes the active slice and bounded,
  redacted text from the supported public session projection, including compacted
  evidence. It does not read another extension's private goal files or data.
- Principles, idle guidance, intake description, closure messages, start/plan
  prompts and the intake skill distinguish acceptance repairs from genuinely new
  work. The plan workflow is explicitly conditional on needing a new plan or a
  material scope change; it must not regenerate plans or goals for approved repairs.
- The assistant is instructed to inspect the focused goal through its public tool
  when available, the slice and recent evidence, then directly continue established
  approved scope. Checkpoints, resume, compaction and delayed notifications are not
  themselves new authorization or work requests.
- The intake mutation, explicit replacement consent and asynchronous state-race
  checks remain unchanged. Existing approval and blocker requirements still apply.
- The live intent fixture runner now forwards both context fields instead of
  discarding them. All expected intents, assertions and its pass threshold remain
  unchanged. This addresses the first independent tests review's finding.

## Verification evidence

Commands below were run on the integrated working candidate based on main
`bd492d6`. These are local observations, not evidence of release or delivery.

| Check | Observed result |
| --- | --- |
| `npm test` | 2,207 passed; 0 failed; 0 skipped |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; one existing informational template-literal suggestion in `test/state/config.test.ts` |
| `npm run lint:md` | Exit 0 |
| `npm run lint:knip` | Exit 0 |
| `git diff --check` | Exit 0 |
| `npm run check:jev` | 22 real-model tests passed; 0 failed; 0 skipped |
| `test/live/intent.live.ts` | Real-model fixture-rate check passed with context forwarding |
| `test/live/continuation-intent.live.ts` | Both strict tests passed: seven evidence-bearing cases and identical wording with two different goal contexts |
| `test/eval/intake-guidance.live.ts` | Passed uncertainty/replacement-boundary scenarios |
| `test/eval/continuation-intake.live.ts` | Final run passed all 60 source/scenario cells; 0 skipped |

The strict guidance evaluation independently exercises five shipped entry points
against 12 scenarios: review and completion-auditor findings, failed verification,
resumed idle evidence closure, compaction/checkpoints, delayed notifications,
unrelated active-work requests, a genuinely new bug, ambiguous scope expansion,
classifier uncertainty, a next approved slice, and missing recoverable context.

A preceding guidance run returned an unresolved assessment for the plan prompt.
The remaining unconditional planning workflow was explicitly scoped to new plans
and material scope changes; the same strict expected actions then passed. No
expected action was relaxed. Failure diagnostics now include the scenario text.

Public hook regressions cover compacted evidence and secret redaction, restored
active slices across lifecycle events, absence of replacement prompts/state changes,
and custom notification runs that do not invoke idle classification. Existing
intake-consent and race-condition tests are retained.

## Integration and independent review

Main was integrated by fast-forward under John's explicitly recorded narrow
exception for the architecture guard's merge-command refusal. Both main's mandatory
architecture correction and the continuation prompt changes are retained. The
backup stash is `bdbfbffded9b38b5e2674d635c58e19b58d7b883`.

Round 1 recorded a clean types review and one tests finding (dropped fixture
context), now repaired. Final acceptance requires a fresh clean independent round
on this complete candidate; consult the session's bound review record for its
result rather than treating this report as review approval.

## Limits and delivery status

Semantic membership in an approved scope remains model guidance and advisory
classification, not a new mechanically enforced authorization gate. A mistaken
explicit intake call can still ask to replace an active slice; this repair does
not auto-authorize it or disable that consent boundary. Bounded session evidence
can omit older facts, so public goal inspection and recovery remain necessary.
Model-backed results are samples, not a universal guarantee across models/sessions.
The before-agent API distinguishes user from custom messages, but does not itself
prove that every user-shaped message came from an interactive user.

Tests used a temporary local `node_modules` symlink to the existing dependency
installation because an inherited architecture CLI test resolves a worktree-local
package path. No dependency installation was performed. The symlink was removed
after the full test run; the backup stash retains its former link.

The original repair and completion audit were local. John subsequently authorized
shipping and explicitly approved prospective architecture-policy adoption with
`refs/remotes/origin/main` as authority and
`bd492d6e31584ae6eb037778a5072b344fa1e124` as the boundary. Existing architecture
and merged ADR contents are unchanged. This selects the existing policy; it does
not introduce a new architectural decision or reconstruct past commits.

Before changing live configuration, an isolated native pi SDK session loaded the
installed extension at
`/home/jwilger/.pi/agent/npm/node_modules/@jwilger/pi-development-system/extensions/development-system.ts`
with a temporary copy of the full proposed configuration. Its real
`devsys_models` tool accepted the configuration over two scripted provider
requests, with zero extension errors. Credential environment variables and stores
were isolated; unresolved model slots were expected. The first probe exposed
inherited credential discovery; after isolating the environment the same assertions
passed. No extension was installed or upgraded.

The shipping candidate is version 10.1.0, as required by the semantic version gate.
Fresh exact-bound ordinary and architecture review, commit hooks and delivery
admission are still required for this expanded candidate. This report does not
claim a commit, push, release or publication. No installed-extension or
consuming-project modification was authorized or performed. The separate
architecture-policy session's unfinished work was not taken over.

## Shipping follow-up

Commit `0eb5cf94edd33684bc41eb6eabb661a5b821397e` was pushed to main after clean
independent commit-bound and delivery-bound reviews, including exact architecture
bindings. All commit hooks passed, including 2,207 tests with zero failures or
skips. The temporary dependency link was removed; no installed extension changed.

CI run [41245354203](https://github.com/jwilger/pi-development-system/actions/runs/41245354203)
passed lint and tests but blocked the release: version classification returned
major with confidence 0.50, below 0.60 (breaking 0.50, feature 0.53, observable
0.99). GitHub release and npm publication were skipped. This is a failed release,
not a published 10.1.0. The previously accepted local minor judgment does not
supersede the CI failure.

John then explicitly approved the supported reasoned version override for a
forward-only `fix(ci)` follow-up, retaining 10.1.0. The public intake contract,
replacement consent and state guards remain unchanged; independent review found
no breaking migration. This follow-up records that human judgment rather than
retrying for a favorable classifier answer or rewriting the pushed commit. All
other hooks, independent review and release verification remain required. The
follow-up pipeline's publication outcome is not yet established by this report.
