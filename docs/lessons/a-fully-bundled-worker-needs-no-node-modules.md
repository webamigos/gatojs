---
title: 'A worker bundled with its npm packages, Prisma 7 runtime included, runs without `node_modules`; keep only native and optional modules external'
areas: ['deploy']
topics: ['jobs', 'worker', 'docker', 'esbuild', 'prisma']
---

# A worker bundled with its npm packages, Prisma 7 runtime included, runs without `node_modules`; keep only native and optional modules external

**In short**: Bundling everything except Node built-ins and optional native modules (`pg-native`, `msgpackr-extract`,
`@valkey/valkey-glide`, `sharp`) gives one 17 MB `worker.mjs` that ran a BullMQ job writing through Prisma 7
(`@prisma/adapter-pg`, PostgreSQL query compiler wasm inlined), better-auth and the event bus from an empty directory.
With npm packages left external, the same job needed 111 MB of `node_modules` for a minimal external set, and the root
`npm ci --omit=dev` would also carry `next` (206 MB) because the project has one `package.json`.

**Context**: Task 0 of the jobs plan (2026-11-28), on Node 24 (macOS) and `node:22-alpine` (linux/arm64, musl).
`@prisma/client/runtime` alone is 71 MB because it ships the query compiler for every provider; the bundle keeps only
PostgreSQL's.

**Problem**: The spec's image (§6.5) had a `prod-deps` stage with `npm ci --omit=dev`, which installs the whole web
stack into an image that never runs it.

**Rule**: The worker image is the base image plus `.worker/worker.mjs`; a `prod-deps` stage exists only when the
`workerExternals` list (native modules a job really loads, `sharp` first) is non-empty, and it installs just those
packages at the lockfile's versions. Versions still come from the root lockfile, because esbuild bundles what the
builder stage installed.

**Applies to**: `docker/worker.Dockerfile`, `src/features/jobs/worker/build.ts`, jobs plan Task 9, spec §6.4 and §6.5.
