# Jev fixtures

Each `evals/jev/<id>.json` is `{questionHash, cases:[{state, expected}]}` and pins the
behaviour of one Jev question (Appendix E of the plan). The hash is the first 16 hex
chars of SHA-256 over `JSON.stringify(question)`; changing the question text fails the
fixture test until the cases are re-run and the hash updated (non-negotiable 10).

Fixtures call a real classifier, so they run only with `DEVSYS_JEV_FIXTURES=1` and when a
Jev credential is configured in pi (`typesafe/jev-latest` etc.):

    DEVSYS_JEV_FIXTURES=1 npm test

## Runner decision (I2.2)

`test/jev/fixture-runner.ts` builds `new ModelRegistry(await ModelRuntime.create())` from
`@earendil-works/pi-coding-agent` — the same registry type extensions get as
`ctx.modelRegistry`, reading the user's normal pi credentials. No pi session, SDK
`createAgentSession`, or `pi -p` shim is needed (verified: it resolves
`typesafe/jev-latest` with auth). Pass rates: ≥ 0.9 for `shell-intent` and `test-change`,
0.8 otherwise.
