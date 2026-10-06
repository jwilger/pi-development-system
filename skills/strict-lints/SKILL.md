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
