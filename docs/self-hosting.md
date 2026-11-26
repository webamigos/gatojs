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
- [Back up](#back-up) and [restore](#restore): a set of the local volume, taken and restored into a fresh clone with
  new volumes, signs the administrator in and downloads the file with the same checksum (verified 2026-11-25). An
  earlier version of the scripts (restore by `dropdb` and `find … -delete`) ran on 2026-11-26 with the app image and
  the `s3` profile.
- The current scripts (the `trap`, the set checks, the scratch database and directories, the move-aside) ran as
  written on 2026-11-26 with `WITH_MINIO=yes`, on Docker Engine 24.0.2 with Compose v2.19.1, without `sudo` (Docker
  Desktop's bind mount belongs to the host user), and with **`app` and `migrate` replaced by `node:22-alpine`
  stand-ins** (an HTTP server answering the healthcheck, and `node -e 0`), because the app image build did not
  finish on the loaded machine. `db`, `minio` and `minio-init` were the real services. Each step was checked against
  a database row, a file in the `uploads` volume and an object in the MinIO bucket:
  - the backup exited 0 with `app` and `minio` running again; a backup made to fail at the MinIO copy exited 1, and
    the `trap` started `minio` and `app` again;
  - a restore from a set without `minio/` stopped at the checks with nothing changed and `app` still running;
  - a restore from a dump truncated to half its size stopped at `pg_restore` with the live row, file and object
    unchanged and an empty scratch database; a re-run then stopped on the `.env.selfhost.before-restore` it left;
  - a full restore brought back the row, the file (owned by UID 1001) and the object, kept the previous ones in
    `<name>_old`, `.restore-old` and `volumes/minio.before-restore`, and the clean-up block removed them;
  - after `down -v` and removing `volumes/` and `.env.selfhost`, the restore brought the stack back the same way.

  The app itself (sign-in, `migrate` on the restored database, downloading the file) was not run against the
  current scripts (not verified).

The TLS examples and the upgrade path have not been run (not verified).

| Section | State |
| --- | --- |
| [Requirements](#requirements) | written |
| [Install](#install) | written, verified 2026-11-25 |
| [First administrator](#first-administrator) | written, verified 2026-11-25 |
| [Mail](#mail) | written |
| [Files (`uploads`)](#files-uploads) | written, local volume and `s3` profile verified 2026-11-25 |
| [TLS](#tls) | written, examples not run |
| [Back up](#back-up) and [restore](#restore) | written; current scripts verified 2026-11-26 with stand-ins for `app` and `migrate` (MinIO path), the app on them not verified |
| [Upgrade](#upgrade) | written |
| [Kubernetes (Helm)](#kubernetes-helm) | written; chart lint, helm-unittest and kubeconform verified 2026-11-26, install on a cluster not verified |
| [Prove nothing leaves the machine](#prove-nothing-leaves-the-machine) | placeholder until the egress check (self-hosting Task 7) |

## What runs

| Service | Image | What it does |
| --- | --- | --- |
| `db` | `postgres:16` | The database, in the named volume `postgres-data`. No published port. |
| `migrate` | the app image (`build: .`) | `prisma migrate deploy` once per start, after `db` is healthy. |
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

The commands below shorten the Compose call to `dc`, a shell function (an alias works only in an interactive shell,
not in a backup script):

```bash
dc() { docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost "$@"; }
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
| `.env.selfhost` | the checkout; holds `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD` and the module secrets (`ENCRYPTION_MASTER_KEY`, `API_KEY_PEPPER`) |
| The project version | the commit of the checkout (`git rev-parse HEAD`) |

The scripts start with `set -eu`, which stops at the first failing command, and define `dc` as a shell function,
because aliases do not work in scripts. Set `WITH_MINIO=yes` when the stack runs MinIO (the `s3` profile); `dc` then
passes `--profile s3` to every command.

```bash
set -eu
WITH_MINIO=no
dc() {
  if [ "$WITH_MINIO" = yes ]; then set -- --profile s3 "$@"; fi
  docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost "$@"
}
B=/var/backups/app/$(date +%Y%m%d-%H%M)
mkdir -p "$B"

dc stop app
trap 'dc start app' EXIT
dc exec -T db sh -c 'pg_dump -U postgres -d "$POSTGRES_DB" -Fc' > "$B/postgres.dump"
dc run --rm --no-deps -T --user root --entrypoint tar app -C /app/volumes/uploads -cf - . > "$B/uploads.tar"
if [ "$WITH_MINIO" = yes ]; then
  dc stop minio
  trap 'dc start minio app' EXIT
  sudo cp -a volumes/minio "$B/minio"
fi
cp .env.selfhost "$B/"
git rev-parse HEAD > "$B/commit"
```

The `trap` starts `app` (and `minio`) again when the script ends, also when a step fails, so a failed backup never
leaves the app offline. MinIO is copied in the same window as the database, so the files and the database come from
the same moment. MinIO runs as root, so its files belong to root and need `sudo`.

`$POSTGRES_DB` is expanded inside the `db` container, where it holds the database name the Compose file sets (the
project's name, such as `my_app`). `tar` runs in the app image (BusyBox `tar` in `node:22-alpine`), so nothing else is
needed on the host.

With an external S3 store, use the store's own versioning or replication.

`$B` holds the secrets next to the data. Keep the backup target as protected as the server.

## Restore

Restore onto the same project commit the set was taken from. A newer commit is an upgrade: `migrate` brings the
schema forward. An older one is not supported. On a new machine, first clone the project at the commit in
`$B/commit`.

The restore deletes nothing that is live until the set has been restored next to it. It checks the set first,
restores the database into a scratch database and the files into a scratch directory, and only then swaps them in.
What was live before is kept aside (the database `<name>_old`, the directory `.restore-old` in the `uploads` volume,
`volumes/minio.before-restore`, `.env.selfhost.before-restore`) until you remove it after checking the app.

```bash
set -eu
WITH_MINIO=no
dc() {
  if [ "$WITH_MINIO" = yes ]; then set -- --profile s3 "$@"; fi
  docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost "$@"
}
B=/var/backups/app/<set>

test -s "$B/postgres.dump"
test -s "$B/.env.selfhost"
tar -tf "$B/uploads.tar" > /dev/null
test ! -e .env.selfhost.before-restore
if [ "$WITH_MINIO" = yes ]; then
  sudo test -d "$B/minio"
  test -n "$(sudo ls -A "$B/minio")"
  test ! -e volumes/minio.before-restore
fi

if [ -f .env.selfhost ]; then cp .env.selfhost .env.selfhost.before-restore; fi
cp "$B/.env.selfhost" .
dc stop app
dc up -d --wait db

dc exec -T db sh -c 'dropdb -U postgres --if-exists "${POSTGRES_DB}_restore" && createdb -U postgres "${POSTGRES_DB}_restore"'
dc exec -T db sh -c 'pg_restore -U postgres -d "${POSTGRES_DB}_restore" --no-owner --single-transaction --exit-on-error' < "$B/postgres.dump"
dc run --rm --no-deps -T --user root --entrypoint sh app -c \
  'cd /app/volumes/uploads && rm -rf .restore-new && mkdir .restore-new && tar -C .restore-new -xf -' < "$B/uploads.tar"
if [ "$WITH_MINIO" = yes ]; then
  sudo rm -rf volumes/minio.restore-new
  mkdir -p volumes
  sudo cp -a "$B/minio" volumes/minio.restore-new
fi

dc exec -T db sh -c 'psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction \
  -c "ALTER DATABASE $POSTGRES_DB RENAME TO ${POSTGRES_DB}_old" \
  -c "ALTER DATABASE ${POSTGRES_DB}_restore RENAME TO $POSTGRES_DB"'
dc run --rm --no-deps -T --user root --entrypoint sh app -c \
  'cd /app/volumes/uploads && mkdir .restore-old &&
   find . -mindepth 1 -maxdepth 1 ! -name .restore-new ! -name .restore-old -exec mv {} .restore-old/ \; &&
   find .restore-new -mindepth 1 -maxdepth 1 -exec mv {} . \; &&
   rmdir .restore-new && chown -R 1001:1001 /app/volumes/uploads'
if [ "$WITH_MINIO" = yes ]; then
  dc stop minio minio-init
  if [ -e volumes/minio ]; then sudo mv volumes/minio volumes/minio.before-restore; fi
  sudo mv volumes/minio.restore-new volumes/minio
fi

dc up -d --build --wait
```

- The checks stop the script before anything changes when a part of the set is missing or empty: the dump,
  the environment, an `uploads.tar` that `tar` cannot list, or (`WITH_MINIO=yes`) a missing or empty `$B/minio`.
- `pg_restore --single-transaction --exit-on-error` restores the whole dump or nothing, into `<name>_restore`; a broken
  dump stops the script with the live database untouched. The two renames run in one transaction and fail while
  anything is still connected to the database, which is why `app` is stopped first.
- `.restore-new` and `<name>_restore` are scratch copies that a new run replaces. `.restore-old`, `<name>_old` and
  `volumes/minio.before-restore` and `.env.selfhost.before-restore` hold the live data from before a restore; when one
  is left from a run that stopped, the next run stops rather than overwrite it (`mkdir`, `ALTER DATABASE` and
  `test ! -e` fail). Look at it, put it back
  or remove it, then run again.
- `chown` gives the files to the `nextjs` user (UID 1001) the app runs as. The `uploads` volume is created by the
  first run when it is new.
- `POSTGRES_PASSWORD` comes from the saved `.env.selfhost`; a new `postgres-data` volume is initialised with it.
- With an external S3 store, restore the bucket with the store's own tools to the moment of the database dump before
  the last `dc up`.

If a step fails, `app` stays stopped and the live data is where it was or set aside as above: fix the cause and run
the restore again from the start.

When the app is up, sign in and open a file uploaded before the backup. Then remove what the restore set aside:

```bash
dc exec -T db sh -c 'dropdb -U postgres "${POSTGRES_DB}_old"'
dc exec -T --user root app rm -rf /app/volumes/uploads/.restore-old
if [ "$WITH_MINIO" = yes ]; then sudo rm -rf volumes/minio.before-restore; fi
rm -f .env.selfhost.before-restore
```

Run it in the same shell as the restore, or define `dc` and `WITH_MINIO` again first.

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

## Kubernetes (Helm)

The chart in `deploy/helm/gatojs` runs the same image on a cluster: a Deployment of the app, a Service on port 3000,
an optional Ingress, a PersistentVolumeClaim for uploads with local storage, and a Job that runs
`prisma migrate deploy` as a `pre-install,pre-upgrade` hook. The chart is named after the project; its values are
listed in `deploy/helm/gatojs/README.md`. PostgreSQL is not in the chart: use a managed database or one the cluster
already runs.

### 1. Build and push the image

The cluster pulls the image from a registry it can reach:

```bash
docker build -t registry.example.com/my-app:1.0.0 .
docker push registry.example.com/my-app:1.0.0
```

Build on the architecture of the nodes, or build both with `docker buildx build --platform linux/amd64,linux/arm64`.
A private registry needs a pull secret (`kubectl create secret docker-registry`) named in `image.pullSecrets`.

### 2. Create the Secret

Everything secret goes into one Secret that you create; the chart only reads it (`existingSecret`), so a
`helm upgrade` never rotates it. Generate the values with the commands in [Install](#install):

```bash
kubectl create namespace my-app
kubectl -n my-app create secret generic my-app-env \
  --from-literal=DATABASE_URL='postgresql://app:<password>@db.example.internal:5432/my_app' \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=SMTP_HOST=relay.example.internal
```

Add the mail credentials (`SMTP_USER` and `SMTP_PASS`, or `RESEND_API_KEY`) and the module secrets the project uses
(`API_KEY_PEPPER`, `ENCRYPTION_MASTER_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). Keep a copy of the Secret with
your backups: losing `ENCRYPTION_MASTER_KEY` loses every encrypted value.

### 3. Install

Non-secret variables go in `env`, with the same names as in `.env.selfhost.example`. A values file keeps them in one
place:

```yaml
# my-app.values.yaml
image:
  repository: registry.example.com/my-app
  tag: "1.0.0"
existingSecret: my-app-env
env:
  APP_URL: https://app.example.com
  EMAIL_FROM: "My App <noreply@example.com>"
  MAIL_PROVIDER: smtp
  AUTH_PUBLIC_SIGNUP: "false"
  MULTI_ORG: "false"
  LOG_LEVEL: info
ingress:
  enabled: true
  className: nginx
  host: app.example.com
  tls:
    - secretName: app-example-com-tls
      hosts: [app.example.com]
```

```bash
helm install my-app deploy/helm/gatojs -n my-app -f my-app.values.yaml --wait
```

The migrate Job runs first; the Deployment is created only when it succeeds. A failed Job stays in the namespace
(`kubectl -n my-app logs job/my-app-migrate`) and the release is marked failed.

Storage:

- `storage.provider: local` (default): uploads on a `ReadWriteOnce` PVC at `/app/volumes/uploads`, one replica, and the
  Deployment uses the `Recreate` strategy, so an upgrade has a short gap. The chart refuses `replicaCount` above 1.
  Helm keeps the PVC after `helm uninstall`.
- `storage.provider: s3`: no PVC, any `replicaCount`, rolling updates. Set `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`
  and `S3_FORCE_PATH_STYLE` in `env` (the [preset table](15-modul-uploads.md#presety-s3)) and the keys in the Secret.

The chart sets `STORAGE_PROVIDER` and `STORAGE_LOCAL_PATH` itself; do not put them in `env`. The pod runs as UID 1001
(the `nextjs` user of the image), and `fsGroup: 1001` makes the PVC writable for it.

### 4. First administrator

The app image cannot run `admin:create` (no `tsx`, no `scripts/`). Run it from a checkout of the same commit with
`DATABASE_URL` pointing at the cluster's database, through `kubectl port-forward` when the database runs in the
cluster:

```bash
DATABASE_URL='postgresql://app:<password>@127.0.0.1:5432/my_app' npm run admin:create -- --email admin@example.com
```

### 5. Upgrade

1. Back up the database and, with local storage, the PVC (or rely on the bucket's own versioning with `s3`).
2. Update the project in a development checkout as in [Upgrade](#upgrade) steps 2 and 3, and add new variables to the
   values file or the Secret.
3. Build and push the new image with a new tag, then:

   ```bash
   helm upgrade my-app deploy/helm/gatojs -n my-app -f my-app.values.yaml --set image.tag=1.1.0 --wait
   ```

   The migrate Job runs with the new image before the Deployment changes. If it fails, the old pods keep serving
   the old code on the migrated part of the schema: read the Job's log, do not run `prisma migrate reset`, and
   restore the backup if the database is half-migrated. `helm rollback` rolls the Deployment back but not the
   database.

The chart is checked in CI by `.github/workflows/helm.yml`: `helm lint`, the helm-unittest cases in
`deploy/helm/gatojs/tests/`, and `kubeconform` on three renders (defaults, `s3` with two replicas, Ingress on).
Rendering and validation were verified 2026-11-26 with Helm 4.2.4, helm-unittest 1.2.1 and kubeconform 0.8.0
against Kubernetes 1.31; an install on a live cluster has not been run (not verified).

## Prove nothing leaves the machine

Not built yet: self-hosting Task 7 adds an egress check that runs this stack on a network without internet access and
fails if any container tries to leave it. This section will hold its command.
