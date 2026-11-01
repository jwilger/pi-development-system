# ADR 0019: Separate strict PR topic publication from final delivery admission

- **Status:** accepted

## Context

We support PR-only consumers that must publish a topic before requesting a
hosting review. Our architecture guard currently classifies every recognized
push as final trunk delivery and rejects even explicit topic publication. We need
a bounded publication path that preserves the consumer's PR-only policy rather
than requiring an override of a running guard. Local implementation and tests do
not establish delivery or acceptance.

The existing exact HEAD-to-configured-trunk admission and prospective history
inspection remain necessary. A push parser's exposure summary is insufficient for
admission: it discards details such as a force prefix and cannot prove the literal
transport command or its resulting history. Literal syntax alone also does not
rule out Git's implicit publication settings: `push.followTags=true` can add
annotated tags, and submodule recursion can publish into other repositories.
Signature display in machine-formatted logs can corrupt parent parsing and
incorrectly exempt ordinary signed commits from rationale checking. These are
acceptance gaps in the retained no-extra-publication and message-guard contract,
not separate features.

During premerge verification the existing version checker required a minor bump
and then returned unresolved classification uncertainty. John approved 11.1.0
through its supported override, but the guard refused the required literal
`JEV_OVERRIDE` prefix before the normal commit hooks could run. This concrete
compatibility failure justifies a narrowly scoped syntax amendment, not a general
environment or verification bypass. The installed guard must be replaced through
Pi's supported package lifecycle and normally reloaded before the reviewed source
can admit that command; editing the checkout alone does not replace live hooks.

## Decision

We separate a strictly bounded PR topic publication from final delivery admission
in the existing architecture guard. Admit only a standalone literal
`git push REMOTE HEAD:TOPIC`, with no additional options or shell syntax, when
`delivery.mode` is `pull-request`, REMOTE is the configured remote, and TOPIC is an
explicit bare branch different from the configured trunk. Require conservative
unambiguous branch syntax for both trunk and topic. Ref namespaces, symbolic HEAD,
invalid path components and dynamic refs are not topic destinations. If explicit
architecture authority exists it must equal the configured remote-tracking trunk;
conflicting or differently represented authority fails closed.

We read effective Git configuration through the existing thin process boundary,
including inherited configuration, includes and environment overrides. We require
`push.followTags` to be absent or false, using Git's boolean conversion rather
than interpreting raw strings ourselves. We also require non-publishing submodule
behavior: explicit `push.recurseSubmodules` false or `check` is admissible and
overrides the fallback; when absent, `submodule.recurse` must be absent or false.
Publishing recursion modes and unsupported values are refused. Invalid values,
process/read failures, timeouts and indeterminate output fail closed with a typed
`architecture-publication-config` refusal. We neither change owner configuration
nor rewrite the literal command to suppress its effects.

This path abstains only from architecture delivery inspection for that publication.
It creates no semantic review receipt, delivery binding or resulting-history
approval. Other Git and push guards still run, including rationale and attribution
checks. We disable signature display only in machine-formatted message logs so
parent fields cannot be polluted; signed ordinary commits still need rationale,
merge exemption remains intentional and attribution remains forbidden for both.
Owner authorization for publication remains separate. No publication command is
executed or rewritten by this admission path; configuration queries are read-only
and no dependency is added.

We additionally admit exactly one optional `JEV_OVERRIDE` assignment before the
otherwise unchanged plain literal-message `git commit -m` or `--message` form.
The value must be quoted, nonempty and not whitespace-only. Single-quoted content
is literal data; double-quoted content must contain no expansion or escape syntax.
Unquoted values, other or multiple assignments, `env` wrappers, compound commands,
implicit staging and alternate directories/indices remain refused. This supports
the version checker's existing input; the prefix does not establish owner approval
or authorize any override. Required authorization must exist independently.

We keep final trunk admission, local-only policy, commit inspection and history
bindings, source/resulting squash checks, stale evidence checks, other commit hooks
and opaque remote PR merge refusal unchanged. The prefixed commit requires the
same structural inspection and exact-bound independent staged-tree review as the
unprefixed form. All other recognized non-dry-run push shapes remain refused.

## Consequences

### Positive

- PR-only consumers can publish a topic without switching delivery policy or
  manufacturing final-delivery evidence.
- Literal admission has a small auditable surface and cannot inherit the broader
  exposure parser's loss of force, source or namespace information.
- Production-session tests can prove transport eligibility, downstream refusal,
  absent review credit and continued trunk/merge/resulting-history restrictions.
- Effective-config refusal prevents literal syntax from silently admitting tags
  or cross-repository submodule publication, even without architecture authority.
- An independently authorized existing version override can reach ordinary commit
  hooks without broadening environment syntax or losing exact-tree review.

### Negative

- Convenient forms such as `-u`, quoted refs, implicit destinations and alternate
  directories remain unsupported. Callers must use the explicit literal form.
- Override recognition is not authorization. The narrow syntax is intentionally
  not a general shell parser; approval and the ordinary hook checks remain needed.
  Bootstrapping this guard repair requires reviewed supported package replacement
  and normal reload before committing, with the final tree rechecked afterward.
- Topic publication is not architecture approval. A topic may contain changes
  that must be repaired before separately reviewed final delivery.
- An enabling setting is refused even when the current repository has no eligible
  annotated tag or submodule. We do not broaden admission by inventorying which
  extra refs happen to be publishable at one instant.
- Local refs/configuration remain owner-controlled trust inputs; this does not
  authenticate hosting configuration or prevent concurrent external changes.
- The extension does not grant publication permission, enforce hosting protection
  settings or control commands outside its recognized tool boundary.

## Effective configuration reasoning

Disposable-repository dry runs confirm that the explicit refspec overrides
`push.default` and `remote.<name>.push`, whereas `remote.<name>.mirror=true`
conflicts with it and Git fails before publication. We therefore add no speculative
restriction on those settings. In contrast, follow-tags adds a reachable annotated
tag, and `push.recurseSubmodules=on-demand` or `only` can publish the topic into a
submodule repository; absent push recursion inherits on-demand behavior from
`submodule.recurse=true`. Explicit false disables that fallback; `check` only
checks availability and does not publish submodules. The added restrictions are
therefore concrete enforcement of this same no-extra-publication boundary.
Remote URLs, push URLs, executable hooks and transports remain owner-trusted
configuration, not a newly authenticated or sandboxed execution surface.

## Alternatives

- **Skip the architecture guard for all PR-mode pushes** — Rejected because this
  also admits trunk, forced, ambiguous and uninspected-source publication.
- **Change the consumer to trunk mode or override the running guard** — Rejected
  because the consumer retains authority over its PR-only delivery policy.
- **Treat topic publication as reviewed delivery** — Rejected because no immutable
  hosting result is established; receipts would falsely certify final history.
- **Broaden the parser or support general push syntax now** — Rejected because a
  bounded transport predicate repairs the bug without weakening existing exposure
  analysis or introducing a larger shell/refspec authorization surface.
- **Ignore effective settings or silently add suppressing options** — Rejected
  because the first can publish extra refs and the second executes a different
  command than the admitted literal. Changing owner Git configuration is not a
  repair of this admission contract either.
- **Allow arbitrary environment prefixes or bypass the running guard** — Rejected
  because an alternate index or Git configuration could invalidate inspection.
  The concrete supported version input justifies only one literal assignment;
  direct installed-file edits, disabled hooks and wrapper processes are not repairs.
- **Permit opaque `gh pr merge` after publication** — Rejected because publication
  cannot establish the hosting operation's immutable resulting history.

The [proportional threat model](../security/threat-model.md) records the command,
authority and receipt-confusion risks and their production-session controls.

## Revisit when

We revisit richer publication syntax only when a concrete consumer workflow cannot
use the explicit literal form and a tested parser can prove the same remote,
source, destination and non-destructive invariants without shell ambiguity.
We revisit other commit prefixes only for a concrete supported hook input with
independent authorization and tests proving unchanged tree/history/review binding;
convenience or classifier uncertainty alone does not justify broader shell syntax.
We revisit remote merge admission only when a supported hosting protocol supplies an
immutable result that can be inspected, independently reviewed and bound to the
actual executed operation. Neither convenience nor a successful topic push alone
changes the reasons these alternatives were rejected.
