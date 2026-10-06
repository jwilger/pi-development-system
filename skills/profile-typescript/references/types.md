# Semantic types in TypeScript

```ts
export type GateId = string & { readonly __brand: "GateId" };
const GATE_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;

export type ParseError = { readonly kind: "parse-error"; readonly message: string };

/** The one place the brand is asserted: after the regex has proven the shape. */
export function parseGateId(input: string): GateId | ParseError {
  return GATE_ID.test(input)
    ? (input as GateId)
    : { kind: "parse-error", message: `invalid gate id "${input}"` };
}
```

- Parse `unknown` JSON with a hand-written parser (or a schema lib *if* an ADR adopted one);
  never `JSON.parse(x) as Foo`.
- Unions over optionals: `type Slice = { kind: "draft" } | { kind: "started"; at: string }`.
- Exhaustiveness: `default: { const _: never = value; return _; }`.
- Use `readonly` and `ReadonlyArray` in public types.
