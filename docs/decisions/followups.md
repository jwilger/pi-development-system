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

## From I2 review round 3 (nits, unscheduled)

- Shell mutations that are not statically visible stay best-effort: `find … | xargs rm`, `for f in …; do rm "$f"`, subshell `cd` leaks, `cd -`.
- In-place shell rewrites (`sed -i`, `tee`, `cat > f`) of a test file are judged by Jev only; with Jev offline they are allowed (no deterministic signal exists without the new content).
- Jev offline is not short-circuited: each judged test edit can wait up to the 15 s timeout.

## From I2 review round 4 (nits, unscheduled)

- Heredoc bodies are parsed as shell, so `cat > NOTES.md <<'EOF'\nrm test/a.test.ts\nEOF` reads as a removal (reuse `heredocDelimiter` from `src/core/git-intent.ts`).
- `recentFailure` is never passed to `judgeTestChange`, so the Jev gate-gaming hard stop rarely fires on its own; capture the last failing check output in I3/I7.
- Jev cache key omits the resolved model (`src/jev/client.ts` `hashOf`).
- `applyEdits` applies edits sequentially while pi matches each `oldText` against the original file.
- `mv a b/` without a trailing slash still flags `b`.

## From I2 review round 5 (nits, unscheduled)

- Remaining skip-marker gaps: `xcontext(`/`xspecify(`, Ruby minitest `skip "…"`, `@DisabledOnOs`; bare `fit(model)` still reads as a focused test.
- Not parsed: `perl -pi -e`, `patch`, `git apply`, `python -c` rewrites; `$VAR` paths resolve to empty.
- Redaction does not cover unquoted `password: x`, `AKIA…` or JWTs.
- Go `testing.Short()` + `t.Skip` guards are flagged (goes via departure flow).

## From I2 review round 6 (nits, unscheduled)

- Missed skip markers: vitest `it.skipIf(`, `test.fixme(`, C# `[Ignore]`/`[Fact(Skip=…)]`, Python `@skip(`.
- `rm -rf dist/test`, `node_modules/pkg/test` and paths outside the repo (`/tmp/x.test.ts`) count as test paths.
- `src/jev/client.ts`: a cache hit does not update `availability`.
- `test/jev/fixture-runner.ts` casts parsed JSON `as Fixture` without a parse function.

## From I2 review round 7 (nits, unscheduled)

- `src/core/redact.ts` patterns are quadratic on huge unbroken `\w` runs (100k chars ≈ 9s); clip before redacting.
- More skip markers: `test.concurrent.skip`, PHPUnit `markTestSkipped(`, ExUnit `@tag :skip`.
- `echo a#b; rm …` (shell-quote reads `a#b` as a comment) and `pushd` are not tracked.
- `rm -rf tests/tmp/*` and `: > tests/__init__.py` are read as test deletions (Jev cannot clear them; a departure can).
- `judgeShellIntent` sends the full command to Jev unclipped.

## From I2 review round 8 (clean; nits, unscheduled)

- `findTargets`: exclusion predicates (`! -path`, `-not -path`, `-prune`) are collected as deletion targets.
- `echo -n > f` and `cat /dev/null > f` empty a test file but are classed `overwrite` (Jev-only).
- `splitLines` (test-weakening): apostrophe in an unquoted heredoc body desyncs quote tracking; reuse `heredocDelimiter`.
- `git-intent` `substitutions` recursion is ~2^depth for nested `$(`; cap depth and treat deeper as `unknown`.
- `registerGitGuard` doc says absent `jev` = deterministic only, but `unknown` still confirms/blocks with a "Jev not confident" message.
- Skip markers: `it.todo`, RSpec `pending(`, `pytest.importorskip(`, `raise unittest.SkipTest`; unmatched-edit `addsSkip` compares only against whole-file count.

## From I3 review round 1 (unscheduled)

- `runModelsCommand --check` returns `ok:false`, but the command handler only notifies; `/devsys-status` does not run the check.
- `config.jev.*` and `models.jev` are parsed and validated but not yet used by `createJevHolder` (still `DEFAULT_JEV_CANDIDATES`, 15 s).
- While the run for a fix push is pending, any other push is allowed (status `pending` is not red); non-negotiable 4 is only enforced once CI reports red.
- `git -C ../x push` evaluates the current branch in the guard's cwd, not `../x`.

## From I3 review round 2 (unscheduled)

- `src/core/push-command.ts`: redirect operands (`2>&1`) become positionals; harmless today.
- `src/core/models.ts`: four-digit MMDD snapshot suffixes (`gpt-3.5-turbo-0125`) rank as versions.
- `upsertModelsTable` drops comments between `[models]` and the next header.
- `loadConfig(ctx.cwd)` ignores a repo-root policy when pi starts in a subdirectory.
- Commit guard's Jev diff is `git diff HEAD`; unstaged files in `git add -A && git commit` are not seen.
- "If an hour passes without a push" is in the skill but nothing reads `lastPushAt` yet (I7 cadence).

## From I3 review round 3 (unscheduled)

- Command-wide AI-trailer scan hard-stops prose that merely mentions `Co-Authored-By:` or "generated with the OpenAI SDK"; reword to proceed. Consider anchoring to line start/quote.
- `findForbiddenTrailers(message, extraKeys)` has no config field yet (I3.2 "configurable list").

## From I3 review round 4 (unscheduled)

- `lastPushAt` is recorded when a bash command exits 0 even if the push inside failed (`git push; echo done`).
- `Assisted-by:` style trailers are not forbidden (configurable key list still unwired).

## From I3 review round 5 (unscheduled)

- `git push -u origin $(git branch --show-current)` / `$BRANCH` count as all-branches and false-stop on feature branches in pull-request mode.
- `git switch -c feat && git push -u origin HEAD` reads the branch before the chained switch runs.
- `/devsys-models` Esc on a slot select is treated as accept.
- `routing` table keys are not validated.

## From I3 review round 6 (unscheduled)

- `/devsys-ci` expects HEAD's sha; on an unpushed or feature-branch HEAD the trunk run never matches and polling runs its full budget (pull-request mode).
- `withoutComments` drops body lines starting with `#` (`#123 …`) that `git commit -m` would keep.

## From I3 review round 7 (unscheduled)

- A once-scoped departure for a commit is spent before the chained push guard runs (`git commit … && git push` in pull-request mode).
- `Exec` drops pi's `killed` flag: a timed-out command reads as success with partial output.

## From I3 review round 8 (unscheduled)

- redact.ts unquoted-secret pattern over-redacts prose (`monkey: patch`) and TS (`key: string,`).
- Heredoc delimiter class rejects `COMMIT-MSG`; an indented terminator is accepted on a non-`<<-` heredoc.
- `cat > f <<EOF … && git commit -F f` reads a stale `f`; `-F ~/x` and `-F` after `cd` resolve against ctx.cwd (fails closed).
- `pushesTrunk` ignores the remote: `git push fork main` hard-stops in pull-request mode.
- `THINKING_LEVELS` lacks `max` (plan I5.2 lists it) — add when routing needs it.
- `chooseSlot` in models-command accumulates duplicate pins on repeated runs.

## From I3 review round 9 (unscheduled)

- `hasRationaleBody("feat: a\n\nChanges:\n- a.ts\n- b.ts")` is true (a short `…:` header defeats isTerseList); Jev catches it online.
- `OPAQUE_VALUE` treats a single-quoted body starting with a backtick as a substitution (tokenizer drops quote style); heredoc form unaffected.

## From I3 review round 11 (CLEAN; unscheduled nits)

- `bash <<EOF … git push … EOF`, `… | bash` are not resolved as scripts (guards see nothing).
- `printf … | git commit -F -` without a heredoc is read as an unreadable file named `-` (fails closed).
- ~25 levels of `$(` nesting overflow the stack in `resolveGit`; add a depth cap.
- `segments()` pops a real digit before `>` (`git log -n 5 > out`); no effect on commit/push detection.
- `findForbiddenTrailerKeys` signed-off-by branch scans the rest of the line (`ai-branch` can match).

## CI version gate flake on 1aa1d6f (I3)

The semantic-version gate in CI reported Jev confidence 0.47–0.50 for the patch bump of 1aa1d6f (a small fix across code, skill and docs) although the local hook accepted it at 0.88. The change is a patch; the next commit on trunk carries the publish. Consider making the local hook and CI agree on the diff Jev sees.

## From I4 review round 1 (nits; unscheduled)

- `red-first-guard`: plan says "no failing test observed since the last source edit"; code only checks the last test run (documented in `skills/tdd-canon`). Consider resetting on source edit if agents abuse one RED for many edits.
- `lint-suppression`: marker patterns match text outside comments (`/@ts-ignore/` in a regex literal, in a string); block-form `{/* biome-ignore … */}` is not detected; any neighbouring ≥15-char comment line (e.g. Rust `///` docs) counts as a reason.
- `test-runner`: misses `pnpm -r test`, `pnpm exec vitest`, `pnpm vitest`, `make test`, `uv run pytest`, `bash -c 'npm test'`; `node build.js --test` matches wrongly. A miss costs one extra departure per slice.
- `profile`: an invalid `[profiles] override` silently falls back to detection; tell the user.
- Profile detection uses `ctx.cwd`, not the repo root, so a session started in a subdirectory finds no profile.

## From I4 review rounds 2–3 (nits; unscheduled)

- `TOOL_CONFIG` classes any `*.config.ts` (even `src/app.config.ts`) as config; `*.test-d.ts` and `test-utils/**` are source; `.vue/.svelte/.astro` fall into `other` (never guarded).
- `parseProfileList`: an unknown persisted profile name rejects the whole state (matters on version rollback).
- Whole-file write exemption in `red-first-guard` counts markers only, so moving an existing test marker while editing production code passes.

## From I4 review round 4 (nits; unscheduled)

- A once-scoped departure is consumed by the first guard that allows an edit even if a later guard blocks it (same class as I3 round 7).
- `tdd.red-first` is dormant in real sessions until I8.3 (`/devsys-start`) sets phase `implementing`; mention in release notes.
- `conftest.py` and `__mocks__/*` classify as source.

## From I4 review round 5 (nits; unscheduled)

- `pytest --collect-only`, `jest --listTests`, `go test -list`, `vitest list` count as test runs; `npm -s test`, `npm run -s test`, `npx --no-install vitest`, `yarn test:unit` are missed.
- A timed-out or aborted test run (`isError`) is recorded as exit 1, i.e. RED.
- `refreshProfiles` runs only on session events; a `Cargo.toml`/`package.json` created mid-session appears later.

## From I4 review round 7 (CLEAN; unscheduled nits)

- Hand-wrapped `#[allow(clippy::a,\n reason = "…")]` (content on the first line) is flagged; widen the first-line test in `reasonOf`.
- `DIRECT_RUNNERS` includes `tap`, which matches `brew tap`.
- `npm test` in a repo with no test script (exit 1, "Missing script") is recorded as RED.
- Production items placed after an inline test module count as test edits (`insideTestModule`).

## From I5 review round 1 (nits)

- `src/state/config.ts` `[routing]` keys are not validated (only values): a typo like `"complex/hgh"` silently falls to the implementer fallback.
- `src/jev/questions/route.ts` `clip` redacts the first `2*max` chars then cuts to `max`; a secret straddling the `2*max` boundary could leave a partial prefix.
- Agents claiming "read-only" (reviewer, lenses, advisor) still have `bash`; `test/agents/agents.test.ts` only checks `edit`/`write` are absent.
- `docs/subagents/custom-agents.md` links to a `settings.md` that was not vendored (verbatim upstream).

## From I6 review round 1

- tests `test/gates/commit-guard.test.ts` — the fake exec answers every git call alike, so the gate and tools digesting the same range is pinned by `snapshotDiff` being shared, not by a call-level assertion.
- correctness `src/gates/commit-guard.ts` — in a repo with no commits `git diff HEAD` fails, so the digest is "unknown" and the gate needs a departure; `devsys_review_start` fails the same way.
- api-contract plan I6.3 — review state lives inside the `devsys-state` entry rather than a separate `devsys-review` entry.

## From I6 review round 2

- tooling pi-lens flags `src/core/review-packet.ts` dynamic `RegExp` (L14/L21) as ReDoS: checked, the patterns are built only from literal section names and a constant separator, never from packet text. `parseReviewPacket` complexity 15 is a style warning; split if it grows.
- tooling pi-lens `no-sort-without-comparator` on `src/review/digest.ts` is intentional: a plain string sort over `path\0digest` lines keeps the digest deterministic.
- tooling pi-lens MD041 on `agents/reviewer.md` and `prompts/devsys-review.md` is intentional (no H1 in prompt files). Decide in I7 which pi-lens findings become gates.
- robustness pi exec resolves `code ?? 0` after a timeout kill, so a `git diff` slower than 15s would be digested truncated; revisit if large repos hit it.

## From I6 review round 3

- correctness `src/review/digest.ts` — `ls-files --others` is relative to cwd and limited to it, while `git diff` is repo-wide; only matters when pi runs from a subdirectory (config and followups already assume the project root).

## From I6 review round 4

- usability `git add -p` hunk-level commit-in-parts is blocked by the staged-then-edited check with advice ("stage it again") that does not fit; a departure clears it. Revisit if it bites.
- robustness a timed-out git call now reads as failure (`timeoutAsFailure`, 124) in every guard that uses the extension's exec; case-insensitive filesystems and `git stash` were not probed.

## From I6 review round 5

- robustness a git process killed from outside (OOM) still reads as exit 0 through pi's exec; documented in `src/core/exec.ts`, not detectable.
- usability `git add -p` partial staging shows the "edited after git add / only partly staged" message; a departure clears it.

## From I6 review round 6

- correctness a `git add` run inside a `$(…)` on the commit's own line is ordered after the commit by `resolveGit`; this only causes extra blocks, never a bypass.

## From I6 review round 7

- security the commit gate judges the tree as it is before the command runs: a command that edits files or `git add -f`s an ignored file and commits in the same line lands unreviewed. Inherent to a pre-command hook; not parsed.
- correctness embedded-repo gitlinks are excluded from the digest, so a moved nested HEAD passes.
