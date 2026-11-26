# GatoJS extensibility — implementation plan

**Goal:** a developer builds almost everything a project needs without editing Gato files. Gato files are protected (warning first, blocking one release later), files every project changes get project-owned companions, and project modules plug in through `src/gato.config.ts`, typed events, `before` command hooks, UI slots and component handles, all listed in a generated `EXTENSION_POINTS.md` and guarded by architecture tests.

**Spec:** [docs/superpowers/specs/2026-11-22-extensibility-design.md](../specs/2026-11-22-extensibility-design.md) (PR #26, branch `docs/extensibility-spec` until it merges), accepted by Patryk on 2026-11-23 with every recommendation in its section 11 (1A–12A). Read it together with this plan; section numbers below (§4.2, §5.6, …) point into it.

**Execution:** Orca workers, one task per worker, each on its own branch from `main`, one PR per task. Order and parallelism:

```text
T1 kitFormat + ownership state ──┬── T2 doctor --files + eject ─────────────────────────────┐
                                 ├── T3 protect-gato-files hook (warn) ─────────────────────┤
                                 ├── T4 companion + seed files ─────────────────────────────┤
                                 └── T5 gato.config.ts ──┬── T6 requireModuleEnabled guards ─┤
                                                         ├── T7 branding ────────────────────┤
                                                         ├── T8 permissions (can) ───────────┤
                                                         ├── T9 events + subscribers ──┬── T10 core auth events plugin
                                                         │                             ├── T11 organization setup (+T2)
                                                         │                             └── T12 defineCommand + hooks (+T6)
                                                         │                                   ├── T13 users commands
                                                         │                                   └── T14 api-keys commands
                                                         └── T15 slots ──┬── T16 users table slots
                                                                         └── T17 component handles
T2–T17 ── T18 EXTENSION_POINTS.md catalog + stale-key tests + gato-extend skill
T18 ── T19 invoices fixture in the assemble job
T19 + one release in warning mode ── T20 protection becomes blocking
```

Why this order differs from the spec's §10 outline: `kitFormat` does not exist in the code yet (`grep kitFormat` finds only specs and plans), and `seed`, `ejected` and every registry shape change below need it, so it comes first (T1). Permissions (spec step 6) move up next to `gato.config.ts`, because the config's `roles` override is their only consumer. Organization setup (spec step 6) follows events, because `onOrganizationCreated` is a subscriber of `organizations.created`.

Parallel tasks that touch the generator (`packages/gato-cli/src/generate/registry.ts`, `index.ts`) or the bundle `.wa/bin/wa.mjs` will conflict textually: the second one to merge rebases, re-runs `npm run build --prefix packages/gato-cli` and `npm run wa -- generate`, and takes the next free `kitFormat`, `gato-cli` version and module version. Run at most two generator tasks at once (for example T9 and T15).

**Order across the extensibility and self-hosting plans** (set 2026-11-24, at most two workers at once). Two lanes, so that two running tasks never both change `packages/gato-cli` (version, `.wa/bin/wa.mjs`, the generator):

- Lane A, `gato-cli` and the generator, one task at a time: extensibility T2 → self-hosting T5 → extensibility T5 → extensibility T7, T9, T15 and the rest of the generator tasks.
- Lane B, no `gato-cli` changes: self-hosting T8 → extensibility T3 → extensibility T4 → self-hosting T6 (as soon as self-hosting T5 has merged; it jumps the queue) → self-hosting T7, T9 and T10 → extensibility T6 and T8 (after extensibility T5).

When a slot frees up, the next task of its lane starts if its dependencies have merged; otherwise the first ready task of the other lane that does not touch `gato-cli`. Versions (`gato-cli`, `create-gato-app`, `core`, `kitFormat`) are always the next free ones at merge time, whatever the task text says.

## Global constraints

- Rules in `CLAUDE.md`, `AGENTS.md` and `kit/CLAUDE.md` apply: no code comments except `// WHY:` (at most 3 lines) and tool directives; no `any`, nested ternaries or silent `catch {}`; Zod at external input; error class `name` as a string. `AGENTS.md` and `CLAUDE.md` must stay inside the `agent-instructions-fit-the-budget` architecture test; move detail to `docs/` or a skill rather than growing them.
- Every task runs the `gato-task` skill (`.claude/skills/gato-task/SKILL.md`): its "Behaviours" and "Mutations to kill" below are the plan for step 1; the `test-writer` subagent writes the tests first and shows a red run for the right reason; the phase file (`.superpowers/phase`, or `.gato/phase` once agent-workflow Task 2 merges) holds `implement` in the worker's worktree during implementation; the `test-reviewer` subagent runs `npm run test:mutation:task -- <files>` (and `--prefix packages/gato-cli` for CLI files) and `npm run test:mutation:gate`. Expected values are literals or come from the spec. Hook tests use `node --test`; mutate `.mjs` files as lesson `stryker-typescript-checker-cannot-mutate-mjs` says.
- New content (code, docs, commit messages, test titles, developer-facing messages) is English. Existing Polish docs (`docs/16-cli-wa.md`, `docs/02b-rejestr-i-generator.md`, `docs/09-nowy-modul.md`, …) are edited in their current language until the English migration. User-facing UI strings go through i18n and keep both locales. Existing user-facing error messages of migrated commands stay byte-for-byte (tests pin them).
- Naming: new names say GatoJS or gato (`gato.config.ts`, `gato eject`, `gato doctor`, `protect-gato-files.mjs`, `EXTENSION_POINTS.md`); "kit" only as a plain noun. Existing names keep their spelling: `.wa/kit.json`, `kit/kit.json`, `wa:*` regions, `npm run wa -- <command>`, `projectModules`. A new CLI command works under both `gato` and `npm run wa --` (same bundle).
- **Versions.** Every Gato file change bumps the owning module's `version` in `kit/modules/<module>.json` (patch for fixes, minor for new behaviour), then `npm run wa -- kit sync && npm run wa -- generate`, committed, then `git diff --exit-code`. Every `packages/gato-cli/src` change bumps `packages/gato-cli/package.json` (minor for a new command or format, patch otherwise), rebuilds the bundle (`npm run build --prefix packages/gato-cli`, commit `.wa/bin/wa.mjs`) and moves the exact pin in `packages/create-gato-app/package.json` with a patch bump of `create-gato-app` (`kit/CLAUDE.md`, "create-gato-app"). A change to a contract the CLI reads (`.wa/kit.json`, manifest schema, `wa:*` regions, generated file layout) bumps `kitFormat` in `kit/kit.json` and adds the new value to `SUPPORTED_KIT_FORMATS` (T1). If `main` moved and a number collides, take the next free one. Publishing to npm is the coordinator's job, never the worker's.
- **Decisions and lessons.** ADRs from `docs/adrs/TEMPLATE.md`, next free number from 59 (reserved: ADR-59 in T1, ADR-60 in T5, ADR-61 in T9, ADR-62 in T12, ADR-63 in T18; take the next free one if they moved), with a row in `docs/adrs/README.md`. Before starting, skim `docs/lessons.md` for the area; lessons that apply to most tasks: `a-new-file-needs-an-owner-only-the-cli-gate-checks` (every new Gato file sits under an owned glob, or the manifest grows), `macos-lists-directories-in-sorted-order` (generator output must be sorted explicitly), `vitest-runs-what-tsc-rejects`, `cli-tests-time-out-under-heavy-load`, `lint-staged-stashes-into-the-shared-git-stack`. A new non-obvious gotcha goes to `docs/lessons/` with its line in `docs/lessons.md`.
- **Docs.** In-repo docs named in each task are updated in the same PR. docs.gatojs.com lives in the website repository: each task lists the pages to change in its report, and the coordinator hands them over; the worker does not edit the website.
- Gates before handing in: `npm run verify`; the CLI gate `npm run verify --prefix packages/gato-cli` when CLI code changes; `npm run test:integration` for data code; `npm run test:e2e` when runtime pages or auth change. e2e resets `wa_app_e2e`: ask the coordinator for Patryk's consent text before each run (lesson `prisma-refuses-a-database-reset-from-an-agent`), and use your own ports and containers (lesson `parallel-worktrees-need-their-own-ports-and-dirs`). The `assemble` job in `.github/workflows/kit.yml` runs on the PR; a task that changes what a created project contains says how it checked that locally (`node .wa/bin/wa.mjs create /tmp/x --kit . --yes --no-install --no-git`).
- Conventional Commits, lowercase subjects, body lines ≤ 100 characters, footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, PR or publish; the coordinator does that.
- Report: branch, commits, gate results with numbers, surviving mutants with classification, proposed `mutation-gate.json` `allowed` entries (a human adds them), website pages to update, anything unverified, gotchas.

---

### Task 1: `kitFormat`, `ejected` and `seed` in the CLI state (ADR-59)

**Branch:** `feat/kit-format-and-ownership-state`

**Files:**
- `kit/kit.json`: `"kitFormat": 2` (format 1 = every project created before this task, which has no field), `"seedFiles": []` (filled by T4).
- `packages/gato-cli/src/kit/kit-config.ts`: `kitConfigSchema` gains `kitFormat: z.number().int().positive()` and `seedFiles: z.array(z.string()).default([])`.
- `packages/gato-cli/src/manifest/schema.ts`: `kitStateSchema` gains `kitFormat: z.number().int().positive().default(1)` and `ejected: z.record(z.string(), z.object({ reason: z.string().trim().min(1), ejectedAt: z.string() })).default({})`. New `packages/gato-cli/src/kit/kit-format.ts` with `SUPPORTED_KIT_FORMATS = [1, 2]` and `assertSupportedKitFormat(format, cliName)` (message from the gato-cli spec §6: `This project uses kit format <n>; update gato-cli (npm i -D gato-cli@latest)`).
- `packages/gato-cli/src/manifest/kit-state.ts`: `writeKitState` writes `kitFormat` (after `kitRepo`) and `ejected` (after `projectModules`, keys sorted by code point). Today it writes a fixed key list, so a field the schema does not know is silently dropped by every `add`, `remove` and `update`; that is the bug this task prevents for `ejected`. `readKitState` calls `assertSupportedKitFormat`.
- `packages/gato-cli/src/assemble/hash.ts`: `fileHash` returns `"seed"` for a path in `config.seedFiles` (checked after `managedFiles`). `packages/gato-cli/src/update/plan.ts` and `packages/gato-cli/src/commands/update.ts`: a recorded hash `"seed"` is skipped exactly like `"managed"` is skipped for content (never planned, never merged); `nextState` keeps `"seed"` for paths still in the target's `seedFiles`. `packages/gato-cli/src/commands/remove.ts`: a `"seed"` file is left in place when its module is removed.
- `packages/gato-cli/src/commands/create.ts` and `update.ts`: write `kitFormat` of the kit they used into `.wa/kit.json`; `update` to a target whose `kitFormat` is not in `SUPPORTED_KIT_FORMATS` stops before writing anything, with the §6 message.
- Fixtures under `packages/gato-cli/src/__tests__/fixtures/` that hold a `.wa/kit.json` or `kit/kit.json`: add the fields where a test needs them; old fixtures without `kitFormat` stay as format-1 cases.
- `.wa/kit.json` of the GatoJS repo: regenerated by `npm run wa -- kit sync` with `kitFormat: 2`.
- Docs: `docs/adrs/59-gato-files-are-protected-and-ejected-with-a-reason.md` (the three ownership groups of spec §4.1, `ejected`, `seed`, `kitFormat` starting at 2 because unversioned projects are 1, warning then blocking); index row; `docs/16-cli-wa.md` ("Co zapisuje": the two new fields); `kit/CLAUDE.md` ("Moduły i manifest": when to bump `kitFormat`).
- `gato-cli` minor bump, `create-gato-app` pin and patch bump. No module version bump (no Gato file changes besides the bundle, which `core` owns: `core` patch bump).

**Behaviours:**
- `readKitState` of a `.wa/kit.json` without `kitFormat` and `ejected` → `kitFormat: 1`, `ejected: {}`.
- `writeKitState` of a state with `ejected: { "src/b.ts": {…}, "src/a.ts": {…} }` → the file lists `"src/a.ts"` before `"src/b.ts"`; `kitFormat` is the third key after `kitVersion` and `kitRepo`.
- Round trip: `ejected` with one entry survives `wa add audit-logs`, `wa remove audit-logs` and `wa update` on a fixture project (the entry is byte-identical afterwards).
- `kitStateSchema` rejects `ejected: { "x": { "reason": "  ", "ejectedAt": "2026-11-23" } }` (blank reason).
- `readKitState` with `kitFormat: 99` → throws `This project uses kit format 99; update gato-cli (npm i -D gato-cli@latest)`.
- `fileHash("README.md", <any>, { managedFiles: [], seedFiles: ["README.md"] })` → `"seed"`; `fileHash("package.json", …, { managedFiles: ["package.json"], seedFiles: ["package.json"] })` → `"managed"`.
- `planUpdate` with a recorded hash `"seed"` for `README.md` and different base and target content → no planned file for `README.md`.
- `wa create` from this kit writes `"kitFormat": 2` into the project's `.wa/kit.json`.

**Mutations to kill:** `ejected` dropped by `writeKitState`; `kitFormat` default changed from 1; supported-format check inverted or skipped; `seed` checked before `managed`; a `seed` file planned as `updated`; blank reason accepted; `ejected` keys left unsorted.

**Refinements found while implementing (2026-11-24):**
- `kitConfigSchema.kitFormat` defaults to `1` instead of being required: `wa update` reads the base snapshot of the project's current kit version, and every kit released before this task has no `kitFormat`. `readKitConfig` of such a kit → `kitFormat: 1`, `seedFiles: []`.
- The §6 message also names the fallback for a project whose bundled CLI is older than the target (open question 4): `This project uses kit format <n>; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>`. `assertSupportedKitFormat(format)` takes no CLI name: both bundles print the same text.
- `create` from a kit whose `kitFormat` is not supported stops before creating the project directory, with the same message.
- `remove` neither deletes a `"seed"` file nor counts it as a changed file.
- `kit sync` writes the kit's `kitFormat` and keeps an existing `ejected` map, as it keeps `projectModules`.

**Done when:** CLI gate green, `.wa/kit.json` diff limited to the new fields, ADR-59 merged with the code.

---

### Task 2: `gato doctor --files` and `gato eject` (warning mode)

**Branch:** `feat/gato-doctor-files-and-eject` (after T1)

**Files:**
- `packages/gato-cli/src/doctor/files.ts` (new): `checkGatoFiles({ state, readProject })` returns `{ modified: string[], deleted: string[], ejected: { path, reason, unchanged: boolean }[], staleEjected: string[] }`. A Gato file is a path with a content hash in `state.modules.<module>.files`; hashes `"managed"` and `"seed"` are skipped; comparison uses `contentHash` from `packages/gato-cli/src/assemble/hash.ts` (regions stripped, as `wa update` does). `staleEjected` = entries in `ejected` that are no longer a Gato file. All lists sorted by code point. Project modules (`projectModules`) are never read.
- `packages/gato-cli/src/commands/doctor.ts` (new): `doctor --files` prints the report and returns exit code `0` while `FILE_PROTECTION_MODE` (new constant in `packages/gato-cli/src/doctor/mode.ts`) is `"warn"`, and `1` for any modified, deleted or stale entry when it is `"block"` (flipped in T20). Every finding names the next step: revert (`git checkout -- <file>` or `gato eject --undo <file>`) or `gato eject <file> --reason "<reason>"`, and points to `EXTENSION_POINTS.md` (a dangling pointer until T18; the text says "when present"). `doctor` without `--files` prints `Only --files is implemented; see the gato-cli spec §8` and exits 1: the full doctor of the gato-cli spec §8 is out of scope.
- `packages/gato-cli/src/commands/eject.ts` (new): `eject <file> --reason "<text>"` adds `{ reason, ejectedAt: <YYYY-MM-DD> }` to `ejected`; `eject --undo <file>` restores the file from the kit snapshot of the project's `kitVersion` (`readKitSnapshot` in `packages/gato-cli/src/update/snapshot.ts`, kit source resolved like `update`: `--kit`, then `GATO_KIT_SOURCE`/`WA_KIT_SOURCE`, then `kitRepo` at `v<kitVersion>`) and removes the entry. Refuses a path that is not a Gato file, a generated file, a `managed` or `seed` file, a path outside the project, a blank reason, and an already ejected file (no silent reason overwrite).
- `packages/gato-cli/src/cli.ts` (`COMMANDS`, `usage`), `packages/gato-cli/src/args.ts`: the two commands and their flags.
- `package.json` (root, `core`): `verify` gains `npm run wa -- doctor --files` as the last step. In the GatoJS repo `modules.*.files` is `{}`, so it reports nothing.
- `.claude/settings.json`: allow `Bash(npm run wa -- doctor --files)`.
- Docs: `docs/16-cli-wa.md` (new sections `wa doctor --files` and `wa eject`, exit codes, messages), `docs/11-praca-z-kitem.md` (ownership groups, warning period, how to clear a modified file), `kit/README.md` (command list).
- `gato-cli` minor bump, `create-gato-app` pin and patch bump, `core` minor bump (`package.json`, settings).

**Behaviours:**
- State with `core.files = { "src/a.ts": hash("x") }`, project file `src/a.ts` = `"x"` → all lists empty.
- Same, project file = `"y"` → `modified: ["src/a.ts"]`; file missing → `deleted: ["src/a.ts"]`.
- `.env.example` with a different `wa:modules` region body only → not modified (regions stripped).
- `README.md` with hash `"seed"` and any content → not reported.
- `ejected = { "src/a.ts": { reason: "custom login", … } }`, file modified → `modified: []`, `ejected: [{ path: "src/a.ts", reason: "custom login", unchanged: false }]`; file equal to the recorded hash → `unchanged: true`.
- `ejected = { "src/gone.ts": … }` with no hash for it → `staleEjected: ["src/gone.ts"]`.
- `doctor --files` with one modified file in mode `"warn"` → exit code 0, stdout names `src/a.ts` and `gato eject`; in mode `"block"` → exit code 1.
- `eject src/a.ts --reason "custom login"` on 2026-11-23 → `.wa/kit.json` `ejected` equals `{ "src/a.ts": { "reason": "custom login", "ejectedAt": "2026-11-23" } }` (clock injected).
- `eject src/modules.generated.ts --reason x` → exit 1, `src/modules.generated.ts is generated; change the manifest or module files and run npm run wa -- generate`.
- `eject src/features/notes/module.ts --reason x` (project module) → exit 1, `… is a project file; it needs no eject`.
- `eject src/a.ts` without `--reason` → exit 1 naming `--reason`.
- `eject --undo src/a.ts` → file content equals the snapshot's, entry removed.

**Mutations to kill:** comparing raw bytes instead of `contentHash` (regions); `seed`/`managed` not skipped; ejected file reported as modified; exit code 1 in warn mode or 0 in block mode; generated file accepted by `eject`; `ejectedAt` written as a full timestamp; unsorted output.

**Done when:** CLI gate and root `verify` green; a project created from the branch reports nothing, and after editing one core file reports exactly that file with exit code 0.

**Contract fixed before the tests (2026-11-24):**
- `packages/gato-cli/src/doctor/files.ts`: `checkGatoFiles({ state, readProject }: { state: KitState; readProject: (path: string) => Promise<Buffer | null> }): Promise<GatoFilesReport>`, `GatoFilesReport = { modified: string[]; deleted: string[]; ejected: { path: string; reason: string; unchanged: boolean }[]; staleEjected: string[] }`. An ejected file is never in `modified` or `deleted`; an ejected file that is missing has `unchanged: false`.
- `packages/gato-cli/src/doctor/mode.ts`: `type FileProtectionMode = "warn" | "block"`, `FILE_PROTECTION_MODE: FileProtectionMode = "warn"`.
- `packages/gato-cli/src/commands/doctor.ts`: `doctorFilesReport(report, { mode, cli }): { exitCode: 0 | 1; lines: string[] }` (pure) and `doctorFiles({ projectDir, mode?, cli, log }): Promise<{ exitCode: 0 | 1 }>` (`mode` defaults to `FILE_PROTECTION_MODE`). `cli` is the command prefix: `"gato"` or `"npm run wa --"` (`commandPrefix(name)` in `cli.ts`: `gato` → `"gato"`, `wa` → `"npm run wa --"`). Exit code `1` only in `"block"` mode with at least one modified, deleted or stale entry. A clean report prints `GatoJS files: no changes`. Each modified file prints its path and both next steps: `<cli> eject --undo <path>` (or `git checkout -- <path>`) and `<cli> eject <path> --reason "<why>"`; deleted files likewise; ejected files print path and reason; stale entries say `remove it from ejected in .wa/kit.json`. Ejected files print `(changed)` or `(unchanged)` after the path. Any modified, deleted or stale entry adds a line containing `EXTENSION_POINTS.md (when present)`, and in warn mode a line containing `warning`; a report with only ejected files has neither. A read error other than `ENOENT` fails the command.
- `packages/gato-cli/src/args.ts`: `parseDoctorArgs(argv): { files: true }`; without `--files` it throws `Only --files is implemented; see the gato-cli spec §8`. `parseEjectArgs(argv): { file: string; reason: string | null; undo: boolean; kit: string | null }`: no file → `Specify the file to eject`; without `--undo`, a missing or blank `--reason` → `Specify why the file is ejected: --reason "<why>"`; `--undo` with `--reason` → `--undo takes no --reason`; `--kit` without `--undo` → `--kit is only used with --undo`.
- `packages/gato-cli/src/commands/eject.ts`: `eject({ projectDir, file, reason, now, log }): Promise<void>` writes `ejected[<path>] = { reason: <trimmed>, ejectedAt: now().toISOString().slice(0, 10) }` (UTC date). `<path>` is the file relative to the project with `/` separators (`./src/a.ts` → `src/a.ts`). Refusals (thrown `Error`, nothing written), checked in this order: outside the project → `Path outside the project: <file>`; generated (`src/modules.generated.ts`, `src/modules.client.generated.ts`, `src/i18n/locales.generated.ts`) → `<path> is generated; change the manifest or module files and run npm run wa -- generate`; hash `"managed"` → `<path> is managed by GatoJS (wa update merges it); it needs no eject`; hash `"seed"` → `<path> is a seed file owned by the project; it needs no eject`; no hash → `<path> is a project file; it needs no eject`; already ejected → `<path> is already ejected ("<reason>"); edit its reason in .wa/kit.json`; blank reason → `Specify why the file is ejected: --reason "<why>"`. Logs `Ejected <path>; wa update will merge it instead of replacing it`.
- `undoEject({ projectDir, file, kitDir, log }): Promise<void>`: same path, generated, managed, seed and project-file refusals; restores the file (content and mode) from `readKitSnapshot(kitDir, Object.keys(state.modules), names)`, removes the `ejected` entry when present (a modified, non-ejected Gato file can be restored too), runs `generate` when the file is a `wa:*` region file, logs `Restored <path> from GatoJS <kitVersion>`. A Gato file missing from the snapshot → `<path> is not in GatoJS <kitVersion>`. `undoEjectFromSource({ projectDir, file, kitFlag, envSource, runner, tmpDir, log })` resolves `kitDir` with `resolveKitSource` (as `list` does) and calls `undoEject`.

---

### Task 3: `protect-gato-files` Claude Code hook (warning mode)

**Branch:** `feat/protect-gato-files-hook` (after T1; parallel with T2)

**Files:**
- `.claude/hooks/protect-gato-files.mjs` (new, owned by `core` through `.claude/hooks/**`), modelled on `.claude/hooks/protect-tests.mjs`: exported pure functions `relativeToProject(projectDir, filePath)`, `classifyPath(state, relativePath, headLine)` → `"gato" | "ejected" | "generated" | "project"`, and `decide(classification, mode)`. Gato file = a path with a recorded hash other than `"managed"`/`"seed"` in `.wa/kit.json` `modules.*.files`; generated = the file exists and its first line starts with the `GENERATED_HEADER` text of `packages/gato-cli/src/generate/registry.ts` (`// generated by GatoJS — do not edit`; T18 adds the Markdown form `<!-- generated by GatoJS`), so the hook needs no copy of `kit/kit.json`, which projects do not have. No `.wa/kit.json` → allow (GatoJS repo without hashes, or not a GatoJS project).
- Mode constant `PROTECTION_MODE = "warn"` (flipped in T20). Warn: allow the edit and tell the agent through the PreToolUse JSON output (`hookSpecificOutput.permissionDecision: "ask"` with `permissionDecisionReason`, so a human confirms; verify the exact output contract against the current Claude Code hooks documentation before writing it, and fall back to exit code 0 with the message on stderr if `ask` is not available). Block: exit code 2 with the message on stderr, as `protect-tests.mjs` does. Generated files are blocked in both modes (they are overwritten anyway).
- Message: `<path> is a Gato file (owned by <module>). Use an extension point from EXTENSION_POINTS.md, or run: npm run wa -- eject <path> --reason "<why>"`; for generated files: `… is generated; change the manifest or module files and run npm run wa -- generate`.
- `.claude/hooks/protect-gato-files.test.mjs` (new); `package.json` `test:hooks` gets it in its explicit file list; `.claude/settings.json` registers the hook after `protect-tests.mjs` under `PreToolUse` `Edit|Write`.
- `.github/workflows/kit.yml` `assemble`, step "Test gates are in the project": also `test -f .claude/hooks/protect-gato-files.mjs`.
- Docs: `AGENTS.md` (one line under "Modules and generated files": Gato files are protected; use `EXTENSION_POINTS.md` or `gato eject`), `docs/08b-testy-adwersarialne.md` is not touched; `docs/11-praca-z-kitem.md` (the hook next to `doctor`).
- `core` minor bump.

**Behaviours:**
- State `core.files = { "src/shared/lib/audit.ts": "<hash>" }`: `classifyPath(state, "src/shared/lib/audit.ts", "import …")` → `"gato"`; with `ejected["src/shared/lib/audit.ts"]` → `"ejected"`.
- `"src/features/invoices/module.ts"` (no hash) → `"project"`; a new file `src/components/ui/my-badge.tsx` inside the `core` glob but without a hash → `"project"` (spec §4.1).
- `"package.json"` with hash `"managed"` → `"project"`; `"README.md"` with hash `"seed"` → `"project"`.
- `"src/modules.generated.ts"` with head line `// generated by GatoJS — do not edit. Run: npm run wa -- generate` → `"generated"`.
- `relativeToProject("/p", "/p/src/a.ts")` → `"src/a.ts"`; `"/elsewhere/a.ts"` → `null` (allow).
- `decide("gato", "warn")` → `{ action: "ask", message: <the Gato message> }`; `decide("gato", "block")` → `{ action: "block", … }`; `decide("generated", "warn")` → `"block"`; `decide("project", any)` and `decide("ejected", any)` → `"allow"`.
- Running the hook as a process with no `.wa/kit.json` in the project → exit 0, no output.

**Mutations to kill:** `managed`/`seed` treated as Gato files; ejected file asked about; generated file allowed in warn mode; a file outside the project classified; blocking in warn mode.

**Refinements found while implementing (2026-11-24):**
- Output contract, checked against https://code.claude.com/docs/en/hooks on 2026-11-24: on exit 0 Claude Code reads one JSON object from stdout. Warn prints `{ "systemMessage": <message>, "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": <message>, "additionalContext": <message> } }` and exits 0. `permissionDecisionReason` of `ask` goes to the human in the permission prompt, `systemMessage` is a warning shown to the human, and `additionalContext` reaches the agent next to the tool result, so the warning stays visible when bypass permissions skips the prompt (open question 3). Block: exit 2, message on stderr, nothing on stdout. Allow: exit 0, no output.
- The message needs the path and the owning module, so `decide(classification, mode, { path, module })` takes them as a third argument, and `ownerOf(state, relativePath)` returns the module whose `files` records the path (or `null`). `decide` of `"project"`/`"ejected"` → `{ action: "allow" }`.
- Generated head lines: `// generated by GatoJS` and the Markdown form `<!-- generated by GatoJS` (T18) are both recognised now; a head line that only contains the text later in the line is not.
- The project is the git working copy of the edited file (nearest ancestor with `.git`, after resolving symlinks, as `protect-tests.mjs` does), falling back to `$CLAUDE_PROJECT_DIR`, then `cwd`. A copy without `.wa/kit.json`, or one whose `.wa/kit.json` is not valid JSON, allows the edit. GatoJS test fixtures with their own `.wa/kit.json` sit inside the GatoJS working copy, so their files are never classified against the fixture state.

**Done when:** `npm run test:hooks` green with the new file; in a created project, an agent edit of `src/shared/lib/audit.ts` produces the ask/warning and an edit of `src/features/<project-module>/module.ts` does not.

---

### Task 4: Companion and seed files

**Branch:** `feat/companion-and-seed-files` (after T1; parallel with T2, T3)

**Files:**
- `AGENTS.project.md`: not shipped. `AGENTS.md` and `CLAUDE.md` (both `core`) say, in one line each: read `AGENTS.project.md` first when it exists; it wins over generic advice, never over the hard rules. `agent-instructions-fit-the-budget` must pass.
- `mutation-gate.project.json` (optional, project-owned): `scripts/mutation-gate.ts` reads it when present and merges it into `mutation-gate.json` through a new exported `mergeGateConfigs(gato, project)` in `scripts/lib/mutation-gate.ts` (critical lists concatenated without duplicates, `allowed` concatenated; a project entry cannot remove a Gato entry). Shape validated with Zod; an invalid file stops the gate with its path. `scripts/lib/mutation-gate.ts` is already `critical`.
- `src/theme.css` (new, seed file, owned by `core` through a new `files` entry): an empty token layer with a CSS comment showing how to override `--primary` and `--font-sans`. `src/app/globals.css` imports it after the Gato tokens (`@import "../theme.css";` at the right place for Tailwind 4 layering; verify the override wins with a computed-style check in the e2e smoke or a build-output check).
- Seed files: `kit/kit.json` `seedFiles: ["README.md", "src/theme.css"]`. `README.md` keeps being a `placeholderFiles` entry (placeholders are filled before the hash is recorded, and the hash is `"seed"` anyway).
- `kitFormat` stays as T1 left it: T1 added `"seed"` to the hash vocabulary and every CLI from T1 on reads it, so filling the list changes no contract.
- Docs: `docs/11-praca-z-kitem.md` (companion and seed files, what `wa update` does with them), `docs/08-testy.md` (project mutation gate entries), `kit/CLAUDE.md` (a new seed file is a `seedFiles` entry, never a protection exception).
- `core` minor bump.

**Behaviours:**
- `mergeGateConfigs({ critical: ["a/"], allowed: [x] }, { critical: ["b/", "a/"], allowed: [y] })` → `{ critical: ["a/", "b/"], allowed: [x, y] }`.
- `mergeGateConfigs(gato, undefined)` → `gato` unchanged.
- A project file with `"critical": "src/"` (string, not array) → the gate exits 1 naming `mutation-gate.project.json`.
- A project created from the branch: `.wa/kit.json` records `"README.md": "seed"` and `"src/theme.css": "seed"`; `wa update` to a later kit with a different `README.md` leaves the project's `README.md` untouched.
- `npm run build` with `src/theme.css` setting `--primary` → the built CSS contains the project value after the Gato value.

**Mutations to kill:** project `allowed` replacing Gato `allowed`; duplicate critical paths; missing project file treated as an error; seed file overwritten by `update`.

**Done when:** `verify` and `test:mutation:gate` green in the GatoJS repo; the created-project checks above pass.

---

### Task 5: `src/gato.config.ts` and `applyGatoConfig` (ADR-60)

**Branch:** `feat/gato-config` (after T1)

**Files:**
- `src/shared/lib/modules/gato-config.ts` (new, `core`): `defineGatoConfig`, the `GatoConfig` type, `emptyGatoConfig`, and `applyGatoConfig(modules, config)` for this task's fields: `modules.<key>.enabled` (`false` removes the module), `modules.<key>.nav.<navId>` (`order`, `hidden`), `modules.<key>.access` (`roles`, `adminOnly`, `multiOrgRoles` override of the `defineModule` fields). It throws `GatoConfigError` (string `name`) listing every unknown module key and nav id at once, and refuses `enabled: false` for `auth` and `organizations` (decision 12A). Pure, client-safe (no server imports).
- `src/shared/lib/modules/define-module.ts`: `ModuleNavItem` gains `id?: string`; every Gato module's nav item gets one (`dashboard.home`, `users.list`, `account.home`, `api-keys.list`, `audit-logs.list`), required for Gato modules by an architecture test, optional for project modules until the next `kitFormat` (spec §5.1).
- `packages/gato-cli/src/generate/registry.ts` and `index.ts`: `generate` checks whether `src/gato.config.ts` exists; the server and client registries then emit `import gatoConfig from "@/gato.config";` or `import { emptyGatoConfig as gatoConfig } from "@/shared/lib/modules/gato-config";`, and wrap the module lists: `export const modules = applyGatoConfig([...], gatoConfig)`, `export const clientModules = applyGatoConfig([...], gatoConfig)`. Lists keyed by module (`moduleEnvSchemas`, `authPlugins`, `auditSinks`, `moduleMessages`, `authClientPlugins`) are filtered by the enabled set through `enabledEntries(list, config)` (the generator emits `{ module: "<key>", value: … }` pairs so the filter knows the owner). `kitFormat` 3, `SUPPORTED_KIT_FORMATS` += 3.
- `src/__tests__/architecture/client-bundles-stay-server-free.test.ts` and `scripts/lib/architecture/client-imports.ts`: `src/gato.config.ts` checked as a client entry when present.
- `src/__tests__/architecture/gato-config-keys-exist.test.ts` (new) with detection in `scripts/lib/architecture/gato-config-keys.ts`: loads `src/gato.config.ts` (skips when absent) and reports every bad key with its path in the config (`modules.api-keys.nav.api-keys.lst: unknown nav id`). T8, T15, T17 extend it for their keys.
- `src/__tests__/architecture/gato-nav-items-have-ids.test.ts` (new): every nav item of a module in `kit/modules/*.json` (when `kit/` exists) has an `id` prefixed `<module>.`.
- Docs: `docs/adrs/60-project-configuration-is-applied-by-the-generated-registries.md` (decision 4A: why not a CLI loader, why not JSON, evaluated once at import); `docs/02b-rejestr-i-generator.md` (new registry shape); `docs/11-praca-z-kitem.md` (the config file, `enabled: false` vs `wa remove`).
- `gato-cli` minor, `create-gato-app` pin, `core` minor; `api-keys` and `audit-logs` patch (nav ids).

**Behaviours:**
- `applyGatoConfig([dashboard, apiKeys], { modules: { "api-keys": { enabled: false } } })` → `[dashboard]`.
- `applyGatoConfig(mods, { modules: { auth: { enabled: false } } })` → throws `GatoConfigError` with `auth cannot be disabled`.
- `{ modules: { billing: {} } }` with no `billing` module → throws, message contains `unknown module: billing`; two bad keys → one error naming both.
- `{ modules: { dashboard: { nav: { "dashboard.home": { order: 5 } } } } }` → the dashboard nav item has `order: 5`, other fields unchanged; `"dashboard.nope"` → throws `unknown nav id: dashboard.nope`.
- `{ modules: { users: { access: { roles: ["owner"] } } } }` → `getNavEntries` (`src/shared/lib/modules/nav.ts`) hides `/users` for an `admin` org role, and `requireModuleAccess("users")` answers `notFound()` for that role.
- `applyGatoConfig(mods, emptyGatoConfig)` → equal to `mods` (deep equal, same order).
- Generated server registry with `src/gato.config.ts` present → first import after the header block is `import gatoConfig from "@/gato.config";`; without it → the `emptyGatoConfig` import; `generate` run twice → no diff.
- `requireModuleAccess("api-keys")` with `api-keys` disabled → `notFound()` (it reads `moduleByKey` from `clientModules`).

**Mutations to kill:** disabled module kept in one of the lists (`authPlugins`, `moduleMessages`); `auth` disable allowed; unknown key ignored; nav override replacing the whole item; config applied to `clientModules` but not `modules` (or the reverse).

**Done when:** `verify` and CLI gate green; a created project without `src/gato.config.ts` builds unchanged, and with one disabling `api-keys` hides its nav item and 404s `/api-keys`.

---

### Task 6: `requireModuleEnabled` for entry points outside `requireModuleAccess`

**Branch:** `feat/require-module-enabled` (after T5)

**Files:**
- `src/shared/lib/modules/require-module-enabled.ts` (new, `core`): `isModuleEnabled(key)` and `requireModuleEnabled(key)`, which throws `ModuleDisabledError` (string `name`). `handleCommandError` (`src/shared/utils/error-handling.ts`) maps it to the generic failure message; route handlers map it to `404` with no body detail.
- Callers: `src/app/api/v1/organization/route.ts` (`api-keys`, before `authenticateApiKey`), `src/app/api/uploads/route.ts` and `src/app/api/uploads/[id]/route.ts` (`uploads`), `deleteUploadCommand` in `src/features/uploads/services/commands/upload-commands.ts` and `createUpload` in `src/features/uploads/services/commands/create-upload.ts` (`uploads`), `inviteUserCommand` in `src/features/users/services/commands/invite-user-command.ts` (`users`). T12–T14 later move the commands into `runCommand`, which calls it itself.
- `src/__tests__/architecture/module-entry-points-check-enabled.test.ts` (new; detection in `scripts/lib/architecture/module-entry-points.ts`): every exported function of a route handler under a module's `files` and every export of a `"use server"` file under `src/features/<x>/` reaches `requireModuleAccess`, `requireModuleEnabled` or `runCommand` (syntactic, like `src/__tests__/server-entrypoints-guard.test.ts`). Exceptions for `auth` and `organizations` (cannot be disabled) and an explicit allow map with reasons (for example `src/app/api/healthcheck/route.ts`, `src/app/api/auth/[...all]/route.ts`).
- Docs: `docs/03-dane-i-organizacje.md` or `docs/06-wzorce-kodu.md` (where entry-point guards are described today; Polish), `AGENTS.md` only if the budget allows one line.
- `core` minor, `uploads` minor, `api-keys` minor.

**Behaviours:**
- `api-keys` disabled: `GET /api/v1/organization` with a valid key → `404`; enabled → `200` as today (existing route tests keep passing).
- `uploads` disabled: `deleteUploadCommand({ id })` → `{ success: false, error: "Nie udało się usunąć pliku" }` and no Prisma call.
- `isModuleEnabled("auth")` → `true` whatever the config.
- Architecture test fixture: a route handler in a module that calls neither guard → reported as `<path>#GET`.

**Mutations to kill:** guard after the first Prisma access; `404` replaced by `500`; enabled check reading the unfiltered list.

**Done when:** `verify`, `test:integration` green; the architecture test lists no violation in the GatoJS repo.

---

### Task 7: Branding in `gato.config.ts`

**Branch:** `feat/gato-config-branding` (after T5; parallel with T6, T8)

**Files:**
- `src/shared/lib/modules/gato-config.ts`: `branding?: { logo?: { src: string; alt: string; width: number; height: number } }`, validated (`src` starts with `/`, positive dimensions). Fonts and colours go through `src/theme.css` (T4), not the config: `next/font` must be called at build time in a module scope, which plain config data cannot do.
- `src/shared/lib/modules/branding.ts` (new): `getBranding()` from the client registry's config (exported by the generated client registry as `gatoBranding`; a generator change, so `kitFormat` +1: semantic-release cuts a release on every merge, so no two tasks share a format number).
- `src/shared/components/app-sidebar.tsx` (both places that render `project.name`) and `src/app/[locale]/(auth)/layout.tsx`: render the logo when set, `project.name` as today otherwise.
- Docs: `docs/11-praca-z-kitem.md` (branding: logo in config, tokens and fonts in `src/theme.css`).
- `core` minor; `gato-cli` patch if the generator changes.

**Behaviours:**
- No `branding` → sidebar heading text equals `project.name` (existing sidebar tests unchanged).
- `branding.logo = { src: "/logo.svg", alt: "Acme", width: 120, height: 32 }` → the sidebar renders an `img` with `alt="Acme"` and no `project.name` heading text.
- `src: "logo.svg"` → `GatoConfigError` naming `branding.logo.src`.

**Mutations to kill:** logo rendered without `alt`; relative `src` accepted.

**Done when:** `verify` green; component tests cover both sidebar placements.

**Contract fixed before the tests (2026-11-25):**
- Branch `feat/gato-branding`. The auth layout renders no `project.name` today, so without a logo it stays unchanged and with one it shows the logo above the form.
- `src/shared/lib/modules/gato-config.ts`: `interface GatoLogo { src: string; alt: string; width: number; height: number }`, `interface GatoBranding { logo?: GatoLogo }`, `GatoConfig.branding?: GatoBranding`. `brandingProblems(config: GatoConfig): string[]` returns, in this order: `branding.logo.src: must start with a single "/" (a file in public/): <src>` when `src` does not start with `/` or starts with `//`; `branding.logo.alt: must not be blank` when `alt.trim()` is empty; `branding.logo.width: must be a positive integer: <width>` and the same for `height` when the value is not an integer above 0. `gatoConfigProblems(modules, config)` returns the module problems followed by `brandingProblems(config)`, so `applyGatoConfig` and `gato-config-keys-exist.test.ts` report them too. `gatoBrandingOf(config: GatoConfig): GatoBranding` throws `GatoConfigError(brandingProblems(config))` when there is any problem and otherwise returns `config.branding ?? {}`.
- Generated client registry (`packages/gato-cli/src/generate/registry.ts`): always imports the config (project or `emptyGatoConfig`), adds `gatoBrandingOf` as the last name of the helpers import from `@/shared/lib/modules/gato-config`, and ends with `export const gatoBranding = gatoBrandingOf(gatoConfig);` after `clientModules`, also when there are no modules. The server registry is unchanged. `kitFormat` 5, `SUPPORTED_KIT_FORMATS` += 5.
- `src/shared/lib/modules/branding.ts`: `getBranding(): GatoBranding` returns `gatoBranding` from `@/modules.client.generated`.
- `src/shared/components/brand-logo.tsx`: `BrandLogo({ logo }: { logo: GatoLogo })` renders `next/image` with `src`, `alt`, `width`, `height` and `unoptimized`.
- `src/shared/components/app-sidebar.tsx`: the `MobileHeader` heading and the expanded `AppSidebar` heading render `BrandLogo` when `getBranding().logo` is set, `project.name` otherwise. `src/app/[locale]/(auth)/layout.tsx` renders `BrandLogo` above `children` when the logo is set.
- Behaviours added: `gatoBrandingOf({})` → `{}`; `src: "//cdn.example.com/logo.svg"` → error naming `branding.logo.src`; `width: 0`, `height: -1`, `width: 1.5` → errors naming each field; `alt: "  "` → `branding.logo.alt: must not be blank`; several bad fields → one error listing all; generated client registry ends with the `gatoBranding` line, with and without `src/gato.config.ts`; `MobileHeader` with a logo → `img` with `alt="Acme"` and no `WA App` text; auth layout with a logo → `img` with `alt="Acme"` and the children; without → no `img`.

---

### Task 8: Permissions and `can`

**Branch:** `feat/module-permissions` (after T5; parallel with T6, T7)

**Files:**
- `src/shared/lib/modules/define-module.ts`: `ModuleDef.permissions?: Record<string, { defaultRoles: OrgRole[]; labelKey: string }>` (pure data, client-safe); keys must start with `<module>.`.
- `src/shared/lib/auth/permissions.ts` (`critical` already): `can(context: AccessContext, key: string)`; global admins pass, like `canAccessModule`; an unknown key throws (a typo must not read as "denied").
- `src/shared/lib/modules/gato-config.ts`: `modules.<key>.permissions.<permissionKey>: OrgRole[]` overrides `defaultRoles`; unknown keys throw. `gato-config-keys-exist` covers permission keys.
- First core permission, replacing a role comparison: `uploads.delete-others` (`defaultRoles: ["owner", "admin"]`) in `src/features/uploads/module.ts`; `deleteUploadCommand` checks `upload.uploadedById === context.userId || can(context, "uploads.delete-others")` instead of comparing `ORG_ROLES.OWNER`/`ADMIN`.
- `src/__tests__/architecture/permission-keys-are-namespaced.test.ts` (new).
- Docs: `docs/04-auth-i-role.md` (Polish: `can` next to `canAccessModule`, config override), `docs/15b-modul-uploads-uzycie.md` (the new permission).
- `core` minor, `uploads` minor.

**Behaviours:**
- `can({ userRole: "user", orgRole: "member", multiOrg: false }, "uploads.delete-others")` → `false`; `orgRole: "admin"` → `true`; `userRole: "superadmin"`, `orgRole: null` → `true`.
- Config `{ modules: { uploads: { permissions: { "uploads.delete-others": ["owner"] } } } }` → `admin` → `false`, `owner` → `true`.
- `can(ctx, "uploads.nope")` → throws `unknown permission: uploads.nope`.
- `deleteUploadCommand` by a `member` on another member's upload → `{ success: false, error: "Brak uprawnień do usunięcia pliku" }` (unchanged); by an `admin` → success (unchanged); with the config above, by an `admin` → refused.
- Isolation integration test (existing uploads suite extended): an `owner` of org B cannot delete org A's upload.

**Mutations to kill:** global admin check removed; override merged instead of replacing; unknown key returning `false`; `||` turned into `&&` in the delete rule.

**Done when:** `verify`, `test:integration`, `test:mutation:gate` green (auth and uploads services are critical).

**Contract fixed before the tests (2026-11-26):**
- Branch `feat/permissions`.
- `src/shared/lib/modules/define-module.ts`: `interface ModulePermission { defaultRoles: OrgRole[]; labelKey: string }`, `ModuleDef.permissions?: Record<string, ModulePermission>`.
- `src/shared/lib/auth/permissions.ts`: `type PermissionContext = Pick<AccessContext, "userRole" | "orgRole">` (an `OrgContext` and an `AccessContext` both fit, so a command needs no `env.MULTI_ORG`); `class UnknownPermissionError extends Error` with `name = "UnknownPermissionError"` and message `unknown permission: <key>`; `can(context: PermissionContext, key: string): boolean` reads the permission from `clientModules` (config already applied). The key lookup comes first: an unknown key throws for every role, global admins included. A key is known only when it is an own key of some module's `permissions` (`"constructor"`, `"toString"`, `"__proto__"` are unknown). Then global admins (`admin`, `superadmin`) → `true`; `orgRole: null` → `false`; otherwise `defaultRoles.includes(orgRole)`.
- `src/shared/lib/modules/gato-config.ts`: `GatoModuleConfig.permissions?: Record<string, OrgRole[]>`. `gatoConfigProblems` adds `modules.<module>.permissions.<permissionKey>: unknown permission: <permissionKey>` for a key the module does not declare (after the nav problems, before the access problem, in config key order). `applyGatoConfig` replaces `defaultRoles` of each overridden permission with the configured array (not a union) and keeps `labelKey` and the other permissions; a module without `permissions` in the config keeps its `permissions` object as is.
- `scripts/lib/architecture/permission-keys.ts`: `permissionKeyProblems(modules: readonly ModuleDef[]): string[]` returns `<module>: permission key "<key>" must start with "<module>."` for every key that does not start with `<module>.` or has nothing after the dot, in module order then key order. `scripts/lib/architecture/gato-config-keys.ts` exports `loadFeatureModules(root): Promise<ModuleDef[]>` (the module loading it already does). `src/__tests__/architecture/permission-keys-are-namespaced.test.ts` runs both on fixtures and on the repo (expects `[]`).
- `src/features/uploads/module.ts`: `permissions: { "uploads.delete-others": { defaultRoles: ["owner", "admin"], labelKey: "permission-delete-others" } }`; the label in `src/features/uploads/i18n/{pl,en}.json`.
- `deleteUploadCommand`: `requireModuleEnabled("uploads")` stays first; the rule becomes `upload.uploadedById === context.userId || can(context, "uploads.delete-others")`. Messages unchanged.
- Core tests of `can` mock `@/modules.client.generated` with a literal `uploads` fixture (core must pass without the uploads module); uploads tests use the real registry, and the config case mocks it with `applyGatoConfig([uploadsModule], config)`.
- Behaviours added: `userRole: "admin"`, `orgRole: null` → `true`; `orgRole: "owner"` → `true`; `orgRole: null`, `userRole: "user"` → `false`; `can(superadmin, "uploads.nope")` → throws; `can(ctx, "constructor")` → throws `unknown permission: constructor`; config override `["member"]` → `member` → `true`, `admin` → `false`; config with an unknown permission key → `GatoConfigError` naming `modules.uploads.permissions.uploads.nope: unknown permission: uploads.nope`; config override leaves `labelKey` unchanged; `deleteUploadCommand` by a `member` on their own upload → success; by a global `admin` with `orgRole: "member"` on another member's upload → success; by an `owner` → success; refused delete → no `deleteObject`, no row removed, no audit.

---

### Task 9: Domain events and subscribers (ADR-61)

**Branch:** `feat/domain-events` (after T5)

**Files:**
- `src/shared/lib/events/` (new, `core`, added to `mutation-gate.json` `critical`): `defineEvents(map)` (Zod payload schemas; keys must start with `<module>.`), `defineSubscribers(map)`, `emitEvent(origin, name, payload)`. `origin` is `{ organizationId: string; actorUserId: string | null }`: from `OrgContext` through `eventOrigin(context)`, or built by core code from a row it just wrote (better-auth hooks, `scripts/lib/admin-create.ts`), because those paths have no `OrgContext`. The payload type omits `organizationId`, so a caller cannot set it; `emitEvent` adds it from `origin` and validates the full payload with the event's schema (an invalid payload throws in the emitter: a bug in core code, not a subscriber failure). Subscribers run after the operation succeeded, awaited, one at a time, in registry order then by subscriber id; an error is logged (`logger.error`, event name and subscriber id) and never rethrown, as `trackAudit` does in `src/shared/lib/audit.ts`.
- Core events (`src/shared/lib/events/core-events.ts`, `defineEvents`): `organizations.created`, `organizations.member-added`, `organizations.member-removed`, `organizations.member-role-changed`, `users.invited`, `users.invitation-accepted`, `users.invitation-canceled`, `auth.signed-up`, with payloads from spec §5.5.
- Emitters in this task (direct calls): `users.invited` in `inviteUserCommand` after `trackAudit`; `auth.signed-up` in the `databaseHooks.user.create.after` hook of `src/shared/lib/auth/index.ts` (when `applySignupMembership` produced an organization; a user without one emits nothing); `organizations.created` in `createOrganizationWithOwnerCommand` (`src/features/organizations/services/commands/organization-commands.ts`) and in `ensureOrganizationOwner` of `scripts/lib/admin-create.ts` when `created: true` (after the transaction commits, never inside it). The member events and the `/organization/create` path come in T10.
- Generator: `detectFeature` gains `hasEvents` (`events.ts`, export `events`) and `hasSubscribers` (`subscribers.ts`, export `subscribers`); the server registry emits `moduleEvents` and `moduleSubscribers` (filtered by `enabledEntries`). Not in the client registry. `kitFormat` +1.
- `src/__tests__/architecture/client-bundles-stay-server-free.test.ts`: `events.ts`/`subscribers.ts` must not be imported by client files.
- Docs: `docs/adrs/61-domain-events-run-subscribers-after-success.md` (decision 7A, why no `in-transaction`, origin without `OrgContext`, `auditSinks` unchanged); `docs/02b-rejestr-i-generator.md`; `docs/05-moduly-rdzenia.md` (core events table).
- `gato-cli` minor, pin, `core` minor.

**Behaviours:**
- `emitEvent({ organizationId: "org-a", actorUserId: "u1" }, "users.invited", { invitationId: "i1", email: "a@b.c", role: "member" })` → each subscriber of `users.invited` receives `{ name: "users.invited", organizationId: "org-a", actorUserId: "u1", payload: { invitationId: "i1", email: "a@b.c", role: "member" } }`.
- Two subscribers, the first throws → the second still runs, `emitEvent` resolves, `logger.error` called once with `users.invited` and the subscriber id.
- An unknown event name → throws `unknown event: users.nope` (typed, but a runtime check too).
- A payload failing its schema → throws before any subscriber runs.
- `defineEvents({ "issued": z.object({}) })` in module `invoices` → throws `event keys must start with "invoices."` (the module key comes from the registry entry).
- A disabled module's subscribers do not run.
- `inviteUserCommand` success → one `users.invited` event; a failure before `trackAudit` (existing email) → no event.
- `createOrganizationWithOwnerCommand({ name: "Acme", ownerId })` → one `organizations.created` with the new id.
- Integration: a subscriber that writes with the tenant-scope guard and filters by `event.organizationId` touches only that organization's rows (two organizations).

**Mutations to kill:** subscriber error rethrown; subscribers run in parallel (order assertion); `organizationId` taken from the payload; event emitted before the write; schema validation skipped.

**Done when:** `verify`, `test:integration`, `test:mutation:gate` green; `npm run admin:create` still works (e2e global setup runs it).

**Contract fixed before the tests (2026-11-26):**
- Files (all `core`): `src/shared/lib/events/define-events.ts` (no runtime import of the registry, so a module's `events.ts`/`subscribers.ts` never forms an import cycle), `src/shared/lib/events/core-events.ts`, `src/shared/lib/events/event-bus.ts`, `src/shared/lib/events/emit-event.ts`, `src/shared/lib/events/index.ts` (re-exports the public names below). `mutation-gate.json` `critical` gains `"src/shared/lib/events/"`.
- `define-events.ts`: `type EventMap = Record<string, z.ZodObject>`; `defineEvents<const M extends EventMap>(map: M): M` (identity); `interface EventOrigin { organizationId: string; actorUserId: string | null }`; `eventOrigin(context: Pick<OrgContext, "organizationId" | "userId">): EventOrigin` → `{ organizationId: context.organizationId, actorUserId: context.userId }`; `interface DomainEvent<N extends string = string, P = unknown> { readonly name: N; readonly organizationId: string; readonly actorUserId: string | null; readonly payload: Readonly<P> }`; `interface EventSubscriber<E> { id: string; run: (event: E) => Promise<void> | void }`; the typed `SubscriberMap` (`{ [N in EventName]?: EventSubscriber<EventOf<N>> | readonly EventSubscriber<EventOf<N>>[] }`) and `defineSubscribers<const M extends SubscriberMap>(map: M): M` (identity). `EventName` and `EventPayload<N>` (`z.input` of the schema) cover `coreEvents` and every map in the generated `moduleEvents`, through `import type` of the registry only. The payload type has no `organizationId`, so passing one is a type error.
- `class EventError extends Error` with `name = "EventError"`: every error the events code throws.
- `core-events.ts`: `coreEvents = defineEvents({...})`, `orgRole = z.enum(["owner", "admin", "member"])`:
  - `organizations.created`: `{ name: string, slug: string, ownerUserId: string }`
  - `organizations.member-added`: `{ memberId: string, userId: string, role: orgRole }`
  - `organizations.member-removed`: `{ memberId: string, userId: string }`
  - `organizations.member-role-changed`: `{ memberId: string, userId: string, previousRole: orgRole, role: orgRole }`
  - `users.invited`: `{ invitationId: string, email: string, role: orgRole }`
  - `users.invitation-accepted`: `{ invitationId: string, userId: string }`
  - `users.invitation-canceled`: `{ invitationId: string }`
  - `auth.signed-up`: `{ userId: string, email: string }`
- `event-bus.ts`: `createEventBus({ core, events, subscribers }: { core: EventMap; events: readonly ModuleEntry<EventMap>[]; subscribers: readonly ModuleEntry<LooseSubscriberMap>[] }): { emit(origin: EventOrigin, name: string, payload: unknown): Promise<void> }`. Construction validates and throws one `EventError` listing every problem (one per line, in this order of checks): an event key of module `m` without the `m.` prefix → `event keys must start with "m.": <key>`; an event name declared twice (core or modules) → `duplicate event: <name>`; a schema with an `organizationId` key → `event <name> must not declare organizationId; emitEvent sets it`; a subscriber id of module `m` without the `m.` prefix → `subscriber ids must start with "m.": <id>`; a subscriber id used twice → `duplicate subscriber: <id>`; a subscriber on an event that is not declared → `unknown event: <name> (subscriber <id>)`.
- `emit`: unknown name → rejects with `EventError("unknown event: <name>")`; payload failing `schema.safeParse` → rejects with `EventError` whose message is `invalid payload for <name>` and whose `cause` is the `ZodError` of the parse (refined after the mutation review: the issue text is not part of the message), before any subscriber runs. Otherwise builds `{ name, organizationId: origin.organizationId, actorUserId: origin.actorUserId, payload: <parsed data> }` (parsing strips unknown keys, so an `organizationId` smuggled into the payload never reaches a subscriber), freezes the event and its payload (`Object.freeze`), and runs the subscribers of `name` one at a time, awaited: entries in `subscribers` order, and within one entry sorted by `id` (code point). A subscriber that throws or rejects is logged with `logger.error("Event subscriber failed", { event: <name>, subscriber: <id>, error })` and the next one runs; `emit` then resolves.
- `emit-event.ts`: `emitEvent<N extends EventName>(origin: EventOrigin, name: N, payload: EventPayload<N>): Promise<void>` on a bus built lazily, once, from `coreEvents`, `moduleEvents` and `moduleSubscribers` of `@/modules.generated` (lazy: a subscriber that emits imports this file, and an eager bus would read the registry before it is evaluated).
- `src/shared/lib/modules/gato-config.ts`: `enabledModuleEntries<E extends ModuleEntry<unknown>>(entries: readonly E[], config: GatoConfig): E[]` keeps the entries (with `module`) of enabled modules.
- Generator: `RegistryModule` gains `hasEvents` (`src/features/<x>/events.ts`) and `hasSubscribers` (`subscribers.ts`). Server registry only: imports `import { events as <x>Events } from "@/features/<x>/events";` and `import { subscribers as <x>Subscribers } from "@/features/<x>/subscribers";` after the `auditSink` imports; after the `auditSinks` line `export const moduleEvents = [{ module: "<x>", value: <x>Events }];` and `export const moduleSubscribers = enabledModuleEntries([{ module: "<x>", value: <x>Subscribers }], gatoConfig);`, each `export const <name>: never[] = [];` when empty (always emitted). `enabledModuleEntries` joins the helpers import between `enabledEntries` and `gatoBrandingOf`. `moduleEvents` is not filtered: a disabled module emits nothing, and keeping its schemas lets a subscriber of its events load without an `unknown event` error, while a typo still fails. `kitFormat` 6.
- `scripts/lib/architecture/client-imports.ts`: `@/shared/lib/events` (and subpaths) and `@/features/<x>/events`, `@/features/<x>/subscribers` are server modules for client files.
- Emitters: `inviteUserCommand` calls `emitEvent(eventOrigin(context), "users.invited", { invitationId, email, role })` right after `trackAudit`. `createOrganizationWithOwnerCommand` selects `{ id, slug }`, emits `organizations.created` with origin `{ organizationId: <new id>, actorUserId: ownerId }` and payload `{ name, slug, ownerUserId: ownerId }`, returns `{ id }`. `applySignupMembership` returns `{ organizationId }` (created or joined); the `databaseHooks.user.create.after` hook then emits `auth.signed-up` with origin `{ organizationId, actorUserId: user.id }` and payload `{ userId: user.id, email: user.email }`; no membership → no event. `adminCreate` emits `organizations.created` (origin `{ organizationId, actorUserId: userId }`, payload `{ name, slug, ownerUserId: userId }`) after `ensureOrganizationOwner` returned `created: true`, outside its transaction.
- Behaviours added: `eventOrigin({ organizationId: "org-a", userId: "u1", … })` → `{ organizationId: "org-a", actorUserId: "u1" }`; subscribers of modules `zeta` then `alpha` (registry order) run `zeta` first; within one module ids `m.b`, `m.a` run `m.a` first; the second subscriber starts only after the first one's promise settled; a subscriber assigning `event.organizationId` fails (frozen) and the next one still sees `org-a`; a payload with an extra `organizationId: "org-b"` (type error, cast in the test) reaches subscribers as `organizationId: "org-a"` with no `organizationId` in `payload`; each construction problem above with its message; the bus built from the real `@/modules.generated` registry constructs without an error; signup hook with a membership → one `auth.signed-up`; without → none; `adminCreate` creating an organization → one `organizations.created` after the transaction; joining the oldest → none.

---

### Task 10: Core better-auth events plugin; `audit-logs` subscribes

**Branch:** `feat/core-auth-events` (after T9)

**Files:**
- `src/shared/lib/auth/events-plugin.ts` (new, `core`, `critical` through `src/shared/lib/auth/`): a better-auth plugin with the `before` hook on `/organization/update-member-role` that reads the previous role (moved from `src/features/audit-logs/auth.ts`) and `after` hooks on the paths of `AUDITED_ORGANIZATION_PATHS`, plus `/organization/create` (the form in `src/features/organizations/components/create-organization-form.tsx` uses `authClient.organization.create`). It maps each path to a core event (`/organization/invite-member` stays the audit's `member.invited` mapping, emitted as `users.invited`; `/organization/accept-invitation` → `users.invitation-accepted` and `organizations.member-added`; `/organization/cancel-invitation` → `users.invitation-canceled`; `/organization/update-member-role` → `organizations.member-role-changed`; `/organization/remove-member` → `organizations.member-removed`; `/organization/create` → `organizations.created`). Registered in `src/shared/lib/auth/index.ts` before `...authPlugins`.
- The path-to-event mapping moves from `src/features/audit-logs/services/organization-audit-events.ts` to `src/shared/lib/auth/organization-events.ts` (core, so the events exist without `audit-logs`, spec §5.5).
- `src/features/audit-logs/subscribers.ts` (new): subscribes to those events and calls `trackAudit` with the same `AuditEvent` values as today (`action`, `entityType`, `entityId`, `oldData`, `newData`). `src/features/audit-logs/auth.ts` is deleted, so `audit-logs` no longer has an `authPlugin` (generator output changes accordingly).
- Existing tests of `organization-audit-events.ts` move with the mapping; the audit-log integration suite keeps its expected rows unchanged (regression: same audit entries for the same better-auth calls).
- Docs: `docs/13-modul-audit-logs.md` (it now reads core events; D42 superseded in part, noted in ADR-61's follow-up section or a short ADR line), `docs/05-moduly-rdzenia.md`.
- `core` minor, `audit-logs` minor.

**Behaviours:**
- `POST /organization/remove-member` for member `m1` (user `u2`) of `org-a` → one `organizations.member-removed` `{ organizationId: "org-a", payload: { memberId: "m1", userId: "u2" } }`.
- `/organization/update-member-role` from `member` to `admin` → `organizations.member-role-changed` with `previousRole: "member"`, `role: "admin"`.
- A failed better-auth call (no `returned` member) → no event.
- With `audit-logs` installed, each of the five paths writes the same `AuditLog` row as before this task (integration, two organizations); without `audit-logs`, the events are still emitted (a test subscriber sees them).
- `/organization/create` with `MULTI_ORG=true` → one `organizations.created` for the new organization.

**Mutations to kill:** previous role read after the update; event emitted on a failed call; a path mapped to the wrong event; audit entry `action` changed.

**Done when:** `verify`, `test:integration`, `test:e2e` (multi-org project) green; `test:mutation:gate` green with no new `allowed` entries in auth files.

---

### Task 11: Organization setup (`setup.ts`, `OrganizationModuleSetup`)

**Branch:** `feat/organization-setup` (after T9 and T2)

**Files:**
- `prisma/schema/organizations.prisma` (`core`): model `OrganizationModuleSetup` (`organizationId`, `moduleKey`, `moduleVersion`, `finishedAt`; `@@unique([organizationId, moduleKey])`, relation to `Organization` with `onDelete: Cascade`). The kit does not commit migrations; the project runs `npx prisma migrate dev` after `wa update`, as with every core schema change (spec §5.8). The tenant-scope guard covers it automatically.
- `src/shared/lib/modules/setup.ts` (new, `core`, `critical`): `defineSetup({ onOrganizationCreated?, seed? })`, `runOrganizationSetup(organizationId, { modules?, hook })` (calls each enabled module's hook, records a row after success, logs and continues on failure), a core subscriber of `organizations.created` that calls `onOrganizationCreated`, and `seed` called from `scripts/lib/admin-create.ts`.
- Generator: `hasSetup` (`setup.ts`, export `setup`), server registry `moduleSetups`. `kitFormat` +1.
- `scripts/setup-organizations.ts` and `package.json` script `setup:organizations` (`-- [--organization <id>] [--module <key>]`), a cross-organization loop through `withoutTenantScope(reason, fn)` from `src/shared/lib/tenant-scope/`.
- `packages/gato-cli/src/commands/add.ts`: after a successful `add`, print `Existing organizations did not run <module>'s setup: npm run setup:organizations -- --module <module>` when the added module has `src/features/<x>/setup.ts`.
- `gato doctor`: organizations with missing setup rows need the database; out of the CLI (no Prisma in the bundle). Instead `npm run setup:organizations -- --check` lists them and exits 1 when any is missing. Note the deviation from spec §5.8 in the report.
- Docs: `docs/03b-schemat-i-migracje.md` (new core model), `docs/09-nowy-modul.md` (setup hooks must be idempotent), `docs/16-cli-wa.md` (`wa add` hint).
- `core` minor, `gato-cli` minor, pin.

**Behaviours:**
- `organizations.created` for `org-a` with module `notes` defining `onOrganizationCreated` → the hook runs once with `{ organizationId: "org-a" }`, one row `(org-a, notes, <version>)`.
- Hook throws → no row, error logged, other modules' hooks still run.
- `setup:organizations -- --module notes` on two organizations, one with a row → the hook runs only for the other; second run → runs nothing.
- `--check` with one missing row → exit 1 and the line `org-b notes`.
- Integration: rows of `org-a` are never read with `org-b`'s context.

**Mutations to kill:** row written before the hook finished; failing hook recorded; already-set-up organization run again; `--module` filter ignored.

**Done when:** `verify`, `test:integration`, CLI gate green.

---

### Task 12: `defineCommand`, `runCommand` and `before` hooks; `uploads.delete` (ADR-62)

**Branch:** `feat/define-command` (after T9 and T6)

**Files:**
- `src/shared/lib/commands/define-command.ts` (new, `core`; `src/shared/lib/commands/` added to `mutation-gate.json` `critical`): `defineCommand({ key, module, access, input, run, events? })`, `runCommand(command, input, confirmation)`, `defineCommandHooks(map)`. `access`: `"member"` (`getOrgContext()`), `"module"` (`requireModuleAccess(module)`), `"global-admin"` (`getAdminUserOrNull()` then `getOrgContext()`). Order inside `runCommand` (spec §5.6): `requireModuleEnabled(module)` → session guard by `access` → `assertServiceModeConfirmed(context, confirmation)` → Zod parse → `before` hooks of enabled modules in registry order (each gets a frozen copy of the context and the current input, may throw `DomainError` or return a new input) → re-parse with the command's schema and reject when `organizationId` or any field marked `.meta({ organizationScoped: true })` changed or differs from `context.organizationId` → `run` → `emitEvent` for the command's events → `handleCommandError` on any throw. Returns `OperationResult<T>`.
- Generator: `hasCommandHooks` (`command-hooks.ts`, export `commandHooks`), server registry `moduleCommandHooks`. `kitFormat` +1. A hook on an unknown command key throws at registry import (lesson 1 of spec §3).
- `src/__tests__/server-entrypoints-guard.test.ts`: `runCommand` counts as a session guard (`SESSION_GUARDS`) and as `assertServiceModeConfirmed` for the service-mode rule.
- First migration: `deleteUploadCommand` in `src/features/uploads/services/commands/upload-commands.ts` becomes `defineCommand({ key: "uploads.delete", module: "uploads", access: "member", … })` plus the exported `deleteUploadCommand(input, confirmation)` that calls `runCommand`, with every existing message and behaviour kept (existing tests unchanged and green, which is the regression check). It emits a new `uploads.deleted` event (`src/features/uploads/events.ts`) in place of nothing; `trackAudit` stays as is.
- Docs: `docs/adrs/62-gato-commands-run-through-define-command-with-before-hooks-only.md` (decision 6A, the order, organization-scoped fields); `docs/06-wzorce-kodu.md` (Polish: the new command pattern next to the manual one, which project commands may keep); `AGENTS.md` "Data and organizations": one line that `runCommand` satisfies the service-mode contract (budget permitting); `.claude/skills/wa-new-module/SKILL.md` step 7.
- `core` minor, `uploads` minor, `gato-cli` minor, pin.

**Behaviours:**
- Service mode, no confirmation → `{ success: false, error: "Potwierdź zmianę w trybie serwisowym" }`, no hook and no Prisma call (spy on hooks; Prisma mocked as I/O).
- A `before` hook returning `{ id: "<other uuid>" }` → `run` receives the new id.
- A hook returning `{ id, organizationId: "org-b" }` for a command whose schema has `organizationId` → `{ success: false, error: <the command's failure message> }`, `run` not called.
- A hook mutating the context (`context.organizationId = "x"`) → throws `TypeError` inside the hook (frozen), command fails with the generic message, `run` not called.
- A hook throwing `DomainError("This file is attached to an issued invoice")` → `{ success: false, error: "This file is attached to an issued invoice" }`.
- Hooks of a disabled module do not run.
- `defineCommandHooks({ "uploads.nope": … })` imported into the registry → throws `unknown command: uploads.nope`.
- `deleteUploadCommand` existing test suite → unchanged and green; success emits one `uploads.deleted` with `{ uploadId }`.
- Guard test fixture: a `"use server"` export that calls only `runCommand` → no violation.

**Mutations to kill:** service-mode assert after the hooks; re-parse skipped; organization check comparing only to the pre-hook value; context not frozen; event emitted on failure; hooks of disabled modules run.

**Done when:** `verify`, `test:integration`, `test:mutation:gate` green, no new `allowed` entries in `src/shared/lib/commands/`.

---

### Task 13: Users commands through `defineCommand`

**Branch:** `feat/users-define-command` (after T12; parallel with T14)

**Files:**
- `inviteUserCommand` (`src/features/users/services/commands/invite-user-command.ts`) → `defineCommand({ key: "users.invite", module: "users", access: "global-admin", events: ["users.invited"] })`; the direct `emitEvent` from T9 moves into the command's `events`; mail warning (`warning: "mail-failed"`) kept through the command's result type.
- Out of scope, listed in the catalog as not hookable: `logImpersonationStartCommand`, `logImpersonationStopCommand` (no input, no organization data change), `changePasswordCommand` (better-auth endpoint, user-level), `enterOrganizationCommand` (superadmin navigation, not organization data).
- `core` minor.

**Behaviours:** the existing `inviteUserCommand` unit and integration tests unchanged and green; a `before` hook on `users.invite` returning `{ …input, role: "owner" }` → the invitation row has role `owner`; non-admin → `{ success: false, error: "Brak uprawnień" }` and no hook call.

**Mutations to kill:** admin check after the hooks; event emitted when the email already exists.

**Done when:** `verify`, `test:integration`, `test:mutation:gate` green.

---

### Task 14: API key commands through `defineCommand`

**Branch:** `feat/api-keys-define-command` (after T12; parallel with T13)

**Files:**
- `createApiKeyCommand`, `revokeApiKeyCommand`, `deleteApiKeyCommand` (`src/features/api-keys/services/commands/api-key-commands.ts`) → keys `api-keys.create`, `api-keys.revoke`, `api-keys.delete`, `access: "module"`; new events `api-keys.created`, `api-keys.revoked`, `api-keys.deleted` in `src/features/api-keys/events.ts` (never carrying the secret). The `$transaction` in `createApiKeyCommand` stays inside `run`.
- `api-keys` minor.

**Behaviours:** existing tests unchanged and green; `api-keys.created` payload is `{ apiKeyId, name, scopes }` and contains no field holding the secret or its hash; a disabled `api-keys` module → `404` from `requireModuleAccess`, no hook call.

**Mutations to kill:** secret in the event payload; event emitted when the transaction throws.

**Done when:** `verify`, `test:integration`, `test:mutation:gate` green.

---

### Task 15: UI slots: `dashboard.sections`, `app.header.actions`, `account.sections`

**Branch:** `feat/ui-slots` (after T5)

**Files:**
- `src/shared/lib/modules/slots.ts` (new, client-safe): `defineSlot<Context>(id, { kind: "server" | "client" })`, `defineContribution(slotId, { id, priority, roles?, component })` (`component` is a lazy `() => import(…)`), sorting (priority ascending, then id by code point) and role filtering (`roles` hides, not a security boundary).
- `src/shared/components/slot.tsx` (new, server component `Slot`) and `src/shared/components/client-slot.tsx` (new, `"use client"`, `ClientSlot`): two files because a client boundary needs its own module. A server contribution may be an async server component; a client slot accepts only client components.
- Generator: `hasSlots` (`slots.ts`, exports `slotDefinitions` and `slots`), in both registries (`moduleSlots`, `clientModuleSlots`), filtered by `enabledEntries` and by `gato.config.ts` `modules.<key>.slots.<slotId>.<contributionId>: null` (disable) or `{ priority }`. A contribution to an unknown slot id, or a duplicate contribution id, throws at registry import naming both modules. `kitFormat` +1. `gato-config-keys-exist` covers slot and contribution ids.
- First slots (decision 11A, spec §5.3), with their declarations in the owning module's `slots.ts`:
  - `dashboard.sections` (server, context `{ organizationId }`) in `src/app/[locale]/(app)/dashboard/page.tsx`, below the heading; `DashboardPlaceholder` (`src/features/dashboard/components/dashboard-placeholder.tsx`) is shown only when the slot has no contribution.
  - `app.header.actions` (server, context `{ organizationId }`) in `src/app/[locale]/(app)/layout.tsx`. The layout has no header element today: the slot goes in a new flex row with `OrgSwitcher` at the top of `<main>`; `MobileHeader` is not changed in this task.
  - `account.sections` (server, context `{ userId }`) in `src/app/[locale]/(app)/account/page.tsx`, after `ChangePasswordForm`.
- `users.detail.sections` and `organizations.settings.sections` are not built: no users detail page and no organization settings page exist in the code. They are added when those pages ship (see open questions).
- `src/__tests__/architecture/client-bundles-stay-server-free.test.ts`: `slots.ts` files are client entries.
- Docs: `docs/09-nowy-modul.md` (contributing to a slot), `docs/02b-rejestr-i-generator.md`.
- `core` minor, `gato-cli` minor, pin.

**Behaviours:**
- Contributions `a` (priority 20), `b` (10), `c` (10) → rendered order `b`, `c`, `a`.
- `roles: ["owner"]` with org role `member` → not rendered; global admin → rendered.
- Config `{ modules: { dashboard: { slots: { "dashboard.sections": { "invoices.unpaid-card": null } } } } }` → not rendered; an unknown contribution id → `GatoConfigError`.
- No contributions to `dashboard.sections` → `DashboardPlaceholder` text `t("placeholder")` visible (existing dashboard e2e step unchanged); one contribution → placeholder gone.
- Contribution to `dashboard.nope` → registry import throws `unknown slot: dashboard.nope (contributed by invoices)`.
- Two modules contributing `x.card` → throws naming both modules.

**Mutations to kill:** sort by priority descending; tie broken by registry order; `roles` filter inverted; disabled contribution still rendered; placeholder shown next to contributions.

**Done when:** `verify`, `test:e2e` green; component tests for `Slot` and `ClientSlot`.

**Contract fixed before the tests (2026-11-26, coordinator answers on the two conflicts):**
- **Why `slots.ts` is not in the client registry.** The client registry reaches the browser (`app-sidebar.tsx` is `"use client"` and imports it), and a lazy `() => import("./card")` inside a client module still bundles `card` for the browser. A server-slot contribution (an async server component calling a query) would break `next build`. So: `src/features/<x>/slots.ts` (exports `slotDefinitions?` and `slots?`, contributions to **server** slots, may be async server components) goes into the **server** registry only; `src/features/<x>/client-slots.ts` (exports `clientSlots?`, contributions to **client** slots, client components) goes into the client registry and also into the server registry, which validates everything. `client-slots.ts` is the client entry in `client-bundles-stay-server-free`; `slots.ts` is not.
- **Core-hosted slots.** `app.header.actions` is hosted by the `(app)` layout, which belongs to no feature module. It is a core slot declared in `src/shared/lib/modules/slots.ts` (like `coreEvents`), exempt from the prefix rule, and its config lives under the reserved key `modules.app` (one constant, `CORE_SLOTS_CONFIG_KEY = "app"` in `gato-config.ts`), which accepts only `slots`. Recorded in ADR-68; Patryk confirms the public config shape before release.
- `src/shared/lib/modules/slots.ts` (core, client-safe: runtime imports only `@/shared/lib/auth/roles` and `./gato-config`, never a registry):
  - `type SlotKind = "server" | "client"`; `interface SlotContextMap { "app.header.actions": { organizationId: string } }`, which a host module extends with `declare module "@/shared/lib/modules/slots" { interface SlotContextMap { "<id>": <context> } }` in its `slots.ts`; `type SlotId = keyof SlotContextMap & string`; `type SlotContext<Id extends SlotId> = SlotContextMap[Id]`. (The plan's `defineSlot<Context>` becomes this map, so `defineContribution` and `Slot` type-check the context by slot id without importing the host module.)
  - `interface SlotDefinition { id: string; kind: SlotKind }`; `defineSlot<Id extends SlotId>(id: Id, options: { kind: SlotKind }): SlotDefinition` → `{ id, kind }`.
  - `defineContribution<Id extends SlotId>(slot: Id, input: { id: string; priority: number; roles?: readonly OrgRole[]; component: () => Promise<{ default: ComponentType<SlotContext<Id>> }> }): SlotContribution` → `{ slot, id, priority, roles, component }` (`SlotContribution` stores the loader with an internal component type).
  - `coreSlotDefinitions: readonly SlotDefinition[]` = `[{ id: "app.header.actions", kind: "server" }]`, owner `"app"` (`CORE_SLOTS_CONFIG_KEY`).
  - `interface RegisteredContribution extends SlotContribution { module: string; kind: SlotKind }`.
  - `interface SlotModule { slotDefinitions?: readonly SlotDefinition[]; slots?: readonly SlotContribution[] }`, `interface ClientSlotModule { clientSlots?: readonly SlotContribution[] }` (a namespace import `import * as x from ".../slots"` fits them, so either export may be absent).
  - `class SlotError extends Error` with `name = "SlotError"`.
  - `sortContributions<T extends SlotContribution>(list: readonly T[]): T[]`: new array, `priority` ascending, ties by `id` in code point order (`"x.B"` before `"x.a"`).
  - `roleAllows(contribution: Pick<SlotContribution, "roles">, viewer: { userRole: UserRole; orgRole: OrgRole | null }): boolean`: no `roles` → `true`; global admin (`admin`, `superadmin`) → `true`; `orgRole: null` → `false`; else `roles.includes(orgRole)`. An empty `roles: []` hides it from everyone but global admins.
  - `slotRegistry(input: { slots: readonly ModuleEntry<SlotModule>[]; clientSlots: readonly ModuleEntry<ClientSlotModule>[] }, config: GatoConfig): RegisteredContribution[]`. Definitions = `coreSlotDefinitions` (owner `app`) then every entry's `slotDefinitions` (owner = entry module), disabled modules included (so a contributor to a disabled host's slot still loads). Contributions = every `slots` entry's `slots` (from `slots.ts`) then every `clientSlots` entry's `clientSlots` (from `client-slots.ts`), disabled modules included. Throws one `SlotError` listing every problem, one per line, in this order of checks:
    1. a slot id of module `m` without the `m.` prefix → `slot ids must start with "m.": <id>`;
    2. a slot id declared twice → `duplicate slot: <id> (declared by <a> and <b>)` (owners in declaration order, core = `app`);
    3. a contribution id of module `m` without the `m.` prefix → `contribution ids must start with "m.": <id>`;
    4. a contribution id used twice → `duplicate contribution: <id> (contributed by <a> and <b>)` (modules in contribution order, joined by ` and `);
    5. a contribution to an undeclared slot → `unknown slot: <slot> (contributed by <m>)`;
    6. a `slots.ts` contribution to a client slot → `<id> is in slots.ts but <slot> is a client slot; move it to client-slots.ts`; a `client-slots.ts` contribution to a server slot → `<id> is in client-slots.ts but <slot> is a server slot; move it to slots.ts`.
    Then `slotConfigProblems` (below) non-empty → throws `GatoConfigError(problems)`. Then drops contributions of modules with `enabled: false`, drops the ones the config sets to `null`, replaces `priority` with a configured `{ priority }`, sorts with `sortContributions`, and returns them with `module` and `kind` (the slot's kind).
  - `slotConfigProblems(input, config): string[]` (same input): for every `config.modules[key].slots[slotId][contributionId]` in config key order: `slotId` not declared by owner `key` (core slots: owner `app`) → `modules.<key>.slots.<slotId>: unknown slot: <slotId>`; else `contributionId` not a contribution to `slotId` (disabled modules count) → `modules.<key>.slots.<slotId>.<contributionId>: unknown contribution: <contributionId>`.
  - `clientSlotRegistry(entries: readonly ModuleEntry<ClientSlotModule>[], config: GatoConfig): RegisteredContribution[]`: no validation (the server registry did it); drops disabled modules' contributions and `null`-configured ones (looked up under any `modules.*.slots[slot][id]`), applies `{ priority }`, sorts, `kind: "client"`.
- `src/shared/lib/modules/gato-config.ts`: `export const CORE_SLOTS_CONFIG_KEY = "app"`; `interface GatoSlotOverride { priority: number }`; `GatoModuleConfig.slots?: Record<string, Record<string, GatoSlotOverride | null>>`. `gatoConfigProblems`: `modules.app` is not an unknown module; each of its fields other than `slots` → `modules.app.<field>: app is reserved for core-hosted slots; only slots is allowed`. `applyGatoConfig` ignores `modules.app`.
- `src/shared/lib/modules/slot-access.ts` (core, client-safe): `visibleContributions(contributions: readonly RegisteredContribution[], slotId: string, viewer: AccessContext): RegisteredContribution[]` keeps input order and keeps a contribution only when `slot === slotId`, `moduleByKey(module)` is not `null` (a disabled or missing module hides it) and `canAccessModule(moduleDef, viewer)`, and `roleAllows(contribution, viewer)`.
- `src/shared/components/slot.tsx` (server component, no directive): `async function Slot<Id extends SlotId>(props: { id: Id; context: SlotContext<Id>; viewer: AccessContext; fallback?: ReactNode }): Promise<ReactNode>` reads `moduleSlots` from `@/modules.generated`, takes `visibleContributions(moduleSlots, id, viewer)`, awaits each `component()` and renders `<Component key={contribution.id} {...context} />` in that order; none visible → `fallback` (or `null`).
- `src/shared/components/client-slot.tsx` (`"use client"`): `ClientSlot<Id extends SlotId>(props: same)` reads `clientModuleSlots` from `@/modules.client.generated`, same filter, renders each contribution through `React.lazy` (one lazy component per contribution, cached) inside `<Suspense fallback={null}>`, with `{...context}` as props; none visible → `fallback` (or `null`).
- Host modules (all `core`):
  - `src/features/dashboard/slots.ts`: map entry `"dashboard.sections": { organizationId: string }`, `slotDefinitions = [defineSlot("dashboard.sections", { kind: "server" })]`. `src/app/[locale]/(app)/dashboard/page.tsx`: `const context = await requireModuleAccess("dashboard")`, `<div className="space-y-6">`, `<h1 className="text-2xl font-bold">{t("title")}</h1>` (`getTranslations("dashboard")`), then `<Slot id="dashboard.sections" context={{ organizationId: context.organizationId }} viewer={{ userRole, orgRole, multiOrg: env.MULTI_ORG }} fallback={<DashboardPlaceholder userName={user.name || user.email} />} />`. `DashboardPlaceholder` loses its `<h1>` and wrapper (keeps the welcome card with `t("placeholder")`).
  - `src/features/account/slots.ts`: `"account.sections": { userId: string }`, server. `account/page.tsx`: `const context = await requireModuleAccess("account")`; `<Slot id="account.sections" context={{ userId: user.id }} viewer={…} />` after `ChangePasswordForm`.
  - `src/app/[locale]/(app)/layout.tsx`: at the top of `<main>`, `<div className="flex flex-wrap items-center gap-2">` holding `OrgSwitcher` and `<div className="ml-auto flex items-center gap-2"><Slot id="app.header.actions" context={{ organizationId: orgContext.organizationId }} viewer={{ userRole, orgRole, multiOrg }} /></div>`.
- Generator (`gato-cli`): `RegistryModule` gains `hasSlots` (`slots.ts`) and `hasClientSlots` (`client-slots.ts`). Server registry: after the subscribers imports, `import * as <x>Slots from "@/features/<x>/slots";` for each `hasSlots`, then `import * as <x>ClientSlots from "@/features/<x>/client-slots";` for each `hasClientSlots`; `import { slotRegistry } from "@/shared/lib/modules/slots";` right after the gato-config helpers import; after the `moduleSubscribers` line, always: `export const moduleSlots = slotRegistry({ slots: [{ module: "<x>", value: <x>Slots }, …], clientSlots: [{ module: "<x>", value: <x>ClientSlots }, …] }, gatoConfig);` (empty arrays allowed; the config import is emitted because of it). Client registry: `import * as <x>ClientSlots from "@/features/<x>/client-slots";` after the module imports, `import { clientSlotRegistry } from "@/shared/lib/modules/slots";` after the gato-config helpers import, and after the `clientModules` line, always: `export const clientModuleSlots = clientSlotRegistry([…], gatoConfig);`. `kitFormat` 7 (`SUPPORTED_KIT_FORMATS` gains 7), `gato-cli` 0.10.0, `create-gato-app` 0.3.8 with pin 0.10.0. The project-module fixture `notes` gains a `slots.ts` contributing `notes.summary-card` to `dashboard.sections`.
- `scripts/lib/architecture/client-imports.ts`: every `src/features/<x>/client-slots.ts` is a client entry (all its static and dynamic import specifiers are checked); `@/features/<x>/slots` is a server module for client files. `scripts/lib/architecture/gato-config-keys.ts`: `findGatoConfigKeyProblems` also loads each feature's `slots.ts` and `client-slots.ts` and appends `slotConfigProblems`.
- Docs: `docs/09-nowy-modul.md`, `docs/02b-rejestr-i-generator.md` (Polish), ADR-68 (two files per kind of slot, core-hosted slots under `modules.app`; ADR-66 is reserved by self-hosting Task 7). `core` 0.28.0 (0.27.0 was taken on main).
- Behaviours added: contributions `a` (20), `b` (10), `c` (10) → `b`, `c`, `a` from `sortContributions`, `slotRegistry`, `Slot` and `ClientSlot`; ids `x.B`/`x.a` with equal priority → `x.B` first; registry order `a` before `b` with equal priority but ids `m.z`, `m.y` → `m.y` first; config `{ priority: 5 }` on `a` → `a`, `b`, `c`; `roles: ["owner"]`: `member` → hidden, `owner` → shown, `orgRole: null` + `user` → hidden, `admin`/`superadmin` with `orgRole: null` → shown; a contribution of a module the viewer cannot access (`users`: `adminOnly`, `multiOrgRoles: ["owner","admin"]`, viewer `member` with `multiOrg: true`) → hidden, the same viewer as `owner` → shown; a contribution whose module is missing from `clientModules` (disabled) → hidden by `visibleContributions`; a module with `enabled: false` → its contributions absent from `slotRegistry` and `clientSlotRegistry`, while a contribution to that module's slot from another module still loads; config `null` → absent; each `SlotError` line above with its literal message; config `modules.dashboard.slots["dashboard.nope"]` → `modules.dashboard.slots.dashboard.nope: unknown slot: dashboard.nope`; config naming a slot under a module that does not own it (`modules.account.slots["dashboard.sections"]`) → unknown slot; `modules.app.slots["app.header.actions"]["x.y"]` with no such contribution → unknown contribution; `modules.app.enabled` → the reserved-key problem; `Slot` with no visible contribution renders `fallback`, with one renders it and no `fallback`; `Slot` passes the context as props (`organizationId="org-1"` visible in the contribution's output); `ClientSlot` the same; dashboard page with one contribution → no `t("placeholder")` text, heading still there; account page renders `Slot` with `{ userId }` after the password form; layout renders `Slot` `app.header.actions` with `{ organizationId }` and the viewer; a server-only import (`@/shared/lib/prisma`, also as `import()`) in `src/features/<x>/client-slots.ts` is reported by `checkClientBundles`; the real registries construct without an error.

---

### Task 16: Users table slots

**Branch:** `feat/users-table-slots` (after T15; parallel with T17)

**Files:**
- `users.table.row-actions` (client, context `{ userId, organizationId }`) in `buildUserAccountColumns` (`src/features/users/components/user-account-columns.tsx`, the `actions` column) rendered through `ClientSlot`.
- `users.table.columns` (client): a column is not a component, so this slot takes a column-shaped contribution, `defineColumnContribution("users.table.columns", { id, priority, header: <labelKey>, cell: () => import(…) })`, appended by `UsersManager` (`src/features/users/components/users-manager.tsx`) after the built-in columns and before `actions`. This is a second contribution shape next to `defineContribution`; it is the smallest change that makes the spec's slot work.
- Both apply to the global-admin `UsersManager` view of `src/app/[locale]/(app)/users/page.tsx`; the organization-members view (`OrganizationMembers`) has no slot in v1 (see open questions).
- `core` minor.

**Behaviours:** one row-action contribution → rendered once per row with that row's `userId`; one column contribution → the header shows the translated label and each cell receives the row; none → `users-manager.test.tsx` and `user-account-columns.test.tsx` snapshots of today unchanged.

**Mutations to kill:** contributed column placed after `actions`; row context from the wrong row.

**Done when:** `verify` green.

---

### Task 17: Component overrides by handle

**Branch:** `feat/component-handles` (after T15; parallel with T16)

**Files:**
- `src/shared/lib/modules/overridable.tsx` (new, `"use client"`): `overridable(handle, Base)` reads the client registry; an override either `replace`s the component or `wrap`s it (the wrapper gets `Base` as a prop). Two overrides of one handle throw at registry import naming both modules. An override must keep the props type (`ComponentProps<typeof Base>`).
- Generator: `hasComponents` (`components.ts`, export `componentOverrides`), client registry only, filtered by `enabledEntries`, plus `gato.config.ts` `modules.<key>.components.<handle>` (a config override wins over a module's and counts as the single one). `kitFormat` +1. `gato-config-keys-exist` covers handles.
- First handle (decision 11A): `users.invite-dialog` — `InviteUserDialog` in `src/features/users/components/invite-user-dialog.tsx` is exported as `overridable("users.invite-dialog", InviteUserDialogBase)`. Further handles come on request (an issue in `webamigos/gatojs`).
- Docs: `docs/09-nowy-modul.md` (overriding a handle), `docs/02b-rejestr-i-generator.md`.
- `core` minor, `gato-cli` minor, pin.

**Behaviours:** no override → renders `InviteUserDialogBase` (existing `invite-user-dialog.test.tsx` unchanged); `replace` → renders the replacement only; `wrap` → renders the wrapper with `Base` inside; two modules overriding `users.invite-dialog` → throws `users.invite-dialog is overridden by both crm and invoices`; unknown handle in config → `GatoConfigError`.

**Mutations to kill:** wrapper not given `Base`; second override silently winning; config override ignored.

**Done when:** `verify` green.

**Contract fixed before the tests (2026-11-26).** It follows ADR-68: declarations and overrides live in a module file the browser may load, the server never imports it, the registry validates at import and fails closed, and a failing override cannot take the page down.
- `src/shared/lib/modules/component-overrides.ts` (new, `core`, client-safe: runtime imports only `./gato-config`; `react` for types only):
  - `interface ComponentHandleMap {}` (empty in the core; a host module adds `"<handle>": <props>` by declaration merging in its `components.ts`), `type ComponentHandle = keyof ComponentHandleMap & string`, `type ComponentHandleProps<H extends ComponentHandle> = ComponentHandleMap[H]`, `type OverrideMode = "replace" | "wrap"`, `type WrapperProps<P> = P & { Base: ComponentType<P> }`.
  - `interface ComponentHandleDefinition { id: string }`; `defineComponentHandle<H extends ComponentHandle>(id: H): ComponentHandleDefinition` → `{ id }`.
  - `interface ComponentOverride { handle: string; mode: OverrideMode; component: OverrideComponentLoader }` (`OverrideComponentLoader` stores the loader with an internal component type); `defineComponentOverride<H extends ComponentHandle>(handle: H, input: { replace: () => Promise<{ default: ComponentType<ComponentHandleProps<H>> }> } | { wrap: () => Promise<{ default: ComponentType<WrapperProps<ComponentHandleProps<H>>> }> }): ComponentOverride` → `{ handle, mode: "replace", component }` or `{ handle, mode: "wrap", component }`. A replacement must accept the handle's props; a wrapper also gets `Base`. Neither gets anything else, so an override sees exactly the data the core component sees.
  - `interface ComponentsModule { componentHandles?: readonly ComponentHandleDefinition[]; componentOverrides?: readonly ComponentOverride[] }` (a namespace import of `components.ts` fits it).
  - `interface RegisteredComponentOverride extends ComponentOverride { source: string }`: the overriding module's key, or `CONFIG_OVERRIDE_SOURCE = "src/gato.config.ts"` for an override from the config.
  - `class ComponentOverrideError extends Error` with `name = "ComponentOverrideError"`.
  - `componentConfigProblems(entries: readonly ModuleEntry<ComponentsModule>[], config: GatoConfig): string[]`: for every `config.modules[key].components[handle]` in config key order (`key` = `app` is skipped: `gatoConfigProblems` already rejects `modules.app.components`): `handle` not declared by module `key` (disabled modules' declarations count) → `modules.<key>.components.<handle>: unknown component handle: <handle>`; else `null` → fine; a value that is not an object with exactly one own key out of `replace`, `wrap`, `module` (no other keys) → `modules.<key>.components.<handle>: set exactly one of replace, wrap or module, or null`; `replace`/`wrap` not a function → `modules.<key>.components.<handle>.<replace|wrap>: must be a lazy import, () => import("…")`; `module: <m>` where `<m>` is not an enabled module with an override of `handle` → `modules.<key>.components.<handle>.module: <m> has no enabled override of <handle>`.
  - `componentOverrideRegistry(entries: readonly ModuleEntry<ComponentsModule>[], config: GatoConfig): ReadonlyMap<string, RegisteredComponentOverride>`. Checks, in this order, each step throwing one error that lists every problem of that step:
    1. structural, over every entry including disabled modules, one `ComponentOverrideError` with one line per problem in this order: a handle of module `m` without the `m.` prefix → `component handles must start with "m.": <id>`; a handle declared twice → `duplicate component handle: <id> (declared by <a> and <b>)` (owners in declaration order joined by ` and `); an override of an undeclared handle → `unknown component handle: <handle> (overridden by <m>)`;
    2. `componentConfigProblems` non-empty → `GatoConfigError(problems)`;
    3. conflicts: a handle overridden by two or more **enabled** modules (registry order) with no entry for it in `config.modules[<owner>].components` (`Object.hasOwn`) → `ComponentOverrideError` with one line per handle: `<handle> is overridden by both <a> and <b>; choose one under modules.<owner>.components in src/gato.config.ts` (modules joined by ` and `). Disabling one of the modules resolves the conflict.
    Result, per declared handle: a config entry wins and counts as the single override (`null` → no entry, the core component renders; `{ replace }`/`{ wrap }` → `{ handle, mode, component, source: "src/gato.config.ts" }`; `{ module: m }` → `m`'s override with `source: m`); otherwise the one enabled module's override with `source: <module>`; none → no entry. An override of a disabled module never applies.
- `src/shared/lib/modules/gato-config.ts`: `type GatoComponentLoader = () => Promise<{ default: ComponentType<never> }>` (type-only `react` import); `type GatoComponentOverride = { replace: GatoComponentLoader } | { wrap: GatoComponentLoader } | { module: string }`; `GatoModuleConfig.components?: Record<string, GatoComponentOverride | null>`. `applyGatoConfig` and `gatoConfigProblems` ignore `components` (the client registry validates it); `modules.app.components` stays the reserved-key problem.
- `src/shared/lib/modules/overridable.tsx` (new, `"use client"`): `overridable<H extends ComponentHandle>(handle: H, Base: ComponentType<ComponentHandleProps<H>>): ComponentType<ComponentHandleProps<H>>`. The returned component looks the handle up in `clientComponentOverrides` (from `@/modules.client.generated`) at render: none → `<Base {...props} />` directly (no `Suspense`, no boundary, synchronous); otherwise one `React.lazy` per registered override (cached in a `WeakMap`), rendered as `<OverrideErrorBoundary handle={handle} source={override.source} fallback={<Base {...props} />}><Suspense fallback={null}>…</Suspense></OverrideErrorBoundary>` where `…` is `<Override {...props} />` for `replace` and `<Override {...props} Base={Base} />` for `wrap` (`Base` is the core component itself, never the overridable one).
- `src/shared/components/override-error-boundary.tsx` (new, `"use client"`): `class OverrideErrorBoundary` with props `{ handle: string; source: string; fallback: ReactNode; children?: ReactNode }`; renders `children` until a child throws, then `fallback`; `componentDidCatch` calls `console.error("Component override failed to render:", handle, source, error)`. A rejected loader, a throwing replacement and a throwing wrapper all end in the core component.
- First handle: `src/features/users/components.ts` (new, `core`): `declare module "@/shared/lib/modules/component-overrides" { interface ComponentHandleMap { "users.invite-dialog": InviteUserDialogProps } }` and `export const componentHandles = [defineComponentHandle("users.invite-dialog")]`. `src/features/users/components/invite-user-dialog.tsx`: `export type InviteUserDialogProps = Record<never, never>`, the current component becomes `export function InviteUserDialogBase()`, and `export const InviteUserDialog = overridable("users.invite-dialog", InviteUserDialogBase)`. Tests that render `InviteUserDialog` to check the core dialog (`invite-user-dialog.test.tsx`, `users-manager.test.tsx`, any other) pin the core component with `vi.mock("@/shared/lib/modules/overridable", () => ({ overridable: (_handle, Base) => Base }))`, their assertions unchanged, so they still pass in a project that overrides the handle.
- Generator (`gato-cli`): `RegistryModule.hasComponents` (`components.ts`; it also makes a directory a feature candidate). Client registry only: `import * as <x>Components from "@/features/<x>/components";` after the `client-slots` imports, `import { componentOverrideRegistry } from "@/shared/lib/modules/component-overrides";` right after the `clientSlotRegistry` import, and after the `clientModuleSlots` line, always: `export const clientComponentOverrides = componentOverrideRegistry([{ module: "<x>", value: <x>Components }, …], gatoConfig);` (empty array allowed). The server registry does not import `components.ts`. `kitFormat` 8 (`SUPPORTED_KIT_FORMATS` gains 8), `gato-cli` 0.11.0, `create-gato-app` 0.3.9 with pin 0.11.0 (and the literal in `package.test.ts`). The project-module fixture `notes` gains `components.ts` wrapping `users.invite-dialog` with `components/invite-dialog-with-notes.tsx` (`"use client"`, renders a short `notes` hint and `<Base {...props} />`), so the `assemble` job builds and tests a created project with an override.
- `scripts/lib/architecture/client-imports.ts`: every `src/features/<x>/components.ts` is a client entry like `client-slots.ts` (static and dynamic specifiers checked, every lazily imported file must start with `"use client"`); `src/gato.config.ts` lazy targets must start with `"use client"` as well; `src/shared/lib/modules/component-overrides.ts` joins `CLIENT_ENTRY_FILES`. `scripts/lib/architecture/gato-config-keys.ts`: `findGatoConfigKeyProblems` loads each feature's `components.ts` and appends `componentConfigProblems`.
- Docs: `docs/09-nowy-modul.md` (overriding a handle), `docs/02b-rejestr-i-generator.md` (Polish; client registry shape, detection, identifiers), ADR-69 (next free; 62, 63 and 66 are reserved) with its row in `docs/adrs/README.md`. `core` 0.29.0.
- Behaviours added: `defineComponentHandle`/`defineComponentOverride` return the literal shapes above; empty entries → empty map; a declared handle with no override → no entry; `crm` replace → `{ handle: "users.invite-dialog", mode: "replace", component: <crm loader>, source: "crm" }`, `wrap` → `mode: "wrap"`; `crm` and `invoices` both override → `users.invite-dialog is overridden by both crm and invoices; choose one under modules.users.components in src/gato.config.ts`; the same with `invoices` disabled → `crm`'s override; with config `{ module: "invoices" }` → `invoices`'s; with config `{ replace: <loader> }` → `source: "src/gato.config.ts"`; with config `null` → no entry; one module override plus config `{ wrap }` → the config's; only `crm` overrides and `crm` is disabled → no entry; config `{ module: "crm" }` with `crm` disabled, or with a module that has no override → the `has no enabled override` problem; `modules.users.components["users.nope"]` → `modules.users.components.users.nope: unknown component handle: users.nope`; `modules.crm.components["users.invite-dialog"]` → unknown component handle (wrong owner); `{}` and `{ replace, wrap }` → the exactly-one problem; `{ replace: "x" }` → the lazy-import problem; two config problems → one `GatoConfigError` with both in `problems`; an override of `users.nope` (also from a disabled module) → `unknown component handle: users.nope (overridden by crm)`; `users` declaring `crm.card` → the prefix problem; a handle declared twice → the duplicate problem; several structural problems → one error, lines in check order. `overridable`: no override → `Base` rendered synchronously with its props; replace → the replacement with the same props, no `Base`; wrap → the wrapper with the props and `Base`, and `Base` rendered inside it once; a throwing replacement, a throwing wrapper and a rejected loader → `Base` rendered and `console.error` called with `"Component override failed to render:"`, the handle and the source; an override registered for another handle → `Base`. `InviteUserDialog` with a `users.invite-dialog` replacement in the mocked client registry → the replacement, not the invite button. Generator: client registry lines and their positions above, `componentOverrideRegistry([], gatoConfig)` with no `components.ts`, no `components` import in the server registry, `my-feature` → `myFeatureComponents`. Bundle check: a server import (also `import()`) in `src/features/<x>/components.ts` is reported; a lazily imported file without `"use client"` from `components.ts` or from `src/gato.config.ts` is reported with `(missing "use client")`. `findGatoConfigKeyProblems` reports an unknown handle in `src/gato.config.ts`. The real client registry constructs without an error.
- Mutations to kill (added): an override of a disabled module applied; disabled modules counted in a conflict; config `null` ignored (module override still applied); `{ module }` resolving to another module; a handle under the wrong owner accepted; the error boundary rendering nothing instead of `Base`; an override applied to a different handle; `components.ts` not a client entry or its lazy targets not checked for `"use client"`.

---

### Task 18: `EXTENSION_POINTS.md` catalog, stale-key tests, `gato-extend` skill (ADR-63)

**Branch:** `feat/extension-points-catalog` (after T2–T17)

**Files:**
- Each extension point carries a stability label and a one-line description where it is declared: `defineSlot`, `overridable`, `defineEvents`, `defineCommand`, `permissions`, nav ids (label `stable` or `experimental`; all first-list points are `stable` except `users.table.columns`, `experimental`).
- Generator: writes `src/extension-points.generated.ts` (key unions: `ModuleKey`, `NavItemId`, `SlotId`, `ComponentHandle`, `EventName`, `CommandKey`, `PermissionKey`) and `EXTENSION_POINTS.md` at the project root (header `<!-- generated by GatoJS — do not edit. Run: npm run wa -- generate -->`), both added to `generatedFiles` in `kit/kit.json`. The generator reads declarations syntactically (it does not execute TypeScript, spec §5.1): it parses each module's `module.ts`, `slots.ts`, `events.ts` and `services/commands/*.ts` with the TypeScript compiler API already bundled in the CLI, or, if that is too heavy for the bundle, reads them from a small `extension-points.json` per module written by hand and checked by the architecture test below (the worker picks one and records why in ADR-63). The Markdown lists better-auth paths hookable through `auth.ts` from a constant in `src/shared/lib/auth/organization-events.ts`. `kitFormat` +1. The `gato-config` types use the unions, so a typo in `src/gato.config.ts` fails `npm run typecheck` as well as the import-time check.
- `src/__tests__/architecture/extension-points-exist.test.ts` (new; detection in `scripts/lib/architecture/extension-points.ts`): every catalog key exists in code (the slot id is rendered by a `<Slot id=…>`/`<ClientSlot id=…>`, the handle wraps a component through `overridable`, the event is emitted by an `emitEvent` call or a command's `events`, the command key is a `defineCommand`), and every such use is in the catalog. A stale key fails the test with the key and the file it was expected in.
- `.claude/hooks/protect-gato-files.mjs`: the generated-file check also matches the Markdown header.
- `.claude/skills/gato-extend/SKILL.md` (new, `core` through `.claude/skills/**`, English): "I want to change X" → the extension point; none fits → `npm run wa -- eject <file> --reason "<why>"` and a draft issue in `webamigos/gatojs` asking for an extension point (spec §7). `.claude/skills/wa-new-module/SKILL.md` and `AGENTS.md` (Task Router row "Changing GatoJS behaviour" → `EXTENSION_POINTS.md`, skill `gato-extend`) point to it.
- Docs: `docs/adrs/63-extension-points-are-namespaced-labelled-and-catalogued.md` (namespacing, stability labels, a stale key is an error never a warning, a breaking change to a `stable` key needs a `kitFormat` bump and a release note naming old and new key); `docs/09-nowy-modul.md` links the catalog; `docs/16b-rozwoj-kitu.md` (how a GatoJS contributor adds a point and its label).
- `core` minor, `gato-cli` minor, pin.

**Behaviours:**
- A fixture repo with `<Slot id="dashboard.sections">` and a declaration of `dashboard.sections` → no finding; declaration without any render → `dashboard.sections: declared in src/features/dashboard/slots.ts but never rendered`; render without declaration → `… rendered but not declared`.
- `defineCommand({ key: "uploads.delete" … })` removed while the catalog lists it → `uploads.delete: no defineCommand`.
- `EXTENSION_POINTS.md` for the GatoJS repo lists, in this order of sections: modules, nav items, slots, component handles, events, commands, better-auth paths, permissions; each row has module, label, description; rows sorted by key.
- `generate` twice → no diff; `generate` after removing a slot declaration → the row disappears.
- `src/gato.config.ts` referencing `dashboard.nope` → `npm run typecheck` fails (union type) and the registry import throws.

**Mutations to kill:** catalog generated unsorted; a stale key reported as a warning (test passes); one kind of key (events) missing from the check.

**Done when:** `verify` and CLI gate green; the catalog in the GatoJS repo matches the code; a created project has `EXTENSION_POINTS.md`.

---

### Task 19: Worked `invoices` project module in the `assemble` job

**Branch:** `feat/invoices-fixture` (after T18)

**Files:**
- `packages/gato-cli/src/__tests__/fixtures/invoices-module/` (new, kit-only through `packages/gato-cli/**`): the spec §6 example as a project module — `prisma/schema/invoices.prisma`, `src/features/invoices/{module.ts,slots.ts,subscribers.ts,command-hooks.ts,i18n/pl.json,i18n/en.json}`, `services/commands/issue-invoice-command.ts`, `services/queries/list-unpaid-invoices-query.ts`, `components/unpaid-invoices-card.tsx`, a unit test of the hook and an isolation integration test (`*.integration.test.ts`, two organizations) inside the fixture, and `src/gato.config.ts` that disables nothing and moves `dashboard.home` to `order: 5`. The manifest goes in `packages/gato-cli/src/__tests__/fixtures/invoices-module/manifest.json`, so the workflow step stops inlining it (the existing `notes` step in `kit.yml` keeps its inline manifest).
- `.github/workflows/kit.yml` `assemble`: a step for the `uploads` and `all` combos that copies the fixture, merges the manifest into `projectModules`, runs `npm run wa -- generate`, `npx prisma migrate dev --name add-invoices`, `npm run wa -- doctor --files` (expects no finding: no Gato file edited), `npm test`, `npm run test:integration` and `npm run build`.
- `kit/CLAUDE.md` ("Składanie i wydanie"): the fixture is a contract test for the extension points; changing a `stable` key means updating it.
- Docs: `docs/09-nowy-modul.md` gets the `invoices` walkthrough (spec §6 and §6.1 "Never do this"), linking the fixture.
- No module version bump (kit-only files).

**Behaviours (in the assembled project):**
- `doctor --files` → no modified Gato files.
- Deleting an upload referenced by an issued invoice → `{ success: false, error: "This file is attached to an issued invoice" }`; a draft invoice's upload → deleted.
- Removing a member with assigned invoices → their invoices have `assigneeId: null`, invoices of the other organization untouched.
- Dashboard of an `owner` shows the unpaid-invoices card; of a `member`, not.
- `npm run wa -- generate && git diff --exit-code` → clean.

**Mutations to kill:** not applicable to the fixture; the step itself fails if any extension point used by the fixture breaks.

**Done when:** the `assemble` job is green for `uploads` and `all` on the PR.

---

### Task 20: Protection becomes blocking

**Branch:** `feat/gato-file-protection-blocking` (after T19 and at least one GatoJS release with T2 and T3 in warning mode)

**Files:**
- `packages/gato-cli/src/doctor/mode.ts`: `FILE_PROTECTION_MODE = "block"`; `.claude/hooks/protect-gato-files.mjs`: `PROTECTION_MODE = "block"`. Tests from T2 and T3 already cover both modes; only the defaults' tests change.
- Release note text in the PR body (the commit is `feat!:` or carries `BREAKING CHANGE:` so semantic-release marks it): from this version `npm run verify` fails on a modified, non-ejected Gato file; run `npm run wa -- doctor --files`, then revert each file or `npm run wa -- eject <file> --reason "<why>"`.
- Docs: `docs/11-praca-z-kitem.md`, `docs/16-cli-wa.md` (exit codes), ADR-59 status line ("blocking since <version>").
- `core` minor, `gato-cli` minor, pin.

**Behaviours:** `doctor --files` with one modified file → exit 1; the hook on that file → exit 2 with the message; an ejected file → exit 0 and edit allowed.

**Mutations to kill:** covered by T2 and T3 tests.

**Done when:** `verify` green in the GatoJS repo and in a created project; release note drafted.

---

## Definition of done (all tasks)

- `main` has the ownership model (`kitFormat`, `ejected`, `seed`), `gato doctor --files`, `gato eject`, the `protect-gato-files` hook, companion and seed files, `src/gato.config.ts` support (modules, nav, access, branding, permissions, slots, components), domain events with the core better-auth events plugin, organization setup, every organization-data Gato command on `defineCommand` with `before` hooks, the first slots and handle, `EXTENSION_POINTS.md` with stale-key tests, the `gato-extend` skill, ADR-59 to ADR-63, and green `verify`, CLI gate, integration, e2e and `assemble` jobs (including the `invoices` fixture).
- One release has shipped with protection in warning mode before T20 makes it blocking.
- The website pages listed in the task reports are handed over.

## Open questions (not settled by the spec)

1. **Slots without a host page.** `users.detail.sections` and `organizations.settings.sections` (spec §5.3) have no page in the code: there is no users detail page and no organization settings page. The plan defers them until those pages exist. Patryk: build the pages now, or keep the slots deferred?
2. **`users.table.*` target two views.** `src/app/[locale]/(app)/users/page.tsx` renders `UsersManager` for global admins and `OrganizationMembers` for everyone else. T16 puts the slots only on `UsersManager` (the one with a `DataTable`). Should `OrganizationMembers` get its own `organizations.members.row-actions` slot?
3. **Hook warning mode.** T3 uses the PreToolUse `ask` decision so a human confirms; under bypass-permissions mode (Orca workers) `ask` may pass silently. Is a warning that a worker can ignore acceptable for the one-release warning period? **Resolved (Patryk, 2026-11-23):** warning mode also prints a visible warning in the tool result, so it does not rely only on an `ask` decision that bypass permissions may skip.
4. **`kitFormat` and the bundled CLI.** A project's `npm run wa -- update` runs the project's own bundled CLI, which may not know the target's newer `kitFormat`. T1 makes it stop with the gato-cli spec §6 message, which tells the user to install `gato-cli@latest`. Confirm that projects created before T1 (format 1, CLI without the check) are expected to update through `npx gato-cli@latest update`. **Resolved (Patryk, 2026-11-23):** yes; T1 puts `npx gato-cli@latest update <version>` into the §6 message and the docs.
5. **`gato doctor` and missing setup rows.** Spec §5.8 puts the "organizations with missing setup" check in `gato doctor`, but the CLI bundle has no database access. T11 puts it in `npm run setup:organizations -- --check` instead.
6. **Event origin.** Spec §5.5 says `emitEvent` takes `organizationId` "from the context"; better-auth hooks and `scripts/lib/admin-create.ts` have no `OrgContext`. T9 uses an origin `{ organizationId, actorUserId }` built by core code; module code gets it only through `eventOrigin(context)`. Acceptable?
7. **Commands outside `defineCommand`.** `changePasswordCommand`, `enterOrganizationCommand`, the impersonation log commands, `joinOrganizationCommand` and `createOrganizationWithOwnerCommand` do not follow the `(input, confirmation)` contract and stay as they are; `createUpload` waits for `defineRoute` (spec §5.6, second step). They are listed in the catalog as not hookable.
8. **Spec example keys that do not exist.** `audit-logs.history-link` (spec §5.1 example) is not a contribution anywhere, and `users.invite` as a permission does not fit `inviteUserCommand`, which is global-admin only. The first core permission in T8 is `uploads.delete-others`. The spec's example should be corrected when it moves to `docs/specs/`.
9. **Branding scope.** The spec names "branding fields" without listing them. T7 ships only `branding.logo`; fonts and colours go through `src/theme.css`.
10. **How the catalog reads declarations.** T18 leaves the worker a choice between parsing module files with the TypeScript compiler API in the CLI bundle and a hand-written `extension-points.json` per module checked by a test; the choice is recorded in ADR-63.

## Naming

New names say GatoJS or gato: `gato.config.ts`, `defineGatoConfig`, `gato doctor`, `gato eject`, `protect-gato-files.mjs`, `gato-extend`, `EXTENSION_POINTS.md`, ADR titles, test titles. Existing names keep their spelling until the separate rename plan: `.wa/kit.json`, `kit/kit.json`, `kit/modules/*.json`, `wa:*` regions, `npm run wa --`, `projectModules`, `wa-new-module`.
