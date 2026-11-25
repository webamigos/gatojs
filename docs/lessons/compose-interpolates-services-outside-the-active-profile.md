---
title: 'Compose interpolates every service, even one behind an inactive profile, so a `${VAR:?}` in a profile service stops installs that never use it'
areas: ['deploy']
topics: ['docker', 'compose', 'profiles', 'self-hosting', 'regions']
---

# Compose interpolates every service, even one behind an inactive profile, so a `${VAR:?}` in a profile service stops installs that never use it

**In short**: `docker compose config` and `up` interpolate the whole file before they apply profiles. A required-variable form such as `${S3_ACCESS_KEY_ID:?set it}` in the `minio` service (profile `s3`) would stop every self-hosted install with local storage, where the S3 keys stay empty. Use `${VAR:?}` only in services that always run (`db`, `app`); in profile services use plain `${VAR}` and let the app's env check reject the empty value when the profile is actually used.

**Context**: Self-hosting Task 6, `docker/uploads.selfhost.compose.yml`, which `wa generate` copies into the `wa:services` region of `docker-compose.selfhost.yml`.

**Problem**: The first draft guarded the MinIO credentials with `:?`. With `STORAGE_PROVIDER=local` and the keys blank, as `.env.selfhost.example` ships them, Compose would refuse the whole file, not just the `s3` profile. Checked 2026-11-25 on Compose v2.19.1: a file with service `b` under profile `s3` reading `${NEEDED:?set NEEDED}` fails `docker compose config` without `--profile s3` with "required variable NEEDED is missing a value" (exit 15).

**Rule**: A module's Compose fragment must resolve with every variable it reads left empty. Required-variable guards belong in core services that always start. Check with `docker compose -f <file> --env-file <example> config --quiet` and the core variables set (the `assemble` job in `kit.yml` does this with `--profile tools --profile s3`).

**Applies to**: `selfhostCompose` and `compose` fragments of modules, and any Compose file with profiles.
