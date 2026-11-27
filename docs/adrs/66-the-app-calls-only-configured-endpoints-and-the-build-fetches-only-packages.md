# ADR-66: At runtime the app calls only configured endpoints, and the build fetches only packages and base images

**Status:** Accepted
**Date:** 2026-11-27
**Decided by:** Patryk (self-hosting spec, section 7 and decisions 8.4 and 9.2), written up by an agent

## Context

A company that self-hosts a GatoJS project often has to show that nothing leaves its network: no telemetry, no font
or asset downloads, no analytics, no "check for updates". The app depends on Next.js, Prisma, better-auth, sharp,
nodemailer and the AWS SDK, each with its own idea of what to send home, and those calls do not live in GatoJS code,
so a review or a code guard cannot see them. Ragen found seven such services on its appliance only by running it on a
network with no route out (Ragen lesson `an-offline-claim-needs-a-sealed-run-not-a-review`).

## Decision

- **Runtime:** the running app (and its one-shot `migrate` and `tools` containers) connects only to endpoints the
  operator configured: the database, mail (`SMTP_*` or Resend), storage (`S3_ENDPOINT`) and OpenTelemetry
  (`OTEL_EXPORTER_OTLP_ENDPOINT`). Nothing else: no lookups of third-party hosts, no telemetry, no update checks.
- **Build:** `docker build` fetches npm packages and base images and nothing else. Fonts are served from the
  repository (`next/font/local`), and Next.js and Prisma telemetry are off in the image
  (`NEXT_TELEMETRY_DISABLED=1`, `CHECKPOINT_DISABLE=1`).
- **Proof at runtime is a sealed run, not a review.** `kit/egress-check` runs `docker-compose.selfhost.yml` on one
  `internal: true` network, with the app image built from the checkout, and captures every packet on the network's
  bridge with tcpdump. Every service resolves through a resolver address inside the network that answers nothing, so
  each lookup of a name that is not a container is a packet the capture sees, on Docker 24 and on Docker 26 and later
  alike (from Docker 26 an internal network neither forwards lookups to an outside resolver nor gives containers a
  default route). A packet to an address outside the network, or a lookup sent to that resolver, fails the check with
  the container and the name or address it asked for.
- **The check proves it can see before it reports a clean result.** A canary container looks up
  `egress-canary.invalid` and, where it has a default route, connects to `192.0.2.1:80`; a capture that missed
  either stops the run with "capture saw no canary attempt; refusing to report a clean result".
- **When it runs** (decision 9.2): `.github/workflows/egress-check.yml` on pull requests that touch `Dockerfile`,
  `docker-compose.selfhost.yml`, `.env.selfhost.example`, the mailer, `src/features/uploads/**`, `packages/env/**`,
  `package-lock.json` or the check itself, and by hand (`workflow_dispatch`); two legs, local storage and the MinIO
  profile. It is a GatoJS-repository tool (`kitOnly`); projects get the runbook section, not the workflow.
- **Scope** (decision 8.4): runtime only. The build may fetch packages and base images; a fully offline install bundle
  is a later step.

## Rejected alternatives

- An allowlist of domains: it goes out of date while it stays green, and it reads what the code intends, not what the
  network sees.
- Sampling sockets on the host (`lsof`, `ss`): misses lookups that fail before a socket opens and the first seconds
  after start, and on Docker Desktop the containers are not host processes.
- Relying on `internal: true` alone: it stops the traffic but reports nothing, so a dependency that phones home stays
  invisible until an install without internet breaks on it.
- Running the check on every pull request: it builds the image and starts the whole stack (several minutes); the
  paths in decision 9.2 cover what can add a call.

## Consequences

- A new dependency or service that calls home fails the check on its pull request; the fix is its switch (an
  environment variable or setting) in the `Dockerfile` or the Compose file, named after the host it stopped.
- The check sees only what the scenario exercises: sign-in, an invitation sent through a relay inside the network, an
  upload and a download, plus whatever the containers do on start. A new feature with its own outbound path needs a
  step in `kit/egress-check/src/scenario.ts`.
- A connection to the bridge's own address (the Docker host) is not reported; on Docker 26 and later nothing can reach
  it from an internal network anyway.

## Enforcement

- `src/__tests__/architecture/fonts-are-not-fetched-at-build.test.ts` (no `next/font/google`).
- `src/__tests__/architecture/third-party-telemetry-stays-off.test.ts` (telemetry switches in the `Dockerfile`, no
  analytics SDKs).
- `.github/workflows/egress-check.yml` with `kit/egress-check` (`sealCompose`, `findEscapes`, `verdict` unit-tested;
  the sealed run on both storage providers).

## Sources

- Spec `docs/superpowers/specs/2026-11-22-self-hosting-design.md` sections 4.1, 4.3, 7, 8.4 and 9.2.
- Plans `docs/superpowers/plans/2026-11-23-self-hosting.md` (Task 7) and
  `docs/superpowers/plans/2026-11-27-egress-check.md` (Docker 24 and 28 probes).
- Ragen `scripts/appliance-egress-check.mts`, `infra/appliance/egress-check/Dockerfile`.
- moby CVE-2024-29018 fix (Docker 26.0) and moby/moby#47832 (Docker 26.1.3, lookups forwarded into internal networks).
