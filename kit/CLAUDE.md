# kit/CLAUDE.md

Zasady dla plików tylko kitu (`kit/`). Nie trafiają do projektów (`.dockerignore`, własny workflow).

## Bramka kitu

- `npm run verify --prefix kit/cli` (typecheck → testy → build bundla); w CI job `cli` w `.github/workflows/kit.yml`.
- Instalacja: `npm ci --prefix kit/cli` (osobny `kit/cli/package-lock.json`, instaluj przez `npx -y npm@11.21.1 install`).
- Mutacje CLI: `npm run test:mutation:task --prefix kit/cli -- <pliki>` i `npm run test:mutation:gate --prefix kit/cli`;
  wpisy do `kit/cli/mutation-gate.json` dopisuje człowiek.

## Bundel CLI

- Po każdej zmianie w `kit/cli/src` uruchom `npm run build --prefix kit/cli` i zacommituj `.wa/bin/wa.mjs` razem ze zmianą.
- Projekt uruchamia CLI jako `npm run wa -- <komenda>` (`node .wa/bin/wa.mjs`), bez budowania.
- CI sprawdza `git diff --exit-code -- .wa/bin/wa.mjs`: nieaktualny bundel zatrzymuje job.

## Moduły i manifest

- Zmieniasz pliki modułu: podbij jego `version` w manifeście (`kit/modules/<x>.json`).
- `kit/modules/*.json` opisują moduły (pliki, schemat, env); `kit/kit.json` opisuje stan kitu. Oba są źródłem dla generatora i projektów.
