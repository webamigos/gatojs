---
title: 'On a loaded machine, Stryker on the task files (CLI or root) needs a task-scoped Vitest config; `taskpolicy -b` and the full dry run never finish'
areas: ['testing']
topics: ['kit-cli', 'stryker', 'mutation', 'load', 'timeouts']
---

# On a loaded machine, Stryker on the task files (CLI or root) needs a task-scoped Vitest config; `taskpolicy -b` and the full dry run never finish

**In short**: `npm run test:mutation:task --prefix packages/gato-cli -- <files>` under `nice -n 19 taskpolicy -b` failed its dry run twice on an unrelated 5 s timeout, then ran past the 2-hour background limit with 445 of 628 mutants done and no report. A temporary Stryker config with `vitest.configFile` pointing at a Vitest config that includes only the task's test files, `testTimeout: 60000`, `concurrency: 3`, `incremental: false`, run under `nice -n 19` without `taskpolicy -b`, finished the same 628 mutants in 30 minutes.

**Context**: `feat/gato-doctor-and-eject`, 2026-11-24/25, load average 11–40.

**Problem**:

- `taskpolicy -b` keeps the process on the efficiency cores; Stryker's dry run runs all 1281 CLI tests and any 5 s timeout aborts it.
- Stryker writes its report only at the end, so a run that is stopped leaves nothing for the gate.

**Rule**: For a task's mutation run on a busy machine, copy `stryker.config.json` to an untracked file with `"vitest": { "related": false, "configFile": "<scoped config>" }`, a scoped Vitest config (`mergeConfig` of `vitest.config.ts` with `include` limited to the task's tests and a 60 s timeout), and run `npx stryker run <that file> --mutate <whole files>`. Vitest's `mergeConfig` concatenates arrays, so `include` from the base config survives the merge and the "scoped" run still loads every test file; set `merged.test.include` after `mergeConfig` (seen on `feat/cli-selfhost-regions`, 2026-11-25). Scoping can only add survivors, never hide them, so the score is conservative. Delete both files afterwards, and mutate every changed file in one run so the gate sees one complete report.

**Root files too** (`feat/domain-events`, 2026-11-26): the root `npm run test:mutation:task -- <files>` timed out its initial test run after 5 minutes, because `related` pulls in every test that imports a changed file (for `src/shared/lib/auth/index.ts`, most of the suite), and left no report; under `taskpolicy -b` the TypeScript checker processes sat at 0.4% CPU for 25 minutes. The same recipe worked: a scoped Vitest config with only the task's tests and `environment: "node"`, one run for the light files and a separate one for `src/shared/lib/auth/index.ts` with the auth tests, under `nice -n 19` only. Pass the reports to the gate by path: `npm run test:mutation:gate -- <a.json> <b.json>`.

The root suite fails differently: on `feat/permissions` (2026-11-26, load about 18, two other worktrees running Stryker) `npm run test:mutation:task -- <files>` stopped because its initial test run took longer than Stryker's default `dryRunTimeoutMinutes` of 5. The rerun with `--dryRunTimeoutMinutes 25` passed (its initial run of 1473 tests took 3 minutes, the whole run 22), so on the root suite raise the timeout before scoping anything.

**Applies to**: `packages/gato-cli` and root mutation runs by `test-reviewer` and workers (on the root suite raise `--dryRunTimeoutMinutes` first, then scope); see also [cli-tests-time-out-under-heavy-load](cli-tests-time-out-under-heavy-load.md).
