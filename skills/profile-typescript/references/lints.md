# Lints for TypeScript

`tsconfig.json` compiler options: `"strict": true`, `"noUncheckedIndexedAccess": true`,
`"exactOptionalPropertyTypes": true`, `"noImplicitOverride": true`,
`"verbatimModuleSyntax": true`, `"noEmit": true`.

`biome.json`: enable `recommended` rules, plus `suspicious/noExplicitAny`,
`style/noNonNullAssertion`, `complexity/noExcessiveCognitiveComplexity` as errors.

- Run `tsc --noEmit` and `biome check .` in CI and the pre-commit hook.
- Suppressions: `// biome-ignore lint/<group>/<rule>: <reason of 15+ characters>`;
  prefer `@ts-expect-error: <reason>` over `@ts-ignore`.
- Do not widen `include`/`exclude` to hide failing files.
