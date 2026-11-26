# ADR-67: Projects publish their own multi-arch image to GHCR, and Railway is configured in the dashboard

**Status:** Accepted
**Date:** 2026-11-26
**Decided by:** Patryk (self-hosting plan, Task 10, added 2026-11-24); the Railway part by the coordinator on
2026-11-26, written up by an agent

## Context

Every host built the app image from source on each deployment: `docker compose up --build` on a self-hosted server,
Railway from the repository. Staging and production then ran images that were built separately, and a rollback meant a
rebuild of an older commit. A project should build one image, test it, and deploy that same image everywhere, with a
tag to roll back to.

GatoJS itself is a framework, not an application a client deploys. Its own image is a demo and the input of the egress
check (self-hosting Task 7). The workflow that publishes it is the same file a project gets.

The plan also shipped a `railway.json` (Railway "Config as Code") to every project. Railway's documentation, fetched on
2026-11-26, deprecates that format:

- <https://docs.railway.com/reference/config-as-code>: "Config as Code is deprecated. Prefer Infrastructure as Code.
  Existing files keep working for legacy services until 2026-12-01".
- <https://docs.railway.com/infrastructure-as-code>: "New services cannot opt into Config as Code. Existing Config as
  Code files stop being read on 2026-12-01 (hard cutoff)." The replacement is `.railway/railway.ts`, applied with
  `railway config plan` and `railway config apply`.

The field names in the plan (`build.builder`, `deploy.preDeployCommand`, `deploy.healthcheckPath`,
`deploy.restartPolicyType`) match <https://railway.com/railway.schema.json> on the same date. The format itself is what
is going away. Every service a GatoJS project creates on Railway is new, so a `railway.json` would never be read.

## Decision

- `.github/workflows/docker-publish.yml` is a core file (`kit/modules/core.json` `files`), so every project gets it. It
  names the image `ghcr.io/<owner>/<repo>` after `github.repository`, lowercased in a step, because GHCR rejects upper
  case and `github.repository` keeps the owner's case.
- Triggers: a push to `main` publishes `edge` and `sha-<short>`; a pushed `v*` tag publishes `X.Y.Z`, `X.Y` and
  `latest`; `workflow_dispatch` and `workflow_call` take an optional `version` (and, for `workflow_call`, a `ref` to
  build). It never runs on `pull_request`, because it pushes images (`docker-platforms.yml` builds pull requests in the
  GatoJS repository).
- Native runners, no QEMU: a `build` matrix on `ubuntu-latest` (amd64) and `ubuntu-24.04-arm` (arm64) pushes each
  platform by digest and uploads the digest as an artifact. A `merge` job creates the multi-arch manifest list with
  `docker buildx imagetools create` and the tags from `docker/metadata-action`.
- Every build has `provenance: mode=max` and `sbom: true`. The merge job attests the manifest list digest with
  `actions/attest` (the action `actions/attest-build-provenance` now wraps) and pushes the attestation to the registry.
  It skips the attestation in a private repository, because GitHub signs attestations for private repositories only on
  Enterprise Cloud.
- Only `GITHUB_TOKEN`, no secrets. The workflow grants `contents: read`. `packages: write` goes to the two jobs, and
  `id-token: write` and `attestations: write` only to `merge`.
- In the GatoJS repository, `release.yml` calls `docker-publish.yml` through `workflow_call` with the released version
  and `ref: v<version>`. The release commit carries `[skip ci]` and the tag points at it, so the tag push starts no
  workflow (and a tag pushed with `GITHUB_TOKEN` starts none either). Projects tag by hand or from their own release
  flow, so the `v*` trigger works for them.
- `docker-compose.selfhost.yml` uses `image: ${APP_IMAGE:-wa-app:local}` for `migrate` and `app`, so
  `APP_IMAGE=ghcr.io/<owner>/<repo>:1.2.3` with `pull` and `up --no-build` deploys a published image.
- No `railway.json`. The runbook (`docs/self-hosting.md`, "Railway") gives the service settings to enter in the Railway
  dashboard: pre-deploy command `node_modules/.bin/prisma migrate deploy`, healthcheck path `/api/healthcheck`, restart
  on failure. They are the same for a service built from the repository and for one that deploys the GHCR image.
  `railway.toml` stays for now as a record of the values, as `docs/10-wdrozenie.md` already describes.

## Rejected alternatives

- QEMU emulation for arm64 on one runner: much slower for `next build`, and the native arm64 runner is free for public
  repositories.
- One workflow per architecture, or a separate workflow for GatoJS: two copies to keep in sync; the GatoJS image is
  the same build a project makes.
- Docker Hub or a registry token: needs a secret per project; GHCR works with `GITHUB_TOKEN`.
- Shipping `railway.json` as planned: Railway ignores Config as Code for new services and stops reading it on
  2026-12-01.
- Shipping `.railway/railway.ts` (Railway Infrastructure as Code) now: it adds the `railway` package to every project,
  describes the whole Railway project (omitting a resource deletes it), and cannot be tested without a Railway
  account. It waits for Patryk's decision.

## Consequences

- A project's first push to `main` creates a private GHCR package. A host needs a pull token, or the package is made
  public in its settings.
- Self-hosted installs can pin `APP_IMAGE` to a version and roll back by changing the tag; `migrate` still runs before
  `app` on every start.
- A change to the workflow must keep its invariants, or the architecture test fails.
- Follow-ups: Railway Infrastructure as Code (`.railway/railway.ts`), and removing `railway.toml` after the 2026-12-01
  cutoff.

## Enforcement

`src/__tests__/architecture/image-publishing.test.ts` runs `checkPublishWorkflow`
(`scripts/lib/architecture/image-publishing.ts`) on `.github/workflows/docker-publish.yml`: no `pull_request` trigger,
both runners in the matrix, the image name lowercased in a step and never used raw, `provenance: mode=max` and
`sbom: true` on every `docker/build-push-action` step, and no `packages: write` at workflow level. actionlint
(`workflow-lint.yml`) checks the syntax. The Railway settings are convention only.

## Sources

- Plan: `docs/superpowers/plans/2026-11-23-self-hosting.md`, Task 10.
- Spec: `docs/superpowers/specs/2026-11-22-self-hosting-design.md`.
- Railway documentation and schema linked above, fetched 2026-11-26.
- Docker documentation, "Distribute build across multiple runners"; `actions/attest` README.
