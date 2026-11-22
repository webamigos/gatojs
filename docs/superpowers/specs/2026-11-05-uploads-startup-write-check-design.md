# Sprawdzenia startowe modułów i prawo zapisu dla providera `local`

Data: 2026-11-05. Burza mózgów z Jakubem.

Źródła:

- rekomendacja z recenzji końcowej gałęzi `feat/uploads-storage-provider` (PR [webamigos/wa-kit#15](https://github.com/webamigos/wa-kit/pull/15)): sprawdzenie zapisu przy starcie jako osobne zadanie;
- spec providera storage ([2026-11-04-uploads-storage-provider-design.md](2026-11-04-uploads-storage-provider-design.md)), §3, §4.6 i §6, oraz decyzje [D05](../../decyzje.md#d05), [D15](../../decyzje.md#d15), [D40](../../decyzje.md#d40), [D48](../../decyzje.md#d48) i [D49](../../decyzje.md#d49);
- [znane-ograniczenia.md](../../znane-ograniczenia.md) („Kierunek zmiany” przy providerze `local`), [15-modul-uploads.md](../../15-modul-uploads.md) (reguły sprawdzają konfigurację, a nie dysk) i [10-wdrozenie.md](../../10-wdrozenie.md) (wolumen Railway, własny serwer);
- publiczne repo `webamigos/RagenAI`: `packages/create-ragen-app` (instalator pyta o zmienne magazynu, ale ich nie testuje), `apps/web/src/features/setup/services/queries/inspect-environment.ts` (sprawdza tylko, czy zmienne S3 są ustawione) i `apps/web/src/instrumentation.ts` (próba dostawcy szyfrowania przy starcie: chwilowa niedostępność daje ostrzeżenie, zła konfiguracja blokuje aplikację).

## 1. Po co

Provider `local` modułu `uploads` zapisuje pliki w katalogu `STORAGE_LOCAL_PATH`. Reguły przy starcie ([D49](../../decyzje.md#d49)) sprawdzają tylko konfigurację: wolumen na Railway, ścieżkę w wolumenie i ścieżkę bezwzględną poza Railway. Nie sprawdzają, czy proces może do katalogu pisać.

Najbardziej prawdopodobna awaria na produkcji to wolumen Railway bez `RAILWAY_RUN_UID=0`, gdy proces działający jako `nextjs` (UID 1001) nie ma prawa zapisu, albo ponownie użyty wolumen Dockera, którego katalog należy do roota. Taki serwer przechodzi dziś start i healthcheck, a pierwszy upload kończy się 500 `storage_failed`. Wpis `upload putObject failed` idzie przez `logger`, który na produkcji bez `OTEL_EXPORTER_OTLP_ENDPOINT` niczego nie zapisuje ([D15](../../decyzje.md#d15)). Administrator widzi więc tylko „Nie udało się przesłać pliku”, a w logach usługi nie ma nic.

Po zmianie brak prawa zapisu kończy się przy starcie procesu raportem na konsoli z katalogiem, przyczyną i podpowiedzią, tak jak dziś błędne zmienne środowiskowe ([D48](../../decyzje.md#d48)). Nowe wdrożenie nie przechodzi wtedy healthchecku, tak samo jak przy błędnym `env`.

## 2. Cele, nie-cele, anty-cele

**Cele**

- Przy providerze `local` proces przy starcie sprawdza, że może utworzyć plik w katalogu magazynu. Gdy nie może, kończy się kodem 1, a na `console.error` trafia raport z katalogiem, kodem błędu systemu, UID procesu i tym, co zrobić.
- Rdzeń dostaje ogólny szew „sprawdzenia startowe modułów” (decyzja Jakuba). Moduł dodaje sprawdzenie jednym plikiem, bez edycji plików rdzenia. Rdzeń uruchamia wszystkie sprawdzenia po udanej walidacji `env` i zbiera problemy do jednego raportu.
- Sprawdzenie działa wszędzie, gdzie startuje serwer Next.js: w `npm run dev`, w serwerach e2e i na produkcji.

**Nie-cele**

- Sprawdzanie S3 przy starcie. To osobne zadanie (decyzja Jakuba). Kierunek na później: próba magazynu na wzór próby dostawcy szyfrowania w Ragenie, w której błędna konfiguracja (brak bucketu, złe klucze, brak uprawnień) zatrzymuje start, a chwilowa niedostępność (sieć, przekroczony czas) daje tylko ostrzeżenie na konsoli. Wymaga to drugiego rodzaju wyniku w szwie (ostrzeżenia), którego to zadanie nie dodaje.
- Sprawdzanie podkatalogów `orgs/<organizationId>/…`. Sprawdzany jest tylko katalog główny magazynu.
- Sprawdzanie, czy katalog jest trwały (wolumen czy dysk kontenera). Tego kit dalej nie umie wykryć ([D49](../../decyzje.md#d49)).
- Sprawdzanie wolnego miejsca na dysku.
- Sprawdzanie w trakcie działania aplikacji. Healthcheck się nie zmienia.
- Zmienna wyłączająca sprawdzenie.
- Sprawdzenia w skryptach (`npm run admin:create`) i w testach. Nie wywołują `register()`, więc ich nie dotyczą. Wyjątkiem są testy samego `register()`, które podstawiają atrapę rejestru (4.1).

**Anty-cele (porażka, nawet jeśli działa)**

- `node:fs` albo inny kod tylko serwerowy w paczce przeglądarki. Szew nie może przechodzić przez `module.ts` ani `clientModules` ([D05](../../decyzje.md#d05)).
- Raport przez `logger`. Na produkcji bez OTLP byłby niewidoczny ([D15](../../decyzje.md#d15)).
- Sprawdzenie, które po udanym starcie zostawia pliki w katalogu magazynu albo tworzy je gdziekolwiek indziej niż w tym katalogu.
- Sprawdzenie, które zatrzymuje start tam, gdzie upload by zadziałał, na przykład w fazie `next build`.
- Operacje na dysku podczas parsowania `env` (`parseEnv`, leniwe `env`): w testach, w skryptach i przy pierwszym odczycie `env`.
- Moduł edytuje pliki rdzenia bez osobnego commita rdzenia.

## 3. Ograniczenia

- Reguły `AGENTS.md` i `CLAUDE.md` bez wyjątków: bez komentarzy w kodzie poza `// WHY:`, pliki generowane tylko przez `npm run wa -- generate`, Conventional Commits z tematem małymi literami.
- Proces testów jak w poprzednich zadaniach. Testy pisze `test-writer` przed implementacją, według sekcji „Zachowania” i „Mutacje do zabicia” w planie. Implementer testów nie zmienia. Recenzent uruchamia `npm run test:mutation:task -- <pliki>` i `npm run test:mutation:gate`, a dla CLI te same skrypty z `--prefix kit/cli`. `src/features/uploads/services/` jest w `critical`, więc każdy przeżyły mutant w tym katalogu blokuje zadanie, a wpisy `allowed` dopisuje tylko Jakub.
- PR [webamigos/wa-kit#16](https://github.com/webamigos/wa-kit/pull/16) jest już w `main` i w głównej kopii repozytorium (`d5b74a2`), ale nie w tej gałęzi. Hook `protect-tests` uruchamiany z głównej kopii czyta więc plik fazy także z worktree edytowanego pliku, ale nie sprawdzono tego w tej sesji. Orkiestrator na początku implementacji sprawdza, czy zapis do pliku testowego przy fazie `implement` w worktree jest blokowany, a niezależnie od wyniku porównuje sumy SHA plików testowych przed implementacją i po niej.
- Zmiana rdzenia potrzebna modułowi idzie osobnym commitem z podbiciem `version` w `kit/modules/core.json` (`kit/CLAUDE.md`, PR [webamigos/wa-kit#11](https://github.com/webamigos/wa-kit/pull/11)). Zmiana w `kit/cli/src` wymaga przebudowania `.wa/bin/wa.mjs` w tym samym commicie, a bundel należy do `core`. Bramka CLI to `npm run verify --prefix kit/cli`.
- Zmiana plików modułu oznacza podbicie `version` w `kit/modules/uploads.json`.
- Next.js 16.4.3 czeka na zakończenie `register()` w `prepareImpl`, zanim obsłuży pierwsze żądanie (sprawdzone w `node_modules/next/dist/server/next-server.js`). Asynchroniczne sprawdzenie w `register()` kończy się więc przed pierwszym uploadem.
- Obraz Docker uruchamia proces jako `nextjs` (UID 1001) i zakłada katalog `/app/volumes/uploads` należący do `nextjs:nodejs` ([D49](../../decyzje.md#d49)).
- W świeżym worktree przed `typecheck` i `build` trzeba uruchomić `npm run db:generate`.

## 4. Jak to działa

### 4.1. Szew w rdzeniu

Ustalone z Jakubem: ogólny szew „sprawdzenia startowe modułów” w rdzeniu. Nie jest to pole w `defineModule`, bo `module.ts` trafia też do paczki przeglądarki, i nie jest to część schematu `env`, bo ten schemat jest parsowany leniwie także w testach i skryptach.

Moje decyzje (do sprawdzenia przy czytaniu):

- **Plik w module.** Sprawdzenie to nazwany eksport `startupCheck` z pliku `src/features/<x>/startup-check.ts`. Generator (`kit/cli/src/generate/index.ts` i `registry.ts`) wykrywa ten plik tak jak `audit-sink.ts` i dopisuje go tylko do rejestru serwerowego `src/modules.generated.ts`:

  ```ts
  import { startupCheck as uploadsStartupCheck } from "@/features/uploads/startup-check";

  export const startupChecks = [{ key: "uploads", check: uploadsStartupCheck }];
  ```

  `key` to nazwa katalogu feature, tak jak w `moduleMessages`. Bez modułów ze sprawdzeniem generator zapisuje `export const startupChecks: never[] = [];`. Rejestr kliencki się nie zmienia.
- **Kontrakt.** Typ w rdzeniu to `StartupCheck = (env: CoreEnv) => Promise<string[]>`. Sprawdzenie dostaje zweryfikowane `env`, czyli wynik tego samego `checkEnv`, którego używa walidacja przy starcie, razem z polami modułów. Zwraca listę komunikatów o problemach, a pusta lista oznacza, że wszystko jest w porządku. W rozmowie opisałem sprawdzenie bez argumentów i to zmieniam: gdyby sprawdzenie czytało `env` samo, `startup-check.ts` importowałby `src/shared/lib/env.ts`, który importuje `src/modules.generated.ts`, który importuje `startup-check.ts`. Powstałby cykl importów, a wyliczanie konfiguracji drugi raz z `process.env` dodałoby gałąź, która po udanej walidacji nigdy się nie wykona.
- **Uruchamianie.** Nowa funkcja rdzenia w `src/shared/lib/` obok `verifyEnvOnStartup` działa tak:
  - w fazie `next build` (`NEXT_PHASE` równe `PHASE_PRODUCTION_BUILD`) nic nie robi, tak jak walidacja `env`;
  - uruchamia wszystkie sprawdzenia, także po takim, które zgłosiło problem;
  - sprawdzenie, które rzuca wyjątek albo zwraca odrzuconą obietnicę, daje jeden problem tego modułu z treścią błędu, bez śladu stosu;
  - przy co najmniej jednym problemie wypisuje jeden raport przez `io.error`, a potem woła `io.exit(1)`; bez problemów niczego nie wypisuje;
  - raport ma pierwszą linię z liczbą problemów (na przykład `Sprawdzenia startowe modułów nie przeszły (<liczba>):`), a potem po jednej linii `- <key>: <komunikat>` na problem, w kolejności rejestru i w kolejności zwróconej przez sprawdzenie;
  - korzysta z `processStartupIo` z `src/shared/lib/env.ts`, więc `src/instrumentation.ts` dalej nie odwołuje się do `process.exit`.
- **Miejsce w `register()`.** W runtime `nodejs` sprawdzenia modułów działają zaraz po walidacji `env`, przed konfiguracją eksportu logów. Uruchamiają się tylko wtedy, gdy walidacja `env` nie zgłosiła problemów, także gdy `io.exit` nie kończy procesu (w testach).
- **Testy rdzenia z atrapą rejestru.** Testy `register()` (`src/__tests__/instrumentation.test.ts`) i testy funkcji uruchamiającej podstawiają atrapę `@/modules.generated` z własnymi sprawdzeniami, tak jak już robią to testy modułów (`vi.mock("@/modules.generated", …)`). Bez atrapy test rdzenia z poprawnym `env` uruchamiałby prawdziwe sprawdzenia zainstalowanych modułów na dysku. Wynik zależałby wtedy od zestawu modułów, a job `assemble` uruchamia te testy w projektach z różnymi zestawami.
- **Bramka mutacji.** Nowy plik rdzenia nie trafia do `critical` w `mutation-gate.json`, tak jak `src/shared/lib/env.ts`. Recenzent i tak sprawdza mutanty w zmienionych liniach (`test:mutation:task`).

### 4.2. Sprawdzenie w `uploads`

Moje decyzje (do sprawdzenia przy czytaniu):

- **Cienki plik modułu bez gałęzi.** `src/features/uploads/startup-check.ts` przekazuje otrzymane `env`, rzutowane jak w `storage.ts` (`CoreEnv & UploadsEnv`), do funkcji w `services/` i zwraca jej wynik. Nie ma w nim warunku na providera, bo pliki w katalogu głównym feature nie są we wzorcach `mutate` Strykera ani w `critical`, więc usunięcie warunku w tym pliku przeszłoby niezauważone przez mutacje i bramkę.
- **Bez importu typu z nowego pliku rdzenia.** `startup-check.ts` deklaruje sygnaturę przez `CoreEnv` z `@/shared/lib/env` i nie importuje `StartupCheck`. TypeScript sprawdza każdy plik w `src/`, także nieużywany, więc import typu, którego starszy `core` nie ma, zepsułby typecheck projektu z nowym `uploads` i starszym `core`. Zgodność sygnatury i tak sprawdza wywołanie w rdzeniu, który dostaje tablicę `startupChecks`.
- **Logika w `services/`.** Funkcja w `src/features/uploads/services/`, czyli w `critical` i we wzorcach `mutate` Strykera, dostaje konfigurację magazynu (`StorageEnv`). Przy `s3` zwraca pustą listę i nie dotyka ani dysku, ani sieci. Przy `local` bierze `STORAGE_LOCAL_PATH`, ścieżkę już bezwzględną, bo rozwiązał ją `resolveStorageEnv`, i:
  1. zakłada katalog razem z brakującymi katalogami nadrzędnymi (`mkdir` z `recursive`), co i tak zrobiłby pierwszy upload;
  2. zapisuje bezpośrednio w tym katalogu pusty plik próbny o losowej, unikalnej nazwie (na przykład `.write-check-<uuid>`), z wyłącznym tworzeniem pliku;
  3. usuwa ten plik.

  Błąd w którymkolwiek kroku daje jeden komunikat o problemie. Plik próbny zamiast `access(W_OK)` wybrałem, bo próba wykonuje tę samą operację, która pada przy uploadzie, czyli utworzenie pliku w katalogu. Widzi więc każdą przyczynę tak samo jak upload: prawa, system plików tylko do odczytu, mapowanie UID w montowaniach sieciowych. `access` sprawdza tylko bity uprawnień po stronie procesu. Kod jest tak samo krótki.
- **Komunikat.** Zawiera bezwzględną ścieżkę katalogu, kod błędu systemu (`code`, na przykład `EACCES`, `EROFS`, `ENOTDIR`) albo treść błędu, gdy kodu nie ma, UID procesu, gdy istnieje `process.getuid`, oraz podpowiedź: na Railway `RAILWAY_RUN_UID=0` albo Railway Bucket (`STORAGE_PROVIDER=s3`), w Dockerze nowy nazwany wolumen pod `/app/volumes/uploads` albo prawo zapisu dla UID procesu. Przykładowa linia raportu:

  ```
  - uploads: proces (UID 1001) nie może zapisać pliku w katalogu /app/volumes/uploads (EACCES): na Railway ustaw RAILWAY_RUN_UID=0 albo przejdź na Railway Bucket (STORAGE_PROVIDER=s3); w Dockerze podepnij nowy wolumen pod /app/volumes/uploads albo daj temu UID prawo zapisu
  ```
- **Tylko katalog główny.** Podkatalogi `orgs/…` należące do roota w katalogu, do którego da się pisać, przechodzą start, a upload do takiej organizacji kończy się błędem jak dziś. To trafia do znanych ograniczeń.
- **Nieudane usunięcie pliku próbnego** też jest problemem, bo tak samo nie udałoby się usuwanie plików uploadu. Plik próbny może wtedy zostać w katalogu.

### 4.3. Wersje i commity

Moje decyzje:

- Commit rdzenia zawiera generator z testami, przebudowany `.wa/bin/wa.mjs`, funkcję uruchamiającą sprawdzenia z testami, zmianę `src/instrumentation.ts` z testem, odświeżony `src/modules.generated.ts` z pustym `startupChecks`, `AGENTS.md` i podbicie `core` z `0.5.0` do `0.6.0` (nowy szew).
- Commit modułu zawiera `startup-check.ts`, funkcję w `services/` z testami, odświeżony `src/modules.generated.ts` z wpisem `uploads` i podbicie `uploads` z `0.2.0` do `0.3.0`.
- Numery wersji mogą się zderzyć z innymi PR-ami: #12 i #13 ustawiają `core` `0.4.1`, #15 `0.5.0`, a scalony już #16 `0.4.2`. Ostateczne numery ustalamy przy scalaniu.
- Zgodność: sprawdzenie działa od `core` `0.6.0`. Na starszym `core` `uploads` `0.3.0` kompiluje się i działa jak `0.2.0`, bo starszy generator nie dopisuje `startup-check.ts` do rejestru i nikt go nie woła. Nowy `core` bez modułów ze sprawdzeniem ma pustą tablicę.

### 4.4. Dokumentacja

- `docs/decyzje.md`: nowa decyzja D50 (D47 zajmuje PR #14, D48 i D49 PR #15). Opisuje szew, sprawdzenie w `uploads`, wybór pliku próbnego zamiast `access`, brak sprawdzenia S3 i kierunek dla niego.
- Każde miejsce, które wymienia pliki czytane przez generator (wyszukiwanie `audit-sink.ts`): `docs/02-architektura.md`, `docs/02b-rejestr-i-generator.md`, `docs/09b-implementacja-i-bramki.md`, `docs/11-praca-z-kitem.md`, `docs/12-moduly-kitu.md`, tabele w D03 i D04 w `docs/decyzje.md` oraz `AGENTS.md`.
- Dokumentacja modułu i wdrożenia: `docs/15-modul-uploads.md` (akapit „Reguły sprawdzają konfigurację, a nie dysk”), `docs/15b-modul-uploads-uzycie.md` (tabela problemów i tabela komunikatów), `docs/10-wdrozenie.md` (wolumen Railway, własny serwer, ponownie użyty wolumen), `docs/znane-ograniczenia.md` (provider `local`: „Trwały katalog” i „Kierunek zmiany”, nowe ograniczenie dla podkatalogów) oraz `docs/07-i18n-mail-env.md` i `docs/07b-logi-naglowki-healthcheck.md` (raport startowy).
- Zdania z dopiskiem „(niesprawdzone)” zostają tylko tam, gdzie nic nie sprawdzono.

### 4.5. Sprawdzenie na żywo

Tak jak przy [D48](../../decyzje.md#d48) i [D49](../../decyzje.md#d49):

- Zbudowany serwer (`npm run build`, potem `node .next/standalone/server.js`) z `STORAGE_LOCAL_PATH` wskazującym katalog bez prawa zapisu kończy się raportem i kodem 1. Z katalogiem, do którego da się pisać, startuje, `/api/healthcheck` odpowiada 200, a w katalogu nie zostaje plik próbny.
- Opcjonalnie Docker: obraz z nazwanym wolumenem pod `/app/volumes/uploads`, którego wcześniej użył kontener działający jako root, kończy się raportem, a świeży nazwany wolumen startuje.
- Railway: tu niesprawdzalne. Dokumentacja mówi to wprost.

## 5. Zostawione wykonawcy

- Nazwy plików i funkcji w rdzeniu i w `services/` oraz dokładna treść nagłówka raportu i komunikatu.
- Sposób, w jaki `verifyEnvOnStartup` przekazuje zweryfikowane `env` do uruchamiania sprawdzeń (wartość zwracana albo wspólna funkcja). Istniejące testy walidacji startowej muszą dalej przechodzić albo zmienić je `test-writer`.
- Kolejne albo równoległe uruchamianie sprawdzeń. Kolejność linii raportu zawsze idzie za rejestrem.
- Sposób na katalog bez prawa zapisu w testach. `chmod` nie zatrzymuje roota, więc testy oparte na prawach muszą się pomijać pod rootem, a obok nich potrzebny jest przypadek niezależny od użytkownika, na przykład ścieżka prowadząca przez zwykły plik (`ENOTDIR` albo `EEXIST`).
- Czy CLI idzie osobnym commitem przed commitem rdzenia.

## 6. Ryzyka i co trzeba sprawdzić

- **Railway.** Prawo zapisu do wolumenu dla UID 1001 dalej nie jest sprawdzone. Sprawdzenie pokaże problem przy pierwszym wdrożeniu zamiast przy pierwszym uploadzie, ale to, czy Railway zostawia wtedy poprzednie wdrożenie, też jest niesprawdzone (jak w [D48](../../decyzje.md#d48)).
- **Zawieszone montowanie sieciowe** mogłoby zablokować start, bo sprawdzenie nie ma limitu czasu. Zakładam, że dyski lokalne i wolumeny Railway go nie potrzebują.
- **Plik próbny po awarii.** Proces przerwany między zapisem a usunięciem zostawia plik próbny. Jest nieszkodliwy, bo nie jest kluczem obiektu (klucze zaczynają się od `orgs/`), ale widzi go każdy, kto zagląda do katalogu.
- **Konflikt w CLI.** PR [webamigos/wa-kit#14](https://github.com/webamigos/wa-kit/pull/14) (`wa update`) też zmienia `kit/cli`. Przy scalaniu trzeba zbudować bundel od nowa.
- **Wielokrotne `register()`.** W trybie deweloperskim `register()` może zostać wywołane więcej niż raz. Sprawdzenie nic po sobie nie zostawia, więc kolejne wywołanie daje ten sam wynik.
- **Kompilacja dla Edge.** Turbopack kompiluje `src/instrumentation.ts` także dla Edge, a łańcuch dynamicznego importu dojdzie przez rejestr do `node:fs/promises`. Ten łańcuch już dziś zawiera moduły tylko serwerowe (`node:path` w `uploads`, ujście audytu z Prismą), więc kłopotu się nie spodziewam, ale potwierdzi to dopiero pierwszy `npm run build`.
