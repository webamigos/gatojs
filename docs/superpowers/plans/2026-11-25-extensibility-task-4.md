# Extensibility Task 4: companion and seed files (task plan)

Parent plan: [2026-11-23-extensibility.md](2026-11-23-extensibility.md), "Task 4". This file is the `gato-task` step 1 plan:
signatures, behaviours with literal expectations, mutations to kill.

## Files and signatures

- `scripts/lib/mutation-gate.ts` (critical):
  - `export class GateConfigError extends Error` with `name = "GateConfigError"`.
  - `export function parseGateConfig(text: string, path: string): GateConfig`: JSON-parses `text` and validates it with
    Zod (`critical?: string[]`, `allowed?: AllowedMutant[]`, both default `[]`; an `allowed` entry needs the five string
    fields `file`, `mutator`, `original`, `replacement`, `reason`). Invalid JSON or an invalid shape throws
    `GateConfigError` whose message starts with `Invalid <path>: `.
  - `export function mergeGateConfigs(gato: GateConfig, project: GateConfig | undefined): GateConfig`: `critical` is
    Gato's list followed by the project's entries not already in it (order kept, no duplicates, also none from
    duplicates inside the project list); `allowed` is Gato's entries followed by the project's. `undefined` returns
    a config equal to `gato`. Inputs are not mutated.
- `scripts/mutation-gate.ts`: reads `mutation-gate.json` through `parseGateConfig`; when `mutation-gate.project.json`
  exists in the working directory, parses it the same way and merges it; a `GateConfigError` prints its message to
  stderr and exits 1. A missing project file is not an error.
- `scripts/lib/architecture/cited-paths.ts`: the optional companion files `AGENTS.project.md` and
  `mutation-gate.project.json` are not reported as missing when `AGENTS.md`/`CLAUDE.md` cite them.
- `AGENTS.md`, `CLAUDE.md`: one line each telling agents to read `AGENTS.project.md` first when it exists; it wins over
  generic advice, never over the hard rules.
- `src/theme.css` (new, `core` `files` entry): an empty token layer; a CSS comment shows `:root { --primary: … }`
  and `@theme inline { --font-sans: … }`.
- `src/app/globals.css`: `@import "../theme.css";` as the last statement, so the project layer comes after every Gato
  token (Tailwind 4 inlines a late `@import` at its position; verified with `@tailwindcss/postcss` 4.3.5).
- `kit/kit.json`: `seedFiles: ["README.md", "src/theme.css"]`.
- Docs: `docs/11-praca-z-kitem.md`, `docs/08-testy.md`, `kit/CLAUDE.md`. `core` minor bump.

## Behaviours

1. `mergeGateConfigs({ critical: ["a/"], allowed: [x] }, { critical: ["b/", "a/"], allowed: [y] })` →
   `{ critical: ["a/", "b/"], allowed: [x, y] }`.
2. `mergeGateConfigs(gato, undefined)` → equal to `gato`.
3. `mergeGateConfigs({ critical: ["a/"], allowed: [] }, { critical: ["b/", "b/"], allowed: [] })` →
   `{ critical: ["a/", "b/"], allowed: [] }`.
4. `parseGateConfig('{"critical":"src/"}', "mutation-gate.project.json")` throws `GateConfigError` with a message
   starting `Invalid mutation-gate.project.json: `; the same for `"{"` (not JSON) and for an `allowed` entry without
   `reason`.
5. `parseGateConfig("{}", "x.json")` → `{ critical: [], allowed: [] }`; a full valid file round-trips.
6. Running `tsx scripts/mutation-gate.ts <report>` in a directory whose `mutation-gate.project.json` has
   `"critical": "src/"` → exit code 1, stderr contains `mutation-gate.project.json`.
7. The same run with a project file whose `allowed` covers a surviving mutant in a project `critical` path → exit 0;
   without the project file the mutant in that path is not checked (exit 0); with a project `critical` path and no
   `allowed` entry → exit 1 naming the mutant.
8. A project `allowed` entry does not remove a Gato `allowed` entry: a Gato-allowed mutant stays allowed when the project
   file has its own `allowed` list.
9. `checkCitedPaths` on `AGENTS.md` citing `` `AGENTS.project.md` `` and `` `mutation-gate.project.json` `` (both
   absent) → `[]`; another absent root file (`` `nope.md` ``) is still reported.
10. The repo's `AGENTS.md` and `CLAUDE.md` each contain `AGENTS.project.md`.
11. Compiling `src/app/globals.css` with `@tailwindcss/postcss` next to a `theme.css` that sets
    `:root { --primary: #ff0000; }` → the output has `--primary: #ff0000` after `--primary: #2563eb`.
12. `kit/kit.json` `seedFiles` equals `["README.md", "src/theme.css"]`; `src/theme.css` is owned by `core`.
13. A project created from the branch records `"README.md": "seed"` and `"src/theme.css": "seed"` in `.wa/kit.json`
    (manual check with `node .wa/bin/wa.mjs create`; `wa update` skipping seed files is covered by
    `packages/gato-cli/src/update/__tests__/plan.test.ts`).

## Mutations to kill

- project `allowed` replacing Gato `allowed` (or Gato replacing project);
- duplicate critical paths kept; project-only critical path dropped;
- missing project file treated as an error; project file ignored when present;
- Zod schema loosened (string accepted for `critical`, `reason` optional);
- error message without the file path;
- `@import "../theme.css"` moved before the Gato tokens;
- seed file overwritten by `update` (CLI, already covered).
