# Dependabot manifest sync

Date: 2026-11-23. Branch `ci/dependabot-manifest-sync`.

Dependabot updates `package.json` and `package-lock.json` only. The module manifests (`kit/modules/*.json`) pin the
same versions in `dependencies` / `devDependencies`, and the ownership check in `packages/gato-cli`
(`dependencyMismatch`) compares them with the root `package.json`. Every dependabot PR stays red until a human copies
the versions into the owning manifests, bumps each changed module's `version` by a patch, runs
`npm run wa -- generate` and `npm run wa -- kit sync`, and commits.

## Decisions

- **Kit-only script under `scripts/kit/`.** `scripts/**` belongs to core and is copied into every project, so the new
  directory is listed in `kitOnly` (`kit/kit.json`). No root `npm run` script: the root `package.json` is copied into
  projects too, where the script would point at a missing file. The command is
  `npx tsx scripts/kit/sync-manifest-deps.ts`.
- **The root `package.json` is the source** of every manifest pin, as in the ownership check: a manifest dependency
  takes the root version from the same section. A manifest dependency missing from that root section is left alone
  (the ownership check reports it).
- **The bump is decided against the merge base** (`git merge-base <base> HEAD`, base `origin/main` by default). A
  module needs a patch bump when its manifest `dependencies`/`devDependencies` differ from the merge base, or when a
  workspace `package.json` it owns (`files` glob) has different dependency sections than at the merge base. A module
  whose `version` already differs from the merge base is not bumped again, so a second run changes nothing. A module
  (or workspace package) absent at the merge base is never bumped by the script.
- **Workspace packages are read, never written.** Dependabot updates them together with the root (shared lockfile);
  editing them without the lockfile would break `npm ci`. A workspace package owned by a module (`packages/env/**` and
  `packages/observability/**` belong to core) is a module file that is not regenerated from manifests, so its changed
  pins bump the owner. Kit-only packages (`gato-cli`, `create-gato-app`) have no owner and bump nothing. A workspace
  package that still pins a synced dependency at the old version gets a warning.
- **Text edits keep the manifest formatting.** Some manifests are hand-formatted (Prettier keeps short objects on one
  line), so the script replaces only the changed values instead of re-serializing.
- **Write mode then runs `wa generate` and `wa kit sync`** (in that order; lesson
  `a-new-file-needs-an-owner-only-the-cli-gate-checks`). `--check` writes nothing and exits 1 with the exact command
  when anything would change.
- **CI: a read-only check, no write-back.** A job in `kit.yml` runs `--check` on PRs opened by `dependabot[bot]` and
  prints the command. A write-back would hand a write credential to a job that installs and runs freshly bumped
  dependencies; the check needs no secret and no extra permission.

## Signatures

`scripts/kit/manifest-deps.ts` (pure, no I/O):

```ts
export type RepoFile = { path: string; text: string };
export type SyncInput = {
  rootPackageJson: string;
  manifests: RepoFile[];
  workspacePackages: RepoFile[];
  readBase: (path: string) => string | null;
};
export type DependencyUpdate = {
  module: string; path: string; section: "dependencies" | "devDependencies";
  name: string; from: string; to: string;
};
export type VersionBump = { module: string; path: string; from: string; to: string };
export type SyncResult = {
  files: RepoFile[];
  updates: DependencyUpdate[];
  bumps: VersionBump[];
  warnings: string[];
};
export function bumpPatch(version: string): string;
export function syncManifestDependencies(input: SyncInput): SyncResult;
export function parseSyncArgs(argv: string[]): { base: string; check: boolean };
export function formatReport(result: SyncResult): string;
```

`scripts/kit/run-manifest-sync.ts`: `runManifestSync({ repoDir, base, check, runWa })` reads the files
(`kit/modules/*.json`, `package.json`, `packages/*/package.json`), the merge-base texts through `git show`, writes the
changed files, then calls `runWa(["generate"])` and `runWa(["kit", "sync"])` unless `check`. Returns
`{ changed: boolean; result: SyncResult }`. `scripts/kit/sync-manifest-deps.ts` is the thin entry: it parses
`process.argv`, runs `node .wa/bin/wa.mjs` for `runWa`, prints the report and sets the exit code.

## Behaviors

1. Root `package.json` `dependencies.sharp` `^0.35.6`, `uploads.json` pins `^0.35.5` at version `0.2.6` (same at the
   merge base) → `uploads.json` text has `"sharp": "^0.35.6"` and `"version": "0.2.7"`; one update
   `{ module: "uploads", section: "dependencies", name: "sharp", from: "^0.35.5", to: "^0.35.6" }`; one bump
   `0.2.6 → 0.2.7`.
2. Two dependencies of `core` change in one run → one bump (`0.13.0 → 0.13.1`), two updates.
3. A manifest whose pins equal the root keeps its text (not in `files`), even when another manifest changes.
4. Root equals every manifest and every version equals the merge base → `files`, `updates`, `bumps`, `warnings` empty.
5. Idempotent: running on the output of behaviour 1 (same merge base) → `files` empty, `bumps` empty.
6. Version already bumped (`0.2.7` vs `0.2.6` at the merge base) and a pin still behind → the pin is updated, the
   version stays `0.2.7`.
7. A dev dependency: root `devDependencies.vitest` `^4.1.3`, core `devDependencies.vitest` `^4.1.2` → updated in
   `devDependencies`.
8. Section-specific: the manifest has `x` in `devDependencies`, the root has `x` only in `dependencies` at another
   version → no update.
9. A manifest dependency missing from the root → left as is, no bump.
10. Formatting: a manifest with a one-line `{ "model": "User", "field": "…" }` keeps that line after the edit; only
    the changed value lines differ.
11. The same name and value in `dependencies` and `devDependencies` of one manifest, root changes only the dev one →
    only the dev entry changes.
12. Workspace owner bump: `core.json` owns `packages/env/**`; `packages/env/package.json` has `zod` `^4.4.0`, the
    merge base had `^4.3.6`, core's own pins already equal the root → core `0.13.0 → 0.13.1`, no update.
13. Workspace package without an owner (`packages/gato-cli/package.json`, no manifest glob) changed → no bump.
14. Stale workspace pin: root and core move `zod` `^4.3.6 → ^4.4.0`, `packages/env/package.json` still pins
    `^4.3.6` → warning `packages/env/package.json pins zod ^4.3.6; package.json has ^4.4.0`; the workspace file is
    never in `files`.
15. Module absent at the merge base (`readBase` returns `null`) → pins updated, no bump.
16. `bumpPatch("0.2.9")` → `"0.2.10"`; `bumpPatch("1.0.0")` → `"1.0.1"`; `bumpPatch("1.0")`, `"1.0.0-rc.1"`, `"v1.0.0"`
    → throw.
17. `parseSyncArgs([])` → `{ base: "origin/main", check: false }`; `["--check", "--base", "origin/dev"]` →
    `{ base: "origin/dev", check: true }`; `["--base=x"]` → base `x`; unknown flag or `--base` without a value →
    throw.
18. `formatReport`: lists each bump as `kit/modules/uploads.json 0.2.6 -> 0.2.7` and each update as
    `  sharp ^0.35.5 -> ^0.35.6` under it, then warnings; empty result → `Manifests already follow package.json.`
19. `runManifestSync` in a temporary git repository (base commit, then a root bump): writes the manifest, calls
    `runWa` with `["generate"]` then `["kit", "sync"]`, returns `changed: true`; a second call returns
    `changed: false` and leaves the file bytes unchanged.
20. `runManifestSync` with `check: true` and a stale manifest: the file is unchanged, `runWa` is not called,
    `changed: true`.

## Mutations to kill

- Comparing against `devDependencies` of the root for a `dependencies` pin (and the reverse).
- Bumping once per changed dependency instead of once per module.
- Bumping when the version already differs from the merge base; not bumping when it equals.
- Bumping a module whose pins did not change; bumping a module absent at the merge base.
- `bumpPatch` incrementing minor or major, or accepting a pre-release.
- Skipping the workspace ownership check, or bumping for an unowned workspace package.
- Writing the workspace `package.json`.
- Calling `runWa` in `--check` mode; calling `kit sync` before `generate`.
- Re-serializing the manifest (formatting lost).
