# Moduł `api-keys`: klucze API organizacji

Po przeczytaniu będziesz wiedzieć:

- jaki problem rozwiązuje `api-keys`, czego nie robi i kiedy go nie dodawać;
- jak dodać i usunąć moduł, jak ustawić `API_KEY_PEPPER` i co się stanie po jego zmianie;
- jak wygląda cykl życia klucza: utworzenie, jednorazowe pokazanie sekretu, wygaśnięcie, unieważnienie, usunięcie i limit 10 aktywnych kluczy;
- jaki kontrakt ma `authenticateApiKey`, jakie kody odpowiedzi zwraca i dlaczego trasa z kluczem sama filtruje dane po organizacji;
- jakie szwy i deklaracje ma moduł (`apiScopes`, zdarzenia dziennika, kanał `API`) i co się dzieje bez modułu.

Zweryfikowano z kodem: 007d380, 2026-10-30

Źródła:

- `kit/modules/api-keys.json`
- `prisma/schema/api-keys.prisma`
- `src/features/api-keys/` (`module.ts`, `env.ts`, `components/`, `contracts/`, `services/`, `i18n/`) z testami w `__tests__/`, w tym `__tests__/organization-route.integration.test.ts` i `services/__tests__/api-keys-isolation.integration.test.ts`
- `src/app/api/v1/organization/route.ts`
- `src/app/[locale]/(app)/api-keys/page.tsx`
- `src/shared/lib/modules/define-module.ts`, `src/shared/lib/audit.ts`, `src/shared/utils/error-handling.ts`
- `src/test/integration/setup-env.ts`, `e2e/env.ts`, `.env.example`
- `src/__tests__/server-entrypoints-guard.test.ts`
- `mutation-gate.json`, `.github/workflows/kit.yml`
- [spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md), §6

Jak moduły kitu trafiają do projektu i łączą się z rdzeniem, wyjaśnia [12-moduly-kitu.md](12-moduly-kitu.md#warstwa-szwow); ten plik opisuje tylko `api-keys`. Opis modułu ma dwie części: ten plik (co robi moduł, wymagania, instalacja i usunięcie, konfiguracja peppera, co dodaje do aplikacji, szwy) i [14b-modul-api-keys-uzycie.md](14b-modul-api-keys-uzycie.md) (własna trasa z kluczem, bezpieczeństwo, testowanie, typowe problemy, referencja). Decyzje: [D39](decyzje.md#d39) (deklaracje w `defineModule`), [D43](decyzje.md#d43) (klucze API).

<a id="przebieg"></a>

„(sprawdzone)” znaczy tu, że zachowanie potwierdził przebieg z 2026-10-30: projekt `api-demo` założony z tagu `v0.1.0` z GitHuba komendą `wa create --modules api-keys,audit-logs --locales pl,en --yes`, z bazą w kontenerze Postgresa i z funkcją projektu `deliveries` (wpis w `projectModules`, `"requires": ["api-keys"]`). Funkcja deklaruje zakresy `deliveries:read` i `deliveries:write`, ma trasę `GET` i `POST /api/v1/deliveries` i test integracyjny trasy. Na końcu `npm run verify` i `npm run test:integration` były zielone; trasy wywołano też przez `curl` na zbudowanym serwerze (`node .next/standalone/server.js`, czyli z `NODE_ENV=production`). Fragmenty kodu z tego przebiegu mają nad blokiem ścieżkę pliku w projekcie `api-demo` i dopisek „przykład z przebiegu”.

<a id="co-robi"></a>

## Co robi moduł i kiedy go nie dodawać

Zewnętrzny system (integracja, agent AI, skrypt klienta) ma wołać API aplikacji w imieniu organizacji, bez logowania człowieka. `api-keys` daje ownerowi i adminowi organizacji stronę `/api-keys`, na której wystawiają klucze z zakresami (na przykład `organization:read`), a trasom API funkcję `authenticateApiKey(request, scope)`, która z nagłówka `Authorization: Bearer <klucz>` ustala organizację i sprawdza zakres. Kit dostarcza jedną przykładową trasę, `GET /api/v1/organization`. Trasy dla własnych danych pisze projekt ([Użycie z własnego kodu](14b-modul-api-keys-uzycie.md#uzycie)).

Klucz należy do organizacji, nie do osoby: działa dalej po usunięciu konta autora (pole `createdById` dostaje `null`). W bazie leży tylko HMAC klucza, więc pełnego klucza nie da się odczytać ani pokazać drugi raz.

Czego moduł nie robi:

- **Nie daje sesji ani `OrgContext`.** Trasa z kluczem nie przechodzi przez `getOrgContext()`, guardy ról ani tryb serwisowy; sama filtruje dane po organizacji z kontekstu klucza ([Brak `OrgContext`](#bez-orgcontext)).
- **Nie ogranicza liczby żądań** (brak rate limitingu) i nie loguje każdego żądania. Jedyny ślad użycia to `lastUsedAt` klucza.
- **Nie rotuje kluczy** i nie ma OAuth: klucz unieważniasz i wystawiasz nowy ręcznie ([D43](decyzje.md#d43)).
- **Nie zapisuje zdarzeń z żądań API.** Zdarzenia dziennika zapisują tylko komendy zarządzania kluczami; trasa `GET /api/v1/organization` niczego nie zapisuje. Zapis z kanałem `API` robi kod projektu ([Zapis zdarzenia z kanałem `API`](14b-modul-api-keys-uzycie.md#kanal-api)).
- **Nie zastępuje logowania człowieka**: z kluczem nie otworzysz stron aplikacji ani akcji serwerowych, bo one czytają sesję.

Nie dodawaj modułu, gdy API wołają tylko zalogowani użytkownicy aplikacji (wystarczy sesja) albo gdy nie potrafisz zapewnić stałego sekretu `API_KEY_PEPPER` na każdym środowisku ([Konfiguracja peppera](#pepper)).

<a id="wymagania"></a>

## Wymagania

| Co | `api-keys` |
| --- | --- |
| Moduły kitu w `requires` | Brak. `audit-logs` nie jest wymagany; jeśli jest w projekcie, zapisuje zdarzenia kluczy ([Zdarzenia dziennika](#zdarzenia)). |
| Usługi (Docker, CI) | Brak. Pole `compose` manifestu jest puste. |
| Zmienne środowiskowe | `API_KEY_PEPPER`, wymagana, co najmniej 32 znaki; przy `NODE_ENV=production` nie może być wartością z `.env.example` ([Konfiguracja peppera](#pepper)). |
| Zależności npm | Brak. |
| Baza | Tabela `api_keys`, czyli migracja po dodaniu modułu. |

<a id="instalacja"></a>

## Instalacja i usunięcie

**Nowy projekt.** Moduł wybierasz przy zakładaniu projektu ([16](16-cli-wa.md#wa-create)), na przykład:

```bash
KIT_DIR=$(mktemp -d) && git clone --depth 1 --branch v0.1.0 https://github.com/webamigos/wa-kit.git "$KIT_DIR" && node "$KIT_DIR/.wa/bin/wa.mjs" create acme-app --modules api-keys
```

`wa create` wpisuje do `.env` przykładową wartość `API_KEY_PEPPER=dev-only-api-key-pepper-change-me-0123456789` (sprawdzone), która działa lokalnie i w testach. Pierwsza migracja (`npx prisma migrate dev --name init`) tworzy tabelę `api_keys` (sprawdzone).

**Istniejący projekt.** `npm run wa -- add api-keys` kopiuje pliki modułu, wypełnia region `wa:relations` (`createdApiKeys ApiKey[]` w `User`, `apiKeys ApiKey[]` w `Organization`) i region `wa:modules` w `.env.example`, uruchamia `wa generate` i `npm install` ([16](16-cli-wa.md#wa-add)). Potem:

1. Dopisz `API_KEY_PEPPER` do `.env`: `wa add` nie zmienia `.env`, a bez zmiennej pierwszy odczyt `env` w całej aplikacji kończy się błędem `Nieprawidłowe zmienne środowiskowe: API_KEY_PEPPER: …` ([16](16-cli-wa.md#add-po)).
2. Utwórz migrację: `npx prisma migrate dev --name add-api-keys` przy działającej bazie i zacommituj ją ([03b](03b-schemat-i-migracje.md#migracje-w-projekcie)). Prisma 7 nie generuje przy tym klienta; po `--no-install` uruchom `npm run db:generate`.

**Testy i CI.** Testy integracyjne dostają pepper z `src/test/integration/setup-env.ts`, a serwery e2e z `e2e/env.ts`, więc CI projektu nie potrzebuje sekretu. CI kitu składa projekt z samym `api-keys` i ze wszystkimi modułami (macierz `combo` w `.github/workflows/kit.yml`, [16b](16b-rozwoj-kitu.md#ci-kitu)).

<a id="pepper"></a>

### Konfiguracja peppera (`API_KEY_PEPPER`)

Klucz jest zapisany w bazie jako HMAC-SHA256 z sekretem `API_KEY_PEPPER`. Wyciek samej bazy nie wystarcza, żeby sprawdzić klucz bez peppera.

- **Produkcja wymaga własnej wartości.** Schemat `src/features/api-keys/env.ts` odrzuca brak zmiennej, wartość krótszą niż 32 znaki, a przy `NODE_ENV=production` także wartość z `.env.example`. Ustaw losowy napis, na przykład z `openssl rand -base64 32`, w zmiennych usługi przed pierwszym wdrożeniem ([10](10-wdrozenie.md#zmienne)).
- **Błąd peppera psuje całą aplikację, nie tylko moduł.** Schemat modułu należy do walidacji `env` całej aplikacji ([07](07-i18n-mail-env.md#walidacja-env)). Na zbudowanym serwerze z wartością przykładową każde żądanie z kluczem do tras `/api/v1/…` zwracało 500, a log serwera pokazał `Error: Nieprawidłowe zmienne środowiskowe: RESEND_API_KEY: wymagana w produkcji; API_KEY_PEPPER: w produkcji nie może być wartością z .env.example` (sprawdzone). Strony i akcje, które czytają `env`, kończą się tym samym błędem, bo pierwszy odczyt `env` woła `parseEnv`, a ten rzuca przy każdym błędzie schematu (wynika z kodu `src/shared/lib/env.ts`; strony w tym przebiegu nie były otwierane). Żądanie bez nagłówka `Authorization` dostało przy tym zwykłe 401 `missing`, bo `authenticateApiKey` kończy się przed odczytem `env`; nie traktuj go jako dowodu, że konfiguracja jest dobra ([10](10-wdrozenie.md#blad-env)).
- **Zmiana peppera unieważnia wszystkie klucze.** HMAC tego samego klucza z innym pepperem jest inny, więc żaden zapisany klucz nie zostanie znaleziony. Po zmianie wartości klucz wystawiony wcześniej dostał 401 `{"error":"invalid"}` (sprawdzone). Klucze nie znikają z listy na `/api-keys` i mają status „Aktywny”, ale nie działają; organizacje muszą wystawić nowe klucze i usunąć stare. Pepper ma więc być stały dla środowiska i nie wolno go zgubić; inny pepper na stagingu i produkcji jest poprawny, bo klucze nie przechodzą między środowiskami.

<a id="usuniecie"></a>

### Usunięcie

`npm run wa -- remove api-keys` odmawia, gdy moduł projektu ma `api-keys` w `requires`: w przebiegu funkcja `deliveries` zablokowała usunięcie komunikatem `Moduł api-keys jest wymagany przez: deliveries` (sprawdzone). Co zostaje po udanym `wa remove` ([16](16-cli-wa.md#remove-co-zostaje)):

| Co | Po `wa remove api-keys` |
| --- | --- |
| Tabela `api_keys` z hashami kluczy | Zostaje z danymi, dopóki nie zastosujesz migracji `npx prisma migrate dev --name remove-api-keys`, która ją usuwa. Klucze i tak przestają działać, bo nie ma trasy ani `authenticateApiKey`. |
| `API_KEY_PEPPER` w `.env` i w zmiennych produkcji | Zostaje; znika tylko z `.env.example`. Usuń ją sam. |
| Trasa `GET /api/v1/organization`, strona `/api-keys`, pozycja menu „Klucze API” | Znikają razem z plikami i rejestrem. |
| Trasy projektu, które importują `authenticateApiKey` albo `ApiKeyContext` | Przestają się budować (`TS2307: Cannot find module '@/features/api-keys/…'`, [12](12-moduly-kitu.md#punkty-wejscia)). `wa remove` nie szuka takich importów. |
| Deklaracje `apiScopes` w `module.ts` projektu | Zostają i nic nie robią. |
| Wpisy `api_key.*` w `audit_logs` (gdy jest `audit-logs`) | Zostają; strona `/audit-log` pokazuje je jako surowy napis, bo etykiety deklarował usunięty moduł. |

<a id="co-dodaje"></a>

## Co moduł dodaje do aplikacji

<a id="manifest"></a>

### Manifest i definicja modułu

`kit/modules/api-keys.json`

```json
  "files": [
    "prisma/schema/api-keys.prisma",
    "src/features/api-keys/**",
    "src/app/api/v1/organization/**",
    "src/app/[locale]/(app)/api-keys/**"
  ],
  "dependencies": {},
  "devDependencies": {},
  "env": [
    {
      "name": "API_KEY_PEPPER",
      "example": "dev-only-api-key-pepper-change-me-0123456789",
      "required": true
    }
  ],
  "schemaRelations": [
    { "model": "User", "field": "createdApiKeys ApiKey[]" },
    { "model": "Organization", "field": "apiKeys ApiKey[]" }
  ],
  "compose": null,
```

<a id="definicja-modulu"></a>

Definicja modułu (`src/features/api-keys/module.ts`):

| Pole | Wartość | Skutek |
| --- | --- | --- |
| `key` | `api-keys` | Klucz dla `requireModuleAccess("api-keys")` i namespace tłumaczeń. |
| `nav` | `/api-keys`, etykieta `nav` („Klucze API”), ikona `key-round`, `order: 85` | Pozycja menu dla ról z dostępem. |
| `routePrefixes` | `["/api-keys"]` | Przypisuje ścieżkę do modułu. |
| `roles` | `["owner", "admin"]` | Dostęp mają owner i admin organizacji; `member` nie. |
| `apiScopes` | `organization:read` z etykietą `scopes.organizationRead` („Odczyt danych organizacji”) | Zakres przykładowej trasy ([Deklaracja `apiScopes`](#apiscopes)). |
| `auditActions` | `api_key.created`, `api_key.revoked`, `api_key.deleted` | Etykiety zdarzeń kluczy w dzienniku ([Zdarzenia](#zdarzenia)). |

<a id="model"></a>

### Model `ApiKey`

`prisma/schema/api-keys.prisma`, tabela `api_keys`:

| Pole | Kolumna i typ | Znaczenie |
| --- | --- | --- |
| `id` | `id`, `uuid`, domyślnie `uuid()` | Identyfikator klucza; trafia do kontekstu jako `apiKeyId`. |
| `organizationId` | `organization_id`, tekst, wymagane | Organizacja, w imieniu której działa klucz. |
| `createdById` | `created_by_id`, tekst, opcjonalne | Autor klucza, tylko do wyświetlenia. |
| `name` | `name`, tekst | Nazwa nadana przy tworzeniu, 1–100 znaków po przycięciu. |
| `displayPrefix` | `display_prefix`, tekst | Prefiks klucza i jego 6 pierwszych znaków losowych, do rozpoznania klucza na liście. |
| `hashedKey` | `hashed_key`, tekst, unikalne | HMAC-SHA256 klucza z `API_KEY_PEPPER`, szesnastkowo (64 znaki). |
| `scopes` | `scopes`, `text[]`, domyślnie `[]` | Zakresy nadane kluczowi. |
| `lastUsedAt` | `last_used_at`, `timestamptz`, opcjonalne | Czas ostatniego udanego uwierzytelnienia. |
| `expiresAt` | `expires_at`, `timestamptz`, opcjonalne | Termin ważności; `null` to klucz bez wygaśnięcia. |
| `revokedAt` | `revoked_at`, `timestamptz`, opcjonalne | Czas unieważnienia. |
| `createdAt`, `updatedAt` | `created_at`, `updated_at`, `timestamptz` | Czas utworzenia i ostatniej zmiany wiersza. |

Indeksy: `(organizationId, createdAt)` dla listy kluczy organizacji i unikalny `hashedKey`, po którym `authenticateApiKey` szuka klucza. Zachowanie przy usuwaniu: **usunięcie organizacji** usuwa jej klucze (`onDelete: Cascade`); **usunięcie użytkownika** zostawia klucz działający z `createdById` równym `null`, a lista pokazuje autora jako „-” (test „listApiKeysQuery zwraca createdBy null, gdy autor został usunięty”).

<a id="cykl-zycia"></a>

### Strona `/api-keys` i cykl życia klucza

`src/app/[locale]/(app)/api-keys/page.tsx` woła `requireModuleAccess("api-keys")` i `listApiKeysQuery()`, a widok to komponent kliencki `ApiKeysManager`. Lista pokazuje nazwę, `displayPrefix` z wielokropkiem, etykiety zakresów, ostatnie użycie (`d MMM yyyy, HH:mm` w języku interfejsu albo „Nigdy”), status i autora. Każda komenda idzie przez `useServiceModeAction().run`, więc superadmin w trybie serwisowym widzi dialog potwierdzenia ([09b](09b-implementacja-i-bramki.md#komenda)).

**Utworzenie.** Przycisk „Nowy klucz” otwiera formularz: nazwa, zakresy (pole wyboru dla każdego zakresu zadeklarowanego w rejestrze klienta) i wygaśnięcie: 30, 90 (domyślnie), 365 dni albo „Bez wygaśnięcia”. Przycisk „Utwórz klucz” jest nieaktywny bez nazwy albo bez zakresu. `createApiKeyCommand` sprawdza dostęp i tryb serwisowy, waliduje wejście (nazwa 1–100 znaków po przycięciu, co najmniej jeden zakres, każdy znany z `knownApiScopes()`, wygaśnięcie z listy), losuje klucz i w jednej transakcji sprawdza limit i zapisuje wiersz. `expiresAt` to chwila utworzenia plus 30, 90 albo 365 razy 24 godziny.

**Postać klucza.** `<slug projektu z „_” zamiast „-”>_live_<43 znaki base64url>`, czyli 32 losowe bajty; w projekcie `api-demo` klucz zaczyna się od `api_demo_live_`, a `displayPrefix` ma 20 znaków, na przykład `api_demo_live_m8j6WB` (sprawdzone).

<a id="sekret"></a>

**Jednorazowe pokazanie sekretu.** Pełny klucz zwraca tylko odpowiedź `createApiKeyCommand` (`{ id, plaintext }`); komponent pokazuje go w dialogu „Twój nowy klucz API” z przyciskiem „Kopiuj klucz” i ostrzeżeniem, że po zamknięciu okna nie da się go odczytać. Po zamknięciu klucz znika z DOM, a lista pokazuje tylko prefiks (testy „po zamknięciu dialogu klucz znika z DOM i nie ma go w liście”, „pełny klucz nie pojawia się w liście kluczy, tylko prefiks”). Baza ma tylko `displayPrefix` i HMAC klucza (`hashedKey`), z którego nie da się odtworzyć klucza; wpis dziennika i `listApiKeysQuery` nie zawierają ani klucza, ani hasha. Zgubiony klucz trzeba zastąpić nowym.

**Wygaśnięcie.** Klucz z `expiresAt` równym albo wcześniejszym niż chwila żądania dostaje 401 `expired`. Status „Wygasły” na liście liczy się według czasu przeglądarki z chwili otwarcia strony. Wygasłego klucza nie da się przedłużyć; zostaje na liście, dopóki go nie usuniesz.

**Unieważnienie.** Przycisk „Unieważnij” (tylko przy kluczu bez `revokedAt`) pyta przez `window.confirm` „Unieważnić klucz „…”? Aplikacje używające go stracą dostęp.” i woła `revokeApiKeyCommand`. Komenda ustawia `revokedAt` raz: ponowne unieważnienie zwraca sukces, nie zmienia znacznika czasu i nie zapisuje drugiego zdarzenia. Unieważniony klucz zostaje na liście ze statusem „Unieważniony” i dostaje 401 `revoked`.

**Usunięcie.** Przycisk „Usuń” jest przy każdym kluczu, także aktywnym, i pyta „Usunąć klucz „…”? Tej operacji nie można cofnąć.”. `deleteApiKeyCommand` usuwa wiersz; usunięty klucz dostaje 401 `invalid`, bo nie ma go w bazie. Gdy inne żądanie usunęło klucz między odczytem a zapisem, komenda zwraca sukces bez zdarzenia dziennika.

<a id="limit"></a>

**Limit aktywnych kluczy.** Organizacja ma najwyżej 10 aktywnych kluczy, czyli bez `revokedAt` i z `expiresAt` równym `null` albo późniejszym niż chwila tworzenia. Klucze unieważnione, wygasłe i klucze innych organizacji się nie liczą. Przy 10 aktywnych kluczach komenda zwraca `{ success: false, error: "Osiągnięto limit 10 aktywnych kluczy" }` i nic nie zapisuje; żeby utworzyć nowy, unieważnij albo usuń jeden z aktywnych. Limit jest stałą w kodzie (`ACTIVE_KEY_LIMIT`), bez zmiennej środowiskowej.

**Blokada przy limicie.** Sprawdzenie limitu i zapis wykonują się w transakcji, która najpierw bierze blokadę doradczą Postgresa na organizację (`pg_advisory_xact_lock(hashtext(organizationId))`). Dwa równoległe żądania tej samej organizacji czekają na siebie, więc przy 9 aktywnych kluczach dają jeden sukces i jeden błąd limitu (test „dwa równoległe create przy 9 aktywnych kluczach dają jeden sukces, jeden błąd limitu i 10 aktywnych”). Blokada obejmuje tylko tworzenie kluczy danej organizacji i zwalnia się z końcem transakcji.

<a id="trasa-organization"></a>

### Trasa `GET /api/v1/organization`

`src/app/api/v1/organization/route.ts`

```ts
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request, "organization:read");
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }
  return Response.json(await readOrganizationForApiKey(auth.context), {
    headers: NO_STORE,
  });
}
```

Sukces zwraca 200 i `{ id, name, slug }` organizacji klucza; błędy mają kody z [kontraktu `authenticateApiKey`](#authenticate). Każda odpowiedź, także błąd, ma `Cache-Control: no-store`. Organizację bierze `readOrganizationForApiKey` (`services/organization-api.ts`) z `context.organizationId`; nagłówek `x-organization-id` i parametr `?organizationId=` nic nie zmieniają (test „nagłówek i parametr z cudzym organizationId nie zmieniają organizacji”). Ścieżki `/api/` nie przechodzą przez middleware języków (`src/proxy.ts`, [12](12-moduly-kitu.md#wspolne-zasady)).

<a id="komponenty"></a>

### Komponenty, komendy i serwisy

| Plik | Eksport | Co robi |
| --- | --- | --- |
| `components/api-keys-manager.tsx` | `ApiKeysManager` | Widok strony `/api-keys`: lista, formularz, dialog sekretu (komponent kliencki). |
| `components/api-key-columns.tsx` | `buildApiKeyColumns`, `resolveApiKeyStatus` | Kolumny tabeli i status `active`, `revoked`, `expired`. |
| `services/commands/api-key-commands.ts` | `createApiKeyCommand(input, confirmation?)` | Tworzy klucz, zwraca `{ id, plaintext }`. |
| | `revokeApiKeyCommand(input, confirmation?)` | Unieważnia klucz `{ id }` aktywnej organizacji. |
| | `deleteApiKeyCommand(input, confirmation?)` | Usuwa klucz `{ id }` aktywnej organizacji. |
| `services/queries/api-key-queries.ts` | `listApiKeysQuery()` | Klucze aktywnej organizacji od najnowszego, z autorem, bez `hashedKey`; guard `requireModuleAccess("api-keys")`. |
| `services/authenticate-api-key.ts` | `authenticateApiKey`, `ApiKeyContext`, `ApiKeyAuthResult` | Uwierzytelnienie trasy kluczem ([kontrakt](#authenticate)). |
| `services/api-scopes.ts` | `knownApiScopes()` | Zakresy zadeklarowane w `apiScopes` wszystkich modułów rejestru, bez powtórzeń. |
| `services/api-scope-labels.ts` | `findApiScopeLabel(scope, modules)` | Namespace i klucz etykiety zakresu. |
| `services/api-key-secret.ts` | `apiKeyPrefix()`, `generateApiKey()`, `hashApiKey(plaintext, pepper)` | Prefiks ze sluga, losowanie klucza, HMAC-SHA256. |
| `services/api-key-pepper.ts` | `apiKeyPepper()` | `API_KEY_PEPPER` z `env`. |
| `services/organization-api.ts` | `readOrganizationForApiKey(context)` | Dane organizacji dla trasy przykładowej. |
| `contracts/api-key.schemas.ts` | `createApiKeySchema()`, `apiKeyIdSchema`, `API_KEY_EXPIRY_DAYS` | Walidacja wejścia komend. |
| `env.ts` | `envSchema` | Schemat `API_KEY_PEPPER` ([Konfiguracja peppera](#pepper)). |

Komendy zwracają przy błędzie walidacji ogólny komunikat („Nie udało się utworzyć klucza”, „Nie udało się unieważnić klucza”, „Nie udało się usunąć klucza”), bo `handleCommandError` przepisuje treść tylko dla `DomainError`; dosłownie przechodzą komunikat limitu, „Nie znaleziono klucza” i „Potwierdź zmianę w trybie serwisowym”.

<a id="dostep"></a>

### Dostęp według ról

Stronę, `listApiKeysQuery` i trzy komendy obsłuży owner i admin aktywnej organizacji oraz konto z rolą globalną `admin` albo `superadmin` (`canAccessModule`); `member` dostaje 404 na stronie, a komendy rzucają `notFound()` i niczego nie zapisują. Superadmin bez członkostwa działa w trybie serwisowym i musi potwierdzić każdą komendę; zdarzenie dostaje wtedy `serviceMode: true`. Pełna macierz: [04-auth-i-role.md](04-auth-i-role.md#macierz-dostepu). Role nie dotyczą tras z kluczem: tam decyduje zakres klucza.

Teksty modułu leżą pod namespace `api-keys` w `src/features/api-keys/i18n/pl.json` i `en.json`.

<a id="szwy"></a>

## Szwy modułu

Szwy generowane ([12](12-moduly-kitu.md#szwy-generowane)):

| Szew | Co wpina `api-keys` |
| --- | --- |
| `modules`, `clientModules` | `src/features/api-keys/module.ts`; `knownApiScopes()` czyta `modules`, a formularz na `/api-keys` `clientModules`. |
| `moduleEnvSchemas` | `envSchema` z `src/features/api-keys/env.ts`. |
| `moduleMessages` | `i18n/pl.json`, `i18n/en.json` pod kluczem `api-keys`. |
| Region `wa:relations` | `createdApiKeys ApiKey[]` w `User`, `apiKeys ApiKey[]` w `Organization`. |
| Region `wa:modules` w `.env.example` | `API_KEY_PEPPER` z wartością przykładową. |
| `authPlugins`, `authClientPlugins`, `auditSinks`, `wa:services`, `wa:ci-integration` | Nic. |

Punkty wejścia z kontraktem: funkcja `authenticateApiKey` z typem `ApiKeyContext` (plik modułu, istnieje tylko z modułem), deklaracja `apiScopes` w `defineModule` (istnieje zawsze) i zdarzenia dziennika przez `trackAudit` z rdzenia.

<a id="authenticate"></a>

### Kontrakt `authenticateApiKey`

`src/features/api-keys/services/authenticate-api-key.ts`

```ts
export interface ApiKeyContext {
  organizationId: string;
  apiKeyId: string;
  scopes: string[];
}

export type ApiKeyAuthResult =
  | { ok: true; context: ApiKeyContext }
  | {
      ok: false;
      status: 401 | 403;
      error: "missing" | "invalid" | "revoked" | "expired" | "scope";
    };
// …
export async function authenticateApiKey(
  request: Request,
  requiredScope: string,
): Promise<ApiKeyAuthResult> {
```

- **Co podaje trasa.** Żądanie i jeden wymagany zakres. Funkcja nie rzuca przy złym nagłówku; zwraca wynik, który trasa zamienia na odpowiedź. Kod statusu i pole `error` bierz z wyniku, jak w trasie przykładowej.
- **Kolejność sprawdzeń i wyniki:**

| Sytuacja | `status` | `error` |
| --- | --- | --- |
| Brak nagłówka `Authorization`, inny schemat niż `Bearer ` (wielkość liter ma znaczenie: `bearer` nie przejdzie), tabulator zamiast spacji, pusty token | 401 | `missing` |
| Brak klucza o tym HMAC w bazie: zły klucz, inna wielkość liter, dwie spacje po `Bearer`, spacja albo dopisek wewnątrz tokenu, klucz w cudzysłowie, klucz usunięty, klucz sprzed zmiany peppera | 401 | `invalid` |
| Klucz z `revokedAt` | 401 | `revoked` |
| Klucz z `expiresAt` ≤ chwila żądania | 401 | `expired` |
| Klucz nie ma wymaganego zakresu wśród zakresów znanych z `knownApiScopes()` | 403 | `scope` |
| Klucz ważny z zakresem | — | `{ ok: true, context }` |

- **Wyszukanie.** Funkcja liczy HMAC tokenu i szuka wiersza po unikalnym `hashedKey` (bez porównywania sekretów w JS). Token to wszystko po `Bearer `, bez przycinania przez funkcję. Spacje i tabulatory na początku i końcu wartości nagłówka usuwa wcześniej sam `Headers` (standard Fetch, sprawdzone w Node 22), więc w prawdziwym żądaniu klucz ze spacją na końcu i `Authorization` ze spacją przed `Bearer` przechodzą; test jednostkowy, który podaje te przypadki jako `invalid` i `missing`, używa obiektu żądania bez tej normalizacji.
- **Zakresy.** Zakresy klucza są przecinane z `knownApiScopes()`. Zakres, którego żaden moduł w rejestrze nie deklaruje, nie daje dostępu i nie trafia do `context.scopes`; dotyczy to także wymaganego zakresu trasy: jeśli moduł go nie deklaruje w `apiScopes`, trasa zawsze zwraca 403, nawet dla klucza z tym zakresem w bazie (sprawdzone: po usunięciu deklaracji `deliveries:read` test trasy dostał `expected 403 to be 200`).
- **`lastUsedAt`.** Po sukcesie funkcja zapisuje `lastUsedAt` w tle, bez czekania; błąd tego zapisu trafia tylko do logu jako `Nie udało się zaktualizować lastUsedAt klucza API`. Nieudane uwierzytelnienie, także 403, nie zmienia `lastUsedAt`.
- **Organizacja.** `context.organizationId` pochodzi z wiersza klucza. Nagłówki i parametry żądania nie mają na nią wpływu.
- **Bez modułu.** Pliku nie ma: import `@/features/api-keys/services/authenticate-api-key` kończy się `TS2307` w typechecku i buildzie ([12](12-moduly-kitu.md#punkty-wejscia)). Trasa projektu z kluczem istnieje więc tylko razem z modułem, a funkcja, która ją ma, wpisuje `api-keys` do `requires`.
- **Ostrzeżenie.** To, że trasa woła `authenticateApiKey` przed dostępem do danych, jest konwencją: żaden test architektury nie sprawdza plików `route.ts` ([D43](decyzje.md#d43)). Trasa bez tego wywołania jest publiczna.

<a id="bez-orgcontext"></a>

### Brak `OrgContext` i jawny filtr organizacji

Klucz nie jest sesją. Trasa z kluczem nie woła `getOrgContext()`, `requireModuleAccess()` ani `assertServiceModeConfirmed`: nie ma użytkownika, roli w organizacji ani trybu serwisowego, a jedyną tożsamością jest `ApiKeyContext`. Rdzeń nie filtruje Prismy automatycznie, więc **każde zapytanie wołane z trasy musi mieć `organizationId: context.organizationId`** w `where` przy odczycie, zmianie i usuwaniu, a w `data` przy tworzeniu ([03](03-dane-i-organizacje.md#filtr-organizationid), [D07](decyzje.md#d07)). Organizacji nie bierz z treści żądania: w przebiegu `POST` z polem `organizationId` innej organizacji zapisał dostawę w organizacji klucza, bo schemat wejścia tego pola nie zna (sprawdzone testem).

Gdzie położyć kod wołany z trasy:

- serwis przyjmujący `ApiKeyContext` w katalogu `services/` feature, w pliku bez `"use server"` (jak `services/organization-api.ts`);
- nie w `services/queries/`, bo test `src/__tests__/server-entrypoints-guard.test.ts` wymaga tam guarda sesji przed Prismą;
- nie w pliku z `"use server"`: każda jego eksportowana funkcja jest publiczną akcją serwerową, którą klient mógłby wywołać z własnym `organizationId` w kontekście (przykład: [14b](14b-modul-api-keys-uzycie.md#wlasna-trasa)).

<a id="apiscopes"></a>

### Deklaracja `apiScopes`

Pole `apiScopes?: { key: string; labelKey: string }[]` w `defineModule` deklaruje zakres klucza.

- **Kto deklaruje.** Moduł albo funkcja projektu, która ma trasę wymagającą zakresu, we własnym `module.ts`, z etykietą w swoim `i18n/pl.json` i `en.json`. Etykietę szuka `findApiScopeLabel` w namespace równym `key` modułu deklarującego, więc `key` musi być równy nazwie katalogu feature ([D27](decyzje.md#d27)). Nazwa zakresu to napis; kit używa formy `zasób:operacja` (`organization:read`).
- **Kto czyta.** `knownApiScopes()` (rejestr serwerowy `modules`): walidacja zakresów w `createApiKeySchema` i filtr w `authenticateApiKey`. `ApiKeysManager` (rejestr kliencki `clientModules`): lista pól wyboru i etykiety na liście kluczy.
- **Kiedy działa.** Nowy plik `module.ts` wchodzi do rejestru po `npm run wa -- generate`; nowa pozycja w istniejącym `apiScopes` działa bez generatora.
- **Brak deklaracji.** Zakresu nie da się zaznaczyć przy tworzeniu klucza, komenda odrzuci go w wejściu, a `authenticateApiKey` zwróci 403 `scope`.
- **Usunięcie deklaracji albo modułu, który ją miał.** Klucze z tym zakresem tracą do niego dostęp bez zmiany wiersza; zakres zostaje w kolumnie `scopes` i na liście kluczy pokazuje się jako surowy napis.
- **Ten sam zakres w dwóch modułach.** `knownApiScopes()` usuwa powtórzenia; etykietę bierze pierwszy moduł w rejestrze. Formularz na `/api-keys` powtórzeń nie usuwa (`declaredScopes` w `api-keys-manager.tsx`): pokaże dwa pola wyboru tego samego zakresu z tym samym kluczem React, więc nie deklaruj zakresu innego modułu.
- **Bez modułu `api-keys`.** Nikt nie czyta pola: deklaracja przechodzi typecheck i nic nie robi ([12](12-moduly-kitu.md#punkty-wejscia)).

<a id="zdarzenia"></a>

### Zdarzenia dziennika

Komendy wołają `trackAudit` z `...auditActor(context)` po udanym zapisie ([kontrakt `trackAudit`](13-modul-audit-logs.md#trackaudit)):

| Akcja | `entityType`, `entityId` | Dane | Kiedy |
| --- | --- | --- | --- |
| `api_key.created` | `api_key`, id klucza | `newData: { name, scopes, displayPrefix }` | Po zapisie klucza. |
| `api_key.revoked` | `api_key`, id klucza | `oldData: { name, displayPrefix }` | Tylko gdy zapis zmienił wiersz; ponowne unieważnienie nie tworzy wpisu. |
| `api_key.deleted` | `api_key`, id klucza | `oldData: { name, displayPrefix }` | Tylko gdy zapis usunął wiersz. |

Zdarzenia nie zawierają klucza ani hasha (testy „zapisuje dokładnie jeden wpis audytu api_key.created bez klucza i hasha” i „revoke zwraca sukces, ustawia revokedAt i zapisuje jeden audyt bez klucza i hasha”). Mają kanał `WEB`, bo wykonuje je człowiek na stronie `/api-keys`; superadmin w trybie serwisowym zostawia wpis z `serviceMode: true`. Bez `audit-logs` wywołania nic nie zapisują.

**Kanał `API`.** Żaden kod kitu nie zapisuje zdarzeń z kanałem `API` ani z `credentialId`: trasa `GET /api/v1/organization` tylko czyta. `auditActor` przyjmuje `OrgContext`, którego trasa z kluczem nie ma, więc zdarzenie zapisu wykonanego kluczem składa kod projektu: `organizationId` i `credentialId` z `ApiKeyContext`, `actorUserId: null`, `channel: "API"` ([przykład](14b-modul-api-keys-uzycie.md#kanal-api)). Strona `/audit-log` pokazuje wtedy znaczek „API” i autora „System”. Pilnuje tego tylko konwencja ([D43](decyzje.md#d43)).

Dalej: użycie modułu we własnym kodzie, bezpieczeństwo, testowanie, typowe problemy i referencja w [14b-modul-api-keys-uzycie.md](14b-modul-api-keys-uzycie.md).
