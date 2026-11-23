---
title: 'A new file outside an owned glob (a test in `src/__tests__/`, a file in `packages/<name>/`) needs a manifest entry, and only the CLI gate notices'
areas: ['testing', 'process']
topics: ['ownership', 'manifest', 'gato-cli', 'packages']
---

# A new file outside an owned glob (a test in `src/__tests__/`, a file in `packages/<name>/`) needs a manifest entry, and only the CLI gate notices

**In short**: `core.json` lists `src/__tests__/*` files one by one, and a new project package directory is owned by no glob. A new file there passes `npm run verify` and fails only `ownership.test.ts` in `packages/gato-cli` (`npm run verify --prefix packages/gato-cli`).

**Context**: Task 2 of the packages plan (`@gatojs/env`) on 2026-11-22: the test-writer moved the `.env.example` tests to `src/__tests__/env-example.test.ts`, and the root gate stayed green.

**Problem**:

- The root `npm run verify` does not run the ownership check, so the gap shows up late, in the CLI gate or in CI.
- Under heavy load the same CLI run also has timeouts (lesson `cli-tests-time-out-under-heavy-load`), which makes the real failure easy to miss.

**Rule**: When a change adds a file under `src/__tests__/` or a new `packages/<name>/`, add it to the owning manifest's `files` (`packages/<name>/**` for a package), then `npm run wa -- generate` and `npm run wa -- kit sync` (generate first, because it rewrites `Dockerfile` and `src/modules.generated.ts`, whose hashes `kit sync` records). Run `npx vitest run src/kit/__tests__/ownership.test.ts` in `packages/gato-cli` before the full CLI gate.

**Applies to**: `kit/modules/*.json`, `src/__tests__/`, `packages/*`, `packages/gato-cli/src/kit/__tests__/ownership.test.ts`.
