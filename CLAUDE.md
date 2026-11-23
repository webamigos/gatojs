# CLAUDE.md

Hard rules for this repository. Full instructions: @AGENTS.md

## Where the code comes from

Core and module code comes from the GatoJS kit (`.wa/kit.json`); send general fixes to the `webamigos/gatojs` repo.

## Data

Queries on domain data always go through `getOrgContext()` and an `organizationId` filter.

- `getOrgContext()` from `src/shared/lib/auth/org-context.ts`; never read `activeOrganizationId` from the session yourself.
- Module pages are protected by `requireModuleAccess(key)`; server actions check permissions themselves.
- Commands on organization data: `(input, confirmation?)`; after `getOrgContext()`/`requireModuleAccess()` they call
  `assertServiceModeConfirmed(context, confirmation)` before Prisma; the UI calls them through `useServiceModeAction().run`
  (a write outside a server action: `requestConfirmation()` from the same hook, `null` = cancelled).

## No comments in code

- No comments in `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` files; code explains itself through names.
- Allowed only: `// WHY: …` (max 3 lines) for a non-obvious reason, and tool directives
  (`@ts-expect-error`, `eslint-disable…`, `@vitest-environment`, `prettier-ignore`, shebang).
- The `.claude/hooks/block-comments.mjs` hook blocks all other comments.

## Generated files

- Don't edit `src/modules.generated.ts`, `src/modules.client.generated.ts` or `wa:*:start/end` regions.
  Run `npm run wa -- generate`.
- A module does not edit core files.

## Tests

- A task's tests are written by a different agent (`test-writer`) than the code, before the implementation; the implementer
  doesn't change them (`.superpowers/phase` = `implement` turns on the `.claude/hooks/protect-tests.mjs` hook).
- The expected value is a literal or a value from the spec, never the output of production code.
- The reviewer (`test-reviewer`) runs `npm run test:mutation:task -- <files>` and `npm run test:mutation:gate`;
  a surviving mutant in a critical file without an entry in `mutation-gate.json` blocks the task. A human adds entries.

## Gate

`npm run verify` before handing work over. Commits: Conventional Commits, lowercase subject.
