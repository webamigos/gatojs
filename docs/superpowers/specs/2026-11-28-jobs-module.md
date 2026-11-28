# Background jobs: a `jobs` module on BullMQ, with retention and cleanup as its first consumers

Date: 2026-11-28, against `main` at `8244a83` (GatoJS `0.43.0`). Drafted by an agent for Patryk. Status: **every
open question answered by the owner (section 17.1); the spec is revised to match and section 17.2 is empty.** The
plan is [`2026-11-28-jobs-module.md`](../plans/2026-11-28-jobs-module.md); its Task 0 spike changed section 6
(decisions 25 to 31).

Roadmap item: _"Background jobs: a job queue and scheduled tasks, including retention and cleanup, e.g. pruning old audit
log entries and orphaned uploads."_ Decided by the owner: **BullMQ on Redis**, a **separate worker image**, a
**transactional outbox**, **strict organization scope** inside jobs and an **organization timezone**.

Sources:

- three projects that run BullMQ in production, read as source only (their `node_modules` were removed):
  - `ragen/ragen-app`: `packages/jobs-bullmq/src/` (`index.ts`, `worker.ts`, `context.ts`, `queues.ts`,
    `dashboard.ts`, `redis-health.ts`), ADR-44 `docs/adrs/44-bullmq-is-the-worker-runtime.md`, spec
    `docs/specs/2026-09-15-bullmq-is-the-worker-runtime.md` (failure table, schedules, parity suite), lesson
    `docs/lessons/bullmq-matches-temporal-at-equal-concurrency-2026-09-16.md`, architecture tests
    `tests/architecture/jobs-seam-is-the-only-runtime-import.test.ts` and
    `worker-scripts-close-the-job-runtime.test.ts`, `deploy/helm/ragen/values.yaml`;
  - `betterandfaster/justnails-app`: `docs/background-worker.md`, `packages/queue/src/{queues,connection}.ts`,
    `apps/worker/src/{main,registry,bull-board,env}.ts`, `apps/worker/{Dockerfile,railway.toml}`, the worker tests,
    skill `.claude/skills/justnails-worker-job/SKILL.md`, lessons `ci-does-not-run-the-worker-or-package-tests.md` and
    `the-workers-prisma-adapter-is-a-major-behind.md`;
  - `budget/company-budget-app`: `docs/background-jobs.md`, `packages/queue/src/queues.ts`,
    `apps/worker/src/{main,registry,next-cache-shim}.ts`, `apps/worker/src/jobs/crm-sync.ts`, the worker tests;
- GatoJS `main` at `8244a83`: `CLAUDE.md`, `AGENTS.md`, `kit/CLAUDE.md`, `EXTENSION_POINTS.md`, ADR-59 to ADR-71,
  `docs/09-nowy-modul.md`, `kit/modules/{audit-logs,uploads}.json`, `src/features/{audit-logs,uploads,organizations}/**`,
  `src/shared/lib/{events,commands,tenant-scope,modules,audit.ts}`, `src/instrumentation.ts`,
  `src/app/api/healthcheck/route.ts`, `prisma/schema/organizations.prisma`, `docker-compose.yml`,
  `docker-compose.selfhost.yml`, `Dockerfile`, `railway.toml`, `deploy/helm/gatojs/`,
  `packages/gato-cli/src/manifest/schema.ts`, and the earlier specs
  [`2026-10-26-wa-kit-design.md`](2026-10-26-wa-kit-design.md) (the original `worker` module row) and
  [`2026-11-22-packages-design.md`](2026-11-22-packages-design.md) §6;
- open-mercato (MIT, `github.com/open-mercato/open-mercato`, read locally) as prior art for patterns, not code (section
  3.1): `packages/queue/src/tracing.ts`, `packages/queue/src/strategies/async.ts` (`onJobAbandoned`, the failed-set
  sweep), `packages/cli/src/lib/worker-connection-budget.ts`, `.ai/lessons/enqueue-then-stamp.md`,
  `.ai/lessons/worker-emitted-progress-needs-polling-fallback-even.md`, `.ai/specs/2026-09-08-queue-job-coalescing.md`,
  `.ai/specs/2026-06-26-purge-queues-on-db-wipe.md`, `.ai/specs/2026-08-21-scheduler-manual-trigger-audit-logging.md`;
- pull requests merged since the first draft, and how this spec meets them: **#134** (`legal` module, core slots
  `app.root`, `app.sidebar.footer`, `auth.footer`, `docs/18-legal-module.md`; this spec's docs therefore start at
  `docs/19`), **#138** (ADR-70: membership events come from the actor who added the member; the new
  `organizations.timezone-changed` event follows the same rule, the actor is the user who changed it), **#139**
  (ADR-71: account profile changes emit no organization event, and the shared `PageHeader`; a personal timezone, if
  added, follows ADR-71, and the new pages use `PageHeader`). ADR-70 and ADR-71 are taken, so this spec proposes
  ADR-72 to ADR-75 (section 18).

Naming follows the extensibility spec: new names say GatoJS or `gato`; existing spellings (`wa:*` regions,
`npm run wa --`, `.wa/kit.json`) stay until the rename plan.

## 1. Why

GatoJS has no way to run work outside a request:

- **Retention.** `audit_logs` grows forever. Nothing deletes old rows, and an operator who wants a 12-month retention
  writes SQL by hand.
- **Cleanup.** The `uploads` module leaves storage objects behind in three ways that exist today (section 10.2): an
  object whose database row was never written, an object whose delete failed (logged, then forgotten), and every
  object of a deleted organization, because `Upload` rows cascade with the organization while storage is untouched.
- **Slow and retried work.** Mail is sent inside the request. A project module that syncs an external system, renders
  a report or calls a rate-limited API has nowhere to put the work, and no retry.
- **Durable reactions.** ADR-61 says it plainly: domain events are in-process and best effort, _"a `jobs` module would
  bring that"_.
- **Time.** Nothing knows what time it is _for an organization_: dates render in the server's zone and a schedule would
  fire in the container's zone.

**Goal:** a GatoJS module (Gato or project) declares jobs and schedules in one registry file, enqueues them atomically
with its own database writes, and a separate worker runs them with retries, in every deployment shape GatoJS supports
(Compose, self-hosted Compose, Railway, Helm), without the developer touching a Gato file.

## 2. Goals and non-goals

Goals:

1. A `jobs.ts` registry file per module, like `events.ts` and `subscribers.ts`: typed payloads (Zod), retry policy,
   concurrency and schedules, collected by `wa generate`.
2. Enqueueing is part of the caller's database transaction (outbox), so a committed write never loses its job and a
   rolled-back write never runs one.
3. Tenant safety enforced at run time: an organization job's queries can touch only its own organization.
4. A separate worker image that runs module job handlers without loading Next.js, tested in `npm run verify` from day
   one.
5. Retention and cleanup shipped as the first consumers, configured in `src/gato.config.ts`.
6. An organization timezone, used by organization-facing schedules and by date display, changeable by owners and
   admins.
7. Queued subscribers (event → job) and a `jobs.failed` event.
8. The operational lessons of the three projects built in from the start (section 3).

Non-goals (this spec):

- Durable execution (replay of a half-finished job). BullMQ re-runs a job from the top; handlers are idempotent.
- Flows / parent-child job graphs (`FlowProducer`).
- A BullMQ backend other than Redis (decision 17.1/2).
- Tracking which uploads are _referenced_ by domain data. "Orphaned" in v1 means "a storage object with no `Upload`
  row" (section 10.2).
- Strict ordering between jobs. The outbox relays in creation order, but BullMQ runs jobs concurrently (8.6).

## 3. What the three projects teach

All three run BullMQ in a worker process separate from the web process. What worked, and what bit them:

| Topic          | What they do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Keep / avoid                                                                                                                                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract       | justnails and company-budget: `packages/queue` with `QUEUE` names, a `JobPayloads` interface and `enqueue*` helpers; the worker has `Record<QueueName, processor>` so a missing processor fails to compile. Ragen: `@ragenai/jobs` seam with `JOB_NAMES`, payloads, `JobContext`; `bullmq` imported in exactly one package, enforced by an architecture test.                                                                                                                                               | **Keep** the single typed contract and the "only one place imports `bullmq`" rule. **Avoid** TypeScript-only payload types: company-budget's `crm-sync` had to skip legacy jobs whose payload shape changed (`integrationId` vs `organizationId`) because nothing validated the data at run time. GatoJS parses with Zod on both sides. |
| Connection     | `maxRetriesPerRequest: null` on every connection in justnails/company-budget; justnails swallows `error` events with an empty handler. Ragen: `null` only on the worker's blocking connections; producers keep a finite budget so an enqueue **fails fast** instead of hanging a request. Lazy producer connection so imports and tests never open Redis.                                                                                                                                                   | **Keep** Ragen's split and the lazy producer. **Avoid** the silent `redis.on("error", () => {})`: log it, throttled.                                                                                                                                                                                                                    |
| Eviction       | justnails/company-budget start Redis with `--maxmemory-policy noeviction`; Ragen also **refuses to boot** against an evicting Redis (and only warns when `CONFIG GET` is forbidden, as on Upstash).                                                                                                                                                                                                                                                                                                         | **Keep** both.                                                                                                                                                                                                                                                                                                                          |
| Retries        | Defaults in both small projects: 3 attempts, exponential backoff from 5 s, `removeOnComplete: 1000`, `removeOnFail: 5000`. Mail jobs use `attempts: 1` so a retry cannot double-send. Ragen maps a handler's `JobFailure { retryable: false }` to BullMQ's `UnrecoverableError`.                                                                                                                                                                                                                            | **Keep** all three.                                                                                                                                                                                                                                                                                                                     |
| Idempotency    | company-budget: row first (`AgentRun` unique on `(organizationId, idempotencyKey)`), then `jobId = <name>-<sha256(...)>`; `deduplication: { id }` per connection while one is in flight; sweeps re-queue lost work. BullMQ rejects `:` in custom job ids and all-digit ids (Ragen hit this). Ragen deletes a file's vectors before re-writing, so a redelivered job replaces instead of duplicating.                                                                                                        | **Keep**: deterministic, hashed job ids; dedupe ids; idempotent handlers as a documented rule.                                                                                                                                                                                                                                          |
| Stalls         | Ragen: CPU-bound work (sharp, pdfium) blocks the event loop, the lock is not renewed, BullMQ marks the job stalled and **runs it a second time in parallel**. Fix: `lockDuration` 5 min for that workload, `maxStalledCount: 1`, both overridable so an integration test can prove the stalled path.                                                                                                                                                                                                        | **Keep** `maxStalledCount: 1` and per-job `lockDurationMs`; GatoJS's `uploads` uses `sharp`.                                                                                                                                                                                                                                            |
| Concurrency    | `concurrency` is **per Worker instance**; two replicas at 5 run 10. Ragen sets BullMQ's **global concurrency** for jobs that must not overlap (nightly maintenance) or that hit a rate-limited provider. Ragen also found its first regression was a unit confusion (jobs vs activities) in a default.                                                                                                                                                                                                      | **Keep** per-job `concurrency` and `globalConcurrency`.                                                                                                                                                                                                                                                                                 |
| Schedules      | justnails/company-budget: `upsertJobScheduler` at worker boot (BullMQ 6 removed legacy repeatable jobs). justnails reads a DB toggle and removes the scheduler when it is off ("a restart must not silently re-enable a schedule"). company-budget never removes a scheduler that left the code, so a deleted schedule keeps firing. Ragen keeps destructive schedules out of boot (explicit scripts with `--delete`) and found Temporal accepting a six-field cron that never fired.                       | **Keep** boot-time upsert, **add** reconciliation (remove schedulers this app owns that are no longer declared or are disabled), **validate** crons as five-field at registry build time.                                                                                                                                               |
| Worker process | justnails/company-budget: `apps/worker` run by `tsx` in its own Docker image and Railway service; company-budget imports the app's `src/` through the `@/*` alias and needed a `next/cache` shim because `revalidatePath` throws outside a request, plus lazy `next/headers` imports, plus a lesson about app code running as CommonJS in the worker. justnails forbids the worker to import `src/` and calls the app back over HTTP with a shared `CRON_SECRET`. Ragen: a separate app with its own image. | **Keep** the separate worker image (decision 17.1/1). **Avoid** the pitfalls with a bundle that imports the app's code through a Next-free generated registry, stubs for `next/*`, one module format, and worker tests and a bundle check in `npm run verify` from day one (section 6).                                                 |
| Shutdown       | All three: `SIGTERM` → stop the HTTP side → `worker.close()` (waits for in-flight jobs) → flush telemetry last → exit. Railway sends `SIGTERM` on every deploy, so the path runs constantly. Ragen: a script that opens a queue must close it or the process never exits.                                                                                                                                                                                                                                   | **Keep**, plus a timeout below the platform's grace period.                                                                                                                                                                                                                                                                             |
| Dashboard      | justnails/company-budget: bull-board on the worker's own port behind Basic Auth (`BULL_BOARD_USER/PASSWORD`) with an unauthenticated `/health`. Ragen: the same, off unless both credentials are set, constant-time compare over hashes; it names "behind Better Auth in the admin app" as the honest home and defers it (proxying Express through a Next route is work).                                                                                                                                   | **Keep** bull-board on the worker behind a password, off unless configured, read-only by default, never published (section 12.2), **plus** a small in-app page for global admins (12.1).                                                                                                                                                |
| Tests          | justnails/company-budget: processors are framework-agnostic functions tested with Prisma mocked; a registry test asserts a processor per queue name. Ragen: unit tests of the adapter plus an integration suite on real Redis (enqueue → complete, retries, cancel, schedule fire, stalled recovery, double-run), which found a real race the mocks could not (`getRun` reading job and state in two round trips). justnails: CI did not run the worker tests for months.                                   | **Keep** both levels; the worker code lives in `src/`, so `npm test` and `npm run verify` cover it with no extra workspace.                                                                                                                                                                                                             |
| Observability  | pino logs with `{ queue, jobId }` on `completed`/`failed`; OTel off unless `OTEL_EXPORTER_OTLP_ENDPOINT`; Ragen plans `bullmq-otel`; `job.updateProgress` rendered by bull-board.                                                                                                                                                                                                                                                                                                                           | **Keep**, through GatoJS's logger and `packages/observability`.                                                                                                                                                                                                                                                                         |
| Secrets        | Ragen moved payloads from content to identifiers ("whole documents sat unencrypted in the engine's storage and went stale"). company-budget: payloads carry integration ids, never credentials. justnails' email job carries rendered HTML with the recipient.                                                                                                                                                                                                                                              | **Keep** ids-only payloads; render mail at run time.                                                                                                                                                                                                                                                                                    |

### 3.1 Prior art: open-mercato

open-mercato runs BullMQ (its `async` strategy) for a multi-tenant commerce platform. Reviewed after the second
revision; the owner approved adopting these patterns (ideas only, no code copied):

| Pattern                                                                                                                                           | Where in open-mercato                                                                                                 | Here      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| W3C trace context on the job, outside the payload; the worker continues it in a consumer span                                                     | `packages/queue/src/tracing.ts` (`attachTraceMetadata`, `runJobInTrace`)                                              | 7.6, 8.1  |
| A job that never reported (stalled, abandoned) is reported from the `failed` event and from a sweep of the failed set; signal first, stamp second | `packages/queue/src/strategies/async.ts` (`onJobAbandoned`, `abandonReportedAt`), `.ai/lessons/enqueue-then-stamp.md` | 8.2, 11.4 |
| Coalescing (latest payload wins) instead of plain deduplication; `keepLastIfActive` needs BullMQ ≥ 5.72; delay interaction documented             | `.ai/specs/2026-09-08-queue-job-coalescing.md`                                                                        | 7.5       |
| The workers' total concurrency fitted to the database pool, plan logged at boot                                                                   | `packages/cli/src/lib/worker-connection-budget.ts`                                                                    | 5.3, 8.6  |
| Queues purged on every database wipe, and a purge command                                                                                         | `.ai/specs/2026-06-26-purge-queues-on-db-wipe.md`                                                                     | 14.3      |
| Progress from another process needs a polling backstop                                                                                            | `.ai/lessons/worker-emitted-progress-needs-polling-fallback-even.md`                                                  | 12.1      |
| Manual triggers audited on success and refusal, attributed to the caller, in the caller's scope                                                   | `.ai/specs/2026-08-21-scheduler-manual-trigger-audit-logging.md`                                                      | 9.2, 12.1 |

What we deliberately do not take:

- **A file-based local queue strategy** (`packages/queue/src/strategies/local.ts`): a second runtime with other
  semantics to test and support. GatoJS has one runtime, BullMQ on Redis; tests use the in-memory runtime (14.1).
- **Database-editable schedules that can target any queue** (`packages/scheduler/src/modules/scheduler/`): schedules
  here are code plus `gato.config.ts`, reviewed in a PR; nothing at run time can point a schedule at an arbitrary job.
- **A per-queue worker supervisor** (`packages/cli/src/lib/queue-worker-supervisor.ts`, lazy start per queue): one
  worker process with one BullMQ `Worker` per queue is simpler to deploy, observe and shut down.
- **Organization ids in the payload root** (`QueueJobScope` in `packages/queue/src/types.ts`): the organization lives
  only in the envelope, never in the payload (7.6, 9.1).

## 4. Shape of the change

Four parts, because GatoJS modules must not depend on an optional module and must not edit core files:

1. **Core seam** `src/shared/lib/jobs/`: `defineJobs`, `defineSchedules`, the registry check, the job envelope,
   `jobOrigin`, `enqueueJob`, the `JobRuntime` port and an in-memory runtime for tests. No `bullmq` import. Gato modules
   (`audit-logs`, `uploads`) and project modules declare jobs against this seam whether or not the `jobs` module is
   installed, as `trackAudit` works with or without `audit-logs` (`auditSinks`).
2. **Core changes the jobs need anyway:** a Next-free server registry (6.3), the organization job scope in the
   tenant-scope guard (9.1), the organization timezone and its settings page (section 11), `AuditChannel` `SYSTEM`
   (10.1), queued subscribers in the event bus (11.3).
3. **Kit module `jobs`** `src/features/jobs/`: the outbox table and relay, the BullMQ runtime, the worker entrypoint and
   its Dockerfile, scheduler reconciliation, health, shutdown, the worker dashboard, the in-app admin page, Compose
   services, env schema. The only code that imports `bullmq` or `ioredis`.
4. **First consumers**: `src/features/audit-logs/jobs.ts` (retention) and `src/features/uploads/jobs.ts` (orphan
   cleanup), each with its own module version bump.

Without the `jobs` module, `moduleJobs` and `moduleSchedules` still exist (declarations are validated, so a bad key fails
`npm test`), `enqueueJob` throws `JobsUnavailableError("jobs module is not installed or disabled")`, and schedules do
not run. `wa doctor` warns once: _"audit-logs declares schedules, but the jobs module is not installed; they will not
run"_. A module that must work without jobs checks `isModuleEnabled("jobs")` and does the work inline. A queued
subscriber (11.3) of a module that does not `require` `jobs` is a registry error, so a kit module never ships one
without declaring the dependency.

## 5. Module shape

### 5.1 Manifest `kit/modules/jobs.json`

```json
{
  "name": "jobs",
  "version": "0.1.0",
  "description": "Background jobs and schedules on BullMQ and Redis: outbox, worker image, dashboard and admin page",
  "requires": [],
  "files": [
    "prisma/schema/jobs.prisma",
    "src/features/jobs/**",
    "src/app/[locale]/(app)/admin/jobs/**",
    "docker/worker.Dockerfile",
    "docker/jobs.compose.yml",
    "docker/jobs.selfhost.compose.yml",
    "ci/jobs.integration-steps.yml"
  ],
  "dependencies": {
    "bullmq": "<pinned exactly at implementation, 6.x (6.7.10 in the spike); keepLastIfActive asserted by a test>",
    "ioredis": "<pinned exactly, 6.x: a peer dependency of BullMQ 6 (decision 31)>",
    "@bull-board/api": "<pinned>",
    "@bull-board/express": "<pinned>",
    "express": "<pinned, 5.x>"
  },
  "devDependencies": { "esbuild": "<pinned>" },
  "scripts": {
    "worker:dev": "tsx src/features/jobs/worker/build.ts --dev",
    "worker:build": "tsx src/features/jobs/worker/build.ts",
    "worker:start": "node .worker/worker.mjs",
    "worker:check": "node --env-file-if-exists=.env .worker/worker.mjs --check",
    "jobs:purge": "tsx src/features/jobs/worker/purge.ts"
  },
  "verify": "npm run worker:build && npm run worker:check",
  "env": [
    {
      "name": "REDIS_URL",
      "example": "redis://localhost:6379",
      "selfhostExample": "redis://redis:6379",
      "required": true
    },
    {
      "name": "REDIS_PASSWORD",
      "example": "",
      "selfhostExample": "",
      "required": false
    },
    { "name": "JOBS_CONCURRENCY", "example": "5", "required": false },
    { "name": "JOBS_PREFIX", "example": "{{projectSlug}}", "required": false },
    {
      "name": "JOBS_SHUTDOWN_TIMEOUT_MS",
      "example": "25000",
      "required": false
    },
    { "name": "JOBS_WORKER_PORT", "example": "3100", "required": false },
    { "name": "JOBS_DB_POOL_MAX", "example": "5", "required": false },
    { "name": "JOBS_DASHBOARD_USER", "example": "", "required": false },
    { "name": "JOBS_DASHBOARD_PASSWORD", "example": "", "required": false },
    { "name": "JOBS_DASHBOARD_READ_ONLY", "example": "true", "required": false }
  ],
  "schemaRelations": [
    { "model": "Organization", "field": "jobOutbox JobOutbox[]" }
  ],
  "compose": "docker/jobs.compose.yml",
  "selfhostCompose": "docker/jobs.selfhost.compose.yml",
  "ciSteps": "ci/jobs.integration-steps.yml",
  "workspaces": []
}
```

New manifest fields (gato-cli, **`kitFormat` 12**): `scripts` (merged into the project's `package.json` by
`wa generate`, owned like dependencies, removed with the module) and `verify` (a command the generator composes into a
new core script `verify:modules`, which the core `verify` script runs). This is how the worker build and its check are
part of `npm run verify` from day one, the gap justnails lived with for months.

### 5.2 Files

```
prisma/schema/jobs.prisma         JobOutbox (8.4)
src/features/jobs/
├── module.ts                     defineModule({ key: "jobs", adminOnly, routePrefixes: ["/admin/jobs"], commands … })
├── env.ts                        envSchema (5.3)
├── events.ts                     jobs.failed (11.4)
├── subscribers.ts                organizations.deleted → jobs.purge-organization (9.4)
├── job-runtime.ts                export const jobRuntime: JobRuntime (registry contribution, 7.4)
├── extension-points.json
├── i18n/{pl,en}.json
├── outbox/                       insert, relay, prune (8.4)
├── runtime/                      the only files that import bullmq / ioredis
│   ├── connection.ts             relay (producer) and consumer connection options
│   ├── consumer.ts               Worker per job, envelope parse, failure mapping, jobs.failed
│   ├── schedules.ts              upsert + reconciliation of job schedulers
│   ├── organization-schedules.ts per-organization slots (11.2)
│   ├── redis-health.ts           eviction check
│   └── queue-names.ts            job name → queue name, prefix
├── worker/
│   ├── main.ts                   worker entrypoint (6.2)
│   ├── http.ts                   /health and the optional dashboard (12.2)
│   ├── shutdown.ts
│   ├── build.ts                  esbuild bundle + metafile check (6.4); --dev: watch + node --watch (6.6)
│   └── stubs/                    next/*, next-intl, @/i18n/routing, server-only replacements (6.4)
├── services/queries/             admin page reads (global admin)
├── services/commands/            jobs.retry, jobs.run-now (global admin, 12.1)
└── components/
docker/worker.Dockerfile          worker image (6.5)
```

### 5.3 Environment

`src/features/jobs/env.ts` follows `uploads/env.ts`: registered in `moduleEnvSchemas`, verified at boot by both the app
(`verifyEnvOnStartup` in `instrumentation.ts`) and the worker (the same call in `worker/main.ts`), so a missing variable
stops the process with a readable message (justnails' `loadEnv`).

| Variable                                         | Default      | Rule                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`                                      | none         | Required when the module is enabled. `redis://` or `rediss://` (TLS), through a new `redisUrl` helper in `@gatojs/env`. The web needs it only for the admin page (12.1); enqueueing never touches Redis (8.4).                                          |
| `REDIS_PASSWORD`                                 | none         | Used as the ioredis `password` when the URL has none. **Required** in the self-hosted stack (decision 17.1/9, 5.4). A URL with a password and `REDIS_PASSWORD` both set is an error.                                                                    |
| `JOBS_CONCURRENCY`                               | `5`          | Default per-worker concurrency for jobs that do not declare one. Counts whole jobs (Ragen's unit lesson).                                                                                                                                               |
| `JOBS_PREFIX`                                    | project slug | BullMQ key prefix, so two GatoJS apps can share one Redis. `^[a-z0-9_-]+$`.                                                                                                                                                                             |
| `JOBS_SHUTDOWN_TIMEOUT_MS`                       | `25000`      | How long `SIGTERM` waits for in-flight jobs before forcing close. Below Kubernetes' default 30 s grace.                                                                                                                                                 |
| `JOBS_WORKER_PORT`                               | `3100`       | The worker's HTTP port: `/health` always, the dashboard when configured (12.2).                                                                                                                                                                         |
| `JOBS_DASHBOARD_USER`, `JOBS_DASHBOARD_PASSWORD` | none         | Both set turns the dashboard on; one without the other stops the worker. The password must be at least 16 characters.                                                                                                                                   |
| `JOBS_DASHBOARD_READ_ONLY`                       | `true`       | `false` lets the dashboard retry, promote and remove jobs.                                                                                                                                                                                              |
| `JOBS_DB_POOL_MAX`                               | `5`          | The worker's Prisma pool size. `worker/main.ts` sets `DATABASE_POOL_MAX` from it before Prisma loads, so the worker uses a smaller pool than the web (default 10) and both fit Postgres' `max_connections`. The concurrency plan is fitted to it (8.6). |

There is no timezone variable: the app-wide default timezone is `timezone` in `src/gato.config.ts` (11.1), never the
environment or the container's `TZ`.

### 5.4 Compose

The Redis image is `redis:7-alpine`, as in the owner's projects (decision 17.1/1), pinned by digest in both files like
`minio`, started with `--maxmemory-policy noeviction --appendonly yes`.

Development `docker/jobs.compose.yml` (into `# wa:services` of `docker-compose.yml`): `redis` with
`${REDIS_PORT:-6379}:6379` published on the host, `./volumes/redis`, a `redis-cli ping` healthcheck, no password.

Self-hosted `docker/jobs.selfhost.compose.yml` (into `# wa:services` of `docker-compose.selfhost.yml`):

```yaml
redis:
  image: redis:7-alpine@sha256:<pinned>
  restart: unless-stopped
  command:
    [
      "redis-server",
      "--maxmemory-policy",
      "noeviction",
      "--appendonly",
      "yes",
      "--requirepass",
      "${REDIS_PASSWORD:?set REDIS_PASSWORD in .env.selfhost}",
    ]
  volumes:
    - ./volumes/redis:/data
  healthcheck:
    test: ["CMD-SHELL", "REDISCLI_AUTH=$$REDIS_PASSWORD redis-cli ping"]
    interval: 5s
    timeout: 3s
    retries: 10
  environment:
    REDIS_PASSWORD: ${REDIS_PASSWORD}
worker:
  build:
    context: .
    dockerfile: docker/worker.Dockerfile
  image: ${WORKER_IMAGE:-wa-worker:local}
  env_file: .env.selfhost
  environment: *app-environment
  depends_on:
    migrate:
      condition: service_completed_successfully
    redis:
      condition: service_healthy
  volumes:
    - uploads:/app/volumes/uploads
  stop_grace_period: 30s
  healthcheck:
    test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:3100/health"]
    interval: 10s
    timeout: 5s
    start_period: 20s
    retries: 5
  restart: unless-stopped
```

- No published port on `redis` or `worker`. The dashboard (12.2) is reached through an SSH tunnel or a local Compose
  override (`ports: ["127.0.0.1:3100:3100"]`), documented in `docs/self-hosting.md`, never on `0.0.0.0` by default.
- `REDIS_PASSWORD` is required by the `?` expansion; the `app` and `worker` read it from `.env.selfhost`
  (`selfhostExample: ""`, the operator fills it, as with `S3_SECRET_ACCESS_KEY`).
- The worker mounts the core `uploads` volume, because orphan cleanup on local storage reads the same directory.
- `stop_grace_period: 30s`: Docker's default 10 s would kill a job that `close()` was waiting for.
- A region inside `services:` cannot declare a top-level named volume (ADR-65), hence the bind mounts.

### 5.5 Railway and Helm

- **Railway:** a second service from the same repository, builder Dockerfile, Dockerfile path
  `docker/worker.Dockerfile`, or the published worker image (5.6). Variables: the app's shared variables plus
  `REDIS_URL` from a Railway Redis service (switched to `noeviction`; the boot check catches it if not). No pre-deploy
  migration (the app service runs it). Healthcheck path `/health` on `JOBS_WORKER_PORT`. **No public domain** on the
  worker service: the dashboard is reached through Railway's private network or a temporary TCP proxy; if an operator
  generates a domain anyway, the dashboard credentials are mandatory and the runbook says so. Documented in
  `docs/self-hosting.md` ("Railway"); no config-as-code file (ADR-67).
- **Helm:** **external Redis only** (decision 17.1/5). Core change to the chart: `worker.enabled` (default `false`),
  `worker.image.repository`/`tag` (default the app's repository with a `-worker` suffix and the app's tag),
  `worker.replicaCount`, `worker.resources`, `worker.dashboard.enabled` (default `false`), and
  `templates/worker-deployment.yaml`: the app's env and `existingSecret` (which must hold `REDIS_URL` and, if used,
  `REDIS_PASSWORD`), `terminationGracePeriodSeconds: 35`, liveness and readiness on `/health`. A `ClusterIP` Service
  for the dashboard only when `worker.dashboard.enabled`; **the chart never renders an Ingress for it**; access through
  `kubectl port-forward`. `NOTES.txt` says how.

### 5.6 Images and publishing

- `docker-publish.yml` (core, ADR-67) gains a second image when `docker/worker.Dockerfile` exists:
  `ghcr.io/<owner>/<repo>-worker`, same tags, platforms, provenance and SBOM as the app image. `docker-platforms.yml`
  builds it on both architectures and runs `node worker.mjs --check` in it (6.4).
- In the GatoJS repository the release publishes `ghcr.io/webamigos/gatojs-worker` beside `gatojs`.

### 5.7 Egress and ingress (ADR-66)

- ADR-66's list of configured endpoints gains **Redis (`REDIS_URL`)**. BullMQ, ioredis and bull-board make no other
  connection; bull-board's UI assets are served from its own package, not a CDN.
- `kit/egress-check` gains a `jobs` leg: the sealed stack with `redis` and `worker` (dashboard enabled), a scenario that
  triggers `jobs.run-now` for `uploads.orphans-daily` from the app, waits for the job to complete in the worker, and
  fetches the dashboard page inside the network. The canary rule is unchanged.
- `.github/workflows/egress-check.yml` adds `src/features/jobs/**`, `src/shared/lib/jobs/**`,
  `docker/worker.Dockerfile` and `docker/jobs.selfhost.compose.yml` to its path filter.
- Ingress: nothing in the stack publishes the worker port or Redis; the runbook lists the three ways to reach the
  dashboard (tunnel, local override, port-forward) and the rule "never public without credentials, and preferably never
  public".

## 6. The worker: a separate image without Next.js

### 6.1 Decision

The worker is a **separate entrypoint and a separate image** (decision 17.1/1, option B of the first draft), like
justnails and company-budget. It scales, deploys and restarts on its own, and it never carries a Next.js server. The
first draft's option C (the app image in a worker role) is dropped.

The risk of B is the one company-budget paid for: running the app's code outside Next. The rest of this section is how
the kit avoids each pitfall the three projects hit.

### 6.2 Entrypoint

`src/features/jobs/worker/main.ts`, in order:

1. Load env (`dotenv` in development only), `verifyEnvOnStartup` with the Next-free registry's env schemas (6.3).
2. Start tracing with `packages/observability` (the same exporters as `instrumentation.ts`, off unless
   `OTEL_EXPORTER_OTLP_ENDPOINT`), before Prisma and `http` load (company-budget's init order).
3. Build the job registry and apply `gato.config.ts` (7.2, 7.3).
4. Open the consumer connections; eviction check (refuse on an evicting Redis, warn when `CONFIG GET` is forbidden).
5. Build one `Worker` per enabled job with `autorun: false`; apply global concurrency.
6. Reconcile schedules (8.5) and register the organization-schedule tick (11.2).
7. Start the outbox relay (8.4).
8. Install `SIGTERM`/`SIGINT` (8.7), start the HTTP server (`/health`, optional dashboard), then `run()` every worker
   (Ragen's order: nothing consumes before the check passed and the shutdown handler exists).

`--check` runs steps 1 and 3 and exits 0: the image smoke test (5.6) and the bundle check (6.4) use it.

### 6.3 How the worker reaches module job handlers without Next.js

Today `@/modules.generated` is the only registry, and it is not Next-free: it imports slots (React components), message
loaders, better-auth plugins and component overrides. `emit-event.ts` and `audit.ts` import their lists from it, so any
job that writes an audit row or emits an event would pull the whole app into the worker. Core change:

- `wa generate` writes **`src/modules.data.generated.ts`** with only the plain-data module list (`modules`, the
  `module.ts` definitions after `applyGatoConfig`), imported by both registries and by `auth/permissions.ts`, which runs
  in the browser too and so can read neither the server registry (env schemas, subscribers) nor the client registry in
  the worker (component overrides import React) (decision 25).
- It writes a second server registry, **`src/server-registry.generated.ts`**, holding only plain-data and server-only
  lists: `modules` (re-exported), `moduleEnvSchemas`, `auditSinks`, `moduleEvents`, `moduleSubscribers`,
  `moduleCommandHooks`, `moduleSetups`, `authPlugins`, `moduleJobs`, `moduleSchedules`, `jobRuntimes`, `env`.
  `@/modules.generated` re-exports these and adds what needs React or Next (slots, messages).
- The spike (Task 0) measured which core files reach a registry on the worker's graph: `emit-event.ts`, `audit.ts`,
  `run-command.ts`, `env.ts` and `modules/setup.ts` (reached from the `organizations.created` subscriber) and
  `auth/index.ts` (reached from `auth/helpers.ts`) import `@/server-registry.generated`; `auth/permissions.ts` imports
  `@/modules.data.generated`. Nothing else changes for the app.
- The worker imports **only** `@/server-registry.generated`. **Rule (decision 17.1/14):** subscribers, audit sinks and
  command hooks also run in the worker (events emitted by jobs, `jobs.failed`, `trackAudit` in jobs, commands a job
  runs), so a file reachable from `jobs.ts`, `subscribers.ts`, `events.ts`, `audit-sink.ts`, `command-hooks.ts`,
  `setup.ts`, `auth.ts` or `module.ts` must not import React, Next or `@/modules.generated`. The only React the worker
  may load is mail rendering reached through `src/app/emails/` (decision 27). It is enforced twice: statically by an architecture
  test in `npm test`, and on the real bundle graph by the metafile check (6.4), which names the offending module file.
  It is documented in `docs/19b`, in the `AGENTS.md` Task Router row for jobs and in the `gato-extend` skill.
- A subscriber that needs `auth` keeps importing it dynamically inside `run`
  (ADR-61), and that dynamic import must also be Next-free (it is today: `@/shared/lib/auth` is better-auth, not Next).
- `src/gato.config.ts` is imported by the server registry, and it may hold component loaders
  (`replace: () => import("…")`). esbuild follows a literal `import()` into the bundle, so such a loader reaching a
  `.tsx` component fails the bundle check (6.4) with the file named; config component loaders stay in the client
  registry's `gato.config.ts` usage, never in a server-registry list.

### 6.4 The bundle and the known pitfalls

`npm run worker:build` (`worker/build.ts`) runs esbuild: entry `worker/main.ts`, `platform: "node"`, `format: "esm"`,
`target: "node22"`, output `.worker/worker.mjs`, `@/*` mapped to `src/`. It **bundles npm packages too**, `@gatojs/*`
workspace packages explicitly (they export TypeScript source, so they can never be external; decision 29), and the
generated Prisma client with `@prisma/client/runtime` (the PostgreSQL query compiler wasm is inlined; nothing is copied
beside the bundle). Only Node built-ins and a short `WORKER_EXTERNALS` list stay external: optional native modules
(`pg-native`, `msgpackr-extract`, `@valkey/valkey-glide`) and `sharp` if a job ever loads it (decision 30). The spike
ran the fully bundled 17 MB file from an empty directory with no `node_modules`.

Stubs (decision 26): `server-only` (empty), `next/cache` (no-op revalidation), and `next/headers`, `next/navigation`,
`next-intl/server`, `next-intl/navigation` and the project's `@/i18n/routing`, which load and throw a core
`WorkerUnavailableError("<name> is not available in the worker")` when called. `runCommand` imports the session layer
statically (`auth/helpers.ts`, `org-context.ts`, `require-module-access.ts`), which imports `next-intl`, so without the
`next-intl` stubs no job could reach a command. `handleCommandError` rethrows `WorkerUnavailableError` like a Next
redirect, so a job that reaches a session-based command fails with the stub's message, not with the command's generic
`failureMessage` (decision 31).

Then it reads esbuild's metafile and fails when the graph contains `next` or `next-intl` other than through the stubs,
`react-dom/client`, a `"use client"` file, a `.tsx` file outside `src/app/emails/`, `@/modules.generated` or
`@/modules.client.generated`, or `react`, `react-dom` or `@react-email/*` imported by anything other than a file under
`src/app/emails/` or `@react-email/*` itself (decision 27: React only for mail rendering). The error walks the
metafile's import chain back to the first file under `src/features/<module>/` and names it, for example:

```
worker bundle: src/features/invoices/subscribers.ts imports React
  via src/features/invoices/components/invoice-badge.tsx → react
subscribers, audit sinks, command hooks, setup.ts, auth.ts and jobs run in the worker and must not import React or Next (docs/19b)
```

| Pitfall (where it bit)                                                                                                                                  | Kit answer                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `revalidatePath` throws outside a request after the write committed (company-budget, `next-cache-shim.ts`)                                              | `next/cache` is replaced by a stub whose revalidation exports are no-ops. Job handlers call services, not server actions; the stub only protects shared service code that revalidates.                                                                                                                             |
| `next/headers`, `cookies()` imported at the top of a service the worker loads, so the worker crashed on import (company-budget made those imports lazy) | Every other `next/*` import resolves to a stub that loads fine and throws `"<name> is not available in the worker"` when called. A top-level import no longer breaks the worker; calling it in a job does, loudly, and the architecture test (14.4) forbids session helpers in job handler files.                  |
| `server-only` throws outside the `react-server` condition                                                                                               | Aliased to an empty module in the bundle. The `react-server` condition is not used, because it would also swap `react-dom/server`, which mail rendering needs.                                                                                                                                                     |
| App code ran as CommonJS under `tsx`, and a workspace package exporting only an `import` condition failed (company-budget lesson)                       | One module format everywhere: production and development both run the ESM bundle (6.6). The spike confirmed the risk: under `tsx` the app runs as CommonJS, ESM resolve hooks miss its `require` calls, and the registry → subscribers → event bus cycle threw a TDZ error that the bundle does not (decision 28). |
| A session helper reached through a command fails the job with a generic message (spike)                                                                 | `WorkerUnavailableError` from the stubs is rethrown by `handleCommandError` (decision 31).                                                                                                                                                                                                                         |
| Worker tests never ran in CI (justnails)                                                                                                                | The worker lives in `src/`, so `npm test`, `npm run typecheck` and the Stryker config already cover it; `verify:modules` runs `worker:build` and `worker:check` (`node .worker/worker.mjs --check` against a test env); the `assemble` matrix runs `verify` in every combination with `jobs`.                      |
| A second Prisma adapter major nested under the worker (justnails)                                                                                       | One `package.json`, one lockfile; esbuild bundles exactly what the builder stage installed from the root lockfile. No second dependency list exists to drift.                                                                                                                                                      |
| The worker cannot import the app's code, so it calls the app over HTTP with a shared secret (justnails `CRON_SECRET`)                                   | Not needed: the worker imports the modules' services through the server registry. No callback route, no shared secret.                                                                                                                                                                                             |
| Mail rendered in the request is stored in the payload (justnails)                                                                                       | Mail is rendered in the job from ids, with an explicit locale; `next-intl` request config is not available, so mail jobs use the messages loader with a locale argument (`docs/19b`).                                                                                                                              |

### 6.5 `docker/worker.Dockerfile`

Owned by the `jobs` module; the generator fills its `# wa:workspaces:start/end` region like the core `Dockerfile`'s
(kitFormat 12). Stages: `deps` (`npm ci --ignore-scripts` with the workspace `package.json` files), `builder`
(`prisma generate`, `npm run worker:build`), `runner` (`node:22-alpine`, non-root user, `NODE_ENV=production`,
`CHECKPOINT_DISABLE=1`, copies `.worker/` and `prisma/`, `EXPOSE 3100`, `HEALTHCHECK` on `/health`,
`CMD ["node", ".worker/worker.mjs"]`). There is **no `prod-deps` stage** while `WORKER_EXTERNALS` needs no install
(decision 30); if a job adds `sharp`, a stage installs only the listed packages at the lockfile's versions. The image
has no `node_modules` of the web stack, no `.next`, no Next server and no `tsx`: about 181 MB in the spike's estimate
(base image 164 MB + a 17 MB bundle) instead of 283 MB or more with production `node_modules`.

### 6.6 Development

`npm run dev` runs the web as today. `npm run worker:dev` runs `build.ts --dev`: esbuild `context().watch()` with the
production plugin and stubs writes `.worker/dev/worker.mjs`, and a child `node --watch` restarts the worker when the
bundle changes (about 100 ms per rebuild in the spike; decisions 17.1/11 and 28), with `docker compose up -d redis`. `docs/19` and the project README show both commands;
`JOBS_WORKER_PORT` keeps the worker off port 3000.

## 7. Declaring jobs and schedules

### 7.1 `jobs.ts`

```ts
import { z } from "zod";
import { defineJobs, defineSchedules } from "@/shared/lib/jobs";
import { pruneAuditLogs } from "./services/jobs/prune-audit-logs";
import { dispatchAuditLogPruning } from "./services/jobs/dispatch-audit-log-pruning";

const retentionSettings = z.object({
  olderThanDays: z.number().int().min(1).max(3650),
});

export const jobs = defineJobs({
  "audit-logs.prune": {
    scope: "organization",
    payload: retentionSettings,
    attempts: 3,
    globalConcurrency: 1,
    run: (payload, ctx) => pruneAuditLogs(payload.olderThanDays, ctx),
  },
  "audit-logs.prune-dispatch": {
    scope: "system",
    payload: retentionSettings,
    attempts: 3,
    globalConcurrency: 1,
    run: (payload, ctx) => dispatchAuditLogPruning(payload, ctx),
  },
});

export const schedules = defineSchedules({
  "audit-logs.prune-daily": {
    job: "audit-logs.prune-dispatch",
    cron: "0 3 * * *",
    enabledByDefault: false,
    settings: retentionSettings,
    defaultSettings: { olderThanDays: 365 },
  },
});
```

A job definition:

| Field               | Meaning                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| key                 | `<module>.<name>`, kebab-case after the dot. Also the BullMQ job name.                                                                                                                                                  |
| `scope`             | `"organization"` (the envelope carries an `organizationId`, the handler runs inside that organization's scope, 9.1) or `"system"` (no organization; dispatchers and cross-organization maintenance, 9.3).               |
| `payload`           | A strip-mode `z.object()` (the ADR-61 rule): no `organizationId`, `actorUserId`, `serviceMode` or `cause` key, no loose/strict/catchall, no `.transform()` around it, no key from the sensitive-name list (section 13). |
| `run(payload, ctx)` | The handler. Returns `void` or a small JSON value (kept as the BullMQ return value, capped at 10 kB).                                                                                                                   |
| `attempts`          | Default 3. `1` for anything that sends mail or calls a non-idempotent external API.                                                                                                                                     |
| `backoff`           | Default `{ type: "exponential", delayMs: 5000 }`.                                                                                                                                                                       |
| `concurrency`       | Per worker process. Default `JOBS_CONCURRENCY`.                                                                                                                                                                         |
| `globalConcurrency` | Across every worker replica (BullMQ `setGlobalConcurrency`). `1` for maintenance that must not overlap.                                                                                                                 |
| `lockDurationMs`    | Default 30 000 (BullMQ's). Raise for CPU-bound handlers. `maxStalledCount` is always 1.                                                                                                                                 |
| `timeoutMs`         | Optional. `ctx.signal` aborts after it; the job fails with `JobTimeoutError` (retryable). The work is abandoned, not killed (Ragen); handlers pass `ctx.signal` on.                                                     |
| `retain`            | Default `{ completed: { ageSeconds: 86400, count: 1000 }, failed: { ageSeconds: 604800, count: 5000 } }`.                                                                                                               |

A schedule definition: key `<module>.<name>`; `job`; `cron` (five fields only); `timezone` (an IANA name, or
`"organization"`, 11.2); `enabledByDefault`; optional `settings` schema and `defaultSettings` (they become the job
payload, overridable in `gato.config.ts`). A schedule with a fixed or default timezone targets a `system` job of the same
module; a schedule with `timezone: "organization"` targets an `organization` job of the same module and fires once per
organization at its local time.

### 7.2 Registry check

`createJobRegistry(moduleJobs, moduleSchedules, moduleSubscribers, gatoConfig)` validates every entry, enabled module or
not, and throws one `JobRegistryError` listing every problem (the `createEventBus` and `commandHookRegistry` style):

- key without the module prefix, or not `^[a-z0-9-]+\.[a-z0-9-]+$`; duplicate job or schedule key;
- payload schema that is not a strip-mode `z.object()`, declares a reserved key, or a sensitive key name;
- `attempts`, `concurrency`, `globalConcurrency` not positive integers; `lockDurationMs` below 5 000;
- schedule of an unknown job or of a job in another module; scope mismatch between the schedule's timezone mode and the
  job's scope (7.1);
- a cron that is not five fields or that BullMQ's parser rejects (six fields mean seconds-first in BullMQ; Ragen's
  lesson);
- a timezone that is neither an IANA name nor `"organization"`;
- `defaultSettings` failing `settings`, or a `gato.config.ts` override (7.3) failing it;
- a queued subscriber (11.3) of an unknown job, of a `system` job, or in a module that does not `require` `jobs`.

A test builds the registry from the real `@/server-registry.generated`, so a bad declaration fails `npm test`.

### 7.3 Configuration in `gato.config.ts`

```ts
export default defineGatoConfig({
  timezone: "Europe/Warsaw",
  modules: {
    "audit-logs": {
      schedules: {
        "audit-logs.prune-daily": {
          enabled: true,
          cron: "30 2 * * *",
          settings: { olderThanDays: 180 },
        },
      },
    },
    uploads: { schedules: { "uploads.orphans-daily": null } },
  },
});
```

- `timezone` (top level, core): the app-wide default timezone for schedules and for organizations that have none
  (11.1). Validated with Zod (`z.string().refine(isIanaTimeZone)`: `"UTC"` or a name in
  `Intl.supportedValuesOf("timeZone")`), default `"UTC"`. The first revision called it `jobs.timezone`; it moved to the
  top level because date display uses it too, and core cannot depend on a `jobs` key.
- `modules.<module>.schedules.<id>`: `enabled`, `cron`, `timezone`, `settings`, or `null` to disable. Unknown ids fail
  `applyGatoConfig` at import (ADR-60). `settings` are validated against the schedule's schema in the registry check.
- The config stays client-safe plain data.

### 7.4 Generator

`wa generate` (gato-cli minor bump, `kitFormat` 12):

- writes `src/server-registry.generated.ts` (6.3) and makes `@/modules.generated` re-export it;
- detects `jobs.ts` and emits `moduleJobs` and `moduleSchedules` (all modules, like `moduleEvents`, so a disabled
  module's declarations are still checked);
- detects `job-runtime.ts` and emits `jobRuntimes = enabledEntries([{ module: "jobs", value: jobsJobRuntime }],
gatoConfig)` (the `auditSinks` pattern);
- merges manifest `scripts` into `package.json` and composes `verify:modules` (5.1);
- fills `# wa:workspaces` in `docker/worker.Dockerfile` when it exists;
- adds `JobName` and `ScheduleId` unions and "Jobs" and "Schedules" sections to the extension-point catalog (19).

### 7.5 Enqueueing

```ts
await prisma.$transaction(async (tx) => {
  const invoice = await tx.invoice.create({ data: { organizationId: context.organizationId, … } });
  await enqueueJob(jobOrigin(context), "invoices.render-pdf", { invoiceId: invoice.id }, { tx, jobKey: invoice.id });
});
```

- `jobOrigin(context: OrgContext)` → `{ organizationId, actorUserId, serviceMode }`; `jobOrigin(event)` from a
  subscriber's event; `systemOrigin(reason)` for `system` jobs. An `organization` job with a system origin, or the
  reverse, throws.
- The payload is parsed with the job's schema before anything is written; failure throws `JobPayloadError`.
- `tx` (a Prisma transaction client) writes the outbox row in the caller's transaction (8.4). Without `tx` the row is
  written on its own and the job is still durable from that moment.
- Options: `jobKey` (one unit of work: a second enqueue with the same key in the same organization is a no-op, enforced
  by a unique index on the outbox and by the BullMQ job id), `coalesceKey`, `delayMs`. Keys are hashed with the organization and the job name into `<job>-<sha256 hex, 40 chars>`, so
  keys never collide across organizations and ids never contain `:` or only digits.
- **Coalescing** (`coalesceKey`, replacing the first draft's plain `dedupeKey`): the relay adds the job with BullMQ
  `deduplication: { id, keepLastIfActive: true }`. Per key there is at most one active and one waiting job, and the
  waiting one carries the **latest** payload, so a burst of "recompute X" triggers runs once more after the current run
  with the newest data, instead of being dropped while one is in flight (open-mercato's coalescing spec).
  `keepLastIfActive` exists from BullMQ 5.72; the dependency is pinned above that and a test asserts the option exists in
  the installed version. BullMQ ignores `ttl` with `keepLastIfActive`, so the kit never sets one.
- **Coalescing and delay:** collapsing two enqueues also collapses their schedules: the surviving job keeps one delay, so
  an immediate trigger behind an hour-delayed twin would wait an hour, or the reverse. `enqueueJob` therefore rejects
  `coalesceKey` together with `delayMs` (`JobOptionsError`); delayed work carries its own `jobKey` or no key
  (`docs/19b`).
- Returns `{ outboxId }`. Throws `JobsUnavailableError` without the module. Redis is never contacted, so enqueueing works
  while Redis is down; jobs wait in the outbox.

### 7.6 The envelope

What BullMQ stores is never the raw payload:

```ts
{ v: 1, organizationId: string | null, actorUserId: string | null, serviceMode: boolean, cause: "jobs.failed" | null,
  trace: { traceparent: string, tracestate?: string } | null, failedReportedAt: string | null, payload: { … } }
```

`trace` is the W3C trace context of the span that enqueued the job (the request, the subscriber, or the parent job),
captured by `enqueueJob` from the active OpenTelemetry context and stored outside the payload, in the envelope and in
the outbox row (`traceparent` column). It is `null` when telemetry is off, so a job carries nothing extra unless tracing
is active (open-mercato's `attachTraceMetadata`). `failedReportedAt` is the acknowledgement of the `jobs.failed`
report (11.4).

The consumer parses the envelope strictly and the payload with the job's schema. A mismatch (a job written by an older
release, company-budget's `crm-sync` case) fails with `UnrecoverableError("payload does not match <job> v1")`, logged
without the payload: never retried, never silently skipped. Changing a payload incompatibly is a migration: accept both
shapes for one release, or drain first (`docs/19b`). `cause` marks jobs enqueued by a `jobs.failed` subscriber (11.4).

## 8. Running jobs

### 8.1 The handler context

`run(payload, ctx)` receives a frozen `ctx`:

| Field                             | Meaning                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizationId`                  | `string` for `organization` jobs, absent for `system` jobs (typed per scope). Always from the envelope.                                      |
| `actorUserId`, `serviceMode`      | From the origin; audit rows written by the job carry them.                                                                                   |
| `timezone`                        | For `organization` jobs the organization's effective timezone (11.1); for `system` jobs the schedule's resolved timezone or the app default. |
| `jobId`, `attempt`, `maxAttempts` | For logs and idempotency keys.                                                                                                               |
| `signal`                          | `AbortSignal`: aborted on `timeoutMs` and on forced shutdown.                                                                                |
| `log`                             | The GatoJS logger bound to `{ job, jobId, organizationId, attempt }`.                                                                        |
| `progress(stage)`                 | `job.updateProgress({ stage })`; a Redis error here is logged, never fails the job.                                                          |
| `enqueue(name, payload, options)` | `enqueueJob` with the job's own origin (and `tx` when given); for fan-out (9.3).                                                             |

The consumer runs every handler inside a span `job <name>` of kind `consumer`, continuing the trace from
`envelope.trace` (with no carrier, or telemetry off, a fresh root span, or nothing). The relay's `queue.add` runs in a
`producer` span of the same trace. A request, the job it enqueued, and the jobs and events that job caused therefore
show as one trace in the collector. Span attributes: job name, job id, attempt, organization id; never the payload.

There is no session: a handler must not call `getOrgContext`, `requireModuleAccess`, `headers()` or `cookies()`. It calls
services that take `organizationId` as an argument (in the worker those Next helpers are throwing stubs, 6.4). A query in
`services/queries/` that starts with `getOrgContext()` cannot be reused from a job; the pattern is an inner function with
an explicit organization, which the query wraps.

### 8.2 Failures and retries

- A thrown error is retried up to `attempts` with the job's backoff.
- `throw new JobFailure(message, { retryable: false })` (or a `DomainError`) becomes BullMQ's `UnrecoverableError`.
- A job name with no handler in this worker fails with `UnrecoverableError("no handler for <job>")`, logged at `error`.
- After the last attempt, an organization job emits `jobs.failed` (11.4); so does a job that never got to report,
  because it stalled past `maxStalledCount` or its worker died (11.4 describes the sweep that catches those).
- **A missing organization is a quiet skip.** Before an organization job's handler runs, the consumer checks that the
  organization still exists (one `findUnique` by id). If not, it logs `info` ("organization gone, job skipped"),
  completes the job without running the handler, does not retry and emits no `jobs.failed`. A job that started before
  the deletion and fails on a vanished row is retried, and its next attempt takes the same skip.

### 8.3 Idempotency

Delivery is **at least once**: a crash, a stall, a lost lock or a relay crash (8.4) re-runs or re-adds a job. Rules, in
`docs/19b`:

1. Write handlers so a second run is harmless: `deleteMany` with a cutoff, upserts on a natural key, compare-and-set
   claims (`updateMany({ where: { id, status: "PENDING" } })`) before acting.
2. Side effects outside the database (mail, an external API) run once: `attempts: 1`, or record "sent" first.
3. `jobKey` for "this exact unit of work", `coalesceKey` for "run again with the latest data, but never two at once".

### 8.4 The transactional outbox

Decision 17.1/6: every enqueue goes through a Postgres table, so a job is committed or rolled back with the write that
caused it. Redis is touched only by the relay in the worker.

**Model** (`prisma/schema/jobs.prisma`, `jobs` module):

```prisma
model JobOutbox {
  id               String        @id @default(uuid()) @db.Uuid
  organizationId   String?       @map("organization_id")
  job              String
  envelope         Json
  keyHash          String?       @unique @map("key_hash")
  coalesceKey      String?       @map("coalesce_key")
  traceparent      String?
  availableAt      DateTime      @default(now()) @map("available_at") @db.Timestamptz
  createdAt        DateTime      @default(now()) @map("created_at") @db.Timestamptz
  dispatchedAt     DateTime?     @map("dispatched_at") @db.Timestamptz
  dispatchAttempts Int           @default(0) @map("dispatch_attempts")
  lastError        String?       @map("last_error")

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([dispatchedAt, availableAt, createdAt])
  @@index([organizationId, createdAt])
  @@map("job_outbox")
}
```

**Insert (`enqueueJob`).** One `INSERT` through the caller's `tx` (or the shared client), with `organizationId` from the
origin, the full envelope, `keyHash` from `jobKey`, `availableAt = now() + delayMs`, and in the same transaction
`SELECT pg_notify('gato_job_outbox', '')`. Postgres delivers a notification only when the transaction commits, so the
relay wakes exactly when there is committed work. An organization insert satisfies the tenant-scope guard with its own
`organizationId`; a `system` insert (`organizationId` null) runs inside `withoutTenantScope("jobs: system job
enqueue", …)` in the seam. A duplicate `keyHash` is caught and returned as the existing row (`{ outboxId, duplicate:
true }`).

**Relay (who moves rows to BullMQ).** The worker runs it; every replica may, safely:

1. It `LISTEN`s on `gato_job_outbox` through a dedicated `pg` connection and also polls every 5 s (a missed
   notification, or rows whose `availableAt` passed, are picked up by the poll).
2. One claim per wake, in a transaction, as raw SQL (the tenant-scope extension does not see raw queries; the relay is
   the one place allowed to read across organizations, and its file is in the critical list):
   `SELECT … FROM job_outbox WHERE dispatched_at IS NULL AND available_at <= now() ORDER BY created_at, id LIMIT 100
FOR UPDATE SKIP LOCKED`. Two relays never claim the same row.
3. For each row, in order: check `envelope.organizationId` equals the row's `organizationId` (a mismatch is a bug:
   the row is marked failed with `lastError`, never dispatched); skip rows whose job is not in this worker's registry
   (left pending, shown on the admin page, so a rolling deploy or a temporarily disabled module loses nothing);
   `queue.add(job, envelope, { jobId: keyHash ?? outbox id, deduplication: coalesceKey && { id, keepLastIfActive: true },
attempts, backoff, retention })` in a `producer` span continuing the row's trace.
4. `UPDATE … SET dispatched_at = now()` for the added rows, `dispatch_attempts + 1, last_error` for failed adds, then
   commit. Redis calls inside the transaction are bounded by the batch size and ioredis' command timeout (5 s).

**Idempotency.** A relay that crashes after `queue.add` and before the commit leaves the rows undispatched; the next
claim adds them again with the same `jobId`, which BullMQ treats as a no-op while the job exists (completed jobs are
kept 24 h, failed 7 days, far longer than the crash window). A handler still follows 8.3, because BullMQ itself
redelivers stalled jobs.

**Ordering.** Rows are claimed and added in `(createdAt, id)` order, and each queue is FIFO, but concurrency, retries,
several replicas and per-job queues mean **no ordering guarantee between jobs**; `docs/19b` says so.

**Cleanup.** The `jobs` module ships a `system` job and schedule, `jobs.outbox-prune` / `jobs.outbox-prune-daily`
(`15 4 * * *`, enabled by default): deletes dispatched rows older than 7 days in batches of 5 000, inside
`withoutTenantScope("jobs: prune dispatched outbox rows", …)`. Undispatched rows are never deleted automatically. An
organization's rows cascade with the organization. `jobKey` therefore deduplicates for 7 days in the outbox and for the
BullMQ retention after that; `docs/19b` says so.

**Visibility.** `/health` on the worker reports `outbox.pendingCount` and `outbox.oldestPendingSeconds`; the admin page
(12.1) shows them and lists rows with `dispatchAttempts >= 10`.

What the outbox does not close: an event subscriber runs after commit (ADR-61), so a queued subscriber's insert (11.3)
happens after the operation's transaction; a crash in between loses it. Commands that need atomicity enqueue with `tx`
themselves.

### 8.5 Schedules

On boot, before consuming:

1. Compute the effective app-wide schedules: declared ∩ enabled modules, `gato.config.ts` overrides applied, disabled
   removed, timezone resolved (override → declaration → `timezone` in `gato.config.ts` → `"UTC"`), never left to the
   container's `TZ` (decision 17.1/3).
2. `upsertJobScheduler(scheduleId, { pattern, tz }, { name: job, data: envelope(systemOrigin, settings) })` for each,
   always with an explicit `tz`. Scheduler-fired jobs go straight to BullMQ, not through the outbox (there is no
   transaction to join).
3. List the schedulers this app owns (`getJobSchedulers` under `JOBS_PREFIX`) and remove every id not in the effective
   set, so a deleted or disabled schedule stops firing (company-budget's gap) and a restart cannot revive one.
4. Organization-timezone schedules are not BullMQ schedulers; the tick in 11.2 runs them.

Missed slots are not back-filled. Destructive schedules ship `enabledByDefault: false` unless losing their target is
harmless.

### 8.6 Queues and concurrency

- One BullMQ queue per job (`<prefix>` + job key), so a slow job cannot starve another. One `Worker` per queue, each with
  its own blocking connection; the relay shares one producer connection. `docs/19` gives the connection formula
  (`jobs + 2` per worker replica, plus one per web replica for the admin page).
- `globalConcurrency` is applied before the queue's `Worker` runs.
- **Postgres connection budget** (open-mercato's `worker-connection-budget.ts`). Each running job may hold a pooled
  connection, so the worker's peak demand is the sum of every queue's concurrency plus the relay's claim transaction and
  one for the sweeps and the organization tick. At boot the worker computes a plan: the budget is `JOBS_DB_POOL_MAX`
  minus those two; if the requested sum exceeds it, each job's effective concurrency is reduced proportionally with a
  floor of 1. The plan (requested, effective, budget, clamped) is logged at `info`, a clamp at `warn`, and a budget
  smaller than the number of queues (the floor forces the total over it) at `error`, naming the variable to raise.
  The `LISTEN` connection is outside the pool. `docs/19` gives the Postgres formula: web replicas × `DATABASE_POOL_MAX`
  - worker replicas × (`JOBS_DB_POOL_MAX` + 1) must stay below `max_connections` minus a reserve.

### 8.7 Shutdown

The worker's `SIGTERM`/`SIGINT` handler (once): `/health` answers 503; stop the relay (finish the current claim);
`worker.close()` on every worker in parallel (waits for in-flight jobs) with `JOBS_SHUTDOWN_TIMEOUT_MS`, after which
`ctx.signal` aborts and `close(true)` forces; close the producer queues and the `LISTEN` connection;
`prisma.$disconnect()`; close the HTTP server; flush OTel last (justnails); `process.exit(0)`. A forced close leaves
locked jobs, redelivered once after their lock expires (`maxStalledCount: 1`).

## 9. Multi-tenancy

### 9.1 Organization jobs are held to their organization

Decision 17.1/8, a critical core change in `src/shared/lib/tenant-scope/`:

- `organizationId` lives in the envelope only. The payload schema cannot declare it and is parsed in strip mode
  (ADR-61's rule). The origin comes from an `OrgContext` (after `getOrgContext()` or `requireModuleAccess()` and
  `assertServiceModeConfirmed`), from an event, or from a dispatcher's explicit fan-out (9.3).
- The consumer runs an organization job's handler inside `runInOrganizationScope(organizationId, fn)`, an
  `AsyncLocalStorage` scope shared through `globalThis` like the bypass store.
- While the scope is set, the guard checks the **value**, not only the presence, of the organization filter on every
  query on a tenant-scoped model: the `where.organizationId` (or `data.organizationId` on create, every element on
  `createMany`) must be the scope's id, as a string, `{ equals: id }` or `{ in: [id] }`. Another id, an `in` list with
  any other id, `not`, a missing filter, or a nested write that targets another organization's row throws
  `TenantScopeError("<model>.<operation> outside job organization")`.
- `withoutTenantScope` inside an organization scope throws (`"withoutTenantScope is not allowed in an organization
job"`): an organization job never reads across organizations. Raw queries are not covered (as today) and are
  forbidden in job handler files by the architecture test (14.4).
- Outside a job, behaviour is unchanged. Adopting the same scope for requests (`getOrgContext` setting it) is a natural
  follow-up, not part of this spec.

### 9.2 Service mode

- Service mode belongs to the operation that enqueued the job. The command already passed `assertServiceModeConfirmed`;
  the job asks nothing and carries `serviceMode: true` in its origin, so audit rows written by the job record it.
- The admin page's commands (`jobs.retry`, `jobs.run-now`) are `access: "global-admin"` commands (ADR-62): they act on
  the platform's queue, not on organization data, so no service-mode dialog. **They are audited** (decision 17.1/7,
  revised; 12.1): every attempt that reaches the command, success or refusal, writes one audit row attributed to the
  admin who triggered it.
- `organizations.update-timezone` (11.1) is organization data: it goes through `runCommand` and therefore through the
  service-mode confirmation; the UI calls it through `useServiceModeAction().run`.

### 9.3 Cross-organization maintenance

`system` jobs have no organization and no scope. Two patterns, in order of preference:

1. **Dispatch, then per organization:** the system job reads organization ids (`Organization` is not tenant-scoped) and
   calls `ctx.enqueue("<module>.<job>", payload, { organizationId, jobKey: "<slot>" })` per organization. The only way
   to build an organization origin from an id; it checks the organization exists and logs the dispatch. Retention and
   orphan cleanup use it.
2. **`withoutTenantScope(reason, fn)`** only for a Prisma query on a tenant-scoped model that genuinely spans
   organizations, and only in `system` jobs. Neither first consumer needs it.

### 9.4 A deleted organization's jobs

Decided by the coordinator (17.1/23): core emits a new domain event, and the `jobs` module subscribes to it.

- **The event.** `organizations.deleted` `{ name }` (core, `src/shared/lib/events/core-events.ts`), emitted by the core
  better-auth events plugin (`events-plugin.ts`) for `/organization/delete`: a `before` hook reads the organization's
  name through the adapter (the same technique as the previous role for `member-role-changed`), the `after` hook emits
  on success with origin `{ organizationId: <deleted id>, actorUserId: <session user> }` (the ADR-70 actor rule). A
  failed delete emits nothing. This closes the gap ADR-61 recorded ("`/organization/delete` emits nothing"), and ADR-61
  is amended accordingly.
- **What a subscriber may do with it.** The organization and everything that cascades with it (memberships, audit rows,
  outbox rows, slots) are already gone when subscribers run. A subscriber of `organizations.deleted` must not write
  organization-scoped rows for that id (the foreign key would fail); it cleans up what lives outside the database or
  outside the cascade. The registry check (7.2) rejects a **queued** subscriber of `organizations.deleted`, because a
  queued subscriber enqueues an organization job, whose outbox row would reference the deleted organization.
- **The jobs module's subscriber** (`src/features/jobs/subscribers.ts`, plain, not queued) enqueues the **system** job
  `jobs.purge-organization` `{ removedOrganizationId }` with `systemOrigin("organization deleted")`. A system job's outbox
  row has `organizationId: null`, so it has no foreign key to the deleted organization and does not cascade: the purge
  is durable even though everything else of that organization is gone. (`removedOrganizationId` is a payload key, not
  the reserved `organizationId`, and it is only an id of something that no longer exists.)
- **The purge.** The job scans the waiting, delayed and prioritized jobs of every queue under `JOBS_PREFIX` and removes
  those whose `envelope.organizationId` is that id. Active jobs finish or take the quiet skip (8.2), which also covers
  whatever the purge misses.
- **Audit.** `audit-logs` could subscribe too, but its rows belong to an organization and cascade with it, so a row
  filed into the deleted organization cannot exist. Recording deletions needs a platform-level audit scope, which is
  not part of this spec; until then `audit-logs` does not subscribe, and the event is logged at `info` by the bus.
- A subscriber error never fails the delete (ADR-61).

## 10. First consumers

### 10.1 Audit-log retention (`audit-logs` module)

- `audit-logs.prune-dispatch` (system) → `audit-logs.prune` (organization) per organization, payload
  `{ olderThanDays }`.
- `audit-logs.prune` deletes in batches inside its organization scope: `findMany({ where: { organizationId, createdAt:
{ lt: cutoff } }, select: { id }, take: 5000, orderBy: { createdAt: "asc" } })` then `deleteMany({ where: {
organizationId, id: { in: ids } } })`, until fewer than 5 000 rows come back or `ctx.signal` aborts. The cutoff is
  computed once per run from the job's first attempt time (`startOfDay(firstAttemptAt, UTC) - olderThanDays`), so a
  retry deletes the same set.
- Then, **only when it deleted at least one row** (decisions 17.1/7 and 17.1/15), it writes one audit row for the
  organization: action `audit-log.pruned`, entity type `audit_log`, `newData: { deleted, cutoff, olderThanDays }`,
  `userId: null`, `channel: "SYSTEM"`. A run that deleted nothing writes no row, so a quiet organization's log does not
  fill with nightly `deleted: 0` entries.
- `AuditChannel` gains `SYSTEM`: core type in `src/shared/lib/audit.ts`, Prisma enum value and migration in
  `audit-logs`, label "System" on the audit log page. Inside a job, `trackAudit` defaults the channel to `SYSTEM` (the
  job runner sets it in an `AsyncLocalStorage`), so audit subscribers running in the worker record it too.
- Schedule `audit-logs.prune-daily`, `0 3 * * *`, **disabled by default** (decision 17.1/2), default
  `olderThanDays: 365`, in the app-wide timezone.
- The existing `@@index([organizationId, createdAt])` serves the query.

### 10.2 Orphaned uploads (`uploads` module)

Where orphans come from today (verified in `create-upload.ts` and `upload-commands.ts`):

| Source                                                                                        | Result                          |
| --------------------------------------------------------------------------------------------- | ------------------------------- |
| `putObject` succeeded, `prisma.upload.create` failed, rollback `deleteObject` failed (logged) | object, no row                  |
| `uploads.delete`: `deleteObject` failed (logged), row deleted anyway                          | object, no row                  |
| organization deleted (`Upload` rows cascade, storage untouched)                               | every object under `orgs/<id>/` |
| process killed between `putObject` and `create`                                               | object, no row                  |

Changes:

- `ObjectStorage` gains `list(prefix, cursor?) → { items: { key, lastModified }[], cursor? }` (S3 `ListObjectsV2`, local
  directory walk confined by `path-inside.ts`).
- `uploads.orphans` (organization): lists `orgs/<organizationId>/` and deletes each object older than the grace period
  (default 24 h) whose key has no `Upload` row in that organization; pages of 1 000 keys.
- `uploads.orphans-dispatch` (system): enqueues `uploads.orphans` per organization, then **purges the storage of deleted
  organizations by default** (decision 17.1/3): lists the top-level `orgs/` prefixes, keeps only ids shaped like
  organization ids (better-auth `cuid`s, `^[a-z0-9]{20,32}$`; the first draft wrongly said UUIDs), and deletes each
  prefix whose id is absent from `Organization`, only when `Organization` is not empty.
- **Circuit breaker:** if one run would delete more than `maxObjectsPerRun` (default 10 000) objects or more than
  `maxOrganizationsPerRun` (default 20) whole prefixes, it deletes nothing, logs `error` with the counts and fails
  unrecoverably (which emits nothing: `jobs.failed` is for organization jobs; the admin page shows the failure).
- Schedule `uploads.orphans-daily`, `30 3 * * *`, enabled by default, `settings: { graceHours: 24, maxObjectsPerRun:
10000, maxOrganizationsPerRun: 20, purgeDeletedOrganizations: true }`.
- Pending `uploads.orphans` jobs of an organization deleted meanwhile are removed by `jobs.purge-organization` or
  skipped quietly (9.4); the dispatcher's purge of the deleted organization's storage still runs.
- Out of scope: rows whose object is missing (counted in a warning) and rows nothing in the domain references.

## 11. Time and events

### 11.1 Organization timezone

Decision 17.1/12.

- **Data.** `Organization.timezone String?` (core migration in `prisma/schema/organizations.prisma`, declared to
  better-auth as an `additionalFields` entry with `input: false`, so `/organization/create` and `/organization/update`
  cannot set it). `null` means "the app default": the effective timezone is `organization.timezone ?? gatoConfig.timezone
?? "UTC"`, resolved by `resolveTimezone` in `src/shared/lib/timezone/`. A changed app default therefore moves every
  organization that never chose one.
- **Context.** `OrgContext` gains `timezone` (effective), read with the organization row `getOrgContext()` already
  resolves; the job context gets the same value for organization jobs.
- **Command.** `organizations.update-timezone` (`defineCommand`, `access: "member"`, permission
  `organizations.manage-settings`, default roles `owner`, `admin`, changeable under
  `modules.organizations.permissions`), input `{ timezone: string | null }` validated as an IANA name. Through
  `runCommand`, so service mode asks for confirmation. Unchanged value → success, no event. Otherwise it emits
  `organizations.timezone-changed` `{ previous, timezone }` with the actor who changed it (the ADR-70 actor rule).
- **Audit.** `audit-logs` subscribes and writes `organization.timezone_changed` (`oldData`/`newData`, `serviceMode` from
  the event).
- **UI.** A new core page `/organization` ("Organization settings", `organizations` module, `PageHeader` from #139), nav
  item `organizations.settings` shown to members with `organizations.manage-settings`. A searchable select (cmdk) over
  `Intl.supportedValuesOf("timeZone")` labelled with the current UTC offset, and "Use the app default (<zone>)" for
  `null`, submitted through `useServiceModeAction().run`. A slot `organizations.settings.sections` (experimental) lets
  modules add settings later. Works with `MULTI_ORG` on and off.
- **Date display.** `formatDateTime(date, { timeZone, locale, style })` in `src/shared/lib/timezone/`. Server components
  pass `context.timezone`; client components read it from a `TimezoneProvider` in the app layout. The existing date
  displays switch to it (audit log, API keys created/expires/last used, users and invitations); date inputs that mean a
  calendar day (API key expiry) are converted at the organization's midnight. Each module gets a version bump.
- **Personal timezone: future work, not v1** (decision 17.1/13). The shape kept for later: `User.timezone String?` on
  the account page, overriding the organization's zone for display only, never for schedules; per ADR-71 it emits no
  organization event and no audit row.

### 11.2 Organization-facing schedules

A schedule with `timezone: "organization"` fires once per organization at that organization's local time ("08:00 every
weekday" means 08:00 in each organization's zone).

- The `jobs` module runs a `system` job `jobs.organization-schedules-tick` every minute (a BullMQ scheduler in UTC).
- State: `JobOrganizationSlot { organizationId, scheduleId, lastSlotAt }`, `@@unique([organizationId, scheduleId])`
  (`jobs` module schema).
- For each enabled organization schedule and each organization (batches of 500), the tick computes the latest slot due
  in `(lastSlotAt, now]` in the organization's effective timezone (at most 2 h back after downtime; a schedule never run
  starts at the first slot after it was enabled, no backfill). In one transaction per organization it claims the slot
  (compare-and-set on `lastSlotAt`) and enqueues the organization job through the outbox with `tx` and
  `jobKey = "<scheduleId>-<slot ISO>"`. The claim and the job commit together, so a slot is never lost or run twice:
  the benefit of the outbox that company-budget had to build by hand (its agent schedule dispatcher).
- The tick reads the slot table across organizations inside `withoutTenantScope("jobs: organization schedule tick",
…)`; the per-organization claim and enqueue filter by that organization.
- DST: a slot in the skipped spring hour does not fire that day; the repeated autumn hour fires once (the claim
  compares instants). `docs/19b` advises against local times between 01:00 and 03:00.
- No kit module ships an organization schedule in v1; the `invoices` contract fixture gets one (`invoices.daily-summary`
  at 08:00 organization time) so `assemble` exercises the path.

### 11.3 Queued subscribers

Decision 17.1/10.

```ts
export const subscribers = defineSubscribers({
  "uploads.deleted": {
    id: "invoices.detach-file",
    queued: {
      job: "invoices.detach-file",
      payload: (event) => ({ uploadId: event.payload.uploadId }),
    },
  },
});
```

- The bus (ADR-61) delivers a queued subscriber by calling `enqueueJob(jobOrigin(event), job, payload(event), { jobKey
})` instead of running code inline: an outbox insert, after the operation succeeded, one at a time in registry order
  like any subscriber. An insert error is logged as a subscriber failure and never rethrown.
- The job must be an `organization` job; the subscriber's module must `require` `jobs` (registry check, 7.2). The job
  runs with the event's organization, actor and service-mode flag.
- `jobKey` defaults to a hash of the event name, the subscriber id and the payload, so the same event delivered twice
  enqueues once.
- ADR-61 is amended: "delivery is in-process and best effort" stays true for plain subscribers; queued ones get retries.

### 11.4 The `jobs.failed` event

- Declared in `src/features/jobs/events.ts`: `jobs.failed` `{ job, jobId, attempts, reason }`, `reason` truncated to 500
  characters.
- Emitted for an **organization** job that ended in BullMQ's failed set, with the job's origin (organization, actor,
  service mode). System jobs emit nothing (no organization to deliver to). A job skipped because its organization is
  gone (8.2) is completed, not failed, and emits nothing.
- **Two paths, one report** (open-mercato's `onJobAbandoned`):
  1. the `Worker`'s `failed` event, which fires after the last attempt, after an unrecoverable failure, and when a
     stalled job exceeds `maxStalledCount`, that is also when the handler never ran to completion;
  2. a **sweep of the failed set**, at boot and every 5 minutes, for organization jobs whose envelope has no
     `failedReportedAt`: those whose worker died before the `failed` listener ran, or whose report failed.
- **Signal first, stamp second** (`.ai/lessons/enqueue-then-stamp.md`): emit `jobs.failed` (its subscribers run,
  queued ones insert their outbox rows), then write `failedReportedAt` into the job's envelope (`job.updateData`). A
  crash between the two re-reports on the next sweep; stamping first would lose the report. Delivery is therefore at
  least once, and `jobs.failed` subscribers must be idempotent (key on `jobId`). Within one process an in-flight id set
  keeps the listener and the sweep from reporting the same job twice; shutdown waits for in-flight reports up to
  5 seconds, then leaves them to the next worker's sweep.
- The failed set is the durable record (`removeOnFail` keeps 7 days), so the sweep covers jobs that failed within that
  window. `jobs.retry` clears `failedReportedAt`, so a retried job that fails again is reported again.
- Subscribers run in the worker process, which is why every subscriber must be Next-free (6.3, decision 17.1/14).
- Loop guard: while the bus delivers `jobs.failed`, an `AsyncLocalStorage` flag makes every `enqueueJob` set
  `cause: "jobs.failed"` in the envelope; a failing job with that cause emits no `jobs.failed`.

## 12. Admin surfaces

### 12.1 In-app admin page

- `/admin/jobs`, `adminOnly` (global `admin` and `superadmin`), `requireModuleAccess("jobs")`, `PageHeader`.
- Read-only per job: waiting / active / delayed / failed / completed counts; app-wide schedules with cron, timezone,
  enabled state and next run (in its zone and in UTC); organization schedules with the count of organizations due in
  the next hour; the outbox (pending count, oldest pending age, rows with 10 or more failed dispatches, rows for jobs
  no worker knows); the last 50 failed jobs with job name, organization name, attempts, time and `failedReason`
  truncated to 500 characters. No payloads, no stack traces.
- **Worker presence.** Each worker writes a heartbeat key `<prefix>:workers:<host>-<pid>` every 10 s with a 30 s TTL
  (value: version, start time, jobs consumed). The page lists live workers and shows a warning when none has been seen
  for 60 s ("No worker is running: jobs are queued but nothing processes them"), the silent failure mode of a separate
  worker service. `wa doctor`, when the `jobs` module is installed and `REDIS_URL` is set, reports the same warning (and
  "cannot reach Redis" when it cannot connect).
- **Polling, not push.** The page re-reads counts and heartbeats every 5 s while it is open and every 30 s in a hidden
  tab; the worker runs in another process, so there is no in-process event to push (open-mercato's lesson on
  worker-emitted progress).
- **Commands `jobs.retry` and `jobs.run-now`**, `access: "global-admin"`, **audited** (decision 17.1/7, revised
  2026-11-28, following open-mercato's manual-trigger audit spec):
  - every attempt that reaches the command writes one audit row, `job.retried` or `job.triggered`, channel `WEB`,
    `userId` = the admin, in the admin's active organization (the caller's scope, never the target's, so a refusal
    cannot file a row into, or leak details of, another organization);
  - `newData` on success: `{ outcome: "succeeded", job, jobId, scheduleId? }`; on refusal: `{ outcome: "refused",
code }` with `code` one of `not-found`, `not-failed`, `schedule-disabled`, `unknown-job`, and nothing about the
    target beyond the id the caller sent;
  - refusals are returned as failure results, not thrown, so the row is written before the result;
  - `jobs.run-now` enqueues with the admin as `actorUserId` (system origin with an actor), so audit rows the job writes
    are attributed to the person who triggered it; `jobs.retry` re-runs the original envelope and keeps its actor, and
    the retry itself is attributed through its own row;
  - an attempt by a non-admin is stopped by `runCommand`'s access guard before the command runs; it is logged at `warn`
    with the user id, not audited (the command is on no surface a non-admin can reach).

### 12.2 Worker dashboard

Decision 17.1/4: bull-board on the worker, as justnails and company-budget run it, with Ragen's hardening.

- `@bull-board/api` with `@bull-board/express`, mounted at `/admin/queues` on `JOBS_WORKER_PORT`, listing every queue
  this worker consumes. Express is loaded only when the dashboard is enabled.
- **Off unless configured**: both `JOBS_DASHBOARD_USER` and `JOBS_DASHBOARD_PASSWORD` set (one alone stops the worker;
  password at least 16 characters).
- **Auth**: HTTP Basic, user and password each compared in constant time over SHA-256 digests (Ragen; justnails compares
  the header string with `===`), `WWW-Authenticate` challenge on failure, at most 10 failed attempts per minute per
  client address (in memory), then 429.
- **Read-only by default** (bull-board's read-only mode): no retry, promote, clean or remove until
  `JOBS_DASHBOARD_READ_ONLY=false`.
- `/health` is always served and unauthenticated: `{ status, redis, outbox: { pendingCount, oldestPendingSeconds } }`,
  no queue names or payloads.
- **Exposure rules** (`docs/19`, `docs/self-hosting.md`): the worker port is never published by the kit's Compose files,
  never given an Ingress by the chart, and the Railway worker service gets no public domain; reach it by SSH tunnel,
  `127.0.0.1` override, `kubectl port-forward` or Railway's private network. The dashboard shows payloads (ids by rule, 13) and stack traces, so it is for operators only.

## 13. Security

- **Payloads are identifiers.** Redis and the outbox are not encrypted at rest and keep jobs for days. Payload schemas may
  not declare keys matching `/(password|secret|token|apikey|api_key|authorization|cookie|session)/i`. Mail is rendered
  at run time from ids.
- **Failure reasons** may hold PII; the in-app page and `jobs.failed` truncate them; logs go through the logger's
  redaction.
- **Redis:** `rediss://` supported; password required in the self-hosted stack (decision 17.1/9); no published port;
  `JOBS_PREFIX` isolates apps sharing an instance; eviction refused at boot.
- **Tenant isolation at run time:** 9.1.
- **Dashboard:** 12.2.
- **No callback secret:** the worker runs the modules' code directly; no `CRON_SECRET`-style route exists.
- **Unknown job names** fail unrecoverably; the relay never dispatches an envelope whose organization differs from its
  row.

## 14. Testing

### 14.1 Unit (no Redis, `npm test`)

- `createMemoryJobRuntime()` in `src/shared/lib/jobs/testing.ts`: records enqueues and `drain()` runs them through the
  real envelope parse, registry, context and organization scope, with retries simulated per `attempts`. Handler tests
  use it, or `createTestJobContext({ organizationId })`.
- Registry check (every rule of 7.2), origins, envelope strip and reject, job-id hashing, schedule planning
  (`planScheduleChanges`), organization slot computation (`latestDueSlot` with DST cases as literals), failure mapping,
  shutdown ordering with fakes, eviction check (array and object answers, forbidden, empty), dashboard auth (wrong
  user, wrong password, missing header, lockout, read-only), timezone resolution and IANA validation, `formatDateTime`.
- Tenant scope: the value check of 9.1, each allowed and rejected filter shape as a literal.
- Retention and orphan logic as in the first draft (cutoff, batches, grace, prefix shape, circuit breaker).
- Trace propagation with an in-memory span exporter: the job's consumer span has the enqueuing span as parent; no
  carrier → a root span; telemetry off → no `trace` in the envelope.
- Concurrency plan (`planWorkerConcurrency`) as literals: within budget unchanged; over budget clamped proportionally
  with a floor of 1; budget below the queue count flagged.
- Failed-report sweep with fakes: unstamped failed organization job reported once and stamped after the event;
  a throwing subscriber still leads to a stamp only after the emit returned; a stamp failure leaves the job for the
  next sweep; listener and sweep in one process report once.
- Generator: pinned registry lines, `server-registry.generated.ts`, manifest `scripts` merge, `verify:modules`.

### 14.2 Integration on real Redis and Postgres (`npm run test:integration`)

- Redis from `docker compose up -d redis`, `INTEGRATION_REDIS_URL` (default `redis://localhost:6379/15`); the helper
  refuses to run unless `JOBS_PREFIX` ends with `_test` and obliterates only that prefix. `ci/jobs.integration-steps.yml`
  starts Redis in `assemble`.
- The worker under test is the bundle (the development build writes the same format), and `worker:check` runs the
  production bundle; there is one module format (decision 28).
- Outbox: a rolled-back transaction leaves no row and no job; a committed one is dispatched after `NOTIFY`; two relays
  never dispatch a row twice; a relay killed between `add` and commit re-adds without a second job; a row of an unknown
  job stays pending; prune keeps undispatched rows.
- Runtime: enqueue → complete; retries → final failure → one `jobs.failed`; a job stalled twice → `jobs.failed`
  from the `failed` event; a failed job left unstamped (worker killed after the emit) reported by the next boot sweep;
  coalescing: three enqueues while one runs → one more run with the third payload; a job of a deleted organization
  skipped without retry; `jobs.purge-organization` removes only that organization's waiting and delayed jobs; `JobFailure` not retried; envelope mismatch
  not retried; stalled job redelivered once (short `lockDurationMs`/`stalledInterval` passed by the test only);
  `globalConcurrency: 1` across two workers; schedule reconciliation across two boots; `SIGTERM` waits for an in-flight
  job; a schedule with `timezone: "Europe/Warsaw"` gets its next run at 03:00 Warsaw time with the worker started under
  `TZ=America/New_York`.
- **Isolation (AGENTS.md):** two organizations; `audit-logs.prune` for A leaves B's rows; `uploads.orphans` for A never
  lists or deletes B's objects; a handler that queries B's rows inside A's scope throws `TenantScopeError`; a payload
  carrying B's id reaches nothing of B; an organization schedule claims A's and B's slots independently; changing A's
  timezone changes nothing of B.

### 14.3 End to end

- `core-auth`: an owner changes the organization timezone on `/organization`, the audit log shows the row, dates on the
  audit log page render in the new zone; a `member` does not see the nav item and the command refuses.
- With `jobs`: a superadmin opens `/admin/jobs`, runs `uploads.orphans-daily` now and sees it complete (e2e runs a
  worker beside the server); with the worker stopped the page shows the "No worker is running" warning within 60 s.
- **Queues are purged with the database** (open-mercato's purge-on-wipe spec): every place that wipes the database also
  obliterates the queues under `JOBS_PREFIX`, so jobs that point at rows which no longer exist never reach a fresh run.
  `e2e/global-setup.ts` (core) calls `npm run --if-present jobs:purge -- --yes` right after its `_e2e` reset, and the
  integration helper `resetDatabase()` does the same for the `_test` prefix.
- `npm run jobs:purge` (manifest script, `worker/purge.ts`): obliterates every queue and scheduler under `JOBS_PREFIX`
  and deletes pending outbox rows; asks for confirmation unless `--yes`; refuses with `NODE_ENV=production` unless
  `--force`; prints what it removed. For development and test resets, and for an operator who wipes a staging
  database.

### 14.4 Architecture tests

- `bullmq`, `ioredis`, `@bull-board/*` and `express` imported only under `src/features/jobs/runtime/` and
  `src/features/jobs/worker/`.
- Nothing reachable from `jobs.ts`, `subscribers.ts`, `events.ts`, `audit-sink.ts`, `command-hooks.ts`, `setup.ts`,
  `auth.ts` or `module.ts` imports React (other than mail rendering through `src/app/emails/`), Next or `@/modules.generated` (static check; the bundle metafile check repeats it on the real graph).
- An organization job's handler files do not import `getOrgContext`, `requireModuleAccess`, `next/headers`,
  `withoutTenantScope` or call `$queryRaw`/`$executeRaw`.
- `client-bundles-stay-server-free`: `"use client"` files do not import `@/shared/lib/jobs` or any `jobs.ts`.

### 14.5 Mutation gate

Proposed additions to `mutation-gate.json` `critical` (a human approves them): `src/shared/lib/jobs/`,
`src/shared/lib/tenant-scope/` (already critical; the new scope code lands there), `src/shared/lib/timezone/`,
`src/features/jobs/outbox/`, `src/features/jobs/runtime/`, `src/features/jobs/worker/http.ts` (dashboard auth),
`src/features/audit-logs/services/jobs/`, `src/features/uploads/services/jobs/`, and the organizations timezone command.
The theme of the mutants to kill is listed per task in section 16.

## 15. Changes outside the module

Each is its own commit with the owner's version bump (`kit/CLAUDE.md`):

| Change                                                                                                                                                 | File(s)                                                                                                                                                         | Owner                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Seam `src/shared/lib/jobs/`                                                                                                                            | new                                                                                                                                                             | core                   |
| Next-free server registry; `emit-event.ts`, `audit.ts`, `run-command.ts`, `require-module-enabled.ts` import it                                        | `src/server-registry.generated.ts`, those files                                                                                                                 | core + kit (generator) |
| Organization job scope in the guard                                                                                                                    | `src/shared/lib/tenant-scope/`                                                                                                                                  | core                   |
| `timezone` in `GatoConfig`, `schedules` in `GatoModuleConfig`                                                                                          | `src/shared/lib/modules/gato-config.ts`                                                                                                                         | core                   |
| `Organization.timezone`, `additionalFields`, `OrgContext.timezone`, timezone helpers, `/organization` page, nav item, slot, command, event, permission | `prisma/schema/organizations.prisma`, `src/shared/lib/auth/`, `src/shared/lib/timezone/`, `src/features/organizations/`, `src/app/[locale]/(app)/organization/` | core                   |
| Queued subscribers, `cause` flag                                                                                                                       | `src/shared/lib/events/`                                                                                                                                        | core                   |
| `organizations.deleted` event: core event schema, `before`/`after` hooks for `/organization/delete` in the events plugin                               | `src/shared/lib/events/core-events.ts`, `src/shared/lib/auth/events-plugin.ts`, `organization-events.ts`                                                        | core                   |
| `AuditChannel` `SYSTEM`, job-scoped default channel                                                                                                    | `src/shared/lib/audit.ts`                                                                                                                                       | core                   |
| `AuditChannel` enum value, label, `organization.timezone_changed` and `audit-log.pruned` actions, timezone subscriber                                  | `src/features/audit-logs/`, `prisma/schema/audit-logs.prisma`                                                                                                   | audit-logs             |
| `ObjectStorage.list`, orphan jobs                                                                                                                      | `src/features/uploads/`                                                                                                                                         | uploads                |
| Date display through `formatDateTime`                                                                                                                  | `audit-logs`, `api-keys`, `users`                                                                                                                               | each module            |
| `serverExternalPackages: ["bullmq", "ioredis"]` (the web reads queue counts)                                                                           | `next.config.ts`                                                                                                                                                | core                   |
| `verify` runs `npm run --if-present verify:modules`                                                                                                    | `package.json`                                                                                                                                                  | core                   |
| Generator: server registry, `jobs.ts`, `job-runtime.ts`, manifest `scripts` and `verify`, worker Dockerfile region, catalog sections; `kitFormat` 12   | `packages/gato-cli/`, `kit/kit.json`, `kit-format.ts`                                                                                                           | kit                    |
| `doctor` warning for schedules without `jobs`, and the "no worker" heartbeat check                                                                     | `packages/gato-cli/src/doctor/`                                                                                                                                 | kit                    |
| e2e reset purges the queues (`npm run --if-present jobs:purge -- --yes`)                                                                               | `e2e/global-setup.ts`, `src/test/integration/`                                                                                                                  | core                   |
| Worker image in `docker-publish.yml` and `docker-platforms.yml`                                                                                        | `.github/workflows/`                                                                                                                                            | core / kit             |
| Helm `worker.*`, `worker-deployment.yaml`, dashboard Service                                                                                           | `deploy/helm/gatojs/`                                                                                                                                           | core                   |
| `redisUrl` helper                                                                                                                                      | `packages/env`                                                                                                                                                  | core                   |
| ADR-66 endpoint list, egress-check `jobs` leg, path filter                                                                                             | `docs/adrs/66-…`, `kit/egress-check/`, workflow                                                                                                                 | kit                    |
| `assemble` matrix: `jobs`, `jobs+audit-logs+uploads`, `all`; `invoices` fixture gets a job, a queued subscriber and an organization schedule           | `.github/workflows/kit.yml`, fixture                                                                                                                            | kit                    |

## 16. Phased plan outline

Each task follows `AGENTS.md`: `test-writer` writes the tests from "Zachowania" before the implementation and shows them
red; the implementer works with `.gato/phase` = `implement`; `test-reviewer` runs `npm run test:mutation:task` and
`npm run test:mutation:gate`. This is an outline; the plan file adds signatures, files and full behaviour lists.

### Phase 0: spike (throwaway branch; result is a lesson and a go/no-go)

**Task 0. A Next-free worker bundle in its own image.** esbuild bundle of a worker that loads a hand-written
server-only registry, runs a job that writes through `@/shared/lib/prisma` (Prisma 7, tenant-scope extension), calls
`trackAudit` and `emitEvent`, built in `docker/worker.Dockerfile` on amd64 and arm64.

**Zachowania:** the job completes; the metafile contains no `next`, `react`, `react-dom`, `next-intl`; Prisma's runtime
files load from the image; `server-only` and `next/cache` resolve to the stubs; `docker stop` waits for a 20 s job and
exits 0; idle RSS and image size recorded; `tsx watch` with `dev-hooks.mjs` runs the same entry.

**Result (2026-11-28):** go, with decisions 25 to 31; details in the plan's "Spike results".

**Mutacje do zabicia:** n/a (spike). A failure changes section 6.4 before Phase 1.

### Phase 1: core seams (`kitFormat` 12)

**Task 1. `defineJobs`, `defineSchedules`, registry check.**

**Zachowania:** each rule of 7.2 as a literal input → the exact `JobRegistryError` line; cron `"0 3 * * *"` accepted,
`"0 0 3 * * *"` and `"61 * * * *"` rejected; timezone `"Europe/Warsaw"` and `"organization"` accepted, `"Mars/Base"`
rejected; an organization-timezone schedule of a system job rejected; payload with `organizationId`, `cause`,
`apiToken` or `.passthrough()` rejected; a queued subscriber in a module without `requires: ["jobs"]` rejected.

**Mutacje do zabicia:** prefix check removed; reserved-key check skipped for `.optional()`; five-field check replaced by
"≥ 5"; scope/timezone-mode check inverted; sensitive regex made case-sensitive.

**Task 2. Envelope, origins, job ids, `enqueueJob` port, memory runtime.**

**Zachowania:** `jobOrigin(orgContext)` → `{ organizationId: "org-a", actorUserId: "u1", serviceMode: false }`; payload
`{ invoiceId: "i1", organizationId: "org-b" }` reaches the handler as `{ invoiceId: "i1" }` with
`ctx.organizationId === "org-a"`; organization job with `systemOrigin` throws; job id for `("x.y", "org-a", "k1")` is a
fixed literal without `:`, different for `"org-b"`; no runtime → `JobsUnavailableError`; envelope `v: 2` unrecoverable;
with an active span the envelope carries its `traceparent`, without one `trace: null`; `coalesceKey` with `delayMs` →
`JobOptionsError`; the installed `bullmq` accepts `deduplication.keepLastIfActive` (version test).

**Mutacje do zabicia:** organization taken from the payload; strip replaced by passthrough; organization left out of the
key hash; scope check inverted; trace written into the payload; coalesce/delay check removed.

**Task 3. Server registry split, generator, manifest `scripts`/`verify`.**

**Zachowania:** `src/server-registry.generated.ts` pinned line by line and free of slot, message and auth-plugin
imports; `@/modules.generated` re-exports it; `emit-event.ts` and `audit.ts` import the new file; a manifest with
`scripts` adds them to `package.json` and removing the module removes them; `verify:modules` composed in registry order;
`docker/worker.Dockerfile` region filled.

**Mutacje do zabicia:** a React-importing list emitted into the server registry; scripts of a removed module kept;
`verify:modules` missing a module.

**Task 4. Organization job scope in the tenant-scope guard (critical).**

**Zachowania:** inside `runInOrganizationScope("org-a")`: `findMany({ where: { organizationId: "org-a" } })` passes;
`{ organizationId: "org-b" }`, `{ organizationId: { in: ["org-a", "org-b"] } }`, `{ organizationId: { not: "org-b" } }`,
no filter, `create({ data: { organizationId: "org-b" } })` and a `createMany` with one `org-b` row throw
`TenantScopeError`; `withoutTenantScope` inside the scope throws; outside a scope every existing guard test is unchanged.

**Mutacje do zabicia:** value comparison removed (presence only); `in` accepted when it contains the scope id among
others; `createMany` checks only the first row; the bypass allowed inside the scope.

**Task 5. `timezone` and `schedules` in `gato.config.ts`; timezone helpers.**

**Zachowania:** no `timezone` → `"UTC"`; `timezone: "Europe/Warsaw"` → schedules without their own zone resolve to it;
schedule zone beats it; config override beats both; `"CET+1"` → `GatoConfigError` line
`- timezone: not an IANA time zone: CET+1`; unknown schedule id → `GatoConfigError`; `null` disables;
`resolveTimezone(null, "Europe/Warsaw")` → `"Europe/Warsaw"`; `formatDateTime(new Date("2026-03-29T01:30:00Z"),
{ timeZone: "Europe/Warsaw", locale: "pl" })` → the literal for 03:30.

**Mutacje do zabicia:** resolution order swapped; `null` treated as keep; IANA check replaced by non-empty; `tz` omitted
for `"UTC"`.

### Phase 2: the `jobs` module

**Task 6. Outbox: model, insert, relay, prune.**

**Zachowania:** insert inside a rolled-back `tx` leaves no row; inside a committed `tx` one row and one notification;
duplicate `jobKey` → `{ duplicate: true }`, one row; relay adds in `(createdAt, id)` order with `jobId = keyHash ?? id`;
a row whose envelope organization differs from its column is never added; a row of an unknown job stays pending; failed
add → `dispatchAttempts` 1 and `lastError`; prune deletes dispatched rows older than 7 days and no pending row; a row with
`coalesceKey` is added with `{ keepLastIfActive: true }`; the row's `traceparent` reaches the envelope.

**Mutacje do zabicia:** `keepLastIfActive` dropped; `dispatched_at IS NULL` dropped; `SKIP LOCKED` dropped (integration: two relays); organization
mismatch check removed; prune condition `<` → `>`; unknown-job rows dispatched.

**Task 7. Consumer, failure mapping, `jobs.failed`, eviction check, shutdown.**

**Zachowania:** `JobFailure(retryable: false)` → `UnrecoverableError`; unknown job → unrecoverable; last failure of an
organization job emits exactly one `jobs.failed` with the truncated reason, then stamps `failedReportedAt`; a stalled
job past `maxStalledCount` emits one; an unstamped failed job found by the boot sweep emits one; a stamped one emits
none; a system job emits none; a job with `cause: "jobs.failed"` emits none; a job whose organization is gone completes
without running the handler, without retry and without `jobs.failed`; the handler runs in a `consumer` span whose
parent is the envelope's trace; `allkeys-lru` → refuses to start; `CONFIG GET` forbidden → warning; second `SIGTERM`
ignored; order relay → workers → queues → Prisma → HTTP → telemetry.

**Mutacje do zabicia:** `retryable === false` inverted; `jobs.failed` emitted on every attempt; stamp written before the
emit; sweep ignoring the stamp; cause guard removed; organization-exists check removed or turned into a retry;
eviction comparison negated; telemetry flushed first.

**Task 7a. Core event `organizations.deleted` (core, before the purge).**

**Zachowania:** a successful `/organization/delete` of `org-a` by `u1` emits exactly one `organizations.deleted`
`{ name: "Acme" }` with `organizationId: "org-a"`, `actorUserId: "u1"`; a failed delete (not a member, unknown id)
emits nothing; a subscriber error does not change the delete response; a queued subscriber of `organizations.deleted`
fails the registry check; the extension-point catalog lists the event and the better-auth path row says it emits it.

**Mutacje do zabicia:** emit on a failed delete; name read after the delete (empty); actor taken from the body; queued
subscriber check removed.

**Task 7b. A deleted organization's queued jobs (`jobs` module).**

**Zachowania:** the `organizations.deleted` subscriber writes one outbox row for `jobs.purge-organization`
`{ removedOrganizationId: "org-a" }` with `organizationId: null`, and the row survives the organization's cascade; the job
removes `org-a`'s waiting, delayed and prioritized jobs in every queue and leaves `org-b`'s and the active ones; an
enqueue error is logged and the delete still succeeds.

**Mutacje do zabicia:** filter on the organization removed (purges everything); active jobs removed; purge enqueued with
the event's organization origin (row cascades away).

**Task 8. Schedule reconciliation.**

**Zachowania:** `planScheduleChanges(existing ["audit-logs.prune-daily", "old.gone"], effective
["audit-logs.prune-daily"])` → upsert one, remove `"old.gone"`; another prefix's schedulers untouched; every upsert
carries a non-empty `tz`; two boots → one scheduler.

**Mutacje do zabicia:** removal set computed backwards; prefix filter dropped; upsert skipped when only the timezone
changed.

**Task 9. Worker entrypoint, bundle, stubs, development entry, Dockerfile, Compose, CI steps, integration suite.**

**Zachowania:** `node .worker/worker.mjs --check` exits 0 with a valid env and 1 naming the variable without
`REDIS_URL`; the metafile check fails on a fixture module whose `subscribers.ts` imports a `.tsx` component, and the
error names `src/features/<fixture>/subscribers.ts` and the chain to `react`; a stubbed `headers()` call throws
`"next/headers is not available in the worker"`; `next/cache` `revalidatePath` returns `undefined`; the 14.2 suite
passes against both the development entry and the bundle; self-hosted Compose refuses to start without
`REDIS_PASSWORD`; with `JOBS_DB_POOL_MAX=5` and jobs requesting 5 + 5 + 1 the boot log shows the plan
`{ budget: 3, totalRequested: 11, clamped: true }` and every job keeps at least 1; the worker writes its heartbeat key
with a 30 s TTL; `npm run jobs:purge -- --yes` empties every queue and scheduler under the prefix and no other prefix,
and refuses with `NODE_ENV=production` without `--force`; `e2e/global-setup.ts` runs it after the reset.

**Mutacje do zabicia:** a forbidden package missing from the metafile list; stub of `next/cache` throwing; `--check`
skipping env verification; plan floor of 1 removed; purge ignoring the prefix; production guard inverted.

### Phase 3: time and events

**Task 10. Organization timezone (core): migration, context, command, event, page, slot, audit subscriber.**

**Zachowania:** a new organization has `timezone: null` and context timezone equal to the app default; owner sets
`"Europe/Warsaw"` → success, one `organizations.timezone-changed` `{ previous: null, timezone: "Europe/Warsaw" }` with the
owner as actor, one `organization.timezone_changed` audit row; same value again → success, no event; `member` →
failure result, no change; superadmin in service mode without confirmation → "Potwierdź zmianę w trybie serwisowym"
(the service-mode message), with confirmation → `serviceMode: true` on the audit row; `"Mars/Base"` → invalid input;
better-auth `/organization/update` with `timezone` in the body leaves it unchanged; organization B unchanged
(integration).

**Mutacje do zabicia:** permission check removed; event emitted when unchanged; `input: false` dropped; organization taken
from the input.

**Task 11. Date display in organization time.**

**Zachowania:** the audit log, API key and users pages render a fixed instant as the literal for the organization's zone;
an API key expiry date chosen as `2026-12-01` in `"Europe/Warsaw"` expires at `2026-12-01T23:00:00.000Z` (the end of
that day in Warsaw); client components receive the zone from `TimezoneProvider`.

**Mutacje do zabicia:** server time zone used; UTC hard-coded in one module.

**Task 12. Organization-facing schedules (tick, slots, claims).**

**Zachowania:** `latestDueSlot("0 8 * * 1-5", "Europe/Warsaw", lastSlotAt, now)` literals around DST (spring skip, autumn
once) and weekends; organizations in `"Europe/Warsaw"` and `"America/New_York"` get their 08:00 jobs at their own
instants; a tick run twice in the same minute enqueues once; a crash between claim and commit loses nothing
(integration); downtime of 3 h runs only the latest slot within 2 h.

**Mutacje do zabicia:** lookback bound removed; claim without compare-and-set; app default zone used instead of the
organization's.

**Task 13. Queued subscribers.**

**Zachowania:** a queued subscriber of `uploads.deleted` writes one outbox row with the event's organization, actor and
service mode; the same event twice → one row (default `jobKey`); an insert failure is logged and the operation still
succeeds; a queued subscriber of a system job fails the registry check.

**Mutacje do zabicia:** origin taken from the payload; default `jobKey` ignoring the event payload; failure rethrown.

### Phase 4: first consumers

**Task 14. `AuditChannel` `SYSTEM` and audit-log retention.**

**Zachowania:** clock `2026-11-28T10:00:00Z`, `olderThanDays: 365` → cutoff `2025-11-28T00:00:00Z`; a row at
`2025-11-27T23:59:59Z` deleted, `2025-11-28T00:00:00Z` kept; 12 001 old rows → three batches; after the run exactly one
`audit-log.pruned` row with `channel: "SYSTEM"`, `userId: null`, `newData.deleted: 12001`; a retry uses the first
attempt's cutoff; schedule disabled by default; B's rows untouched by A's job.

**Mutacje do zabicia:** `lt` → `lte`; organization filter removed (caught twice: unit and the scope guard); loop exits
after one batch; audit row skipped; audit row written when nothing was deleted (`> 0` → `>= 0`); channel default
left `WEB` inside jobs; `enabledByDefault` flipped.

**Task 15. `ObjectStorage.list` and orphan cleanup.**

**Zachowania:** object 25 h old without a row → deleted; 23 h → kept; with a row → kept; `orgs/not-an-id/` ignored; a
deleted organization's prefix purged by default; 10 001 planned deletions → nothing deleted, unrecoverable failure; empty
`Organization` table → nothing purged; local `list` cannot escape `STORAGE_LOCAL_PATH`.

**Mutacje do zabicia:** grace comparison inverted; breaker `>` at the wrong boundary; existence check removed;
`path-inside` skipped.

### Phase 5: operations and docs

**Task 16. In-app admin page and commands.**

**Zachowania:** `member` and `owner` without global admin → 404; admin sees counts, schedules with zones, outbox stats and
failed jobs without payloads; `failedReason` of 2 000 characters shown as 500; no heartbeat for 60 s → the warning, a
fresh heartbeat → no warning; the page refetches every 5 s while open; `jobs.retry` of a failed job → success and one
`job.retried` row with the admin as `userId`, channel `WEB`, in the admin's active organization, and the job's
`failedReportedAt` cleared; `jobs.run-now` → one `job.triggered` row and the job's envelope has the admin as
`actorUserId`; `jobs.run-now` of a disabled schedule → failure result and one row `{ outcome: "refused", code:
"schedule-disabled" }`; `jobs.retry` of an id from another organization's job that is not failed → refusal row in the
admin's organization with no target details; a `member` calling the command → no row, a `warn` log.

**Mutacje do zabicia:** `adminOnly` dropped; payload included; truncation removed; refusal not audited; row filed in the
target's organization; actor missing from the run-now envelope; marker not cleared on retry; heartbeat TTL check
inverted.

**Task 17. Worker dashboard.**

**Zachowania:** no credentials → `/admin/queues` 404 and `/health` 200; only one credential → worker refuses to start;
wrong password → 401 with `WWW-Authenticate`; eleventh failure in a minute → 429; correct credentials → 200; a retry
request in read-only mode → refused; password shorter than 16 → refuses to start.

**Mutacje do zabicia:** comparison of the user skipped; read-only default flipped; lockout counter never incremented.

**Task 18. Helm, Railway runbook, image publishing, egress `jobs` leg, `assemble` matrix.**

**Zachowania:** `helm template` with `worker.enabled=false` renders no worker; `true` renders a Deployment with the worker
image, `terminationGracePeriodSeconds: 35`, probes on `/health`, and no Service unless `worker.dashboard.enabled`, never
an Ingress; the egress check's `jobs` leg is clean and fails on a planted outside lookup; `docker-publish.yml` pushes
`<repo>-worker` only when `docker/worker.Dockerfile` exists; `wa doctor` with no heartbeat in Redis prints the "no worker"
warning and with Redis unreachable prints "cannot reach Redis".

**Mutacje do zabicia:** n/a (templates and I/O), proved by `helm` tests and the sealed run.

**Task 19. Docs, ADRs, skill.** Section 18.

## 17. Decisions and open questions

### 17.1 Decisions (Patryk, 2026-11-28)

First round:

1. **Redis, not Valkey.** The `redis:7-alpine` image as in the owner's projects, pinned by digest.
2. **Redis is final.** No BullMQ-on-PostgreSQL backend.
3. **Schedules do not depend on the server timezone.** App-wide default timezone in `src/gato.config.ts` (IANA, Zod,
   default `"UTC"`), per-schedule override, always passed to BullMQ as `repeat.tz`; containers run in UTC and `TZ` is
   ignored. _Revision:_ the default is the top-level `timezone` key, not `jobs.timezone`, because date display and the
   organization timezone (decision 12) use it too and core cannot read a module's key (7.3).

Second round (the twelve questions of the first draft):

1. **Worker shape: a separate entrypoint and image** (option B). Pitfalls addressed in section 6.
2. **Audit retention shipped disabled.** (10.1)
3. **Deleted organizations' storage purged by default,** behind the circuit breaker. (10.2)
4. **Admin UI: the in-app page and a password-protected dashboard on the worker,** off unless configured, never public
   by default. (12)
5. **Helm: external Redis only.** (5.5)
6. **Transactional outbox in v1** (`job_outbox`), with the relay design of 8.4.
7. **Audit from jobs:** retention writes one row per organization per run (only when it deleted rows, decision 15);
   `AuditChannel` gains `SYSTEM`. `jobs.retry` and `jobs.run-now` **are audited**, successes and refusals, attributed to
   the person who triggered them, and `run-now` runs the job with that person as actor. _Revised 2026-11-28 after
   open-mercato review_ (the first answer was "no audit rows"). (9.2, 10.1, 12.1)
8. **Strict organization scope in jobs** in the tenant-scope guard, in v1, critical. (9.1)
9. **`REDIS_PASSWORD` required in the self-hosted stack.** (5.4)
10. **Queued subscribers and `jobs.failed` in v1.** (11.3, 11.4)
11. **A worker with automatic reload for development** (`npm run worker:dev`; `tsx watch` at first, an esbuild watch
    bundle under `node --watch` since decision 28) beside the production entrypoint. (6.6)
12. **Per-organization timezone now:** stored on `Organization`, used by organization-facing schedules and date display,
    changeable by owners and admins in organization settings, with service-mode confirmation, an event and an audit
    row. (11.1, 11.2)

Third round (the questions the second revision raised):

13. **Personal user timezone: later.** Future work, not v1. (11.1)
14. **Next-free rule for code that runs in the worker.** Subscribers, audit sinks and command hooks must not use Next or
    React, because they also run in the worker. Documented in `docs/19b`, the `AGENTS.md` Task Router row and the
    `gato-extend` skill; enforced by the bundle check with an error naming the offending module file. (6.3, 6.4)
15. **Retention writes its audit row only when `deleted > 0`.** (10.1)

Fourth round (open-mercato review, owner approved 2026-11-28; section 3.1):

16. **Trace context** in the envelope and the outbox row, continued by a consumer span. (7.6, 8.1)
17. **`jobs.failed` also for jobs that never reported** (stalled, abandoned), from the `failed` event plus boot and
    interval sweeps of the failed set; signal first, stamp second; at least once. (8.2, 11.4)
18. **Coalescing** (`keepLastIfActive`, BullMQ ≥ 5.72 pinned) instead of plain deduplication; not combined with a
    delay. (7.5)
19. **Postgres connection budget** for the worker: concurrency plan fitted to `JOBS_DB_POOL_MAX`, logged at boot. (5.3,
    8.6)
20. **Deleted organization:** its queued jobs are purged, and a job of a missing organization is a quiet skip. (8.2,
    9.4)
21. **Queues purged with the database** in e2e and integration resets, plus `npm run jobs:purge`. (14.3)
22. **"No worker" warning** from a heartbeat key, on the admin page (polling) and in `wa doctor`. (12.1)

Decided by the coordinator on the owner's go-ahead (2026-11-28; the owner may revise):

23. **Deleted organization: a core event, not a module hook.** Core emits `organizations.deleted` (actor, organization,
    name) from the delete path, closing ADR-61's "delete emits nothing" gap; the `jobs` module subscribes and enqueues
    `jobs.purge-organization` as a system job, whose outbox row has no organization and so survives the cascade.
    `audit-logs` does not record it yet (its rows cascade with the organization). Replaces the better-auth `after`
    hook of decision 20. (9.4, Tasks 7a and 7b)
24. **Non-admin attempts at `jobs.retry` / `jobs.run-now`,** stopped by `runCommand`'s access check, are logged at
    `warn` and not audited. (12.1)

Decided by the coordinator after the Task 0 spike, on the owner's go-ahead (2026-11-28; the owner may revise):

25. **Registry split by what the worker reaches.** A plain-data `src/modules.data.generated.ts` shared by both
    registries and `auth/permissions.ts`; `moduleSetups` and `authPlugins` in the server registry; the Next-free rule of
    decision 14 also covers `setup.ts` and `auth.ts`. (6.3)
26. **`next-intl` stubs.** `next-intl/server`, `next-intl/navigation` and `@/i18n/routing` are stubbed in the worker
    like `next/headers`, because `runCommand` imports the session layer statically and esbuild bundles literal
    `import()` targets. (6.4)
27. **React in the worker only for mail rendering.** The bundle check allows `react`, `react-dom` and `@react-email/*`
    only when reached through `src/app/emails/`; anything else importing them, any other `.tsx`, `react-dom/client` or a
    `"use client"` file fails with the offending module file named. Decision 14 is unchanged: subscribers, audit sinks
    and command hooks themselves must not use React or Next. (6.3, 6.4)
28. **`worker:dev` is an esbuild watch bundle under `node --watch`,** not `tsx watch` with module hooks: one module
    format in development, tests and production. (6.4, 6.6, 14.2)
29. **`@gatojs/*` workspace packages are bundled** into the worker, never external. (6.4)
30. **npm packages are bundled;** only Node built-ins and `WORKER_EXTERNALS` stay external, and the worker image has
    no `prod-deps` stage while that list needs no install. (6.4, 6.5)
31. **`ioredis` 6.x pinned exactly** (a peer dependency of BullMQ 6, which the spike ran at 6.7.10), and a **core
    `WorkerUnavailableError`** thrown by the stubs and rethrown by `handleCommandError`. (5.1, 6.4)

Docs numbering: this spec uses `docs/19` and `docs/19b`; the MCP spec (#136) takes the next free number.

### 17.2 Open questions

None.

## 18. Docs, ADRs and skill

ADR-70 and ADR-71 are taken on `main` (#138, #139). Proposed:

- **ADR-72** "Background jobs run in a separate worker image that loads modules through a Next-free registry"
  (sections 4, 6, envelope and origins of 7).
- **ADR-73** "Jobs are enqueued through a transactional outbox relayed by the worker" (8.4).
- **ADR-74** "An organization job's queries are held to its organization by the tenant-scope guard" (9.1).
- **ADR-75** "Organizations have a timezone; schedules and dates never use the server's" (7.3, 11.1, 11.2).
- Amendments: ADR-66 (Redis is a configured endpoint; the worker port is never published), ADR-61 (queued subscribers,
  `jobs.failed`, subscribers run in the worker, `organizations.deleted` closes the "delete emits nothing" gap), ADR-60 (top-level `timezone`, `schedules` in module config).

Docs (English; `docs/18` is the `legal` module since #134; the MCP module spec, #136, takes the number after 19):

- `docs/19-jobs-module.md`: what it is, the worker image per platform, Redis requirements (`noeviction`, AOF, password,
  connection sizing), the dashboard and its exposure rules, operations (draining, a stuck outbox, a schedule that does
  not fire).
- `docs/19b-jobs-module-usage.md`: declaring jobs and schedules, enqueueing with `tx`, queued subscribers, `jobs.failed`,
  idempotency, ordering, coalescing and why it is not combined with a delay, trace propagation, `jobs.failed` delivered
  at least once, payload migration, organization schedules and DST, testing with the memory runtime, what may
  not run in a job (session helpers, raw SQL, Next), and the Next-free rule for subscribers, audit sinks and command
  hooks with the bundle check's error and how to fix it.
- Updates: `docs/self-hosting.md` (Redis, worker, dashboard access, Railway), `docs/10-wdrozenie.md`,
  `docs/12-moduly-kitu.md`, `docs/03-dane-i-organizacje.md` (organization job scope, timezone), `docs/04-auth-i-role.md`
  (`organizations.manage-settings`), `docs/05-moduly-rdzenia.md` (organization settings page),
  `docs/07-i18n-mail-env.md` (dates in organization time, mail locale in jobs), `docs/08-testy.md` (Redis integration,
  memory runtime), `docs/09-nowy-modul.md` ("Background work"), `AGENTS.md` Task Router rows (jobs, with the rule
  "subscribers, audit sinks and command hooks must not use Next or React: they also run in the worker"; dates and
  timezone), skill `gato-extend` (jobs, schedules, queued subscribers, and the same rule next to subscribers, audit sinks
  and command hooks), `EXTENSION_POINTS.md` (generated).
- One lesson per finding of the spike (Task 0).

## 19. Extension points

`src/features/jobs/extension-points.json` (module `experimental` for its first release, then `stable`, ADR-63):

- commands `jobs.retry` ("Retry one failed job"), `jobs.run-now` ("Run a schedule's job once now");
- event `jobs.failed` ("An organization job failed after its last attempt");
- jobs `jobs.outbox-prune`, `jobs.organization-schedules-tick`, `jobs.purge-organization`; schedule
  `jobs.outbox-prune-daily`;
- audit actions `job.retried`, `job.triggered` (in `module.ts` `auditActions`, labelled on the audit log page);
- a subscriber of `organizations.deleted` (9.4).

Core (`organizations`, `src/features/organizations/extension-points.json` or the core file):

- nav `organizations.settings` ("Organization settings link in the sidebar");
- slot `organizations.settings.sections` (experimental, "Server sections on the organization settings page, rendered
  with the organization id");
- event `organizations.deleted` ("An organization was deleted; subscribers run after its data is gone and must not write
  organization rows for it"); the `/organization/delete` better-auth path row now says it emits it;
- command `organizations.update-timezone`; event `organizations.timezone-changed`; permission
  `organizations.manage-settings` ("Change organization settings such as the timezone (default: owner, admin)").

Consumers:

- `audit-logs`: jobs `audit-logs.prune`, `audit-logs.prune-dispatch`; schedule `audit-logs.prune-daily` ("Prune audit
  log entries older than the configured days; off by default").
- `uploads`: jobs `uploads.orphans`, `uploads.orphans-dispatch`; schedule `uploads.orphans-daily` ("Delete storage objects
  without an upload row after a grace period, and storage of deleted organizations").

New catalog sections "Jobs" and "Schedules" in `EXTENSION_POINTS.md`; queued subscribers use the existing "Events"
section.
