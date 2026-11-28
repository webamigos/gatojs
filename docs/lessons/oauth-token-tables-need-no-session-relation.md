---
title: "The OAuth token models reference `Session`, which has no `wa:relations` region; drop that Prisma relation in the module schema, the better-auth schema check still passes"
areas: ["mcp", "data"]
topics: ["better-auth", "prisma", "schema", "oauth", "modules"]
---

# The OAuth token models reference `Session`, which has no `wa:relations` region; drop that Prisma relation in the module schema, the better-auth schema check still passes

**In short**: `npx auth@1.7.27 generate` emits eight tables for `jwt()` + `mcp()`: `Jwks`, `OauthClient`,
`OauthResource`, `OauthClientResource`, `OauthRefreshToken`, `OauthAccessToken`, `OauthConsent`,
`OauthClientAssertion`. `OauthAccessToken` and `OauthRefreshToken` carry `sessionId` with a relation to `Session`
(`onDelete: SetNull`), and four models relate to `User`. `prisma/schema/auth.prisma` has a `wa:relations` region in
`User` only, so a module cannot add the back-relation field to `Session`.

**Context**: Phase 0 spike of the MCP module on 2026-11-28 (better-auth 1.7.27, Prisma 7.10).

**Problem**:

- Copying the generated models as they are makes `prisma validate` fail on the missing `Session` back-relation.
- Editing `Session` would be a core edit by a module.

**Rule**: Keep `sessionId String?` on the two token models without the `session Session?` relation field; put the
`User` back-relations into the `wa:relations` region through `schemaRelations`. With that schema `prisma db push`,
sign-in (which runs better-auth's schema check since 1.7.3) and the whole OAuth flow passed. The generator CLI is the
`auth` package (`npx auth@<better-auth version> generate --config src/shared/lib/auth/index.ts --output <file>`).

**Applies to**: `prisma/schema/mcp.prisma`, `kit/modules/mcp.json` `schemaRelations`, MCP plan Task 1.1.
