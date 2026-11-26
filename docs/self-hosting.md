# Self-hosting

How to install, back up, restore and upgrade a GatoJS project on your own server with
`docker-compose.selfhost.yml`: one machine, the app next to its PostgreSQL database and its files, and nothing sent
to an outside service unless you configure one. The decision behind the stack is
[ADR-65](adrs/65-the-self-hosted-stack-is-a-core-compose-file-with-module-regions.md); the mail rule is
[ADR-64](adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md). The page is modelled on Ragen's
appliance runbook.

"Verified" with a date means the step was run on that date. On 2026-11-25 the steps ran on Docker Engine 24.0.2 with
Compose v2.19.1 (macOS arm64), on a project assembled from this repository with the `uploads` module and one
committed `init` migration, each in a fresh clone with its own `COMPOSE_PROJECT_NAME` and `APP_PORT`:

- `docker compose ... config` resolves with both profiles, and an empty `POSTGRES_PASSWORD` stops Compose with
  "set POSTGRES_PASSWORD in .env.selfhost" (verified 2026-11-25);
- [Install](#install): `up -d --build --wait` exits 0 with `migrate` `Exited (0)` and `app` healthy (verified
  2026-11-25);
- [First administrator](#first-administrator): the `tools` profile creates the administrator, who signs in through
  `POST /api/auth/sign-in/email` at `APP_URL` (verified 2026-11-25);
- [Files](#files-uploads): a file uploaded to the local volume downloads with the same checksum after
  `dc down && dc up --wait` (verified 2026-11-25); with `--profile s3` and `STORAGE_PROVIDER=s3` the file lands in
  the MinIO bucket and not in the volume (verified 2026-11-25). `dc --profile s3 up -d --build --wait` exits 0 now that
  `minio-init` stays up and healthy after it makes the bucket (verified 2026-11-25; before that change `--wait` failed
  on the exited `minio-init` on both v2.19.1 and v2.33.0);
- [Back up](#back-up) and [restore](#restore): a set taken with the commands below and restored into a fresh clone
  with new volumes signs the administrator in and downloads the file with the same checksum (verified 2026-11-25).

The TLS examples and the upgrade path have not been run (not verified).

| Section | State |
| --- | --- |
| [Requirements](#requirements) | written |
| [Install](#install) | written, verified 2026-11-25 |
| [First administrator](#first-administrator) | written, verified 2026-11-25 |
| [Mail](#mail) | written |
| [Files (`uploads`)](#files-uploads) | written, local volume and `s3` profile verified 2026-11-25 |
| [TLS](#tls) | written, examples not run |
| [Back up](#back-up) and [restore](#restore) | written, verified 2026-11-25 |
| [Upgrade](#upgrade) | written |
| [Published images](#published-images) | written, not run (the first publish happens on `main` after merge) |
| [Railway](#railway) | written, not deployed |
| [Prove nothing leaves the machine](#prove-nothing-leaves-the-machine) | placeholder until the egress check (self-hosting Task 7) |

## What runs

| Service | Image | What it does |
| --- | --- | --- |
| `db` | `postgres:16` | The database, in the named volume `postgres-data`. No published port. |
| `migrate` | the app image (`build: .`, or a published one from `APP_IMAGE`) | `prisma migrate deploy` once per start, after `db` is healthy. |
| `app` | the app image | The Next.js server on port 3000 inside, `${APP_PORT:-3000}` on the host. Starts after `migrate` exits 0. Healthcheck on `/api/healthcheck`. Files in the named volume `uploads`. |
| `tools` | the `builder` stage | Profile `tools`, for one-off commands such as `npm run admin:create`. |
| `minio`, `minio-init` | from the `uploads` module | Profile `s3`: a self-hosted S3 store and its bucket. Only in projects with `uploads`. |

There is no mail relay in the stack (see [Mail](#mail)). Modules add their services and variables through the regions
`# wa:services:start/end` and `# wa:modules:start/end`, which `npm run wa -- generate` fills from the manifests.

## Requirements

- Linux (amd64 or arm64; the `Dockerfile` is built on both architectures in CI by `docker-platforms.yml`) or another
  host with Docker Engine and **Docker Compose v2.20 or newer** for `up --wait` with the one-shot `migrate` service and
  `service_completed_successfully`. The install also ran on v2.19.1 (verified 2026-11-25).
- About 2 GB of memory for the build (`next build`); the running app needs much less.
- Internet once, for the base images and npm packages during the build. A fully offline install bundle does not exist
  yet.
- **Committed migrations.** GatoJS ships no migrations ([D13](decyzje.md#d13)); `migrate` applies the project's own
  `prisma/migrations`. Create them with `npx prisma migrate dev --name init` against a development database and
  commit the directory before the first install ([10-wdrozenie.md](10-wdrozenie.md#migracje)). Without them `migrate`
  succeeds with "No migration found" and the app answers 503 from `/api/healthcheck`, because the tables are missing.

## Install

All commands run in the project checkout on the server.

### 1. Write the environment

```bash
cp .env.selfhost.example .env.selfhost
```

`.env.selfhost` is read twice: Compose reads it for interpolation (`--env-file`: `POSTGRES_PASSWORD`, `APP_PORT`, the
MinIO keys) and passes it into `migrate`, `app` and `tools` (`env_file`). `DATABASE_URL` is not in the file: Compose
builds it from `POSTGRES_PASSWORD`. `.env.selfhost` is ignored by git and by the Docker build context. Keep it out of
the repository, and in every backup.

Fill every empty value. One command per secret:

| Variable | Command | Note |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | Signs sessions. Changing it signs everyone out. |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` | Read by PostgreSQL only when it creates the `postgres-data` volume; set it before the first start. Hex, so it needs no escaping in `DATABASE_URL`. |
| `API_KEY_PEPPER` (`api-keys`) | `openssl rand -base64 32` | Manifest kind `secret-32`. Changing it invalidates every API key. |
| `ENCRYPTION_MASTER_KEY` (`encryption`) | `openssl rand -hex 32` | Manifest kind `hex-32`. **If it is lost, every encrypted value is lost**; it goes into every backup. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (`uploads`, only with `STORAGE_PROVIDER=s3`) | `openssl rand -hex 16`, `openssl rand -hex 32` | With the `s3` profile they are also MinIO's root user and password. |

The `generate` field of a variable in `.wa/kit.json` (`modules.<name>.manifest.env`) names its kind: `secret-32` and
`secret-64` are random strings of that many bytes, `hex-32` is 32 bytes written as 64 hex characters.

Then set:

- `APP_URL`: the address users reach, such as `https://app.example.com`. Invitation links and sign-in redirects are
  built from it.
- `EMAIL_FROM` and the mail variables ([Mail](#mail)).
- `APP_PORT` (optional, default `3000`): the host port of `app`. Put a reverse proxy in front of it ([TLS](#tls)).

### 2. Start

```bash
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build --wait
```

The first start builds the image, starts `db`, runs `migrate` (it exits 0) and waits until `app` is healthy. Check:

```bash
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost ps -a
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost logs migrate
```

`migrate` shows `Exited (0)` and the migrations it applied; `app` shows `healthy`.

The commands below shorten the Compose call to `dc`:

```bash
alias dc='docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost'
```

Several installs on one machine need their own project name (`COMPOSE_PROJECT_NAME=<name>` in the environment or
`-p <name>`) and their own `APP_PORT`; volumes are prefixed with the project name.

## First administrator

```bash
dc --profile tools run --rm tools npm run admin:create -- --email admin@example.com
```

`tools` is the `builder` stage of the `Dockerfile`, which has `tsx` and `scripts/`; the `runner` image the app runs
does not. The first run of the profile builds that stage (it is cached from the app build). Without `--password` the
password is generated and printed once. `--role superadmin` creates a service account
([04-auth-i-role.md](04-auth-i-role.md)). Then sign in at `APP_URL`.

## Mail

The stack has no mail relay: a relay that delivers to the internet is an outside dependency of its own, and a company
that self-hosts already runs one.

- **Your own relay** (the default in `.env.selfhost.example`): keep `MAIL_PROVIDER=smtp` and uncomment `SMTP_HOST`,
  plus `SMTP_PORT` (default 587), `SMTP_SECURE=true` for implicit TLS, and `SMTP_USER` with `SMTP_PASS` when the relay
  needs authentication (both or neither). Do not set `SMTP_URL` next to them; the app refuses that at startup.
- **No mail:** `MAIL_PROVIDER=console`. Messages (invitations, password resets) are only written to the log. Without
  either, a production start stops with "no mail provider configured for production".
- Resend works too (`MAIL_PROVIDER=resend`, `RESEND_API_KEY`), but it is an outside service.

Details: [07-i18n-mail-env.md](07-i18n-mail-env.md).

## Files (`uploads`)

- **Local volume** (default, `STORAGE_PROVIDER=local`): files live in the named volume `uploads` at
  `/app/volumes/uploads`, which is `STORAGE_LOCAL_PATH` in `.env.selfhost.example`. One `app` instance only.
- **MinIO in the stack:** set `STORAGE_PROVIDER=s3` and both S3 keys, then start with the profile:

  ```bash
  dc --profile s3 up -d --build --wait
  ```

  `minio-init` creates the bucket `S3_BUCKET`, then stays up and reports healthy, so `--wait` returns only once the
  bucket exists. MinIO keeps its data in `./volumes/minio` next to the Compose file (a
  bind mount, because a module region cannot declare a named volume). Every later `dc` command needs `--profile s3`
  too, or it ignores the MinIO services.
- **An external S3 store:** set `STORAGE_PROVIDER=s3`, the keys and `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`
  from the [preset table](15-modul-uploads.md#presety-s3) (AWS S3, Cloudflare R2, Scaleway, Backblaze B2, MinIO,
  RustFS). `S3_SESSION_TOKEN` takes temporary credentials.

Files are not moved between providers. Choose before the first upload.

## TLS

`app` speaks plain HTTP on `APP_PORT`. Put a reverse proxy with the organization's certificate in front of it and set
`APP_URL` to the `https://` address. Publish the app port on loopback only when the proxy runs on the same host
(`APP_PORT=127.0.0.1:3000` works, because the value is the host side of the port mapping).

Caddy (gets and renews a certificate itself when the name resolves publicly; use `tls <cert> <key>` for an internal
CA):

```caddyfile
app.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
server {
    listen 443 ssl;
    server_name app.example.com;
    ssl_certificate     /etc/ssl/app.example.com.crt;
    ssl_certificate_key /etc/ssl/app.example.com.key;
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

`client_max_body_size` must be at least the largest upload you allow.

## Back up

A backup set is the database, the files and the environment, taken in the same window with `app` stopped:

| Item | Where it lives |
| --- | --- |
| PostgreSQL | volume `<project>_postgres-data` |
| Files | volume `<project>_uploads` (`local`), or the bucket (`s3`; MinIO: `./volumes/minio`) |
| `.env.selfhost` | the checkout; holds `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD` and the module secrets (`ENCRYPTION_MASTER_KEY`) |
| The project version | the commit of the checkout (`git rev-parse HEAD`) |

```bash
B=/var/backups/app/$(date +%Y%m%d-%H%M)
mkdir -p "$B"

dc stop app
dc exec -T db sh -c 'pg_dump -U postgres -d "$POSTGRES_DB" -Fc' > "$B/postgres.dump"
dc run --rm --no-deps -T --user root --entrypoint tar app -C /app/volumes/uploads -cf - . > "$B/uploads.tar"
cp .env.selfhost "$B/"
git rev-parse HEAD > "$B/commit"
dc start app
```

`$POSTGRES_DB` is expanded inside the `db` container, where it holds the database name the Compose file sets (the
project's name, such as `my_app`). `tar` runs in the app image (BusyBox `tar` in `node:22-alpine`), so nothing else is needed on the host. With MinIO,
copy `./volumes/minio` while `minio` is stopped instead of the `uploads` volume. With an external S3 store, use the
store's own versioning or replication.

`$B` holds the secrets next to the data. Keep the backup target as protected as the server.

## Restore

Restore onto the same project commit the set was taken from. A newer commit is an upgrade: `migrate` brings the
schema forward. An older one is not supported.

```bash
B=/var/backups/app/<set>

# 0. On a new machine: clone the project at the commit in "$B/commit"
cp "$B/.env.selfhost" .

# 1. Database only, then replace it
dc up -d --wait db
dc exec -T db sh -c 'dropdb -U postgres --if-exists --force "$POSTGRES_DB" && createdb -U postgres "$POSTGRES_DB"'
dc exec -T db sh -c 'pg_restore -U postgres -d "$POSTGRES_DB" --no-owner' < "$B/postgres.dump"

# 2. Files into the uploads volume (created by this run if it is new)
dc run --rm --no-deps -T --user root --entrypoint sh app \
  -c 'find /app/volumes/uploads -mindepth 1 -delete && tar -C /app/volumes/uploads -xf - && chown -R 1001:1001 /app/volumes/uploads' < "$B/uploads.tar"

# 3. Everything
dc up -d --build --wait
```

`POSTGRES_PASSWORD` comes from the saved `.env.selfhost`; a new `postgres-data` volume is initialised with it.
`chown` gives the files back to the `nextjs` user (UID 1001) the app runs as. Then sign in and open a file uploaded
before the backup.

## Upgrade

1. Back up ([Back up](#back-up)). This is the set a failed upgrade restores.
2. Move the project to the new GatoJS version in a development checkout, not on the server:
   `npm run wa -- update <version>`, resolve conflicts, create the migrations the new schema needs
   (`npx prisma migrate dev --name <name>`), run `npm run verify`, commit.
3. Compare the variables: a new line in `.env.selfhost.example` goes into `.env.selfhost` before the start.

   ```bash
   git diff <old commit> -- .env.selfhost.example
   ```

4. On the server, pull the commit and start:

   ```bash
   git pull
   dc up -d --build --wait
   ```

   `migrate` runs first and `app` starts only after it exits 0. If `migrate` fails, `up` stops with an error: read
   `dc logs migrate`, do not run `prisma migrate reset`, and restore the backup if the database is half-migrated.
   Whether the old `app` container keeps serving meanwhile has not been checked (not verified).

## Published images

Every project has `.github/workflows/docker-publish.yml`. It builds the `Dockerfile` natively on amd64 and arm64 and
pushes one multi-arch image to the GitHub Container Registry (GHCR) of the repository, so staging, production and a
rollback run the same tested image instead of a build on each host. The decision is
[ADR-67](adrs/67-projects-publish-their-own-multi-arch-image.md).

| Event | Tags on `ghcr.io/<owner>/<repo>` |
| --- | --- |
| Push to `main` | `edge`, `sha-<short commit>` |
| Push of a tag `v1.2.3` | `1.2.3`, `1.2`, `latest` |
| "Run workflow" (`workflow_dispatch`) without a version | `edge` (on `main`), `sha-<short commit>` |
| "Run workflow" or `workflow_call` with `version: 1.2.3` | `1.2.3`, `1.2`, `latest` |

- The image name is the repository name in lower case (GHCR rejects upper case). Pull requests never publish.
- The workflow uses `GITHUB_TOKEN` only. Each platform image carries SBOM and provenance attestations
  (`sbom: true`, `provenance: mode=max`), and the multi-arch image gets a signed GitHub attestation, except in a
  private repository: GitHub signs attestations for private repositories only on Enterprise Cloud, so the step is
  skipped there.
- In the GatoJS repository, `release.yml` calls the workflow with the released version after semantic-release, because
  the release tag points at a `[skip ci]` commit and starts no workflow. `ghcr.io/webamigos/gatojs` is a demo image and
  the input of the egress check, not something a project deploys.

### Pulling the image on a host

A new package is listed under the repository's (or organization's) "Packages". If it is private, either make it
public in its "Package settings" ("Change visibility"), or log the host in with a token that can read it: a personal
access token (classic) with the `read:packages` scope.

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github user> --password-stdin
```

### Deploying a published image in the self-hosted stack

`migrate` and `app` use `image: ${APP_IMAGE:-wa-app:local}`. Pin a version in `.env.selfhost` (the commented
`APP_IMAGE` line in `.env.selfhost.example`) and start without building:

```bash
# .env.selfhost
APP_IMAGE=ghcr.io/<owner>/<repo>:1.2.3
```

```bash
dc pull migrate app
dc up -d --wait --no-build
```

`migrate` still runs `prisma migrate deploy` from the new image before `app` starts. The server needs the project
checkout only for the Compose file and `.env.selfhost`; the `tools` profile (`admin:create`) still builds from it.
Pin an exact version (`1.2.3`), not `latest` or `edge`, so a restart never changes the code.

- **Upgrade:** back up ([Back up](#back-up)), change `APP_IMAGE` to the new version, then the two commands above.
- **Rollback:** set `APP_IMAGE` back to the previous version. Migrations only go forward: when the newer version
  migrated the database, restore the backup taken before the upgrade ([Restore](#restore)) together with the old
  version.

### Checking an image

```bash
docker buildx imagetools inspect ghcr.io/<owner>/<repo>:1.2.3
gh attestation verify oci://ghcr.io/<owner>/<repo>:1.2.3 --owner <owner>
```

The first lists `linux/amd64` and `linux/arm64`; the second checks the signed provenance (public repositories).

## Railway

Railway's "Config as Code" (`railway.json`, `railway.toml`) is deprecated: according to its documentation (fetched
2026-11-26) new services cannot use it, and existing files stop being read on 2026-12-01. A project therefore enters
the deployment settings in the Railway dashboard ([ADR-67](adrs/67-projects-publish-their-own-multi-arch-image.md)).
`railway.toml` stays in the repository only as a record of the values. Nothing in this section was deployed (not
verified); the Polish runbook [10-wdrozenie.md](10-wdrozenie.md#pierwsze-wdrozenie) has more detail on the
migration log and on accounts.

### Service settings

| Setting | Value |
| --- | --- |
| Pre-deploy command | `node_modules/.bin/prisma migrate deploy` |
| Healthcheck path | `/api/healthcheck` |
| Restart policy | On failure, at most 3 retries |
| Start command | empty (the image runs `node server.js`) |
| Config file path | empty; a path to `railway.json`/`railway.toml` can make Railway reject the deployment |

The pre-deploy command applies the committed migrations ([Requirements](#requirements)); without it the database
gets no tables.

### (a) Build from the repository (default)

1. Create a project with a PostgreSQL database service and a service connected to the GitHub repository. Railway
   builds the `Dockerfile` on every push to the connected branch.
2. Enter the [service settings](#service-settings) above.
3. Set the [variables](#variables).

### (b) Deploy the published image

1. Create the service from a Docker image: `ghcr.io/<owner>/<repo>:1.2.3`. For a private package, add registry
   credentials in the service's source settings (a GitHub user and a classic token with `read:packages`), or make the
   package public ([Pulling the image](#pulling-the-image-on-a-host)).
2. Enter the same [service settings](#service-settings) and [variables](#variables).
3. Deploy a new version by changing the image tag; roll back by setting the previous tag (with the database caveat
   from [Rollback](#deploying-a-published-image-in-the-self-hosted-stack)).

### Variables

- `DATABASE_URL`: a reference to the database service, `${{Postgres.DATABASE_URL}}`.
- `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `APP_URL` (the `https://` domain from the service's networking
  settings).
- Mail: `EMAIL_FROM` plus `SMTP_HOST` (and its port, user and password) or `RESEND_API_KEY`, or `MAIL_PROVIDER=console`
  ([Mail](#mail)).
- Files (`uploads`): a Railway volume mounted at `/app/volumes/uploads` with `STORAGE_PROVIDER=local` and
  `STORAGE_LOCAL_PATH=/app/volumes/uploads` (one replica only), or `STORAGE_PROVIDER=s3` with a preset from the
  [preset table](15-modul-uploads.md#presety-s3) for more replicas.
- Module secrets such as `API_KEY_PEPPER` and `ENCRYPTION_MASTER_KEY`, generated as in [Install](#1-write-the-environment).

### First administrator

From a checkout of the project, with the Railway CLI linked to the service. `railway run` runs the script on your
machine with the service's variables, so it needs the database's public address:

```bash
railway run sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run admin:create -- --email admin@example.com'
```

`DATABASE_PUBLIC_URL` must be a variable of the app service (a reference to `${{Postgres.DATABASE_PUBLIC_URL}}`).

## Prove nothing leaves the machine

Not built yet: self-hosting Task 7 adds an egress check that runs this stack on a network without internet access and
fails if any container tries to leave it. This section will hold its command.
