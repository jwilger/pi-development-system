# GWT scenarios to failing tests (TypeScript)

An event-model slice lists Given/When/Then scenarios. Each is one test; no spec in the model without an
equivalent in code.

1. Name the test after the slice and scenario: `test("slice.signin.c01: SignIn after UserRegistered emits SignedIn", ...)`.
2. **Given** the listed events become the history the function receives (an array of event objects, with the `let` values filled in).
3. **When** the command is the input: call the pure decide function (`decide(history, command)`), not a handler with I/O.
4. **Then** events assert the returned events, `error` asserts the returned error `kind`, and `view` asserts the projection built from the events.
5. Run it and watch it fail before writing the decide or project function (RED), then make it pass.
6. A scenario with an empty `given` is a command against no history; keep it as its own test.

One failing test per scenario, one `test(...)` each, in `test/<area>/<slice>.test.ts`. Do not merge scenarios
into a table that hides which one failed. When code and model disagree, change the model first (the model is
the spec), then the test.
