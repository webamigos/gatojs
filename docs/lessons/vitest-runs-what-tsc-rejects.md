---
title: 'Vitest runs test code that `tsc` rejects: a bigint literal passes `npm test` and fails `npm run typecheck` under the ES2017 target'
areas: ['testing']
topics: ['typescript', 'vitest', 'tsconfig', 'test-writer']
---

# Vitest runs test code that `tsc` rejects: a bigint literal passes `npm test` and fails `npm run typecheck` under the ES2017 target

**In short**: Vitest strips types with esbuild and never type-checks, so a test file can be green in `npx vitest run` and still stop `npm run verify` at `typecheck`. The root `tsconfig.json` targets `ES2017`, where a bigint literal (`10n`) is error TS2737.

**Context**: Task 3 of the packages plan (`@gatojs/observability`) on 2026-11-23: the test-writer's red run and the implementer's green run both passed, and `npx tsc --noEmit` failed on `normalizeAttributes({ total: 10n })`.

**Problem**:

- The test-writer shows only a Vitest run, so the type error surfaces after implementation, when the implementer may not edit tests (`.superpowers/phase` = `implement`).
- The fix then needs another round trip to the test-writer.

**Rule**: The test-writer runs `npx tsc --noEmit -p tsconfig.json` next to the red Vitest run (type errors from missing exports are expected; any other error is a test bug). Write bigints as `BigInt(10)`.

**Applies to**: `tsconfig.json`, `.claude/agents/test-writer.md`, tests in `src/**` and `packages/*/src/**`.
