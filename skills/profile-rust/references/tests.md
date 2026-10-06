# Tests in Rust

- Unit tests of pure rules: `#[cfg(test)] mod tests` beside the code, table style.
- Behaviour/vertical-slice tests: `tests/*.rs` (integration), public API only.
- Prefer `proptest` for parsers and state machines (invariants over examples).
- `cargo test` is the RED/GREEN signal the extension watches; also `cargo nextest run`.
- **Mutation testing (`cargo-mutants`)**: run on changed core logic before review
  (`cargo mutants --in-diff <(git diff main)`). A surviving mutant means a missing
  assertion: add the test, do not exclude the mutant. Excluding needs a reason comment.
- Do not test private functions by making them `pub`; test through the interface.
