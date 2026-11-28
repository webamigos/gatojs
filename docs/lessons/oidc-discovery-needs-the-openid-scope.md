---
title: "The better-auth OAuth provider serves OpenID discovery only when `openid` is a configured scope; without it the exported metadata helper throws and the route answers 500"
areas: ["mcp"]
topics: ["mcp", "oauth", "oidc", "discovery", "better-auth"]
---

# The better-auth OAuth provider serves OpenID discovery only when `openid` is a configured scope; without it the exported metadata helper throws and the route answers 500

**In short**: With `mcp({ scopes: ["mcp:read", "mcp:write", "offline_access"] })`,
`oauthProviderOpenIdConfigMetadata(auth)` throws a `NOT_FOUND` `APIError` (the Next.js route answers 500) and
`/api/auth/.well-known/openid-configuration` answers 404. RFC 8414 metadata
(`/.well-known/oauth-authorization-server/api/auth`) works and is what MCP clients read first.

**Context**: Phase 0 spike of the MCP module on 2026-11-28 (`@better-auth/oauth-provider` 1.7.27).

**Problem**:

- A route copied from the better-auth docs turns a harmless 404 into a 500 in the logs.
- Adding `openid` only to make discovery work would also start issuing ID tokens and open the userinfo surface.

**Rule**: Without `openid` in `scopes`, do not add an OpenID discovery route. Serve RFC 9728 protected resource metadata
through `auth.handler(request)` and RFC 8414 metadata through `oauthProviderAuthServerMetadata(auth)`; both work under
`src/app/.well-known/**` because `src/proxy.ts` skips paths with a dot.

**Applies to**: `src/app/.well-known/**`, MCP plan Task 1.2.
