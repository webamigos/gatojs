---
title: 'An `@modelcontextprotocol/client` 2.x client speaks the 2025 `initialize` handshake unless it opts into negotiation, so an MCP server that rejects legacy traffic rejects the SDK default'
areas: ['mcp']
topics: ['mcp', 'protocol-version', 'sdk', 'testing']
---

# An `@modelcontextprotocol/client` 2.x client speaks the 2025 `initialize` handshake unless it opts into negotiation, so an MCP server that rejects legacy traffic rejects the SDK default

**In short**: `ClientOptions.versionNegotiation.mode` defaults to `'legacy'`: a `new Client(...)` without options
negotiates `2025-11-25`. `{ mode: "auto" }` probes with `server/discover` first, and `{ mode: { pin: "2026-07-28" } }`
speaks only the stateless revision. `createMcpHandler(factory, { legacy: "stateless" })` served both against the same
route in the spike; `legacy: "reject"` would have refused the SDK's own default client.

**Context**: Phase 0 spike of the MCP module on 2026-11-28 (`@modelcontextprotocol/server` and `client` 2.4.0).

**Problem**:

- A route test that builds a client with default options tests only the legacy leg, and believes it tested 2026-07-28.
- `getNegotiatedProtocolVersion()` and `getProtocolEra()` are the only way to see which leg ran.

**Rule**: Route tests build two clients, one with `versionNegotiation: { mode: "legacy" }` and one with
`{ mode: { pin: "2026-07-28" } }`, and assert `getProtocolEra()` (`"legacy"`, `"modern"`) before listing and calling
tools. Keep `legacy: "stateless"` (decision Q2) while the SDK default is legacy.

**Applies to**: `src/app/api/mcp/**` tests, MCP plan Task 2.1 and Task 2.2.
