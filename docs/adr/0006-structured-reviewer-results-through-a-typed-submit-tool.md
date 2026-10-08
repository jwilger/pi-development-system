# ADR 0006: Structured reviewer results through a typed submit tool

- **Status:** accepted
- **Date:** 2026-10-08

## Context

A reviewer subagent returned its result as markdown that `parseReviewPacket` read back with
regular expressions (`src/core/review-packet.ts`). The coordinator copied that text into
`devsys_review_record`. Every round that went wrong went wrong at this seam: a stray heading
cut the findings off, a backticked location was misread, a reviewer's prose around the packet
confused the parser, and the coordinator had to paste a long text verbatim. The parser grew
rules to tolerate each one. A typed tool call is validated before it is accepted, so the
reviewer learns of a mistake while it can still fix it.

## Decision

- A new tool `devsys_submit_review` takes the packet as structured arguments: `slice`,
  `round`, `lenses`, `sources`, `findings[]` (`lens`, `severity`, optional `path` and `line`,
  `summary`) and `verdict`. The TypeBox schema (`src/review/submit-tool.ts`) is the contract;
  pi rejects arguments that do not match it before the tool runs.
- The tool then checks what a schema cannot, and refuses with a stable kebab-case error id:
  `verdict-contradicts-findings`, `finding-lens-not-listed`, `wrong-round`, `unknown-slice`.
- A valid submission is kept in an in-memory store kept per slice and round (a
  resubmission that shares a lens replaces the earlier one; packets for disjoint lenses are
  kept together). `devsys_review_start` clears the store for its
  slice, so a round only ever sees submissions made after it began.
- `devsys_review_record` takes `packets` as before and also reads the submissions for the
  round. When a markdown packet and a submission cover the same lenses (a reviewer that did
  both), the submission is recorded and the packet dropped, with a note. Markdown packets stay
  accepted: the product lens agents, and any reviewer without the tool, still return one.
- The `reviewer` agent may call `devsys_submit_review`; its task text asks for the call and
  keeps the markdown packet as the fallback when the tool is unavailable.

## Consequences

### Positive

- A malformed or self-contradicting result is refused to the reviewer, not found by the
  coordinator after the round was spent.
- The coordinator no longer copies a large text; it records the round by digest.

### Negative

- Two ways to hand over a result exist until the markdown parser can be retired.
- Submissions live in memory: a `/reload` between the reviewer's submit and the record call
  loses them, and the reviewer has to be run again.
- The tool runs in the root session through pi's inherited-tool bridge, so it is visible to the
  root model as well; its description says it is for reviewer subagents.

## Alternatives

- **Read JSON from the reviewer's final answer** — Rejected because it keeps validation after
  the reviewer has finished, with the same copy-and-parse seam.
- **Retire the markdown packets now** — Rejected because the product lens agents and the
  packets already on disk in `docs/product/reviews/` use them, and a reviewer model without
  the tool would have no way to report.
- **Persist submissions in the session state** — Rejected as not needed: a round takes
  minutes and the loss is visible (the record call names both ways to hand over a result), not silent.

## Revisit when

Every reviewer path uses the tool and no markdown packet has been recorded for a release, at
which point `parseReviewPacket` and the `packets` parameter can be retired.

## Related

- ADR 0004 (soft gates), `src/core/review-packet.ts`, `src/review/review-tools.ts`.
- Plan goal task i9b.
