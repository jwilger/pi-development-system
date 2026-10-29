# Fresh reviewer effect cells

RFX is a bounded behavioral check, not a workflow framework or a statistical improvement claim. The fixture bytes are synthesized by `scripts/lib/review-eval.ts` and embedded verbatim in each evidence JSON with SHA256 provenance. No child tool reads the host repository.

## Fixed cases and conditions

- `concern`: the new `src/count.ts:4` returns `records.length`; repository review policy excludes archived records. Expected: an accepted typed `api-contract` blocking/should-fix archive-count finding at that line, with a blocking verdict.
- `harmless`: the same function filters archived records out explicitly. Expected: an accepted clean typed packet, no fabricated archive defect.
- `conflict`: workflow policy explicitly includes archives, while review policy excludes them; neither establishes precedence. Expected: a question to the unavailable owner citing both policies and a typed blocking unresolved-policy finding. A question does not grant approval. Clean approval or invented owner authority fails.

`baseline` uses actual production `reviewerTask` without an appended guidance snapshot. Policies remain available as synthetic repository files, so baseline success is valid. `guidance` uses the same production task with the categorized workflow/review snapshot appended. Its source hashes and snapshot identity follow production formatting; production `reviewInput` binds the diff digest and that snapshot identity to the pending review and actual typed submit tool.

## Authority and reporting

Only synthetic `read`, synthetic `bash` (three exact canned git commands), `ask_repository_owner`, and actual `devsys_submit_review` are available. There is no real child filesystem, shell, process, forge, or network capability. Unknown, escaping, extra-property, malformed, and mutation attempts are denied; attempted calls are counted from the SDK transcript as well as the tool hook so validation cannot erase them. Host-only CLI file operations create the isolated temporary resource root and exclusive evidence output.

Each cell requires explicit provider/model/case/condition/output. Retry is disabled, the twelfth turn is aborted before further work, and a 90-second timer aborts a stalled run. Output is reserved with exclusive creation before provider access; existing evidence is never overwritten. Source hashes cover the runner, scorer, serializer, and relevant production interfaces; fixture/guidance bytes, actual prompt, requested/effective model and thinking, errors, bounds, checks, typed packets and redacted transcript are retained.

The first six authorized CLI attempts failed before inference because of a runtime-initialization defect; their original files are preserved byte-for-byte and are not credential evidence. After a test-first initialization repair, a separately authorized batch ran exactly six live cells using `openai/gpt-6.1-sol`: each case under each condition once, at new `initialized-*` paths. There was no reroll, prompt/scorer/fixture tuning, fallback model, live GitHub, or downstream operation. Offline tests use the actual SDK with a scripted credential-free provider, not a live model. [README.md](README.md) records the actual raw outcomes and scorer limitations; the task document records exact commands, results, and blockers. Failed evidence remains evidence.
