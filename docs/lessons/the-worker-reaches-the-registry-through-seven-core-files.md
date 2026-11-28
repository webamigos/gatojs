---
title: 'The worker reaches the app registries through seven core files, and `permissions.ts` reads the client registry; find them with the bundle metafile, not by grep'
areas: ['architecture']
topics: ['jobs', 'worker', 'registry', 'esbuild', 'generator']
---

# The worker reaches the app registries through seven core files, and `permissions.ts` reads the client registry; find them with the bundle metafile, not by grep

**In short**: A worker that imports `emitEvent`, `trackAudit` and `runCommand` pulls `@/modules.generated` in through
`emit-event.ts`, `audit.ts`, `run-command.ts`, `env.ts`, `modules/setup.ts` and `auth/index.ts`, and
`@/modules.client.generated` through `auth/permissions.ts` (`moduleByKey`). The jobs spec (§6.3) named four files. The
Next-free server registry must also hold `moduleSetups` and `authPlugins`, and the module list that `permissions.ts`
needs must come from a file both registries share.

**Context**: Task 0 of the jobs plan (2026-11-28). An esbuild plugin redirected both registries to a hand-written
server registry and logged every importer it redirected.

**Problem**:

- `setup.ts` is reached from the `organizations.created` subscriber, so `moduleSetups` must be Next-free.
- `auth/index.ts` is reached from `auth/helpers.ts` (a dynamic import that esbuild still bundles), so `authPlugins`
  is on the worker's graph.
- `permissions.ts` runs in the browser too, so it cannot switch to the server registry: the server registry holds env
  schemas and subscribers. The client registry imports component overrides (React), so it cannot stay either.

**Rule**: Split the registries by what the worker reaches, measured on the bundle: the generator writes the
plain-data module list once (`modules` after `applyGatoConfig`) in a file both registries and `permissions.ts` import,
and the server registry gets `moduleSetups` and `authPlugins`. The Next-free rule then covers `setup.ts` and `auth.ts`
of every module, and the bundle check enforces it. Re-run the metafile importer report whenever a core file starts
importing a registry.

**Applies to**: `src/modules.generated.ts`, `src/modules.client.generated.ts`, `src/server-registry.generated.ts`,
`src/shared/lib/auth/permissions.ts`, `packages/gato-cli/src/generate/registry.ts`, jobs plan Task 3.
