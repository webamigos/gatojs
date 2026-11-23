---
title: 'Stryker with the TypeScript checker crashes on `.mjs` files; mutate `packages/eslint-config` with `--checkers ""` and low concurrency'
areas: ['testing']
topics: ['stryker', 'mutation', 'eslint', 'mjs']
---

# Stryker with the TypeScript checker crashes on `.mjs` files; mutate `packages/eslint-config` with `--checkers ""` and low concurrency

**In short**: `npm run test:mutation:task -- packages/eslint-config/src/rules.mjs` stops before the first mutant with "Tried to check file … but no watcher is registered for it", because the root `stryker.config.json` enables the `typescript` checker and it does not watch `.mjs` files.

**Context**: Task 5 of the packages plan (`@gatojs/eslint-config`, 2026-11-23). The package is plain ESM (`.mjs`), since ESLint loads its config without a TypeScript loader.

**Problem**:

- The default task command cannot mutate the package at all.
- With nine runners each loading ESLint and `eslint-config-next`, the first batch of mutants timed out on a loaded machine; a timeout is not a kill.
- Stryker runs only the package tests: the root tests reach the package through ESLint's own `import` of `node_modules/@gatojs/eslint-config` (a symlink to the unmutated source), so a mutant they would kill still survives in the report.

**Rule**: Run `npx stryker run --force --checkers "" --concurrency 2 --timeoutMS 180000 --mutate <files>`. Keep the cases that kill mutants in `packages/eslint-config/src/__tests__/`, not only in `src/__tests__/`.

**Applies to**: `packages/eslint-config/src/*.mjs`, `stryker.config.json`, `.claude/agents/test-reviewer.md`.
