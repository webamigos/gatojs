# MCP module — implementation plan

**Goal:** a Gato module `mcp` that turns a GatoJS app into an OAuth 2.1 authorization server (better-auth 1.7,
`@better-auth/mcp`) and a stateless MCP server at `/api/mcp` (`@modelcontextprotocol/server` 2.x), where every tool call
runs as the signed-in user in one organization through the request principal, `getOrgContext()`, `runCommand()`,
`can()`, the tenant guard and the audit log.

**Spec:** [docs/superpowers/specs/2026-11-28-mcp-module.md](../specs/2026-11-28-mcp-module.md) (PR #136, merged), decided
by Patryk on 2026-11-28 (Q1–Q15, section 15). Read it with this plan; section numbers below (§4.2, §5.3, …) point into
it. Prior art and the lessons L1–L12 are its §12; open-mercato adoptions are §12.1.

**Status:** phase 0 spike done on 2026-11-28 (section "Spike results"). Its verdict is **go**: no decision of the spec
is blocked. Six refinements found by the spike (R1–R6 below) change spec details, not decisions. The coordinator accepted
all six on 2026-11-28 on the owner's go-ahead (the owner may revise); R2 with full DPoP proof verification. The spec's
§4.3, §5.2 and §15 are amended in the same PR.

**Execution:** Orca workers, one task per worker, each on its own branch from `main`, one PR per task. Order:

```text
Phase 0, core seams (core, gato-cli)
  T0.1 request principal (critical) ─────────────┬──────────────────────────────┐
  T0.2 authPlugins[] in the generator ──┐        │                              │
  T0.3 sign-in OAuth continuation ──────┼────────┼──────────┐                   │
  T0.4 mcp-tools declarations + generator ──┬────┼──────────┼───────┐           │
  T0.5 mcp.instructions in GatoConfig ──────┤    │          │       │           │
  T0.5b mcp.tools exposure (needs 0.4, 0.5) ┤    │          │       │           │
  T0.6 audit MCP channel + correlation id (needs 0.1)       │       │           │
  T0.7 GATO_EXPECTED_INSTANCES (core env, Helm)             │       │           │
Phase 1, authorization server (module mcp)                  │       │           │
  T1.1 skeleton, env, schema, plugins, guard plugin (needs 0.2) ─┬──┼───────┐   │
  T1.2 discovery routes (needs 1.1) ─────────────────────────────┤  │       │   │
  T1.3 registration guard (needs 1.1) ───────────────────────────┤  │       │   │
  T1.4 organization picker + consent (needs 1.1, 0.1, 0.3) ──────┤  │       │   │
Phase 2, MCP endpoint                                            │  │       │   │
  T2.1 route, principal resolver, Origin/Host, rate limit (needs 1.1, 1.2, 0.1, 0.7)
  T2.2 tool adapter, error mapping, whoami, instructions (needs 2.1, 0.4, 0.5, 0.5b)
  T2.3 tool-call auditor (needs 2.2, 0.6)
Phase 3, tools, connections UI, events
  T3.1 uploads.delete command tool (needs 2.3)
  T3.2 query tools uploads.list, audit-logs.list, users.list-members (needs 2.3)
  T3.3 connected AI apps, mcp.disconnect, subscribers (needs 1.4, 2.1)
  T3.4 organization view, mcp.revoke-connection (needs 3.3)
Phase 4, docs, e2e, release
  T4.1 docs, ADR, catalog, Task Router (needs 3.4, 3.1, 3.2)
  T4.2 e2e, interop checklist, egress check, mcp 0.1.0 (needs 4.1)
  T4.3 retention schedule and organizations.deleted purge (needs 4.2 and the jobs module, jobs Tasks 1, 7a)
Phase 5 (later): human approval mode, its own plan
```

Parallelism inside the lane: T0.1, T0.3, T0.5, T0.7 are independent of each other and of the generator; T0.2 and T0.4
change `packages/gato-cli` and run one at a time (together with the jobs lane's generator tasks, see "Lane
coordination"). In Phase 1, T1.2 and T1.3 run in parallel after T1.1. In Phase 3, T3.1, T3.2 and T3.3 run in parallel;
T3.1 and T3.2 both touch `src/features/uploads/` (different files, one module version bump each: the second rebases and
takes the next patch).

## Lane coordination with the jobs lane

The jobs plan (`docs/superpowers/plans/2026-11-28-jobs-module.md`, branch `feat/jobs-plan-and-spike`, written in
parallel) touches the same core seams. Tasks below marked **[shared: …]** must not run at the same time as the jobs task
named; the coordinator serializes them. Proposed order per seam:

| Seam                                                | Files                                                                                                                  | MCP tasks                                                                | Jobs tasks (jobs spec §16)                                                          | Proposed first                                      | Why                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 Generator, gato-cli version, bundle, `kitFormat` | `packages/gato-cli/src/generate/registry.ts`, `.wa/bin/wa.mjs`, `kit/kit.json`, `kit-format.ts`, `create-gato-app` pin | T0.2, T0.4                                                               | Task 1 (`jobs.ts` detection), Task 3 (server registry split), later generator tasks | **MCP T0.2 → jobs Task 3 → jobs Task 1 → MCP T0.4** | T0.2 only changes the `auth.ts` import line, small to rebase over; jobs Task 3 creates `src/server-registry.generated.ts`, where T0.4 must emit `moduleMcpTools` (§5.4 "server registry only"), so T0.4 waits for it. One generator task at a time; each takes the next free `kitFormat` (jobs spec reserves 12; MCP then takes 13 for T0.2 if jobs merges first, else 12; never guess, read `kit/kit.json` at merge). |
| S2 `AuditChannel`, `AuditEvent`, `auditActor`       | `src/shared/lib/audit.ts` (core, critical); `prisma/schema/audit-logs.prisma` + migration; audit-log page labels       | T0.1 (type + enum value `MCP`, actor fields), T0.6 (column, page toggle) | Task 14 (`SYSTEM`, job-scoped default channel, label)                               | **MCP**                                             | MCP is phase 0, jobs Task 14 is phase 4. Two separate `audit-logs` migrations adding one enum value each; the second rebases its migration timestamp after the first. The audit-log page gets the "MCP" label and the `mcp.tool_called` toggle (T0.6) before jobs adds "System".                                                                                                                                       |
| S3 `getOrgContext()` / `OrgContext`                 | `src/shared/lib/auth/org-context.ts` (critical)                                                                        | T0.1 (principal branch)                                                  | timezone task (jobs §15: `OrgContext.timezone`)                                     | **MCP**                                             | T0.1 is the security seam everything MCP builds on. Whichever lands second must also fill `timezone` in the principal branch (a principal context is a full `OrgContext`). A test in T0.1 pins the principal branch's returned keys; the jobs task updates that literal.                                                                                                                                               |
| S4 `GatoConfig`                                     | `src/shared/lib/modules/gato-config.ts`, `gatoConfigProblems`, `ProjectGatoConfig`                                     | T0.5, T0.5b                                                              | Task 5 (`timezone`, `schedules`)                                                    | **first ready**                                     | Small textual conflict in the interface and the problems list; no semantic overlap. Second one rebases.                                                                                                                                                                                                                                                                                                                |
| S5 Tenant-scope guard                               | `src/shared/lib/tenant-scope/` (critical)                                                                              | none (T0.1 copies its `globalThis` store pattern only)                   | Task 4 (organization job scope)                                                     | **no ordering**                                     | MCP does not change the guard. MCP queries run inside the guard unchanged; MCP never calls `withoutTenantScope`.                                                                                                                                                                                                                                                                                                       |
| S6 `GATO_EXPECTED_INSTANCES`                        | `packages/env` or `src/env.ts`, `.env.example`, `deploy/helm/gatojs/templates/deployment.yaml`, deploy docs            | T0.7                                                                     | per-instance strategy warnings (jobs)                                               | **MCP**                                             | Decided in the MCP spec (Q15) as a core variable; T0.7 is tiny and unblocks T2.1. The jobs lane reuses it.                                                                                                                                                                                                                                                                                                             |
| S7 Core events                                      | `src/shared/lib/events/core-events.ts`                                                                                 | none until T4.3                                                          | Task 7a (`organizations.deleted`)                                                   | **jobs**                                            | OAuth rows hold the organization in `referenceId` with no foreign key, so a deleted organization leaves consents and tokens behind. T4.3 subscribes to `organizations.deleted` after jobs Task 7a merges.                                                                                                                                                                                                              |
| S8 Retention                                        | `src/features/mcp/jobs.ts`                                                                                             | T4.3                                                                     | Tasks 1, 2 (declarations, `enqueueJob`), the jobs module                            | **jobs**                                            | The schedule is declared against the core jobs seam.                                                                                                                                                                                                                                                                                                                                                                   |
| S9 Server-entrypoint guard test                     | `src/__tests__/server-entrypoints-guard.test.ts`                                                                       | T0.1 (only the route may call `runWithRequestPrincipal`), T2.1           | jobs entry points                                                                   | **first ready**                                     | Textual only.                                                                                                                                                                                                                                                                                                                                                                                                          |
| S10 Numbers                                         | ADRs, docs                                                                                                             | T4.1 (ADR, `docs/20*`)                                                   | jobs ADR-72…75, `docs/19*`                                                          | **jobs**                                            | `docs/adrs/` on `main` ends at ADR-69; both specs say ADR-70 and ADR-71 are taken by in-flight PRs #138/#139, and the jobs spec claims ADR-72…75. MCP takes the next free number when T4.1 merges (likely ADR-76). Docs: jobs `19`/`19b`, MCP `20`/`20b`.                                                                                                                                                              |
| S11 Egress check                                    | `kit/egress-check/`, `.github/workflows/egress-check.yml`                                                              | T4.2 (leg with `mcp`, CIMD off)                                          | jobs leg                                                                            | **first ready**                                     | Separate legs.                                                                                                                                                                                                                                                                                                                                                                                                         |
| S12 `kit/modules/core.json` version                 | every core task                                                                                                        | all core tasks                                                           | all core tasks                                                                      | n/a                                                 | Always the next free minor/patch at merge.                                                                                                                                                                                                                                                                                                                                                                             |

## Global constraints

- Rules in `CLAUDE.md`, `AGENTS.md` and `kit/CLAUDE.md` apply: no code comments except `// WHY:` (at most 3 lines) and
  tool directives; no `any`, nested ternaries or silent `catch {}`; Zod at every external input; error class `name` as
  a string; no `console`. `AGENTS.md` and `CLAUDE.md` must stay inside the `agent-instructions-fit-the-budget`
  architecture test.
- Every task runs the `gato-task` skill (`.claude/skills/gato-task/SKILL.md`): "Zachowania" and "Mutacje do zabicia"
  below are step 1; `test-writer` writes the tests first and shows a red run for the right reason; `.gato/phase` holds
  `implement` in the worker's worktree during implementation; `test-reviewer` runs
  `npm run test:mutation:task -- <files>` (and `--prefix packages/gato-cli` for CLI files) and
  `npm run test:mutation:gate`. Expected values are literals or come from the spec. Mock only I/O; never mock
  `request-principal.ts`, `org-context.ts`, the guard plugin or the tool registry in a test of their own rules.
- **No bypass (§10).** No task adds an env variable, `gato.config.ts` key, `NODE_ENV` branch, CLI flag or test-only export
  that skips the bearer token or the principal. Tests mint real tokens through better-auth or sign with the test JWKS
  key and go through `requireMcpAuth`.
- **No cached authorization (§5.3).** Membership, role and ban are read per request. A memoized lookup is a mutation
  to kill in every task that reads them.
- New content is English. User-facing strings go through i18n in `pl` and `en`. Existing Polish command messages stay
  byte-for-byte.
- **Versions.** Every Gato file change bumps its module's `version` in `kit/modules/<module>.json` (patch for fixes,
  minor for behaviour), then `npm run wa -- kit sync && npm run wa -- generate`, committed, then `git diff --exit-code`.
  Every `packages/gato-cli/src` change bumps `packages/gato-cli/package.json`, rebuilds the bundle
  (`npm run build --prefix packages/gato-cli`, commit `.wa/bin/wa.mjs`) and moves the exact pin in
  `packages/create-gato-app/package.json` with its patch bump. A change to a contract the CLI reads (module file
  exports, generated layout, manifest schema) bumps `kitFormat` and adds it to `SUPPORTED_KIT_FORMATS`. Numbers are the
  next free ones at merge time (state on 2026-11-28: `kitFormat` 11, `gato-cli` 0.15.0, `create-gato-app` 0.3.13,
  `core` 0.36.0, `audit-logs` 0.3.0, `uploads` 0.7.1). Publishing is the coordinator's job.
- **Dependencies (spike R6).** `@better-auth/mcp` and `@better-auth/oauth-provider` are pinned **exactly** to the
  resolved `better-auth` version (1.7.27 in the lockfile on 2026-11-28; `@better-auth/mcp` depends on
  `@better-auth/oauth-provider ^1.7.27`, which would otherwise float to 1.7.28 under a 1.7.27 core). A `better-auth`
  bump moves all three together (`wa-upgrade-dependency` skill). `@better-auth/oauth-provider` requires `zod ^4.5.4`: T1.1
  raises the root range from `^4.3.6` to `^4.5.4` (the lockfile already has 4.6.7).
  `@modelcontextprotocol/server` `^2.4.0`, dev `@modelcontextprotocol/client` `^2.4.0`. Install with the pinned npm
  (`npx -y npm@11.21.1 install …`) and keep the lockfile diff about the change (lesson
  `pinned-npm-drops-libc-fields-from-the-lockfile`).
- **Decisions and lessons.** ADR from `docs/adrs/TEMPLATE.md` in T4.1 (number per S10). New gotchas go to
  `docs/lessons/` (area `mcp`). Lessons that apply to most tasks: the five `mcp` lessons from the spike,
  `better-auth-checks-the-prisma-schema-at-startup`, `a-new-file-needs-an-owner-only-the-cli-gate-checks`,
  `a-lazy-import-in-the-client-registry-still-ships-to-the-browser`, `stryker-mutate-globs-treat-brackets-as-a-class`
  (`src/app/.well-known/**/[[...path]]`, `src/app/[locale]/…`), `stryker-instrumentation-hides-guard-literals-from-repo-scans`,
  `vitest-runs-what-tsc-rejects`, `parallel-worktrees-need-their-own-ports-and-dirs`.
- **Docs.** In-repo docs named in a task change in the same PR. docs.gatojs.com and the website are listed in the report
  for the coordinator.
- **Gates** before handing in: `npm run verify`; `npm run verify --prefix packages/gato-cli` for CLI changes;
  `npm run test:integration` for data code (own Postgres container and `INTEGRATION_DATABASE_URL`, database name ending
  `_test`); `npm run test:e2e` when runtime pages or auth change (e2e resets `wa_app_e2e`: ask the coordinator for
  Patryk's consent text before each run, lesson `prisma-refuses-a-database-reset-from-an-agent`, own ports); the
  `wa-code-review` skill. A task that changes what a created project contains checks it with
  `node .wa/bin/wa.mjs create /tmp/x --kit . --yes --no-install --no-git`.
- Conventional Commits, lowercase subjects, body lines ≤ 100 characters, footer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, PR or publish.
- Report: branch, commits, gate results with numbers, surviving mutants with classification, proposed
  `mutation-gate.json` `allowed` entries (a human adds them), website pages to update, anything unverified, gotchas.

## Spike results (phase 0, 2026-11-28)

Throwaway code in the worktree of `feat/mcp-plan-and-spike`, deleted before the commit: better-auth plugins added in
`src/shared/lib/auth/index.ts`, a hand-trimmed `prisma/schema/mcp-spike.prisma`, three `.well-known` routes, a
principal branch in `getOrgContext()`, `src/app/api/mcp/route.ts` with one tool, and a Node client script. Postgres 16
in a throwaway container (compose project `gato-mcp-spike`, port 55471, tmpfs, `prisma db push`), `next dev` on port
3471, removed afterwards. No other project's database was touched.

**Verdict: go.** Every decision Q1–Q15 is viable on the current versions.

### Versions (npm on 2026-11-28)

| Package                          | Latest                        | Lockfile / used | Notes                                                          |
| -------------------------------- | ----------------------------- | --------------- | -------------------------------------------------------------- |
| `better-auth`                    | 1.7.28 (`beta` 1.8.0-beta.11) | 1.7.27          | spike ran on 1.7.27                                            |
| `@better-auth/mcp`               | 1.7.28                        | 1.7.27 exact    | peers `better-auth ^1.7.27`, `better-call ~1.4.5` (lock 1.4.6) |
| `@better-auth/oauth-provider`    | 1.7.28                        | 1.7.27 exact    | peer `@better-fetch/fetch 1.3.3`; dep `zod ^4.5.4`             |
| `@better-auth/cimd`              | 1.7.28                        | not installed   | Q1: opt-in only                                                |
| `@modelcontextprotocol/server`   | 2.4.0                         | 2.4.0           | `zod ^4.2.0`, Node ≥ 20                                        |
| `@modelcontextprotocol/client`   | 2.4.0                         | 2.4.0           | dev only                                                       |
| `@modelcontextprotocol/sdk` (v1) | 1.32.2                        | not used        | §5.1                                                           |
| `next` / `zod`                   | —                             | 16.4.6 / 4.6.7  |                                                                |

### What was proved end to end

An `@modelcontextprotocol/client` 2.4.0 `StreamableHTTPClientTransport` with an `OAuthClientProvider` (loopback
redirect `http://127.0.0.1:5599/callback`, `token_endpoint_auth_method: "none"`) against `next dev`:

1. `POST /api/mcp` without a token → 401 `WWW-Authenticate: Bearer resource_metadata="http://localhost:3471/.well-known/oauth-protected-resource/api/mcp", scope="…"`.
2. PRM at `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-protected-resource` (served by
   `auth.handler(request)`, `mcp()`'s `onRequest`): `resource`, `authorization_servers: ["http://localhost:3471/api/auth"]`,
   `bearer_methods_supported: ["header"]`, `scopes_supported: ["mcp:read", "mcp:write"]` (`offline_access` filtered
   out), plus `dpop_signing_alg_values_supported` (R2).
3. AS metadata at `/.well-known/oauth-authorization-server/api/auth` (and the root path) through
   `oauthProviderAuthServerMetadata(auth)`: issuer `http://localhost:3471/api/auth`, `code_challenge_methods_supported:
["S256"]`, `authorization_response_iss_parameter_supported: true`, `registration_endpoint`.
4. DCR: the SDK registered a client; `clientRegistrationDefaultApplicationType: "infer"` stored `application_type:
"native"` for the loopback redirect (L4 confirmed).
5. Authorize with PKCE S256 and `resource` → login page `/sign-in?…&exp&ba_iat&ba_param…&sig`; `POST
/api/auth/sign-in/email` with `oauth_query` → `{ redirect: true, url: "/oauth/organization?…" }`; `POST
/api/auth/oauth2/continue { postLogin: true, oauth_query }` → `/oauth/consent?…`; `POST /api/auth/oauth2/consent
{ accept: true, scope, oauth_query }` → callback with `code` and `iss` (RFC 9207).
6. Token: JWT, `expires_in: 300`, refresh token issued, claims `sub`, `aud: "http://localhost:3471/api/mcp"`, `azp`,
   `client_id`, `scope`, `sid`, `iss: "http://localhost:3471/api/auth"`, `iat`, `exp`, `jti`, and `org_id` from
   `customAccessTokenClaims({ referenceId })` where `referenceId` came from `postLogin.consentReferenceId`.
7. `requireMcpAuth(auth, handler, { resource, requiredScopes: ["mcp:read"] })` verified it in process (default issuer
   = better-auth `baseURL` = `${APP_URL}/api/auth`, matches; no override needed); the handler wrapped
   `createMcpHandler(factory, { legacy: "stateless", responseMode: "json" }).fetch(request)` in
   `runWithRequestPrincipal`; tool `mcp_whoami` called `getOrgContext()` and got `{ orgRole: "owner", userRole: "user",
serviceMode: false }` for a global `admin` (Q5 cap) and the organization's name from Prisma.
8. Both eras on the same route: a client with `versionNegotiation: { mode: { pin: "2026-07-28" } }` (era `modern`) and
   one with the SDK default (`legacy`, `2025-11-25`) listed and called the tool.
9. Narrowing at consent: a request for `mcp:read mcp:write offline_access` granted with `scope: "mcp:read offline_access"`
   → token scope `mcp:read offline_access`. A consent scope outside the request → 400 "Scope not originally requested".
10. The i18n proxy: `/.well-known/*` is not touched (matcher skips paths with a dot); `/sign-in?…` and
    `/oauth/consent?…` with `Accept-Language: en` or `NEXT_LOCALE=en` → 307 to `/en/…` with every repeated `ba_param`
    kept.
11. Schema: `npx auth@1.7.27 generate` lists the eight tables of §9; with the `Session` relation dropped (R5) `prisma
db push` and sign-in (better-auth's schema check) passed.

### Refinements (spec details, not decisions; accepted by the coordinator on 2026-11-28)

- **R1 Challenge scopes (accepted).** The SDK client requests exactly the 401 challenge's `scope` plus
  `offline_access`, not its own metadata. With `scope="mcp:read"` (§4.3, §5.2) no connection is ever offered
  `mcp:write`. Proposed: `requireMcpAuth(…, { requiredScopes: ["mcp:read"], challengeScopes: ["mcp:read", "mcp:write"] })`,
  so the 401 says `scope="mcp:read mcp:write"`; the consent checkbox (off by default, §4.4) narrows. Verified: the
  client then asks for all three and consent can grant read only. Lesson
  `mcp-clients-request-only-the-scopes-of-the-401-challenge`.
- **R2 DPoP (accepted, with full proof verification).** §5.2 step 5 refused tokens with `cnf`. But `mcp()` always advertises
  `dpop_signing_alg_values_supported` in PRM and AS metadata, the token endpoint issues DPoP-bound tokens to a client
  that sends a DPoP proof (the SDK client supports DPoP), and there is no option to turn DPoP off at the authorization
  server. Refusing `cnf` would break such clients after a successful consent. `requireMcpAuth` already verifies DPoP
  proofs and binding, with a replay store in the existing `verification` table (no new table). Decision: step 5 becomes
  "DPoP-bound token → full proof verification through `requireMcpAuth`, else 401"; Bearer tokens without `cnf` stay
  accepted. Full verification means (all checked by `verifyDpopProof` in `@better-auth/core` 1.7.27, read in the
  source): the `DPoP` header is one JWT with `typ: "dpop+jwt"`, an allowed `alg` and a public `jwk`, signed by that
  key; `htm` equals the request method; `htu` equals the request URL (normalized, no query or fragment); `iat` is
  within the accepted window (default 300 s back, 5 s ahead); `jti` is present, at most the library's length limit,
  and not seen before (replay store reservation); `ath` equals the base64url SHA-256 of the access token; the JWK
  thumbprint equals the token's `cnf.jkt`. A DPoP-bound token presented as `Bearer`, or with a missing or invalid
  proof, is 401. Because `htu` is compared with the request URL, the route verifies against a request rebuilt on
  `APP_URL` (`${APP_URL}/api/mcp`, the same origin the Host check enforces), so a reverse proxy that rewrites the
  internal URL does not break valid proofs. The checks live in the library, so mutation testing cannot reach them:
  T2.1 pins each one with a behavioural test instead.
- **R3 No OIDC discovery route.** `oauthProviderOpenIdConfigMetadata` throws `NOT_FOUND` (route 500) when `openid` is
  not a scope; `/api/auth/.well-known/openid-configuration` is 404. MCP clients read RFC 8414 metadata first. T1.2 ships
  PRM and AS metadata only and asserts 404 on both OIDC paths. Lesson `oidc-discovery-needs-the-openid-scope`.
- **R4 Grant types.** AS metadata advertises `client_credentials` by default. T1.1 sets `grantTypes:
["authorization_code", "refresh_token"]`; a `client_credentials` token has no user and would fail the principal anyway.
- **R5 `Session` relation.** The token models relate to `Session`, which has no `wa:relations` region. T1.1 keeps
  `sessionId String?` without the relation field (verified with the schema check). `schemaRelations` covers `User`
  only (`oauthClients`, `oauthRefreshTokens`, `oauthAccessTokens`, `oauthConsents`), plus `Organization` for the two
  Gato models. Lesson `oauth-token-tables-need-no-session-relation`.
- **R6 Pins.** Exact pins and the zod floor (Global constraints, "Dependencies").

### Other findings the tasks use

- `/api/auth/token` (session JWT) answers 401 with `disableSettingJwtHeader: true`: the endpoint is still mounted, so
  the guard plugin's 404 (§4.2) is needed.
- `oauthProvider`'s `init` still seeds `resources` at startup, catches a failure, logs it and re-seeds lazily on first
  use. T1.1 must prove `next build` runs without a database (no `init` at import) and that a failed seed does not take
  sign-in down (L2).
- `postLogin.shouldRedirect({ isContinuation })` is called again on `/oauth2/continue`; a client can send
  `postLogin: true` without a picker visit, so the stored `McpConnectSelection` is the only proof of a choice (L8
  confirmed).
- `authorize` and `continue` called by `fetch` without browser navigation answer 200 JSON `{ redirect: true, url }`
  instead of a 302. Integration-test helpers must accept both shapes.
- The signed query repeats `ba_param`; the next-intl redirect keeps them. Pages must pass the raw search string to
  `verifyOAuthQueryParams` and to the consent call, never an object.
- PRM responses carry `Cache-Control: public, max-age=15` and no CORS headers: the `.well-known` route wrappers add
  `Access-Control-Allow-Origin: *` (§4.3).
- The SDK client warns when an `OAuthClientProvider` lacks `discoveryState()` (SEP-2352); that is a client concern, and
  the integration-test provider implements it to keep the logs clean.
- The better-auth client's `redirectPlugin` navigates to `data.url` on its own; `sign-in-form.tsx` must stop pushing
  `/dashboard` in that case (T0.3). Lesson `the-oauth-sign-in-response-navigates-by-itself`.
- SDK default client negotiation is `legacy`; route tests build one client per era. Lesson
  `mcp-sdk-v2-clients-default-to-the-legacy-handshake`.

---

## Phase 0: core seams

### Task 0.1: request principal in `getOrgContext()` (critical) **[shared: S3, S2 type only, S9]**

**Branch:** `feat/mcp-request-principal`

**Files:**

- `src/shared/lib/auth/request-principal.ts` (new, core): `RequestPrincipal = { channel: "mcp"; userId: string;
organizationId: string; accountRole: UserRole; credentialId: string; scopes: readonly string[]; correlationId:
string }`, `runWithRequestPrincipal(principal, fn)` (an `AsyncLocalStorage` on `globalThis` under
  `Symbol.for("gatojs.request-principal")`, as in plan `2026-11-27-tenant-scope-shared-store.md`),
  `currentRequestPrincipal()`.
- `src/shared/lib/auth/org-context.ts`: principal branch first (§5.3): re-read `prisma.member.findFirst` with
  `organizationId` and `userId` from the principal; no membership → `NoOrganizationError`; context `userRole: "user"`,
  `serviceMode: false`; never `readSession()`, never `redirect`.
- `src/shared/lib/auth/require-module-access.ts`: under a principal, throws `ModuleAccessDeniedError` (new, in the same
  folder, `name = "ModuleAccessDeniedError"`) instead of `notFound()`.
- The file that holds `getAdminUserOrNull()` (under `src/shared/lib/auth/`): `null` under a principal.
- `src/shared/lib/audit.ts`: `AuditChannel = "WEB" | "API" | "MCP"`; `AuditEvent.correlationId?: string`;
  `auditActor(context)` adds `channel: "MCP"`, `credentialId` and `correlationId` from the principal. The Prisma enum
  value `MCP` (`prisma/schema/audit-logs.prisma`, `audit-logs` minor) moved here from T0.6: widening the TS type breaks
  the `write-audit-log.ts` typecheck; no migration, the kit ships none. The column comes in T0.6; nothing creates a
  principal before T2.1.
- `src/__tests__/server-entrypoints-guard.test.ts` (or a new architecture test next to it): only
  `src/app/api/mcp/route.ts` may import `runWithRequestPrincipal`; a new reader of `isGlobalAdmin` under
  `src/shared/lib/auth/` without a case in the principal tests fails.
- `mutation-gate.json`: already covers `src/shared/lib/auth/` and `src/shared/lib/audit.ts`.
- `core` minor bump.

**Zachowania** (the spec's Task 0.1 list, plus):

- principal `{ userId: "u1", organizationId: "o1", accountRole: "user", credentialId: "client-1", scopes: ["mcp:read"],
correlationId: "corr-1" }`, member row role `admin` → `getOrgContext()` returns exactly `{ userId: "u1",
organizationId: "o1", orgRole: "admin", userRole: "user", serviceMode: false }`, and `auth.api.getSession` is not
  called;
- principal for a `superadmin` with no member row in `o1` (organization exists) → `NoOrganizationError`;
- principal whose member row was deleted → `NoOrganizationError`;
- no principal → today's behaviour (session read, `redirect` to `/sign-in` without a session, superadmin service mode);
- `requireModuleAccess("audit-logs")` under a principal with role `member` → throws `ModuleAccessDeniedError` (its
  `name` is `"ModuleAccessDeniedError"`), not `notFound()`; without a principal → `notFound()` as today;
- `auditActor(context)` under that principal → `channel: "MCP"`, `credentialId: "client-1"`, `correlationId: "corr-1"`;
  without → no `channel`, no `correlationId` keys;
- two `getOrgContext()` calls under one principal with the member row changed from `admin` to `member` between them →
  the second returns `orgRole: "member"` (two membership queries);
- stored role `superadmin`, member `member` → `userRole: "user"`, `orgRole: "member"`; `can(context,
"uploads.delete-others")` → `false`; `canAccessModule(auditLogsModule, …)` → `false`; `getAdminUserOrNull()` → `null`;
- stored role `admin`, member `owner` → `can(context, "uploads.delete-others")` → `true`;
- `runWithRequestPrincipal(p, fn)` nested inside another principal → the inner one is current, the outer is restored
  after;
- the store is shared across module copies (two imports through different paths see the same principal).

**Mutacje do zabicia:** superadmin branch reachable under a principal (`serviceMode: true`); `userRole` copied from
`accountRole`; `getAdminUserOrNull()` ignoring the principal; membership re-read removed (role from the principal);
session read before the principal check; `channel` set without a principal; `correlationId` dropped; memoized
membership lookup; `ModuleAccessDeniedError` replaced by `notFound()` under a principal (or the reverse without one);
store keyed by a local `Symbol()` instead of `Symbol.for`.

**Gates:** `npm run verify`, `npm run test:integration` (an integration test of the principal branch against Postgres:
member in A and B, principal for A reads only A's role), mutation task + gate.

---

### Task 0.2: several better-auth plugins per module **[shared: S1]**

**Branch:** `feat/gato-auth-plugins-array`

**Files:** `packages/gato-cli/src/generate/registry.ts` (detect `export const authPlugins` in `auth.ts`, keep
`authPlugin`), its tests and fixtures; `src/features/<x>/auth.ts` contract in `docs/02b-rejestr-i-generator.md` and
`docs/09-nowy-modul.md`; `kit/kit.json` `kitFormat` + `SUPPORTED_KIT_FORMATS`; `gato-cli` minor, bundle,
`create-gato-app` pin; `core` patch (regenerated registry).

**Zachowania:**

- a module whose `auth.ts` exports `authPlugins = [a, b]` → the generated registry spreads `a`, `b` in that order after
  the plugins of modules earlier in registry order, and `src/shared/lib/auth/index.ts` keeps `...authPlugins` last (L10);
- a module exporting `authPlugin` only → output byte-identical to today's for that module;
- a module exporting both → `wa generate` exits 1 with `auth.ts exports both authPlugin and authPlugins`;
- a disabled module's plugins absent from the enabled list;
- generated output sorted by module name explicitly (lesson `macos-lists-directories-in-sorted-order`).

**Mutacje do zabicia:** order reversed; disabled module kept; only the first array element spread; the both-names check
removed.

**Gates:** CLI gate, root `verify`, `git diff --exit-code` after `wa generate`, a created project builds.

---

### Task 0.3: sign-in follows the OAuth continuation

**Branch:** `feat/sign-in-oauth-continuation`

**Files:** `src/features/auth/components/sign-in-form.tsx` and its test; `core` patch. (Installing
`oauthProviderClient()` is T1.1's `auth-client.ts`, not core.)

**Zachowania:**

- `authClient.signIn.email` resolves `{ data: { redirect: true, url: "/oauth/consent?a=1" } }` → `router.push` is not
  called (the client's `redirectPlugin` navigates; spike finding);
- `{ data: { redirect: false } }` or no `redirect` → `router.push("/dashboard")` once;
- `{ error }` → the error toast, no navigation;
- the page does not drop repeated query parameters (a render test of the sign-in page with `?ba_param=a&ba_param=b`
  keeps both in `window.location.search`; the form never rebuilds the query).

**Mutacje do zabicia:** unconditional `/dashboard`; condition inverted (`redirect: false` skips navigation);
`redirect` read from the wrong level (`result.redirect`).

**Gates:** `npm run verify`; e2e sign-in of both projects (consent needed, ports per lesson).

---

### Task 0.4: core tool declarations `src/shared/lib/mcp-tools/` and the generator **[shared: S1, after jobs Task 3]**

**Branch:** `feat/mcp-tool-declarations`

**Files:**

- `src/shared/lib/mcp-tools/` (core, new): `define-mcp-tools.ts` (`defineMcpTools`, `defineQueryTool`,
  `defineCommandTool`), `registry.ts` (`mcpToolRegistry`, `McpToolError` with `name` as a string, `wireName(key)`),
  `types.ts`. No import from `@modelcontextprotocol/*` or `src/features/mcp/`.
- Generator: detect `src/features/<x>/mcp-tools.ts`, always emit `moduleMcpTools = mcpToolRegistry({ modules, tools },
gatoConfig)` in the server registry (`src/server-registry.generated.ts` after jobs Task 3; until then
  `src/modules.generated.ts` server part), disabled modules left out, empty list when no module declares tools.
- Catalog: `extension-points.json` key `mcpTools`, "MCP tools" section in `EXTENSION_POINTS.md`,
  `extension-points-exist.test.ts` covers it.
- Architecture tests: `mcp-tools.ts` is server-only (`client-bundles-stay-server-free`); `src/shared/lib/mcp-tools/`
  imports nothing from the SDK or the module.
- `mutation-gate.json`: propose `src/shared/lib/mcp-tools/` as `critical` (a human adds it).
- `kitFormat` bump, `gato-cli` minor, bundle, pin; `core` minor.

**Zachowania** (spec Task 0.4 list, literal messages):

- no `mcp-tools.ts` anywhere → `moduleMcpTools` deep-equals `[]`;
- one project module with `mcp-tools.ts`, no `mcp` module → the project builds and `moduleMcpTools` has that tool;
- tools of a disabled module absent;
- key `notes.list` declared by module `uploads` → `McpToolError` whose message contains `tool key notes.list is not owned
by module uploads`;
- `uploads.list` and `uploads_list` declared → one error naming both (same wire name);
- key of 65 characters → error; `wireName("uploads.delete")` → `"uploads_delete"`;
- command tool on a command whose key is not in its module's `commands` → error naming the key;
- `destructive` omitted or `true` without `confirm: true` → `destructive tool uploads.delete must require confirm`;
  `destructive: false` without `confirm` → accepted;
- command with `access: "global-admin"` → error;
- a query tool input with a top-level field `_sessionToken`, `api_key`, `Authorization`, `PASSWORD` or `secret` →
  error naming the field; `tokenCount` → accepted;
- several problems → one `McpToolError` listing all of them, sorted;
- `defineCommandTool` input = `command.input` extended with `confirm: z.literal(true)` when `confirm: true`;
- catalog row for each tool key; a key in JSON without a definition fails `extension-points-exist.test.ts`.

**Mutacje do zabicia:** disabled-module filter removed; confirm rule removed; wire-name collision check removed;
credential-field check case-sensitive; registry line emitted only when `mcp` is installed; catalog section dropped;
problems reported one at a time.

**Gates:** CLI gate, root `verify`, created project builds with and without a `mcp-tools.ts`.

---

### Task 0.5: `mcp.instructions` in `GatoConfig` **[shared: S4]**

**Branch:** `feat/gato-config-mcp-instructions`

**Files:** `src/shared/lib/modules/gato-config.ts` (`GatoConfig.mcp?: { instructions?: string; tools?: GatoMcpTools }`,
`ProjectGatoConfig`, `gatoConfigProblems`), tests, ADR-60 consequence line; `core` minor. The `tools` shape is typed
and shape-checked here (`allow`/`deny` arrays of strings, `readOnly` boolean); entry semantics come in T0.5b.

**Zachowania:** unset → `undefined`; `"  Notes app  "` → `"Notes app"`; `""` and `"   "` → `GatoConfigError` line naming
`mcp.instructions`; 2000 characters → accepted; 2001 → error; a string with `\u0007` → error; with `\n` → accepted;
`mcp.tools.readOnly: "yes"` → error naming `mcp.tools.readOnly`.

**Mutacje do zabicia:** length off by one; trim removed; control-character check removed or newline refused.

**Gates:** `npm run verify`.

---

### Task 0.5b: `mcp.tools` exposure controls (after T0.4, T0.5)

**Branch:** `feat/mcp-tool-exposure`

**Files:** `src/shared/lib/mcp-tools/exposure.ts` (`filterExposedTools(registry, config)`), validation inside
`mcpToolRegistry`; `core` minor.

**Zachowania:** registry `uploads.list`, `uploads.delete`, `mcp.whoami`: `allow: ["uploads.*"]` → `uploads.list`,
`uploads.delete`; plus `deny: ["uploads.delete"]` → `uploads.list` only; `readOnly: true` → no command tools; unset →
all three; `allow: ["uploads"]`, `["*"]`, `["uploads.li*"]`, `deny: ["uploads.nope"]`, `allow: ["nope.*"]`,
`allow: ["uploads_list"]` (a wire name) → each an `McpToolError` naming the entry; module `upload` with tools does not
match `uploads.*` and `upload.*` does not match `uploads.list`.

**Mutacje do zabicia:** deny not winning; unknown exact key accepted; `readOnly` ignored for one kind; prefix wildcard
match; filter applied after scope filtering only in `tools/list` (it must also gate `tools/call`, covered in T2.2).

**Gates:** `npm run verify`.

---

### Task 0.6: audit `MCP` channel and correlation id (after T0.1) **[shared: S2]**

**Branch:** `feat/audit-mcp-channel-correlation-id`

**Files:** `prisma/schema/audit-logs.prisma` (nullable `correlationId` mapped `correlation_id`, index
`(organizationId, correlationId)`; the `AuditChannel` value `MCP` already came in T0.1), migration owned by
`audit-logs`; the `audit-logs` sink
writes both; the audit-log page shows channel `MCP` with a label in `pl`/`en`, shows the correlation id, and hides
`mcp.tool_called` rows until a toggle is on; `audit-logs` minor; `core` unchanged (T0.1 did `audit.ts`).

**Zachowania:** `trackAudit({ …, channel: "MCP", correlationId: "corr-1" })` → the row has `channel = 'MCP'`,
`correlation_id = 'corr-1'`; without → `null`; the page lists no `mcp.tool_called` row by default and lists it after the
toggle; isolation: a correlation id search never returns another organization's row.

**Mutacje do zabicia:** column not written; filter inverted; toggle default on; index or query without
`organizationId`.

**Gates:** `npm run verify`, `npm run test:integration`, `npx prisma migrate dev` on an own database.

---

### Task 0.7: `GATO_EXPECTED_INSTANCES` **[shared: S6]**

**Branch:** `feat/gato-expected-instances`

**Files:** core env schema (optional positive integer, unset = 1), `.env.example`, `.env.selfhost.example`,
`deploy/helm/gatojs/templates/deployment.yaml` (from `replicaCount`, or `autoscaling.maxReplicas` when autoscaling is
on) and its helm-unittest, `docs/10-wdrozenie.md` and `docs/self-hosting.md` (Compose and Railway set it by hand);
`core` minor. No consumer yet (T2.1 adds the warning).

**Zachowania:** unset → `1`; `"3"` → `3`; `"0"`, `"-1"`, `"1.5"`, `"x"` → startup error naming
`GATO_EXPECTED_INSTANCES`; Helm `replicaCount: 3` → env `"3"`; `autoscaling.enabled: true, maxReplicas: 5` → `"5"`.

**Mutacje do zabicia:** zero accepted; default not 1; Helm takes `minReplicas`.

**Gates:** `npm run verify`, helm-unittest (lesson `install-helm-unittest-from-the-verified-release-archive`).

---

## Phase 1: authorization server

### Task 1.1: module skeleton, env, schema, plugins, guard plugin (after T0.2)

**Branch:** `feat/mcp-module-skeleton`

**Files:**

- `kit/modules/mcp.json` (`0.1.0-alpha` until T4.2, manifest per spec "Manifest": files, dependencies with exact pins,
  env, `schemaRelations` for `User` and `Organization` only (R5), no `requires`); `.wa/kit.json` via `kit sync`.
- `src/features/mcp/module.ts` (`defineModule`: permissions `mcp.connect`, `mcp.write`, `mcp.manage-connections`
  with default roles, `auditActions`), `env.ts` (`MCP_ALLOWED_ORIGINS`, `MCP_CLIENT_METADATA_DOCUMENTS`,
  `MCP_RATE_LIMIT_PER_MINUTE`, `MCP_WRITE_LIMIT_PER_MINUTE`, `MCP_AUDIT_RETENTION_DAYS`; refuses a non-https,
  non-loopback `APP_URL` while the module is enabled, message names `APP_URL`), `auth.ts` (`authPlugins = [jwt(…),
mcp(…), gatoMcpGuardPlugin]` per §4.2 plus R4 `grantTypes`; `cimd()` only with the flag), `auth-client.ts`
  (`oauthProviderClient()`), `extension-points.json`, `i18n/{pl,en}.json` skeleton.
- `src/features/mcp/services/guard-plugin.ts`: `gatoMcpGuardPlugin` with the `/token` 404 and `/oauth2/authorize` ban
  check (registration and consent rules come in T1.3, T1.4).
- `prisma/schema/mcp.prisma`: the eight better-auth tables (generated with `npx auth@<version> generate`, camelCase
  fields mapped to snake_case columns like the core auth models, `Session` relation dropped, R5) plus
  `McpConnectSelection` and `McpGrantActivity`; migration.
- `package.json`: dependencies per "Dependencies"; root `zod` floor `^4.5.4`.
- `mutation-gate.json`: propose `src/features/mcp/services/` as `critical`.

**Zachowania:**

- `checkSchema()` from `await auth.$context` with the module enabled → no difference;
- `APP_URL=http://example.com` with `mcp` enabled → startup fails with a message naming `APP_URL`;
  `http://localhost:3000`, `http://127.0.0.1:3000` and `https://app.example.com` pass; with `mcp` disabled
  `http://example.com` passes;
- `next build` with no reachable database completes and logs no query (L2);
- `GET /api/auth/token` with a valid session cookie → 404;
- AS metadata `grant_types_supported` deep-equals `["authorization_code", "refresh_token"]`;
- `/oauth2/authorize` for a banned user → refused;
- seeded `oauthResource` row for `${APP_URL}/api/mcp` has `allowedScopes` `["mcp:read", "mcp:write", "offline_access"]`
  and `accessTokenTtl` 300 (L1);
- module disabled → `/api/auth/oauth2/register` 404 (plugins filtered out with the module);
- `MCP_CLIENT_METADATA_DOCUMENTS` unset → `cimd` absent from the plugin list; `true` → present.

**Mutacje do zabicia:** `/token` guard removed; https check accepting any `http`; loopback check by prefix
(`http://localhost.evil.example`); resources without `allowedScopes`; `refreshTokenReuseInterval` default kept;
`client_credentials` left in; `cimd` installed by default.

**Gates:** `npm run verify`, `npm run test:integration`, a created project with `mcp` builds and signs in (e2e consent).

---

### Task 1.2: discovery routes (after T1.1)

**Branch:** `feat/mcp-discovery-routes`

**Files:** `src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts` (→ `auth.handler`),
`src/app/.well-known/oauth-authorization-server/[[...path]]/route.ts` (→ `oauthProviderAuthServerMetadata(auth)`), a
shared wrapper in `src/features/mcp/services/discovery.ts` (module check first, CORS `*` on GET/OPTIONS, `no-store` on
404). No OIDC route (R3). Lesson `stryker-mutate-globs-treat-brackets-as-a-class` for the mutate globs.

**Zachowania:** `GET /.well-known/oauth-protected-resource/api/mcp` → 200 JSON with `resource: "<APP_URL>/api/mcp"`,
`authorization_servers: ["<APP_URL>/api/auth"]`, `scopes_supported: ["mcp:read", "mcp:write"]`,
`bearer_methods_supported: ["header"]`; the root PRM path → the same document;
`GET /.well-known/oauth-authorization-server/api/auth` → `issuer: "<APP_URL>/api/auth"`,
`code_challenge_methods_supported: ["S256"]`, `authorization_response_iss_parameter_supported: true`, a
`registration_endpoint`; PRM and AS metadata list `dpop_signing_alg_values_supported` (R2: DPoP is accepted);
AS metadata has no `client_credentials` grant (R4); `OPTIONS` → 204 with `Access-Control-Allow-Origin: *`; GET responses carry it too; module
disabled → 404 with `Cache-Control: no-store` on every path; `/.well-known/openid-configuration/api/auth` and
`/api/auth/.well-known/openid-configuration` → 404 (never 500).

**Mutacje do zabicia:** wrong issuer path; `offline_access` in PRM `scopes_supported`; disabled check removed or after
the handler; CORS header missing on GET.

**Gates:** `npm run verify`, route tests against a test `auth`.

---

### Task 1.3: registration guard (after T1.1)

**Branch:** `feat/mcp-registration-guard`

**Files:** `src/features/mcp/services/guard-plugin.ts` (`/oauth2/register` `before`), a pure
`validateRegistration(body)` in `src/features/mcp/services/registration-rules.ts`.

**Zachowania:** redirect `https://client.example/cb` → 201; `http://127.0.0.1:5555/cb`, `http://localhost:5555/cb`,
`http://[::1]:5555/cb` → 201; `http://client.example/cb` → 400; `http://127.0.0.1.evil.example/cb` → 400;
`https://user:pw@client.example/cb` → 400; `https://client.example/cb#x` → 400; `skip_consent: true` → 400; six
redirect URIs → 400, five → 201; `client_name` of 101 characters → 400, 100 → 201; Claude Code's real registration body
(loopback, no `application_type`) → 201 with `application_type: "native"` (L4).

**Mutacje do zabicia:** loopback check by prefix; fragment check removed; userinfo check removed; `≤ 5` off by one;
`skip_consent` passed through.

**Gates:** `npm run verify`.

---

### Task 1.4: organization picker and consent pages (after T1.1, T0.1, T0.3)

**Branch:** `feat/mcp-consent-pages`

**Files:** `src/app/[locale]/(auth)/oauth/organization/page.tsx`, `src/app/[locale]/(auth)/oauth/consent/page.tsx`,
components under `src/features/mcp/components/`, server actions or commands for the picker (write
`McpConnectSelection`, then `/oauth2/continue` with `postLogin: true`), `postLogin` (`shouldRedirect` checks the stored
row, L8; `consentReferenceId` re-checks membership), `customAccessTokenClaims` (`org_id`, re-checked), the guard
plugin's `/oauth2/consent` `before` (impersonation, membership, `mcp.connect`, `mcp.write`) and `after` (emit
`mcp.connected`); `X-Frame-Options: DENY` and `frame-ancestors 'none'` on both pages; i18n `pl`/`en`.

**Zachowania:** a user with one membership goes from sign-in straight to consent; with two sees both organization names
and not a third one; a superadmin sees only memberships; `postLogin: true` sent without a stored selection →
back to the picker; a selection older than 10 minutes → back to the picker; consent for a user without `mcp.write`
shows no write checkbox and a consent call with `mcp:write` → refused; unticked write → token scope
`mcp:read offline_access`; ticked → `mcp:read mcp:write offline_access`; impersonated session → "Connecting AI apps is
not available while impersonating" and no consent row; expired `oauth_query` → the expiry message and no form; loopback
redirect → the extra warning; access token `org_id` = the picked organization; consent rows for organizations A and B
for one client → two rows (L12); `mcp.connected` emitted once with the picked organization as origin; the client's
`logo_uri` never appears in the HTML.

**Mutacje do zabicia:** picker listing all organizations; `shouldRedirect` trusting `isContinuation`;
`consentReferenceId` not re-checking membership; `customAccessTokenClaims` not re-checking; write granted when
unticked; impersonation check removed; frame headers missing.

**Gates:** `npm run verify`, `npm run test:integration` (in-process OAuth flow through `auth.handler`), `npm run test:e2e`
(both projects; consent needed).

---

## Phase 2: MCP endpoint

### Task 2.1: route, principal resolver, Origin/Host, rate limit (after T1.1, T1.2, T0.1, T0.7; R1 and R2 decided) **[shared: S9]**

**Branch:** `feat/mcp-route`

**Files:** `src/app/api/mcp/route.ts` (§5.2 order; `runtime = "nodejs"`, `dynamic = "force-dynamic"`,
`maxDuration = 60`), `src/features/mcp/services/principal-resolver.ts`, `origin-check.ts`, `rate-limit.ts`,
`correlation-id.ts`, the boot warning in `src/features/mcp/setup.ts`; architecture test: the route and the resolver read
no env except the listed `MCP_*` variables.

**Zachowania:**

- no token → 401 with `resource_metadata="<APP_URL>/.well-known/oauth-protected-resource/api/mcp"` and (R1)
  `scope="mcp:read mcp:write"` (exact header literal pinned); `requiredScopes` stays `["mcp:read"]`: a token with only
  `mcp:read` → 200, a token with only `offline_access` → 403 `insufficient_scope`;
- a token whose `aud` is another resource → 401; a session JWT (`/token` shape, no `azp`) → 401; an expired token → 401;
  a token signed by another key → 401; a token in the query string only → 401;
- a Bearer token without `cnf` and without a `DPoP` header → 200 (R2: Bearer stays accepted);
- DPoP (R2), a token bound to key K (`cnf.jkt` = thumbprint of K), sent as `Authorization: DPoP <token>`:
  - with a fresh proof signed by K, `htm: "POST"`, `htu: "<APP_URL>/api/mcp"`, `iat` now, a new `jti`, `ath` of the
    token → 200;
  - the same token as `Authorization: Bearer <token>` with no `DPoP` header → 401;
  - `Authorization: DPoP <token>` without a `DPoP` header → 401;
  - proof signed by key L ≠ K (thumbprint mismatch with `cnf.jkt`) → 401;
  - proof whose header `jwk` is K but signed by L (bad signature) → 401;
  - proof with `typ: "JWT"` → 401; with `alg: "none"` or `HS256` → 401; with a private `jwk` (has `d`) → 401;
  - `htm: "GET"` → 401; `htu: "https://evil.example/api/mcp"` → 401; `htu: "<APP_URL>/api/mcp?x=1"` → 200 (query
    ignored by normalization);
  - `iat` 301 s in the past → 401; `iat` 6 s in the future → 401; `iat` 299 s in the past → 200;
  - `ath` missing → 401; `ath` of another token → 401;
  - `jti` missing → 401; the same proof (same `jti`) sent twice → first 200, second 401;
  - two proofs with different `jti` → both 200;
  - an unbound token sent with `Authorization: DPoP` and a valid proof for some key → 401 (no `cnf` to bind);
  - behind a proxy (the request object's URL is `http://internal:3000/api/mcp`, `Host` = `APP_URL`'s host) and a proof
    with `htu: "<APP_URL>/api/mcp"` → 200;
  - every 401 above carries a `WWW-Authenticate` challenge (`DPoP` or `Bearer` scheme as the library answers) with
    `resource_metadata`;
- a token for organization A of a user no longer in A → 403 JSON `{ "error": "forbidden" }`; banned user → 403;
  organization deleted → 403;
- `Origin: https://evil.example` → 403; no `Origin` → passes; `Origin` equal to `APP_URL`'s origin → passes; an origin
  in `MCP_ALLOWED_ORIGINS` → passes and gets CORS headers; wrong `Host` → refused;
- `GET` and `DELETE` → 405; module disabled → 404 before any token check (a request without a token still gets 404);
- 121st request in one minute for one `clientId:userId:organizationId` → 429 with `Retry-After`; the same user's
  other organization is counted apart;
- `x-correlation-id: abc-1` → response header `x-correlation-id: abc-1`; `a b` and a 129-character id → a UUID;
- `NODE_ENV=development` with every `MCP_*` variable set and no token → 401;
- `GATO_EXPECTED_INSTANCES=3` → one `logger.warn("MCP rate limits are per instance", { instances: 3, … })` at start;
  unset or `1` → none;
- a legacy (`initialize`) client and a pinned 2026-07-28 client both reach the handler (`getProtocolEra()` asserted).

**Mutacje do zabicia:** audience check removed (custom verify instead of `requireMcpAuth`); Origin check accepting any
origin; rate-limit key without `organizationId`; disabled check after auth; correlation id echoed unvalidated; any
env-dependent auth branch; warning on 1 instance; membership read from the token instead of the database; `challengeScopes`
reduced to `["mcp:read"]` (R1); DPoP replay store replaced by a no-op (`reserve` always `true`) or left to the
in-memory default of `createMcpProtectedRequestHandler` (R2: the store must be `createDpopReplayStore(authContext)`, the
database); request passed to `requireMcpAuth` with the internal URL instead of the `APP_URL`-based one; a pre-check that
strips the `DPoP` header or rewrites `Authorization: DPoP` to `Bearer`; a branch that accepts a `cnf` token without a
proof.

**Gates:** `npm run verify`, `npm run test:integration`, mutation task + gate (route and resolver `critical`).

---

### Task 2.2: tool adapter, error mapping, `mcp.whoami`, instructions (after T2.1, T0.4, T0.5, T0.5b)

**Branch:** `feat/mcp-tool-adapter`

**Files:** `src/features/mcp/services/server-factory.ts` (per-request `McpServer`, tools filtered by exposure, scope,
module access and permission), `tool-adapter.ts` (§5.5, §5.6), `serialize-tool-result.ts` (§6.4), `instructions.ts`
(§6.3), `src/features/mcp/mcp-tools.ts` (`mcp.whoami`).

**Zachowania:** instructions = project text then the fixed safety text (last); default text with the project name when
unset; a configured text containing the value of `BETTER_AUTH_SECRET` → startup error naming `mcp.instructions`; a
value shorter than 8 characters is not checked; `tools/list` with `mcp:read` → no command tools; with `mcp:write` and
role `member` → no `audit-logs.list`; `mcp.tools.deny` hides a tool and a call by name → unknown tool (`-32602`);
`whoami` → `{ user: { id, name }, organization: { id, name }, role, scopes, app }` and no `email` key; a Prisma error
inside a tool → text `The operation failed. Reference: <correlationId>` and no Prisma text; `DomainError("x")` → `x`;
`OperationResult` `{ success: false, error: "Nie znaleziono pliku" }` → that text, `isError: true`;
`ModuleAccessDeniedError` → "This tool is not available to you in this organization"; invalid input → `isError` naming
the field; a destructive tool without `confirm` → `isError`, command not run; `serializeToolResult` (`test.prop`):
output ≤ 50,000 characters and valid JSON, `truncated: true` only when shortened; every result has
`_meta.correlationId`.

**Mutacje do zabicia:** tool list not filtered by scope; exposure filter only on list, not on call; unknown error message
passed through; hidden tool callable by name; safety text before the project text; confirm stripped before validation.

**Gates:** `npm run verify`, `npm run test:integration`, mutation (adapter and exposure `critical`).

---

### Task 2.3: tool-call auditor (after T2.2, T0.6)

**Branch:** `feat/mcp-tool-call-audit`

**Files:** `src/features/mcp/services/tool-call-auditor.ts` (wraps the JSON-RPC exchange in the route; §8), log line.

**Zachowania:** spec §11 "Audit of every call": a read call → exactly one `mcp.tool_called` row, `outcome: "ok"`,
`argKeys: ["limit", "offset"]`, no argument value anywhere in the row; unknown tool name → one row `denied` with the
requested name cut to 128 characters; schema failure → `invalid_input`; write without `mcp:write` → `mutation_denied`;
121st request → `rate_limited`; a command returning `success: false` → `failed`; a thrown Prisma error → `error`; a write
call → the command's row and the `mcp.tool_called` row with the same `correlationId`, equal to the client's
`x-correlation-id`; 70 argument keys → 64 sorted keys; a request without a token → no row; the SDK's refusal result is
unchanged except `_meta.correlationId`; outcome type is a closed union (a type test).

**Mutacje do zabicia:** SDK refusals not audited; argument values written; key cap removed; `ok` for a failed command;
correlation id regenerated per row; rows written without a principal.

**Gates:** `npm run verify`, `npm run test:integration`, mutation (auditor `critical`).

---

## Phase 3: tools, connections UI, events

### Task 3.1: command tool `uploads.delete` (after T2.3)

**Branch:** `feat/uploads-mcp-delete-tool`

**Files:** `src/features/uploads/mcp-tools.ts`, `src/features/uploads/extension-points.json` (`mcpTools`), `uploads`
minor.

**Zachowania** (integration, organizations A and B): token for A deletes A's upload → success, audit row
`channel: "MCP"`, `credentialId` = client id, `uploads.deleted` emitted once; B's upload id → the command's failure
message, B's row intact; without `confirm` → `isError`, nothing deleted; member deleting another member's file without
`uploads.delete-others` → the command's denied message; a global `admin` who is a `member` of A cannot delete another
member's file over MCP.

**Mutacje do zabicia:** `confirm` not required; command `run` called directly instead of `runCommand`; audit channel
missing.

**Gates:** `npm run verify`, `npm run test:integration`.

---

### Task 3.2: query tools `uploads.list`, `audit-logs.list`, `users.list-members` (after T2.3)

**Branch:** `feat/mcp-query-tools`

**Files:** `src/features/uploads/services/queries/list-uploads-query.ts` (new; `uploads` has no query folder today) and
`mcp-tools.ts`; `src/features/audit-logs/mcp-tools.ts` (query without `oldData`/`newData`); `src/features/users/mcp-tools.ts`
(core) with a members query returning names and roles only; catalog rows; `uploads`, `audit-logs` minors, `core` minor.

**Zachowania:** A sees only A's rows in each tool; `uploads.list` items have no storage key and no URL;
`audit-logs.list` items have no `oldData`/`newData`; `users.list-members` items have no `email` for any caller, owner
included; no `users_invite` in `tools/list` for an owner with `mcp:write`; `limit: 101` → `isError`; defaults
`limit: 50, offset: 0`; a result over 50,000 characters → `truncated: true`; a `member` does not see `audit-logs.list`.

**Mutacje do zabicia:** `organizationId` filter removed; email included; limit cap removed; secret fields selected.

**Gates:** `npm run verify`, `npm run test:integration`.

---

### Task 3.3: connected AI apps, `mcp.disconnect`, subscribers (after T1.4, T2.1)

**Branch:** `feat/mcp-connections`

**Files:** `src/features/mcp/services/commands/disconnect-command.ts`, `services/queries/list-my-connections.ts`,
`events.ts`, `subscribers.ts` (`organizations.member-removed`, audit rows for `mcp.connected`/`mcp.disconnected`),
the `account.sections` server contribution, `McpGrantActivity` updates (at most once a minute per grant).

**Zachowania:** account page lists the client name (as a claim), redirect host, organization, scopes, connected at,
last used; "Disconnect" removes consent, access and refresh tokens of that user, client and organization only (another
user's grant and the same user's grant in B stay); the next refresh → `invalid_grant`; removing the member from A
deletes their A grants in one transaction, B grants stay; audit rows `mcp.connected`, `mcp.disconnected` with
`reason: "user"` / `"member-removed"`; the UI says the access token stays valid for up to 5 minutes; in service mode the
command needs the confirmation.

**Mutacje do zabicia:** disconnect filter without `userId`; without `referenceId`; subscriber revoking all
organizations; activity written on every request.

**Gates:** `npm run verify`, `npm run test:integration`.

---

### Task 3.4: organization view and `mcp.revoke-connection` (after T3.3)

**Branch:** `feat/mcp-organization-connections`

**Files:** `src/app/[locale]/(app)/ai-connections/page.tsx`, nav item `mcp.connections`, command
`revoke-connection-command.ts`, query `list-organization-connections.ts`, components, i18n.

**Zachowania:** spec Task 3.4 list (owner O of A, member M of A and B, client C): O sees "M · C" for A only; O revokes →
M's A grant gone, B grant stays, next refresh for A → `invalid_grant`; one `mcp.disconnected { userId: M, clientId: C,
reason: "admin" }` with origin A and actor O, one audit row; M calling the command → denied, nothing deleted; M opens
`/ai-connections` → 404; revoking a `userId` with a grant only in B → failure message, B grant stays; superadmin in
service mode in A without confirmation → "Potwierdź zmianę w trybie serwisowym", nothing deleted; with
`{ serviceModeConfirmed: true, organizationId: A }` → revoked, audit row `serviceMode: true`; page and nav absent when
`mcp` is disabled; nav hidden for `member`; no email in the table.

**Mutacje do zabicia:** `referenceId` filter removed; `can("mcp.manage-connections")` removed; command run outside
`runCommand`; `reason` hard-coded `"user"`; audit row missing.

**Gates:** `npm run verify`, `npm run test:integration`, `npm run test:e2e`.

---

## Phase 4: docs, e2e, release

### Task 4.1: docs, ADR, catalog

**Branch:** `docs/mcp-module`

**Files:** `docs/20-mcp-module.md`, `docs/20b-mcp-module-usage.md` (§13 Phase 4 list, plus R1 (write scope in the challenge) and R2 (DPoP accepted with full proof verification), the
multi-instance rate-limit limitation, `GATO_EXPECTED_INSTANCES`, the no-bypass rule, audit outcomes and retention, the
troubleshooting table from §12 and the spike lessons); ADR (number per S10) "MCP tools run as the signed-in user in one
organization through a request principal, capped to the organization role and never in service mode"; ADR-66
consequence note for the CIMD opt-in; `docs/adrs/README.md` row; Task Router row in `AGENTS.md` (budget test);
`.github/README.md` status; `EXTENSION_POINTS.md` regenerated; `docs/lessons.md` updated if tasks added lessons.

**Gates:** `npm run verify` (catalog and budget tests).

### Task 4.2: e2e, interop, egress, release (after T4.1) **[shared: S11]**

**Branch:** `feat/mcp-release`

**Files:** `e2e/mcp-*.spec.ts` (both projects: discovery, a Node MCP client with a loopback redirect drives sign-in,
picker (multi-org), consent in `pl` and `en`, lists tools; "Disconnect" makes the next refresh fail), egress-check leg
with `mcp` installed and CIMD off, `assemble` matrix entry, `kit/modules/mcp.json` `0.1.0`; manual interop checklist
(MCP Inspector, Claude Code, claude.ai custom connector, ChatGPT connector) recorded in the PR.

**Gates:** `npm run verify`, `npm run test:e2e` (consent), egress check, `assemble` locally.

### Task 4.3: retention schedule and the organization purge (after T4.2, the jobs module, jobs Task 7a) **[shared: S7, S8]**

**Branch:** `feat/mcp-retention`

**Files:** `src/features/mcp/jobs.ts` (daily schedule deleting `mcp.tool_called` rows older than
`MCP_AUDIT_RETENTION_DAYS`, organization-scoped per jobs §9.3), a subscriber of `organizations.deleted` deleting OAuth
consents and tokens whose `referenceId` is the deleted organization (non-queued, per jobs §9.4 rules), docs.

**Zachowania:** rows of 91 days deleted, 89 kept, other actions untouched, organization B untouched by A's run; unset →
90; `0` → refused at startup; without the jobs module the schedule is declared and does not run (doctor warning);
`organizations.deleted` for A → A's consents and tokens gone, B's stay.

**Mutacje do zabicia:** `<` → `>`; action filter removed; organization filter removed; purge by `userId` instead of
`referenceId`.

**Gates:** `npm run verify`, `npm run test:integration`.

---

## Phase 5 (later): human approval mode

Spec §13 Phase 5 (`mcp.mutations: "direct" | "approval" | "deny"`, `McpPendingAction`, `/ai-actions`, outcome
`pending_approval`). Its own plan with "Zachowania" and "Mutacje do zabicia" when it is scheduled.
