---
name: wa-code-review
description: Recenzja zmiany w projekcie wa-kit pod kątem niezmienników, których `npm run verify` nie sprawdzi (organizacje, tryb serwisowy, pliki generowane, testy, i18n). Użyj przed oddaniem pracy, przed commitem i przy pull requeście. Wyzwalacze - "zrób review", "sprawdź zmianę", "recenzja", "przejrzyj diff", "code review", "review my changes", "check this diff", "is this ready to merge".
---

# Recenzja zmiany w projekcie wa-kit

Najpierw bramka, potem to, czego bramka nie widzi. Punkty są ułożone od tego, co psuje się najczęściej i kosztuje najwięcej.

## 1. Bramka

Uruchom `npm run verify` (lint → typecheck → test → build → test hooków). Czerwona bramka kończy recenzję: zgłoś wynik z wyjściem komendy.

Zakres zmiany: `git diff main...HEAD --stat`, potem diff każdego pliku.

## 2. Dane i organizacje

- Każde query i komenda na danych domenowych bierze organizację z `getOrgContext()` (`src/shared/lib/auth/org-context.ts`) albo `requireModuleAccess(key)` (`src/shared/lib/auth/require-module-access.ts`) i filtruje po `organizationId` w `where`. Organizacja z wejścia od użytkownika to błąd.
- Strona modułu woła `requireModuleAccess(key)`. Ukryta pozycja w nawigacji nie chroni strony.
- Akcja serwerowa sama sprawdza uprawnienia, bo jest osobnym endpointem POST.
- `withoutTenantScope(reason, fn)` tylko dla świadomego odczytu między organizacjami (np. wyszukanie po haszu klucza, zanim organizacja jest znana), z niepustym `reason`, który mówi dlaczego. Użycie, żeby „przeszło”, to błąd: brakuje filtra.
- Nowe query albo komenda ma test izolacji na prawdziwej bazie: dwie organizacje, odczyt i zapis z kontekstem jednej nie dotyka drugiej.

## 3. Tryb serwisowy

- Komenda na danych organizacji ma sygnaturę `(input: unknown, confirmation?: unknown)` i zaraz po `getOrgContext()`/`requireModuleAccess()` woła `assertServiceModeConfirmed(context, confirmation)` (`src/shared/lib/auth/service-mode.ts`), przed pierwszym dostępem do Prismy.
- UI woła komendę przez `useServiceModeAction().run(command, input)` (`src/shared/components/service-mode/use-service-mode-action.tsx`) i renderuje `dialog`. Zapis przez `fetch` bierze potwierdzenie z `requestConfirmation()`. Moduł nie pisze własnego dialogu.
- Komenda wołana z UI bezpośrednio przechodzi wszystkie testy, a w trybie serwisowym kończy się błędem. Sprawdź każde wywołanie komendy w komponentach.

## 4. Pliki generowane i granice modułów

- `src/modules.generated.ts`, `src/modules.client.generated.ts` i regiony `wa:*:start/end` nie są edytowane ręcznie. Po zmianie modułu: `npm run wa -- generate` i brak diffu w tych plikach.
- Moduł nie zmienia plików rdzenia. Relacja do `User` lub `Organization` idzie przez `schemaRelations` w manifeście, nie przez edycję `prisma/schema/auth.prisma` czy `prisma/schema/organizations.prisma`.
- Nowa funkcja projektu ma wpis w `projectModules` w `.wa/kit.json`.

## 5. Testy

- Testy pisał inny agent niż kod (`test-writer`), przed implementacją. Implementer nie zmieniał testów: porównaj diff `__tests__/`, `*.test.*` i `e2e/` z planem.
- Wartość oczekiwana to literał albo wartość ze specyfikacji, nigdy wynik kodu produkcyjnego ani kopia jego algorytmu.
- Mock tylko I/O. Moduł z testowaną regułą bezpieczeństwa nie jest mockowany.
- Granice mają testy negatywne: złe wejście, brak sesji, cudza organizacja, za niska rola.
- Nowe wpisy `allowed` w `mutation-gate.json` dopisuje i zatwierdza człowiek. Wpis dodany przez agenta zgłoś jako błąd.
- Próg Strykera w `stryker.config.json` nie spada, a wyjątki od mutacji są w `mutate`, nie w komentarzu `// Stryker disable`.

## 6. Kod

- Bez komentarzy w plikach `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` poza `// WHY:` (najwyżej 3 linie) i dyrektywami narzędzi. Hook łapie tylko edycje przez `Edit`/`Write`; zapis przez powłokę omija go.
- `name` klasy błędu ustawiony napisem (`name = "KeyLimitError"`), nie przez `this.constructor.name`.
- Wejście z zewnątrz walidowane Zod, schemat w `contracts/`. Akcja zwraca `OperationResult<T>` i obsługuje błędy przez `handleCommandError()` (`src/shared/utils/error-handling.ts`).
- Prisma tylko w `services/`, nigdy w komponentach, `page.tsx`, `layout.tsx` ani route handlerach.
- Bez `any`, zagnieżdżonych ternary i cichych `catch {}`.

## 7. i18n

- Każdy nowy klucz jest w każdym języku projektu (`locales` w `.wa/kit.json`): `src/app/messages/<locale>.json` albo `src/features/<x>/i18n/<locale>.json`, z tym samym kształtem.
- Tekst widoczny dla użytkownika nie jest wpisany na stałe w komponencie.

## 8. Wynik

Lista uwag od najpoważniejszej: plik i linia, co jest źle, jaki scenariusz to psuje. Osobno rzeczy niesprawdzone (np. e2e nieuruchomione).
