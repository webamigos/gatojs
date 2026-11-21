# Harness z Ragena: testy architektury, guard organizacji w runtime, skille i Task Router

Data: 2026-11-21. Research Patryka z agentem. Porównanie harnessu wa-kit z monorepo `ragen-app`.

Źródła:

- `ragen-app/tests/architecture/` (ok. 125 testów zgodności repo), w szczególności `agent-instructions-fit-the-budget.test.ts`, `documented-commands-exist.test.ts`, `i18n-keys-exist-in-every-locale.test.ts`, `env-example-starts-every-app.test.ts`, `the-node-floor-is-one-number.test.ts`, `client-bundles-stay-browser-safe.test.ts`, `an-infra-path-that-is-cited-exists.test.ts`;
- `ragen-app/docs/tenant-scope-guard.md`, ADR-23 i `packages/platform-contracts/src/tenant-scope/`;
- `ragen-app/.claude/skills/` (`ragen-code-review`, `ragen-upgrade-dependency`, `ragen-tenant-scope-audit`) i sekcja „Task Router” w `ragen-app/AGENTS.md`;
- `ragen-app/.claude/settings.json` (allowlista `permissions`).

## 1. Po co

Harness wa-kit dobrze pilnuje, *jak* agent pisze kod i testy: hooki `block-comments` i `protect-tests`, tester inny niż implementer, bramka mutacyjna plików krytycznych. Słabiej pilnuje dwóch innych rzeczy:

- **spójności repo**: czy komendy i ścieżki z instrukcji agenta istnieją, czy klucze i18n są w obu językach, czy `.env.example` przechodzi walidację, czy wersja Node jest jedna;
- **izolacji organizacji w runtime**: `server-entrypoints-guard.test.ts` jest składniowy i ma udokumentowane luki (serwis z innego modułu, helper-metoda, `try/catch`). Zapytanie bez `organizationId` przechodzi, jeśli nie trafi na żaden test izolacji.

Ragen ma na obie rzeczy sprawdzone rozwiązania. Ten spec przenosi je do rdzenia kitu, więc trafiają do każdego projektu przez `wa create` i `wa kit sync`.

Nic nie wraca do Ragena w ramach tej pracy.

## 2. Zakres

Faza 1 (wysoki priorytet), plan [2026-11-21-harness-from-ragen.md](../plans/2026-11-21-harness-from-ragen.md):

1. Testy architektury w rdzeniu (`src/__tests__/architecture/`).
2. Guard organizacji w runtime: rozszerzenie Prismy, które **rzuca błąd** przy zapytaniu bez filtra `organizationId`.
3. Skille projektowe w `.claude/skills/` projektu, „Task Router” w `AGENTS.md` i allowlista `permissions` w `.claude/settings.json`.

Faza 2 (średni priorytet, osobny plan po fazie 1): hook SessionStart dla sesji w chmurze, katalog lessons z indeksem pilnowanym testem, szablon PR, CODEOWNERS i dependabot jako pliki kitu, szablon specu z sekcjami „Zachowania” i „Mutacje do zabicia”.

Poza zakresem: pakiety `packages/*` (env, crypto, observability, eslint-config). To osobny temat z decyzją zastępującą D29.

## 3. Testy architektury

Każdy test działa w projekcie złożonym z dowolnym zestawem modułów (job `assemble` w `kit.yml`), bo jest plikiem rdzenia. Test nie może zależeć od plików z `kitOnly` (`docs/**`, `kit/**`).

| Test | Niezmiennik |
| --- | --- |
| `agent-instructions-fit-the-budget` | `AGENTS.md` ma najwyżej 31 744 bajty (32 KiB limitu Codexa minus 1 KiB zapasu). Codex po cichu ucina instrukcje powyżej `project_doc_max_bytes`. |
| `documented-commands-exist` | Każde `npm run <skrypt>` w `AGENTS.md`, `CLAUDE.md`, `README.md` i `.claude/**/*.md` istnieje w `scripts` w `package.json`. |
| `cited-paths-exist` | Każda ścieżka repo w backtickach albo w linku w `AGENTS.md`, `CLAUDE.md` i `.claude/**/*.md` istnieje. Wzorce z `<x>`, `*` i `**` są dopasowywane globem albo pomijane według reguły z planu. |
| `i18n-keys-exist-in-every-locale` | `src/app/messages/<locale>.json` i każde `src/features/*/i18n/<locale>.json` mają ten sam zbiór kluczy (ścieżek z kropkami) dla każdego locale z `src/i18n/locales.generated.ts`. |
| `env-example-passes-validation` | `checkEnv` z `src/shared/lib/env.ts` przyjmuje `.env.example` (z rejestrem modułów projektu). |
| `node-version-is-one-number` | Major z `.nvmrc` równa się majorowi z `FROM node:<major>` w `Dockerfile`. Żaden workflow nie podaje `node-version:` literałem, tylko `node-version-file: .nvmrc`. |
| `client-bundles-stay-server-free` | Plik z `"use client"` nie importuje (wprost, z kodu źródłowego) `@/shared/lib/prisma`, `@/shared/lib/env`, `@/shared/lib/auth` (poza `client`), `@/generated/prisma/**`, `server-only` ani `node:*`. |

Test, który znajdzie naruszenie w obecnym kodzie, nie dostaje wyjątku: naruszenie poprawia się w tym samym zadaniu. Wyjątek z uzasadnieniem dopuszczalny tylko wtedy, gdy poprawka wymaga zmiany poza zakresem planu. Wtedy zadanie raportuje go człowiekowi.

## 4. Guard organizacji w runtime

### 4.1 Zachowanie

- Rozszerzenie Prismy (`$extends` z `query.$allModels.$allOperations`) w `src/shared/lib/tenant-scope/`. `src/shared/lib/prisma.ts` eksportuje klienta z rozszerzeniem. Ten sam klient trafia do `prismaAdapter` better-auth.
- Modele objęte guardem: każdy model ze skalarnym polem `organizationId` z wyjątkiem `Member` i `Invitation`. Lista pochodzi ze schematu (wygenerowany klient), a nie z ręcznej mapy, bo moduł nie edytuje plików rdzenia. Nowy model modułu z `organizationId` jest objęty guardem bez zmiany rdzenia.
- `Member` i `Invitation` są poza guardem: to tabele better-auth, które adapter czyta po `id`, `userId` i e-mailu, a kod rdzenia legalnie czyta członkostwa jednego użytkownika we wszystkich organizacjach. Izolację tych tabel pilnują dziś testy izolacji i `server-entrypoints-guard`.
- Zapytanie na modelu objętym guardem bez filtra organizacji rzuca `TenantScopeError` (`name = "TenantScopeError"`). Zapytanie nie trafia do bazy. Dotyczy to dev, testów i produkcji. Nie ma trybu ostrzegania.
- `withoutTenantScope(reason, fn)` uruchamia `fn` z wyłączonym guardem (AsyncLocalStorage). `reason` to niepusty napis. Każde wywołanie zapisuje `logger.debug` z modelem, operacją i powodem. Zagnieżdżenie działa, a guard wraca po zakończeniu `fn`, także po błędzie.

### 4.2 Co liczy się jako filtr

Za Ragenem (`docs/tenant-scope-guard.md`), z jedną różnicą: guard rzuca, a nie ostrzega.

- Klucz `organizationId` na najwyższym poziomie `where`, z wartością przypinającą: napis, `{ equals: <napis> }` albo `{ in: [<co najmniej jeden napis>] }`.
- Selektor złożony unikalny, który zawiera `organizationId` (`organizationId_userId: { organizationId, … }`).
- Jeden z elementów `AND` (tablica albo obiekt) spełniający powyższe.
- `OR`, w którym **każda** gałąź spełnia powyższe.
- Nie liczą się: `NOT`, filtry relacji (`organization: { … }`), `{ not }`, `{ notIn }`, `{ equals: undefined }`, `{}`, `undefined`, `null`, pusty napis.
- Zapis: `create` wymaga `data.organizationId` (napis niepusty); `createMany` i `createManyAndReturn` wymagają go w każdym wierszu; `upsert` wymaga filtra w `where` i `create.organizationId`. `organization: { connect }` nie wystarcza.
- Operacje z `where` (`findUnique`, `findUniqueOrThrow`, `findFirst`, `findFirstOrThrow`, `findMany`, `update`, `updateMany`, `updateManyAndReturn`, `delete`, `deleteMany`, `count`, `aggregate`, `groupBy`): filtr w `where`. Brak `where` to brak filtra.
- `$queryRaw`, `$executeRaw` i zapytania przez relację zagnieżdżoną (`include`, zapis zagnieżdżony z modelu nadrzędnego) są poza guardem. To świadome ograniczenie opisane w dokumentacji.

### 4.3 Miejsca, które dziś czytają między organizacjami

- `src/features/api-keys/services/authenticate-api-key.ts`: `apiKey.findUnique` po `hashedKey`. Organizacja jest nieznana przed sprawdzeniem klucza. → `withoutTenantScope("api key lookup by hash", …)`.
- `src/features/uploads/services/read-upload.ts`: `upload.findUnique` po `id`. Plik publiczny jest dostępny dla każdego, a prywatny jest sprawdzany po odczycie. → `withoutTenantScope("upload lookup before visibility check", …)`.
- Pomocniki testów (`src/test/integration/database.ts`, `resetDatabase()`) używają `withoutTenantScope` albo osobnego klienta bez rozszerzenia.

Lista jest wynikiem `grep`. Zadanie guardu uruchamia testy integracyjne i e2e, które znajdą resztę.

### 4.4 Dlaczego od razu `throw`

Ragen zaczął od ostrzeżeń, bo miał ok. 200 miejsc bez audytu. Kit ma kilkanaście zapytań na modelach domenowych i wszystkie filtrują po `organizationId` albo są wymienione w 4.3. Nowy projekt zaczyna więc od stanu czystego, a błąd zamiast ostrzeżenia zatrzymuje pomyłkę w pierwszym teście integracyjnym albo e2e.

## 5. Skille, Task Router i uprawnienia

- `.claude/skills/` w rdzeniu (plik projektu, kopiowany przez `wa create` i aktualizowany przez `wa kit sync`):
  - `wa-code-review`: niezmienniki repo, których `npm run verify` nie sprawdzi (lista w planie);
  - `wa-upgrade-dependency`: podbicie zależności, szczególnie bibliotek z własnymi tabelami (better-auth, Prisma) i Next.js; e2e jako bramka;
  - `wa-new-module`: nowa funkcja projektu (`projectModules`) albo moduł kitu: `defineModule`, manifest, `wa generate`, testy izolacji, guard.
- `AGENTS.md`: sekcja „Task Router” (typ zadania → plik, dokument kitu albo skill) zamiast rozproszonych odsyłaczy. Rozmiar pilnuje test z rozdziału 3.
- `.claude/settings.json`: `permissions.allow` dla komend tylko do odczytu i bramek (`npm run verify`, `lint`, `typecheck`, `test`, `npx vitest run *`, `git status/diff/log/show *`). Bez komend zapisujących do bazy, pushujących i usuwających.

## 6. Decyzje

- D50 · Testy architektury w rdzeniu kitu.
- D51 · Guard organizacji w runtime rzuca błąd; `Member` i `Invitation` poza guardem; `withoutTenantScope` jako jedyne wyjście.
- D52 · Skille projektowe, Task Router i allowlista `permissions` jako pliki rdzenia.

`core` dostaje jedną wersję minor (`0.5.3` → `0.6.0`) przy integracji faz. Moduły `api-keys` i `uploads` dostają wersję patch za zmianę z 4.3.
