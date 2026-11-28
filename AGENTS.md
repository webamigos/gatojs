# AGENTS.md

Instructions for agents (Claude Code, Codex, Cursor, Copilot) working in this repository.
`CLAUDE.md` holds the hard rules and imports this file; keep the two consistent.
Read `AGENTS.project.md` first when it exists: project rules there win over generic advice, never over the hard rules.

## What this is

A Next.js app assembled from the **GatoJS** kit: the core (auth, organizations, users, account, dashboard)
plus modules. `.wa/kit.json` records the kit state.

**Core and module code comes from the GatoJS kit (`.wa/kit.json`); send general fixes to the `webamigos/gatojs` repo.**
Make project-specific changes locally; send fixes that would help other projects to the kit as a PR.

Kit documentation: https://docs.gatojs.com. It describes the latest kit version; the project's version is in `.wa/kit.json`.

## Priorities

correctness → maintainability → readability → consistency → performance → delivery speed.

## Task Router

Task → where to look. Documentation pages live under https://docs.gatojs.com; skills in `.claude/skills/`.

| Task | Where to look |
| --- | --- |
| Changing GatoJS behaviour (hide, replace, react, block) | `EXTENSION_POINTS.md`; skill `gato-extend` (`.claude/skills/gato-extend/SKILL.md`); never edit a Gato file without `npm run wa -- eject` |
| New feature or module | skill `wa-new-module`; `projectModules` in `.wa/kit.json`; https://docs.gatojs.com/guides/build-a-feature, https://docs.gatojs.com/guides/finish-a-feature |
| Query or command on organization data | `src/shared/lib/auth/org-context.ts`; "Data and organizations" below; https://docs.gatojs.com/concepts/organizations |
| Cross-organization read | `withoutTenantScope(reason, fn)` from `src/shared/lib/tenant-scope/`, only with a reason; https://docs.gatojs.com/concepts/organizations |
| Service mode | `src/shared/lib/auth/service-mode.ts`, `src/shared/components/service-mode/use-service-mode-action.tsx`; https://docs.gatojs.com/concepts/superadmin-and-service-mode |
| Auth and roles | `src/shared/lib/auth/`; https://docs.gatojs.com/concepts/auth-and-roles |
| Prisma migration | `prisma/schema/`; https://docs.gatojs.com/guides/database-and-migrations |
| Environment variable | `packages/env/` (`@gatojs/env`: core schema, `httpUrl()`, `blankAsUndefined()`, `allOrNone`, `requiredForProvider`), `src/env.ts` (`import { env } from "@/env"`), `src/features/<x>/env.ts`, `.env.example`; https://docs.gatojs.com/configuration/environment-variables |
| i18n | `src/app/messages/`, `src/features/<x>/i18n/`; https://docs.gatojs.com/guides/i18n |
| Mail | `src/shared/lib/mailer.ts`, `src/app/emails/`; https://docs.gatojs.com/guides/email |
| Files (`uploads` module) | https://docs.gatojs.com/modules/uploads |
| API keys (`api-keys` module) | https://docs.gatojs.com/modules/api-keys |
| Audit log | `trackAudit` in `src/shared/lib/audit.ts`; `audit-logs` module: https://docs.gatojs.com/modules/audit-logs |
| Generated files, `wa` CLI | `npm run wa -- generate`; https://docs.gatojs.com/concepts/module-registry, https://docs.gatojs.com/cli/overview |
| Dependency upgrade | skill `wa-upgrade-dependency` |
| Task with tests (feature, fix, module) | skill `gato-task` (`.claude/skills/gato-task/SKILL.md`); without skills: "Running a task" below |
| Tests and mutations | "Tests" below; `.claude/agents/test-writer.md`, `.claude/agents/test-reviewer.md`, `mutation-gate.json`; https://docs.gatojs.com/guides/testing, https://docs.gatojs.com/guides/ai-agents |
| Reviewing a change | skill `wa-code-review` (`.claude/skills/wa-code-review/SKILL.md`, plain Markdown: any agent or human can read it); CodeRabbit is optional, not a gate |

## Commands

```bash
npm run verify               # gate: lint → typecheck → test → build → hook tests
npm run dev                  # dev server (port 3000)
npm run build                # production build (output: standalone)
npm test                     # Vitest (src/**, scripts/**)
npm run test:e2e             # build + Playwright (needs docker compose up -d)
npm run test:integration     # Vitest on real Postgres (INTEGRATION_DATABASE_URL, *_test database)
npm run test:mutation        # Stryker on logic (incremental), report in reports/mutation/
npm run test:mutation:integration   # Stryker under the integration tests (needs the database)
npm run test:mutation:gate   # critical-file gate (mutation-gate.json) over the Stryker reports
npm run test:mutation:task -- src/a.ts,src/b.ts   # mutations only in the task's files
npm run admin:create -- --email <email>   # first admin + first organization
npm run wa -- generate   # refresh generated files
npm run wa -- update <version>   # move the project to a newer kit version
npx prisma migrate dev --name <name>     # new migration
```

## Hard rules

### Data and organizations

- **Queries on domain data always go through `getOrgContext()` and an `organizationId` filter.**
  `getOrgContext()` (`src/shared/lib/auth/org-context.ts`) returns `{ userId, organizationId, orgRole, userRole, serviceMode }`
  from the session and throws `NoOrganizationError` when the user has no active organization. Prisma does not filter
  automatically: every domain query filters by `organizationId` explicitly. A runtime guard
  (`src/shared/lib/tenant-scope/`) throws `TenantScopeError` on a query without an organization filter on a model
  with `organizationId` (except `Member`/`Invitation`); a deliberate cross-organization read goes only through
  `withoutTenantScope(reason, fn)`.
- Module pages are protected by `requireModuleAccess(key)` (`src/shared/lib/auth/require-module-access.ts`), which reads
  the module registry. Hiding a navigation entry is not protection.
- A module's route handler or server action that doesn't call `requireModuleAccess` starts with `isModuleEnabled(key)`
  (route: `404`) or `requireModuleEnabled(key)` (`src/shared/lib/modules/require-module-enabled.ts`); a test checks it.
- Every server action checks permissions itself (an action is a POST endpoint; it does not go through the page layout).
- **Commands on organization data confirm service mode.** The contract:
  - signature `(input: unknown, confirmation?: unknown)`;
  - right after `getOrgContext()` or `requireModuleAccess()`, call
    `assertServiceModeConfirmed(context, confirmation)` (`src/shared/lib/auth/service-mode.ts`), before the first
    Prisma access;
  - or return `runCommand(command, input, confirmation)` for a `defineCommand` command (`src/shared/lib/commands/`):
    it runs the guards, the confirmation and other modules' `before` hooks in a fixed order (ADR-62);
  - in service mode (`serviceMode: true`) without the confirmation `{ serviceModeConfirmed: true, organizationId }`
    of the active organization, the command returns the error "Potwierdź zmianę w trybie serwisowym" ("confirm the change
    in service mode"); outside service mode only a missing confirmation or a confirmation of the active organization
    passes (a stale tab after switching organizations gets an error);
  - the UI calls the command through `useServiceModeAction().run(command, input)`
    (`src/shared/components/service-mode/use-service-mode-action.tsx`) and renders the returned `dialog`;
    after "Cancel", `run` returns `null`. A write outside a server action (`fetch` to a route handler) takes the
    confirmation from the same hook's `requestConfirmation()` and passes it to the server; `null` means "Cancel". Modules
    don't write their own dialog. A command called from the UI directly in service mode fails, and no test catches that.

### No comments in code

- No comments in `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` files. Code explains itself through names.
- Allowed only: `// WHY: …` (max 3 lines) for a non-obvious reason, and tool directives
  (`@ts-expect-error`, `eslint-disable…`, `@vitest-environment`, `prettier-ignore`, shebang).
- The `.claude/hooks/block-comments.mjs` hook (PreToolUse on `Edit|Write`) blocks other comments.

### Modules and generated files

- A module does not edit core files. The only joining points: `src/modules.generated.ts`,
  `src/modules.client.generated.ts` and marker regions:
  - `prisma/schema/auth.prisma`, `prisma/schema/organizations.prisma`: `// wa:relations:start/end`
  - `.env.example`: `# wa:modules:start/end`
  - `docker-compose.yml`: `# wa:services:start/end`
  - `docker-compose.selfhost.yml`: `# wa:services:start/end`
  - `.env.selfhost.example`: `# wa:modules:start/end`
- Gato files (a content hash in `modules.*.files` of `.wa/kit.json`) are protected: use an extension point from
  `EXTENSION_POINTS.md`, or `npm run wa -- eject <file> --reason "<why>"`. The `.claude/hooks/protect-gato-files.mjs`
  hook blocks edits of one and of generated files.
- Don't edit generated files or regions by hand. Run `npm run wa -- generate`. CI checks that `generate` leaves no diff.
- Features written in the project (not from the kit) have an entry in `projectModules` in `.wa/kit.json`: just a
  `manifest` (with `src/features/<x>/**` in `files`), no version or hashes. `wa generate` registers them after the kit
  modules; `wa kit sync` leaves them alone. Core tests compare the registry with core modules only (`src/test/core-modules.ts`),
  so a new feature doesn't require changing core files.
- Every module: `src/features/<x>/module.ts` with `export default defineModule({...})`; optionally `env.ts`
  (`envSchema`), `auth.ts` (`authPlugin`, or `authPlugins` for several), `auth-client.ts` (`authClientPlugin`), `i18n/{pl,en}.json`.

### Structure

```
src/features/<x>/
├── components/          React + __tests__/
├── contracts/           types and Zod schemas (*.types.ts, *.schemas.ts)
└── services/
    ├── commands/        writes: "use server", return OperationResult<T>
    └── queries/         reads
src/shared/{lib,components,utils,types,config}
src/components/ui        shadcn (base-ui)
src/app/[locale]/(auth|app)
```

- Business logic doesn't go into components, `page.tsx`, `layout.tsx` or route handlers.
- Prisma only in commands/queries/services, never in the UI.
- Validate every external input with Zod; schemas live in `contracts/`.
- Server actions: validation → authorization → service call; they return `OperationResult<T>`
  and handle errors through `handleCommandError()`.
- Look for an existing implementation first (DRY). Don't introduce new patterns without a need.
- No nested ternaries (`no-nested-ternary`), no silent `catch {}`, no `any`.
- Set an error class's `name` as a string (`this.name = "KeyLimitError"` or a field `name = "KeyLimitError"`); ESLint rejects
  `this.constructor.name`, `new.target.name` and `KeyLimitError.name`, because the build minifies class names.
- A class that extends `Error` directly has its own `name`: a field `name = "KeyLimitError"` or `this.name = "KeyLimitError"`
  as a separate constructor statement (not inside an `if` or a function). ESLint flags a class without it outside tests, `e2e/`
  and `*.d.ts` files. Add your own `no-restricted-syntax` selectors in `eslint.config.mjs` with
  `...restrictedSyntax([{ selector, message }])` from `@gatojs/eslint-config`: a later `no-restricted-syntax` replaces the list.
- Lint rules live in `packages/eslint-config` (`@gatojs/eslint-config`; `/next` for the app, `/node` for Node tools):
  `eqeqeq`, `curly`, `no-nested-ternary`, `consistent-type-imports`, and `no-console` outside tests (the logger is the output).

### Auth

- better-auth with the `admin` and `organization` plugins. Global roles: `user | admin | superadmin`; organization roles:
  `owner | admin | member`.
- `superadmin` is the service account of the team that builds and supports the app (Web Amigos for its own projects):
  it has everything `admin` has, plus impersonation (except of other superadmins).
  An admin can't perform any `ADMIN_TARGET_PATHS` action on a superadmin account (role, ban, removal, password, email,
  impersonation, sessions) or grant the `superadmin` role (a `before` hook on `/admin/*`). `ADMIN_IMPERSONATION=true`
  lets an admin impersonate a regular `user`.
- A superadmin can enter any organization, always one at a time (no aggregate views). Without a membership,
  `getOrgContext()` returns `orgRole: "owner"` and `serviceMode: true` (service mode): the layout shows a service mode
  banner with the organization name, and every data change needs confirmation in a dialog (contract in "Data and organizations").
- Sign-up goes through a server-side gate: with `AUTH_PUBLIC_SIGNUP=false` only with a valid `invitationId`.
- `MULTI_ORG=false`: one organization (the oldest); `MULTI_ORG=true`: every sign-up creates its own
  organization, and `OrgSwitcher` is visible.
- First admin: `npm run admin:create -- --email <email>` (without `--password` the password is generated and printed once).
  `--role superadmin` creates a service account (default `admin`); the script never lowers an existing account's role.

### i18n

- next-intl, default `pl`, `en` available (`localePrefix: "as-needed"`).
- A module's strings live in `src/features/<x>/i18n/{pl,en}.json`; shared ones in `src/app/messages/`.

### Mail

- `MAIL_PROVIDER` (`smtp`/`resend`/`console`) or detection: SMTP (`SMTP_URL`, mailpit in dev/e2e, or `SMTP_HOST`) wins
  over `RESEND_API_KEY`, else mail is only logged. Production needs a provider or `MAIL_PROVIDER=console` (ADR-64).

## Tests

- Unit/integration: Vitest + Testing Library, files in `__tests__/` next to the code.
- E2E: Playwright in `e2e/`. Two projects with separate servers (`node .next/standalone/server.js`):
  `core-auth` (port 3000, `MULTI_ORG=false`, `AUTH_PUBLIC_SIGNUP=false`) and
  `multi-org` (port 3001, `MULTI_ORG=true`, `AUTH_PUBLIC_SIGNUP=true`).
  `globalSetup` resets the database (only when its name ends with `_e2e`) and runs `admin:create`. Emails are read by `getLastMail(to)` from the mailpit API.
- A bugfix comes with a test that fails without the fix.
- Integration: `*.integration.test.ts`, run with `npm run test:integration` (separate config
  `vitest.integration.config.ts`, not part of `npm test`). Database from `INTEGRATION_DATABASE_URL`
  (default address in `src/test/integration/database-url.ts`, database `<project_name>_test`); the name must end with
  `_test`, because `resetDatabase()` wipes tables. Locally: `docker compose up -d db`. Helpers in
  `src/test/integration/`. Every new query or command on domain data gets an isolation test:
  two organizations, and a read or write with one's context doesn't touch the other's data.
- The architecture test `src/__tests__/server-entrypoints-guard.test.ts` requires every exported
  function in a `"use server"` file and in `services/queries/` to call a session guard (`getOrgContext`,
  `requireModuleAccess`, `getAdminUserOrNull`, …) before accessing Prisma. Add an exception to
  `UNGUARDED_ALLOWED` with a justification.
- The same test requires every exported function in a `"use server"` file that calls `getOrgContext` or
  `requireModuleAccess` (directly, through a local helper, an import alias or a module constant) to also call
  `assertServiceModeConfirmed` before the first Prisma access. The analysis is syntactic: it catches mistakes,
  not deliberate masking. Known limits:
  - order is checked only against Prisma; an assert called after a service from another module passes,
    so call it right after getting the context;
  - the rule also covers read-only `"use server"` actions and has no exception map;
  - inline server actions (`"use server"` inside a function body) aren't covered by any rule of the test;
  - the analysis covers only local top-level functions: context or Prisma in a service from another module
    or in a helper that is an object method is invisible;
  - an assert in a dead branch, swallowed in `try/catch` or called conditionally counts as called; event order
    is syntactic, without control flow;
  - spoofing: a local declaration of `assertServiceModeConfirmed` or a guard, a call through a property of a foreign
    object (`fake.getAdminUserOrNull()`), mutating the confirmation object in place
    (`confirmation.organizationId = …`, `Object.assign`), assignment through destructuring,
    shadowing a parameter name;
  - aliases other than a module-level `const x = <identifier>` (destructuring, a `let` assigned later,
    a parameter) and Prisma re-exported through a module other than `@/shared/lib/prisma`.

### Tests that try to break the code

A test written by the code's author, after the code, reproduces the author's assumptions and passes trivially
(rationale and sources: `docs/superpowers/notes/2026-10-27-adversarial-testing-research.md`, Polish).

- **Plan:** every task has a "Behaviors" section (input → expected result as a literal) and a
  "Mutations to kill" section (e.g. "removing the `organizationId` filter", "the `member` role gets access").
- **Tester ≠ implementer.** A task's tests are written by the `test-writer` subagent (`.claude/agents/test-writer.md`)
  from the plan and signatures, before the implementation; their red run is visible.
- **Tests are read-only for the implementer.** Before starting it, the orchestrator writes
  `implement` to `.gato/phase` in the implementer's working copy (its worktree, not the main copy),
  and the `.claude/hooks/protect-tests.mjs` hook blocks edits to `__tests__/`, `*.test.*`, `*.spec.*` and `e2e/`.
  After the implementation the orchestrator deletes the file. The implementer reports a wrong test instead of fixing it.
- **Running a task** (the `gato-task` skill; an agent without skills follows these steps). The orchestrator,
  the main agent session, writes neither tests nor code:
  1. plan with "Behaviors" and "Mutations to kill", saved as a spec or plan file;
  2. `test-writer` writes the tests from the plan and signatures and shows a red run for the right reason;
  3. the orchestrator writes `implement` to `.gato/phase` in the implementer's working copy;
  4. the implementer makes the tests green without touching them and reports a wrong test;
  5. the orchestrator removes the phase file;
  6. `test-reviewer` runs `npm run test:mutation:task -- <files>` and `npm run test:mutation:gate`;
     gaps go back to `test-writer`, `allowed` entries are only proposed;
  7. gates: `npm run verify`, `npm run test:integration` for data code, the `wa-code-review` skill.
  The superpowers plugin (recommended in `.claude/settings.json`) can help with planning and with running
  subagents, but it is optional: nothing in GatoJS depends on it.
- **The expected value is a literal** or a value from the spec. Never compute it with production code,
  a copy of its algorithm, a loop or a helper.
- **Boundaries get negative tests:** invalid input, no session, another organization, too low a role,
  a failing dependency.
- **Mock only I/O.** Don't mock the module that contains the security rule under test,
  and don't assert on the mock itself.
- **Pure functions with an invariant** (parsers, serialization, normalization, slug) get `test.prop`
  from `@fast-check/vitest`.
- **The test reviewer** (`.claude/agents/test-reviewer.md`) runs
  `npm run test:mutation:task -- <task files>`. Every surviving mutant in changed lines is a gap
  (back to the tester), an equivalent mutant (with a justification) or message/log text. Security
  logic (auth, organizations, roles, guards, sign-up) can't have gaps.
- Full run: `npm run test:mutation` (Stryker, incremental mode, report in `reports/mutation/`).
  It's not part of `npm run verify` or automatic CI: mutations run locally (the reviewer on every
  task, a full run before a kit release). `.github/workflows/mutation.yml` runs only when triggered by hand
  (`workflow_dispatch`). The run fails below the `thresholds.break` threshold (75%, baseline 77%).
  Never lower the threshold to let a change through.
- **Critical-file gate** (`npm run test:mutation:gate`, `mutation-gate.json`): in files on the `critical` list
  (auth, organizations, users, the gate) every surviving mutant must be killed or have an `allowed` entry
  with a justification: an equivalent mutant, message/log only, or a deliberate config constant. A human adds
  and approves entries in a PR; an agent only proposes them. A stale entry (mutant already killed) also stops the gate.
  The integration report is merged with the unit one: a mutant killed in either counts as killed. Mutation exceptions go in `mutate`
  in `stryker.config.json`, not in a `// Stryker disable` comment.

## Commits

Conventional Commits, lowercase subject. Husky runs lint-staged and commitlint.
Before handing work over: `npm run verify`.
