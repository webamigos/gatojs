---
title: 'Stryker rewrites the literals a syntactic repo-scan test reads, so a mutation run that mutates a guarded entry point and runs the scan fails its initial test run'
areas: ['testing']
topics: ['stryker', 'mutation', 'architecture-tests', 'module-entry-points']
---

# Stryker rewrites the literals a syntactic repo-scan test reads, so a mutation run that mutates a guarded entry point and runs the scan fails its initial test run

**In short**: mutating `src/features/uploads/services/commands/upload-commands.ts` together with `src/__tests__/architecture/module-entry-points-check-enabled.test.ts` in the test set failed Stryker's initial test run: the repo-scan case reported `upload-commands.ts#deleteUploadCommand` as unguarded. Stryker's mutation switching wraps code in the sandbox even before any mutant is active, so `defineCommand({ module: "uploads", … })` became `defineCommand(stryMutAct_9fa48("834") ? {} : (stryCov_9fa48("834"), { … }))`, and the detector no longer saw an object literal with a `module` key.

**Context**: `feat/define-command` (extensibility Task 12), 2026-11-26, mutation review of the task's files.

**Problem**: syntactic architecture tests (`module-entry-points-check-enabled.test.ts`, `server-entrypoints-guard.test.ts`) scan the source files of the working copy Stryker runs in, and those files are instrumented. A guard argument such as `requireModuleEnabled("uploads")` turns into `stryMutAct_…() ? "" : "uploads"` the same way, so the issue probably predates this task (not verified with a full run, which agents do not start).

**Rule**: when a mutated file is an entry point the repo-scan tests check, leave the scan test files out of that file's scoped Vitest config (they test the detector, not the mutated file) and run the detector's own mutation separately with them included. The full `npm run test:mutation` suite is affected the same way; check it before the next kit release.

**Applies to**: Stryker runs over `src/features/**/services/commands/`, `src/app/api/**` and any file the entry-point detectors scan.
