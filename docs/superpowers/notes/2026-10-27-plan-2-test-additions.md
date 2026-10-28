# Plan 2: uzupełnienia wynikające z systemu testów adwersarialnych

Data: 2026-10-27. Dotyczy `docs/superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md`.
Tego pliku planu nie edytowałem, bo prowadzi go inna sesja. Poniższe punkty trzeba do niego wpisać przed startem SDD.

## Nowe pliki rdzenia na `refactor/app-url` (potrzebują właściciela, D4 / Task 3)

Test własności z Task 3 zgłosi je jako pliki bez właściciela. Wszystkie należą do `core`:

- `stryker.config.json`, `stryker.integration.config.json`, `mutation-gate.json`
- `scripts/mutation-gate.ts`, `scripts/lib/mutation-gate.ts` (+ testy)
- `vitest.integration.config.ts`, `src/test/integration/**`
- `src/__tests__/server-entrypoints-guard.test.ts`
- `.claude/hooks/protect-tests.mjs` (+ test), `.claude/agents/test-writer.md`, `.claude/agents/test-reviewer.md`
- `.github/workflows/mutation.yml`, job `integration` w `.github/workflows/ci.yml`

Nowe devDependencies roota (właściciel `core`, D4): `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`,
`@stryker-mutator/typescript-checker`, `fast-check`, `@fast-check/vitest`.

## Zadania do dopisania

### Do Task 1 (CLI w `kit/cli`)
- `kit/cli` dostaje własny `stryker.config.json` (mutate: `src/**/*.ts` bez testów, `vitest-runner`,
  `typescript-checker`, `incremental`) i skrypty `test:mutation`, `test:mutation:task`. DevDependencies Strykera i
  `fast-check` dochodzą do `kit/cli/package.json` i jego lockfile.
- `mutation-gate.json` dostaje prefiksy krytyczne CLI: `kit/cli/src/generate/`, `kit/cli/src/manifest/`
  oraz kod kopiowania i usuwania plików (`create`, `add`, `remove`). Błąd w nich psuje projekty klientów.
- Bramka kitu: `npm run verify && npm run verify --prefix kit/cli`. W CI dochodzi job mutacji dla `kit/cli`.

### Do Task 9 (macierz składania)
- W wygenerowanym projekcie, po `verify`: `INTEGRATION_DATABASE_URL=…/matrix_test npm run test:integration`.
  Serwis `postgres:16` już jest. Ten test sprawdza, że izolacja organizacji działa w złożonym projekcie, a nie tylko w kicie.
- Asercja, że projekt dostał bramki testowe: `stryker.config.json`, `mutation-gate.json`, hook `protect-tests` i agenci są obecni.

### Proces SDD dla planu 2 (każde zadanie)
- Plan zadania ma sekcje „Zachowania” i „Mutacje do zabicia”. Jakub je zatwierdza przed testerem.
- Kolejność: `test-writer` → commit testów (czerwonych) → `.superpowers/phase = implement` → implementer →
  usunięcie fazy → `test-reviewer` (`test:mutation:task` + `test:mutation:gate`).
- **Kontrola nietkniętych testów:** recenzent uruchamia `git diff --stat <commit-testów>..HEAD -- '**/__tests__/**' '**/*.test.*' 'e2e/**'`.
  Każda zmiana wymaga zgody Jakuba. To twarda bramka, bo hook nie łapie zapisu przez `Bash`.
  Do rozważenia: skrypt `scripts/check-tests-untouched.ts` i krok w CI, który czyta trailer `Tests-Commit:` z PR.
