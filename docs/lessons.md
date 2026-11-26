# Lessons

A catalog of non-obvious corrections and gotchas, so an agent (or a human) can check the area it is about to work in instead of rediscovering the same problem. The format follows Ragen's `docs/lessons.md` ([ADR-53](adrs/53-decisions-are-adrs-and-lessons-are-a-catalog.md)).

## How to use it

Before nontrivial work, skim the titles under the areas you touch and open the matching lessons. Each lesson opens with an **In short** paragraph, then **Context**, **Problem**, **Rule** and **Applies to**. To search by topic: `grep -l "topics:.*prisma" docs/lessons/*.md`.

This index lists titles only, so it stays cheap to read.

## Adding or updating a lesson

After a nontrivial correction or a non-obvious gotcha:

1. Check whether a lesson already covers it, and extend that file instead of adding a near-duplicate.
2. Otherwise add `docs/lessons/<kebab-case-slug>.md` with front matter (`title`, `areas`, `topics`), an **In short** paragraph and the four sections. The title states the rule, because the title is all the index shows.
3. Add one line, `- [Title](lessons/<slug>.md)`, under the matching `### <area>` below (create the area if needed).

## Catalog

### ci

- [`next build` on Next.js 16.4.3 stops once with `SecurityFatalError`; the retry passes, and the fix is an upgrade](lessons/next-security-notice-stops-the-first-build.md)
- [When GitHub Actions billing fails, every job fails in seconds with zero steps; it is not the PR](lessons/failed-actions-billing-looks-like-red-ci.md)
- [A build that fetches its fonts fails on whatever Google answers; serve them from the repository with `next/font/local`](lessons/a-build-that-fetches-fonts-fails-on-googles-answer.md)
- [On Helm 4, install helm-unittest by unpacking its checksum-verified release archive into the plugins directory; `helm plugin install` needs `--verify=false` and its hook fails on macOS](lessons/install-helm-unittest-from-the-verified-release-archive.md)

### process

- [A Mac that goes to sleep stops every local Orca worker; the screen turning off is harmless, system sleep is not](lessons/a-sleeping-mac-stops-orca-workers.md)
- [A Claude Code permission rule ending in `*` accepts any arguments, so `npm test *` also allows the integration config that truncates the test database](lessons/a-wildcard-permission-rule-reaches-the-integration-suite.md)
- [The commit hook's lint-staged backs up into the git stash, which every worktree of the repo shares](lessons/lint-staged-stashes-into-the-shared-git-stack.md)
- [lint-staged reformats `packages/gato-cli/src` while committing, so a bundle built before the commit is stale; rebuild after it](lessons/build-the-cli-bundle-after-lint-staged-formats-the-source.md)

### testing

- [`smtp://localhost` takes about 17 seconds per mail on macOS, so an e2e step that sends mail times out; use `127.0.0.1`](lessons/smtp-localhost-is-slow-on-macos.md)
- [Prisma 7 refuses `db push --force-reset` from an AI agent until the user's own consent text is passed in an environment variable](lessons/prisma-refuses-a-database-reset-from-an-agent.md)
- [Parallel worktrees collide on e2e ports, the uploads directory and database containers unless each one gets its own](lessons/parallel-worktrees-need-their-own-ports-and-dirs.md)
- [`packages/gato-cli` tests that touch git and the filesystem time out at 5 seconds when the machine is busy; rerun before debugging](lessons/cli-tests-time-out-under-heavy-load.md)
- [On a loaded machine, Stryker on `packages/gato-cli` needs a task-scoped Vitest config; `taskpolicy -b` and the full dry run never finish](lessons/scope-stryker-dry-runs-for-cli-tasks-under-load.md)
- [macOS lists directory entries in sorted order, so a test on a real directory cannot see a missing sort; Linux CI can](lessons/macos-lists-directories-in-sorted-order.md)
- [A new file outside an owned glob (a test in `src/__tests__/`, a file in `packages/<name>/`) needs a manifest entry, and only the CLI gate notices](lessons/a-new-file-needs-an-owner-only-the-cli-gate-checks.md)
- [The "no placeholders left" check greps every file but `__tests__/` and `*.test.*`, so a test of another kind (helm-unittest `tests/*_test.yaml`) must not contain `wa-app`](lessons/a-test-outside-test-paths-must-not-hold-placeholders.md)
- [Vitest runs test code that `tsc` rejects: a bigint literal passes `npm test` and fails `npm run typecheck` under the ES2017 target](lessons/vitest-runs-what-tsc-rejects.md)
- [Stryker `--mutate` reads `[id]` in a Next.js path as a glob character class, so the file is silently skipped; match it with `*`](lessons/stryker-mutate-globs-treat-brackets-as-a-class.md)
- [Stryker with the TypeScript checker crashes on `.mjs` files; mutate `packages/eslint-config` with `--checkers ""` and low concurrency](lessons/stryker-typescript-checker-cannot-mutate-mjs.md)
- [A Zod 4 intersection throws `Unmergable intersection` when one side keeps raw values the other side parses; use `.overwrite(() => ({}))` on the rule side](lessons/a-zod-intersection-throws-when-a-refined-side-keeps-raw-values.md)

### data

- [Prisma 7 runs an `upsert` with an empty `update` as a read and an insert, so concurrent first writers fail with `P2002`](lessons/prisma-upsert-with-an-empty-update-races-on-postgres.md)

### deploy

- [Compose interpolates every service, even one behind an inactive profile, so a `${VAR:?}` in a profile service stops installs that never use it](lessons/compose-interpolates-services-outside-the-active-profile.md)

### dependencies

- [A caret range like `^1.6.26` can already resolve to 1.7.x, so read the lockfile to learn which version actually runs](lessons/a-caret-range-already-runs-the-next-minor.md)
- [Since better-auth 1.7.3 a schema mismatch rejects sign-in at runtime, in production too; a plugin with tables fails at login, not at build](lessons/better-auth-checks-the-prisma-schema-at-startup.md)
- [npm keeps a workspace link from a copied lockfile even when the folder is gone, so a project lockfile must not list kit-only workspaces](lessons/npm-keeps-a-lockfile-workspace-link-to-a-missing-folder.md)
- [The pinned npm rewrites unrelated lockfile entries (it drops `libc` from `@next/swc-linux-*`); restore them to keep the diff about your change](lessons/pinned-npm-drops-libc-fields-from-the-lockfile.md)
