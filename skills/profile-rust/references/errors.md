# Errors in Rust

```rust
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("unknown key {key}")]
    UnknownKey { key: String },
    #[error("cannot read config")]
    Io(#[from] std::io::Error),
}
```

- One enum per module; variants carry the data a caller can act on.
- Stable id for tests/logs: add `fn kind(&self) -> &'static str` returning kebab-case
  (`"unknown-key"`); do not match on message text.
- Libraries return `Result`; only a binary's `main` may use `anyhow` to print a report.
- `?` for propagation; `map_err` to translate at a boundary, keeping the cause via `#[from]`/`#[source]`.
- Panic only for broken invariants (Wlaschin exception: fail fast), with a comment.
