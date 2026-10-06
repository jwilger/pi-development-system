# Decision log

`YYYY-MM.md` files record departures from defaults and approvals for
non-negotiables. ADRs for architecture-shaping decisions live in `docs/adr/`.
Nits from reviews go to `followups.md`.

Entry format:

```markdown
### 2026-10-06T17:12:00Z · tdd.red-first · soft · agent
- **Default:** write a failing test before changing src/core/x.ts
- **Chosen:** edit first; the change is a pure rename with no behaviour change
- **Why:** Tidy-First structural change; existing tests cover behaviour
- **Cost if wrong:** a behavioural change slips through without a test
- **Scope:** slice `I4.3` · **Revisit when:** the rename touches a public signature
```

Hard-stop approvals use the same shape with `hard · user` and `Scope: once (<tool call id>)`.

## Dogfooding

From I1 onward, departures from the implementation plan are recorded with the
`devsys_record_departure` tool (soft gates) and approvals with
`devsys_request_approval` (hard stops), not by hand-editing this log. Hand-written
entries before I1 (for example `plan.interface-deviation`) predate the tool.
