# Moduł `uploads`: provider storage lokalny dysk albo S3

Data: 2026-11-04. Burza mózgów z Jakubem. Zadanie w ClickUp: „WA Kit · uploads: provider storage lokalny dysk albo S3”.

Źródła:

- spotkanie Jakuba z Patrykiem z 3.11.2026 (transkrypt „WA Kit”);
- spec planu 3 ([2026-10-28-wa-kit-plan-3-modules-design.md](2026-10-28-wa-kit-plan-3-modules-design.md), §7) i decyzja [D44](../../decyzje.md#d44);
- pakiet `packages/storage`, ADR-27, `docs/file-storage.md` i `docs/railway-template.md` z publicznego repo `webamigos/RagenAI`;
- walidacja `env` w Ragenie: ADR-37, `packages/env/src/parse.ts`, `packages/env/src/provider-seams.ts`, `packages/env/src/provider-rules.ts` i `apps/web/src/instrumentation.ts`;
- dokumentacja Railway: [Volumes reference](https://docs.railway.com/volumes/reference), [Storage Buckets](https://docs.railway.com/storage-buckets) i [Variables reference](https://docs.railway.com/variables/reference).

## 1. Po co

Moduł `uploads` zapisuje dziś pliki wyłącznie do magazynu zgodnego z S3. Nie da się go uruchomić bez bucketu: lokalnie potrzebny jest MinIO w Dockerze, na produkcji Railway Bucket albo R2. Na spotkaniu Patryk zwrócił uwagę, że będą wdrożenia bez S3, i wskazał jako wzór pakiet `storage` z Ragena, który ma provider lokalny i S3.

Jakub zdecydował, że domyślnym providerem ma być **lokalny dysk**, tak jak w Ragenie. S3 włącza się świadomie jedną zmienną. Uzasadnienie jest to samo co w ADR-27 Ragena: świeży projekt ma działać bez konta w chmurze i bez dodatkowej usługi.

Kit nie ma jeszcze projektów, które korzystają z `uploads` (potwierdził Jakub). Zmiana domyślnego providera nie wymaga więc migracji ani zabezpieczeń dla istniejących `.env`.

## 2. Cele, nie-cele, anty-cele

**Cele**

- `STORAGE_PROVIDER=local|s3` wybiera, gdzie moduł zapisuje pliki. Bez tej zmiennej działa `local`.
- Przy `local` zmienne `S3_*` nie są wymagane. Przy `s3` są wymagane te same zmienne co dziś.
- Brak wymaganej zmiennej albo konfiguracja, która na pewno zgubi pliki, kończy się błędem walidacji `env` przy starcie procesu, z nazwą zmiennej. Nie dopiero przy pierwszym uploadzie ani przy pierwszym logowaniu. Walidacja przy starcie działa jak w Ragenie i obejmuje całe `env` aplikacji, nie tylko storage (decyzja Jakuba, 4.2).
- Wszystko, co moduł robi poza samym zapisem bajtów, działa tak samo dla obu providerów: cele uploadu, kontrola typu i rozmiaru, klucze obiektów, rekord `Upload`, cofnięcie obiektu przy błędzie rekordu, pobieranie przez `GET /api/uploads/<id>` z nagłówkami, uprawnienia i tryb serwisowy.
- Dokumentacja opisuje oba providery i oba warianty wdrożenia na Railway (wolumen i Railway Bucket).

**Nie-cele**

- Przenoszenie plików między providerami. Ragen też tego nie ma.
- Presigned URL-e i upload prosto z przeglądarki do magazynu. Pliki dalej idą przez aplikację.
- Kreator zmiennych środowiskowych w CLI. To osobne zadanie („WA Kit · CLI: kreator zmiennych środowiskowych przy wyborze modułów”).
- Sprzątanie osieroconych plików. Zostaje tak jak w D44, do modułu `worker`.
- Więcej niż jedna instancja aplikacji przy `local`. To ograniczenie, nie funkcja.
- Ogólny mechanizm „seamów” jak `STORAGE_SEAM` w Ragenie. Przy jednym przełączniku byłby na wyrost.
- Strona konfiguracji w aplikacji, która pokazuje błędne zmienne, jak `features/setup` w Ragenie. Bez niej aplikacja przy błędnym `env` kończy pracę (4.2).
- Zmiana nazw zmiennych `S3_*` na nazwy Ragena (`S3_ENDPOINT_URL`, `S3_BUCKET_NAME`).

**Anty-cele (porażka, nawet jeśli działa)**

- Pliki znikają po cichu, na przykład przy redeployu na Railway bez wolumenu, bo provider lokalny pisał na dysk kontenera.
- Klucz obiektu pozwala zapisać albo odczytać plik poza katalogiem magazynu (path traversal).
- Provider lokalny osłabia którąkolwiek z dzisiejszych gwarancji: izolację organizacji, 404 bez zdradzania istnienia pliku, nagłówki `nosniff` i CSP `sandbox`, `Cache-Control` zależny od widoczności.
- Projekt z `local` wymaga uruchomionego MinIO albo zmiennych `S3_*`, żeby wystartować.
- Moduł edytuje pliki rdzenia bez osobnego commita rdzenia.

## 3. Ograniczenia

- Reguły `AGENTS.md` i `CLAUDE.md` bez wyjątków: brak komentarzy w kodzie (poza `// WHY:`), Zod na wejściu, `getOrgContext()` i filtr `organizationId`, test izolacji dwóch organizacji, test architektury `server-entrypoints-guard`.
- Proces testów jak w planie 3. Testy pisze `test-writer` przed implementacją według sekcji „Zachowania” i „Mutacje do zabicia” w planie. Implementer nie zmienia testów. Recenzent uruchamia `npm run test:mutation:task` i `npm run test:mutation:gate`. `src/features/uploads/services/` jest w `critical`, więc każdy przeżyły mutant blokuje zadanie, a wpisy `allowed` dopisuje tylko Jakub.
- Zmiana plików modułu oznacza podbicie `version` w `kit/modules/uploads.json`.
- Zmiana pliku rdzenia potrzebna modułowi idzie osobnym commitem rdzenia (reguła z PR [webamigos/wa-kit#11](https://github.com/webamigos/wa-kit/pull/11), notatka R12).
- Aplikacja działa jako jeden proces Next.js (`output: standalone`). Nie ma osobnego workera, który musiałby widzieć te same pliki. To prostsza sytuacja niż w Ragenie.
- Obraz Dockera uruchamia aplikację jako użytkownik `nextjs` (UID 1001). Katalog `/app` należy do roota.
- Railway: jeden wolumen na serwis; serwis z wolumenem nie może mieć replik; przy redeployu jest krótka przerwa; obraz z użytkownikiem innym niż root może nie mieć praw zapisu do wolumenu, a Railway zaleca wtedy `RAILWAY_RUN_UID=0`. Railway ustawia `RAILWAY_VOLUME_MOUNT_PATH`, gdy wolumen jest podpięty, oraz `RAILWAY_ENVIRONMENT_ID` w każdym serwisie.
- Railway Bucket: prywatny, zgodny z S3, endpoint `https://t3.storageapi.dev`, adresowanie virtual-hosted (`S3_FORCE_PATH_STYLE` nieustawione), bez backupów i wersjonowania. Ragen potwierdził na projekcie testowym, że upload i pobieranie działają z referencjami `${{<bucket>.BUCKET}}` itd.

## 4. Jak to działa

### 4.1. Wybór providera i zmienne

Ustalone z Jakubem: zmienna `STORAGE_PROVIDER` z wartościami `local` i `s3`, domyślnie `local`.

Moje decyzje (do sprawdzenia przy czytaniu):

- **Nazwy `S3_*` zostają bez zmian** (`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`). Nikt ich jeszcze nie używa, ale nazwy Ragena nie dają nam nic, a zmiana dotknęłaby dokumentacji, CI i e2e.
- **`STORAGE_LOCAL_PATH`** (opcjonalna) to katalog, w którym provider lokalny trzyma pliki. Gdy jej nie ma:
  - na Railway z podpiętym wolumenem katalogiem jest `RAILWAY_VOLUME_MOUNT_PATH`, czyli wystarczy podpiąć wolumen;
  - w każdym innym przypadku katalogiem jest `./volumes/uploads` liczony od katalogu roboczego procesu. `volumes/` jest już w `.gitignore` (trzyma tam dane MinIO), więc nie trzeba zmieniać `.gitignore` rdzenia.
- **Walidacja `env`** w `src/features/uploads/env.ts`:
  - przy `s3` zmienne wymagane są te same co dziś, z tymi samymi regułami formatu;
  - przy `local` zmienne `S3_*` są ignorowane, także gdy są ustawione z wartościami przykładowymi;
  - nieznana wartość `STORAGE_PROVIDER` to błąd walidacji;
  - schemat zwraca dane w kształcie, który mówi wprost, który provider wybrano, żeby kod storage nie musiał zgadywać.

### 4.2. Walidacja `env` przy starcie (zmiana rdzenia)

Ustalone z Jakubem: walidacja zmiennych środowiskowych działa tak jak w Ragenie (ADR-37, `packages/env/src/parse.ts`, `apps/web/src/instrumentation.ts`).

Dziś walidacja jest leniwa. `env` z `src/shared/lib/env.ts` to Proxy, które parsuje zmienne przy pierwszym odczycie, a healthcheck czyta tylko bazę. Błędne zmienne nie zatrzymują więc wdrożenia: healthcheck daje 200, Railway wyłącza poprzednią wersję, a aplikacja zwraca 500 dopiero przy pierwszym odczycie `env` (`docs/10-wdrozenie.md#blad-env`). Ragen sprawdza `env` przy starcie procesu i zbiera wszystkie problemy naraz.

Jak to ma działać u nas:

- **Sprawdzenie przy starcie.** `register()` w `src/instrumentation.ts`, tylko w runtime `nodejs`, parsuje pełny schemat `env`, czyli rdzeń razem ze schematami modułów z `moduleEnvSchemas`. Robi to raz, przed obsługą pierwszego żądania.
- **Wszystkie problemy w jednym raporcie.** Raport ma po jednej linii na zmienną (`- <nazwa>: <komunikat>`), żeby jeden restart pokazał wszystko do poprawienia. To samo uzasadnienie co w Ragenie: pętla restartów, która odsłania jedną brakującą zmienną na raz, zamienia dziesięć minut konfiguracji w popołudnie.
- **Raport idzie na `console.error`, nie przez `logger`.** Według D15 `logger` na produkcji bez `OTEL_EXPORTER_OTLP_ENDPOINT` nie pisze nigdzie, a Ragen z tego samego powodu używa konsoli przy starcie. Jest to wyjątek od D15 tylko dla raportu startowego, opisany w nowej decyzji. Wpisy w czasie działania aplikacji dalej idą przez `logger`.
- **Proces kończy się kodem 1** (moja interpretacja reguły Ragena, do sprawdzenia przy czytaniu). Ragen zostawia przy życiu tylko `apps/web`, bo ta aplikacja serwuje stronę konfiguracji, która mówi administratorowi, co poprawić. `apps/api` i worker kończą pracę (`parseEnvOrExit`). Kit nie ma strony konfiguracji, więc jest w sytuacji `apps/api`. Na Railway healthcheck nowego wdrożenia nie przechodzi, a poprzednie wdrożenie zostaje.
- **Leniwe Proxy `env` zostaje.** Chroni `next build` i testy bez pełnego środowiska (`// WHY:` w `env.ts`). Sprawdzenie przy starcie korzysta z tej samej funkcji walidacji co leniwe Proxy (`checkEnv`, której używa też `parseEnv`) i z tego samego schematu `fullSchema`, więc reguły są w jednym miejscu.
- **Pusta zmienna znaczy „nieustawiona”** dla nowych zmiennych storage (`STORAGE_PROVIDER=`, `STORAGE_LOCAL_PATH=`). Tak robi Ragen (`blankAsUndefined`), bo wyczyszczona zmienna na Railway przychodzi jako pusty napis.
- Zmiana obejmuje wszystkie istniejące reguły, nie tylko storage. Na przykład reguła produkcyjna `API_KEY_PEPPER` z `api-keys` też zatrzyma start. To zamierzone.

### 4.3. Ochrona przed zgubieniem plików

Anty-cel nr 1 to ciche znikanie plików. Wszystkie trzy reguły są regułami walidacji `env` z 4.2, więc zatrzymują start procesu. Moje decyzje:

- **Railway bez wolumenu przy `local` w produkcji to błąd.** Warunek: `NODE_ENV=production`, provider `local`, ustawione `RAILWAY_ENVIRONMENT_ID`, brak `RAILWAY_VOLUME_MOUNT_PATH`. Komunikat mówi, że pliki zginą przy redeployu, i podaje dwa wyjścia: podpiąć wolumen albo ustawić `STORAGE_PROVIDER=s3`.
- **Na Railway z wolumenem `STORAGE_LOCAL_PATH`, jeśli jest ustawione, musi leżeć wewnątrz `RAILWAY_VOLUME_MOUNT_PATH`.** Inaczej pliki trafiłyby na dysk kontenera obok wolumenu.
- **Poza Railway `local` w produkcji wymaga jawnie ustawionego `STORAGE_LOCAL_PATH`.** Kit nie umie sprawdzić, czy katalog jest trwały. Może za to wymusić, żeby administrator świadomie go wskazał, zamiast dostać po cichu `./volumes/uploads` na dysku kontenera. To zastępuje ostrzeżenie w logach z wcześniejszej wersji specu, które na produkcji bez OTLP byłoby niewidoczne (D15). Domyślne `./volumes/uploads` zostaje do pracy lokalnej.

### 4.4. Kod

Moje decyzje:

- **Interfejs zostaje taki, jak dziś widzą go wywołujący:** `putObject(key, body, contentType)`, `getObject(key)` zwracające obiekt albo `null`, `deleteObject(key)`. `create-upload.ts`, `upload-commands.ts` i `read-upload.ts` się nie zmieniają. Wybór providera dzieje się wewnątrz modułu storage, a obie implementacje są w osobnych plikach w `src/features/uploads/services/`.
- **Provider lokalny:**
  - zapis tworzy brakujące katalogi i zapisuje plik pod ścieżką `<katalog>/<klucz>`;
  - odczyt brakującego pliku zwraca `null`, inne błędy systemu plików są rzucane dalej;
  - usunięcie brakującego pliku nie jest błędem, tak jak w S3;
  - `contentType` nie jest przechowywany. Pobieranie i tak bierze typ z rekordu (`upload.mimeType`).
- **Ochrona przed path traversal:** podwójna, jak w Ragenie. Najpierw odrzucenie klucza absolutnego i klucza z segmentem `..`, potem sprawdzenie, że ścieżka po rozwiązaniu leży wewnątrz katalogu magazynu. Dziś klucze generuje sam moduł (`orgs/<organizationId>/<cel>/<uuid>.<rozszerzenie>`), więc to obrona w głąb, nie łatka na znaną dziurę.
- **Zależność `@aws-sdk/client-s3` zostaje w manifeście.** Moduł obsługuje oba providery, więc projekt z `local` nadal instaluje SDK. Wyrzucanie go warunkowo komplikowałoby CLI.

### 4.5. Lokalnie, w CI i w e2e

Moje decyzje:

- **MinIO przestaje startować domyślnie.** Usługi `minio` i `minio-init` w `docker/uploads.compose.yml` dostają profil Compose `s3`. `docker compose up -d` uruchamia bazę i mailpit bez MinIO, a `docker compose --profile s3 up -d` uruchamia także MinIO. Ragen robi to samo z RustFS.
- **Manifest `kit/modules/uploads.json`:**
  - `env` dostaje `STORAGE_PROVIDER` (przykład `local`) i `STORAGE_LOCAL_PATH` (przykład `./volumes/uploads`);
  - zmienne `S3_*` zostają z przykładami lokalnego MinIO, żeby przejście na S3 lokalnie wymagało zmiany jednej zmiennej i profilu Compose;
  - `required` dla `S3_*` zmienia się na `false`, bo bez `STORAGE_PROVIDER=s3` nie są wymagane. CLI nie używa dziś tej flagi do niczego poza opisem.
- **Testy integracyjne** (`src/test/integration/setup-env.ts`) ustawiają `STORAGE_PROVIDER=s3`. Dzięki temu istniejące testy integracyjne (`read-upload`, izolacja organizacji, `storage`) dalej sprawdzają S3 na prawdziwym MinIO, a kroki CI z `ci/uploads.integration-steps.yml` zostają bez zmian. Provider lokalny dostaje własne testy na katalogu tymczasowym.
- **e2e** (`e2e/env.ts`) przechodzi na `local` z katalogiem tymczasowym zamiast zmiennych `S3_*`, które dziś są tam tylko po to, żeby przeszła walidacja.
- **Macierz kitu** (`.github/workflows/kit.yml`) zostaje z krokami MinIO, bo testy integracyjne dalej używają S3.
- `src/test/integration/setup-env.ts`, `e2e/env.ts`, `Dockerfile`, `src/instrumentation.ts` i `src/shared/lib/env.ts` to pliki rdzenia. Ich zmiany idą osobnym commitem rdzenia z podbiciem wersji `core` (decyzja wykonawcy z recenzji specu, zgodna z `kit/CLAUDE.md`).
- `src/features/uploads/env.ts` nie jest dziś w `critical` ani w `mutate` Strykera. Logika reguł produkcyjnych trafia do `services/`, żeby objęła ją bramka plików krytycznych (decyzja wykonawcy z recenzji specu).

### 4.6. Docker i wdrożenie

Moje decyzje:

- **Zmiana rdzenia, osobnym commitem:** `Dockerfile` tworzy katalog `/app/volumes/uploads` należący do `nextjs:nodejs`. Bez tego provider lokalny w kontenerze nie ma gdzie pisać, bo `/app` należy do roota. Nazwany wolumen Dockera montowany w tym katalogu przejmuje jego właściciela, więc `docker run -v uploads:/app/volumes/uploads` działa bez roota.
- **Railway z wolumenem:** dokumentacja opisuje podpięcie wolumenu (np. pod `/app/volumes/uploads`) i `RAILWAY_RUN_UID=0`, bo wolumen Railway może nie dać praw zapisu użytkownikowi 1001. To jedyny sposób, który Railway podaje w dokumentacji. Wymaga sprawdzenia na prawdziwym serwisie (patrz 6).
- **Railway Bucket:** dokumentacja opisuje `STORAGE_PROVIDER=s3` i referencje `S3_BUCKET=${{<bucket>.BUCKET}}`, `S3_ENDPOINT=${{<bucket>.ENDPOINT}}`, `S3_REGION=${{<bucket>.REGION}}`, `S3_ACCESS_KEY_ID=${{<bucket>.ACCESS_KEY_ID}}` i `S3_SECRET_ACCESS_KEY=${{<bucket>.SECRET_ACCESS_KEY}}`, bez `S3_FORCE_PATH_STYLE`.
- **Rekomendacja w dokumentacji:** na Railway domyślnie Railway Bucket, bo pozwala na repliki, nie ma przerwy przy redeployu i nie wymaga `RAILWAY_RUN_UID=0`. Wolumen dla prostych wdrożeń z jedną instancją. Własny serwer klienta: `local` na trwałym wolumenie albo S3.

### 4.7. Dokumentacja

- `docs/15-modul-uploads.md` i `docs/15b-modul-uploads-uzycie.md`: oba providery, zmienne, MinIO jako profil, wdrożenie, ograniczenia `local`.
- `docs/10-wdrozenie.md`: tabela zmiennych, opis wolumenu oraz bucketu na Railway i nowy opis `#blad-env`. Błędne zmienne zatrzymują teraz start, a poprzednie wdrożenie zostaje.
- `docs/07-i18n-mail-env.md` (`#walidacja-env`) i `docs/07b-logi-naglowki-healthcheck.md`: walidacja przy starcie i raport na konsoli.
- `docs/01-uruchomienie.md`: MinIO tylko z profilem `s3`.
- `docs/decyzje.md`:
  - nowa decyzja rdzenia z kolejnym numerem: walidacja `env` przy starcie, raport wszystkich problemów na `console.error`, wyjście z kodem 1, wyjątek od D15 tylko dla raportu startowego;
  - nowa decyzja modułu z kolejnym numerem: provider storage, domyślnie `local`, reguły produkcyjne z 4.3;
  - aktualizacja D44, która dziś mówi „pliki leżą w magazynie zgodnym z S3”.
- `docs/znane-ograniczenia.md`: `local` wymaga jednej instancji i trwałego katalogu; brak przenoszenia plików między providerami.

## 5. Zostawione wykonawcy

- Podział na pliki i nazwy w `src/features/uploads/services/` oraz kształt danych zwracanych przez `envSchema`.
- Treść komunikatów błędów walidacji i raportu startowego, po polsku, z nazwą zmiennej.
- Czy `parseEnv` dostaje wariant bez rzucania (jak w Ragenie, zwraca wynik z listą problemów), czy sprawdzenie przy starcie łapie dzisiejszy wyjątek i formatuje raport.
- Czy zapis w providerze lokalnym idzie przez plik tymczasowy i `rename`. Rekord `Upload` powstaje dopiero po udanym zapisie, więc przerwany zapis zostawia co najwyżej osierocony plik, a nie uszkodzony plik pod istniejącym rekordem.
- Czy `test.prop` z `@fast-check/vitest` dostaje funkcja, która zamienia klucz na ścieżkę (niezmiennik: ścieżka zawsze leży wewnątrz katalogu albo jest błąd). Reguła z `AGENTS.md` mówi, że czyste funkcje z niezmiennikiem dostają `test.prop`, więc raczej tak.
- Kolejny numer decyzji w `docs/decyzje.md` (D47 zajmuje otwarty PR #14 z `wa update`).
- Domyślne `./volumes/uploads` jest liczone od katalogu roboczego. Standalone `server.js` zmienia katalog roboczy na swój katalog: w Dockerze to `/app`, ale przy ręcznym `node .next/standalone/server.js` wychodzi `.next/standalone`, który `next build` czyści. Dokumentacja mówi, żeby w takim uruchomieniu ustawić `STORAGE_LOCAL_PATH`. e2e ustawia własny katalog.

## 6. Ryzyka i co trzeba sprawdzić

- **Prawa zapisu do wolumenu Railway** przy UID 1001 nie są sprawdzone. Jeśli `RAILWAY_RUN_UID=0` jest jedynym wyjściem, aplikacja na Railway z wolumenem działa jako root. To kolejny argument za Railway Bucket na Railway.
- **Zmienne Railway** (`RAILWAY_VOLUME_MOUNT_PATH`, `RAILWAY_ENVIRONMENT_ID`) są wzięte z dokumentacji Railway, nie z działającego serwisu.
- **`register()` przy `next build`.** Nie sprawdziłem, czy Next wywołuje `register()` podczas `next build`. Jeśli tak, wyjście z kodem 1 przy niepełnym środowisku zepsułoby build w CI i w Dockerze. Wykonawca sprawdza to pierwszym krokiem. Jeśli `register()` działa przy buildzie, sprawdzenie pomija fazę buildu (`NEXT_PHASE`). Warunek odbioru: `npm run build` i `docker build` przechodzą bez pełnego `.env`, tak jak dziś.
- **`register()` może być wywołane więcej niż raz** (zgłoszenia dla Next 14). Sprawdzenie musi być idempotentne i nie może wypisać raportu dwa razy.
- **Przerwa przy redeployu** z wolumenem dotyczy też `preDeployCommand` (`prisma migrate deploy`). Nie wiadomo, czy wolumen jest montowany w fazie pre-deploy. Moduł go tam nie potrzebuje, ale dokumentacja nie powinna obiecywać więcej, niż sprawdzono.
