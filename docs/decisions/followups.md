# Follow-ups

Nits and deferred items from reviews (append only).

- I0 review r1 (nit): fake-pi types deviate compatibly from Appendix G (`commands` stores the options object, `selectResponses` allows `undefined`, `emit` is non-generic). Revisit if a later test needs the exact shape.
- I0 review r1 (nit): `test/extension.test.ts` uses `as never` for the before_agent_start event and command ctx; consider a typed event builder in the harness.
- I0 review r1 (nit): pi tolerance of empty/missing `skills/` and `prompts/` dirs not live-verified; `.gitkeep` files added so the dirs exist.

- CI publish race: two pushes sharing one package.json version within ~80 s make the second `Publish to npm` job fail with E409 ("Cannot publish over previously staged version") because `npm view` lags the first publish. Rerunning the failed job fixes it. Consider making `.github/workflows/publish.yml` treat E409 as already-published. (found at I0 release)

- I1 review r1 nits: tools use `exposure: "direct"` not plan's `"always"` (`"always"` is not in pi's `ToolExposure` union; `"direct"` is the correct value). Departure log paths use `ctx.cwd`, not a resolved repo root (revisit when I3 config loader finds the root). `appendDecision` exists-then-append is not atomic for concurrent first-of-month writes.

- I1 review r2 nits: a shell invoked with no `-c` (`echo "git push -f" | sh`, `bash <<< ...`, `xargs sh -c "git ..."`) classifies `ordinary`; route to `unknown` when I2 sends `unknown` to Jev. `alias.*`/`GIT_CONFIG_*` indirection is out of scope for the deterministic fast path.

## From I2 review round 2 (nits, unscheduled)

- `src/gates/test-guard.ts`: `deps.approvals.consume("tests.weaken", …)` can never succeed because `devsys_request_approval` only grants hard-tier gates; remove with the approvals dependency when I3 reworks gate plumbing.
- `rm -rf .`/`rm -rf src` and renames (`mv`, `git mv`) of tests are treated as deletions; directory targets are not scanned for contained tests.
- Test-path conventions miss `Test/`, `__test__`, `*Test.java`, `*Tests.cs`; profile `testGlobs` arrive with I4.
- Jev fixture "pins question text" checks are skipped unless `DEVSYS_JEV_FIXTURES=1`; make the hash check unconditional.
- `state.jev`/status line only refresh on session_start/session_tree; `JevOptions.now` is unused.
