---
name: typed-errors
description: Errors as values - expected failures are returned as typed results with stable kebab-case ids, not thrown; exceptions are for bugs. Use when writing a function that can fail, designing an error type, or choosing between returning a Result and throwing.
---

# Typed errors

Failures the caller should handle are part of the function's type. They travel as
values; they are never strings, never `null` standing for "something went wrong".

## Rules

- **Expected failure -> result.** `Result<T, E>` (or `T | ParseError`) where `E` is a
  union of named variants with data the caller can act on.
- **Stable ids.** Each variant has a kebab-case `kind` (`config-error`, `no-model`,
  `timeout`) that tests and logs can match on. The human message is separate.
- **One error type per module boundary**, a closed union. Wrapping a lower layer's
  error keeps the cause as data.
- **Compose with early returns** (`if (!r.ok) return r`), not nested callbacks.
- **Never swallow.** Handle it, return it, or record why ignoring it is safe.

## When to throw anyway (Wlaschin's five exceptions)

Do not use `Result` when:

1. you need **diagnostics** (a stack trace beats a "glorified boolean");
2. you would be **reinventing exceptions** for truly exceptional conditions;
3. you need to **fail fast** because continuing would corrupt state;
4. **nobody will see** the error (it cannot be surfaced anywhere);
5. **nobody cares** (best-effort cleanup).

If you throw, name which of the five applies in a comment. If none applies, return a value.

## Do not

- Do not throw for expected bad input (a malformed file, a missing option). The caller
  cannot see it in the type and will forget to handle it.
- Do not catch and return a bare `false`/`undefined`; the reason is lost.
- Do not use error message text as the contract. Match on `kind`.
- Do not let a guard or hook crash its host: parse defensively and return a safe
  decision (fail closed or ask) rather than throw.

## Checklist

- [ ] Each fallible function returns a result with a closed error union
- [ ] Every error variant has a stable kebab-case `kind`
- [ ] No expected failure is thrown; each `throw` names its exception
- [ ] No error is swallowed without a stated reason
