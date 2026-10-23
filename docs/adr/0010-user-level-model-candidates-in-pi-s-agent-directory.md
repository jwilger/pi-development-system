# ADR 0010: User-level model candidates in pi's agent directory

- **Status:** accepted
- **Date:** 2026-10-22

## Context

Slot candidates are read only from the committed `.development-system.toml`.
Local models served from one machine, such as an Ollama host reached over a
private network, have provider and model names that make sense only on that
machine or that pi install. Committing them puts machine-specific names into the
repository, and every clone sees them. ADR 0009 lets a small local model come
first in a slot. Without a machine-local place for such candidates, the only
way to use one is to commit it.

## Decision

`loadConfig` also reads `development-system.toml` from pi's agent directory
(`getAgentDir()`, which follows `PI_CODING_AGENT_DIR`). That file may contain
only `version` and `[models]`, because policy (delivery, review, routing)
belongs to the repository. For each slot it names, its candidates go ahead of
the repository's candidates, and repeats are dropped. If the file is missing,
nothing changes. If it is invalid, the error names the file's path. Tools that
report or pick models (`devsys_models`, `devsys_route_task`, `/devsys-models`,
`devsys_review_start`, `devsys_lens_review`) fail with that error. The spawn guard and model advice fall back to the repository's
matrix, and the spawn guard warns once. Policy readers (push guard, slice close,
tracker, CI, `devsys_review_record`) never read the user file.
`/devsys-models` edits and writes only the repository's matrix. Its table shows
the user candidates, but it never writes them to the repository.

## Consequences

### Positive

- Machine-specific model names stay off the repository and out of the plugin.
- Users without the file behave exactly as before.
- Context-window skipping (ADR 0009) still falls back to the repository's cloud
  candidates.

### Negative

- Effective routing now depends on a file outside the repository. A person
  reading only `.development-system.toml` may not predict the result.
  `devsys_models` shows what each slot actually resolves to.
- Tests must isolate the agent directory. The test harness points
  `PI_CODING_AGENT_DIR` at a temporary directory.

## Alternatives

- **Gitignored `.development-system.local.toml` in the repository**: rejected
  because local models belong to the machine, not to each repository, so the
  file would have to be repeated in every clone.
- **Only remove the names and let the user edit the committed file locally**:
  rejected because the uncommitted edit is lost easily and conflicts with
  `/devsys-models` writes.
- **User candidates replace the slot instead of going ahead of it**: rejected
  because replacement would lose the cloud fallback for work that does not fit
  a small window.

## Revisit when

pi gains its own per-user extension settings mechanism, or users ask for user
overrides of keys other than `[models]`.

## Related

- ADR 0009: context-window-aware slot resolution.
- docs/research/07-local-model-routing.md
