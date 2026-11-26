# Core review follow-ups (2026-11-25)

Small core fixes from the documentation review. Each fix is test-first (`gato-task`).

## Fix 1: self-hosted Compose checks

File: `scripts/lib/architecture/selfhost.ts`, `checkSelfhostCompose(root: string): string[]`.
Tests: `src/__tests__/architecture/selfhost-stack.test.ts` (fixtures written to a temp `docker-compose.selfhost.yml`).

A one-shot service is one with `restart: "no"` outside the `tools` profile, other than `migrate`. A service "runs under
profile `p`" when its `profiles` is missing, not an array or an empty array (it always starts), or contains `p`. A one-shot
service without profiles starts under every profile set, so only a waiter without profiles covers it.

Issue literals (prefix `docker-compose.selfhost.yml: `):

- `I1(name)` = `${name} runs once (restart: "no"), so another service must wait for it to complete (service_completed_successfully) or up --wait fails` (unchanged)
- `I2(name, p)` = `${name} runs once (restart: "no"), so a service started with profile ${p} must wait for it to complete (service_completed_successfully) or up --wait fails`
- `I3(name)` = `${name} must not publish a port` (the existing db literal, now for every service except `app`)
- `I4(name)` = `${name} uses the development credential minioadmin; take the credentials from .env.selfhost`

### Behaviours

1. One-shot `seed` without profiles, `app` (no profiles) waits for it with `service_completed_successfully` → `[]`.
2. One-shot `seed` without profiles; the only waiter `worker` has `profiles: ["s3"]` → `[I1("seed")]`.
3. One-shot `seed` with `profiles: ["s3"]`; waiter `worker` with `profiles: ["s3"]` → `[]`.
4. One-shot `seed` with `profiles: ["s3"]`; `app` (no profiles) waits for it → `[]`.
5. One-shot `seed` with `profiles: ["s3", "full"]`; the only waiter has `profiles: ["s3"]` → `[I2("seed", "full")]`.
6. One-shot `seed` with `profiles: ["s3", "full"]`; waiters `w1` (`["s3"]`) and `w2` (`["full"]`) → `[]`.
7. One-shot `seed` with `profiles: ["s3", "full"]`; the only waiter has `profiles: ["other"]` →
   `[I2("seed", "s3"), I2("seed", "full")]` (in the one-shot service's profile order).
8. One-shot `seed` with `profiles: ["s3"]` and no waiter at all → `[I2("seed", "s3")]`.
9. A waiter with `profiles: []` counts as running always: one-shot `seed` without profiles, waiter `worker` with
   `profiles: []` → `[]`.
10. A waiter that only waits for `service_started` under the right profile does not count (`seed` `["s3"]`, waiter
    `["s3"]` with `service_started`) → `[I2("seed", "s3")]`.
11. `minio` with `ports: ["9000:9000"]` → `[I3("minio")]`; `migrate` with `ports: ["5555:5555"]` → `[I3("migrate")]`;
    db with ports still → `[I3("db")]` (existing test). `app` with ports → `[]` (existing). Empty list / key without value → `[]`.
    Several services with ports → one issue each, in file order.
12. `minio` with `environment: { MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" }` → `[I4("minio")]`
    (one issue per service). Also found in a list-form environment (`["MINIO_ROOT_USER=minioadmin"]`), in an
    interpolation default (`${S3_ACCESS_KEY_ID:-minioadmin}`), in `command`/`entrypoint` strings, in upper case
    (`MinioAdmin`). A service without it (`${S3_ACCESS_KEY_ID}`) → `[]`.
13. Contract order: app→migrate, migrate→db, app healthcheck, published ports (file order), mail relay (file order),
    one-shot (file order), development credentials (file order).
14. The repository's `docker-compose.selfhost.yml` still passes (existing test).
15. Non-string profile entries are ignored: one-shot `seed` with `profiles: [null]` and no waiter → `[I1("seed")]`;
    one-shot `seed` with `profiles: [null, "s3"]` and no waiter → `[I2("seed", "s3")]`.

### Mutations to kill

- Ignoring profiles (any waiter counts) → behaviours 2, 5, 7, 10.
- Requiring the waiter's profiles to equal the one-shot service's profiles → behaviour 4, 6.
- Treating `profiles: []` as "never runs" → behaviour 9.
- Checking ports only on `db` → behaviour 11; exempting a service other than `app` → behaviour 11.
- Case-sensitive credential match → behaviour 12; checking only `environment` → behaviour 12.
- Reporting a credential issue per occurrence instead of per service → behaviour 12.

## Fix 2: `docs/self-hosting.md` backup and restore

Docs only. Port the restore procedure from https://docs.gatojs.com/deployment/self-hosting: `dc` as a shell function,
`set -eu`, `dc stop app` before destructive steps, `pg_restore --exit-on-error`, a MinIO restore path; backup copies
`./volumes/minio` with `minio` stopped. No "verified" mark unless the steps were run.

## Fix 3: concurrent first encryption for one organization

File: `src/features/encryption/services/organization-encryption.ts` (`wrappedKeyForWrite`, used by
`encryptForOrganization(organizationId: string, plaintext: string): Promise<string>`).

Finding (probed on Prisma 7.10.1 + PostgreSQL 16, 2026-11-25): `upsert` with an empty `update` is not a native
`INSERT ... ON CONFLICT`. Prisma runs `SELECT` then `INSERT` in a transaction, so concurrent first writers get `P2002`
(30 rounds of 10 parallel upserts: 261 of 300 calls failed with `P2002`).

Fix: keep the upsert; when it rejects with `Prisma.PrismaClientKnownRequestError` code `P2002`, re-read the stored row
(`findUnique({ where: { organizationId } })`) and use its `wrappedKey`. If the re-read finds no row, rethrow the
original error. Any other error (another code, a plain `Error`) propagates unchanged, without a re-read.

Tests: `src/features/encryption/services/__tests__/organization-encryption.test.ts` (unit, mocked Prisma; build the
error with `new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion })` from `@/generated/prisma/client`)
and `organization-encryption.integration.test.ts` (real PostgreSQL).

### Behaviours

1. Upsert rejects with `P2002` and the row another writer stored holds `WRAPPED_DATA_KEY` → `encryptForOrganization`
   resolves, its ciphertext decrypts with the fixed data key, no row is added, the re-read filters by exactly
   `{ organizationId: ORG_A }`.
2. Upsert rejects with `P2002` and the re-read finds no row → rejects with that same `P2002` error object.
3. Upsert rejects with a known error of code `P2003` → rejects with it; no `findUnique` after the upsert.
4. Upsert rejects with `new Error("connection reset")` → rejects with it; no `findUnique` after the upsert.
5. Integration: 10 parallel first `encryptForOrganization(orgA.id, "value-<i>")` → all resolve, exactly one data key row
   for orgA, every ciphertext decrypts to its own plaintext, orgB has no row.

### Mutations to kill

- Removing the catch (P2002 propagates) → behaviours 1, 5.
- Catching every error → behaviours 3, 4.
- Matching any code instead of `P2002` → behaviour 3.
- Returning the generated key instead of the stored one after `P2002` → behaviour 1.
- Swallowing the error when the re-read is empty (returning the generated key) → behaviour 2.
- Re-reading with another organization's id / without the filter → behaviour 1.

## Fix 4: `docs/17-encryption-module.md`

Docs only (Polish file): deleting an organization makes values unreadable only in the live database; earlier backups
keep the wrapped data key. Moving data to another environment requires the same `ENCRYPTION_MASTER_KEY` (and
`API_KEY_PEPPER` for api-keys).

## Fix 5: merge keys and Compose's one-shot rules in the self-hosted checks

From the independent review of PR #114. File: `scripts/lib/architecture/selfhost.ts`,
`checkSelfhostCompose(root: string): string[]`. Tests: `src/__tests__/architecture/selfhost-stack.test.ts`. Issue
literals `I1`–`I4` as in Fix 1, unchanged.

Rules, following Compose:

- The file is parsed with YAML merge keys resolved (`parse(text, { merge: true })`), as Compose does, so a service
  built from `<<: *anchor` is checked with the merged keys.
- A service without `restart` has Compose's default `restart: "no"`. It is a one-shot service when at least one other
  service waits for it with `service_completed_successfully` (a service nobody waits to complete is taken as
  long-running, like `db`). A service with `restart: "no"` is a one-shot service as before. A service with another
  restart policy is not, even when a service waits for it to complete: the issue text names `restart: "no"`.
- Compose starts a service when any of its profiles is active. The `tools` profile is started only by hand
  (`dc --profile tools run`), so it is left out of the profiles a one-shot service is checked under; a one-shot service
  whose only profile is `tools` is not checked, one with `["tools", "s3"]` is checked under `s3`.

### Behaviours

1. A module service `minio` built from an anchor that publishes a port: top-level `x-exposed: &exposed` with
   `ports: ["9000:9000"]`, `minio: { <<: *exposed, image: "minio" }` (hand-written YAML) → `[I3("minio")]`.
2. The same anchor merged into `app` → `[]` (app may publish ports).
3. `seed` without `restart`, the only waiter `worker` (`profiles: ["s3"]`) waits for it to complete → `[I1("seed")]`.
4. `seed` without `restart`, `app` (no profiles) waits for it to complete → `[]`.
5. `seed` without `restart`, `profiles: ["s3", "full"]`, the only waiter `worker` (`profiles: ["s3"]`) waits for it to
   complete → `[I2("seed", "full")]`.
6. `seed` without `restart` that a service only waits to start (`service_started`) and no profiles → `[]` (not a
   one-shot service).
7. `seed` without `restart` and no waiter → `[]`.
8. One-shot `seed` (`restart: "no"`) with `profiles: ["tools", "s3"]` and no waiter → `[I2("seed", "s3")]` (only `s3`).
9. One-shot `seed` (`restart: "no"`) with `profiles: ["tools"]` and no waiter → `[]` (existing `tools` test).
10. One-shot `seed` (`restart: "no"`) with `profiles: ["s3", "full"]`, one waiter `worker` with
    `profiles: ["s3", "full"]` waiting for it to complete → `[]`.
11. A service without `restart` named `migrate` stays exempt: the repository stack still passes.
12. `seed` with `restart: "unless-stopped"`, the only waiter `worker` (`profiles: ["s3"]`) waits for it to complete →
    `[]` (only `"no"` or no `restart` makes a completion dependency one-shot).

### Mutations to kill

- Dropping `{ merge: true }` → behaviour 1.
- Treating every service without `restart` as one-shot → behaviour 7 (and the repository stack: `db` has
  `restart`, but fixtures' `db` has none).
- Counting a `service_started` waiter as making a service one-shot → behaviour 6.
- Making a completion dependency one-shot whatever its restart policy → behaviour 12.
- Keeping the whole-service `tools` exemption → behaviour 8; reporting `tools` itself → behaviours 8, 9.
- Requiring a waiter's profiles to equal the one-shot service's → behaviour 10 still passes; covered by Fix 1's
  behaviour 4.

## Fix 6: backups never leave the app stopped, restores never delete live data first

Docs only (`docs/self-hosting.md`). Backup: `trap 'dc start app' EXIT` right after `dc stop app`; the MinIO copy inside
the same block, before `app` starts again. Restore: check the set first (`postgres.dump` non-empty and readable by
`pg_restore --list`, `uploads.tar` listable, `$B/minio` a non-empty directory); take a safety `pg_dump` of the live
database; restore into a scratch database with `pg_restore --single-transaction --exit-on-error` and swap it in by
renaming only after it succeeded; move the old uploads and `volumes/minio` aside and remove them only at the end.
Record a run only for what ran.

## Versions

Core patch, encryption patch (next free on main when finishing).
