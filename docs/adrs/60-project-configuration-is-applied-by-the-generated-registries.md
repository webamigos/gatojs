# ADR-60: Project configuration lives in `src/gato.config.ts` and is applied by the generated registries when they load

**Status:** Accepted
**Date:** 2026-11-25
**Decided by:** Patryk Omiotek, implemented by an agent

## Context

A project that wants to change how a Gato module behaves (hide it, move its menu item, let only owners see it) today edits the module's `module.ts`. That turns a Gato file into a local change: every `wa update` has to three-way merge it, and once Gato files are protected (ADR-59) the edit needs an `eject` with a reason. The project needs one place of its own for "disable, reorder, change access" decisions that survives updates untouched.

The module lists reach the app through two generated files, `src/modules.generated.ts` (server) and `src/modules.client.generated.ts` (client: the menu and the page guard `requireModuleAccess`, which reads `clientModules` through `moduleByKey`). The generator (`gato-cli`) is a bundled Node script that does not execute TypeScript.

## Decision

The project configuration is a project file, `src/gato.config.ts`, whose default export is a `GatoConfig` (`defineGatoConfig` in `src/shared/lib/modules/gato-config.ts`). No manifest glob owns it, so `wa update` never touches it. Fields in this release:

- `modules.<key>.enabled: false` removes a module from every registry list. `auth` and `organizations` cannot be disabled (`UNDISABLEABLE_MODULES`, extensibility decision 12A).
- `modules.<key>.nav.<navId>` with `order` and `hidden` changes one menu item, addressed by the new `ModuleNavItem.id` (`dashboard.home`, `users.list`, `account.home`, `api-keys.list`, `audit-logs.list`).
- `modules.<key>.access` with `roles`, `adminOnly`, `multiOrgRoles` **replaces the module's whole access policy**: a field the override does not set becomes `undefined`. `canAccessModule` lets `adminOnly` win over `roles`, so merging `{ roles: ["owner"] }` into `users` (`adminOnly: true`) would change nothing; replacing makes the override mean what it says. An override that sets none of the three fields is an error.

The generator does not read the config. `wa generate` only checks whether `src/gato.config.ts` exists and emits, as line 2 of both registries, `import gatoConfig from "@/gato.config";` or `import { emptyGatoConfig as gatoConfig } from "@/shared/lib/modules/gato-config";`. Module lists become `applyGatoConfig([...], gatoConfig)`; lists owned by a module (`moduleEnvSchemas`, `authPlugins`, `auditSinks`, `authClientPlugins`, each locale of `moduleMessages`) become `enabledEntries([{ module: "<key>", value: … }], gatoConfig)`. The config is therefore evaluated once, when the registry module is first imported, before any request; nothing is applied lazily, and the menu, the page guard and the server see the same result.

`applyGatoConfig` validates before it applies: an unknown module key, an unknown nav id, an empty `access` or disabling `auth`/`organizations` throws `GatoConfigError` listing every problem at once (`Invalid src/gato.config.ts:` followed by one `- <path>: <problem>` line each). Because the registries import the config, `next build`, `npm run dev` and every test importing a registry fail at import with the bad keys named. Unknown keys are never ignored with a warning.

Both registries import the config, so it is part of the client bundle and must stay client-safe: plain data, no server imports.

The generated layout changed, so this is `kitFormat` 4 (`gato-cli` 0.7.0).

## Rejected alternatives

- A config executed by the CLI through `tsx` (or another TypeScript loader), with the result baked into the generated files (option 4B): the CLI would need a TypeScript runtime and the project's path aliases, a config change would need a `wa generate` to take effect, and generated files would drift from the config whenever someone forgot it. Lazy component imports, which later config fields need, cannot be serialised into a generated file either.
- A JSON section in `.wa/kit.json` (option 4C): `.wa/kit.json` is CLI state rewritten by every `add`, `remove` and `update`, not a file the project edits; JSON has no types or editor completion and cannot hold lazy `import()` of components.
- Applying the config lazily at request time: different callers could see different module lists, and a bad key would surface only on the page that happens to read it.
- Merging `access` field by field: see the `users` example above; a partial merge silently does nothing when `adminOnly` is set.

## Consequences

- Creating or deleting `src/gato.config.ts` needs `npm run wa -- generate`; editing it does not.
- `enabled: false` keeps a module's files, tables and data; `npm run wa -- remove <module>` stays the tool for an optional Gato module the project does not want at all. Entry points that bypass `requireModuleAccess` (route handlers such as `src/app/api/v1/organization/route.ts`, some commands) are not yet covered; `requireModuleEnabled` (extensibility plan Task 6) closes that gap.
- Every nav item of a Gato module has an `id` prefixed with its module key; project modules may omit it until the next `kitFormat`.
- A release that renames a key the config uses makes the project fail at the next build with the key named.

## Enforcement

- `src/shared/lib/modules/__tests__/gato-config.test.ts`, `gato-config-nav.test.ts`, `generated-registries-apply-config.test.ts` and `src/shared/lib/auth/__tests__/require-module-access-gato-config.test.ts`: application, validation and the real registries.
- `src/__tests__/architecture/gato-config-keys-exist.test.ts` (`scripts/lib/architecture/gato-config-keys.ts`): the project's config names only existing modules and nav ids.
- `src/__tests__/architecture/client-bundles-stay-server-free.test.ts` (`CLIENT_ENTRY_FILES` in `scripts/lib/architecture/client-imports.ts`): the config and its helper have no server imports.
- `src/__tests__/architecture/gato-nav-items-have-ids.test.ts`: every Gato nav item has a prefixed, unique id.
- `packages/gato-cli/src/generate/__tests__/{registry,generate,generate-rendering}.test.ts` in the CLI gate: the exact generated output with and without the config file.

## Sources

- `docs/superpowers/specs/2026-11-22-extensibility-design.md` §5.1, decisions 4A and 12A.
- `docs/superpowers/plans/2026-11-23-extensibility.md`, Task 5; `docs/superpowers/plans/2026-11-25-gato-config.md`.
