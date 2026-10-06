---
name: profile-rust
description: Rust idioms for this development system - nutype-style semantic types, thiserror error enums, strict clippy, cargo-mutants policy, test layout. Use when working in a Rust repo (Cargo.toml, *.rs files), adding a crate, or reviewing Rust code.
---

# Rust profile

Applies the universal skills (`tdd-canon`, `functional-core-imperative-shell`,
`semantic-types`, `typed-errors`, `strict-lints`, `behaviour-tests`) with Rust idioms.
Read the reference you need, not all of them:

- Semantic types: `references/types.md`
- Errors: `references/errors.md`
- Lints: `references/lints.md`
- Tests and mutation testing: `references/tests.md`

## Defaults

- **Newtypes with a fallible constructor** for every domain value; no public field
  that lets a caller skip validation.
- **`Result<T, E>` everywhere** a caller can recover; `thiserror` enums, one per module.
  `anyhow` only in binaries' `main`, never in library code.
- **Core is pure.** Effects are a returned `Step`/command enum executed by a thin
  `main`/adapter layer; the core crate has no `std::fs`, `std::time` or `std::env`.
- **Pedantic clippy as errors** in CI; every `#[allow]` has a reason
  (`#[allow(..., reason = "...")]` or a trailing comment).
- **No `unwrap`/`expect`/`panic!`/indexing in non-test code** unless it is a proven
  invariant with a comment naming the proof.

## Do not

- Do not use `String`/`PathBuf`/`u64` for domain values with rules. Name the newtype.
- Do not `#[allow(clippy::...)]` at crate level to quiet a few warnings.
- Do not `unwrap()` on input that came from outside the process.
- Do not make types `pub` just to test them; test through the public interface.

## Checklist

- [ ] New domain values are newtypes with fallible constructors
- [ ] Errors are `thiserror` enums with stable kebab-case ids in `Display`/`kind()`
- [ ] `cargo clippy --all-targets -- -D warnings` clean
- [ ] `cargo test` green after a failing test was seen first
- [ ] Mutation testing run on changed core logic (see `references/tests.md`)
