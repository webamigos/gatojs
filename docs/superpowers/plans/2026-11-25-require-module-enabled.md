# Extensibility Task 6: `requireModuleEnabled` (task plan)

Parent plan: [2026-11-23-extensibility.md](2026-11-23-extensibility.md), "Task 6". This file is the `gato-task` step 1 plan:
signatures, behaviours with literal expectations, mutations to kill.

## Files and signatures

- `src/shared/lib/modules/module-disabled-error.ts` (new, `core`, client-safe, no imports):
  `export class ModuleDisabledError extends Error` with `name = "ModuleDisabledError"`, `readonly moduleKey: string`,
  constructor `(moduleKey: string)`, message `Module disabled: <moduleKey>`. Not a `DomainError`.
- `src/shared/lib/modules/require-module-enabled.ts` (new, `core`):
  - `export function isModuleEnabled(key: string): boolean`: `true` for `auth` and `organizations`
    (`UNDISABLEABLE_MODULES` from `gato-config.ts`) whatever the registry says; otherwise `true` only when
    `moduleByKey(key)` (`src/shared/lib/auth/permissions.ts`, which reads `clientModules` after `applyGatoConfig`)
    finds the module. A key that is disabled or not installed is `false`.
  - `export function requireModuleEnabled(key: string): void`: throws `ModuleDisabledError(key)` when
    `isModuleEnabled(key)` is `false`.
  - re-exports `ModuleDisabledError`.
- `src/shared/utils/error-handling.ts`: `handleCommandError(new ModuleDisabledError(k), message)` logs with
  `logger.warn` (not `logger.error`) and returns `{ success: false, error: message }`; never the error's own message.
- Callers, each calls the guard first, before any session read, Prisma or storage access:
  - `src/app/api/v1/organization/route.ts` `GET`: `api-keys` disabled → `404`, empty body, `Cache-Control: no-store`;
    `authenticateApiKey` is not called.
  - `src/app/api/uploads/route.ts` `POST` and `src/app/api/uploads/[id]/route.ts` `GET`: `uploads` disabled → `404`,
    empty body, before the `content-length` checks, `readOrgContextForApi`, `createUpload`, `readUploadForDownload`.
  - `deleteUploadCommand` (`uploads`): via `requireModuleEnabled` inside the existing `try`, so `handleCommandError`
    maps it.
  - `createUpload` (`uploads`): `{ status: 404, body: { error: "not_found" } }` (`CreateUploadResult` gains `404`).
  - `inviteUserCommand` (`users`): via `requireModuleEnabled` inside the existing `try`.
- `scripts/lib/architecture/module-entry-points.ts` (new, `core`):
  - `export const MODULE_GUARDS = ["requireModuleAccess", "requireModuleEnabled", "isModuleEnabled", "runCommand"]`.
  - `export function findModuleEntryPoints(root: string): string[]`: sorted `<repo path>#<export name>` of every entry
    point: in every `route.ts`/`route.tsx` under `src/app/`, the exported HTTP method handlers (`GET`, `HEAD`, `POST`,
    `PUT`, `DELETE`, `PATCH`, `OPTIONS`); in every `.ts`/`.tsx` file under `src/features/<x>/` whose first statement
    is the `"use server"` directive (tests and `__tests__/` skipped), every exported name; `src/features/auth/` and
    `src/features/organizations/` are skipped (those modules cannot be disabled).
  - `export function findUnguardedModuleEntryPoints(root: string, allowed: ReadonlyMap<string, string>): string[]`:
    the entry points, not in `allowed`, that do not reach a guard. An entry point reaches a guard when it is a local
    top-level function (declaration, or `const` arrow/function expression, also exported through
    `export { local as Name }`) whose body contains a call to an identifier imported (named import, alias allowed)
    under one of the `MODULE_GUARDS` names, or a call to a local top-level function that reaches one (transitive,
    cycle-safe). Anything else exported under an entry-point name (destructured `export const { GET } = …`,
    `export { GET } from "…"`, a non-function value) does not reach a guard.
  - `export function findStaleAllowances(root: string, allowed: ReadonlyMap<string, string>): string[]`: allow-map
    keys that name no entry point, sorted.
- `src/__tests__/architecture/module-entry-points-check-enabled.test.ts` (new, `core`): the allow map with reasons
  (healthcheck `GET`, better-auth `GET`/`POST`, the two impersonation log commands) and three checks on the repo:
  no unguarded entry point, no stale allowance, the entry points found include `src/app/api/v1/organization/route.ts#GET`
  when that file exists.
- Docs: `docs/06-wzorce-kodu.md` or `docs/03-dane-i-organizacje.md` (Polish, where guards are described).
- Versions: `core`, `uploads`, `api-keys` minor.

## Behaviours

Registry for unit tests: `@/modules.client.generated` mocked with `applyGatoConfig([...], config)` from the real
`gato-config.ts`, so the disabled module is absent from `clientModules` exactly as in production.

1. Registry `dashboard`, `uploads`, `api-keys` with `{ modules: { uploads: { enabled: false } } }`:
   `isModuleEnabled("uploads")` → `false`; `isModuleEnabled("dashboard")` → `true`; `isModuleEnabled("api-keys")` →
   `true`; `isModuleEnabled("billing")` → `false`; `isModuleEnabled("auth")` → `true` and
   `isModuleEnabled("organizations")` → `true` although neither is in that registry.
2. Same registry: `requireModuleEnabled("uploads")` throws an error with `name` `"ModuleDisabledError"`, `moduleKey`
   `"uploads"`, message `"Module disabled: uploads"`, `instanceof ModuleDisabledError`; `requireModuleEnabled("dashboard")`
   returns `undefined`; `requireModuleEnabled("auth")` does not throw.
3. `handleCommandError(new ModuleDisabledError("uploads"), "Nie udało się")` → `{ success: false, error: "Nie udało się" }`,
   `logger.warn` called once, `logger.error` not called.
4. `api-keys` disabled: `GET /api/v1/organization` with any `Authorization` → status `404`, body `""`, header
   `Cache-Control: no-store`, `authenticateApiKey` not called. Enabled with `authenticateApiKey` answering
   `{ ok: true, context }` and `readOrganizationForApiKey` answering `{ id: "org-1" }` → `200`, JSON `{ id: "org-1" }`;
   answering `{ ok: false, status: 401, error: "invalid_key" }` → `401`, JSON `{ error: "invalid_key" }`.
   `organization-route.integration.test.ts` keeps passing.
5. `uploads` disabled: `POST /api/uploads` without `content-length` → `404` (not `411`), body `""`;
   with `content-length: 10` → `404`; `readOrgContextForApi` and `createUpload` not called.
   `GET /api/uploads/<uuid>` → `404`, body `""`, `readUploadForDownload` not called.
6. `uploads` disabled: `deleteUploadCommand({ id: UPLOAD_ID })` → `{ success: false, error: "Nie udało się usunąć pliku" }`;
   no `prisma.upload.*` call, no `deleteObject`, no `trackAudit`, `getOrgContext` not called; the upload row is still
   in the store.
7. `uploads` disabled: `createUpload(formData)` with a valid file → `{ status: 404, body: { error: "not_found" } }`;
   `readOrgContextForApi`, `putObject`, `prisma.upload.create` not called.
8. `users` disabled: `inviteUserCommand({ name, email, role })` →
   `{ success: false, error: "Nie udało się zaprosić użytkownika" }`; `getAdminUserOrNull`, `prisma.user.findUnique`,
   `prisma.invitation.create` not called.
9. Enabled (real registry): the existing tests of these callers keep passing.
10. Detector fixture (temp dir): `src/app/api/billing/route.ts` exporting `GET` that calls neither guard →
    `findUnguardedModuleEntryPoints` returns `["src/app/api/billing/route.ts#GET"]`.
11. Fixture: `GET` calling an imported `requireModuleEnabled("billing")` → `[]`; the same with
    `import { requireModuleEnabled as ensure }` and `ensure("billing")` → `[]`; with `isModuleEnabled`,
    `requireModuleAccess`, `runCommand` → `[]`.
12. Fixture: `GET` calls a local `async function guard()` that calls `requireModuleEnabled` → `[]`; two local functions
    calling each other with no guard → reported (no infinite loop).
13. Fixture: a local function named `requireModuleEnabled` (declared in the file, not imported) → reported.
14. Fixture: `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"` in a route file → not
    entry points; `export const { GET, POST } = handlers` → `#GET` and `#POST` reported; `export { GET } from "./x"` →
    `#GET` reported; `export const POST = async () => { requireModuleEnabled("x"); }` → not reported;
    `function handler() {…guard…}` + `export { handler as PUT }` → not reported.
15. Fixture: `src/features/billing/services/commands/a.ts` with `"use server"` exporting `doIt` without a guard →
    `src/features/billing/services/commands/a.ts#doIt`; the same file without the directive → not an entry point;
    the same file under `src/features/auth/` or `src/features/organizations/` → not an entry point; a
    `"use server"` file in `__tests__/` or named `*.test.ts` → not an entry point.
16. Fixture with `allowed` `{"src/app/api/billing/route.ts#GET" => "reason"}` → `[]`; `findStaleAllowances` with an
    extra key `src/app/api/gone/route.ts#GET` → `["src/app/api/gone/route.ts#GET"]`.
17. Repo: `findUnguardedModuleEntryPoints(repoRoot, ALLOWED)` → `[]`; `findStaleAllowances` → `[]`.

## Mutations to kill

- guard placed after the first Prisma access / session read in any caller (Behaviours 4–8 assert the I/O mocks are
  not called);
- `404` replaced by `500` (or `401`) in a route; body detail leaked in the `404`;
- enabled check reading an unfiltered list (Behaviour 1 with `applyGatoConfig` in the mocked registry), or ignoring
  the `auth`/`organizations` exemption, or treating an unknown key as enabled;
- `ModuleDisabledError` mapped to its own message, or logged as an error;
- detector: accepting a non-imported guard name, dropping the transitive walk, looping on cycles, treating non-method
  route exports as entry points, skipping the `"use server"` check, scanning `auth`/`organizations`, ignoring the
  allow map, missing stale allowances, unsorted output.
