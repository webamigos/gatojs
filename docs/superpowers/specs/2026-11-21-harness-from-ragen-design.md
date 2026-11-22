# Harness from Ragen: architecture tests, runtime organization guard, skills and Task Router

Date: 2026-11-21. Research by Patryk with an agent: a comparison of the wa-kit harness with the `ragen-app` monorepo.

Sources:

- `ragen-app/tests/architecture/` (about 125 repo consistency tests), in particular `agent-instructions-fit-the-budget.test.ts`, `documented-commands-exist.test.ts`, `i18n-keys-exist-in-every-locale.test.ts`, `env-example-starts-every-app.test.ts`, `the-node-floor-is-one-number.test.ts`, `client-bundles-stay-browser-safe.test.ts`, `an-infra-path-that-is-cited-exists.test.ts`;
- `ragen-app/docs/tenant-scope-guard.md`, ADR-23 and `packages/platform-contracts/src/tenant-scope/`;
- `ragen-app/.claude/skills/` (`ragen-code-review`, `ragen-upgrade-dependency`, `ragen-tenant-scope-audit`) and the "Task Router" section of `ragen-app/AGENTS.md`;
- `ragen-app/.claude/settings.json` (the `permissions` allowlist).

## 1. Why

The wa-kit harness is strong at enforcing *how* an agent writes code and tests: the `block-comments` and `protect-tests` hooks, a tester who is not the implementer, the mutation gate for critical files. It is weaker at two other things:

- **repo consistency**: whether the commands and paths cited in agent instructions exist, whether i18n keys exist in both languages, whether `.env.example` passes validation, whether there is one Node version;
- **organization isolation at runtime**: `server-entrypoints-guard.test.ts` is syntactic and has documented gaps (a service in another module, a helper that is an object method, `try/catch`). A query without `organizationId` gets through unless an isolation test happens to hit it.

Ragen has proven answers to both. This spec moves them into the kit core, so they reach every project through `wa create` and `wa kit sync`.

Nothing goes back to Ragen as part of this work.

## 2. Scope

Phase 1 (high priority), plan [2026-11-21-harness-from-ragen.md](../plans/2026-11-21-harness-from-ragen.md):

1. Architecture tests in the core (`src/__tests__/architecture/`).
2. A runtime organization guard: a Prisma extension that **throws** on a query without an `organizationId` filter.
3. Project skills in the project's `.claude/skills/`, a "Task Router" in `AGENTS.md` and a `permissions` allowlist in `.claude/settings.json`.

Phase 2 (medium priority, a separate plan after phase 1): a SessionStart hook for cloud sessions, a lessons catalog with an index guarded by a test, a PR template, CODEOWNERS and dependabot as kit files, a spec template with "Behaviours" and "Mutations to kill" sections.

Out of scope: `packages/*` (env, crypto, observability, eslint-config). That is a separate topic with a decision replacing D29.

## 3. Architecture tests

Each test runs in a project assembled with any set of modules (the `assemble` job in `kit.yml`), because it is a core file. A test must not depend on `kitOnly` files (`docs/**`, `kit/**`).

| Test | Invariant |
| --- | --- |
| `agent-instructions-fit-the-budget` | `AGENTS.md` is at most 31,744 bytes (Codex's 32 KiB limit minus 1 KiB of headroom). Codex silently truncates instructions above `project_doc_max_bytes`. |
| `documented-commands-exist` | Every `npm run <script>` in `AGENTS.md`, `CLAUDE.md`, `README.md` and `.claude/**/*.md` exists in `scripts` in `package.json`. |
| `cited-paths-exist` | Every repo path in backticks or in a link in `AGENTS.md`, `CLAUDE.md` and `.claude/**/*.md` exists. Patterns with `<x>`, `*` and `**` are skipped by the rule in the plan. |
| `i18n-keys-exist-in-every-locale` | `src/app/messages/<locale>.json` and every `src/features/*/i18n/<locale>.json` have the same set of keys (dotted paths) for every locale in `src/i18n/locales.generated.ts`. |
| `env-example-passes-validation` | `checkEnv` from `src/shared/lib/env.ts` accepts `.env.example` (with the project's module registry). |
| `node-version-is-one-number` | The major from `.nvmrc` equals the major in `FROM node:<major>` in the `Dockerfile`. No workflow sets `node-version:` as a literal; they use `node-version-file: .nvmrc`. |
| `client-bundles-stay-server-free` | A file with `"use client"` does not import (directly, from source) `@/shared/lib/prisma`, `@/shared/lib/env`, `@/shared/lib/auth` (except `client`), `@/generated/prisma/**`, `server-only` or `node:*`. |

A test that finds a violation in the current code gets no exception: the violation is fixed in the same task. An exception with a reason is allowed only when the fix needs a change outside the plan's scope; the task then reports it to a human.

## 4. Runtime organization guard

### 4.1 Behaviour

- A Prisma extension (`$extends` with `query.$allModels.$allOperations`) in `src/shared/lib/tenant-scope/`. `src/shared/lib/prisma.ts` exports the extended client. The same client is passed to better-auth's `prismaAdapter`.
- Guarded models: every model with a scalar `organizationId` field except `Member` and `Invitation`. The list comes from the schema (the generated client), not from a hand-written map, because modules must not edit core files. A new module model with `organizationId` is guarded without changing the core.
- `Member` and `Invitation` are outside the guard: they are better-auth tables that the adapter reads by `id`, `userId` and email, and core code legitimately reads one user's memberships across all organizations. Their isolation is guarded today by isolation tests and `server-entrypoints-guard`.
- A query on a guarded model without an organization filter throws `TenantScopeError` (`name = "TenantScopeError"`). The query never reaches the database. This applies in dev, tests and production. There is no warn-only mode.
- `withoutTenantScope(reason, fn)` runs `fn` with the guard off (AsyncLocalStorage). `reason` is a non-empty string. Each call logs `logger.debug` with the model, operation and reason. Nesting works, and the guard comes back after `fn` finishes, including after an error.

### 4.2 What counts as a filter

Following Ragen (`docs/tenant-scope-guard.md`), with one difference: the guard throws instead of warning.

- An `organizationId` key at the top level of `where`, with a pinning value: a string, `{ equals: <string> }` or `{ in: [<at least one string>] }`.
- A compound unique selector containing `organizationId` (`organizationId_userId: { organizationId, … }`).
- One element of `AND` (array or object) that satisfies the above.
- An `OR` where **every** branch satisfies the above.
- These do not count: `NOT`, relation filters (`organization: { … }`), `{ not }`, `{ notIn }`, `{ equals: undefined }`, `{}`, `undefined`, `null`, an empty string.
- Writes: `create` needs `data.organizationId` (a non-empty string); `createMany` and `createManyAndReturn` need it in every row; `upsert` needs the filter in `where` and `create.organizationId`. `organization: { connect }` is not enough.
- Operations with `where` (`findUnique`, `findUniqueOrThrow`, `findFirst`, `findFirstOrThrow`, `findMany`, `update`, `updateMany`, `updateManyAndReturn`, `delete`, `deleteMany`, `count`, `aggregate`, `groupBy`): the filter in `where`. No `where` means no filter.
- `$queryRaw`, `$executeRaw` and queries through nested relations (`include`, nested writes from a parent model) are outside the guard. This is a deliberate limitation, described in the docs.

### 4.3 Places that read across organizations today

- `src/features/api-keys/services/authenticate-api-key.ts`: `apiKey.findUnique` by `hashedKey`. The organization is unknown before the key is checked. → `withoutTenantScope("api key lookup by hash", …)`.
- `src/features/uploads/services/read-upload.ts`: `upload.findUnique` by `id`. A public file is readable by anyone, and a private one is checked after the read. → `withoutTenantScope("upload lookup before visibility check", …)`.
- Test helpers (`src/test/integration/database.ts`, `resetDatabase()`) use `withoutTenantScope` or a separate client without the extension.

This list comes from `grep`. The guard task runs the integration and e2e tests, which find the rest.

### 4.4 Why `throw` from the start

Ragen started with warnings because it had about 200 unaudited call sites. The kit has a dozen or so queries on domain models, and all of them filter by `organizationId` or are listed in 4.3. A new project starts clean, and an error instead of a warning stops a mistake in the first integration or e2e test.

## 5. Skills, Task Router and permissions

- `.claude/skills/` in the core (a project file, copied by `wa create` and updated by `wa kit sync`):
  - `wa-code-review`: repo invariants that `npm run verify` cannot check (list in the plan);
  - `wa-upgrade-dependency`: dependency upgrades, especially libraries with their own tables (better-auth, Prisma) and Next.js; e2e as the gate;
  - `wa-new-module`: a new project feature (`projectModules`) or kit module: `defineModule`, manifest, `wa generate`, isolation tests, the guard.
- `AGENTS.md`: a "Task Router" section (task type → file, kit doc or skill) instead of scattered references. Its size is guarded by the test from section 3.
- `.claude/settings.json`: `permissions.allow` only for read-only commands and gates that do not write to any database (exact entries listed in the plan). No commands that write to a database, push or delete.

## 6. Decisions

- D50 · Architecture tests in the kit core.
- D51 · The runtime organization guard throws; `Member` and `Invitation` outside the guard; `withoutTenantScope` as the only way out.
- D52 · Project skills, Task Router and the `permissions` allowlist as core files.

`core` gets one minor version (`0.5.3` → `0.6.0`) when the phases are integrated. The `api-keys` and `uploads` modules get a patch version for the change in 4.3.
