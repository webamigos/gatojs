---
title: 'lint-staged reformats `packages/gato-cli/src` while committing, so a bundle built before the commit is stale; rebuild after it'
areas: ['process']
topics: ['kit-cli', 'bundle', 'lint-staged', 'prettier']
---

# lint-staged reformats `packages/gato-cli/src` while committing, so a bundle built before the commit is stale; rebuild after it

**In short**: Task 2 of the extensibility plan built `.wa/bin/wa.mjs`, then committed the source and the bundle together. lint-staged ran Prettier on a new source file during the commit and rewrapped one line, so the committed bundle no longer matched the committed source. The next `npm run build --prefix packages/gato-cli` produced a whitespace-only diff in the bundle, which the CI check `git diff --exit-code -- .wa/bin/wa.mjs` would have failed.

**Context**: `feat/gato-doctor-and-eject`, 2026-11-25.

**Problem**:

- The commit hook changes staged source files after you built from them; the bundle is not in the formatter's file set, so it keeps the old layout.
- Nothing local fails: the bundle still runs, and the drift shows only in CI or the next build.

**Rule**: After committing a change to `packages/gato-cli/src`, run `npm run build --prefix packages/gato-cli` again and check `git status`. If `.wa/bin/wa.mjs` changed, commit it. Format new CLI files with Prettier before the first build to avoid the extra commit.

**Applies to**: every change to `packages/gato-cli/src`, `.wa/bin/wa.mjs`.
