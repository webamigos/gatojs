---
title: 'A lazy `import()` in a file the client registry imports still ships its target to the browser; server-only contributions go in files only the server registry imports'
areas: ['architecture']
topics: ['registry', 'generator', 'slots', 'next-build', 'client-bundle']
---

# A lazy `import()` in a file the client registry imports still ships its target to the browser; server-only contributions go in files only the server registry imports

**In short**: the extensibility spec and plan put each module's `slots.ts` (lazy `() => import("./card")` per contribution) into both generated registries. `src/modules.client.generated.ts` is part of the browser bundle (`app-sidebar.tsx` is `"use client"` and imports it), and the bundler follows a dynamic `import()` too, so a server contribution (an async component calling `getOrgContext()`, `next/headers`, Prisma) would be built for the browser and break `next build`. Task 15 split the files: `slots.ts` goes into the server registry only, `client-slots.ts` into both ([ADR-68](../adrs/68-ui-slots-split-server-and-client-contributions.md)).

**Context**: `feat/ui-slots`, 2026-11-26, extensibility plan Task 15. Caught while writing the contract, before any code.

**Problem**:

- "Lazy" only defers loading; it does not keep a module out of a bundle. Anything reachable from a client module, statically or through `import()`, is compiled for the browser.
- `client-bundles-stay-server-free.test.ts` checks only the specifiers written in a client entry, not what those files import in turn, so it would not have caught a server card behind a relative `import("./card")`.

**Rule**: Before adding a file kind to the client registry, ask whether any file it lazily imports may be server code. If yes, keep that kind in the server registry and give client-side contributions their own file (as `client-slots.ts`). Check with a created project and `next build` using a contribution that is an async server component (done for Task 15: the `notes` fixture card calling `getOrgContext()` built cleanly from `slots.ts`).

**Applies to**: generator tasks that add a registry list (extensibility Tasks 16 and 17: column contributions and component overrides are client-side and belong in client files), and any shared file imported by `src/modules.client.generated.ts`.
