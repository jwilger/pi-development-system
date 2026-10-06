# Follow-ups

Nits and deferred items from reviews (append only).

- I0 review r1 (nit): fake-pi types deviate compatibly from Appendix G (`commands` stores the options object, `selectResponses` allows `undefined`, `emit` is non-generic). Revisit if a later test needs the exact shape.
- I0 review r1 (nit): `test/extension.test.ts` uses `as never` for the before_agent_start event and command ctx; consider a typed event builder in the harness.
- I0 review r1 (nit): pi tolerance of empty/missing `skills/` and `prompts/` dirs not live-verified; `.gitkeep` files added so the dirs exist.
