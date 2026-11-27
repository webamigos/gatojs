# kit/CLAUDE.md

Zasady dla plików tylko kitu (`kit/`, pakiety narzędzi `packages/gato-cli` i `packages/create-gato-app`). Nie trafiają do projektów (`.dockerignore`, własny workflow).

## Bramka kitu

- `npm run verify --prefix packages/gato-cli` (lint → typecheck → testy → build bundla); w CI job `cli` w `.github/workflows/kit.yml`.
- Instalacja: `npm ci` w korzeniu (CLI to workspace, wspólny `package-lock.json`); nowe zależności CLI:
  `npx -y npm@11.21.1 install <pakiet> --workspace gato-cli`.
- Mutacje CLI: `npm run test:mutation:task --prefix packages/gato-cli -- <pliki>` i `npm run test:mutation:gate --prefix packages/gato-cli`;
  wpisy do `packages/gato-cli/mutation-gate.json` dopisuje człowiek.

## Bundel CLI

- Po każdej zmianie w `packages/gato-cli/src` uruchom `npm run build --prefix packages/gato-cli` i zacommituj `.wa/bin/wa.mjs` razem ze zmianą.
- Projekt uruchamia CLI jako `npm run wa -- <komenda>` (`node .wa/bin/wa.mjs`), bez budowania.
- CI sprawdza `git diff --exit-code -- .wa/bin/wa.mjs`: nieaktualny bundel zatrzymuje job.
- Ten sam build tworzy `packages/gato-cli/dist/gato.mjs` (pakiet npm `gato-cli`, komenda `gato`; nie commitujemy go). Bundle różnią się
  tylko nazwą komendy; wersja z `packages/gato-cli/package.json` jest wbudowana w oba. Job `cli-package` w `kit.yml` pakuje CLI
  (`npm pack`) i uruchamia `gato` z tarballa. Publikacja: `packages/gato-cli/README.md` („Publishing”).

## create-gato-app

- Bramka: `npm run verify --prefix packages/create-gato-app` (lint → typecheck → testy → build `dist/`); w CI job
  `create-gato-app` w `.github/workflows/packages.yml`. Mutacje: `npm run test:mutation:task --prefix packages/create-gato-app -- <pliki>`.
- `create-gato-app` zależy od `gato-cli` w dokładnej wersji (bez zakresu) i uruchamia jego `dist/gato.mjs create`;
  pin musi równać się `version` w `packages/gato-cli/package.json` (test `package.test.ts` i CI). Podbijasz `gato-cli` →
  podbij pin w tym samym PR. Eksport biblioteczny `createProject` z `gato-cli` może później zastąpić uruchamianie bina.
- Smoke test na spakowanych tarballach (nigdy z rejestru): `SMOKE_INSTALL=1 bash packages/create-gato-app/scripts/smoke-pack.sh "$PWD"`;
  w CI job `smoke` w `packages.yml`. `npm pack --pack-destination` nie tworzy katalogu: utwórz go wcześniej.

## Publikacja na npm (`gato-cli`, `create-gato-app`)

- Workflow `.github/workflows/publish-packages.yml` publikuje na tag ustawiony przez człowieka: `gato-cli@<x.y.z>` albo
  `create-gato-app@<x.y.z>`, przez npm trusted publishing (OIDC, bez sekretu `NPM_TOKEN`) z `--provenance`. Tag musi
  wskazywać commit na `main`, w którym `version` pakietu równa się wersji z tagu.
- Workflow publikuje przez `npm stage publish` (staged), bo trusted publisher pakietu ma uprawnienie „npm stage publish”;
  zwykłe `npm publish` z OIDC kończy się 403 „OIDC permission denied for this action”.
- Tag nie może wskazywać commitu wydania `chore(release): … [skip ci]`: GitHub nie uruchamia wtedy workflow. Wskaż commit
  merge'a PR z daną wersją pakietu (`git tag gato-cli@<v> <sha> && git push origin gato-cli@<v>`).
- **Kolejność:** gdy zmieniają się oba, najpierw `gato-cli` (tag, publikacja, zatwierdzenie na npmjs.com), dopiero potem
  `create-gato-app`. Workflow odmawia publikacji `create-gato-app`, dopóki przypięta wersja `gato-cli` nie jest dostępna
  w rejestrze.
- **Staged publishing** (konto Patryka): publikacja czeka na zatwierdzenie na npmjs.com, a do tego czasu rejestr serwuje
  tylko zaślepkę `0.0.0-stage`. Runbook wydania:
  1. Push tagu → job `publish` publikuje wersję (staged).
  2. Patryk zatwierdza ją na npmjs.com: menu profilu → „Staged Packages”
     (`https://www.npmjs.com/settings/<login>/staged-packages`) → wersja → „Approve”. Albo w terminalu z npm 11:
     `npx npm@11 stage approve <staged-id>` (id jest w logu joba `publish`: „staged with id …”). Wersja zatwierdzona
     w przeglądarce znika z listy, więc `stage approve` zwraca potem 404.
     Zaraz po publikacji npm automatycznie sprawdza paczkę (żółta ramka „Validating”, przycisk „Approve”
     nieaktywny); zatwierdzenie jest możliwe dopiero po kilku minutach.
  3. Job `confirm` czeka do 10 minut, aż `npm view <pakiet>@<v> version` zwróci `<v>`, a `dist-tags.latest` wskaże `<v>`.
     Po dłuższym czasie: „Re-run failed jobs” albo ręcznie „Run workflow” z polem `tag` (np. `gato-cli@0.2.0`).
  - Publikacja przez trusted publishing jest staged (sprawdzone przy `gato-cli` 0.2.2 i `create-gato-app` 0.1.1,
    2026-11-23). Gdy zatwierdzenie przyjdzie po 10 minutach, job `confirm` pada: uruchom ręcznie „Run workflow”
    z polem `tag`.
  - Zaślepka `0.0.0-stage` zostaje na liście wersji; `latest` przechodzi na pierwsze prawdziwe wydanie.
- **Jednorazowa konfiguracja na npmjs.com** (Patryk, dla `gato-cli` i dla `create-gato-app`):
  1. npmjs.com → zaloguj się → avatar → „Packages” → pakiet → „Settings”.
  2. Sekcja „Trusted Publisher” → „GitHub Actions”: Organization or user `webamigos`, Repository `gatojs`,
     Workflow filename `publish-packages.yml`, Environment puste → zapisz („Set up connection”).
  3. Po pierwszej udanej publikacji z CI: w „Publishing access” wybierz „Require two-factor authentication and disallow
     tokens”, żeby publikować dało się tylko z workflow albo z 2FA.
  4. Drugi właściciel obu nazw (decyzja Patryka), żeby zatwierdzenie nie zależało od jednego konta:
     `npm owner add <login> gato-cli` i `npm owner add <login> create-gato-app`.

## Moduły i manifest

- Zmieniasz pliki modułu: podbij jego `version` w manifeście (`kit/modules/<x>.json`).
- Zmieniasz kontrakt, który czyta CLI (schemat `.wa/kit.json` albo manifestu, regiony `wa:*`, układ plików generowanych,
  słownik hashy jak `managed`/`seed`): podbij `kitFormat` w `kit/kit.json` i dopisz nową wartość do `SUPPORTED_KIT_FORMATS`
  w `packages/gato-cli/src/kit/kit-format.ts` ([ADR-59](../docs/adrs/59-gato-files-are-protected-and-ejected-with-a-reason.md)).
  Projekt bez pola to format 1. Wypełnienie listy (`seedFiles`, `managedFiles`) nie zmienia formatu.
- Plik, który projekt dostaje raz i potem zmienia jak własny (`README.md`, `src/theme.css`), to wpis w `seedFiles`
  w `kit/kit.json` (hash `"seed"`: `wa update`, `doctor --files` i hook `protect-gato-files.mjs` go pomijają), nigdy wyjątek
  w ochronie plików. Plik nadal potrzebuje właściciela w `files` modułu.
- Moduł kitu nie zmienia plików rdzenia w swoich commitach. Zmianę rdzenia, której moduł wymaga (szew w `src/shared/`,
  `src/test/integration/setup-env.ts`, `e2e/env.ts`, `mutation-gate.json`, `stryker.integration.config.json`), rób
  osobnym commitem z podbiciem `version` w `kit/modules/core.json`; projekt dostaje ją z rdzeniem także bez modułu.
- `kit/modules/*.json` opisują moduły (pliki, schemat, env); `kit/kit.json` opisuje stan kitu. Oba są źródłem dla generatora i projektów.

## Dependabot PRs

- Dependabot updates `package.json` and `package-lock.json` only, but the module manifests pin the same versions, so the
  ownership check (`dependencyMismatch`) and the `kit sync` diff stay red until the manifests follow.
- Fix on the PR branch: `npm ci && npx tsx scripts/kit/sync-manifest-deps.ts`, then
  `git commit -am "chore(kit): sync manifests with the dependency bumps"` and push. The script copies every root version
  into the owning manifest (same section), bumps each changed module's `version` by a patch once, then runs
  `wa generate` and `wa kit sync`. A second run changes nothing.
- The bump is decided against `git merge-base origin/main HEAD` (`--base <ref>` for another base): a module whose
  `version` already differs from the merge base is not bumped again. A workspace package a module owns
  (`packages/env/**`, `packages/observability/**` in core) bumps its owner when its dependency pins changed; the script
  never edits workspace `package.json` files and warns when one still pins the old version.
- CI: job `dependabot-manifests` in `kit.yml` runs `--check` on PRs opened by `dependabot[bot]` and prints the exact
  command. It is read-only on purpose: no write-back, no secret, `npm ci --ignore-scripts`.
- The script lives in `scripts/kit/` (kit-only, `kitOnly` in `kit/kit.json`) and has no root `npm run` entry, because the
  root `package.json` is copied into projects.

## Składanie i wydanie

- Job `assemble` w `.github/workflows/kit.yml` składa projekt z kitu (`wa create`) dla każdej kombinacji modułów z macierzy `combo` i uruchamia w nim `verify`, testy integracyjne oraz `docker build`. Nowy moduł kitu dopisz do macierzy.
- Workflow `.github/workflows/docker-platforms.yml` buduje obraz z `Dockerfile` natywnie na amd64 (`ubuntu-latest`) i arm64 (`ubuntu-24.04-arm`) i uruchamia w nim `prisma --version`, bo silniki Prismy są per architektura. Zmiana `Dockerfile`, `.dockerignore` albo zależności go uruchamia.
- Fixture modułu projektu (`packages/gato-cli/src/__tests__/fixtures/project-module/`) jest używane przez `assemble`; zmiana kontraktu `projectModules` wymaga jego aktualizacji.
- Fixture `invoices` (`packages/gato-cli/src/__tests__/fixtures/invoices-module/`, manifest w `manifest.json`) to test kontraktu punktów rozszerzeń: `assemble` dla kombinacji `uploads` i `all` kopiuje go do projektu, uruchamia `generate`, migrację, `doctor --files` (bez zmienionych plików Gato), testy jednostkowe i integracyjne fixture'u oraz `build`. Zmiana albo usunięcie klucza `stable`, którego używa (`dashboard.sections`, `uploads.delete`, `organizations.member-removed`, `dashboard.home`), wymaga aktualizacji fixture'u w tym samym PR.
- Wydanie robi semantic-release (`.github/workflows/release.yml`, paczka `kit/release/`, [ADR-54](../docs/adrs/54-kit-releases-are-cut-by-semantic-release.md)) z Conventional Commits przy każdym pushu na `main`: `feat` → minor, `fix`/`perf` → patch, breaking poniżej 1.0 → minor, `[no release]` w temacie → bez wydania. Zapisuje wersję w `kit/kit.json`, uruchamia `kit sync`, commituje `chore(release): <wersja> [skip ci]` i ustawia tag `v<wersja>` na tym commicie.
- Po wydaniu `release.yml` wywołuje `.github/workflows/docker-publish.yml` (`workflow_call`) z wydaną wersją i publikuje obraz `ghcr.io/webamigos/gatojs` (`X.Y.Z`, `X.Y`, `latest`); sam tag `v<wersja>` niczego nie uruchamia, bo wskazuje commit `[skip ci]` ([ADR-67](../docs/adrs/67-projects-publish-their-own-multi-arch-image.md)).
- `version` w `kit/kit.json` (i `kitVersion` w `.wa/kit.json`) zmienia tylko wydanie; nie edytuj ich ręcznie. `version` zmienionych modułów w `kit/modules/*.json` podbijasz ręcznie, potem `npm run wa -- kit sync`.
- Paczka `kit/release/`: `npm ci --prefix kit/release`, testy `npm test --prefix kit/release` (job `release-scripts` w `kit.yml`). Nie dodawaj semantic-release do root `package.json`: trafiłby do projektów.
- Opis dla użytkowników CLI: `kit/README.md`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues of `webamigos/wa-kit` (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root (created lazily), decisions as ADR files in `docs/adrs/` (new ones from ADR-53; D01–D52 stay in `docs/decyzje.md` until the English migration). See `docs/agents/domain.md`.

## Decisions and lessons

- A new decision is an ADR file in `docs/adrs/NN-<decision-as-a-title>.md`, in English, from `docs/adrs/TEMPLATE.md`, with the next free number (from 53). Format and numbering: `docs/adrs/README.md`. Do not append new entries to `docs/decyzje.md`.
- Before nontrivial work, skim the titles in `docs/lessons.md` for the area you touch and read the matching lessons.
- After a nontrivial correction or a non-obvious gotcha, add or extend a lesson in `docs/lessons/` and its line in `docs/lessons.md` (format in that file).
