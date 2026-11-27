---
name: wa-new-module
description: Nowa funkcja w projekcie wa-kit (moduł projektu w `projectModules`) albo nowy moduł kitu. Prowadzi przez `defineModule`, manifest, `wa generate`, schemat i migrację, testy izolacji organizacji. Wyzwalacze - "nowy moduł", "nowa funkcja", "dodaj feature", "nowa sekcja aplikacji", "nowy model w bazie", "new module", "new feature", "add a feature", "scaffold module".
---

# Nowa funkcja albo moduł

Pełny przebieg na przykładzie `notes`: `docs/09-nowy-modul.md` i `docs/09b-implementacja-i-bramki.md` w repo `webamigos/wa-kit`.

## 1. Funkcja projektu czy moduł kitu

- **Funkcja projektu** (domyślnie): kod tylko dla tego klienta. Wpis w `projectModules` w `.wa/kit.json`, sam `manifest`, bez wersji i hashy. `wa kit sync` go nie rusza.
- **Moduł kitu**: funkcja potrzebna wielu projektom. Powstaje w repo `webamigos/wa-kit` jako `kit/modules/<x>.json`, z wersją i właścicielem każdego pliku i zależności (`docs/16b-rozwoj-kitu.md` w repo `webamigos/wa-kit`).

Moduł nie edytuje plików rdzenia w żadnym z wariantów. Zmianę zachowania rdzenia (slot, podmiana komponentu, zdarzenie, hook komendy, konfiguracja) robisz przez punkty z `EXTENSION_POINTS.md`, według skilla `gato-extend` (`.claude/skills/gato-extend/SKILL.md`). Własne punkty modułu (id nawigacji, sloty, zdarzenia, komendy, uprawnienia) opisujesz w `src/features/<x>/extension-points.json` i uruchamiasz `npm run wa -- generate`.

## 2. Kroki

1. **Katalog i definicja:** `src/features/<x>/module.ts` z `export default defineModule({...})`, teksty w `src/features/<x>/i18n/<locale>.json` dla każdego języka z `locales` w `.wa/kit.json`. Opcjonalnie `src/features/<x>/env.ts` (`envSchema`), `src/features/<x>/auth.ts` i `src/features/<x>/auth-client.ts`.
2. **Wpis w `projectModules`:** klucz równy `manifest.name`, `files` z wzorcem `src/features/<x>/**`. Bez wpisu `npm run wa -- generate` pisze `Bez zmian`, a funkcja nie trafia do rejestru.
3. `npm run wa -- generate`. Plików generowanych ani regionów `wa:*` nie poprawiasz ręcznie.
4. **Schemat:** model w osobnym pliku `prisma/schema/<x>.prisma`, z wymaganym `organizationId`, indeksem `@@index([organizationId])` i relacją do `Organization` z `onDelete: Cascade`. Pole wsteczne w `Organization` (albo `User`) deklarujesz w `schemaRelations` manifestu, a wpisuje je generator. Model ze skalarnym `organizationId` jest automatycznie objęty guardem organizacji: zapytanie bez filtra `organizationId` rzuca `TenantScopeError`.
5. **Migracja:** `npx prisma migrate dev --name <nazwa>`, potem `npm run db:generate` (`migrate dev` nie generuje klienta). Katalog migracji commituje projekt, kit nie commituje migracji.
6. **Kontrakty:** typy i schematy Zod w `contracts/`.
7. **Testy, implementacja i bramki:** skill `gato-task` (`.claude/skills/gato-task/SKILL.md`): plan z sekcjami „Zachowania” i „Mutacje do zabicia”, testy od `test-writer` przed kodem, implementacja z zablokowanymi testami, `test-reviewer` z mutacjami, bramki. Dla modułu dochodzi:
   - każde query i komenda ma test izolacji na prawdziwej bazie (`*.integration.test.ts`, pomocniki w `src/test/integration/`): dwie organizacje, odczyt i zapis z kontekstem jednej nie dotyka drugiej;
   - query w `services/queries/` po `getOrgContext()` albo `requireModuleAccess(key)`, z filtrem `organizationId`;
   - komenda w `services/commands/` z `"use server"`, sygnatura `(input: unknown, confirmation?: unknown)`, `assertServiceModeConfirmed(context, confirmation)` przed Prismą, wynik `OperationResult<T>`;
   - albo komenda przez `defineCommand` z `src/shared/lib/commands/define-command.ts`, gdy inne moduły mają ją móc zatrzymać hookiem `before`: eksport `(input, confirmation?)` zwraca `runCommand(komenda, input, confirmation)` wprost, a klucz komendy (`<x>.<nazwa>`) trafia do `commands` w `module.ts` ([docs/06-wzorce-kodu.md](../../../docs/06-wzorce-kodu.md#define-command), ADR-62);
   - komponent woła komendę przez `useServiceModeAction().run`;
   - strona w `src/app/[locale]/(app)/<x>/` chroniona `requireModuleAccess(key)`.

## 3. Pułapki

- Prisma zgłasza brak relacji zwrotnej i proponuje `prisma format` albo ręczną edycję. Nie rób żadnego z nich: dodaj `schemaRelations` i uruchom `npm run wa -- generate`.
- Brak `npm run db:generate` po migracji: TypeScript nie zna modelu (`Property '<x>' does not exist on type 'PrismaClient'`).
- Odczyt między organizacjami tylko przez `withoutTenantScope(reason, fn)` z powodem. Zwykle oznacza to brakujący filtr, nie potrzebę wyjątku.
- Trasa API (`src/app/**/route.ts`) albo plik z `"use server"` w `src/app/` poza wzorcami `files` żadnego modułu (poza `core`), także własna trasa projektu, nie ma modułu: `src/__tests__/architecture/module-entry-points-check-enabled.test.ts` zgłasza każdą jej metodę (`<ścieżka>#GET`), bo guard nie ma klucza. Naprawa: dopisz katalog trasy do `files` wpisu (na przykład `src/app/api/<x>/**`) i zacznij każdą metodę od `if (!isModuleEnabled("<x>"))` z odpowiedzią 404 albo od `await requireModuleAccess("<x>")`. Mapy `ALLOWED` w teście rdzenia nie zmieniasz.
- `src/__tests__/server-entrypoints-guard.test.ts` jest składniowy: nie widzi kontekstu ani Prismy w serwisie z innego pliku. Wołaj guard i assert w samej akcji.
- Testy rdzenia porównują rejestr tylko z modułami rdzenia (`src/test/core-modules.ts`), więc nowa funkcja nie wymaga zmiany testów rdzenia. Jeśli test rdzenia pada, szukaj błędu w funkcji.
