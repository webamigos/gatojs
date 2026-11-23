# Self-hosting without external services: mail providers, storage providers, a self-contained stack

Date: 2026-11-22, refreshed on 2026-11-23 against `main` at `e32ebab` (GatoJS 0.7.0, `@gatojs/env` from PR #74). Drafted by Patryk with an agent. Draft for review; a plan follows acceptance.

Sources:

- Ragen: `packages/env/src/provider-seams.ts` (`MAIL_SEAM`, `STORAGE_SEAM`), `packages/storage`, `docs/appliance-runbook.md` (install, "prove nothing leaves the machine", backup, restore), `infra/appliance/` (egress check), `docker-compose.fullapp.yml` / `docker-compose.appliance.yml`, the architecture tests `third-party-telemetry-stays-off`, `fonts-are-not-fetched-at-build`, `analytics-ids-are-not-hardcoded`, `every-image-is-published-for-both-architectures`, and the lesson `a-build-that-fetches-fonts-fails-on-googles-answer`;
- GatoJS: `src/shared/lib/mailer.ts`, `packages/env/src/core-env-schema.ts` (`coreEnvSchema` in `@gatojs/env`; production requires `RESEND_API_KEY`, D17), `packages/env/src/rules.ts` (`requiredForProvider`, `allOrNone`), `packages/env/src/fragments.ts` (`httpUrl`), `src/app/layout.tsx` (`next/font/google`), `Dockerfile`, `docker-compose.yml`, `docker/uploads.compose.yml` (MinIO under the `s3` profile), `kit/modules/uploads.json` and `src/features/uploads/services/storage-env.ts` (`STORAGE_PROVIDER` `local` | `s3`, D49), `docs/10-wdrozenie.md` (Railway first, "own server" section);
- [ADR-56](../../adrs/56-workspace-packages-replace-d29.md) (project packages in `packages/`), spec `2026-11-22-packages-design.md` and spec `2026-11-21-gato-cli-design.md` §7 (the `create-gato-app` wizard).

## 1. Why

GatoJS should run for a company that does not want, or is not allowed, to send anything to an outside service: an on-premises server, a private cloud, an air-gapped network. Today three things stand in the way:

1. **Mail:** production requires `RESEND_API_KEY` (the production refine in `coreEnvSchema`, `packages/env/src/core-env-schema.ts`; D17, D18). `SMTP_URL` works and wins over Resend even in production, but the refine still demands a Resend key, so a company with its own mail relay cannot deploy without a Resend account.
2. **The build reaches the internet:** `src/app/layout.tsx` loads Inter through `next/font/google` (subset `latin` only, so Polish letters fall back to a system font), which downloads the font during `next build`. An offline build fails, and Ragen saw the same import fail on two of three `main` builds because of Google's answer.
3. **No documented self-contained stack:** deployment docs assume Railway. There is no compose file that runs the app itself next to its database and storage, no runbook for backup and restore, and no way to prove that nothing leaves the machine.

Storage is already in good shape: `uploads` defaults to local disk, supports any S3-compatible endpoint (D49, ported from Ragen) and since PR #74 validates `S3_ENDPOINT` with `httpUrl()` at startup. This spec only rounds it off.

## 2. Mail providers

Following Ragen's `MAIL_SEAM`:

- `MAIL_PROVIDER` = `smtp` | `resend` | `console`, added to `coreEnvSchema` (trimmed, lower-cased, then an enum) and to the core part of `.env.example`.
- **Unset** detects from credentials: `SMTP_HOST` (or the existing `SMTP_URL`) selects SMTP, `RESEND_API_KEY` selects Resend; with both, SMTP wins (as today). With neither: outside production the message is logged (`console`), and **in production the app refuses to start**, unless `MAIL_PROVIDER=console` says so explicitly. An operator never silently loses every invitation.
- **SMTP** variables: `SMTP_HOST` (required for the variant), `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS` (authentication only when `SMTP_USER` is set, because unauthenticated internal relays exist; `allOrNone(["SMTP_USER", "SMTP_PASS"])`), `SMTP_SECURE` (`flag()`). `SMTP_URL` stays supported as one-variable shorthand for the same settings, so mailpit in dev and e2e keep working unchanged. Setting both `SMTP_URL` and `SMTP_HOST` is decision 1.
- **Production rule** changes from "`RESEND_API_KEY` is required" to "a mail provider is configured or `console` is explicit". `@gatojs/env` covers the explicit variants: `requiredForProvider("MAIL_PROVIDER", "resend", ["RESEND_API_KEY"])`; `smtp` needs `SMTP_HOST` or `SMTP_URL`, which `requiredForProvider` (all names required) cannot express, so it is a small rule next to it. The unset case in production is a refine in `coreEnvSchema` that replaces today's `RESEND_API_KEY` refine. New messages are English (spec `2026-11-22-english-first-design.md`); the existing Polish env messages change in that migration, not here.
- `EMAIL_FROM` stays required.
- The change touches `packages/env` and `src/shared/lib/mailer.ts`, both owned by `core`: a minor bump of `kit/modules/core.json`.
- Tests: provider selection table (unset with each credential set, both, neither in dev and in production, explicit `console`), SMTP auth on and off, and the startup report for a production config without a provider. The current `RESEND_API_KEY` production test changes its expected message with the rule.

Out of scope: more HTTP providers (Postmark, SES API, SendGrid). Any of them is reachable through SMTP; a new variant is a small follow-up when a project needs it.

## 3. Storage providers

`uploads` already has `local` (default) and `s3` (any S3-compatible endpoint), and `S3_ENDPOINT` already goes through `httpUrl()` (PR #74). Changes:

- **Documented presets** for S3-compatible stores, verified one by one with the integration tests where possible: AWS S3, Cloudflare R2, Scaleway Object Storage, Backblaze B2, MinIO and RustFS (self-hosted). Each preset lists `S3_ENDPOINT`, `S3_REGION` and `S3_FORCE_PATH_STYLE`.
- **A self-hosted object store in compose:** the existing `s3` profile (MinIO in `docker/uploads.compose.yml`) stays for development; the self-hosted stack (section 4) offers it as an option for installs that need several app instances (local disk works only with one instance, D49).
- **`S3_SESSION_TOKEN`** optional, as in Ragen, for temporary credentials: `envSchema` of `uploads`, the manifest's `env` list and the S3 client. Minor bump of `kit/modules/uploads.json`.

Out of scope: native Azure Blob or Google Cloud Storage providers (both have S3-compatible gateways or interop modes; a native provider can follow behind the same `ObjectStorage` interface).

## 4. A self-contained stack

### 4.1 Nothing is fetched at build or at runtime unless configured

- **Fonts:** keep Inter, self-hosted as in Ragen (`apps/web/src/app/fonts/fonts.ts`): the variable-weight `inter-latin-wght-normal.woff2` and `inter-latin-ext-wght-normal.woff2` files in `src/app/fonts/`, loaded with `next/font/local` (latin-ext covers Polish, which the current `latin`-only subset does not). Following Ragen's lesson, `adjustFontFallback` is off on all subsets but the last, so the metric-matched fallback does not answer Polish glyphs before latin-ext loads. Inter is under the SIL Open Font License, which allows self-hosting; its license file ships next to the fonts. An architecture test in `src/__tests__/architecture/` forbids `next/font/google` (Ragen's `fonts-are-not-fetched-at-build`).
- **Telemetry:** `NEXT_TELEMETRY_DISABLED=1` stays in the `builder` and `runner` stages of the `Dockerfile` (both have it today); an architecture test keeps it there and forbids third-party analytics SDKs and hard-coded analytics ids in core files (Ragen's `third-party-telemetry-stays-off`, `analytics-ids-are-not-hardcoded`).
- **Outbound calls only to configured endpoints:** mail (SMTP or Resend), storage (S3 endpoint), OpenTelemetry (`OTEL_EXPORTER_OTLP_ENDPOINT`). Nothing else at runtime.

### 4.2 Compose for the whole application

- A `docker-compose.selfhost.yml`, owned by `core` (listed in `kit/modules/core.json` `files`, so every project gets it; decision 4), that runs the app image built from the project's `Dockerfile` (including its `wa:workspaces` region, ADR-56), PostgreSQL with a named volume, a migration step (`prisma migrate deploy`) before the app starts, the uploads volume for `STORAGE_PROVIDER=local`, and an optional MinIO profile (`s3`).
- **No mail relay in the stack**, as in Ragen's appliance (`appliance.env.example`: "point SMTP at the organization's own relay; never set RESEND_API_KEY"). A relay that delivers to the internet is itself an external dependency, and every company that self-hosts already runs one. `.env.selfhost.example` has `MAIL_PROVIDER=smtp` with `SMTP_HOST`/`SMTP_PORT` commented out for the organization's relay, and the runbook explains `MAIL_PROVIDER=console` for installs that send no mail. mailpit stays a development and e2e service only.
- The app's healthcheck (`/api/healthcheck`, already used by `railway.toml`) gates the compose `depends_on`.
- `.env.selfhost.example` with every variable a self-hosted install needs. Until the wizard generates secrets (section 5), the runbook gives the command for each one (`openssl rand -base64 32` for `BETTER_AUTH_SECRET`).

### 4.3 Proving nothing leaves the machine

- An egress check (Ragen's `infra/appliance/egress-check`, `scripts/appliance-egress-check.mts`): runs the stack on a Docker network without internet access, signs in, sends an invitation through a relay inside the network, uploads and downloads a file, and fails if any container attempted a connection outside the network. It runs in a GatoJS-repository workflow on the `kitOnly` list (never copied into projects); when it runs is decision 2.

### 4.4 Operations runbook

`docs/self-hosting.md` (English, GatoJS documentation; `docs/**` is `kitOnly`): requirements, install, first admin (`admin:create`), TLS with a reverse proxy (Caddy or nginx examples), backup (PostgreSQL `pg_dump` plus the uploads volume or bucket), restore on a new machine, upgrade (new GatoJS version with `wa update`, then `prisma migrate deploy`), and the egress check. Modelled on Ragen's `appliance-runbook.md`. `docs/10-wdrozenie.md` links it from its "own server" section.

### 4.5 Kubernetes (Helm)

As in Ragen (`deploy/helm/ragen`, `deploy/terraform`, the `helm.yml` workflow that runs only when `deploy/**` changes), a Helm chart `deploy/helm/gatojs` is part of the core in a later step, after Compose: a Deployment for the app with the healthcheck as readiness and liveness probe, a Job for `prisma migrate deploy`, a Service, an optional Ingress, a PersistentVolumeClaim for `STORAGE_PROVIDER=local` (one replica) and values for an external PostgreSQL, SMTP and S3. The chart's name and image come from the project's placeholders (`kit/kit.json` `placeholders`). A `helm.yml` workflow runs `helm lint` and `helm template` when `deploy/**` changes. Terraform is out of scope.

### 4.6 Images

GatoJS does not publish an application image: every project builds its own from its `Dockerfile`. Self-hosted servers include ARM machines, so the `Dockerfile` must build for both `linux/amd64` and `linux/arm64`. The base image (`node:22-alpine`) is multi-arch, but nothing checks the build today; step 5 adds a `docker buildx` build for both platforms to the GatoJS CI (Ragen's `every-image-is-published-for-both-architectures`, reduced to "builds" because nothing is published).

## 5. Wizard integration

`create-gato-app` 0.1.0 is published (PR #72), but it only resolves a version, downloads it and delegates to `gato-cli`'s `create`; it asks nothing yet. The interactive wizard of spec `2026-11-21-gato-cli-design.md` §7 is a follow-up. When it lands, its questions step (§7.3) also asks for:

- the mail provider (`smtp` with host and credentials, `resend` with a key, or `console`),
- the storage provider (`local`, `s3` with a preset, or the self-hosted MinIO profile),
- whether to write `.env.selfhost` for `docker-compose.selfhost.yml`, with the secrets the wizard generates (§7.5).

Until then the runbook and `.env.selfhost.example` cover the same choices by hand (decision 3).

## 6. Order of work

1. Mail providers (section 2), core change with tests.
2. Self-hosted fonts and the telemetry/fonts architecture tests (4.1).
3. Storage presets and `S3_SESSION_TOKEN` (section 3).
4. `docker-compose.selfhost.yml`, `.env.selfhost.example`, runbook (4.2, 4.4).
5. Egress check and its workflow (4.3), multi-arch build check (4.6).
6. Helm chart and its `helm.yml` workflow (4.5).
7. Wizard questions (section 5), as part of the `create-gato-app` wizard follow-up.

Steps 1–3 are independent and can run in parallel workers; step 4 needs 1 and 3; step 5 needs 4; step 6 needs 4. Each step is a PR with the usual process (test-writer → implementer with locked tests → test-reviewer); steps 1–3 change core or module code and go through the mutation review. If the English migration (spec `2026-11-22-english-first-design.md`) has renamed `docs/10-wdrozenie.md` by then, links follow the new name.

## 7. Decisions to record

ADR numbers are taken when the ADR is written (`docs/adrs/README.md`); ADR-57 is already reserved by the agent-workflow plan.

- ADR: production mail requires a configured provider or an explicit `console`, not Resend specifically (supersedes the production `RESEND_API_KEY` rule of D17 and the matching note in D18).
- ADR: at runtime the app makes no outbound calls except to configured endpoints (enforced by the egress check); the build fetches only npm packages and base images, nothing else such as fonts (enforced by architecture tests).

## 8. Decisions (Patryk, 2026-11-22: follow Ragen where possible)

1. **Mail relay:** none in the stack; self-hosted installs use the organization's own relay or `console` (section 4.2), as in Ragen's appliance.
2. **Font:** Inter, self-hosted with `next/font/local`, latin and latin-ext, as in Ragen (section 4.1).
3. **Helm:** yes, as in Ragen, as a later step after Compose (section 4.5).
4. **Offline build:** not covered, as in Ragen. The egress check covers runtime only. An install needs the internet once (npm packages and base images, or pulling a built image); a fully offline install bundle (images as a tarball, checksums, migrations) is a later step, as Ragen's planned offline bundle (appliance runbook, step C2).

## 9. Decisions (Patryk, 2026-11-23)

1. `SMTP_URL` and `SMTP_HOST` both set: **startup error** (one source of SMTP settings).
2. Egress check: **on pull requests that touch** `Dockerfile`, `docker-compose.selfhost.yml`, the mailer, `src/features/uploads/**`, `packages/env/**` or `package-lock.json`, plus manual `workflow_dispatch`.
3. Wizard (it exists since `create-gato-app` 0.2.0, with the storage question): **add the mail provider question** (`smtp` with host and credentials, `resend`, `console`) and a `--mail-provider` flag as part of step 1 (mail providers). Self-hosted settings (`.env.selfhost`) stay with `.env.selfhost.example` and the runbook.
4. `docker-compose.selfhost.yml` is **a core file**, next to `docker-compose.yml`, `Dockerfile` and `railway.toml`.
