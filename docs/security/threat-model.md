# PR-topic publication repair: proportional threat model

## Assets and entry points

Protect PR-only trunk policy, Git history and the meaning of exact-bound semantic
review receipts. The model supplies a bash command; local owner-controlled
configuration supplies delivery mode, remote, trunk and optional architecture
authority, plus effective Git settings resolved across scopes, includes and
environment overrides. Other tool hooks execute after the architecture guard. No new network
client, credential handling, dependency or execution adapter is introduced.

## Threats, controls and evidence

| Applicable threat | Control | Production-session evidence |
| --- | --- | --- |
| A model presents destructive or compound publication as harmless transport | Only a standalone literal configured-remote `HEAD:TOPIC` form is eligible; no options, expansions, extra refs or arbitrary sources | `production PR-topic path refuses …` command matrix; fake transport remains untouched |
| A topic aliases trunk or architecture authority | Conservative bare branch syntax, explicit non-trunk comparison and exact remote-tracking authority agreement | Configured remote/trunk test, namespace-ambiguous trunk and conflicting authority tests |
| Effective Git settings add publication beyond the literal refspec | Read settings through the existing process boundary; require absent/false `push.followTags` and disabled/check-only recursion; explicit false/check push recursion overrides fallback, otherwise absent/false `submodule.recurse`; fail closed on invalid/unsupported values, read errors and timeouts without config/command mutation | Real Git boolean/include/environment cases and process-failure cases, explicit/absent authority, no transport/receipt on refusal; disposable dry runs demonstrate added annotated tag and cross-repository submodule refs |
| Inherited legacy `GIT_CONFIG` redirects setting queries while push still uses repository settings | Before setting queries, use the existing process boundary and required Node runtime to test only selector presence; refuse any inherited `GIT_CONFIG` (including empty) or failed/timed-out/indeterminate probe, without exposing its value, changing configuration or rewriting publication | Production sessions reproduce hidden follow-tags and push/fallback recursion with an empty alternate file; explicit/absent authority and safe-but-uncertain selector cases refuse without transport or receipt; ordinary local/include/`GIT_CONFIG_COUNT` paths remain supported |
| Signature display makes an ordinary signed commit look like a merge and bypass rationale | Machine-formatted `git log` disables signature display without changing owner config; preserve actual merge exemption and attribution checking | Verified SSH-signed `fix: tidy` with `log.showSignature=true` refuses rationale; signed rationale-bearing and genuine merge fixtures pass; signed attribution refuses |
| PR mode becomes a broad bypass of delivery policy | Only this guard abstains for the eligible topic; all subsequent guards remain registered | Trunk/local-only mode refusals and eligible-publication attribution/rationale refusals |
| Publication is misrepresented as reviewed final delivery | No inspection or semantic receipts created; existing trunk/merge/history admission retained | Persisted review state stays empty; trunk and opaque merge remain blocked; proposed tree-dropping squash is refused |
| Failed transport is represented as successful publication | Existing push result hook records success only | Success/failure tests assert `lastPushAt` behavior independently of absent review credit |
| A version-override prefix introduces an alternate index, shell expansion or compound action | Only one quoted nonempty, non-whitespace literal `JEV_OVERRIDE` before the unchanged literal commit; no other/multiple assignments, unquoted values, wrappers or interpolation/escapes in double quotes | SDK command matrix refuses hostile forms before transport; literal single-quoted shell metacharacters stay data |
| Override syntax is mistaken for owner approval or review credit | Prefix changes only the supported hook input; independent authorization and all commit checks remain required, including exact-tree structural and semantic inspection | SDK independent-review integration admits exact reviewed prefixed commits but refuses unrelated reviewers and changed trees; unpaired decision and absent review refuse with prefix |

The production-session tests use an offline model and fake transport, never a
remote push. Signed fixtures generate disposable local keys; no owner signing key
or credential is read or exposed. Effective-setting queries are read-only and
bounded by process timeouts; errors produce typed refusal, not raw diagnostic
exfiltration. They add local I/O and refusal/latency exposure but no new network
client or dependency. The configuration-source probe also uses the existing
required Node runtime through the same process adapter, with a five-second timeout
and no environment-value output. Its failure adds conservative availability/latency
cost, not an alternate execution path. A legacy selector is refused even if its
alternate file happens to match repository settings; absence from a redirected
file cannot prove the effective configuration used by push.

Disposable Git dry runs show why the settings checks are narrow: `push.default`
and `remote.<name>.push` are overridden by the explicit refspec; mirror mode
conflicts with it and fails. Follow-tags and on-demand/only submodule recursion do
add publication, including the `submodule.recurse=true` fallback. Explicit false
or check-only push recursion does not publish submodules and overrides that
fallback. No unrelated Git configuration restriction is introduced.

## Residual limits and ownership

The repair does not authenticate a forge, grant publication permission, establish
hosting branch protection or lock owner-controlled refs/configuration. Existing
outside-process races and unrecognized commands outside extension enforcement
remain limitations, not new bypass guarantees. Effective settings are observations,
not a lock between checking and execution. Remote URL/push-URL resolution and
executable hooks/transports remain owner-trusted, not authenticated or sandboxed
by this repair. These limits require owner trust
and separate publication authorization, not a fabricated receipt. Broader syntax
and remote merge support are deliberately deferred until their invariants can be
established. The configuration-source repair did not change the previously approved
substantive wording. Subsequently John approved the narrow version-override syntax
amendment to the same unmerged accepted decision and paired architecture/policy,
plus reviewed supported package replacement and normal reload before the signed
commit. This bootstrap does not patch installed files or disable live guards. The
version decision's approval is independent of command recognition; the rationale
string is not authenticated evidence. Fresh exact independent review remains
required for the amended tree; neither the earlier review nor installation grants
new review credit or proves delivery.
