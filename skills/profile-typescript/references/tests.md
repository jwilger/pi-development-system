# Tests in TypeScript

- Runner: `node --test "test/**/*.test.ts"` (Node strips types) or vitest if the repo already uses it.
- Layout mirrors `src/`: `test/core/foo.test.ts` for `src/core/foo.ts`.
- Pure core: table tests with `node:assert/strict`.
- Shell/adapters: inject the outside world (an `exec` function, a clock, a UI) and assert effects.
- Test names are sentences about behaviour.
- `npm test` / `node --test` is the RED/GREEN signal the extension watches.
- Do not `.skip`/`.only` and commit; the `tests.weaken` gate will ask for a departure.
