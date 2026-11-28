---
title: "esbuild follows a literal `import()` into the bundle, so a lazy import does not keep Next out of the worker; stub the module instead"
areas: ["architecture"]
topics: ["jobs", "worker", "esbuild", "next", "next-intl"]
---

# esbuild follows a literal `import()` into the bundle, so a lazy import does not keep Next out of the worker; stub the module instead

**In short**: `runCommand` imports the session layer statically (`auth/helpers.ts`, `require-module-access.ts`,
`org-context.ts`), which imports `next/headers`, `next/navigation`, `next-intl/server` and `@/i18n/routing`
(`next-intl/navigation`, `next-intl/routing`). `helpers.ts` loads `@/shared/lib/auth` with `await import(...)`, and
esbuild bundles that target too. Making an import lazy changes when it runs, not what the bundle contains.

**Context**: Task 0 of the jobs plan (2026-11-28): the metafile check failed on a job that called one
`defineCommand` command (`deleteUploadCommand`), with the chain
`upload-commands.ts → run-command.ts → auth/helpers.ts → i18n/routing.ts → next-intl/navigation`.

**Problem**:

- The jobs spec stubbed `next/*` and `server-only` only; `next-intl` stayed forbidden, so any job that touches a command
  fails the check.
- Moving the import behind `import()` looks like a fix and is not one.

**Rule**: The worker build replaces, besides `server-only` and `next/*`, `next-intl/server`, `next-intl/navigation`
and the project's `@/i18n/routing` with stubs that load and throw `"<name> is not available in the worker"` when called.
The metafile check still rejects any other `next-intl` entry. Do not "fix" a forbidden chain with a dynamic import.

**Applies to**: `src/features/jobs/worker/build.ts`, `src/features/jobs/worker/stubs/`,
`src/shared/lib/commands/run-command.ts`, jobs plan Task 9.
