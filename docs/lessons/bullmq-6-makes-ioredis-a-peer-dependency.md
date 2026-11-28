---
title: "BullMQ 6 makes `ioredis` a peer dependency and today resolves `ioredis` 6; pin both in the manifest"
areas: ["dependencies"]
topics: ["jobs", "bullmq", "ioredis"]
---

# BullMQ 6 makes `ioredis` a peer dependency and today resolves `ioredis` 6; pin both in the manifest

**In short**: `bullmq@6.7.10` declares `ioredis >=5.0.0`, `pg`, `redis` and `bullmq-otel` as peer dependencies and
depends only on `cron-parser`, `msgpackr`, `semver` and `tslib`. A fresh install resolves `ioredis@6.1.0`; the jobs spec
expected 5.x. `deduplication.keepLastIfActive`, `upsertJobScheduler` and `Queue.setGlobalConcurrency` exist in 6.7.10.

**Context**: Task 0 of the jobs plan (2026-11-28), `npm install bullmq ioredis` in a scratch folder.

**Problem**: A manifest that names only `bullmq` leaves `ioredis` to whatever npm picks for the peer, and the bundle
(which inlines it) changes with it.

**Rule**: `kit/modules/jobs.json` pins `bullmq` and `ioredis` exactly (`ioredis` 6.x, `import { Redis } from "ioredis"`),
and the version test of Task 2 asserts `keepLastIfActive` on the installed BullMQ.

**Applies to**: `kit/modules/jobs.json`, `package.json`, jobs plan Tasks 2 and 6.
