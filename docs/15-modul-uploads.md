# Moduł `uploads`: pliki organizacji w magazynie S3

Po przeczytaniu będziesz wiedzieć:

- jaki problem rozwiązuje `uploads`, czego nie robi i kiedy go nie dodawać;
- jak dodać i usunąć moduł, jak skonfigurować magazyn S3 lokalnie (MinIO), w CI i na produkcji oraz co zostaje w bazie i w buckecie po usunięciu;
- jak działają `POST /api/uploads` i `GET /api/uploads/<id>`: kolejność sprawdzeń, kody odpowiedzi, nagłówki `Cache-Control` i `Content-Disposition`;
- jaki kontrakt ma cel uploadu (`uploadPurposes`), komponent `<FileUpload>` i komenda `deleteUploadCommand` oraz co się dzieje bez modułu;
- skąd biorą się osierocone obiekty w buckecie i kiedy moduł cofa zapisany obiekt.

Zweryfikowano z kodem: d3710d3, 2026-10-30

Źródła:

- `kit/modules/uploads.json`, `kit/kit.json` (`placeholderFiles`)
- `prisma/schema/uploads.prisma`
- `docker/uploads.compose.yml`, `ci/uploads.integration-steps.yml`, `docker-compose.yml`, `.github/workflows/ci.yml`, `.github/workflows/kit.yml`
- `src/features/uploads/` (`module.ts`, `env.ts`, `components/`, `contracts/`, `services/`, `i18n/`) z testami w `__tests__/`, w tym `services/__tests__/storage.integration.test.ts`, `services/__tests__/read-upload.integration.test.ts` i `services/__tests__/uploads-isolation.integration.test.ts`
- `src/app/api/uploads/route.ts`, `src/app/api/uploads/[id]/route.ts` z testami w `__tests__/`
- `src/shared/lib/modules/define-module.ts`, `src/shared/lib/audit.ts`, `src/shared/lib/auth/service-mode.ts`, `src/shared/components/service-mode/use-service-mode-action.tsx`, `src/shared/utils/error-handling.ts`, `next.config.ts`
- `src/test/integration/setup-env.ts`, `e2e/env.ts`, `.env.example`
- `mutation-gate.json`
- [spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md), §7

Jak moduły kitu trafiają do projektu i łączą się z rdzeniem, wyjaśnia [12-moduly-kitu.md](12-moduly-kitu.md#warstwa-szwow); ten plik opisuje tylko `uploads`. Opis modułu ma dwie części: ten plik (co robi moduł, wymagania, instalacja i usunięcie, magazyn S3, co dodaje do aplikacji, szwy) i [15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md) (plik w funkcji projektu, bezpieczeństwo, testowanie, typowe problemy, referencja). Decyzje: [D39](decyzje.md#d39) (deklaracje w `defineModule`), [D44](decyzje.md#d44) (uploads), [D45](decyzje.md#d45) (region `wa:ci-integration`).

<a id="przebieg"></a>

„(sprawdzone)” znaczy tu, że zachowanie potwierdził przebieg z 2026-10-30: projekt `upload-demo` założony z tagu `v0.1.0` z GitHuba komendą `wa create --modules uploads --locales pl,en --yes`, z bazą w kontenerze Postgresa, z MinIO w osobnym kontenerze testowym na porcie 9100 (bucket `upload-demo-uploads` utworzony ręcznie, bez `docker compose up`) i z funkcją projektu `deliveries` (wpis w `projectModules`, `"requires": ["uploads"]`). Funkcja deklaruje cel `delivery-photo`, ma formularz z `<FileUpload>`, zapisuje `id` pliku w dostawie i ma test integracyjny na MinIO. Na końcu `npm run verify` i `npm run test:integration` były zielone; trasy wywołano też przez `curl` na zbudowanym serwerze (`node .next/standalone/server.js`, czyli z `NODE_ENV=production`) z sesją administratora. Fragmenty kodu z tego przebiegu mają nad blokiem ścieżkę pliku w projekcie `upload-demo` i dopisek „przykład z przebiegu”.

<a id="co-robi"></a>

## Co robi moduł i kiedy go nie dodawać

Funkcja projektu ma przyjmować pliki od użytkowników: zdjęcie dostawy, obraz w edytorze, załącznik. `uploads` przyjmuje plik przez `POST /api/uploads`, sprawdza go według **celu uploadu** (dozwolone typy, limit rozmiaru, widoczność, opcjonalne zmniejszenie obrazu), zapisuje obiekt w magazynie zgodnym z S3 i rekord w tabeli `uploads`, a potem wydaje plik przez `GET /api/uploads/<id>`. Funkcja projektu wstawia komponent `<FileUpload>` i zapisuje w swojej encji samo `id` pliku. Cele deklarują moduły w `module.ts`; kit ma jeden cel, `editor-image`.

Plik należy do organizacji. Widoczność celu decyduje, kto go pobierze: `public` każdy, kto zna adres, także bez logowania; `organization` tylko sesja, której aktywna organizacja jest organizacją pliku ([Pobieranie](#get)).

Czego moduł nie robi:

- **Nie ma strony ani menu.** `nav` i `routePrefixes` są puste; nie ma listy plików organizacji ani widoku do ich usuwania.
- **Nie sprząta osieroconych obiektów.** Plik wgrany, ale niezapisany w encji, plik encji usuniętej bez `deleteUploadCommand` i obiekty po `wa remove` zostają w buckecie ([Osierocone obiekty](#osierocone)).
- **Nie streamuje.** Trasa wczytuje cały plik do pamięci przy zapisie i przy odczycie; nie obsługuje nagłówka `Range` ani podpisanych adresów S3 (pliki zawsze idą przez serwer aplikacji).
- **Nie przyjmuje SVG, HTML ani XML** w żadnym celu ([Kontrakt celu](#cel-uploadu)) i nie przyjmuje formatów tekstowych bez sygnatury (`text/plain`, `text/csv`, `application/json`): typ pliku jest wykrywany z bajtów.
- **Nie ma klucza obcego do encji projektu.** Kolumna z `id` pliku w encji to zwykła kolumna; własność pliku sprawdza komenda projektu ([15b](15b-modul-uploads-uzycie.md#zapis-id)).
- **Nie skanuje plików** antywirusem i nie zmienia plików innych niż obrazy.

Nie dodawaj modułu, gdy projekt nie przyjmuje plików albo trzyma je poza aplikacją, gdy pliki są duże (wideo, archiwa): trasa trzyma cały plik w pamięci procesu, albo gdy nie masz magazynu zgodnego z S3 na produkcji.

<a id="wymagania"></a>

## Wymagania

| Co | `uploads` |
| --- | --- |
| Moduły kitu w `requires` | Brak. `audit-logs` nie jest wymagany; jeśli jest w projekcie, zapisuje zdarzenia plików ([Zdarzenia dziennika](#zdarzenia)). |
| Usługi | Magazyn zgodny z S3 z istniejącym bucketem. Lokalnie MinIO z `docker-compose.yml` ([MinIO lokalnie](#minio)), w CI kroki z regionu `wa:ci-integration` ([CI projektu](#ci)), na produkcji Railway Bucket albo Cloudflare R2 ([D44](decyzje.md#d44)). |
| Zmienne środowiskowe | `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` wymagane; `S3_REGION`, `S3_FORCE_PATH_STYLE` opcjonalne ([Zmienne S3](#zmienne-s3)). |
| Zależności npm | `@aws-sdk/client-s3`, `file-type`, `sharp` (`dependencies` manifestu). |
| Baza | Tabela `uploads` i typ `UploadVisibility`, czyli migracja po dodaniu modułu. |

<a id="instalacja"></a>

## Instalacja i usunięcie

**Nowy projekt.** Moduł wybierasz przy zakładaniu projektu ([16](16-cli-wa.md#wa-create)), na przykład:

```bash
KIT_DIR=$(mktemp -d) && git clone --depth 1 --branch v0.1.0 https://github.com/webamigos/wa-kit.git "$KIT_DIR" && node "$KIT_DIR/.wa/bin/wa.mjs" create acme-app --modules uploads
```

`wa create` wpisuje do `.env` i `.env.example` zmienne `S3_*` lokalnego MinIO z bucketem `<slug>-uploads` (w przebiegu `S3_BUCKET=upload-demo-uploads`), dodaje usługi `minio` i `minio-init` do `docker-compose.yml` i kroki MinIO do `.github/workflows/ci.yml`, w każdym miejscu z bucketem nazwanym od sluga (sprawdzone). Pierwsza migracja (`npx prisma migrate dev --name init`) tworzy tabelę `uploads` (sprawdzone). Potem `docker compose up -d` uruchamia bazę, mailpit i MinIO z bucketem ([01](01-uruchomienie.md#minio)).

**Istniejący projekt.** `npm run wa -- add uploads` kopiuje pliki modułu, wypełnia regiony `wa:relations` (`uploads Upload[]` w `User` i w `Organization`), `wa:modules` w `.env.example`, `wa:services` w `docker-compose.yml` i `wa:ci-integration` w `ci.yml`, uruchamia `wa generate` i `npm install` ([16](16-cli-wa.md#wa-add)). Potem:

1. Skopiuj zmienne `S3_*` z regionu `wa:modules` w `.env.example` do `.env`: `wa add` nie zmienia `.env`, a bez wymaganej zmiennej pierwszy odczyt `env` w całej aplikacji kończy się błędem `Nieprawidłowe zmienne środowiskowe: …` ([16](16-cli-wa.md#add-po)).
2. `docker compose up -d`, żeby uruchomić `minio` i utworzyć bucket.
3. Utwórz migrację: `npx prisma migrate dev --name add-uploads` przy działającej bazie i zacommituj ją ([03b](03b-schemat-i-migracje.md#migracje-w-projekcie)). Prisma 7 nie generuje przy tym klienta; po `--no-install` uruchom `npm run db:generate`.

<a id="zmienne-s3"></a>

### Zmienne S3

Schemat `src/features/uploads/env.ts` należy do walidacji `env` całej aplikacji ([07](07-i18n-mail-env.md#walidacja-env)): brak wymaganej zmiennej albo zła wartość psuje pierwszy odczyt `env` w każdej stronie i akcji, nie tylko upload ([10](10-wdrozenie.md#blad-env)).

| Zmienna | Reguła (`env.ts`) | Wartość lokalna z `wa create` |
| --- | --- | --- |
| `S3_ENDPOINT` | wymagana, adres URL | `http://localhost:9000` |
| `S3_REGION` | opcjonalna, niepusta; domyślnie `auto` | `auto` |
| `S3_ACCESS_KEY_ID` | wymagana, niepusta | `minioadmin` |
| `S3_SECRET_ACCESS_KEY` | wymagana, niepusta | `minioadmin` |
| `S3_BUCKET` | wymagana, niepusta | `<slug>-uploads` |
| `S3_FORCE_PATH_STYLE` | opcjonalna, `true` albo `false`; brak daje `false`; inna wartość to błąd walidacji | `true` |

- **Klient S3** (`services/storage.ts`) powstaje raz na proces, przy pierwszym zapisie albo odczycie, z sumami kontrolnymi tylko tam, gdzie wymaga ich API (`requestChecksumCalculation` i `responseChecksumValidation` równe `WHEN_REQUIRED`). Zmiana zmiennych wymaga restartu procesu.
- **`S3_FORCE_PATH_STYLE=true`** adresuje obiekty jako `endpoint/bucket/klucz`; z tą wartością `wa create` konfiguruje lokalny MinIO i z nią działał przebieg. Bez tej flagi klient S3 używa adresu z bucketem w nazwie hosta (`bucket.endpoint`).
- **Bucket musi istnieć.** Aplikacja go nie tworzy (żaden plik modułu nie wysyła `CreateBucket`); lokalnie tworzy go `minio-init`, w CI krok „Create MinIO bucket”, na produkcji ty w panelu magazynu przed pierwszym wdrożeniem ([10](10-wdrozenie.md#zmienne)).
- **Błąd magazynu nie wychodzi przy starcie.** Zła wartość endpointu, kluczy, regionu albo brak bucketu kończy się błędem przy pierwszym zapisie pliku (500 `storage_failed`) albo odczycie (500 z trasy `GET`), bo walidacja sprawdza tylko format zmiennych.
- Produkcja nie ma reguły odrzucającej wartości z `.env.example` (jak pepper w `api-keys`); `minioadmin` przejdzie walidację. Wartości na produkcję bierzesz z panelu magazynu.

<a id="minio"></a>

### MinIO lokalnie

`docker/uploads.compose.yml` trafia do regionu `wa:services` w `docker-compose.yml` jako dwie usługi:

| Usługa | Obraz | Porty | Co robi |
| --- | --- | --- | --- |
| `minio` | `cgr.dev/chainguard/minio:latest` przypięty przez digest `sha256:3b6e40c3…` | `${MINIO_PORT:-9000}:9000` (API S3), `${MINIO_CONSOLE_PORT:-9001}:9001` (konsola WWW) | Magazyn; użytkownik i hasło `minioadmin`; dane w `./volumes/minio`; działa jako `user: "0:0"`. |
| `minio-init` | `amazon/aws-cli:2.39.2` | brak | Do 30 razy co 2 sekundy sprawdza bucket `<slug>-uploads` i tworzy go, gdy go nie ma; potem kończy pracę (`restart: "no"`). |

Obraz Chainguard jest przypięty przez digest, bo bez opłat dostępny jest tylko tag `latest`; obrazy `minio/minio` i `minio/mc` nie są już do pobrania ([01](01-uruchomienie.md#minio)). Zajęty port 9000 zmieniasz razem w dwóch miejscach: `MINIO_PORT` w `.env` (czyta go Compose) i port w `S3_ENDPOINT` (czyta go aplikacja). W przebiegu MinIO działał na porcie 9100 z `S3_ENDPOINT=http://localhost:9100` i aplikacja zapisywała i czytała pliki (sprawdzone); samych usług z `docker-compose.yml` przebieg nie uruchamiał, więc ta tabela opisuje plik, a nie ich start.

<a id="ci"></a>

### CI projektu

Pole `ciSteps` manifestu wskazuje `ci/uploads.integration-steps.yml`, który `wa generate` wpisuje do regionu `# wa:ci-integration:start` / `# wa:ci-integration:end` w jobie `integration` pliku `.github/workflows/ci.yml` ([D45](decyzje.md#d45), [02b](02b-rejestr-i-generator.md#regiony)). Kroki „Start MinIO” (`docker run` tego samego obrazu, czekanie do 60 sekund na `/minio/health/live`) i „Create MinIO bucket” (`aws s3 mb s3://<slug>-uploads`) poprzedzają krok „Integration tests”. Plik jest w `placeholderFiles` kitu, więc w projekcie ma bucket od sluga: w `upload-demo` `s3://upload-demo-uploads` (sprawdzone w wygenerowanym `ci.yml`; workflow nie był uruchamiany w GitHub Actions). Testy integracyjne biorą wtedy domyślne `http://localhost:9000` i `<slug>-uploads` z `src/test/integration/setup-env.ts` ([Testowanie](15b-modul-uploads-uzycie.md#testowanie)).

`e2e.yml` nie ma tego regionu i nie uruchamia MinIO. Serwery e2e dostają zmienne `S3_*` z `e2e/env.ts` tylko po to, żeby przeszła walidacja `env`; testy e2e kitu nie wysyłają plików. CI kitu składa projekt z samym `uploads` i ze wszystkimi modułami (macierz `combo` w `.github/workflows/kit.yml`) i uruchamia dla nich MinIO własnymi krokami z bucketem `matrix-app-uploads` ([16b](16b-rozwoj-kitu.md#ci-kitu)).

<a id="usuniecie"></a>

### Usunięcie

`npm run wa -- remove uploads` odmawia, gdy moduł projektu ma `uploads` w `requires`: w przebiegu funkcja `deliveries` zablokowała usunięcie komunikatem `Moduł uploads jest wymagany przez: deliveries` (sprawdzone). Na kopii projektu bez funkcji `deliveries` `wa remove uploads --no-install` usunął pliki modułu, zmienne `S3_*` z `.env.example`, usługi `minio` i `minio-init` z `docker-compose.yml`, kroki MinIO z `ci.yml`, relacje z `auth.prisma` i `organizations.prisma` oraz `@aws-sdk/client-s3`, `file-type` i `sharp` z `package.json`, i wypisał `npx prisma migrate dev --name remove-uploads` (sprawdzone). Co zostaje ([16](16-cli-wa.md#remove-co-zostaje)):

| Co | Po `wa remove uploads` |
| --- | --- |
| Tabela `uploads` z rekordami plików | Zostaje z danymi, dopóki nie zastosujesz migracji `npx prisma migrate dev --name remove-uploads`, która ją usuwa. Wcześniej wypisz z niej klucze (`key`), jeśli chcesz posprzątać bucket. |
| Obiekty w buckecie | Zostają wszystkie. Ani `wa remove`, ani migracja ich nie usuwają; po usunięciu tabeli nie ma już listy kluczy ([Osierocone obiekty](#osierocone)). |
| Dane lokalnego MinIO (`volumes/minio`) i uruchomiony kontener `minio` | Zostają; kontener działa dalej jako osierocony, dopóki nie uruchomisz `docker compose up -d --remove-orphans`. |
| Zmienne `S3_*` w `.env` i w zmiennych produkcji | Zostają; znikają tylko z `.env.example`. Usuń je sam. |
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

Dalej manifest ma sześć zmiennych `S3_*` w `env` (wymagane wszystkie poza `S3_REGION` i `S3_FORCE_PATH_STYLE`; przykład bucketu `{{projectSlug}}-uploads`), relacje `uploads Upload[]` w `User` i `Organization`, `"compose": "docker/uploads.compose.yml"` i `"ciSteps": "ci/uploads.integration-steps.yml"`.

<a id="definicja-modulu"></a>

Definicja modułu (`src/features/uploads/module.ts`):

| Pole | Wartość | Skutek |
| --- | --- | --- |
| `key` | `uploads` | Namespace tłumaczeń (etykiety akcji i komunikaty `<FileUpload>`). |
| `nav`, `routePrefixes` | `[]` | Brak strony i pozycji menu. |
| `roles` | brak | Moduł nie ogranicza ról; trasy i komenda sprawdzają dostęp same ([Dostęp](#dostep)). |
| `auditActions` | `upload.created`, `upload.deleted` | Etykiety zdarzeń plików w dzienniku ([Zdarzenia](#zdarzenia)). |
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
| `key` | `key`, tekst, unikalne | Klucz obiektu w buckecie: `orgs/<organizationId>/<cel>/<id>.<rozszerzenie>`. |
| `fileName` | `file_name`, tekst | Nazwa pliku od klienta, bez zmian (1–255 znaków); po zmniejszeniu obrazu nadal z oryginalnym rozszerzeniem. |
| `mimeType` | `mime_type`, tekst | Typ zapisanego obiektu wykryty z bajtów (po zmniejszeniu `image/jpeg`). |
| `size` | `size`, `int` | Rozmiar zapisanego obiektu w bajtach (po zmniejszeniu). |
| `visibility` | `visibility`, `UploadVisibility` | `PUBLIC` albo `ORGANIZATION`, z celu w chwili zapisu. |
| `createdAt` | `created_at`, `timestamptz` | Czas zapisu. |

Indeks `(organizationId, createdAt)` i unikalny `key`. Zachowanie przy usuwaniu: **usunięcie organizacji** usuwa jej rekordy (`onDelete: Cascade`, test „usunięcie organizacji kasuje jej rekordy uploadów”), ale nie obiekty w buckecie; **usunięcie użytkownika** zostawia plik z `uploadedById` równym `null`, a wtedy usunąć go mogą tylko owner i admin organizacji oraz admin i superadmin globalny. Widoczność i limity są zapisane w rekordzie albo sprawdzone przy zapisie: zmiana celu w `module.ts` nie zmienia plików już wgranych.

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
| 13. Zapis obiektu w buckecie | 500 `{"error":"storage_failed"}`, bez rekordu |
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

**Cofnięcie obiektu przy błędzie rekordu.** Obiekt trafia do bucketu przed rekordem. Gdy zapis rekordu się nie uda, `createUpload` loguje `upload record create failed`, usuwa obiekt pod tym samym kluczem i zwraca 500 `storage_failed`; zdarzenie `upload.created` nie powstaje. Gdy usunięcie obiektu też się nie uda, błąd trafia tylko do logu jako `upload rollback failed` z polami `err` i `key`, odpowiedź jest ta sama, a obiekt zostaje w buckecie bez rekordu. Gdy nie uda się zapis obiektu, log ma `upload putObject failed`, a rekord nie powstaje. Te przypadki sprawdzają testy jednostkowe z atrapami Prismy i magazynu („usuwa obiekt z tym samym kluczem i zwraca 500, gdy zapis rekordu pada”, „zwraca 500 i loguje upload rollback failed…”); przebieg ich nie odtwarzał.

<a id="get"></a>

### Pobieranie: `GET /api/uploads/<id>`

`src/app/api/uploads/[id]/route.ts` woła `readUploadForDownload(id)` (`services/read-upload.ts`):

1. `id`, które nie jest UUID, daje 404 bez zapytania do bazy.
2. Brak rekordu daje 404.
3. Plik `ORGANIZATION`: brak sesji, sesja bez aktywnej organizacji, inna aktywna organizacja albo usunięte członkostwo dają 404, tak samo jak nieistniejący plik, więc odpowiedź nie zdradza, że plik istnieje. Kontekst bierze `getOrgContext()` z sesją czytaną z bazy (`disableCookieCache: true`), więc usunięcie członkostwa działa od następnego żądania. Superadmin w trybie serwisowym czyta pliki organizacji, w której jest.
4. Plik `PUBLIC` czyta każdy, bez sesji i z dowolną aktywną organizacją.
5. Brak obiektu w buckecie (`NoSuchKey`) daje 404; inny błąd magazynu daje 500.

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
- **`Content-Disposition`.** `contentDisposition` (`services/content-disposition.ts`) w `filename` zamienia na `_` znaki spoza ASCII 0x20–0x7E, cudzysłów, średnik i ukośnik odwrotny, więc nowa linia nie wejdzie do nagłówka; `filename*` koduje nazwę przez `encodeURIComponent` i dodatkowo zamienia apostrof na `%27`, więc litery, cyfry i `-_.!~*()` zostają bez kodowania; `*`, `(` i `)` nie należą do znaków dozwolonych w RFC 5987 (R24 w notatce rozbieżności). Plik `zdjęcie dostawy "A".png` dostał `filename="zdj_cie dostawy _A_.png"; filename*=UTF-8''zdj%C4%99cie%20dostawy%20%22A%22.png` (sprawdzone). Trasa zawsze używa `inline`, więc przeglądarka pokazuje obraz; pobranie wymusza atrybut `download` linku.
- **Piaskownica.** `sandbox; default-src 'none'` odbiera plikowi skrypty, formularze i zasoby zewnętrzne, także gdy przeglądarka otworzy go pod adresem aplikacji. Wbudowany podgląd PDF w przeglądarce może przez to nie działać.
- **Odpowiedź 404** nie ma nagłówków pliku ani `Content-Security-Policy` z trasy. Na zbudowanym serwerze miała `X-Content-Type-Options: nosniff` i inne nagłówki bezpieczeństwa, ale z `next.config.ts`, które dokłada je do każdej ścieżki (sprawdzone).

<a id="usuwanie"></a>

### Usuwanie: `deleteUploadCommand`

`deleteUploadCommand(input, confirmation?)` (`services/commands/upload-commands.ts`, `"use server"`) przyjmuje `{ id }`:

1. `getOrgContext()` i `assertServiceModeConfirmed(context, confirmation)`.
2. `id` musi być UUID; plik szuka się z filtrem `organizationId` aktywnej organizacji. Nieprawidłowe `id`, plik innej organizacji i plik nieistniejący dają ten sam błąd „Nie udało się usunąć pliku”.
3. Usunąć może autor (`uploadedById` równe użytkownikowi), owner i admin organizacji oraz admin i superadmin globalny; pozostali dostają „Brak uprawnień do usunięcia pliku” i nic nie jest usuwane.
4. Komenda usuwa obiekt z bucketu, potem rekord (z warunkiem `{ id, organizationId }`), potem woła `trackAudit` z `upload.deleted`. **Błąd usunięcia obiektu nie zatrzymuje komendy**: trafia do logu jako `upload deleteObject failed` z kluczem, rekord znika, a obiekt zostaje osierocony ([Osierocone obiekty](#osierocone)).
5. Drugie wywołanie dla tego samego `id` zwraca błąd i nie woła magazynu.

Komendę woła kod projektu przez `useServiceModeAction().run` albo z własnej komendy, która usuwa encję ([15b](15b-modul-uploads-uzycie.md#usuwanie-z-encja)).

<a id="osierocone"></a>

### Osierocone obiekty

Obiekt w buckecie bez rekordu albo rekord bez encji projektu powstaje, gdy:

| Sytuacja | Co zostaje |
| --- | --- |
| Użytkownik wgrał plik w formularzu i go nie zapisał (zamknął stronę, wybrał drugi plik) | Rekord i obiekt bez encji. `<FileUpload>` zapisuje plik od razu po wyborze, przed wysłaniem formularza. |
| Encja projektu usunięta bez `deleteUploadCommand` | Rekord i obiekt. |
| `deleteUploadCommand` nie usunął obiektu z magazynu | Obiekt bez rekordu (log `upload deleteObject failed`). |
| Cofnięcie przy błędzie rekordu nie usunęło obiektu | Obiekt bez rekordu (log `upload rollback failed`). |
| Usunięcie organizacji | Obiekty pod `orgs/<organizationId>/`; rekordy znikają kaskadowo. |
| `wa remove uploads` i migracja usuwająca tabelę | Wszystkie obiekty. |

Moduł nie ma zadania, które to sprząta ([D44](decyzje.md#d44), [znane-ograniczenia.md](znane-ograniczenia.md#bez-sprzatania)). Obiekty bez rekordu znajdziesz, porównując klucze w buckecie z kolumną `key`; prefiks `orgs/<organizationId>/<cel>/` pozwala zawęzić porównanie do organizacji i celu.

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
| `services/storage.ts` | `putObject`, `getObject`, `deleteObject` | Klient S3; `getObject` zwraca `null` dla `NoSuchKey`, `deleteObject` nieistniejącego klucza nie rzuca. |
| `services/content-disposition.ts` | `contentDisposition(fileName, disposition)` | Nagłówek `Content-Disposition`. |
| `contracts/upload.schemas.ts` | `uploadFormSchema` | Pola formularza. |
| `contracts/upload.types.ts` | `UploadResponse`, `CreateUploadResult`, `ApiOrgContextResult` | Typy odpowiedzi. |
| `env.ts` | `envSchema`, `UploadsEnv` | Zmienne S3 ([Zmienne S3](#zmienne-s3)). |

Moduł nie ma query w `services/queries/`: listę plików organizacji, jeśli jest potrzebna, pisze projekt z `getOrgContext()` i filtrem `organizationId`.

<a id="dostep"></a>

### Dostęp według ról

Wgrać plik może każdy członek aktywnej organizacji, także `member` (test „pozwala wgrać plik zwykłemu członkowi”), oraz superadmin w trybie serwisowym z potwierdzeniem. Usunąć: autor, owner i admin organizacji, admin i superadmin globalny ([Usuwanie](#usuwanie)). Czytać: plik `public` każdy, plik `organization` każda sesja z aktywną organizacją pliku, bez względu na rolę. Moduł nie ma `roles` ani strony, więc nie dotyczy go `requireModuleAccess`; pełna macierz rdzenia: [04-auth-i-role.md](04-auth-i-role.md#macierz-dostepu).

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
| Region `wa:modules` w `.env.example` | Sześć zmiennych `S3_*` z wartościami lokalnymi. |
| Region `wa:services` w `docker-compose.yml` | Usługi `minio` i `minio-init` z `docker/uploads.compose.yml`. |
| Region `wa:ci-integration` w `ci.yml` | Kroki „Start MinIO” i „Create MinIO bucket” z `ci/uploads.integration-steps.yml`. |
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
