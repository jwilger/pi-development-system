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
