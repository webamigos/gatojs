---
title: 'Check a created project with its own `npm ci`, run after the fixture is registered; a symlinked `node_modules` fails `next build`'
areas: ['testing']
topics: ['wa-create', 'next-build', 'turbopack', 'project-module', 'prisma']
---

# Check a created project with its own `npm ci`, run after the fixture is registered; a symlinked `node_modules` fails `next build`

**In short**: To check locally what the `assemble` job checks, create the project, run `npm ci` in it, then copy the `notes` fixture, register it in `projectModules` and run `npm run wa -- generate`, in that order. Linking the repository's `node_modules` passes `tsc` and Vitest but fails `next build`, and copying the fixture before `npm ci` fails the `prisma generate` postinstall.

**Context**: extensibility Task 17 (component handles) on 2026-11-26 checked a created project whose `notes` fixture wraps `users.invite-dialog`.

**Problem**: Two shortcuts break the check. With `node_modules` symlinked to the GatoJS checkout, Turbopack stops with `Could not find the Next.js package (next/package.json)`, because it does not resolve outside the project root. With `notes.prisma` copied before `npm ci`, the postinstall `prisma generate` fails with P1012 (`Note.organization` has no opposite field), because `generate` has not written the `Organization` relation into the `wa:relations` region yet.

**Rule**: `node .wa/bin/wa.mjs create <dir> --kit . --yes --no-install --no-git`, then `npm ci` in `<dir>`, then the fixture steps of the `Project module is registered without editing core tests` step in `.github/workflows/kit.yml` (copy, `projectModules`, `npm run wa -- generate`), then `npm run typecheck`, the tests and `npm run build`. Put `<dir>` in the scratchpad, never in a worktree.

**Applies to**: `.github/workflows/kit.yml` (`assemble`), `packages/gato-cli/src/__tests__/fixtures/project-module/`.
