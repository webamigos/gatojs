# CLI review follow-ups

Small fixes to `gato-cli` and `create-gato-app` found while reviewing the documentation. Each one is test-first
(`gato-task` skill).

## 1. `wa eject --undo` rolls back on failure

`undoEject` in `packages/gato-cli/src/commands/eject.ts` writes the restored file (content, then mode), then
`.wa/kit.json`, then runs `generate` for region files. Nothing is undone when a later step fails.

Fix: remember the file's original content and mode (or that it did not exist) and the original `.wa/kit.json` before
writing. If writing the file's mode, writing `.wa/kit.json` or `generate` fails, restore the file (content and mode;
remove it if it did not exist) and `.wa/kit.json`, then rethrow the original error.

### Behaviours

- A modified Gato file `src/x.ts` (content `"project\n"`, mode `0o644`), kit version `"kit\n"` mode `0o755`;
  `writeKitState` fails with `Error("disk full")` → `undoEject` rejects with `"disk full"`; the file still holds
  `"project\n"` byte for byte with mode `0o644`; `.wa/kit.json` is unchanged.
- Same, but the file was deleted in the project → after the failure the file does not exist.
- A region file (in `REGION_FILES`) whose `generate` throws `Error("generate broke")` → rejects with
  `"generate broke"`; the file holds its original content and mode; `.wa/kit.json` still has the `ejected` entry it
  had before.
- Success path unchanged: file restored with kit content and mode, `ejected` entry removed, log line
  `Restored <path> from GatoJS <version>`.

### Mutations to kill

- Removing the rollback (the try/catch) → the file holds the kit content after a failed state write.
- Restoring content but not mode.
- Not removing a file that did not exist before.
- Swallowing the error instead of rethrowing.
- Not restoring `.wa/kit.json` after a failed `generate`.

## 2. `wa doctor` messages

- The revert hint in `nextSteps` (`packages/gato-cli/src/commands/doctor.ts`) prints `git checkout -- <path>`, which
  restores from the index and keeps staged changes. Print `git checkout HEAD -- <path>`.
- `parseDoctorArgs` (`packages/gato-cli/src/args.ts`) throws `Only --files is implemented; see the gato-cli spec §8`:
  an internal reference in a user-facing error. New text: `Only wa doctor --files is implemented; run it with --files`.

### Behaviours

- A modified file `src/x.ts`, cli `npm run wa --` → the report contains the line
  `    revert: npm run wa -- eject --undo src/x.ts (or git checkout HEAD -- src/x.ts)`.
- `parseDoctorArgs([])` throws exactly `Only wa doctor --files is implemented; run it with --files`.

### Mutations to kill

- Dropping `HEAD` from the hint; any message that still mentions `spec` or `§`.

## 3. `wa update` treats target `seedFiles` as seed

Projects created before `seedFiles` existed record `README.md` with a content hash, so their first `update` could
replace or merge it. In `planUpdate` (`packages/gato-cli/src/update/plan.ts`), a path listed in the **target**
snapshot's `config.seedFiles` is treated as seed whatever its recorded hash: no plan entry for an existing file. A
path new in the target that is a seed file and already exists in the project is also left alone (no conflict); when
the project lacks it, it is added. `nextState` in `commands/update.ts` already records `"seed"` through `fileHash` for
paths the plan leaves alone.

### Behaviours

- Base and target both have `README.md`, target changed it (`"v1\n"` → `"v2\n"`), target `seedFiles: ["README.md"]`,
  recorded hash = content hash of `"v1\n"`, project has `"v1\n"` → plan has no entry for `README.md` (not `updated`).
- Same with project `"mine\n"` → no entry (not `merged`/`conflict`).
- Target `seedFiles` empty, same setup as the first → `README.md` is `updated` (the rule depends on the target list).
- Base `seedFiles: ["README.md"]`, target `seedFiles: []`, recorded hash = content hash → normal behaviour
  (`updated`): only the target list counts.
- A path new in the target, in target `seedFiles`, project has different content → no entry (not `conflict`);
  project lacks it → `added`.
- End to end (`update` command): a fixture project whose `.wa/kit.json` records `README.md` with a content hash,
  target kit lists `README.md` in `seedFiles` and changes it → after `update` the project `README.md` is unchanged
  byte for byte and `.wa/kit.json` records `"seed"` for it.

### Mutations to kill

- Checking base `seedFiles` instead of target.
- Removing the seed check from `decideExisting` or `decideAdded`.
- `&&` vs `||` between the recorded `"seed"` check and the target list check.

## 4. `create-gato-app` rate-limit message

On a 403 or 429, `httpErrorMessage` in `packages/create-gato-app/src/github.ts` suggests `--kit-version`, which still
calls the GitHub API (the `package.json` contents request). The code reads `GITHUB_TOKEN`, then `GH_TOKEN`, then
`gh auth token`.

New messages (English):

- no token: `GitHub returned <status> for <what>. This is a rate limit or missing access: set GITHUB_TOKEN (or
  GH_TOKEN) or log in with "gh auth login", wait for the limit to reset, or pass --kit <path> to use a local GatoJS
  checkout.`
- with a token: `GitHub returned <status> for <what>. This is a rate limit or missing access: wait for the limit to
  reset, check that your token can read webamigos/gatojs, or pass --kit <path> to use a local GatoJS checkout.`

### Behaviours

- 403 and 429 without a token → exactly the first message; neither contains `--kit-version`.
- 403 and 429 with a token → exactly the second message; it never contains the token.
- README "GitHub token" section says the same.

### Mutations to kill

- Swapping the token/no-token branches; the old `--kit-version` suggestion.

## Versions and docs

- `gato-cli` patch, `create-gato-app` patch with the new pin (literal in
  `packages/create-gato-app/src/__tests__/package.test.ts`), `.wa/bin/wa.mjs` rebuilt, `core` patch for the bundle.
- `docs/16-cli-wa.md`, `docs/11-praca-z-kitem.md` (Polish, internal).
