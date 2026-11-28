---
title: "A job that calls a session-based command gets the command's generic failure message, because `handleCommandError` swallows the worker stub's error"
areas: ["architecture"]
topics: ["jobs", "worker", "commands", "error-handling"]
---

# A job that calls a session-based command gets the command's generic failure message, because `handleCommandError` swallows the worker stub's error

**In short**: In the worker, `deleteUploadCommand({ id })` reached `getOrgContext()`, the `next/headers` stub threw
`next/headers is not available in the worker`, and `runCommand` returned `{ success: false, error: "Nie udało się usunąć
pliku" }` with the real reason only in an `error` log. A job that checks `success` sees an ordinary failure and retries
it.

**Context**: Task 0 of the jobs plan (2026-11-28).

**Problem**: The stub is meant to fail loudly (spec §6.4), but the command error handler maps every unknown error to
the command's `failureMessage`.

**Rule**: The worker stubs throw a core `WorkerUnavailableError` (`src/shared/lib/jobs/`, `name` set as a string), and
`handleCommandError` rethrows it like a Next redirect, so the job fails with the stub's message. The architecture test
still forbids session helpers in job handler files; this catches the indirect path through a command.

**Applies to**: `src/features/jobs/worker/stubs/`, `src/shared/utils/error-handling.ts`, jobs plan Task 9.
