# GWT scenarios to failing tests (Rust)

An event-model slice lists Given/When/Then scenarios. Each is one test; no spec in the model without an
equivalent in code.

1. Name the test after the slice and scenario: `fn signin_after_registration_emits_signed_in()`, in a module named for the slice.
2. **Given** the listed events become the history slice passed to the decide function (`&[Event]`, with the `let` values filled in).
3. **When** the command is the input: call the pure `decide(&history, command)`, not a handler with I/O.
4. **Then** events assert the returned `Vec<Event>`, `error` asserts the returned error variant (`matches!`), and `view` asserts the projection folded from the events.
5. Run it and watch it fail before writing `decide` or the projection (RED), then make it pass.
6. A scenario with an empty `given` is a command against no history; keep it as its own test.

One failing `#[test]` per scenario. Do not loop over scenarios in one test, which hides which one failed.
When code and model disagree, change the model first (the model is the spec), then the test.
