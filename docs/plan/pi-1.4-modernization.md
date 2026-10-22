# Pi 1.4 compatibility and modernization

Approved scope: compatibility fixes and incremental modernization, without new features or a wholesale vendored-runtime rewrite.

## PI14-1 — Establish the pi 1.4 baseline and support custom-triggered runs

**Goal:** User and custom-triggered runs install the extension's prompt sections without handler errors on pi 1.4.

**Files:** `package.json`, `package-lock.json`, `extensions/development-system.ts`, `src/subagents/index.ts`, `test/extension.test.ts`, `README.md`.

**Interfaces:** Pi's discriminated `BeforeAgentStartEvent`; host-provided packages remain wildcard peers.

**First failing test:** A custom `before_agent_start` event without a user prompt completes and installs development-system and subagent prompt sections.

**Steps:**

1. Add and run the custom-event regression to demonstrate the existing failure.
2. Update pi's local development dependencies to 1.4.0 and refresh compatible dependency versions.
3. Restrict user-prompt inspection to user events while preserving sections for all events.
4. Run regression coverage and full checks; document the tested baseline.
5. Review and deliver independently.

**Run:** `npm run typecheck && npm test && npm run lint && npm run lint:knip && npm run lint:md`.

**Expected:** All checks pass, including custom and user event coverage; no known npm audit vulnerabilities.

**Out of scope:** State serialization, classifier accounting, inherited-tool bridge, runtime rewrite.

## Subsequent slices

Each gets a detailed task record before implementation, using findings from the preceding slice.

- Workflow concurrency: sequential state-mutating tools, post-await state validation, and controlled concurrency tests through the real host.
- Real-host SDK coverage: deterministic offline provider covering custom lifecycle, inherited execution, hooks, cancellation, disposal, and child resume behavior.
- Classifier lifecycle: caller-owned cancellation and accurate usage propagation, with cache hits counted only once; verify a supported accounting path for hook calls before changing it.
- Inherited-tool bridge: retype the boundary, preserve available tool metadata, and verify detached context semantics. An adapter boundary change requires an ADR.
- Discovery policy: account for tool search and activation changes without unnecessarily expanding the direct prompt surface. Model-visible instruction changes require fixture/eval evidence.

## Test list

- [ ] Custom-triggered runs keep principles, state, and subagent sections without inspecting a nonexistent prompt.
- [ ] User-triggered runs preserve intent nudges and import onboarding.
- [ ] Two competing workflow mutations cannot overwrite stale state.
- [ ] Actual pi 1.4 session lifecycle works with an offline provider.
- [ ] Caller abort stops classifier work; timeout stays distinguishable.
- [ ] Usage is propagated exactly once; cache hits do not rebill.
- [ ] Detached inherited calls preserve hooks, abort, metadata, and attribution.
- [ ] Search-only startup and later activation obey the intended exposure policy.
