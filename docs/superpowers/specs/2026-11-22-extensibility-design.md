# GatoJS extensibility: read-only Gato files, project modules through extension points

Date: 2026-11-22, revised 2026-11-23 against `main` at `e32ebab` (GatoJS `0.7.0`). Drafted by Patryk with an agent. Draft for Patryk's review; a plan follows acceptance. Answers go to section 11 ("Decisions for Patryk").

Sources:

- open-mercato `0.9.0`, studied through the `acme-app` application (its `.ai/guides/extensions.md`, `.ai/guides/framework-extension-points.md`, `.ai/skills/om-module-scaffold/references/discovery-surface-catalog.md`, `src/modules.ts`, `src/modules/acme/**`, the lessons in `.ai/lessons/` and decision `.ai/decisions/0001-ocr-files-behind-generic-attachment-routes.md`; paths in that repository, not this one);
- GatoJS decisions [D31](../../decyzje.md#d31) (hashes, managed and generated files), [D36](../../decyzje.md#d36) (project modules), [D38](../../decyzje.md#d38) (one owner per file), [D39](../../decyzje.md#d39) (GatoJS code is plain code in the project), [D40](../../decyzje.md#d40) (`auditSinks`), [D42](../../decyzje.md#d42) (organization events from better-auth hooks), [D47](../../decyzje.md#d47) (`wa update`), [D51](../../decyzje.md#d51) (tenant-scope guard), [ADR-56](../../adrs/56-workspace-packages-replace-d29.md) (workspace packages);
- code read for this revision: `src/shared/lib/modules/define-module.ts`, `src/modules.generated.ts`, `src/modules.client.generated.ts`, `packages/gato-cli/src/generate/` (`index.ts`, `registry.ts`, `targets.ts`), `packages/gato-cli/src/update/` (`plan.ts`, `merge.ts`, `snapshot.ts`), `packages/gato-cli/src/commands/update.ts`, `packages/gato-cli/src/manifest/` (`schema.ts`, `kit-state.ts`), `packages/gato-cli/src/assemble/hash.ts`, `kit/kit.json`, `kit/modules/core.json`, `src/shared/lib/auth/` (`org-context.ts`, `service-mode.ts`, `require-module-access.ts`, `permissions.ts`), `src/shared/lib/tenant-scope/`, `src/shared/lib/audit.ts`, `src/features/audit-logs/auth.ts`, the commands in `src/features/*/services/commands/`, `src/__tests__/server-entrypoints-guard.test.ts`, `src/__tests__/architecture/client-bundles-stay-server-free.test.ts`;
- specs [`2026-11-21-gato-cli-design.md`](2026-11-21-gato-cli-design.md) (`kitFormat` §6, `gato doctor` §8) and [`2026-11-22-packages-design.md`](2026-11-22-packages-design.md); plan [`2026-11-22-agent-workflow.md`](../plans/2026-11-22-agent-workflow.md) (ADR-57, which will move this file to `docs/specs/`).

Naming: new names say GatoJS or `gato` (`gato.config.ts`, `gato eject`, `protect-gato-files.mjs`). Names that exist today keep their spelling until the separate rename plan: `.wa/kit.json`, `wa:*` regions, `npm run wa -- <command>`, `projectModules`. The `gato` binary of `gato-cli` and `npm run wa --` run the same code, so a new command is available under both.

## 1. Why

A developer creates a GatoJS project and gets a skeleton: sign-in, organizations, roles, users, the panel and the chosen Gato modules. Then they build their application. Today the only way to change GatoJS behaviour is to edit a copied Gato file. `wa update` ([D47](../../decyzje.md#d47)) survives that with a three-way merge, but the edit still costs:

- every later `wa update` merges that file with `git merge-file --diff3`, and a human resolves each conflict by hand;
- a security fix in that file reaches the project only through the merge, and a project that changed the same lines gets a conflict instead of the fix;
- an AI agent working in the project does not know which files it may change, so it changes whatever is at hand.

**Goal:** a developer can build almost everything a project needs **without editing Gato files**. Gato files stay untouched, so `wa update` replaces them instead of merging them, and the project's own code is never part of the update at all.

## 2. What exists today (verified on `e32ebab`)

The proposal builds on seams that already work. A developer outside Web Amigos can use all of these now.

### 2.1 How a project module plugs in

| Seam | Where in the code | What a project module does |
| --- | --- | --- |
| Registration | `projectModules` in `.wa/kit.json`; `readKitState` in `packages/gato-cli/src/manifest/kit-state.ts` checks that the key equals `name`, does not clash with a Gato module, its `requires` are installed, and `files` covers `src/features/<x>/` | adds a manifest entry, no versions or hashes |
| Module declaration | `defineModule` in `src/shared/lib/modules/define-module.ts`: `key`, `nav`, `routePrefixes`, `roles`, `public`, `adminOnly`, `multiOrgRoles`, `auditActions`, `apiScopes`, `uploadPurposes` | `src/features/<x>/module.ts` with `export default defineModule({...})` |
| Files found by name | `detectFeature` in `packages/gato-cli/src/generate/index.ts`: `module.ts`, `env.ts` (`envSchema`), `auth.ts` (`authPlugin`), `auth-client.ts` (`authClientPlugin`), `audit-sink.ts` (`auditSink`), `i18n/<locale>.json` | creates any of them; `npm run wa -- generate` collects them |
| Generated registries | `src/modules.generated.ts` (server: `modules`, `moduleEnvSchemas`, `authPlugins`, `auditSinks`, `env`, `moduleMessages`) and `src/modules.client.generated.ts` (`clientModules`, `authClientPlugins`) | nothing; they are regenerated |
| Manifest regions | `regionTargets` in `packages/gato-cli/src/generate/targets.ts`: `wa:relations` for `User` and `Organization`, `wa:modules` in `.env.example`, `wa:services` in `docker-compose.yml`, `wa:ci-integration` in `ci.yml` and `mutation.yml`, `wa:workspaces` in the `Dockerfile` | fills `schemaRelations`, `env`, `compose`, `ciSteps` in its manifest |
| Pages | plain Next route files in `src/app/[locale]/(app)/<x>/`, guarded by `requireModuleAccess("<x>")` | owns them through its manifest `files` |
| Data | own `prisma/schema/<x>.prisma`; the tenant-scope guard ([D51](../../decyzje.md#d51)) covers every model with an `organizationId` field automatically, except `Member` and `Invitation` | gets the guard for free; filters by `organizationId` itself |
| Reacting to better-auth operations | `authPlugins` spread into the better-auth config (`src/shared/lib/auth/index.ts`); `audit-logs` uses this for member and invitation events ([D42](../../decyzje.md#d42)) | `auth.ts` with `before`/`after` hooks on better-auth paths |

`module.ts` is imported by **both** registries, so it ships to the browser. Anything with server code (Prisma, secrets, `next/headers`) must stay out of it; `client-bundles-stay-server-free.test.ts` guards client files.

### 2.2 How `wa update` treats each kind of file

`wa update <version>` (`packages/gato-cli/src/commands/update.ts`) needs a clean git tree, reads the Gato snapshots of the project's version (base) and the target version for the **Gato modules in `modules` only**, and plans each file (`planUpdate` in `packages/gato-cli/src/update/plan.ts`):

| File | Result |
| --- | --- |
| Gato file, project content equals base | replaced with the target version ("zaktualizowano") |
| Gato file changed in the project and in GatoJS | `git merge-file --diff3`; clean merge "scalono", otherwise conflict markers and exit code 1 |
| Gato file deleted in the project, changed in GatoJS | "do decyzji" |
| New Gato file at a path where the project already has a file | conflict |
| `wa:*` region content | stripped before hashing and merging (`stripRegions` in `packages/gato-cli/src/assemble/hash.ts`), refilled by the `generate` that `update` runs at the end |
| Generated registries (`generatedFiles` in `kit/kit.json`) | regenerated |
| `package.json` | merged against the package.json assembled from the manifests; `package-lock.json` is left to `npm install` |
| Project module files, project migrations, any path no Gato snapshot contains | never read or written |

So the selling point already holds for project modules: their code cannot conflict. What breaks them is a changed contract (a renamed export in `src/shared/**`, a changed `defineModule` field), which shows up in `npm run typecheck`, not in a merge. The extension points below make that contract explicit, versioned and checked.

### 2.3 What a project still has to edit today

These are Gato files (owned by `core`) that almost every project changes, and each change becomes a merge on every update:

| Need | Gato file edited today | Proposal |
| --- | --- | --- |
| Project rules for agents | `AGENTS.md`, `CLAUDE.md` | companion file `AGENTS.project.md` that both Gato files tell agents to read (section 4.3) |
| Project README | `README.md` | seed file: copied at `create`, then project-owned (section 4.3) |
| Own critical files and accepted mutants | `mutation-gate.json` | `mutation-gate.project.json`, merged by `scripts/mutation-gate.ts` |
| Theme, logo, fonts | `src/app/globals.css`, `src/app/layout.tsx`, `src/app/[locale]/layout.tsx` | `src/theme.css` imported after the Gato tokens; branding fields in `gato.config.ts` |
| Dashboard content | `src/app/[locale]/(app)/dashboard/page.tsx` (renders a placeholder) | slot `dashboard.sections` (section 5.3) |
| Reacting to a core command (invite, delete upload) | the command file | command hook or event (sections 5.5, 5.6) |
| Changing who sees a Gato module | its `module.ts` | `gato.config.ts` (section 5.1) |
| Env vars, compose services, CI steps | `.env.example`, `docker-compose.yml`, `ci.yml` | already covered: the project module's manifest `env`, `compose`, `ciSteps` |
| Own shadcn components | new files in `src/components/ui/` | allowed: a new file is a project file even inside a Gato directory (section 4.1); editing a shipped one is an eject |

## 3. What open-mercato teaches

open-mercato ships its core as npm packages (`@open-mercato/*`). The application has its own modules in `src/modules/<id>/`, a registry in `src/modules.ts` and a one-time copied shell (`src/app/**` with catch-all routes). Modules are discovered by file name (about 45 conventions, from `backend/**/page.tsx` to `commands/interceptors.ts`), and the generator writes about 60 registries.

| Mechanism | How it works |
| --- | --- |
| `overrides` on a module entry | Keyed maps: `null` disables an item, a value replaces it (routes, pages, subscribers, widgets, ACL, DI, CLI, setup). |
| Widget injection | `spotId → [{ widgetId, priority }]`; spots such as `data-table:<id>:row-actions`. |
| Component override by handle | Change props, wrap or replace. |
| Enrichers, command and API interceptors, mutation guards | Hooks before and after another module's operations. |
| Events and subscribers | Typed module events, synchronous or persistent subscribers. |
| Entity extensions and custom fields | A separate table with a foreign key; custom fields declared in `ce.ts`. |
| `eject` | Copy a module into the app, which then upgrades it on its own. |

Lessons from `acme-app`:

1. **A stale override key only logs a warning.** After a core upgrade, a disabled route silently came back. acme-app guards its keys with its own test.
2. **The override registry is also evaluated in the browser**, so it cannot import server code.
3. **Overrides applied lazily** let disabled pages through on a cold start.
4. **A core route without a hook** forced acme-app to wrap 10 handlers and deep-import core internals about 120 times.
5. **Keys without a namespace** (`seed-demo` in two modules) collide.
6. Some core behaviour could only be changed by writing to core tables from `setup.ts`, because the core read its configuration from its own file.

GatoJS already has lesson 2's split (two registries, a client-bundle test) and avoids lesson 3 (registries are static imports). Lessons 1, 4 and 5 drive this spec.

## 4. File ownership

### 4.1 Three groups, defined by `.wa/kit.json`

| Group | Definition | Who changes it | `wa update` |
| --- | --- | --- | --- |
| **Gato file** | a path with a content hash in `modules.<module>.files` of `.wa/kit.json` | nobody in the project | replaced |
| **Ejected Gato file** | a Gato file listed in a new `ejected` map of `.wa/kit.json` with a reason | the project | three-way merge, as today |
| **Project file** | everything else: project modules, `gato.config.ts`, migrations, companion files, new files inside Gato directories | the project | never read |

The definition uses the recorded hashes, not the manifest globs. `core` owns globs such as `src/shared/**`, `src/components/ui/**`, `e2e/**` and `.claude/skills/**`; a new file the project adds there has no hash, is not part of any Gato snapshot, and stays a project file. The one risk is a later GatoJS release shipping a file at the same path, which `wa update` already reports as a conflict ("plik projektu na ścieżce nowego pliku kitu"). Generated files and `managed` files (`package.json`, `package-lock.json`, hash `"managed"`) are outside the protection; region content does not count, as today (D31).

In the GatoJS repository itself `modules.*.files` is empty (`{}`), so every check below is a no-op there.

### 4.2 Enforcement

- **`gato doctor`** (planned in the gato-cli spec §8) lists modified Gato files that are not ejected and ejected files with their reasons. It reuses `contentHash` from `packages/gato-cli/src/assemble/hash.ts` through the bundled CLI (`.wa/bin/wa.mjs`), so no second hash implementation lands in the project. `npm run verify` calls `npm run wa -- doctor --files`; the call starts as a warning and becomes blocking in a later release (section 10).
- **Claude Code hook** `.claude/hooks/protect-gato-files.mjs` (owned by `core`, modelled on `protect-tests.mjs`): blocks `Edit`/`Write` on a Gato file that is not ejected, and on generated files, with a message naming the closest extension point from `EXTENSION_POINTS.md` and `gato eject`. Its tests (`protect-gato-files.test.mjs`) join the explicit file list of the `test:hooks` script in `package.json`.
- **`gato eject <file> --reason "<reason>"`** adds `{ "<file>": { "reason": "…", "ejectedAt": "<date>" } }` to `ejected` in `.wa/kit.json`. No extra base hash: `modules.<module>.files` already holds the GatoJS hash of the version last created or updated to, and `wa update` rewrites it on every update (`nextState` in `commands/update.ts`). `gato eject --undo <file>` restores the GatoJS version of the file and removes the entry.
- Eject changes governance, not the update algorithm: `wa update` merges an ejected file exactly as it merges any modified file today. What eject adds is a recorded reason, a passing `verify` and a hook that lets agents edit that file.

### 4.3 Companion and seed files

Files a project always changes get a project-owned counterpart instead of protection exceptions:

- **Companion files**, read by a Gato file when present: `AGENTS.project.md` (Gato `AGENTS.md` and `CLAUDE.md` tell agents to read it first and that it wins over generic advice, never over the hard rules), `mutation-gate.project.json` (merged into the Gato list by `scripts/mutation-gate.ts`), `src/theme.css` (imported by `src/app/globals.css` after the Gato tokens).
- **Seed files**, copied once by `create` and recorded with the hash `"seed"`: `wa update` and the protection skip them. First candidate: `README.md`. Adding `seed` to the hash vocabulary changes `.wa/kit.json`, so it ships with a `kitFormat` bump.

## 5. Extension points

Every point has a key namespaced by the module that owns it (`<module>.<name>`), an entry in the generated catalog (5.10) and a stability label (`stable`, `experimental`). Contributions are namespaced by the contributing module (`invoices.unpaid-card`), so two modules cannot collide (lesson 5). A reference to a key that does not exist fails at import time and in an architecture test, never only as a warning (lesson 1).

### 5.1 Project configuration: `src/gato.config.ts`

A project file, the single place for "disable, change, replace" decisions about Gato modules:

```ts
import { defineGatoConfig } from "@/shared/lib/modules/gato-config";

export default defineGatoConfig({
  modules: {
    dashboard: {
      nav: { "dashboard.home": { order: 5 } },
    },
    users: {
      roles: { "users.invite": ["owner"] },
      components: {
        "users.invite-dialog": () => import("@/features/crm/components/invite-with-crm"),
      },
      slots: { "users.table.row-actions": { "audit-logs.history-link": null } },
    },
    "api-keys": { enabled: false },
  },
});
```

Where it plugs in:

- `src/gato.config.ts` is not matched by any `core` glob (`core` lists `src/env.ts`, `src/proxy.ts` and `src/instrumentation.ts` one by one), so it is a project file. If it is missing, the generated registries use an empty config.
- The generator does not execute TypeScript (the CLI is a bundled Node script). Instead `renderRegistry` in `packages/gato-cli/src/generate/registry.ts` emits `import gatoConfig from "@/gato.config";` and wraps each list: `export const modules = applyGatoConfig([...], gatoConfig)`. `applyGatoConfig` (new Gato file `src/shared/lib/modules/gato-config.ts`) runs once, when the registry module is evaluated, before any request, so nothing is applied lazily (lesson 3).
- Both registries import the config, so it must stay client-safe: plain data and lazy `import()` of components, no server imports (lesson 2). `client-bundles-stay-server-free.test.ts` gets `src/gato.config.ts` as a client entry.
- Validation: `applyGatoConfig` throws on an unknown module key, nav item id, slot id, contribution id, component handle or permission key, so `next build`, `npm run dev` and every test importing the registry fail. An architecture test `gato-config-keys-exist.test.ts` repeats the check with a readable list of every bad key.
- Nav items need stable ids: `ModuleNavItem` gains `id` (`"dashboard.home"`), required for Gato modules and optional for project modules until the next `kitFormat`.

**Disabling a module.** `enabled: false` keeps the module's files and tables and removes it from every registry list: nav, `requireModuleAccess` (which reads `clientModules` through `moduleByKey`, so pages and commands that use it answer 404 at once), `authPlugins`, `auditSinks`, `moduleEnvSchemas`, `moduleMessages`, slots, subscribers and hooks. Two kinds of entry points do not go through the registry and need a guard:

- route handlers owned by a module, for example `src/app/api/v1/organization/route.ts` in `api-keys`, which authenticates an API key and never calls `requireModuleAccess`: they call a new `requireModuleEnabled("<key>")` first and answer 404;
- commands that call `getOrgContext()` or `getAdminUserOrNull()` instead of `requireModuleAccess` (`inviteUserCommand`, `deleteUploadCommand`): they get `requireModuleEnabled` too, or move to `defineCommand` (5.6), which checks it.

An architecture test checks that every route handler and `"use server"` export in a module's files reaches one of the two guards. `auth` and `organizations` cannot be disabled. For a Gato module the project does not want at all, `npm run wa -- remove <module>` stays the better tool; `enabled: false` is for keeping its data or for core modules (`dashboard`, `users`, `account`).

`wa update`: the config is a project file and is never touched. If a release renames a key the config uses, the project fails at the next build with the bad key named; the release note lists renamed `stable` keys.

### 5.2 Project modules

Unchanged from D36: `src/features/<x>/module.ts`, an entry in `projectModules`, pages as plain Next route files in `src/app/[locale]/(app)/<x>/`, owned by the project. No catch-all routes.

**Correction to the first draft:** the new declarations do not go into `defineModule`, because `module.ts` is part of the client bundle (2.1). They follow the existing file-name convention of `detectFeature`, one file per kind, each with one named export:

| File in `src/features/<x>/` | Export | Registry | Runs |
| --- | --- | --- | --- |
| `module.ts` (as today) | default `defineModule({...})`, plus `permissions` (pure data) | server and client | both |
| `slots.ts` | `slots` (lazy component imports) | server and client | both |
| `components.ts` | `componentOverrides` (lazy) | client | browser and SSR |
| `events.ts` | `events` (`defineEvents`, Zod payload schemas) | server | server |
| `subscribers.ts` | `subscribers` | server | server |
| `command-hooks.ts` | `commandHooks` | server | server |
| `setup.ts` | `setup` | server | server |

`RegistryModule` gains `hasSlots`, `hasComponents`, `hasEvents`, `hasSubscribers`, `hasCommandHooks`, `hasSetup`, and `renderRegistry` emits one list per kind, exactly as it does for `hasAuditSink` today. Gato modules and project modules use the same files. The generated files change shape, so the release that adds them bumps `kitFormat`; `wa update` regenerates them.

### 5.3 UI slots

- A Gato component renders `<Slot id="dashboard.sections" context={{ organizationId }} />` (new Gato file `src/shared/components/slot.tsx`). Two kinds:
  - **server slots** in server components (pages, layouts): a contribution may be an async server component;
  - **client slots** inside client components (tables, dialogs): a contribution must be a client component.
- The owning module declares its slots and their context types in its `slots.ts` (`defineSlot<{ organizationId: string }>("dashboard.sections", { kind: "server" })`); a contribution is type-checked against that context.
- A contribution: `{ slot: "dashboard.sections", id: "invoices.unpaid-card", priority: 20, roles?: ["owner", "admin"], component: () => import("./components/unpaid-invoices-card") }`. `roles` hides it; it is not a security boundary. A contribution that reads data calls a query that runs `getOrgContext()` itself.
- First list (to confirm in the plan): `app.header.actions` (in `src/app/[locale]/(app)/layout.tsx`), `dashboard.sections` (replacing the placeholder in `dashboard/page.tsx`), `users.table.columns`, `users.table.row-actions`, `users.detail.sections`, `organizations.settings.sections`, `account.sections`.

`wa update`: the Gato file with the `<Slot>` is replaced cleanly because the project never edits it; contributions live in project files.

### 5.4 Component override by handle

- Selected Gato client components are wrapped: `export const InviteUserDialog = overridable("users.invite-dialog", InviteUserDialogBase)` (new Gato file `src/shared/lib/modules/overridable.tsx`, reading the client registry).
- `gato.config.ts` or a module's `components.ts` can **replace** a handle or **wrap** it (the wrapper receives `Base` as a prop). Wrapping covers "change props", so there is no third mode. Two overrides of one handle fail at import time, naming both modules.
- Only components with a handle can be overridden; the list grows on request (an issue in `webamigos/gatojs`), not "everything".

### 5.5 Domain events and subscribers

- Modules declare events in `events.ts`: `defineEvents({ "invoices.issued": z.object({ invoiceId: z.string() }) })`. Every payload carries `organizationId`, set by `emitEvent` from the context, never by the caller.
- First core events and where they are emitted (new Gato module `src/shared/lib/events/`):

| Event | Emitted from |
| --- | --- |
| `organizations.created` | `createOrganizationWithOwnerCommand` (signup with `MULTI_ORG`), a core better-auth `after` hook on `/organization/create` (the form uses `authClient.organization.create`), `scripts/admin-create.ts` |
| `organizations.member-added`, `organizations.member-removed`, `organizations.member-role-changed`, `users.invitation-accepted`, `users.invitation-canceled` | a new **core** better-auth plugin (`src/shared/lib/auth/events-plugin.ts`) with `after` hooks on the paths `audit-logs` reads today (`AUDITED_ORGANIZATION_PATHS` in `src/features/audit-logs/services/organization-audit-events.ts`). Today these events exist only when `audit-logs` is installed (D42); the mapping moves to core and `audit-logs` subscribes |
| `users.invited` | `inviteUserCommand`, after `trackAudit` |
| `auth.signed-up` | the existing `databaseHooks.user.create.after` in `src/shared/lib/auth/index.ts` (which also creates the organization through `applySignupMembership` with `MULTI_ORG`) |

- A module subscribes in `subscribers.ts`: `{ "organizations.member-removed": { id: "invoices.unassign", run: async (event) => … } }`.
- **One mode in v1: after the operation succeeded.** A subscriber error is logged and does not undo the operation, as with `auditSinks` (D40). The first draft's `in-transaction` mode is dropped: most core operations do not run in one Prisma transaction (`inviteUserCommand` calls better-auth `signUpEmail` and separate Prisma writes; only `api-key-commands.ts` and `member-commands.ts` use `$transaction`; better-auth endpoints manage their own writes), so the promise "an error rolls everything back" could not be kept. Validation that must stop an operation goes into a command hook `before` (5.6).
- A subscriber gets `event.organizationId` and filters every query by it; the tenant-scope guard (D51) still applies. In service mode the subscriber runs as part of an operation the superadmin already confirmed, so it does not ask again.
- `auditSinks` stay as they are (D40, with redaction in D41). Turning them into subscribers is a later, separate step.
- Queues and durable delivery are out of scope (they come with a `jobs` module).

### 5.6 Command hooks

Lesson 4: Gato commands need hooks from day one.

- Gato commands move to `defineCommand` (new Gato file `src/shared/lib/commands/define-command.ts`):

  ```ts
  const deleteUpload = defineCommand({
    key: "uploads.delete",
    module: "uploads",
    access: "member",
    input: z.object({ id: z.uuid() }),
    run: async (input, context) => { /* Prisma, filtered by context.organizationId */ },
  });

  export async function deleteUploadCommand(input: unknown, confirmation?: unknown) {
    return runCommand(deleteUpload, input, confirmation);
  }
  ```

  The exported function keeps the signature AGENTS.md requires. `runCommand` does, in this order: `requireModuleEnabled`, the session guard (`getOrgContext()`, `requireModuleAccess()` or the admin guard, by `access`), `assertServiceModeConfirmed(context, confirmation)`, Zod parse, `before` hooks, re-parse and organization check, `run`, `emitEvent` for the command's events, `handleCommandError`. A module cannot skip the guard or the confirmation, because the hook never sees the raw call.
- `src/__tests__/server-entrypoints-guard.test.ts` learns that `runCommand` counts as both the session guard and `assertServiceModeConfirmed`; `src/shared/lib/commands/` goes into `mutation-gate.json` `critical`.
- A module adds `command-hooks.ts`: `{ "uploads.delete": { id: "invoices.keep-issued-pdf", before: async (input, context) => … } }`. `before` can reject with a `DomainError` or return a changed input. **There is no `after` hook**: reactions go through events (5.5), so there is one way to react, not two.
- A hook gets a frozen copy of the context and cannot change `organizationId` or the role. After `before`, `runCommand` re-validates the input with the command's schema and rejects it when an organization-scoped field (`organizationId`, or a field marked `.meta({ organizationScoped: true })`) differs from its value before the hook or from the context organization. Commands keep taking the organization from the context, never from the input.
- Operations that are better-auth endpoints (member role change, member removal, accepting an invitation) are not GatoJS commands. A module that must stop one uses a `before` hook in its `auth.ts` plugin, as `audit-logs` does today. The catalog lists these paths as hookable through `auth.ts`.
- Route handlers (`src/app/api/**`) get the same mechanism through `defineRoute`, in a second step.

### 5.7 Data

- Modules add their own Prisma models in their own `prisma/schema/<x>.prisma`, owned through manifest `files`, with migrations in the project's `prisma/migrations/`. Every model with `organizationId` is guarded by the tenant scope automatically.
- Back-relations: `schemaRelations` works only for `User` and `Organization` today, because `regionTargets` has a `wa:relations` region only in `prisma/schema/auth.prisma` and `prisma/schema/organizations.prisma`. A relation to another Gato model (for example `Upload`) needs a region in that model's schema file and a `regionTargets` entry; until then a module stores the foreign key as a plain column and loads the row with its own filtered query. Each new region is a `kitFormat` bump.
- Custom fields without migrations (JSON per organization, like open-mercato's `ce.ts`) are not in this spec (decision 10).

### 5.8 Organization setup

`setup.ts` exports `setup: { onOrganizationCreated(context) {…}, seed(context) {…} }`. The core calls `onOrganizationCreated` as a subscriber of `organizations.created` (5.5), and `seed` from `scripts/admin-create.ts`.

- Both hooks must be idempotent: running them again for an organization that has the data changes nothing (upserts keyed by organization and a stable id).
- Each successful run is recorded in a new core model `OrganizationModuleSetup` (organization, module key, module version, finished at). A missing record is a setup that did not complete. The model reaches existing projects through `wa update` like any core schema change, and the project creates the migration (`npx prisma migrate dev`), as with every core schema change today.
- `gato doctor` lists organizations with missing records, and a new `npm run setup:organizations -- [--organization <id>] [--module <key>]` re-runs the hooks. `wa add` prints that command, because existing organizations never got a new module's setup.

### 5.9 Permissions

Today access is per module: `roles`, `adminOnly`, `multiOrgRoles`, checked by `canAccessModule` in `src/shared/lib/auth/permissions.ts`. Extension: a module declares permissions in `module.ts` (`permissions: { "invoices.issue": { defaultRoles: ["owner", "admin"] } }`), `gato.config.ts` can change the default roles, and code checks `can(context, "invoices.issue")` (next to `canAccessModule`) instead of comparing roles. Per-organization assignments stored in the database are not part of this spec.

### 5.10 Extension point catalog

- `npm run wa -- generate` writes `src/extension-points.generated.ts` (key unions for types) and `EXTENSION_POINTS.md` at the project root. Both join `generatedFiles` in `kit/kit.json`.
- The catalog is the single source for every key validated in 5.1: module keys, nav item ids, slot ids and contribution ids, component handles, events, hookable commands, better-auth paths hookable through `auth.ts`, permission keys. Each entry has its module, stability label and one line of description.
- Gato `AGENTS.md`, the `wa-new-module` skill and the `protect-gato-files` hook point to `EXTENSION_POINTS.md` before anything in GatoJS is edited.
- Architecture test: every catalog key exists in code (the slot is rendered, the handle wraps a component, the event is emitted, the command uses `defineCommand`).
- Changing or removing a `stable` point is a breaking change: a `kitFormat` bump (gato-cli spec §6) and a release note naming the old and new key.

## 6. Worked example: an `invoices` project module

A developer outside Web Amigos adds invoices to a GatoJS project with the `uploads` module. The module uses one slot, one event and one command hook, and edits no Gato file. Parts marked *proposed* need the extension points above; the rest works today.

**Manifest** (`.wa/kit.json`, `projectModules`):

```json
"invoices": {
  "manifest": {
    "name": "invoices",
    "version": "0.1.0",
    "description": "Invoices with PDF attachments",
    "requires": ["uploads"],
    "files": [
      "prisma/schema/invoices.prisma",
      "src/features/invoices/**",
      "src/app/[locale]/(app)/invoices/**"
    ],
    "schemaRelations": [{ "model": "Organization", "field": "invoices Invoice[]" }]
  }
}
```

**Model** (`prisma/schema/invoices.prisma`). `pdfUploadId` is a plain column, because `Upload` has no `wa:relations` region (5.7):

```prisma
model Invoice {
  id             String       @id @default(cuid())
  organizationId String       @map("organization_id")
  number         String
  status         String       @default("draft")
  assigneeId     String?      @map("assignee_id")
  pdfUploadId    String?      @map("pdf_upload_id") @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, number])
  @@map("invoices")
}
```

Then `npm run wa -- generate` (registry and the `wa:relations` region) and `npx prisma migrate dev --name add-invoices`.

**Module** (`src/features/invoices/module.ts`), client-safe data only:

```ts
export default defineModule({
  key: "invoices",
  nav: [{ href: "/invoices", labelKey: "nav", icon: "receipt", order: 30 }],
  routePrefixes: ["/invoices"],
  roles: ["owner", "admin", "member"],
  auditActions: [{ action: "invoice.issued", labelKey: "action-invoice-issued" }],
  uploadPurposes: [
    { key: "invoice-pdf", mimeTypes: ["application/pdf"], maxBytes: 10 * 1024 * 1024, visibility: "organization" },
  ],
});
```

**A command** (`src/features/invoices/services/commands/issue-invoice-command.ts`), written the way GatoJS commands are written today:

```ts
"use server";

export async function issueInvoiceCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult<{ id: string }>> {
  const context = await requireModuleAccess("invoices");
  try {
    assertServiceModeConfirmed(context, confirmation);
    const { id } = issueInvoiceSchema.parse(input);
    const updated = await prisma.invoice.updateMany({
      where: { id, organizationId: context.organizationId, status: "draft" },
      data: { status: "issued" },
    });
    if (updated.count === 0) {
      throw new DomainError("Invoice not found or already issued");
    }
    await trackAudit({ ...auditActor(context), action: "invoice.issued", entityType: "invoice", entityId: id });
    return { success: true, data: { id } };
  } catch (error) {
    return handleCommandError(error, "Could not issue the invoice");
  }
}
```

The UI calls it through `useServiceModeAction().run(issueInvoiceCommand, { id })` and renders the returned `dialog`, so a superadmin in service mode confirms the change. An isolation test (`*.integration.test.ts`, two organizations) proves that issuing with one organization's context leaves the other's invoice untouched.

**Slot** (*proposed*, `src/features/invoices/slots.ts`): a dashboard card with unpaid invoices.

```ts
export const slots = [
  defineContribution("dashboard.sections", {
    id: "invoices.unpaid-card",
    priority: 20,
    roles: ["owner", "admin"],
    component: () => import("./components/unpaid-invoices-card"),
  }),
];
```

`unpaid-invoices-card.tsx` is a server component that calls `listUnpaidInvoicesQuery()`, and that query starts with `getOrgContext()`.

**Event** (*proposed*, `src/features/invoices/subscribers.ts`): when a member leaves, their invoices lose the assignee.

```ts
export const subscribers = defineSubscribers({
  "organizations.member-removed": {
    id: "invoices.unassign-removed-member",
    run: async (event) => {
      await prisma.invoice.updateMany({
        where: { organizationId: event.organizationId, assigneeId: event.userId },
        data: { assigneeId: null },
      });
    },
  },
});
```

**Command hook** (*proposed*, `src/features/invoices/command-hooks.ts`): an issued invoice's PDF cannot be deleted through the `uploads` module.

```ts
export const commandHooks = defineCommandHooks({
  "uploads.delete": {
    id: "invoices.keep-issued-pdf",
    before: async (input, context) => {
      const used = await prisma.invoice.count({
        where: { organizationId: context.organizationId, pdfUploadId: input.id, status: "issued" },
      });
      if (used > 0) {
        throw new DomainError("This file is attached to an issued invoice");
      }
      return input;
    },
  },
});
```

**What `wa update` does with this project:** reads none of the files above (none is in a Gato snapshot), replaces the untouched Gato files (including `deleteUploadCommand` and the dashboard page with its `<Slot>`), refills the `wa:relations` region with `invoices Invoice[]`, and regenerates the registries with the module's slots, subscribers and hooks. If GatoJS renames `uploads.delete` or `dashboard.sections`, `npm run build` fails naming the key, and the release note names the new one.

### 6.1 Never do this

| Never | Why | Instead |
| --- | --- | --- |
| Edit a Gato file (a path with a hash in `.wa/kit.json`) | every update merges it; security fixes may conflict | an extension point from `EXTENSION_POINTS.md`; if none fits, `gato eject <file> --reason` and an issue asking for one |
| Edit `src/modules.generated.ts`, `src/modules.client.generated.ts` or a `wa:*` region | overwritten by `generate` and by every update | change the manifest or the module files and run `npm run wa -- generate` |
| Read `activeOrganizationId` from the session | skips the membership check and service mode | `getOrgContext()` from `src/shared/lib/auth/org-context.ts` |
| Take `organizationId` from the input | lets a caller write to another organization | `context.organizationId` in every `where` and `data` |
| Skip `assertServiceModeConfirmed(context, confirmation)` in a command | a superadmin changes customer data without confirming | call it right after the guard, before Prisma; `defineCommand` will do it for you |
| Call a command directly from the UI | fails in service mode, and no test catches it | `useServiceModeAction().run(command, input)` |
| Use `withoutTenantScope` without a reason | hides a cross-organization read | only for deliberate cross-organization reads, with a reason string |
| Put server code in `module.ts`, `slots.ts`, `components.ts` or `gato.config.ts` | they ship to the browser | server code in `subscribers.ts`, `command-hooks.ts`, `setup.ts`, `services/` |
| Name a key without your module prefix | keys collide between modules | `invoices.<name>` |

## 7. AI agents in the project

- The `protect-gato-files.mjs` hook (4.2) and its message pointing to `EXTENSION_POINTS.md`.
- A `gato-extend` skill (`.claude/skills/gato-extend/SKILL.md`, owned by `core`): an "I want to change X" decision tree leading to an extension point; only when none exists, `gato eject` with a reason and a draft issue for a new GatoJS extension point.
- A missing extension point is treated as a GatoJS bug, not as a reason to edit the file (lesson 4).
- Project rules for agents go to `AGENTS.project.md` (4.3), never into the Gato `AGENTS.md`.

## 8. Copied core or core from npm

| | A. Protected copy (recommended) | B. Core as npm packages |
| --- | --- | --- |
| Where the core lives | In the project repository, as today (D39); project packages `@gatojs/*` are copied too (ADR-56) | `node_modules/@gatojs/*`; the project holds only a shell and its modules |
| Readability for developers and agents | Full, code next to the app | Built code in `node_modules` |
| Upgrade | `wa update` replaces untouched files and merges ejected ones | `npm update` plus migration steps |
| Next.js routes | Plain files in `src/app` | Catch-all or generated route files (Next does not read routes from `node_modules`) |
| Cost | Medium: file protection plus extension points | Large: core rebuilt as packages, a shell, catch-all routes, new test and Stryker setup |
| Silently changed core | Caught by hashes, the hook and `verify` | Impossible, unless `patch-package` |

The extension points in section 5 are the same in both variants, so B stays possible later without rewriting project modules. The packages spec (§6) already treats publishing project packages as variant B.

## 9. Out of scope

- Core as npm packages (variant B).
- Catch-all routes and page discovery by file name.
- A DI container.
- Custom fields without migrations, queues and durable events, API response enrichers.
- `in-transaction` subscribers and `after` command hooks (5.5, 5.6).
- Renaming `.wa/kit.json`, `wa:*` regions and the `wa` script (the separate rename plan).

## 10. Order of work (outline for the plan)

1. **Ownership in warning mode:** `ejected` in `.wa/kit.json`, `gato eject`, `gato doctor --files`, the `protect-gato-files` hook, companion files (`AGENTS.project.md`, `mutation-gate.project.json`, `src/theme.css`). Needs the `doctor` command from the gato-cli spec; works through `npm run wa --` until the `gato` devDependency lands.
2. **`gato.config.ts`:** `applyGatoConfig`, nav item ids, disabling modules with `requireModuleEnabled`, key validation and its architecture test.
3. **Events:** `defineEvents`, `emitEvent`, the core better-auth events plugin (moving the path mapping out of `audit-logs`), `subscribers.ts` in the generator.
4. **`defineCommand` and `runCommand`** for every Gato command (`src/features/*/services/commands/`), the guard test update, `command-hooks.ts`. The largest change to GatoJS code; one module per PR.
5. **Slots and component handles** with the first list; the dashboard placeholder becomes `dashboard.sections`.
6. **Organization setup** (`OrganizationModuleSetup`, `setup:organizations`) and **permissions** (`can`).
7. **`EXTENSION_POINTS.md`**, the `gato-extend` skill, the docs (`docs/09-nowy-modul.md` gets the `invoices` example), and switching `verify` to blocking in a release whose notes say so.

Each step leaves a working GatoJS and does not break existing projects: extension points are additive, and protection starts as a warning. Steps 2, 3 and 5 change the generated files' shape and ship with a `kitFormat` bump.

Migration for existing projects during the warning period:

- `gato doctor` reports ejected files (with reasons) and **modified Gato files that are not ejected**.
- Each modified, non-ejected file is either reverted to the GatoJS version (when an extension point now covers the change) or ejected with a reason.
- From the release that makes `verify` blocking, `gato doctor` exits non-zero for any remaining modified, non-ejected file.

## 11. Decisions for Patryk

Answer with numbers and letters (for example "1A, 2A, 3B …"). The recommendation is marked.

1. **Where the core lives.**
   A. Protected copy in the project (D39, ADR-56). **Recommended**: readable for agents, routes stay plain files, extension points work the same if B comes later.
   B. Core as npm packages with a shell and catch-all routes.

2. **How hard the protection is.**
   A. Hard for agents (hook) and CI (`verify`), soft for humans through `gato eject --reason`; starts as a warning for one release. **Recommended.**
   B. Warning only, in `gato doctor`.
   C. Hard for everyone; no eject without a PR to GatoJS.

3. **Where project modules live.**
   A. In `src/features/<x>/`, next to Gato modules; the boundary is `.wa/kit.json`, the hook and the catalog. **Recommended**: the generator (`@/features/<name>`) and `readKitState` already assume it.
   B. A separate directory (`src/project-modules/<x>/`), visible in the tree; needs generator, `readKitState` and docs changes.

4. **The project configuration file.**
   A. `src/gato.config.ts`, applied by the generated registries when they load (`applyGatoConfig`), validated at import and by an architecture test. **Recommended**: no TypeScript loader in the CLI, nothing lazy.
   B. `gato.config.ts` at the root, executed by the CLI through `tsx`, with the result baked into the generated files.
   C. A JSON section in `.wa/kit.json`; no lazy component imports possible.

5. **Where the new declarations live.**
   A. One file per kind in `src/features/<x>/` (`slots.ts`, `components.ts`, `events.ts`, `subscribers.ts`, `command-hooks.ts`, `setup.ts`), found by name like `audit-sink.ts` today. **Recommended**: server code stays out of the client bundle by construction.
   B. Fields in `defineModule` plus a server-only `module.server.ts`.

6. **Command hooks.**
   A. `before` only; reactions through events. **Recommended**: one way to react, and `after` could not be transactional anyway.
   B. `before` and `after` (after the command succeeded, errors logged).

7. **Subscriber modes.**
   A. Only "after the operation succeeded" in v1. **Recommended**: core commands do not run in one transaction.
   B. Also `in-transaction`, which first needs every core command (and better-auth endpoints) wrapped in one transaction.

8. **Files every project changes (`AGENTS.md`, `CLAUDE.md`, `README.md`, `mutation-gate.json`, theme).**
   A. Companion project files read by the Gato files (`AGENTS.project.md`, `mutation-gate.project.json`, `src/theme.css`) and `README.md` as a seed file. **Recommended.**
   B. Project-owned regions (`gato:project:start/end`) inside the Gato files, excluded from hashes and kept from the project side in merges.
   C. Leave them as modified Gato files merged by `wa update`, listed as allowed in `gato doctor`.

9. **`gato eject` reason.**
   A. `--reason` required and stored in `.wa/kit.json`; `verify` fails for a modified file without an entry. **Recommended.**
   B. Reason optional.

10. **Custom fields without migrations in the first version.**
    A. No: own models and migrations; revisit after the first projects. **Recommended.**
    B. Yes: JSON fields per organization, declared by modules (the only extension point acme-app uses at scale, 19 fields).

11. **First list of slots and component handles (5.3, 5.4).**
    A. Accept the list in this spec and grow it on request through issues. **Recommended.**
    B. First collect what previous Web Amigos projects changed in core files, then fix the list.

12. **Which modules can be disabled in `gato.config.ts`.**
    A. All except `auth` and `organizations`; for unwanted Gato modules prefer `wa remove`. **Recommended.**
    B. Only optional Gato modules (`api-keys`, `audit-logs`, `uploads`).
    C. No `enabled: false` in v1; only `wa remove`.
