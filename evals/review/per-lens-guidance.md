# Per-lens code-review orchestration guidance evidence

## Scope

`test/eval/per-lens-guidance.live.ts` is an opt-in model decision check of the
published code-review skill, review prompt and reviewer agent instructions. It
uses the repository's configured reasoning assessor rather than testing whether
committed text contains particular phrases. Ordinary `npm test` does not run it.

```sh
node --experimental-transform-types --no-warnings --test test/eval/per-lens-guidance.live.ts
```

The four scenario assertions require:

- Two selected lenses: spawn every single-lens payload unchanged as separate fresh
  sessions, launch all siblings before waiting, collect all results, then record once.
- One selected lens: the one-element payload array still uses the same workflow.
- Failed or missing lens: retain available results and recover only that reviewer;
  do not mark partial coverage clean or manufacture a coordinator packet.
- Repeated start with existing sessions: wait for or resume them, without duplicates.

## Observed evidence

The assertion was added before changing the instructions. The initial instruction
set already passed all four scenario decisions (one test, zero failures). After
the instruction update the same check passed again (one test, zero failures).
This establishes compatible decisions on these explicit scenarios, **not an
improvement over baseline**.

Agent, prompt and skill contract tests also passed (82 tests, zero failures).

## Limits

This is bounded decision evidence, not a trace of actual `agent_spawn` or
`agent_wait` execution. It does not prove independent session creation, snapshot
transport, complete-result validation or failure handling in production. Those
properties require behavioral review-tool tests and independent review. Historical
review-concern and bounded-flow evidence remains unchanged and is not relabeled
as evidence for per-lens dispatch.
