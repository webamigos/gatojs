# Testy

Po przeczytaniu będziesz wiedzieć:

- jakie rodzaje testów ma kit, co jest w każdym z nich prawdziwe, a co zastąpione, i jak go uruchomić;
- które komendy czyszczą albo przebudowują bazę, którą bazę ruszają i co je zatrzymuje przed bazą deweloperską;
- kiedy dopisać test izolacji organizacji i jak go zbudować na prawdziwym Postgresie;
- co sprawdzają testy architektury repo i jak dodać nowy;
- czego potrzebują testy e2e i co robią przed pierwszym testem;
- które testy działają w `npm run verify`, a które tylko w osobnych jobach CI.

Zweryfikowano z kodem: b0f6382, 2026-11-21 ([testy architektury](#architektura)); 6c05f1f, 2026-11-05 (magazyn plików modułu `uploads` w testach integracyjnych i e2e, [uruchomienie e2e przez agenta AI](#e2e-agent)); pozostałe sekcje: 25adbb8, 2026-10-28

Źródła:

- `package.json`
- `next.config.ts`
- `docker-compose.yml`
- `prisma.config.ts`
- `scripts/admin-create.ts`
- `vitest.config.ts`
- `vitest.setup.ts`
- `vitest.integration.config.ts`
- `src/test/fake-prisma.ts`
- `src/test/integration/`
- `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts`
- `playwright.config.ts`
- `e2e/`
- `packages/gato-cli/vitest.config.ts`
- `packages/gato-cli/vitest.setup.ts`
- `turbo.json`
- `.claude/hooks/block-comments.test.mjs`
- `.claude/hooks/protect-tests.test.mjs`
- `src/__tests__/architecture/`
- `scripts/lib/architecture/`
- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`
- `.github/workflows/mutation.yml`

Proces testów adwersarialnych (`test-writer`, `test-reviewer`, hook `protect-tests`), Stryker i bramkę mutacji opisuje [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md). Test architektury punktów wejścia serwera opisuje [06-wzorce-kodu.md](06-wzorce-kodu.md#test-architektury).

<a id="rodzaje"></a>

## Rodzaje testów

Każdy rodzaj testu zastępuje inną część systemu, więc każdy łapie inne błędy. Test jednostkowy, w którym Prisma to mock `vi.fn()`, sprawdzi kolejność kroków komendy, ale nie zauważy brakującego filtra `organizationId`, bo mock zwraca dane przygotowane przez test bez względu na `where`. Brakujący filtr wychwyci dopiero test integracyjny na prawdziwej bazie z dwiema organizacjami.

| Rodzaj | Co jest prawdziwe, a co zastąpione | Gdzie leżą | Komenda | Baza | W `npm run verify` |
| --- | --- | --- | --- | --- | --- |
| Jednostkowe i komponentowe | Prawdziwy kod funkcji albo komponent React w jsdom (przeglądarka symulowana w Node). Zastąpione: Prisma, sesja better-auth, Next.js, mail. | `__tests__/` obok kodu w `src/` i `scripts/lib/`, także `e2e/__tests__/` | `npm test` | nie | tak |
| Test architektury | Składnia plików z `src/`. Sprawdza, czy punkty wejścia serwera wołają guardy przed Prismą ([D24](decyzje.md#d24)). | `src/__tests__/server-entrypoints-guard.test.ts` | `npm test` | nie | tak |
| Testy architektury repo | Prawdziwe pliki projektu na dysku: instrukcje agentów, tłumaczenia, `.env.example`, wersja Node, importy plików klienckich ([D50](decyzje.md#d50), [niżej](#architektura)). | `src/__tests__/architecture/` | `npm test` | nie | tak |
| Integracyjne | Prawdziwe: Postgres, Prisma, query, komendy i guardy, a w testach modułu `uploads` także magazyn S3 (MinIO). Zastąpione: nagłówki i przekierowania Next.js, język z next-intl, `auth.api.getSession`. | `*.integration.test.ts` | `npm run test:integration` | `_test`, czyści | nie |
| E2E | Cała aplikacja po buildzie produkcyjnym, przeglądarka Chromium, baza i mailpit. Nic nie jest zastąpione. | `e2e/*.spec.ts` | `npm run test:e2e` | `_e2e`, kasuje | nie |
| CLI | Generator i komendy `wa` na kopii plików w katalogu tymczasowym systemu. Tylko w repozytorium kitu. | `packages/gato-cli/src/**/__tests__/` | `npm test --prefix packages/gato-cli` | nie | nie (bramka CLI) |
| Hooki Claude Code | Funkcje i skrypty hooków z `.claude/hooks/`, także uruchamiane jako osobne procesy. | `.claude/hooks/*.test.mjs` | `npm run test:hooks` | nie | tak |
| Mutacyjne (Stryker) | Testy jednostkowe albo integracyjne uruchamiane na kodzie z celowo wstrzykniętymi błędami ([08b](08b-testy-adwersarialne.md#stryker)). | konfiguracja w katalogu głównym | `npm run test:mutation` i pokrewne | integracyjny: `_test`, czyści | nie |

`npm run verify` to bramka `verify`, którą uruchamiasz przed oddaniem pracy: lint, typecheck, `npm test`, build, `turbo run test typecheck lint` (skrypty pakietów w workspace `packages/*`; w repozytorium GatoJS to pakiet narzędzia `packages/gato-cli`, którego pełna bramka to `npm run verify --prefix packages/gato-cli`) oraz testy hooków. Testów integracyjnych, e2e i mutacyjnych nie uruchamia, bo wymagają bazy albo przeglądarki, a pełny przebieg mutacyjny trwa około godziny (2026-11-02, 8 rdzeni, bez cache przyrostowego: unitowy 38 minut, integracyjny 20 minut). Integracyjne i e2e działają w osobnych jobach CI, a mutacyjne tylko lokalnie albo po ręcznym uruchomieniu workflowu ([CI](#ci)), więc przed oddaniem zmiany w query, komendzie albo przepływie logowania uruchom je sam.

<a id="jednostkowe"></a>

## Testy jednostkowe i komponentowe

`npm test` uruchamia Vitest z `vitest.config.ts`. Najważniejsze ustawienia:

- **Środowisko `jsdom`** dla plików projektu `app`, żeby testy komponentów mogły renderować React. Plik, który potrzebuje czystego Node, zaczyna się od dyrektywy `// @vitest-environment node` (tak robi test architektury).
- **`vitest.setup.ts`** dodaje matchery Testing Library dla DOM (na przykład `toBeInTheDocument`) i wczytuje `.env.local` oraz `.env` przez dotenv. Testy widzą więc `DATABASE_URL` z `.env`, ale z bazą się nie łączą, bo Prisma jest w nich zastąpiona. W procesach Strykera (ze zmienną `STRYKER_MUTATOR_WORKER`) ustawia też stały seed testów właściwości ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#seed)).
- **Pliki:** projekt Vitest `app` obejmuje `src/**/*.test.ts`, `src/**/*.test.tsx`, `scripts/**/*.test.ts` i `e2e/**/*.test.ts`, a projekt `packages` (środowisko `node`) testy pakietów projektu `packages/*/src/**/*.test.ts` bez pakietów narzędzi `packages/gato-cli` i `packages/create-gato-app`, które mają własną konfigurację ([ADR-56](adrs/56-workspace-packages-replace-d29.md)). Pominięte są `*.integration.test.ts`, `packages/**` (w projekcie `app`), `kit/**`, `docs/**`, `.gato/**`, `.superpowers/**` i `.stryker-tmp/**` (kopie projektu robione przez Strykera).
- **`globals: true`** udostępnia `describe`, `it` i `expect` bez importu, a **`clearMocks: true`** czyści historię wywołań mocków przed każdym testem.
- **Alias `server-only`** wskazuje pusty plik `empty.js` z pakietu `server-only`, więc pliki serwerowe z `import "server-only"` dają się zaimportować w teście.

W testach jednostkowych zastępuje się tylko wejście i wyjście: Prismę, mail, sieć i `auth.api` better-auth. Plik z regułą bezpieczeństwa, którą test sprawdza, zostaje prawdziwy. Na przykład `src/shared/lib/auth/__tests__/helpers.test.ts` sprawdza regułę roli admina w `getAdminUserOrNull` na prawdziwym `helpers.ts` i podstawia tylko wejścia: nagłówki (`next/headers`), język (`next-intl/server`), `redirect` (`@/i18n/routing`) i `auth.api.getSession`. Testy komend, które z tej reguły korzystają (na przykład `invite-user-command.test.ts`), podstawiają cały `helpers.ts`, bo samą regułę sprawdza jej własny test. Zanim ten test powstał, roli admina nie sprawdzało nic ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#dlaczego)).

Prismę podstawia się na dwa sposoby:

- **`vi.mock("@/shared/lib/prisma", …)`** z funkcjami `vi.fn()`, gdy test sprawdza kolejność kroków i przekazane dane, na przykład `src/features/users/services/commands/__tests__/invite-user-command.test.ts`.
- **`createFakePrisma`** z `src/test/fake-prisma.ts`, gdy test ma sprawdzić, że `where` naprawdę filtruje. To Prisma w pamięci dla tabel `users`, `organizations`, `members` i `sessions`: wylicza `where` (`AND`, `OR`, `NOT`, `equals`, `in`, `notIn`, `not`, relacje `some`, `none`, `every` i `is`), `orderBy`, `select`, `include`, `take` i `skip`. Ma `findMany`, `findFirst`, `findUnique`, ich warianty `OrThrow`, `count`, `update`, `updateMany` i `$transaction`, ale nie ma `create` ani `delete`. Nieobsługiwany operator kończy się błędem `fake-prisma: nieobsługiwany operator …`, więc test nie przejdzie po cichu. Używają jej testy `enter-organization-command.test.ts`, `default-organization-query.test.ts` i `switchable-organizations-query.test.ts`.

<a id="testy-rdzenia"></a>Testy rdzenia, które porównują rejestr modułów z listą wpisaną literałem, biorą z niego tylko pięć modułów rdzenia: `access-matrix.test.ts` i `nav.test.ts` przez `coreClientModules` z `src/test/core-modules.ts` (`clientModules` przefiltrowany do `CORE_MODULE_KEYS`), a `app-sidebar.test.tsx` przez własny `vi.mock("@/modules.client.generated", …)` z tymi samymi pięcioma kluczami. Moduły kitu i funkcje projektu nie zmieniają więc ich oczekiwanych wartości; spójność całego rejestru sprawdza `registry-consistency.test.ts` ([09b-implementacja-i-bramki.md](09b-implementacja-i-bramki.md#testy-rdzenia)).

Testy komponentów renderują je w `NextIntlClientProvider` z tekstami rdzenia i feature, na przykład przez pomocnik `src/features/auth/components/__tests__/helpers/render.tsx`.

Jeden plik uruchomisz komendą `npx vitest run <ścieżka>`, a tryb obserwowania zmian komendą `npm run test:watch`.

<a id="integracyjne"></a>

## Testy integracyjne

Testy integracyjne sprawdzają query, komendy i guardy na prawdziwym Postgresie. Są w plikach `*.integration.test.ts` i nie wchodzą do `npm test`. Rdzeń ma jeden taki plik, test izolacji organizacji ([Test izolacji organizacji](#izolacja)). Moduły kitu dokładają własne: `audit-logs` cztery, `api-keys` dwa, `uploads` trzy (w repozytorium kitu razem 10 plików). Projekt ma pliki rdzenia i zainstalowanych modułów. Testy `uploads` zapisują i czytają obiekty w prawdziwym magazynie S3, więc wymagają działającego MinIO, także w projekcie, którego aplikacja zapisuje pliki na dysku: `setup-env.ts` ustawia testom `STORAGE_PROVIDER=s3` ([15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md#testowanie)).

Konfiguracja `vitest.integration.config.ts`:

- środowisko `node`, pliki `src/**/*.integration.test.ts`;
- `globalSetup: ["./src/test/integration/global-setup.ts"]` raz przed wszystkimi plikami zakłada bazę, gdy jej nie ma, i dopasowuje jej schemat przez `prisma db push` ([co dokładnie robi z bazą](#baza));
- `setupFiles: ["./src/test/integration/setup-env.ts"]` przed każdym plikiem ustawia zmienne: `DATABASE_URL` na adres bazy testowej, `BETTER_AUTH_SECRET`, `APP_URL`, `EMAIL_FROM`, `API_KEY_PEPPER`, zmienne magazynu (`STORAGE_PROVIDER=s3`; `S3_ENDPOINT` z `INTEGRATION_S3_ENDPOINT`, domyślnie `http://localhost:9000`; `S3_BUCKET` z `INTEGRATION_S3_BUCKET`, domyślnie `<slug>-uploads` ze sluga w `src/shared/config/project.ts`; klucze `minioadmin`; `S3_FORCE_PATH_STYLE=true`), `MULTI_ORG=false` i `AUTH_PUBLIC_SIGNUP=false`. Pepper i zmienne magazynu są ustawione zawsze, także w projekcie bez `api-keys` i `uploads`;
- `fileParallelism: false`: pliki działają po kolei, bo wszystkie używają jednej bazy, a każdy test zaczyna od wyczyszczenia tabel;
- `testTimeout: 20_000` i `hookTimeout: 60_000` (w milisekundach, zamiast domyślnych w Vitest 5 i 10 sekund), bo test i `beforeEach` czekają na bazę.

Pomocniki do zakładania danych są w `src/test/integration/database.ts`:

| Funkcja | Co robi |
| --- | --- |
| `resetDatabase()` | Sprawdza nazwę bazy i czyści tabele rdzenia ([szczegóły](#baza-integracja)). |
| `createUser({ email, role? })` | Zakłada konto z potwierdzonym adresem; rola globalna domyślnie `user`. |
| `createOrganization({ name, createdAt, members })` | Zakłada organizację ze slugiem z nazwy i członkami z podanymi rolami. |
| `createInvitation({ organizationId, inviterId, email, role?, status?, expiresAt })` | Zakłada zaproszenie; domyślnie rola `member` i status `pending`. |
| `createSession({ userId, activeOrganizationId })` | Zakłada sesję ważną godzinę z podaną aktywną organizacją. |
| `readActiveOrganizationId(sessionId)` | Czyta `activeOrganizationId` sesji prosto z bazy. |

### Uruchomienie

Komenda czyści bazę testową, a zabezpieczenie sprawdza tylko jej nazwę, nie serwer ani port. Przed pierwszym uruchomieniem przeczytaj [Czego zabezpieczenie nie sprawdza](#baza-pulapki).

1. Uruchom bazę z `docker-compose.yml`: `docker compose up -d db`. W projekcie z modułem `uploads` uruchom też MinIO i założenie bucketu. Obie usługi mają profil `s3`, więc komenda go podaje: `docker compose --profile s3 up -d db minio minio-init` ([15-modul-uploads.md](15-modul-uploads.md#minio)). Samej komendy nie uruchamiano (niesprawdzone); `docker compose --profile s3 config --services` wypisuje `db`, `mail`, `minio` i `minio-init` (sprawdzone 2026-11-04). MinIO na innym porcie albo inny bucket podajesz w powłoce przez `INTEGRATION_S3_ENDPOINT` i `INTEGRATION_S3_BUCKET`.
2. W katalogu głównym repozytorium uruchom testy z adresem bazy testowej. Port w adresie to port Twojego kontenera (`DB_PORT` albo 5432). Bazy `wa_app_test` nie musisz zakładać, zrobi to `globalSetup`.

   ```bash
   INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wa_app_test npm run test:integration
   ```

   Przy porcie 5432 zmienną możesz pominąć, bo to jej wartość domyślna.
3. Na początku Prisma wypisze linię `Datasource "db": PostgreSQL database "wa_app_test", schema "public" at "localhost:5432"`. Sprawdź w niej nazwę bazy i port. Na końcu Vitest wypisze liczbę plików (`Test Files  … passed`) i testów. Bez działającego MinIO testy `uploads` nie przejdą, bo łączą się z magazynem pod `S3_ENDPOINT` (wniosek z kodu testów, przebiegu bez MinIO nie uruchamiano). Z MinIO na porcie 9100 (`INTEGRATION_S3_ENDPOINT=http://localhost:9100`, `INTEGRATION_S3_BUCKET=wa-app-uploads`) repozytorium kitu dało `Test Files  10 passed (10)` i `Tests  181 passed (181)` (sprawdzone 2026-11-04).

Jeśli ustawiasz `INTEGRATION_DATABASE_URL`, to w powłoce. Vitest nie wczytuje `.env` do `process.env` (sprawdzone próbą z Vitest 4.1.12), a konfiguracja integracyjna nie ma pliku z dotenv, więc wpis w `.env` nie zadziała i testy pójdą na port 5432.

Jeden plik uruchomisz komendą `npm run test:integration -- <ścieżka>`. Samo `npx vitest run <ścieżka>` bierze konfigurację jednostkową, która pomija `*.integration.test.ts`, i kończy się komunikatem `No test files found, exiting with code 1`.

<a id="e2e"></a>

## Testy e2e

Testy e2e sprawdzają w przeglądarce przepływy, w których biorą udział wszystkie części naraz: zaproszenie z mailem, ustawienie hasła, logowanie, rejestrację i tworzenie organizacji.

### Co robi `npm run test:e2e`

1. `npm run build`: build produkcyjny z `output: "standalone"`.
2. Kopiuje `.next/static` do `.next/standalone/.next/static`. Build standalone nie zawiera plików statycznych, a bez nich serwer zwraca strony bez skryptów i stylów.
3. `playwright test` z `playwright.config.ts`, w tej kolejności (Playwright 1.64.1 uruchamia serwery z `webServer` przed `globalSetup`):
   1. startuje dwa serwery `node .next/standalone/server.js` z różnymi zmiennymi i czeka, aż `/sign-in` każdego z nich odpowie (najwyżej 120 sekund); zajęty port kończy przebieg błędem, zanim cokolwiek stanie się z bazą;
   2. `globalSetup` (`e2e/global-setup.ts`) sprawdza nazwę bazy, kasuje bazę e2e i buduje schemat od nowa, zakłada konto administratora z organizacją przez `scripts/admin-create.ts` i usuwa wszystkie maile z mailpit ([szczegóły](#baza-e2e));
   3. uruchamia dwa projekty Playwright, każdy na swoim serwerze.

| Projekt | Plik | Port | `MULTI_ORG` | `AUTH_PUBLIC_SIGNUP` | Co sprawdza |
| --- | --- | --- | --- | --- | --- |
| `core-auth` | `e2e/core-auth.spec.ts` | `E2E_CORE_PORT`, domyślnie 3000 | `false` | `false` | Admin zaprasza użytkownika, ten ustawia hasło z maila i loguje się, a `/users` daje mu 404. Rejestracja bez zaproszenia dostaje 403. Reset hasła przez `/forgot-password`. |
| `multi-org` | `e2e/multi-org.spec.ts` | `E2E_MULTI_ORG_PORT`, domyślnie 3001 | `true` | `true` | Każda rejestracja tworzy własną organizację, widać `OrgSwitcher`, a druga osoba nie widzi członków pierwszej. |

Serwery dostają zmienne z `appEnv` w `e2e/env.ts`: adres bazy e2e, `APP_URL` z własnym portem, `SMTP_URL` mailpit, `LOG_LEVEL: "warn"`, `RESEND_API_KEY: "re_e2e_unused"`, `API_KEY_PEPPER`, `STORAGE_PROVIDER: "local"` i `STORAGE_LOCAL_PATH` z `E2E_UPLOADS_DIR` albo `<katalog tymczasowy systemu>/wa-app-e2e-uploads` (w projekcie z nazwą projektu zamiast `wa-app`, bo `e2e/env.ts` jest w `placeholderFiles` kitu). Pepper i zmienne magazynu są tam po to, żeby przeszła walidacja `env` w projekcie z `api-keys` albo `uploads`: serwer standalone działa w trybie produkcyjnym, w którym provider `local` wymaga jawnego katalogu ze ścieżką bezwzględną ([15-modul-uploads.md](15-modul-uploads.md#reguly-produkcyjne)). Testy e2e kitu nie wysyłają plików, a `e2e.yml` nie uruchamia MinIO ([15-modul-uploads.md](15-modul-uploads.md#ci)). Serwer standalone działa w trybie produkcyjnym, w którym walidacja zmiennych wymaga `RESEND_API_KEY`, a `SMTP_URL` i tak ma pierwszeństwo, więc ten klucz nigdy nie jest używany ([07-i18n-mail-env.md](07-i18n-mail-env.md)).

Testy działają po kolei: `workers: 1`, `fullyParallel: false`, a pliki mają `test.describe.configure({ mode: "serial" })`. Testy w pliku zależą od siebie, na przykład trzeci test w `core-auth.spec.ts` loguje się kontem zaproszonym w pierwszym. Nieudany test nie jest powtarzany (`retries: 0`), a ślad Playwright zostaje tylko dla nieudanych (`trace: "retain-on-failure"`). Przeglądarka to Chromium z ustawieniami `Desktop Chrome` i językiem `pl`.

Maile czytają pomocniki z `e2e/helpers.ts` przez API mailpit: `getLastMail(to)` co chwilę pyta `GET /api/v1/messages` przez najwyżej 15 sekund i zwraca najnowszy mail do adresata, `extractLink(mail, fragment)` wyciąga z HTML link z podanym fragmentem, a `clearMailbox()` usuwa wszystkie maile. Testy szukają elementów po polskich tekstach interfejsu. Większość z nich jest w stałej `LABELS` w `e2e/helpers.ts`, ale część jest wpisana w plikach `*.spec.ts` (na przykład „Witaj, …” i temat maila „Zresetuj hasło”), więc po zmianie tekstu w interfejsie przejrzyj oba miejsca.

### Przed pierwszym uruchomieniem

`npm run test:e2e` kasuje bazę e2e i skrzynkę mailpit, a zabezpieczenie sprawdza tylko nazwę bazy, nie serwer ani port. Najpierw przeczytaj [Czego zabezpieczenie nie sprawdza](#baza-pulapki).

1. Uruchom bazę i mailpit: `docker compose up -d`. Bazy `wa_app_e2e` nie zakładasz, zrobi to Prisma w `globalSetup`.
2. Zainstaluj przeglądarkę Playwright (raz na komputer):

   ```bash
   npx playwright install chromium
   ```

3. Zwolnij porty 3000 i 3001, na przykład zatrzymaj `npm run dev`. Konfiguracja ma `reuseExistingServer: false`, więc Playwright nie użyje działającego serwera. Gdy pod adresem `/sign-in` na tym porcie odpowiada już inny serwer (na przykład `npm run dev`), kończy się błędem `… is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.`. Gdy port trzyma coś, co tam nie odpowiada, serwer testowy nie wystartuje, a Playwright wypisze `Process from config.webServer was not able to start. Exit code: …`. W obu przypadkach błąd pojawia się przed `globalSetup`, więc baza i skrzynka mailpit zostają nietknięte. Inne porty ustawisz przez `E2E_CORE_PORT` i `E2E_MULTI_ORG_PORT`.
4. Jeśli w `.env` zmieniłeś porty bazy albo mailpit ([01-uruchomienie.md](01-uruchomienie.md#zmiana-portow)), podaj je w powłoce, bo konfiguracja e2e czyta je tylko ze zmiennych środowiskowych:

   ```bash
   DB_PORT=5433 MAILPIT_UI_PORT=8026 MAILPIT_SMTP_PORT=1026 npm run test:e2e
   ```

Raport HTML Playwright (`playwright-report/`) powstaje tylko w CI. Lokalnie wynik wypisuje reporter `list`.

<a id="e2e-agent"></a>

### Uruchomienie przez agenta AI

Prisma 7.10.1 sprawdza przy `db push --force-reset` i `migrate reset`, czy uruchomił ją agent AI (na przykład zmienna `CLAUDECODE` w Claude Code albo `CODEX_THREAD_ID` w Codex CLI). Jeśli tak, a nie ma zmiennej `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, odmawia i wypisuje polecenie, żeby agent zapytał użytkownika o zgodę (kod w `node_modules/prisma/build/cli.js`). `globalSetup` przekazuje zmienne środowiskowe dalej, więc `npm run test:e2e` uruchomione przez agenta zatrzymuje się na resecie bazy. Przebieg z Claude Code 2026-11-04 zakończył się po buildzie i starcie obu serwerów komunikatem `Error: Prisma Migrate detected that it was invoked by Claude Code.` i `Error: Command failed: npx prisma db push --force-reset`, zanim zaczął się pierwszy test (sprawdzone). Prisma zdążyła przed odmową założyć pustą bazę e2e. Testy e2e uruchamia więc człowiek albo agent po jego wyraźnej zgodzie. Testy integracyjne zwykle działają z agentem: zwykłe `prisma db push` robi to sprawdzenie dopiero wtedy, gdy zmiana schematu usunęłaby dane (przebieg `npm run test:integration` z Claude Code przeszedł).

<a id="architektura"></a>

## Testy architektury

Testy w `src/__tests__/architecture/` sprawdzają spójność plików projektu, której nie złapie ani TypeScript, ani ESLint: czy komenda z instrukcji agenta istnieje, czy klucz tłumaczenia jest w każdym języku, czy `.env.example` przechodzi walidację. Są plikami rdzenia, więc działają w każdym projekcie złożonym przez `wa create` i aktualizowanym przez `wa kit sync`, z dowolnym zestawem modułów ([D50](decyzje.md#d50)). Wchodzą do `npm test`, więc do `npm run verify`; nie potrzebują bazy ani sieci.

| Test | Niezmiennik |
| --- | --- |
| `agent-instructions-fit-the-budget` | `AGENTS.md` ma najwyżej 31 744 bajty: 32 KiB, po których Codex ucina instrukcje (`project_doc_max_bytes`), minus 1 KiB zapasu. Liczą się bajty UTF-8, nie znaki. |
| `documented-commands-exist` | Każde `npm run <skrypt>` w `AGENTS.md`, `CLAUDE.md`, `README.md` i plikach `.md` w `.claude/` istnieje w `scripts` w `package.json`. Argumenty po nazwie skryptu się nie liczą. |
| `cited-paths-exist` | Każda ścieżka w backtickach albo w celu linku w `AGENTS.md`, `CLAUDE.md` i plikach `.md` w `.claude/` istnieje. |
| `i18n-keys-exist-in-every-locale` | `src/app/messages/<locale>.json` i każde `src/features/*/i18n/<locale>.json` istnieją dla każdego języka z `src/i18n/locales.generated.ts` i mają ten sam zbiór kluczy (pełnych ścieżek liści, na przykład `form.title`). |
| `env-example-passes-validation` | `checkEnv` z `@gatojs/env`, ze schematami zmiennych modułów projektu, przyjmuje `.env.example` z `NODE_ENV=development`. |
| `node-version-is-one-number` | Major z `.nvmrc` jest równy majorowi z każdej linii `FROM node:<tag>` w `Dockerfile`, a żaden workflow w `.github/workflows/` nie ma klucza `node-version:` (tylko `node-version-file: .nvmrc`). |
| `client-bundles-stay-server-free` | Plik `.ts`/`.tsx` w `src/` (bez `src/generated/`) z dyrektywą `"use client"` jako pierwszą instrukcją nie importuje `@/shared/lib/prisma`, `@/env`, `@gatojs/env`, `@/generated/prisma`, `server-only`, `node:*` ani modułów `@/shared/lib/auth`. |

Reguły, które wymagały doprecyzowania:

- **Ścieżka w `cited-paths-exist`** to kandydat bez spacji, który zaczyna się od `src/`, `prisma/`, `scripts/`, `e2e/`, `.claude/`, `.github/`, `kit/` albo `docs/`, albo nazwa pliku z katalogu głównego z rozszerzeniem `md`, `json`, `jsonc`, `yml`, `yaml`, `toml`, `example` lub wzorcem `*.config.{ts,mts,js,mjs,cjs}`. Nazwy plików modułu bez katalogu (`env.ts`, `page.tsx`) i wyrażenia z kropką (`test.prop`) nie są ścieżkami. Kotwica `#…` jest odcinana. Pomijane są ścieżki z `docs/` i `kit/`, bo w projekcie te katalogi nie istnieją (`kitOnly`) i odsyłacze do nich dotyczą repo `webamigos/wa-kit`, oraz wzorce z `<`, `*` albo `{`.
- **Importy w `client-bundles-stay-server-free`** to `import … from`, `import "…"`, `export … from` i `import()` z literałem, odczytane z drzewa składni TypeScript. `import type` i `export type` są pomijane, bo kompilator je usuwa. Trzy moduły `@/shared/lib/auth` są dozwolone (`CLIENT_SAFE_AUTH_MODULES`): `client`, `roles` i `permissions`, bo nie importują kodu serwera, a komponenty rdzenia biorą z nich role i uprawnienia. Test sprawdza tylko importy wprost: import względny (`../lib/prisma`) i moduł kliencki, który importuje moduł serwerowy przez pośredni plik, przechodzą.
- **`.env.example`** jest czytany prostym parserem: `KEY=value`, podział na pierwszym `=`, linie puste i zaczynające się od `#` pominięte, jedna para cudzysłowów zdjęta z brzegów wartości.

Funkcje wykrywające leżą w `scripts/lib/architecture/`, a nie obok testów, bo hook `protect-tests` blokuje w fazie implementacji zapis w każdym katalogu `__tests__/` ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#faza)). Katalog `scripts/lib/` jest też we wzorcach `mutate` Strykera.

Test, który pada, podaje plik i wartość, na przykład `CLAUDE.md: npm run nope` albo `src/features/x/i18n/en.json: form.title`. Naruszenie poprawia się w pliku, nie w teście.

### Jak dodać test architektury

1. Czysta funkcja wykrywająca w `scripts/lib/architecture/<nazwa>.ts` przyjmuje treść pliku (napis), a nie ścieżkę, i zwraca listę naruszeń. Obok niej `check<Nazwa>(root)` czyta pliki względem katalogu głównego (pomocniki w `repo-files.ts`) i zwraca komunikaty `"<plik>: <wartość>"`.
2. Test `src/__tests__/architecture/<niezmiennik>.test.ts` z dyrektywą `// @vitest-environment node` sprawdza funkcję na literałach, `check<Nazwa>` na fiksurach w katalogu z `mkdtemp` i raz na prawdziwym repo: `expect(check<Nazwa>(repoRoot)).toEqual([])`.
3. Test czyta tylko pliki, które ma każdy projekt. Pliki `kitOnly` z `kit/kit.json` (`docs/**`, `kit/**`) w projekcie nie istnieją.
4. Naruszenie znalezione w obecnym kodzie poprawia się w tym samym zadaniu. Wyjątek w teście, z uzasadnieniem, tylko wtedy, gdy poprawka wykracza poza zadanie.

<a id="cli-hooki"></a>

## Testy CLI i hooków

**CLI** (`packages/gato-cli`, tylko w repozytorium kitu) ma własną konfigurację `packages/gato-cli/vitest.config.ts`: środowisko `node`, pliki `src/**/*.test.ts` i plik ustawień `packages/gato-cli/vitest.setup.ts`, który w procesach Strykera ustawia stały seed testów właściwości, tak jak `vitest.setup.ts` aplikacji ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#seed)). Testy generatora, manifestu i komend kopiują pliki do katalogu tymczasowego systemu (`mkdtemp`), więc nie zmieniają plików repozytorium. Wyjątek to test własności plików, który czyta prawdziwe repozytorium kitu ([D38](decyzje.md#d38)). Uruchomisz je komendą `npm test --prefix packages/gato-cli`. Bramka CLI `npm run verify --prefix packages/gato-cli` uruchamia po kolei lint (`eslint .` z `packages/gato-cli/eslint.config.mjs`), typecheck, testy i build bundla; ta sama bramka działa w jobie `cli` workflowu `kit.yml`. CLI ma też własną konfigurację Strykera i bramkę mutacji (`packages/gato-cli/stryker.config.json`, `packages/gato-cli/mutation-gate.json`, komendy `npm run test:mutation:task --prefix packages/gato-cli -- <pliki>` i `npm run test:mutation:gate --prefix packages/gato-cli`); pełny przebieg uruchamia ręcznie `kit-mutation.yml`. Szczegóły: [16b-rozwoj-kitu.md](16b-rozwoj-kitu.md#bramka-cli). Główny `npm test` pomija `kit/**`.

**Hooki Claude Code** testuje `npm run test:hooks`, czyli wbudowany runner Node (`node --test`) na `.claude/hooks/block-comments.test.mjs` i `.claude/hooks/protect-tests.test.mjs`. Testy wywołują funkcje hooka, a w części przypadków uruchamiają skrypt jako osobny proces z wejściem JSON, tak jak robi to Claude Code, i sprawdzają kod wyjścia. Co robią hooki: [D23](decyzje.md#d23) (komentarze) i [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#faza) (testy tylko do odczytu).

<a id="baza"></a>

## Komendy, które czyszczą albo przebudowują bazę

> **Uwaga.** Testy integracyjne i e2e kasują dane w swojej bazie przy każdym uruchomieniu. Chroni je tylko sprawdzenie nazwy bazy: integracyjne działają wyłącznie na bazie z nazwą zakończoną na `_test`, a e2e na bazie z nazwą zakończoną na `_e2e`. Host i port nie są sprawdzane. Bazy deweloperskiej `wa_app` żadna z tych komend nie ruszy, ale inną bazę z takim sufiksem, także w Postgresie innego projektu, wyczyści.

| Komenda | Co robi z bazą | Która baza: skąd adres | Zabezpieczenie |
| --- | --- | --- | --- |
| `npm run test:e2e` | Raz na przebieg: `prisma db push --force-reset` albo, gdy `prisma/migrations/` zawiera choć jeden podkatalog migracji (`hasMigrations` w `e2e/migrations.ts`; same pliki, jak `prisma/migrations/migration_lock.toml` albo `prisma/migrations/.gitignore`, się nie liczą), `prisma migrate reset --force`. Obie kasują wszystkie dane i schemat, a potem tworzą schemat od nowa. Prisma tworzy bazę, gdy jej nie ma. | `DATABASE_URL` z powłoki, a bez niej `postgresql://postgres:postgres@localhost:${dbPort}/wa_app_e2e`, gdzie `dbPort` to `DB_PORT` z powłoki albo `"5432"` (`e2e/env.ts`). | `assertE2eDatabase` (`e2e/database-guard.ts`) przed resetem: nazwa musi kończyć się na `_e2e`. |
| `npm run test:integration` | Raz na przebieg: `CREATE DATABASE`, gdy bazy nie ma, i `prisma db push`. Potem `resetDatabase()` w `beforeEach` testu (test rdzenia woła ją przed każdym testem): `TRUNCATE` tabel rdzenia i każdej tabeli, która ma do nich klucz obcy. | `INTEGRATION_DATABASE_URL` z powłoki, a bez niej `postgresql://postgres:postgres@localhost:5432/wa_app_test` (`src/test/integration/database-url.ts`). `DB_PORT` nie ma tu znaczenia. | `assertTestDatabase`: nazwa musi kończyć się na `_test`. Sprawdzana w `globalSetup` przed `CREATE DATABASE` i `db push` oraz w `resetDatabase()` przed każdym `TRUNCATE`. |
| `npm run test:integration -- <plik>`, `npx vitest run -c vitest.integration.config.ts` | Jak `npm run test:integration`. | Jak wyżej. | Jak wyżej. |
| `npm run test:mutation:integration` | Jak `npm run test:integration`, ale wiele razy: Stryker uruchamia testy integracyjne dla kolejnych mutantów ([08b](08b-testy-adwersarialne.md#stryker)). | Jak wyżej. | Jak wyżej. |
| `npx prisma migrate dev`, `npx prisma migrate reset`, `npx prisma db push --force-reset` uruchomione ręcznie | Opis w [03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#referencja-komendy). `migrate reset` i `db push --force-reset` kasują wszystkie dane. | `DATABASE_URL` z powłoki, `.env.local` albo `.env`, zwykle baza deweloperska `wa_app`. | Brak sprawdzenia nazwy. `migrate reset` bez `--force` pyta o zgodę. |

Pozostałe komendy testowe (`npm test`, `npm run verify`, `npm run test:hooks`, `npm run test:mutation`, `npm run test:mutation:task`, `npm run test:mutation:gate`) ani nie czyszczą bazy, ani nie zmieniają jej schematu.

<a id="baza-e2e"></a>

### Baza e2e

Adres bazy pochodzi z `e2e/env.ts`:

`e2e/env.ts`

```ts
const dbPort = process.env.DB_PORT ?? "5432";
// …
export const E2E_DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:${dbPort}/wa_app_e2e`;
```

`playwright.config.ts` i pliki w `e2e/` nie wczytują `.env`. Procesy uruchamiane w `globalSetup` (Prisma i `admin:create`) wczytują go przez dotenv, ale dotenv nie nadpisuje zmiennych, które już są ustawione, a `globalSetup` przekazuje im adres bazy e2e. `DATABASE_URL` z `.env` (baza deweloperska) tu więc nie trafia. Liczy się tylko `DATABASE_URL` wyeksportowany w powłoce, na przykład przez direnv. `globalSetup` najpierw sprawdza nazwę, a dopiero potem resetuje:

`e2e/global-setup.ts`

```ts
  assertE2eDatabase(env.DATABASE_URL);

  run(
    hasMigrations("prisma/migrations")
      ? ["prisma", "migrate", "reset", "--force"]
      : ["prisma", "db", "push", "--force-reset"],
    env,
  );
```

`e2e/database-guard.ts`

```ts
export function assertE2eDatabase(databaseUrl: string): void {
  const name = databaseName(databaseUrl);
  if (!name.endsWith(E2E_DATABASE_SUFFIX)) {
    throw new Error(
      `E2E resetuje bazę danych, więc jej nazwa musi kończyć się na ${E2E_DATABASE_SUFFIX} (jest: "${name}")`,
    );
  }
}
```

`E2E_DATABASE_SUFFIX` to `"_e2e"`. Adres, którego nie da się odczytać jako URL, daje pustą nazwę i też jest odrzucany. Test `e2e/__tests__/database-guard.test.ts` (w `npm test`) sprawdza, że przechodzi `wa_app_e2e`, a odpadają `wa_app`, `wa_app_e2e_backup`, adres bez nazwy bazy i napis, który nie jest URL.

Poza bazą `globalSetup` usuwa wszystkie maile ze skrzynki mailpit pod `MAILPIT_URL` (domyślnie `http://localhost:8025`, czyli przy domyślnych portach ten sam mailpit, do którego wysyła `npm run dev`). Maile z pracy deweloperskiej znikną.

<a id="baza-integracja"></a>

### Baza testów integracyjnych

`src/test/integration/database-url.ts`

```ts
export const TEST_DATABASE_SUFFIX = "_test";

export const DEFAULT_INTEGRATION_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/wa_app_test";

export function integrationDatabaseUrl(): string {
  return (
    process.env.INTEGRATION_DATABASE_URL ?? DEFAULT_INTEGRATION_DATABASE_URL
  );
}

export function assertTestDatabase(databaseUrl: string): string {
  const name = decodeURIComponent(
    new URL(databaseUrl).pathname.replace(/^\//, ""),
  );
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Testy integracyjne czyszczą bazę, więc jej nazwa musi kończyć się na ${TEST_DATABASE_SUFFIX} (jest: "${name}")`,
    );
  }
  return name;
}
```

`globalSetup` sprawdza nazwę, zanim cokolwiek zrobi z bazą. `ensureDatabaseExists` łączy się z bazą `postgres` na tym samym serwerze i zakłada bazę testową, gdy jej nie ma. Do tego użytkownik z adresu potrzebuje prawa tworzenia baz (`postgres` z `docker-compose.yml` je ma):

`src/test/integration/global-setup.ts`

```ts
export default async function globalSetup(): Promise<void> {
  const databaseUrl = integrationDatabaseUrl();
  const name = assertTestDatabase(databaseUrl);
  await ensureDatabaseExists(databaseUrl, name);
  execFileSync("npx", ["prisma", "db", "push"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
```

`resetDatabase()` sprawdza nazwę jeszcze raz, tym razem w `DATABASE_URL`, który `setup-env.ts` ustawił na adres testowy:

`src/test/integration/database.ts`

```ts
const TABLES = [
  "invitations",
  "members",
  "organizations",
  "sessions",
  "accounts",
  "verifications",
  "users",
];

export async function resetDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL ?? "");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}
```

`CASCADE` sprawia, że Postgres czyści też każdą tabelę z kluczem obcym do tych tabel, na przykład tabelę feature z relacją do `Organization`. Tabela bez takiego klucza zostaje nietknięta ([Czyszczenie tabel feature](#izolacja-czyszczenie)). Tabele modułów kitu (`audit_logs`, `api_keys`, `uploads`) mają klucz obcy do `organizations`, więc są czyszczone razem z nimi. Obiektów w magazynie S3 `resetDatabase()` nie usuwa ([15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md#testowanie)).

<a id="baza-pulapki"></a>

### Czego zabezpieczenie nie sprawdza

- **Serwera.** Sprawdzana jest tylko nazwa bazy. Każdy projekt z kitu ma te same domyślne nazwy `wa_app_test` i `wa_app_e2e`, a obie komendy domyślnie łączą się z portem 5432. Jeśli zmieniłeś `DB_PORT` w `.env`, bo port 5432 zajmuje Postgres innego projektu, a nie podałeś portu w powłoce, testy wyczyszczą bazę testową tamtego projektu i dopasują jej schemat do Twojego. Przed uruchomieniem sprawdź w powłoce `echo "$DB_PORT $DATABASE_URL $INTEGRATION_DATABASE_URL"` (puste wartości oznaczają adresy domyślne z portem 5432). Po fakcie serwer i bazę pokazuje linia `Datasource "db": …`, którą Prisma wypisuje na początku obu komend.
- **Przeznaczenia bazy.** Każda nazwa z sufiksem przejdzie, na przykład `zamowienia_test`. Nie nadawaj takich nazw bazom z danymi, które chcesz zachować.
- **Ręcznych komend Prismy.** `migrate reset` i `db push --force-reset` uruchomione ręcznie działają na `DATABASE_URL` bez sprawdzania nazwy. Zanim je uruchomisz, przejdź [listę kontrolną z 03b](03b-schemat-i-migracje.md#czyja-baza).

<a id="izolacja"></a>

## Test izolacji organizacji

Prisma nie filtruje danych po organizacji automatycznie. Każde query i każda komenda dopisuje filtr `organizationId` z `getOrgContext()` ręcznie ([D07](decyzje.md#d07), [03-dane-i-organizacje.md](03-dane-i-organizacje.md#filtr-organizationid)). Brakujący filtr nie powoduje żadnego błędu. Test architektury sprawdza tylko, czy guard jest wywołany, a test jednostkowy z mockiem Prismy go nie zauważy ([Rodzaje testów](#rodzaje)). Prisma w pamięci z `createFakePrisma` filtruje naprawdę, ale zna tylko cztery tabele rdzenia. Wyciek danych między organizacjami wychwyci więc tylko test na prawdziwej bazie z dwiema organizacjami. Dlatego [AGENTS.md](../AGENTS.md#testy) wymaga go przy każdym nowym query i każdej nowej komendzie na danych domenowych: odczyt i zapis z kontekstem jednej organizacji nie dotyka danych drugiej.

Co sprawdza test rdzenia, jak działa atrapa sesji i jak wygląda test query, opisuje [03-dane-i-organizacje.md](03-dane-i-organizacje.md#izolacja). Tam też jest znana luka: zapis zaproszenia przez `inviteUserCommand` nie ma testu izolacji na prawdziwej bazie.

### Kiedy dopisać test izolacji

- Nowe query, które czyta dane organizacji.
- Nowa komenda, która zapisuje, zmienia albo usuwa dane organizacji. Najczęstszy wyciek to zmiana rekordu po `id` z wejścia bez `organizationId` w `where`.
- Zmiana `where` w istniejącym query albo komendzie.
- Poprawka wycieku. Test musi nie przechodzić bez poprawki.

Komponenty i czyste funkcje bez Prismy nie potrzebują testu izolacji.

### Jak go zbudować

Test feature zakładasz w osobnym pliku, na przykład `src/features/<x>/services/__tests__/<x>-isolation.integration.test.ts`. Konfiguracja integracyjna znajdzie go po końcówce nazwy. Działa tylko w `npm run test:integration` i w jobie `integration` w CI, a nie w `npm test`.

1. **Skopiuj z pliku rdzenia atrapy i `signInAs`.** Atrapa sesji (`currentSession`, `readMockedSession` w bloku `vi.hoisted`), pięć wywołań `vi.mock` i funkcja `signInAs` są zdefiniowane w samym pliku testu, a nie w `src/test/integration/`, więc nowy plik potrzebuje własnej kopii. Atrapy zastępują to, czego nie ma poza żądaniem HTTP: nagłówki, język, `notFound` i `redirect` (rzucają błędy `NEXT_NOT_FOUND` i `NEXT_REDIRECT`, więc test może sprawdzić `rejects.toThrow("NEXT_NOT_FOUND")`) oraz `auth.api.getSession`. `signInAs` zakłada w bazie prawdziwą sesję i ustawia ją jako wynik atrapy:

   `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts`

   ```ts
   vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
   vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
   vi.mock("next/navigation", () => ({
     notFound: vi.fn(() => {
       throw new Error("NEXT_NOT_FOUND");
     }),
   }));
   vi.mock("@/i18n/routing", () => ({
     redirect: vi.fn(() => {
       throw new Error("NEXT_REDIRECT");
     }),
   }));
   vi.mock("@/shared/lib/auth", () => ({
     auth: { api: { getSession: vi.fn(readMockedSession) } },
   }));
   // …
   async function signInAs(
     user: { id: string },
     organization: { id: string } | null,
     role = "user",
   ): Promise<{ id: string }> {
     const activeOrganizationId = organization?.id ?? null;
     const session = await createSession({
       userId: user.id,
       activeOrganizationId,
     });
     currentSession.value = {
       user: { id: user.id, role },
       session: { id: session.id, activeOrganizationId },
     };
     return session;
   }
   ```

2. **Załóż dane obu organizacji w `beforeEach`.** Najpierw `resetDatabase()`, potem konta i dwie organizacje pomocnikami z `src/test/integration/database.ts`, a na końcu rekordy feature w obu organizacjach przez `prisma.<model>.create` z wartościami wpisanymi w teście. W `afterAll` wywołaj `prisma.$disconnect()`.
3. **Query:** zaloguj użytkownika organizacji A, wywołaj query i porównaj wynik z literałem, który zawiera tylko rekordy A. Zrób to samo dla B. Wzór: test „lista członków organizacji B nie widzi niczego z organizacji A” w [03-dane-i-organizacje.md](03-dane-i-organizacje.md#izolacja).
4. **Komenda:** zaloguj użytkownika organizacji A i wywołaj komendę z `id` rekordu organizacji B. Sprawdź, że komenda odmówiła (literał `OperationResult`), a potem przeczytaj rekord B prosto przez `prisma` i porównaj z wartościami z `beforeEach`. Najbliższy taki test w rdzeniu dotyczy przełączania organizacji: owner A podaje `id` organizacji B, komenda odmawia, a sesja w bazie wskazuje dalej A:

   `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts`

   ```ts
     it("owner organizacji A podaje id B ręcznie → odmowa, sesja bez zmian", async () => {
       const session = await signInAs(world.alice, world.orgA);

       await expect(enterOrganizationCommand(world.orgB.id)).resolves.toEqual(
         ACCESS_DENIED,
       );

       await expect(readActiveOrganizationId(session.id)).resolves.toBe(
         world.orgA.id,
       );
       await expect(getOrgContext()).resolves.toMatchObject({
         organizationId: world.orgA.id,
         serviceMode: false,
       });
     });
   ```

   `ACCESS_DENIED` to stała z literałem `{ success: false, error: "Brak dostępu do organizacji" }`. `enterOrganizationCommand` przyjmuje tylko `organizationId`. Twoja komenda na danych organizacji ma sygnaturę `(input, confirmation?)` ([06-wzorce-kodu.md](06-wzorce-kodu.md#kontrakt-komendy)). Użytkownik zalogowany przez `signInAs` z członkostwem nie jest w trybie serwisowym, więc wołasz ją bez potwierdzenia, z samym wejściem.
5. **Brak członkostwa:** zaloguj użytkownika A z aktywną organizacją B i sprawdź, że query rzuca `NoOrganizationError` (wzór: test „aktywna organizacja, do której użytkownik nie należy → NoOrganizationError”).
6. **Sprawdź, że test umie się wywrócić.** Usuń na chwilę `organizationId` z `where` i uruchom test. Musi nie przechodzić. Stryker robi to za Ciebie w przebiegu `npm run test:mutation:integration`, bo lista `mutate` w `stryker.integration.config.json` obejmuje `src/features/*/services/**/*.ts` (także `services/` nowego feature), `org-context.ts` i `require-module-access.ts`. Przebieg unitowy uruchamia tylko testy jednostkowe, więc pliki sprawdzane wyłącznie testem integracyjnym dostają w nim `NoCoverage` ([08b](08b-testy-adwersarialne.md#stryker)).

Oczekiwane wartości wpisuj jako literały (adresy e-mail, nazwy, liczby), a nie jako wynik kodu produkcyjnego. Powód: [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#zasady).

<a id="izolacja-czyszczenie"></a>

### Czyszczenie tabel feature

`resetDatabase()` czyści tabele rdzenia z listy `TABLES` z opcją `CASCADE`, więc tabela feature z kluczem obcym do `organizations` albo `users` jest czyszczona razem z nimi. Tabelę bez takiego klucza czyść w `beforeEach` własnego testu (`prisma.<model>.deleteMany()`) przed zakładaniem danych. Lista `TABLES` jest wspólna dla wszystkich testów i obejmuje tylko tabele rdzenia. Dopisanie do niej tabeli feature to zmiana wspólnego kodu kitu, a nie kodu feature ([D03](decyzje.md#d03)).

Izolację w interfejsie sprawdza też e2e `e2e/multi-org.spec.ts`: dwie rejestracje tworzą dwie organizacje, a druga osoba nie widzi członków pierwszej.

<a id="bramka-mutacji-projektu"></a>

## Bramka mutacji projektu

`npm run test:mutation:gate` czyta listę plików krytycznych i zaakceptowanych mutantów z `mutation-gate.json`, który należy do GatoJS (`wa update` go zastępuje). Własne pliki krytyczne i zaakceptowane mutanty projekt wpisuje do `mutation-gate.project.json` w korzeniu, w tym samym kształcie:

```json
{
  "critical": ["src/features/invoices/services/"],
  "allowed": [
    {
      "file": "src/features/invoices/services/totals.ts",
      "mutator": "StringLiteral",
      "original": "\"Invoice total\"",
      "replacement": "\"\"",
      "reason": "message only: the label is not asserted"
    }
  ]
}
```

Oba pola są opcjonalne. Bramka dokleja `critical` projektu do listy GatoJS bez duplikatów, a `allowed` projektu za wpisami GatoJS; wpis projektu nie usuwa wpisu GatoJS. Bez pliku bramka działa jak dotąd. Plik o złym kształcie (np. `"critical": "src/"` zamiast tablicy) albo niepoprawny JSON zatrzymuje bramkę kodem 1 z komunikatem `Invalid mutation-gate.project.json: …`. Wpisy `allowed` dodaje człowiek, tak jak w `mutation-gate.json` ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#referencja)).

<a id="czas"></a>

## Czas przebiegów

Pomiary z 2026-10-28 na komputerze z 8 rdzeniami, na kodzie z commita `4a6ffcb`, chyba że zaznaczono inaczej. Ten commit poprzedza moduły kitu i wszystkie testy CLI: w repozytorium kitu po planie 3 jest 10 plików `*.integration.test.ts` i 28 plików testów w `packages/gato-cli/src`, więc te przebiegi trwają dłużej (nie mierzono ich ponownie).

| Komenda | Czas | Zakres |
| --- | --- | --- |
| `npm test` | ok. 17 s | 55 plików, 1206 testów |
| `npm run test:integration` | ok. 4 s | 1 plik, 38 testów, baza już założona |
| `npm run test:hooks` | poniżej 1 s | 18 testów |
| `npm test --prefix packages/gato-cli` | poniżej 1 s | 5 plików, 35 testów |
| `npm run test:mutation:task -- src/shared/lib/auth/service-mode.ts` | 1 min 16 s | 35 mutantów, 101 testów powiązanych z plikiem; `.claude/agents/test-reviewer.md` podaje 1–3 minuty na zadanie |
| `npm run test:mutation:gate` | poniżej 1 s | dwa raporty |
| `npm run test:mutation` bez [pliku przyrostowego](08b-testy-adwersarialne.md#przyrostowy) | ok. 12 min przy 996 mutantach | Pomiar z audytu testów rdzenia na commicie `50a4d9e` (8 rdzeni). Od audytu przybyło mutantów (lokalny plik przyrostowy z 2026-10-27 ma ich 1781), więc pełny przebieg trwa dłużej. Nie mierzono go na `4a6ffcb`. |
| `npm run test:mutation:integration` | nie mierzono | |
| `npm run test:e2e` | nie mierzono | Build produkcyjny i 5 testów. Job CI ma limit 30 minut. |

Przebiegi z trybem przyrostowym są zwykle znacznie krótsze niż pełne, bo sprawdzają od nowa tylko mutanty zmienionego kodu ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#przyrostowy)). Nie uruchamiaj dwóch przebiegów Strykera naraz ([dlaczego](08b-testy-adwersarialne.md#jeden-stryker)).

<a id="ci"></a>

## CI

| Workflow, job | Kiedy działa | Co uruchamia | Baza i usługi |
| --- | --- | --- | --- |
| `ci.yml`, job `verify` | Push do `main`, pull request do `main`. | `npm run wa -- generate`, `git diff --exit-code` (pliki generowane muszą być aktualne), `npm run verify`. | Brak. |
| `ci.yml`, job `integration` | Jak `verify`. | Kroki z regionu `# wa:ci-integration:start` / `# wa:ci-integration:end`, potem `npm run test:integration`. | Usługa `postgres:16`, `INTEGRATION_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/wa_app_test`. Przy module `uploads` region uruchamia MinIO na porcie 9000 i zakłada bucket `<slug>-uploads`. |
| `e2e.yml` | Push do `main`. Pull request do `main`, chyba że zmienia tylko `docs/**`, `*.md` albo `.husky/**`. | Instalacja Chromium, `npx prisma migrate dev --name init`, `npm run test:e2e`. Raport HTML jako artefakt `playwright-report` (14 dni). Limit 30 minut. | Usługa `postgres:16` z bazą `wa_app_e2e`, mailpit na portach 8025 i 1025. |
| `mutation.yml` | Tylko ręcznie (`workflow_dispatch`). | `npm run test:mutation`, `npm run test:mutation:integration`, `npm run test:mutation:gate`. Raporty jako artefakt `mutation-report`. Limit 360 minut (maksimum runnera GitHuba): przy limicie 60 minut przebieg unitowy bez cache doszedł do 45% mutantów i został anulowany (2026-11-02). | Usługa `postgres:16`, `INTEGRATION_DATABASE_URL` jak w `integration`. Przed „Run Stryker (integration)” kroki z regionu `# wa:ci-integration:start` / `# wa:ci-integration:end`, ten sam co w `ci.yml`: przy module `uploads` MinIO na porcie 9000 i bucket `<slug>-uploads` (od `core` 0.5.3; przebieg integracyjny z MinIO sprawdzony lokalnie, kroki regionu w GitHub Actions nie doszły do wykonania). |

Region `wa:ci-integration` w `ci.yml` i `mutation.yml` wypełnia `npm run wa -- generate` z pól `ciSteps` manifestów zainstalowanych modułów; w kicie ma go tylko `uploads` ([15-modul-uploads.md](15-modul-uploads.md#ci), [02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#regiony)). W repozytorium kitu działają jeszcze `kit.yml` (bramka CLI i składanie projektów z kitu) i `kit-mutation.yml` (ręczny przebieg mutacji CLI); do projektów nie trafiają ([16b-rozwoj-kitu.md](16b-rozwoj-kitu.md#ci-kitu)).

Kit nie commituje migracji ([D13](decyzje.md#d13)), więc `e2e.yml` tworzy migrację w trakcie przebiegu. `globalSetup` widzi ją w `prisma/migrations/` i resetuje bazę przez `prisma migrate reset --force`, a nie przez `db push --force-reset` jak lokalnie w repozytorium kitu.

`mutation.yml` nie uruchamia się przy pull requeście ani pushu ([D26](decyzje.md#d26)). Testy mutacyjne działają lokalnie: `test-reviewer` uruchamia je na plikach każdego zadania, a pełny przebieg uruchamiasz przed releasem kitu, lokalnie albo ręcznie w GitHub Actions (zakładka Actions, workflow „Mutation testing”, „Run workflow”). Workflow zapamiętuje pliki trybu przyrostowego Strykera w cache GitHub Actions (klucz z nazwą gałęzi i commitem, zapasowo ostatni wpis gałęzi, potem `main`), więc kolejny przebieg na tej gałęzi sprawdza głównie mutanty w zmienionym kodzie i te, których testy się zmieniły. Nowe uruchomienie dla tej samej gałęzi przerywa trwający przebieg (`cancel-in-progress: true`). Gdy przebieg unitowy da wynik poniżej progu, job kończy się przed przebiegiem integracyjnym i bramką mutacji. Szczegóły: [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#stryker).

<a id="referencja"></a>

## Referencja

<a id="referencja-komendy"></a>

### Komendy

Skrypty z `package.json` w katalogu głównym, chyba że zaznaczono inaczej.

| Komenda | Skrypt | Baza | W `npm run verify` | W CI |
| --- | --- | --- | --- | --- |
| `npm test` | `vitest run` | nie | tak | `ci.yml`, `verify` |
| `npm run test:watch` | `vitest` | nie | nie | nie |
| `npm run test:integration` | `vitest run -c vitest.integration.config.ts` | `_test`, czyści | nie | `ci.yml`, `integration` |
| `npm run test:e2e` | `npm run build && rm -rf .next/standalone/.next/static && cp -R .next/static .next/standalone/.next/static && playwright test` | `_e2e`, kasuje | nie | `e2e.yml` |
| `npm run test:hooks` | `node --test .claude/hooks/block-comments.test.mjs .claude/hooks/protect-tests.test.mjs` | nie | tak | `ci.yml`, `verify` |
| `npm test --prefix packages/gato-cli` | `vitest run` w `packages/gato-cli/package.json` | nie | nie (bramka `verify` kitu) | `kit.yml`, `cli` |
| `npm run verify --prefix packages/gato-cli` | `npm run lint && npm run typecheck && npm test && npm run build` w `packages/gato-cli/package.json` | nie | — | `kit.yml`, `cli` |
| `npm run test:mutation` | `stryker run` | nie | nie | `mutation.yml`, tylko ręcznie |
| `npm run test:mutation:task -- <pliki>` | `stryker run --force --mutate` | nie | nie | nie |
| `npm run test:mutation:integration` | `stryker run stryker.integration.config.json` | `_test`, czyści | nie | `mutation.yml`, tylko ręcznie |
| `npm run test:mutation:gate` | `tsx scripts/mutation-gate.ts` | nie | nie | `mutation.yml`, tylko ręcznie |
| `npm run verify` | `npm run lint && npm run typecheck && npm test && npm run build && turbo run test typecheck lint && npm run test:hooks` | nie | — | `ci.yml`, `verify` |

<a id="referencja-pliki"></a>

### Pliki konfiguracji

| Plik | Co ustawia |
| --- | --- |
| `vitest.config.ts` | Testy jednostkowe: `jsdom`, `vitest.setup.ts`, pliki i wykluczenia, aliasy `@` i `server-only`, `globals`, `clearMocks`. |
| `vitest.setup.ts` | Matchery `@testing-library/jest-dom`, wczytanie `.env.local` i `.env`, stały seed testów właściwości w procesach Strykera. |
| `vitest.integration.config.ts` | Testy integracyjne: `node`, `globalSetup`, `setupFiles`, `fileParallelism: false`, limity czasu. |
| `src/test/integration/global-setup.ts` | Sprawdzenie nazwy, założenie bazy, `prisma db push`. |
| `src/test/integration/setup-env.ts` | Zmienne środowiskowe testów integracyjnych. |
| `src/test/integration/database-url.ts` | Adres bazy testowej i `assertTestDatabase`. |
| `src/test/integration/database.ts` | `resetDatabase` i pomocniki do zakładania danych. |
| `src/test/fake-prisma.ts` | Prisma w pamięci dla testów jednostkowych. |
| `src/test/core-modules.ts` | `CORE_MODULE_KEYS` i `coreClientModules`: rejestr przefiltrowany do modułów rdzenia dla testów z listą wpisaną literałem. |
| `playwright.config.ts` | Projekty `core-auth` i `multi-org`, dwa serwery, `globalSetup`, praca po kolei. |
| `e2e/env.ts` | Porty, adres bazy e2e, mailpit, konto administratora, zmienne serwerów (`appEnv`). |
| `e2e/global-setup.ts` | Reset bazy e2e, `admin:create`, czyszczenie mailpit. |
| `e2e/database-guard.ts` | `assertE2eDatabase`. |
| `e2e/helpers.ts` | `LABELS`, logowanie, rejestracja, ustawienie hasła, API mailpit. |
| `packages/gato-cli/vitest.config.ts` | Testy CLI: `node`, `src/**/*.test.ts`, plik ustawień `packages/gato-cli/vitest.setup.ts`. |
| `packages/gato-cli/vitest.setup.ts` | Stały seed testów właściwości CLI w procesach Strykera. |
| `packages/gato-cli/eslint.config.mjs`, `packages/gato-cli/stryker.config.json`, `packages/gato-cli/mutation-gate.json` | Lint, Stryker i bramka mutacji CLI ([16b-rozwoj-kitu.md](16b-rozwoj-kitu.md#bramka-cli)). |
| `turbo.json` | Zadania `build`, `lint`, `test` i `typecheck` w workspace `packages/*`, który jest pusty; każde po `^build`. |
| `stryker.config.json`, `stryker.integration.config.json`, `mutation-gate.json` | Mutation testing i bramka mutacji: [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#referencja). |
| `mutation-gate.project.json` (opcjonalny, plik projektu) | Pliki krytyczne i zaakceptowane mutanty projektu, doklejane do `mutation-gate.json`: [Bramka mutacji projektu](#bramka-mutacji-projektu). |

<a id="referencja-zmienne"></a>

### Zmienne środowiskowe testów

Wszystkie czytane są tylko ze zmiennych powłoki. Ani Vitest w konfiguracji integracyjnej, ani Playwright nie wczytują `.env`.

| Zmienna | Czyta | Wartość domyślna | Uwagi |
| --- | --- | --- | --- |
| `INTEGRATION_DATABASE_URL` | `src/test/integration/database-url.ts` | `postgresql://postgres:postgres@localhost:5432/wa_app_test` | Nazwa bazy musi kończyć się na `_test`. |
| `INTEGRATION_S3_ENDPOINT`, `INTEGRATION_S3_BUCKET` | `src/test/integration/setup-env.ts`, `storage.integration.test.ts` | `http://localhost:9000`, `<slug>-uploads` | Adres MinIO i bucket testów integracyjnych. |
| `E2E_UPLOADS_DIR` | `e2e/env.ts` | `<katalog tymczasowy systemu>/wa-app-e2e-uploads` | `STORAGE_LOCAL_PATH` serwerów e2e; `globalSetup` go nie czyści. Musi być ścieżką bezwzględną: serwery e2e działają w trybie produkcyjnym poza Railway, więc ścieżka względna zatrzymuje ich start ([15-modul-uploads.md](15-modul-uploads.md#reguly-produkcyjne)). |
| `DATABASE_URL` | `e2e/env.ts` | `postgresql://postgres:postgres@localhost:${dbPort}/wa_app_e2e` | Nazwa bazy musi kończyć się na `_e2e`. W testach integracyjnych `setup-env.ts` nadpisuje ją adresem testowym. |
| `DB_PORT` | `e2e/env.ts` | `5432` | Tylko do domyślnego adresu bazy e2e. |
| `MAILPIT_UI_PORT`, `MAILPIT_URL` | `e2e/env.ts` | `8025`, `http://localhost:${mailpitUiPort}` | API mailpit dla `getLastMail` i `clearMailbox`. |
| `MAILPIT_SMTP_PORT`, `SMTP_URL` | `e2e/env.ts` | `1025`, `smtp://localhost:${mailpitSmtpPort}` | SMTP serwerów e2e. |
| `E2E_CORE_PORT`, `E2E_MULTI_ORG_PORT` | `e2e/env.ts` | `3000`, `3001` | Porty serwerów projektów `core-auth` i `multi-org`. |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | `e2e/env.ts` | `admin@test.pl` i hasło z `e2e/env.ts` | Konto zakładane w `globalSetup`. |
| `BETTER_AUTH_SECRET` | `e2e/env.ts` | `e2e-secret-key-at-least-32-characters-long` | W testach integracyjnych stała z `setup-env.ts`. |
| `CI` | `playwright.config.ts` | brak | Włącza `forbidOnly` (test z `.only` kończy przebieg błędem) i reporter HTML. |
| `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` | Prisma CLI | brak | Zgoda użytkownika na reset bazy uruchomiony przez agenta AI ([Uruchomienie przez agenta AI](#e2e-agent)). |
