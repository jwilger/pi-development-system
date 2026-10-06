# Result pattern in TypeScript

```ts
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

- `E` is a closed union of `{ kind: "kebab-case-id"; ...data }` variants.
- Early return on failure: `if (!r.ok) return r;`.
- Never `catch` and return `false`; convert to a typed error with the cause as data.
- Throw only for the five Wlaschin exceptions, with a comment naming which.
- Guards and hooks must never throw into their host: return a safe decision instead.
