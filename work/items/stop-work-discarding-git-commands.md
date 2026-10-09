# Stop work-discarding git commands

Status: done
Labels: follow-up, 1.0-readiness

`git checkout -- .`, `git checkout .`, `git restore .`, `git clean -fd[x]`, `git checkout -f` classify as ordinary in src/core/git-intent.ts; classify them as destructive-reset like `reset --hard`.

## Comments
