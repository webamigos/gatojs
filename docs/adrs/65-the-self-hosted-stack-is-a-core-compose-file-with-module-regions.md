# ADR-65: The self-hosted stack is a core Compose file with module regions, and it has no mail relay

**Status:** Accepted
**Date:** 2026-11-25
**Decided by:** Patryk (self-hosting spec, decisions 8.1 and 9.4), written up by an agent

## Context

Deployment docs assumed Railway. A company that runs GatoJS on its own server, in a private cloud or in a network
without internet access had no file that runs the app next to its database and storage, and no runbook for backup,
restore and upgrade. The stack has core parts (the app, PostgreSQL, the migration step) and module parts (MinIO and the
storage variables of `uploads`, the secrets of `api-keys` and `encryption`). A module does not edit core files, and the
development values of module variables (`STORAGE_LOCAL_PATH=./volumes/uploads`, `minioadmin` keys) are wrong for a
production install.

## Decision

- `docker-compose.selfhost.yml` and `.env.selfhost.example` are core files (listed in `kit/modules/core.json` `files`
  and in `placeholderFiles`), next to `docker-compose.yml`, `Dockerfile` and `railway.toml`. Every project gets them.
- The Compose file runs `db` (`postgres:16`, named volume `postgres-data`, no published port), `migrate`
  (`prisma migrate deploy` in the app image, after a healthy `db`), `app` (after `migrate` completed successfully, with
  a healthcheck on `/api/healthcheck` and the named volume `uploads` at `/app/volumes/uploads`) and `tools` (the
  `builder` stage under the `tools` profile, for `npm run admin:create`, because the `runner` image has no `tsx` or
  `scripts/`). `DATABASE_URL` is built from `POSTGRES_PASSWORD` in Compose, so the database password is set once.
- Modules join through two regions filled by `wa generate` (gato-cli `selfhostCompose` and `env[].selfhostExample`,
  self-hosting Task 5): `# wa:services:start/end` in `docker-compose.selfhost.yml` and `# wa:modules:start/end` in
  `.env.selfhost.example`. A manifest's `selfhostExample` replaces its development `example` there; empty means "the
  operator fills it" (secrets, keys).
- `uploads` ships `docker/uploads.selfhost.compose.yml`: `minio` and `minio-init` under the `s3` profile, no published
  ports, credentials from `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. Its data is a bind mount (`./volumes/minio`),
  because a region inside `services:` cannot declare a top-level named volume.
- No mail relay in the stack (decision 8.1, as in Ragen's appliance). `.env.selfhost.example` sets
  `MAIL_PROVIDER=smtp` with the relay variables commented out; an install that sends no mail sets
  `MAIL_PROVIDER=console` ([ADR-64](64-production-mail-needs-a-configured-provider-or-explicit-console.md)).
- The runbook is `docs/self-hosting.md` (English, GatoJS repository only).

## Rejected alternatives

- Hard-coding the `uploads` variables and MinIO in the core files: breaks "a module does not edit core files", and a
  project without `uploads` would carry MinIO.
- A mailpit or Postfix relay in the stack: a relay that delivers to the internet is an outside dependency of its own,
  and a company that self-hosts already runs one.
- A compiled `admin:create` in the `runner` image: one more build output to maintain; the `tools` profile reuses the
  `builder` stage the image build already produces.
- A named volume for MinIO data: a module region cannot add top-level `volumes:` entries.

## Consequences

- A module that needs a service or other values in a self-hosted install sets `selfhostCompose` or
  `env[].selfhostExample` in its manifest; core files stay untouched.
- Projects do not commit migrations from GatoJS ([D13](../decyzje.md#d13)): `migrate` applies the project's own
  `prisma/migrations`, so an install needs at least one committed migration.
- One `app` instance with local storage. More instances need `STORAGE_PROVIDER=s3`.

## Enforcement

`src/__tests__/architecture/selfhost-stack.test.ts` with `scripts/lib/architecture/selfhost.ts`: the start order
(`migrate` after a healthy `db`, `app` after `migrate` completed), the `app` healthcheck, no published `db` port, no
mailpit image, and `.env.selfhost.example` passing `checkEnv` with `NODE_ENV=production` once the operator's empty
values are filled. `npm run wa -- generate` with `git diff --exit-code` in CI keeps the regions in sync. The `assemble`
job in `.github/workflows/kit.yml` checks both files in every module combination.

## Sources

- Spec `docs/superpowers/specs/2026-11-22-self-hosting-design.md` sections 4.2, 4.4, 8 and 9.
- Plan `docs/superpowers/plans/2026-11-23-self-hosting.md`, Tasks 5 and 6.
- Ragen `docs/appliance-runbook.md`, `infra/appliance/appliance.env.example`.
