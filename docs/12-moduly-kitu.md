# Moduły opcjonalne kitu

Po przeczytaniu będziesz wiedzieć:

- czym moduł opcjonalny różni się od rdzenia i jak go dodać do projektu albo usunąć z niego;
- co daje moduł `audit-logs`: model `AuditLog`, stronę `/audit-log`, komponent `<AuditTrail>` i zdarzenia, które loguje sam;
- jak działa wspólny punkt wejścia `trackAudit` z rdzenia, jeśli moduł nie jest zainstalowany, i jak działa lista ujść (`auditSinks`);
- co robi redakcja danych wrażliwych i dlaczego moduł nie ma retencji;
- co daje moduł `api-keys`: klucze API organizacji, zakresy, uwierzytelnianie tras, limit kluczy i pepper.

Zweryfikowano z kodem: 77bb337, 2026-10-29

Źródła:

- `kit/modules/audit-logs.json`
- `src/features/audit-logs/module.ts`
- `src/features/audit-logs/audit-sink.ts`
- `src/features/audit-logs/auth.ts`
- `src/features/audit-logs/components/audit-trail.tsx`
- `src/features/audit-logs/services/write-audit-log.ts`
- `src/features/audit-logs/services/redact.ts`
- `src/features/audit-logs/services/organization-audit-events.ts`
- `src/features/audit-logs/services/audit-action-labels.ts`
- `src/features/audit-logs/services/queries/audit-log-queries.ts`
- `src/features/audit-logs/services/queries/audit-trail-query.ts`
- `src/shared/lib/audit.ts`
- `src/shared/lib/modules/define-module.ts`
- `src/features/organizations/services/commands/member-commands.ts`
- `src/features/organizations/services/commands/enter-organization-command.ts`
- `prisma/schema/audit-logs.prisma`
- `.github/workflows/kit.yml`
- `kit/modules/api-keys.json`
- `prisma/schema/api-keys.prisma`
- `src/features/api-keys/module.ts`
- `src/features/api-keys/env.ts`
- `src/features/api-keys/services/api-key-secret.ts`
- `src/features/api-keys/services/api-scopes.ts`
- `src/features/api-keys/services/api-scope-labels.ts`
- `src/features/api-keys/services/authenticate-api-key.ts`
- `src/features/api-keys/services/commands/api-key-commands.ts`
- `src/features/api-keys/services/queries/api-key-queries.ts`
- `src/app/api/v1/organization/route.ts`
- `src/app/[locale]/(app)/api-keys/page.tsx`

## Moduł kitu a rdzeń

Rdzeń (`core`) ma każdy projekt. Moduł opcjonalny to osobny wpis w `.wa/kit.json` z manifestem plików (`kit/modules/<nazwa>.json`), który projekt instaluje przez `wa create --modules <nazwa>` albo `npm run wa -- add <nazwa>` i usuwa przez `wa remove <nazwa>` ([kit/README.md](../kit/README.md)). Po instalacji i usunięciu zmienia się schemat bazy, więc migrację tworzy i commituje projekt ([03b](03b-schemat-i-migracje.md#migracje)).

Rdzeń nie importuje plików modułów opcjonalnych. Łączą się przez pliki generowane ([02b](02b-rejestr-i-generator.md#rejestr-modulow)): `wa generate` dopisuje moduł do tablicy `modules` w `src/modules.generated.ts`, a pliki `auth.ts` i `audit-sink.ts` modułu do tablic `authPlugins` i `auditSinks`. Rdzeń czyta te tablice, więc działa tak samo z modułem i bez niego.

Instalowanych kombinacji pilnuje job `assemble` w `.github/workflows/kit.yml`: dla każdego wpisu macierzy `combo` składa projekt z kitu i uruchamia w nim bramki. Macierz zawiera kombinacje `core` (sam rdzeń), `audit-logs` i `api-keys`.

## `audit-logs`

Dziennik zdarzeń organizacji: kto, kiedy i co zmienił w danych organizacji. Moduł wymaga tylko rdzenia (`requires` jest puste).

| Część | Plik | Co robi |
| --- | --- | --- |
| Model | `prisma/schema/audit-logs.prisma` | Tabela `audit_logs` z modelem `AuditLog` (organizacja, opcjonalny użytkownik, `action`, `entityType`, `entityId`, `oldData`, `newData`, `channel`, `credentialId`, `serviceMode`, `createdAt`) i trzema indeksami z `organizationId`. Usunięcie organizacji kasuje wpisy, usunięcie użytkownika zeruje `userId`. |
| Ujście | `src/features/audit-logs/audit-sink.ts` | Eksportuje `auditSink`, czyli `writeAuditLog`: zapisuje zdarzenie w tabeli po redakcji danych wrażliwych. |
| Strona | `src/app/[locale]/(app)/audit-log/page.tsx` | Strona `/audit-log` chroniona przez `requireModuleAccess("audit-logs")`, dostępna dla ról `owner` i `admin` organizacji (`roles` w `module.ts`). Filtry: użytkownik, akcja, typ i id encji, zakres dat; sortowanie i paginacja. |
| Komponent | `src/features/audit-logs/components/audit-trail.tsx` | `<AuditTrail entityType entityId />`: historia jednej encji (50 ostatnich wpisów organizacji). |
| Plugin auth | `src/features/audit-logs/auth.ts` | Hooki better-auth, które logują zdarzenia członkostwa. |

### Punkt wejścia `trackAudit`

`trackAudit(event)` z `src/shared/lib/audit.ts` należy do rdzenia i woła po kolei każde ujście z `auditSinks`. Błąd ujścia jest tylko logowany (`trackAudit failed`), więc nie przerywa komendy, która go wywołała. Bez zainstalowanego `audit-logs` `auditSinks` jest puste, a `trackAudit` nic nie robi. Dzięki temu rdzeń i moduły projektu mogą go wołać bez sprawdzania, czy dziennik jest zainstalowany.

`AuditEvent` ma pola `organizationId`, `actorUserId`, `action`, `entityType` (wymagane) oraz `entityId`, `oldData`, `newData`, `channel` (`WEB` domyślnie albo `API`), `credentialId` i `serviceMode`. `auditActor(context)` wypełnia `organizationId`, `actorUserId` i `serviceMode` z kontekstu organizacji.

### Zdarzenia logowane przez moduł

| Akcja | Źródło | Encja |
| --- | --- | --- |
| `member.invited` | hook better-auth `/organization/invite-member` | `invitation` (w `newData` e-mail i rola) |
| `invitation.canceled` | hook `/organization/cancel-invitation` | `invitation` |
| `invitation.accepted` | hook `/organization/accept-invitation` oraz `joinOrganizationCommand` rdzenia (rejestracja z zaproszenia) | `invitation` |
| `member.role_changed` | hook `/organization/update-member-role` (poprzednia rola z hooka `before`) | `member` (`oldData`, `newData` z rolą) |
| `member.removed` | hook `/organization/remove-member` | `member` (w `oldData` użytkownik i rola) |
| `organization.entered` | `enterOrganizationCommand` rdzenia, tylko gdy superadmin wchodzi do organizacji bez członkostwa | `organization` |

Hooki obejmują wyłącznie ścieżki z `AUDITED_ORGANIZATION_PATHS`. Zdarzenie powstaje po udanym wywołaniu, z danych zwróconych przez better-auth. Endpointy better-auth wymagają członkostwa, więc wpisy z hooków nie mają znacznika trybu serwisowego. Znacznik `serviceMode: true` niesie tylko wpis `organization.entered` superadmina, a strona `/audit-log` oznacza go plakietką.

### Etykiety akcji

Każdy moduł deklaruje swoje akcje w `auditActions` w `module.ts` jako pary `{ action, labelKey }`. Etykietę czyta się z przestrzeni nazw tłumaczeń modułu, który akcję zadeklarował (`findAuditActionLabel` zwraca klucz modułu i `labelKey`). Akcja bez deklaracji jest wyświetlana jako surowy napis. Akcje członkostwa deklaruje `audit-logs` i trzyma ich etykiety w `src/features/audit-logs/i18n/{pl,en}.json`.

### Redakcja danych wrażliwych

Przed zapisem `oldData` i `newData` przechodzą przez `redactSensitive`: wartość pola zamienia się na `[REDACTED]`, gdy nazwa pola po normalizacji (małe litery, bez `-` i `_`) zawiera którykolwiek z fragmentów: `password`, `secret`, `token`, `apikey`, `authorization`, `cookie`, `privatekey`, `hashedkey`. Dotyczy to także obiektów zagnieżdżonych i tablic, a nazwy takie jak `accessToken`, `x-api-key` czy `client_secret` są redagowane.

### Izolacja organizacji

Strona i `<AuditTrail>` czytają wpisy przez `getOrgContext()` i zawsze filtrują po `organizationId` aktywnej organizacji. `<AuditTrail>` nie renderuje nic, gdy rola użytkownika nie ma dostępu do modułu `audit-logs`, więc można go bezpiecznie wstawić na stronie dostępnej dla szerszej grupy.

### Retencja

Moduł nie ma retencji (automatycznego usuwania starych wpisów). Dziennik rośnie bez limitu, dopóki projekt sam nie usunie wpisów.

Jak użyć dziennika w funkcji projektu: [09b, sekcja o dzienniku zdarzeń](09b-implementacja-i-bramki.md#dziennik-zdarzen).

## `api-keys`

Klucze API organizacji: zewnętrzny system wywołuje trasy projektu z nagłówkiem `Authorization: Bearer <klucz>`, a trasa dostaje organizację i zakresy klucza. Moduł wymaga tylko rdzenia (`requires` jest puste). `audit-logs` nie jest potrzebny, ale jeśli jest zainstalowany, zapisuje zdarzenia kluczy.

| Część | Plik | Co robi |
| --- | --- | --- |
| Model | `prisma/schema/api-keys.prisma` | Tabela `api_keys` z modelem `ApiKey` (organizacja, opcjonalny twórca, `name`, `displayPrefix`, unikalny `hashedKey`, `scopes`, `lastUsedAt`, `expiresAt`, `revokedAt`). Usunięcie organizacji kasuje klucze, usunięcie użytkownika zeruje `createdById`. |
| Zmienna | `src/features/api-keys/env.ts` | `API_KEY_PEPPER`: min. 32 znaki; na produkcji wartość z `.env.example` jest odrzucana. |
| Sekret | `src/features/api-keys/services/api-key-secret.ts` | Klucz ma postać `<slug>_live_<32 bajty w base64url>` (myślniki ze sluga zamieniane na `_`). W bazie leży tylko HMAC-SHA256 klucza z pepperem i krótki `displayPrefix`. |
| Zakresy | `src/features/api-keys/module.ts`, `services/api-scopes.ts` | Moduł deklaruje zakresy w `apiScopes` (`{ key, labelKey }`). Moduł `api-keys` deklaruje `organization:read`. `knownApiScopes()` zbiera zakresy wszystkich zainstalowanych modułów z `modules`. |
| Uwierzytelnianie | `src/features/api-keys/services/authenticate-api-key.ts` | `authenticateApiKey(request, scope)`. |
| Komendy | `src/features/api-keys/services/commands/api-key-commands.ts` | `createApiKeyCommand`, `revokeApiKeyCommand`, `deleteApiKeyCommand`: przez `requireModuleAccess("api-keys")`, z potwierdzeniem trybu serwisowego. |
| Strona | `src/app/[locale]/(app)/api-keys/page.tsx` | Strona `/api-keys` dla ról `owner` i `admin` organizacji: lista kluczy, tworzenie, unieważnianie, usuwanie. |
| Trasa przykładowa | `src/app/api/v1/organization/route.ts` | `GET /api/v1/organization` ze scope `organization:read`: zwraca `id`, `name` i `slug` organizacji klucza. |

### Cykl życia klucza

Klucz tworzy `owner` albo `admin` na stronie `/api-keys`: podaje nazwę, zakresy i opcjonalny termin ważności w dniach. Pełny klucz jest pokazany raz, w odpowiedzi komendy `createApiKeyCommand`; później widać tylko `displayPrefix`. Organizacja może mieć najwyżej 10 aktywnych kluczy (nieunieważnionych i niewygasłych). Limit sprawdza transakcja pod blokadą doradczą (`pg_advisory_xact_lock` po `organizationId`), więc równoległe tworzenie nie przekroczy limitu. Powyżej limitu komenda zwraca błąd „Osiągnięto limit 10 aktywnych kluczy”.

Unieważnienie (`revokedAt`) ustawia się raz; powtórne unieważnienie niczego nie zmienia. Usunięcie kasuje wiersz. Komendy działają na danych organizacji, więc w trybie serwisowym superadmin musi je potwierdzić ([09b](09b-implementacja-i-bramki.md#komenda)). Każda z nich zapisuje wpis audytu: `api_key.created`, `api_key.revoked`, `api_key.deleted`.

### `authenticateApiKey`

`authenticateApiKey(request, requiredScope)` czyta nagłówek `Authorization: Bearer <klucz>`, liczy HMAC klucza i szuka go w `api_keys`. Wynik to:

- `{ ok: true, context: { organizationId, apiKeyId, scopes } }`, gdy klucz jest ważny i ma wymagany zakres;
- `{ ok: false, status: 401, error }` z `error` równym `missing` (brak nagłówka albo pusty token), `invalid` (nieznany klucz), `revoked` albo `expired`;
- `{ ok: false, status: 403, error: "scope" }`, gdy klucz nie ma wymaganego zakresu.

Zakresy klucza są przecinane z `knownApiScopes()`: zakres zapisany w kluczu, którego żaden zainstalowany moduł już nie deklaruje (na przykład po usunięciu modułu), nie daje dostępu. Po udanym uwierzytelnieniu `lastUsedAt` jest aktualizowany w tle, a jego błąd jest tylko logowany. Odpowiedzi tras z kluczem mają nagłówek `Cache-Control: no-store`. Jak napisać własną trasę: [09b, sekcja o trasach API](09b-implementacja-i-bramki.md#trasy-api).

### Pepper

Klucze są haszowane HMAC-SHA256 z `API_KEY_PEPPER`. Zmiana peppera unieważnia wszystkie istniejące klucze: ich hasze przestają pasować, a trasy zwracają `invalid`. Rotacja peppera to więc świadoma operacja: wszystkie organizacje muszą wystawić nowe klucze.

`wa create` nie losuje peppera: `.env.example` zawiera wartość przykładową, którą na produkcji odrzuca walidacja env. Przed wdrożeniem ustaw własną wartość (losowy ciąg, min. 32 znaki) w zmiennych usługi na Railway ([10-wdrozenie.md](10-wdrozenie.md)) i nie zmieniaj jej bez potrzeby.
