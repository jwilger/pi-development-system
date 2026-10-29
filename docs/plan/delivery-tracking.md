# Delivery tracking — integrated S13–S15

Approved adoption revision 0.2 and ADR0013; consolidate preserved assessment/reader work into a usable increment under ADR0014. Repository policy remains authoritative; no downstream operations.

## DLV — Observe, resume and explicitly complete work

**Goal:** A fresh public tool instance reads a tracked two-PR manifest, refuses whole-issue completion while one required PR is open, then closes only after fresh configured evidence and explicit full-scope confirmation. Local slice closure is not issue delivery.

**Files:** src/tracker/delivery-assessment.ts, src/tracker/github-delivery.ts, src/tracker/github-completion.ts, src/tracker/types.ts, src/tracker/github.ts, src/tracker/work-item-tool.ts, src/state/delivery-manifest.ts, src/state/config.ts, test/tracker/delivery-assessment.test.ts, test/tracker/delivery.test.ts, test/tracker/completion.test.ts, test/tracker/project.test.ts, test/state/delivery-manifest.test.ts, test/state/config.test.ts, docs/plan/delivery-tracking.md, docs/plan/pr-assessment.md, docs/plan/pr-reader.md.

**Interfaces:** Reuse preserved S13 assessDelivery/observeDelivery/DeliveryRequest and optional Tracker.deliveryCheck; public delivery-check explicit refs/conditions remains read-only and evaluates only requested conditions, not whole-issue delivery. Add optional config delivery.evidence {manifest_dir?:string,require_manifest:boolean=false,require_merged:boolean=false,base?:string,required_checks:readonly string[]=[]}. Config absence preserves legacy closure; present-but-empty policy is unassessed, never silently invents merge rules. Reject evidence policy with non-GitHub tracker. A required manifest needs manifest_dir.

Manifest v1: {version:1,issue:{repository:string,number:number},pullRequests:readonly PullRequestRef[],manualRequirements:readonly string[]}. Fixed filename NUMBER.json under configured repository-root-relative manifest_dir; exact issue identity; nonempty unique PR refs; no cached status/secret or unknown fields. Git-tracked, contained, regular UTF-8 files, max32KiB; reject escapes/final symlinks/untracked/malformed/unknown versions/duplicates/identity mismatch. Owner authors manifests explicitly; no automatic writes. Read from nested cwd resolves Git root. Return source path/content hash for freshness. Optional absent manifests allow explicit refs; existing invalid manifests do not. Explicit refs cannot replace a present manifest's declared set; conflicting sets refuse. Manifest manual requirements remain unsupported/unknown.

Add optional Tracker.complete(id,request) where CompletionRequest has scopeConfirmed:true and optional explicit refs. CompletionResult kind confirmed|uncertain, message, issue WorkItem|null, and delivery assessment (or status unconfigured when policy absent). Tool action complete validates explicit confirmation; uncertain is a tool error. When evidence configured, legacy update status done refuses BEFORE title/label/lifecycle writes and directs callers to complete. Thus direct adapter update cannot bypass guard. No other remote-close path may bypass it. Complete unconfigured still requires scope confirmation, closes issue only and says delivery unconfigured/not evaluated; ordinary unconfigured legacy update remains compatible.

Guarded completion resolves explicit configured repository/positive safe issue identity, loads current manifest/config, observes all required PRs afresh, applies configured merge/base/named current-head checks plus manifest manual conditions, and closes only if supported conditions are satisfied. require_manifest is its own presence/reference condition; it MUST NOT imply merge when require_merged is false. An empty evidence policy remains unassessed/refused. Missing/old-head/manual/inaccessible/partial/conflicting evidence cannot pass. Recheck local manifest hash and effective config after asynchronous observations before closing; edits refuse without writes. One explicit close, no retry/rollback. Dispatched failure or unverifiable post-close identity/lifecycle is uncertain with reread advice; verify confirmed closure with fresh issue read. Already closed is a verified no-op, not proof of delivery absent evidence. Preserve API diagnostics and document unavoidable remote races; no atomic multi-resource guarantee. Never infer Project terminal fields, mutate membership/labels, arm auto-merge, provision or poll.

Public delivery-check may also accept id to resolve configured manifest/conditions; explicit refs/conditions mode remains distinguishable caller-request-only assessment. Do not let caller-supplied conditions weaken configured complete policy. Capabilities advertise only implemented operations, preserving all existing assignment/Project entries.

**First failing test:** Install preserved public delivery-check tests before wiring action and observe rejected-action RED. Reuse preserved S13 pure tests. Then add public `two-PR manifest survives a fresh tool and blocks partial completion`: first run must fail before manifest/complete integration because partial PR completion is not guarded. Add one failing test at a time.

**Steps:**

1. In the isolated d1e13ee worktree copy preserved S13 modules/tests/task evidence from /tmp/pi-development-system-pr-evidence; integrate types/adapter/tool manually to retain all current Project/assignment behavior. Observe public integration RED then GREEN.
2. Add config parsing and tracked manifest load with public fresh-instance/invalid-input tests; keep first failure evidence and all existing assertions.
3. Add complete scope parsing and configured legacy-done refusal; prove no partial title/label/issue writes and no hidden adapter bypass.
4. Add fresh policy/PR assessment, require-manifest-only control, hash/config race refusal, one close/readback and uncertain outcomes. Exercise multi-PR/open/draft/failed/old-head/unknown/manual/missing/changed manifest/permission/timeout/no-op paths individually.
5. Run targeted/full checks; record exact RED/GREEN and actual limitations here. Return exact patch /tmp/devsys-delivery-tracking.patch and changed paths, without reverting, committing, pushing or changing workflow state.

**Run:** node --experimental-transform-types --no-warnings --test test/tracker/delivery-assessment.test.ts test/tracker/delivery.test.ts test/tracker/completion.test.ts test/state/delivery-manifest.test.ts test/state/config.test.ts test/tracker/project.test.ts; npm test; npm run typecheck; npm run lint; npm run lint:knip; npm run lint:md.

**Expected:** Public RED precedes production integration; all old/new tests and gates pass. Unknown/manual/partial evidence and missing scope cannot close; confirmed close does not imply unspecified human policy. No live GitHub credentials required. Preserve all old assertions; add capability names without removing old ones.

**Out of scope:** README/package/releases, src/planning/slice-close.ts, skills/prompts/eval runners/workflow examples (parent owns these), scheduler/continuous worker/polling/merge policy, new dependencies, downstream writes, commits/push/intake/review changes or further delegation. Existing gh/Exec boundary only; parse external JSON, separate argv, sanitize diagnostics and never leak credentials. ADR0013 is the approved persistence/public boundary.

## DLV implementation evidence

Implemented in the isolated detached `d1e13ee` worktree. Changes are confined to the 17 Files above. Preserved S13 assessment/reader modules, tests and task evidence were copied from the read-only evidence worktree; existing tracker/types/tool integration was applied manually, retaining assignment/Project operations and the existing review/profile configuration. The two copied S13 evidence documents describe historical runs, not the final DLV results below. No commits, network calls, dependency installation, downstream operations or workflow-state changes were performed.

### Public RED → GREEN sequence

All test commands below use `node --experimental-transform-types --no-warnings --test`. Logs are local evidence artifacts, not repository fixtures.

| Contract | Observed RED | Corresponding GREEN |
| --- | --- | --- |
| Preserved public reader before action wiring | `test/tracker/delivery.test.ts`: 1 pass, 13 failures; first `public action must accept delivery-check` (`/tmp/dlv-reader-red.log`) | Reader plus pure assessment tests: 21 passed (`/tmp/dlv-reader-green.log`) |
| Explicit GitHub evidence configuration | `test/state/config.test.ts`: 19 passed, 1 failed; `unknown key delivery.evidence` (`/tmp/dlv-config-red.log`) | 20 passed (`/tmp/dlv-config-green.log`) |
| Tracked manifest loading from nested cwd | `test/state/delivery-manifest.test.ts`: module-not-found RED before implementation (`/tmp/dlv-manifest-red.log`) | Initial loader test passed (`/tmp/dlv-manifest-green.log`) |
| Fresh public two-PR completion | `test/tracker/completion.test.ts`: first test failed with `delivery-check needs explicit refs` (`/tmp/dlv-completion-red.log`) | Initial fresh-instance two-PR test passed (`/tmp/dlv-completion-green.log`) |
| Configured raw-done refusal before partial edits, including direct adapter | Focused completion test failed: attempted `edit` instead of read-only `view` (`/tmp/dlv-guard-red.log`) | Both initial completion/guard tests passed (`/tmp/dlv-guard-green.log`) |
| Actionable diagnostics without credential/control leakage | Focused public reader test failed because token, Bearer value, URL password and terminal control were echoed (`/tmp/dlv-diagnostic-red.log`) | All 15 reader tests passed (`/tmp/dlv-diagnostic-green.log`) |
| Empty configured policy with id only | Added public regression failed: missing-ref error instead of explicit unassessed result (`/tmp/dlv-empty-red.log`) | Completion suite: 31 passed, including parent test (`/tmp/dlv-empty-green.log`) |
| Config edited during final asynchronous manifest reload | Added public regression failed because completion was confirmed (`/tmp/dlv-final-config-red.log`) | Completion suite: 32 passed, including parent test (`/tmp/dlv-final-config-green.log`) |

Existing Project regression tests exposed an empty `/tmp/.git` placeholder being mistaken for a repository root (`/tmp/dlv-project-first.log`). Root discovery now recognizes actual directory HEAD metadata or a worktree gitdir file. The next run passed 12 tests and failed only the additive capability list (`/tmp/dlv-project-capability-red.log`). Adding only `delivery-check` and `complete` to that list, retaining every old capability and assertion, passed all 13 (`/tmp/dlv-project-green.log`).

Additional safety regressions passed without production repairs: malformed/version/unknown-field/identity/duplicate/unsafe-number/UTF-8/size/tracking/directory/symlink/path manifest cases; optional absence versus invalid presence; scope absence/false even when unconfigured; unconfigured legacy compatibility; conflicting explicit refs and non-overridable policy; open/draft/failed/old-head/unknown/manual/wrong-base/partial/permission/timeout evidence; manifest/config edits, removals and invalid config; already-closed evidence checks; and denied/timeout/unverifiable post-close outcomes. The required-manifest-only control uses open PRs and proves manifest presence never implies merge. Both empty-policy modes remain unassessed/refused. Completion issues no label or Project writes, exactly one close at most, and no retry or rollback.

The first full lint attempt reported formatting, excessive tool-dispatch complexity and test-helper assertion placement. Scoped formatting and behavior-preserving helper extraction resolved these; helper assertions remain inside the completion parent test. No assertions were removed, no tests skipped and no lint suppressions added.

### Final verification actually run

| Command | Result | Evidence |
| --- | --- | --- |
| `node --experimental-transform-types --no-warnings --test test/tracker/delivery-assessment.test.ts test/tracker/delivery.test.ts test/tracker/completion.test.ts test/state/delivery-manifest.test.ts test/state/config.test.ts test/tracker/project.test.ts` | 104 passed; 0 failed/cancelled/skipped/todo | `/tmp/dlv-targeted-final.log` |
| `npm test` | 2,010 passed; 0 failed/cancelled/skipped/todo | `/tmp/dlv-full-final.log` |
| `npm run typecheck` | Exit 0 | `/tmp/dlv-type-final.log` |
| `npm run lint` | Exit 0; available Biome checked 335 files, no fixes | `/tmp/dlv-lint-final.log` |
| `npm run lint:knip` | Exit 0; no unused exports/files reported | `/tmp/dlv-knip-final.log` |
| `npm run lint:md` | Exit 0; 121 files, 0 issues | `/tmp/dlv-md-final.log` |

Tests use fake GitHub Exec responses and temporary local Git repositories only. No live GitHub, owner-policy correctness, GitHub Enterprise environment, permission setup or actual remote timeout effects were exercised. Delivery remains a bounded observation, not an atomic multi-resource transaction: PR/check/issue facts can race after observation, and local content can change after the final reads. The adapter revalidates manifest content/path and effective configuration after PR/issue observations, checks configuration again after asynchronous manifest loading, and verifies issue identity/lifecycle after a dispatched close. Dispatched errors or unverifiable closure return uncertain with reread advice; they do not retry or roll back. Unspecified human requirements and Project terminal-state semantics are not inferred. No universal merge gate is introduced; supported owner-selected conditions and explicit whole-scope confirmation are the completion boundary.

Patch export uses `git diff --no-ext-diff --no-textconv --no-color`, plus explicit new-file diffs, to `/tmp/devsys-delivery-tracking.patch`. Validation is reverse-check only; the worktree is retained unchanged for parent integration.

`git diff --check` and `git apply --check --reverse /tmp/devsys-delivery-tracking.patch` both passed (exit 0). The exported patch contains all 17 scoped paths, including 11 new files; the pre-existing untracked `node_modules` symlink is excluded. No reverse application or revert was performed.

## Main integration receipt — 6.1.0 candidate

Parent installed the public tests first and observed the missing delivery modules/actions and additive capability mismatch (`/tmp/devsys-delivery-integrated-red.log`). After production integration, all 126 delivery/config/manifest/Project/local-closure tests passed (`/tmp/devsys-delivery-integrated-green.log`). The local-closure message change separately observed its public RED and all 22 local-closure tests passed without changing closure gates or making forge writes.

A new public API diagnostic regression exposed synthetic `API_KEY` and `Cookie` values in the error text. Prepending the existing core `redactSecrets` function retains all previous GitHub-token/Bearer/URL/control handling and preserves the HTTP refusal; the 87 focused delivery/completion/manifest/local-closure tests passed. No actual credential was used.

At this integration point, `npm test` passed 2,048 tests with zero failures/skips (`/tmp/devsys-delivery-integrated-full.log`); typecheck, lint, Knip and Markdown checks also passed. These are main-tree execution results, not the worker's historical 2,010-test run. HFX live effects, final independent review, commit, push and CI/publication remained pending when this receipt was written; this paragraph does not claim delivery.

### Independent review repair and final main checks

Round 1 identified Git pathspec interpretation in manifest tracking: an untracked `docs/delivery[prod]/7.json` could appear tracked when `docs/deliveryp/7.json` was tracked. The real-Git regression failed `true !== false` before the fix; adding Git's global `--literal-pathspecs` option refuses the untracked literal and accepts it only after explicit literal tracking. The synthetic external Git boundary was extended for this exact safe read without changing existing assertions, mutation denials, live records or model outcomes.

After repair, main `npm test` passed **2,049** tests with zero failures/skips; typecheck, lint (338 files), Knip and Markdown (127 files) passed (`/tmp/devsys-adoption-literal-green.log`). Six immutable live effect observations remain historical/pre-hardening, with exact runner archive and limitations in `evals/adoption/README.md`. The follow-up independent review and actual commit/push/CI/publication checks still must succeed before delivery.
