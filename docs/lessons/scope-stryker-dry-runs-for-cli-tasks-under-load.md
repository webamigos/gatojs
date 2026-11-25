---
title: 'On a loaded machine, Stryker on `packages/gato-cli` needs a task-scoped Vitest config; `taskpolicy -b` and the full dry run never finish'
areas: ['testing']
topics: ['kit-cli', 'stryker', 'mutation', 'load', 'timeouts']
---

# On a loaded machine, Stryker on `packages/gato-cli` needs a task-scoped Vitest config; `taskpolicy -b` and the full dry run never finish

**In short**: `npm run test:mutation:task --prefix packages/gato-cli -- <files>` under `nice -n 19 taskpolicy -b` failed its dry run twice on an unrelated 5 s timeout, then ran past the 2-hour background limit with 445 of 628 mutants done and no report. A temporary Stryker config with `vitest.configFile` pointing at a Vitest config that includes only the task's test files, `testTimeout: 60000`, `concurrency: 3`, `incremental: false`, run under `nice -n 19` without `taskpolicy -b`, finished the same 628 mutants in 30 minutes.

**Context**: `feat/gato-doctor-and-eject`, 2026-11-24/25, load average 11–40.

**Problem**:

- `taskpolicy -b` keeps the process on the efficiency cores; Stryker's dry run runs all 1281 CLI tests and any 5 s timeout aborts it.
- Stryker writes its report only at the end, so a run that is stopped leaves nothing for the gate.

**Rule**: For a task's mutation run on a busy machine, copy `stryker.config.json` to an untracked file with `"vitest": { "related": false, "configFile": "<scoped config>" }`, a scoped Vitest config (`mergeConfig` of `vitest.config.ts` with `include` limited to the task's tests and a 60 s timeout), and run `npx stryker run <that file> --mutate <whole files>`. Scoping can only add survivors, never hide them, so the score is conservative. Delete both files afterwards, and mutate every changed file in one run so the gate sees one complete report.

**Applies to**: `packages/gato-cli` mutation runs by `test-reviewer` and workers; see also [cli-tests-time-out-under-heavy-load](cli-tests-time-out-under-heavy-load.md).
