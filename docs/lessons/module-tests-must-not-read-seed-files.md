---
title: 'A shipped module test must not read a seed file: the project rewrites it, so pass explicit values and guard content checks with `kit/kit.json`'
areas: ['testing']
topics: ['seed-files', 'modules', 'created-project']
---

# A shipped module test must not read a seed file: the project rewrites it, so pass explicit values and guard content checks with `kit/kit.json`

**In short**: a test that falls back to a seed file's value (a default config argument, a shipped content map) passes in the kit and fails in a project as soon as the project edits that file. Pass the values explicitly or mock the seed as data, and put assertions about the shipped content under `describe.runIf(fs.existsSync(<repo>/kit/kit.json))`.

**Context**: the `legal` module, 2026-11-27. `legal.config.ts` and `content/**` became `seedFiles`. A created project that set `consentCookieName: "acme_consent"` failed six module tests in its own `npm run verify`: they called `readConsent()` and `consentSnapshot()` without a config, so the functions read the project's config.

**Problem**:

- The kit's own `npm run verify` cannot notice: there the seed still holds the shipped values.
- Module tests are Gato files, so the project cannot fix them without ejecting.

**Rule**: For every seed file a module ships, check that no shipped test reaches it, directly or through a default argument. Verify in a created project after editing the seeds (`wa create`, edit, `npm run verify`, `wa doctor --files`).

**Applies to**: `seedFiles` in `kit/kit.json`, module tests under `src/features/<x>/**/__tests__/`.
