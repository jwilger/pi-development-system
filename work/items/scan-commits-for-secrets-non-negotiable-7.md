# Scan commits for secrets (non-negotiable 7)

Status: open
Labels: follow-up, 1.0-readiness

Readiness review (strong): `git add .env && git commit` is never checked. Add a deterministic stop when redactSecrets(added lines) differs from the added lines on the pending diff, and redact agent_spawn prompts. README documents the gap as of 1.0.0.

## Comments
