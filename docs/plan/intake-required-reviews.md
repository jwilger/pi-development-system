# Intake preserves required reviews

## IR1 — Stop unsolicited fix review waivers

**Goal:** Fix-sized intake starts work without offering to waive required reviews.

**Files:** `src/planning/intake-tool.ts`, `test/planning/intake-tool.test.ts`, `skills/work-intake-and-slicing/SKILL.md`, `prompts/devsys-start.md`, `prompts/devsys-plan.md`, `docs/plan/development-system-plan.md`.

**Interfaces:** Existing `devsys_intake` parameters and result; no new parameters or configuration.

**First failing test:** Selecting fix after uncertain sizing records no departure and asks no confirmation question.

**Steps:**

1. Replace obsolete waiver expectations with no-prompt/no-departure assertions and observe RED.
2. Remove intake's waiver prompt and departure-writing path; retain the review-required status note.
3. Cover confident, explicit, headless, and replacement intake paths.
4. Align intake instructions and planning documentation with mandatory reviews.
5. Run checks and fresh-context review rounds.

**Run:** `node --experimental-transform-types --no-warnings --test test/planning/intake-tool.test.ts`; `npm test`; `npm run typecheck`; `npm run lint`.

**Expected:** No waiver confirmation for fix intake; no automatic review departure; all checks pass.

**Out of scope:** Removing explicit departure tools, changing the review gate or required round count, changing global installation files.

## Test list

- [x] User-selected fix preserves reviews without a waiver prompt.
- [x] Confident Jev fix and explicit fix preserve reviews without interaction.
- [x] Headless fix preserves reviews.
- [x] Replacing an active slice still requires confirmation but does not offer a waiver.
- [x] Intake instructions describe mandatory fix reviews (evidence: public-tool regression scenarios above).

## Evidence

- RED: the selected-fix regression failed because intake created a `review.unsatisfied` departure.
- GREEN: all 1,672 tests passed, including 27 intake scenarios.
- Instruction changes are grounded in those executable public-tool scenarios; no change to review gates or explicit departure tools.
