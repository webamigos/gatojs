# Moduły opcjonalne kitu

Po przeczytaniu będziesz wiedzieć:

- czym moduł opcjonalny różni się od rdzenia i jak go dodać do projektu albo usunąć z niego;
- co daje moduł `audit-logs`: model `AuditLog`, stronę `/audit-log`, komponent `<AuditTrail>` i zdarzenia, które loguje sam;
- jak działa wspólny punkt wejścia `trackAudit` z rdzenia, jeśli moduł nie jest zainstalowany, i jak działa lista ujść (`auditSinks`);
- co robi redakcja danych wrażliwych i dlaczego moduł nie ma retencji;
- co daje moduł `api-keys`: klucze API organizacji, zakresy, uwierzytelnianie tras, limit kluczy i pepper;
- co daje moduł `uploads`: pliki organizacji w magazynie S3, cele uploadu deklarowane przez moduły, walidacja i skalowanie obrazów, trasy `/api/uploads`, komponent `<FileUpload>` i zmienne S3.

Zweryfikowano z kodem: 09744c4, 2026-10-29

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
- `src/features/api-keys/services/organization-api.ts`
- `src/features/api-keys/services/commands/api-key-commands.ts`
- `src/features/api-keys/services/queries/api-key-queries.ts`
- `src/app/api/v1/organization/route.ts`
- `src/app/[locale]/(app)/api-keys/page.tsx`
- `kit/modules/uploads.json`
- `prisma/schema/uploads.prisma`
- `docker/uploads.compose.yml`
- `ci/uploads.integration-steps.yml`
- `src/features/uploads/module.ts`
- `src/features/uploads/env.ts`
- `src/features/uploads/components/file-upload.tsx`
- `src/features/uploads/services/storage.ts`
- `src/features/uploads/services/upload-purposes.ts`
- `src/features/uploads/services/validate-upload.ts`
- `src/features/uploads/services/prepare-upload-body.ts`
- `src/features/uploads/services/content-disposition.ts`
- `src/features/uploads/services/api-org-context.ts`
- `src/features/uploads/services/commands/create-upload.ts`
- `src/features/uploads/services/commands/upload-commands.ts`
- `src/features/uploads/services/queries/read-upload.ts`
- `src/app/api/uploads/route.ts`
- `src/app/api/uploads/[id]/route.ts`
- `src/test/integration/setup-env.ts`

## Moduł kitu a rdzeń

Rdzeń (`core`) ma każdy projekt. Moduł opcjonalny to osobny wpis w `.wa/kit.json` z manifestem plików (`kit/modules/<nazwa>.json`), który projekt instaluje przez `wa create --modules <nazwa>` albo `npm run wa -- add <nazwa>` i usuwa przez `wa remove <nazwa>` ([kit/README.md](../kit/README.md)). Po instalacji i usunięciu zmienia się schemat bazy, więc migrację tworzy i commituje projekt ([03b](03b-schemat-i-migracje.md#migracje)).

Rdzeń nie importuje plików modułów opcjonalnych. Łączą się przez pliki generowane ([02b](02b-rejestr-i-generator.md#rejestr-modulow)): `wa generate` dopisuje moduł do tablicy `modules` w `src/modules.generated.ts`, a pliki `auth.ts` i `audit-sink.ts` modułu do tablic `authPlugins` i `auditSinks`. Rdzeń czyta te tablice, więc działa tak samo z modułem i bez niego.

Instalowanych kombinacji pilnuje job `assemble` w `.github/workflows/kit.yml`: dla każdego wpisu macierzy `combo` składa projekt z kitu i uruchamia w nim bramki. Macierz zawiera kombinacje `core` (sam rdzeń), `audit-logs`, `api-keys`, `uploads` i `all` (`audit-logs,api-keys,uploads`). Dla kombinacji z `uploads` job przed testami integracyjnymi uruchamia MinIO i tworzy bucket `matrix-app-uploads`, a obraz Dockera buduje dla `core` i `all`.

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
| Zmienna | `src/features/api-keys/env.ts` | `API_KEY_PEPPER`: min. 32 znaki; na produkcji wartość z `.env.example` jest odrzucana, a błąd walidacji dotyczy całej aplikacji ([Pepper](#pepper)). |
| Sekret | `src/features/api-keys/services/api-key-secret.ts` | Klucz ma postać `<slug>_live_<32 bajty w base64url>` (myślniki ze sluga zamieniane na `_`). W bazie leży tylko HMAC-SHA256 klucza z pepperem i krótki `displayPrefix`. |
| Zakresy | `src/features/api-keys/module.ts`, `services/api-scopes.ts` | Moduł deklaruje zakresy w `apiScopes` (`{ key, labelKey }`). Moduł `api-keys` deklaruje `organization:read`. `knownApiScopes()` zbiera zakresy wszystkich zainstalowanych modułów z `modules`. |
| Uwierzytelnianie | `src/features/api-keys/services/authenticate-api-key.ts` | `authenticateApiKey(request, scope)`. |
| Komendy | `src/features/api-keys/services/commands/api-key-commands.ts` | `createApiKeyCommand`, `revokeApiKeyCommand`, `deleteApiKeyCommand`: przez `requireModuleAccess("api-keys")`, z potwierdzeniem trybu serwisowego. |
| Strona | `src/app/[locale]/(app)/api-keys/page.tsx` | Strona `/api-keys` dla ról `owner` i `admin` organizacji: lista kluczy, tworzenie, unieważnianie, usuwanie. |
| Trasa przykładowa | `src/app/api/v1/organization/route.ts` | `GET /api/v1/organization` ze scope `organization:read`: zwraca `id`, `name` i `slug` organizacji klucza. |

### Cykl życia klucza

Klucz tworzy `owner` albo `admin` na stronie `/api-keys`: podaje nazwę, zakresy i opcjonalny termin ważności w dniach. Pełny klucz jest pokazany raz, w odpowiedzi komendy `createApiKeyCommand`; później widać tylko `displayPrefix`. Organizacja może mieć najwyżej 10 aktywnych kluczy (nieunieważnionych i niewygasłych). Limit sprawdza transakcja pod blokadą doradczą (`pg_advisory_xact_lock` po `organizationId`), więc równoległe tworzenie nie przekroczy limitu. Powyżej limitu komenda zwraca błąd „Osiągnięto limit 10 aktywnych kluczy”.

Unieważnienie (`revokedAt`) ustawia się raz; powtórne unieważnienie niczego nie zmienia. Usunięcie kasuje wiersz. Komendy działają na danych organizacji, więc w trybie serwisowym superadmin musi je potwierdzić ([09b](09b-implementacja-i-bramki.md#komenda)). Zapisują wpis audytu: `api_key.created`, `api_key.deleted` i `api_key.revoked`; powtórne unieważnienie już unieważnionego klucza jest no-opem bez wpisu audytu.

### `authenticateApiKey`

`authenticateApiKey(request, requiredScope)` czyta nagłówek `Authorization: Bearer <klucz>`, liczy HMAC klucza i szuka go w `api_keys`. Wynik to:

- `{ ok: true, context: { organizationId, apiKeyId, scopes } }`, gdy klucz jest ważny i ma wymagany zakres;
- `{ ok: false, status: 401, error }` z `error` równym `missing` (brak nagłówka albo pusty token), `invalid` (nieznany klucz), `revoked` albo `expired`;
- `{ ok: false, status: 403, error: "scope" }`, gdy klucz nie ma wymaganego zakresu.

Zakresy klucza są przecinane z `knownApiScopes()`: zakres zapisany w kluczu, którego żaden zainstalowany moduł już nie deklaruje (na przykład po usunięciu modułu), nie daje dostępu. Po udanym uwierzytelnieniu `lastUsedAt` jest aktualizowany w tle, a jego błąd jest tylko logowany. Odpowiedzi tras z kluczem mają nagłówek `Cache-Control: no-store`. Jak napisać własną trasę: [09b, sekcja o trasach API](09b-implementacja-i-bramki.md#trasy-api).

### Pepper

Klucze są haszowane HMAC-SHA256 z `API_KEY_PEPPER`. Zmiana peppera unieważnia wszystkie istniejące klucze: ich hasze przestają pasować, a trasy zwracają `invalid`. Rotacja peppera to więc świadoma operacja: wszystkie organizacje muszą wystawić nowe klucze.

`wa create` nie losuje peppera: `.env.example` zawiera wartość przykładową, więc musisz ustawić własną przed wdrożeniem na produkcję (losowy ciąg, min. 32 znaki, w zmiennych usługi na Railway, [10-wdrozenie.md](10-wdrozenie.md#zmienne)) i nie zmieniać jej bez potrzeby.

Uwaga: zmienna należy do schematu env całej aplikacji. Na produkcji brak peppera, wartość krótsza niż 32 znaki albo przykładowa psuje walidację `env` w całej aplikacji: każda strona i akcja odczytująca `env` kończy się błędem 500, a healthcheck dalej odpowiada 200, więc wdrożenie wygląda na udane ([10-wdrozenie.md](10-wdrozenie.md#blad-env)).

## `uploads`

Pliki organizacji w magazynie zgodnym z S3: komponent do wysyłania, trasy do zapisu i odczytu oraz cele uploadu, które deklarują moduły. Moduł wymaga tylko rdzenia (`requires` jest puste). `audit-logs` nie jest potrzebny, ale jeśli jest zainstalowany, zapisuje zdarzenia `upload.created` i `upload.deleted`.

| Część | Plik | Co robi |
| --- | --- | --- |
| Model | `prisma/schema/uploads.prisma` | Tabela `uploads` z modelem `Upload` (organizacja, opcjonalny `uploadedById`, `purpose`, unikalny `key`, `fileName`, `mimeType`, `size`, `visibility` `PUBLIC` albo `ORGANIZATION`, `createdAt`). Usunięcie organizacji kasuje wiersze, usunięcie użytkownika zeruje `uploadedById`. |
| Zmienne | `src/features/uploads/env.ts` | `S3_ENDPOINT`, `S3_REGION` (domyślnie `auto`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` (`true` albo `false`). Bez wymaganej zmiennej walidacja `env` całej aplikacji zgłasza błąd. |
| Magazyn | `src/features/uploads/services/storage.ts` | `putObject`, `getObject`, `deleteObject` na kliencie `@aws-sdk/client-s3`. Obiekt leży pod kluczem `orgs/<organizationId>/<purpose>/<id>.<rozszerzenie>`. |
| Cele | `src/features/uploads/module.ts`, `services/upload-purposes.ts` | Moduł deklaruje cele w `uploadPurposes`. Moduł `uploads` deklaruje wbudowany cel `editor-image`. |
| Zapis | `src/app/api/uploads/route.ts`, `services/commands/create-upload.ts` | `POST /api/uploads`. |
| Odczyt | `src/app/api/uploads/[id]/route.ts`, `services/queries/read-upload.ts` | `GET /api/uploads/<id>`. |
| Usuwanie | `src/features/uploads/services/commands/upload-commands.ts` | `deleteUploadCommand`. |
| Komponent | `src/features/uploads/components/file-upload.tsx` | `<FileUpload purpose accept onUploaded>`. |
| Lokalnie | `docker/uploads.compose.yml` | Usługi `minio` i `minio-init` w regionie `wa:services` pliku `docker-compose.yml` ([Uruchomienie](01-uruchomienie.md#minio)). |

Moduł nie ma własnej strony ani pozycji w menu (`nav` jest puste).

### Cele uploadu

Cel (`purpose`) opisuje, co wolno wysłać i kto potem plik zobaczy. Moduł deklaruje go w `defineModule({ uploadPurposes })` jako obiekt z polami:

- `key`: unikalna nazwa celu; powtórzenie klucza przez dwa moduły albo cel z zakazanym typem rzuca błąd przy pierwszym użyciu `listUploadPurposes()`;
- `mimeTypes`: dozwolone typy; typ pliku wykrywa `file-type` po zawartości, a nie po nazwie ani nagłówku `Content-Type` żądania;
- `maxBytes`: limit rozmiaru w bajtach;
- `visibility`: `"public"` albo `"organization"`;
- `resizeImage` (opcjonalnie): `{ maxWidth }`.

Typy `image/svg+xml`, `text/html` i `application/xhtml+xml` są zakazane dla każdego celu: SVG i HTML mogłyby wykonać skrypt w przeglądarce, która otworzy plik pod adresem aplikacji. Wbudowany cel `editor-image` przyjmuje `image/jpeg`, `image/png` i `image/webp` do 5 MB, jest publiczny i skaluje obrazy do 1200 px szerokości.

### `POST /api/uploads`

Żądanie `multipart/form-data` z polami `file`, `purpose` i opcjonalnym `serviceModeConfirmation` (JSON z potwierdzeniem trybu serwisowego, [09b](09b-implementacja-i-bramki.md#komenda)). Trasa odpowiada kolejno:

| Status | Kiedy |
| --- | --- |
| 411 | Brak nagłówka `Content-Length`. |
| 413 | Zadeklarowana długość przekracza największy `maxBytes` ze wszystkich celów plus 64 KB na obwiednię multipart, albo plik przekracza `maxBytes` celu (`too_large`). |
| 401 | Brak sesji. Sesję sprawdza trasa przed odczytem treści żądania. |
| 403 | Użytkownik nie ma aktywnej organizacji albo tryb serwisowy bez potwierdzenia. |
| 400 | Błędne wejście (`invalid_input`), nieznany cel (`unknown_purpose`), pusty plik (`empty`) albo obraz, którego nie da się przetworzyć (`invalid_image`). |
| 415 | Typ pliku spoza `mimeTypes` celu albo zakazany (`unsupported_type`). |
| 201 | Odpowiedź `{ id, url, fileName, mimeType, size }`, gdzie `url` to `/api/uploads/<id>`. |

Gdy zapis w magazynie albo w bazie się nie uda, trasa zwraca 500 (`storage_failed`); po nieudanym zapisie wiersza usuwa już zapisany obiekt. Udany zapis wpisuje do audytu `upload.created`.

### Obrazy

Cel z `resizeImage` przepuszcza obraz przez `sharp`: ogranicza wejście do 40 milionów pikseli, stosuje orientację z EXIF, zmniejsza szerokość do `maxWidth` (bez powiększania) i zapisuje jako JPEG z jakością 82. Zapisany plik ma więc typ `image/jpeg` i rozszerzenie `jpg` bez względu na typ wejściowy, a metadane EXIF nie trafiają do magazynu. Obraz, którego `sharp` nie przetworzy, kończy się odpowiedzią 400 `invalid_image`.

### `GET /api/uploads/<id>`

Plik z widocznością `PUBLIC` odczyta każdy, także bez sesji. Plik `ORGANIZATION` odczyta tylko użytkownik z sesją, którego aktywna organizacja jest organizacją pliku; w każdym innym przypadku trasa zwraca 404, tak samo jak dla nieistniejącego `id`, więc nie ujawnia, że plik istnieje. Odpowiedź ma `Content-Type` zapisanego typu, `X-Content-Type-Options: nosniff` i `Content-Disposition: inline` z nazwą pliku w `filename*`. `Cache-Control` to `public, max-age=31536000, immutable` dla plików publicznych i `private, max-age=300` dla plików organizacji.

Adres publicznego pliku nie wygasa i nie da się go cofnąć inaczej niż przez usunięcie pliku, a przeglądarki i pośrednicy mogą trzymać kopię rok. Cel `visibility: "public"` wybieraj tylko dla treści przeznaczonych dla każdego.

### Usuwanie

`deleteUploadCommand({ id }, confirmation?)` działa przez `getOrgContext()` i `assertServiceModeConfirmed`. Plik w innej organizacji jest dla niej nieistniejący (filtr `organizationId`). Usunąć może autor pliku, `owner` i `admin` organizacji oraz administrator globalny; pozostali dostają „Brak uprawnień do usunięcia pliku”. Komenda usuwa obiekt z magazynu (błąd usuwania jest tylko logowany), potem wiersz, i zapisuje `upload.deleted` w audycie. Wołaj ją z UI przez `useServiceModeAction().run`.

Moduł nie ma czyszczenia osieroconych plików: usunięcie encji projektu, która trzyma `id` pliku, nie usuwa pliku. Usuwa go dopiero komenda `deleteUploadCommand`, którą woła kod projektu.

### Lokalnie i w CI

Lokalnie MinIO działa w kontenerze `minio` z `docker-compose.yml`, a kontener `minio-init` tworzy bucket `<slug>-uploads` (idempotentnie, ponawia próbę do 30 razy). Obrazy to `cgr.dev/chainguard/minio:latest` i `amazon/aws-cli:latest`: `minio/minio` i `minio/mc` nie da się już pobrać. Kontener MinIO działa jako `user: "0:0"`, bo katalog `./volumes/minio` jest montowany z hosta. Porty zmieniają `MINIO_PORT` (domyślnie 9000) i `MINIO_CONSOLE_PORT` (9001). Szczegóły: [01-uruchomienie.md](01-uruchomienie.md#minio).

W CI projektu `ci/uploads.integration-steps.yml` wypełnia region `wa:ci-integration` w `.github/workflows/ci.yml`: uruchamia MinIO, czeka na jego gotowość i tworzy bucket przed testami integracyjnymi. Testy integracyjne czytają `INTEGRATION_S3_ENDPOINT` (domyślnie `http://localhost:9000`) i `INTEGRATION_S3_BUCKET` (domyślnie `<slug>-uploads`). Projekt bez `uploads` ma region pusty i nie startuje MinIO.

Jak użyć uploadu w funkcji projektu: [09b, sekcja o plikach](09b-implementacja-i-bramki.md#pliki-w-funkcji-projektu). Zmienne produkcyjne: [10-wdrozenie.md](10-wdrozenie.md#zmienne).
