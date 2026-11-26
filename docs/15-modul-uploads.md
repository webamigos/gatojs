# Moduł `uploads`: pliki organizacji na dysku albo w magazynie S3

Po przeczytaniu będziesz wiedzieć:

- jaki problem rozwiązuje `uploads`, czego nie robi i kiedy go nie dodawać;
- jak dodać, zaktualizować i usunąć moduł oraz co zostaje w bazie i w magazynie plików po usunięciu;
- jak moduł wybiera magazyn (dysk serwera albo S3), które reguły zatrzymują start, zanim pliki mogłyby zginąć, i jak skonfigurować magazyn lokalnie, w CI i na produkcji;
- jak działają `POST /api/uploads` i `GET /api/uploads/<id>`: kolejność sprawdzeń, kody odpowiedzi, nagłówki `Cache-Control` i `Content-Disposition`;
- jaki kontrakt ma cel uploadu (`uploadPurposes`), komponent `<FileUpload>` i komenda `deleteUploadCommand` oraz co się dzieje bez modułu;
- skąd biorą się osierocone pliki w magazynie i kiedy moduł cofa zapisany obiekt.

Zweryfikowano z kodem: 2c83429, 2026-11-21 (guard organizacji w [Pobieraniu](#get)); 206ca2e, 2026-11-10 (wersja `uploads` w [Instalacji i usunięciu](#instalacja) i [Manifeście i definicji modułu](#manifest), nazwa wyjątku w [Ochronie przed wyjściem poza katalog](#path-traversal)); pozostałe sekcje: 6c05f1f, 2026-11-05

Źródła:

- `kit/modules/uploads.json`, `kit/kit.json` (`placeholderFiles`, `version`), `kit/modules/core.json`, `packages/gato-cli/src/kit/source.ts` (źródło kitu w `wa add`)
- `prisma/schema/uploads.prisma`
- `docker/uploads.compose.yml`, `ci/uploads.integration-steps.yml`, `docker-compose.yml`, `Dockerfile`, `.gitignore`, `.github/workflows/ci.yml`, `.github/workflows/kit.yml`
- `src/features/uploads/` (`module.ts`, `env.ts`, `components/`, `contracts/`, `services/`, `i18n/`) z testami w `__tests__/`, w tym `services/__tests__/storage-env.test.ts`, `services/__tests__/local-storage.test.ts`, `services/__tests__/path-inside.test.ts`, `services/__tests__/create-object-storage.test.ts`, `services/__tests__/storage-local-env.test.ts`, `services/__tests__/storage.integration.test.ts`, `services/__tests__/read-upload.integration.test.ts` i `services/__tests__/uploads-isolation.integration.test.ts`
- `src/app/api/uploads/route.ts`, `src/app/api/uploads/[id]/route.ts` z testami w `__tests__/`
- `src/instrumentation.ts`, `packages/env/src/check-env.ts` (sprawdzenie zmiennych przy starcie)
- `src/shared/lib/logger.ts` (`err.type` we wpisach logu)
- `src/shared/lib/modules/define-module.ts`, `src/shared/lib/audit.ts`, `src/shared/lib/auth/service-mode.ts`, `src/shared/components/service-mode/use-service-mode-action.tsx`, `src/shared/utils/error-handling.ts`, `next.config.ts`
- `src/test/integration/setup-env.ts`, `e2e/env.ts`, `.env.example`
- `mutation-gate.json`
- [spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md), §7; [spec providera storage](superpowers/specs/2026-11-04-uploads-storage-provider-design.md)

Jak moduły kitu trafiają do projektu i łączą się z rdzeniem, wyjaśnia [12-moduly-kitu.md](12-moduly-kitu.md#warstwa-szwow); ten plik opisuje tylko `uploads`. Opis modułu ma dwie części: ten plik (co robi moduł, wymagania, instalacja i usunięcie, provider storage, co dodaje do aplikacji, szwy) i [15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md) (plik w funkcji projektu, bezpieczeństwo, testowanie, typowe problemy, referencja). Decyzje: [D39](decyzje.md#d39) (deklaracje w `defineModule`), [D44](decyzje.md#d44) (uploads), [D45](decyzje.md#d45) (region `wa:ci-integration`), [D49](decyzje.md#d49) (provider storage `local` albo `s3`).

<a id="przebieg"></a>

„(sprawdzone)” znaczy tu, że zachowanie potwierdził przebieg z 2026-10-30: projekt `upload-demo` założony z tagu `v0.1.0` z GitHuba komendą `wa create --modules uploads --locales pl,en --yes`, z bazą w kontenerze Postgresa, z MinIO w osobnym kontenerze testowym na porcie 9100 (bucket `upload-demo-uploads` utworzony ręcznie, bez `docker compose up`) i z funkcją projektu `deliveries` (wpis w `projectModules`, `"requires": ["uploads"]`). Funkcja deklaruje cel `delivery-photo`, ma formularz z `<FileUpload>`, zapisuje `id` pliku w dostawie i ma test integracyjny na MinIO. Na końcu `npm run verify` i `npm run test:integration` były zielone; trasy wywołano też przez `curl` na zbudowanym serwerze (`node .next/standalone/server.js`, czyli z `NODE_ENV=production`) z sesją administratora. Fragmenty kodu z tego przebiegu mają nad blokiem ścieżkę pliku w projekcie `upload-demo` i dopisek „przykład z przebiegu”.

Tag `v0.1.0` zawiera `uploads` w wersji `0.1.0`, który zapisywał pliki tylko w S3, więc przebieg sprawdzał trasy, cele, nagłówki i usuwanie na MinIO. Te zachowania nie zależą od providera: trasy i komendy wołają tylko `putObject`, `getObject` i `deleteObject`, a typ pobieranego pliku pochodzi z rekordu. Provider storage (`uploads` `0.2.0`, [D49](decyzje.md#d49)) sprawdzają testy jednostkowe na katalogu tymczasowym, a raport startowy z regułami providera sprawdzono na zbudowanym serwerze repozytorium kitu; takie miejsca mają dopisek „(sprawdzone 2026-11-04)”, a miejsca o regule ścieżki bezwzględnej „(sprawdzone 2026-11-05)”.

<a id="co-robi"></a>

## Co robi moduł i kiedy go nie dodawać

Funkcja projektu ma przyjmować pliki od użytkowników: zdjęcie dostawy, obraz w edytorze, załącznik. `uploads` przyjmuje plik przez `POST /api/uploads`, sprawdza go według **celu uploadu** (dozwolone typy, limit rozmiaru, widoczność, opcjonalne zmniejszenie obrazu), zapisuje obiekt w magazynie i rekord w tabeli `uploads`, a potem wydaje plik przez `GET /api/uploads/<id>`. Magazyn wybiera zmienna `STORAGE_PROVIDER`: domyślnie `local`, czyli katalog na dysku serwera, a przy `s3` magazyn zgodny z S3 ([Provider storage](#provider)). Funkcja projektu wstawia komponent `<FileUpload>` i zapisuje w swojej encji samo `id` pliku. Cele deklarują moduły w `module.ts`; kit ma jeden cel, `editor-image`.

Plik należy do organizacji. Widoczność celu decyduje, kto go pobierze: `public` każdy, kto zna adres, także bez logowania; `organization` tylko sesja, której aktywna organizacja jest organizacją pliku ([Pobieranie](#get)).

Czego moduł nie robi:

- **Nie ma strony ani menu.** `nav` i `routePrefixes` są puste; nie ma listy plików organizacji ani widoku do ich usuwania.
- **Nie sprząta osieroconych obiektów.** Plik wgrany, ale niezapisany w encji, plik encji usuniętej bez `deleteUploadCommand` i obiekty po `wa remove` zostają w magazynie, w katalogu na dysku albo w buckecie ([Osierocone obiekty](#osierocone)).
- **Nie przenosi plików między providerami.** Zmiana `STORAGE_PROVIDER` nie kopiuje plików zapisanych wcześniej: zostają w poprzednim magazynie, a `GET /api/uploads/<id>` daje dla nich 404, bo nowy magazyn nie ma obiektu pod kluczem z rekordu ([Pobieranie](#get), [znane-ograniczenia.md](znane-ograniczenia.md#uploads-local)).
- **Nie streamuje.** Trasa wczytuje cały plik do pamięci przy zapisie i przy odczycie; nie obsługuje nagłówka `Range` ani podpisanych adresów S3 (pliki zawsze idą przez serwer aplikacji).
- **Nie przyjmuje SVG, HTML ani XML** w żadnym celu ([Kontrakt celu](#cel-uploadu)) i nie przyjmuje formatów tekstowych bez sygnatury (`text/plain`, `text/csv`, `application/json`): typ pliku jest wykrywany z bajtów.
- **Nie ma klucza obcego do encji projektu.** Kolumna z `id` pliku w encji to zwykła kolumna; własność pliku sprawdza komenda projektu ([15b](15b-modul-uploads-uzycie.md#zapis-id)).
- **Nie skanuje plików** antywirusem i nie zmienia plików innych niż obrazy.

Nie dodawaj modułu, gdy projekt nie przyjmuje plików albo trzyma je poza aplikacją, gdy pliki są duże (wideo, archiwa): trasa trzyma cały plik w pamięci procesu, albo gdy produkcja nie ma ani trwałego katalogu dla jednej instancji aplikacji, ani magazynu zgodnego z S3.

<a id="wymagania"></a>

## Wymagania

| Co | `uploads` |
| --- | --- |
| Moduły kitu w `requires` | Brak. `audit-logs` nie jest wymagany; jeśli jest w projekcie, zapisuje zdarzenia plików ([Zdarzenia dziennika](#zdarzenia)). |
| Usługi | Przy `STORAGE_PROVIDER=local` (domyślnie) żadnych: pliki leżą w katalogu na dysku serwera, lokalnie w `./volumes/uploads`. Przy `STORAGE_PROVIDER=s3` magazyn zgodny z S3 z istniejącym bucketem: lokalnie MinIO z profilu Compose `s3` ([MinIO lokalnie](#minio)), na produkcji Railway Bucket albo Cloudflare R2. Testy integracyjne modułu zawsze działają na S3, więc potrzebują MinIO, a w CI uruchamiają go kroki z regionu `wa:ci-integration` ([CI projektu](#ci)). |
| Produkcja | Przy `local` jedna instancja aplikacji i trwały katalog, na przykład wolumen; przy `s3` bucket. Wybór na Railway i na własnym serwerze: [10-wdrozenie.md](10-wdrozenie.md#pliki-uploads). |
| Zmienne środowiskowe | `STORAGE_PROVIDER` i `STORAGE_LOCAL_PATH`, obie opcjonalne poza produkcją ([Provider storage](#provider)); `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` wymagane tylko przy `s3`, a `S3_REGION` i `S3_FORCE_PATH_STYLE` opcjonalne ([Zmienne S3](#zmienne-s3)). |
| Zależności npm | `@aws-sdk/client-s3`, `file-type`, `sharp` (`dependencies` manifestu). Projekt z providerem `local` też instaluje `@aws-sdk/client-s3`, bo moduł obsługuje oba providery. |
| Baza | Tabela `uploads` i typ `UploadVisibility`, czyli migracja po dodaniu modułu. |

<a id="instalacja"></a>

## Instalacja i usunięcie

**Nowy projekt.** Moduł wybierasz przy zakładaniu projektu ([16](16-cli-wa.md#wa-create)), na przykład:

```bash
KIT_DIR=$(mktemp -d) && git clone --depth 1 --branch v0.1.0 https://github.com/webamigos/wa-kit.git "$KIT_DIR" && node "$KIT_DIR/.wa/bin/wa.mjs" create acme-app --modules uploads
```

Tag `v0.1.0` zawiera `uploads` w wersji `0.1.0`, który zapisuje pliki tylko w S3. Provider storage opisany w tym pliku ma `uploads` `0.2.0`, więc projekt z nim zakładasz z klonu kitu w tej wersji (`--kit <ścieżka>`, [16](16-cli-wa.md#wa-create)) albo z tagu wersji kitu, która go zawiera.

`wa create` wpisuje do `.env` i `.env.example` zmienne `STORAGE_PROVIDER=local` i `STORAGE_LOCAL_PATH=./volumes/uploads` oraz zmienne `S3_*` lokalnego MinIO z bucketem `<slug>-uploads`, dodaje do `docker-compose.yml` usługi `minio` i `minio-init` z profilem `s3` i dodaje kroki MinIO do `.github/workflows/ci.yml`, w każdym miejscu z bucketem nazwanym od sluga. Projekt `storage-check` złożony z lokalnego klonu kitu (`wa create --modules uploads --kit <klon>`) dostał w `.env` `STORAGE_PROVIDER=local`, `STORAGE_LOCAL_PATH=./volumes/uploads` i `S3_BUCKET=storage-check-uploads`, a `docker compose config --services` wypisał w nim tylko `db` i `mail` (sprawdzone 2026-11-04). Pierwsza migracja (`npx prisma migrate dev --name init`) tworzy tabelę `uploads` (sprawdzone). Potem `docker compose up -d` uruchamia bazę i mailpit, bez MinIO, a aplikacja zapisuje pliki w `./volumes/uploads`; katalog `volumes/` jest w `.gitignore`. MinIO uruchamiasz tylko do pracy na S3 ([MinIO lokalnie](#minio), [01](01-uruchomienie.md#minio)).

**Istniejący projekt.** `npm run wa -- add uploads` kopiuje pliki modułu, wypełnia regiony `wa:relations` (`uploads Upload[]` w `User` i w `Organization`), `wa:modules` w `.env.example`, `wa:services` w `docker-compose.yml` i `wa:ci-integration` w `ci.yml`, uruchamia `wa generate` i `npm install` ([16](16-cli-wa.md#wa-add)).

<a id="wersja-core"></a>**Wersja modułu i `core`.** `wa add` kopiuje moduł z kitu, który pobierze: domyślnie z tagu `v<kitVersion>` repozytorium kitu ([źródło kitu](16-cli-wa.md#zrodlo-kitu)), czyli przy `kitVersion` `0.1.0` `uploads` `0.1.0`, który zapisuje pliki tylko w S3 i wymaga zmiennych `S3_*`. Provider storage opisany w tym pliku daje `uploads` `0.2.0` albo nowszy z lokalnego klonu kitu w tej wersji (`--kit <ścieżka>` albo `WA_KIT_SOURCE`). Ta wersja wymaga `core` `0.5.0`: sprawdzenia zmiennych przy starcie (`packages/env/src/*.ts`, `src/env.ts`, `src/instrumentation.ts`, [D48](decyzje.md#d48)), zmiennych magazynu w `e2e/env.ts` i `src/test/integration/setup-env.ts` oraz katalogu `/app/volumes/uploads` w `Dockerfile`. CLI tego nie pilnuje: w lokalnym klonie porównuje tylko `version` z `kit/kit.json`, która także w kicie z `uploads` `0.2.0` ma wartość `0.1.0`, a `wa add` nie zmienia plików rdzenia (`packages/gato-cli/src/kit/source.ts`). W projekcie z `core` `0.4.0` (tag `v0.1.0`) `uploads` `0.2.0` zainstaluje się więc bez błędu, ale reguły produkcyjne zadziałają dopiero przy pierwszym odczycie `env` (wdrożenie przejdzie healthcheck, a strony zwrócą 500), serwery e2e bez `STORAGE_LOCAL_PATH` w `e2e/env.ts` zwrócą 500, a testy integracyjne bez `STORAGE_PROVIDER=s3` w `setup-env.ts` po cichu sprawdzą `local` zamiast MinIO (wniosek z kodu, niesprawdzone). Zmiany rdzenia przenosisz wtedy ręcznie albo komendą `wa update` do wydania kitu, które je zawiera ([D47](decyzje.md#d47)); `wa update` wymaga tagu tej wersji ([16-cli-wa.md](16-cli-wa.md#wa-update)). Kroki niżej opisują `uploads` `0.2.0` na `core` `0.5.0`:

1. **`.env`.** `wa add` nie zmienia `.env`. Bez nowych zmiennych serwer deweloperski startuje z providerem `local` i katalogiem `./volumes/uploads`, czyli z wartościami domyślnymi ([Provider storage](#provider)). Przy `NODE_ENV=production`, na przykład po `npm start` albo w obrazie Docker, start kończy się raportem `Nieprawidłowe zmienne środowiskowe (<liczba problemów>):` z linią `- STORAGE_LOCAL_PATH: wymagana w produkcji przy STORAGE_PROVIDER=local: wskaż trwały katalog` i kodem 1 ([07](07-i18n-mail-env.md#walidacja-env), [16](16-cli-wa.md#add-po)). Skopiuj więc zmienne `STORAGE_*` z regionu `wa:modules` w `.env.example` do `.env`, a przy `STORAGE_PROVIDER=s3` także zmienne `S3_*`. Przykład `STORAGE_LOCAL_PATH=./volumes/uploads` wystarcza do `npm run dev`; w trybie produkcyjnym poza Railway, także przy `npm start` na własnym komputerze, ścieżka musi być bezwzględna ([reguły produkcyjne](#reguly-produkcyjne)).
2. **MinIO** tylko przy `STORAGE_PROVIDER=s3`: `docker compose --profile s3 up -d` uruchamia `minio` i zakłada bucket ([MinIO lokalnie](#minio)).
3. **Migracja.** Utwórz ją: `npx prisma migrate dev --name add-uploads` przy działającej bazie i zacommituj ją ([03b](03b-schemat-i-migracje.md#migracje-w-projekcie)). Prisma 7 nie generuje przy tym klienta; po `--no-install` uruchom `npm run db:generate`.

<a id="aktualizacja"></a>

**Projekt na `uploads` 0.1.0.** Przejście z `0.1.0` na `0.2.0` robisz ręcznie albo komendą `wa update` do wydania kitu z `uploads` `0.2.0` ([D47](decyzje.md#d47)), razem z przejściem rdzenia na `core` `0.5.0` ([wersja modułu i `core`](#wersja-core)). `0.1.0` zapisywał pliki zawsze w S3, a `0.2.0` bez `STORAGE_PROVIDER` wybiera `local`. Projekt, który ma zostać przy S3, ustawia więc `STORAGE_PROVIDER=s3` w `.env` i w zmiennych każdego środowiska, a lokalny MinIO uruchamia przez `docker compose --profile s3 up -d`, bo samo `docker compose up -d` go nie startuje. Bez `STORAGE_PROVIDER=s3`:

- serwer deweloperski startuje bez błędu i zapisuje nowe pliki w `./volumes/uploads`, a pliki wgrane wcześniej do MinIO dają 404;
- produkcja poza Railway nie wystartuje: raport ma linię `STORAGE_LOCAL_PATH: wymagana w produkcji przy STORAGE_PROVIDER=local: wskaż trwały katalog`;
- usługa Railway bez wolumenu też nie wystartuje (`STORAGE_PROVIDER: na Railway bez wolumenu pliki zginą przy redeployu: …`), a usługa z wolumenem wystartuje i zacznie zapisywać nowe pliki na wolumenie ([D49](decyzje.md#d49)).

<a id="provider"></a>

### Provider storage

`STORAGE_PROVIDER` wybiera, gdzie moduł zapisuje pliki. Schemat `src/features/uploads/env.ts` należy do walidacji `env` całej aplikacji ([07](07-i18n-mail-env.md#walidacja-env)), więc błędna konfiguracja magazynu zatrzymuje start serwera całej aplikacji, a nie dopiero pierwszy upload ([10](10-wdrozenie.md#blad-env)). Reguły są w czystej funkcji `resolveStorageEnv` (`services/storage-env.ts`); schemat z `env.ts` przekazuje jej zmienne i zamienia jej problemy na problemy walidacji z nazwą zmiennej.

| Zmienna | Reguła | Wartość lokalna z `wa create` |
| --- | --- | --- |
| `STORAGE_PROVIDER` | `local` albo `s3`. Wartość jest przycinana i zamieniana na małe litery, więc ` S3 ` wybiera `s3`. Brak, pusta wartość i same spacje dają `local`. Każda inna wartość to błąd `dozwolone wartości: local, s3`. | `local` |
| `STORAGE_LOCAL_PATH` | Tylko przy `local`: katalog magazynu. Pusta wartość znaczy brak. Ścieżka względna liczy się od katalogu roboczego procesu. W produkcji poza Railway wymagana i musi być ścieżką bezwzględną ([reguły produkcyjne](#reguly-produkcyjne)). | `./volumes/uploads` |
| `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_VOLUME_MOUNT_PATH` | Ustawia je Railway: pierwszą w każdej usłudze, drugą, gdy usługa ma podpięty wolumen (dokumentacja Railway, [10](10-wdrozenie.md#pliki-uploads)). Moduł czyta je tylko przy `local`, do reguł produkcyjnych i jako katalog domyślny. | brak |

Katalog providera `local` to pierwsza ustawiona wartość z listy, zamieniona na ścieżkę bezwzględną względem katalogu roboczego procesu:

1. `STORAGE_LOCAL_PATH`;
2. `RAILWAY_VOLUME_MOUNT_PATH`, czyli na Railway wystarczy podpiąć wolumen;
3. `./volumes/uploads` (stała `DEFAULT_LOCAL_STORAGE_PATH`).

Katalog roboczy zależy od sposobu uruchomienia: `npm run dev` i `npm start` działają w katalogu projektu, obraz Docker w `/app`, a ręczne `node .next/standalone/server.js` w `.next/standalone`, bo `server.js` zmienia katalog roboczy na własny ([znane-ograniczenia.md](znane-ograniczenia.md#uploads-local)). Dlatego w produkcji poza Railway ścieżka względna nie przechodzi sprawdzenia przy starcie, a katalog roboczy liczy się tylko poza produkcją i na Railway.

Przy `local` zmienne `S3_*` nie są sprawdzane i nie trafiają do wyniku, także z błędnymi wartościami (test „zmienne S3_* przy local nie są sprawdzane i nie trafiają do wyniku”), więc wartości lokalnego MinIO z `.env.example` mogą zostać w `.env`.

<a id="reguly-produkcyjne"></a>

**Reguły produkcyjne.** Przy `NODE_ENV=production` i providerze `local` schemat sprawdza po kolei cztery warunki i zgłasza tylko pierwszy spełniony. „Na Railway” znaczy, że `RAILWAY_ENVIRONMENT_ID` ma niepustą wartość.

| Warunek | Linia raportu startowego | Po co |
| --- | --- | --- |
| Na Railway bez `RAILWAY_VOLUME_MOUNT_PATH` | `- STORAGE_PROVIDER: na Railway bez wolumenu pliki zginą przy redeployu: podepnij wolumen albo ustaw STORAGE_PROVIDER=s3` | Bez wolumenu pliki leżałyby na dysku kontenera, który znika przy każdym wdrożeniu. |
| Na Railway z wolumenem, a ustawiony `STORAGE_LOCAL_PATH` leży poza nim | `- STORAGE_LOCAL_PATH: musi leżeć wewnątrz wolumenu Railway (<RAILWAY_VOLUME_MOUNT_PATH>)` | Inaczej pliki trafiłyby na dysk kontenera obok wolumenu. Ścieżka równa wolumenowi albo leżąca w nim przechodzi; `/database` przy wolumenie `/data` nie przechodzi. |
| Poza Railway bez `STORAGE_LOCAL_PATH` | `- STORAGE_LOCAL_PATH: wymagana w produkcji przy STORAGE_PROVIDER=local: wskaż trwały katalog` | Kit nie umie sprawdzić, czy katalog przetrwa restart, więc wymaga, żeby administrator wskazał go jawnie, zamiast dostać po cichu `./volumes/uploads` na dysku kontenera. Sam `RAILWAY_VOLUME_MOUNT_PATH` bez `RAILWAY_ENVIRONMENT_ID` tej zmiennej nie zastępuje. |
| Poza Railway `STORAGE_LOCAL_PATH` po obcięciu spacji nie jest ścieżką bezwzględną (`path.isAbsolute`), na przykład `./volumes/uploads` albo `data/u` | `- STORAGE_LOCAL_PATH: w produkcji poza Railway musi być ścieżką bezwzględną: wskaż trwały katalog` | Sam przykład `./volumes/uploads`, który `wa create` wpisuje do `.env`, wystarcza, żeby warunek z poprzedniego wiersza nie zadziałał, choć administrator nie wybrał katalogu. Ścieżka względna zależy od katalogu roboczego: `./volumes/uploads` przy `node .next/standalone/server.js` wskazuje `.next/standalone/volumes/uploads`, który usuwa następny `next build`. Na Railway ścieżkę względną pilnuje reguła wolumenu, a poza produkcją jest dozwolona. |

Poza produkcją tych reguł nie ma: `npm run dev` i testy działają z katalogiem domyślnym. Zbudowany serwer uruchomiony z poprawnymi zmiennymi rdzenia i `api-keys`, ale bez zmiennych magazynu, zakończył się sam po 0,44 s kodem 1 i wypisał na stderr (sprawdzone 2026-11-04):

```text
Nieprawidłowe zmienne środowiskowe (1):
- STORAGE_LOCAL_PATH: wymagana w produkcji przy STORAGE_PROVIDER=local: wskaż trwały katalog
```

Tak samo sprawdzono linie dwóch pierwszych wierszy tabeli (z `RAILWAY_ENVIRONMENT_ID` bez wolumenu oraz z `RAILWAY_VOLUME_MOUNT_PATH=/data` i `STORAGE_LOCAL_PATH=/database`) i linię `- STORAGE_PROVIDER: dozwolone wartości: local, s3` dla `STORAGE_PROVIDER=minio`. Pusty `STORAGE_PROVIDER` dał ten sam raport co brak zmiennej. Dwa uruchomienia przeszły start, a `/api/healthcheck` odpowiadał w nich 200: z bezwzględnym `STORAGE_LOCAL_PATH` oraz z `RAILWAY_ENVIRONMENT_ID` i `RAILWAY_VOLUME_MOUNT_PATH` bez `STORAGE_LOCAL_PATH` (sprawdzone 2026-11-04; zmienne Railway były ustawione w powłoce, a nie przez prawdziwą usługę Railway).

Linię ostatniego wiersza wypisał zbudowany serwer z `STORAGE_LOCAL_PATH=./volumes/uploads`, bez zmiennych Railway i z `NODE_ENV=production` ustawionym przez `server.js`: raport `Nieprawidłowe zmienne środowiskowe (1):` z tą jedną linią i koniec po 0,44 s kodem 1. Tę samą linię i kod 1 dał `next start`, czyli `npm start`, a z bezwzględnym `STORAGE_LOCAL_PATH` serwer przeszedł start i odpowiadał 200 na `/api/healthcheck` (sprawdzone 2026-11-05).

Reguły sprawdzają konfigurację, a nie dysk. Katalog, do którego proces nie ma prawa zapisu, przechodzi start, a pierwszy upload kończy się 500 `storage_failed` (wniosek z kodu: `resolveStorageEnv` nie dotyka systemu plików, a katalogi powstają dopiero przy zapisie). Wpis `upload putObject failed` trafia wtedy do odbiornika OTLP, gdy ustawiony jest `OTEL_EXPORTER_OTLP_ENDPOINT`, a bez niego tylko na konsolę serwera deweloperskiego: na produkcji bez OTLP `logger` nie zapisuje go nigdzie ([D15](decyzje.md#d15), [10](10-wdrozenie.md#logi)). Tak najpewniej wygląda brak prawa zapisu do wolumenu Railway bez `RAILWAY_RUN_UID=0`: odpowiedź 500 i nic w logach usługi (wniosek z kodu `logger.ts`, niesprawdzone na Railway).

<a id="provider-local"></a>

**Jak `local` zapisuje pliki** (`services/local-storage.ts`, testy w `services/__tests__/local-storage.test.ts`):

- obiekt leży w pliku `<katalog>/<klucz>`, na przykład `volumes/uploads/orgs/<organizationId>/editor-image/<id>.jpg`. Zapis tworzy brakujące katalogi i zapisuje plik od razu, bez pliku tymczasowego. Rekord `Upload` powstaje dopiero po udanym zapisie, więc przerwany zapis zostawia co najwyżej plik bez rekordu ([Osierocone obiekty](#osierocone));
- typu pliku provider nie przechowuje: pobieranie bierze go z rekordu (`mimeType`);
- odczyt brakującego pliku, klucza, który wskazuje katalog, i klucza, który przechodzi przez plik, zwraca `null`, czyli 404, tak jak `NoSuchKey` w S3; inne błędy systemu plików, na przykład brak praw, są rzucane dalej;
- usunięcie brakującego pliku nie jest błędem, tak jak w S3.

<a id="path-traversal"></a>

**Ochrona przed wyjściem poza katalog.** `resolveObjectPath` najpierw odrzuca klucz z bajtem `\0`, klucz bezwzględny i klucz z segmentem `..` (oddzielonym znakiem `/` albo `\`), a potem sprawdza, że ścieżka po rozwiązaniu leży wewnątrz katalogu magazynu i nie jest nim samym. Odrzucony klucz daje wyjątek `InvalidStorageKeyError` z komunikatem `Nieprawidłowy klucz obiektu`. Klucze tworzy sam moduł (`orgs/<organizationId>/<cel>/<id>.<rozszerzenie>`), więc to obrona w głąb, a nie łatka na znaną lukę. Sprawdzenie jest leksykalne: nie rozwiązuje dowiązań symbolicznych, więc dowiązanie wewnątrz katalogu magazynu, które prowadzi poza niego, zostanie odczytane albo zapisane. Katalog z `STORAGE_LOCAL_PATH` ma więc należeć wyłącznie do aplikacji ([znane-ograniczenia.md](znane-ograniczenia.md#uploads-local)). Klasa `InvalidStorageKeyError` wpisuje swoją nazwę napisem do `name`, więc wpis w logu z tym wyjątkiem w polu `err`, na przykład `upload putObject failed` ([15b](15b-modul-uploads-uzycie.md#referencja-komunikaty)), ma w `err.type` napis `InvalidStorageKeyError` także w buildzie produkcyjnym, który minifikuje nazwy klas ([07b](07b-logi-naglowki-healthcheck.md#logger-typ-bledu)). W buildzie klasa ma na przykład postać `class n extends Error{constructor(){super("Nieprawidłowy klucz obiektu"),this.name="InvalidStorageKeyError"}}` (sprawdzone 2026-11-10; wynik `npm run build`).

<a id="ograniczenia-local"></a>

**Ograniczenia `local`.**

- **Jedna instancja.** Pliki leżą na dysku jednego serwera, więc druga instancja aplikacji ich nie widzi. Na Railway usługa z wolumenem i tak nie może mieć replik (dokumentacja Railway). Kilka instancji wymaga `s3`.
- **Trwały katalog.** Katalog musi przetrwać restart i nowe wdrożenie: na Railway to wolumen, na własnym serwerze wolumen Dockera albo katalog hosta ([10](10-wdrozenie.md#pliki-uploads)).
- **Bez przenoszenia plików** między `local` i `s3` ([Co robi moduł](#co-robi)).

<a id="zmienne-s3"></a>

### Zmienne S3

Zmienne `S3_*` obowiązują tylko przy `STORAGE_PROVIDER=s3`; przy `local` nie są sprawdzane ([Provider storage](#provider)). Przy `s3` brak wymaganej zmiennej albo zła wartość zatrzymuje start serwera całej aplikacji, nie tylko upload ([10](10-wdrozenie.md#blad-env)). Zbudowany serwer z `STORAGE_PROVIDER=s3` i bez żadnej zmiennej `S3_*` wypisał w raporcie cztery linie, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` i `S3_BUCKET`, każdą z komunikatem `Invalid input: expected string, received undefined`. Z `S3_FORCE_PATH_STYLE=yes` wypisał `- S3_FORCE_PATH_STYLE: Invalid option: expected one of "true"|"false"` (sprawdzone 2026-11-04).

| Zmienna | Reguła przy `s3` (`services/storage-env.ts`) | Wartość lokalna z `wa create` |
| --- | --- | --- |
| `S3_ENDPOINT` | wymagana, adres URL | `http://localhost:9000` |
| `S3_REGION` | opcjonalna, niepusta; domyślnie `auto` | `auto` |
| `S3_ACCESS_KEY_ID` | wymagana, niepusta | `minioadmin` |
| `S3_SECRET_ACCESS_KEY` | wymagana, niepusta | `minioadmin` |
| `S3_SESSION_TOKEN` | opcjonalna; pusta albo same spacje to brak tokenu | pusta |
| `S3_BUCKET` | wymagana, niepusta | `<slug>-uploads` |
| `S3_FORCE_PATH_STYLE` | opcjonalna, `true` albo `false`; brak daje `false`; inna wartość to błąd walidacji | `true` |

- **Klient S3** (`services/s3-storage.ts`) powstaje raz na proces, przy pierwszym zapisie albo odczycie, z sumami kontrolnymi tylko tam, gdzie wymaga ich API (`requestChecksumCalculation` i `responseChecksumValidation` równe `WHEN_REQUIRED`). Zmiana zmiennych wymaga restartu procesu.
- **`S3_FORCE_PATH_STYLE=true`** adresuje obiekty jako `endpoint/bucket/klucz`; z tą wartością `wa create` konfiguruje lokalny MinIO i z nią działał przebieg. Bez tej flagi klient S3 używa adresu z bucketem w nazwie hosta (`bucket.endpoint`), takiego jak w Railway Bucket ([10](10-wdrozenie.md#pliki-uploads)).
- **Bucket musi istnieć.** Aplikacja go nie tworzy (żaden plik modułu nie wysyła `CreateBucket`); lokalnie tworzy go `minio-init`, w CI krok „Create MinIO bucket”, na produkcji ty w panelu magazynu przed pierwszym wdrożeniem ([10](10-wdrozenie.md#zmienne)).
- **Błąd magazynu nie wychodzi przy starcie.** Zła wartość endpointu, kluczy, regionu albo brak bucketu kończy się błędem przy pierwszym zapisie pliku (500 `storage_failed`) albo odczycie (500 z trasy `GET`), bo walidacja sprawdza tylko format zmiennych. Zbudowany serwer z `STORAGE_PROVIDER=s3` i wartościami `S3_*` z `.env.example` przeszedł start i odpowiadał 200 na `/api/healthcheck`, choć pod `localhost:9000` nie działał MinIO projektu (sprawdzone 2026-11-04).
- Produkcja nie ma reguły odrzucającej wartości z `.env.example` (jak pepper w `api-keys`); `minioadmin` przejdzie walidację także przy `NODE_ENV=production` (ten sam przebieg). Wartości na produkcję bierzesz z panelu magazynu.

- **`S3_SESSION_TOKEN`** to token tymczasowych poświadczeń, na przykład z AWS STS (`aws sts assume-role` zwraca `AccessKeyId`, `SecretAccessKey` i `SessionToken`; wpisujesz je do `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` i `S3_SESSION_TOKEN`). Ustawiony trafia do klienta S3 jako `sessionToken`, pusty nie trafia wcale (testy „passes a set session token through to the s3 env” i „createS3Storage without a session token gives the client exactly the two keys”). Z poświadczeniami z `sts assume-role` lokalnego MinIO `createS3Storage` zapisał, odczytał i usunął plik, a bez tokenu MinIO odrzucił klucz błędem `InvalidTokenId` (sprawdzone 2026-11-24). Tymczasowe poświadczenia wygasają, a moduł ich nie odświeża: po wygaśnięciu zapis i odczyt kończą się błędem do restartu z nowymi wartościami.

<a id="presety-s3"></a>

### Presety magazynów S3

Wartości dla popularnych magazynów zgodnych z S3. Klucze i bucket bierzesz z panelu magazynu; bucket musi istnieć przed pierwszym uploadem.

| Magazyn | `S3_ENDPOINT` | `S3_REGION` | `S3_FORCE_PATH_STYLE` | Uwagi | Sprawdzone |
| --- | --- | --- | --- | --- | --- |
| AWS S3 | `https://s3.<region>.amazonaws.com` | `<region>` | `false` | Region bucketu, np. `eu-central-1`. Tymczasowe poświadczenia z STS z `S3_SESSION_TOKEN`. | z dokumentacji dostawcy, 2026-11-24, nieuruchamiane |
| Cloudflare R2 | `https://<account_id>.r2.cloudflarestorage.com` | `auto` | `false` | Bucket z jurysdykcją ma własny endpoint, np. `https://<account_id>.eu.r2.cloudflarestorage.com`. Klucze z tokenu R2 API. | z dokumentacji dostawcy, 2026-11-24, nieuruchamiane |
| Scaleway | `https://s3.<region>.scw.cloud` | `<region>` | `false` | Regiony np. `fr-par`, `nl-ams`, `pl-waw`. | z dokumentacji dostawcy, 2026-11-24, nieuruchamiane |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | `<region>` | `false` | Region z endpointu bucketu w panelu, np. `us-west-004`; tylko HTTPS. | z dokumentacji dostawcy, 2026-11-24, nieuruchamiane |
| MinIO | `http://minio:9000` | `us-east-1` | `true` | Własny serwer; nazwa hosta to usługa w sieci Compose. | sprawdzone w CI (`kit.yml` `storage-presets`) |
| RustFS | `http://rustfs:9000` | `us-east-1` | `true` | Własny serwer; obraz `rustfs/rustfs`, klucze z `RUSTFS_ACCESS_KEY` i `RUSTFS_SECRET_KEY`. | sprawdzone w CI (`kit.yml` `storage-presets`) |

Job `storage-presets` w `.github/workflows/kit.yml` (tylko w repozytorium kitu) uruchamia dla MinIO i RustFS ten sam test `src/features/uploads/services/__tests__/storage.integration.test.ts` co CI projektu, z adresem, bucketem i kluczami z `INTEGRATION_S3_ENDPOINT`, `INTEGRATION_S3_BUCKET`, `INTEGRATION_S3_ACCESS_KEY_ID` i `INTEGRATION_S3_SECRET_ACCESS_KEY` (domyślnie klucze `minioadmin`). Lokalnie oba magazyny przeszły ten test 2026-11-24: MinIO na porcie 9300, RustFS 1.0.6 na porcie 9310 z kluczami innymi niż `minioadmin`. Kroki MinIO w CI projektu (`ci/uploads.integration-steps.yml`) się nie zmieniły.

<a id="minio"></a>

### MinIO lokalnie

MinIO jest potrzebny tylko do pracy na S3 i do testów integracyjnych modułu. `docker/uploads.compose.yml` trafia do regionu `wa:services` w `docker-compose.yml` jako dwie usługi z profilem Compose `s3` (`profiles: ["s3"]`):

| Usługa | Obraz | Porty | Co robi |
| --- | --- | --- | --- |
| `minio` | `cgr.dev/chainguard/minio:latest` przypięty przez digest `sha256:3b6e40c3…` | `${MINIO_PORT:-9000}:9000` (API S3), `${MINIO_CONSOLE_PORT:-9001}:9001` (konsola WWW) | Magazyn; użytkownik i hasło `minioadmin`; dane w `./volumes/minio`; działa jako `user: "0:0"`. |
| `minio-init` | `amazon/aws-cli:2.39.2` | brak | Do 30 razy co 2 sekundy sprawdza bucket `<slug>-uploads` i tworzy go, gdy go nie ma; potem kończy pracę (`restart: "no"`). |

Usługi z profilem nie startują bez niego: `docker compose config --services` wypisuje `db` i `mail`, a `docker compose --profile s3 config --services` dodatkowo `minio` i `minio-init` (sprawdzone 2026-11-04). Do pracy na S3 ustaw w `.env` `STORAGE_PROVIDER=s3` i uruchom usługi z profilem:

```bash
docker compose --profile s3 up -d
```

Wartości `S3_*` z `.env.example` pasują do tego MinIO: `http://localhost:9000`, klucze `minioadmin` i bucket `<slug>-uploads`, który zakłada `minio-init`. Samej komendy nie uruchamiano (niesprawdzone), bo w repozytorium kitu port 9000 zajmował inny projekt; sprawdzona jest tylko lista usług z `config`.

Obraz Chainguard jest przypięty przez digest, bo bez opłat dostępny jest tylko tag `latest`; obrazy `minio/minio` i `minio/mc` nie są już do pobrania ([01](01-uruchomienie.md#minio)). Zajęty port 9000 zmieniasz razem w dwóch miejscach: `MINIO_PORT` w `.env` (czyta go Compose) i port w `S3_ENDPOINT` (czyta go aplikacja). W przebiegu MinIO działał na porcie 9100 z `S3_ENDPOINT=http://localhost:9100` i aplikacja zapisywała i czytała pliki (sprawdzone); samych usług z `docker-compose.yml` przebieg nie uruchamiał, więc ta tabela opisuje plik, a nie ich start.

<a id="ci"></a>

### CI projektu

Pole `ciSteps` manifestu wskazuje `ci/uploads.integration-steps.yml`, który `wa generate` wpisuje do regionu `# wa:ci-integration:start` / `# wa:ci-integration:end` w jobie `integration` pliku `.github/workflows/ci.yml`, a od `core` 0.5.3 także do tego samego regionu w `.github/workflows/mutation.yml` przed krokiem „Run Stryker (integration)” ([D45](decyzje.md#d45), [02b](02b-rejestr-i-generator.md#regiony)). Kroki „Start MinIO” (`docker run` tego samego obrazu, czekanie do 60 sekund na `/minio/health/live`) i „Create MinIO bucket” (`aws s3 mb s3://<slug>-uploads`) poprzedzają krok „Integration tests”. Plik jest w `placeholderFiles` kitu, więc w projekcie ma bucket od sluga: w `upload-demo` `s3://upload-demo-uploads` (sprawdzone w wygenerowanym `ci.yml`; workflow nie był uruchamiany w GitHub Actions). Testy integracyjne biorą wtedy domyślne `http://localhost:9000` i `<slug>-uploads` z `src/test/integration/setup-env.ts`. Ten sam plik ustawia `STORAGE_PROVIDER=s3`, więc testy integracyjne modułu działają na S3 niezależnie od providera w `.env` i od zmiennych środowiska CI ([Testowanie](15b-modul-uploads-uzycie.md#testowanie)). W repozytorium kitu przebieg na MinIO z portem 9100 dał `Test Files  10 passed (10)` i `Tests  181 passed (181)` (sprawdzone 2026-11-04).

`e2e.yml` nie ma tego regionu i nie uruchamia MinIO. Serwery e2e zapisują pliki na dysku: `e2e/env.ts` ustawia im `STORAGE_PROVIDER=local` i `STORAGE_LOCAL_PATH` z `E2E_UPLOADS_DIR` albo `<katalog tymczasowy systemu>/wa-app-e2e-uploads` (w projekcie z nazwą projektu zamiast `wa-app`, bo plik jest w `placeholderFiles`). Serwery e2e działają w trybie produkcyjnym poza Railway, więc `E2E_UPLOADS_DIR` musi być ścieżką bezwzględną ([reguły produkcyjne](#reguly-produkcyjne)). Z tymi zmiennymi oba serwery e2e przeszły sprawdzenie przy starcie i odpowiedziały na `/sign-in` (sprawdzone 2026-11-04, [08](08-testy.md#e2e)); testy e2e kitu nie wysyłają plików. CI kitu składa projekt z samym `uploads` i ze wszystkimi modułami (macierz `combo` w `.github/workflows/kit.yml`) i uruchamia dla nich MinIO własnymi krokami z bucketem `matrix-app-uploads` ([16b](16b-rozwoj-kitu.md#ci-kitu)).

<a id="usuniecie"></a>

### Usunięcie

`npm run wa -- remove uploads` odmawia, gdy moduł projektu ma `uploads` w `requires`: w przebiegu funkcja `deliveries` zablokowała usunięcie komunikatem `Moduł uploads jest wymagany przez: deliveries` (sprawdzone). Na kopii projektu bez funkcji `deliveries` `wa remove uploads --no-install` usunął pliki modułu, zmienne modułu z `.env.example`, usługi `minio` i `minio-init` z `docker-compose.yml`, kroki MinIO z `ci.yml`, relacje z `auth.prisma` i `organizations.prisma` oraz `@aws-sdk/client-s3`, `file-type` i `sharp` z `package.json`, i wypisał `npx prisma migrate dev --name remove-uploads` (sprawdzone na `uploads` `0.1.0`). W `0.2.0` region `wa:modules` traci tak samo także `STORAGE_PROVIDER` i `STORAGE_LOCAL_PATH`, bo generator składa go z pola `env` manifestów zainstalowanych modułów (wniosek z kodu generatora). Co zostaje ([16](16-cli-wa.md#remove-co-zostaje)):

| Co | Po `wa remove uploads` |
| --- | --- |
| Tabela `uploads` z rekordami plików | Zostaje z danymi, dopóki nie zastosujesz migracji `npx prisma migrate dev --name remove-uploads`, która ją usuwa. Wcześniej wypisz z niej klucze (`key`), jeśli chcesz posprzątać magazyn. |
| Pliki w magazynie | Zostają wszystkie: przy `local` pliki w katalogu `STORAGE_LOCAL_PATH` (lokalnie `volumes/uploads`, który jest w `.gitignore`), przy `s3` obiekty w buckecie. Ani `wa remove`, ani migracja ich nie usuwają; po usunięciu tabeli nie ma już listy kluczy ([Osierocone obiekty](#osierocone)). |
| Dane lokalnego MinIO (`volumes/minio`) i uruchomiony kontener `minio` | Zostają; kontener działa dalej jako osierocony, dopóki nie uruchomisz `docker compose up -d --remove-orphans`. |
| Zmienne `STORAGE_*` i `S3_*` w `.env` i w zmiennych produkcji | Zostają; znikają tylko z `.env.example`. Usuń je sam. |
| Kolumny z `id` pliku w encjach projektu | Zostają z wartościami; adres `/api/uploads/<id>` daje 404, bo nie ma trasy. |
| Kod projektu, który importuje `<FileUpload>` albo `deleteUploadCommand` | Przestaje się budować (`TS2307: Cannot find module '@/features/uploads/…'`, [12](12-moduly-kitu.md#punkty-wejscia)). `wa remove` nie szuka takich importów. |
| Deklaracje `uploadPurposes` w `module.ts` projektu | Zostają i nic nie robią. |
| Wpis `src/features/uploads/services/` w `critical` pliku `mutation-gate.json` i `/api/uploads` w `src/__tests__/proxy-matcher.test.ts` | Zostają, bo to pliki rdzenia (sprawdzone na kopii). |
| Wpisy `upload.*` w `audit_logs` (gdy jest `audit-logs`) | Zostają; strona `/audit-log` pokazuje je jako surowy napis, bo etykiety deklarował usunięty moduł. |

<a id="co-dodaje"></a>

## Co moduł dodaje do aplikacji

<a id="manifest"></a>

### Manifest i definicja modułu

`kit/modules/uploads.json`

```json
  "files": [
    "prisma/schema/uploads.prisma",
    "src/features/uploads/**",
    "src/app/api/uploads/**",
    "docker/uploads.compose.yml",
    "ci/uploads.integration-steps.yml"
  ],
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1159.0",
    "file-type": "^22.3.0",
    "sharp": "^0.35.5"
  },
```

Manifest ma `version` `0.3.0` i opis „Pliki organizacji na dysku albo w magazynie S3”. W `env` ma dziewięć zmiennych, wszystkie z `"required": false`: `STORAGE_PROVIDER` (przykład `local`), `STORAGE_LOCAL_PATH` (`./volumes/uploads`) i siedem zmiennych `S3_*` z przykładami lokalnego MinIO (bucket `{{projectSlug}}-uploads`) i pustym `S3_SESSION_TOKEN`. Pola `required` nie czyta żaden kod CLI, a o wymagalności decyduje schemat ([16b](16b-rozwoj-kitu.md#manifesty)). Dalej są relacje `uploads Upload[]` w `User` i `Organization`, `"compose": "docker/uploads.compose.yml"` i `"ciSteps": "ci/uploads.integration-steps.yml"`.

<a id="lista-zmiennych"></a>

**Nazwy zmiennych magazynu są w trzech miejscach.** Nic nie porównuje tych list, więc nową zmienną dopisujesz do każdej, która jej dotyczy:

| Miejsce | Co z niego wynika |
| --- | --- |
| `env` w `kit/modules/uploads.json` | Linie w regionie `wa:modules` w `.env.example` ([02b](02b-rejestr-i-generator.md#regiony)). `RAILWAY_ENVIRONMENT_ID` i `RAILWAY_VOLUME_MOUNT_PATH` tu nie ma, bo ustawia je Railway. |
| klucze `z.object` w `src/features/uploads/env.ts` | Zmienne, które schemat modułu przekazuje do `resolveStorageEnv`. Zod pomija klucze spoza obiektu, więc reszta `process.env` do funkcji nie trafia. |
| `s3EnvSchema` i `resolveLocalEnv` w `services/storage-env.ts` | Reguły i wynik providera. |

Opcjonalna zmienna dopisana tylko do `s3EnvSchema` w `storage-env.ts` zostanie bez ostrzeżenia wycięta przez `z.object` w `env.ts`: funkcja dostanie zawsze `undefined`, a schemat przyjmie wartość domyślną albo pominie zmienną, także gdy jest ustawiona w `.env` (wniosek z kodu). Zmienna wymagana dopisana w ten sposób daje przy `s3` błąd walidacji także przy ustawionej wartości, więc wychodzi przy pierwszym starcie z tym providerem.

<a id="definicja-modulu"></a>

Definicja modułu (`src/features/uploads/module.ts`):

| Pole | Wartość | Skutek |
| --- | --- | --- |
| `key` | `uploads` | Namespace tłumaczeń (etykiety akcji i komunikaty `<FileUpload>`). |
| `nav`, `routePrefixes` | `[]` | Brak strony i pozycji menu. |
| `roles` | brak | Moduł nie ogranicza ról; trasy i komenda sprawdzają dostęp same ([Dostęp](#dostep)). |
| `auditActions` | `upload.created`, `upload.deleted` | Etykiety zdarzeń plików w dzienniku ([Zdarzenia](#zdarzenia)). |
| `commands` | `["uploads.delete"]` | Klucz komendy `deleteUploadCommand`, na który inne moduły mogą założyć hook `before` ([Usuwanie](#usuwanie)). |
| `permissions` | `uploads.delete-others`: `defaultRoles: ["owner", "admin"]`, `labelKey: "permission-delete-others"` | Kto usuwa cudze pliki ([Usuwanie](#usuwanie), [Uprawnienia](15b-modul-uploads-uzycie.md#uprawnienia)). |
| `uploadPurposes` | `editor-image`: `image/jpeg`, `image/png`, `image/webp`, `maxBytes: 5 * 1024 * 1024`, `visibility: "public"`, `resizeImage: { maxWidth: 1200 }` | Cel kitu dla obrazów w edytorach ([Kontrakt celu](#cel-uploadu)). |

<a id="model"></a>

### Model `Upload`

`prisma/schema/uploads.prisma`, tabela `uploads`, enum `UploadVisibility` z wartościami `PUBLIC` i `ORGANIZATION`:

| Pole | Kolumna i typ | Znaczenie |
| --- | --- | --- |
| `id` | `id`, `uuid` | Identyfikator pliku i część adresu `/api/uploads/<id>`. Schemat ma domyślne `uuid()`, ale `createUpload` podaje własne `randomUUID()`, bo potrzebuje go w kluczu obiektu przed zapisem rekordu. |
| `organizationId` | `organization_id`, tekst, wymagane | Organizacja pliku, z kontekstu sesji, nigdy z formularza. |
| `uploadedById` | `uploaded_by_id`, tekst, opcjonalne | Autor; decyduje o prawie do usunięcia. |
| `purpose` | `purpose`, tekst | Klucz celu z chwili zapisu. |
| `key` | `key`, tekst, unikalne | Klucz obiektu w magazynie: `orgs/<organizationId>/<cel>/<id>.<rozszerzenie>`. Przy `local` to ścieżka pliku względem `STORAGE_LOCAL_PATH`, przy `s3` klucz w buckecie. |
| `fileName` | `file_name`, tekst | Nazwa pliku od klienta, bez zmian (1–255 znaków); po zmniejszeniu obrazu nadal z oryginalnym rozszerzeniem. |
| `mimeType` | `mime_type`, tekst | Typ zapisanego obiektu wykryty z bajtów (po zmniejszeniu `image/jpeg`). |
| `size` | `size`, `int` | Rozmiar zapisanego obiektu w bajtach (po zmniejszeniu). |
| `visibility` | `visibility`, `UploadVisibility` | `PUBLIC` albo `ORGANIZATION`, z celu w chwili zapisu. |
| `createdAt` | `created_at`, `timestamptz` | Czas zapisu. |

Indeks `(organizationId, createdAt)` i unikalny `key`. Zachowanie przy usuwaniu: **usunięcie organizacji** usuwa jej rekordy (`onDelete: Cascade`, test „usunięcie organizacji kasuje jej rekordy uploadów”), ale nie obiekty w magazynie; **usunięcie użytkownika** zostawia plik z `uploadedById` równym `null`, a wtedy usunąć go mogą tylko owner i admin organizacji oraz admin i superadmin globalny. Widoczność i limity są zapisane w rekordzie albo sprawdzone przy zapisie: zmiana celu w `module.ts` nie zmienia plików już wgranych.

<a id="post"></a>

### Zapis: `POST /api/uploads`

Żądanie `multipart/form-data` z polami `file`, `purpose` i opcjonalnym `serviceModeConfirmation` (JSON). Trasa `src/app/api/uploads/route.ts` i komenda `createUpload` (`services/commands/create-upload.ts`) sprawdzają kolejno:

| Krok | Wynik przy błędzie |
| --- | --- |
| 1. Nagłówek `Content-Length` istnieje i jest liczbą | 411 `{"error":"length_required"}` |
| 2. `Content-Length` ≤ największy `maxBytes` ze wszystkich celów + 64 KB (65 536 B) na narzut formularza | 413 `{"error":"too_large"}` |
| 3. Sesja | 401 `{"error":"unauthorized"}` |
| 4. Aktywna organizacja (`getOrgContext()`) | 403 `{"error":"unauthorized"}` |
| 5. Odczyt ciała jako `FormData` | 400 `{"error":"invalid_input"}` |
| 6. Potwierdzenie trybu serwisowego (`assertServiceModeConfirmed`) | 403 `{"error":"Potwierdź zmianę w trybie serwisowym"}` |
| 7. `file` jest plikiem z nazwą 1–255 znaków, `purpose` niepusty | 400 `{"error":"invalid_input"}` |
| 8. Cel istnieje w rejestrze | 400 `{"error":"unknown_purpose"}` |
| 9. Plik niepusty | 400 `{"error":"empty"}` |
| 10. Rozmiar pliku ≤ `maxBytes` celu | 413 `{"error":"too_large"}` |
| 11. Typ wykryty z bajtów (`file-type`) jest w `mimeTypes` celu i nie jest zakazany | 415 `{"error":"unsupported_type"}` |
| 12. Zmniejszenie obrazu (cel z `resizeImage`) | 400 `{"error":"invalid_image"}` |
| 13. Zapis obiektu w magazynie (`putObject`) | 500 `{"error":"storage_failed"}`, bez rekordu |
| 14. Zapis rekordu `Upload` | 500 `{"error":"storage_failed"}` po cofnięciu obiektu ([Cofnięcie](#cofniecie)) |
| Sukces | 201 `{ id, url, fileName, mimeType, size }`, `url` równe `/api/uploads/<id>` |

Na zbudowanym serwerze (sprawdzone przez `curl`): żądanie z `Transfer-Encoding: chunked` bez `Content-Length` dostało 411, także bez sesji; `Content-Length` o 1 bajt większy niż limit (8 454 145 B przy największym celu 8 MB) dostał 413 od razu, bez wysyłania ciała, a równy limitowi bez sesji 401, też bez ciała; plik 6 MB do `editor-image` (limit 5 MB) i 9 MB do `delivery-photo` dostały 413; SVG wysłane jako `image/png` 415 `unsupported_type`; cel `avatar` 400 `unknown_purpose`; nazwa 256 znaków 400 `invalid_input`, 255 znaków 201; pusty plik 400 `empty`; brak `purpose` i treść JSON zamiast formularza 400 `invalid_input`. Nienumeryczny `Content-Length` nie dociera do trasy: serwer HTTP Node odrzuca takie żądanie odpowiedzią 400 bez treści JSON (sprawdzone); 411 dla takiej wartości sprawdza tylko test trasy.

- **Kolejność ma skutki.** Limit z kroku 2 jest jeden dla całej aplikacji i liczony z deklaracji przed sprawdzeniem sesji, więc trasa odrzuca za duże żądanie bez czytania ciała i bez dostępu do bazy. Limit celu (krok 10) sprawdza się dopiero po wczytaniu pliku do pamięci. Błąd w deklaracjach celów (krok 2 woła `maxUploadBytes()`) kończy każde żądanie z poprawnym `Content-Length` błędem 500 ([Kontrakt celu](#cel-uploadu)).
- **Nazwa pliku.** Długość liczy się w jednostkach UTF-16 (`string.length`): 127 emoji i jeden znak przejdą, 128 emoji nie (testy `upload.schemas.test.ts`).
- **Typ z zawartości.** `file.type` i rozszerzenie nazwy nie mają znaczenia; rozszerzenie klucza obiektu wynika z wykrytego typu.
- **Organizacja z sesji.** Pole `organizationId` w formularzu jest ignorowane (testy „ignoruje organizationId z formularza”).
- **Potwierdzenie** to JSON w polu `serviceModeConfirmation`; niepoprawny JSON daje 403 także poza trybem serwisowym (test „zwraca 403 przy niepoprawnym JSON w serviceModeConfirmation także dla członka”).
- **Bez `audit-logs`** zapis działa tak samo; zdarzenie `upload.created` nie trafia nigdzie (sprawdzone: przebieg nie miał `audit-logs`).

<a id="obrazy"></a>

**Obrazy.** Cel z `resizeImage` przepuszcza każdy plik `image/*` przez `sharp` (`services/prepare-upload-body.ts`): limit wejścia 40 000 000 pikseli, obrót według EXIF, spłaszczenie przezroczystości na białe tło `#ffffff`, zmniejszenie do `maxWidth` bez powiększania i zapis jako JPEG z jakością 82. Zapisany plik ma więc `image/jpeg`, rozszerzenie `jpg` i nie ma metadanych EXIF. W przebiegu przezroczysty PNG 3000×200 do `editor-image` wrócił jako JPEG 1200×80 (sprawdzone), a test integracyjny funkcji potwierdził 1600 px dla celu z `maxWidth: 1600`. Obraz, którego `sharp` nie odczyta (uszkodzony, za duży), daje 400 `invalid_image`; plik innego typu w tym samym celu przechodzi bez zmian.

<a id="cofniecie"></a>

**Cofnięcie obiektu przy błędzie rekordu.** Obiekt trafia do magazynu przed rekordem. Gdy zapis rekordu się nie uda, `createUpload` loguje `upload record create failed`, usuwa obiekt pod tym samym kluczem i zwraca 500 `storage_failed`; zdarzenie `upload.created` nie powstaje. Gdy usunięcie obiektu też się nie uda, błąd trafia tylko do logu jako `upload rollback failed` z polami `err` i `key`, odpowiedź jest ta sama, a obiekt zostaje w magazynie bez rekordu. Gdy nie uda się zapis obiektu, log ma `upload putObject failed`, a rekord nie powstaje. Te przypadki sprawdzają testy jednostkowe z atrapami Prismy i magazynu („usuwa obiekt z tym samym kluczem i zwraca 500, gdy zapis rekordu pada”, „zwraca 500 i loguje upload rollback failed…”); przebieg ich nie odtwarzał.

<a id="get"></a>

### Pobieranie: `GET /api/uploads/<id>`

`src/app/api/uploads/[id]/route.ts` woła `readUploadForDownload(id)` (`services/read-upload.ts`):

1. `id`, które nie jest UUID, daje 404 bez zapytania do bazy.
2. Brak rekordu daje 404. Rekord jest czytany po samym `id` w `withoutTenantScope("upload lookup before visibility check", …)`, bo plik publiczny czyta każdy, a widoczność pliku organizacji sprawdza dopiero krok 3. Bez zwolnienia guard w runtime odrzuciłby to zapytanie `TenantScopeError` ([03](03-dane-i-organizacje.md#guard-w-runtime), [D51](decyzje.md#d51)).
3. Plik `ORGANIZATION`: brak sesji, sesja bez aktywnej organizacji, inna aktywna organizacja albo usunięte członkostwo dają 404, tak samo jak nieistniejący plik, więc odpowiedź nie zdradza, że plik istnieje. Kontekst bierze `getOrgContext()` z sesją czytaną z bazy (`disableCookieCache: true`), więc usunięcie członkostwa działa od następnego żądania. Superadmin w trybie serwisowym czyta pliki organizacji, w której jest.
4. Plik `PUBLIC` czyta każdy, bez sesji i z dowolną aktywną organizacją.
5. Brak obiektu w magazynie daje 404: przy `s3` błąd `NoSuchKey`, przy `local` brak pliku ([Provider storage](#provider-local)). Inny błąd magazynu daje 500.

Nagłówki odpowiedzi 200:

| Nagłówek | Wartość |
| --- | --- |
| `Content-Type` | `mimeType` z rekordu |
| `Content-Disposition` | `inline; filename="<nazwa ASCII>"; filename*=UTF-8''<nazwa zakodowana procentowo>` |
| `Cache-Control` | `public, max-age=31536000, immutable` dla `PUBLIC`; `private, no-store` dla `ORGANIZATION` |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | `sandbox; default-src 'none'` |

Odpowiedzi z przebiegu (sprawdzone): plik `editor-image` bez sesji 200 z `cache-control: public, max-age=31536000, immutable`; plik `delivery-photo` bez sesji 404, z sesją 200 z `cache-control: private, no-store`; `/api/uploads/abc` 404.

- **`Cache-Control`.** Plik publiczny przeglądarka i pośrednicy mogą trzymać rok, a adresu nie da się unieważnić inaczej niż usunięciem pliku. Plik organizacji nie trafia do cache, żeby przeglądarka nie oddała go po wylogowaniu ([D44](decyzje.md#d44)).
- **`Content-Disposition`.** `contentDisposition` (`services/content-disposition.ts`) w `filename` zamienia na `_` znaki spoza ASCII 0x20–0x7E, cudzysłów, średnik i ukośnik odwrotny, więc nowa linia nie wejdzie do nagłówka; `filename*` koduje nazwę przez `encodeURIComponent` i dodatkowo zamienia `'`, `(`, `)` i `*` na `%27`, `%28`, `%29` i `%2A`, więc bez kodowania zostają tylko litery, cyfry i `-_.!~`, czyli znaki `attr-char` z RFC 8187 (od `uploads` 0.2.1, R24 w notatce rozbieżności). Plik `zdjęcie dostawy "A".png` dostał `filename="zdj_cie dostawy _A_.png"; filename*=UTF-8''zdj%C4%99cie%20dostawy%20%22A%22.png` (sprawdzone). Trasa zawsze używa `inline`, więc przeglądarka pokazuje obraz; pobranie wymusza atrybut `download` linku.
- **Piaskownica.** `sandbox; default-src 'none'` odbiera plikowi skrypty, formularze i zasoby zewnętrzne, także gdy przeglądarka otworzy go pod adresem aplikacji. Wbudowany podgląd PDF w przeglądarce może przez to nie działać.
- **Odpowiedź 404** nie ma nagłówków pliku ani `Content-Security-Policy` z trasy. Na zbudowanym serwerze miała `X-Content-Type-Options: nosniff` i inne nagłówki bezpieczeństwa, ale z `next.config.ts`, które dokłada je do każdej ścieżki (sprawdzone).

<a id="usuwanie"></a>

### Usuwanie: `deleteUploadCommand`

`deleteUploadCommand(input, confirmation?)` (`services/commands/upload-commands.ts`, `"use server"`) przyjmuje `{ id }`. Od `uploads` 0.6.0 to komenda `uploads.delete` uruchamiana przez `runCommand` ([ADR-62](adrs/62-gato-commands-run-through-define-command-with-before-hooks-only.md), [wzorzec](06-wzorce-kodu.md#define-command)):

1. `requireModuleEnabled("uploads")`, `getOrgContext()` i `assertServiceModeConfirmed(context, confirmation)`; potem hooki `before` innych modułów na `uploads.delete` (`command-hooks.ts`), które mogą odmówić (`DomainError` z własnym komunikatem) albo podmienić `id` na plik tej samej organizacji.
2. `id` musi być UUID; plik szuka się z filtrem `organizationId` aktywnej organizacji. Nieprawidłowe `id`, plik innej organizacji i plik nieistniejący dają ten sam błąd „Nie udało się usunąć pliku”.
3. Usunąć może autor (`uploadedById` równe użytkownikowi) albo ten, komu `can(context, "uploads.delete-others")` daje `true`: domyślnie owner i admin organizacji, zawsze admin i superadmin globalny ([Uprawnienia](15b-modul-uploads-uzycie.md#uprawnienia)); pozostali dostają „Brak uprawnień do usunięcia pliku” i nic nie jest usuwane.
4. Komenda usuwa obiekt z magazynu, potem rekord (z warunkiem `{ id, organizationId }`), potem woła `trackAudit` z `upload.deleted`. **Błąd usunięcia obiektu nie zatrzymuje komendy**: trafia do logu jako `upload deleteObject failed` z kluczem, rekord znika, a obiekt zostaje osierocony ([Osierocone obiekty](#osierocone)).
5. Po udanym usunięciu komenda emituje zdarzenie `uploads.deleted` z `{ uploadId }` (`src/features/uploads/events.ts`); odmowa i błąd nie emitują nic ([ADR-61](adrs/61-domain-events-run-subscribers-after-success.md)).
6. Drugie wywołanie dla tego samego `id` zwraca błąd i nie woła magazynu.

Komendę woła kod projektu przez `useServiceModeAction().run` albo z własnej komendy, która usuwa encję ([15b](15b-modul-uploads-uzycie.md#usuwanie-z-encja)).

<a id="osierocone"></a>

### Osierocone obiekty

Obiekt w magazynie bez rekordu albo rekord bez encji projektu powstaje przy obu providerach, gdy:

| Sytuacja | Co zostaje |
| --- | --- |
| Użytkownik wgrał plik w formularzu i go nie zapisał (zamknął stronę, wybrał drugi plik) | Rekord i obiekt bez encji. `<FileUpload>` zapisuje plik od razu po wyborze, przed wysłaniem formularza. |
| Encja projektu usunięta bez `deleteUploadCommand` | Rekord i obiekt. |
| `deleteUploadCommand` nie usunął obiektu z magazynu | Obiekt bez rekordu (log `upload deleteObject failed`). |
| Cofnięcie przy błędzie rekordu nie usunęło obiektu | Obiekt bez rekordu (log `upload rollback failed`). |
| Zapis pliku przy `local` przerwany w trakcie, na przykład przez brak miejsca na dysku albo koniec procesu | Plik bez rekordu, być może niepełny. Gdy proces działa dalej, log ma `upload putObject failed`; `createUpload` nie usuwa pliku po nieudanym zapisie (wniosek z kodu `create-upload.ts`). |
| Usunięcie organizacji | Obiekty pod `orgs/<organizationId>/`; rekordy znikają kaskadowo. |
| `wa remove uploads` i migracja usuwająca tabelę | Wszystkie obiekty. |

Moduł nie ma zadania, które to sprząta ([D44](decyzje.md#d44), [znane-ograniczenia.md](znane-ograniczenia.md#bez-sprzatania)). Obiekty bez rekordu znajdziesz, porównując klucze z kolumną `key`: przy `local` ścieżki plików względem `STORAGE_LOCAL_PATH`, przy `s3` klucze w buckecie. Prefiks `orgs/<organizationId>/<cel>/` pozwala zawęzić porównanie do organizacji i celu.

<a id="komponenty"></a>

### Komponenty, komendy i serwisy

| Plik | Eksport | Co robi |
| --- | --- | --- |
| `components/file-upload.tsx` | `FileUpload` | Pole pliku, wysyłka do `POST /api/uploads`, komunikat błędu, podgląd obrazu ([kontrakt](#file-upload)). |
| `services/commands/create-upload.ts` | `createUpload(formData)` | Powtarza kroki 3–4 i wykonuje kroki 6–14 zapisu (krok 5, odczyt `FormData`, robi trasa); zwraca `{ status, body }` dla trasy. |
| `services/commands/upload-commands.ts` | `deleteUploadCommand(input, confirmation?)` | Usunięcie pliku ([Usuwanie](#usuwanie)). |
| `services/read-upload.ts` | `readUploadForDownload(id)` | Odczyt dla trasy `GET` ([Pobieranie](#get)). |
| `services/api-org-context.ts` | `readOrgContextForApi()` | Sesja i `OrgContext` dla tras: 401 bez sesji, 403 bez organizacji, bez przekierowania. |
| `services/upload-purposes.ts` | `listUploadPurposes()`, `resolveUploadPurpose(key)`, `maxUploadBytes()`, `objectKey(…)`, `FORBIDDEN_MIME_TYPES` | Cele z rejestru, limit trasy, klucz obiektu. |
| `services/validate-upload.ts` | `validateUpload(bytes, purpose)` | Pusty plik, limit celu, typ z bajtów. |
| `services/prepare-upload-body.ts` | `prepareUploadBody(…)`, `InvalidImageError` | Zmniejszenie obrazu. |
| `services/storage.ts` | `putObject`, `getObject`, `deleteObject`, `createObjectStorage(config)` | Dyspozytor: przy pierwszej operacji tworzy raz na proces provider wybrany w `env` i przekazuje mu wywołania; `getObject` zwraca `null` dla brakującego obiektu, `deleteObject` nieistniejącego klucza nie rzuca. |
| `services/storage-env.ts` | `resolveStorageEnv(source, cwd)`, `DEFAULT_LOCAL_STORAGE_PATH` | Wybór providera, katalog `local` i reguły produkcyjne ([Provider storage](#provider)). |
| `services/local-storage.ts` | `createLocalStorage(root)`, `resolveObjectPath(root, key)`, `InvalidStorageKeyError` | Provider `local` i ochrona przed wyjściem poza katalog ([Provider storage](#provider-local)). |
| `services/s3-storage.ts` | `createS3Storage(config)` | Provider `s3`: klient S3 tworzony przy pierwszej operacji ([Zmienne S3](#zmienne-s3)). |
| `services/path-inside.ts` | `isPathInside(parent, child)` | Czy ścieżka leży w katalogu albo jest nim; czyta ją ochrona kluczy i reguła wolumenu Railway. |
| `services/content-disposition.ts` | `contentDisposition(fileName, disposition)` | Nagłówek `Content-Disposition`. |
| `contracts/upload.schemas.ts` | `uploadFormSchema` | Pola formularza. |
| `contracts/upload.types.ts` | `UploadResponse`, `CreateUploadResult`, `ApiOrgContextResult` | Typy odpowiedzi. |
| `contracts/storage.types.ts` | `ObjectStorage`, `StoredObject`, `StorageEnv`, `LocalStorageEnv`, `S3StorageEnv` | Wspólny interfejs providerów i kształt wyniku `resolveStorageEnv`, który mówi wprost, który provider wybrano. |
| `env.ts` | `envSchema`, `UploadsEnv` | Zmienne magazynu ([Provider storage](#provider), [Zmienne S3](#zmienne-s3), [nazwy zmiennych](#lista-zmiennych)). |

Moduł nie ma query w `services/queries/`: listę plików organizacji, jeśli jest potrzebna, pisze projekt z `getOrgContext()` i filtrem `organizationId`.

<a id="dostep"></a>

### Dostęp według ról

Wgrać plik może każdy członek aktywnej organizacji, także `member` (test „pozwala wgrać plik zwykłemu członkowi”), oraz superadmin w trybie serwisowym z potwierdzeniem. Usunąć: autor, role z uprawnieniem `uploads.delete-others` (domyślnie owner i admin organizacji), admin i superadmin globalny ([Usuwanie](#usuwanie)). Czytać: plik `public` każdy, plik `organization` każda sesja z aktywną organizacją pliku, bez względu na rolę. Moduł nie ma `roles` ani strony, więc nie dotyczy go `requireModuleAccess`; pełna macierz rdzenia: [04-auth-i-role.md](04-auth-i-role.md#macierz-dostepu).

Teksty modułu leżą pod namespace `uploads` w `src/features/uploads/i18n/pl.json` i `en.json`: etykiety akcji, etykieta pola „Wybierz plik” i trzy komunikaty błędów `<FileUpload>`.

<a id="szwy"></a>

## Szwy modułu

Szwy generowane ([12](12-moduly-kitu.md#szwy-generowane)):

| Szew | Co wpina `uploads` |
| --- | --- |
| `modules`, `clientModules` | `src/features/uploads/module.ts`; `listUploadPurposes()` czyta `modules`. |
| `moduleEnvSchemas` | `envSchema` z `src/features/uploads/env.ts`. |
| `moduleMessages` | `i18n/pl.json`, `i18n/en.json` pod kluczem `uploads`. |
| Region `wa:relations` | `uploads Upload[]` w `User` i w `Organization`. |
| Region `wa:modules` w `.env.example` | `STORAGE_PROVIDER=local`, `STORAGE_LOCAL_PATH=./volumes/uploads` i siedem zmiennych `S3_*` z wartościami lokalnego MinIO i pustym `S3_SESSION_TOKEN`. |
| Region `wa:services` w `docker-compose.yml` | Usługi `minio` i `minio-init` z profilem `s3` z `docker/uploads.compose.yml`. |
| Region `wa:ci-integration` w `ci.yml` i `mutation.yml` | Kroki „Start MinIO” i „Create MinIO bucket” z `ci/uploads.integration-steps.yml`. |
| `authPlugins`, `authClientPlugins`, `auditSinks` | Nic. |

Punkty wejścia z kontraktem: deklaracja `uploadPurposes` w `defineModule` (istnieje zawsze), komponent `<FileUpload>` ([kontrakt](#file-upload)) i komenda `deleteUploadCommand` ([kontrakt](#usuwanie)) (pliki modułu, istnieją tylko z modułem; bez modułu import kończy się `TS2307`, [15b](15b-modul-uploads-uzycie.md#bez-modulu)), `requestConfirmation()` z `useServiceModeAction` (rdzeń, z którego korzysta `<FileUpload>`) i zdarzenia dziennika przez `trackAudit` z rdzenia.

<a id="cel-uploadu"></a>

### Kontrakt celu uploadu (`uploadPurposes`)

`src/shared/lib/modules/define-module.ts`

```ts
export interface ModuleUploadPurpose {
  key: string;
  mimeTypes: readonly string[];
  maxBytes: number;
  visibility: "public" | "organization";
  resizeImage?: { maxWidth: number };
}
```

- **Kto deklaruje.** Moduł albo funkcja projektu, która przyjmuje pliki, we własnym `module.ts` ([przykład](15b-modul-uploads-uzycie.md#wlasny-cel)). Cel nie ma etykiety tłumaczenia.
- **Pola.** `key`: nazwa celu, unikalna w całym rejestrze, część klucza obiektu (używaj liter, cyfr i `-`). `mimeTypes`: typy, które wykrywa `file-type` z bajtów. `maxBytes`: limit pliku w bajtach. `visibility`: `"public"` albo `"organization"`, zapisana w rekordzie. `resizeImage`: zmniejszenie i konwersja obrazów do JPEG ([Obrazy](#obrazy)).
- **Kto czyta.** `listUploadPurposes()` z rejestru serwerowego `modules`, przy każdym wywołaniu od nowa: `resolveUploadPurpose` w kroku 8 zapisu i `maxUploadBytes()` w kroku 2. `<FileUpload>` nie czyta celów: dostaje sam klucz w `purpose`.
- **Kiedy działa.** Nowy `module.ts` wchodzi do rejestru po `npm run wa -- generate`; nowy cel w istniejącym `uploadPurposes` działa po przebudowaniu aplikacji, bez generatora.
- **Błędy deklaracji.** Powtórzony `key` (także w dwóch modułach) i typ z listy zakazanej (`image/svg+xml`, `text/html`, `application/xhtml+xml`, `application/xml`, `text/xml`) kończą się wyjątkiem `Duplicate upload purpose key: <key>` albo `Upload purpose <key> declares forbidden type <typ>` przy każdym odczycie celów. Typecheck i build przechodzą. W przebiegu drugi cel `editor-image` w module `deliveries` dał na zbudowanym serwerze 500 dla każdego `POST /api/uploads` z `Content-Length`, także bez sesji, i w logu `Error: Duplicate upload purpose key: editor-image`; żądanie bez `Content-Length` dostało 411 (sprawdzone, [D39](decyzje.md#d39)). `GET /api/uploads/<id>` celów nie czyta (wynika z kodu `read-upload.ts`; w tym przebiegu nie był wywoływany).
- **Typy bez sygnatury.** `text/plain`, `text/csv`, `application/json` i inne formaty tekstowe `file-type` nie rozpoznaje; cel, który je wymienia, odpowiada zawsze 415.
- **Zmiana celu.** Nowy limit, typy i widoczność dotyczą tylko nowych plików; rekordy mają widoczność z chwili zapisu. Cel usunięty z deklaracji: nowe pliki dostają 400 `unknown_purpose`, stare dalej się pobierają i usuwają.
- **Największy `maxBytes` ustawia limit trasy** dla wszystkich celów (krok 2 zapisu): cel 8 MB w funkcji projektu podnosi go z 5 MB + 64 KB do 8 MB + 64 KB (w przebiegu 8 454 144 B, sprawdzone).
- **Bez modułu `uploads`.** Nikt nie czyta pola: deklaracja przechodzi typecheck i nic nie robi ([12](12-moduly-kitu.md#punkty-wejscia)); działa po `wa add uploads`.

<a id="file-upload"></a>

### Kontrakt `<FileUpload>`

`src/features/uploads/components/file-upload.tsx`

```tsx
interface FileUploadProps {
  purpose: string;
  accept?: string;
  onUploaded: (upload: UploadResponse) => void;
}
```

- **Co podaje kod projektu.** `purpose`: klucz celu. `accept`: podpowiedź dla okna wyboru pliku (atrybut `accept` pola), bez wpływu na walidację serwera. `onUploaded`: wywołanie po odpowiedzi 201 z `{ id, url, fileName, mimeType, size }`.
- **Co robi.** Komponent kliencki. Po wyborze pliku czyści pole, woła `requestConfirmation()` (w trybie serwisowym dialog; „Anuluj” przerywa bez żądania), wysyła formularz `file`, `purpose` i ewentualnie `serviceModeConfirmation` przez `fetch` do `/api/uploads`. Przy 201 pokazuje podgląd `<img>` dla typu `image/*` i woła `onUploaded`. Przy 413 pokazuje „Plik jest za duży”, przy 415 „Nieobsługiwany typ pliku”, przy każdym innym kodzie i awarii sieci „Nie udało się przesłać pliku” (także przy 403 trybu serwisowego i 400 `invalid_image`); wtedy nie woła `onUploaded` i chowa podgląd. Komponent renderuje własny dialog trybu serwisowego.
- **Czego nie robi.** Nie blokuje pola w trakcie wysyłki, nie pokazuje postępu, nie usuwa poprzedniego pliku przy wyborze kolejnego i nie przyjmuje kilku plików naraz. Formularz, który chce zresetować komponent po zapisie, zmienia mu `key` ([przykład](15b-modul-uploads-uzycie.md#formularz)).
- **Bez modułu.** Import `@/features/uploads/components/file-upload` kończy się `TS2307` w typechecku i buildzie ([12](12-moduly-kitu.md#punkty-wejscia)); funkcja z tym komponentem wpisuje `uploads` do `requires`.

<a id="request-confirmation"></a>

### Potwierdzenie trybu serwisowego dla `fetch`

Upload nie jest akcją serwerową, więc `<FileUpload>` nie może użyć `run`. Korzysta z `requestConfirmation()` hooka rdzenia `useServiceModeAction` (`src/shared/components/service-mode/use-service-mode-action.tsx`): poza trybem serwisowym funkcja zwraca `undefined`, w trybie serwisowym pokazuje dialog i zwraca `null` po „Anuluj” albo `{ serviceModeConfirmed: true, organizationId }`. Trasa sprawdza potwierdzenie tak jak komenda: w trybie serwisowym bez niego zwraca 403, a potwierdzenie innej organizacji daje 403 także członkowi, którego karta jest nieaktualna po przełączeniu organizacji ([12](12-moduly-kitu.md#punkty-wejscia), [D22](decyzje.md#d22)). Superadmin w trybie serwisowym potwierdza więc dwa razy: przy wyborze pliku i przy zapisie formularza.

<a id="zdarzenia"></a>

### Zdarzenia dziennika

`createUpload` i `deleteUploadCommand` wołają `trackAudit` z `...auditActor(context)` po udanym zapisie ([kontrakt `trackAudit`](13-modul-audit-logs.md#trackaudit)):

| Akcja | `entityType`, `entityId` | Dane | Kiedy |
| --- | --- | --- | --- |
| `upload.created` | `upload`, id pliku | `newData: { purpose, key, size }` | Po zapisie obiektu i rekordu. |
| `upload.deleted` | `upload`, id pliku | `oldData: { purpose, key, size }` | Po usunięciu rekordu, także gdy obiektu nie udało się usunąć. |

Zdarzenia nie zawierają nazwy pliku. Mają kanał `WEB`; superadmin w trybie serwisowym zostawia wpis z `serviceMode: true`. Bez `audit-logs` wywołania nic nie zapisują.

Dalej: plik w funkcji projektu, bezpieczeństwo, testowanie, typowe problemy i referencja w [15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md).
