---
title: 'Parallel worktrees collide on e2e ports, the uploads directory and database containers unless each one gets its own'
areas: ['testing']
topics: ['e2e', 'orca', 'worktrees', 'docker', 'ports']
---

# Parallel worktrees collide on e2e ports, the uploads directory and database containers unless each one gets its own

**In short**: `npm run test:e2e` defaults to app ports 3000/3001, a shared temp uploads directory and the `db`/`mail` services on fixed ports. Two worktrees running e2e at the same time (parallel Orca workers) fight over the same ports, files and database.

**Context**: Harness phase 1 and the Next.js / better-auth upgrades ran three workers at once on 2026-11-22.

**Problem**:

- A busy port or a reset of someone else's `wa_app_e2e` looks like a flaky test.
- Stopping another worktree's container to free a port breaks that worker's run.

**Rule**: Give each worktree its own set: `DB_PORT`, MinIO and mailpit ports, `E2E_CORE_PORT`, `E2E_MULTI_ORG_PORT`, `E2E_UPLOADS_DIR`, and `INTEGRATION_DATABASE_URL`/`INTEGRATION_S3_ENDPOINT` pointing at those containers. Docker Compose names the containers after the worktree directory, so `docker compose up -d db mail` with different ports does not touch other worktrees. Never stop containers you did not start.

**Applies to**: `npm run test:e2e`, `npm run test:integration`, `docker-compose.yml`, parallel Orca workers.
