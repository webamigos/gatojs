# ADR-63: Extension points are namespaced, labelled and catalogued in a generated `EXTENSION_POINTS.md` that a test keeps in step with the code

**Status:** Accepted
**Date:** 2026-11-27
**Decided by:** an agent with Patryk (extensibility plan, Task 18)

## Context

GatoJS projects change core behaviour through extension points instead of editing Gato files (ADR-59): module keys and nav ids in `src/gato.config.ts` (ADR-60), domain events (ADR-61), command hooks (ADR-62), UI slots (ADR-68), component handles (ADR-69), permissions and the better-auth paths a module's `auth.ts` can hook. Before this decision an agent or a developer had to read the code of each mechanism to learn which keys exist, whether a key may change between releases, and what it means. A list kept by hand next to the code goes stale silently: a renamed slot keeps its old row, a new event never gets one.

The plan offered two ways for `npm run wa -- generate` to learn the declarations: parse each module's TypeScript with the compiler API inside the CLI bundle, or read a small hand-written JSON file per module checked by an architecture test.

## Decision

- **Namespacing.** Every key except module keys and better-auth paths starts with the owning module's key and a dot (`users.invite-dialog`, `uploads.delete`); core-hosted slots use the reserved owner `app` (`app.header.actions`). Contributions, overrides, hooks and subscribers carry the contributing module's prefix. The runtime registries already reject most bad prefixes; the catalog test rejects every catalog row without one.
- **Labels.** Each point is `stable` or `experimental`, with a one-line description, in `src/features/<x>/extension-points.json` (core-hosted points in `src/shared/lib/modules/extension-points.json`). Fields: top-level `stability` and `description` for the module row, then `nav`, `slots`, `components`, `events`, `commands`, `authPaths`, `permissions`, each a map of key to `{ stability, description }`. A module without the file is listed as `experimental` with no description. Every current point is `stable` except `users.table.columns`.
- **Catalog.** `generate` (`packages/gato-cli/src/generate/extension-points.ts`) validates the JSON files and writes `src/extension-points.generated.ts` (the rows plus the key unions `ModuleKey`, `NavItemId`, `SlotId`, `ComponentHandle`, `EventName`, `CommandKey`, `PermissionKey`) and `EXTENSION_POINTS.md` at the project root (sections: modules, nav items, slots, component handles, events, commands, better-auth paths, permissions; rows sorted by key). Both are in `generatedFiles` of `kit/kit.json`; `kitFormat` 11.
- **JSON, not the TypeScript compiler.** The CLI bundle `.wa/bin/wa.mjs` is about 0.9 MB and is committed into every project; the TypeScript compiler would add about 9 MB to it, and loading `typescript` from the project's `node_modules` would make `generate` depend on an install that `wa create --no-install` does not have. A JSON file is read with what the bundle already has (zod). The price is a key written twice, in the code and in the JSON; the test below turns that duplication into an error instead of drift.
- **Stale keys are errors, never warnings.** `findExtensionPointProblems` in `scripts/lib/architecture/extension-points.ts` compares the generated catalog with the code in both directions: a slot is declared by `defineSlot` and rendered by `<Slot>`, `<ClientSlot>` or `visibleContributions`, a handle wraps a component through `overridable`, an event is declared and emitted (`emitEvent`, a command's `events`, or an emit object of the better-auth events plugin), a command key is a `defineCommand`, nav ids and permissions come from `module.ts`, better-auth paths from `ORGANIZATION_EVENT_PATHS`. Each problem names the key and the file it was expected in or found in.
- **Typed configuration.** `defineGatoConfig` takes `ProjectGatoConfig`, whose keys are the generated unions, so a typo in `src/gato.config.ts` fails `npm run typecheck` as well as the import-time check of ADR-60.
- **Breaking changes.** Renaming or removing a `stable` key is a breaking change: a `kitFormat` bump and a release note naming the old and the new key. An `experimental` key can change in any release.

## Rejected alternatives

- TypeScript compiler API in the CLI bundle: about ten times the bundle size in every project, for reading a few string literals.
- A regular-expression scanner of the TypeScript declarations in the CLI: the declarations (`defineEvents` with zod schemas, `defineCommand` objects) are not regular, and a scanner that misreads one would generate a wrong catalog with no error; the JSON is validated, and the test reads the declarations by importing them.
- Labels inside each declaration (`defineSlot(id, { stability })`) with the catalog produced by the test runner: `generate` could not write the catalog without executing project code, which the CLI never does (ADR-60).
- A hand-written `EXTENSION_POINTS.md`: nothing would catch a stale row.

## Consequences

- Adding a point to a module means declaring it in code and describing it in the module's `extension-points.json`, then `npm run wa -- generate`; `docs/16b-rozwoj-kitu.md` describes the steps for GatoJS contributors and `docs/09-nowy-modul.md` for project modules.
- A project module with nav ids, slots, events, commands or permissions needs its own `extension-points.json`; the architecture test names every key it lacks.
- Agents look in `EXTENSION_POINTS.md` and the `gato-extend` skill (`.claude/skills/gato-extend/SKILL.md`) before touching a Gato file; `AGENTS.md` routes "Changing GatoJS behaviour" there.

## Enforcement

- `src/__tests__/architecture/extension-points-exist.test.ts` (catalog against code, both directions, and namespacing).
- `generate` stops on an invalid `extension-points.json`; CI runs `npm run wa -- generate` and `git diff --exit-code`, so a JSON change without a regenerated catalog fails.
- `npm run typecheck` through `ProjectGatoConfig`; `applyGatoConfig` and `src/__tests__/architecture/gato-config-keys-exist.test.ts` at import time.
- The `protect-gato-files` hook blocks edits of files that start with the generated header, the Markdown one included.

## Sources

- Spec `docs/superpowers/specs/2026-11-22-extensibility-design.md` §5 and §5.10.
- Plan `docs/superpowers/plans/2026-11-23-extensibility.md`, Task 18 and open question 10; detail in `docs/superpowers/plans/2026-11-27-extension-points-catalog.md`.
