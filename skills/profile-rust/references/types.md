# Semantic types in Rust

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateId(String);

impl GateId {
    pub fn parse(input: &str) -> Result<Self, GateIdError> {
        // validate once; the field is private so every GateId is valid
        if is_valid(input) { Ok(Self(input.to_owned())) } else { Err(GateIdError::Malformed) }
    }
    pub fn as_str(&self) -> &str { &self.0 }
}
```

- The `nutype` crate generates this (`#[nutype(sanitize(trim), validate(not_empty), derive(Debug, Clone, PartialEq))]`);
  adding it is a dependency decision (ADR).
- Model states as enums, data in the variant that owns it:
  `enum Slice { Draft{..}, InProgress{ started: Instant }, Done{ at: Instant } }`.
- Transitions are functions `fn advance(self, ev: Event) -> Result<Slice, TransitionError>`.
- Use `#[non_exhaustive]` on public enums that will grow.
- Parse at the boundary with `serde` into a raw DTO, then `TryFrom<Dto> for Domain`.
