---
title: 'Under `tsx` the app code runs as CommonJS, so resolve hooks miss `require` and the registry cycle hits a TDZ; run the development worker as an esbuild watch bundle under `node --watch`'
areas: ['architecture']
topics: ['jobs', 'worker', 'tsx', 'esbuild', 'commonjs', 'development']
---

# Under `tsx` the app code runs as CommonJS, so resolve hooks miss `require` and the registry cycle hits a TDZ; run the development worker as an esbuild watch bundle under `node --watch`

**In short**: The root `package.json` has no `"type": "module"`, so `tsx` compiles `src/**/*.ts` to CommonJS. An ESM
resolve hook (`module.register`) never sees those `require` calls, and with `module.registerHooks` (which does) the
import cycle `server registry → organizations/subscribers.ts → events → emit-event.ts → server registry` throws
`ReferenceError: Cannot access 'subscribers' before initialization`. The ESM bundle of the same entry runs.

**Context**: Task 0 of the jobs plan (2026-11-28) tried the spec's development entry (`tsx watch` with
`dev-hooks.mjs`). company-budget hit the same class of bug ("app code ran as CommonJS in the worker").

**Problem**:

- Development and production would run two module formats with different evaluation orders, so a cycle can pass in
  one and fail in the other.
- The spec's plan to exercise "both formats in CI" turns a design flaw into a test burden.

**Rule**: `npm run worker:dev` runs `build.ts --dev`: esbuild `context().watch()` with the production plugin and stubs,
writing `.worker/dev/worker.mjs`, and `node --watch` on that file (verified: a rebuild takes about 100 ms and the
process restarts on a changed output). No `tsx` and no module hooks for the worker; the integration suite runs the same
bundle the image runs.

**Applies to**: `src/features/jobs/worker/build.ts`, the `worker:dev` manifest script, jobs plan Task 9, spec §6.4
and §6.6 (decision 17.1/11 keeps its intent: automatic reload).
