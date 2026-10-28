# Plan 1 (rdzeń): audyt testów metodami adwersarialnymi

Data: 2026-10-27. Commit: `50a4d9e` (gałąź `refactor/app-url`). Metody pochodzą z
`2026-10-27-adversarial-testing-research.md`.
Audyt działał w tymczasowym worktree (detached HEAD). W repo nie zmieniono kodu, testów ani zależności.
Worktree został usunięty.

## Co uruchomiono

1. **Stryker 10.1.1** z `vitest-runner` i `typescript-checker`. Mutacje objęły logikę bez komponentów UI:
   `src/shared/lib/**`, `src/shared/utils/**`, `src/features/**/services/**`, `src/features/**/contracts/**`,
   `src/i18n/**`, `src/app/api/**` i `scripts/lib/**`. Pliki `prisma.ts` i `logger.ts` wyłączono.
   Jeden przebieg trwał około 12 minut na 8 rdzeniach.
2. **fast-check i testy wrogich wejść**: 15 testów na czystych funkcjach (slug, merge i18n, regiony CLI,
   `readBodyString`, `canAccessModule`, schemat env). Wartości oczekiwane wzięto ze specyfikacji, nie z kodu.
3. **Ręczna analiza obejść** guardu single-org w better-auth: warianty URL i kompletność listy endpointów.

Bazowo przechodzi 236 testów w 38 plikach.

## Wynik Strykera

| | |
|---|---|
| Mutanty | 996 (426 odrzucone przez TS) |
| Zabite | 409 |
| Przeżyły | 125 |
| Bez pokrycia | 36 |
| **Mutation score** | **71,75%** (76,59% w kodzie pokrytym) |

Pliki z wynikiem 100%: `permissions.ts`, `require-module-access.ts`, `roles.ts`, `merge-messages.ts`,
`member-commands.ts`, `organization-commands.ts`, `change-password-command.ts`, `signup-policy.ts`,
`user-account-queries.ts`.

Najsłabsze pliki: `organization-queries.ts` (0%), `helpers.ts` (0%), `error-handling.ts` (29%),
`mailer.ts` (38%), `single-org-guard.ts` (44%), `invite-user-command.ts` (54%), `auth.schemas.ts` (61%),
`org-context.ts` (64%).

## Znaleziska — luki w testach (kod może być poprawny, ale nic go nie pilnuje)

Kolejność według ryzyka.

### W1 [wysokie] Sprawdzenie roli admina w `getAdminUserOrNull` nie ma żadnego testu
`src/shared/lib/auth/helpers.ts:28`. Mutant `user.role === ADMIN ? user : null` → `true` jest
**bez pokrycia**. `invite-user-command` i `user-account-queries` używają tej funkcji, a ich testy mockują
`helpers`. W efekcie regresja, w której każdy zalogowany użytkownik zaprasza innych i widzi listę
użytkowników, przechodzi wszystkie testy. To wzorzec „over-mocking” z raportu badawczego.
**Test do dodania:** test `getAdminUserOrNull` z sesją `role: "user"` → `null`, z `role: "admin"` → user;
w `invite-user-command` mock na poziomie `auth.api.getSession`, nie całego `helpers`.

### W2 [wysokie] Guard single-org: 13 z 15 ścieżek można usunąć bez czerwonego testu
`src/shared/lib/auth/single-org-guard.ts:5-19`. Przeżywa usunięcie m.in. `/organization/update-member-role`,
`/organization/delete`, `/organization/update`, `/organization/cancel-invitation` i ścieżek ról/zespołów.
Testy sprawdzają tylko `invite-member` i `remove-member`. Usunięcie `update-member-role` pozwoliłoby
adminowi organizacji (nie globalnemu) zmieniać role w trybie single-org.
**Test do dodania:** `it.each` po całej liście oraz test kompletności. Test kompletności wylicza
mutujące endpointy z `organization({ teams, dynamicAccessControl }).endpoints` i wymaga, by każdy
spoza listy dozwolonych dla użytkownika (`accept-invitation`, `reject-invitation`, `leave`, `set-active`,
`set-active-team`, `check-slug`, `has-permission`) był w guardzie. Taki test złapie nowy endpoint po
aktualizacji better-auth.
*Sprawdzone, nie jest dziurą:* hook dostaje `ctx.path = endpoint.path` (`better-auth/dist/api/dispatch.mjs`),
a nie surowy URL. Warianty ze slashem lub kodowaniem nie omijają guardu. Dziś lista obejmuje wszystkie
administracyjne endpointy better-auth.

### W3 [wysokie] Zaproszenie mogłoby być wystawiane jako już wygasłe
`src/features/users/services/commands/invite-user-command.ts:56` i `:18`. Mutanty `Date.now() - TTL` oraz
`48 / 60` (TTL ≈ 0) przeżywają. Testy nie sprawdzają `expiresAt`.
**Test do dodania:** zamrożony czas (`vi.useFakeTimers`) i asercja `expiresAt === now + 48h` jako literał.

### W4 [średnie] Odświeżanie sesji z pominięciem cookie cache nie ma testu
`src/shared/lib/auth/org-context.ts:25`. To poprawka z komentarzem `WHY`, a jej usunięcie przeżywa.
Narusza to regułę „bugfix = test, który bez poprawki nie przechodzi”.
**Test do dodania:** pierwsze `getSession` zwraca sesję bez `activeOrganizationId`, a drugie (z
`disableCookieCache`) zwraca sesję z organizacją → kontekst ma organizację.

### W5 [niskie] Kontrakt `readBodyString` dla pustego napisu nie ma testu
`src/features/auth/services/signup-gate.ts:9`. Przeżywa mutant `value !== ""` → `true` (wersja pierwsza
raportu błędnie mówiła o nie-stringach, które pokrywają już testy `enforceSignupPolicy`). Dziś wywołujący
traktują `""` jak brak wartości, więc mutant jest równoważny w użyciu; test pilnuje kontraktu funkcji
na wypadek nowego wywołującego.

### W6 [średnie] Schemat env w produkcji: brak testu poprawnej konfiguracji
`src/shared/lib/env.ts:42`. Mutant „produkcja zawsze odrzucona” przeżywa, bo żaden test nie parsuje
poprawnego env produkcyjnego. Przeżywa też `optionalString` (`"" → undefined`) z linii 10: pusty
`SMTP_URL=` w `.env` nie jest testowany.

### W7 [niskie] Brak pokrycia dla reszty
- `organization-queries.ts`: filtr `status: "pending"` i sortowanie są bez testu. Lista członków mogłaby
  pokazywać zaakceptowane i anulowane zaproszenia.
- `auth/index.ts`: `session.create.before` (domyślna aktywna organizacja), `acceptUrl` w
  `sendInvitationEmail` (obcinanie `/`) i `adminRoles`. Pierwszy z nich był już na liście odłożonych.
- `signup-membership-context.ts`: walidacja kontekstu.
- `mailer.ts` (38%) i `error-handling.ts` (29%).
- `canAccessPath`/`moduleForPath` są testowane, ale nieużywane w kodzie produkcyjnym (martwy kod).

## Znaleziska — zachowanie niezgodne z oczekiwaniem (property i wrogie testy)

| # | Funkcja | Wejście | Wynik | Ocena |
|---|---|---|---|---|
| P1 | `coreEnvSchema` | `MULTI_ORG=TRUE` (także `1`, `yes`, ` true`) | po cichu `false` | **średnie**: literówka w Railway wyłącza tryb multi-org bez błędu. Lepiej `z.enum(["true","false"])` albo błąd. |
| P2 | `coreEnvSchema` | `APP_URL=localhost:3000` | akceptowane | **średnie**: linki w mailach (`acceptUrl`, reset) będą zepsute. Lepiej `z.url()`. |
| P3 | `coreEnvSchema` | produkcja, `BETTER_AUTH_SECRET` = 32 spacje | akceptowane | niskie: `.trim()` przed `min(32)`. |
| P4 | `replaceRegion` | body zawiera `wa:modules:end` | następny `generate` rzuca „uszkodzony region” | niskie: walidować body albo zgłaszać błąd już przy zapisie. |
| P5 | `replaceRegion` | plik z CRLF | wstawione linie z `\n`, czyli mieszane końce linii | niskie: dotyczy klientów na Windows. |
| P6 | `mergeMessages` | moduł o kluczu `constructor` / `toString` / `__proto__` | fałszywa „Kolizja namespace i18n” (`key in merged` widzi prototyp) | niskie: `Object.hasOwn(merged, key)`. Prototype pollution nie występuje. |
| P7 | `slugifyOrganizationName` | nazwa o długości 5000 znaków | slug o długości 5009 | niskie: przyciąć bazę (np. 60 znaków). |

Przeszły (brak problemu): slug zawsze pasuje do `^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{8}$` dla dowolnego
Unicode, polskie znaki są transliterowane, dwa slugi tej samej nazwy się nie powtarzają, `replaceRegion`
jest idempotentny i zachowuje tekst poza regionem, `readBodyString` ignoruje klucze prototypu,
`canAccessModule` spełnia oba niezmienniki dostępu (brak roli → brak dostępu; `adminOnly` tylko przez
`multiOrgRoles` w MULTI_ORG).

## Wnioski dla procesu

- Testy planu 1 są mocne tam, gdzie testowano czyste funkcje bez mocków (`permissions`, `roles`, commands).
  Słabe są tam, gdzie test mockuje moduł, który zawiera regułę bezpieczeństwa (W1), albo testuje dwa
  przykłady z listy (W2). Obie klasy wykrywa wyłącznie mutation testing, a recenzent ich nie zauważył.
- Wszystkie wysokie znaleziska to luki w testach, nie potwierdzone błędy w kodzie. Kod dziś działa,
  ale regresja przejdzie przez `verify`.
- Rekomendacja z raportu badawczego się potwierdza: dodać `npm run test:mutation` (incremental) dla
  recenzenta oraz `@fast-check/vitest` dla parserów.

## Artefakty (poza repo, scratchpad sesji)

- Raport HTML Strykera: `/private/tmp/claude-501/-Users-jakubszewczyk-Documents-WebAmigos-wa-kit/eb79e20d-69f0-4200-9dec-92a9df3ce9ca/scratchpad/out/mutation.html`
- Lista przeżyłych mutantów: `/private/tmp/claude-501/-Users-jakubszewczyk-Documents-WebAmigos-wa-kit/eb79e20d-69f0-4200-9dec-92a9df3ce9ca/scratchpad/out/survivors.txt`
- Konfiguracja Strykera: `/private/tmp/claude-501/-Users-jakubszewczyk-Documents-WebAmigos-wa-kit/eb79e20d-69f0-4200-9dec-92a9df3ce9ca/scratchpad/out/stryker.config.json`
- Testy property/wrogie: `/private/tmp/claude-501/-Users-jakubszewczyk-Documents-WebAmigos-wa-kit/eb79e20d-69f0-4200-9dec-92a9df3ce9ca/scratchpad/adversarial.probe.test.ts`

Uwaga: Stryker wymaga instalacji przez npm 11 (npm 10.9 rzuca `Cannot read properties of null (reading 'edgesOut')`, jak w R11).

## Domknięcie W1–W6 (2026-10-27)

Dopisane testy:
- W1: `src/shared/lib/auth/__tests__/helpers.test.ts` (nowy). Testuje `getAdminUserOrNull` na prawdziwym module z mockiem `auth.api.getSession`.
- W2: `single-org-guard.test.ts`. Test kompletności wylicza mutujące endpointy z `organization({ teams, dynamicAccessControl })`,
  każdy poza listą self-service musi wymagać globalnego admina; do tego `assertGlobalAdmin` (403 i komunikat).
- W3: `invite-user-command.test.ts`, `expiresAt` przy zamrożonym czasie = +48 h (literał).
- W4: `org-context.test.ts`, aktywna organizacja w cache → jeden odczyt sesji; brak sesji → jeden odczyt.
- W5: `signup-gate.test.ts`, `readBodyString` dla `""`, nie-stringów i kluczy prototypu.
- W6: `env.test.ts`, poprawny env produkcyjny przechodzi; opcjonalne zmienne z wartością zachowują ją.

Weryfikacja: Stryker na 6 plikach źródłowych w tymczasowym worktree z nowymi testami. Wszystkie wskazane
mutanty są zabite: `helpers.ts` 0% → 100%, `single-org-guard.ts` 44% → 100%, `invite-user-command.ts`
(L18, L56), `org-context.ts` (L25), `signup-gate.ts` (L9), `env.ts` (L10, L42). Łączny wynik tych plików
wynosi 83,01%. Przeżyłe mutanty, które zostały, to teksty komunikatów i logów, `select: { id: true }`
(mutant równoważny) i fallback `?? "Nieprawidłowe dane"`; są poza zakresem W1–W6.
`npm run verify` przechodzi: 303 testy aplikacji, 22 testy CLI, 13 testów hooków.
