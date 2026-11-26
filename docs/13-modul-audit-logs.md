# Moduł `audit-logs`: dziennik zdarzeń

Po przeczytaniu będziesz wiedzieć:

- jaki problem rozwiązuje `audit-logs`, czego nie robi (retencja) i kiedy go nie dodawać;
- jak dodać i usunąć moduł oraz co zostaje w bazie i w kodzie po `wa remove`;
- co moduł dodaje do aplikacji: model `AuditLog`, stronę `/audit-log`, komponent `<AuditTrail>` i zdarzenia rdzenia;
- jaki kontrakt mają punkty wejścia `trackAudit`, `auditActor`, `AuditSink` i `auditActions` i co robią w projekcie bez modułu;
- które dane moduł redaguje przed zapisem, a których nie wykryje.

Zweryfikowano z kodem: 042a1cb, 2026-10-30

Źródła:

- `kit/modules/audit-logs.json`
- `prisma/schema/audit-logs.prisma`
- `src/features/audit-logs/` (`module.ts`, `audit-sink.ts`, `auth.ts`, `components/`, `contracts/`, `services/`, `i18n/`) z testami w `__tests__/`
- `src/app/[locale]/(app)/audit-log/page.tsx`
- `src/shared/lib/audit.ts`, `src/shared/lib/__tests__/audit.test.ts`
- `src/shared/lib/modules/define-module.ts`
- `src/shared/lib/auth/permissions.ts`
- `src/modules.generated.ts`, `src/modules.client.generated.ts`
- komendy wołające `trackAudit`: `src/features/organizations/services/commands/member-commands.ts`, `src/features/organizations/services/commands/enter-organization-command.ts`, `src/features/api-keys/services/commands/api-key-commands.ts`, `src/features/uploads/services/commands/create-upload.ts`, `src/features/uploads/services/commands/upload-commands.ts`
- `src/features/organizations/services/signup-membership.ts`
- `mutation-gate.json`
- [spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md), §5

Jak moduły kitu trafiają do projektu i łączą się z rdzeniem, wyjaśnia [12-moduly-kitu.md](12-moduly-kitu.md#warstwa-szwow); ten plik opisuje tylko `audit-logs`. Opis modułu ma dwie części: ten plik (co robi moduł, wymagania, instalacja i usunięcie, co dodaje do aplikacji, szwy) i [13b-modul-audit-logs-uzycie.md](13b-modul-audit-logs-uzycie.md) (użycie we własnym kodzie, bezpieczeństwo, testowanie, typowe problemy, referencja). Decyzje: [D39](decyzje.md#d39), [D40](decyzje.md#d40), [D41](decyzje.md#d41), [D42](decyzje.md#d42).

<a id="przebieg"></a>

„(sprawdzone)” znaczy tu, że zachowanie potwierdził przebieg z 2026-10-30: projekt `audit-demo` założony z tagu `v0.1.0` z GitHuba komendą `wa create --modules audit-logs --locales pl,en --yes`, z bazą w kontenerze Postgresa i z funkcją projektu `deliveries` (wpis w `projectModules`). Funkcja ma komendę zapisującą zdarzenie przez `trackAudit`, deklarację `auditActions`, stronę z `<AuditTrail>` i test integracyjny. Na końcu przebiegu `npm run verify` i `npm run test:integration` były zielone. Fragmenty kodu z tego przebiegu mają nad blokiem ścieżkę pliku w projekcie `audit-demo` i dopisek „przykład z przebiegu”.

<a id="co-robi"></a>

## Co robi moduł i kiedy go nie dodawać

Owner albo admin organizacji chce sprawdzić, kto co zrobił. Szuka w obie strony: po osobie („co robił magazynier X”) i po rzeczy („kto przyjął dostawę 123 i co zmienił”). `audit-logs` zapisuje każde zdarzenie jako wiersz tabeli `audit_logs` z organizacją, autorem, akcją, encją, stanem przed i po zmianie, kanałem i znacznikiem trybu serwisowego. Daje stronę `/audit-log` z filtrami i komponent `<AuditTrail>`, który pokazuje historię jednej encji.

Zdarzenia zapisuje kod, który zmienia dane: rdzeń (członkostwo, wejście superadmina do organizacji), moduły kitu (`api-keys`, `uploads`) i funkcje projektu. Wszystkie wołają tę samą funkcję rdzenia `trackAudit`, a moduł podpina pod nią zapis do bazy. Akcje są otwarte: `action` to dowolny napis, a etykietę deklaruje moduł, który akcję zapisuje.

Czego moduł nie robi:

- **Nie ma retencji.** Nic nie usuwa starych wpisów, więc tabela rośnie bez limitu ([D41](decyzje.md#d41)). Wpisy znikają tylko razem z organizacją.
- **Nie zapisuje zdarzeń sam z siebie.** Zmiana, której kod nie przekaże do `trackAudit` i której nie łapie plugin modułu ([Zdarzenia rdzenia i modułów kitu](#zdarzenia)), nie trafi do dziennika. Wołanie `trackAudit` po każdej zmianie danych to konwencja, nikt jej nie sprawdza.
- **Nie loguje odczytów, logowań ani zmian kont użytkowników** (hasło, email, rola globalna, ban, impersonacja). Plugin łapie tylko pięć ścieżek organizacji.
- **Nie eksportuje dziennika** i nie pokazuje widoku zbiorczego wielu organizacji: każde zapytanie jest ograniczone do aktywnej organizacji.

Nie dodawaj modułu, gdy nikt nie będzie czytał dziennika. Kod projektu może wołać `trackAudit` i deklarować `auditActions` także bez modułu, więc moduł da się dodać później bez zmiany tego kodu ([Kod, który ma działać bez modułu](13b-modul-audit-logs-uzycie.md#bez-modulu)); zdarzenia sprzed dodania modułu nie zostaną jednak nigdzie zapisane.

<a id="wymagania"></a>

## Wymagania

| Co | `audit-logs` |
| --- | --- |
| Moduły kitu w `requires` | Brak. |
| Usługi (Docker, CI) | Brak. Pole `compose` manifestu jest puste, region `wa:services` i `wa:ci-integration` zostają bez zmian. |
| Zmienne środowiskowe | Brak. Pole `env` manifestu jest puste, moduł nie ma pliku `env.ts`. Uwaga z [16](16-cli-wa.md#add-po), że `wa add` nie dopisuje zmiennych do `.env`, tego modułu nie dotyczy. |
| Zależności npm | Tylko `better-call` w `devDependencies`: używa go test integracyjny pluginu (`auth-plugin.integration.test.ts`) do podpisania ciasteczka sesji. Aplikacja go nie importuje. |
| Baza | Tabela `audit_logs` i typ `AuditChannel`, czyli migracja po dodaniu modułu. |

<a id="instalacja"></a>

## Instalacja i usunięcie

**Nowy projekt.** Moduł wybierasz przy zakładaniu projektu ([16](16-cli-wa.md#wa-create)), na przykład:

```bash
KIT_DIR=$(mktemp -d) && git clone --depth 1 --branch v0.1.0 https://github.com/webamigos/wa-kit.git "$KIT_DIR" && node "$KIT_DIR/.wa/bin/wa.mjs" create acme-app --modules audit-logs
```

Pierwsza migracja projektu (`npx prisma migrate dev --name init`) tworzy od razu tabelę `audit_logs` (sprawdzone).

**Istniejący projekt.** `npm run wa -- add audit-logs` kopiuje pliki modułu, wypełnia region `wa:relations` (pola `auditLogs AuditLog[]` w `User` i `Organization`), uruchamia `wa generate` i `npm install` ([16](16-cli-wa.md#wa-add)). Potem:

1. Utwórz migrację: `npx prisma migrate dev --name add-audit-logs` przy działającej bazie i zacommituj ją ([03b](03b-schemat-i-migracje.md#migracje-w-projekcie)).
2. Jeśli dodałeś moduł z `--no-install`, wygeneruj klienta Prismy: `npm install` (skrypt `postinstall`) albo `npm run db:generate`. W Prisma 7 `migrate dev` nie uruchamia generatora ([03b](03b-schemat-i-migracje.md#schemat)); bez tego `prisma.auditLog` nie istnieje w typach i w czasie działania.
3. Nic więcej: bez zmiennych, usług i zmian w CI.

**Wdrożenie.** Migrację zastosuje `node_modules/.bin/prisma migrate deploy` przy wdrożeniu ([10](10-wdrozenie.md#migracje)). Zdarzenia zaczynają się zapisywać od pierwszego żądania obsłużonego przez nową wersję; wcześniejszych nie da się odtworzyć.

<a id="usuniecie"></a>

**Usunięcie.** `npm run wa -- remove audit-logs` odmawia, gdy moduł projektu ma `audit-logs` w `requires`. W przebiegu funkcja `deliveries`, która osadza `<AuditTrail>`, zablokowała usunięcie komunikatem `Moduł audit-logs jest wymagany przez: deliveries` (sprawdzone). Co zostaje po udanym `wa remove` ([16](16-cli-wa.md#remove-co-zostaje)):

| Co | Po `wa remove audit-logs` |
| --- | --- |
| Tabela `audit_logs` i typ `AuditChannel` | Zostają z danymi, dopóki nie zastosujesz migracji `npx prisma migrate dev --name remove-audit-logs`. Ta migracja usuwa tabelę razem z całą historią zdarzeń; jeśli historia jest potrzebna (wymogi klienta, spór), zrób najpierw kopię tabeli. |
| Wywołania `trackAudit` w rdzeniu, modułach i projekcie | Działają dalej i nic nie zapisują: `auditSinks` jest puste. |
| Deklaracje `auditActions` w `module.ts` | Zostają i nic nie robią. |
| Kod projektu, który importuje pliki modułu (`<AuditTrail>`, `writeAuditLog`) | Przestaje się budować (`TS2307: Cannot find module '@/features/audit-logs/…'`, [12](12-moduly-kitu.md#punkty-wejscia)). `wa remove` nie szuka takich importów. |
| `better-call` w `devDependencies` | Usunięte, jeśli nie deklaruje go inny manifest ([16](16-cli-wa.md#remove-co-robi)). |
| Pozycja „Dziennik zdarzeń” w menu, strona `/audit-log`, plugin better-auth | Znikają razem z plikami i rejestrem. |

<a id="co-dodaje"></a>

## Co moduł dodaje do aplikacji

<a id="manifest"></a>

### Manifest i definicja modułu

`kit/modules/audit-logs.json`

```json
  "files": [
    "prisma/schema/audit-logs.prisma",
    "src/features/audit-logs/**",
    "src/app/[locale]/(app)/audit-log/**"
  ],
  "dependencies": {},
  "devDependencies": { "better-call": "^1.4.4" },
  "env": [],
  "schemaRelations": [
    { "model": "User", "field": "auditLogs AuditLog[]" },
    { "model": "Organization", "field": "auditLogs AuditLog[]" }
  ],
  "compose": null,
```

<a id="definicja-modulu"></a>

Definicja modułu (`src/features/audit-logs/module.ts`):

| Pole | Wartość | Skutek |
| --- | --- | --- |
| `key` | `audit-logs` | Klucz dla `requireModuleAccess("audit-logs")` i namespace tłumaczeń. |
| `nav` | `/audit-log`, etykieta `nav` („Dziennik zdarzeń”), ikona `scroll-text`, `order: 90` | Pozycja menu dla ról z dostępem. |
| `routePrefixes` | `["/audit-log"]` | Przypisuje ścieżkę do modułu (menu, guard ścieżek). |
| `roles` | `["owner", "admin"]` | Dostęp mają owner i admin organizacji; `member` nie. |
| `auditActions` | sześć akcji rdzenia (tabela w [Referencji](13b-modul-audit-logs-uzycie.md#referencja-akcje)) | Etykiety zdarzeń, które zapisuje rdzeń i plugin modułu. |

<a id="model"></a>

### Model `AuditLog`

`prisma/schema/audit-logs.prisma`, tabela `audit_logs`:

| Pole | Kolumna i typ | Znaczenie |
| --- | --- | --- |
| `id` | `id`, `uuid`, domyślnie `uuid()` | Identyfikator wpisu. |
| `organizationId` | `organization_id`, tekst, wymagane | Organizacja, w której zaszło zdarzenie. |
| `userId` | `user_id`, tekst, opcjonalne | Autor; `null` dla zdarzeń bez użytkownika (system, klucz API) i po usunięciu konta. |
| `action` | `action`, tekst | Akcja w formacie `encja.czasownik`, na przykład `member.invited`. |
| `entityType` | `entity_type`, tekst | Typ encji, na przykład `invitation`. |
| `entityId` | `entity_id`, tekst, opcjonalne | Identyfikator encji. |
| `oldData`, `newData` | `old_data`, `new_data`, `jsonb`, opcjonalne | Stan przed i po zmianie, po redakcji. |
| `channel` | `channel`, enum `AuditChannel` (`WEB`, `API`), domyślnie `WEB` | Kanał zdarzenia. |
| `credentialId` | `credential_id`, tekst, opcjonalne | Identyfikator poświadczenia (na przykład klucza API), bez klucza obcego, więc wpis przeżywa usunięcie klucza. |
| `serviceMode` | `service_mode`, logiczne, domyślnie `false` | Zdarzenie superadmina w trybie serwisowym. |
| `createdAt` | `created_at`, `timestamptz`, domyślnie `now()` | Czas zapisu wpisu. |

Indeksy: `(organizationId, createdAt)` dla listy i filtra dat, `(organizationId, entityType, entityId)` dla historii encji, `(organizationId, userId, createdAt)` dla filtra autora. Każdy zaczyna się od `organizationId`, bo każde zapytanie modułu filtruje po organizacji.

Zachowanie przy usuwaniu (testy w `write-audit-log.integration.test.ts`):

- **usunięcie organizacji** usuwa jej wpisy (`onDelete: Cascade`), wpisy innych organizacji zostają;
- **usunięcie użytkownika** zostawia wpisy z `userId` równym `null` (`onDelete: SetNull`); widok pokazuje wtedy autora jako „System”;
- **zapis z `organizationId`, którego nie ma w bazie,** kończy się błędem klucza obcego w ujściu; `trackAudit` łapie go i loguje ([Kontrakt `trackAudit`](#trackaudit)).

<a id="strona"></a>

### Strona `/audit-log`

`src/app/[locale]/(app)/audit-log/page.tsx` woła `requireModuleAccess("audit-logs")`, parsuje parametry adresu schematem `auditLogFiltersSchema` i równolegle pobiera wpisy (`listAuditLogsQuery`) i listę autorów (`listAuditLogActorsQuery`). Widok to komponent kliencki `AuditLogView`. Stan filtrów, sortowania i strony jest w parametrach adresu, więc link do przefiltrowanego widoku można przesłać dalej.

| Element | Zachowanie |
| --- | --- |
| Filtr „Akcja” | Lista akcji zadeklarowanych w `auditActions` wszystkich modułów z rejestru, z etykietami. Akcji bez deklaracji nie ma na liście; filtr po niej działa tylko przez parametr `action` w adresie. |
| Filtry „Typ obiektu” i „Identyfikator obiektu” | Pola tekstowe. Zmieniają adres po opuszczeniu pola (blur), tylko gdy tekst po przycięciu różni się od filtra; blur bez zmiany nie przeładowuje strony. Pole z fokusem nie traci wpisywanego tekstu, gdy filtry zmienią się w tym czasie. |
| Filtr „Autor” | Pokazuje się, gdy w organizacji są wpisy z autorem; lista to użytkownicy z co najmniej jednym wpisem w aktywnej organizacji, alfabetycznie. |
| Filtry „Od” i „Do” | Dzień w formacie `RRRR-MM-DD`, oba końce włącznie ([Strefa czasowa filtrów](#strefa-czasowa)). |
| Kolumny | Data, akcja (z etykietą; znaczek „API” dla kanału `API`, „Tryb serwisowy” dla `serviceMode`), obiekt (typ i identyfikator), autor (nazwa albo „System”). |
| Kolumna daty | Serwer renderuje `<time dateTime="…">` z czasem w ISO i bez tekstu; czas lokalny przeglądarki (`d MMM yyyy HH:mm:ss`) pojawia się dopiero po zamontowaniu komponentu. Dzięki temu HTML z serwera nie zawiera czasu w strefie serwera. |
| Szczegóły wiersza | Rozwinięcie pokazuje `oldData` („Przed”) i `newData` („Po”) jako JSON; wiersz bez obu nie ma rozwinięcia. |
| Sortowanie | Po jednej kolumnie: data (domyślnie malejąco), akcja albo typ obiektu. Wpisy o równej wartości sortowania mają stałą kolejność po `id`. |
| Paginacja | 10, 25 (domyślnie), 50 albo 100 wpisów na stronę. |

Błędne parametry adresu nie dają błędu: każdy zły parametr dostaje wartość domyślną albo jest pomijany, a pozostałe działają. Numer strony spoza zakresu 1–1 000 000 daje stronę 1; filtr tekstowy pusty, z samych spacji albo dłuższy niż 200 znaków jest pomijany.

<a id="strefa-czasowa"></a>

**Strefa czasowa filtrów.** Filtr `from=2026-10-29` oznacza północ tego dnia, a `to=2026-10-29` ostatnią milisekundę (23:59:59.999) tego dnia, liczone w strefie czasowej procesu serwera (zmienna `TZ` procesu Node), a nie w UTC ani w strefie przeglądarki. Na serwerze w UTC dzień filtra jest dniem UTC; użytkownik w Polsce widzi wtedy w kolumnie daty czas przesunięty o godzinę albo dwie względem granic filtra. Data, której nie ma w kalendarzu (`2026-02-30`), i rok sprzed 100 (`0050-01-01`) są odrzucane: filtr znika, a pole daty jest puste. Pola dat pokazują dzień z adresu, a nie przeliczony z daty filtra, więc przeglądarka w innej strefie nie przesuwa dnia o jeden.

<a id="komponenty"></a>

### Komponenty, query i serwisy

Moduł nie ma akcji serwerowych (plików `"use server"`): nie da się z przeglądarki ani dopisać, ani zmienić wpisu.

| Plik | Eksport | Co robi |
| --- | --- | --- |
| `components/audit-log-view.tsx` | `AuditLogView` | Widok strony `/audit-log` (komponent kliencki). |
| `components/audit-trail.tsx` | `AuditTrail` | Komponent serwerowy z historią jednej encji ([Historia encji](13b-modul-audit-logs-uzycie.md#audit-trail)). |
| `services/queries/audit-log-queries.ts` | `listAuditLogsQuery(input)` | Lista wpisów aktywnej organizacji z filtrami, sortowaniem i paginacją; guard `requireModuleAccess("audit-logs")`. |
| | `listAuditLogActorsQuery()` | Autorzy wpisów aktywnej organizacji (`id`, `name`), alfabetycznie; ten sam guard. |
| `services/queries/audit-trail-query.ts` | `getEntityAuditTrailQuery(entityType, entityId)` | 50 najnowszych wpisów encji w aktywnej organizacji; bez dostępu zwraca `null` zamiast 404. |
| `services/write-audit-log.ts` | `writeAuditLog(event)` | Zapis wpisu po redakcji `oldData` i `newData` ([Zapis wpisu](#zapis)). |
| `audit-sink.ts` | `auditSink` | `writeAuditLog` jako ujście, które generator dopisuje do `auditSinks`. |
| `services/redact.ts` | `redactSensitive(value)` | Redakcja kluczy wrażliwych ([Redakcja](#redakcja)). |
| `auth.ts` | `authPlugin` | Plugin better-auth zapisujący zdarzenia organizacji ([Zdarzenia](#zdarzenia)). |
| `services/organization-audit-events.ts` | `organizationAuditEvent(input)`, `AUDITED_ORGANIZATION_PATHS` | Buduje zdarzenie z odpowiedzi endpointu better-auth. |
| `services/audit-action-labels.ts` | `findAuditActionLabel(action, modules)` | Szuka deklaracji akcji w rejestrze. |
| `contracts/audit-log.schemas.ts` | `auditLogFiltersSchema` | Parsowanie parametrów adresu. |

<a id="dostep"></a>

### Dostęp według ról

Stronę, oba query listy i `<AuditTrail>` zobaczy owner i admin aktywnej organizacji oraz konto z rolą globalną `admin` albo `superadmin` (`canAccessModule` w `src/shared/lib/auth/permissions.ts`). Członek z rolą `member` dostaje 404 na stronie, a `<AuditTrail>` nic mu nie renderuje. Ta sama reguła obowiązuje przy `MULTI_ORG=false` i `MULTI_ORG=true`, bo definicja nie ma `adminOnly`. Pełna macierz: [04-auth-i-role.md](04-auth-i-role.md#macierz-dostepu). Owner i admin widzą wszystkie wpisy swojej organizacji, także wpisy superadmina z trybu serwisowego i dane z `oldData` i `newData`, na przykład adresy email zaproszonych osób.

Teksty modułu leżą pod namespace `audit-logs` w `src/features/audit-logs/i18n/pl.json` i `en.json`.

<a id="szwy"></a>

## Szwy modułu

Szwy generowane, przez które moduł łączy się z aplikacją ([12](12-moduly-kitu.md#szwy-generowane)):

| Szew | Co wpina `audit-logs` |
| --- | --- |
| `modules`, `clientModules` | `src/features/audit-logs/module.ts`. |
| `authPlugins` | `authPlugin` z `src/features/audit-logs/auth.ts`. |
| `auditSinks` | `auditSink` z `src/features/audit-logs/audit-sink.ts`; jedyne ujście w kicie. |
| `moduleMessages` | `i18n/pl.json`, `i18n/en.json` pod kluczem `audit-logs`. |
| Region `wa:relations` | `auditLogs AuditLog[]` w `User` i `Organization`. |
| `moduleEnvSchemas`, `authClientPlugins`, `wa:modules`, `wa:services`, `wa:ci-integration` | Nic. |

Punkty wejścia z kontraktem są cztery: `trackAudit`, `auditActor`, ujście `AuditSink` i deklaracja `auditActions`. Pierwsze trzy leżą w rdzeniu (`src/shared/lib/audit.ts`), czwarty to pole `ModuleDef`. Istnieją w każdym projekcie, także bez modułu.

<a id="trackaudit"></a>

### Kontrakt `trackAudit`

`src/shared/lib/audit.ts`

```ts
export interface AuditEvent {
  organizationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  channel?: AuditChannel;
  credentialId?: string | null;
  serviceMode?: boolean;
}

export type AuditSink = (event: AuditEvent) => Promise<void>;
// …
export async function trackAudit(
  event: AuditEvent,
  sinks: readonly AuditSink[] = auditSinks,
): Promise<void> {
  for (const sink of sinks) {
    try {
      await sink(event);
    } catch (error) {
      logger.error("trackAudit failed", { action: event.action, error });
    }
  }
}
```

- **Co podaje kod wywołujący.** Zdarzenie z wymaganymi `organizationId`, `actorUserId`, `action` i `entityType`. Pozostałe pola są opcjonalne; ujście `audit-logs` zapisuje zamiast nich `entityId: null`, `channel: "WEB"`, `credentialId: null`, `serviceMode: false`, a brak `oldData` albo `newData` jako `NULL`. Organizację bierz z kontekstu (`auditActor(context)`), nigdy z wejścia od użytkownika.
- **Kiedy wołać.** Po udanym zapisie danych, przed zwróceniem wyniku. Kod kitu robi to po zapisie w Prismie; `revokeApiKeyCommand` i `deleteApiKeyCommand` wołają `trackAudit` tylko wtedy, gdy zapis zmienił wiersz (`count > 0`), więc ponowne unieważnienie klucza nie tworzy drugiego wpisu.
- **Co robi.** Woła po kolei każde ujście z `auditSinks` (rejestr w `src/modules.generated.ts`) z tym samym obiektem zdarzenia i czeka na każde.
- **Błędy.** Błąd ujścia, także synchroniczny wyjątek, trafia do logu jako `trackAudit failed` z nazwą akcji, a kolejne ujścia są wołane dalej. `trackAudit` nigdy nie rzuca, więc **awaria zapisu wpisu nie przerywa komendy i nie cofa jej zapisu** ([D40](decyzje.md#d40)). Użytkownik dostaje sukces, a brak wpisu widać tylko w logach.
- **Transakcja.** Wpis zapisuje się osobnym zapytaniem, poza transakcją komendy. Komenda, której zapis się powiódł, a zapis wpisu nie, zostawia zmianę bez śladu w dzienniku.
- **Bez modułu.** Jeśli projekt nie ma też własnego ujścia (`audit-sink.ts` w funkcji projektu), `auditSinks` jest puste: wywołanie nic nie zapisuje, nie loguje i nie zgłasza błędu (test „bez sinków → resolves undefined i nic nie loguje” w `src/shared/lib/__tests__/audit.test.ts`; sprawdzone w [12](12-moduly-kitu.md#punkty-wejscia)).
- **Bezpieczeństwo.** `audit.ts` nie ma dyrektywy `"use server"` (pilnuje tego test „nie zawiera dyrektywy use server”), więc klient nie może wywołać `trackAudit` i sam dopisać wpisu. Nie eksportuj własnej akcji serwerowej, która przyjmuje zdarzenie od klienta i przekazuje je do `trackAudit`.

<a id="auditactor"></a>

### Kontrakt `auditActor`

`auditActor(context)` z `OrgContext` zwraca `{ organizationId, actorUserId, serviceMode }`: organizację aktywną, użytkownika z sesji i znacznik trybu serwisowego. Rozwiń wynik w zdarzeniu (`...auditActor(context)`), a wpis superadmina, który zmienia dane w trybie serwisowym, będzie miał `serviceMode: true` i znaczek „Tryb serwisowy” na stronie `/audit-log`. Zdarzenie złożone ręcznie bez `serviceMode` zapisze się z `false`, także w trybie serwisowym. Funkcja jest czysta i działa bez modułu.

Kontekst dają `getOrgContext()` i `requireModuleAccess()`; trasa z kluczem API nie ma sesji ani `OrgContext`, więc zdarzenie składa się tam ręcznie ([Zapis z trasy z kluczem API](13b-modul-audit-logs-uzycie.md#kanal-api)).

<a id="ujscie"></a>

### Ujście `AuditSink`

Ujście to funkcja `(event: AuditEvent) => Promise<void>` wyeksportowana jako `auditSink` z pliku `src/features/<x>/audit-sink.ts`. `wa generate` dopisuje ją do `auditSinks`, po ujściach modułów kitu, w kolejności rejestracji feature ([12](12-moduly-kitu.md#szwy-generowane)). Ujście `audit-logs`:

`src/features/audit-logs/audit-sink.ts`

```ts
import type { AuditSink } from "@/shared/lib/audit";
import { writeAuditLog } from "./services/write-audit-log";

export const auditSink: AuditSink = writeAuditLog;
```

Własne ujście (na przykład wysyłka zdarzeń do zewnętrznego systemu) dostaje zdarzenie **przed redakcją**: redakcję robi tylko `writeAuditLog`. Ujście, które zapisuje albo wysyła `oldData` i `newData`, musi samo je zredagować, na przykład przez `redactSensitive` (import z modułu `audit-logs`, czyli tylko w projekcie z modułem). Ujście dostaje ten sam obiekt co inne ujścia, więc go nie modyfikuje. Długo działające ujście opóźnia każdą komendę, która woła `trackAudit`, bo `trackAudit` czeka na każde ujście po kolei.

<a id="auditactions"></a>

### Deklaracja `auditActions`

Pole `auditActions?: { action: string; labelKey: string }[]` w `defineModule` mówi, jak wyświetlić akcję. `findAuditActionLabel` przegląda rejestr modułów i bierze pierwszą deklarację z pasującym `action`; etykieta to klucz `labelKey` w namespace równym `key` modułu, który akcję zadeklarował.

- **Kto deklaruje.** Moduł, który akcję zapisuje, we własnym `module.ts`, z kluczem w swoim `i18n/pl.json` i `en.json`. `key` modułu musi być równy nazwie katalogu feature, bo pod tą nazwą rejestrowane są tłumaczenia ([D27](decyzje.md#d27)).
- **Kto czyta.** Strona `/audit-log` (etykiety w tabeli i lista filtra „Akcja”) i `<AuditTrail>`.
- **Brak deklaracji.** Akcja wyświetla się jako surowy napis (na przykład `delivery.accepted`) i nie ma jej na liście filtra. Zapis działa bez zmian: deklaracja nie jest warunkiem zapisu ani walidacją.
- **Brak klucza w tłumaczeniach.** next-intl zgłasza `MISSING_MESSAGE` i pokazuje ścieżkę klucza zamiast etykiety.
- **Ta sama akcja w dwóch modułach.** Wygrywa moduł wcześniej w rejestrze: najpierw rdzeń, potem moduły kitu, potem moduły projektu.
- **Bez modułu.** Nikt nie czyta pola; deklaracja przechodzi typecheck i nic nie robi ([12](12-moduly-kitu.md#punkty-wejscia)).

<a id="zapis"></a>

### Zapis wpisu i redakcja

`writeAuditLog` mapuje zdarzenie na wiersz: `actorUserId` na `userId`, brakujące pola na wartości domyślne z [Kontraktu `trackAudit`](#trackaudit), a `oldData` i `newData` przepuszcza przez `redactSensitive`.

`src/features/audit-logs/services/write-audit-log.ts`

```ts
export async function writeAuditLog(event: AuditEvent): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: event.organizationId,
      userId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      oldData: toJson(event.oldData),
      newData: toJson(event.newData),
      channel: event.channel ?? "WEB",
      credentialId: event.credentialId ?? null,
      serviceMode: event.serviceMode ?? false,
    },
  });
}
```

<a id="redakcja"></a>

**Redakcja danych wrażliwych** (`src/features/audit-logs/services/redact.ts`, [D41](decyzje.md#d41)). Wpis czyta owner i admin organizacji, więc przed zapisem `redactSensitive` zastępuje napisem `"[REDACTED]"` wartość każdego klucza wrażliwego, na każdej głębokości obiektów i tablic:

- klucz jest wrażliwy, gdy po zmianie na małe litery i usunięciu `-` i `_` zawiera jeden z fragmentów `password`, `secret`, `token`, `apikey`, `authorization`, `cookie`, `privatekey`, `hashedkey`; redagowane są więc też `newPassword`, `client_secret`, `X-API-Key`, `set-cookie`, `passwordHint` i `tokens`;
- wartość klucza wrażliwego znika w całości, także gdy jest obiektem;
- obiekt z metodą `toJSON` (poza `Date`) jest zastępowany zredagowanym wynikiem `toJSON()`, czyli tym, co zapisałby `JSON.stringify`; dotyczy to instancji klas i zwykłych obiektów z własną funkcją `toJSON`;
- instancja klasy bez `toJSON` staje się zwykłym obiektem z redakcją jej pól; obiekt z prototypem `null` też jest redagowany;
- `Date` zostaje datą, napisy, liczby, `null` i `undefined` przechodzą bez zmian; wejście nie jest modyfikowane.

**Czego redakcja nie wykryje.** Działa po nazwie klucza. Sekret pod neutralną nazwą (`value`, `code`, `pin`) albo wewnątrz napisu (`"Bearer abc"` w polu `header`) zostanie zapisany i pokazany ownerowi i adminowi. Do `oldData` i `newData` przekazuj tylko pola, które mają być w dzienniku, a nie cały rekord z bazy. Dane osobowe (email, imię) nie są redagowane: `member.invited` zapisuje email zaproszonej osoby.

<a id="zdarzenia"></a>

### Zdarzenia rdzenia i modułów kitu

Pięć zdarzeń organizacji łapie plugin better-auth modułu (`src/features/audit-logs/auth.ts`, [D42](decyzje.md#d42)): hook `after` dla ścieżek z `AUDITED_ORGANIZATION_PATHS` buduje zdarzenie z odpowiedzi endpointu i woła `trackAudit`, a hook `before` dla `/organization/update-member-role` odczytuje poprzednią rolę członka. Organizacja wpisu pochodzi z odpowiedzi endpointu, nie z ciała żądania. Endpoint, który zakończył się błędem (na przykład zła rola zaproszenia), nie tworzy wpisu. Pozostałe zdarzenia woła kod rdzenia i modułów kitu bezpośrednio.

| Akcja | `entityType`, `entityId` | Dane | Kto zapisuje i kiedy |
| --- | --- | --- | --- |
| `member.invited` | `invitation`, id zaproszenia | `newData: { email, role }` | Plugin, `/organization/invite-member`. Rdzeń, `inviteUserCommand` (strona „Użytkownicy”) po udanej rejestracji konta, autor to admin z `getOrgContext()`; w trybie serwisowym wpis ma `serviceMode: true`. Gdy rejestracja się nie uda, komenda usuwa zaproszenie i wpisu nie ma. |
| `invitation.canceled` | `invitation`, id zaproszenia | brak | Plugin, `/organization/cancel-invitation`. |
| `invitation.accepted` | `invitation`, id zaproszenia | brak | Plugin, `/organization/accept-invitation` (strona przyjęcia zaproszenia), autor to osoba przyjmująca. Rdzeń, `joinOrganizationCommand` przy rejestracji z zaproszeniem, autor to nowy użytkownik. |
| `member.role_changed` | `member`, id członkostwa | `oldData: { role }` (gdy poprzednia rola znana), `newData: { role }` | Plugin, `/organization/update-member-role`. |
| `member.removed` | `member`, id członkostwa | `oldData: { userId, role }` | Plugin, `/organization/remove-member`. |
| `organization.entered` | `organization`, id organizacji | `serviceMode: true` | Rdzeń, gdy superadmin wchodzi do organizacji bez członkostwa: `enterOrganizationCommand` (przełącznik i `/no-organization`) oraz hook `databaseHooks.session.create.after` przez `trackServiceModeEntry`, gdy nowa sesja (logowanie) dostaje taką organizację jako aktywną. |
| `api_key.created` | `api_key`, id klucza | `newData: { name, scopes, displayPrefix }` | `api-keys`, `createApiKeyCommand`. |
| `api_key.revoked`, `api_key.deleted` | `api_key`, id klucza | `oldData: { name, displayPrefix }` | `api-keys`, `revokeApiKeyCommand` i `deleteApiKeyCommand`, tylko gdy zapis zmienił wiersz. |
| `upload.created` | `upload`, id pliku | `newData: { purpose, key, size }` | `uploads`, `createUpload` (trasa `POST /api/uploads`). |
| `upload.deleted` | `upload`, id pliku | `oldData: { purpose, key, size }` | `uploads`, `deleteUploadCommand`. |

Zdarzenia z pluginu nie mają `serviceMode` i zapisują się z `false`. Superadmin w trybie serwisowym nie wywoła tych endpointów, bo better-auth wymaga członkostwa ([04b](04b-superadmin-i-tryb-serwisowy.md#authclient-organization)). Żaden kod kitu nie zapisuje kanału `API` ani `credentialId`: trasa `GET /api/v1/organization` modułu `api-keys` nie zapisuje zdarzeń. Te pola wypełnia kod projektu ([Zapis z trasy z kluczem API](13b-modul-audit-logs-uzycie.md#kanal-api)). Etykiety akcji `api_key.*` i `upload.*` deklarują moduły `api-keys` i `uploads` ([14](14-modul-api-keys.md), [15](15-modul-uploads.md)).

Dalej: użycie modułu we własnym kodzie, bezpieczeństwo, testowanie, typowe problemy i referencja w [13b-modul-audit-logs-uzycie.md](13b-modul-audit-logs-uzycie.md).
