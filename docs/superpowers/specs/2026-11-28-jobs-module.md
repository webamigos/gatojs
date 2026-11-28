# Background jobs: a `jobs` module on BullMQ, with retention and cleanup as its first consumers

Date: 2026-11-28, against `main` at `dd8214d` (GatoJS `0.40.0`, `kitFormat` 11). Drafted by an agent for Patryk. Status:
**draft; the owner's decisions so far are in section 17.1, the remaining questions in 17.2.** A plan follows once they are in.

Roadmap item: *"Background jobs: a job queue and scheduled tasks, including retention and cleanup, e.g. pruning old audit
log entries and orphaned uploads."* Decision already made by the owner: **BullMQ on Redis**, as in his other projects.

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
- GatoJS: `CLAUDE.md`, `AGENTS.md`, `kit/CLAUDE.md`, `EXTENSION_POINTS.md`, ADR-59 to ADR-69, `docs/09-nowy-modul.md`,
  `kit/modules/{audit-logs,uploads}.json`, `src/features/{audit-logs,uploads}/**`, `src/shared/lib/{events,commands,
  tenant-scope,modules}/`, `src/instrumentation.ts`, `src/app/api/healthcheck/route.ts`, `docker-compose.yml`,
  `docker-compose.selfhost.yml`, `Dockerfile`, `railway.toml`, `deploy/helm/gatojs/`, `packages/gato-cli/src/manifest/
  schema.ts`, and the earlier specs [`2026-10-26-wa-kit-design.md`](2026-10-26-wa-kit-design.md) (the original
  `worker` module row) and [`2026-11-22-packages-design.md`](2026-11-22-packages-design.md) §6 ("a jobs package comes
  with a background-jobs module").

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
- **Durable reactions.** ADR-61 says it plainly: domain events are in-process and best effort, *"a `jobs` module would
  bring that"*.

**Goal:** a GatoJS module (Gato or project) declares jobs and schedules in one registry file, enqueues them with a
typed, organization-carrying origin, and a worker runs them with retries, in every deployment shape GatoJS supports
(Compose, self-hosted Compose, Railway, Helm), without the developer touching a Gato file.

## 2. Goals and non-goals

Goals:

1. A `jobs.ts` registry file per module, like `events.ts` and `subscribers.ts`: typed payloads (Zod), retry policy,
   concurrency, and schedules, collected by `wa generate`.
2. Tenant safety by construction: every organization job carries `organizationId` in an envelope that the payload
   cannot override, and cross-organization maintenance is a separate, explicitly named scope.
3. One worker shape that works the same on a laptop, in `docker-compose.selfhost.yml`, on Railway and on Kubernetes.
4. Retention and cleanup shipped as the first consumers: audit-log pruning and orphaned-upload cleanup, configured in
   `src/gato.config.ts`.
5. Tests that need no Redis for handler logic, and an integration suite on a real Redis for the runtime.
6. The operational lessons of the three projects built in from the start (section 3), not rediscovered.

Non-goals (this spec):

- Durable execution (replay of a half-finished job). BullMQ re-runs a job from the top; handlers are idempotent
  (ADR-44 in Ragen made the same trade).
- Flows / parent-child job graphs (`FlowProducer`). Nothing in the kit needs them; a project can use BullMQ directly
  inside its own module later.
- A transactional outbox. Section 8.4 explains the gap and the pattern that covers it; an outbox is an open question.
- Organization-configurable schedules (an owner sets "prune my audit log after 90 days" in the UI). Schedules are
  project configuration in v1.
- A separate Node application (`apps/worker`) or a published jobs package. Section 6 explains why the worker is a role
  of the same image.
- Tracking which uploads are *referenced* by domain data. "Orphaned" in v1 means "a storage object with no `Upload`
  row", not "an `Upload` row nothing points at" (section 10.2).

## 3. What the three projects teach

All three run BullMQ in a worker process separate from the web process. What worked, and what bit them:

| Topic | What they do | Keep / avoid |
| --- | --- | --- |
| Contract | justnails and company-budget: `packages/queue` with `QUEUE` names, a `JobPayloads` interface and `enqueue*` helpers; the worker has `Record<QueueName, processor>` so a missing processor fails to compile. Ragen: `@ragenai/jobs` seam with `JOB_NAMES`, payloads, `JobContext`; `bullmq` imported in exactly one package, enforced by an architecture test. | **Keep** the single typed contract and the "only one place imports `bullmq`" rule. **Avoid** TypeScript-only payload types: company-budget's `crm-sync` had to skip legacy jobs whose payload shape changed (`integrationId` vs `organizationId`) because nothing validated the data at run time. GatoJS parses with Zod on both sides. |
| Connection | `maxRetriesPerRequest: null` on every connection in justnails/company-budget; justnails swallows `error` events with an empty handler. Ragen: `null` only on the worker's blocking connections; producers keep a finite budget so an enqueue **fails fast** instead of hanging a request. Lazy producer connection so imports and tests never open Redis. | **Keep** Ragen's split and the lazy producer. **Avoid** the silent `redis.on("error", () => {})`: log it, throttled. |
| Eviction | justnails/company-budget start Redis with `--maxmemory-policy noeviction`; Ragen also **refuses to boot** against an evicting Redis (and only warns when `CONFIG GET` is forbidden, as on Upstash). | **Keep** both. |
| Retries | Defaults in both small projects: 3 attempts, exponential backoff from 5 s, `removeOnComplete: 1000`, `removeOnFail: 5000`. Mail jobs use `attempts: 1` so a retry cannot double-send. Ragen maps a handler's `JobFailure { retryable: false }` to BullMQ's `UnrecoverableError`. | **Keep** all three. |
| Idempotency | company-budget: row first (`AgentRun` unique on `(organizationId, idempotencyKey)`), then `jobId = <name>-<sha256(...)>`; `deduplication: { id }` per connection while one is in flight; sweeps re-queue lost work. BullMQ rejects `:` in custom job ids and all-digit ids (Ragen hit this). Ragen deletes a file's vectors before re-writing, so a redelivered job replaces instead of duplicating. | **Keep**: deterministic, hashed job ids; dedupe ids; idempotent handlers as a documented rule. |
| Stalls | Ragen: CPU-bound work (sharp, pdfium) blocks the event loop, the lock is not renewed, BullMQ marks the job stalled and **runs it a second time in parallel**. Fix: `lockDuration` 5 min for that workload, `maxStalledCount: 1`, both overridable so an integration test can prove the stalled path. | **Keep** `maxStalledCount: 1` and per-job `lockDurationMs`; GatoJS's `uploads` uses `sharp`. |
| Concurrency | `concurrency` is **per Worker instance**; two replicas at 5 run 10. Ragen sets BullMQ's **global concurrency** for jobs that must not overlap (nightly maintenance) or that hit a rate-limited provider. Ragen also found its first regression was a unit confusion (jobs vs activities) in a default. | **Keep** per-job `concurrency` and `globalConcurrency`. |
| Schedules | justnails/company-budget: `upsertJobScheduler` at worker boot (BullMQ 6 removed legacy repeatable jobs). justnails reads a DB toggle and removes the scheduler when it is off ("a restart must not silently re-enable a schedule"). company-budget never removes a scheduler that left the code, so a deleted schedule keeps firing. Ragen keeps destructive schedules out of boot (explicit scripts with `--delete`) and found Temporal accepting a six-field cron that never fired. | **Keep** boot-time upsert, **add** reconciliation (remove schedulers this app owns that are no longer declared or are disabled), **validate** crons as five-field at registry build time. |
| Worker process | justnails/company-budget: `apps/worker` run by `tsx` in its own Docker image and Railway service; company-budget imports the app's `src/` through the `@/*` alias and needed a `next/cache` shim because `revalidatePath` throws outside a request, plus lazy `next/headers` imports, plus a lesson about app code running as CommonJS in the worker. justnails forbids the worker to import `src/` and calls the app back over HTTP with a shared `CRON_SECRET`. Ragen: a separate app with its own image. | **Avoid** a second build of the app code (section 6 runs the same build in a worker role). |
| Shutdown | All three: `SIGTERM` → stop the HTTP side → `worker.close()` (waits for in-flight jobs) → flush telemetry last → exit. Railway sends `SIGTERM` on every deploy, so the path runs constantly. Ragen: a script that opens a queue must close it or the process never exits. | **Keep**, plus a timeout below the platform's grace period. |
| Dashboard | justnails/company-budget: bull-board on the worker's own port behind Basic Auth (`BULL_BOARD_USER/PASSWORD`) with an unauthenticated `/health`. Ragen: the same, off unless both credentials are set, constant-time compare over hashes; it names "behind Better Auth in the admin app" as the honest home and defers it (proxying Express through a Next route is work). | Section 12: a small in-app page for global admins in v1; bull-board optional later. |
| Tests | justnails/company-budget: processors are framework-agnostic functions tested with Prisma mocked; a registry test asserts a processor per queue name. Ragen: unit tests of the adapter plus an integration suite on real Redis (enqueue → complete, retries, cancel, schedule fire, stalled recovery, double-run), which found a real race the mocks could not (`getRun` reading job and state in two round trips). justnails: CI did not run the worker tests for months. | **Keep** both levels; the worker code lives in `src/`, so `npm test` and `npm run verify` cover it with no extra workspace. |
| Observability | pino logs with `{ queue, jobId }` on `completed`/`failed`; OTel off unless `OTEL_EXPORTER_OTLP_ENDPOINT`; Ragen plans `bullmq-otel`; `job.updateProgress` rendered by bull-board. | **Keep**, through GatoJS's logger and `packages/observability`. |
| Secrets | Ragen moved payloads from content to identifiers ("whole documents sat unencrypted in the engine's storage and went stale"). company-budget: payloads carry integration ids, never credentials. justnails' email job carries rendered HTML with the recipient. | **Keep** ids-only payloads; render mail at run time. |

## 4. Shape of the change

Three parts, because GatoJS modules must not depend on an optional module and must not edit core files:

1. **Core seam** `src/shared/lib/jobs/` (in `mutation-gate.json` `critical`): `defineJobs`, `defineSchedules`, the
   registry check, the job envelope, `jobOrigin`, `enqueueJob`, the `JobRuntime` port and an in-memory runtime for
   tests. No `bullmq` import. Gato modules (`audit-logs`, `uploads`) and project modules declare jobs against this seam
   whether or not the `jobs` module is installed, exactly as `trackAudit` works with or without `audit-logs`
   (`auditSinks`).
2. **Kit module `jobs`** `src/features/jobs/`: the BullMQ runtime (producer and consumer), the worker role, scheduler
   reconciliation, health and shutdown, the admin page, Compose services, env schema. It is the only code that
   imports `bullmq` or `ioredis`.
3. **First consumers**: `src/features/audit-logs/jobs.ts` (pruning) and `src/features/uploads/jobs.ts` (orphan
   cleanup), each with its own module version bump.

Without the `jobs` module, `moduleJobs` and `moduleSchedules` still exist (declarations are validated, so a bad key fails
`npm test`), `enqueueJob` throws `JobsUnavailableError("jobs module is not installed or disabled")`, and schedules do
not run. `wa doctor` warns once: *"audit-logs declares schedules, but the jobs module is not installed; they will not
run"*. A module that must work without jobs checks `isModuleEnabled("jobs")` and does the work inline.

## 5. Module shape

### 5.1 Manifest `kit/modules/jobs.json`

```json
{
  "name": "jobs",
  "version": "0.1.0",
  "description": "Background jobs and schedules on BullMQ and Redis, with a worker role and an admin page",
  "requires": [],
  "files": [
    "src/features/jobs/**",
    "src/app/[locale]/(app)/admin/jobs/**",
    "docker/jobs.compose.yml",
    "docker/jobs.selfhost.compose.yml",
    "ci/jobs.integration-steps.yml"
  ],
  "dependencies": { "bullmq": "<pinned at implementation, 6.x>", "ioredis": "<pinned, 5.x>" },
  "devDependencies": {},
  "env": [
    { "name": "REDIS_URL", "example": "redis://localhost:6379", "selfhostExample": "redis://redis:6379", "required": true },
    { "name": "JOBS_ROLE", "example": "all", "selfhostExample": "web", "required": false },
    { "name": "JOBS_CONCURRENCY", "example": "5", "required": false },
    { "name": "JOBS_PREFIX", "example": "{{projectSlug}}", "required": false },
    { "name": "JOBS_SHUTDOWN_TIMEOUT_MS", "example": "25000", "required": false }
  ],
  "schemaRelations": [],
  "compose": "docker/jobs.compose.yml",
  "selfhostCompose": "docker/jobs.selfhost.compose.yml",
  "ciSteps": "ci/jobs.integration-steps.yml",
  "workspaces": []
}
```

`bullmq` 6 made `ioredis` an optional peer, so it is a direct dependency. Both go into `serverExternalPackages` in
`next.config.ts` (a core change, section 15): BullMQ loads Lua scripts from disk and the bundler cannot inline them
(company-budget and justnails both list them). No Prisma model in v1.

### 5.2 Files

```
src/features/jobs/
├── module.ts                 defineModule({ key: "jobs", nav: [], routePrefixes: ["/admin/jobs"], adminOnly … })
├── env.ts                    envSchema (5.3)
├── job-runtime.ts            export const jobRuntime: JobRuntime (registry contribution, 7.4)
├── extension-points.json
├── i18n/{pl,en}.json
├── runtime/                  the only files that import bullmq / ioredis
│   ├── connection.ts         producer and consumer connection options
│   ├── producer.ts           BullMQ JobRuntime: enqueue, dedupe, job ids
│   ├── consumer.ts           Worker per job, envelope parse, failure mapping
│   ├── schedules.ts          upsert + reconciliation of job schedulers
│   ├── redis-health.ts       eviction check
│   └── queue-names.ts        job name → queue name, prefix
├── worker/
│   ├── start-worker-role.ts  called from instrumentation (6.2)
│   └── shutdown.ts
├── services/queries/         admin page reads (global admin)
├── services/commands/        retry, run-now (global admin, 12)
└── components/
```

### 5.3 Environment

`src/features/jobs/env.ts` follows `uploads/env.ts` (registered in `moduleEnvSchemas`, verified by
`verifyEnvOnStartup` at boot, so a missing `REDIS_URL` stops the server with a readable message instead of failing
inside BullMQ later, as justnails' `loadEnv` does):

| Variable | Default | Rule |
| --- | --- | --- |
| `REDIS_URL` | none | Required when the module is enabled. `redis://` or `rediss://` (TLS). Through `@gatojs/env` `httpUrl`-style validation, a new `redisUrl` helper. |
| `JOBS_ROLE` | `all` in development, `web` in production | `web` (enqueue only), `worker` (consume and schedule), `all` (both; development and one-container installs). |
| `JOBS_CONCURRENCY` | `5` | Default per-worker concurrency for jobs that do not declare one. Counts whole jobs (Ragen's unit lesson). |
| `JOBS_PREFIX` | project slug | BullMQ key prefix, so two GatoJS apps can share one Redis without reading each other's queues. Must match `^[a-z0-9_-]+$`. |
| `JOBS_SHUTDOWN_TIMEOUT_MS` | `25000` | How long `SIGTERM` waits for in-flight jobs before forcing close. Below Kubernetes' default 30 s grace. |

No dashboard credentials in v1 (section 12). No timezone variable either: the schedule timezone is project
configuration in `src/gato.config.ts` (section 7.7), never the environment or the container's `TZ`.

### 5.4 Compose

Development `docker/jobs.compose.yml` (into `# wa:services` of `docker-compose.yml`):

```yaml
  redis:
    image: redis:7-alpine@sha256:<pinned at implementation>
    restart: always
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - ./volumes/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
```

The Redis image is `redis:7-alpine`, as in the owner's projects (decision 17.1), pinned by digest in both files like
`minio`. Self-hosted `docker/jobs.selfhost.compose.yml` (into `# wa:services` of `docker-compose.selfhost.yml`): `redis` without a
published port, with `requirepass ${REDIS_PASSWORD}` (section 17.2, Q9), a bind mount `./volumes/redis` (a region cannot
declare a top-level named volume, ADR-65), and the worker:

```yaml
  worker:
    build: .
    image: ${APP_IMAGE:-wa-app:local}
    env_file: .env.selfhost
    environment:
      <<: *app-environment
      JOBS_ROLE: worker
      NEXT_MANUAL_SIG_HANDLE: "true"
    depends_on:
      migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
    volumes:
      - uploads:/app/volumes/uploads
    stop_grace_period: 30s
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:3000/api/healthcheck"]
      interval: 10s
      timeout: 5s
      start_period: 30s
      retries: 5
    restart: unless-stopped
```

The `app` service gets `stop_grace_period` only through the core file; it does not need it (role `web`). The worker
mounts the core `uploads` volume, because orphan cleanup on local storage reads the same directory (section 10.2).
Docker's default stop timeout is 10 s, which would kill a job that `close()` was waiting for, hence
`stop_grace_period`.

### 5.5 Railway and Helm

- **Railway:** a second service from the same repository or the same GHCR image (ADR-67), start command
  `node server.js` (the image's `CMD`), variables `JOBS_ROLE=worker`, `NEXT_MANUAL_SIG_HANDLE=true`, the shared
  `REDIS_URL` from a Railway Redis service (Railway's Redis template must be switched to `noeviction`; the boot check
  catches it if not). No pre-deploy migration on the worker service. Healthcheck `/api/healthcheck`. Documented in
  `docs/self-hosting.md` ("Railway"), no `railway.worker.toml` (ADR-67 removed config-as-code files in favour of the
  runbook).
- **Helm:** the chart is core and has no module regions. Section 15 proposes a core change: `worker.enabled` (default
  `false`), `worker.replicaCount`, `worker.resources`, and a `templates/worker-deployment.yaml` that reuses the app's
  image, env and secret with `JOBS_ROLE=worker`, `terminationGracePeriodSeconds: 35`, no Service and no Ingress.
  Redis is external (`env.REDIS_URL` through `existingSecret`); whether the chart should ship an in-cluster Redis like
  Ragen's is Q5.

### 5.6 Egress check (ADR-66)

- ADR-66's list of configured endpoints gains **Redis (`REDIS_URL`)**. BullMQ and ioredis make no other connection.
- `kit/egress-check` gains a third leg, `jobs`: the sealed stack with `redis` and `worker` running, and a scenario step
  that triggers `jobs.run-now` for `uploads.orphans-daily` (section 12) and waits for the job to complete in the worker.
  No test-only job is added to the image. The canary rule is unchanged.
- `.github/workflows/egress-check.yml` adds `src/features/jobs/**`, `docker/jobs.selfhost.compose.yml` and
  `src/shared/lib/jobs/**` to its path filter.
- The `redis` image is pinned by digest like `minio`.

## 6. Where the worker runs

### 6.1 Options

| Option | How | For | Against |
| --- | --- | --- | --- |
| A. In every web process | `instrumentation.ts` starts BullMQ `Worker`s in each Next server | Nothing new to deploy | Scaling the web scales consumers; CPU-heavy jobs (`sharp`) block request handling and lock renewal (Ragen's stall lesson); a deploy of the web kills in-flight jobs; cannot run the worker without serving traffic |
| B. Separate entrypoint | `src/features/jobs/worker/main.ts`, `tsx` in development, an esbuild bundle (`worker.mjs`) in the image, `node worker.mjs` | Smallest worker process; the shape all three projects use | A second build of the app code: `server-only` throws outside the `react-server` condition, `next/cache` revalidation throws outside a request (company-budget shim), `next-intl` request config is absent, Prisma 7's generated client must bundle; needs a manifest `scripts` field, a Dockerfile build region and a runner copy region (all `kitFormat` changes); company-budget's "app code in the worker runs as CommonJS" lesson is the same class of drift |
| **C. Worker role of the same image** | The image runs `node server.js` as today; `JOBS_ROLE=worker` makes `instrumentation.ts` start the consumers and schedulers; the web keeps `JOBS_ROLE=web`; `NEXT_MANUAL_SIG_HANDLE=true` gives the worker its own `SIGTERM` handling | One build, one image, one Dockerfile; the job code runs in exactly the runtime the app runs (server-only, `next/cache`, Prisma, logger, OTel all already work); healthcheck for free (`/api/healthcheck`); scales independently of the web; same command on Compose, Railway and Helm | The worker carries a Next server it barely uses (roughly 100 to 150 MB RSS more than B); the worker container listens on a port (no Ingress routes to it); a job handler changed in `next dev` needs a dev-server restart, because consumers hold handler references from boot |

### 6.2 Recommendation: C

**Recommended: C, a dedicated worker service running the same image in a worker role.** It is a separate process,
scaled and deployed on its own, which is what made the three projects' workers reliable, without the second build that
cost company-budget a shim, a lesson and a lazy-import rule, and justnails an HTTP callback with a shared secret. The
memory overhead is the price; if it ever matters, B can be added behind the same `JobRuntime` without touching a
handler, because handlers never see the process shape.

Mechanics, all proven by the spike (Task 0) before anything else is built:

- `src/instrumentation.ts` (core) gains one generated call: after `verifyEnvOnStartup`, it awaits each
  `jobRuntimes` entry's `startRole(process.env.JOBS_ROLE)`. Without the `jobs` module the list is empty.
- `startRole("worker" | "all")`: eviction check (refuse to start on an evicting Redis, warn when `CONFIG GET` is
  forbidden), build one `Worker` per job with `autorun: false`, apply global concurrency, reconcile schedules, install
  the `SIGTERM`/`SIGINT` handler, then `run()` (Ragen's ordering: nothing consumes before the check passed and the
  shutdown handler exists).
- `startRole("web")`: nothing at boot; the producer connects lazily on the first enqueue.
- `NEXT_MANUAL_SIG_HANDLE=true` is set only on the worker service. The spike must confirm that the standalone
  `server.js` then leaves `SIGTERM` to the app and that our handler can close the HTTP server and exit.
- Development: `npm run dev` with the default `JOBS_ROLE=all` runs consumers inside the dev server. There is no second
  `next dev` (two dev servers in one directory fight over `.next`).

## 7. Declaring jobs and schedules

### 7.1 `jobs.ts`

```ts
import { z } from "zod";
import { defineJobs, defineSchedules } from "@/shared/lib/jobs";
import { pruneAuditLogs } from "./services/jobs/prune-audit-logs";
import { dispatchAuditLogPruning } from "./services/jobs/dispatch-audit-log-pruning";

const retentionSettings = z.object({ olderThanDays: z.number().int().min(1).max(3650) });

export const jobs = defineJobs({
  "audit-logs.prune": {
    scope: "organization",
    payload: retentionSettings,
    attempts: 3,
    globalConcurrency: 1,
    run: (payload, ctx) => pruneAuditLogs(ctx.organizationId, payload.olderThanDays, ctx),
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

| Field | Meaning |
| --- | --- |
| key | `<module>.<name>`, kebab-case after the dot. Also the BullMQ job name. |
| `scope` | `"organization"` (the envelope carries an `organizationId`, `ctx.organizationId` is a `string`) or `"system"` (no organization; for dispatchers and cross-organization maintenance, section 9.3). |
| `payload` | A strip-mode `z.object()` (the ADR-61 rule): no `organizationId`, `actorUserId` or `serviceMode` key, no loose/strict/catchall, no `.transform()` around it, and no key from the sensitive-name list (section 13). |
| `run(payload, ctx)` | The handler. Returns `void` or a small JSON value (kept as the BullMQ return value for the admin page, capped at 10 kB). |
| `attempts` | Default 3. `1` for anything that sends mail or calls a non-idempotent external API. |
| `backoff` | Default `{ type: "exponential", delayMs: 5000 }`. |
| `concurrency` | Per worker process. Default `JOBS_CONCURRENCY`. |
| `globalConcurrency` | Across every worker replica (BullMQ `setGlobalConcurrency`). Set to `1` for maintenance that must not overlap. |
| `lockDurationMs` | Default 30 000 (BullMQ's). Raise for CPU-bound handlers that block the event loop. `maxStalledCount` is always 1. |
| `timeoutMs` | Optional. `ctx.signal` aborts after it; the job fails with `JobTimeoutError` (retryable). The handler's own work is not killed, only abandoned (Ragen's note); handlers pass `ctx.signal` to `fetch` and check it in loops. |
| `retain` | Default `{ completed: { ageSeconds: 86400, count: 1000 }, failed: { ageSeconds: 604800, count: 5000 } }`. |

A schedule definition: key `<module>.<name>`, `job` (must be a `system` job of the same module; organization fan-out is
the job's business, section 9.3), `cron` (five fields only), optional `timezone` (IANA name, section 7.7), `enabledByDefault`, optional
`settings` schema and `defaultSettings` (become the job payload, overridable in `gato.config.ts`).

### 7.2 Registry check

`createJobRegistry(moduleJobs, moduleSchedules, gatoConfig)` validates every entry, enabled module or not, and throws
one `JobRegistryError` listing every problem (the `createEventBus` and `commandHookRegistry` style):

- key without the module prefix, or not `^[a-z0-9-]+\.[a-z0-9-]+$`;
- duplicate job or schedule key;
- payload schema that is not a strip-mode `z.object()`, declares a reserved key, or a sensitive key name;
- `attempts`, `concurrency`, `globalConcurrency` not positive integers; `lockDurationMs` below 5 000;
- schedule of an unknown job, of a job in another module, or of an `organization` job;
- a cron that is not five fields or that BullMQ's parser rejects (Ragen's six-field lesson: six fields mean
  seconds-first in BullMQ, which is never what a retention schedule wants);
- a schedule `timezone` that is not an IANA name (section 7.7);
- `defaultSettings` that fail `settings`, or a `gato.config.ts` override (7.3) that fails it.

A test builds the registry from the real `@/modules.generated`, so a bad declaration fails `npm test`, as events do.

### 7.3 Configuration in `gato.config.ts`

`GatoModuleConfig` gains `schedules`, keyed by the generated `ScheduleId` union:

```ts
export default defineGatoConfig({
  modules: {
    "audit-logs": {
      schedules: {
        "audit-logs.prune-daily": { enabled: true, cron: "30 2 * * *", timezone: "Europe/Warsaw", settings: { olderThanDays: 180 } },
      },
    },
    uploads: { schedules: { "uploads.orphans-daily": null } },
  },
});
```

`null` disables a schedule (like slot contributions). Unknown schedule ids fail `applyGatoConfig` at import (ADR-60).
The config stays client-safe plain data; `settings` are validated against the schedule's schema on the server side, in
the registry check above, so a wrong value stops `next build`, `npm run dev` and every worker boot with the path named.

### 7.4 Generator

`wa generate` (gato-cli minor bump, **`kitFormat` 12**):

- detects `jobs.ts` and emits, in the server registry only, `moduleJobs` and `moduleSchedules` (all modules, like
  `moduleEvents`, so a disabled module's declarations are still checked) and `jobRegistry = createJobRegistry(...)`;
- detects `job-runtime.ts` and emits `jobRuntimes = enabledEntries([{ module: "jobs", value: jobsJobRuntime }],
  gatoConfig)`, the `auditSinks` pattern;
- adds `JobName` and `ScheduleId` unions to `src/extension-points.generated.ts` and two sections, "Jobs" and
  "Schedules", to `EXTENSION_POINTS.md` (extension-points.json gains `jobs` and `schedules` maps).

### 7.5 Enqueueing

```ts
const result = await enqueueJob(jobOrigin(context), "invoices.render-pdf", { invoiceId }, { dedupeKey: invoiceId });
```

- `jobOrigin(context: OrgContext)` → `{ organizationId, actorUserId, serviceMode }`; `jobOrigin(event)` from a
  subscriber's event; `systemOrigin(reason)` for `system` jobs (the reason is logged). An `organization` job enqueued
  with a system origin, or the reverse, throws.
- The payload is parsed with the job's schema before anything is sent; failure throws `JobPayloadError` naming the job
  (a bug in the caller, like an invalid event payload).
- Options: `dedupeKey` (BullMQ `deduplication` while one is in flight), `jobKey` (a deterministic job id: a second
  enqueue with the same key is a no-op), `delayMs`. Both keys are hashed with the organization and the job name into
  `<job>-<sha256 hex, 40 chars>`, so a key from one organization cannot collide with or suppress another's, and the id
  never contains `:` or only digits.
- Returns `{ jobId }`. Throws `JobsUnavailableError` without a runtime and `JobEnqueueError` when Redis refuses; the
  producer connection has a finite retry budget and no offline queue, so a request fails in seconds instead of hanging
  (Ragen's failure table).

### 7.6 The envelope

What BullMQ stores is never the raw payload:

```ts
{ v: 1, organizationId: string | null, actorUserId: string | null, serviceMode: boolean, payload: { … } }
```

The consumer parses the envelope with a strict schema and the payload with the job's schema. A mismatch (a job written
by an older release with a different shape, company-budget's `crm-sync` case) fails with `UnrecoverableError`
(`"payload does not match <job> v1"`) and is logged at `error` without the payload: it is never retried and never
silently skipped. Changing a payload incompatibly is a migration: accept both shapes in the schema (a union) for one
release, or drain the queue first; `docs/18b` says so.

### 7.7 Timezones

Schedules never depend on the server's or the container's timezone (decision 17.1).

- **App-wide default.** `GatoConfig` gains a top-level, client-safe `jobs` field:
  `defineGatoConfig({ jobs: { timezone: "Europe/Warsaw" }, … })`. It is validated with Zod
  (`z.string().refine(isIanaTimeZone)`, where `isIanaTimeZone` accepts `"UTC"` and every name in
  `Intl.supportedValuesOf("timeZone")`), default `"UTC"`. An invalid name fails `applyGatoConfig` at import with
  `- jobs.timezone: not an IANA time zone: <value>` (ADR-60), so `next build`, `npm run dev` and every worker boot stop.
- **Per schedule.** `defineSchedules({ "<id>": { cron, timezone?: "Europe/Warsaw" } })` overrides the default for one
  schedule, and `modules.<module>.schedules.<id>.timezone` in `gato.config.ts` overrides both. Resolution order:
  config override → schedule declaration → `jobs.timezone` → `"UTC"`.
- **Always explicit to BullMQ.** The resolved name is passed as `repeat.tz` to `upsertJobScheduler` on every schedule,
  never omitted: without `tz`, BullMQ's cron parser falls back to the process's local time, which is exactly the
  dependency this rule removes. A changed timezone changes the scheduler and reconciliation (8.5) re-upserts it.
- **Containers run in UTC and `TZ` is ignored.** The image, Compose files, Helm chart and Railway runbook set no `TZ`;
  `docs/18` says that the server timezone has no effect on schedules and that the way to change one is
  `gato.config.ts`. An integration test boots the worker with `TZ=America/New_York` and asserts that a schedule with
  `timezone: "Europe/Warsaw"` and `0 3 * * *` gets its next run at 03:00 Warsaw time.
- **Job code computes in UTC.** Retention cutoffs and grace periods are UTC instants (10.1, 10.2); `ctx` exposes the
  schedule's resolved timezone (`ctx.timezone`) for jobs that need local calendar boundaries.
- **DST.** The kit's own schedules default to UTC, so DST cannot shift or skip them. A project that picks a DST zone
  should avoid local times between 01:00 and 03:00 (a slot in the skipped spring hour does not fire that day, the
  repeated autumn hour can fire twice); `docs/18b` says so and the handlers are idempotent anyway (8.3).
- The admin page (12) shows each schedule's timezone and its next run in that timezone and in UTC.

Future work, not in this spec (17.2, Q12): a per-organization timezone stored on `Organization`, used by
organization-facing schedules (a dispatcher would compute each organization's due slot in its own zone, for example a
daily digest at 08:00 local time) and by date display in the UI.

## 8. Running jobs

### 8.1 The handler context

`run(payload, ctx)` receives a frozen `ctx`:

| Field | Meaning |
| --- | --- |
| `organizationId` | `string` for `organization` jobs, absent for `system` jobs (typed per scope). Always from the envelope. |
| `actorUserId`, `serviceMode` | From the origin; jobs that write audit rows pass them on. |
| `jobId`, `attempt`, `maxAttempts` | For logs and idempotency keys. |
| `timezone` | The resolved IANA timezone of the schedule that produced the job, else `jobs.timezone` (section 7.7). |
| `signal` | `AbortSignal`: aborted on `timeoutMs` and on forced shutdown. |
| `log` | The GatoJS logger bound to `{ job, jobId, organizationId, attempt }`. |
| `progress(stage)` | `job.updateProgress({ stage })`; a Redis error here is logged, never fails the job (Ragen). |
| `enqueue(name, payload, options)` | `enqueueJob` with the job's own origin; for fan-out (9.3). |

There is no session: a handler must not call `getOrgContext`, `requireModuleAccess`, `headers()` or `cookies()`. It calls
services that take `organizationId` as an argument. A query in `services/queries/` that starts with `getOrgContext()`
cannot be reused from a job; the pattern is an inner function with an explicit organization, which the query wraps.

### 8.2 Failures and retries

- A thrown error is retried up to `attempts` with the job's backoff.
- `throw new JobFailure(message, { retryable: false })` (or a `DomainError`) becomes BullMQ's `UnrecoverableError`:
  one failure, no retries (Ragen's `asEngineFailure`).
- A job name with no handler in this worker (a newer web enqueued a job an older worker does not know, or the module was
  disabled after enqueueing) fails with `UnrecoverableError("no handler for <job>")`, logged at `error`.
- A handler of a module disabled in `gato.config.ts` is not registered; its schedulers are removed (8.5); jobs already
  queued fail as above.

### 8.3 Idempotency

Delivery is **at least once**: a crash, a stall or a lost lock re-runs the job from the top. Rules, in `docs/18b`:

1. Write handlers so a second run is harmless: `deleteMany` with a cutoff, upserts on a natural key, "claim" rows with a
   compare-and-set (`updateMany({ where: { id, status: "PENDING" } })`) before acting.
2. Side effects outside the database (mail, an external API) run once: `attempts: 1`, or record "sent" on a row first
   and check it.
3. Use `jobKey` for "this exact unit of work" (one invoice's PDF) and `dedupeKey` for "not two at once" (one
   integration's sync).

### 8.4 Enqueue after a write is not atomic

`prisma.$transaction` cannot include a Redis write. If a command commits and the enqueue fails, the job is lost; if the
enqueue succeeds and the transaction rolls back, the job runs for data that does not exist. v1 does not hide this:

- enqueue **after** the commit, never inside the transaction;
- when losing the job matters, write the intent to a row first (status `PENDING`), enqueue with `jobKey = row id`, and
  let a scheduled sweep re-enqueue rows still `PENDING` after N minutes (company-budget's `agent-proposal-sweep`);
- when it does not (a cache rebuild), log the enqueue failure and move on.

A generic outbox table is Q6.

### 8.5 Schedules

On `startRole("worker" | "all")`, before consuming:

1. Compute the effective schedules: declared ∩ enabled modules, with `gato.config.ts` overrides, minus disabled ones.
2. `upsertJobScheduler(scheduleId, { pattern, tz }, { name: job, data: envelope(systemOrigin, settings) })` for each.
   Idempotent and safe with several workers booting at once.
3. List the schedulers on every queue this app owns (`getJobSchedulers` under `JOBS_PREFIX`) and remove each whose id
   is not in the effective set. This is what company-budget lacks (a deleted schedule kept firing) and replaces
   justnails' DB toggle: the code and `gato.config.ts` are the single source of truth, so a restart can neither
   re-enable nor keep a schedule that the configuration turned off.

A schedule fires on the worker's queue whether or not a worker is running; missed slots are not back-filled (BullMQ
job schedulers produce the next slot only). Destructive schedules ship `enabledByDefault: false` unless losing their
target is harmless (section 10).

### 8.6 Queues and concurrency

- One BullMQ queue per job (`<prefix>` + job key), as Ragen and justnails do, so a slow job cannot starve another and
  each has its own concurrency. One `Worker` per queue, each with its own blocking connection; the producer shares one
  connection across queues. A project with many jobs therefore opens many connections; `docs/18` gives the formula
  (`jobs + 1` per worker replica, plus one per web replica) for sizing a managed Redis.
- `globalConcurrency` is applied before the queue's `Worker` runs (Ragen's ordering).

### 8.7 Shutdown

The worker's `SIGTERM`/`SIGINT` handler (once): mark the role as draining (healthcheck answers 503 so an orchestrator
stops routing), `worker.close()` on every worker in parallel (BullMQ waits for in-flight jobs), with
`JOBS_SHUTDOWN_TIMEOUT_MS` after which `ctx.signal` aborts and `close(true)` forces; close the producer queues;
`prisma.$disconnect()`; flush OTel last so the shutdown lines reach the collector (justnails); close the HTTP server;
`process.exit(0)`. A forced close leaves locked jobs, which BullMQ redelivers after their lock expires (once, because
`maxStalledCount` is 1). Web processes only close the producer connection.

## 9. Multi-tenancy

### 9.1 Organization jobs

- `organizationId` lives in the envelope and only there. The payload schema cannot declare it (registry check) and is
  parsed in strip mode, so an `organizationId` smuggled into the payload never reaches the handler, the ADR-61 rule.
- The origin comes from an `OrgContext` (after `getOrgContext()` or `requireModuleAccess()` and
  `assertServiceModeConfirmed`) or from an event's own `organizationId`. A caller cannot name another organization
  except through `systemOrigin` plus an explicit fan-out (9.3).
- Every Prisma query in a handler filters by `ctx.organizationId`; the tenant-scope guard (D51) applies unchanged inside
  the worker, because the worker runs the same Prisma client with the same extension.
- Recommended hardening (Q8): while an organization job runs, an `AsyncLocalStorage` scope holds `ctx.organizationId`
  and the tenant-scope guard also rejects a scoped query whose `organizationId` filter is a different literal. The guard
  then catches not only a missing filter but a wrong one. Core change in `src/shared/lib/tenant-scope/` (critical).

### 9.2 Service mode

- Service mode is a property of the operation that enqueued the job, not of the job. The command that enqueues already
  passed `assertServiceModeConfirmed`; the job asks nothing and carries `serviceMode: true` in its origin, so audit rows
  written by the job record it (as subscribers do, ADR-61).
- No organization data UI in this module. The admin page's commands (retry, run now) are `access: "global-admin"`
  commands (ADR-62): they act on the platform's queue, not on an organization's data, and run without a service-mode
  dialog, like the users admin. Each writes a log line with the admin's id; whether they also write an audit row is
  Q7.

### 9.3 Cross-organization maintenance

`system` jobs have no organization. Two patterns, in order of preference:

1. **Dispatch, then per organization** (company-budget's `*-dispatch` jobs): the system job reads the organization
   ids (`Organization` has no `organizationId` column, so the guard does not apply) and calls
   `ctx.enqueue("<module>.<job>", payload, { organizationId, jobKey: "<slot>" })` per organization. The per-organization
   job then runs with an organization origin and ordinary scoped queries. Retention uses this.
   `ctx.enqueue` from a system job is the one place an organization origin is built from an id instead of a context;
   it requires the id to exist in `Organization` (checked) and logs the dispatch.
2. **`withoutTenantScope(reason, fn)`** only for a Prisma query on a tenant-scoped model that genuinely spans
   organizations (for example, a count of `Upload` rows per organization for a report). The reason is mandatory and
   logged, as today. Neither first consumer needs it: retention fans out, and the deleted-organization purge (10.2)
   reads `Organization` (not tenant-scoped) and storage (not Prisma).

An architecture test (section 14.4) rejects `withoutTenantScope` in an `organization` job's handler file.

## 10. First consumers

### 10.1 Audit-log retention (`audit-logs` module)

- `audit-logs.prune-dispatch` (system) → `audit-logs.prune` (organization) per organization, payload
  `{ olderThanDays }`.
- `audit-logs.prune` deletes in batches: `findMany({ where: { organizationId, createdAt: { lt: cutoff } }, select: { id },
  take: 5000, orderBy: { createdAt: "asc" } })` then `deleteMany({ where: { organizationId, id: { in: ids } } })`,
  repeated until fewer than 5 000 rows come back or `ctx.signal` aborts. Short transactions, no table-wide lock,
  naturally idempotent. The cutoff is computed once per job run from the job's start time
  (`startOfDay(now) - olderThanDays` in UTC), so a retry an hour later deletes the same set.
- Logs `{ organizationId, deleted, cutoff }`. No audit row per organization per night by default (Q7).
- Schedule `audit-logs.prune-daily`, `0 3 * * *`, `enabledByDefault: false`, default `olderThanDays: 365`. Deleting
  audit history is irreversible and a legal decision (retention periods differ per client and jurisdiction), so the
  project turns it on (Q2).
- The existing `@@index([organizationId, createdAt])` serves the query; no migration.

### 10.2 Orphaned uploads (`uploads` module)

Where orphans come from today (verified in `create-upload.ts` and `upload-commands.ts`):

| Source | Result |
| --- | --- |
| `putObject` succeeded, `prisma.upload.create` failed, rollback `deleteObject` failed (logged) | object, no row |
| `uploads.delete`: `deleteObject` failed (logged), row deleted anyway | object, no row |
| organization deleted (`Upload` rows cascade, storage untouched) | every object under `orgs/<id>/` |
| process killed between `putObject` and `create` | object, no row |

Changes:

- `ObjectStorage` gains `list(prefix, cursor?) → { items: { key, lastModified }[], cursor? }` (S3 `ListObjectsV2`, local
  directory walk confined by `path-inside.ts`). `uploads` module change with a version bump.
- `uploads.orphans` (organization): lists `orgs/<organizationId>/`, and deletes each object older than the grace period
  (default 24 h, so an upload in flight between `putObject` and `create` is never touched) whose key has no `Upload`
  row in that organization. Pages of 1 000 keys, one `findMany({ where: { organizationId, key: { in } } })` per page.
- `uploads.orphans-dispatch` (system): enqueues `uploads.orphans` per organization, then handles deleted organizations:
  lists the top-level `orgs/` prefixes, keeps only UUID-shaped ids, and for each id absent from `Organization` deletes
  the prefix. A prefix is purged only when the `Organization` table is not empty, so a worker pointed at an empty or
  wrong database purges nothing. **Circuit breaker:** if one run would delete more than `maxObjectsPerRun` (default 10 000) objects or
  more than `maxOrganizationsPerRun` (default 20) whole prefixes, it deletes nothing, logs `error` with the counts, and
  fails unrecoverably, so a bug or a pointed-at-the-wrong-database worker cannot wipe a bucket.
- Schedule `uploads.orphans-daily`, `30 3 * * *`, `enabledByDefault: true` (it only deletes objects no row refers to,
  after a grace period); `settings: { graceHours, maxObjectsPerRun, maxOrganizationsPerRun, purgeDeletedOrganizations }`.
  Whether `purgeDeletedOrganizations` defaults to `true` is Q3.
- Out of scope: `Upload` rows whose object is missing (logged as a warning count, not repaired) and rows that nothing
  in the domain references (needs an attach/reference API, a later spec).

## 11. Domain events

- A subscriber that needs durability or retries enqueues: `run: (event) => enqueueJob(jobOrigin(event), "x.y", { … })`.
  The subscriber stays fast and in-process (ADR-61's rules unchanged); the job brings retries.
- If the enqueue throws, the subscriber error is logged by the bus and the operation still succeeds (ADR-61), so the
  job is lost; subscribers that must not lose work use the row-first pattern (8.4).
- Later (Q10, not v1): `defineSubscribers({ "e": { id, queued: { job: "x.y" } } })` as sugar, and a `jobs.failed` event
  (organization jobs only) after the last attempt, so a project can notify someone.

## 12. Admin UI

Recommendation: **a small in-app page, no bull-board in v1.**

- `/admin/jobs`, `adminOnly` (global `admin` and `superadmin`), guarded by `requireModuleAccess("jobs")`.
- Read-only list per job: waiting / active / delayed / failed / completed counts; schedules with cron, timezone,
  enabled state and next run; the last 50 failed jobs with job name, organization name, attempts, time and
  `failedReason` (truncated to 500 characters). **No payloads**, no stack traces in the UI (they go to the logs).
- Two commands: `jobs.retry` (retry one failed job) and `jobs.run-now` (enqueue a schedule's job once with its current
  settings). `access: "global-admin"`, declared in `module.ts`, in `extension-points.json` as `stable` commands.
- Why not bull-board in v1: it shows every payload and every stack trace to whoever has the Basic Auth password, which
  is a second credential outside better-auth (Ragen named this itself), it needs an Express server on a separate port
  in the worker, which the egress check and the Helm chart then have to know about, and proxying it through a Next route
  is real work (Ragen deferred it). The small page covers "is it stuck, what failed, run it again". bull-board stays
  possible as an opt-in later (Q4).

## 13. Security

- **Payloads are identifiers.** Redis is not encrypted at rest and BullMQ keeps failed jobs for days. Payload schemas
  may not declare keys matching `/(password|secret|token|apikey|api_key|authorization|cookie|session)/i` (registry
  check). Mail is rendered at run time from ids, with the locale passed explicitly, never stored rendered with its
  recipient (justnails' email job is the counter-example).
- **Failure reasons** may contain PII from an exception message. The admin page truncates them; logs go through the
  existing logger redaction. `removeOnFail` keeps them 7 days by default.
- **Redis access:** `rediss://` supported; self-hosted Redis gets a password (Q9) and no published port; `JOBS_PREFIX`
  isolates apps sharing an instance. Redis is a configured endpoint (ADR-66).
- **No secrets in the worker that the web does not have.** Same image, same env file; no `CRON_SECRET`-style
  callback, because the worker runs the app's code directly.
- **Unknown job names** fail unrecoverably; a job cannot name a handler that is not registered.
- **Eviction** refused at boot.

## 14. Testing

### 14.1 Unit (no Redis, `npm test`)

- `createMemoryJobRuntime()` in `src/shared/lib/jobs/testing.ts`: records enqueues (name, envelope, options) and
  `drain()` runs them through the **real** envelope parse, the real registry and the real context, synchronously, with
  retries simulated per `attempts`. Handler tests use it, or call the handler with `createTestJobContext({
  organizationId })`.
- Registry check tests (every rule in 7.2) as literals, like the event bus tests.
- `jobOrigin`, envelope strip and reject, job id hashing (`:` never appears, all-digit never appears, organizations
  never collide), schedule reconciliation planning as a pure function (`planScheduleChanges(existing, effective)`),
  failure mapping, shutdown ordering with fakes, eviction check with a fake `CONFIG GET` (array and object answers,
  forbidden, empty).
- Retention: cutoff from a fixed clock, batch loop stops at fewer than the batch size and on abort.
- Orphans: grace period boundary, prefix parsing (UUID only), circuit breaker thresholds, a key in another
  organization's prefix never considered.
- Generator: `registry.test.ts` pins the new generated lines; extension-points catalog test covers the new sections.

### 14.2 Integration on real Redis and Postgres (`npm run test:integration`)

- Redis from `docker compose up -d redis`; `INTEGRATION_REDIS_URL` (default `redis://localhost:6379/15`). The helper
  refuses to run unless `JOBS_PREFIX` ends with `_test` (mirroring the `*_test` database rule) and obliterates only that
  prefix between suites.
- `ci/jobs.integration-steps.yml` starts Redis in the `assemble` job, as `uploads` starts MinIO.
- Suites: enqueue → complete; retry with backoff → final failure; `JobFailure` not retried; dedupe and `jobKey`;
  envelope mismatch not retried; a stalled job redelivered exactly once (with a short `lockDurationMs` and
  `stalledInterval` passed only by the test, Ragen's approach); `globalConcurrency: 1` across two `Worker`s; schedule
  upsert idempotent across two boots and orphan scheduler removed; `SIGTERM` waits for an in-flight job.
- **Isolation (required for every query or command on domain data, AGENTS.md):** two organizations; `audit-logs.prune`
  for A deletes only A's old rows; `uploads.orphans` for A never lists or deletes B's objects; a payload carrying B's
  `organizationId` in an A job does not reach B.

### 14.3 End to end

One Playwright test in `core-auth` when `jobs` is installed: a superadmin opens `/admin/jobs`, sees the schedules,
runs `uploads.orphans-daily` now and sees it complete. The e2e server runs with `JOBS_ROLE=all`.

### 14.4 Architecture tests

- `bullmq` and `ioredis` imported only under `src/features/jobs/runtime/` (Ragen's seam rule, type imports included).
- A file that declares an `organization` job's handler does not import `getOrgContext`, `requireModuleAccess`,
  `next/headers` or `withoutTenantScope`.
- `client-bundles-stay-server-free`: `"use client"` files do not import `@/shared/lib/jobs` or any `jobs.ts`.

### 14.5 Mutation targets

Critical (`mutation-gate.json`): `src/shared/lib/jobs/` (registry check, envelope, origin, job ids, enqueue),
`src/features/jobs/runtime/` (failure mapping, schedule reconciliation, eviction check, connection options),
`src/features/audit-logs/services/jobs/`, `src/features/uploads/services/jobs/`. Mutants to kill are listed per task in
section 16; the theme is: a removed organization filter, an origin taken from the payload, a reconciliation that
removes another app's or a still-declared schedule, a cutoff off by a day, a grace period ignored, a circuit breaker
comparison flipped, a non-retryable failure retried.

## 15. Changes outside the module

Each is its own commit with a `core` (or owning module) version bump, as `kit/CLAUDE.md` requires:

| Change | File(s) | Owner |
| --- | --- | --- |
| Seam `src/shared/lib/jobs/` | new | core |
| `jobRuntimes` call in `register()` | `src/instrumentation.ts` | core |
| `schedules` in `GatoModuleConfig`, top-level `jobs.timezone`, validation | `src/shared/lib/modules/gato-config.ts` | core |
| `serverExternalPackages: ["bullmq", "ioredis"]` | `next.config.ts` | core (harmless without the module) |
| Generator: `jobs.ts`, `job-runtime.ts`, extension-point sections, `kitFormat` 12 | `packages/gato-cli/src/generate/**`, `kit/kit.json`, `kit-format.ts` | kit |
| `doctor` warning for schedules without the `jobs` module | `packages/gato-cli/src/doctor/**` | kit |
| Helm `worker.*` values and `worker-deployment.yaml` | `deploy/helm/gatojs/` | core |
| Tenant-scope expected-organization check (if Q8 = yes) | `src/shared/lib/tenant-scope/` | core |
| `redisUrl` helper | `packages/env` | core |
| `ObjectStorage.list` | `src/features/uploads/` | uploads |
| ADR-66 endpoint list, egress-check `jobs` leg | `docs/adrs/66-…`, `kit/egress-check/`, workflow | kit |
| `assemble` matrix: `jobs` alone, `jobs+audit-logs+uploads`, `all` | `.github/workflows/kit.yml` | kit |

## 16. Phased plan outline

Each task follows `AGENTS.md`: `test-writer` writes the tests from "Zachowania" before the implementation and shows them
red; the implementer works with `.gato/phase` = `implement`; `test-reviewer` runs `npm run test:mutation:task` and
`npm run test:mutation:gate`. This is an outline; the plan file adds signatures, files and full behaviour lists.

### Phase 0: spike (throwaway branch, result is a lesson and a go/no-go)

**Task 0. Worker role in the standalone image.** Build the image, run two containers (`JOBS_ROLE=web`, `JOBS_ROLE=worker`
with `NEXT_MANUAL_SIG_HANDLE=true`) and Redis; enqueue from a route, process in the worker, `docker stop` during a 20 s
job.

**Zachowania:** the job completes in the worker container and never in the web container; `docker stop` waits for the
job and the container exits 0 within `stop_grace_period`; `server.js` does not exit before our handler finishes; the
standalone output contains `bullmq` and `ioredis` with their Lua scripts; RSS of an idle worker container recorded.

**Mutacje do zabicia:** n/a (spike). If any behaviour fails, the spec switches to option B (section 6.1) before Phase 1.

### Phase 1: core seam (`kitFormat` 12)

**Task 1. `defineJobs`, `defineSchedules` and the registry check.**

**Zachowania:** each rule of 7.2 as a literal input → the exact `JobRegistryError` problem line; a valid registry →
frozen lookups by name; cron `"0 3 * * *"` accepted, `"0 0 3 * * *"` and `"61 * * * *"` rejected; timezone
`"Europe/Warsaw"` accepted, `"Mars/Base"` rejected; payload with `organizationId`, `apiToken` or `.passthrough()`
rejected; a schedule of an organization job rejected.

**Mutacje do zabicia:** prefix check removed; duplicate check removed; reserved-key check skipped for nested
`.optional()`; five-field check replaced by "≥ 5"; sensitive-name regex made case-sensitive.

**Task 2. Envelope, origins, job ids, `enqueueJob` and the memory runtime.**

**Zachowania:** `jobOrigin(orgContext)` → `{ organizationId: "org-a", actorUserId: "u1", serviceMode: false }`; an
event origin keeps the event's organization; a payload `{ invoiceId: "i1", organizationId: "org-b" }` reaches the
handler as `{ invoiceId: "i1" }` with `ctx.organizationId === "org-a"`; an organization job with `systemOrigin` throws;
job id for `("x.y", "org-a", "k1")` is a fixed literal, contains no `:`, differs from the id for `"org-b"`; without a
runtime `enqueueJob` throws `JobsUnavailableError`; envelope `v: 2` fails unrecoverably.

**Mutacje do zabicia:** organization taken from the payload; strip mode replaced by passthrough; organization omitted
from the job id hash; scope check inverted.

**Task 3. `gato.config.ts` schedules and generator output.**

**Zachowania:** unknown schedule id → `GatoConfigError` line `- modules.audit-logs.schedules.audit-logs.nope: unknown
schedule`; `null` disables; `settings` failing the schema → registry error naming the path; generated registry lines
pinned; `EXTENSION_POINTS.md` lists the new sections; a project without `jobs` gets `jobRuntimes: never[] = []`.

Timezones (7.7): no `jobs.timezone` → schedules resolve to `"UTC"`; `jobs: { timezone: "Europe/Warsaw" }` → a
schedule without its own timezone resolves to `"Europe/Warsaw"`; schedule `timezone: "America/New_York"` wins over the
default; a config override `timezone: "Asia/Tokyo"` wins over both; `jobs.timezone: "CET+1"` or `"Mars/Base"` →
`GatoConfigError` with `- jobs.timezone: not an IANA time zone: Mars/Base`; the `upsertJobScheduler` call always carries
a non-empty `tz`.

**Mutacje do zabicia:** override merged instead of replacing `cron`; `null` treated as "keep"; disabled module's
schedules kept; resolution order of the timezone swapped; `tz` omitted when it equals `"UTC"`; IANA check replaced by a
non-empty string check.

### Phase 2: the `jobs` module runtime

**Task 4. Producer (BullMQ `JobRuntime.enqueue`), connections and env.**

**Zachowania:** producer connection has a finite `maxRetriesPerRequest` and `enableOfflineQueue: false`; consumer
connections have `maxRetriesPerRequest: null`; no connection is opened by importing the module; `REDIS_URL` missing
with the module enabled stops startup with the variable named; `JOBS_PREFIX` with `:` rejected; default options per
section 7.1 literals.

**Mutacje do zabicia:** producer gets `null` retries; lazy connection made eager; default attempts changed.

**Task 5. Consumer, failure mapping, eviction check, shutdown.**

**Zachowania:** `JobFailure(retryable: false)` → `UnrecoverableError` with the same message; unknown job name →
unrecoverable; eviction policy `allkeys-lru` → refuses to start with the policy in the message; `CONFIG GET` forbidden →
warning and start; `SIGTERM` twice → one shutdown; order: drain flag, close workers, close queues, disconnect Prisma,
flush telemetry, exit; timeout aborts `ctx.signal`.

**Mutacje do zabicia:** `retryable === false` check inverted; eviction comparison against `"noeviction"` negated; second
signal starts a second shutdown; telemetry flushed before workers close.

**Task 6. Schedule reconciliation.**

**Zachowania:** `planScheduleChanges(existing ["audit-logs.prune-daily", "old.gone"], effective ["audit-logs.prune-daily"])`
→ upsert one, remove `"old.gone"`; a scheduler under another `JOBS_PREFIX` is never listed or removed; disabled in
config → removed; two boots → one scheduler (integration).

**Mutacje do zabicia:** removal set computed as effective minus existing; prefix filter dropped; upsert skipped when the
cron changed.

**Task 7. Worker role wiring, Compose, CI steps, integration suite (14.2).**

**Zachowania:** the integration list of 14.2, including the two-organization isolation test and the stalled-once test.

**Mutacje do zabicia:** `maxStalledCount` raised; global concurrency not applied before `run()`; role `web` starts
consumers.

### Phase 3: first consumers

**Task 8. Audit-log retention (`audit-logs` module, version bump).**

**Zachowania:** clock `2026-11-28T10:00:00Z`, `olderThanDays: 365` → cutoff `2025-11-28T00:00:00Z`; a row at
`2025-11-27T23:59:59Z` deleted, `2025-11-28T00:00:00Z` kept; 12 001 old rows → three batches, all deleted; org B's old
rows untouched by org A's job (integration); dispatch enqueues one job per organization with `jobKey` = the slot date;
schedule disabled by default.

**Mutacje do zabicia:** `lt` → `lte`; organization filter removed from `findMany` or `deleteMany`; batch loop exits after
the first batch; `enabledByDefault` flipped.

**Task 9. `ObjectStorage.list` and orphan cleanup (`uploads` module, version bump).**

**Zachowania:** object 25 h old without a row → deleted; 23 h old → kept; object with a row → kept; key outside
`orgs/<org>/` never considered; prefix `orgs/not-a-uuid/` ignored; deleted organization's prefix purged when
`purgeDeletedOrganizations`; 10 001 deletions planned → nothing deleted, unrecoverable failure; local `list` cannot
escape `STORAGE_LOCAL_PATH` (`../`).

**Mutacje do zabicia:** grace comparison inverted; circuit breaker `>` → `>=` at the wrong side; existence check of the
organization removed; `path-inside` check skipped in `list`.

### Phase 4: operations and docs

**Task 10. Admin page and commands** (`/admin/jobs`, `jobs.retry`, `jobs.run-now`).

**Zachowania:** `member`, `owner` without global admin → 404 via `requireModuleAccess`; admin sees counts and failed jobs
without payloads; `failedReason` of 2 000 characters shown as 500; `jobs.retry` on a completed job → failure result;
`jobs.run-now` of a disabled schedule → failure result.

**Mutacje do zabicia:** `adminOnly` dropped; payload included in the query result; truncation removed.

**Task 11. Helm worker deployment, egress-check `jobs` leg, `assemble` matrix, Railway runbook.**

**Zachowania:** `helm template` with `worker.enabled=false` renders no worker; `true` renders a Deployment with
`JOBS_ROLE=worker`, the app's image tag, `terminationGracePeriodSeconds: 35`, no Service; the egress check with `jobs`
reports a clean run and fails when the worker resolves an outside name (canary-style negative).

**Mutacje do zabicia:** n/a (templates and I/O), proved by `helm` tests and the sealed run.

**Task 12. Docs, ADR, skill.** Section 18.

### Phase 5: later (not planned)

Queued subscribers and `jobs.failed` (Q10), bull-board opt-in (Q4), outbox (Q6), option B entrypoint if the worker's
memory matters, organization-configurable retention.

## 17. Decisions and open questions

### 17.1 Decisions (Patryk, 2026-11-28)

1. **Redis, not Valkey.** The stack uses the `redis` image as in the owner's projects (`redis:7-alpine`, pinned by
   digest in `docker/jobs.compose.yml` and `docker/jobs.selfhost.compose.yml`).
2. **Redis is final.** No BullMQ-on-PostgreSQL backend; the `JobRuntime` port does not plan for one.
3. **Schedules do not depend on the server timezone.** An app-wide default `jobs.timezone` in `src/gato.config.ts`
   (IANA name, validated with Zod, default `"UTC"`), a per-schedule `timezone` in `defineSchedules` (overridable per
   schedule in `gato.config.ts`), always passed to BullMQ as `repeat.tz`. Containers run in UTC and their `TZ` is
   ignored. Design in section 7.7; `JOBS_TIMEZONE` is dropped from the env schema.

### 17.2 Open questions for the owner

1. **Worker shape.** Option C (same image, `JOBS_ROLE`) as recommended, or B (separate bundled entrypoint, like
   justnails/company-budget)?
2. **Audit retention default.** Ship `audit-logs.prune-daily` disabled (recommended) or enabled with 365 days?
3. **Deleted organizations' storage.** Purge `orgs/<id>/` of deleted organizations by default (recommended: yes, with
   the circuit breaker), or only report it?
4. **Admin UI.** Small in-app page (recommended) only, or also bull-board behind Basic Auth on the worker, off by
   default?
5. **Helm Redis.** External only (recommended), or an in-cluster Redis in the chart like Ragen's?
6. **Outbox.** Accept "enqueue after commit + row-first pattern" for v1 (recommended), or build a `job_outbox` table now?
7. **Audit rows from jobs.** Should retention write an `audit-log.pruned` row per organization per run (justnails
   logs one), and should `jobs.retry`/`run-now` write one? A new `AuditChannel` value `SYSTEM` for job-written rows?
8. **Strict organization scope in jobs.** Add the expected-organization check to the tenant-scope guard (9.1)? It is a
   critical core change with real protection; recommended, but it can be a follow-up.
9. **Redis password in the self-hosted stack.** `REDIS_PASSWORD` required (recommended) even on an internal network?
10. **Queued subscribers and `jobs.failed`.** In v1, or later as listed?
11. **Development loop.** Accept "restart `npm run dev` after changing a job handler" (option C), or also ship a
    `tsx watch` worker for development only?
12. **Per-organization timezone (future work).** Store a timezone on `Organization` for organization-facing schedules
    and date display (7.7)? And should the app shell expose a timezone setting (organization settings, the user's
    account page, or both), or stay with the app-wide `jobs.timezone` until a project asks?

## 18. Docs, ADR and skill

- **ADR-70** "Background jobs run on BullMQ in a worker role of the same image" (decision of section 6, the seam/module
  split of section 4, envelope and origin rules of 7.6 and 9).
- ADR-66 amended: Redis is a configured endpoint.
- `docs/18-jobs-module.md` (what it is, deployment per platform, Redis requirements: `noeviction`, AOF, connection
  sizing, operations: draining, a stuck job, a schedule that does not fire) and `docs/18b-jobs-module-usage.md`
  (declaring jobs and schedules, enqueueing from commands and subscribers, idempotency rules, payload migration,
  testing with the memory runtime). English, like `docs/17-encryption-module.md`.
- Updates: `docs/self-hosting.md` (Redis, worker service, Railway), `docs/10-wdrozenie.md`, `docs/12-moduly-kitu.md`,
  `docs/08-testy.md` (Redis integration), `docs/09-nowy-modul.md` (a section "Background work"), `AGENTS.md` Task
  Router row ("Background job or schedule → `src/shared/lib/jobs/`, `jobs.ts`, `docs/18b`"), skill `gato-extend`
  (jobs and schedules as extension points), `EXTENSION_POINTS.md` (generated).
- A lesson per spike finding (Task 0), whatever it turns up.

## 19. Extension points

`src/features/jobs/extension-points.json`:

```json
{
  "stability": "experimental",
  "description": "Background jobs and schedules on BullMQ with a worker role and an admin page",
  "commands": {
    "jobs.retry": { "stability": "experimental", "description": "Retry one failed job" },
    "jobs.run-now": { "stability": "experimental", "description": "Run a schedule's job once now" }
  }
}
```

And in the consumers:

- `audit-logs`: `jobs` → `audit-logs.prune`, `audit-logs.prune-dispatch`; `schedules` → `audit-logs.prune-daily`
  ("Prune audit log entries older than the configured days; off by default").
- `uploads`: `jobs` → `uploads.orphans`, `uploads.orphans-dispatch`; `schedules` → `uploads.orphans-daily` ("Delete
  storage objects without an upload row after a grace period").

Everything starts `experimental` for one release, then becomes `stable` once a project depends on it (ADR-63: a stable
key changes only with a `kitFormat` bump).
