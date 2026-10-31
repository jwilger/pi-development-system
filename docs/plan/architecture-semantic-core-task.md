## architecture-semantic-core — Architecture semantic evidence core

**Goal:**

Extend existing review architecture with a pure, deterministic exact-binding semantic-evidence checker, not another review service. This task supplies data contracts and evidence validation only; integration, caller transport, persistence and actual semantic judgment remain separate. A structurally valid pair without authenticated independent semantic evidence must not receive approval.

**Files:**

- New `src/core/architecture-review.ts`.
- New `test/core/architecture-review.test.ts`.
- Do not modify any other files, existing ADRs, package versions, or repository state. Do not commit or push.

**Interfaces:**

Export readonly TypeScript interfaces and functions. Use a canonical domain-separated SHA-256 identity over binding data: version 1; boundary `commit | delivery`; full adoption identity; authoritative trunk; HEAD; tree; complete ordered source and resulting units. A unit explicitly distinguishes a commit from a prospective staged tree; never represent a tree as a commit. Bind scope/order so equal aggregate changes with reordered/omitted units differ. Preserve immutable input snapshots rather than references callers can mutate after binding.

Evidence has binding identity, per-unit checks for `correspondence`, `currentAuthority`, `significance`, `rationalePreservation`, `reconsideration`, `sequentialIntroduction`; each check has `satisfied | violated | not-applicable`, a nonempty explanation and nonempty concrete source references. All expected source and resulting units require coverage; distinguish identical object IDs across source/result scopes. Reject duplicate, missing and extra units. A current-authority check cannot be not-applicable. Other justified non-applicability is permitted; shape validity never establishes semantic truth.

A host-accepted receipt retains full evidence and host-owned reviewer origin (rootId, threadPath, sessionFile, attemptId) plus blocking/should-fix findings or verdict. Expected reviewer ownership/attempt must be supplied separately from evidence. Root (`/root`), unrelated child, missing provenance, wrong root/session/attempt, stale binding, violated check or unresolved serious finding must refuse credit. Ordinary markdown/lens-only legacy evidence gives no credit. The checker accepts a readonly sequence of receipts and required clean depth; count only the trailing consecutive exact-binding eligible clean receipts. Do not parse or trust reviewer origin from model evidence; types must make that separation explicit. Return typed Result-style failures with stable kebab-case identifiers, not expected exceptions.

The exported contracts are proposals within the unmerged policy decision; name functions clearly and document boundary invariants. Keep decisions pure. Built-in crypto is acceptable, no new dependencies. Follow repository strict TypeScript conventions; no lint suppressions or unsafe casts. No filesystem, process, network, pi API, or state store code.

**First failing test:**

Use a valid binding and require semantic approval with no accepted receipts; observe a real behavioral refusal assertion before implementing it. Missing-module/import errors do not count as RED: scaffold declarations first if needed, then run the actual assertion failure.

**Steps:**

1. Read applicable TypeScript, TDD and behavior-test skills; inspect existing Result convention in `src/core/result.ts` and existing review types without modifying them.
2. Test exact immutable identities and explicit staged/commit distinctions.
3. Test absent, stale, unauthenticated and wrong-attempt evidence, including root and coordinator-supplied text.
4. Test complete explained evidence, coverage errors, serious findings and clean-round depth.
5. Run focused tests, TypeScript checking and Biome on the two owned files. Report exact commands, RED/GREEN evidence and remaining integration assumptions.

**Run:**

`node --experimental-transform-types --no-warnings --test test/core/architecture-review.test.ts`

`npm run typecheck`

`npx biome check src/core/architecture-review.ts test/core/architecture-review.test.ts`

**Expected:**

Focused behavioral tests and checks pass without claiming live semantic truth, origin authentication, full pi integration or delivery admission is implemented.

**Out of scope:**

Review tool schemas/round storage, git adapter, runtime/bridge transport, root guard wiring, prompts, model-backed eval, actual reviewer dispatch, publication and commits. Coordinate with the parent if a concrete contract decision is missing; do not expand ownership.
