# Lints for Rust

`Cargo.toml` (workspace):

```toml
[workspace.lints.rust]
unsafe_code = "forbid"

[workspace.lints.clippy]
all = { level = "deny", priority = -1 }
pedantic = { level = "deny", priority = -1 }
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
indexing_slicing = "deny"
```

- Run `cargo clippy --all-targets --all-features -- -D warnings` in CI and the pre-commit hook.
- Prefer `#[expect(lint, reason = "...")]` over `#[allow]`: it fails when the lint stops firing.
- Test modules may relax `unwrap_used`/`expect_used` with
  `#![cfg_attr(test, allow(clippy::unwrap_used, reason = "tests assert by panicking"))]`.
- `cargo fmt --check` in CI; no hand-formatting arguments.
