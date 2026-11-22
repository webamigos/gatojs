# ADR-54: Kit releases are cut by semantic-release from Conventional Commits on `main`

**Status:** Accepted (supersedes the "a human sets the tag" part of [D46](../decyzje.md#d46))
**Date:** 2026-11-22
**Decided by:** Patryk

## Context

A project pulls the kit by git tag, not from a package registry ([D28](../decyzje.md#d28)). `wa create` writes
`kit/kit.json` `version` into the project's `.wa/kit.json` as `kitVersion`, and `wa add` and `wa list` clone the
tag `v<kitVersion>` (`kit/cli/src/kit/source.ts`). The tag and `kit/kit.json` `version` must therefore always be
equal, and a tag must exist for every version a project can be created from.

Until now a human bumped `kit/kit.json`, ran `wa kit sync` and pushed an annotated tag ([D46](../decyzje.md#d46)).
Nothing checked any of these steps. From `v0.1.0` (2026-10-30) to 2026-11-22, 152 commits, 29 of them `feat`, `fix`
or `perf`, reached `main` without a release, so every project created in that time pointed at `0.1.0`.

Ragen (`ragen-app/.releaserc`, `.github/workflows/release.yml`) already releases with semantic-release from
Conventional Commits, which this repository enforces with commitlint.

## Decision

- Every push to `main` (and a manual `workflow_dispatch`) runs `.github/workflows/release.yml`, which runs
  semantic-release from the kit-only package `kit/release/` (own `package.json` and `package-lock.json`, installed
  with `npm ci --prefix kit/release`, pinned npm from the root `packageManager`).
- `kit/release/release.config.mjs`, passed with `--extends` from the repository root:
  - commit analysis with the `conventionalcommits` preset: `feat` → minor, `fix` and `perf` → patch, a breaking
    change → minor while the kit is below 1.0 (`{ breaking: true, release: "minor" }`), a subject containing
    `[no release]` → no release; `docs`, `chore`, `test`, `ci`, `refactor` → no release;
  - release notes from the same preset;
  - `prepare`: `node kit/release/set-kit-version.mjs <version>` rewrites only the top-level `version` in
    `kit/kit.json` (other bytes untouched), then `node .wa/bin/wa.mjs kit sync` updates `.wa/kit.json` `kitVersion`;
  - `@semantic-release/git` commits both files as `chore(release): <version> [skip ci]` (no notes in the body, so
    commitlint's 100-character body line limit cannot fail), and semantic-release tags that commit `v<version>`;
  - `@semantic-release/github` publishes a GitHub Release with the notes. Nothing is published to npm.
- `main` is protected by the "Protect main" ruleset (PR, one approval, required checks). The job checks out with
  `ssh-key: secrets.RELEASE_DEPLOY_KEY`, a write deploy key that is a bypass actor of that ruleset, and
  `repositoryUrl` points at the SSH remote, so semantic-release pushes the release commit and tag through the key.
  `GITHUB_TOKEN` (`contents: write`, `issues: write`, `pull-requests: write`) is used only for the GitHub Release API.
- `kit/kit.json` `version` is written only by the release. Module `version` bumps in `kit/modules/*.json` stay manual.
- `.github/workflows/release.yml` is in `kitOnly`; `kit/release/**` is covered by `kit/**`. No release file or
  dependency reaches a project.

## Rejected alternatives

- semantic-release as a root dev dependency, like Ragen: the root `package.json` is copied into projects and every
  dependency there needs an owner manifest ([D30](../decyzje.md#d30), [D38](../decyzje.md#d38)).
- Keeping the human tag ([D46](../decyzje.md#d46)): 152 commits went unreleased; the bump, the sync and the tag were
  convention only.
- A tag without a version commit (version derived from the tag only): `resolveKitSource` compares a local kit by
  `kit/kit.json` `version`, and `wa create` reads it, so the tagged tree must carry the version.
- `GITHUB_TOKEN` for the push: GitHub does not accept the GitHub Actions app as a bypass actor of a repository
  ruleset, so its push to the protected `main` is rejected.
- A personal access token (Ragen's `GH_TOKEN`): tied to one person's account and broader than one repository.
- The `angular` preset (Ragen's default): it does not read `feat!:` as a breaking change.

## Consequences

- Commit types on `main` now decide the version: a `feat` merged to `main` is released as a minor version with
  its commit subject in the notes. Use `[no release]` in the subject to hold a release back.
- Do not edit `kit/kit.json` `version` or `.wa/kit.json` `kitVersion` by hand; resolve conflicts on them in favour
  of `main`.
- The release commit lands on `main` after the merge; pull it before the next branch.
- A breaking change stays a minor bump until the kit reaches 1.0; going to 1.0 needs a config change.
- `[skip ci]` keeps the release commit (pushed with the deploy key, which would otherwise start workflows) from
  starting `kit.yml` or `ci.yml`. The
  commit changes only two version fields, which `kit.yml`'s "Kit state and generated files are up to date" step
  would accept.
- If `main` becomes protected, the workflow needs a token or app allowed to bypass protection.
- `npm audit --prefix kit/release` reports moderate advisories in the npm copy bundled with
  `@semantic-release/npm`; that plugin is not in the config and never runs.

## Enforcement

- `.github/workflows/release.yml` runs on every push to `main`; the tag points at the release commit because
  `@semantic-release/git` commits in `prepare` and semantic-release tags `HEAD` after it.
- Tests for the version write: `kit/release/__tests__/set-kit-version.test.mjs` (`npm test --prefix kit/release`),
  run in the `release-scripts` job of `.github/workflows/kit.yml` and before each release.
- Equal tag and version: guard in `resolveKitSource` for local sources; for tags, the release pipeline only.
- No release files in projects: `kitOnly` in `kit/kit.json`, the ownership test
  (`kit/cli/src/kit/__tests__/ownership.test.ts`) and the `assemble` job.
- Module version bumps: convention only.

## Sources

- Ragen: `ragen-app/.releaserc`, `ragen-app/.github/workflows/release.yml`.
- [D28](../decyzje.md#d28), [D30](../decyzje.md#d30), [D38](../decyzje.md#d38), [D46](../decyzje.md#d46).
- `kit/release/release.config.mjs`, `kit/release/set-kit-version.mjs`, `.github/workflows/release.yml`.
