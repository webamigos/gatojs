---
name: wa-upgrade-dependency
description: Podbicie zależności npm w projekcie wa-kit albo w samym kicie, szczególnie bibliotek z własnymi tabelami (better-auth, Prisma) i Next.js. Użyj przy aktualizacji pakietu, alertach `npm audit` lub dependabota. Wyzwalacze - "podbij zależność", "zaktualizuj pakiet", "nowa wersja better-auth", "aktualizacja Next.js", "npm audit", "upgrade dependency", "bump package", "update Next.js", "update Prisma".
---

# Podbicie zależności

Lekcja z Ragena: better-auth 1.4 → 1.7 przeszło testy jednostkowe i build, a zepsuło logowanie. Złapały to dopiero testy e2e. Bramką podbicia są e2e, nie `npm run verify`.

## Kolejność

1. **Changelog** od obecnej wersji do docelowej: zmiany łamiące, migracje schematu, wymagane wersje Node i zależności równoległych.
2. **Podbicie** jednej biblioteki (albo jednej rodziny, np. `prisma` z `@prisma/client` i `@prisma/adapter-pg`) na commit. `npm install <pakiet>@<wersja>` z lockfile.
3. `npm run verify`.
4. `npm run test:integration` (baza `*_test`, lokalnie `docker compose up -d db`).
5. `npm run test:e2e` (wymaga `docker compose up -d`). Prisma odmawia agentowi resetu bazy bez zgody użytkownika, więc e2e uruchamia człowiek albo agent po jego wyraźnej zgodzie.
6. Bezpieczeństwo: `npm audit`.

## Biblioteki z własnymi tabelami

**better-auth** ma tabele w `prisma/schema/auth.prisma` i `prisma/schema/organizations.prisma`, konfigurację w `src/shared/lib/auth/` i pluginy `admin` oraz `organization`.

- Sprawdź w changelogu nowe i zmienione pola modeli. Zmiana schematu wymaga migracji: `npx prisma migrate dev --name <nazwa>`, potem `npm run db:generate`.
- Regionów `wa:relations` nie zmieniasz ręcznie. Relacje modułów pochodzą z `schemaRelations` w manifestach i wpisuje je `npm run wa -- generate`.
- Hook `before` na `/admin/*` (ochrona konta `superadmin`) porównuje ścieżki endpointów better-auth z listą `ADMIN_TARGET_PATHS` (`src/shared/lib/auth/admin-access.ts`). Zmiana ścieżek w nowej wersji wyłącza ochronę po cichu: porównaj listę z endpointami pluginu `admin`.
- e2e (`e2e/core-auth.spec.ts`, `e2e/multi-org.spec.ts`) sprawdzają zaproszenie i logowanie, rejestrację z bramką i bez niej oraz reset hasła. Impersonacji i akcji admina e2e nie obejmują: sprawdź je ręcznie albo testami integracyjnymi.

**Prisma**: po podbiciu `npm run db:generate`, `npx tsc --noEmit`, `npm run test:integration`. Sprawdź, czy `npx prisma migrate dev` nie tworzy pustej albo niespodziewanej migracji.

## Next.js

- Podbicie przez codemod: `npx @next/codemod@latest upgrade <wersja>`, potem przegląd diffu.
- `next dev` uruchomione przez agenta może dopisać blok do `AGENTS.md`. Nie commituj go: `git restore AGENTS.md`.
- e2e działają na serwerze standalone (`node .next/standalone/server.js`), więc zmiany w buildzie wyjdą dopiero tam.

## Kit czy projekt

- **W projekcie:** podbicie jest zmianą lokalną. Żadne narzędzie nie przenosi poprawek z kitu do istniejącego projektu. Jeśli podbicie wymaga poprawki kodu, który przyda się innym projektom, wyślij ją jako PR do repo `webamigos/wa-kit`.
- **W kicie:** każda zależność ma właściciela w manifeście `kit/modules/<x>.json`. Zmień wersję w `package.json` (z lockfile) i w manifeście właściciela w tej samej sekcji, podbij `version` modułu, uruchom `npm run wa -- kit sync`. Test własności w bramce CLI zatrzyma zapomniany manifest. Opis: `docs/16b-rozwoj-kitu.md` w repo `webamigos/wa-kit`.

## Raport

Wersja przed i po, zmiany łamiące z changelogu i co z nimi zrobiono, wyniki `verify`, testów integracyjnych i e2e (albo jawnie „e2e nieuruchomione”), wynik `npm audit`.
