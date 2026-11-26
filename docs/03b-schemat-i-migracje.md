# Schemat i migracje

Po przeczytaniu będziesz wiedzieć:

- z jakich plików składa się schemat Prisma i skąd komendy `prisma` biorą adres bazy;
- jak powstaje klient Prismy i jak aplikacja łączy się z bazą;
- dlaczego kit nie commituje migracji i jak prowadzić je w projekcie klienta;
- jak rozpoznać rozjazd historii migracji, sprawdzić, czy baza jest Twoja, i kiedy wolno ją zresetować.

Zweryfikowano z kodem: 25adbb8, 2026-10-28

Źródła:

- `prisma/schema/base.prisma`
- `prisma/schema/auth.prisma`
- `prisma/schema/organizations.prisma`
- `prisma.config.ts`
- `package.json`
- `.gitignore`
- `.env.example`
- `docker-compose.yml`
- `railway.toml`
- `README.md`
- `src/shared/lib/prisma.ts`
- `packages/env/src/*.ts`, `src/env.ts`
- `src/app/api/healthcheck/route.ts`
- `src/test/integration/global-setup.ts`
- `e2e/global-setup.ts`

Modele rdzenia, organizacje i regułę filtra `organizationId` opisuje [03-dane-i-organizacje.md](03-dane-i-organizacje.md). Ten plik dotyczy plików schematu, połączenia z bazą i migracji.

<a id="schemat"></a>

## Schemat i klient Prismy

Schemat nie jest jednym plikiem, tylko katalogiem `prisma/schema/` z kilkoma plikami schematu. Dzięki temu moduł dodaje modele we własnym pliku i nie edytuje plików rdzenia ([D14](decyzje.md#d14)).

| Plik | Zawartość |
| --- | --- |
| `prisma/schema/base.prisma` | Generator `prisma-client` z wyjściem `../../src/generated/prisma` i źródło danych `postgresql` bez adresu. |
| `prisma/schema/auth.prisma` | Modele better-auth: `User`, `Session`, `Account`, `Verification`. |
| `prisma/schema/organizations.prisma` | Modele pluginu `organization` z better-auth: `Organization`, `Member`, `Invitation`. |
| `prisma/schema/<modul>.prisma` | Modele modułu. Pola relacji zwrotnych w `User` i `Organization` wpisuje generator kitu do regionów `wa:relations` ([02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#regiony)). |

Komendy `prisma` czytają konfigurację z `prisma.config.ts`:

`prisma.config.ts`

```ts
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: [".env.local", ".env"] });

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

Komendy `prisma` biorą adres bazy tylko z `DATABASE_URL`, bo schemat nie ma `url`. Wartość z `.env.local` wygrywa z `.env`, a zmienna ustawiona w powłoce wygrywa z obydwoma plikami ([01-uruchomienie.md](01-uruchomienie.md#plik-env)). Aplikacja czyta tę samą zmienną w `src/shared/lib/prisma.ts`.

Klienta Prismy generuje `prisma generate` do `src/generated/prisma`. Uruchamia go skrypt `postinstall` po instalacji zależności, a ręcznie `npm run db:generate`. Katalog jest w `.gitignore`, a kod importuje klienta z `@/generated/prisma/client`. W Prisma 7.10.1 `npx prisma migrate dev` nie uruchamia generatora, więc po zmianie schematu uruchom też `npm run db:generate`. Bez tego TypeScript nie zna nowych modeli i pól.

Aplikacja łączy się z bazą przez jeden obiekt `prisma`:

`src/shared/lib/prisma.ts`

```ts
function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parsePoolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
```

- Prisma łączy się przez adapter `@prisma/adapter-pg` i pulę połączeń `pg`. Pula ma najwyżej `DATABASE_POOL_MAX` połączeń. Wartość czyta `parseInt`, a gdy wynik nie jest dodatnią liczbą całkowitą (także przy braku zmiennej), pula ma 10 połączeń. Zmienna nie przechodzi przez walidację w `packages/env/src/core-env-schema.ts` ([07-i18n-mail-env.md](07-i18n-mail-env.md)).
- Połączenie bezczynne dłużej niż 30 sekund jest zamykane. Na wolne połączenie pula czeka do 10 sekund, a Postgres przerywa zapytanie, które trwa dłużej niż 30 sekund (`statement_timeout`).
- Obiekt jest zapisany w `globalThis`, więc moduły przeładowywane przez `next dev` używają tej samej puli zamiast otwierać nowe połączenia po każdej zmianie pliku.

Kod feature używa Prismy tylko w komendach, query i serwisach, nigdy w komponentach i stronach ([AGENTS.md](../AGENTS.md#struktura)). Poza feature Prismy używają w rdzeniu kod z `src/shared/lib/auth/` (na przykład `getOrgContext()`) i endpoint `/api/healthcheck`, który wykonuje `SELECT 1`.

<a id="migracje"></a>

## Migracje

Kit nie dostarcza migracji. Repozytorium kitu ignoruje katalog `prisma/migrations/` plikiem `prisma/migrations/.gitignore`, którego `wa create` nie kopiuje. Każda kopia repozytorium kitu tworzy własną migrację komendą `npx prisma migrate dev --name init` ([01-uruchomienie.md](01-uruchomienie.md#pierwsze-uruchomienie)). Powód wynika z modelu składania kitu: schemat projektu zależy od wybranych modułów, bo każdy moduł dokłada własny plik schematu i relacje w regionach. Historia migracji kitu nie pasowałaby do projektu z innym zestawem modułów ([D13](decyzje.md#d13)).

Testy nie potrzebują migracji. Testy integracyjne tworzą schemat przez `prisma db push`, a e2e przez `prisma db push --force-reset` albo, gdy migracje istnieją, `prisma migrate reset --force`. Oba rodzaje testów czyszczą swoją bazę, dlatego działają tylko na bazach z nazwą zakończoną odpowiednio na `_test` i `_e2e` ([08-testy.md](08-testy.md)).

<a id="migracje-w-projekcie"></a>

### Migracje w projekcie klienta

Projekt klienta commituje migracje, bo produkcja stosuje tylko migracje zapisane w repozytorium. Przed każdym wdrożeniem Railway uruchamia `node_modules/.bin/prisma migrate deploy` (`preDeployCommand` w `railway.toml` albo w ustawieniach usługi, bo nowa usługa nie czyta `railway.toml`, [10-wdrozenie.md](10-wdrozenie.md#config-as-code)). Ta komenda nie tworzy migracji ze schematu. Bez zacommitowanego katalogu nie ma czego zastosować i baza produkcyjna nie dostanie tabel.

Root `.gitignore` nie ignoruje `prisma/migrations/`, więc w projekcie złożonym przez `wa create` migracje trafiają do repozytorium bez dodatkowych kroków.

1. W projekcie powstałym z kopii repozytorium kitu sprawdź, czy root `.gitignore` nie ma linii `prisma/migrations/`, i usuń ją, jeśli jest. Komenda `git check-ignore -v prisma/migrations/migration_lock.toml` nic nie wypisuje, gdy katalog nie jest ignorowany.
2. Utwórz pierwszą migrację, jeśli katalog `prisma/migrations/` jest pusty: `npx prisma migrate dev --name init`. Migracje, które już w nim są (na przykład z kopii kitu), zostaw i zacommituj zamiast tworzyć nowe.
3. Zacommituj cały katalog: podkatalogi migracji z plikami `migration.sql` i plik `prisma/migrations/migration_lock.toml`, który Prisma tworzy razem z pierwszą migracją.
4. Przy każdej zmianie schematu, także po dodaniu modułu z własnym plikiem w `prisma/schema/`, uruchom `npx prisma migrate dev --name <nazwa>`, potem `npm run db:generate`, i zacommituj nową migrację razem ze zmianą schematu. Gdy zmiana może usunąć dane albo nie udać się na istniejących danych (na przykład nowe pole unikalne przy powtarzających się wartościach), Prisma wypisuje `Warnings for the current datasource:` z listą skutków i pyta `Are you sure you want to create and apply this migration?`. Jeśli skutek nie jest zamierzony, odpowiedz `n` i porównaj schemat z bazą. Zmiany, których nie da się wykonać, Prisma zgłasza jako `We found changes that cannot be executed:` i kończy się błędem bez pytania i bez tworzenia migracji.
5. Nie zmieniaj migracji, które zastosowano już na jakiejkolwiek bazie. Poprawka to nowa migracja. Zmieniony plik zastosowanej migracji Prisma uzna za rozjazd historii.

Jak Railway wdraża aplikację, opisuje [10-wdrozenie.md](10-wdrozenie.md).

<a id="dryf-migracji"></a>

## Rozjazd historii migracji

Prisma zapisuje zastosowane migracje w tabeli `_prisma_migrations` w bazie. Migracje z katalogu `prisma/migrations/`, których nie ma w tej tabeli, `npx prisma migrate dev` po prostu stosuje. Odmawia w dwóch przypadkach:

- **rozjazd historii**: baza ma zastosowaną migrację, której nie ma w katalogu albo której plik jest inny niż przy zastosowaniu;
- **dryf** (`Drift detected`): schemat bazy różni się od tego, co dają migracje, na przykład gdy tabele utworzył `prisma db push`.

Wtedy Prisma 7.10.1 wypisuje powód, podpowiada `prisma migrate reset` i kończy się kodem 130 bez żadnej zmiany w bazie. Sama niczego nie resetuje. Przykład po usunięciu katalogu `prisma/migrations/` przy bazie z zastosowaną migracją (nazwa bazy, port i nazwa migracji zależą od konfiguracji, a linia `…` zastępuje listę różnic w tabelach):

```text
Datasource "db": PostgreSQL database "wa_app", schema "public" at "localhost:5432"

- Drift detected: Your database schema is not in sync with your migration history.
…
- The following migration(s) are applied to the database but missing from the local migrations directory: 20261027212719_init

We need to reset the "public" schema at "localhost:5432"

You may use prisma migrate reset to drop the development database.
All data will be lost.
```

Gdy baza ma tabele, ale nie ma historii migracji (po `prisma db push` albo baza projektu bez Prisma Migrate), wynik jest taki sam, tylko bez linii `The following migration(s) are applied …`.

<a id="czyja-baza"></a>

### Najpierw: czy to Twoja baza

Na świeżym klonie taki komunikat zwykle oznacza cudzą bazę. Najmocniejszy sygnał to nazwy migracji w linii `missing from the local migrations directory`, których nigdy nie tworzyłeś: baza innego projektu z Prisma Migrate ma własną historię. Reset kasuje wszystkie dane bazy pod `DATABASE_URL`, więc zanim go uruchomisz, potwierdź, że to Twój kontener.

Samo `docker compose ps` z `(healthy)` niczego nie dowodzi. Na macOS kontener startuje także wtedy, gdy port zajmuje lokalny Postgres słuchający na `localhost`, a połączenia z `localhost` trafiają wtedy do lokalnego Postgresa ([01-uruchomienie.md](01-uruchomienie.md#polaczenie-z-baza)). `DATABASE_URL` ustawiony w powłoce albo w `.env.local` może też wskazywać bazę zdalną. Baza jest Twoja dopiero wtedy, gdy wszystkie cztery warunki są spełnione. Sprawdzasz je w katalogu projektu, którego bazę chcesz zresetować: `pwd` pokazuje ten katalog, a `docker compose ps` kontener `<katalog>-db-1` (nazwa katalogu małymi literami). Nie ustawiaj w powłoce ani w `.env` zmiennych `COMPOSE_FILE` i `COMPOSE_PROJECT_NAME`. Zmieniają one projekt Compose, a komendy uruchomione w katalogu innego lokalnego projektu na kicie przejdą wszystkie cztery warunki na jego bazie.

1. **Adres.** Linia `Datasource "db": …` ma host `localhost` albo `127.0.0.1`, port równy `DB_PORT` (bez `DB_PORT`: 5432) i bazę `wa_app` (`POSTGRES_DB` z `docker-compose.yml`) albo inną bazę, którą sam założyłeś w tym kontenerze. Porównuj z adresem, którego oczekujesz z `.env`, a nie z samą linią Prismy: zmienna z powłoki wygrywa z `.env.local`, a ta z `.env` (`echo "$DATABASE_URL"` pokaże zmienną z powłoki). Linię `Datasource` wypisują `migrate dev`, `migrate status`, `migrate reset`, `migrate resolve`, `migrate deploy` i `db push`, ale nie `migrate diff` ani `db execute`.
2. **Port.** Po zatrzymaniu własnych kontenerów (`docker compose stop`, dane zostają) port z `DATABASE_URL` jest wolny: pętla z kroku 3 [pierwszego uruchomienia](01-uruchomienie.md#pierwsze-uruchomienie) z tym portem nic nie wypisuje.
3. **Powtórzenie.** Po `docker compose up -d` i `(healthy)` przy `db` komenda `npx prisma migrate dev` znowu zgłasza ten sam rozjazd.
4. **Historia w kontenerze.** Odczyt historii wprost w kontenerze, z pominięciem sieci komputera, zgadza się z komunikatem Prismy:

   ```bash
   docker compose exec -T db psql -U postgres -d wa_app -Atc 'SELECT migration_name FROM _prisma_migrations'
   ```

   Przy innej bazie wpisz jej nazwę po `-d`. Komenda wypisuje wszystkie migracje zastosowane w tej bazie, po jednej w linii. Każda nazwa z linii `missing from the local migrations directory` musi być na tej liście, a pozostałe nazwy to migracje z Twojego `prisma/migrations/`. Gdy Prisma tej linii nie wypisała, na liście są tylko migracje z Twojego katalogu albo komenda kończy się błędem `ERROR:  relation "_prisma_migrations" does not exist` (baza bez historii, na przykład po `prisma db push`). Ten sam błąd przy wypisanej linii `missing …` oznacza, że Prisma łączy się z inną bazą. Błąd `FATAL:  database "wa_app" does not exist` oznacza, że w kontenerze nie ma tej bazy, więc Prisma łączy się z inną.

Jeśli któryś warunek nie jest spełniony, nie resetuj niczego i przejdź diagnozę z [01-uruchomienie.md](01-uruchomienie.md#polaczenie-z-baza).

<a id="dryf-co-zrobic"></a>

### Co zrobić

Repozytorium kitu rozpoznasz po pliku `kit/kit.json` (`test -f kit/kit.json`). Projekt klienta, złożony przez `wa create`, tego pliku nie ma.

| | Dane w lokalnej bazie niepotrzebne | Dane w lokalnej bazie potrzebne |
| --- | --- | --- |
| **Repozytorium kitu** | Reset, potem `npx prisma migrate dev --name init` i `npm run admin:create`. | Kopia bazy, potem jak obok. |
| **Projekt klienta** | Przywróć migracje z git i uruchom `npx prisma migrate dev`. Gdy rozjazd zostaje: reset, potem `npx prisma migrate dev` bez `--name init`. | Przywróć migracje z git i uruchom `npx prisma migrate dev`. Gdy rozjazd zostaje: kopia bazy, reset, potem `npx prisma migrate dev` bez `--name init`. |

**Przywrócenie migracji z git** (projekt klienta). Komenda przywraca katalog w plikach i w indeksie, także po `git rm`:

```bash
git restore --source=HEAD --staged --worktree prisma/migrations
```

Gdy usunięcie katalogu jest już w commicie, `HEAD` go nie ma i komenda niczego nie przywróci. Wtedy podaj w `--source` commit sprzed usunięcia: `HEAD~1`, gdy usunięcie jest w ostatnim commicie, albo `<hash>~1`, gdzie `<hash>` to commit usuwający, pierwszy na liście `git log --oneline -- prisma/migrations`.

W projekcie klienta nie twórz nowej migracji `init` na miejsce usuniętych. Nie zgodzi się z historią w bazie, a migracje z repozytorium mogły już trafić na staging, produkcję i do innych osób.

**Kopia bazy** przed resetem. Uruchom komendę w katalogu projektu. Usługa `db`, użytkownik `postgres` i baza `wa_app` pochodzą z `docker-compose.yml`. Gdy `DATABASE_URL` wskazuje inną bazę w tym kontenerze, wpisz jej nazwę. `DB_PORT` nie ma znaczenia, bo `pg_dump` działa wewnątrz kontenera.

Plik zapisz poza repozytorium, żeby kopia z danymi nie trafiła do commita:

```bash
docker compose exec -T db pg_dump -U postgres wa_app > ~/wa_app-kopia.sql
```

Opcja `-T` wyłącza pseudoterminal, który w terminalu interaktywnym mógłby zmienić zapisywane dane. Ponowne uruchomienie nadpisuje plik. Kopia jest zwykłym plikiem SQL. Odtworzenie z niej danych to osobna operacja, której ten plik nie opisuje. Pełne odtworzenie przez `psql` do zresetowanej bazy przywróci stare wiersze `_prisma_migrations` (rozjazd wróci), a wstawianie wierszy do tabel z nowym kontem z `admin:create` skończy się błędami, więc odtwarzaj kopię do osobnej bazy albo tylko wybrane tabele.

**Reset.** Uruchom go tylko wtedy, gdy [wszystkie cztery warunki](#czyja-baza) są spełnione. Nigdy na bazie współdzielonej, stagingowej ani produkcyjnej. Komenda pyta `Are you sure you want to reset your database? All data will be lost.`, a po zgodzie kasuje wszystkie dane bazy z `DATABASE_URL` i stosuje migracje z katalogu `prisma/migrations/` (w repozytorium kitu po usunięciu katalogu: żadnej). Przed pytaniem komenda wypisuje linię `Datasource "db": …`. Zanim odpowiesz `y`, sprawdź ją jeszcze raz według warunku 1. Prisma 7 wykrywa uruchomienie przez agenta AI i bez wyraźnej zgody użytkownika odmawia resetu.

```bash
npx prisma migrate reset
```

Po resecie w repozytorium kitu utwórz migrację i konto od nowa:

```bash
npx prisma migrate dev --name init
npm run admin:create -- --email <email>
```

W projekcie klienta uruchom samo `npx prisma migrate dev`. Komenda nic nie tworzy, gdy migracje z repozytorium zgadzają się ze schematem.

<a id="referencja"></a>

## Referencja

<a id="referencja-komendy"></a>

### Komendy

| Komenda | Co robi | Dane w bazie | Gdzie w kicie |
| --- | --- | --- | --- |
| `npm run db:generate` (`prisma generate`) | Generuje klienta do `src/generated/prisma`. | nie dotyka bazy | `postinstall`, ręcznie po zmianie schematu |
| `npx prisma migrate dev --name <nazwa>` | Stosuje niezastosowane migracje, tworzy migrację ze zmian schematu i ją stosuje. Przy rozjeździe historii albo dryfie kończy się kodem 130. | zostają; zmiana, która może usunąć dane albo się nie udać, wymaga potwierdzenia | pierwsze uruchomienie, każda zmiana schematu, job w `.github/workflows/e2e.yml` |
| `npx prisma migrate status` | Pokazuje stan migracji. Niezastosowane migracje i rozjazd w środku historii (`The migrations from the database are not found locally in prisma/migrations: …`) zgłasza kodem 1. W Prisma 7.10.1 nie zgłasza niczego, gdy w katalogu brakuje migracji z końca historii albo całego katalogu: wypisuje wtedy `Database schema is up to date!`. Nie sprawdza też dryfu schematu (nie używa bazy tymczasowej, shadow database), więc po `prisma db push` przy zgodnej historii wypisuje to samo. | tylko odczyt | diagnoza |
| `npx prisma migrate deploy` | Stosuje migracje z katalogu, niczego nie tworzy. | zostają | `preDeployCommand` w `railway.toml` albo w ustawieniach usługi Railway, w obrazie jako `node_modules/.bin/prisma migrate deploy` ([10-wdrozenie.md](10-wdrozenie.md#prisma-cli)) |
| `npx prisma migrate reset` | Kasuje dane i stosuje migracje z katalogu. Pyta o zgodę, z `--force` bez pytania. | kasuje wszystkie | `e2e/global-setup.ts` z `--force`, gdy są migracje |
| `npx prisma db push` | Dopasowuje schemat bazy do plików w `prisma/schema/` bez migracji i bez historii. | zostają; z `--force-reset` kasuje wszystkie | `src/test/integration/global-setup.ts`; `e2e/global-setup.ts` z `--force-reset`, gdy nie ma migracji |

<a id="referencja-komunikaty"></a>

### Komunikaty Prismy

| Komunikat | Znaczenie |
| --- | --- |
| `Datasource "db": PostgreSQL database "<baza>", schema "public" at "<host>:<port>"` | Baza, z którą łączy się komenda ([czy to Twoja baza](#czyja-baza)). |
| `Already in sync, no schema change or pending migration was found.` | Baza, migracje i schemat się zgadzają. |
| `Your database is now in sync with your schema.` | `migrate dev` zastosował albo utworzył migracje. |
| `Drift detected: Your database schema is not in sync with your migration history.` | Schemat bazy różni się od tego, co dają migracje ([rozjazd historii](#dryf-migracji)). |
| `The following migration(s) are applied to the database but missing from the local migrations directory: …` | W bazie jest migracja, której nie ma w katalogu. Nieznane nazwy wskazują cudzą bazę. |
| `We need to reset the "public" schema at …` | `migrate dev` odmawia. W bazie nic się nie zmieniło. |
| `Warnings for the current datasource:` | Nowa migracja może usunąć dane albo nie udać się na istniejących danych. Następne pytanie wymaga zgody. |
| `We found changes that cannot be executed:` | Zmiany nie da się wykonać. `migrate dev` kończy się błędem i nie tworzy migracji. |
