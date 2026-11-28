---
title: "Mail templates bring React into the worker legitimately; the bundle check forbids components and Next, not React itself"
areas: ["architecture"]
topics: ["jobs", "worker", "esbuild", "react", "mail"]
---

# Mail templates bring React into the worker legitimately; the bundle check forbids components and Next, not React itself

**In short**: `auth/index.ts` imports `mailer.ts`, which imports the `src/app/emails/*.tsx` templates, so `react`,
`react-dom/server` and `@react-email/*` are on the worker's graph. Mail rendering in jobs needs them. A check that
rejects every `react` import fails on the first job that can send mail.

**Context**: Task 0 of the jobs plan (2026-11-28): with the registries redirected and `next-intl` stubbed, the only
remaining violations were `react/jsx-runtime` imports from `src/app/emails/`.

**Problem**: The jobs spec (§6.4) listed `react` and `react-dom` as forbidden outright, which contradicts its own rule
that mail jobs render templates at run time.

**Rule**: The metafile check allows `react`, `react-dom/server` and `@react-email/*` only when the importer is under
`src/app/emails/` or is `@react-email/*` itself. It rejects `react-dom/client`, any `"use client"` file, any `.tsx`
outside `src/app/emails/`, `next` that is not a stub, `next-intl` that is not a stub, `@/modules.generated` and
`@/modules.client.generated`, and names the first file under `src/features/<module>/` in the chain.

**Applies to**: `src/features/jobs/worker/build.ts`, `src/shared/lib/mailer.ts`, `src/app/emails/`, jobs plan Task 9.
