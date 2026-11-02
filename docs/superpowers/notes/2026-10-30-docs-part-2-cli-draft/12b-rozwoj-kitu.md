# Rozwój kitu: manifesty, bundel CLI i wydanie

Po przeczytaniu będziesz wiedzieć:

- które pliki istnieją tylko w repozytorium kitu i co opisują `kit/kit.json` oraz `kit/modules/<x>.json`;
- jak `wa kit sync` utrzymuje `.wa/kit.json` kitu zgodny z manifestami;
- co sprawdza test własności plików i zależności;
- jak liczone są hashe plików w projekcie i jak działają placeholdery;
- jak zmienić kod CLI: bundel, bramka, mutacje i workflowy kitu;
- jak wydać nową wersję kitu i jak dodać do kitu nowy moduł.

Zweryfikowano z kodem: 5b2d308, 2026-10-29

Źródła:

- `kit/kit.json`
- `kit/modules/core.json`
- `kit/CLAUDE.md`
- `kit/README.md`
- `kit/cli/package.json`
- `kit/cli/bundle.mjs`
- `kit/cli/eslint.config.mjs`
- `kit/cli/stryker.config.json`
- `kit/cli/mutation-gate.json`
- `kit/cli/src/commands/kit-sync.ts`
- `kit/cli/src/kit/` (`kit-config.ts`, `files.ts`, `ownership.ts`, `source.ts`)
- `kit/cli/src/assemble/hash.ts`
- `kit/cli/src/assemble/placeholders.ts`
- `kit/cli/src/assemble/package-json.ts`
- `kit/cli/src/generate/targets.ts`
- `kit/cli/src/manifest/schema.ts`
- `kit/cli/src/kit/__tests__/ownership.test.ts`
- `kit/cli/src/__tests__/fixtures/project-module/`
- `.wa/kit.json`
- `.wa/bin/wa.mjs`
- `.github/workflows/kit.yml`
- `.github/workflows/kit-mutation.yml`
- `.dockerignore`
- `.gitignore`
- `.prettierignore`
- `eslint.config.mjs`
- `vitest.config.ts`
- `tsconfig.json`

Ten plik jest dla osoby, która zmienia samo repozytorium kitu: kod CLI, manifesty modułów albo wersję kitu. Jak używać CLI w projekcie, opisuje [12-cli-wa.md](12-cli-wa.md). Zasady pracy nad plikami kitu są w [kit/CLAUDE.md](../kit/CLAUDE.md); ten plik je wyjaśnia, ale ich nie przepisuje.

<a id="kit-a-projekt"></a>

## Kit a projekt: co jest tylko w kicie

Repozytorium kitu to działająca aplikacja z tym samym układem katalogów co projekt ([D02](decyzje.md#d02)) plus pliki, które nie trafiają do żadnego projektu. Rozpoznasz je po wzorcach `kitOnly` w `kit/kit.json`:

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
| `kit/modules/<x>.json` | Manifest modułu kitu: pliki, zależności npm, zmienne, relacje, usługa Dockera, wymagane moduły ([Manifesty](#manifesty)). |
| `kit/cli/` | Kod źródłowy CLI z własnym `package.json`, lockfile, testami i konfiguracją Strykera. |
| `kit/README.md`, `kit/CLAUDE.md` | Krótka instrukcja CLI i zasady pracy nad plikami kitu. |
| `.wa/kit.json` | Stan kitu wygenerowany z manifestów przez `wa kit sync`. Projekt dostaje własny `.wa/kit.json`, zapisany przez `wa create`. |
| `.github/workflows/kit.yml`, `kit-mutation.yml` | Bramka CLI i składanie projektu z kitu ([CI kitu](#ci-kitu)). |
| `prisma/migrations/.gitignore` | Ignoruje migracje tylko w kicie ([D13](decyzje.md#d13)). |
| `docs/` | Ta dokumentacja. |

Główne narzędzia aplikacji pomijają `kit/`: ESLint (`kit/**` w `globalIgnores` w `eslint.config.mjs`), Vitest (`exclude` w `vitest.config.ts`), TypeScript (`exclude` w `tsconfig.json`) i obraz Dockera (`kit` i `docs` w `.dockerignore`). Dlatego zmiana w `kit/cli` nie przechodzi przez `npm run verify`, tylko przez bramkę CLI ([Bramka CLI](#bramka-cli)).

<a id="manifesty"></a>

## Manifesty modułów

Każdy moduł kitu ma plik `kit/modules/<nazwa>.json`. Pole `name` musi być równe nazwie pliku, inaczej odczyt kończy się błędem `kit/modules/<plik>: name "<name>" nie zgadza się z nazwą pliku` (`readKitManifests` w `kit/cli/src/kit/kit-config.ts`). Schemat manifestu (`moduleManifestSchema`) jest ten sam co w `.wa/kit.json`; pełną listę pól z typami podaje [02b](02b-rejestr-i-generator.md#referencja-manifest).

Kit w wersji z nagłówka ma jeden manifest, `kit/modules/core.json`. Wymienia wszystkie pliki rdzenia (od `.claude/hooks/**` po `src/types/**`) i wszystkie zależności npm aplikacji.

Pola manifestu czytają różne komendy:

| Pole | Kto czyta | Do czego |
| --- | --- | --- |
| `name`, `description`, `version` | `create`, `add`, `list` | Nazwa w `--modules` i w `wa add`, opis w pytaniu i w `wa list`, wersja zapisana w `.wa/kit.json` projektu. |
| `requires` | `create`, `add`, `remove` | Moduły dodawane razem z tym modułem; odmowa usunięcia modułu, którego ktoś wymaga. |
| `files` | `create`, `add`, test własności, `generate` | Które pliki kitu kopiować; własność plików; wykrywanie feature ([02b](02b-rejestr-i-generator.md#wykrywanie-feature)). |
| `dependencies`, `devDependencies` | `create`, `add`, `remove`, test własności | Zależności dopisywane do `package.json` projektu i usuwane z niego ([D29](decyzje.md#d29)). |
| `env`, `schemaRelations`, `compose` | `generate` | Treść regionów `wa:*` ([02b](02b-rejestr-i-generator.md#regiony)). |
| `workspaces` | nikt | Pole istnieje w schemacie; żadna komenda go nie czyta. |

Wzorce w `files` obsługują `*` (dowolne znaki bez `/`) i `**` (dowolne znaki, także `/`); pozostałe znaki są dosłowne (`globToRegExp` w `kit/cli/src/kit/files.ts`). Nawiasów klamrowych nie ma: wzorzec `src/features/{a,b}/**` test własności zgłasza jako błąd. Wzorce porównywane są z listą plików śledzonych przez git (`git ls-files`), więc plik niezacommitowany nie trafi do projektu.

<a id="kit-sync"></a>

## `.wa/kit.json` kitu i `wa kit sync`

`.wa/kit.json` w kicie nie jest edytowany ręcznie. Przepisuje go komenda:

```bash
npm run wa -- kit sync
```

`kitSync` w `kit/cli/src/commands/kit-sync.ts` buduje stan z `kit/kit.json` i manifestów:

| Pole `.wa/kit.json` | Skąd |
| --- | --- |
| `kitVersion`, `kitRepo` | `version` i `repo` z `kit/kit.json` |
| `project` | placeholdery `projectName` i `projectSlug` (`WA App`, `wa-app`) |
| `locales` | zawsze `["pl", "en"]` |
| `modules` | każdy manifest z `kit/modules/`, z wersją z manifestu i pustym `files` |
| `projectModules` | bez zmian z dotychczasowego pliku |

Komenda wypisuje `Zaktualizowano .wa/kit.json` albo `Bez zmian`. Poza repozytorium kitu kończy się błędem `Brak kit/kit.json w <katalog> — to nie jest repozytorium wa-kit`. Uruchom ją po każdej zmianie w `kit/modules/*.json` albo w `kit/kit.json`, a potem `npm run wa -- generate`. Job `cli` w `kit.yml` robi to samo i pada, gdy wynik różni się od zacommitowanego ([CI kitu](#ci-kitu)).

<a id="wlasnosc"></a>

## Własność plików i zależności

Każdy plik kitu, który może trafić do projektu, ma dokładnie jednego właściciela: moduł, którego wzorzec `files` go obejmuje. Inaczej `wa create` pominąłby plik albo skopiował go dwa razy, a `wa remove` usunąłby plik potrzebny innemu modułowi. Tak samo każda zależność npm z `package.json` kitu należy do manifestu, który deklaruje ją w tej samej sekcji i w tej samej wersji ([D29](decyzje.md#d29)).

Pilnuje tego test „każdy plik i każda zależność ma dokładnie jednego właściciela” w `kit/cli/src/kit/__tests__/ownership.test.ts`. Uruchamia `checkOwnership` z `kit/cli/src/kit/ownership.ts` na samym repozytorium i oczekuje pustego raportu. Pola raportu i to, jak naprawić każde z nich:

| Pole raportu | Co oznacza | Co zrobić |
| --- | --- | --- |
| `unowned` | Plik śledzony przez git, spoza `kitOnly` i `generatedFiles`, którego nie obejmuje żaden manifest. | Dopisz wzorzec do manifestu modułu, do którego plik należy, albo do `kitOnly`, jeśli plik jest tylko dla kitu. |
| `multiOwned` | Plik objęty wzorcami dwóch modułów. | Zawęź wzorce, żeby plik należał do jednego modułu. |
| `globErrors` (`empty`) | Wzorzec, który nie pasuje do żadnego pliku. | Popraw literówkę albo usuń wzorzec. |
| `globErrors` (`brace`) | Wzorzec z `{`. | Rozbij go na osobne wzorce. |
| `unownedDependencies` | Zależność z `package.json`, której żaden manifest nie deklaruje w tej sekcji. | Dopisz ją do manifestu właściciela. |
| `dependencyMismatch` | Zależność manifestu w innej wersji niż w `package.json` albo nieobecna w `package.json` (`<brak>`). | Ustaw w obu miejscach tę samą wersję. |
| `composeOutsideModule` | Plik z pola `compose` nie należy do plików tego modułu. | Dopisz plik do `files` modułu. |

Konsekwencja w praktyce: aktualizacja zależności w kicie to dwie zmiany, w `package.json` i w manifeście właściciela. Test nie pozwala zapomnieć o drugiej.

<a id="hashe"></a>

## Hashe plików w projekcie

`wa create` i `wa add` zapisują w `.wa/kit.json` projektu, pod `modules.<nazwa>.files`, hash każdego skopiowanego pliku. `wa remove` porównuje je z plikami na dysku, żeby nie usunąć pliku zmienionego lokalnie ([12](12-cli-wa.md#wa-remove)). Hash liczy `fileHash` z `kit/cli/src/assemble/hash.ts` na treści zapisanej w projekcie, czyli już po podmianie placeholderów:

| Rodzaj pliku | Wartość w `files` |
| --- | --- |
| `package.json`, `package-lock.json` (`managedFiles` w `kit/kit.json`) | napis `managed`, bez hasha |
| plik z regionem `wa:*`: `prisma/schema/auth.prisma`, `prisma/schema/organizations.prisma`, `.env.example`, `docker-compose.yml` | SHA-256 treści bez linii między markerami regionu |
| każdy inny plik | SHA-256 bajtów pliku |

Pliki z regionami mają hash bez treści regionów, bo tę treść przepisuje `wa generate` przy każdym dodaniu i usunięciu modułu. Zmiana poza regionem liczy się jako lokalna zmiana ([D30](decyzje.md#d30)). Region bez linii końca (`wa:<nazwa>:end`) zostaje w hashu w całości. Pliki `package.json` i `package-lock.json` zmienia każdy `npm install` i każda komenda modułów, więc ich hash nie miałby sensu. Moduły inne niż `core` ich nie posiadają, więc `wa remove` ich nie usuwa. Pliki generowane (`generatedFiles`) nie są kopiowane i nie mają hashy, bo odtwarza je generator. W `.wa/kit.json` kitu `files` jest puste.

<a id="placeholdery"></a>

## Placeholdery

Kit to działająca aplikacja o nazwie „WA App”. Przy składaniu projektu CLI zamienia jej nazwy na nazwy projektu, ale tylko w plikach z listy `placeholderFiles` w `kit/kit.json` (`applyPlaceholders` w `kit/cli/src/assemble/placeholders.ts`):

| Placeholder w kicie | Zamieniany na | Przykład |
| --- | --- | --- |
| `WA App` | nazwa wyświetlana | `Acme App` |
| `wa-app` | slug | `acme-app` |
| `wa_app` | snake | `acme_app` |

Zamiana to dosłowna podmiana tekstu, bez składni szablonów ([D35](decyzje.md#d35)). Wynikają z tego dwie reguły:

- Nowy plik, który zawiera nazwę projektu albo nazwę bazy, dopisz do `placeholderFiles`. Inaczej trafi do projektu z `wa_app` i, na przykład, kilka projektów na jednej maszynie użyje tej samej bazy testowej.
- W pliku z listy nie używaj tych napisów w innym znaczeniu: zostaną podmienione.

Job `assemble` w `kit.yml` sprawdza w złożonym projekcie, że poza testami, `package-lock.json` i bundlem nie został żaden z trzech napisów (krok „No placeholders left in the project”). Testy celowo nie są na liście, więc mogą asertować na wartościach kitu.

Osobny mechanizm dotyczy zmiennych modułów: w polu `example` wpisu `env` manifestu `{{projectSlug}}` i `{{projectName}}` są zamieniane na slug i nazwę z `.wa/kit.json` przy każdym `wa generate` (`fillPlaceholders` w `kit/cli/src/generate/targets.ts`). Na przykład `{{projectSlug}}_demo_` daje w projekcie `acme-app` linię `DEMO_TOKEN=acme-app_demo_` w regionie `wa:modules` (sprawdzone na fiksturze).

<a id="bundel"></a>

## Bundel CLI

Kod CLI leży w `kit/cli/src`, ale projekty i kit uruchamiają jeden plik `.wa/bin/wa.mjs`, zbudowany esbuildem i zacommitowany ([D28](decyzje.md#d28)):

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

Bundel zawiera wszystkie zależności CLI (jedyna runtime to `zod`), więc projekt nie potrzebuje ani `kit/cli`, ani `node_modules` CLI. Należy do rdzenia (wzorzec `.wa/bin/wa.mjs` w `kit/modules/core.json`), dlatego trafia do każdego projektu. Jest w `.prettierignore` (`.wa/bin`) i w ignorach ESLint (`.wa/**`).

Po każdej zmianie w `kit/cli/src`:

```bash
npm run build --prefix kit/cli
```

`build` uruchamia typecheck i `bundle.mjs`. Zacommituj `.wa/bin/wa.mjs` razem ze zmianą kodu. Krok „Bundle is up to date” w jobie `cli` (`git diff --exit-code -- .wa/bin/wa.mjs`) zatrzyma pull request z nieaktualnym bundlem.

<a id="bramka-cli"></a>

## Bramka CLI, testy i mutacje

CLI ma osobny `package.json` i `package-lock.json` w `kit/cli`. Zależności instalujesz komendą `npm ci --prefix kit/cli`, a nowe dodajesz przez npm 11 (`npx -y npm@11.21.1 install` w `kit/cli`, jak w [kit/CLAUDE.md](../kit/CLAUDE.md)).

| Komenda | Co robi |
| --- | --- |
| `npm run verify --prefix kit/cli` | Bramka CLI: lint → typecheck → testy → build bundla. |
| `npm run lint --prefix kit/cli` | ESLint z `kit/cli/eslint.config.mjs`: zalecane reguły JS i TypeScript oraz `curly` i `no-nested-ternary` jak w aplikacji. |
| `npm test --prefix kit/cli` | Vitest, pliki `src/**/*.test.ts`. Testy pracują na kopiach fikstur w katalogu tymczasowym ([08](08-testy.md#cli-hooki)). |
| `npm run test:mutation:task --prefix kit/cli -- <pliki>` | Stryker tylko na podanych plikach (ścieżki względem `kit/cli`, na przykład `src/commands/add.ts`). |
| `npm run test:mutation --prefix kit/cli` | Pełny przebieg Strykera (incremental, próg `break` 75%). |
| `npm run test:mutation:gate --prefix kit/cli` | Bramka plików krytycznych z `kit/cli/mutation-gate.json`. |

Proces jest ten sam co w aplikacji ([08b](08b-testy-adwersarialne.md)): testy pisze `test-writer` przed implementacją, a `test-reviewer` uruchamia mutacje. Bramka CLI ma własny `mutation-gate.json`, bo raport Strykera z `kit/cli` podaje ścieżki względem `kit/cli`. Krytyczne są całe katalogi `src/generate/`, `src/manifest/`, `src/assemble/`, `src/commands/` i `src/kit/`; wpisy `allowed` dopisuje człowiek ([D26](decyzje.md#d26)). Stryker pomija `src/bin.ts` i testy (`mutate` w `kit/cli/stryker.config.json`). Nie uruchamiaj dwóch przebiegów Strykera naraz, także jednego w kicie i jednego w `kit/cli`.

Przed oddaniem zmiany w repozytorium kitu przejdź obie bramki: `npm run verify` (aplikacja) i `npm run verify --prefix kit/cli` (CLI).

<a id="ci-kitu"></a>

## CI kitu

Workflow `.github/workflows/kit.yml` działa przy pushu i pull requeście do `main`. Należy tylko do kitu, więc projekty go nie mają.

| Job | Kroki | Co zatrzymuje |
| --- | --- | --- |
| `cli` (CLI (verify + bundle)) | `npm ci --prefix kit/cli`, `npm run verify --prefix kit/cli`, `kit sync` + `generate` + `git diff --exit-code`, `git diff --exit-code -- .wa/bin/wa.mjs` | Błąd lintu, typów albo testu CLI; `.wa/kit.json` albo pliki generowane niezgodne z manifestami; nieaktualny bundel. |
| `assemble` (Assemble (`<combo>`)) | `wa create` z bieżącego checkoutu dla każdej kombinacji modułów z macierzy `combo`, potem w projekcie: obecność bramek testowych, brak placeholderów, `prisma validate`, migracja, `generate` bez diffu, `npm run verify`, testy integracyjne, `docker build` (tylko kombinacja `core`), rejestracja modułu projektu | Projekt złożony z kitu, który się nie buduje, nie przechodzi testów albo nie rejestruje modułu projektu. |

Macierz `combo` ma jedną pozycję, `core` z pustą listą modułów. Nowy moduł kitu dopisz do macierzy, żeby CI składał projekt także z nim.

Ostatni krok `assemble` kopiuje do projektu fiksturę `kit/cli/src/__tests__/fixtures/project-module/` (feature `notes` z plikiem schematu), dopisuje jej wpis do `projectModules`, uruchamia `wa generate` i `npm test`. Sprawdza w ten sposób, że funkcja projektu rejestruje się bez zmiany testów rdzenia ([D36](decyzje.md#d36)). Zmiana kontraktu `projectModules` wymaga aktualizacji tej fikstury.

`.github/workflows/kit-mutation.yml` uruchamia pełny przebieg Strykera CLI i bramkę mutacji tylko ręcznie (`workflow_dispatch`), jak `mutation.yml` w aplikacji ([D26](decyzje.md#d26)). Raport trafia do artefaktu `kit-mutation-report`.

<a id="wydanie"></a>

## Wydanie nowej wersji kitu

Wersja kitu to `version` w `kit/kit.json`. Trafia do `kitVersion` każdego nowego projektu i wyznacza tag `v<wersja>`, który klonują `create` (w one-linerze z [12](12-cli-wa.md#wa-create)) oraz `add` i `list` w projektach tej wersji ([12](12-cli-wa.md#zrodlo-kitu)). Każdy moduł ma też własną `version` w manifeście; zapisuje się ona w `.wa/kit.json` projektu.

1. Podbij `version` w manifeście każdego modułu, którego pliki się zmieniły (`kit/modules/<x>.json`).
2. Podbij `version` w `kit/kit.json`.
3. `npm run wa -- kit sync`, potem `npm run wa -- generate`, i zacommituj zmiany `.wa/kit.json`.
4. Przejdź obie bramki i scal zmianę do `main`.
5. Ustaw tag `v<wersja>` na commicie wydania w `main` i wypchnij go. Tag ustawia człowiek.

Kroki 1 i 2 są tylko konwencją: nic nie sprawdza, że zmiana plików modułu podbiła jego wersję. Bez kroku 5 one-liner z `--branch v<wersja>` oraz `wa add` i `wa list` z domyślnym źródłem w projektach tej wersji kończą się błędem pobierania ([znane-ograniczenia.md](znane-ograniczenia.md#tagi-kitu)).

<a id="nowy-modul-kitu"></a>

## Jak dodać do kitu nowy moduł

Ta sekcja dotyczy modułu kitu, czyli kodu, który trafi do wielu projektów. Funkcję jednego projektu dodajesz jako moduł projektu ([tutorial 09](09-nowy-modul.md)). Feature i jego kod piszesz tak samo jak w tutorialu; różnią się rejestracja i własność plików.

1. Kod modułu w aplikacji kitu: `src/features/<x>/`, ewentualnie `prisma/schema/<x>.prisma`, trasy w `src/app/` i plik usługi Dockera. Moduł tylko dodaje pliki, nie zmienia plików rdzenia ([D03](decyzje.md#d03)).
2. Manifest `kit/modules/<x>.json` z `name` równym nazwie pliku, `version`, `description`, wzorcami `files` obejmującymi wszystkie nowe pliki, `requires`, zależnościami npm oraz `env`, `schemaRelations` i `compose`, jeśli moduł ich potrzebuje.
3. Zależności npm modułu dopisz do `package.json` kitu w tych samych wersjach co w manifeście, a ich instalację zrób przez npm 11, żeby zaktualizować `package-lock.json`.
4. `npm run wa -- kit sync` i `npm run wa -- generate`. Generator dopisze feature do rejestru i wypełni regiony.
5. Test własności (`npm test --prefix kit/cli`) musi przejść: każdy nowy plik ma jednego właściciela, a każda nowa zależność ma właściciela z tą samą wersją.
6. Dopisz moduł do macierzy `combo` w `kit.yml`, na przykład pozycję `{ name: <x>, modules: "<x>" }`.
7. Obie bramki, potem wydanie ([wyżej](#wydanie)).

Testy rdzenia, które porównują rejestr z literałem, filtrują go do modułów rdzenia (`src/test/core-modules.ts`), więc nowy moduł ich nie psuje ([D36](decyzje.md#d36)).

<a id="referencja"></a>

## Referencja

<a id="referencja-kit-json"></a>

### `kit/kit.json`

Schemat `kitConfigSchema` z `kit/cli/src/kit/kit-config.ts`. Wszystkie pola są wymagane.

| Pole | Typ | Wartość w kicie | Kto czyta |
| --- | --- | --- | --- |
| `version` | `string`, niepusty | `0.1.0` | `create` (`kitVersion` projektu, treść pierwszego commita), `add` i `list` (zgodność wersji lokalnego kitu), `kit sync` |
| `repo` | `string`, niepusty | `https://github.com/webamigos/wa-kit.git` | `create` (`kitRepo` projektu), `kit sync` |
| `kitOnly` | `string[]` wzorców | pliki tylko dla kitu ([wyżej](#kit-a-projekt)) | `create`, `add` (pomijane przy kopiowaniu), test własności |
| `placeholders` | `{ projectName, projectSlug, projectSnake }` | `WA App`, `wa-app`, `wa_app` | `create`, `add`, `kit sync` |
| `placeholderFiles` | `string[]` dokładnych ścieżek | 10 plików, od `src/shared/config/project.ts` po `README.md` | `create`, `add` |
| `generatedFiles` | `string[]` | `src/modules.generated.ts`, `src/modules.client.generated.ts`, `src/i18n/locales.generated.ts` | `create`, `add` (pomijane przy kopiowaniu), test własności |
| `managedFiles` | `string[]` dokładnych ścieżek | `package.json`, `package-lock.json` | `create`, `add` (hash `managed`) |

Uwaga na różnicę: `kitOnly` i `generatedFiles` to wzorce (`*`, `**`), a `placeholderFiles` i `managedFiles` to dokładne ścieżki.

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
| `node .wa/bin/wa.mjs create <katalog> --yes --kit .` | Próbne złożenie projektu z bieżącej kopii kitu, tak jak job `assemble`. Dodaj `--no-install --no-git`, żeby tylko obejrzeć pliki. |
