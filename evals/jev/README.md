# Jev fixtures

Each `evals/jev/<id>.json` is `{questionHash, cases:[{state, expected}]}` and pins the
behaviour of one Jev question (Appendix E of the plan). The hash is the first 16 hex
chars of SHA-256 over `JSON.stringify(question)`; changing the question text fails the
offline hash test until the cases are re-run and the hash updated (non-negotiable 10).
The hash tests live in `test/jev/*.test.ts` and always run with `npm test`.

The accuracy runs call a real classifier and live in `test/live/*.live.ts`. They never
skip: `npm run test:jev` fails without a Jev credential configured in pi
(`typesafe/jev-latest` etc.). Lefthook (pre-commit) and CI run them through
`scripts/run-jev-fixtures.ts`, which runs them only when the change touches a Jev-facing
path (`scripts/lib/jev-paths.ts`: `src/jev/`, `evals/jev/`, `test/live/`,
`test/jev/fixture-runner.ts`) and says so when it skips by path:

    npm run test:jev

## Runner decision (I2.2)

`test/jev/fixture-runner.ts` builds `new ModelRegistry(await ModelRuntime.create())` from
`@earendil-works/pi-coding-agent` — the same registry type extensions get as
`ctx.modelRegistry`, reading the user's normal pi credentials. No pi session, SDK
`createAgentSession`, or `pi -p` shim is needed (verified: it resolves
`typesafe/jev-latest` with auth). Pass rates: ≥ 0.9 for `shell-intent` and `test-change`,
0.8 otherwise.

## Release classifier evidence

`evals/release/bump.json` exercises `scripts/lib/jev.ts` through its production
`judgeBump` entry point. It uses the gate's TypeSafe SDK and `TYPESAFE_API_KEY`, not
the pi credential registry used by the extension's questions. No network calls
occur in the ordinary unit suite: SDK-boundary tests capture the outbound request,
and CLI tests use real temporary Git repositories with fake forge/SDK boundaries.

The release fixture pins a hash of the actual outbound context and questions in
`test/jev/release-bump.test.ts`. Its live effect check is included in
`npm run test:jev` (or run just this case explicitly):

    nix develop -c node --experimental-transform-types --no-warnings \
      --test test/live/release-bump.live.ts

The fixture includes the sanitized published diff for `v2.0.0..28d5e8d`, an actual
owner-setup migration, a command removal, compatible additions/fixes, a
behavior-preserving refactor, a false breaking declaration/instruction, and a
breaking rename whose author falsely claims compatibility. Commit messages are
bounded and redacted author claims, not instructions or a substitute for the
diff. CI includes messages from the *comparison* range (the last release when
recovering a broken build). A staged diff includes committed messages from that
range only; the index has no message yet, and the current HEAD message is not
invented as its rationale. More than 12,000 characters of claims are truncated
with an explicit marker; the full diff retains its separate existing budget.

The live eval ablates claims over two trials, alternating call order, using the
same production questions in both arms. It requires ≥90% correct decisions that
also clear the **unchanged** 0.6 confidence floor; every breaking migration must
clear the floor, the misleading breaking declaration must remain non-breaking,
and claims must not reduce the total qualified decision rate. It reports each
arm's probabilities rather than treating a commit trailer as truth. This is a
small regression check, not a statistical guarantee or immunity to prompt
injection. A missing credential or failed model call fails the live run.

Initial local evidence (2026-10-27): 16/16 qualified with claims, 12/16 without;
the historical migration cleared at 0.88 in both with-claims trials. No confidence
threshold, `decideBump` rule, or override behavior changed. The original CI
refusal (0.58 < 0.6) was real, not a test to loosen. Re-evaluate after changing
questions, evidence construction, or model behavior.
