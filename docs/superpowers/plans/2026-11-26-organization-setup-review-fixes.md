# Organization setup: review fixes (extensibility Task 11)

Fixes from the independent review of PR #126 (`feat/organization-setup`).

## Files and signatures

- `scripts/lib/setup-organizations.ts`: `setupOrganizationsCommand(argv: string[], deps: SetupOrganizationsDeps): Promise<number>` (internal `parseSetupArgs`).
- `src/shared/lib/modules/setup.ts`: `missingOrganizationSetups(options: MissingSetupOptions)`, `runMissingOrganizationSetups(options)`; internal `organizationIds(organizationId?: string)`.
- `scripts/lib/admin-create.ts`: `adminCreate(options): Promise<AdminCreateResult>`.
- `scripts/lib/architecture/client-imports.ts`: `MODULE_SERVER_FILE` regex (server modules a client file must not import).
- Docs: `docs/09-nowy-modul.md` (organization setup section), `docs/16-cli-wa.md`.

## Behaviours

1. `setupOrganizationsCommand(["--organization", ""], deps)` → `1`; `deps.error` called once with
   `--organization needs a non-empty organization id`; `deps.missing` and `deps.run` not called; `deps.log` not called.
2. `setupOrganizationsCommand(["--organization="], deps)` → same as 1.
3. `setupOrganizationsCommand(["--check", "--organization", ""], deps)` → `1`, same error, `deps.missing` not called.
4. `setupOrganizationsCommand(["--module", ""], deps)` → `1`; `deps.error` called with
   `--module needs a non-empty module key`; `deps.run` not called.
5. `missingOrganizationSetups({ organizationId: "", modules: [<entry with onOrganizationCreated>] })` with organizations
   `org-a`, `org-b` in the database → rejects with `OrganizationSetupError` `Organization  not found`
   (it must not list the pairs of every organization); `prisma.organization.findMany` was called with `where: { id: "" }`.
6. `runMissingOrganizationSetups({ organizationId: "", modules: [...] })` → rejects with `OrganizationSetupError`; no hook called, no row upserted.
7. `adminCreate` creating the first organization (empty database) → `seed` called once with `{ organizationId: <new org id> }`,
   after the `organizations.created` event.
8. `adminCreate` for a second admin joining an existing (oldest) organization → `seed` not called; no event.
9. `adminCreate` run twice for the same email: the first run creates the organization and seeds it; the second joins it and does not seed again (`seed` called once in total).
10. Architecture: a client file importing `@/features/notes/setup` (static or dynamic import) is a violation reporting
    `@/features/notes/setup`; `import type { setup } from "@/features/notes/setup"` is allowed;
    `@/features/notes/setup-table` and `@/features/notes/components/setup` are not server modules.

## Mutations to kill

- `parseSetupArgs`: removing the empty-organization check; removing the empty-module check; swapping their messages.
- `setup.ts` `organizationIds`: `organizationId !== undefined` → `true`/`false`, or back to truthiness (`organizationId ? …`), in either the `where` or the not-found condition.
- `admin-create.ts`: removing the `organization.created` guard around the seed call; negating it.
- `client-imports.ts`: dropping `setup` from `MODULE_SERVER_FILE`.

## Docs

- 09: seed example idempotent (upsert on a declared unique, or existence check); state that `createMany({ skipDuplicates })`
  is idempotent only with a unique the data repeats (not a generated cuid id).
- 09: `seed` runs only when `admin:create` created the organization (not when it joins an existing one).
- 09: `onOrganizationCreated` runs inside the sign-up / organization-create request: a slow hook slows that request.
- 09: enabling a module later (`gato.config`) or a module update that gains `setup.ts` needs `npm run setup:organizations` (no automatic hint).
- 16: same note on seed where `admin:create` / setup is described.
