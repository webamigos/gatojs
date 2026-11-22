## What and why

<!-- What changed and what problem it solves. Link the issue: Fixes #123. -->

## How it was verified

<!-- What you ran and what it said. Screenshots for UI changes. -->

## Checklist

- [ ] `npm run verify` passes (and `npm run verify --prefix kit/cli` for CLI changes)
- [ ] Tests added or updated; a bug fix has a test that fails without the fix
- [ ] Queries and commands on organization data go through `getOrgContext()` / `requireModuleAccess()` and filter by `organizationId`; commands call `assertServiceModeConfirmed`
- [ ] No edits to generated files or `wa:*` regions (`npm run wa -- generate` run instead)
- [ ] Changed kit files: owning module `version` bumped in `kit/modules/<module>.json` and `npm run wa -- kit sync` run
- [ ] User-facing text added to both `pl` and `en` messages
- [ ] Prisma schema change: migration notes for projects included
- [ ] A decision worth recording has an ADR in `docs/adrs/`; a non-obvious gotcha has a lesson in `docs/lessons/`
