---
title: 'The "no placeholders left" check greps every file but `__tests__/` and `*.test.*`, so a test of another kind (helm-unittest `tests/*_test.yaml`) must not contain `wa-app`'
areas: ['testing', 'ci']
topics: ['placeholders', 'assemble', 'helm', 'helm-unittest', 'kit-sync']
---

# The "no placeholders left" check greps every file but `__tests__/` and `*.test.*`, so a test of another kind (helm-unittest `tests/*_test.yaml`) must not contain `wa-app`

**In short**: `wa create` replaces `WA App`, `wa-app` and `wa_app` only in `placeholderFiles`, and the `assemble` job then fails on any of the three left in the project, except under `__tests__/`, in `*.test.*`, in `package-lock.json` and in `.wa/bin/`. A test file that matches none of those exclusions, such as a helm-unittest suite in `deploy/helm/gatojs/tests/*_test.yaml`, fails the check as soon as it asserts the chart name or the default image. Write such tests without the placeholder strings: set `image.repository` and `fullnameOverride` in the test and assert those values.

**Context**: Self-hosting Task 9 added a Helm chart whose `Chart.yaml` (`name: wa-app`) and `values.yaml` (`image.repository: wa-app`) are placeholder files, so an assembled project gets its own slug. Its helm-unittest suites live next to the chart in `tests/`, the plugin's default.

**Problem**: A natural assertion like `image: wa-app:0.1.0` or a Deployment named `RELEASE-NAME-wa-app` passes in the GatoJS repository. In an assembled project the chart is renamed but the test is not, so the CI grep stops the `assemble` job, and the test would fail there anyway. Checking an assembled project by hand with `git grep` hides the problem while nothing is committed: `git grep` searches tracked files only, so it needs `--untracked`.

**Rule**:

- A test file outside `__tests__/` and `*.test.*` contains none of `WA App`, `wa-app`, `wa_app`. It sets its own values (`image.repository: registry.example.com/crm`, `fullnameOverride: demo`, `chart: {appVersion: 9.9.9}`) and asserts those.
- To check an assembled project locally, run the CI grep with `git grep --untracked` (or commit first).
- Do not make such tests placeholder files to get around the check: the rule keeps tests independent of the project's name.

**Applies to**: any test or fixture that is not a Vitest file and ships to projects (`deploy/helm/**/tests/`, YAML or JSON fixtures outside `__tests__/`).
