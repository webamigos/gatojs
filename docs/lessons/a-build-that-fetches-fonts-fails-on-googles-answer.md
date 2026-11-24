---
title: 'A build that fetches its fonts fails on whatever Google answers; serve them from the repository with `next/font/local`'
areas: ['ci']
topics: ['nextjs', 'next-font', 'turbopack', 'google-fonts', 'flaky-builds', 'self-hosting']
---

# A build that fetches its fonts fails on whatever Google answers; serve them from the repository with `next/font/local`

**In short**: `next/font/google` downloads fonts during `next build`, so the build depends on Google's response and on the network. Ragen lost two of three `main` builds to one such response with no code change. GatoJS now serves Inter 5.3.0 from Fontsource in `src/app/fonts/` with `next/font/local`, and the architecture test `fonts-are-not-fetched-at-build` fails on a `next/font/google` import. When one face is split into several `next/font/local` calls, turn `adjustFontFallback` off on every call but the last.

**Context**: `src/app/layout.tsx` loaded Inter with `next/font/google` (subset `latin` only, so Polish letters fell back to a system font). Ragen used the same import. On 2026-10-09 its `Build` job failed on two of three pushes to `main` with `next/font/google queries have exactly one entry`, while a pull-request run of the same tree passed minutes later. A self-hosted GatoJS install should also be able to build its image without reaching Google.

**Problem**: Google sometimes answers the `css2` request with extensionless `fonts.gstatic.com/l/font?kit=…&skey=…&v=…` URLs instead of `/s/…/*.woff2`. Turbopack parses the font options as a query string, the `&` splits them, and the build fails; webpack fails on the missing extension ([vercel/next.js#99114](https://github.com/vercel/next.js/issues/99114)). It looks like a flake, because a re-run usually passes, and no log prints the response that made the difference.

Self-hosting brings a second, quieter bug. `next/font/local` gives every call its own family, so the latin and latin-ext subsets of Inter are two families in one stack, and Next follows each with a metric-adjusted local Arial (`adjustFontFallback`, on by default). Arial has ą ć ę ł: placed between the two subsets it answers every Polish character, and the latin-ext file is never downloaded. The page still looks right at a glance, because the fallback is metric-matched.

**Rule**:

- A build must not depend on a third party's response. Fonts live in `src/app/fonts/` (Fontsource files, with a `LICENSE-<family>.txt` for each family) and load through `next/font/local` in `src/app/fonts/fonts.ts`. `src/__tests__/architecture/fonts-are-not-fetched-at-build.test.ts` fails on a `next/font/google` import, on a missing `src` file and on a missing license.
- Give each subset Google's `unicode-range` through `declarations`, so a browser downloads latin-ext only on a page that uses it.
- When one face is split into several `next/font/local` calls, set `adjustFontFallback: false` on every call but the last in the `--font-sans` stack.
- Loader options are literals: Next reads them statically and rejects shared constants.
- Check a font change in the browser (`document.fonts`, the resource list, the font panel) on a page with the characters the subset exists for, not by looking at it.

**Applies to**: any `next/font` use in GatoJS and in projects built from it, and any build step that reaches the network.
