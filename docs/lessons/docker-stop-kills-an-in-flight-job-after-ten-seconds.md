---
title: '`docker stop` kills the worker after 10 seconds and its in-flight job stays locked until it stalls; give the worker a 30-second grace period'
areas: ['deploy']
topics: ['jobs', 'worker', 'docker', 'bullmq', 'shutdown']
---

# `docker stop` kills the worker after 10 seconds and its in-flight job stays locked until it stalls; give the worker a 30-second grace period

**In short**: With a 20-second job running, `SIGTERM` → `worker.close()` waited for it and the process exited 0 about
13 seconds later under `docker stop -t 30`. Under the default `docker stop` (10 seconds) Docker sent `SIGKILL`, the
container exited 137, and the job stayed in BullMQ's active list with its lock, to be redelivered only after the lock
expired.

**Context**: Task 0 of the jobs plan (2026-11-28), bundled worker in `node:22-alpine`, Redis 8 with `noeviction`.

**Problem**: Every Railway deploy and every Compose restart sends `SIGTERM`, so the default grace period turns every
deploy during a long job into a stalled job and, with `maxStalledCount: 1`, a second run.

**Rule**: Compose services of the worker set `stop_grace_period: 30s`, Helm sets `terminationGracePeriodSeconds: 35`,
and `JOBS_SHUTDOWN_TIMEOUT_MS` (default 25 000) stays below both, so the worker forces its own close before the platform
kills it.

**Applies to**: `docker/jobs.selfhost.compose.yml`, `deploy/helm/gatojs/templates/worker-deployment.yaml`,
`src/features/jobs/worker/shutdown.ts`, jobs plan Tasks 7, 9 and 18.
