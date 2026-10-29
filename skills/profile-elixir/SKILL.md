---
name: profile-elixir
description: Repository-aware Elixir and Phoenix idioms — tagged tuples, pattern matching, pure domain logic, ExUnit and appropriately scoped property/LiveView/browser tests. Use for Mix repositories (mix.exs), Elixir code, or Phoenix changes and reviews.
---

# Elixir profile

Apply universal test-first, functional-core, semantic-types, typed-errors and
behavior-test principles in Elixir's idioms, not Rust or TypeScript syntax.

## Repository authority comes first

Read local instructions, `mix.exs`, relevant code/tests, task runners and CI before
choosing commands or patterns. Preserve public contracts and repository conventions.
Use the repository's declared environment and exact commands (including Nix/just
wrappers) instead of substituting generic `mix` commands. Local commands are not
permission to bypass engineering safeguards or execute destructive operations.

Without a local override, conventional candidates are `mix test` and
`mix format --check-formatted`; inspect their suitability before running them.
Treat compiler warnings according to repository policy. Use warnings-as-errors,
Credo, Dialyzer, mutation tooling or other checks only when configured/relevant;
do not add tools or dependencies just to satisfy this profile. Report missing
or contradictory command authority rather than inventing a green result.

## Expected failures and business rules

- Use idiomatic `{:ok, value}` / `{:error, reason}` for expected domain failures,
  with pattern matching, `case`, and `with`. Match error variants deliberately.
  Preserve an existing public contract; do not mechanically wrap tuples in a
  Result class, copy Rust `Result` syntax, or invent branded TypeScript types.
- Exceptions are for exceptional faults and established bang APIs, not the
  default for expected invalid input. Do not swallow failures or turn them into
  success. Use typespecs and small domain types where they clarify actual meaning.
- Keep business decisions in a pure, directly testable domain core. Thin Phoenix
  controllers/LiveViews coordinate effects and render outcomes; do not bury rules
  in event handlers. Ecto schemas/changesets handle data boundaries and persistence
  constraints; they are not a reason to move every business rule into a schema.
- Follow the current module layout and context boundaries. Do not impose a new
  architecture, event sourcing, process/GenServer, directory tree or dependency.

## Verification proportional to behavior

Start with a failing public behavior test and observe RED before implementation.
Use ExUnit domain tests for business rules, boundary values and tagged errors.
Properties are useful for real invariants and generated edge cases when existing
repository tooling supports them; do not mandate a property library for every fix.

For a Phoenix UI change, cover domain behavior first and use LiveViewTest for
server-rendered events, navigation and feedback where appropriate. Use a real
browser when the changed acceptance behavior depends on JavaScript, browser APIs
or browser integration and the repository provides/authorizes that tooling.
A pure library change does not require LiveView or browser tests; a server-only
LiveView change does not automatically need a browser or new property dependency.

## Evidence stays honest

Distinguish selected commands, configured CI commands, and commands actually run.
Report the exact command, observed result and remaining coverage gaps. Synthetic
fixture commands are **NOT EXECUTED**: a typed plan or tool acknowledgement is not
proof of Mix, ExUnit, property, LiveView or browser verification. In an isolated
planning evaluation, inspect only supplied fixture evidence, submit one plan, and
never attempt filesystem, shell, forge or extension access.
