# kit/CLAUDE.md

Zasady dla plików tylko kitu (`kit/`). Nie trafiają do projektów (`.dockerignore`, własny workflow).

## Bramka kitu

- `npm run verify --prefix kit/cli` (lint → typecheck → testy → build bundla); w CI job `cli` w `.github/workflows/kit.yml`.
- Instalacja: `npm ci --prefix kit/cli` (osobny `kit/cli/package-lock.json`, instaluj przez `npx -y npm@11.21.1 install`).
- Mutacje CLI: `npm run test:mutation:task --prefix kit/cli -- <pliki>` i `npm run test:mutation:gate --prefix kit/cli`;
  wpisy do `kit/cli/mutation-gate.json` dopisuje człowiek.

## Bundel CLI

- Po każdej zmianie w `kit/cli/src` uruchom `npm run build --prefix kit/cli` i zacommituj `.wa/bin/wa.mjs` razem ze zmianą.
- Projekt uruchamia CLI jako `npm run wa -- <komenda>` (`node .wa/bin/wa.mjs`), bez budowania.
- CI sprawdza `git diff --exit-code -- .wa/bin/wa.mjs`: nieaktualny bundel zatrzymuje job.

## Moduły i manifest

- Zmieniasz pliki modułu: podbij jego `version` w manifeście (`kit/modules/<x>.json`).
- Moduł kitu nie zmienia plików rdzenia w swoich commitach. Zmianę rdzenia, której moduł wymaga (szew w `src/shared/`,
  `src/test/integration/setup-env.ts`, `e2e/env.ts`, `mutation-gate.json`, `stryker.integration.config.json`), rób
  osobnym commitem z podbiciem `version` w `kit/modules/core.json`; projekt dostaje ją z rdzeniem także bez modułu.
- `kit/modules/*.json` opisują moduły (pliki, schemat, env); `kit/kit.json` opisuje stan kitu. Oba są źródłem dla generatora i projektów.

## Składanie i wydanie

- Job `assemble` w `.github/workflows/kit.yml` składa projekt z kitu (`wa create`) dla każdej kombinacji modułów z macierzy `combo` i uruchamia w nim `verify`, testy integracyjne oraz `docker build`. Nowy moduł kitu dopisz do macierzy.
- Fixture modułu projektu (`kit/cli/src/__tests__/fixtures/project-module/`) jest używane przez `assemble`; zmiana kontraktu `projectModules` wymaga jego aktualizacji.
- Wydanie: podbij `version` zmienionych modułów, uruchom `npm run wa -- kit sync`, zmerguj do `main`; tag `v<version>` ustawia człowiek.
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
