# kit/CLAUDE.md

Zasady dla plików tylko kitu (`kit/`, pakiety narzędzi `packages/gato-cli`). Nie trafiają do projektów (`.dockerignore`, własny workflow).

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

## Moduły i manifest

- Zmieniasz pliki modułu: podbij jego `version` w manifeście (`kit/modules/<x>.json`).
- Moduł kitu nie zmienia plików rdzenia w swoich commitach. Zmianę rdzenia, której moduł wymaga (szew w `src/shared/`,
  `src/test/integration/setup-env.ts`, `e2e/env.ts`, `mutation-gate.json`, `stryker.integration.config.json`), rób
  osobnym commitem z podbiciem `version` w `kit/modules/core.json`; projekt dostaje ją z rdzeniem także bez modułu.
- `kit/modules/*.json` opisują moduły (pliki, schemat, env); `kit/kit.json` opisuje stan kitu. Oba są źródłem dla generatora i projektów.

## Składanie i wydanie

- Job `assemble` w `.github/workflows/kit.yml` składa projekt z kitu (`wa create`) dla każdej kombinacji modułów z macierzy `combo` i uruchamia w nim `verify`, testy integracyjne oraz `docker build`. Nowy moduł kitu dopisz do macierzy.
- Fixture modułu projektu (`packages/gato-cli/src/__tests__/fixtures/project-module/`) jest używane przez `assemble`; zmiana kontraktu `projectModules` wymaga jego aktualizacji.
- Wydanie robi semantic-release (`.github/workflows/release.yml`, paczka `kit/release/`, [ADR-54](../docs/adrs/54-kit-releases-are-cut-by-semantic-release.md)) z Conventional Commits przy każdym pushu na `main`: `feat` → minor, `fix`/`perf` → patch, breaking poniżej 1.0 → minor, `[no release]` w temacie → bez wydania. Zapisuje wersję w `kit/kit.json`, uruchamia `kit sync`, commituje `chore(release): <wersja> [skip ci]` i ustawia tag `v<wersja>` na tym commicie.
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
