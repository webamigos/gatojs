# GatoJS extensibility: read-only Gato files, app modules through extension points

Date: 2026-11-22. Drafted by Patryk with an agent. Draft for review (CodeRabbit and Patryk); implementation follows acceptance.

Sources:

- open-mercato `0.9.0`, studied through the `acme-app` application (`.ai/guides/extensions.md`, `.ai/guides/framework-extension-points.md`, `.ai/skills/om-module-scaffold/references/discovery-surface-catalog.md`, `src/modules.ts`, `src/modules/acme/**`, the lessons in `.ai/lessons/` and decision `.ai/decisions/0001-ocr-files-behind-generic-attachment-routes.md`);
- GatoJS decisions [D31](../../decyzje.md#d31) (hashes and file ownership), [D36](../../decyzje.md#d36) (project modules), [D38](../../decyzje.md#d38), [D39](../../decyzje.md#d39) (kit code lives in the project as plain code), [D40](../../decyzje.md#d40) (`auditSinks`);
- `src/shared/lib/modules/define-module.ts`, `src/modules.generated.ts`, `docs/12-moduly-kitu.md` (generated seams, core entry points);
- PR #14 (`wa update`, three-way merge) and the `create-gato-app`/`gato-cli` spec (PR #25).

## 1. Why

A developer creates a GatoJS project and gets a skeleton: sign-in, organizations, roles, users, the panel and the selected Gato modules. Then they build the application. Today the only way to change kit behaviour is to edit a copied file. That has three consequences:

- the file no longer matches its hash in `.wa/kit.json`, so `wa update` has to merge it three ways and a human resolves conflicts;
- a security fix in the GatoJS core does not reach projects that changed that file cleanly;
- an AI agent working in the project does not know which files it may change, so it changes whatever is at hand.

Goal: a developer can build and change almost everything a project needs **without editing Gato files**. Gato files stay untouched, so a GatoJS upgrade replaces files instead of merging them.

## 2. What open-mercato teaches

open-mercato ships its core as npm packages (`@open-mercato/*`). The application has its own modules in `src/modules/<id>/`, a registry in `src/modules.ts` and a one-time copied shell (`src/app/**` with catch-all routes). Modules are discovered by file name (`backend/**/page.tsx`, `api/**/route.ts`, `acl.ts`, `setup.ts`, `events.ts`, `subscribers/*`, `widgets/injection-table.ts`, `widgets/components.ts`, `data/enrichers.ts`, `commands/interceptors.ts`, `ce.ts` and about 40 more). The generator writes about 60 registries to `.mercato/generated/`.

Changing core behaviour without editing the core goes through:

| Mechanism | How it works |
| --- | --- |
| `overrides` on a module entry in `src/modules.ts` | Keyed maps: `null` disables an item, a value replaces it (API routes, pages, subscribers, widgets, ACL, DI, CLI, setup). |
| Widget injection | `spotId → [{ widgetId, priority }]`; spots such as `data-table:<id>:row-actions`, `crud-form:<entity>:fields`, `menu:backend.sidebar`. |
| Component override by handle | `widgets/components.ts`: change props, wrap or replace. |
| Response enrichers, command and API interceptors, mutation guards | Hooks before and after another module's operations. |
| Events and subscribers | Typed module events, synchronous or persistent subscribers. |
| Entity extensions and custom fields | A separate table with a foreign key (no ORM relations across modules); custom fields declared in `ce.ts`. |
| `eject` | Last resort: copy a module into the app, which then upgrades it on its own. |

Lessons from `acme-app` (checked in its files):

1. **A stale override key only logs a warning.** After a core upgrade, a disabled route silently comes back. acme-app guards its keys with its own test.
2. **The override registry is also evaluated in the browser**, so it cannot import server code. Replacing a route with server code required editing the app shell.
3. **Overrides applied lazily** let disabled pages through on a cold start.
4. **A core route without a hook** forced acme-app to wrap 10 handlers and to deep-import core internals about 120 times. Every upgrade has to re-check those places.
5. **Keys without a namespace** (`seed-demo` in two modules) collide.
6. Some core behaviour could only be changed by writing to core tables from `setup.ts`, because the core read its configuration from its own file rather than from the registry.

## 3. Decisions needed before the rest of the spec

### 3.1 Copied core or core from npm

| | A. Protected copy (recommended) | B. Core as npm packages |
| --- | --- | --- |
| Where the core lives | In the project repo, as today (D39), marked as Gato-owned | `node_modules/@gatojs/*`; the project holds only the shell and its modules |
| Readability for developers and agents | Full, code is next to the app | Code in `node_modules`, built |
| Upgrade | Replace untouched files (`gato upgrade`); merge only ejected files | `npm update` plus migration steps |
| Next.js routes | Plain files in `src/app` | Catch-all or generated route files (Next does not read routes from `node_modules`) |
| Cost of the change | Medium: file protection plus extension points | Large: rebuild the core as packages, a shell, catch-all routes, different tests and Stryker setup |
| Risk of a silently changed core | Guarded by hashes, a hook and CI | None, unless `patch-package` |

Recommendation: **A**. The extension points in section 5 are the same in both variants, so variant B stays possible later without rewriting app modules. Open question 1.

### 3.2 Hard or soft protection of Gato files

Recommendation: **hard in CI and for agents, soft for humans**. A Claude Code hook blocks edits to Gato files, a test in `npm run verify` compares hashes, and a human can take over a file with one command (`gato eject`) that leaves a trace in `.wa/kit.json`.

## 4. File ownership

Every project file belongs to one of three groups:

| Group | Examples | Who changes it | GatoJS upgrade |
| --- | --- | --- | --- |
| **Gato** | core and Gato modules (manifest `files`) | nobody in the project | file replaced |
| **Ejected Gato file** | a Gato file the project deliberately took over | the project | three-way merge (`wa update` from PR #14) or a report |
| **App** | project modules (`projectModules`), `src/app.config.ts`, project module routes, own migrations | the project | untouched |

Enforcement:

- **A test in the project's `npm run verify`** (core architecture tests from harness phase 1): every file in the "Gato" group matches its hash in `.wa/kit.json`. The message names the file and either `gato eject <file> --reason "<reason>"` or the extension point that most likely covers the need.
- **A Claude Code hook** (`.claude/hooks/protect-gato-files.mjs`, modelled on `protect-tests.mjs`): blocks `Edit`/`Write` on files in the "Gato" group and points to the extension point catalog.
- **`gato eject <file> --reason`**: moves the file to the "ejected" group and records the reason and the base hash. The base hash is always the GatoJS hash from `.wa/kit.json` (the version the project was created from or last upgraded to), never the hash of the file's current, possibly modified content, so later `wa update` merges still use the GatoJS baseline. `gato doctor` lists ejected files with their reasons.
- `wa:*` regions and generated files stay as today (D31): their content does not count towards hashes.

## 5. Extension points

Every point has a stable key namespaced by module (`<module>.<name>`), an entry in the generated catalog (5.10) and a stability label. The generator fails when a module or `app.config.ts` references a key that does not exist (lesson 1).

### 5.1 App configuration: `src/app.config.ts`

An app file (not a Gato file), the single place for "disable, change, replace" decisions about Gato modules:

```ts
export default defineAppConfig({
  modules: {
    "api-keys": { enabled: false },
    users: {
      nav: { "users.list": { order: 50 } },
      roles: { invite: ["owner"] },
      components: { "users.invite-dialog": () => import("@/features/crm/components/invite-with-crm") },
      slots: { "users.table.row-actions": { "audit-logs.history-link": null } },
    },
  },
});
```

- The file is purely declarative and imports no server code. Components are lazy imports (lesson 2).
- `gato generate` reads it and writes separate client and server registries. Overrides are built into the generated registries, not applied at runtime (lesson 3).
- Every key is validated against the catalog (lesson 1): module keys, navigation item keys (`users.list`), slot ids and the ids of contributions to them (`audit-logs.history-link`), component handles, permission keys.
- **Disabling a module disables all of its entry points**, not only the registries: its pages (already through `requireModuleAccess`), its server actions, and its route handlers. Route handlers of kit modules (for example `src/app/api/v1/organization/route.ts` in `api-keys`) call a `requireModuleEnabled("<key>")` guard first and answer 404 when the module is disabled; an architecture test checks that every route handler owned by a module calls it. The module's tables and data stay untouched.

### 5.2 App modules

Unchanged from D36: `src/features/<x>/module.ts` with `defineModule`, an entry in `projectModules`, and pages as plain Next route files in `src/app/[locale]/(app)/<x>/` (owned by the app). No catch-all routes: Next routes stay Next routes.

`defineModule` gains fields for the declarations in 5.3–5.9: `slots`, `components`, `subscribers`, `commandHooks`, `setup`, `permissions`. The generator collects them from Gato and app modules alike.

### 5.3 UI slots

- The core and Gato modules place `<Slot id="users.table.row-actions" context={…} />` in their components. The slot list is part of the GatoJS contract (catalog, 5.10).
- A module contributes: `slots: { "users.table.row-actions": { id: "crm.open-contact", priority: 20, component: () => import("./components/open-contact") } }`.
- Each slot exports its `context` type, so a module's contribution is type-checked.
- First slot list (to confirm in the plan): side navigation, dashboard (`dashboard.sections`), user table and detail (`users.table.columns`, `users.table.row-actions`, `users.detail.sections`), organization settings (`organizations.settings.sections`), account (`account.sections`), top bar (`app.header.actions`).

### 5.4 Component override by handle

- Selected core components are wrapped: `export const InviteUserDialog = overridable("users.invite-dialog", InviteUserDialogBase)`.
- `app.config.ts` or a module can **replace** or **wrap** them (the wrapper receives the base component as a prop). There is no third "change props" mode, because wrapping covers it.
- Handles are listed in the catalog. Only components with a handle can be overridden. The list grows on demand, not "everything".

### 5.5 Domain events and subscribers

- The core and modules declare events in `events.ts` (`defineEvents({ "users.invited": z.object({...}) })`). First core events: `organizations.created`, `organizations.member-added`, `organizations.member-removed`, `users.invited`, `users.invitation-accepted`, `users.role-changed`, `auth.signed-up`.
- A module subscribes: `subscribers: { "users.invited": { id: "crm.create-lead", run: (event, ctx) => … } }`.
- Two modes:
  - `after-commit` (default): runs after a successful command; a subscriber error is logged and does not roll back the command (as with `auditSinks`, D40);
  - `in-transaction`: runs inside the command's transaction; an error rolls everything back. For validation and consistency.
- `auditSinks` becomes a special case of a subscriber. Migration in the plan.
- Queues and durable delivery are out of scope (they come with a `jobs` module).

### 5.6 Command hooks

Lesson 4: core commands need hooks from day one.

- Core and Gato module commands are built with `defineCommand({ key: "users.invite", input, run })`. The service mode contract (`assertServiceModeConfirmed`) and the session guard stay inside `defineCommand`, so a module cannot skip them.
- A module adds `commandHooks: { "users.invite": { before: (input, ctx) => …, after: (result, ctx) => … } }`. `before` can reject the command with a domain error or fill in input within the command's Zod schema; `after` receives the result and behaves like an `in-transaction` subscriber.
- A hook cannot change `organizationId` or the role from the context. `defineCommand` checks this after `before`.
- A hook also cannot redirect the command to another organization through its input: after `before`, `defineCommand` re-validates the input with the command's Zod schema and rejects it when any organization-scoped input field (`organizationId`, or a field the schema marks with `.meta({ organizationScoped: true })`) differs from its value before the hook or from the context organization. Commands keep taking the organization from the context, never from the input (AGENTS.md); the check makes a hook that breaks this fail loudly.
- API routes (`src/app/api/**`) get the same mechanism through `defineRoute`, in a second step.

### 5.7 Data

- Modules add their own Prisma models in their own `prisma/schema/<module>.prisma` files, as today.
- Relations to other modules' models: the `wa:relations` region (today only in `User` and `Organization`) becomes available in every Gato model that declares it, and `schemaRelations` in the manifest names the model and field.
- Custom fields without migrations (JSON per organization, like open-mercato's `ce.ts`) are out of scope for this spec. Open question 4.

### 5.8 Organization setup

`setup: { onOrganizationCreated(ctx) {…}, seed(ctx) {…} }` in `defineModule`. The core calls them after an organization is created (`after-commit`) and in `npm run admin:create`. This replaces adding data from inside core code.

- Both hooks must be idempotent: running them again for an organization that already has the data changes nothing (upserts keyed by organization and a stable id).
- Each successful run is recorded per organization and module (`OrganizationModuleSetup`: organization, module key, module version, finished at). A missing or failed record is a setup that did not complete.
- `gato doctor` (and an admin view later) lists organizations with missing setup records, and `npm run setup:organizations -- [--organization <id>] [--module <key>]` re-runs the hooks for them. The same command runs after a module is added to an existing project (`wa add`), because existing organizations never got the new module's setup.

### 5.9 Permissions

Today: `roles`, `adminOnly` and `multiOrgRoles` on a module. Extension: a module declares permissions (`permissions: { "crm.contacts.edit": { defaultRoles: ["owner", "admin"] } }`) and `app.config.ts` can change the default roles. Checks go through `can(ctx, "crm.contacts.edit")` instead of comparing roles in code. Per-organization assignments stored in the database are not part of this spec.

### 5.10 Extension point catalog

- `gato generate` writes `src/extension-points.generated.ts` (types and keys) and `EXTENSION_POINTS.md` at the project root: every slot, component handle, event, hookable command and permission, with its module, a stability label (`stable`, `experimental`) and a short description.
- The project's `AGENTS.md` and the `wa-new-module` skill point to `EXTENSION_POINTS.md` before anything in GatoJS is edited.
- Architecture test: every key in the catalog exists in code (the slot is rendered somewhere, the handle wraps a component, the event is emitted).
- Changing or removing a `stable` point requires a `kitFormat` bump (gato spec, §6) and a release note.

## 6. AI agents in the project

- The `protect-gato-files.mjs` hook (section 4) and its message pointing to `EXTENSION_POINTS.md`.
- A `gato-extend` skill (in the project's `.claude/skills/`): a "I want to change X" decision tree leading to an extension point; only when none exists, `gato eject` with a reason and a proposal for a new GatoJS extension point (an issue in the GatoJS repo).
- A missing extension point is treated as a GatoJS bug, not as a reason to edit the file (lesson 4).

## 7. Out of scope

- Core as npm packages (variant B in 3.1).
- Catch-all routes and page discovery by file name.
- A DI container.
- Custom fields without migrations, queues and durable events, API response enrichers.

## 8. Order of work (outline for the plan)

1. File ownership: hash test in `verify`, `protect-gato-files` hook, `gato eject`, `gato doctor` listing ejected files. Needs `gato-cli` (spec #25) or `wa` in the meantime.
2. `defineAppConfig` and the generator: disabling modules, navigation, roles, key validation.
3. Events and subscribers; `auditSinks` as a subscriber.
4. `defineCommand` with hooks for core and Gato module commands (the largest change to GatoJS code, file by file).
5. Slots and component handles with the first list.
6. Organization setup, permissions.
7. The `EXTENSION_POINTS.md` catalog, the `gato-extend` skill, documentation.

Each step leaves a working GatoJS and does not break existing projects: extension points are additive, and file protection starts as a warning in `gato doctor` before the `verify` test starts blocking (switched in a separate release).

Migration for existing projects during the warning period:

- `gato doctor` reports two lists: ejected files (with reasons) and **modified Gato files that are not ejected** (hash differs from `.wa/kit.json`).
- Each modified, non-ejected file is either reverted to the GatoJS version (when an extension point now covers the change) or ejected with a reason. `gato eject` records the GatoJS baseline hash, as above.
- The release that switches `verify` to blocking says so in its notes, and from that release on `gato doctor` exits non-zero for any remaining modified, non-ejected file.

## 9. Open questions

1. Variant A (protected copy) or B (core from npm)? Recommendation: A.
2. Do app modules stay in `src/features/` next to Gato modules, or move to a separate directory (for example `src/app-modules/`) so the Gato/app boundary is visible in the tree?
3. Should `gato eject` require `--reason`, and should the project CI block an eject without one?
4. Are custom fields without migrations (JSON per organization) needed in the first version? In `acme-app` they are the only extension point used at scale (19 fields).
5. Does the first list of slots and component handles cover what previous Web Amigos projects were missing?
