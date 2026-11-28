---
title: 'An MCP client asks the authorization server only for the scopes named in the 401 challenge, so a write scope missing from `WWW-Authenticate` is never granted'
areas: ['mcp']
topics: ['mcp', 'oauth', 'scopes', 'better-auth', 'step-up']
---

# An MCP client asks the authorization server only for the scopes named in the 401 challenge, so a write scope missing from `WWW-Authenticate` is never granted

**In short**: `@modelcontextprotocol/client` 2.4 builds the authorization request from the `scope` of the route's 401
`WWW-Authenticate` header (plus `offline_access`), not from its own client metadata. With
`requireMcpAuth(auth, handler, { requiredScopes: ["mcp:read"] })` the challenge says `scope="mcp:read"`, the client asks
for `mcp:read offline_access`, and the consent screen can never offer write access.

**Context**: Phase 0 spike of the MCP module on 2026-11-28 (better-auth 1.7.27, `@better-auth/mcp` 1.7.27,
`@modelcontextprotocol/client` 2.4.0).

**Problem**:

- Write tools are hidden from read-only tokens, so the client never sees a tool that would trigger a step-up either.
- Every connection silently ends up read-only; nothing fails.

**Rule**: Keep `requiredScopes: ["mcp:read"]` (the minimum to call the endpoint) and set
`challengeScopes: ["mcp:read", "mcp:write"]`, so the 401 says `scope="mcp:read mcp:write"`. The consent screen narrows
the grant: `/oauth2/consent` with `scope: "mcp:read offline_access"` for a request of `mcp:read mcp:write offline_access`
issues a read-only token (verified). A consent `scope` outside the request fails with `invalid_request` "Scope not
originally requested".

**Applies to**: `src/app/api/mcp/route.ts`, the consent page, MCP plan Task 2.1 and Task 1.4.
