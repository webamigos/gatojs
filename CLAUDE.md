# CLAUDE.md

Twarde reguły tego repozytorium. Pełne instrukcje: @AGENTS.md

## Pochodzenie kodu

Kod rdzenia i modułów pochodzi z wa-kit (`.wa/kit.json`); poprawki ogólne zgłaszaj do repo `webamigos/wa-kit`.

## Dane

Zapytania do danych domenowych zawsze przez `getOrgContext()` i filtr `organizationId`.

- `getOrgContext()` z `src/shared/lib/auth/org-context.ts` — nie czytaj `activeOrganizationId` z sesji samodzielnie.
- Strony modułów chroni `requireModuleAccess(key)`; akcje serwerowe sprawdzają uprawnienia same.
- Komendy na danych organizacji: `(input, confirmation?)`, po `getOrgContext()`/`requireModuleAccess()` wołają
  `assertServiceModeConfirmed(context, confirmation)` przed Prismą; UI woła je przez `useServiceModeAction().run`.

## Bez komentarzy w kodzie

- W plikach `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` nie piszemy komentarzy; kod ma się tłumaczyć nazwami.
- Dozwolone wyłącznie `// WHY: …` (maks. 3 linie) dla nieoczywistego powodu oraz dyrektywy narzędzi
  (`@ts-expect-error`, `eslint-disable…`, `@vitest-environment`, `prettier-ignore`, shebang).
- Hook `.claude/hooks/block-comments.mjs` blokuje pozostałe komentarze.

## Pliki generowane

- Nie edytuj `src/modules.generated.ts`, `src/modules.client.generated.ts` ani regionów `wa:*:start/end`.
  Uruchom `npm run build -w @wa-kit/cli && npm run wa -- generate`.
- Moduł nie edytuje plików rdzenia.

## Testy

- Testy zadania pisze inny agent (`test-writer`) niż kod, przed implementacją; implementer ich nie zmienia
  (`.superpowers/phase` = `implement` włącza hook `.claude/hooks/protect-tests.mjs`).
- Wartość oczekiwana to literał albo wartość ze specyfikacji, nigdy wynik kodu produkcyjnego.
- Recenzent (`test-reviewer`) uruchamia `npm run test:mutation:task -- <pliki>` i `npm run test:mutation:gate`;
  przeżyły mutant w pliku krytycznym bez wpisu w `mutation-gate.json` blokuje zadanie. Wpisy dopisuje człowiek.

## Bramka

`npm run verify` przed oddaniem pracy. Commity: Conventional Commits, temat małymi literami.
