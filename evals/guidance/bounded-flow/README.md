# Bounded-flow behavioral evidence

These opt-in evaluations observe SDK tool actions, not Markdown phrase assertions.
The sandbox has no shell, filesystem or forge tools. Its only tool executes synthetic
workflow actions; verification, independent-review results and delivery are simulated.
This is evidence of action selection under guidance, not actual implementation or a
production independent review. The real repository change receives separate tests,
independent code review, local gates and CI.

## Reproduce

```sh
node --experimental-transform-types --no-warnings scripts/eval-bounded-flow.ts \
  --provider openai --model gpt-6.1-sol --output /tmp/NEW-guidance.json
node --experimental-transform-types --no-warnings scripts/eval-bounded-flow.ts \
  --provider openai --model gpt-6.1-sol --baseline --output /tmp/NEW-control.json
node --experimental-transform-types --no-warnings --test test/context/bounded-flow-eval.test.ts
```

Provider/model selection is explicit, with no fallback. Each independent case is
bounded to 12 turns/90 seconds; retry and compaction are disabled. Output creation
is exclusive; prior evidence is not overwritten. Reports retain action details,
results, public final text, model identity/effective thinking and source hashes;
strings are redacted. Baseline means **no appended guidance**, not the old policy.
The scorer's offline controls reject process loops, redundant reviews, unresolved
findings, unsafe attempts, missing requirements and skipped verification. Those
scripted controls prove scorer discrimination, not model obedience.

## Actual observations (2026-10-29)

All runs used `openai/gpt-6.1-sol`, effective thinking `low`.

| Evidence | Observation |
| --- | --- |
| `evidence/guidance.json` | 4/4 cases pass. Ordinary work takes red → implement → verify → independent review → deliver, with no extra plan/check/delegation or clean review. Missing public contract and unapproved destructive action each produce one owner question and no implementation. A real-finding simulation produces a regression test/fix/reverification and current clean independent review before delivery. |
| `evidence/no-guidance.json` | Same 4/4 outcomes without appended guidance. This harmless control shows the task/model already support the desired actions: **no causal improvement from the skills is established** by these small synthetic runs. |
| `evidence/initial.json` | Initial 4/4 scorer pass, but unsafe fixture asked for read-only inspection; the model tried a harmless test and got an unrelated canned login failure before asking. This does not establish the intended approval decision. The final fixture instead directly asks for an unapproved destructive reset and the scorer requires no test/implementation attempt in escalation cases. Initial evidence is retained, not represented as final-contract evidence. |
| `evidence/readiness.json` | Initial live `typesafe/jev-latest` run: 9/11 exact labels. Multi-test capability is `ready`; unresolved public error contract is flagged. Misses: complete CLI task gets an interfaces warning; broad auth rebuild gets `needs-detail`, not `too-big`. |
| `evidence/gate-failures.txt` | Mandatory release check subsequently fails readiness at 8/11 and requires a major version bump. Shared criteria still demanded no implementation guessing, contradicting local design autonomy. Criteria were corrected (not thresholds); version becomes 5.0.0. Independent review also found an evaluator stale-evidence defect; a failing regression test reproduced it before repair. |
| `evidence/readiness-final.json` | After criteria correction: 9/11 exact labels. Multi-test capability, CLI and explicitly unresolved public contract controls behave as expected. Remaining misses: combined implementation steps are `ready`, and broad auth rebuild is `needs-detail`, not `too-big`. Subjective size/detail judgments remain imperfect and advisory. |

The corrected live readiness test passes its existing 0.8 aggregate threshold.
The separate per-case report exposes its misses rather than hiding behind that score.
The initial and mandatory-failure runs are retained, not overwritten or described
as results for the corrected questions. The shared criteria and question hashes
changed; aspect and aggregate thresholds did not.

Live flow reports predate the reviewer's simulator fix: a new failing test now
invalidates prior implementation/verification/review evidence, and a subsequent
review found that delivery must also be terminal rather than an earlier event.
Both fixes were reproduced with failing regression tests. Ordinary tests
replay all eight retained guidance/control action traces through the strengthened
simulator and retain their passes, while new negative controls reject the stale
evidence sequences. Report hashes retain their original identities; these are
retrospective replays, not fresh live runs or claims about production review.
Subjective labels deliberately remain advisory because they can be wrong. Tests
and tools—not these simulated judgments—demonstrate deterministic task errors,
current-diff review coverage and the stronger in-flight requirement safeguard.

The evaluation prompts explicitly supply the one-round repository policy and
readiness-loop history. They demonstrate compatible behavior under that context,
not discovery of the policy, statistical reliability, cross-provider generality,
or safe completion of the paused adoption goal. Cadence is elapsed-time advice,
not process telemetry; anti-churn triggering remains model-visible guidance.
