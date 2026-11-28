# GatoJS background jobs: implementation plan

**Goal:** a GatoJS module declares jobs and schedules in a `jobs.ts` registry file, enqueues them through a
transactional outbox in its own database transaction, and a separate Next-free worker image runs them on BullMQ and
Redis with retries, strict organization scope and organization time; audit-log retention and orphaned-upload cleanup
ship as the first consumers.

**Spec:** [docs/superpowers/specs/2026-11-28-jobs-module.md](../specs/2026-11-28-jobs-module.md) (#135), every
question answered by the owner (§17.1, decisions 1–24). Section numbers below (§6.3, §8.4, …) point into it. The spike
of Task 0 changes a few details of §6 (section "Spike results"); where this plan and the spec disagree on those, this
plan wins and Task 19 amends the spec text.

**Execution:** Orca workers, one task per worker, each on its own branch from `main`, one PR per task. Task 0 (this
branch, `feat/jobs-plan-and-spike`) delivers the plan, the spike results and the spike lessons; no product code.

```text
T1  seam: defineJobs, defineSchedules, registry check     ← nothing
T4  organization job scope (tenant-scope)                  ← nothing
T7a core event organizations.deleted                       ← nothing
T2  envelope, enqueue port, memory runtime                 ← T1
T3  server registry split + generator (kitFormat)          ← T1
T5  timezone + schedules in gato.config.ts                 ← T1, T3
T6  jobs module skeleton + outbox                          ← T2, T3
T7  consumer, failures, jobs.failed, shutdown              ← T4, T6
T10 organization timezone                                  ← T5
T7b purge a deleted organization's jobs                    ← T6, T7, T7a
T8  schedule reconciliation                                ← T5, T7
T11 dates in organization time                             ← T10
T13 queued subscribers                                     ← T2, T6, T7a
T9  worker entry, bundle, image, Compose, integration      ← T7, T8
T12 organization schedules                                 ← T8, T10
T14 SYSTEM channel + audit retention                       ← T7, T8, T9
T15 storage list + orphan cleanup                          ← T7, T8
T16 admin page + audited commands                          ← T9
T17 worker dashboard                                       ← T9
T18 Helm, publishing, egress leg, assemble, doctor         ← T15, T16, T17
T19 docs, ADRs, skill                                      ← all
```

Waves (at most three workers at once, never two on the same hot file, see "Lane coordination"):

| Wave | Tasks | Why together |
| --- | --- | --- |
| 1 | T1, T4, T7a | new `src/shared/lib/jobs/`, `tenant-scope/`, `events/` + `auth/events-plugin.ts`: disjoint files |
| 2 | T2, T3 | T2 stays in `src/shared/lib/jobs/`; T3 owns the generator and the registry files |
| 3 | T5, T6 | T5 owns `gato-config.ts` and `timezone/`; T6 only adds module files and the manifest |
| 4 | T7, T10 | `src/features/jobs/runtime/` vs `organizations` + `org-context.ts` |
| 5 | T8, T13, T7b, T11 | jobs runtime vs `events/` vs jobs subscribers vs display pages; T7b waits for T7 and T7a |
| 6 | T9, T12 | worker build vs organization schedules (T12 starts after T8 merged) |
| 7 | T14, T15, T16, T17 | audit-logs vs uploads vs admin page vs worker HTTP |
| 8 | T18, then T19 | operations, then docs |

## Lane coordination with the MCP module

An MCP lane runs in parallel ([spec](../specs/2026-11-28-mcp-module.md), #136). It changes the same core seams in
three places. Rule: **a task marked "serialize with MCP" does not start while the MCP task it names is open, and the
second one to merge rebases and takes the next free numbers.** The coordinator holds the order.

| Hot file or contract | Jobs tasks | MCP tasks (spec §13) | What collides | Order |
| --- | --- | --- | --- | --- |
| Generator `packages/gato-cli/src/generate/**`, `.wa/bin/wa.mjs`, `gato-cli` version, `create-gato-app` pin, `kitFormat` | T3, T18 (`doctor`) | 0.2 (`authPlugins` arrays), 0.4 (`mcp-tools.ts`, `moduleMcpTools`) | registry emitter, kitFormat value, bundle | **Serialize.** T3 first if possible: MCP 0.4 emits `moduleMcpTools` "in the server registry only", which T3 creates. If MCP 0.4 lands first, T3 moves `moduleMcpTools` into the server registry instead of creating the line. |
| `src/shared/lib/auth/org-context.ts` (`getOrgContext`, `OrgContext`) | T10 (`OrgContext.timezone`) | 0.1 (request principal) | both change the returned context | **Serialize.** The second adds its field to the other's branch: the principal branch must also return `timezone`. |
| `src/shared/lib/auth/helpers.ts`, `require-module-access.ts`, `auth/index.ts`, `permissions.ts` | T3 (registry import lines), T9 (worker stubs cover them) | 0.1 (`getAdminUserOrNull`, `ModuleAccessDeniedError`), 0.2 (plugin spread) | import lines; T9's stub list must cover any new `next/*` import MCP adds there | T3 serialize with 0.1/0.2 (small textual); T9 re-runs the metafile check after any MCP merge. |
| `src/shared/lib/audit.ts` (`AuditChannel`, `auditActor`, `AuditEvent`) and `prisma/schema/audit-logs.prisma` enum + migrations (`audit-logs` module) | T3 (import line), T14 (`SYSTEM`, job default channel) | 0.1 (`MCP` channel in `auditActor`), 0.6 (`correlationId`, `correlation_id` column) | same enum, same function, two migrations in one module | **Serialize T14 with MCP 0.1 and 0.6.** Channel precedence (fixed here for both lanes): explicit `event.channel` → MCP principal (`MCP`) → job scope (`SYSTEM`) → `WEB`. Migrations are generated after rebasing, never hand-merged. |
| `src/shared/lib/modules/gato-config.ts`, `src/gato.config.ts` | T5 (`timezone`, `modules.<m>.schedules`) | 0.5 (`mcp.instructions`), 0.5b (`mcp.tools`) | `GatoConfig` type, `gatoConfigProblems` | **Serialize T5 with 0.5 and 0.5b.** |
| Audit-log page (`src/features/audit-logs/components/`, page) | T11 (`formatDateTime`), T14 (label "System") | 0.6 (correlation id, `mcp.tool_called` filter) | same table component | Serialize T11 and T14 with 0.6. |
| `deploy/helm/gatojs/values.yaml`, templates | T18 (`worker.*`) | Q15 replica count read by the `mcp` boot warning | `values.yaml` keys | Serialize T18 with the MCP task that edits the chart. |
| Numbers | ADR-72..75, `docs/19`, `docs/19b`, `kitFormat` 12, `core` minor | ADR-72, `docs/20`, `docs/20b`, `kitFormat` | MCP spec also names ADR-72 | Always the next free number at merge time. |
| `mutation-gate.json` `critical`, `AGENTS.md` Task Router, `kit/modules/core.json` `version` | many | many | one-line textual conflicts | Rebase, take the next free version; `AGENTS.md` stays inside `agent-instructions-fit-the-budget`. |

Tasks with no MCP collision: T1, T2, T4, T6, T7, T7a (it edits `events-plugin.ts`, which no MCP task names; re-check
before starting), T7b, T8, T12, T13, T15, T16, T17.

## Global constraints

- Rules in `CLAUDE.md`, `AGENTS.md` and `kit/CLAUDE.md` apply: no code comments except `// WHY:` (at most 3 lines) and
  tool directives; no `any`, nested ternaries or silent `catch {}`; Zod at every external input; error class `name` as
  a string; Prisma only in commands, queries and services; organization data through `getOrgContext()` with an
  `organizationId` filter, commands through `runCommand` with the service-mode confirmation.
- Every task runs the `gato-task` skill: "Zachowania" and "Mutacje do zabicia" below are step 1; `test-writer` writes the
  tests first and shows a red run for the right reason plus `npx tsc --noEmit -p tsconfig.json` (lesson
  `vitest-runs-what-tsc-rejects`); `.gato/phase` holds `implement` in the worker's worktree during implementation;
  `test-reviewer` runs `npm run test:mutation:task -- <files>` (`--prefix packages/gato-cli` for CLI files) and
  `npm run test:mutation:gate`. Expected values are literals or come from the spec. On a loaded machine use a
  task-scoped Vitest config for Stryker (lesson `scope-stryker-dry-runs-for-cli-tasks-under-load`).
- New content is English. Existing Polish docs are edited in their language until the English migration. UI strings go
  through i18n in both locales. Existing user-facing messages stay byte for byte.
- Naming: new names say GatoJS or `gato`; existing spellings (`wa:*` regions, `npm run wa --`, `.wa/kit.json`) stay.
- **Versions.** A Gato file change bumps its owner in `kit/modules/<module>.json` (minor for new behaviour, patch for a
  fix), then `npm run wa -- kit sync && npm run wa -- generate`, committed, `git diff --exit-code`. A core change the
  `jobs` module needs is its own commit with a `kit/modules/core.json` bump (`kit/CLAUDE.md`, "Moduły i manifest").
  A `packages/gato-cli/src` change bumps `gato-cli` (minor for a new format or command), rebuilds `.wa/bin/wa.mjs`
  after lint-staged (lesson `build-the-cli-bundle-after-lint-staged-formats-the-source`) and moves the exact pin in
  `packages/create-gato-app/package.json` with a patch bump. Numbers below are the expected ones on `main` at
  `8ee37c7` (kit 0.43.0, `kitFormat` 11, `core` 0.38.0, `audit-logs` 0.3.1, `uploads` 0.7.1, `gato-cli` 0.16.0,
  `create-gato-app` 0.3.15); take the next free ones at merge time.
- **`kitFormat`.** Only T3 changes a contract the CLI reads (server registry file, manifest `scripts` and `verify`,
  the `wa:workspaces` region in `docker/worker.Dockerfile`, catalog sections): one bump, expected 12, plus the value in
  `SUPPORTED_KIT_FORMATS`. No other task bumps it; if one finds it must, it stops and asks.
- **New files need an owner** (lesson `a-new-file-needs-an-owner-only-the-cli-gate-checks`): every new Gato file is under
  an owned glob of its module, or the manifest grows in the same commit.
- **Lessons.** Before starting, read the spike lessons (listed under "Spike results") and the `testing`, `process` and
  `architecture` sections of `docs/lessons.md`. A new gotcha goes to `docs/lessons/` with its line.
- **Local services.** Each worker uses its own Compose project name, its own ports and its own `_test` databases and
  Redis key prefix (lesson `parallel-worktrees-need-their-own-ports-and-dirs`); integration Redis uses a prefix ending in
  `_test` (§14.2). e2e resets `wa_app_e2e`: ask the coordinator for Patryk's consent text before each run (lesson
  `prisma-refuses-a-database-reset-from-an-agent`).
- **Gates before handing in:** `npm run verify`; `npm run verify --prefix packages/gato-cli` for CLI changes;
  `npm run test:integration` for data code (every new query or command has a two-organization isolation test);
  `npm run test:e2e` when pages or auth change; the `wa-code-review` skill. A task that changes what a created project
  contains says how it checked it (`node .wa/bin/wa.mjs create /tmp/x --kit . --yes --no-install --no-git`).
- Conventional Commits, lowercase subjects, body lines ≤ 100 characters, footer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, PR or publish; the coordinator does that.
- Report: branch, commits, gate results with numbers, surviving mutants with classification, proposed
  `mutation-gate.json` entries (a human adds them), docs.gatojs.com pages to update, anything unverified, gotchas.

## Spike results (Task 0, 2026-11-28)

**Verdict: go.** The separate worker image without Next.js is viable. A worker bundled by esbuild from a hand-written
Next-free registry ran a BullMQ job end to end against Redis and Postgres, wrote through `@/shared/lib/prisma`
(Prisma 7.10.1, `@prisma/adapter-pg`, the tenant-scope extension), called `trackAudit` and `emitEvent` (the
`audit-logs` subscriber wrote its row from the worker), imported `runCommand`, and shut down gracefully. Five details
of §6 change; none touches a decision of §17.1 except the tool behind decision 11 (its intent, automatic reload,
stays).

What ran (spike code was deleted before committing; only this section and the lessons stay):

- Redis 8.8 with `noeviction` and AOF (Homebrew, own port: Docker Hub pulls hung on the machine that day, so the
  official `redis:7-alpine` image was not used), Postgres 16 in its own container, schema from `prisma db push`.
- BullMQ 6.7.10 and ioredis 6.1.0; one queue, one `Worker` with `autorun: false`, `maxStalledCount: 1`, prefix
  `spike_test`.
- `esbuild` 0.28.2 (the copy `tsx` brings; not a direct dependency today): entry → `worker.mjs`, ESM, `node22`, a
  resolve plugin that redirects `@/modules.generated` and `@/modules.client.generated` to the hand-written registry,
  maps `@/*` to `src/`, bundles `@gatojs/*`, replaces `server-only`, `next/cache`, `next/headers`, `next/navigation`,
  `next-intl/server` and `@/i18n/routing` with stubs, then walks the metafile.

Results:

| Check (spec Task 0) | Result |
| --- | --- |
| Job completes | Yes: `trackAudit` row and the `member.removed` row from the event subscriber, both written from the worker. Rows carry `channel: "WEB"` (T14 must default `SYSTEM` inside jobs). |
| Metafile free of `next`, `react`, `react-dom`, `next-intl` | Clean only after three changes: the wider registry split, `next-intl` stubs, and allowing React reached from `src/app/emails/` (findings 1–3). |
| `server-only` and `next/cache` resolve to stubs | Yes. `revalidatePath("/")` returned `undefined`; `headers()` threw `next/headers is not available in the worker`. |
| Prisma's runtime files load from the image | Yes, and simpler than feared: Prisma 7's generated client plus `@prisma/client/runtime` bundle into the worker file, PostgreSQL query compiler wasm inlined; no files to copy, no native engine. Ran on `node:22-alpine` linux/arm64 (musl). |
| `--check` | Exit 0 with a valid env; in the container with `NODE_ENV=production` the core env rules fired exactly as in the app (example secrets and a relative `STORAGE_LOCAL_PATH` refused). |
| Eviction check | With `maxmemory-policy allkeys-lru` the worker refused to start (exit 1). |
| `docker stop` waits for a 20 s job and exits 0 | Yes with `docker stop -t 30`: `SIGTERM` → `worker.close()` waited, closed after 13.0 s, exit 0. With the default 10 s: `SIGKILL`, exit 137, the job left in `active` with its lock (finding 7). |
| `tsx watch` with `dev-hooks.mjs` runs the same entry | **No** (finding 4). Replaced by esbuild watch + `node --watch`, verified: ~100 ms rebuild, restart on a changed bundle. |
| Idle RSS, image size | RSS 141 MiB in `node:22-alpine` after one job (≈ 196 MiB on macOS). Worker file: 209 kB with npm packages external, 17.2 MB fully bundled. Image estimate: `node:22-alpine` 164 MB + 17 MB bundle ≈ 181 MB, versus ≈ 283 MB with a minimal external `node_modules` (111 MB) and far more with the root `npm ci --omit=dev` (`next` alone is 206 MB). |
| Built in `docker/worker.Dockerfile` on amd64 and arm64 | **Not verified.** `docker build` (BuildKit 0.11.7 and the legacy builder) hung on the machine; the image was emulated with `docker run node:22-alpine` + the bundle + `npm install` of the externals, arm64 only. T9 proves the Dockerfile on both architectures through `docker-platforms.yml`. |

Findings, each with its lesson, and what they change in this plan:

1. **The registry split is wider than §6.3** (lesson `the-worker-reaches-the-registry-through-seven-core-files`):
   seven core files reach a registry on the worker's graph (`emit-event.ts`, `audit.ts`, `run-command.ts`, `env.ts`,
   `modules/setup.ts`, `auth/index.ts`, and `auth/permissions.ts` through the **client** registry). → T3 adds a
   plain-data module list shared by both registries and `permissions.ts`, puts `moduleSetups` and `authPlugins` in the
   server registry, and extends the Next-free rule to `setup.ts` and `auth.ts`.
2. **`runCommand` pulls the session layer, and esbuild bundles literal dynamic imports** (lesson
   `esbuild-bundles-a-literal-dynamic-import`). → T9 stubs `next-intl/server`, `next-intl/navigation` and
   `@/i18n/routing` as well; the check still rejects any other `next-intl` entry.
3. **React is legitimately on the graph through mail templates** (lesson `mail-templates-bring-react-into-the-worker`).
   → T9's check forbids components, `react-dom/client`, `"use client"` files and `.tsx` outside `src/app/emails/`, not
   React itself.
4. **`tsx` runs the app as CommonJS**; ESM hooks miss `require`, and the registry ↔ subscribers ↔ event-bus cycle hits
   a TDZ (lesson `tsx-runs-app-code-as-commonjs-so-the-dev-worker-is-a-bundle`). → `worker:dev` is `build.ts --dev`
   (esbuild watch + `node --watch`); no `dev-hooks.mjs`, no `tsx` for the worker; the integration suite runs the bundle,
   so "both formats in CI" (§6.4, §14.2) is dropped: there is one format.
5. **`@gatojs/*` export TypeScript source** (lesson
   `workspace-packages-export-typescript-so-the-worker-bundles-them`). → the plugin bundles them explicitly; never
   `packages: "external"`.
6. **A fully bundled worker needs no `node_modules`** (lesson `a-fully-bundled-worker-needs-no-node-modules`). → T9
   bundles npm packages and keeps only a `workerExternals` list (`pg-native`, `msgpackr-extract` and
   `@valkey/valkey-glide`, all optional and absent; `sharp` only if a job loads it) external; the Dockerfile has no
   `prod-deps` stage while that list needs no install.
7. **Docker's default 10 s stop kills an in-flight job** (lesson `docker-stop-kills-an-in-flight-job-after-ten-seconds`).
   Confirms §5.4/§5.5 (`stop_grace_period: 30s`, `terminationGracePeriodSeconds: 35`); T9 and T18 test it.
8. **BullMQ 6 makes `ioredis` a peer** and npm resolves 6.x (lesson `bullmq-6-makes-ioredis-a-peer-dependency`).
   `keepLastIfActive`, `upsertJobScheduler`, `setGlobalConcurrency` exist in 6.7.10. → T6 pins `bullmq` 6.7.x and
   `ioredis` 6.x exactly (the spec said 5.x) and `esbuild` as a direct dev dependency.
9. **`handleCommandError` swallows the stub's error** into the command's generic failure (lesson
   `handle-command-error-hides-the-worker-stub-error`). → T9 adds a core `WorkerUnavailableError` that the stubs throw
   and `handleCommandError` rethrows.

Spec amendments to record in T19 (proposed here, the owner may revise): §5.1 `scripts.worker:dev` and the
`devDependencies`/`dependencies` pins; §5.2 drop `dev-hooks.mjs`; §6.3 the wider split; §6.4 the stub list, the
forbidden list, bundled npm packages, one module format; §6.5 no `prod-deps` stage; §6.6 the dev command; §14.2 the
"both formats" sentence.

---

### Task 1: `defineJobs`, `defineSchedules`, registry check (core)

**Branch:** `feat/jobs-seam-registry` · **Depends on:** nothing · **Wave 1** · MCP: none

**Files:**
- `src/shared/lib/jobs/define-jobs.ts` (new): `defineJobs<const T extends JobMap>(jobs: T): T`,
  `defineSchedules<const T extends ScheduleMap>(schedules: T): T`; types `JobDefinition<Scope, Payload>`
  (`scope: "organization" | "system"`, `payload: z.ZodObject`, `run`, `attempts?`, `backoff?`, `concurrency?`,
  `globalConcurrency?`, `lockDurationMs?`, `timeoutMs?`, `retain?`), `ScheduleDefinition` (`job`, `cron`, `timezone?`,
  `enabledByDefault`, `settings?`, `defaultSettings?`), `ScheduleOverride` (`enabled?`, `cron?`, `timezone?`,
  `settings?`) and `JobContext` per scope (§8.1; `ctx.enqueue` typed, implemented in T2).
- `src/shared/lib/jobs/registry.ts` (new): `createJobRegistry({ jobs, schedules, overrides, requires })` →
  `JobRegistry` (`job(name)`, `schedules()`, `effectiveSchedules(enabledModules)`); throws one `JobRegistryError`
  (`name = "JobRegistryError"`) whose message lists every problem, one per line, `- <key>: <problem>`.
  `jobs`/`schedules` are `ModuleEntry<JobMap>[]`/`ModuleEntry<ScheduleMap>[]` (the `moduleEvents` shape); `overrides`
  is `Record<string, ScheduleOverride | null>` (T5 feeds it from `gato.config.ts`).
- `src/shared/lib/jobs/cron.ts` (new): `isFiveFieldCron(expr)` with its own field-range parser (minute 0–59, hour 0–23,
  day 1–31, month 1–12, weekday 0–7; `*`, lists, ranges, steps). No `bullmq` import in core; T8 adds a test that
  BullMQ's parser accepts every cron the registry accepts.
- `src/shared/lib/jobs/sensitive-keys.ts` (new): `/(password|secret|token|apikey|api_key|authorization|cookie|session)/i`.
- `src/shared/lib/jobs/index.ts` (new): public exports.
- Queued-subscriber rules of §7.2 move to T13, which introduces the `queued` shape; T1 does not touch `events/`.
- `kit/modules/core.json`: minor bump. `mutation-gate.json`: propose `src/shared/lib/jobs/` as critical.

**Zachowania:**
- `jobs` key `"notes.prune"` declared in module `audit-logs` → `- notes.prune: job key is not owned by module audit-logs`.
- key `"audit-logs.Prune"` → `- audit-logs.Prune: key must match ^[a-z0-9-]+\.[a-z0-9-]+$`; the same key in two modules
  → `- audit-logs.prune: declared twice`.
- payload `z.object({ organizationId: z.string() })`, `z.object({ cause: z.string() })`,
  `z.object({ serviceMode: z.boolean().optional() })` → each `- <job>: payload declares reserved key <key>`;
  `z.object({ apiToken: z.string() })` → `- <job>: payload key apiToken looks sensitive`; `z.object({}).passthrough()`,
  `.strict()`, `.catchall(z.string())` → `- <job>: payload must be a strip-mode z.object()`; `z.string()` → same line.
- `attempts: 0`, `concurrency: 1.5`, `globalConcurrency: -1` → `- <job>: attempts must be a positive integer` (and the
  same for the others); `lockDurationMs: 4999` → `- <job>: lockDurationMs must be at least 5000`; `5000` accepted.
- cron `"0 3 * * *"` accepted; `"0 0 3 * * *"` → `- audit-logs.prune-daily: cron must have five fields`;
  `"61 * * * *"` → `- audit-logs.prune-daily: cron is invalid: 61 * * * *`.
- timezone `"Europe/Warsaw"`, `"UTC"` and `"organization"` accepted; `"Mars/Base"` →
  `- <schedule>: timezone is neither an IANA name nor "organization"`.
- schedule of `"audit-logs.nope"` → `- <schedule>: unknown job audit-logs.nope`; schedule in `uploads` of an
  `audit-logs` job → `- <schedule>: job audit-logs.prune belongs to another module`.
- `timezone: "organization"` on a `system` job → `- <schedule>: an organization-time schedule needs an organization job`;
  a fixed-zone schedule of an `organization` job → `- <schedule>: a fixed-time schedule needs a system job`.
- `defaultSettings: { olderThanDays: 0 }` against `z.object({ olderThanDays: z.number().int().min(1) })` → a line naming
  the schedule and `defaultSettings`; an override `{ settings: { olderThanDays: 0 } }` → a line naming the override;
  an override for an unknown schedule id → `- <id>: unknown schedule`.
- two problems in one call → one `JobRegistryError` with both lines, sorted by key.
- `createJobRegistry` over empty lists → no error (T3 adds the test over the real `@/server-registry.generated`).

**Mutacje do zabicia:** module-prefix check removed; reserved-key check skipped for `.optional()` keys; five-field check
replaced by `>= 5`; scope/timezone-mode check inverted; sensitive regex made case-sensitive; first problem thrown alone
(lines dropped); `lockDurationMs` boundary `<` → `<=`.

**Gates:** `npm run verify`. **Versions:** `core` minor.

---

### Task 2: Envelope, origins, job ids, `enqueueJob` port, memory runtime (core)

**Branch:** `feat/jobs-seam-enqueue` · **Depends on:** T1 · **Wave 2** · MCP: none

**Files:**
- `src/shared/lib/jobs/origin.ts`: `jobOrigin(context: OrgContext | DomainEvent)` →
  `{ organizationId, actorUserId, serviceMode }`; `systemOrigin(reason: string, actorUserId?: string)` →
  `{ organizationId: null, actorUserId: actorUserId ?? null, serviceMode: false, reason }`.
- `src/shared/lib/jobs/envelope.ts`: `envelopeSchema` (strict, `v: z.literal(1)`, §7.6), `buildEnvelope(origin,
  payload, { trace, cause })`, `parseEnvelope(job, data)` → `{ envelope, payload }` or throws `JobPayloadMismatchError`
  (`"payload does not match <job> v1"`, no payload in the message).
- `src/shared/lib/jobs/job-id.ts`: `jobKeyHash(job, organizationId, key)` → `<job>-<40 hex chars of sha256>`.
- `src/shared/lib/jobs/enqueue.ts`: `enqueueJob(origin, name, payload, options?)` (`tx`, `jobKey`, `coalesceKey`,
  `delayMs`) parses the payload, checks scope against origin, rejects `coalesceKey` + `delayMs` (`JobOptionsError`),
  captures the active OTel span as `trace`, sets `cause` from the `jobs.failed` delivery flag, then calls
  `jobRuntimes[0].enqueue(...)`; no runtime → `JobsUnavailableError("jobs module is not installed or disabled")`.
  Returns `{ outboxId, duplicate }`.
- `src/shared/lib/jobs/runtime.ts`: the `JobRuntime` port (`enqueue(entry, { tx })`), `JobsUnavailableError`,
  `JobPayloadError`, `JobOptionsError`, `JobFailure(message, { retryable })`, `JobTimeoutError`, each with a string
  `name`.
- `src/shared/lib/jobs/testing.ts`: `createMemoryJobRuntime()` (records enqueues; `drain()` runs them through the real
  envelope parse, registry, context and organization scope of T4, retries per `attempts`),
  `createTestJobContext({ organizationId })`.
- The BullMQ `keepLastIfActive` version test moves to T6 (core has no `bullmq`).
- `kit/modules/core.json`: minor bump.

**Zachowania:**
- `jobOrigin({ organizationId: "org-a", userId: "u1", serviceMode: false, … })` →
  `{ organizationId: "org-a", actorUserId: "u1", serviceMode: false }`.
- `enqueueJob(jobOrigin(ctxA), "invoices.render-pdf", { invoiceId: "i1", organizationId: "org-b" })` with the memory
  runtime, `drain()` → the handler receives `{ invoiceId: "i1" }` and `ctx.organizationId === "org-a"`.
- an `organization` job with `systemOrigin("x")` → throws `JobPayloadError` naming the scope; a `system` job with an
  organization origin → throws.
- `jobKeyHash("x.y", "org-a", "k1")` → the literal `x.y-<hex>` computed once by hand and pinned in the test; no `:`;
  for `"org-b"` a different literal; `jobKeyHash("x.y", null, "1")` is not all digits.
- no runtime registered → `JobsUnavailableError` with the exact message; nothing written.
- envelope `{ v: 2, … }` → `JobPayloadMismatchError("payload does not match x.y v1")`.
- with an active span (in-memory exporter) the envelope `trace.traceparent` equals that span's traceparent and the payload
  has no `trace` key; without a span `trace: null`.
- `{ coalesceKey: "c", delayMs: 1000 }` → `JobOptionsError`; either alone accepted.
- payload failing its schema → `JobPayloadError`, runtime not called.
- memory runtime: a handler throwing twice with `attempts: 3` runs three times and completes; `JobFailure("x",
  { retryable: false })` runs once.

**Mutacje do zabicia:** organization taken from the payload; strip replaced by passthrough; organization left out of the
key hash; scope check inverted; trace written into the payload; coalesce/delay check removed; payload parsed after the
runtime call.

**Gates:** `npm run verify`. **Versions:** `core` minor.

---

### Task 3: Server registry split, generator, manifest `scripts` and `verify` (core + kit, `kitFormat`)

**Branch:** `feat/jobs-server-registry` · **Depends on:** T1 · **Wave 2** · **MCP: serialize with 0.2 and 0.4
(generator), and with 0.1 for the `auth/` import lines**

**Files:**
- `packages/gato-cli/src/generate/registry.ts`, `index.ts`, `targets.ts`, `extension-points.ts`:
  - new `src/modules.data.generated.ts`: `modules = applyGatoConfig([...], gatoConfig)` only (plain data, imports
    `module.ts` files and `gato.config.ts`); imported by both registries and `permissions.ts` (spike finding 1);
  - new `src/server-registry.generated.ts`: `modules` (re-export), `moduleEnvSchemas`, `auditSinks`, `moduleEvents`,
    `moduleSubscribers`, `moduleCommandHooks`, `moduleSetups`, `authPlugins`, `moduleJobs`, `moduleSchedules`,
    `jobRuntimes`, `env`;
  - `src/modules.generated.ts` re-exports the server registry and keeps slots, messages, `MessageLoader`;
  - `src/modules.client.generated.ts` imports `modules` from the data file;
  - detect `jobs.ts` (`moduleJobs`, `moduleSchedules`, every module, like `moduleEvents`) and `job-runtime.ts`
    (`jobRuntimes = enabledEntries([...], gatoConfig)`);
  - manifest `scripts` merged into `package.json` (owned like dependencies, removed with the module), manifest `verify`
    composed into a core script `verify:modules` in registry order (absent when no module declares one);
  - fill `# wa:workspaces:start/end` in `docker/worker.Dockerfile` when the file exists;
  - `JobName` and `ScheduleId` unions and "Jobs" and "Schedules" catalog sections from `extension-points.json` keys
    `jobs` and `schedules`.
- `packages/gato-cli/src/manifest/schema.ts`: `scripts: z.record(z.string(), z.string()).optional()`,
  `verify: z.string().optional()`.
- Core import switches: `src/shared/lib/events/emit-event.ts`, `src/shared/lib/audit.ts`,
  `src/shared/lib/commands/run-command.ts`, `src/env.ts`, `src/shared/lib/modules/setup.ts`,
  `src/shared/lib/auth/index.ts` → `@/server-registry.generated`; `src/shared/lib/auth/permissions.ts` →
  `@/modules.data.generated`. `src/shared/lib/events/define-events.ts` keeps its type-only import (or moves it).
- `package.json` (core): `verify` runs `npm run --if-present verify:modules` before `doctor --files`.
- Architecture test (new, `src/__tests__/worker-graph-stays-next-free.test.ts`): nothing reachable (static imports and
  literal `import()`) from `jobs.ts`, `subscribers.ts`, `events.ts`, `audit-sink.ts`, `command-hooks.ts`, `setup.ts`,
  `auth.ts`, `module.ts` or `src/server-registry.generated.ts` imports `next`, `next-intl` (other than through the
  allowed session files listed in the test), a `.tsx` outside `src/app/emails/`, `@/modules.generated` or
  `@/modules.client.generated`. The bundle check of T9 repeats it on the real graph.
- `kit/kit.json` `kitFormat` 12, `packages/gato-cli/src/kit/kit-format.ts` adds 12.
- Docs: `docs/02b-rejestr-i-generator.md` (three registry files, which to import where), `docs/16-cli-wa.md`
  (manifest `scripts`, `verify`).

**Zachowania:**
- `src/server-registry.generated.ts` for the GatoJS repo pinned line by line in a generator test; it contains no
  `slots`, `i18n`, `components` or `auth-client` import.
- `@/modules.generated` exports the same names as before plus nothing removed (a test compares the export list).
- `emit-event.ts`, `audit.ts`, `run-command.ts`, `env.ts`, `setup.ts`, `auth/index.ts` import
  `@/server-registry.generated`; `permissions.ts` imports `@/modules.data.generated` (architecture test on the
  import specifiers).
- a project module with `jobs.ts` → `moduleJobs` and `moduleSchedules` list it, also when the module is disabled in
  `gato.config.ts`.
- a manifest with `scripts: { "worker:build": "x" }` → `package.json` gets it; `wa remove` of the module removes it; a
  project script with the same name and a different value stops `generate` with
  `package.json script worker:build is owned by module jobs`.
- two modules with `verify` → `verify:modules` is `npm run a && npm run b` in registry order; none → no `verify:modules`
  key.
- `docker/worker.Dockerfile` with the region → filled exactly like the core `Dockerfile`'s region; without the file →
  nothing written.
- a fixture `subscribers.ts` importing a `.tsx` component → the architecture test fails naming that file.
- `createJobRegistry` over the real `moduleJobs`, `moduleSchedules` and `moduleSubscribers` → no error (a bad
  declaration in any module fails `npm test`).

**Mutacje do zabicia:** a React-importing list (slots, messages) emitted into the server registry; scripts of a removed
module kept; `verify:modules` missing a module or out of order; disabled module's jobs left out of `moduleJobs`;
`permissions.ts` left on the client registry; region filled when the Dockerfile is absent.

**Gates:** `npm run verify`, CLI gate, created-project check. **Versions:** `gato-cli` minor, `create-gato-app` pin +
patch, `core` minor, `kitFormat` 12 (next free).

---

### Task 4: Organization job scope in the tenant-scope guard (core, critical)

**Branch:** `feat/tenant-scope-organization-jobs` · **Depends on:** nothing · **Wave 1** · MCP: none

**Files:** `src/shared/lib/tenant-scope/` (`organization-scope.ts` new: `runInOrganizationScope(organizationId, fn)`,
`currentOrganizationScope()`, an `AsyncLocalStorage` on `globalThis` under `Symbol.for("gatojs.organization-scope")`,
like the bypass store; `tenant-scope-extension.ts` value checks; `tenant-scope.ts` `withoutTenantScope` refuses inside
a scope). `kit/modules/core.json` minor. Docs: `docs/03-dane-i-organizacje.md` (organization job scope).

**Zachowania** (inside `runInOrganizationScope("org-a")`, model `AuditLog` and a model with `organizationId`):
- `findMany({ where: { organizationId: "org-a" } })`, `{ organizationId: { equals: "org-a" } }`,
  `{ organizationId: { in: ["org-a"] } }` pass.
- `{ organizationId: "org-b" }`, `{ organizationId: { in: ["org-a", "org-b"] } }`, `{ organizationId: { not: "org-b" } }`,
  no filter, `create({ data: { organizationId: "org-b" } })`, `createMany({ data: [{ organizationId: "org-a" },
  { organizationId: "org-b" }] })`, `updateMany` and `deleteMany` with `org-b` → `TenantScopeError` with message
  `auditLog.findMany outside job organization` (operation named).
- `withoutTenantScope("x", fn)` inside the scope → throws `withoutTenantScope is not allowed in an organization job`.
- `Member` and `Invitation` keep their existing exemption outside a scope and are value-checked inside one.
- outside a scope every existing guard test passes unchanged.
- isolation (integration): two organizations; a handler querying B inside A's scope throws; A's query returns only A.

**Mutacje do zabicia:** value comparison removed (presence only); `in` accepted when it contains the scope id among
others; `createMany` checks only the first row; the bypass allowed inside the scope; `equals` unwrapped wrongly.

**Gates:** `npm run verify`, `npm run test:integration`. **Versions:** `core` minor.

---

### Task 5: `timezone` and `schedules` in `gato.config.ts`; timezone helpers (core)

**Branch:** `feat/gato-config-timezone-and-schedules` · **Depends on:** T1, T3 (`ScheduleId` union) · **Wave 3** ·
**MCP: serialize with 0.5 and 0.5b**

**Files:** `src/shared/lib/modules/gato-config.ts` (`GatoConfig.timezone?: string`, `GatoModuleConfig.schedules?:
Record<ScheduleId, ScheduleOverride | null>`, validation in `gatoConfigProblems`), the generator's
`ProjectGatoConfig` typing if it lives there (else T3 already typed it), `src/shared/lib/timezone/` (new:
`isIanaTimeZone`, `resolveTimezone(organizationZone, appZone)`, `formatDateTime(date, { timeZone, locale, style })`),
`src/shared/lib/jobs/registry.ts` (reads overrides from the config), `src/gato.config.ts` untouched (project file).
`kit/modules/core.json` minor. Docs: `docs/11-praca-z-kitem.md` config keys.

**Zachowania:**
- no `timezone` → effective `"UTC"`; `timezone: "Europe/Warsaw"` → a schedule without its own zone resolves to it; a
  schedule zone beats it; a config override beats both.
- `timezone: "CET+1"` → `GatoConfigError` containing the line `- timezone: not an IANA time zone: CET+1`.
- `modules["audit-logs"].schedules["audit-logs.nope"]` → `GatoConfigError` naming the id; `null` disables the schedule.
- `resolveTimezone(null, "Europe/Warsaw")` → `"Europe/Warsaw"`; `resolveTimezone("America/New_York", "Europe/Warsaw")`
  → `"America/New_York"`; `resolveTimezone(null, undefined)` → `"UTC"`.
- `formatDateTime(new Date("2026-03-29T01:30:00Z"), { timeZone: "Europe/Warsaw", locale: "pl" })` → the literal for
  03:30 on 29.03.2026 (DST day), pinned once from the spec's example.
- `isIanaTimeZone("UTC")` true, `"Europe/Warsaw"` true, `""` false, `"europe/warsaw"` per `Intl` (literal in test).

**Mutacje do zabicia:** resolution order swapped; `null` treated as keep; IANA check replaced by non-empty; `tz` omitted
for `"UTC"`; unknown schedule id accepted.

**Gates:** `npm run verify`. **Versions:** `core` minor.

---

### Task 6: `jobs` module skeleton and the outbox

**Branch:** `feat/jobs-module-outbox` · **Depends on:** T2, T3 · **Wave 3** · MCP: none

**Files:**
- `kit/modules/jobs.json` (new, §5.1, `version` 0.1.0, `experimental`): `files` with every path the module will own
  (including `src/app/[locale]/(app)/admin/jobs/**`, `docker/worker.Dockerfile`, `docker/jobs*.compose.yml`,
  `ci/jobs.integration-steps.yml`); `dependencies` `bullmq` 6.7.x and `ioredis` 6.x pinned exactly, `@bull-board/*`
  and `express` added in T17; `devDependencies` `esbuild` pinned exactly; `scripts` and `verify` added in T9; `env`
  (§5.3) with `REDIS_URL` through a new `redisUrl()` helper in `packages/env` (core commit, `core` bump).
- `prisma/schema/jobs.prisma` (`JobOutbox`, §8.4), relation line through `schemaRelations`, migration.
- `src/features/jobs/module.ts`, `env.ts`, `job-runtime.ts` (registers the outbox runtime), `i18n/{pl,en}.json`,
  `extension-points.json`.
- `src/features/jobs/outbox/insert.ts` (`insertOutboxRow(entry, { tx })` with `pg_notify('gato_job_outbox', '')` in
  the same transaction; system rows inside `withoutTenantScope("jobs: system job enqueue", …)`; duplicate `keyHash`
  → `{ outboxId, duplicate: true }`), `relay.ts` (claim SQL of §8.4, add, mark; depends on a `QueueAdder` port so unit
  tests need no Redis), `prune.ts`, `listen.ts` (dedicated `pg` client `LISTEN` + 5 s poll).
- `src/features/jobs/runtime/queue-names.ts`, `connection.ts` (relay producer options: finite
  `maxRetriesPerRequest`, `commandTimeout: 5000`, lazy connect; consumer: `maxRetriesPerRequest: null`; `error`
  events logged, throttled).
- `src/features/jobs/jobs.ts`: `jobs.outbox-prune` (system) and schedule `jobs.outbox-prune-daily` (`15 4 * * *`,
  enabled by default).
- Version test: the installed `bullmq` types and runtime accept `deduplication: { id, keepLastIfActive: true }`.
- `mutation-gate.json`: propose `src/features/jobs/outbox/` critical.

**Zachowania:**
- insert inside a `tx` that rolls back → no row and no notification received by a listening client; inside a committed
  `tx` → one row and one notification.
- duplicate `jobKey` in the same organization → `{ outboxId: <first id>, duplicate: true }`, one row; the same `jobKey`
  in another organization → a second row.
- relay over rows created at t1, t2, t3 → `queue.add` called in that order with `jobId = keyHash ?? id`.
- a row whose `envelope.organizationId` differs from its column → never added, `lastError`
  `"envelope organization does not match the row"`, `dispatchedAt` stays null.
- a row of a job not in this worker's registry → left pending, `dispatchAttempts` unchanged.
- `queue.add` throws → `dispatchAttempts` 1 and `lastError` set; the other rows of the batch dispatched.
- a row with `coalesceKey` → added with `deduplication: { id: <hash>, keepLastIfActive: true }` and no `ttl`.
- the row's `traceparent` reaches the envelope's `trace`.
- prune at `2026-11-28T04:15Z`: dispatched `2026-11-20T00:00Z` deleted, dispatched `2026-11-22T00:00Z` kept, pending
  from `2026-01-01` kept.
- integration: two relays claiming concurrently never add one row twice (`SKIP LOCKED`); isolation: an insert for A is
  not visible to a query in B's context.

**Mutacje do zabicia:** `keepLastIfActive` dropped; `dispatched_at IS NULL` dropped; `SKIP LOCKED` dropped (integration);
organization mismatch check removed; prune condition `<` → `>`; unknown-job rows dispatched; notify outside the
transaction.

**Gates:** `npm run verify`, `npm run test:integration`. **Versions:** new module `jobs` 0.1.0; `core` minor for
`redisUrl`.

---

### Task 7: Consumer, failure mapping, `jobs.failed`, eviction check, shutdown

**Branch:** `feat/jobs-consumer` · **Depends on:** T4, T6 · **Wave 4** · MCP: none

**Files:** `src/features/jobs/runtime/consumer.ts` (one `Worker` per job, `autorun: false`, `maxStalledCount: 1`,
envelope parse, organization-exists check, `runInOrganizationScope`, consumer span from `envelope.trace`, failure
mapping to `UnrecoverableError`, `ctx.signal` on `timeoutMs`), `failed-report.ts` (listener + boot and 5-minute
sweep, in-flight id set, signal then stamp), `redis-health.ts` (eviction check), `concurrency-plan.ts`
(`planWorkerConcurrency`), `src/features/jobs/worker/shutdown.ts` (ordering with injected closers),
`src/features/jobs/events.ts` (`jobs.failed`). `kit/modules/jobs.json` minor. Propose `src/features/jobs/runtime/`
critical.

**Zachowania:**
- `JobFailure("x", { retryable: false })` → BullMQ `UnrecoverableError`; a plain `Error` → retried; job name with no
  handler → `UnrecoverableError("no handler for x.y")`.
- last failed attempt of an organization job → exactly one `jobs.failed` `{ job, jobId, attempts: 3, reason }` with
  `reason` cut to 500 characters, then `failedReportedAt` stamped; the stamp is written after the emit returned, also
  when a subscriber throws.
- a stalled job past `maxStalledCount` (integration with short lock) → one `jobs.failed`.
- the boot sweep finds an unstamped failed organization job → one `jobs.failed`; a stamped one → none; a stamp failure
  leaves it for the next sweep; listener and sweep in one process report a job once.
- a system job, and a job whose envelope has `cause: "jobs.failed"` → no `jobs.failed`.
- organization deleted before the job runs → handler not called, job completed, no retry, no `jobs.failed`, one `info`
  log `organization gone, job skipped`.
- the handler runs in a span `job x.y` of kind `consumer` whose parent is the envelope's traceparent; no carrier → a
  root span; span attributes never contain the payload.
- eviction check: `["maxmemory-policy", "allkeys-lru"]` → refuses (`redis maxmemory-policy is allkeys-lru, expected
  noeviction`); `["maxmemory-policy", "noeviction"]` and the object form → ok; `CONFIG` forbidden → warning, starts.
- `planWorkerConcurrency({ budget: 5, jobs: { a: 5, b: 5, c: 1 } })` → `{ budget: 3, totalRequested: 11, clamped: true }`
  with every job ≥ 1 (budget = pool max − 2); within budget unchanged; budget below the queue count → flagged.
- shutdown: second `SIGTERM` ignored; order relay → workers (`close()`, then `close(true)` after the timeout, aborting
  `ctx.signal`) → producer queues and `LISTEN` → Prisma → HTTP → telemetry.

**Mutacje do zabicia:** `retryable === false` inverted; `jobs.failed` emitted on every attempt; stamp before emit; sweep
ignoring the stamp; cause guard removed; organization-exists check removed or turned into a retry; eviction comparison
negated; telemetry flushed first; concurrency floor of 1 removed.

**Gates:** `npm run verify`, `npm run test:integration` (Redis + Postgres). **Versions:** `jobs` minor.

---

### Task 7a: Core event `organizations.deleted`

**Branch:** `feat/organizations-deleted-event` · **Depends on:** nothing · **Wave 1** · MCP: none (re-check that no
MCP task opened `events-plugin.ts`)

**Files:** `src/shared/lib/events/core-events.ts` (`organizations.deleted` `{ name }`),
`src/shared/lib/auth/events-plugin.ts` and `organization-events.ts` (`before` hook on `/organization/delete` reads
the name through the adapter; `after` hook emits on success with origin `{ organizationId: <deleted id>,
actorUserId: <session user> }`), the core extension-point catalog entry and the better-auth path row, ADR-61
amendment (delete now emits). `kit/modules/core.json` minor.

**Zachowania:**
- a successful `/organization/delete` of `org-a` (`name: "Acme"`) by `u1` → exactly one `organizations.deleted`
  `{ name: "Acme" }` with `organizationId: "org-a"`, `actorUserId: "u1"`, `serviceMode: false`.
- a failed delete (not a member, unknown id) → nothing emitted.
- a subscriber that throws → the delete response is unchanged (200).
- `EXTENSION_POINTS.md` lists the event; the `/organization/delete` path row says it emits it.

**Mutacje do zabicia:** emit on a failed delete; name read after the delete (empty); actor taken from the body.

**Gates:** `npm run verify`, `npm run test:integration`. **Versions:** `core` minor.

---

### Task 7b: A deleted organization's queued jobs (`jobs` module)

**Branch:** `feat/jobs-purge-organization` · **Depends on:** T6, T7, T7a · **Wave 5** · MCP: none

**Files:** `src/features/jobs/subscribers.ts` (plain subscriber of `organizations.deleted`), `src/features/jobs/jobs.ts`
(`jobs.purge-organization`, system, payload `{ removedOrganizationId }`), `runtime/purge-organization.ts`.
`kit/modules/jobs.json` minor.

**Zachowania:**
- the subscriber writes one outbox row for `jobs.purge-organization` `{ removedOrganizationId: "org-a" }` with
  `organizationId: null`; after the organization's cascade the row still exists.
- the job removes `org-a`'s waiting, delayed and prioritized jobs in every queue under the prefix and leaves `org-b`'s
  and every active job.
- an enqueue error is logged and the delete still succeeds.

**Mutacje do zabicia:** organization filter removed (purges everything); active jobs removed; purge enqueued with the
event's organization origin (row cascades away); prefix ignored.

**Gates:** `npm run verify`, `npm run test:integration`. **Versions:** `jobs` minor.

---

### Task 8: Schedule reconciliation

**Branch:** `feat/jobs-schedules` · **Depends on:** T5, T7 · **Wave 5** · MCP: none

**Files:** `src/features/jobs/runtime/schedules.ts` (`planScheduleChanges(existing, effective)`, upsert with explicit
`tz`, removal under the prefix). Test: BullMQ's cron parser accepts every cron `isFiveFieldCron` accepts (fast-check
over generated five-field crons). `kit/modules/jobs.json` minor.

**Zachowania:**
- `planScheduleChanges(["audit-logs.prune-daily", "old.gone"], ["audit-logs.prune-daily"])` →
  `{ upsert: ["audit-logs.prune-daily"], remove: ["old.gone"] }`.
- schedulers of another prefix are never listed or removed.
- every upsert carries a non-empty `tz`; with no zone anywhere → `"UTC"`.
- only the timezone changed → upserted.
- integration: two boots → one scheduler; a schedule disabled by an override → removed at the next boot; a schedule with
  `timezone: "Europe/Warsaw"` and `0 3 * * *` gets its next run at 03:00 Warsaw time with the worker under
  `TZ=America/New_York`.

**Mutacje do zabicia:** removal set computed backwards; prefix filter dropped; upsert skipped when only the timezone
changed; `tz` omitted for `"UTC"`.

**Gates:** `npm run verify`, `npm run test:integration`. **Versions:** `jobs` minor.

---

### Task 9: Worker entrypoint, bundle, stubs, development loop, Dockerfile, Compose, CI, integration suite

**Branch:** `feat/jobs-worker` · **Depends on:** T7, T8 · **Wave 6** · MCP: none (re-run the bundle check after any
MCP merge into `auth/`)

Applies spike findings 2–7 and 9. **Files:**
- `src/features/jobs/worker/main.ts` (§6.2 order), `http.ts` (`/health` only here; dashboard in T17),
  `heartbeat.ts` (`<prefix>:workers:<host>-<pid>`, every 10 s, TTL 30 s), `purge.ts` (`jobs:purge`).
- `src/features/jobs/worker/build.ts`: esbuild, ESM, `node22`, bundles `@/*`, `@gatojs/*` and npm packages; external:
  Node built-ins and `WORKER_EXTERNALS` (`pg-native`, `msgpackr-extract`, `@valkey/valkey-glide`; add `sharp` only if a
  job imports it); output `.worker/worker.mjs`; `--dev` = `context().watch()` to `.worker/dev/worker.mjs` plus a child
  `node --watch` on it; then the metafile check of lesson `mail-templates-bring-react-into-the-worker` with the chain
  report naming the first `src/features/<module>/` file.
- `src/features/jobs/worker/stubs/`: `server-only` (empty), `next/cache` (no-op revalidation, `unstable_cache` returns
  its function), `next/headers`, `next/navigation`, `next-intl/server`, `next-intl/navigation`, `@/i18n/routing`
  (load, throw `WorkerUnavailableError("<name> is not available in the worker")` when called).
- Core commit: `src/shared/lib/jobs/worker-unavailable-error.ts`; `src/shared/utils/error-handling.ts`
  `handleCommandError` rethrows it.
- `kit/modules/jobs.json`: `scripts` `worker:dev` (`tsx src/features/jobs/worker/build.ts --dev`), `worker:build`,
  `worker:start` (`node .worker/worker.mjs`), `worker:check` (`node --env-file-if-exists=.env .worker/worker.mjs
  --check`), `jobs:purge`; `verify` `npm run worker:build && npm run worker:check`.
- `docker/worker.Dockerfile`: `deps` (`npm ci --ignore-scripts`, workspace region), `builder` (`prisma generate`,
  `npm run worker:build`), `runner` (`node:22-alpine`, non-root, `NODE_ENV=production`, `CHECKPOINT_DISABLE=1`, copies
  `.worker/` and `prisma/` only, `EXPOSE 3100`, `HEALTHCHECK` on `/health`, `CMD ["node", ".worker/worker.mjs"]`); a
  `prod-deps` stage only when `WORKER_EXTERNALS` needs an install.
- `docker/jobs.compose.yml`, `docker/jobs.selfhost.compose.yml` (§5.4, `stop_grace_period: 30s`),
  `ci/jobs.integration-steps.yml`; core: `e2e/global-setup.ts` and `src/test/integration/` reset call
  `npm run --if-present jobs:purge -- --yes`; `.github/workflows/docker-platforms.yml` builds the worker image on both
  architectures and runs `node .worker/worker.mjs --check`.
- `.gitignore`: `.worker/`. `kit/modules/jobs.json` minor; `core` minor for the core commits.

**Zachowania:**
- `node .worker/worker.mjs --check` exits 0 with a valid env; without `REDIS_URL` exits 1 and stderr names `REDIS_URL`.
- the metafile check fails on a fixture module whose `subscribers.ts` imports a `.tsx` component; the error names
  `src/features/<fixture>/subscribers.ts` and the chain to `react`; it passes for a fixture that imports
  `src/app/emails/*.tsx` through `mailer.ts`; it fails on an unstubbed `next-intl` entry and on `react-dom/client`.
- a stubbed `headers()` throws `next/headers is not available in the worker`; `revalidatePath("/")` returns
  `undefined`; `runCommand` of a session command inside a job rethrows `WorkerUnavailableError` (job fails with that
  message, not with the command's `failureMessage`).
- the 14.2 integration suite passes against the bundle (enqueue → complete, retries, `JobFailure`, envelope mismatch,
  coalescing three enqueues → one more run with the third payload, stalled redelivered once, `globalConcurrency: 1`
  across two workers, `SIGTERM` waits for an in-flight job).
- `docker stop` with a 20 s job under `stop_grace_period: 30s` → exit 0 and the job completed (spike: 13 s).
- self-hosted Compose refuses to start without `REDIS_PASSWORD` (`docker compose config` fails with the `?` message).
- with `JOBS_DB_POOL_MAX=5` and jobs requesting 5 + 5 + 1 the boot log shows
  `{ budget: 3, totalRequested: 11, clamped: true }` and every job keeps at least 1.
- heartbeat key written with a TTL between 1 and 30 s.
- `npm run jobs:purge -- --yes` empties every queue and scheduler under `JOBS_PREFIX` and no other prefix; with
  `NODE_ENV=production` and no `--force` it refuses (exit 1); `e2e/global-setup.ts` runs it after the reset.
- `docker-platforms.yml` builds the worker image on amd64 and arm64 and `--check` passes in both.

**Mutacje do zabicia:** a forbidden package missing from the metafile list; `src/app/emails/` exemption widened to every
`.tsx`; `next/cache` stub throwing; `--check` skipping env verification; plan floor of 1 removed; purge ignoring the
prefix; production guard inverted; `WorkerUnavailableError` swallowed by `handleCommandError`.

**Gates:** `npm run verify` (now runs `verify:modules`), `npm run test:integration`, image build on both architectures
in CI, created-project check with `jobs`. **Versions:** `jobs` minor, `core` minor.

---

### Task 10: Organization timezone (core)

**Branch:** `feat/organization-timezone` · **Depends on:** T5 · **Wave 4** · **MCP: serialize with 0.1
(`org-context.ts`)**

**Files:** `prisma/schema/organizations.prisma` (`timezone String?`) and migration; `src/shared/lib/auth/index.ts`
(`additionalFields.timezone` with `input: false`); `src/shared/lib/auth/org-context.ts` (`OrgContext.timezone`,
effective); `src/features/organizations/` (command `organizations.update-timezone` through `defineCommand`, permission
`organizations.manage-settings` default `owner`, `admin`; event `organizations.timezone-changed`; nav item
`organizations.settings`; slot `organizations.settings.sections`, experimental; i18n); page
`src/app/[locale]/(app)/organization/` with `PageHeader`, a cmdk select over `Intl.supportedValuesOf("timeZone")` with
the current UTC offset and "Use the app default (<zone>)"; `src/features/audit-logs/` subscriber writing
`organization.timezone_changed`. Versions: `core` minor, `audit-logs` minor.

**Zachowania:**
- a new organization has `timezone: null` and `context.timezone` equal to the app default.
- owner sets `"Europe/Warsaw"` → success, one `organizations.timezone-changed` `{ previous: null,
  timezone: "Europe/Warsaw" }` with the owner as actor, one `organization.timezone_changed` audit row.
- the same value again → success, no event.
- `member` → failure result, no change; superadmin in service mode without confirmation → "Potwierdź zmianę w trybie
  serwisowym"; with confirmation → success and `serviceMode: true` on the audit row.
- `"Mars/Base"` → invalid input result.
- better-auth `/organization/update` with `timezone` in the body leaves it unchanged.
- isolation (integration): changing A's zone changes nothing of B.
- e2e `core-auth`: owner changes the zone on `/organization`; a `member` sees no nav item.

**Mutacje do zabicia:** permission check removed; event emitted when unchanged; `input: false` dropped; organization
taken from the input; effective zone ignoring the app default.

**Gates:** `npm run verify`, `npm run test:integration`, `npm run test:e2e` (consent). **Versions:** `core` minor,
`audit-logs` minor.

---

### Task 11: Date display in organization time

**Branch:** `feat/dates-in-organization-time` · **Depends on:** T10 · **Wave 5** · **MCP: serialize with 0.6 (audit-log
page)**

**Files:** `TimezoneProvider` in the app layout (core), `formatDateTime` call sites in `audit-logs`, `api-keys`,
`users` (pages and components), API key expiry conversion at the organization's midnight.

**Zachowania:**
- the audit log, API keys and users pages render `2026-03-29T01:30:00Z` for an organization in `"Europe/Warsaw"` as the
  03:30 literal and for `"America/New_York"` as the 21:30 (previous day) literal.
- an API key expiry date chosen as `2026-12-01` in `"Europe/Warsaw"` → `expiresAt` `2026-12-01T23:00:00.000Z`.
- a client component reads the zone from `TimezoneProvider` (rendered with a provider value, not the browser zone).

**Mutacje do zabicia:** server time zone used; UTC hard-coded in one module; expiry at the start of the day.

**Gates:** `npm run verify`, `npm run test:e2e` (consent). **Versions:** `core` minor; `audit-logs`, `api-keys`,
`users` minor each.

---

### Task 12: Organization-facing schedules (tick, slots, claims)

**Branch:** `feat/jobs-organization-schedules` · **Depends on:** T8, T10 · **Wave 6** · MCP: none

**Files:** `prisma/schema/jobs.prisma` (`JobOrganizationSlot`, `@@unique([organizationId, scheduleId])`) and migration;
`src/features/jobs/runtime/organization-schedules.ts` (`latestDueSlot(cron, zone, lastSlotAt, now)`, the tick
`jobs.organization-schedules-tick` every minute in UTC, batches of 500, claim + enqueue with `tx`,
`jobKey = "<scheduleId>-<slot ISO>"`). The `invoices` fixture schedule `invoices.daily-summary` is added in T18.
`kit/modules/jobs.json` minor.

**Zachowania:**
- `latestDueSlot("0 8 * * 1-5", "Europe/Warsaw", …)` literals: Monday 2026-11-30 07:00Z due; Saturday none; the spring
  DST day (2026-03-29) with `"30 2 * * *"` → no slot; the autumn day (2026-10-25) with `"30 2 * * *"` → one slot.
- organizations in `"Europe/Warsaw"` and `"America/New_York"` get their 08:00 jobs at `07:00Z` and `13:00Z`.
- the tick run twice in the same minute enqueues once; a crash between claim and commit loses nothing (integration).
- after 3 h of downtime only the latest slot within 2 h runs; a schedule never run starts at the first slot after
  enabling.
- isolation: A's and B's slots are claimed independently.

**Mutacje do zabicia:** lookback bound removed; claim without compare-and-set; app default zone used instead of the
organization's; slot enqueued outside the claim transaction.

**Gates:** `npm run verify`, `npm run test:integration`. **Versions:** `jobs` minor.

---

### Task 13: Queued subscribers (core events + registry rules)

**Branch:** `feat/queued-subscribers` · **Depends on:** T2, T6, T7a · **Wave 5** · MCP: none

**Files:** `src/shared/lib/events/define-events.ts` (`queued: { job, payload }` shape), `event-bus.ts` (delivers a
queued subscriber through `enqueueJob(jobOrigin(event), …, { jobKey })`, failures logged, never rethrown; the
`jobs.failed` delivery flag), `src/shared/lib/jobs/registry.ts` (queued-subscriber rules moved from T1:
unknown job, `system` job, module without `requires: ["jobs"]`, subscriber of `organizations.deleted`), ADR-61
amendment. `kit/modules/core.json` minor.

**Zachowania:**
- a queued subscriber of `uploads.deleted` writes one outbox row with the event's organization, actor and service mode.
- the same event delivered twice → one row (default `jobKey` = hash of event name, subscriber id and payload); two
  events with different payloads → two rows.
- an insert failure is logged as a subscriber failure and the operation still succeeds.
- registry: queued subscriber of a `system` job → `- <subscriber>: a queued subscriber needs an organization job`;
  in a module without `requires: ["jobs"]` → `- <subscriber>: module <m> must require jobs`; of
  `organizations.deleted` → `- <subscriber>: organizations.deleted cannot have a queued subscriber`; unknown job →
  a line naming it.

**Mutacje do zabicia:** origin taken from the payload; default `jobKey` ignoring the payload; failure rethrown;
`organizations.deleted` rule removed.

**Gates:** `npm run verify`, `npm run test:integration`. **Versions:** `core` minor.

---

### Task 14: `AuditChannel` `SYSTEM` and audit-log retention

**Branch:** `feat/audit-log-retention` · **Depends on:** T7, T8, T9 · **Wave 7** · **MCP: serialize with 0.1 and 0.6
(`audit.ts`, the `AuditChannel` enum and migrations)**

**Files:** core `src/shared/lib/audit.ts` (`AuditChannel` gains `SYSTEM`; default channel from the job scope, with the
precedence of "Lane coordination") as its own commit with `core` minor; `prisma/schema/audit-logs.prisma` enum value
and migration, label "System"; `src/features/audit-logs/jobs.ts` (`audit-logs.prune-dispatch`, `audit-logs.prune`,
schedule `audit-logs.prune-daily` `0 3 * * *`, disabled by default), `services/jobs/` (`pruneAuditLogs`,
`dispatchAuditLogPruning`), `module.ts` audit action `audit-log.pruned`. Propose
`src/features/audit-logs/services/jobs/` critical.

**Zachowania:**
- clock `2026-11-28T10:00:00Z`, `olderThanDays: 365` → cutoff `2025-11-28T00:00:00Z`; a row at
  `2025-11-27T23:59:59Z` deleted, `2025-11-28T00:00:00Z` kept.
- 12 001 old rows → three batches; afterwards exactly one `audit-log.pruned` row with `channel: "SYSTEM"`,
  `userId: null`, `newData.deleted: 12001`.
- nothing to delete → no audit row.
- a retry uses the first attempt's cutoff (clock moved a day between attempts → same set).
- `trackAudit` inside a job without a channel → `SYSTEM`; with `channel: "API"` → `API`.
- the schedule is disabled by default; `gato.config.ts` `enabled: true` turns it on.
- isolation: A's job leaves B's rows; a handler mutated to drop the organization filter is stopped by T4's guard.

**Mutacje do zabicia:** `lt` → `lte`; organization filter removed; loop exits after one batch; audit row skipped; audit
row written when nothing was deleted (`> 0` → `>= 0`); channel left `WEB` inside jobs; `enabledByDefault` flipped.

**Gates:** `npm run verify`, `npm run test:integration`. **Versions:** `core` minor, `audit-logs` minor.

---

### Task 15: `ObjectStorage.list` and orphan cleanup

**Branch:** `feat/uploads-orphan-cleanup` · **Depends on:** T7, T8 · **Wave 7** · MCP: none (MCP 6.2 adds
`uploads/mcp-tools.ts`; only the module version collides)

**Files:** `src/features/uploads/` storage `list(prefix, cursor?)` (S3 `ListObjectsV2`, local walk confined by
`path-inside.ts`), `jobs.ts` (`uploads.orphans`, `uploads.orphans-dispatch`, schedule `uploads.orphans-daily`
`30 3 * * *`, enabled), `services/jobs/`. Propose `src/features/uploads/services/jobs/` critical.

**Zachowania:**
- object 25 h old without a row → deleted; 23 h → kept; with a row → kept.
- `orgs/not-an-id/` ignored; a deleted organization's prefix purged by default; `purgeDeletedOrganizations: false` →
  kept.
- 10 001 planned deletions → nothing deleted, unrecoverable failure, `error` log with the counts; 21 prefixes → same.
- empty `Organization` table → nothing purged.
- local `list("../")` cannot escape `STORAGE_LOCAL_PATH`.
- isolation: `uploads.orphans` for A never lists or deletes B's objects.

**Mutacje do zabicia:** grace comparison inverted; breaker `>` at the wrong boundary; existence check removed;
`path-inside` skipped; empty-table guard removed.

**Gates:** `npm run verify`, `npm run test:integration` (local and the S3 profile). **Versions:** `uploads` minor.

---

### Task 16: In-app admin page and audited commands

**Branch:** `feat/jobs-admin-page` · **Depends on:** T9 · **Wave 7** · MCP: none

**Files:** `src/app/[locale]/(app)/admin/jobs/`, `src/features/jobs/services/queries/`, `services/commands/`
(`jobs.retry`, `jobs.run-now`, `access: "global-admin"`), `components/` (polling every 5 s, 30 s hidden), audit
actions `job.retried`, `job.triggered`; core `next.config.ts` `serverExternalPackages: ["bullmq", "ioredis"]` (own
commit, `core` patch).

**Zachowania:**
- `member` and `owner` without global admin → 404; admin sees counts, schedules with zones, outbox stats and failed jobs
  without payloads; a 2 000-character `failedReason` shown as 500.
- no heartbeat for 60 s → "No worker is running" warning; a fresh heartbeat → no warning.
- `jobs.retry` of a failed job → success, one `job.retried` row with the admin as `userId`, channel `WEB`, in the admin's
  active organization, `failedReportedAt` cleared.
- `jobs.run-now` → one `job.triggered` row and the envelope's `actorUserId` is the admin.
- `jobs.run-now` of a disabled schedule → failure result and one row `{ outcome: "refused", code: "schedule-disabled" }`.
- `jobs.retry` of another organization's job that is not failed → refusal row in the admin's organization with no
  target details.
- a `member` calling the command → no row, one `warn` log with the user id.

**Mutacje do zabicia:** `adminOnly` dropped; payload included; truncation removed; refusal not audited; row filed in the
target's organization; actor missing from the run-now envelope; marker not cleared on retry; heartbeat TTL check
inverted.

**Gates:** `npm run verify`, `npm run test:integration`, `npm run test:e2e` with a worker (consent). **Versions:**
`jobs` minor, `core` patch.

---

### Task 17: Worker dashboard

**Branch:** `feat/jobs-worker-dashboard` · **Depends on:** T9 · **Wave 7** · MCP: none

**Files:** `src/features/jobs/worker/http.ts` (bull-board at `/admin/queues`, Basic Auth with constant-time compare
over SHA-256 digests, 10 failures per minute per address then 429, read-only by default; Express loaded only when
enabled), manifest dependencies `@bull-board/api`, `@bull-board/express`, `express` pinned exactly. Re-run the bundle
check (Express and bull-board bundle or join `WORKER_EXTERNALS`; bull-board serves its UI assets from its package
directory, so it is likely an external: decide by test). Propose `src/features/jobs/worker/http.ts` critical.

**Zachowania:** no credentials → `/admin/queues` 404, `/health` 200; one credential only → the worker refuses to start;
password of 15 characters → refuses; wrong password → 401 with `WWW-Authenticate`; eleventh failure in a minute → 429;
correct credentials → 200; a retry request in read-only mode → refused.

**Mutacje do zabicia:** user comparison skipped; read-only default flipped; lockout counter never incremented.

**Gates:** `npm run verify`, `npm run test:integration`. **Versions:** `jobs` minor.

---

### Task 18: Helm, Railway runbook, image publishing, egress `jobs` leg, `assemble` matrix, `doctor`

**Branch:** `feat/jobs-operations` · **Depends on:** T15, T16, T17 · **Wave 8** · **MCP: serialize with the generator
tasks (0.2, 0.4) for `doctor`, and with the MCP chart change**

**Files:** `deploy/helm/gatojs/` (`worker.*` values, `templates/worker-deployment.yaml`, dashboard Service only when
enabled, never an Ingress, `NOTES.txt`), helm-unittest tests; `.github/workflows/docker-publish.yml` (`<repo>-worker`
when `docker/worker.Dockerfile` exists); `kit/egress-check/` `jobs` leg and the workflow path filter; ADR-66
amendment; `.github/workflows/kit.yml` `assemble` combos `jobs`, `jobs+audit-logs+uploads`, `all`; the `invoices`
fixture gets a job, a queued subscriber and `invoices.daily-summary` (08:00 organization time);
`packages/gato-cli/src/doctor/` warnings ("declares schedules, but the jobs module is not installed", no heartbeat,
"cannot reach Redis"); `docs/self-hosting.md` Railway section.

**Zachowania:** `helm template` with `worker.enabled=false` → no worker objects; `true` → a Deployment with the worker
image, `terminationGracePeriodSeconds: 35`, probes on `/health`, no Service unless `worker.dashboard.enabled`, never an
Ingress; the egress `jobs` leg is clean and fails on a planted outside lookup; `docker-publish.yml` pushes the worker
image only when the Dockerfile exists; `wa doctor` with no heartbeat prints the "no worker" warning and with Redis
unreachable "cannot reach Redis".

**Mutacje do zabicia:** n/a for templates and I/O; proved by helm-unittest and the sealed run. `doctor` messages get
literal tests.

**Gates:** `npm run verify`, CLI gate, `helm unittest`, egress check both legs, `assemble` on the PR. **Versions:**
`core` minor (chart, workflows), `gato-cli` minor + `create-gato-app` pin/patch, `jobs` patch if module files change.

---

### Task 19: Docs, ADRs, skill

**Branch:** `docs/jobs-module` · **Depends on:** all · **Wave 8** · MCP: `AGENTS.md` Task Router and ADR numbers

**Files:** ADR-72..75 (next free numbers; the MCP spec also asks for ADR-72), amendments to ADR-60, ADR-61, ADR-66;
`docs/19-jobs-module.md`, `docs/19b-jobs-module-usage.md`; updates listed in spec §18; `AGENTS.md` Task Router rows
(jobs, with "subscribers, audit sinks, command hooks, `setup.ts` and `auth.ts` must not use Next or React: they also
run in the worker"; dates and timezone) inside the budget test; skill `gato-extend`; `EXTENSION_POINTS.md` regenerated;
the spec amendments of "Spike results". Each task also updates the in-repo docs it names; T19 closes the gaps and
lists the docs.gatojs.com pages for the coordinator.

**Gates:** `npm run verify`.

---

## Definition of done (all tasks)

- `npm run verify` green on the merged result, including `verify:modules` (worker build and `--check`) from T9 on.
- `npm run test:integration` green with Redis and Postgres for every data task; isolation tests for every new query and
  command.
- `npm run test:mutation:gate` green; proposed `critical` entries listed in the reports (a human adds them).
- A project created from the kit with `jobs` builds, runs `worker:dev`, and its worker image passes `--check` on both
  architectures.

## Open questions (not settled by the spec)

None that block Phase 1. The spec amendments under "Spike results" are proposals for the owner; if any is rejected,
T9 (and T3 for finding 1) change before they start.
