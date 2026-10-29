# Upstream adoption acceptance map

This maps the approved revision 0.2 outcomes to shipped source and retained evidence. It is an upstream
handoff, not a claim that Simulac or another application has been modified or verified. Candidate
6.1.0 still needs its final independent review and actual release checks; local closure is not delivery.

| Outcome | Implementation and evidence |
| --- | --- |
| Repository-owned workflow discovery and transport | `skills/project-workflow/SKILL.md`, `src/state/local-guidance.ts`, `test/context/workflow-guidance.test.ts`, `evals/guidance/README.md` |
| Optional raw GitHub Project primitives | `src/tracker/github-project*.ts`, `src/tracker/github-assignment.ts`, `test/tracker/project*.test.ts`, `test/tracker/assignment.test.ts` |
| Fresh-context local review concerns and stale-input refusal | `src/review/review-tools.ts`, `src/review/submit-tool.ts`, `src/gates/commit-guard.ts`, `test/review/local-guidance.test.ts`, `evals/review/README.md` |
| Idiomatic Elixir/Phoenix profile | `skills/profile-elixir/SKILL.md`, profile/session tests, `evals/elixir/README.md` |
| Resumable PR evidence and explicit whole-scope completion | `src/state/delivery-manifest.ts`, `src/tracker/github-delivery.ts`, `src/tracker/github-completion.ts`, delivery/completion/manifest tests |
| Local closure distinct from delivery | `src/planning/slice-close.ts`, `test/planning/slice-close.test.ts`, delivery-discipline skill and actual-SDK adoption tests |
| Contrasting workflows without upstream code changes | [Product PR policy](../examples/product-pr/workflow.md), [research local-only policy](../examples/research-local/workflow.md), [finite effect evidence](../../evals/adoption/README.md) |
| Bounded downstream handoff | [Simulac pilot recipe](simulac.md) |

## Verification and truthful limits

Main integration observed the new public tests fail before delivery modules/actions were installed,
then pass through actual public interfaces. After independent-review pathspec hardening, main passed 2,049 offline tests with
zero failures/skips, plus typecheck, lint, Knip and Markdown checks. Worker-only historical results
are separately labeled in `docs/plan/delivery-tracking.md`; they are not substituted for main checks.
The final committed diff must independently satisfy the normal hooks, review and actual CI/release
checks before any published-delivery claim.

Model-visible guidance has actual isolated SDK evidence, not Markdown-presence assertions. Historical
failures remain intact: review scorer corrections used offline reassessment of unchanged traces;
Elixir retains two format failures and two explicit one-shot protocol-correction observations; the
adoption suite retains its failed product baseline. All three adoption guidance cells passed before the
review's literal-pathspec hardening; the current exact external-read protocol is covered offline, not
by newly rerun model cells. The original runner bytes and hashes are archived. No
statistical uplift, universal obedience or general harmlessness guarantee is claimed.

No live GitHub mutation, GitHub Enterprise smoke test, downstream migration, real Mix/ExUnit/LiveView
run or browser rendering was performed for this upstream handoff. Synthetic application commands
were **NOT EXECUTED**. Owner-specific manual/product/deployment requirements stay unknown rather than
becoming mechanically satisfied conditions. PR/check/issue observations can race; uncertain effects
require a fresh read and explicit retry decision, never automatic rollback or retry.

## Authority and migration

- Repository files own actual workflow vocabulary, eligibility, order, blocking, assignment meaning,
  review concerns and completion policy. API order is not priority; assignment is not an atomic claim.
- Issues-only and repository-file use do not require a Project. There is no implicit schema, label,
  membership, permission, ordering or terminal-state provisioning.
- Existing `gh` authority must permit the explicitly selected reads and writes: Issue assignment/close
  needs Issue-write permission; Project enrollment/field changes need Project-write permission.
  Exact scopes and organization access depend on the owner's token or app configuration. Access
  errors, redaction and missing metadata are not permission to widen access automatically.
- Track configured guidance and manifests explicitly. Manifests contain versioned PR references and
  manual requirements, not cached success or hidden machine-local workflow state. Confirm whole scope
  separately; one slice or PR never silently completes the issue.
- Start downstream with one owner-selected issue, read-only discovery, explicit migration authority
  and a recovery/escalation contact. Preserve the application's own commands, dependencies and gates.

Accepted ADRs 0011–0014 remain the ownership, input-identity, persistence and bounded-execution
boundaries. No scheduler, continuous worker, workflow DSL, stall framework, universal merge/claim
policy or generic CI orchestrator is added.
