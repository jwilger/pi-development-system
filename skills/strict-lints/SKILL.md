---
name: strict-lints
description: Strict linting with reasoned suppressions - lints are errors, and a suppression always says why. Use when a linter or type-checker complains, when tempted to add an ignore/allow/disable comment, or when configuring lint rules for a project.
---

# Strict lints

Lints and type errors are failing checks, not suggestions. A suppression hides a
finding from every later reader, so it must carry its reason.

## Rules

- **Fix the finding first.** Most lint complaints are right. Suppress only when the
  rule is wrong *here*, and be able to say why in one line.
- **Every suppression has a reason** of at least 15 characters on the same line or the
  next: `// biome-ignore lint/suspicious/noExplicitAny: boundary parse of foreign JSON`,
  `#[allow(clippy::too_many_arguments)] // mirrors the C ABI exactly`,
  `#[allow(..., reason = "...")]`.
- **Narrowest scope.** One line, never a whole file or crate, unless the whole file
  is generated.
- **Prefer `expect` over `allow`** where the language has it (`#[expect]`,
  `@ts-expect-error`): it fails when the suppression stops being needed.
- **Lints are configured strict from day one** (see the language profile): pedantic
  clippy; biome recommended-plus; TypeScript `strict`. Loosening a project rule is a
  recorded decision, not an edit.

## No warning stands

A warning is an error that has not been triaged yet. Before every commit:

- Biome, `tsc`, knip and markdownlint pass with nothing reported (lefthook and CI run them).
- `lens_diagnostics` (pi-lens) shows no warnings for the files you changed. Run it with
  `mode=full` on those paths after a refresh; a cached finding that looks wrong is a stale
  cache to refresh (touch the file and re-run), never one to wave off.
- Each finding is fixed, or suppressed on the line above with a reason
  (`// pi-lens-ignore: high-fan-out -- composition root: wiring is its job`).
- Enable stricter rules by the behaviour they prevent (silent failure, panics, shadowing,
  unreasoned `allow`), not whole categories that contradict each other. Warn while
  working; deny in CI.
- Vendored code under `src/subagents` is on a ratchet: `test/subagents/nocheck-files.ts`
  lists the files still skipping type checks and may only shrink. A file you touch there
  is made type-clean and lint-clean, dropped from the list, and removed from the
  `!src/subagents/...` exclusions in `biome.json`.

## What the extension does

Editing a file so that it adds `#[allow(`, `#[expect(`, `// biome-ignore`,
`// eslint-disable`, `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` without such
a reason is blocked with gate `lints.suppression`. Add the reason, or record a
departure naming why a bare one is right. Suppressions already in the file are not re-flagged.

## Do not

- Do not suppress to make CI green. That is weakening verification (non-negotiable 2).
- Do not write a reason that restates the rule ("ignore the lint"). It must explain
  why the code is correct despite the rule.
- Do not disable a rule project-wide because three files trip it. Fix the three.

## Checklist

- [ ] Tried to fix the finding before suppressing
- [ ] Suppression is one line with a reason of 15+ characters
- [ ] `expect` used where available
- [ ] No lint rule loosened in project config without a recorded decision
- [ ] `lens_diagnostics` shows no warnings on the changed files (refreshed, not cached)
