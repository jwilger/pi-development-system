---
name: profile-typescript
description: TypeScript idioms for this development system - branded types with parse functions, Result-style errors, strict tsconfig and biome, node:test layout, ESM. Use when working in a TypeScript or JavaScript repo (package.json, tsconfig.json, *.ts files) or reviewing such code.
---

# TypeScript profile

Applies the universal skills (`tdd-canon`, `functional-core-imperative-shell`,
`semantic-types`, `typed-errors`, `strict-lints`, `behaviour-tests`) with TypeScript idioms.
Read the reference you need:

- Branded types and parsing: `references/types.md`
- Result pattern: `references/errors.md`
- tsconfig and biome: `references/lints.md`
- Test layout: `references/tests.md`
- Event-model scenarios as tests: `references/gwt-tests.md`

## Defaults

- **`strict` TypeScript, ESM, no `any`**, no `as` outside a boundary parse function
  (commented as the boundary).
- **Branded types** for ids, paths and statuses, each with a `parseX(input: unknown)`
  returning `X | ParseError` (or `Result`).
- **Discriminated unions** (`kind` field) for states and errors; exhaustive `switch`
  with a `never` check.
- **Result values, not exceptions**, for expected failure; throw only for bugs.
- **Pure core in `src/core`**; I/O (fs, network, `process`) only in adapters and the
  extension entry point.
- **`readonly` by default**; no mutation of inputs.

## Do not

- Do not use `any`, non-null `!`, or `as Foo` to silence the compiler in core code.
- Do not use `enum`; use string-literal unions.
- Do not export mutable module state.
- Do not add a runtime dependency without an ADR; prefer Node built-ins.

## Checklist

- [ ] `tsc --noEmit` clean under `strict` (plus `noUncheckedIndexedAccess`)
- [ ] `biome check .` clean; every suppression has a reason
- [ ] New ids/paths are branded with a parse function
- [ ] Failures returned as values with a `kind`
- [ ] Test written and seen failing before the source change
