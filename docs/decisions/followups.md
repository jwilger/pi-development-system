# Follow-ups

Nits and deferred items from reviews (append only).

- I0 review r1 (nit): fake-pi types deviate compatibly from Appendix G (`commands` stores the options object, `selectResponses` allows `undefined`, `emit` is non-generic). Revisit if a later test needs the exact shape.
- I0 review r1 (nit): `test/extension.test.ts` uses `as never` for the before_agent_start event and command ctx; consider a typed event builder in the harness.
- I0 review r1 (nit): pi tolerance of empty/missing `skills/` and `prompts/` dirs not live-verified; `.gitkeep` files added so the dirs exist.

- CI publish race: two pushes sharing one package.json version within ~80 s make the second `Publish to npm` job fail with E409 ("Cannot publish over previously staged version") because `npm view` lags the first publish. Rerunning the failed job fixes it. Consider making `.github/workflows/publish.yml` treat E409 as already-published. (found at I0 release)

- I1 review r1 nits: tools use `exposure: "direct"` not plan's `"always"` (`"always"` is not in pi's `ToolExposure` union; `"direct"` is the correct value). Departure log paths use `ctx.cwd`, not a resolved repo root (revisit when I3 config loader finds the root). `appendDecision` exists-then-append is not atomic for concurrent first-of-month writes.
