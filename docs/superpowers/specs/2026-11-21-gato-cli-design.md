# `create-gato-app` i `gato-cli`: publiczne narzędzia kitu

Data: 2026-11-21. Projekt Patryka z agentem. Szkic do przeglądu, nie plan implementacji.

Źródła:

- CLI `wa` w `kit/cli` (komendy `create`, `add`, `remove`, `list`, `generate`, `kit sync`) i jego dokumentacja: `docs/16-cli-wa.md`, `docs/16b-rozwoj-kitu.md`;
- decyzje [D28](../../decyzje.md#d28) (CLI w `kit/cli`, bundel `.wa/bin/wa.mjs`, bez npm), [D29](../../decyzje.md#d29) (puste `packages/*`), [D46](../../decyzje.md#d46) (kit wydawany tagiem);
- `ragen-app/packages/create-ragen-app` (kreator instalacji, `giget`, `@clack/prompts`, zakres wersji Node, sondowanie portów, `COMPOSE_PROJECT_NAME`) i `.github/workflows/installer.yml` (smoke test spakowanego tarballa);
- `ragen-app/packages/ragen-cli` (nazwa pakietu inna niż nazwa komendy, `doctor`, `version`, test spakowanego CLI w `.github/workflows/ragen-cli.yml`);
- strona `gato-website` (`src/config/site.ts`: publiczna nazwa GatoJS, „open-source Next.js kit”).

## 1. Po co

Kit ma się stać publicznym frameworkiem GatoJS. Dziś nowy projekt zakłada się jednolinijkowcem z `git clone` prywatnego repo, a każdy projekt niesie skopiowany bundel `.wa/bin/wa.mjs`. To działa wewnątrz Web Amigos, ale nie nadaje się dla ludzi spoza firmy:

- wymaga `git` z dostępem do prywatnego repo i ręcznie wpisanego tagu;
- nie ma kreatora: nie sprawdza wersji Node ani portów, nie generuje sekretów modułów, nie pyta o provider storage;
- wersja CLI w projekcie jest plikiem w repo, którego nic nie aktualizuje, a projekt nie ma `wa update`.

Ragen rozwiązał to samo dwoma publicznymi pakietami npm. Ten spec przenosi ten układ do kitu.

## 2. Decyzje Patryka (2026-11-21)

1. Kit (rdzeń i moduły) staje się publiczny.
2. `gato-cli` trafia do projektu jako `devDependency`. Commitowany bundel `.wa/bin/wa.mjs` znika.
3. Źródła obu pakietów leżą w katalogu `packages/` repo kitu.
4. CLI ma własny semver, niezależny od wersji kitu. Zgodność pilnuje numer formatu kitu.

## 3. Dwa pakiety

| | `create-gato-app` | `gato-cli` |
| --- | --- | --- |
| Uruchomienie | `npm create gato-app@latest <katalog>` (alias `npx create-gato-app`) | `npx gato <komenda>` w projekcie (z `devDependencies`) |
| Rola | Kreator: zakłada projekt i doprowadza go do działającego `npm run dev` | Cykl życia projektu: `add`, `remove`, `list`, `generate`, `doctor`, później `upgrade` |
| Komenda | `create-gato-app` | `gato` |
| Zależy od | `gato-cli` (biblioteka składania projektu) | `zod` |

Jedna implementacja składania projektu: kod `create` z `kit/cli` przechodzi do `gato-cli` jako eksportowana funkcja (`createProject`), a `create-gato-app` dokłada tylko interfejs kreatora i kroki środowiska. To ta sama lekcja co w Raganie (`ragen create` deleguje do `create-ragen-app`, a nie kopiuje kreatora), tylko w odwrotnym kierunku. Dzięki temu `gato add` i `create` korzystają z tych samych reguł kopiowania, placeholderów i hashy.

`gato` poza projektem (brak `.wa/kit.json`) nie składa projektu, tylko wypisuje `npm create gato-app@latest <katalog>`.

### 3.1 Nazwy w npm

- `gato` jest zajęte (inny pakiet). `gato-cli`, `create-gato-app`, `gatojs` i scope `@gatojs` były wolne 2026-11-21.
- Filtr podobieństwa npm odrzucił w Raganie nazwę `ragen` (403), więc nazwy trzeba zarezerwować od razu, publikując wersje `0.0.0` z samym README. Jeśli npm odrzuci `gato-cli`, zapasowo `@gatojs/cli`; komenda `gato` się nie zmienia, bo `bin` nie zależy od `name`.
- Scope `@gatojs` zakładamy jako organizację npm z dwiema osobami z uprawnieniami publikacji.

## 4. `packages/` w repo kitu

### 4.1 Dwa rodzaje pakietów

- **Narzędzia kitu** (`packages/gato-cli`, `packages/create-gato-app`): publikowane w npm, **nie trafiają do projektów** (lista `kitOnly` w `kit/kit.json`). Projekt dostaje `gato-cli` z npm.
- **Pakiety projektu** (później: `env`, `observability`, `connector-guard`): kopiowane do projektu jako pliki rdzenia albo modułu. Poza zakresem tego specu, ale infrastruktura z 4.2 ma je obsłużyć bez zmian.

### 4.2 Infrastruktura workspace'ów (nowa decyzja zamiast D29 i części D28)

- `kit/cli` przechodzi do `packages/gato-cli` bez zmiany zachowania (pierwszy krok, osobny PR).
- Root `package.json` kitu ma `workspaces: ["packages/*", "apps/*"]` jak dziś. Lockfile kitu obejmuje pakiety narzędziowe. `create` dopasowuje lockfile projektu przez `npm install`, tak jak dziś.
- `Dockerfile`: etap `deps` kopiuje `packages/*/package.json` przed `npm ci` (wzorzec Ragena i jego test `a-scoped-dockerfile-installs-every-workspace-dep`). Do testów architektury kitu dochodzi test pilnujący tego wzorca.
- ESLint: `packages/**` przestaje być ignorowane; każdy pakiet ma własny `eslint.config.mjs` (do czasu pakietu `eslint-config`).
- `npm run verify` kitu obejmuje pakiety przez `turbo run test typecheck lint build`. Bramka `npm run verify --prefix kit/cli` znika razem z `kit/cli`.
- Stryker i `mutation-gate.json` pakietu `gato-cli` przechodzą z `kit/cli` bez zmiany progów i plików krytycznych.

## 5. Pobieranie kitu bez gita

- Źródłem jest tarball tagu z GitHuba (`https://codeload.github.com/<owner>/<repo>/tar.gz/refs/tags/v<wersja>`), bez logowania i bez `git`. Tarball zawiera dokładnie pliki śledzone przez git, więc zastępuje `git ls-files` z `listKitFiles`. Plik `.gitattributes` z `export-ignore` może dodatkowo wyciąć `docs/` i `packages/` z tarballa, żeby był mniejszy.
- Lokalny klon (`--kit <ścieżka>`, `GATO_KIT_SOURCE`) zostaje dla pracy nad kitem i dla CI.
- Sumy kontrolne: CLI zapisuje w `.wa/kit.json` sha commita tagu (z nagłówka odpowiedzi albo z API GitHuba), żeby `gato doctor` i `upgrade` wiedziały, z czego projekt powstał.
- Wersja kitu domyślna dla `create`: najnowsze GitHub Release, którego `kitFormat` CLI obsługuje (API GitHuba bez tokenu; przy limicie zapytań komunikat z `--kit-version <wersja>`). `--kit-version` i `--kit` nadpisują.

## 6. Wersje i zgodność

- `kit/kit.json` dostaje `kitFormat` (liczba całkowita, start `1`). Format zmienia się, gdy zmienia się kontrakt czytany przez CLI: schemat manifestu, `.wa/kit.json`, regiony `wa:*`, układ plików generowanych.
- `gato-cli` deklaruje obsługiwane formaty (`SUPPORTED_KIT_FORMATS`). Projekt albo kit w formacie spoza listy kończy komendę błędem: `Ten projekt używa formatu kitu <n>; zaktualizuj gato-cli (npm i -D gato-cli@latest)` albo, dla formatu starszego niż obsługiwane, wskazaniem ostatniej wersji CLI, która go zna.
- `create-gato-app` przypina w projekcie `gato-cli` na `^<swoja wersja>` (oba pakiety wydawane razem, gdy zmienia się kod wspólny).
- `.wa/kit.json` zapisuje `kitFormat` i `cliVersion` z chwili ostatniej operacji.

## 7. `create-gato-app`: kreator

Kolejność za Ragenem: najpierw wszystko, co może odmówić bez skutków ubocznych, potem pobranie i zapis.

1. **Node:** zakres z `engines` kitu sprawdzony przed pobraniem. Odmowa mówi „za stary”, „nieobsługiwana linia nieparzysta” albo „za nowy”, a nie samo „wymaga Node X”. `--skip-install` zamienia odmowę w ostrzeżenie (kreator wtedy niczego nie uruchamia).
2. **Katalog i slug:** reguły z dzisiejszego `wa create` (`SLUG_PATTERN`, pusty katalog), plus walidacja i escapowanie `--title` i `--admin-email` (dziś niewalidowane, opisane w `docs/16-cli-wa.md`).
3. **Pytania** (`@clack/prompts`, z `--yes` wartości domyślne): moduły z opisami z manifestów wybranej wersji kitu, języki, nazwa, e-mail admina, provider storage, gdy wybrano `uploads` (`local` albo `s3` z adresem i kluczami), setup.
4. **Składanie:** `createProject` z `gato-cli` (pliki, placeholdery, hashe, `package.json` z `gato-cli` w `devDependencies`, `wa generate`).
5. **Sekrety:** każda zmienna manifestu z nowym polem `generate` (`secret-32`, `secret-64`) dostaje losową wartość w `.env`; dziś tylko `BETTER_AUTH_SECRET`, a `API_KEY_PEPPER` zostaje przykładowy i blokuje produkcję.
6. **Docker:** `COMPOSE_PROJECT_NAME` ze slugu w `.env` (dwa projekty o tej samej nazwie katalogu się nie zderzą) i sondowanie portów z `docker-compose.yml` (plus profili, które kreator uruchamia) przed `docker compose up`. Zajęty port kończy się propozycją zmiennych `*_PORT`.
7. **Git, `npm install`, pierwszy commit, setup** (`migrate`, `admin:create`) jak dziś (D35).
8. **Kolejne kroki** na końcu, tylko to, czego kreator nie zrobił.

Flagi: zestaw z `wa create` plus `--kit-version`, `--skip-docker`, `--skip-install`.

## 8. `gato-cli`: komendy

| Komenda | Stan | Uwagi |
| --- | --- | --- |
| `gato add`, `remove`, `list`, `generate` | z `wa` | `npm run wa -- x` → `npx gato x`; skrypt `wa` w `package.json` zostaje jako alias przez jeden minor, potem znika |
| `gato doctor` | nowa | Node w zakresie, `kitFormat` obsługiwany, pliki generowane aktualne, hashe plików rdzenia (lista zmienionych lokalnie), `.env` przechodzi `checkEnv` projektu, Docker i porty. Kod wyjścia ≠ 0 przy błędzie. Wzór: `ragen doctor` |
| `gato version`, `--help` | nowa | Wersja z `package.json`; nieznana komenda kończy się kodem 1 |
| `gato kit sync` | z `wa`, ukryta | Działa tylko w repo kitu |
| `gato upgrade` | później | Przejście projektu na nowszą wersję kitu z trójstronnym porównaniem po hashach z `.wa/kit.json`. Osobny spec |

Komunikaty: patrz pytanie otwarte 2.

## 9. Publikacja i CI

- Workflow `release-packages.yml` reaguje na tag `gato-cli@<wersja>` albo `create-gato-app@<wersja>` ustawiony przez człowieka (jak D46), publikuje z `--provenance` przez npm trusted publishing (OIDC, bez `NPM_TOKEN` w sekretach).
- Workflow `packages.yml` na PR i `main`, wzorowany na `ragen-cli.yml` i `installer.yml`:
  - `npm pack` każdego pakietu i instalacja z tarballa;
  - `gato --version` równe wersji z `package.json`; nieznana komenda kończy się kodem ≠ 0;
  - `create-gato-app` składa projekt z commita pod testem (`--kit <checkout>`, `--yes`, `--skip-docker`) dla zestawów modułów z joba `assemble`, a skrypt asercji sprawdza wynik (sekrety wygenerowane, `gato-cli` w `devDependencies`, brak `.wa/bin`, `npx gato doctor` bez błędów konfiguracji);
  - odmowa na Node spoza zakresu.
- Job `assemble` w `kit.yml` przechodzi na `create-gato-app` ze spakowanego tarballa.

## 10. Kit publiczny: warunki wstępne

- Licencja (Ragen: Apache-2.0 z `NOTICE`), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- Skan całej historii na sekrety (trufflehog na pełnej historii, nie tylko na diffie) przed zmianą widoczności.
- Nazwa repo (`webamigos/wa-kit` czy `webamigos/gato`) i przekierowanie dla istniejących projektów (`kitRepo` w `.wa/kit.json`).
- Przegląd plików pod kątem danych klientów i wewnętrznych odnośników (ClickUp, nazwiska w planach w `docs/superpowers/`).

## 11. Kolejność prac

1. Rezerwacja nazw w npm (`0.0.0`) i organizacja `@gatojs`. Ręcznie, człowiek.
2. Infrastruktura `packages/` i przeniesienie `kit/cli` → `packages/gato-cli` bez zmiany zachowania. Nowa decyzja zamiast D29 i części D28.
3. `kitFormat`, źródło tarball z GitHuba, `gato-cli` jako `devDependency` zamiast bundla, alias `wa`.
4. `create-gato-app`: kreator z punktu 7.
5. `gato doctor`, `gato version`.
6. Workflowy publikacji i smoke testy z punktu 9.
7. Upublicznienie kitu (punkt 10) i pierwsze wydanie w npm.

Punkty 2–6 mogą powstawać przy prywatnym repo: CI używa `--kit <checkout>`, a tarball z GitHuba działa z tokenem (`GATO_GITHUB_TOKEN`) do czasu upublicznienia.

## 12. Pytania otwarte

1. **Katalog `.wa/` i nazwy `wa:*`:** zmienić na `.gato/` i `gato:*` przed pierwszym wydaniem publicznym (CLI czyta oba przez okres przejściowy), czy zostawić `wa` jako nazwę wewnętrzną?
2. **Język komunikatów CLI:** dziś po polsku. Publiczne narzędzie po angielsku (jak strona), polski przez `--lang pl` / `LANG`, czy zostaje polski?
3. **Język dokumentacji kitu** (`docs/` po polsku) po upublicznieniu: osobny serwis dokumentacji po angielsku (strona wspomina Mintlify) czy `docs/` w obu językach?
4. **Istniejące projekty z `.wa/bin/wa.mjs`:** czy są takie u klientów? Jeśli tak, potrzebna jest komenda migracji albo instrukcja (zamiana bundla na `devDependency`).
5. **Licencja:** Apache-2.0 jak Ragen czy MIT?
