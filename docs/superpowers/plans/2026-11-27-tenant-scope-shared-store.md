# Fix: `withoutTenantScope` works in the production build

Found by the egress check (self-hosting Task 7) on 2026-11-27.

## Bug

In the standalone production image, `GET /api/uploads/<id>` answers 500 with
`TenantScopeError: Query Upload.findUnique has no organizationId filter` although `read-upload.ts` wraps the query in
`withoutTenantScope(...)`. The Next.js (Turbopack) server build puts `src/shared/lib/tenant-scope/tenant-scope-extension.ts`
into several server chunks (seven in the built image), so the module is evaluated more than once. `src/shared/lib/prisma.ts`
keeps the client on `globalThis`, so every chunk queries through the extension of the copy that created the client, while
`withoutTenantScope` runs its callback in the `AsyncLocalStorage` of its own copy. The guard never sees the bypass.
Unit tests and `next dev` load one copy and pass. The same bypass is used by `authenticate-api-key.ts` (every API-key
request) and `src/shared/lib/modules/setup.ts`. No e2e downloads an upload or calls an API with a key.

## Fix

`tenant-scope-extension.ts` keeps the bypass `AsyncLocalStorage` on `globalThis` under
`Symbol.for("gatojs.tenant-scope.bypass")`, created by the first copy that loads and reused by every later one. Fail-closed
behaviour stays: outside a bypass a query without the organization filter throws.

## Behaviours

1. Two copies of the module (`vi.resetModules()` between two dynamic imports of `../tenant-scope-extension`): an unscoped
   query passed to copy B's `guardTenantQuery` inside copy A's `withoutTenantScope("reason", …)` resolves with the query's
   result, and copy B logs the debug line with `reason: "reason"`.
2. The same in the other direction (copy B's bypass, copy A's guard) resolves too.
3. With two copies, copy B's guard outside any bypass rejects with `TenantScopeError` (model and operation of the query),
   and the query function is not called.
4. After copy A's `withoutTenantScope` has returned, copy B's guard rejects again (the bypass does not leak).
5. Production build (e2e, `core-auth` project, `e2e/production-bypass.spec.ts`), run against the standalone server:
   - the admin uploads a PNG with `purpose=editor-image` to `POST /api/uploads` → 201; `GET /api/uploads/<id>` → 200 with
     `content-type` `image/…`;
   - the admin creates an API key with the "Odczyt danych organizacji" scope on `/api-keys`, reads the secret from the
     dialog, and `GET /api/v1/organization` with `Authorization: Bearer <secret>` → 200; with a wrong key → 401.

## Mutations to kill

- the store created per module copy again (behaviours 1, 2);
- the guard skipping the check when no store exists, or a bypass that never ends (behaviours 3, 4).

## Gates

Core patch bump, `wa kit sync` + `generate` + `git diff --exit-code`, lint, typecheck, the tenant-scope unit tests,
`npm run test:integration`, mutation on `tenant-scope-extension.ts` + the gate, `npm run test:e2e` for behaviour 5 (needs
Patryk's consent text for resetting `wa_app_e2e`).
