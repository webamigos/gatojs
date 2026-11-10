# Rozwój kitu: manifesty, CLI, CI i wydanie

Po przeczytaniu będziesz wiedzieć:

- które pliki są tylko w repozytorium kitu i co opisują `kit/kit.json` oraz manifesty `kit/modules/<x>.json`;
- jak `wa kit sync` utrzymuje `.wa/kit.json` kitu w zgodzie z manifestami i co sprawdza test własności plików i zależności;
- jak CLI liczy hashe plików projektu i podmienia placeholdery;
- jak zmienić kod CLI: bundel, bramka CLI, mutacje i workflowy kitu;
- jak wydać nową wersję kitu z tagiem;
- jak dodać do kitu nowy moduł, krok po kroku, tak jak zrobił to plan 3.

Zweryfikowano z kodem: 734391b, 2026-11-04

Źródła:

- `kit/kit.json`
- `kit/modules/core.json`, `kit/modules/audit-logs.json`, `kit/modules/api-keys.json`, `kit/modules/uploads.json`
- `kit/CLAUDE.md`
- `kit/README.md`
- `kit/cli/package.json`
- `kit/cli/bundle.mjs`
- `kit/cli/eslint.config.mjs`
- `kit/cli/stryker.config.json`
- `kit/cli/mutation-gate.json`
- `kit/cli/vitest.config.ts`
- `kit/cli/vitest.setup.ts`
- `kit/cli/src/commands/kit-sync.ts`
- `kit/cli/src/kit/` (`kit-config.ts`, `files.ts`, `ownership.ts`, `source.ts`)
- `kit/cli/src/assemble/` (`hash.ts`, `placeholders.ts`, `package-json.ts`, `copy.ts`)
- `kit/cli/src/generate/targets.ts`
- `kit/cli/src/manifest/schema.ts`
- `kit/cli/src/kit/__tests__/ownership.test.ts`
- `kit/cli/src/__tests__/fixtures/project-module/`
- `scripts/mutation-gate.ts`
- `src/instrumentation.ts`, `e2e/env.ts`, `src/test/integration/setup-env.ts`, `Dockerfile`, `docker/uploads.compose.yml`
- `.wa/kit.json`
- `.github/workflows/kit.yml`
- `.github/workflows/kit-mutation.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/security-audit.yml`
- `.dockerignore`
- `.gitignore`
- `.prettierignore`
- `eslint.config.mjs`
- `vitest.config.ts`
- `tsconfig.json`
- commity planu 3: `git log --oneline 5b2d308..76ca2d7`

Ten plik jest dla osoby, która zmienia samo repozytorium kitu: kod CLI, manifesty modułów, workflowy kitu albo jego wersję. Użycie CLI w projekcie opisuje [16-cli-wa.md](16-cli-wa.md), a `wa generate` i pola manifestu [02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#referencja-manifest). Jak moduł po skopiowaniu łączy się z aplikacją, wyjaśnia [12-moduly-kitu.md](12-moduly-kitu.md). Reguły pracy nad plikami kitu są w [kit/CLAUDE.md](../kit/CLAUDE.md); ten plik je wyjaśnia, ale ich nie zastępuje.

„(sprawdzone)” znaczy tu, że zachowanie potwierdził przebieg z 2026-10-30 na kopii repozytorium z commita `758b557`, sklonowanej do katalogu tymczasowego (`git clone` worktree, osobne `npm ci --prefix kit/cli`), albo w samym worktree tam, gdzie przebieg niczego nie zmienia (`kit sync`, `generate`, bramka CLI). Projekty próbne powstały komendą `node .wa/bin/wa.mjs create <katalog> --yes` z kopii, bez Dockera.

<a id="kit-a-projekt"></a>

## Kit a projekt: co jest tylko w kicie

Repozytorium kitu to działająca aplikacja referencyjna: rdzeń i wszystkie moduły kitu w katalogu głównym, z takim samym układem katalogów jak projekt klienta ([D38](decyzje.md#d38)). `.wa/kit.json` kitu wymienia więc wszystkie cztery moduły: `core`, `audit-logs`, `api-keys` i `uploads`. Do tego dochodzą pliki, które nie trafiają do żadnego projektu. Wskazują je wzorce `kitOnly`:

`kit/kit.json`

```json
  "kitOnly": [
    "kit/**",
    "docs/**",
    ".superpowers/**",
    ".claude/handoffs/**",
    ".wa/kit.json",
    ".github/workflows/kit.yml",
    ".github/workflows/kit-mutation.yml",
    "prisma/migrations/.gitignore"
  ],
```

| Plik albo katalog | Rola w kicie |
| --- | --- |
| `kit/kit.json` | Konfiguracja kitu: wersja, adres repozytorium, pliki tylko dla kitu, placeholdery, pliki generowane i zarządzane ([Referencja](#referencja-kit-json)). |
| `kit/modules/<x>.json` | Manifest modułu kitu: pliki, zależności npm, zmienne, relacje, usługa Dockera, kroki CI, wymagane moduły ([Manifesty](#manifesty)). |
| `kit/cli/` | Kod źródłowy CLI z własnym `package.json`, `package-lock.json`, testami, konfiguracją ESLint i Strykera ([D28](decyzje.md#d28)). |
| `kit/README.md`, `kit/CLAUDE.md` | Opis CLI dla użytkowników i reguły pracy nad plikami kitu. |
| `.wa/kit.json` | Stan kitu przepisany z manifestów przez `wa kit sync` ([niżej](#kit-sync)). Projekt dostaje własny `.wa/kit.json`, zapisany przez `wa create`. |
| `.github/workflows/kit.yml`, `.github/workflows/kit-mutation.yml` | Bramka CLI, składanie projektów z kitu i ręczny przebieg mutacji CLI ([CI kitu](#ci-kitu)). |
| `prisma/migrations/.gitignore` | Ignoruje migracje: kit ich nie commituje, projekt commituje własne ([D13](decyzje.md#d13)). |
| `docs/` | Ta dokumentacja. |
| `.superpowers/**`, `.claude/handoffs/**` | Notatki procesu pracy nad kitem. |

Narzędzia aplikacji pomijają `kit/`: ESLint (`kit/**` w `globalIgnores` w `eslint.config.mjs`), Vitest (`exclude` w `vitest.config.ts`), TypeScript (`exclude` w `tsconfig.json`) i obraz Dockera (`kit` i `docs` w `.dockerignore`). Raporty i katalog roboczy Strykera CLI wyklucza z repozytorium `.gitignore`:

`.gitignore`

```text
kit/cli/reports/
kit/cli/.stryker-tmp/
```

Te wpisy leżą w plikach `core` (`.gitignore`, `.dockerignore`, `eslint.config.mjs`, `vitest.config.ts`, `tsconfig.json`), więc trafiają też do projektów, gdzie nic nie wskazują. Dlatego `npm run verify` w katalogu głównym nie sprawdza kodu CLI; robi to bramka CLI ([Bramka CLI](#bramka-cli)).

W drugą stronę reguła nie działa: workflowy rdzenia (`ci.yml`, `e2e.yml`, `mutation.yml`, `security-audit.yml`, `security-secret-scan.yml`, `workflow-lint.yml`) należą do `core`, więc trafiają do projektów i działają też w repozytorium kitu, na aplikacji referencyjnej ze wszystkimi modułami. Na przykład region `wa:ci-integration` w `ci.yml` kitu zawiera kroki MinIO modułu `uploads`.

<a id="manifesty"></a>

## Manifesty modułów

Każdy moduł kitu ma plik `kit/modules/<nazwa>.json`. Pole `name` musi być równe nazwie pliku, inaczej odczyt manifestów kończy się błędem `kit/modules/<plik>: name "<name>" nie zgadza się z nazwą pliku` (`readKitManifests` w `kit/cli/src/kit/kit-config.ts`). Manifesty są czytane w kolejności: `core`, potem pozostałe alfabetycznie (`compareModuleNames`). Schemat (`moduleManifestSchema` w `kit/cli/src/manifest/schema.ts`) jest ten sam co w `.wa/kit.json` projektu; pełną listę pól z typami i wartościami domyślnymi podaje [02b](02b-rejestr-i-generator.md#referencja-manifest).

Manifesty w repozytorium kitu (`version` w `kit/kit.json`: `0.1.0`). Tag `v0.1.0` ma starsze wersje dwóch z nich: `core` `0.4.0` i `uploads` `0.1.0`, bo `core` `0.5.0` ([D48](decyzje.md#d48)) i `uploads` `0.2.0` ([D49](decyzje.md#d49)) przyszły po tagu, a wersja kitu się nie zmieniła:

| Moduł | `version` | `files` | Zależności npm | `env` | `compose` | `ciSteps` |
| --- | --- | --- | --- | --- | --- | --- |
| `core` | `0.5.0` | wszystkie pliki rdzenia, od `.claude/agents/test-reviewer.md` po `src/types/**`, w tym `.wa/bin/wa.mjs` | wszystkie zależności rdzenia | — | — | — |
| `audit-logs` | `0.1.0` | `prisma/schema/audit-logs.prisma`, `src/features/audit-logs/**`, `src/app/[locale]/(app)/audit-log/**` | `better-call` w `devDependencies` | — | — | — |
| `api-keys` | `0.1.0` | `prisma/schema/api-keys.prisma`, `src/features/api-keys/**`, `src/app/api/v1/organization/**`, `src/app/[locale]/(app)/api-keys/**` | — | `API_KEY_PEPPER` | — | — |
| `uploads` | `0.2.0` | `prisma/schema/uploads.prisma`, `src/features/uploads/**`, `src/app/api/uploads/**`, `docker/uploads.compose.yml`, `ci/uploads.integration-steps.yml` | `@aws-sdk/client-s3`, `file-type`, `sharp` | `STORAGE_PROVIDER`, `STORAGE_LOCAL_PATH`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`, wszystkie z `required: false` | `docker/uploads.compose.yml` | `ci/uploads.integration-steps.yml` |

Żaden z modułów nie ma `requires`. Co każdy moduł robi, opisuje [12-moduly-kitu.md](12-moduly-kitu.md).

Pola manifestu czytają różne części CLI:

| Pole | Kto czyta | Do czego |
| --- | --- | --- |
| `name`, `description`, `version` | `create`, `add`, `list`, `kit sync` | Nazwa w `--modules` i w `wa add`, opis w pytaniu `create` i w `wa list`, wersja zapisana w `.wa/kit.json` projektu. |
| `requires` | `create`, `add` (`resolveModules`), `remove`, `list`, `readKitState` | Moduły dodawane razem z modułem; odmowa usunięcia modułu, którego ktoś wymaga; dopisek `(wymaga: …)` w `wa list`; sprawdzenie, że moduły wymagane przez moduł projektu są zainstalowane. |
| `files` | `create`, `add`, test własności, `generate`, `readKitState` | Które pliki kopiować; własność plików; wykrywanie feature po wzorcach `src/features/<x>/…` ([02b](02b-rejestr-i-generator.md#wykrywanie-feature)). `wa remove` nie czyta wzorców, tylko listę plików z hashami w stanie projektu. |
| `dependencies`, `devDependencies` | `create`, `add`, `remove`, test własności | Zależności dopisywane do `package.json` projektu i usuwane z niego ([D30](decyzje.md#d30)). |
| `env` | `generate` | Region `wa:modules` w `.env.example`: `name` i `example`. Pola `required` nie czyta żaden kod CLI; wymagalność zmiennej ustala schemat `env.ts` feature. |
| `schemaRelations` | `generate` | Regiony `wa:relations` w `auth.prisma` (`User`) i `organizations.prisma` (`Organization`). |
| `compose` | `generate`, test własności | Region `wa:services` w `docker-compose.yml`. |
| `ciSteps` | `generate` | Region `wa:ci-integration` w `.github/workflows/ci.yml` ([D45](decyzje.md#d45)). |
| `workspaces` | nikt | Pole istnieje w schemacie; żadna komenda go nie czyta ([D29](decyzje.md#d29)). |

<a id="wzorce"></a>

### Wzorce `files` i lista plików kitu

Wzorce w `files` znają tylko `**/` (zero albo więcej katalogów), `**` (dowolne znaki, także `/`) i `*` (dowolne znaki poza `/`). Pozostałe znaki, w tym `[locale]` i `(app)`, są dosłowne (`globToRegExp` w `kit/cli/src/kit/files.ts`). Nawiasów klamrowych nie ma: wzorzec `src/features/{a,b}/**` test własności zgłasza jako błąd, a generator go pomija.

Wzorce są dopasowywane do listy plików z indeksu gita (`git ls-files` w `listKitFiles`), bez plików z `kitOnly` i `generatedFiles` (`assemblableFiles`). Treść pliku CLI czyta jednak z drzewa roboczego (`copyFiles` w `kit/cli/src/assemble/copy.ts`). Przy pracy nad kitem wynikają z tego dwie rzeczy (sprawdzone na kopii: `create --modules api-keys` po dopisaniu linii do `src/features/api-keys/env.ts` i po utworzeniu nowego pliku w `src/features/api-keys/`):

- niezacommitowana zmiana pliku śledzonego trafia do projektu złożonego z twojego klonu;
- nowy plik przed `git add` nie trafia do projektu i nie widzi go test własności ([niżej](#wlasnosc)).

Job `assemble` w CI składa projekt z checkoutu commita, więc tam obie listy się pokrywają.

<a id="pliki-uslug-i-ci"></a>

### Pliki `docker/` i `ci/` modułu

Pola `compose` i `ciSteps` wskazują pliki, które generator czyta z katalogu projektu (`composeBody` i `ciStepsBody` w `kit/cli/src/generate/targets.ts`). Plik musi więc trafić do projektu razem z modułem, czyli należeć do `files` tego samego modułu. Moduł `uploads` trzyma je w katalogach `docker/` i `ci/` z nazwą modułu w nazwie pliku:

- `docker/uploads.compose.yml`: definicje usług (`minio`, `minio-init`) bez klucza `services:`, bo generator wcina treść o dwie spacje i wstawia ją pod `services:` w regionie `wa:services` w `docker-compose.yml`. Obie usługi mają `profiles: ["s3"]` zaraz pod `image:`, więc `docker compose up -d` ich nie uruchamia, a `docker compose --profile s3 up -d` je uruchamia ([15](15-modul-uploads.md#minio)). Profil trafia do `docker-compose.yml` razem z resztą fragmentu:

  `docker/uploads.compose.yml`

  ```yaml
  minio:
    image: cgr.dev/chainguard/minio:latest@sha256:3b6e40c30ecd5cea627e382ff0b82ca841f58c52294578787043ee80c8ef7c82
    profiles: ["s3"]
    restart: always
  # …
  minio-init:
    image: amazon/aws-cli:2.39.2
    profiles: ["s3"]
  # …
  ```

- `ci/uploads.integration-steps.yml`: lista kroków joba (`- name: …`), którą generator wcina o sześć spacji i wstawia w regionie `wa:ci-integration` joba `integration` w `.github/workflows/ci.yml`; fragmenty kilku modułów oddziela pusta linia.

Test własności sprawdza tylko plik z `compose` (`composeOutsideModule`); pliku z `ciSteps` nie sprawdza (R6 w [notatce rozbieżności części 2](superpowers/notes/2026-10-30-docs-part-2-discrepancies.md)). Na kopii kitu `ciSteps` modułu `uploads` przestawione na plik dopisany do `kitOnly` przeszło test własności, a `create --modules uploads` skończyło się błędem `ENOENT: no such file or directory, open '<projekt>/ci/other.yml'` i usunięciem katalogu projektu (sprawdzone). Plik kroków CI zawsze dopisuj do `files` modułu, którego dotyczy.

Oba pliki `uploads` zawierają nazwę bucketu `wa-app-uploads`, dlatego są na liście `placeholderFiles` ([Placeholdery](#placeholdery)).

<a id="kit-sync"></a>

## `.wa/kit.json` kitu i `wa kit sync`

Ten plik w kicie nie jest edytowany ręcznie. Przepisuje go komenda:

```bash
npm run wa -- kit sync
```

`kitSync` w `kit/cli/src/commands/kit-sync.ts` buduje stan z `kit/kit.json` i manifestów:

| Pole `.wa/kit.json` | Skąd |
| --- | --- |
| `kitVersion`, `kitRepo` | `version` i `repo` z `kit/kit.json` |
| `project` | placeholdery `projectName` i `projectSlug` (`WA App`, `wa-app`) |
| `locales` | zawsze `["pl", "en"]` |
| `modules` | każdy manifest z `kit/modules/`: `version` z manifestu, cały manifest i puste `files` |
| `projectModules` | bez zmian z dotychczasowego pliku (pusty obiekt, gdy pliku nie było) |

Manifest usunięty z `kit/modules/` znika z `modules`. Komenda zawsze zapisuje plik, a potem porównuje go z poprzednią treścią i wypisuje `Zaktualizowano .wa/kit.json` albo `Bez zmian` (sprawdzone: na `758b557` `Bez zmian`, po zmianie manifestu na kopii `Zaktualizowano .wa/kit.json`). Poza repozytorium kitu kończy się błędem `Brak kit/kit.json w <katalog> — to nie jest repozytorium wa-kit` i kodem 1 (sprawdzone w projekcie próbnym).

`kit sync` nie uruchamia generatora. Po każdej zmianie w `kit/modules/*.json` albo w `kit/kit.json` uruchom więc obie komendy i zacommituj wynik:

```bash
npm run wa -- kit sync
npm run wa -- generate
```

Generator dopisuje nowe feature do rejestru i przepisuje regiony `wa:*` w plikach kitu ([02b](02b-rejestr-i-generator.md#wa-generate)). Job `cli` w `kit.yml` uruchamia te same dwie komendy i pada, gdy wynik różni się od zacommitowanego ([CI kitu](#ci-kitu)).

<a id="wlasnosc"></a>

## Własność plików i zależności

Każdy plik kitu, który może trafić do projektu, ma dokładnie jednego właściciela: moduł, którego wzorzec `files` go obejmuje. Bez tego `wa create` pominąłby plik albo skopiował go z dwóch modułów, a `wa remove` usunąłby plik potrzebny innemu modułowi. Każda zależność npm z `package.json` kitu musi mieć manifest, który deklaruje ją w tej samej sekcji i w tej samej wersji ([D30](decyzje.md#d30), [D38](decyzje.md#d38)).

Pilnuje tego test „każdy plik i każda zależność ma dokładnie jednego właściciela” w `kit/cli/src/kit/__tests__/ownership.test.ts`. Uruchamia `checkOwnership` (`kit/cli/src/kit/ownership.ts`) na samym repozytorium kitu, nie na kopii (korzeń szuka po `kit/kit.json` i `kit/cli/package.json` w górę od pliku testu) i oczekuje pustego raportu. Pozostałe testy w tym pliku sprawdzają `checkOwnership` na fiksturach `ownership-broken`, `ownership-order` i `ownership-sections`.

Pojedynczo uruchomisz test tak:

```bash
npm ci --prefix kit/cli
cd kit/cli && npx vitest run src/kit/__tests__/ownership.test.ts
```

Na `758b557` przechodzi 16 testów (sprawdzone).

| Pole raportu | Co oznacza | Co zrobić |
| --- | --- | --- |
| `unowned` | Plik z indeksu gita, spoza `kitOnly` i `generatedFiles`, którego nie obejmuje żaden manifest. | Dopisz wzorzec do manifestu modułu, do którego plik należy, albo do `kitOnly`, jeśli plik jest tylko dla kitu. |
| `multiOwned` | Plik objęty wzorcami dwóch modułów. | Zawęź wzorce, żeby plik należał do jednego modułu. |
| `globErrors`, `reason: "empty"` | Wzorzec, który nie pasuje do żadnego pliku. | Popraw literówkę albo usuń wzorzec. Wzorca „na zapas” w manifeście kitu nie ma. |
| `globErrors`, `reason: "brace"` | Wzorzec z `{`. | Rozbij go na osobne wzorce. |
| `unownedDependencies` | Zależność z `package.json`, której żaden manifest nie deklaruje w tej sekcji. | Dopisz ją do manifestu właściciela. |
| `dependencyMismatch` | Zależność manifestu w innej wersji niż w `package.json` albo nieobecna w nim (`<brak>`). | Ustaw w obu miejscach tę samą wersję. |
| `composeOutsideModule` | Plik z pola `compose` nie należy do plików tego modułu. | Dopisz plik do `files` modułu. |

Granice testu:

- **Widzi tylko indeks gita.** Nowy plik bez właściciela przed `git add` jest niewidoczny i test przechodzi; po `git add` test zgłasza go w `unowned` (sprawdzone na kopii z nowym plikiem w nowym katalogu feature). Uruchamiaj test po `git add`, przed commitem.
- **Nie liczy właścicieli zależności.** Ta sama zależność w dwóch manifestach, w tej samej sekcji i wersji, przechodzi test mimo jego nazwy (sprawdzone na kopii: `zod` dopisany do `dependencies` `audit-logs` obok `core`). `wa remove` takiego modułu zostawia zależność, dopóki deklaruje ją inny moduł. R10 w [notatce rozbieżności części 2](superpowers/notes/2026-10-30-docs-part-2-discrepancies.md).
- **Nie sprawdza `ciSteps`** ([wyżej](#pliki-uslug-i-ci)).
- **Nie trafia do projektu.** Test leży w `kit/cli`; w projekcie klienta nic nie pilnuje kompletności manifestów.

Praktyczna konsekwencja: aktualizacja zależności w kicie to dwie zmiany, w `package.json` (z lockfile) i w manifeście właściciela. Test nie pozwala zapomnieć o drugiej.

<a id="hashe"></a>

## Hashe plików w projekcie

`wa create` i `wa add` zapisują w `.wa/kit.json` projektu, pod `modules.<nazwa>.files`, wartość dla każdego skopiowanego pliku. `wa remove` porównuje ją z plikiem na dysku, żeby nie usunąć pliku zmienionego lokalnie ([16](16-cli-wa.md#wa-remove), [D31](decyzje.md#d31)). Wartość liczy `fileHash` (`kit/cli/src/assemble/hash.ts`) z treści zapisanej w projekcie, czyli już po podmianie placeholderów:

| Rodzaj pliku | Wartość w `files` |
| --- | --- |
| plik z `managedFiles` w `kit/kit.json` (`package.json`, `package-lock.json`) | napis `managed` |
| plik z `REGION_FILES`: `.env.example`, `.github/workflows/ci.yml`, `docker-compose.yml`, `prisma/schema/auth.prisma`, `prisma/schema/organizations.prisma` | SHA-256 treści bez linii między markerami `wa:<nazwa>:start` i `wa:<nazwa>:end` (`stripRegions`) |
| każdy inny plik | SHA-256 bajtów pliku |

W projekcie `acme-app` ze wszystkimi modułami hash `docker/uploads.compose.yml` w `.wa/kit.json` jest równy SHA-256 pliku z `acme-app-uploads`, a hash `.env.example` jest równy SHA-256 treści bez linii regionu `wa:modules` (sprawdzone).

- `REGION_FILES` powstaje z listy `regionTargets` w `kit/cli/src/generate/targets.ts`. Nowy region w nowym pliku to zmiana w CLI, a nie w manifeście. Wszystkie pliki z regionami należą do `core`.
- Region, który ma linię startu bez linii końca, zostaje w hashu w całości.
- Pliki generowane (`generatedFiles`) nie są kopiowane, nie mają właściciela ani hasha; odtwarza je generator.
- W `.wa/kit.json` kitu `files` każdego modułu jest puste.

<a id="placeholdery"></a>

## Placeholdery

Kit to działająca aplikacja o nazwie „WA App”. Przy kopiowaniu pliku z listy `placeholderFiles` CLI zamienia jej nazwy na nazwy projektu (`applyPlaceholders` w `kit/cli/src/assemble/placeholders.ts`, [D32](decyzje.md#d32)):

| Placeholder w kicie | Zamieniany na | Dla `acme-app` |
| --- | --- | --- |
| `WA App` | nazwa wyświetlana | `Acme App` |
| `wa-app` | slug | `acme-app` |
| `wa_app` | slug z `_` zamiast `-` | `acme_app` |

Zamiana to dosłowna podmiana napisów, w tej kolejności, bez składni szablonów. Lista `placeholderFiles` to dokładne ścieżki, nie wzorce:

`kit/kit.json`

```json
  "placeholderFiles": [
    "src/shared/config/project.ts",
    "package.json",
    "docker-compose.yml",
    ".env.example",
    "e2e/env.ts",
    ".github/workflows/e2e.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/mutation.yml",
    "src/test/integration/database-url.ts",
    "README.md",
    "docker/uploads.compose.yml",
    "ci/uploads.integration-steps.yml"
  ],
```

Reguły dla osoby, która dodaje plik do kitu:

- Plik, który zawiera nazwę projektu, slug albo nazwę bazy, dopisz do `placeholderFiles`. Inaczej trafi do projektu z `wa_app` i na przykład kilka projektów na jednej maszynie użyje tej samej bazy testowej `wa_app_test`.
- W pliku z listy nie używaj tych napisów w innym znaczeniu: zostaną podmienione.
- Testów nie dopisuj do listy. To tylko konwencja, kod jej nie sprawdza (R7 w [notatce rozbieżności części 2](superpowers/notes/2026-10-30-docs-part-2-discrepancies.md)). Plan 3 dopisał na chwilę dwa testy `uploads` i wycofał je w następnym commicie (`c6c26c4`, `76b5956`).

Job `assemble` w `kit.yml` sprawdza w złożonym projekcie, że poza testami (`**/__tests__/**`, `**/*.test.*`), `package-lock.json` i `.wa/bin/**` nie został żaden z trzech napisów (krok „No placeholders left in the project”). Ten sam `git grep` w projekcie `acme-app` złożonym ze wszystkimi modułami nie znalazł nic (kod 1, sprawdzone).

Osobny mechanizm działa w generatorze: w polu `example` wpisu `env` manifestu napisy `{{projectSlug}}` i `{{projectName}}` są zamieniane na slug i nazwę z `.wa/kit.json` przy każdym `wa generate` (`fillPlaceholders` w `kit/cli/src/generate/targets.ts`). `S3_BUCKET` modułu `uploads` ma przykład `{{projectSlug}}-uploads`, więc w kicie region `wa:modules` zawiera `S3_BUCKET=wa-app-uploads`, a w projekcie `acme-app` `S3_BUCKET=acme-app-uploads` (sprawdzone).

<a id="bundel"></a>

## Bundel CLI

Kod CLI leży w `kit/cli/src`, ale kit i projekty uruchamiają jeden plik `.wa/bin/wa.mjs`, zbudowany esbuildem i zacommitowany ([D28](decyzje.md#d28)):

`kit/cli/bundle.mjs`

```js
await build({
  entryPoints: ["src/bin.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: { js: "#!/usr/bin/env node" },
  outfile: "../../.wa/bin/wa.mjs",
  legalComments: "none",
});
```

Bundel zawiera kod wszystkich zależności CLI (jedyna zależność produkcyjna `kit/cli` to `zod`), więc projekt nie potrzebuje ani `kit/cli`, ani jego `node_modules`. Należy do `core` (wzorzec `.wa/bin/wa.mjs` w `kit/modules/core.json`), dlatego trafia do każdego projektu bajt w bajt (sprawdzone porównaniem z projektem próbnym). Jest w `.prettierignore` (`.wa/bin`) i w ignorach ESLint (`.wa/**`).

Po każdej zmianie w `kit/cli/src`:

```bash
npm run build --prefix kit/cli
```

`build` uruchamia typecheck i `bundle.mjs`. Zacommituj `.wa/bin/wa.mjs` razem ze zmianą kodu (`kit/CLAUDE.md`, „Bundel CLI”). Build jest powtarzalny: `npm run verify --prefix kit/cli` na `758b557` nie zmienił bundla ani w worktree, ani w świeżym klonie (sprawdzone).

Bundel zawiera komentarze ze ścieżkami modułów, na przykład `// node_modules/zod/v4/core/util.js`, liczonymi od `kit/cli`. Buduj go z zależnościami zainstalowanymi w `kit/cli` przez `npm ci --prefix kit/cli`. Na kopii z `kit/cli/node_modules` jako dowiązaniem symbolicznym do innego katalogu esbuild wpisał w komentarze pełne ścieżki docelowe i zmienił 96 linii bundla bez zmiany kodu (sprawdzone).

**Który krok CI zatrzymuje nieaktualny bundel.** W jobie `cli` w `kit.yml` krok „Verify CLI” (`npm run verify --prefix kit/cli`) kończy się przebudową bundla. Następny krok, „Kit state and generated files are up to date”, robi `git diff --exit-code` na całym drzewie, więc to on zatrzymuje pull request z nieaktualnym bundlem. Na kopii z commitem, który zmienił tekst w `kit/cli/src/bin.ts` bez przebudowy, ten krok wykazał różnicę w `.wa/bin/wa.mjs` (sprawdzone, kroki joba uruchomione lokalnie po kolei). Ostatni krok, „Bundle is up to date” (`git diff --exit-code -- .wa/bin/wa.mjs`), po udanym poprzednim zawsze przechodzi; zdanie w `kit/CLAUDE.md`, że nieaktualny bundel zatrzymuje ten właśnie krok, jest nieścisłe (R3 w [notatce rozbieżności części 2](superpowers/notes/2026-10-30-docs-part-2-discrepancies.md)).

<a id="bramka-cli"></a>

## Bramka CLI, testy i mutacje

CLI ma osobny `package.json` i `package-lock.json` w `kit/cli`. Zależności instalujesz komendą `npm ci --prefix kit/cli`, a nowe dodajesz przez npm 11 (`npx -y npm@11.21.1 install …` w `kit/cli`, `kit/CLAUDE.md`).

| Komenda | Co robi |
| --- | --- |
| `npm run verify --prefix kit/cli` | Bramka CLI: lint → typecheck → testy → build bundla (skrypt `verify` w `kit/cli/package.json`). |
| `npm run lint --prefix kit/cli` | ESLint z `kit/cli/eslint.config.mjs`: zalecane reguły JS i `typescript-eslint` oraz `curly` (wyłączone w `__tests__/`) i `no-nested-ternary`; pomija `src/__tests__/fixtures/**`, `reports/**` i `.stryker-tmp/**`. |
| `npm run typecheck --prefix kit/cli` | `tsc --noEmit` z `kit/cli/tsconfig.json` (bez fikstur). |
| `npm test --prefix kit/cli` | Vitest w środowisku `node`, pliki `src/**/*.test.ts` (`kit/cli/vitest.config.ts`), plik ustawień `kit/cli/vitest.setup.ts` ze stałym seedem testów właściwości w procesach Strykera ([08b](08b-testy-adwersarialne.md#seed)). Testy kopiują fikstury do katalogu tymczasowego ([08](08-testy.md#cli-hooki)); wyjątkiem jest test własności na repozytorium kitu. |
| `npm run build --prefix kit/cli` | Typecheck i bundel ([wyżej](#bundel)). |
| `npm run test:mutation:task --prefix kit/cli -- <pliki>` | Stryker tylko na podanych plikach, każda jako ścieżka względem `kit/cli`, zaczynająca się od `src/`. |
| `npm run test:mutation --prefix kit/cli` | Pełny przebieg Strykera: przyrostowy (`reports/stryker-incremental.json`), próg `break` 75%. |
| `npm run test:mutation:gate --prefix kit/cli` | Bramka plików krytycznych CLI. |

Na `758b557` bramka CLI przechodzi: 28 plików testów, 594 testy, bundel bez zmian (sprawdzone).

Mutacje działają jak w aplikacji ([08b](08b-testy-adwersarialne.md#bramka)): testy pisze `test-writer` przed implementacją, a `test-reviewer` uruchamia Strykera i bramkę. Różnice w CLI:

- `kit/cli/stryker.config.json` mutuje `src/**/*.ts` bez `__tests__/` i bez `kit/cli/src/bin.ts`; raport trafia do `kit/cli/reports/mutation/mutation.json`. W odróżnieniu od aplikacji ustawia `concurrency: "50%"` i `timeoutFactor: 5`, a `timeoutMS` zostawia domyślne 5000 (aplikacja ma 15000); powody opisuje [Limit czasu mutantów w CLI](#timeouty-cli).
- Bramka CLI uruchamia skrypt aplikacji `scripts/mutation-gate.ts` (`tsx ../../scripts/mutation-gate.ts`) w katalogu `kit/cli`, więc czyta `kit/cli/mutation-gate.json` i raport z `kit/cli/reports/mutation/`. Bez raportu kończy się komunikatem `Brak raportu mutacji. Uruchom najpierw npm run test:mutation.`
- Krytyczne są całe katalogi `kit/cli/src/generate/`, `kit/cli/src/manifest/`, `kit/cli/src/assemble/`, `kit/cli/src/commands/` i `kit/cli/src/kit/` (w `kit/cli/mutation-gate.json` zapisane względem `kit/cli`). Wpisy `allowed` dopisuje człowiek ([D26](decyzje.md#d26)).
- Nie uruchamiaj dwóch przebiegów Strykera naraz, także jednego w aplikacji i jednego w `kit/cli` ([08b](08b-testy-adwersarialne.md#jeden-stryker)).
- Stały seed testów właściwości w procesach Strykera ustawia osobny plik `kit/cli/vitest.setup.ts`, a nie `vitest.setup.ts` aplikacji ([08b](08b-testy-adwersarialne.md#seed)).

Zmiana w repozytorium kitu przechodzi przed pull requestem obie bramki: `npm run verify` (aplikacja) i `npm run verify --prefix kit/cli` (CLI).

<a id="timeouty-cli"></a>

### Limit czasu mutantów w CLI

Stryker daje mutantowi status `Timeout`, gdy jego przebieg nie skończy się w limicie. Limit to `timeoutFactor` razy czas testów obejmujących mutanta w przebiegu suchym (dla mutanta statycznego: czas wszystkich testów), plus `timeoutMS`, plus narzut przebiegu suchego, czyli jego czas poza samymi testami (w pomiarach niżej 6–8 s). Czas testów Stryker mierzy w przebiegu suchym w jednym procesie, a mutanty testuje w kilku procesach jednocześnie. Limit odróżnia więc pętlę nieskończoną od zwykłych testów tylko wtedy, gdy testy w równoległych procesach nie zwalniają bardziej, niż mieści się w limicie. Przy długich testach decyduje o tym `timeoutFactor`: z ustawieniami domyślnymi mutant, którego testy trwają 22,6 s, dostaje 46,3 s, czyli mniej więcej dwukrotność.

W CLI testy zwalniają bardziej. Testy `create`, `add` i `remove` składają projekty z fikstur: kopiują katalogi do katalogu tymczasowego i uruchamiają `git`, więc obciążają procesor i system plików. Te komendy wołają większość kodu CLI, więc mutanta w takim kodzie obejmuje od 100 do 240 testów (mediana 189), które w przebiegu suchym trwają razem od 11 do 28 s; tak było w 199 z 251 uruchomionych mutantów sześciu plików opisanych niżej. Suma czasów wszystkich 594 testów CLI uruchomionych tak jak w procesie Strykera (`vitest run --pool threads --maxWorkers 1`) wynosiła 26–28 s w jednym procesie, 45 s w każdym z 4 procesów uruchomionych naraz i 72 s w każdym z 7 (sprawdzone na Apple M1 z 4 rdzeniami wydajnymi i 4 energooszczędnymi). macOS obsługuje przy tym zmiany w plikach w osobnych procesach (`fseventsd` i indeksowanie Spotlight: `mds`, `mds_stores`), które w trakcie przebiegu Strykera zajmowały zwykle mniej niż jeden rdzeń, a chwilami dwa do trzech.

Długo trwa nie tylko mutant, który przeżywa, bo musi przejść wszystkie swoje testy. Vitest uruchamia najpierw pliki testów, które padły w poprzednim przebiegu tego samego procesu, a pozostałe od najdłuższego. Jeśli poprzedni mutant w procesie zginął w innym pliku, szybki test jednostkowy, na przykład w `kit/cli/src/__tests__/compare.test.ts`, zabija mutanta dopiero po wolnych testach `add`, `create` i `remove`. Z tego samego powodu test, który zabija mutanta (`killedBy` w raporcie), zmienia się między przebiegami: w dwóch przebiegach opisanych niżej był inny dla 54 z 228 zabitych mutantów, choć statusy się nie zmieniły.

Przy domyślnych ustawieniach Strykera (7 procesów testów na 8 logicznych procesorach, `timeoutFactor` 1,5, `timeoutMS` 5000) mutant objęty takimi testami dostawał limit około 46 s (od 28 do 52 s) i często go przekraczał. To, które mutanty dostały `Timeout`, zależało od chwilowego obciążenia: na tym samym kodzie `test:mutation:task` na sześciu plikach (`src/assemble/hash.ts`, `src/assemble/project-names.ts`, `src/assemble/package-json.ts`, `src/kit/files.ts`, `src/compare.ts` i `src/generate/registry.ts`) dawał od 52 do 104 timeoutów na 302 mutanty. Wpisy `allowed` dla `kit/cli/src/kit/files.ts` w `kit/cli/mutation-gate.json` raz pasowały do mutantów `Survived`, a raz bramka zgłaszała je jako nieaktualne, bo te same mutanty dostały `Timeout`. Samo zmniejszenie liczby procesów do czterech nie wystarczyło: przebieg dał 50 timeoutów, a bramka nadal zgłosiła nieaktualny wpis.

Zależność zniknęła po zmianie dwóch ustawień:

- `concurrency: "50%"` uruchamia tyle procesów, ile wynosi połowa logicznych procesorów: na M1 cztery zamiast siedmiu. Każdy test zwalnia wtedy mniej (w pomiarze wyżej 1,7 raza zamiast 2,7), a maszyna wykonuje tylko o około 8% mniej pracy. Z siedmioma procesami i `timeoutFactor: 5` bramka też przeszła, ale najwolniejszy mutant zużył 62% limitu, bo ciężkie zestawy testów działały do 3,4 raza wolniej niż w przebiegu suchym; z czterema procesami było to 44% i do 2,4 raza, a przebieg trwał podobnie długo. Na runnerze z dwoma procesorami (standardowy runner GitHub dla prywatnego repozytorium, na którym działa `kit-mutation.yml`) liczba procesów się nie zmienia: w obu ustawieniach Stryker po sprawdzeniu typów uruchamia 2 procesy testów, więc w CI zmienia się tylko `timeoutFactor`.
- `timeoutFactor: 5` daje limit równy pięciokrotnemu czasowi testów z przebiegu suchego plus około 12 s. Przy czterech procesach najwolniejsze zestawy testów działały w trzech przebiegach od 2,4 do 2,7 raza wolniej niż w przebiegu suchym. Z `timeoutFactor: 3` statusy były już te same, ale najwolniejszy mutant zużył 77% limitu; z 5 żaden mutant, którego testy się skończyły, nie zużył połowy limitu (najwięcej 44% samym czasem testów).

Pętle nieskończone nie czekają na ten limit, jeśli zmieniony kod wykonuje się w każdym ich obrocie: Stryker liczy w przebiegu suchym, ile razy wykonuje się kod każdego mutanta, i przerywa przebieg mutanta jako `Timeout`, gdy ten kod wykona się ponad sto razy częściej (`Hit limit reached` w raporcie). W pomiarach po zmianie każdy z 20 timeoutów miał tę przyczynę i przychodził zwykle po kilku sekundach, najpóźniej po około minucie. Zawieszenie, którego licznik nie łapie, na przykład pętla, przed którą zmieniony kod wykonał się tylko raz, czeka teraz na pełny limit, przy ciężkich mutantach do około 2,5 minuty. Zawieszenie asynchroniczne kończy wcześniej limit pojedynczego testu w Vitest (5 s), a mutant dostaje `Killed`.

Od kolejności plików testów nadal zależy wybór między `Killed` a `Timeout` u mutanta, który w jednym teście wpada w pętlę nieskończoną, a w innym kończy się błędem asercji: status daje ten z tych testów, który Vitest uruchomi pierwszy. Tak zachowuje się mutant `&&` → `||` w `stripRegions` (`kit/cli/src/assemble/hash.ts`): w pięciu z siedmiu przebiegów dostał `Timeout`, a w dwóch `Killed` od testu w `remove.test.ts`. Bramki to nie dotyczy, bo oba statusy liczą się jako wykryte. `Survived` nie zależy od kolejności, bo mutant przeżywa tylko wtedy, gdy przejdą wszystkie jego testy, więc o tym, czy przeżyje, czy dostanie `Timeout`, decyduje już tylko limit czasu.

`timeoutMS` zostaje przy wartości domyślnej: spowolnienie rośnie proporcjonalnie do czasu testów, więc pokrywa je mnożnik, a stała część limitu wystarcza mutantom objętym krótkimi testami. Po zmianie dwa kolejne przebiegi na tych samych sześciu plikach dały te same statusy każdego mutanta (228 `Killed`, 20 `Timeout`, wszystkie z licznika wykonań, 3 `Survived` z wpisami w `kit/cli/mutation-gate.json`, 51 `CompileError`), a bramka CLI przeszła (sprawdzone). Poprawka nie skraca przebiegu: z nią trwał 9–12 minut, z ustawieniami domyślnymi od 7 do 14 minut, zależnie od obciążenia maszyny. Mutanty, które limit przerywał wcześniej po około 46 s, teraz kończą swoje testy. Czas przebiegu zależy też od kolejności plików testów, bo od niej zależy, ile mutantów ginie późno.

Tryb przyrostowy przepisuje ze starego raportu wynik każdego niezmienionego mutanta innego niż `Killed`, dopóki nie dojdzie nowy test, który go obejmuje, więc zachowałby też `Timeout` sprzed tej zmiany. Przed pierwszym pełnym przebiegiem z nowymi ustawieniami uruchom go z `--force` (`npm run test:mutation --prefix kit/cli -- --force`) albo usuń `kit/cli/reports/stryker-incremental.json`. `test:mutation:task` zawsze działa z `--force`.

<a id="ci-kitu"></a>

## CI kitu

Workflow `.github/workflows/kit.yml` działa przy pushu do `main` i przy pull requeście do `main`. Jest na liście `kitOnly`, więc projekty go nie mają. Ma dwa joby.

**Job `cli`** („CLI (verify + bundle)”):

| Krok | Co robi | Co zatrzymuje |
| --- | --- | --- |
| Install CLI dependencies | `npm ci --prefix kit/cli` | Lockfile CLI niezgodny z `kit/cli/package.json`. |
| Verify CLI | `npm run verify --prefix kit/cli` | Błąd lintu, typów albo testu CLI, w tym testu własności. |
| Kit state and generated files are up to date | `npm run wa -- kit sync && npm run wa -- generate && git diff --exit-code` | `.wa/kit.json`, pliki generowane albo regiony niezgodne z manifestami; nieaktualny bundel ([wyżej](#bundel)). |
| Bundle is up to date | `git diff --exit-code -- .wa/bin/wa.mjs` | Nic: po udanym poprzednim kroku zawsze przechodzi (R3 w [notatce rozbieżności części 2](superpowers/notes/2026-10-30-docs-part-2-discrepancies.md)). |

**Job `assemble`** („Assemble (`<combo>`)”) działa po `cli`, z usługą Postgres 16, osobno dla każdej kombinacji modułów:

`.github/workflows/kit.yml`

```yaml
      matrix:
        combo:
          - name: core
            modules: ""
          - name: audit-logs
            modules: "audit-logs"
          - name: api-keys
            modules: "api-keys"
          - name: uploads
            modules: "uploads"
          - name: all
            modules: "audit-logs,api-keys,uploads"
```

`fail-fast: false` sprawia, że błąd jednej kombinacji nie przerywa pozostałych. Kroki w każdej kombinacji:

| Krok | Warunek | Co sprawdza |
| --- | --- | --- |
| Create project from the checked-out kit | zawsze | `node .wa/bin/wa.mjs create "$RUNNER_TEMP/matrix-app" --yes --kit "$GITHUB_WORKSPACE" --modules "<moduły>"`: złożenie projektu z commita, z `npm install`, `git init` i commitem. |
| Test gates are in the project | zawsze | W projekcie są `stryker.config.json`, `mutation-gate.json`, `.claude/hooks/protect-tests.mjs` i oba pliki agentów testowych. |
| No placeholders left in the project | zawsze | `git grep` napisów `WA App`, `wa-app`, `wa_app` ([Placeholdery](#placeholdery)). |
| Validate schema, Migrate | zawsze | `npx prisma validate` i `npx prisma migrate dev --name init` na bazie `matrix_e2e`. |
| Generated files are up to date | zawsze | `npm run wa -- generate && git diff --exit-code` w projekcie. |
| Verify project | zawsze | `npm run verify` w projekcie. |
| Start MinIO, Create MinIO bucket | kombinacje z `uploads` | MinIO z obrazu przypiętego digestem i bucket `matrix-app-uploads`. |
| Integration tests | zawsze | `npm run test:integration` z `INTEGRATION_DATABASE_URL` na `matrix_app_test` oraz `INTEGRATION_S3_ENDPOINT` i `INTEGRATION_S3_BUCKET`. |
| Docker image builds | `core` i `all` | `docker build .` w projekcie. |
| Project module is registered without editing core tests | zawsze | Kopiuje fiksturę `kit/cli/src/__tests__/fixtures/project-module/` (feature `notes` ze schematem `Note`), dopisuje jej manifest do `projectModules`, uruchamia `wa generate` i `npm test` ([D36](decyzje.md#d36), [D37](decyzje.md#d37)). |

Uwagi dla osoby, która zmienia ten workflow albo kontrakt CLI:

- Job `assemble` nie korzysta z regionu `wa:ci-integration` projektu: MinIO uruchamiają jego własne kroki, które powtarzają treść `ci/uploads.integration-steps.yml`. Zmiana obrazu MinIO albo aws-cli to zmiana w obu plikach i w `docker/uploads.compose.yml`; tak zrobił commit `1d57445` (przypięcie obrazów), a `ci.yml` i `docker-compose.yml` kitu odświeżył `wa generate`.
- Zmiana kontraktu `projectModules` wymaga aktualizacji fikstury i obiektu manifestu wpisanego w krok rejestracji (`kit/CLAUDE.md`). Commit `2e8db6e`, który dodał pole `ciSteps`, dopisał `ciSteps: null` właśnie tam.
- `.github/workflows/kit-mutation.yml` uruchamia pełny przebieg Strykera CLI i bramkę tylko ręcznie (`workflow_dispatch`), jak `mutation.yml` w aplikacji ([D26](decyzje.md#d26)). Raport trafia do artefaktu `kit-mutation-report`.
- `security-audit.yml` (rdzeń) uruchamia `npm audit` tylko w katalogu głównym; zależności `kit/cli` nie są audytowane przez żaden workflow.
- Żaden workflow nie działa na tagach ani ich nie tworzy ([Wydanie](#wydanie)).

<a id="wydanie"></a>

## Wydanie nowej wersji kitu

Wersja kitu to `version` w `kit/kit.json`. Trafia do `kitVersion` każdego nowego projektu i do treści jego pierwszego commita (`chore: initial commit from wa-kit v<wersja>`). Wyznacza też tag `v<wersja>`, który klonują one-liner z [16](16-cli-wa.md#wa-create) oraz `wa add` i `wa list` w projektach tej wersji ([16](16-cli-wa.md#zrodlo-kitu), [D46](decyzje.md#d46)). Każdy moduł ma osobną `version` w manifeście; trafia ona do `.wa/kit.json` projektu.

Kroki wydania:

1. Podbij `version` w manifeście każdego modułu, którego pliki się zmieniły (`kit/CLAUDE.md`, „Moduły i manifest”).
2. Podbij `version` w `kit/kit.json`. `kit/CLAUDE.md` tego kroku nie wymienia (R11 w [notatce rozbieżności części 2](superpowers/notes/2026-10-30-docs-part-2-discrepancies.md)), ale wynika on z kodu: tag nazywa się jak wersja kitu, a tag poprzedniej wersji już istnieje i wskazuje stary commit.
3. `npm run wa -- kit sync`, potem `npm run wa -- generate`; zacommituj `.wa/kit.json`.
4. Przejdź obie bramki i scal zmianę do `main`.
5. Ustaw tag z adnotacją na commicie wydania w `main` i wypchnij go. Tag ustawia człowiek. Tag `v0.1.0` ma adnotację `wa-kit v0.1.0` i wskazuje `76ca2d7` (sprawdzone, `git cat-file -p v0.1.0`):

```bash
git tag -a v<wersja> -m "wa-kit v<wersja>" <commit>
git push origin v<wersja>
```

Tag z adnotacją wskazuje obiekt tagu, a nie commit, dlatego `git clone --branch v<wersja>` wypisuje ostrzeżenie `… is not a commit!` i komunikat o odłączonym HEAD. To nie jest błąd; wyjaśnia to [16](16-cli-wa.md#one-liner).

Nic nie sprawdza kroków 1, 2 i 5:

- Zmiana plików modułu bez podbicia jego wersji przechodzi przez obie bramki i CI. W planie 3 `core` przeszedł z `0.1.0` do `0.4.0` w trzech commitach (`c8a0ffd`, `102b706`, `2e8db6e`), ale kilka innych zmian plików rdzenia weszło bez podbicia (R12 w [notatce rozbieżności części 2](superpowers/notes/2026-10-30-docs-part-2-discrepancies.md)). Wersja kitu przez cały plan 3 zostawała `0.1.0`, a tag `v0.1.0` ustawiono 2026-10-30 na końcowym commicie planu.
- Bez tagu one-liner z `--branch v<wersja>` i `wa add` z domyślnym źródłem kończą się błędem pobierania, a `wa list` wypisuje `Dostępne: nie udało się pobrać kitu (<powód>)` z kodem 0 ([16](16-cli-wa.md#wa-list), [znane-ograniczenia.md](znane-ograniczenia.md)).

<a id="nowy-modul-kitu"></a>

## Jak dodać do kitu nowy moduł

Ta sekcja dotyczy modułu kitu, czyli kodu, który trafi do wielu projektów. Funkcję jednego projektu dodajesz jako moduł projektu ([tutorial 09](09-nowy-modul.md), [16](16-cli-wa.md#moduly-projektu)). Kod feature piszesz tak samo jak w tutorialu ([09b](09b-implementacja-i-bramki.md)); różnią się rejestracja, własność plików i CI.

Kroki opisują, co zrobił plan 3 ([plan](superpowers/plans/2026-10-29-wa-kit-plan-3-modules.md), który dodał do kitu moduły `audit-logs`, `api-keys` i `uploads`; commity `git log --oneline 5b2d308..76ca2d7`). Przy każdym kroku stoi commit, który go wykonał. To, czego plan 3 nie robił konsekwentnie, a co warto robić, oznacza **Zalecenie**.

**Moduł kitu a pliki rdzenia.** `AGENTS.md` („Moduły i pliki generowane”) i `CLAUDE.md` mówią: „Moduł nie edytuje plików rdzenia”. Plan 3 tej reguły nie przestrzegał dosłownie: każdy z trzech modułów wymagał zmian w plikach `core` (szwy, konfiguracja testów, bramka mutacji), a większość tych zmian weszła w commitach modułów, bez podbicia wersji `core`. Rozjazd reguły z praktyką opisuje R12 w [notatce rozbieżności części 2](superpowers/notes/2026-10-30-docs-part-2-discrepancies.md). `kit/CLAUDE.md` („Moduły i manifest”) ustala zasadę: zmianę rdzenia, której moduł wymaga, robi się osobnym commitem z podbiciem wersji `core`. Kroki 1, 6, 7 i 10 niżej dotyczą plików rdzenia.

1. **Szew w rdzeniu, jeśli moduł go potrzebuje.** Punkty wejścia, z których korzystają moduły planu 3, powstały w rdzeniu:
   - osobnym commitem z podbiciem `core`: `trackAudit` i deklaracje `auditActions`, `apiScopes`, `uploadPurposes` w `defineModule` (`c8a0ffd`, `core` `0.2.0`);
   - zmianą CLI z podbiciem `core`: pole `ciSteps` z regionem `wa:ci-integration` (`2e8db6e`, markery w `ci.yml`, `core` `0.4.0`); zmianą CLI bez plików rdzenia: tablica `auditSinks` (`33b4edc`);
   - wewnątrz commitów modułu, bez podbicia `core`: wywołanie `trackAudit` w `src/features/organizations/services/commands/member-commands.ts` (`9569cbc`, commit `feat(audit-logs)`) i `requestConfirmation` w `src/shared/components/service-mode/use-service-mode-action.tsx` (`6279545`, commit `feat(uploads)`);
   - osobnym commitem bez podbicia `core`: poprawka `src/proxy.ts` dla ścieżek zaczynających się od `api` (`7b069fc`, przy `api-keys`).

   Zmiana CLI przechodzi bramkę CLI i przebudowę bundla ([Bundel](#bundel)). Opis szwów: [12-moduly-kitu.md](12-moduly-kitu.md). **Zalecenie:** zmianę pliku rdzenia rób osobnym commitem z podbiciem `version` w `kit/modules/core.json`, jak w `c8a0ffd`.
2. **Kod modułu.** `src/features/<x>/` z `module.ts`, schemat `prisma/schema/<x>.prisma`, strony w `src/app/[locale]/(app)/<x>/`, trasy API w `src/app/api/<x>/` (`c8b5f74`, `102b706`, `c6c26c4` i kolejne `feat(<x>)`). Migracji nie commitujesz, bo kit ich nie commituje ([D13](decyzje.md#d13)).
3. **Manifest `kit/modules/<x>.json`** z `name` równym nazwie pliku, `version` (plan 3: `0.1.0`), `description`, `files`, `requires`, zależnościami npm, `env`, `schemaRelations`, a w razie potrzeby `compose` i `ciSteps` ([Manifesty](#manifesty)). Każdy nowy katalog modułu dostał własny wzorzec w `files` w tym samym commicie, w którym powstał: `audit-logs` dostał `src/app/[locale]/(app)/audit-log/**` razem ze stroną (`1863fb0`), `api-keys` trasę API i stronę w dwóch osobnych commitach (`a6cffb0`, `8a320d2`). Plik usług Dockera i plik kroków CI leżą w `docker/<x>.compose.yml` i `ci/<x>.integration-steps.yml` i należą do `files` modułu ([wyżej](#pliki-uslug-i-ci)). Przykład zmiennej z nazwą projektu zapisz z `{{projectSlug}}` (`76b5956`).
4. **Zależności npm.** Dopisz je przez npm 11 do `package.json` kitu (z `package-lock.json`) i do manifestu, w tej samej sekcji i wersji (`c6c26c4`, `7438ea8`). Dotyczy to też zależności używanych tylko w testach modułu: `audit-logs` deklaruje `better-call` w `devDependencies` (`8818bba`).
5. **Placeholdery.** Plik modułu z nazwą projektu albo bazy dopisz do `placeholderFiles` w `kit/kit.json` (`c6c26c4`: `docker/uploads.compose.yml`, `ci/uploads.integration-steps.yml`). Testów nie dopisuj (`76b5956` je wycofał).
6. **Zmienne w testach aplikacji referencyjnej.** Kit uruchamia testy e2e i integracyjne z modułem, więc zmienna wymagana przez schemat `env.ts` modułu musi mieć wartość w plikach rdzenia `e2e/env.ts` i `src/test/integration/setup-env.ts`. Plan 3 dopisał tam `API_KEY_PEPPER` i `S3_*` w commitach `102b706` (z podbiciem `core` do `0.3.0`) oraz `c6c26c4`, `2199cea`, `76b5956` (bez podbicia). Plan providera storage zamienił w `e2e/env.ts` zmienne `S3_*` na `STORAGE_PROVIDER=local` i `STORAGE_LOCAL_PATH`, a w `setup-env.ts` dopisał `STORAGE_PROVIDER=s3` (`22bd604`, osobny commit rdzenia; `core` podbito do `0.5.0` raz, w `d348a0b`). Brak wymaganej zmiennej w `e2e/env.ts` zatrzymuje serwery e2e przy starcie: `register()` wypisuje raport problemów i kończy proces kodem 1, zanim Playwright doczeka się odpowiedzi serwera ([D48](decyzje.md#d48), [10-wdrozenie.md](10-wdrozenie.md#blad-env)). Sprawdzone 2026-11-04 z `BETTER_AUTH_SECRET=short` w powłoce: Playwright wypisał raport serwera z prefiksem `[WebServer]`, potem `Error: Process from config.webServer was not able to start. Exit code: 1`, i nie doszedł do `globalSetup`. Testy integracyjne nie uruchamiają serwera Next.js, więc brak zmiennej w `setup-env.ts` wychodzi dopiero przy pierwszym odczycie `env` w teście.
7. **Testy i konfiguracja rdzenia, które dotyka moduł.** Plan 3 zmienił jeszcze trzy pliki rdzenia, każdy w commicie modułu, bez podbicia `core`:
   - `src/shared/lib/__tests__/env.test.ts` dostał `vi.mock("@/modules.generated", () => ({ moduleEnvSchemas: [] }));` (`102b706`). Test rdzenia sprawdza schemat zmiennych rdzenia; bez atrapy wymagana zmienna modułu (`API_KEY_PEPPER`) psułaby jego przypadki.
   - `stryker.integration.config.json`: wzorzec `mutate` `src/features/organizations/services/**/*.ts` zamieniony na `src/features/*/services/**/*.ts`, żeby przebieg integracyjny mutował też usługi modułów (`04ce5d3`).
   - `UNGUARDED_ALLOWED` w `src/__tests__/server-entrypoints-guard.test.ts`: `b3da758` dopisał wyjątek dla `readUploadForDownload` z pliku `read-upload.ts` w katalogu `services/queries/` modułu `uploads` (pliki publiczne czytane bez sesji), a `0b5c91d` go usunął, przenosząc plik do `src/features/uploads/services/read-upload.ts`, poza `services/queries/`, którego reguła guardu dotyczy. Wyjątek jest potrzebny, gdy eksportowana funkcja z pliku `"use server"` albo z `services/queries/` ma świadomie działać bez guardu sesji. Ten sam test sprawdza jednak, że każdy wyjątek z listy istnieje w kodzie („wyjątki z listy UNGUARDED_ALLOWED nadal istnieją”), więc wyjątek dla pliku modułu w tym pliku rdzenia zatrzymałby `npm test` w projekcie bez tego modułu (wniosek z kodu testu, nie z przebiegu). **Zalecenie:** zamiast wyjątku przenieś funkcję poza `services/queries/`, jak `0b5c91d`.
8. **`kit sync` i generator.** `npm run wa -- kit sync` i `npm run wa -- generate`. Commit modułu zawiera wynik: `.wa/kit.json`, `src/modules.generated.ts`, `src/modules.client.generated.ts` i regiony w `auth.prisma`, `organizations.prisma`, `.env.example`, `docker-compose.yml`, `ci.yml` (`c8b5f74`, `102b706`, `c6c26c4`).
9. **Własność i bramka CLI.** `git add` nowych plików, potem test własności albo cała bramka CLI ([Własność](#wlasnosc)).
10. **Bramka mutacji aplikacji.** `mutation-gate.json` w katalogu głównym jest plikiem `core`. Plan 3 dopisał do jego listy `critical` katalogi usług modułów, `src/features/<x>/services/` (`c8b5f74`, `102b706`, `c6c26c4`), a do `allowed` osiem wpisów dla plików `api-keys` (`36dd132`, zatwierdzone przez człowieka w pull requeście); żaden z tych commitów nie podbił `core`.
11. **Macierz `assemble`.** Dopisz pozycję `{ name: <x>, modules: "<x>" }` i dopisz moduł do listy kombinacji `all` w `.github/workflows/kit.yml` (`309d26e`, `d5b0c98`, `1166d08`). Moduł, którego testy integracyjne potrzebują usługi, dostaje w `assemble` własne kroki z warunkiem `if: contains(matrix.combo.modules, '<x>')` i zmienne dla `Integration tests` (`1166d08` dla MinIO).
12. **Dokumentacja.** Wiersz modułu w tabeli `kit/README.md`, opis w `docs/12-moduly-kitu.md` i decyzje w [decyzje.md](decyzje.md#statusy-i-numeracja) (`615bda3`, `b1a3a28`, `474aaee`).
13. **Bramki i wydanie.** `npm run verify`, `npm run verify --prefix kit/cli`, pull request, a po scaleniu wydanie ([wyżej](#wydanie)).

**Co z tego trafia do projektu.** Zmiany z kroków 6, 7 i 10 leżą w plikach `core`, więc dostaje je każdy projekt, także ten z samym rdzeniem. Projekt bez modułów ma w `mutation-gate.json` katalogi `critical` modułów, których nie ma, i wpisy `allowed` dla plików `api-keys`, w `e2e/env.ts` wartości `API_KEY_PEPPER`, `STORAGE_PROVIDER` i `STORAGE_LOCAL_PATH`, w `src/test/integration/setup-env.ts` wartości `API_KEY_PEPPER`, `STORAGE_PROVIDER` i `S3_*`, a obraz z `Dockerfile` pusty katalog `/app/volumes/uploads`. To nieszkodliwe: `checkMutationGate` (`scripts/lib/mutation-gate.ts`) przegląda tylko pliki obecne w raporcie Strykera, a wpis `allowed` uznaje za nieaktualny tylko wtedy, gdy jego plik jest w raporcie (`entry.file in report.files`), a zmienne bez schematu modułu nie są czytane. Job `assemble` składa i weryfikuje projekt `core` z tymi plikami w CI.

Testy rdzenia, które porównują rejestr z literałem, filtrują go do modułów rdzenia (`src/test/core-modules.ts`), więc nowy moduł ich nie psuje ([D37](decyzje.md#d37)). Spójność całego rejestru, z nowym modułem, sprawdza `src/shared/lib/modules/__tests__/registry-consistency.test.ts`.

<a id="referencja"></a>

## Referencja

<a id="referencja-kit-json"></a>

### `kit/kit.json`

Schemat `kitConfigSchema` z `kit/cli/src/kit/kit-config.ts`. Wszystkie pola są wymagane; brak pliku daje `Brak kit/kit.json w <katalog> — to nie jest repozytorium wa-kit`, niepoprawny JSON `SyntaxError` z `JSON.parse`, a poprawny JSON o złym kształcie surowy błąd Zod.

| Pole | Typ | Wartość w kicie | Kto czyta |
| --- | --- | --- | --- |
| `version` | `string`, niepusty | `0.1.0` | `create` (`kitVersion` projektu, treść pierwszego commita), `add` i `list` przy lokalnym źródle (porównanie z `kitVersion` projektu), `kit sync` |
| `repo` | `string`, niepusty | `https://github.com/webamigos/wa-kit.git` | `create` (`kitRepo` projektu), `kit sync` |
| `kitOnly` | `string[]`, wzorce | 8 wzorców ([wyżej](#kit-a-projekt)) | `create`, `add` (pomijane przy kopiowaniu), test własności (pomijane) |
| `placeholders` | `{ projectName, projectSlug, projectSnake }` | `WA App`, `wa-app`, `wa_app` | `create`, `add` (podmiana), `kit sync` (`project`) |
| `placeholderFiles` | `string[]`, dokładne ścieżki | 12 plików ([wyżej](#placeholdery)) | `create`, `add` |
| `generatedFiles` | `string[]`, wzorce | `src/modules.generated.ts`, `src/modules.client.generated.ts`, `src/i18n/locales.generated.ts` | `create`, `add` (pomijane przy kopiowaniu), test własności (pomijane) |
| `managedFiles` | `string[]`, dokładne ścieżki | `package.json`, `package-lock.json` | `create`, `add` (wartość `managed` zamiast hasha) |

`kitOnly` i `generatedFiles` są dopasowywane jak wzorce `files` (`matchFiles`), a `placeholderFiles` i `managedFiles` porównywane dosłownie z ścieżką pliku.

<a id="referencja-komendy"></a>

### Komendy pracy nad kitem

| Komenda | Kiedy |
| --- | --- |
| `npm run wa -- kit sync` | Po zmianie `kit/modules/*.json` albo `kit/kit.json`. |
| `npm run wa -- generate` | Po `kit sync` i po zmianach feature ([02b](02b-rejestr-i-generator.md#uruchomienie)). |
| `npm ci --prefix kit/cli` | Instalacja zależności CLI. |
| `npm run build --prefix kit/cli` | Po każdej zmianie w `kit/cli/src`; commit `.wa/bin/wa.mjs`. |
| `npm run verify --prefix kit/cli` | Bramka CLI. |
| `npm run test:mutation:task --prefix kit/cli -- <pliki>` | Mutacje plików zadania w CLI. |
| `npm run test:mutation:gate --prefix kit/cli` | Bramka plików krytycznych CLI. |
| `node .wa/bin/wa.mjs create <katalog> --yes --kit .` | Próbne złożenie projektu z bieżącego klonu kitu, tak jak job `assemble`. Dodaj `--modules <lista>`, a `--no-install --no-git`, żeby tylko obejrzeć pliki. Złożenie bierze treść z drzewa roboczego, a listę plików z indeksu ([wyżej](#wzorce)). |

<a id="referencja-komunikaty"></a>

### Komunikaty

| Komunikat | Skąd | Co zrobić |
| --- | --- | --- |
| `Zaktualizowano .wa/kit.json` | `kit sync` | Zacommituj zmieniony `.wa/kit.json`, uruchom `wa generate`. |
| `Bez zmian` | `kit sync`, `generate` | Nic. |
| `Brak kit/kit.json w <katalog> — to nie jest repozytorium wa-kit` | `kit sync`, `add`/`list` z lokalnym źródłem | Uruchom `kit sync` w katalogu głównym klonu kitu; w `add` i `list` wskaż klon kitu ([16](16-cli-wa.md#zrodlo-kitu)). |
| `kit/modules/<plik>: name "<name>" nie zgadza się z nazwą pliku` | odczyt manifestów | Popraw `name` albo nazwę pliku. |
| `<katalog> nie jest repozytorium git` | odczyt listy plików kitu | Uruchom w klonie z `.git`. |
| `<plik>: brak regionu wa:<marker>; …` | `generate` | Moduł ma treść dla regionu, a plik docelowy nie ma markerów; dodaj je w pliku rdzenia ([02b](02b-rejestr-i-generator.md#regiony)). |
| `ENOENT: no such file or directory, open '<projekt>/<plik>'` | `generate` przy `create`/`add` | Plik z `compose` albo `ciSteps` nie należy do `files` modułu ([wyżej](#pliki-uslug-i-ci)). |
| `Brak raportu mutacji. Uruchom najpierw npm run test:mutation.` | `test:mutation:gate` | Uruchom przebieg Strykera przed bramką. |
