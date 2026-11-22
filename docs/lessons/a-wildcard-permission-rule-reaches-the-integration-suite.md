---
title: 'A Claude Code permission rule ending in `*` accepts any arguments, so `npm test *` also allows the integration config that truncates the test database'
areas: ['process']
topics: ['claude-code', 'permissions', 'agents', 'database']
---

# A Claude Code permission rule ending in `*` accepts any arguments, so `npm test *` also allows the integration config that truncates the test database

**In short**: A trailing ` *` (or `:*`) in `permissions.allow` matches any arguments. `Bash(npm test *)` and `Bash(npx vitest run *)` therefore allow `npm test -- -c vitest.integration.config.ts`, which runs `resetDatabase()` and truncates the `_test` database without asking. `Bash(npm run test:*)` does not match `test:integration` either, because `:*` means ` *`.

**Context**: Harness phase 1, task 3, and CodeRabbit's review of PR #25.

**Problem**:

- A rule meant for unit tests with a file filter also grants a database-writing run.
- Stryker scripts take arguments too, so `test:mutation:task *` can point Stryker at the integration config.

**Rule**: Allow test commands only as exact rules with no trailing `*`. Keep every command that can reach a database (`test:integration`, `test:mutation:integration`, `test:e2e`) and every command whose arguments can select a config (`test:mutation`, `test:mutation:task`) off the list.

**Applies to**: `.claude/settings.json`, `docs/11-praca-z-kitem.md#uprawnienia`.
