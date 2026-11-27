# ADR-59: Gato files are protected, ejected with a recorded reason, and the CLI state carries a `kitFormat`

**Status:** Accepted (blocking since core 0.36.0 and gato-cli 0.15.0; warning mode in core 0.17–0.35 / gato-cli 0.5.0–0.14.0)
**Date:** 2026-11-24
**Decided by:** Patryk Omiotek, implemented by an agent

## Context

A GatoJS project copies Gato files (core and module code) into its own tree and keeps them in step with `npm run wa -- update`, which three-way merges every file the project changed. Nothing tells a developer or an agent which files they should not edit, so projects drift: every local edit of a Gato file becomes a merge on the next update, and nobody remembers why it was made. Some files, such as `README.md`, are meant to be rewritten by every project and should never be merged at all.

The CLI state file `.wa/kit.json` also had no version. `writeKitState` writes a fixed list of keys, so a field that an older CLI does not know is silently dropped by every `add`, `remove` and `update`. Adding ownership data to the state needs a way for a CLI to refuse a state or kit it cannot read.

## Decision

Files of a project fall into three groups, defined by `.wa/kit.json` and not by manifest globs (extensibility spec §4.1):

- **Gato file:** a path with a content hash in `modules.<module>.files`. Nobody in the project changes it; `wa update` replaces it.
- **Ejected Gato file:** a Gato file listed in `ejected` with a reason. The project owns its changes; `wa update` three-way merges it as before.
- **Project file:** everything else, including new files inside Gato directories, generated files, `managed` files and `seed` files.

The CLI state carries the data for this:

- `kit/kit.json` declares `kitFormat` (an integer) and `seedFiles` (paths). A kit or project without `kitFormat` is format `1`, so the first kit that declares it is format `2`. `SUPPORTED_KIT_FORMATS` in `packages/gato-cli/src/kit/kit-format.ts` lists what a CLI reads; `assertSupportedKitFormat` stops `create` (kit), every command that reads `.wa/kit.json` (project) and `update` (target kit, before anything is written) with `This project uses kit format <n>; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>`. The second hint serves a project whose bundled CLI (`npm run wa`) is older than the target.
- `.wa/kit.json` gains `kitFormat` (written after `kitRepo`) and `ejected: { "<path>": { "reason": "<non-blank>", "ejectedAt": "<YYYY-MM-DD>" } }` (written after `projectModules`, keys sorted by code point). Every command keeps `ejected` byte for byte.
- The hash vocabulary gains `"seed"` next to `"managed"`: `fileHash` returns `"managed"` first, then `"seed"` for a path in `seedFiles`. A seed file is copied once by `create`; `wa update` never plans it, `wa remove` neither deletes it nor counts it as changed, and the marker is kept while the target kit still lists the path.
- `kitFormat` changes whenever a contract the CLI reads changes: the `.wa/kit.json` or manifest schema, `wa:*` regions, the layout of generated files, the hash vocabulary. Filling a list such as `seedFiles` changes no contract.

Enforcement of the groups started as a warning (`gato doctor --files` from core 0.17.0 and gato-cli 0.5.0, the `protect-gato-files` hook from core 0.18.0, `gato eject`, extensibility plan Tasks 2 and 3; the hook's warning was printed in the tool result, not only as an `ask` decision) and became blocking in core 0.36.0 and gato-cli 0.15.0 (Task 20): `gato doctor --files` exits 1 and the hook blocks the edit with exit 2.

## Rejected alternatives

- Ownership by manifest globs: `core` owns broad globs such as `src/shared/**`, so a project file added there would count as a Gato file. Recorded hashes name exactly what GatoJS shipped.
- A base hash per ejected file: `modules.<module>.files` already holds the hash of the version last created or updated to, and `wa update` rewrites it.
- Starting `kitFormat` at `1` in the first kit that declares it: projects created before it have no field, and they must stay distinguishable from the first format that knows `ejected` and `seed`.
- Requiring `kitFormat` in `kit/kit.json`: `wa update` reads the base snapshot of the project's current kit, and every kit released before this decision lacks the field.

## Consequences

- A change to a contract the CLI reads bumps `kitFormat` and extends `SUPPORTED_KIT_FORMATS` in the same PR (`kit/CLAUDE.md`, "Moduły i manifest").
- A new seed file is a `seedFiles` entry, never a protection exception.
- A project whose recorded seed file is later dropped from `seedFiles` gets a content hash on the next update; the file is then a Gato file the project may have modified.

## Enforcement

- `packages/gato-cli/src/kit/__tests__/kit-format.test.ts`, `src/manifest/__tests__/{kit-state,schema}.test.ts`, `src/assemble/__tests__/hash.test.ts`, `src/update/__tests__/plan.test.ts`, `src/commands/__tests__/{create,update,add,remove,kit-sync}.test.ts` in the CLI gate (`npm run verify --prefix packages/gato-cli`).
- Protection of Gato files: `gato doctor --files` in `npm run verify` and `.claude/hooks/protect-gato-files.mjs` (extensibility plan Tasks 2 and 3).

## Sources

- `docs/superpowers/specs/2026-11-22-extensibility-design.md` §4 (PR #26), decisions 1A–12A.
- `docs/superpowers/specs/2026-11-21-gato-cli-design.md` §6.
- `docs/superpowers/plans/2026-11-23-extensibility.md`, Task 1 and open questions 3 and 4.
