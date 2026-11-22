# Harness from Ragen, phase 1 — implementation plan

**Goal:** The kit core gets architecture tests that guard repo consistency, a runtime organization guard that throws on a query without `organizationId`, plus project skills, a Task Router in `AGENTS.md` and a `permissions` allowlist.

**Spec:** [docs/superpowers/specs/2026-11-21-harness-from-ragen-design.md](../specs/2026-11-21-harness-from-ragen-design.md). Read it together with this plan.

**Execution:** three tasks in parallel in separate worktrees (Orca workers), each on its own branch from `feat/harness-from-ragen`. The coordinator merges them and runs Task 4 (integration).

## Global Constraints

- The rules in `CLAUDE.md` and `AGENTS.md` apply to every task: no code comments except `// WHY:` (at most 3 lines) and tool directives; no `any`, nested ternaries or silent `catch {}`; Zod on external input; an error class `name` set as a string.
- **Do not change `version` in `kit/modules/core.json`** or any module version. Task 4 does that. Only add new entries to `files` (when the task needs it) and run `npm run wa -- kit sync && npm run wa -- generate`.
- Decision numbers are assigned: Task 1 → D50, Task 2 → D51, Task 3 → D52. Do not take others.
- Do not edit generated files or `wa:*` regions.
- The plan does not change `kit/cli/src`. If a change turns out to be needed, stop and ask the coordinator.
- Unit tests must not depend on a local `.env`: `env -i PATH="$PATH" HOME="$HOME" npx vitest run <files>`.
- `allowed` entries in `mutation-gate.json` are added by a human. The agent proposes them in its report with a reason.
- Commits: Conventional Commits, lowercase subject, footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Core and module changes in separate commits (`kit/CLAUDE.md`).
- No push, PR or workflow runs.
- New content is written in English. Existing Polish docs stay as they are until the English migration; edit them in their current language. In every changed `docs/` file, update the `Zweryfikowano z kodem: <short sha>, <date>` header.

## Setup (each worker, once)

- `npm ci` and `npm ci --prefix kit/cli` in your worktree.
- Integration tests: `docker ps`; pass a running Postgres in `INTEGRATION_DATABASE_URL` (a database with the `_test` suffix). If there is none: `docker compose up -d db`. Do not stop other projects' containers.
- Read `kit/CLAUDE.md`, `docs/08-testy.md`, `docs/08b-testy-adwersarialne.md`, `docs/11-praca-z-kitem.md`.

## Process for each task

1. The `test-writer` subagent writes tests from "Behaviours" and "Mutations to kill". It shows a red run for the right reason.
2. `printf implement > .superpowers/phase` in your worktree. Implement without touching tests. Report a wrong test instead of fixing it.
3. `rm .superpowers/phase`. The `test-reviewer` subagent: `npm run test:mutation:task -- <files>` and `npm run test:mutation:gate`.
4. `npm run verify` → PASS. Commits.
5. Report to the coordinator: branch, commits, gate results, surviving mutants with classification, proposed `allowed` entries, everything unverified.

---

### Task 1: Architecture tests in the core

**Branch:** `feat/harness-arch-tests`

**Files:**
- Create: `src/__tests__/architecture/*.test.ts` (the seven tests from spec §3) and, if needed, `src/__tests__/architecture/repo-files.ts` (shared file reading: `git ls-files`, or a directory walk that skips `node_modules`, `.next`, `src/generated`, `reports`, `.stryker-tmp`).
- Modify: `kit/modules/core.json` → `files` += `"src/__tests__/architecture/**"`.
- Modify: files where a test finds a violation (fixed in the same task).
- Docs: `docs/08-testy.md` (a new "Architecture tests" section: the list, the invariants, how to add a test), `docs/decyzje.md` (D50: context = research from Ragen, decision, rejected: tests only in the kit repo, ESLint instead of tests; consequences: a test fails in a project that changes a core file in an incompatible way).

**Interfaces / rules:**
- The tests are plain Vitest tests in `npm test` (no database, no network). Each reads files from disk, relative to the repo root.
- Each test has an exported pure detection function (for example `findUndocumentedCommands(markdown, scripts)`) tested on literals **and** one call on the real repo (`expect(violations).toEqual([])`). A violation message names the file and the value.
- `cited-paths-exist`: a path is text in backticks or a Markdown link target that starts with `src/`, `prisma/`, `scripts/`, `e2e/`, `.claude/`, `.github/`, `kit/`, `docs/`, or is a file name in the root with an extension. References to `docs/` and `kit/` in project files point at the `webamigos/wa-kit` repo and are skipped (those directories are `kitOnly`). Patterns with `<`, `*` or `{` are skipped. An `#…` anchor is cut off.
- `i18n-keys-exist-in-every-locale`: a key is the full leaf path (`a.b.c`). The report names the file, the locale and the missing keys.
- `env-example-passes-validation`: parse `.env.example` (`KEY=value`; `#` lines and empty lines skipped; surrounding quotes removed from the value) and pass it to `checkEnv` with `NODE_ENV` overridden to `"development"`.
- `node-version-is-one-number`: the major from `.nvmrc` (for example `22`, `v22.14.0` → `22`); every `FROM node:<tag>` line in the `Dockerfile`; every literal `node-version:` in `.github/workflows/*.yml` is a violation.
- `client-bundles-stay-server-free`: `.ts/.tsx` files in `src/` with a `"use client"` directive as the first statement; static imports and `import()` with a literal.

**Behaviours** (detection functions, on literals):
- `findUndocumentedCommands("run `npm run verify` and `npm run nope`", { verify: "x" })` → `["npm run nope"]`.
- `findUndocumentedCommands("npm run wa -- generate", { wa: "x" })` → `[]` (arguments after the script name are ignored).
- `isWithinBudget(31744)` → `true`; `isWithinBudget(31745)` → `false`.
- `findMissingKeys({ pl: { a: { b: "x" }, c: "y" }, en: { a: { b: "x" } } })` → `[{ locale: "en", key: "c" }]`.
- `findMissingKeys({ pl: { a: "x" }, en: { a: { b: "y" } } })` → reports `a` in `pl` as missing `a.b` and `a` in `en` as missing leaf `a` (a different shape is a violation both ways).
- `parseDotenv("A=1\n# x\n\nB=\"two\"\n")` → `{ A: "1", B: "two" }`.
- `nodeMajor("v22.14.0\n")` → `"22"`; `findNodeLiterals("with:\n  node-version: 22\n")` → 1 violation; `"node-version-file: .nvmrc"` → 0.
- `findServerImportsInClient("\"use client\";\nimport { prisma } from \"@/shared/lib/prisma\";")` → 1 violation; the same import without `"use client"` → 0; `import { authClient } from "@/shared/lib/auth/client"` with `"use client"` → 0; `import fs from "node:fs"` with `"use client"` → 1.
- `findMissingCitedPaths("see `src/nope.ts` and `src/features/<x>/module.ts` and [d](docs/02-architektura.md#a)", exists)` → `["src/nope.ts"]`.

**Mutations to kill:** budget boundary `<=` → `<`; nested keys skipped (top-level comparison only); one-way comparison (`pl` ⊆ `en` but not the reverse); `"use client"` recognised anywhere in the file instead of only as the first statement; anchor `#` not cut off; `node-version-file` counted as a literal.

- [ ] Step 1: tests → red.
- [ ] Step 2: implement the functions and fix violations in the repo. List each fixed violation in the report.
- [ ] Step 3: `core.json` `files`, `npm run wa -- kit sync && npm run wa -- generate && git diff --exit-code -- src/modules.generated.ts src/modules.client.generated.ts`.
- [ ] Step 4: docs and D50.
- [ ] Step 5: `npm run test:mutation:task -- <files with detection functions>`, `npm run verify`. Commit `test(core): add architecture tests for repo consistency`.

---

### Task 2: Runtime organization guard

**Branch:** `feat/harness-tenant-scope`

**Files:**
- Create: `src/shared/lib/tenant-scope/tenant-scope.ts` (the pure decision function), `src/shared/lib/tenant-scope/tenant-scope-extension.ts` (the Prisma extension and AsyncLocalStorage), `src/shared/lib/tenant-scope/index.ts` if needed.
- Modify: `src/shared/lib/prisma.ts` (export the extended client; the type must keep working with better-auth's `prismaAdapter` and with `$transaction`).
- Modify (modules, one commit per module): `src/features/api-keys/services/authenticate-api-key.ts`, `src/features/uploads/services/read-upload.ts` (spec §4.3).
- Modify: `src/test/integration/database.ts` and other test helpers that need it.
- Modify: `mutation-gate.json` → `critical` += `"src/shared/lib/tenant-scope/"` (the critical file list, not an `allowed` entry).
- Modify: `stryker.config.json` `mutate`, if the new directory is not covered.
- Docs: `docs/03-dane-i-organizacje.md` (a "Runtime guard" section: what counts as a filter, `withoutTenantScope`, the limitations from §4.2), `docs/09b-implementacja-i-bramki.md` (a note next to query/command), `docs/14-modul-api-keys.md` and `docs/15-modul-uploads.md` (why `withoutTenantScope`), `docs/znane-ograniczenia.md` (raw SQL, nested queries, `Member`/`Invitation`), `docs/decyzje.md` (D51), `AGENTS.md` "Dane i organizacje" section (one sentence plus the name `withoutTenantScope`; the size budget is guarded by Task 1).

**Interfaces:**
```ts
export class TenantScopeError extends Error { name = "TenantScopeError"; readonly model: string; readonly operation: string }
export function isTenantScoped(model: string): boolean;
export function isTenantScopeSatisfied(operation: string, args: unknown): boolean;
export function withoutTenantScope<T>(reason: string, fn: () => Promise<T>): Promise<T>;
```
- `isTenantScoped` reads the model list from the generated client (for example scalar fields from `Prisma.*ScalarFieldEnum`, or Prisma 7 client runtime metadata). A hand-written model map is not allowed. If the generated client does not expose this, stop and ask the coordinator with a proposal.
- `withoutTenantScope("", fn)` throws before calling `fn`.

**Behaviours** (pure function, on literals; `organizationId` = `"org_a"`):
- `isTenantScopeSatisfied("findMany", { where: { organizationId: "org_a" } })` → `true`.
- `… { where: { organizationId: { equals: "org_a" } } }` → `true`; `{ in: ["org_a"] }` → `true`; `{ in: [] }` → `false`.
- `… { where: { organizationId: { not: "org_a" } } }` → `false`; `{ notIn: ["org_a"] }` → `false`; `{}` → `false`; `undefined` → `false`; `""` → `false`; `null` → `false`.
- `… { where: { id: "x" } }` → `false`; `{}` (no `where`) → `false`.
- `… { where: { AND: [{ id: "x" }, { organizationId: "org_a" }] } }` → `true`; `AND` as an object `{ organizationId: "org_a" }` → `true`.
- `… { where: { OR: [{ organizationId: "org_a" }, { organizationId: "org_b" }] } }` → `true`; `OR: [{ organizationId: "org_a" }, { id: "x" }]` → `false`; `OR: []` → `false`.
- `… { where: { NOT: { organizationId: "org_a" } } }` → `false`; `{ organization: { id: "org_a" } }` → `false`.
- `isTenantScopeSatisfied("findUnique", { where: { organizationId_userId: { organizationId: "org_a", userId: "u" } } })` → `true`.
- `isTenantScopeSatisfied("create", { data: { organizationId: "org_a" } })` → `true`; `{ data: { organization: { connect: { id: "org_a" } } } }` → `false`.
- `isTenantScopeSatisfied("createMany", { data: [{ organizationId: "org_a" }, { name: "x" }] })` → `false`; both rows with `organizationId` → `true`; `data` as a single object with `organizationId` → `true`.
- `isTenantScopeSatisfied("upsert", { where: { organizationId: "org_a" }, create: { organizationId: "org_a" }, update: {} })` → `true`; without `create.organizationId` → `false`.
- `isTenantScopeSatisfied("count", {})` → `false`; `("deleteMany", { where: { organizationId: "org_a" } })` → `true`.
- `isTenantScoped("ApiKey")` → `true`; `("AuditLog")` → `true`; `("Upload")` → `true` (in a project with modules); `("Member")` → `false`; `("Invitation")` → `false`; `("User")` → `false`; `("Organization")` → `false`.
- Integration (`*.integration.test.ts`, real database, two organizations):
  - `prisma.apiKey.findMany({})` → rejected with `TenantScopeError` (`name === "TenantScopeError"`, `model === "ApiKey"`, `operation === "findMany"`), no rows returned;
  - `prisma.apiKey.findMany({ where: { organizationId: orgA } })` → only `orgA` keys;
  - `prisma.apiKey.deleteMany({ where: { id: keyB } })` → `TenantScopeError`, the `orgB` key still exists;
  - `withoutTenantScope("test", () => prisma.apiKey.count())` → the number of keys of both organizations; right after it, `prisma.apiKey.count()` → `TenantScopeError`;
  - `withoutTenantScope("test", async () => { throw new Error("x") })` rejects with `"x"`, and the next query without a filter → `TenantScopeError`;
  - `prisma.member.findMany({ where: { userId } })` → works (model outside the guard);
  - better-auth sign-in and `authenticateApiKey` with a valid key → work;
  - reading another organization's public file through `readUploadForDownload` → 200; a private one → 404 (behaviour unchanged).
- `npm run test:e2e` → PASS (better-auth and the whole UI through the guard).

**Mutations to kill:** `every` → `some` for `OR`; `NOT` counted as a filter; `{ in: [] }` counted as a filter; `{ not }` counted as a filter; `createMany` checking only the first row; `upsert` without the `create` check; `Member` guarded or `ApiKey` excluded; `withoutTenantScope` state not cleared after an error; an empty `reason` accepted; the guard warning instead of throwing.

- [ ] Step 1: tests (unit tests of the pure function plus integration tests) → red.
- [ ] Step 2: implement the guard and wire it in `prisma.ts`.
- [ ] Step 3: `npm run test:integration` and `npm run test:e2e` (after `docker compose up -d db mail`). For every query the guard rejects: either a missing filter (fix it) or a deliberate cross-organization read (`withoutTenantScope` with a reason). List them in the report.
- [ ] Step 4: the `api-keys` and `uploads` module changes in separate commits.
- [ ] Step 5: docs and D51.
- [ ] Step 6: `npm run test:mutation:task -- src/shared/lib/tenant-scope/tenant-scope.ts,src/shared/lib/tenant-scope/tenant-scope-extension.ts`, `npm run test:mutation:gate`, `npm run verify`. Security logic may have no gaps. Core commit `feat(core): reject unscoped queries on organization models`.

---

### Task 3: Project skills, Task Router and permission allowlist

**Branch:** `feat/harness-skills-router`

**Files:**
- Create: `.claude/skills/wa-code-review/SKILL.md`, `.claude/skills/wa-upgrade-dependency/SKILL.md`, `.claude/skills/wa-new-module/SKILL.md`.
- Modify: `.claude/settings.json` (`permissions.allow`; `hooks` unchanged).
- Modify: `AGENTS.md` (a "Task Router" section), `CLAUDE.md` only if a reference is needed (both must stay consistent).
- Modify: `kit/modules/core.json` → `files` += `".claude/skills/**"`.
- Docs: `docs/11-praca-z-kitem.md` (skills, Task Router, permissions), `docs/decyzje.md` (D52: skills in the project, not in a plugin; rejected: a plugin shared by all Web Amigos projects — versioned independently of the kit and not updated by `wa kit sync`).

**Skill content** (format as in Ragen: frontmatter `name` and `description` with triggers; concise body ordered by what actually breaks; only facts checked in the repo):
- `wa-code-review`: `npm run verify` first; then what the gate cannot check: `getOrgContext()`/`requireModuleAccess()` and the `organizationId` filter; the service mode contract (`assertServiceModeConfirmed`, `useServiceModeAction().run`); `withoutTenantScope` only with a reason and only for a deliberate cross-organization read (Task 2 introduces the name); generated files and `wa:*` regions; a module does not edit the core; tests written by another agent, expected values as literals; `allowed` entries only from a human; error class `name` as a string; i18n in both languages; no comments.
- `wa-upgrade-dependency`: the order (changelog → bump → `npm run verify` → `npm run test:integration` → `npm run test:e2e`); libraries with their own tables (better-auth, Prisma) need a sign-in e2e and a check of migrations/`schemaRelations`; Next.js through codemods; `npm audit`; upgrading in the kit vs in a project (`wa kit sync`). Lesson from Ragen: better-auth 1.4 → 1.7 passed unit tests and the build but broke sign-in, which only e2e caught.
- `wa-new-module`: project feature (`projectModules`) vs kit module; steps from `docs/09-nowy-modul.md` and `docs/09b-implementacja-i-bramki.md` (kit repo); `defineModule`, `requireModuleAccess`, `npm run wa -- generate`, migration, a two-organization isolation test; the organization guard covers a new model automatically.
- References to `docs/` in skills point at the `webamigos/wa-kit` repo (`docs/` does not exist in a project). Write them as "`docs/09-nowy-modul.md` in the `webamigos/wa-kit` repo".

**Task Router in `AGENTS.md`:** a "Task → where to look" table with at least these rows: new feature/module, a query or command on organization data, a cross-organization read (`withoutTenantScope`), service mode, auth and roles, a Prisma migration, an environment variable, i18n, mail, files (`uploads`), API keys, the audit log, a dependency upgrade, tests and mutations, reviewing a change. Each cell points to a repo file, a kit doc or a skill. Remove references in other sections that the router replaces, so `AGENTS.md` grows by no more than about 3 KB.

**`permissions.allow`:** exact entries only, and only for commands that do not write to any database. Claude Code's trailing `:*` / ` *` matches any arguments, so wildcards that can pass a different Vitest config (for example `npm run test -- -c vitest.integration.config.ts` or `npx vitest run -c …`) are not allowed, because the integration config runs `resetDatabase()` and truncates the `_test` database.
- Allowed: `Bash(npm run verify)`, `Bash(npm run lint)`, `Bash(npm run typecheck)`, `Bash(npm test)`, `Bash(npm run test)`, `Bash(npm run test:hooks)`, `Bash(npm run test:mutation:gate)`, `Bash(npm run wa -- generate)`, `Bash(git status)`, `Bash(git status *)`, `Bash(git diff *)`, `Bash(git log *)`, `Bash(git show *)`.
- Not allowed: `npm run test:integration`, `npm run test:e2e`, `npm run test:mutation:integration` (they use Postgres), any `npx vitest run *` or `npm test *` wildcard, `git push`, `git reset`, `rm`, `prisma migrate`, `docker`, `npm install`.
- Check the pattern syntax against the Claude Code docs (`https://code.claude.com/docs/en/permissions`).

**Behaviours:**
- `.claude/settings.json` is valid JSON; `hooks.PreToolUse` is identical to the version before the change (`node --test .claude/hooks/*.test.mjs` passes).
- `permissions.allow` contains none of the "not allowed" commands above.
- Every `npm run …` command and every repo path cited in `AGENTS.md` and the skills exists (Task 1's test checks this after integration; here check by `grep` and list it in the report).
- `wc -c AGENTS.md` ≤ 31,744.

**Mutations to kill:** not applicable (no production code).

- [ ] Step 1: skills.
- [ ] Step 2: Task Router and cleanup in `AGENTS.md`/`CLAUDE.md`.
- [ ] Step 3: `permissions`.
- [ ] Step 4: `core.json` `files`, `npm run wa -- kit sync && npm run wa -- generate`.
- [ ] Step 5: docs and D52, `npm run verify`. Commit `feat(core): add project skills, task router and permission allowlist`.

---

### Task 4: Integration (coordinator)

- Rebase or merge the Task 1–3 branches onto the current `main` via `feat/harness-from-ragen` (order: 2, 3, 1 — architecture tests last, so they check the router and the guard docs).
- Bring the Task 3 allowlist in line with the "exact entries" rule above (the Task 3 branch was written before it and allows `test:integration`).
- Bump versions: `kit/modules/core.json` `version` to the next minor after `main`'s; `kit/modules/api-keys.json` and `kit/modules/uploads.json` by one patch each. **Commit the bumps** (`chore(kit): bump core, api-keys and uploads versions`), then run `npm run wa -- kit sync && npm run wa -- generate`, commit what they change, and only then run `git diff --exit-code` so the drift check reports only unexpected generated changes.
- `npm run verify`, `npm run verify --prefix kit/cli`, `npm run test:integration`, `npm run test:mutation:gate`, `npm run test:e2e`.
- `docs/16b-rozwoj-kitu.md` and `docs/README.md`: the new versions.
- Report to Patryk: what landed, proposed `allowed` entries, what is unverified, phase 2.
