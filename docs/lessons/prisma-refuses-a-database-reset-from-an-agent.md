---
title: 'Prisma 7 refuses `db push --force-reset` from an AI agent until the user''s own consent text is passed in an environment variable'
areas: ['testing']
topics: ['prisma', 'e2e', 'database', 'agents', 'consent']
---

# Prisma 7 refuses `db push --force-reset` from an AI agent until the user's own consent text is passed in an environment variable

**In short**: `e2e/global-setup.ts` resets the e2e database with `npx prisma db push --force-reset`. Prisma 7 detects an AI agent and stops with a request for consent. It continues only when `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` holds the exact text of the user's message agreeing to the reset.

**Context**: Harness phase 1, task 2: a worker ran `npm run test:e2e` and was stopped in global setup.

**Problem**:

- An unattended run stops at the first e2e step until a human answers.
- An agent must not invent the consent text: it has to come verbatim from the user, for a named database.

**Rule**: Ask the user before the first e2e run, naming the database (for example `wa_app_e2e` on `localhost:5452`) and saying that its data is deleted. Pass their exact message in `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. The consent covers that database only.

**Applies to**: `npm run test:e2e`, `e2e/global-setup.ts`, any `prisma db push --force-reset` or `migrate reset` run by an agent.
