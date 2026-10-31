# Mandatory architecture and ADR policy

This is the standard project policy for repositories using the extension, not an optional planning recommendation. Instructions, structural detection and action blocking are distinct controls; none is a substitute for the others.

## Current authority and historical rationale

Root `ARCHITECTURE.md` is the authoritative, self-contained account of current architecture and architectural goals. New and modified code must conform. Keep declared intent visibly distinct from verified implementation and delivery. Include enough information for development and review without reconstructing requirements from decisions. Do not include ADR backlinks, source tables or delegated current requirements.

ADRs preserve history: context, decision, alternatives considered and rejected, consequences and material conditions for reconsideration. Consult them to understand rationale or reconsider an approach. Do not retry a rejected idea without materially changed context. Create ADRs for architecturally significant or hard-to-reverse choices, not routine implementation details.

## Commit and delivery units

- Every new ADR has its corresponding substantive architecture update in the same commit. Every premerge ADR edit needs the same pairing; cosmetic architecture edits do not count.
- Each resulting main/trunk commit adds at most one ADR. Other ADRs may change in that addition commit only for status-only supersession linked to the newly added replacement.
- Once merged into authoritative main/trunk, never otherwise change a record, including correction, deletion or renaming. Correct through a new paired decision and preserve the original except its permitted superseded status.
- Preserve decision identities, replacements and required updates through delivery. Squash must not combine new decisions or discard architecture updates. Use separate delivery units when necessary.
- Bootstrap sequentially: one new decision and its cumulative self-contained architecture containing only decisions introduced so far, appropriate verification, independent semantic review, then its commit before introducing another. Never prewrite a set and manufacture incremental history afterward.

## Setup and prospective adoption

1. Inspect actual repository instructions, architecture documents, decision formats, workflow, history and delivery mode. Inventory competing current authorities, decision backlinks/source tables, mutable-record guidance and unsafe squash assumptions. Preserve unrelated work.
2. Resolve the authoritative main/trunk ref explicitly with the owner. Resolve a full commit identity for prospective adoption that is reachable from that ref. Do not choose a convenient suffix or guess when required history is unavailable.
3. Propose migration: establish a self-contained root architecture, distinguish goals from observed implementation, reconcile conflicting live guidance and retain merged records byte-for-byte. Do not retrospectively reconstruct commits or normalize unsupported old formats. A template is not a historical decision record.
4. Obtain authorization before changing a consuming repository, configuration or operational policy. Discovery and a migration proposal are not authorization. Keep any new architectural decisions to separately reviewed and committed cumulative pairs.
5. **Upgrade first:** verify that the active pi extension—not merely a checkout or matching package version—supports the new configuration. An older already-running extension may reject its very next request on an unknown key; restarting is not a prerequisite for that failure. Obtain authorization before installation or upgrade, and test adoption in an isolated pi session before changing live configuration. Preserve existing configuration until this compatibility check passes.
6. Configure the explicit policy boundary in `.development-system.toml` using `[architecture]`, `trunk_ref` (a full `refs/heads/...` or `refs/remotes/...` ref) and `adopted_at` (a full lowercase commit object ID). An absent boundary is unresolved adoption, not a disabled policy. Select actual owner-approved values, not example branch names or placeholder hashes.
7. Verify the complete source and intended resulting history through supported workflow boundaries. Necessary missing history, shallow clones, unsupported topology or unsafe paths must fail closed without rewriting records. Post-adoption violations do not become grandfathered merely because a ref advanced.

The current history inspector supports linear post-adoption and proposed resulting commit sequences. Unsupported merge topology is a refusal requiring a supported delivery shape or an implementation change with evidence, not permission to bypass verification. Existing pre-adoption records are preserved without retrospective reconstruction. Unsupported status syntax is not automatically rewritten to fit the canonical status-only supersession check; preserve the old record and propose a safe replacement strategy.

## Independent semantic review

Require explicit review of substantive architecture/decision correspondence, self-contained current authority, significance, preserved rationale and justified reconsideration. Inspect every source and resulting delivery unit, not just the aggregate final diff. Check cumulative sequential introduction and retained replacements. Presence, non-whitespace changes or a word-difference heuristic do not prove substance.

Each selected ordinary lens has its own fresh independent reviewer, and every selected result is required. One host-designated independent reviewer additionally inspects the complete architecture source/result units; ordinary lens submissions alone provide no architecture credit.

Review evidence must be bound to the exact authoritative trunk, adoption boundary, HEAD, ordered units and staged/resulting tree. Preserve explanations and concrete sources, and distinguish authenticated independent reviewer origin from coordinator-pasted prose or a lens label. A structural pass does not grant semantic approval. Report missing or stale evidence and stop rather than substituting a weaker check.

## Enforcement scope and evidence

Shared instructions are supplied through named pi context preparation, including automatic continuations and supported independent/restored children. An actual pi manual-compaction fixture verifies that policy returns on the next request even when the summary does not contain it; forced full-prompt replacement is refused with or without configured workflow. Pi `tool_call` blocking can stop recognized actions before they execute. A tool returning `isError` rejects that tool operation; it is not proof of a universal operating-system boundary. Direct extension `pi.exec`, child-local built-ins, external terminals, aliases, opaque scripts and tools outside registered hooks may remain outside admission checks. Do not use those paths to evade policy; report them as coverage gaps.

The working implementation includes structural checking, explicit-history Git inspection, production composition-root commit/delivery blocking and exact-binding semantic admission using host-issued independent reviewer dispatches. Actual pi fixtures cover root registration, independent-child admission, unrelated-child rejection, incomplete per-lens review and changed-tree refusal. Real Git fixtures cover every pending commit, staged trees, proposed squash histories and concurrent index/HEAD/authority movement. Final reinspection is not an atomic Git lock: outside processes, changes that move away and back between observations, and the final inspection-to-execution interval remain limitations. Local authority refs and adoption configuration require owner trust. Supported commands are one literal-message staged commit or one explicit push of HEAD to the configured remote/trunk; unsupported recognized shapes and literal remote PR merges fail closed. An independently reviewed proposed immutable result is not permission for an opaque hosting operation. These working changes are not yet delivered or independently reviewed as a complete slice. Model-backed instruction-effect evaluation failures must remain visible and be resolved before completion; neither prompts nor authenticated review assertions establish universal semantic truth.
