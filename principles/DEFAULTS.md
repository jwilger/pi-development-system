# Defaults (recommended; judgement allowed, departure recorded)

Follow these unless you have a grounded reason not to. If you depart, record
why (what / why / cost if wrong) with the departure tool before continuing.

- **RED first.** Write a failing test before behaviour changes. Why: it proves the test can fail.
- **Functional core, imperative shell.** Pure decisions, thin effects. Why: logic stays testable without the world.
- **Semantic types.** Parse at the boundary; illegal states unrepresentable. Why: the type is the proof.
- **Typed errors as values.** No stringly errors for expected failures. Why: callers can handle what they can name.
- **Structural and behavioural changes never share a commit.** Why: reviewable, revertable.
- **Artifact set sized to the work.** Brief, decisions, journeys, event model, lens review, ADR — only what the work needs. Why: planning is not the product.
- **Fresh-context review before commit.** Why: the author is the worst reviewer of their own diff.
- **Clean-streak review depth.** Three consecutive clean rounds before final delivery. Why: later rounds catch what earlier ones missed.
- **Scope stays what was asked.** Expansion from a finding is recorded. Why: scope is the steering wheel.
- **Lint suppression needs a rationale comment.** Why: a bare suppression is a hidden quality shortcut.
- **Model matches phase.** Stronger model to plan, review and advise; faster to implement. Why: cost where judgement is.
- **Threat model proportional to exposure.** Why: trust single owners, harden shared surfaces.
- **Keep context small.** Load skills lazily; one slice per clean context. Why: instruction following decays with context size.
- **Push at least hourly.** If an hour passes without a push, challenge whether the increment is too big. Why: small steps expose bad plans early.
- **Language-profile idioms** (Rust, TypeScript). Why: concrete idioms beat abstract principles for weaker models.
