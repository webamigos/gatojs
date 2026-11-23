# Uruchomienie projektu

Po przeczytaniu będziesz wiedzieć:

- jak uruchomić aplikację lokalnie, od klonu repozytorium do pierwszego logowania i pierwszego maila;
- jakie usługi uruchamia `docker-compose.yml` i jak zmienić porty, gdy domyślne są zajęte;
- co robi `npm run admin:create` i jak założyć nim pierwsze konto;
- co zmieniają flagi `MULTI_ORG`, `AUTH_PUBLIC_SIGNUP` i `ADMIN_IMPERSONATION`;
- jak rozpoznać i naprawić typowe problemy, w tym błędy walidacji zmiennych środowiskowych.

Zweryfikowano z kodem: 6c05f1f, 2026-11-05

Źródła:

- `README.md`
- `.env.example`
- `.gitignore`
- `.nvmrc`
- `Dockerfile`
- `docker-compose.yml`
- `docker/uploads.compose.yml`
- `package.json`
- `package-lock.json`
- `prisma.config.ts`
- `prisma/schema/base.prisma`
- `vitest.setup.ts`
- `scripts/admin-create.ts`
- `scripts/lib/admin-create.ts`
- `scripts/lib/__tests__/admin-create.test.ts`
- `packages/env/src/*.ts`, `src/env.ts`
- `src/features/uploads/services/storage-env.ts`, `src/test/integration/setup-env.ts` (magazyn plików modułu `uploads`)
- `src/shared/lib/__tests__/env.test.ts`
- `src/instrumentation.ts`
- `src/shared/lib/mailer.ts`
- `src/shared/config/project.ts`
- `src/shared/lib/auth/index.ts`
- `src/shared/lib/auth/org-context.ts`
- `src/shared/lib/auth/impersonation-policy.ts`
- `src/shared/lib/modules/nav.ts`
- `src/features/auth/services/signup-gate.ts`
- `src/features/auth/services/signup-policy.ts`
- `src/features/organizations/services/signup-membership.ts`
- `src/features/organizations/components/org-switcher.tsx`
- `src/features/organizations/components/organization-members.tsx`
- `src/features/users/components/user-account-columns.tsx`
- `src/features/auth/i18n/pl.json`
- `src/features/dashboard/i18n/pl.json`
- `src/features/organizations/i18n/pl.json`
- `src/features/users/i18n/pl.json`
- `src/app/messages/pl.json`
- `src/app/[locale]/(app)/layout.tsx`
- `src/app/[locale]/(app)/users/page.tsx`
- `src/app/[locale]/(auth)/sign-up/page.tsx`
- `src/app/[locale]/accept-invitation/[id]/page.tsx`
- `src/shared/lib/logger.ts`
- `src/i18n/routing.ts`
- `e2e/env.ts`
- `src/test/integration/database-url.ts`

## Co uruchamiasz

Lokalnie działają trzy rzeczy: aplikacja Next.js (`npm run dev`, port 3000) i dwie usługi w Dockerze, PostgreSQL (port 5432) oraz mailpit (porty 8025 i 1025). Mailpit to lokalny serwer pocztowy: przyjmuje maile wysyłane przez aplikację i pokazuje je w przeglądarce, więc nic nie trafia do prawdziwych skrzynek. W ustawieniach domyślnych nie ma publicznej rejestracji, dlatego pierwsze konto zakłada skrypt `npm run admin:create`.

Pojęcia, które pojawiają się w tym pliku (pełny opis w [03-dane-i-organizacje.md](03-dane-i-organizacje.md) i [04-auth-i-role.md](04-auth-i-role.md)):

- **Organizacja** to firma albo zespół, do którego należą użytkownicy i dane. Zalogowany użytkownik pracuje zawsze w jednej organizacji naraz, nazywanej **aktywną organizacją**.
- **Rola globalna** dotyczy konta w całej aplikacji: `user`, `admin` albo `superadmin`. Konta `admin` i `superadmin` zarządzają użytkownikami na stronie „Użytkownicy”.
- **Rola w organizacji** dotyczy członkostwa w jednej organizacji: `owner` (właściciel), `admin` albo `member`.
- **Superadmin** to konto serwisowe Web Amigos. Może to samo co `admin`, a do tego wejść do każdej organizacji i używać impersonacji bez względu na `ADMIN_IMPERSONATION`.
- **Tryb serwisowy** to praca superadmina w organizacji, do której nie należy. U góry strony widać wtedy pasek „Tryb serwisowy: `<nazwa>`”, a każdą zmianę danych trzeba potwierdzić w dialogu.
- **Impersonacja** to praca na koncie innego użytkownika bez znajomości jego hasła (przycisk z ikoną i podpowiedzią „Zaloguj jako” na stronie „Użytkownicy”).

## Wymagania

- **Node.js 22.** `.nvmrc` zawiera samo `22`, więc `nvm install` instaluje najnowsze wydanie 22.x, a `nvm use` wybiera najnowsze zainstalowane. Sprawdź wersję komendą `node -v`. Wydania starsze niż 22.18.0 działają, ale instalacja wypisuje ostrzeżenia `npm warn EBADENGINE`, bo część zależności deklaruje wyższe minimum: `@inquirer/*` wymaga 22.13.0, a zależności Strykera (narzędzia do testów mutacyjnych, opis w [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#stryker)) 22.18.0. Ostrzeżenia nie przerywają instalacji.
- **npm** w wersji dołączonej do Node 22. `package.json` wskazuje `npm@11.21.1` w polu `packageManager`. Krok 1 mówi, kiedy ta różnica ma znaczenie.
- **Docker z Compose 2 lub nowszym** (komenda `docker compose`, a nie `docker-compose`).
- **`nc`** (netcat) z opcją `-z`, do sprawdzenia portów w kroku 3. Jest w macOS. Na Debianie i Ubuntu jest w pakiecie `netcat-openbsd`.

<a id="pierwsze-uruchomienie"></a>

## Pierwsze uruchomienie

Komendy uruchamiasz w katalogu głównym repozytorium, w tej kolejności. Plik `.env` powstaje przed startem Dockera, bo w nim ustawiasz porty, jeśli domyślne są zajęte. Baza musi działać przed migracją, a migracja musi być zastosowana przed utworzeniem pierwszego konta.

1. **Zainstaluj zależności.**

   ```bash
   npm ci
   ```

   `npm ci` instaluje dokładnie wersje zapisane w `package-lock.json` i nie zmienia tego pliku. Po instalacji skrypt `postinstall` uruchamia `prisma generate`, który zapisuje klienta Prismy w `src/generated/prisma` (katalog jest w `.gitignore`), a skrypt `prepare` instaluje hooki git (husky). `npm install` też działa, ale z npm 10 dołączonym do Node 22 (sprawdzone na 10.9.0) przepisuje `package-lock.json` (zmienia znaczniki `dev` i `devOptional`). Takiej zmiany nie commituj. Jeśli potrzebujesz `npm install`, użyj `npx -y npm@11.21.1 install`.

   Wynik: komenda kończy się bez błędu. Linie `npm warn` nie są błędami.

2. **Utwórz plik `.env`.**

   ```bash
   cp .env.example .env
   ```

   Jeśli `.env` już istnieje, pomiń ten krok, bo `cp` nadpisze plik bez pytania. Wartości z `.env.example` wystarczają do pracy lokalnej. Pusta linia `ADMIN_PASSWORD=` jest w porządku: krok 6 [pierwszego uruchomienia](#pierwsze-uruchomienie) traktuje ją jak brak hasła (sekcja [Plik `.env`](#plik-env)).

3. **Sprawdź, czy porty są wolne.**

   ```bash
   command -v nc >/dev/null || echo "brak nc: zainstaluj go przed sprawdzeniem portów"
   for port in 3000 5432 8025 1025; do nc -z localhost "$port" 2>/dev/null && echo "zajęty: $port"; done
   ```

   Brak wyniku oznacza, że wszystkie porty są wolne. Pierwsza linia jest potrzebna, bo bez `nc` pętla też nic nie wypisze. Nie polegaj na tym, że Docker zgłosi zajęty port. Na macOS (Docker Desktop) kontener startuje także wtedy, gdy port 5432 zajmuje lokalny Postgres słuchający na `localhost`, a połączenia z `localhost:5432` trafiają wtedy do lokalnego Postgresa, nie do kontenera. Jeśli któryś port jest zajęty, zmień go albo zwolnij według sekcji [Zmiana portów](#zmiana-portow) i dopiero wtedy przejdź dalej.

4. **Uruchom bazę i mailpit.**

   ```bash
   docker compose up -d
   docker compose ps
   ```

   Powtarzaj `docker compose ps`, aż usługa `db` będzie miała w kolumnie `STATUS` dopisek `(healthy)` (healthcheck z `docker-compose.yml` działa co 10 sekund). Usługa `mail` też dochodzi do `(healthy)`, bo healthcheck ma obraz `axllent/mailpit`, ale do dalszych kroków wystarczy `(healthy)` przy `db`.

5. **Utwórz schemat bazy.**

   ```bash
   npx prisma migrate dev --name init
   ```

   Prisma czyta `DATABASE_URL` z `.env`, tworzy migrację `init` w `prisma/migrations/` i stosuje ją do bazy `wa_app`. Kit nie dostarcza migracji, a repozytorium kitu ignoruje katalog `prisma/migrations/` (plik `prisma/migrations/.gitignore`, którego `wa create` nie kopiuje), więc każda kopia repozytorium kitu tworzy własną migrację. Jak obchodzić się z migracjami w projekcie, opisuje [03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#migracje).

   Pierwsza linia wyniku, `◇ injected env (N) from .env.local,.env // tip: …`, to komunikat biblioteki dotenv, a nie błąd ([Plik `.env`](#plik-env)). Na pustej bazie wynik kończy się tak (`<data>` to znacznik czasu, na przykład `20261027212719`):

   ```text
   Applying migration `<data>_init`

   The following migration(s) have been created and applied from new schema changes:

   prisma/migrations/
     └─ <data>_init/
       └─ migration.sql

   Your database is now in sync with your schema.
   ```

   Ponowne uruchomienie na tej samej bazie wypisuje `Already in sync, no schema change or pending migration was found.` Jeśli Prisma pokaże ramkę `Update available`, nie aktualizuj pakietów: wersje ustala `package-lock.json`.

   Na świeżej bazie Prisma niczego nie kasuje i o nic nie pyta. Jeśli zamiast tego wypisze `Drift detected` albo `We need to reset the "public" schema at …` z podpowiedzią `prisma migrate reset` („All data will be lost.”), komenda kończy się bez zmian w bazie. Taki komunikat oznacza, że pod `DATABASE_URL` jest baza z inną historią migracji. Na świeżym klonie to zwykle cudza baza: lokalny Postgres albo baza innego projektu na tym samym porcie. Nie uruchamiaj `migrate reset`, dopóki nie masz pewności, że pod `DATABASE_URL` jest baza z Twojego kontenera, bo reset kasuje wszystkie dane tej bazy. Najpierw przejdź diagnozę z [Prisma lub `admin:create` nie łączy się z bazą](#polaczenie-z-baza). Jeśli to Twoja baza, a historia rozjechała się z innego powodu (na przykład po usunięciu `prisma/migrations/`), postępuj według [03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#dryf-migracji).

6. **Załóż pierwsze konto.**

   Linia `ADMIN_PASSWORD=` z pliku z kroku 2 jest pusta, więc skrypt generuje hasło i wypisuje je raz. Własne hasło podasz przez `--password <hasło>` albo niepustą `ADMIN_PASSWORD` ([04-auth-i-role.md](04-auth-i-role.md#pusta-admin-password)).

   ```bash
   npm run admin:create -- --email <email>
   ```

   Separator `--` jest wymagany. Bez niego npm potraktuje `--email` jako własną opcję i skrypt dostanie sam adres. Wynik na pustej bazie:

   ```text
   Utworzono administratora <email>
   Utworzono organizację <id>
   Wygenerowane hasło (pokazane raz): <hasło>
   ```

   Zapisz hasło. Skrypt pokazuje je tylko raz, a ponowne uruchomienie ani go nie zmienia, ani nie wypisuje. Opcje (własne hasło, nazwa organizacji, rola `superadmin`) opisuje sekcja [Konto administratora](#admin-create).

7. **Uruchom aplikację.**

   ```bash
   npm run dev
   ```

   Serwer jest gotowy, gdy wypisze adres `http://localhost:3000` i linię `✓ Ready in …`. Jeśli w kroku 3 port 3000 był zajęty, najpierw ustaw wolny port w `APP_URL` w `.env`, a potem uruchom `npm run dev -- -p <port>` z tym samym portem ([Port aplikacji](#port-aplikacji)). Krok 3 niczego nie zapisuje, a `PORT` wpisany do `.env` nie zmienia portu serwera. Jeśli serwer sam wybrał inny port niż oczekiwany, przeczytaj tę samą sekcję.

8. **Zaloguj się.** Otwórz `http://localhost:3000/sign-in` (przy innym porcie z kroku 7: `http://localhost:<port>/sign-in`; pod `/` nie ma strony) i zaloguj się adresem i hasłem z kroku 6. Trafisz na `/dashboard`: nagłówek „Dashboard” i karta „Witaj, `<imię>`”, gdzie imię to wartość `--name`, a bez tej opcji część adresu przed `@`. Menu boczne ma pozycje „Dashboard”, „Użytkownicy” i „Konto”. Wersja angielska jest pod `/en/sign-in`, bo język domyślny (`pl`) nie ma prefiksu w adresie (`localePrefix: "as-needed"` w `src/i18n/routing.ts`). Jeśli przeglądarka woli angielski (nagłówek `Accept-Language`) albo była już na stronie `/en/...` (ciasteczko `NEXT_LOCALE`), `/sign-in` przekieruje na `/en/sign-in`; wersję polską otworzysz pod `http://localhost:3000/pl/sign-in`, które przekierowuje na `/sign-in` i zapamiętuje polski w ciasteczku ([07-i18n-mail-env.md](07-i18n-mail-env.md)).

9. **Sprawdź pocztę.** Otwórz `http://localhost:3000/forgot-password` (przy innym porcie z kroku 7: `http://localhost:<port>/forgot-password`; link „Zapomniałeś hasła?” na stronie logowania) i podaj swój adres. Otwórz `http://localhost:8025` (albo port `MAILPIT_UI_PORT` ustawiony w kroku 3): w mailpit pojawi się mail „Zresetuj hasło”. Tak samo zobaczysz pozostałe maile aplikacji: powitanie „Witamy w WA App” po akcji „Zaproś użytkownika” i zaproszenie „Zaproszenie do `<nazwa organizacji>`”.

<a id="uslugi-compose"></a>

## Usługi z `docker-compose.yml`

Nazwy usług (`db` i `mail`) zwraca `docker compose config --services`. Używaj ich w komendach, na przykład `docker compose logs db`. Usługa z mailpit nazywa się `mail`, a nie `mailpit`.

| Usługa | Obraz | Port na komputerze (domyślny) | Zmienna portu | Do czego służy |
| --- | --- | --- | --- | --- |
| `db` | `postgres:16` | 5432 | `DB_PORT` | PostgreSQL. Użytkownik `postgres`, hasło `postgres`, baza `wa_app`. |
| `mail` | `axllent/mailpit` | 8025 (interfejs WWW), 1025 (SMTP) | `MAILPIT_UI_PORT`, `MAILPIT_SMTP_PORT` | Serwer pocztowy, który zbiera maile aplikacji. |

- Porty są zapisane jako `"${DB_PORT:-5432}:5432"`. Lewa strona to port na komputerze: wartość zmiennej albo domyślna. Prawa to port w kontenerze, który się nie zmienia.
- Dane Postgresa leżą w katalogu `volumes/postgres` (w `.gitignore`). `docker compose down` usuwa kontenery, ale ten katalog zostaje, więc baza przetrwa restart.
- Na końcu pliku jest region `wa:services:start` / `wa:services:end` na usługi modułów. Wypełnia go generator kitu (`npm run wa -- generate`, opis w [02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#regiony)), więc nie edytuj go ręcznie.

<a id="minio"></a>

## MinIO (moduł `uploads`)

Projekt z modułem `uploads` startuje bez MinIO. `.env.example` ma `STORAGE_PROVIDER=local` i `STORAGE_LOCAL_PATH=./volumes/uploads`, więc aplikacja zapisuje pliki w katalogu `volumes/uploads`, który jest w `.gitignore` ([15](15-modul-uploads.md#provider)). Krok 4 [pierwszego uruchomienia](#pierwsze-uruchomienie) wystarcza. Ta ścieżka działa w `npm run dev`. W `npm start`, czyli w zbudowanej aplikacji w trybie produkcyjnym, zatrzymuje start, bo poza Railway `STORAGE_LOCAL_PATH` musi być wtedy ścieżką bezwzględną (sprawdzone 2026-11-05 na `next start`, [15](15-modul-uploads.md#reguly-produkcyjne)).

`docker-compose.yml` takiego projektu ma w regionie `wa:services` dwie usługi z profilem Compose `s3`: `minio` (magazyn zgodny z S3) i `minio-init`, jednorazowy kontener, który tworzy bucket `<slug>-uploads` i kończy pracę ([15](15-modul-uploads.md#minio)). `docker compose up -d` ich nie uruchamia: `docker compose config --services` wypisuje `db` i `mail`, a dopiero `docker compose --profile s3 config --services` dodatkowo `minio` i `minio-init` (sprawdzone 2026-11-04). MinIO uruchamiasz, gdy chcesz pracować na S3: ustaw w `.env` `STORAGE_PROVIDER=s3`, a potem uruchom usługi z profilem (niesprawdzone: w repozytorium kitu port 9000 zajmował inny projekt, więc samego startu nie uruchamiano):

```bash
docker compose --profile s3 up -d
```

Zmienne `S3_*` w `.env.example` mają już wartości lokalnego MinIO (`S3_ENDPOINT=http://localhost:9000`, klucz i sekret `minioadmin`, bucket `<slug>-uploads`).

| Usługa | Obraz | Port na komputerze (domyślny) | Zmienna portu | Do czego służy |
| --- | --- | --- | --- | --- |
| `minio` | `cgr.dev/chainguard/minio:latest` przypięty przez digest | 9000 (API S3), 9001 (konsola WWW) | `MINIO_PORT`, `MINIO_CONSOLE_PORT` | Magazyn plików. Użytkownik i hasło `minioadmin`. |
| `minio-init` | `amazon/aws-cli:2.39.2` | brak | brak | Tworzy bucket, gdy go nie ma, ponawiając próbę do 30 razy. |

- Obrazy `minio/minio` i `minio/mc` nie da się już pobrać, dlatego moduł używa obrazu Chainguard i `aws-cli`.
- `minio` działa jako `user: "0:0"`, bo dane leżą w katalogu `volumes/minio` zamontowanym z hosta (ustawienie tylko dla rozwoju lokalnego). Katalog jest w `.gitignore`, więc dane przetrwają `docker compose down`.
- Zajęty port zmieniasz tak jak port bazy ([Zmiana portów](#zmiana-portow)): `MINIO_PORT=9100` w `.env` i ten sam port w `S3_ENDPOINT=http://localhost:9100`. Compose czyta tylko `MINIO_PORT`, a aplikacja tylko `S3_ENDPOINT`, więc oba trzeba zmienić razem. Port konsoli zmienia `MINIO_CONSOLE_PORT`.
- Testy integracyjne zawsze używają S3, także gdy aplikacja działa z `local`, bo `src/test/integration/setup-env.ts` ustawia im `STORAGE_PROVIDER=s3`. Adres czytają z `INTEGRATION_S3_ENDPOINT` (domyślnie `http://localhost:9000`) i bucket z `INTEGRATION_S3_BUCKET` (domyślnie `<slug>-uploads`), na przykład `INTEGRATION_S3_ENDPOINT=http://localhost:9100 npm run test:integration`.

<a id="zmiana-portow"></a>

## Zmiana portów

### Baza i mailpit

Jeśli port trzymają kontenery innego projektu na kicie (pokaże to `docker ps` w kolumnie `PORTS`), zamiast zmieniać porty możesz je zatrzymać komendą `docker compose stop` w katalogu tamtego projektu. Dane tamtej bazy zostają. W pozostałych przypadkach zmień porty w `.env`.

Port bazy jest zapisany w dwóch miejscach i oba trzeba zmienić razem. Compose czyta `DB_PORT`, a aplikacja i Prisma czytają tylko `DATABASE_URL`. Nic ich nie łączy, więc przy rozjeździe aplikacja łączy się z innym portem niż ten, na którym działa kontener.

1. W `.env` dopisz `DB_PORT` i ustaw ten sam port w `DATABASE_URL`:

   ```bash
   DB_PORT=5433
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/wa_app
   ```

2. Jeśli zajęte są porty mailpit, zmień je tak samo, razem z `SMTP_URL`. Interfejs mailpit będzie wtedy pod `http://localhost:8026`.

   ```bash
   MAILPIT_UI_PORT=8026
   MAILPIT_SMTP_PORT=1026
   SMTP_URL=smtp://localhost:1026
   ```

3. Przy pierwszym uruchomieniu wróć do kroku 4 [pierwszego uruchomienia](#pierwsze-uruchomienie). Gdy kontenery już działały, uruchom `docker compose up -d`: Compose odtworzy usługi, których konfiguracja się zmieniła, a dane w `volumes/postgres` zostaną.

Compose czyta te zmienne z pliku `.env` w katalogu projektu oraz ze zmiennych powłoki. Żeby wrócić do portów domyślnych, usuń `DB_PORT`, `MAILPIT_UI_PORT` i `MAILPIT_SMTP_PORT` z `.env`, ustaw z powrotem port 5432 w `DATABASE_URL` i 1025 w `SMTP_URL`, a potem uruchom `docker compose up -d`.

Testy e2e i integracyjne nie biorą portów z `.env`. `npm run test:e2e` czyta `DB_PORT`, `MAILPIT_UI_PORT` i `MAILPIT_SMTP_PORT` ze zmiennych powłoki (na przykład `DB_PORT=5433 npm run test:e2e`), a `npm run test:integration` czyta adres bazy z `INTEGRATION_DATABASE_URL`, którego wartość domyślna ma port 5432. Obie komendy czyszczą swoje bazy, więc przed pierwszym uruchomieniem przeczytaj [08-testy.md](08-testy.md).

<a id="port-aplikacji"></a>

### Port aplikacji

Port serwera Next.js ustawia opcja `-p` (`npm run dev -- -p 3001`) albo zmienna `PORT` w powłoce (`PORT=3001 npm run dev`). `.env.example` nie ma tej zmiennej, a `PORT` wpisany do `.env` nie działa, bo Next.js wybiera port, zanim wczyta `.env`.

- Bez `-p` i `PORT`, gdy port 3000 jest zajęty, `next dev` sam bierze następny wolny port i wypisuje `Port 3000 is in use by process <pid>, using available port 3001 instead.` albo, gdy nie ustali procesu, `Port 3000 is in use by an unknown process, using available port 3001 instead.`
- Z `-p` albo `PORT` zajęty port kończy start błędem `Failed to start server` (`EADDRINUSE`).

Po każdej zmianie portu ustaw ten sam port w `APP_URL`, na przykład `APP_URL=http://localhost:3001`, i zrestartuj serwer. better-auth (biblioteka logowania) traktuje origin z `APP_URL` jako jedyny domyślnie zaufany, a linki w mailach są budowane z `APP_URL`.

<a id="plik-env"></a>

## Plik `.env`

`.env` jest w `.gitignore` (wzorzec `.env*` z wyjątkiem `.env.example`). Czytają go:

- Next.js przy `npm run dev`, `npm run build` i `npm start`;
- `prisma.config.ts` (komendy `prisma`), `scripts/admin-create.ts` (`npm run admin:create`) i `vitest.setup.ts` (`npm test`) przez bibliotekę dotenv: najpierw `.env.local`, potem `.env`. Wartość z `.env.local` wygrywa z `.env`, a zmienna ustawiona w powłoce wygrywa z obydwoma plikami;
- Docker Compose, który bierze z niego `DB_PORT`, `MAILPIT_UI_PORT` i `MAILPIT_SMTP_PORT` (oraz `MINIO_PORT` i `MINIO_CONSOLE_PORT` w projekcie z modułem `uploads`).

Prisma i `admin:create` wypisują na starcie linię `◇ injected env (N) from .env.local,.env // tip: …`, w której tekst po `// tip:` jest losową wskazówką. To komunikat dotenv, a nie błąd. `N` to liczba zmiennych ustawionych z plików, bez zmiennych, które były już ustawione w powłoce. `injected env (0)` oznacza, że z plików nic nie wczytano: nie ma `.env`, plik jest pusty albo wszystkie zmienne są już ustawione w powłoce.

Do pracy lokalnej nie musisz niczego zmieniać. Pusta linia `ADMIN_PASSWORD=` oznacza hasło wygenerowane przez krok 6 [pierwszego uruchomienia](#pierwsze-uruchomienie) ([04-auth-i-role.md](04-auth-i-role.md#pusta-admin-password)). Zmiany, które mogą być potrzebne:

| Zmienna | Kiedy zmieniasz |
| --- | --- |
| `DATABASE_URL`, `SMTP_URL` | Razem z portami Dockera ([Zmiana portów](#zmiana-portow)). |
| `APP_URL` | Gdy aplikacja działa na innym porcie niż 3000 ([Port aplikacji](#port-aplikacji)). |
| `BETTER_AUTH_SECRET` | Gdy chcesz własny sekret: `openssl rand -base64 32`. Wartość z `.env.example` (49 znaków) przechodzi walidację poza produkcją. |
| `MULTI_ORG`, `AUTH_PUBLIC_SIGNUP`, `ADMIN_IMPERSONATION` | Gdy chcesz sprawdzić inny tryb ([Tryby uruchomienia](#tryby-uruchomienia)). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Gdy chcesz uruchamiać `admin:create` bez `--email` i `--password`. |

Pełną listę zmiennych i reguły ich parsowania opisuje [07-i18n-mail-env.md](07-i18n-mail-env.md).

Zmienne sprawdza schemat z `packages/env/src/core-env-schema.ts`. Serwer Next.js (`npm run dev` albo zbudowana aplikacja) sprawdza je przy starcie, a obiekt `env` jeszcze raz przy pierwszym odczycie. Sam import `env` niczego nie sprawdza, więc nie przerywa `next build` ani testów, które nie mają pełnego środowiska ([07-i18n-mail-env.md](07-i18n-mail-env.md#walidacja-env)). Skutki:

- `npm run build` nie sprawdza zmiennych.
- `npm run dev` z błędnym `.env` nie startuje: wypisuje raport ze wszystkimi problemami i kończy się kodem 1 (sprawdzone 2026-11-04 w repozytorium kitu, [Komunikat `Nieprawidłowe zmienne środowiskowe`](#bledy-env)). `npm run admin:create` zgłasza błąd przy pierwszym odczycie `env`.
- Wynik sprawdzenia jest zapamiętany do końca działania procesu, więc po zmianie `.env` zrestartuj `npm run dev`.

<a id="admin-create"></a>

## Konto administratora

`npm run admin:create -- --email <email>` zakłada konto i pierwszą organizację. Skrypt łączy się z bazą i ładuje konfigurację aplikacji, więc wymaga działającej bazy z zastosowaną migracją i poprawnego `.env`.

| Opcja | Znaczenie |
| --- | --- |
| `--email` | Adres e-mail, zapisywany małymi literami. Wymagany, chyba że ustawiono `ADMIN_EMAIL`. |
| `--password` | Hasło. Bez tej opcji skrypt bierze `ADMIN_PASSWORD`, a gdy jej brak, generuje 20-znakowe hasło i wypisuje je raz. Pusta wartość `ADMIN_PASSWORD=` (jak w `.env.example`) i same spacje działają jak brak zmiennej: skrypt generuje hasło ([04-auth-i-role.md](04-auth-i-role.md#pusta-admin-password)). |
| `--name` | Imię i nazwisko. Domyślnie część adresu przed `@`. |
| `--org-name` | Nazwa pierwszej organizacji. Domyślnie `WA App` (`project.name` z `src/shared/config/project.ts`). |
| `--role` | Rola globalna: `admin` (domyślnie) albo `superadmin`. |
| `--yes` | Zatwierdza bez pytania nadanie wyższej roli istniejącemu kontu. |

- **Nowe konto** dostaje wybraną rolę globalną i potwierdzony adres e-mail, więc pierwsze logowanie nie wymaga maila.
- **Organizacja.** Na pustej bazie skrypt tworzy organizację i robi z konta jej właściciela (`owner`). Gdy w bazie jest już jakaś organizacja, skrypt nie tworzy drugiej, tylko dopisuje konto do najstarszej jako `owner`. Jeśli konto już do niej należy, jego rola w organizacji się nie zmienia.
- **Ponowne uruchomienie** nie tworzy drugiego konta, organizacji ani członkostwa i nie zmienia hasła. Wypisuje wtedy `Administrator <email> gotowy` i `Organizacja <id>`.
- **Istniejące konto z niższą rolą globalną.** Skrypt pyta `Użytkownik <email> istnieje. Nadać rolę <rola>? [t/N]` i bez zgody kończy się komunikatem `Przerwano`. Roli nigdy nie obniża.

Hasła nie da się odzyskać tą komendą. Gdy je zgubisz, użyj „Zapomniałeś hasła?” na stronie logowania i odczytaj mail w mailpit. Wszystkie przypadki, także konta `superadmin`, opisuje [04-auth-i-role.md](04-auth-i-role.md).

<a id="tryby-uruchomienia"></a>

## Tryby uruchomienia

Trzy flagi w `.env` zmieniają zachowanie aplikacji. Każda przyjmuje `true` albo `false`, a brak zmiennej lub pusta wartość oznacza `false`. Wielkość liter i spacje z brzegów nie mają znaczenia, a każda inna wartość (na przykład `1` albo `yes`) kończy się błędem walidacji. Po zmianie flagi zrestartuj serwer.

| Zmienna | `false` (domyślnie) | `true` |
| --- | --- | --- |
| `MULTI_ORG` | Aplikacja ma jedną organizację (najstarszą w bazie). | Organizacji może być wiele i każdy zalogowany może założyć własną. |
| `AUTH_PUBLIC_SIGNUP` | Rejestracja pod `/sign-up` działa tylko z zaproszenia. | Rejestracja pod `/sign-up` działa także bez zaproszenia. |
| `ADMIN_IMPERSONATION` | Impersonacji używa tylko `superadmin`. | Impersonacji używa też `admin`, ale tylko wobec kont z rolą globalną `user`. |

Co widać w interfejsie przy kombinacjach `MULTI_ORG` i `AUTH_PUBLIC_SIGNUP`:

| | `AUTH_PUBLIC_SIGNUP=false` | `AUTH_PUBLIC_SIGNUP=true` |
| --- | --- | --- |
| **`MULTI_ORG=false`** | Jest jedna organizacja. `/sign-up` bez zaproszenia przekierowuje na `/sign-in`, więc nowe konta powstają przez „Zaproś użytkownika”. | Jest jedna organizacja. `/sign-up` pokazuje formularz rejestracji, który zakłada konto z rolą `member` w najstarszej organizacji. |
| **`MULTI_ORG=true`** | Nad treścią strony jest przycisk z ikoną „+”, który otwiera dialog „Utwórz organizację”. `owner` i `admin` organizacji z rolą globalną `user` widzą stronę „Członkowie” z formularzem „Zaproś osobę”. `/sign-up` bez zaproszenia przekierowuje na `/sign-in`. | Przycisk „+” i strona „Członkowie” jak obok. `/sign-up` pokazuje formularz rejestracji, który tworzy nową organizację z nowym kontem jako `owner`. |

- W każdym trybie `admin` i `superadmin` mają na stronie „Użytkownicy” przycisk „Zaproś użytkownika”: zakłada on konto w aktywnej organizacji i wysyła mail „Witamy w WA App” z linkiem do ustawienia hasła.
- Strona logowania nie ma linku do rejestracji w żadnym trybie. Adres `/sign-up` trzeba wpisać ręcznie albo przejść do niego ze strony zaproszenia.
- Mail z zaproszeniem do organizacji prowadzi na `/accept-invitation/<id>`. Niezalogowany użytkownik widzi tam przyciski „Zaloguj się” i „Załóż konto”. „Załóż konto” otwiera `/sign-up?invitationId=<id>`, a rejestracja od razu dołącza nowe konto do organizacji. „Zaloguj się” prowadzi na zwykłe `/sign-in`, po którym aplikacja przenosi na `/dashboard`, a samo logowanie zaproszenia nie przyjmuje. Kto ma już konto, loguje się, a potem otwiera link z maila jeszcze raz. Zalogowany zostaje dołączony do organizacji i przeniesiony na `/dashboard` tylko wtedy, gdy zaproszenie jest ważne, a adres e-mail konta jest taki sam jak adres zaproszenia (wielkość liter nie ma znaczenia). W przeciwnym razie better-auth odrzuca przyjęcie zaproszenia, a strona pokazuje „Nie udało się przyjąć zaproszenia”. Dlatego link z mailpit testuj w oknie prywatnym przeglądarki albo po wylogowaniu, a nie na koncie, z którego wysłano zaproszenie.
- Rejestracja z `invitationId` działa w każdym trybie i dołącza nowe konto do organizacji z zaproszenia, z rolą z zaproszenia.
- Lista wyboru organizacji nad treścią strony pojawia się w każdym trybie, gdy konto ma dostęp do więcej niż jednej organizacji.

Impersonację uruchamia przycisk z ikoną i podpowiedzią „Zaloguj jako” w wierszu konta na stronie „Użytkownicy”. Przycisk jest tylko przy kontach, wobec których zalogowane konto może użyć impersonacji (wiersz `ADMIN_IMPERSONATION` w tabeli flag), i nigdy przy własnym koncie ani przy kontach `superadmin`. W trakcie impersonacji u góry strony widać pasek z przyciskiem „Wróć do własnego konta”.

Kto co widzi przy każdej roli, macierz dostępu i ochronę po stronie serwera opisują [03-dane-i-organizacje.md](03-dane-i-organizacje.md) i [04-auth-i-role.md](04-auth-i-role.md).

<a id="typowe-problemy"></a>

## Typowe problemy

Problemy są ułożone w kolejności kroków [pierwszego uruchomienia](#pierwsze-uruchomienie).

### Instalacja wypisuje `EBADENGINE` albo zmienia `package-lock.json`

- **Objaw:** ostrzeżenia `npm warn EBADENGINE Unsupported engine` przy instalacji albo zmodyfikowany `package-lock.json` w `git status` po `npm install`.
- **Przyczyna:** Node starszy niż 22.18.0 (ostrzeżenia) albo `npm install` z npm 10 zamiast npm 11.21.1 z pola `packageManager` (zmiana w `package-lock.json`).
- **Rozwiązanie:** zainstaluj najnowsze Node 22 (`nvm install` w katalogu repozytorium). Cofnij zmianę w `package-lock.json` komendą `git checkout package-lock.json` i instaluj przez `npm ci` albo `npx -y npm@11.21.1 install`.

### Błędy importu `@/generated/prisma/client`

- **Objaw:** błąd, że nie znaleziono modułu `@/generated/prisma/client` (`Module not found` w Next.js, `Cannot find module` w TypeScript).
- **Przyczyna:** klient Prismy nie został wygenerowany. Zwykle po instalacji z pominięciem skryptów (`--ignore-scripts`) albo po usunięciu `src/generated/`.
- **Rozwiązanie:** uruchom `npm run db:generate`.

### `docker compose up -d` zgłasza zajęty port

- **Objaw:** błąd z fragmentem `Bind for 0.0.0.0:5432 failed: port is already allocated` albo `bind: address already in use` (dla 5432, 8025 lub 1025), a usługa nie startuje.
- **Przyczyna:** port zajmuje inny kontener (pierwszy komunikat) albo inny program na komputerze (drugi).
- **Rozwiązanie:** zmień port albo zatrzymaj kontenery innego projektu według sekcji [Zmiana portów](#zmiana-portow).

### Prisma zgłasza brak `datasource.url`

- **Objaw:** `Error: The datasource.url property is required in your Prisma config file when using prisma migrate dev.`
- **Przyczyna:** `prisma.config.ts` nie znalazł `DATABASE_URL`. Zwykle nie ma pliku `.env` (w logu widać `injected env (0)`).
- **Rozwiązanie:** uruchom `cp .env.example .env` w katalogu głównym repozytorium.

<a id="polaczenie-z-baza"></a>

### Prisma lub `admin:create` nie łączy się z bazą

- **Objaw:** `` Error: P1001: Can't reach database server at `localhost:<port>` `` (Prisma, na przykład przy `migrate dev`). W `npm run admin:create` komunikat zaczyna się od `` Invalid `prisma.user.findUnique()` invocation `` i nie podaje przyczyny. Inny objaw: komendy kończą się błędem uwierzytelnienia, `migrate dev` wypisuje `Drift detected` albo komendy działają, ale zmiany nie trafiają do bazy w kontenerze, chociaż `docker compose ps` pokazuje `(healthy)`.
- **Przyczyna:** kontener nie działa albo jeszcze startuje, port w `DATABASE_URL` różni się od `DB_PORT`, nie wykonano migracji albo na tym samym porcie słucha inny program (na przykład lokalny Postgres) i to do niego trafia połączenie.
- **Rozwiązanie:** w katalogu projektu:
  1. Sprawdź, czy port w `DATABASE_URL` jest taki sam jak `DB_PORT`, a gdy `.env` nie ma `DB_PORT`, czy wynosi 5432. Obie wartości pokaże `grep -E '^(DB_PORT|DATABASE_URL)=' .env`, a port, z którym łączy się Prisma, widać też w komunikacie `P1001`. Zmienne ustawione w powłoce wygrywają z `.env`, więc sprawdź także `echo "$DB_PORT $DATABASE_URL"`. Jeśli porty się różnią, popraw `.env` albo usuń zmienne z powłoki (`unset DB_PORT DATABASE_URL`) i przejdź do kroku 4.
  2. Zatrzymaj własne kontenery komendą `docker compose stop` (dane w `volumes/postgres` zostają). Bez tego pętla z kroku 3 zgłosi też porty Twoich kontenerów.
  3. Uruchom pętlę z kroku 3, wpisując zamiast 5432 wartość `DB_PORT` (i własne porty mailpit, jeśli je zmieniłeś). Jeśli port bazy jest nadal zajęty, trzyma go inny program: zmień `DB_PORT` i `DATABASE_URL` według sekcji [Zmiana portów](#zmiana-portow).
  4. Uruchom `docker compose up -d` i poczekaj na `(healthy)` przy `db`.
  5. Uruchom ponownie `npx prisma migrate dev --name init` i `npm run admin:create -- --email <email>`, bo schemat i konto mogły trafić do innej bazy.

<a id="bledy-env"></a>

### Komunikat `Nieprawidłowe zmienne środowiskowe`

- **Objaw:** `npm run dev` albo zbudowany serwer kończy pracę zaraz po starcie, a w terminalu jest raport, który zaczyna się od `Nieprawidłowe zmienne środowiskowe (<liczba problemów>):`, z jedną linią `- <ZMIENNA>: <komunikat>` na problem. Linia `✓ Ready` przed raportem nie znaczy, że serwer działa. `npm run admin:create` kończy się stosem wyjątku z linią `Error: Nieprawidłowe zmienne środowiskowe: …`, w której problemy w postaci `<ZMIENNA>: <komunikat>` są rozdzielone średnikami.
- **Przyczyna:** brak albo zła wartość zmiennej w `.env`. Komunikaty po angielsku pochodzą z biblioteki zod 4, polskie dodaje `packages/env/src/core-env-schema.ts`.
- **Rozwiązanie:** znajdź komunikat w tabeli, popraw `.env` i uruchom serwer ponownie.

| Zmienna | Komunikat | Przyczyna i naprawa |
| --- | --- | --- |
| `DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_URL`, `EMAIL_FROM` | `Invalid input: expected string, received undefined` | Brak zmiennej, zwykle brak `.env`. Skopiuj wartość z `.env.example`. |
| `DATABASE_URL`, `EMAIL_FROM` | `Too small: expected string to have >=1 characters` | Pusta wartość. Skopiuj wartość z `.env.example`. |
| `BETTER_AUTH_SECRET` | `co najmniej 32 znaki bez spacji na brzegach` | Sekret ma mniej niż 32 znaki po usunięciu spacji z brzegów. Wpisz dłuższy, na przykład wynik `openssl rand -base64 32` (44 znaki). |
| `APP_URL` | `Invalid URL` | Adres bez `http://` lub `https://` (na przykład `localhost:3000` albo `ftp://example.com`). Wpisz pełny adres, na przykład `http://localhost:3000`. |
| `AUTH_PUBLIC_SIGNUP`, `MULTI_ORG`, `ADMIN_IMPERSONATION` | `Invalid option: expected one of ""\|"true"\|"false"` | Wartość inna niż `true`, `false` albo pusta (na przykład `1`, `yes`, `on`). Wpisz `true` albo `false`. |
| `NODE_ENV` | `Invalid option: expected one of "development"\|"test"\|"production"` | Niestandardowa wartość `NODE_ENV` w powłoce. Usuń ją komendą `unset NODE_ENV`. |
| `RESEND_API_KEY` | `wymagana w produkcji` | `NODE_ENV=production` bez klucza Resend (usługi wysyłki maili używanej na produkcji). Lokalnie wystarczy dowolna niepusta wartość, bo przy ustawionym `SMTP_URL` klucz nie jest używany. |
| `BETTER_AUTH_SECRET` | `w produkcji nie może być wartością z .env.example` | `NODE_ENV=production` z sekretem z `.env.example`. Wygeneruj własny. |

Przykład z dwoma problemami (brak `DATABASE_URL`, `MULTI_ORG=1`) w raporcie serwera (sprawdzone 2026-11-04 na zbudowanym serwerze repozytorium kitu):

```text
Nieprawidłowe zmienne środowiskowe (2):
- DATABASE_URL: Invalid input: expected string, received undefined
- MULTI_ORG: Invalid option: expected one of ""|"true"|"false"
```

Ten sam przypadek w jednoliniowym komunikacie `parseEnv`, który widać w `npm run admin:create`:

```text
Nieprawidłowe zmienne środowiskowe: DATABASE_URL: Invalid input: expected string, received undefined; MULTI_ORG: Invalid option: expected one of ""|"true"|"false"
```

Dwa ostatnie wiersze tabeli dotyczą produkcji. `NODE_ENV=production` ustawia `next start` (komenda `npm start`) i obraz Docker, więc lokalne uruchomienie zbudowanej aplikacji (`npm run build`, potem `npm start`) wymaga `RESEND_API_KEY` i własnego sekretu. `npm run dev` działa z `NODE_ENV=development`.

### `admin:create` zgłasza brak adresu albo nieoczekiwany argument

- **Objaw:** `Podaj --email albo ustaw ADMIN_EMAIL` albo `Unexpected argument '<adres>'. This command does not take positional arguments`.
- **Przyczyna:** pierwszy komunikat oznacza brak `--email` i pustą zmienną `ADMIN_EMAIL`. Drugi pojawia się, gdy pominięto separator `--` i npm przekazał skryptowi sam adres.
- **Rozwiązanie:** uruchom `npm run admin:create -- --email <email>`. Nieznana opcja (na przykład `--help`) kończy się komunikatem `Unknown option '--help'`.

### `next dev` działa na innym porcie albo nie startuje

- **Objaw:** w terminalu `Port 3000 is in use by process <pid>, using available port 3001 instead.` (albo ten sam komunikat z `by an unknown process`) albo `Failed to start server` z `EADDRINUSE`.
- **Przyczyna:** port 3000 (albo port z `-p` lub `PORT`) zajmuje inny proces. W pierwszym przypadku `APP_URL` nadal wskazuje 3000, więc żądania logowania mogą być odrzucane z wpisem `Invalid origin: <origin>`, a linki w mailach prowadzą na zły port.
- **Rozwiązanie:** zwolnij port 3000 albo uruchom serwer na innym porcie i ustaw ten port w `APP_URL` ([Port aplikacji](#port-aplikacji)).

### Strona `/` zwraca 404

- **Objaw:** `http://localhost:3000/` pokazuje stronę 404.
- **Przyczyna:** aplikacja nie ma strony głównej. Strony są pod `/sign-in`, `/dashboard` i pozostałymi adresami z `src/app/[locale]/`.
- **Rozwiązanie:** wejdź na `/sign-in`. Wejście na `/dashboard` bez sesji przekierowuje na logowanie.

### Logowanie kończy się błędem, chociaż strona się otwiera

- **Objaw:** po wysłaniu formularza logowania pojawia się komunikat „Nie udało się zalogować”.
- **Przyczyna:** złe dane logowania, brak połączenia z bazą albo `APP_URL` z innym portem niż serwer. Błędny `.env` zatrzymuje `npm run dev` już przy starcie ([Komunikat `Nieprawidłowe zmienne środowiskowe`](#bledy-env)).
- **Rozwiązanie:** przeczytaj terminal z `npm run dev`. `Invalid origin: <origin>` oznacza rozjazd portu w `APP_URL` ([Port aplikacji](#port-aplikacji)). Zapomniane hasło odzyskasz przez „Zapomniałeś hasła?” i mail w mailpit.

### Maile nie docierają do mailpit

- **Objaw:** w interfejsie mailpit nie ma wiadomości po akcji, która powinna wysłać mail.
- **Przyczyna:** `SMTP_URL` wskazuje inny port niż `MAILPIT_SMTP_PORT` albo usługa `mail` nie działa (terminal serwera pokazuje wtedy wpis zawierający `[MAILER] Failed to send`), albo `SMTP_URL` jest pusty. Przy pustym `SMTP_URL` aplikacja wysyła mail przez Resend, gdy ustawiono `RESEND_API_KEY`. Gdy nie ma żadnego z nich, mail nie jest wysyłany, a terminal serwera pokazuje wpis `[INFO] [MAILER] SMTP_URL and RESEND_API_KEY not set, email not sent`.
- **Rozwiązanie:** ustaw `SMTP_URL=smtp://localhost:1025` (albo port z `MAILPIT_SMTP_PORT`) i sprawdź `docker compose ps`. Wpisy `[MAILER]` trafiają do terminala tylko przy `NODE_ENV` innym niż `production` i pustym `OTEL_EXPORTER_OTLP_ENDPOINT` (`src/shared/lib/logger.ts`). Kolejność wysyłki i wymogi produkcji opisuje [07-i18n-mail-env.md](07-i18n-mail-env.md).

### Link z zaproszenia kończy się błędem

- **Objaw:** strona zaproszenia pokazuje „Nie udało się przyjąć zaproszenia” albo po wysłaniu formularza rejestracji pojawia się „Rejestracja jest wyłączona” (przy `AUTH_PUBLIC_SIGNUP=false`) lub „Zaproszenie jest nieprawidłowe lub wygasło” (przy `AUTH_PUBLIC_SIGNUP=true`).
- **Przyczyna:** zaproszenie wygasło, zostało już przyjęte albo anulowane, albo adres e-mail różni się od adresu z zaproszenia. Pierwszy komunikat widać też wtedy, gdy w przeglądarce jesteś zalogowany na inne konto, na przykład to, z którego wysłano zaproszenie.
- **Rozwiązanie:** otwórz link w oknie prywatnym albo po wylogowaniu. Bez konta wybierz „Załóż konto” i zarejestruj się adresem, na który przyszło zaproszenie. Z kontem zaloguj się tym adresem, a potem otwórz link z maila jeszcze raz, bo samo logowanie nie przyjmuje zaproszenia. Gdy zaproszenie nie jest już ważne, poproś o nowe.

## Dalsze kroki

- Z czego składa się aplikacja i jak przebiega żądanie: [02-architektura.md](02-architektura.md).
- Feature rdzenia i ich strony: [05-moduly-rdzenia.md](05-moduly-rdzenia.md).
- Wdrożenie na Railway i zmienne produkcyjne: [10-wdrozenie.md](10-wdrozenie.md).
