---
title: 'The commit hook''s lint-staged backs up into the git stash, which every worktree of the repo shares'
areas: ['process']
topics: ['git', 'husky', 'lint-staged', 'worktrees']
---

# The commit hook's lint-staged backs up into the git stash, which every worktree of the repo shares

**In short**: lint-staged starts each commit with “Backed up original state in git stash”. The stash stack belongs to the repository, not to the worktree, so parallel commits in different worktrees push to and pop from the same stack.

**Context**: Reported by the Next.js upgrade worker on 2026-11-22 while two other worktrees were committing.

**Problem**:

- A `git stash pop` in one worktree can apply a backup made in another.
- Leftover backups from failed commits pile up in `git stash list` for every worktree.

**Rule**: Do not use `git stash` for your own work in a repo with parallel worktrees; commit to a branch instead. If a commit hook fails, check `git stash list` and drop only entries whose message names your own commit.

**Applies to**: `.husky/pre-commit`, `.lintstagedrc.json`, parallel worktrees.
