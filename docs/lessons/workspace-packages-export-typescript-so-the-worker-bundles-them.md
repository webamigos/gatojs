---
title: '`@gatojs/*` workspace packages export TypeScript source, so a worker bundle that leaves packages external fails at run time; bundle them'
areas: ['architecture']
topics: ['jobs', 'worker', 'esbuild', 'workspaces']
---

# `@gatojs/*` workspace packages export TypeScript source, so a worker bundle that leaves packages external fails at run time; bundle them

**In short**: `packages/env`, `packages/crypto` and `packages/observability` export `./src/index.ts`. With esbuild's
`packages: "external"` the bundle imports them at run time, Node type-strips the entry and then fails on an
extensionless import: `ERR_MODULE_NOT_FOUND .../packages/crypto/src/assert-encryption-available`.

**Context**: Task 0 of the jobs plan (2026-11-28), first development bundle built with `packages: "external"`.

**Problem**: The option reads as "leave npm packages alone", but workspace packages are npm packages to esbuild, and
Next only handles them because it transpiles them itself.

**Rule**: The worker build's resolve plugin bundles every `@gatojs/*` import (and `@/*` from `src/`) and decides
externals by an explicit list, never by `packages: "external"`.

**Applies to**: `src/features/jobs/worker/build.ts`, `packages/*/package.json` `exports`, jobs plan Task 9.
