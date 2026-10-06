### 2026-10-06T17:12:00Z · tdd.red-first · soft · agent
- **Default:** write a failing test before changing src/core/x.ts
- **Chosen:** edit first; the change is a pure rename with no behaviour change
- **Why:** Tidy-First structural change; existing tests cover behaviour
- **Cost if wrong:** a behavioural change slips through without a test
- **Scope:** slice `I4.3` · **Revisit when:** the rename touches a public signature
