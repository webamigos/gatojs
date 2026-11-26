---
title: 'A release tag on a `[skip ci]` commit, or pushed with `GITHUB_TOKEN`, starts no workflow; call the follow-up workflow from the release job'
areas: ['ci']
topics: ['github-actions', 'release', 'semantic-release', 'docker']
---

# A release tag on a `[skip ci]` commit, or pushed with `GITHUB_TOKEN`, starts no workflow; call the follow-up workflow from the release job

**In short**: `docker-publish.yml` publishes version tags on `push` of `v*`, but semantic-release's tag in the GatoJS
repository never triggers it. The release commit is `chore(release): <version> [skip ci]` and the tag points at it, so
GitHub skips every `push` workflow for that tag. A tag or release created with `GITHUB_TOKEN` starts no workflow either.

**Context**: 2026-11-26, self-hosting Task 10 (image publishing, ADR-67). `kit/CLAUDE.md` already records the same
effect for the npm publishing tags (`gato-cli@<v>` must not point at the release commit).

**Problem**:

- A `push: tags: ["v*"]` trigger looks correct and passes actionlint, yet the release image is never built.
- Nothing fails: the workflow simply does not appear in the Actions tab for that tag.

**Rule**: When a workflow must run after a release that the release job itself tags, call it from the release
workflow as a reusable workflow (`on: workflow_call`, `uses: ./.github/workflows/<file>.yml`) with the released
version as an input, and grant the caller job every permission the called jobs need. Keep the tag trigger for
repositories that push tags by hand. The released version is read in the job (here: `kit/kit.json` before and after
semantic-release) and passed as a job output.

**Applies to**: `.github/workflows/release.yml`, `.github/workflows/docker-publish.yml`, and any future workflow that
reacts to GatoJS release tags.
