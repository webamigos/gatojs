# Self-hosting without external services: mail providers, storage providers, a self-contained stack

Date: 2026-11-22. Drafted by Patryk with an agent. Draft for review (CodeRabbit and Patryk); a plan follows acceptance.

Sources:

- Ragen: `packages/env/src/provider-seams.ts` (`MAIL_SEAM`, `STORAGE_SEAM`), `packages/storage`, `docs/appliance-runbook.md` (install, "prove nothing leaves the machine", backup, restore), `infra/appliance/` (egress check), `docker-compose.fullapp.yml` / `docker-compose.appliance.yml`, the architecture tests `third-party-telemetry-stays-off`, `fonts-are-not-fetched-at-build`, `analytics-ids-are-not-hardcoded`, `every-image-is-published-for-both-architectures`, and the lesson `a-build-that-fetches-fonts-fails-on-googles-answer`;
- the kit: `src/shared/lib/mailer.ts`, `src/shared/lib/env.ts` (production requires `RESEND_API_KEY`), `src/app/layout.tsx` (`next/font/google`), `Dockerfile`, `docker-compose.yml`, `kit/modules/uploads.json` (`STORAGE_PROVIDER` `local` | `s3`, D49), `docs/10-wdrozenie.md` (Railway first, "own server" section);
- specs `2026-11-22-packages-design.md` (PR #58: `@gatojs/env` with `requiredForProvider`) and `2026-11-21-gato-cli-design.md` (the wizard asks for providers).

## 1. Why

GatoJS should run for a company that does not want, or is not allowed, to send anything to an outside service: an on-premises server, a private cloud, an air-gapped network. Today three things stand in the way:

1. **Mail:** production requires `RESEND_API_KEY` (a refine in `src/shared/lib/env.ts`). `SMTP_URL` works, but only outside production, so a company with its own mail relay cannot deploy without a Resend account.
2. **The build reaches the internet:** `src/app/layout.tsx` loads Inter through `next/font/google`, which downloads the font during `next build`. An offline build fails, and Ragen saw the same import fail on two of three `main` builds because of Google's answer.
3. **No documented self-contained stack:** deployment docs assume Railway. There is no compose file that runs the app itself next to its database and storage, no runbook for backup and restore, and no way to prove that nothing leaves the machine.

Storage is already in good shape: `uploads` defaults to local disk and supports any S3-compatible endpoint (D49, ported from Ragen). This spec only rounds it off.

## 2. Mail providers

Following Ragen's `MAIL_SEAM`:

- `MAIL_PROVIDER` = `smtp` | `resend` | `console`.
- **Unset** detects from credentials: `SMTP_HOST` (or the existing `SMTP_URL`) selects SMTP, `RESEND_API_KEY` selects Resend; with both, SMTP wins (as today). With neither: outside production the message is logged (`console`), and **in production the app refuses to start**, unless `MAIL_PROVIDER=console` says so explicitly. An operator never silently loses every invitation.
- **SMTP** variables: `SMTP_HOST` (required for the variant), `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS` (authentication only when `SMTP_USER` is set, because unauthenticated internal relays exist), `SMTP_SECURE`. `SMTP_URL` stays supported as one-variable shorthand for the same settings, so mailpit in dev and e2e keep working unchanged.
- **Production rule** changes from "`RESEND_API_KEY` is required" to "a mail provider is configured or `console` is explicit" (`requiredForProvider` from `@gatojs/env`, or the same rule inline until #58 lands).
- `EMAIL_FROM` stays required.
- Tests: provider selection table (unset with each credential set, both, neither in dev and in production, explicit `console`), SMTP auth on and off, and the startup report for a production config without a provider.

Out of scope: more HTTP providers (Postmark, SES API, SendGrid). Any of them is reachable through SMTP; a new variant is a small follow-up when a project needs it.

## 3. Storage providers

`uploads` already has `local` (default) and `s3` (any S3-compatible endpoint). Changes:

- **Documented presets** for S3-compatible stores, verified one by one with the integration tests where possible: AWS S3, Cloudflare R2, Scaleway Object Storage, Backblaze B2, MinIO and RustFS (self-hosted). Each preset lists `S3_ENDPOINT`, `S3_REGION` and `S3_FORCE_PATH_STYLE`.
- **A self-hosted object store in compose:** the existing `s3` profile (MinIO) stays for development; the self-hosted stack (section 4) offers it as an option for installs that need several app instances (local disk works only with one instance, D49).
- **`S3_SESSION_TOKEN`** optional, as in Ragen, for temporary credentials.
- `S3_ENDPOINT` validated with `httpUrl()` from `@gatojs/env` (#58), so a scheme-less endpoint fails at startup instead of at the first upload.

Out of scope: native Azure Blob or Google Cloud Storage providers (both have S3-compatible gateways or interop modes; a native provider can follow behind the same `ObjectStorage` interface).

## 4. A self-contained stack

### 4.1 Nothing is fetched at build or at runtime unless configured

- **Fonts:** keep Inter, self-hosted as in Ragen (`apps/web/src/app/fonts/fonts.ts`): the variable-weight `inter-latin-wght-normal.woff2` and `inter-latin-ext-wght-normal.woff2` files in `src/app/fonts/`, loaded with `next/font/local` (latin-ext covers Polish). Following Ragen's lesson, `adjustFontFallback` is off on all subsets but the last, so the metric-matched fallback does not answer Polish glyphs before latin-ext loads. Inter is under the SIL Open Font License, which allows self-hosting; its license file ships next to the fonts. An architecture test forbids `next/font/google` (Ragen's `fonts-are-not-fetched-at-build`).
- **Telemetry:** `NEXT_TELEMETRY_DISABLED=1` stays in both Docker stages; an architecture test keeps it there and forbids third-party analytics SDKs and hard-coded analytics ids in core files (Ragen's `third-party-telemetry-stays-off`, `analytics-ids-are-not-hardcoded`).
- **Outbound calls only to configured endpoints:** mail (SMTP or Resend), storage (S3 endpoint), OpenTelemetry (`OTEL_EXPORTER_OTLP_ENDPOINT`). Nothing else at runtime.

### 4.2 Compose for the whole application

- A `docker-compose.selfhost.yml` (core file, so every project gets it) that runs the app image built from the project's `Dockerfile`, PostgreSQL with a named volume, a migration step (`prisma migrate deploy`) before the app starts, the uploads volume for `STORAGE_PROVIDER=local`, and an optional MinIO profile (`s3`).
- **No mail relay in the stack**, as in Ragen's appliance (`appliance.env.example`: "point SMTP at the organization's own relay; never set RESEND_API_KEY"). A relay that delivers to the internet is itself an external dependency, and every company that self-hosts already runs one. `.env.selfhost.example` has `MAIL_PROVIDER=smtp` with `SMTP_HOST`/`SMTP_PORT` commented out for the organization's relay, and the runbook explains `MAIL_PROVIDER=console` for installs that send no mail. mailpit stays a development and e2e service only.
- The app's healthcheck (`/api/healthcheck`) gates the compose `depends_on`.
- `.env.selfhost.example` with every variable a self-hosted install needs and the secrets the wizard generates (gato spec §7).

### 4.3 Proving nothing leaves the machine

- An egress check (Ragen's `infra/appliance/egress-check`, `scripts/appliance-egress-check.mts`): runs the stack on a Docker network without internet access, signs in, sends an invitation through the local relay, uploads and downloads a file, and fails if any container attempted a connection outside the network. A kit-only CI job runs it for the self-hosted stack.

### 4.4 Operations runbook

`docs/self-hosting.md` (English, kit docs): requirements, install, first admin (`admin:create`), TLS with a reverse proxy (Caddy or nginx examples), backup (PostgreSQL `pg_dump` plus the uploads volume or bucket), restore on a new machine, upgrade (new kit version, `migrate deploy`), and the egress check. Modelled on Ragen's `appliance-runbook.md`.

### 4.5 Kubernetes (Helm)

As in Ragen (`deploy/helm/ragen`, `deploy/terraform`, the `helm.yml` workflow that runs only when `deploy/**` changes), a Helm chart `deploy/helm/gatojs` is part of the core in a later step, after Compose: a Deployment for the app with the healthcheck as readiness and liveness probe, a Job for `prisma migrate deploy`, a Service, an optional Ingress, a PersistentVolumeClaim for `STORAGE_PROVIDER=local` (one replica) and values for an external PostgreSQL, SMTP and S3. The chart's name and image come from the project's placeholders. A `helm.yml` workflow runs `helm lint` and `helm template` when `deploy/**` changes. Terraform is out of scope.

### 4.6 Images

The kit does not publish a GatoJS image: every project builds its own from its `Dockerfile`. The `Dockerfile` keeps building for both `linux/amd64` and `linux/arm64` (checked in the kit's CI with `docker buildx`), because self-hosted servers include ARM machines.

## 5. Wizard integration

`create-gato-app` (gato spec §7) asks for:

- the mail provider (`smtp` with host and credentials, `resend` with a key, or `console`),
- the storage provider (`local`, `s3` with a preset, or the self-hosted MinIO profile),
- whether to generate `docker-compose.selfhost.yml`-ready settings (`.env.selfhost`).

## 6. Order of work

1. Mail providers (section 2), core change with tests.
2. Self-hosted fonts and the telemetry/fonts architecture tests (4.1).
3. Storage presets, `S3_SESSION_TOKEN`, `httpUrl` (section 3; after #58's `@gatojs/env`, or inline first).
4. `docker-compose.selfhost.yml`, `.env.selfhost.example`, runbook (4.2, 4.4).
5. Egress check and its CI job (4.3), multi-arch build check (4.6).
6. Helm chart and its `helm.yml` workflow (4.5).
7. Wizard questions (section 5), with `create-gato-app`.

Each step is a PR with the usual process; steps 1–3 change core or module code and go through the test-writer and mutation review.

## 7. Decisions to record

- ADR: production mail requires a configured provider or an explicit `console`, not Resend specifically (replaces the production rule in D48's consequences).
- ADR: at runtime the app makes no outbound calls except to configured endpoints (enforced by the egress check); the build fetches only npm packages and base images, nothing else such as fonts (enforced by architecture tests).

## 8. Decisions (Patryk, 2026-11-22: follow Ragen where possible)

1. **Mail relay:** none in the stack; self-hosted installs use the organization's own relay or `console` (section 4.2), as in Ragen's appliance.
2. **Font:** Inter, self-hosted with `next/font/local`, latin and latin-ext, as in Ragen (section 4.1).
3. **Helm:** yes, as in Ragen, as a later step after Compose (section 4.5).
4. **Offline build:** not covered, as in Ragen. The egress check covers runtime only. An install needs the internet once (npm packages and base images, or pulling a built image); a fully offline install bundle (images as a tarball, checksums, migrations) is a later step, as Ragen's planned offline bundle (appliance runbook, step C2).
