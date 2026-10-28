# Znane ograniczenia

Po przeczytaniu będziesz wiedzieć:

- które zachowania kitu są znanymi lukami, a nie błędem w Twoim kodzie ani w dokumentacji;
- które trzy pozycje mają wysoki priorytet i jak je ominąć: przy pierwszym uruchomieniu, w testach mutacyjnych i na Railway;
- dlaczego funkcja projektu klienta potrzebuje wpisu w `.wa/kit.json` i ile to obejście kosztuje;
- gdzie w kodzie siedzi przyczyna każdej pozycji i który plik dokumentacji opisuje ją szczegółowo;
- czym ograniczenie różni się od decyzji z [rejestru decyzji](decyzje.md).

Zweryfikowano z kodem: 4a6ffcb, 2026-10-27

Źródła:

- start i konta: `scripts/admin-create.ts`, `scripts/lib/admin-create.ts`, `.env.example`, `packages/cli/src/generate/registry.ts`, `package.json`, `.nvmrc`, `src/app/[locale]/accept-invitation/[id]/page.tsx`, `src/features/auth/components/sign-in-form.tsx`;
- rejestr modułów i generator: `.wa/kit.json`, `packages/cli/src/generate/index.ts`, `packages/cli/src/generate/targets.ts`, `packages/cli/src/manifest/schema.ts`, `src/shared/lib/modules/nav.ts`, `src/shared/lib/auth/permissions.ts`, `src/shared/lib/env.ts`, `src/shared/lib/mailer.ts`, `src/proxy.ts`;
- testy rdzenia liczące rejestr: `src/shared/lib/auth/__tests__/access-matrix.test.ts`, `src/shared/lib/modules/__tests__/nav.test.ts`, `src/shared/components/__tests__/app-sidebar.test.tsx`;
- auth, role i tryb serwisowy: `src/shared/lib/auth/index.ts`, `src/shared/lib/auth/admin-access.ts`, `src/shared/lib/auth/admin-guard.ts`, `src/shared/lib/auth/roles.ts`, `src/shared/components/service-mode/use-service-mode-action.tsx`, `src/features/organizations/components/organization-members.tsx`, `src/features/organizations/services/commands/member-commands.ts`, `src/features/organizations/services/queries/switchable-organizations-query.ts`, `src/features/users/services/commands/impersonation-commands.ts`;
- język, logi i serwer: `src/i18n/routing.ts`, `src/shared/lib/logger.ts`, `src/instrumentation.ts`, `src/app/api/healthcheck/route.ts`, `src/shared/utils/error-handling.ts`, `Dockerfile`, `railway.toml`;
- testy i proces: `stryker.integration.config.json`, `vitest.integration.config.ts`, `mutation-gate.json`, `scripts/lib/mutation-gate.ts`, `.claude/hooks/protect-tests.mjs`, `.claude/hooks/block-comments.mjs`, `.github/workflows/e2e.yml`, `commitlint.config.mjs`, `.gitignore`;
- biblioteki (wersje w `package-lock.json`): `node_modules/@stryker-mutator/core/dist/src/concurrent/concurrency-token-provider.js`, `node_modules/better-auth/dist/api/routes/sign-up.mjs`, `node_modules/better-auth/dist/plugins/admin/routes.mjs`, `node_modules/next-intl/dist/esm/development/middleware/resolveLocale.js`.

Ta lista opisuje zachowania, które wyszły przy czytaniu kodu i przy uruchamianiu komend z dokumentacji. Część z nich to luki, które właściciel kitu może zamknąć zmianą kodu. Inne to cena świadomej decyzji. Decyzje i ich powody są w [rejestrze decyzji](decyzje.md), a tu jest to, co z nich wynika dla Ciebie w praktyce, gdy coś zachowuje się niespodziewanie.

## Jak czytać ten plik

Każda pozycja ma te same pola:

| Pole | Znaczenie |
| --- | --- |
| Skutek | Co zobaczy deweloper: komunikat, brak funkcji, błędny wynik. |
| Gdzie | Plik z kodem, w którym jest przyczyna. |
| Obejście | Co zrobić, żeby pracować mimo ograniczenia. „Brak”, gdy go nie ma. |
| Kierunek zmiany | Propozycja z przeglądu kodu, nie decyzja. Opisuje zmianę, której w kodzie nie ma. Zmianę zatwierdza właściciel kitu (Jakub), więc do tego czasu obowiązuje opis z pola „Skutek”. |
| Sprawdzono | Skąd wiadomo: **uruchomiono** (skrypt, zbudowany serwer albo lokalny odbiornik z repozytorium), **z kodu** (wniosek z czytania kodu kitu i bibliotek bez uruchomienia) albo **z dokumentacji Railway** (źródło zewnętrzne). |

Priorytet „wysoki” dostają pozycje, które dotyczą domyślnej ścieżki startu, wyniku bramki plików krytycznych albo wdrożenia produkcyjnego. Pozostałe są uporządkowane tematycznie. Pozycje z małym skutkiem są w tabelach, bez osobnych nagłówków. Gdy zachowanie kodu różni się od zdania w `AGENTS.md`, dokumentacja idzie za kodem ([kolejność źródeł](11-praca-z-kitem.md#superpowers)).

## Spis pozycji

| Obszar | Pozycje |
| --- | --- |
| [Wysoki priorytet](#wysoki-priorytet) | [`admin:create` zakłada konto bez hasła](#admin-create-puste-haslo), [dwa procesy testów w przebiegu integracyjnym Strykera](#stryker-concurrency), [Railway nie czyta `railway.toml`](#railway-toml) |
| [Funkcje projektu i rejestr modułów](#funkcje-projektu) | [funkcja klienta w `.wa/kit.json`](#modul-projektu), [mniejsze pozycje generatora i rejestru](#rejestr-male) |
| [Logowanie, role i organizacje](#auth) | [zaproszenie dla istniejącego konta](#zaproszenie-istniejace-konto), [rola z kilkoma wartościami](#rola-wielowartosciowa), [tryb serwisowy](#tryb-serwisowy-luki), [impersonacja i konta serwisowe](#konta-serwisowe), [mniejsze pozycje](#auth-male) |
| [Język i komunikaty](#jezyk) | [wykrywanie języka](#wykrywanie-jezyka), [komunikaty i strona 404](#jezyk-male) |
| [Logi, healthcheck i serwer](#serwer) | [logi na produkcji](#logi), [`HOSTNAME=127.0.0.1`](#hostname), [mniejsze pozycje](#serwer-male) |
| [Wzorce kodu i reguły](#wzorce) | [`handleCommandError` i `notFound()`](#handle-command-error), [reguły z `AGENTS.md`, które kod stosuje inaczej](#reguly-agents) |
| [Testy i proces](#testy-proces) | [hook `protect-tests`](#protect-tests), [mniejsze pozycje](#testy-male) |
| [Uruchomienie i narzędzia](#start) | [tabela](#start-male) |

<a id="wysoki-priorytet"></a>

## Wysoki priorytet

<a id="admin-create-puste-haslo"></a>

### `admin:create` z pustą `ADMIN_PASSWORD=` zakłada konto bez hasła

**Skutek.** Domyślna ścieżka startu to `cp .env.example .env`, a potem `npm run admin:create -- --email <email>` ([01-uruchomienie.md](01-uruchomienie.md#admin-create)). `.env.example` ma linię `ADMIN_PASSWORD=` bez wartości, więc zmienna jest pustym napisem. Skrypt wypisuje „Wygenerowane hasło (pokazane raz)”, ale konto nie ma sposobu logowania hasłem: logowanie wypisanym hasłem kończy się błędem. Ponowne uruchomienie hasła nie ustawia, także z `--password`, bo skrypt nie zmienia hasła istniejącego konta.

**Gdzie.** `scripts/admin-create.ts` przekazuje `values.password ?? process.env.ADMIN_PASSWORD`, czyli `""`. `ensureUser` w `scripts/lib/admin-create.ts` traktuje pusty napis jak brak hasła i generuje hasło, ale do `auth.api.createUser` przekazuje `options.password ?? generatedPassword`, czyli nadal `""`. better-auth zakłada konto logowania hasłem tylko przy niepustym haśle. Żaden test tego nie wykrywa: `scripts/lib/__tests__/admin-create.test.ts` sprawdza hasło przekazane do `createUser` tylko dla hasła podanego wprost (`password: "my-password-1"`), a nie dla ścieżki z wygenerowanym hasłem ani z pustym napisem, a `e2e/global-setup.ts` zawsze podaje `--password`.

**Obejście.** Przed pierwszym uruchomieniem usuń linię `ADMIN_PASSWORD=` z `.env` albo podaj `--password`. Konto, które już powstało bez hasła, naprawia „Zapomniałeś hasła?” na stronie logowania. Na produkcji ta sama pułapka dotyczy `admin:create` uruchamianego przez `railway run`: skrypt szuka zmiennych, których usługa nie ma, w lokalnym `.env`, więc pusta `ADMIN_PASSWORD=` stamtąd też daje konto bez hasła ([10-wdrozenie.md](10-wdrozenie.md#admin-create)).

**Kierunek zmiany.** W `ensureUser` użyć `options.password || generatedPassword` (albo czytać `ADMIN_PASSWORD` tak jak schemat `optionalString` w `env.ts`, czyli pusty napis jako brak) i dopisać test, że `createUser` dostaje wygenerowane hasło.

**Sprawdzono.** Uruchomiono: `admin:create` z pustą `ADMIN_PASSWORD=` na bazie testowej dało konto bez wiersza w tabeli `accounts`. Szczegóły: [04-auth-i-role.md](04-auth-i-role.md#pusta-admin-password).

<a id="stryker-concurrency"></a>

### Przebieg integracyjny Strykera uruchamia dwa procesy testów na jednej bazie

**Skutek.** `npm run test:mutation:integration` i bramka plików krytycznych (`npm run test:mutation:gate`), która łączy jego raport z raportem unitowym, mogą liczyć mutanta jako wykrytego, choć żaden test go nie wykrył. Dotyczy to plików krytycznych sprawdzanych tym przebiegiem: `services/` organizacji, `org-context.ts`, `require-module-access.ts` i query feature `users`. Wynik jest zawyżony, nie zaniżony, więc przeżyły mutant w raporcie jest wiarygodny. Niepewne są mutanty zabite wyłącznie w przebiegu integracyjnym.

**Gdzie.** `stryker.integration.config.json` ma `"concurrency": 1` i `"checkers": ["typescript"]`. Stryker 10.1.1 dzieli wtedy `concurrency` na 1 proces sprawdzania typów i 1 proces testów, a gdy sprawdzanie typów się skończy (`freeCheckers`), dokłada drugi proces testów. Oba procesy Vitest używają jednego `INTEGRATION_DATABASE_URL`, a każdy test zaczyna od `resetDatabase()`, które czyści tabele. Jeden proces może wyczyścić dane drugiemu w trakcie testu, a test, który padnie z tego powodu, zabija mutanta „za darmo”. `fileParallelism: false` w `vitest.integration.config.ts` tego nie zapobiega, bo dotyczy plików w jednym procesie.

**Obejście.** Brak w konfiguracji. Do czasu zmiany traktuj mutanty zabite tylko w przebiegu integracyjnym jako niepotwierdzone. Nie uruchamiaj w tym czasie `npm run test:integration` na tej samej bazie ani drugiego przebiegu Strykera ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#jeden-stryker)).

**Kierunek zmiany.** Dwie opcje. Osobna baza na proces testów: `src/test/integration/database-url.ts` miałby doklejać do nazwy numer z `STRYKER_MUTATOR_WORKER` tak, żeby nazwa dalej kończyła się na `_test`, a `globalSetup` miałby zakładać każdą z baz. Albo `checkers: []`: wtedy `concurrency: 1` daje jeden proces testów, ale mutanty, które TypeScript odrzuca dziś jako `CompileError`, uruchamiają się w testach. Po zmianie trzeba przebieg i bramkę uruchomić od nowa, bo zapisane wyniki (`reports/stryker-integration-incremental.json`, cache CI) mogą zawierać fałszywie zabite mutanty.

**Sprawdzono.** Z kodu Strykera i z symulacji klasy `ConcurrencyTokenProvider`; samego przebiegu nie uruchamiano. Opis w dokumentacji: [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#concurrency).

<a id="railway-toml"></a>

### Railway nie czyta `railway.toml`, a wdrożenie bez migracji się udaje

**Skutek.** Nowa usługa na Railway nie korzysta z `railway.toml`: nie uruchomi komendy przed wdrożeniem (`npx prisma migrate deploy`), nie zastosuje healthchecku ani polityki restartu z pliku. Obraz zbuduje się z `Dockerfile` i wystartuje `node server.js`, więc wdrożenie wygląda na udane, ale baza nie ma tabel, a każde logowanie kończy się błędem. Ten sam skutek ma projekt, który nie zacommitował migracji: `prisma migrate deploy` bez katalogu `prisma/migrations` kończy się kodem 0 (`No migration found in prisma/migrations`), a `/api/healthcheck` (`SELECT 1`) przechodzi także na pustej bazie.

**Gdzie.** `railway.toml` (format „Config as Code”), `Dockerfile` (`CMD ["node", "server.js"]`), `src/app/api/healthcheck/route.ts`.

**Obejście.** Wpisz wartości z `railway.toml` ręcznie w ustawieniach usługi i sprawdź log migracji po pierwszym wdrożeniu ([10-wdrozenie.md](10-wdrozenie.md#config-as-code), [krok po kroku](10-wdrozenie.md#pierwsze-wdrozenie)). Migracje projektu klienta commitujesz, w przeciwieństwie do kitu ([03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#migracje-w-projekcie)).

**Kierunek zmiany.** Przenieść konfigurację do Infrastructure as Code (`.railway/railway.ts`) albo opisać ręczne ustawienia w `README.md`. Komenda przed wdrożeniem mogłaby kończyć się błędem przy braku migracji (na przykład `test -f prisma/migrations/migration_lock.toml && npx prisma migrate deploy`), a healthcheck mógłby odpytywać tabelę rdzenia (zob. [healthcheck](#serwer-male)).

**Sprawdzono.** Z dokumentacji Railway (2026-10-28): Config as Code jest wycofywany, nowe usługi nie mogą z niego korzystać, a istniejące pliki przestają być czytane 2026-12-01. Zachowanie `migrate deploy` bez migracji uruchomiono lokalnie (Prisma 7.10.1); wdrożenia na Railway nie uruchamiano.

<a id="funkcje-projektu"></a>

## Funkcje projektu i rejestr modułów

<a id="modul-projektu"></a>

### Funkcja klienta wymaga wpisu w `.wa/kit.json`

**Skutek.** Kit nie ma pojęcia „moduł należący do projektu”. `wa generate` rejestruje feature (`src/features/<x>/`) tylko wtedy, gdy jakiś moduł w `.wa/kit.json` ma w `files` glob pasujący do `src/features/<x>/`, a na dysku jest `module.ts`, `env.ts`, `auth.ts`, `auth-client.ts` albo `i18n/<locale>.json`. Funkcja klienta bez wpisu nie trafia do rejestru: nie ma pozycji w menu, `requireModuleAccess` z jej kluczem kończy się 404, jej tłumaczenia się nie ładują, a relacje zwrotne nie trafiają do regionów `wa:*` (te dopisuje tylko `schemaRelations` z manifestu). Plik `.wa/kit.json` opisuje z założenia kod pochodzący z kitu ([D02](decyzje.md#d02)), więc wpis funkcji klienta jest obejściem. [Tutorial](09-nowy-modul.md#krok-3) każe dodać ją jako osobny moduł pod własną nazwą.

**Koszt obejścia.** Trzy testy rdzenia porównują rejestr (`clientModules`) z listą wpisaną na stałe, więc każda funkcja projektu je psuje:

- `src/shared/lib/auth/__tests__/access-matrix.test.ts`: test „rejestr zawiera dokładnie 5 modułów z macierzy”, stała `MATRIX` i listy `NAV`;
- `src/shared/lib/modules/__tests__/nav.test.ts`: trzy testy w bloku „getNavEntries (rejestr generowany)” z dokładnymi listami adresów;
- `src/shared/components/__tests__/app-sidebar.test.tsx`: test „member widzi pozycje z rejestru z etykietami z namespace modułu”.

W przebiegu tutorialu `npm run verify` kończy się kodem 1 (27 nieudanych testów w 3 plikach), dopóki funkcja nie zostanie dopisana do tych testów. To zmiana plików modułu `core`, sprzeczna z regułą „moduł nie edytuje rdzenia” ([D03](decyzje.md#d03)), i źródło konfliktów przy przyszłej aktualizacji kitu ([09b-implementacja-i-bramki.md](09b-implementacja-i-bramki.md#testy-rdzenia)). Do tego dochodzi brak kontroli „każdy plik ma właściciela”: nic nie porównuje plików z wzorcami `files`, a manifest `core` nie obejmuje między innymi `scripts/**`, `e2e/**`, `src/proxy.ts`, `src/instrumentation.ts`, `src/types/**` i plików konfiguracyjnych w katalogu głównym ([D02](decyzje.md#d02)).

**Gdzie.** `.wa/kit.json`, `packages/cli/src/generate/index.ts` (stała `FEATURE_GLOB`), `packages/cli/src/generate/targets.ts` (`regionTargets`).

**Obejście.** Wpis modułu w `.wa/kit.json` według [kroku 3 tutorialu](09-nowy-modul.md#krok-3) i dopisanie funkcji do trzech testów rdzenia według [kroku 8](09b-implementacja-i-bramki.md#testy-rdzenia). Funkcję w istniejącym module kitu (bez nowego wpisu) opisuje [osobna sekcja](09b-implementacja-i-bramki.md#istniejacy-modul). Objaw braku wpisu: [09-nowy-modul.md](09-nowy-modul.md#objaw-braku-wpisu).

**Kierunek zmiany.** Osobne miejsce w `.wa/kit.json` dla modułów projektu (na przykład sekcja z samym manifestem, bez `version` i hashy plików), którą `wa generate` czyta tak samo jak moduły kitu, a `wa update`, `wa diff` i `wa kit sync` pomijają, a `wa remove` nie kasuje jej plików bez jawnej zgody. Testy rdzenia filtrowałyby rejestr do kluczy feature modułu `core` i przekazywały go do `getNavEntries(context, modules)` (drugi parametr już istnieje) oraz do `canAccessModule`. Po takiej zmianie tutorial traci krok edycji testów rdzenia. Plan 2 i plan 4 traktują `.wa/kit.json` jako opis kodu z kitu, więc zmianę trzeba uzgodnić z nimi ([README.md](README.md#plany)).

**Sprawdzono.** Z kodu generatora i uruchomiono: przebieg tutorialu na kopii roboczej z commitu 4a6ffcb.

<a id="rejestr-male"></a>

### Mniejsze pozycje generatora i rejestru

| Ograniczenie | Skutek | Gdzie | Obejście |
| --- | --- | --- | --- |
| `key` w `defineModule` różni się od nazwy katalogu feature | Etykieta menu bez tłumaczenia: generator zapisuje teksty pod nazwą katalogu, a menu szuka etykiety pod `key`. Nic nie sprawdza, że oba są równe | `src/shared/lib/modules/nav.ts` (`getNavEntries`), `packages/cli/src/generate/registry.ts` | Nazwij katalog tak samo jak `key` ([D27](decyzje.md#d27)) |
| Generator pomija bez błędu relację do modelu innego niż `User` i `Organization`, nieznane pola manifestu (literówka `schemaRelation` przechodzi) i pole `env[].required` | Relacja albo zmienna nie trafia do regionu, a błąd widać dopiero w `prisma validate` albo wcale | `packages/cli/src/generate/targets.ts` (`relationsBody`, `envBody`), `packages/cli/src/manifest/schema.ts` | Po `wa generate` obejrzyj diff regionów ([02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#regiony)) |
| `prisma format` przy brakującej relacji zwrotnej | Dopisuje pole pod `// wa:relations:end`, poza regionem. Po dodaniu `schemaRelations` i `wa generate` pole jest dwa razy, a `prisma validate` zgłasza `Field … is already defined` | `prisma/schema/organizations.prisma`, `prisma/schema/auth.prisma` | Nie uruchamiaj `prisma format` przy tym błędzie. Dodaj `schemaRelations` ([pułapka w 09](09-nowy-modul.md#pulapka-relacji)) |
| Trasa feature zaczynająca się od `api` albo zawierająca kropkę | `matcher` w `src/proxy.ts` pomija taki adres: `/api-keys` daje 404 (brak przepisania na `/pl/api-keys`), a `/en/api-keys` działa | `src/proxy.ts` | Nie nazywaj tras `api…` ani z kropką ([02-architektura.md](02-architektura.md#proxy)) |
| Zmienne feature z `env.ts` nie mają typu | `env.NAZWA` kończy się błędem TypeScript (TS2339), bo `env` ma typ `CoreEnv`. Walidacja działa. Generator nie porównuje pola `env` manifestu z kluczami `envSchema` | `src/shared/lib/env.ts` | [07-i18n-mail-env.md](07-i18n-mail-env.md#env-feature) |
| Moduł nie wyśle własnego maila bez edycji rdzenia | `mailer.ts` eksportuje tylko trzy funkcje dla maili rdzenia. Wspólna funkcja wyboru transportu nie jest eksportowana, a szablony leżą w `src/app/emails/` | `src/shared/lib/mailer.ts` | Edycja `mailer.ts` (zmiana rdzenia) albo własna wysyłka ([07-i18n-mail-env.md](07-i18n-mail-env.md#szablony)) |
| `canAccessPath`, `moduleForPath`, eksport `modules` z rejestru i pole `routePrefixes` nie wpływają na działanie | Zmiana `routePrefixes` nie zmienia dostępu: trasę chroni tylko `requireModuleAccess(key)`. Funkcje mają testy, ale nikt ich nie wywołuje | `src/shared/lib/auth/permissions.ts`, `src/modules.generated.ts` | Wołaj `requireModuleAccess(key)` na każdej stronie ([D11](decyzje.md#d11)) |

<a id="auth"></a>

## Logowanie, role i organizacje

<a id="zaproszenie-istniejace-konto"></a>

### Zaproszenie dla osoby, która ma już konto

**Skutek.** Osoba z kontem, która dostała zaproszenie, ma na stronie `/accept-invitation/<id>` dwie drogi i obie kończą się nieprzyjętym zaproszeniem:

- **„Zaloguj się”** prowadzi na `/sign-in` bez parametru powrotu. `sign-in-form.tsx` po zalogowaniu zawsze wykonuje `router.push("/dashboard")` (konto bez członkostwa przenosi dalej na `/no-organization` guard strony `/dashboard`), a hook `session.create.before` w `src/shared/lib/auth/index.ts` szuka członkostw, nie zaproszeń.
- **„Załóż konto”** z adresem, który ma konto, pokazuje „Konto zostało utworzone. Zaloguj się.”. Przy `autoSignIn: false` better-auth zwraca wtedy odpowiedź jak przy sukcesie (żeby nie zdradzać, które adresy mają konta), nie tworzy konta i nie wykonuje hooka `databaseHooks.user.create.after`, więc zaproszenie zostaje `pending`.

Dodatkowo strona przyjmuje zaproszenie w `page.tsx` przy samym otwarciu adresu (zalogowany użytkownik, żądanie GET): woła `auth.api.acceptInvitation` i `auth.api.setActiveOrganization` bez przycisku potwierdzenia, mimo że `AGENTS.md` odsuwa logikę biznesową od `page.tsx`. Strona nie ma testu, a e2e nie przechodzą przez `/accept-invitation`.

**Gdzie.** `src/app/[locale]/accept-invitation/[id]/page.tsx`, `src/features/auth/components/sign-in-form.tsx`, `src/shared/lib/auth/index.ts`.

**Obejście.** Zaloguj się, a potem otwórz link z maila jeszcze raz ([04-auth-i-role.md](04-auth-i-role.md#accept-invitation)).

**Kierunek zmiany.** Parametr powrotu na `/sign-in` (ścieżka względna, z walidacją) albo przyjmowanie oczekujących zaproszeń po zalogowaniu, z adresem konta. Przeniesienie przyjęcia do akcji serwerowej z przyciskiem „Przyjmij zaproszenie”. Neutralny komunikat przy rejestracji („Jeśli adres nie miał konta, konto zostało utworzone”) albo czytelny błąd „Masz już konto” przy ważnym zaproszeniu.

**Sprawdzono.** Z kodu kitu i better-auth 1.7.13; żaden test kitu tego nie sprawdza.

<a id="rola-wielowartosciowa"></a>

### Rola globalna z kilkoma wartościami działa w aplikacji inaczej niż w hooku

**Skutek.** Konto z rolą zapisaną jako napis z przecinkami, na przykład `admin,superadmin`, jest chronione jak superadmin (hook `before` na `/admin/*` i uprawnienia pluginu `admin`), ale w aplikacji działa jak `user`: bez trybu serwisowego (`NoOrganizationError` w organizacji bez członkostwa), z odznaką „Użytkownik” na liście kont, a przycisk „Zaloguj jako” przy nim kończy się 403. Taką wartość zapisują tylko wywołania API (`/admin/set-role`, `/admin/create-user`, `/admin/update-user` z tablicą ról); interfejs kitu jej nie tworzy, a tablicę z `superadmin` zapisze tylko superadmin.

**Gdzie.** `toUserRole` i `isGlobalAdmin` w `src/shared/lib/auth/roles.ts` porównują całą wartość, a `roleFromStored` w `src/shared/lib/auth/admin-guard.ts` dzieli ją po przecinku i bierze najwyższą rolę.

**Obejście.** Nadawaj kontu jedną rolę.

**Kierunek zmiany.** Jeden czytnik roli w całym kodzie albo odrzucanie w hooku `before` żądań z więcej niż jedną rolą (HTTP 400).

**Sprawdzono.** Z kodu i testów. Szczegóły: [04-auth-i-role.md](04-auth-i-role.md#dwa-czytniki-roli), decyzja [D08](decyzje.md#d08).

<a id="tryb-serwisowy-luki"></a>

### Tryb serwisowy: dialog nie obejmuje wszystkiego

**Skutek.** Dwie luki, żadna nie daje dostępu do cudzych danych:

- **Wywołania `authClient.organization.*`.** Dialog potwierdzenia obejmuje komendy kitu wołane przez `useServiceModeAction().run`. W rdzeniu używa go tylko `invite-user-dialog.tsx`. `organization-members.tsx` woła `authClient.organization.inviteMember`, `cancelInvitation`, `removeMember` i `updateMemberRole` bez dialogu, a `create-organization-form.tsx` woła `create`. Superadmin nie używa `organization-members.tsx` do danych obcej organizacji (strona „Użytkownicy” pokazuje go tylko kontom bez roli globalnej `admin` albo `superadmin`), a pozostałe endpointy pluginu `organization` sprawdzają członkostwo wywołującego. Formularz `create-organization-form.tsx` superadmin widzi (przełącznik organizacji dostaje `canCreateOrganization={multiOrg}` bez względu na rolę), ale `authClient.organization.create` zakłada nową organizację z wywołującym jako `owner` i ustawia ją jako aktywną, więc nie zmienia danych organizacji, w której superadmin był w trybie serwisowym. Luka dotyczy nowego UI: jeśli moduł doda widok z `authClient.organization.*` dla superadmina, zapis powinien przejść przez komendę kitu z `assertServiceModeConfirmed` ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#authclient-organization)).
- **Karta otwarta przed przełączeniem organizacji.** `AGENTS.md` mówi, że nieaktualna karta po przełączeniu organizacji dostaje błąd. Dotyczy to tylko kart, w których któraś organizacja jest w trybie serwisowym. Poza trybem serwisowym `run` woła akcję bez potwierdzenia, a `assertServiceModeConfirmed` przepuszcza brak potwierdzenia. Karta wyrenderowana w organizacji A po przełączeniu w innej karcie na organizację B (obie z członkostwem) zapisze dane w B bez błędu ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#nieaktualna-karta)).

**Gdzie.** `src/shared/components/service-mode/use-service-mode-action.tsx`, `src/shared/lib/auth/service-mode.ts`, `src/features/organizations/components/organization-members.tsx`.

**Obejście.** Nie pracuj w dwóch kartach w różnych organizacjach tego samego konta. Nowe UI superadmina buduj na komendach kitu, a nie na `authClient.organization.*`.

**Kierunek zmiany.** `run` wysyła `organizationId` karty w każdym trybie (osobne pole, na przykład `expectedOrganizationId`), a assert porównuje je z aktywną organizacją także poza trybem serwisowym. Doprecyzowanie `AGENTS.md` do „każda komenda kitu na danych organizacji”.

**Sprawdzono.** Z kodu i testów jednostkowych; żaden test nie sprawdza dwóch kart. Decyzja: [D22](decyzje.md#d22).

<a id="konta-serwisowe"></a>

### Impersonacja i konta serwisowe po okresie wsparcia

**Skutek.** Cztery luki:

- **Log impersonacji zapisuje przeglądarka.** `logImpersonationStartCommand` i `logImpersonationStopCommand` woła interfejs po udanym podszyciu. Wywołanie `POST /api/auth/admin/impersonate-user` wprost tworzy sesję bez wpisu `[USERS] Impersonation started` ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#impersonacja)).
- **Admin może unieważnić sesję podszycia.** Sesja, w której superadmin podszywa się pod zwykłego użytkownika, należy do konta celu, a hook sprawdza rolę właściciela sesji. Admin, który ma uprawnienie `session:revoke`, może ją więc unieważnić (niski priorytet).
- **Panel „Użytkownicy” ma tylko „Zaproś użytkownika” i „Zaloguj jako”.** Zmiana roli i usunięcie konta są dostępne wyłącznie przez endpointy `/api/auth/admin/*`.
- **Odcięcie dostępu Web Amigos wymaga kilku wywołań API.** `/admin/remove-user` odrzuca usunięcie własnego konta, więc jedynego konta `superadmin` nie usuniesz. `/admin/set-role` pozwala zmienić własną rolę na `user`, ale członkostwo `owner` zostaje. Sesja podszycia (3600 s) przeżywa zmianę roli i usunięcie konta, bo `impersonatedBy` w `prisma/schema/auth.prisma` to `String?` bez relacji.

**Gdzie.** `src/features/users/services/commands/impersonation-commands.ts`, `src/shared/lib/auth/admin-access.ts` (`ADMIN_TARGET_PATHS`), `src/features/users/components/users-manager.tsx`, `scripts/lib/admin-create.ts` (`ensureOrganizationOwner`).

**Obejście.** Procedura odcięcia dostępu krok po kroku, z kolejnością wywołań: [10-wdrozenie.md](10-wdrozenie.md#odciecie-dostepu). Zakończ podszywanie („Wróć do własnego konta”) albo odczekaj godzinę przed odcięciem ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#konto-po-wsparciu)).

**Kierunek zmiany.** Zapis logu po stronie serwera, w hooku `after` na `/admin/impersonate-user` i `/admin/stop-impersonating`. Widok albo skrypt w kicie do usuwania kont serwisowych. Przy `remove-user` i `set-role` usuwanie także sesji z `impersonatedBy` równym id konta.

**Sprawdzono.** Odcięcie dostępu uruchomiono wywołaniami `auth.handler` na bazie testowej (2026-10-28). Log i sesje podszycia z kodu kitu i better-auth 1.7.13.

<a id="auth-male"></a>

### Mniejsze pozycje

| Ograniczenie | Skutek | Gdzie | Obejście |
| --- | --- | --- | --- |
| Rola globalna z cookie cache (do 5 minut) | Konto, któremu odebrano rolę `admin`, przez najwyżej 5 minut nadal przechodzi guard `MULTI_ORG=false` i zakłada konta w `inviteUserCommand` z karty otwartej wcześniej. Zdegradowany superadmin widzi nazwy organizacji w przełączniku, ale `enterOrganizationCommand` czyta rolę z bazy i odrzuca wejście. Dwie funkcje `readSession` (w `helpers.ts` z cache, w `org-context.ts` z bazy) mają ten sam kształt, więc łatwo je pomylić | `src/shared/lib/auth/index.ts` (`getSessionFromCtx`), `src/shared/lib/auth/helpers.ts`, `src/features/organizations/services/queries/switchable-organizations-query.ts` | Wymuś wylogowanie albo poczekaj 5 minut. Nowe reguły oparte na roli czytaj z `getOrgContext()` ([04-auth-i-role.md](04-auth-i-role.md#rola-z-cookie-cache)) |
| Token resetu hasła ważny 48 godzin dla wszystkich linków | Dotyczy każdego „Zapomniałeś hasła?”, nie tylko maila powitalnego | `src/shared/lib/auth/index.ts` (`resetPasswordTokenExpiresIn`) | Brak. Link wygasa po 48 godzinach ([04-auth-i-role.md](04-auth-i-role.md#hasla)) |
| Brak indeksu na `verifications.identifier` | better-auth wyszukuje weryfikacje (tokeny resetu hasła i inne) po `identifier` (`findVerificationValue`), więc przy dużej tabeli zapytanie przegląda całą tabelę | `prisma/schema/auth.prisma` | Dodaj w projekcie `@@index([identifier])` i migrację ([03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#migracje-w-projekcie)) |
| Konto bez członkostwa, gdy zapis członkostwa po rejestracji się nie uda | Hook `databaseHooks.user.create.after` działa po utworzeniu konta: błąd zostawia konto bez organizacji, które trafia na `/no-organization` | `src/shared/lib/auth/index.ts`, `src/features/organizations/services/signup-membership.ts` | Brak w kicie ([03-dane-i-organizacje.md](03-dane-i-organizacje.md#no-organization)) |
| `invitation.update` przy rejestracji z zaproszeniem nie sprawdza ponownie `status: "pending"` | Status `pending` sprawdzają tylko kontrole przed rejestracją: `hasPendingInvitation` (`src/features/auth/services/signup-gate.ts`) i `resolveInvitation` (`src/features/organizations/services/signup-membership.ts`). Transakcja w `joinOrganizationCommand` wybiera zaproszenie po samym `id`, więc zaproszenie anulowane między sprawdzeniem a zapisem zostanie ustawione na `accepted` | `src/features/organizations/services/commands/member-commands.ts` | Brak |
| Test izolacji na prawdziwej bazie nie obejmuje `inviteUserCommand` | Jedyna akcja serwerowa rdzenia zapisująca dane organizacji z kontekstu ma tylko test z mockami: zapis do cudzej organizacji nie jest sprawdzony na bazie | `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts` | Dopisz przypadek: admin z aktywną organizacją A zaprasza, zaproszenie B bez zmian ([03-dane-i-organizacje.md](03-dane-i-organizacje.md#izolacja)) |

<a id="jezyk"></a>

## Język i komunikaty

<a id="wykrywanie-jezyka"></a>

### Wykrywanie języka przez next-intl jest włączone i nikt go nie postanowił

**Skutek.** Adres bez prefiksu nie zawsze oznacza polski. Przeglądarka ustawiona na angielski dostaje po `npm run dev` wersję angielską (307 na `/en/...`). Jedno wejście na `/en/...` zapisuje ciasteczko `NEXT_LOCALE=en` i kolejne adresy bez prefiksu też przekierowują na `/en/...`. Wersję polską przywraca otwarcie dowolnego adresu `/pl/...`. Testy e2e tego nie widzą, bo `playwright.config.ts` ustawia przeglądarce `locale: "pl"`.

**Gdzie.** `src/i18n/routing.ts` (`defineRouting` nie ustawia `localeDetection`, więc next-intl 4.14.9 przyjmuje `true`) i middleware w `src/proxy.ts`. Język jest brany kolejno z prefiksu, ciasteczka `NEXT_LOCALE`, nagłówka `Accept-Language` i dopiero z `defaultLocale`.

**Obejście.** Wersję polską przywróci otwarcie dowolnego adresu `/pl/...` (proxy zapisze `NEXT_LOCALE=pl`), usunięcie ciasteczka `NEXT_LOCALE` albo ustawienie przeglądarki na polski.

**Kierunek zmiany.** Albo `localeDetection: false` w `defineRouting` (polski zawsze bez prefiksu, angielski tylko pod `/en`; przy tym ustawieniu next-intl pomija ciasteczko i nagłówek), albo zostawić wykrywanie i opisać je w `AGENTS.md`. Po zmianie trzeba poprawić [07-i18n-mail-env.md](07-i18n-mail-env.md#wykrywanie-jezyka), krok 8 w [01-uruchomienie.md](01-uruchomienie.md#pierwsze-uruchomienie) i [D27](decyzje.md#d27).

**Sprawdzono.** Uruchomiono: middleware next-intl z konfiguracją repozytorium wywołany na obiektach żądań. `/sign-in` z `Accept-Language: en-US` daje 307 na `/en/sign-in`, `/dashboard` z `NEXT_LOCALE=en` i `Accept-Language: pl` daje 307 na `/en/dashboard`, a `/sign-in` bez nagłówków daje przepisanie na `/pl/sign-in`.

<a id="jezyk-male"></a>

### Komunikaty i strona 404

| Ograniczenie | Skutek | Gdzie | Obejście |
| --- | --- | --- | --- |
| Komunikaty błędów akcji serwerowych nie są tłumaczone | W wersji `en` użytkownik widzi polskie komunikaty akcji („Brak uprawnień”, „Nie udało się zaprosić użytkownika”). Błąd walidacji w `inviteUserCommand` to domyślny komunikat Zod po angielsku, ale formularz zwykle sprawdza ten sam schemat wcześniej i pokazuje własne teksty | `src/features/users/services/commands/invite-user-command.ts`, `src/features/organizations/services/commands/enter-organization-command.ts`, `src/features/auth/services/commands/change-password-command.ts` | Brak. Nowe komendy zwracają komunikat po polsku ([06-wzorce-kodu.md](06-wzorce-kodu.md#wynik-i-bledy)) |
| Brak zlokalizowanej strony 404 | Kit nie ma strony `not-found`, więc 404 pokazuje domyślną stronę Next.js, niezależnie od języka | `src/app` | Dodaj w projekcie stronę `not-found` z tłumaczeniami |

<a id="serwer"></a>

## Logi, healthcheck i serwer

<a id="logi"></a>

### Logi: bez endpointu OTLP produkcja niczego nie zapisuje

**Skutek.** Trzy powiązane zachowania:

- **Bez `OTEL_EXPORTER_OTLP_ENDPOINT` wpisy `logger` znikają na produkcji.** `logger` wysyła każdy wpis przez API logów OpenTelemetry, a na konsolę pisze tylko przy `NODE_ENV !== "production"` i braku endpointu. `register()` rejestruje provider logów wyłącznie przy ustawionym endpoincie, więc na produkcji bez niego wpisy trafiają do providera pustego. Znikają między innymi `[MAILER] …`, `[AUTH] Failed to resolve active organization` i `[USERS] Impersonation …`.
- **`LOG_LEVEL` niczego nie zmienia.** Zmienna jest walidowana w `src/shared/lib/env.ts` (dowolny niepusty napis), ale nic jej nie czyta, a `logger` nie filtruje po poziomie.
- **Ostatnie wpisy przed zatrzymaniem procesu mogą nie dotrzeć.** `BatchLogRecordProcessor` wysyła paczki co 5 sekund, a kod nie wywołuje `forceFlush()` ani `shutdown()`. Przy `SIGTERM` (restart albo wdrożenie) Next.js kończy proces bez zamknięcia providera logów, więc zapisy z ostatnich sekund, także błędy, które restart spowodowały, mogą zniknąć.

**Gdzie.** `src/shared/lib/logger.ts` (`emit`), `src/instrumentation.ts` (`register`), `src/shared/lib/env.ts`.

**Obejście.** Na produkcji ustaw `OTEL_EXPORTER_OTLP_ENDPOINT` ([10-wdrozenie.md](10-wdrozenie.md#logi), [D15](decyzje.md#d15)). Poziomu logów nie ustawisz.

**Kierunek zmiany.** Przy `NODE_ENV=production` bez endpointu pisać wpisy na stdout (jedna linia JSON na wpis) albo wymagać endpointu w `coreEnvSchema` na produkcji. Zaimplementować filtrowanie po `LOG_LEVEL` albo usunąć zmienną z `env.ts`, `.env.example` i `README.md`. W `register()` zachować provider i wywołać `shutdown()` przy `SIGTERM` (obsługa `SIGTERM` w Next.js kończy proces sama, więc wymaga to sprawdzenia) albo skrócić `scheduledDelayMillis`.

**Sprawdzono.** Pierwsze z kodu (bez uruchamiania produkcji). Drugie z kodu. Trzecie uruchomiono z lokalnym odbiornikiem HTTP: proces kończący się po 0,5 s nie wysłał niczego, a czekający 6,5 s wysłał wszystko. `SIGTERM` na Railway nie uruchamiano. Szczegóły: [07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#otel).

<a id="hostname"></a>

### `HOSTNAME=127.0.0.1` w serwerze standalone daje pętlę 307

**Skutek.** Przy serwerze `server.js` uruchomionym z `HOSTNAME=127.0.0.1` żądanie `GET /sign-in` (polski adres bez prefiksu) kończy się odpowiedzią 307 na ten sam adres, czyli pętlą przekierowań. Adresy `/en/...` działają, bo nie wymagają przepisania na `/pl/...`. `/api/healthcheck` omija proxy i zwraca 200, więc healthcheck pętli nie wykryje. Domyślnego wdrożenia nie dotyczy (`Dockerfile` ustawia `HOSTNAME="0.0.0.0"`). Dotyczy serwera przypiętego do loopbacka za reverse proxy albo `HOSTNAME` ustawionego ręcznie w zmiennych Railway.

**Gdzie.** `Dockerfile` (`ENV HOSTNAME="0.0.0.0"`), `src/proxy.ts` (przepisanie next-intl).

**Obejście.** Zostaw `HOSTNAME` równe `0.0.0.0` (albo `::`; `localhost` tylko lokalnie, jak w serwerach e2e, nie w kontenerze) ([10-wdrozenie.md](10-wdrozenie.md#hostname)). Po wdrożeniu otwórz polski adres bez prefiksu.

**Kierunek zmiany.** Ostrzeżenie w `README.md` albo test po wdrożeniu, który otwiera polski adres bez prefiksu i sprawdza brak przekierowania. Przyczyna (host `localhost` w celu przepisania) jest wywnioskowana, nie prześledzona w kodzie Next.js.

**Sprawdzono.** Uruchomiono na zbudowanym serwerze (Next.js 16.3.8, next-intl 4.14.9), także z nagłówkiem `Host: app.example.com`.

<a id="serwer-male"></a>

### Mniejsze pozycje

| Ograniczenie | Skutek | Gdzie | Obejście |
| --- | --- | --- | --- |
| `/api/healthcheck` odpytuje tylko bazę | Przechodzi przy błędnych zmiennych środowiskowych (nie czyta `env`) i na bazie bez tabel. Gałąź `catch` zwraca 503 bez wpisu w logu | `src/app/api/healthcheck/route.ts` | Po wdrożeniu otwórz stronę logowania i sprawdź log migracji ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#healthcheck)) |
| Wersje `prisma` i `dotenv` w `Dockerfile` są wpisane ręcznie | Po aktualizacji `prisma` w `package.json` obraz ma CLI w innej wersji niż klient z etapu `builder`. Nic nie porównuje ich z `package-lock.json` | `Dockerfile` | Zmieniaj oba miejsca ([10-wdrozenie.md](10-wdrozenie.md#prisma-cli)) |

<a id="wzorce"></a>

## Wzorce kodu i reguły

<a id="handle-command-error"></a>

### `handleCommandError` zamienia odmowę z `notFound()` na komunikat domyślny

**Skutek.** `requireModuleAccess` przy braku dostępu i przy nieznanym kluczu woła `notFound()`. Komenda, która woła `requireModuleAccess` wewnątrz `try`, dostaje przy odmowie `{ success: false, error: <komunikat domyślny> }`, a log zapisuje `logger.error` zamiast ostrzeżenia. Odmowa jest bezpieczna (komenda kończy się przed Prismą), ale użytkownik bez dostępu widzi „Nie udało się…”, a log nie odróżnia odmowy od awarii. Tak samo kończy się `NoOrganizationError` z `getOrgContext()`. Dotyczy pierwszej komendy każdego nowego feature, który pójdzie za wzorcem z [06-wzorce-kodu.md](06-wzorce-kodu.md#wynik-i-bledy).

**Gdzie.** `src/shared/utils/error-handling.ts` (`isNextRedirect` przepuszcza tylko błędy z `digest` zaczynającym się od `NEXT_REDIRECT`), `src/shared/lib/auth/require-module-access.ts`.

**Obejście.** Brak. Dokumentacja radzi zostawić `requireModuleAccess` w `try` bez `unstable_rethrow`, bo rzucenie `notFound()` dalej kończy się w komponencie wyjątkiem bez komunikatu dla użytkownika.

**Kierunek zmiany.** `handleCommandError` rozpoznaje błąd z `digest` zaczynającym się od `NEXT_HTTP_ERROR_FALLBACK;` i zwraca `{ success: false, error: "Brak uprawnień" }` z wpisem `warn`, a dla `NoOrganizationError` osobny komunikat, z nowym testem obok pliku w `src/shared/utils`.

**Sprawdzono.** Uruchomiono: test z `handleCommandError` z repozytorium i zamockowanym `logger`. Wniosek o zachowaniu komponentu z kodu Next.js 16.3.8 i react-hook-form.

<a id="reguly-agents"></a>

### Reguły z `AGENTS.md`, które kod stosuje inaczej

Gdy kod różni się od zdania w `AGENTS.md`, dokumentacja opisuje kod. Poniższe różnice mogą zaskoczyć przy kopiowaniu istniejących wzorców.

| Reguła w `AGENTS.md` | Co robi kod | Gdzie opisane |
| --- | --- | --- |
| Akcja serwerowa: walidacja → autoryzacja → serwis | `inviteUserCommand` robi autoryzację, potem walidację, potem kontekst i `assertServiceModeConfirmed`. Dla nowej komendy dokumentacja zaleca kolejność z `AGENTS.md` | [06-wzorce-kodu.md](06-wzorce-kodu.md#kolejnosc) |
| Akcje zwracają `OperationResult<T>`, schematy w `contracts/` | `changePasswordCommand` nie waliduje Zod na serwerze i ma własny typ wyniku. `organizationIdSchema` leży w pliku akcji | [06-wzorce-kodu.md](06-wzorce-kodu.md#akcje-spoza-kontraktu) |
| `commands/` zawiera akcje `"use server"` | `createOrganizationWithOwnerCommand` i `joinOrganizationCommand` to funkcje wewnętrzne bez `"use server"`, wołane przy rejestracji | [05-moduly-rdzenia.md](05-moduly-rdzenia.md#organizations) |
| `contracts/` to typy i schematy Zod | `slugifyOrganizationName` (funkcja) leży w `contracts/`, `OrganizationMembersData` poza nim, a dwa pliki query nie mają `import "server-only"` | [06-wzorce-kodu.md](06-wzorce-kodu.md#query) |
| Bez komentarzy, bez cichych `catch`, bez zagnieżdżonych ternary | `src/components/ui/` ma komentarze, ciche `catch` i zagnieżdżone ternary. Hook `block-comments.mjs` pomija ten katalog, `node_modules/` i `generated/` oraz przepuszcza `/// <reference`, `// cache-scope:` i `eslint-enable` | [05-moduly-rdzenia.md](05-moduly-rdzenia.md#components-ui), [D23](decyzje.md#d23) |
| Lista reguł stylu (`no-nested-ternary`, `any`) | ESLint wymusza też `curly`. „Bez cichych `catch`” nie ma reguły. `@ts-expect-error` bez opisu zatrzymuje dopiero `npm run lint` | [06-wzorce-kodu.md](06-wzorce-kodu.md#reguly-stylu) |
| `getOrgContext()` rzuca `NoOrganizationError` bez aktywnej organizacji | Bez sesji przekierowuje na `/sign-in`. `NoOrganizationError` pojawia się też przy braku członkostwa w aktywnej organizacji | [03-dane-i-organizacje.md](03-dane-i-organizacje.md#kontekst-organizacji) |
| `MULTI_ORG=true`: każda rejestracja tworzy organizację | Rejestracja z zaproszeniem dołącza do organizacji zaproszenia. `OrgSwitcher` pokazuje listę przy więcej niż jednej organizacji w obu trybach | [03-dane-i-organizacje.md](03-dane-i-organizacje.md#tryby-multi-org), [D06](decyzje.md#d06) |
| Temat commitu małymi literami | commitlint odrzuca tylko `sentence-case`, `start-case`, `pascal-case` i `upper-case`, a tylko w hooku husky | [11-praca-z-kitem.md](11-praca-z-kitem.md#commity) |

<a id="testy-proces"></a>

## Testy i proces

<a id="protect-tests"></a>

### Hook `protect-tests` chroni mniej, niż mówi `AGENTS.md`

**Skutek.** Dwie luki w blokadzie testów w fazie `implement`:

- **Zakres ścieżek.** Hook blokuje `__tests__/`, `e2e/` i pliki `*.test.*` oraz `*.spec.*` (rozszerzenia JS i TS). Nie obejmuje `src/test/` (`fake-prisma.ts`, `resetDatabase`, `setup-env.ts`), `vitest*.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `stryker*.json`, `mutation-gate.json`, samego hooka ani `.claude/settings.json`. Implementer w tej fazie może więc narzędziem `Edit` zmienić zachowanie Prismy w pamięci, zawęzić `mutate` albo dopisać wpis do `allowed` w bramce.
- **Katalog fazy.** Hook czyta `.superpowers/phase` z `CLAUDE_PROJECT_DIR`, czyli z katalogu, w którym wystartowała sesja, a nie z worktree, w którym pracuje agent. Plik fazy zapisany w worktree zadania nie blokuje implementera, a plik w głównej kopii blokuje edycję testów we wszystkich worktree tej sesji, także dla `test-writer`. Z tego samego powodu uruchamiana jest wersja hooków z głównej kopii.

**Gdzie.** `.claude/hooks/protect-tests.mjs` (stałe `TEST_PATH` i `projectDir`).

**Obejście.** Zapisz plik fazy w katalogu, w którym wystartowała sesja. Usuń go po implementacji. Diff plików spoza blokady sprawdź poleceniem z sekcji [Czego hook nie blokuje](08b-testy-adwersarialne.md#czego-hook-nie-blokuje). Wpisy do `allowed` i tak zatwierdza człowiek w PR.

**Kierunek zmiany.** Rozszerzyć wzorzec o wymienione ścieżki, czytać fazę z katalogu z `input.cwd`, a każdą zmianę pokryć testem w `.claude/hooks/protect-tests.test.mjs`. Albo dopisać kontrolę diffu tych plików do checklisty `.claude/agents/test-reviewer.md`.

**Sprawdzono.** Uruchomiono hook z `CLAUDE_PROJECT_DIR` głównej kopii: plik fazy tylko w worktree daje kod 0, tylko w głównej kopii kod 2. Opis: [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#faza), [11-praca-z-kitem.md](11-praca-z-kitem.md#faza).

<a id="testy-male"></a>

### Mniejsze pozycje

| Ograniczenie | Skutek | Gdzie | Obejście |
| --- | --- | --- | --- |
| Wpis w `allowed` pokrywa każdy identyczny mutant w pliku, także w kodzie dopisanym później. Bramka blokuje też status `NoCoverage` | Wpisy o ogólnej treści (`BooleanLiteral` `true` → `false`, `ObjectLiteral` `{ id: true }` → `{}`) przepuszczą każdy przyszły niewykryty mutant o tej samej treści w tym pliku bez decyzji człowieka. `AGENTS.md` mówi tylko o „przeżyłym” mutancie | `scripts/lib/mutation-gate.ts` (`covers`), `mutation-gate.json` | Przy zmianie pliku krytycznego z wpisami sprawdź w raporcie HTML nowe mutanty o tej samej treści ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#bramka-algorytm)) |
| `npm run test:e2e` uruchomione przez agenta AI zatrzymuje się na resecie bazy | Prisma 7.10 wykrywa agenta po zmiennych środowiskowych (`CLAUDECODE` i inne) i bez `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` odmawia `--force-reset` | `e2e/global-setup.ts` | Uruchamia człowiek albo agent za jego wyraźną zgodą. Nie ustawiaj tej zmiennej w kodzie ([08-testy.md](08-testy.md#e2e-agent)) |
| `.claude/agents/test-writer.md` każe uruchomić `npx vitest run <pliki>`, a ta komenda nie uruchamia testów integracyjnych | `*.integration.test.ts` kończy się „No test files found” z kodem 1, podobnym do czerwonego przebiegu, ale z niewłaściwego powodu | `vitest.config.ts` (wyklucza testy integracyjne) | `npm run test:integration -- <pliki>` ([08-testy.md](08-testy.md#integracyjne)) |
| Test integracyjny komendy z `revalidatePath` potrzebuje mocka `next/cache`, a atrapa `redirect` z testu rdzenia nie ma `digest` | Bez mocka komenda kończy się `{ success: false }` mimo zapisu w bazie. Atrapa bez `digest` zamienia przekierowanie na komunikat domyślny | `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts` | Mock i atrapa z `digest` jak w tutorialu ([09-nowy-modul.md](09-nowy-modul.md#krok-6)) |
| Czerwony przebieg „z właściwego powodu” wymaga pliku-szkieletu, którego nikt nie zakłada | Bez pliku komendy Vitest zgłasza błąd importu zamiast braku eksportu | `.claude/agents/test-writer.md` | Przed testami zrób puste pliki (`export {};`, w akcjach także `"use server";`) ([09-nowy-modul.md](09-nowy-modul.md#krok-6)) |
| `npm run test:mutation:task` na małym pliku w świeżym projekcie kończy się kodem 1 | Bez zapisanego raportu przyrostowego wynik liczy się tylko z plików zadania i łatwo spada poniżej progu `break` (75). Kod 1 nie jest werdyktem | `stryker.config.json` | Werdykt wynika z klasyfikacji mutantów i z `npm run test:mutation:gate` ([09b-implementacja-i-bramki.md](09b-implementacja-i-bramki.md#krok-8-stryker)) |
| Przed pierwszym `npm run test:e2e` trzeba zainstalować Chromium i zwolnić porty 3000 i 3001 | `README.md` tego nie mówi. Działający `npm run dev` na porcie 3000 zatrzymuje start testów. Przeglądarkę instaluje tylko `.github/workflows/e2e.yml` | `playwright.config.ts` | `npx playwright install chromium` i zatrzymanie `npm run dev` ([08-testy.md](08-testy.md#e2e)) |
| Krok `prisma migrate dev --name init` w `.github/workflows/e2e.yml` tworzy brakującą migrację | W projekcie z zacommitowanymi migracjami zmiana schematu bez migracji przejdzie CI, a produkcja jej nie dostanie | `.github/workflows/e2e.yml` | Po tym kroku sprawdź `git status --porcelain prisma/migrations` ([10-wdrozenie.md](10-wdrozenie.md#ci)) |
| commitlint i Prettier działają tylko w hookach husky | Żaden workflow ich nie uruchamia, a `git commit --no-verify` albo `HUSKY=0` je pomija | `.husky/`, `.lintstagedrc.json` | Sprawdź `npm run verify` przed pushem ([11-praca-z-kitem.md](11-praca-z-kitem.md#commity)) |
| Katalog handoffów w `.claude` nie jest w `.gitignore` | `git add -A` doda handoffy do commitu | `.gitignore` | Dodawaj pliki jawnie ([11-praca-z-kitem.md](11-praca-z-kitem.md#superpowers)) |
| `next dev` uruchomione przez agenta AI dopisuje blok do `AGENTS.md` | Zmienia plik kitu kopiowany do projektów | `next.config.ts` | `git restore AGENTS.md` ([11-praca-z-kitem.md](11-praca-z-kitem.md#next-dev-agents-md)) |

<a id="start"></a>

## Uruchomienie i narzędzia

<a id="start-male"></a>

Pozycje z małym skutkiem; rozwiązania opisuje [01-uruchomienie.md](01-uruchomienie.md#typowe-problemy).

| Ograniczenie | Skutek | Gdzie | Obejście |
| --- | --- | --- | --- |
| Nagłówek plików generowanych podaje `npx wa generate` | Na świeżym klonie nie ma pliku wykonywalnego `wa`, bo `packages/cli/dist` powstaje dopiero po zbudowaniu CLI | `packages/cli/src/generate/registry.ts` (`GENERATED_HEADER`) | `npm run build -w @wa-kit/cli && npm run wa -- generate` ([02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#uruchomienie)) |
| `.nvmrc` dopuszcza dowolne Node 22, a `packageManager` wymaga npm 11 | Z Node 22.12 przychodzi npm 10.9. `npm install` przepisuje `package-lock.json`, a starsze wydania 22 wypisują ostrzeżenia `EBADENGINE` (nie przerywają instalacji) | `.nvmrc`, `package.json` | `npm ci`, Node 22.18 lub nowszy ([01-uruchomienie.md](01-uruchomienie.md#typowe-problemy)) |
| Aplikacja nie ma strony pod `/` | `http://localhost:3000/` daje 404 | `src/app/[locale]` | Wejdź na `/sign-in` |
| Formularz logowania nie linkuje do `/sign-up` | Przy `AUTH_PUBLIC_SIGNUP=true` trzeba znać adres rejestracji | `src/features/auth/components/sign-in-form.tsx` | Wejdź na `/sign-up` |
| `admin:create` przy błędnym env kończy się surowym stosem | Błąd walidacji env zasłania błąd argumentów (na przykład brak `--` przed `--email`) | `scripts/admin-create.ts` | Szukaj linii `Error: …` ([01-uruchomienie.md](01-uruchomienie.md#typowe-problemy)) |
| Kolejność kroków w `README.md`: `docker compose up -d` jest przed `cp .env.example .env` | Przy zmianie `DB_PORT` wpis trzeba utworzyć ręcznie, a następny krok `cp` go nadpisuje | `README.md` | Idź za kolejnością z [01-uruchomienie.md](01-uruchomienie.md#pierwsze-uruchomienie): `npm ci`, `cp .env.example .env`, `docker compose up -d` |
| Docker Desktop na macOS nie zgłasza konfliktu z lokalnym Postgresem | Lokalny Postgres słucha tylko na `127.0.0.1` i `::1`, więc kontener startuje bez błędu, a aplikacja łączy się z lokalnym programem | `docker-compose.yml` | Sprawdź porty przed `docker compose up -d` ([01-uruchomienie.md](01-uruchomienie.md#pierwsze-uruchomienie)) |
