# kit/README.md

Dokumentacja plików tylko kitu (`kit/`). Nie trafia do projektów. Zasady pracy nad kitem: [kit/CLAUDE.md](CLAUDE.md).

## Bootstrap projektu (`create-wa-app`)

`create-wa-app` to nazwa one-linera, nie osobnego pakietu: bundel CLI leży w repozytorium (`.wa/bin/wa.mjs`), a kit nie jest publikowany w rejestrze npm. Wymagany jest `git` z dostępem do `webamigos/wa-kit`.

```bash
KIT_DIR=$(mktemp -d) && git clone --depth 1 --branch v0.1.0 https://github.com/webamigos/wa-kit.git "$KIT_DIR" && node "$KIT_DIR/.wa/bin/wa.mjs" create <nazwa>
```

Zamiast `v0.1.0` podaj tag wersji kitu, którą chcesz.

## Moduły kitu

Opisy modułów: [docs/12-moduly-kitu.md](../docs/12-moduly-kitu.md). Manifesty leżą w `kit/modules/*.json`.

| Moduł | Co zawiera |
| --- | --- |
| `core` | Rdzeń: logowanie, organizacje, użytkownicy, konto, dashboard. Zawsze zainstalowany. |
| `audit-logs` | Dziennik zdarzeń organizacji: model `AuditLog`, strona `/audit-log`, komponent `<AuditTrail>`, zdarzenia członkostwa. Moduł nie ma retencji (usuwania starych wpisów): dziennik rośnie bez limitu. |
| `api-keys` | Klucze API organizacji: model `ApiKey`, strona `/api-keys` dla ról `owner` i `admin`, uwierzytelnianie tras `authenticateApiKey`, zakresy deklarowane przez moduły (`apiScopes`), przykładowa trasa `GET /api/v1/organization`. Wymaga zmiennej `API_KEY_PEPPER` (min. 32 znaki); `wa create` jej nie losuje, więc na produkcji ustaw własną. |
| `uploads` | Pliki organizacji na dysku albo w magazynie S3: model `Upload`, trasy `POST /api/uploads` i `GET /api/uploads/<id>`, komponent `<FileUpload>`, cele uploadu deklarowane przez moduły (`uploadPurposes`), skalowanie obrazów. `STORAGE_PROVIDER` wybiera `local` (domyślnie, katalog `STORAGE_LOCAL_PATH`) albo `s3` (zmienne `S3_*`). Lokalnie nie wymaga dodatkowej usługi; MinIO z `docker-compose.yml` startuje tylko z `--profile s3`. W produkcji `local` wymaga trwałego katalogu i jednej instancji ([docs/10-wdrozenie.md](../docs/10-wdrozenie.md#pliki-uploads)). |

## `wa create <katalog> [opcje]`

| Opcja                   | Znaczenie                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--modules a,b`         | Moduły kitu do zainstalowania. Pusty `--modules ""` (i `--yes` bez tej opcji) oznacza brak modułów, tylko rdzeń. |
| `--locales pl,en`       | Języki aplikacji; dozwolone `pl` i `en`, `pl` jest wymagany (domyślnie `pl,en`).                                 |
| `--title <tekst>`       | Nazwa wyświetlana projektu (domyślnie z nazwy katalogu).                                                         |
| `--admin-email <email>` | Adres pierwszego admina (przy `--setup` zakłada konto, inaczej trafia do wypisanych kroków).                     |
| `--yes`                 | Bez pytań: opcje, których nie podano, dostają wartości domyślne.                                                 |
| `--setup`               | Po instalacji uruchamia środowisko (Docker, migracja, admin). Nie łączy się z `--no-install`.                    |
| `--no-install`          | Pomija `npm install`.                                                                                            |
| `--no-git`              | Pomija `git init` i pierwszy commit projektu. `git` jest potrzebny i tak, do odczytu plików kitu.                |
| `--kit <ścieżka>`       | Lokalny klon wa-kit, z którego powstaje projekt.                                                                 |

Bez `--no-git` projekt dostaje `git init` i pierwszy commit, więc `git` musi mieć ustawione `user.name` i `user.email`. Pełny opis komend, kolejności kontroli, cofania i komunikatów: `docs/16-cli-wa.md` w repozytorium kitu.

## Komendy w projekcie

Uruchamiane jako `npm run wa -- <komenda>` (bundel `.wa/bin/wa.mjs`).

Źródło kitu dla `add` i `list` (`--kit` albo zmienna `WA_KIT_SOURCE`) to `https://...`, `ssh://...`, `file://...`, `git@...` albo ścieżka lokalna.

- `wa list [--kit <źródło>]`: moduły zainstalowane, dostępne w kicie i moduły projektu.
- `wa add <moduł> [--kit <źródło>] [--no-install]`: kopiuje pliki modułu i jego zależności, dopisuje zależności npm i uruchamia `wa generate`.
- `wa remove <moduł> [--force] [--no-install]`: usuwa pliki modułu, zależności npm, które nie służą innym modułom, i uruchamia `wa generate`. Pliki zmienione lokalnie (inny hash niż w stanie) zatrzymują komendę, dopóki nie podasz `--force`. Moduł wymagany przez inny moduł i moduł projektu nie zostanie usunięty.
- `wa generate`: odświeża pliki generowane (rejestr modułów, regiony w `.env.example`, schemacie, `docker-compose.yml` i region `wa:ci-integration` w `.github/workflows/ci.yml`).
- `wa kit sync`: odświeża `.wa/kit.json` z `kit/modules/*.json` i `kit/kit.json` (praca nad samym kitem).

Po `add` i `remove` zmienia się schemat bazy; migrację trzeba utworzyć i zacommitować. `add` nie zmienia `.env`: nowe zmienne modułu (na przykład `API_KEY_PEPPER`, `STORAGE_PROVIDER`, `S3_*`) trafiają tylko do regionu `wa:modules` w `.env.example`, więc skopiuj je do `.env` sam. `remove` zostawia zmienne modułu w `.env`.

### Bezpieczeństwo `wa remove`

- Usuwa wyłącznie pliki leżące wewnątrz projektu (po rozwiązaniu symlinków). Sprzątanie pustych katalogów nie usuwa symlinków i nie przechodzi przez nie. Plik modułu, który sam jest symlinkiem, jest usuwany jak zwykły plik (znika link, nie cel).
- Ufa treści `.wa/kit.json`: plik projektu, którego hash zgadza się ze stanem, zostanie usunięty. `.wa/kit.json` pochodzący z niezaufanego źródła trzeba przejrzeć przed użyciem `remove`.
- Operacja nie jest odporna na równoległe zmiany katalogu projektu przez inny proces.

## Rozwój kitu

Szczegóły: `docs/16b-rozwoj-kitu.md` w repozytorium kitu (manifesty, `wa kit sync`, własność plików, bundel, bramka, CI i wydanie).

- Bramka CLI: `npm run verify --prefix kit/cli` (lint → typecheck → testy → build bundla). W CI: job `cli` w `.github/workflows/kit.yml`.
- Po zmianie w `kit/cli/src` zbuduj bundel (`npm run build --prefix kit/cli`) i zacommituj `.wa/bin/wa.mjs` razem ze zmianą; CI sprawdza, że bundel jest aktualny.
- Po zmianie manifestów modułów (`kit/modules/*.json`) albo `kit/kit.json` uruchom `npm run wa -- kit sync`, żeby odświeżyć `.wa/kit.json`.
- Test własności plików (`kit/cli/src/kit/__tests__/ownership.test.ts`) pilnuje, że każdy plik repozytorium należy do dokładnie jednego modułu albo do `kitOnly`. Nowy plik dopisz do manifestu odpowiedniego modułu.
- Zmieniasz pliki modułu: podbij `version` w jego manifeście. Wersja kitu (`kit/kit.json`) wyznacza tag.
- Job `assemble` w `.github/workflows/kit.yml` składa projekt z kitu dla każdej kombinacji modułów (macierz `combo`), uruchamia w nim `verify`, testy integracyjne (dla kombinacji z `uploads` po uruchomieniu MinIO i utworzeniu bucketu) i budowę obrazu Dockera (kombinacje `core` i `all`) oraz sprawdza rejestrację modułu projektu. Macierz: `core`, `audit-logs`, `api-keys`, `uploads` i `all` (wszystkie moduły). Nowy moduł kitu dopisz do macierzy i do kombinacji `all`.
- Tag `v<version>` po zmergowaniu zmiany na `main` ustawia człowiek.
