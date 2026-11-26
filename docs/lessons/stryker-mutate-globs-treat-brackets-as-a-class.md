---
title: 'Stryker `--mutate` reads `[id]` in a Next.js path as a glob character class, so the file is silently skipped; match it with `*`'
areas: ['testing']
topics: ['mutation-testing', 'stryker', 'nextjs', 'globs']
---

# Stryker `--mutate` reads `[id]` in a Next.js path as a glob character class, so the file is silently skipped; match it with `*`

**In short**: In extensibility Task 6, `npm run test:mutation:task -- …,src/app/api/uploads/\[id\]/route.ts,…` mutated 9 of the 10 listed files. Stryker printed only a `WARN ProjectReader Glob pattern "src/app/api/uploads/\[id\]/route.ts" did not result in any files.` line among hundreds of progress lines. The run took 160 minutes, and the dynamic route was never mutated.

**Context**: Extensibility Task 6 (`requireModuleEnabled`), 2026-11-25. Next.js dynamic segments (`[id]`, `[...all]`, `[locale]`) are directory names with brackets.

**Problem**:

- `--mutate` takes globs. `[id]` is a character class that matches one character `i` or `d`, never the literal directory `[id]`.
- A backslash inside single quotes reaches Stryker unchanged, and Stryker's glob matcher does not treat it as an escape on this setup. The pattern matches nothing.
- An unmatched pattern is a warning, not an error. The summary table simply omits the file, so the score looks complete.

**Rule**: For a path with a Next.js dynamic segment, use a wildcard that only that file can match (`src/app/api/uploads/*/route.ts`). After `Found N of M file(s) to be mutated`, check that N equals the number of files you listed, and grep the log for `did not result in any files`.

**Applies to**: `npm run test:mutation:task`, `stryker run --mutate`, the `mutate` list in `stryker.config.json`, any route under `src/app/**/[…]/`.
