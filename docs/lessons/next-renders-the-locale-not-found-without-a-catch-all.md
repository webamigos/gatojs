---
title: 'Next.js 16 renders `[locale]/not-found.tsx` for unknown paths without a `[locale]/[...rest]` catch-all, and the catch-all blocks other catch-alls'
areas: ['frontend', 'i18n']
topics: ['next', 'next-intl', 'not-found', 'routing']
---

# Next.js 16 renders `[locale]/not-found.tsx` for unknown paths without a `[locale]/[...rest]` catch-all, and the catch-all blocks other catch-alls

**In short**: The next-intl pattern of a `[locale]/[...rest]/page.tsx` that calls `notFound()` is not needed on Next.js 16.4: an unknown path under a locale already renders `src/app/[locale]/not-found.tsx` inside the `[locale]` layout. The catch-all only costs: a project or module that adds its own `[locale]/(app)/[...slug]` fails the build (two catch-alls with different parameter names at one level).

**Context**: PR #137 (localized 404 page), 2026-11-28. A review flagged the catch-all as a route conflict for modules.

**Problem**:

- Two production builds compared with `curl -H "Accept-Language: pl"`: with and without the catch-all, `/does-not-exist`, `/a/b`, `/en/does-not-exist` answered 404 with the same localized page (`lang`, messages, link `/` or `/en`).
- Without an `Accept-Language` header (plain `curl`), every Polish path without a prefix answers `307` to itself, with or without the catch-all; browsers always send the header, so test with it.

**Rule**: Don't add a route only to reach a `not-found.tsx`; check a production build first. Keep the core free of catch-all routes so modules can own one.

**Applies to**: `src/app/[locale]/`, `src/app/not-found.tsx`, module pages under `src/app/[locale]/(app)/`.
