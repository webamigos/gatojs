---
title: 'Since better-auth 1.7.3 a schema mismatch rejects sign-in at runtime, in production too; a plugin with tables fails at login, not at build'
areas: ['dependencies']
topics: ['better-auth', 'prisma', 'schema', 'auth']
---

# Since better-auth 1.7.3 a schema mismatch rejects sign-in at runtime, in production too; a plugin with tables fails at login, not at build

**In short**: better-auth 1.7.3 turned on startup schema validation by default. When the Prisma DMMF differs from what better-auth and its plugins expect, auth requests are rejected. Build, typecheck and unit tests with a mocked Prisma all pass.

**Context**: The better-auth 1.7.27 upgrade on 2026-11-22, while planning MCP (the `oauth-provider`, `mcp` and `jwt` plugins add eight tables).

**Problem**:

- A module that adds a better-auth plugin without its Prisma models breaks sign-in for every user.
- Only e2e (or a real request) shows it.

**Rule**: After adding or changing a better-auth plugin, run the adapter's `checkSchema()` (from `await auth.$context`) as a database-free check, then e2e sign-in. Generate the expected models with `npx auth generate` and diff them against `prisma/schema/`.

**Applies to**: `src/shared/lib/auth/index.ts`, module `auth.ts` plugins, `prisma/schema/auth.prisma`, `organizations.prisma`.
