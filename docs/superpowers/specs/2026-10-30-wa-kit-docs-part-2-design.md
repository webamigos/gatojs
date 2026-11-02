# wa-kit — dokumentacja, część 2: moduły kitu, warstwa szwów i CLI

Data: 2026-10-30 · Status: do przeglądu przez Jakuba

Ten dokument rozszerza [spec części 1](2026-10-27-wa-kit-docs-design.md). Wszystko, czego tu nie zmieniono, obowiązuje z części 1: odbiorca, język, format, źródła prawdy, nagłówek plików, język ponadczasowy, sekcje „Referencja”, fragmenty kodu z repozytorium, linki tylko do plików śledzonych przez git, rejestr decyzji i weryfikacja (§4 i §6 części 1).

## 1. Po co

Po części 1 do kitu doszły dwie rzeczy, których dokumentacja nie opisuje na poziomie części 1:

- **CLI `wa` z planu 2** (`wa create`, `add`, `remove`, `list`, `kit sync`) wraz z `kit/kit.json`, manifestami `kit/modules/*.json`, hashami, placeholderami i bundlem `.wa/bin/wa.mjs`. Dokumentacja odsyła do krótkiej ściągi w `kit/README.md`, a kilka plików i decyzji (D02, D03, D04, 02b, 07) opisuje stan sprzed planu 2.
- **Moduły z planu 3** (`audit-logs`, `api-keys`, `uploads`) i nowe punkty wejścia w rdzeniu (`trackAudit`, `auditSinks`, `auditActions`, `apiScopes`, `uploadPurposes`, `ciSteps`). Opisuje je jeden plik `docs/12-moduly-kitu.md` (231 linii), napisany w trakcie planu 3, bez osobnej weryfikacji według procesu z części 1.

Jakub chce dla nich dokumentacji tak szczegółowej jak opis feature rdzenia w `05-moduly-rdzenia.md`, napisanej tym samym procesem co część 1.

## 2. Odbiorca i sytuacje

Odbiorca jak w części 1: deweloper Web Amigos. Dokumentacja modułów obsługuje trzy sytuacje, równie ważne (decyzja Jakuba):

1. **Decyzja**, czy dodać moduł do projektu klienta: co daje, czego wymaga, co zmienia w rdzeniu, kiedy go nie dodawać.
2. **Instalacja i konfiguracja**: `wa create --modules` albo `wa add`, migracja, zmienne, usługi Dockera, wdrożenie, usunięcie (`wa remove`).
3. **Użycie z własnego kodu**: zapis zdarzenia przez `trackAudit` i deklaracja `auditActions`, ochrona trasy kluczem API i `apiScopes`, własny cel uploadu i `<FileUpload>`; zachowanie tego kodu, gdy modułu w projekcie nie ma.

## 3. Cele, nie-cele, anty-cele

**Cele**

- Opis stanu kodu z `main` po scaleniu planu 3 (commit `76ca2d7` albo nowszy, wpisany w nagłówek każdego pliku).
- Każdy moduł planu 3 ma opis na poziomie `05-moduly-rdzenia.md` (decyzja Jakuba), w szkielecie z §5.2.
- Warstwa szwów ma jeden spójny opis: jak moduł trafia do projektu i jak łączy się z aplikacją (decyzja Jakuba co do znaczenia pojęcia „warstwa szwów”: „jak moduły są dodawane i łączone z aplikacją”).
- CLI ma opis użycia w projekcie i opis pracy nad samym kitem.
- Pliki części 1 i rejestr decyzji są zgodne z kodem po planach 2 i 3.
- Z samego pliku modułu deweloper potrafi zdecydować, zainstalować moduł i użyć go we własnym kodzie, bez czytania kodu modułu (kryterium sukcesu zaproponowane po researchu, Jakub uznał je za dobre).

**Nie-cele**

- Funkcje niezrobione: moduły `worker` i `legal`, `wa update`, `wa diff`, aktualizacja projektu do nowszej wersji kitu. Zostają w tabeli planów w `docs/README.md`.
- Zmiany w kodzie. Rozbieżności idą do notatki rozbieżności (§7), jak w części 1.
- Strona internetowa z dokumentacją, wersja angielska, dokumentacja w projektach klientów.

**Anty-cele (porażka mimo powstania plików)**

- Opis planu 3 albo specu zamiast kodu.
- Przykłady wymyślone na potrzeby dokumentu zamiast fragmentów repozytorium albo kodu z prawdziwego przebiegu.
- Brak odpowiedzi na pytanie, co się dzieje, gdy modułu w projekcie nie ma.
- Ostrzeżenie o bezpieczeństwie (na przykład `Cache-Control`, pepper, redakcja danych) schowane tylko w Referencji zamiast przy zachowaniu, którego dotyczy.
- Plik modułu, którego nie da się czytać samodzielnie, bo każde zdanie odsyła gdzie indziej.

## 4. Ograniczenia

- Obowiązuje §4 części 1. Kolejność źródeł prawdy: kod → testy → `AGENTS.md`/`CLAUDE.md`/`kit/CLAUDE.md` → specy i plany (w tym plan 2, plan 3 i [spec planu 3](2026-10-28-wa-kit-plan-3-modules-design.md)) → notatki.
- Istniejąca treść o modułach i CLI jest tylko materiałem wejściowym, nie źródłem prawdy:
  - `docs/12-moduly-kitu.md` i dopiski planu 3 w `09b`, `01`, `02b`, `07`, `10`;
  - szkic CLI z 2026-10-29 w katalogu `docs/superpowers/notes/2026-10-30-docs-part-2-cli-draft/` (pliki `12-cli-wa.md`, `12b-rozwoj-kitu.md` i łatka `docs-edits.patch` z decyzjami D28–D36 i poprawkami kilku plików, liczona względem `5b2d308`); jego błędy i luki opisuje [notatka recenzji szkicu](../notes/2026-10-30-docs-part-2-draft-review.md).
- Zachowanie, które opisuje dokument, sprawdza się w kodzie i w testach. Gdzie da się je bezpiecznie uruchomić (bundel CLI w katalogu tymczasowym, `wa create` z modułami, `wa add`/`wa remove` na fiksturze), wykonawca je uruchamia i oznacza „(sprawdzone)”.
- Lokalna baza i MinIO: tylko kontenery wskazane w planie (wzór: `wa-kit-db-1` na porcie 5439, baza `*_test`; `wa-kit-minio-test` na 9100). Bez resetów innych baz.
- Tag `v0.1.0` (z adnotacją, na `76ca2d7`) jest na GitHubie od 2026-10-30 (decyzja Jakuba). Podstawową drogą założenia projektu w dokumentacji jest one-liner z `git clone --branch v0.1.0`; lokalny klon z `--kit` to droga dla pracy nad kitem i bez dostępu do sieci. Przebiegi „(sprawdzone)” CLI wykonuje się na klonie z GitHuba. Klonowanie tagu z adnotacją przy `--depth 1` wypisuje ostrzeżenie gita i komunikat o odłączonym HEAD (sprawdzone); dokumentacja to wyjaśnia.
- Commit na prośbę Jakuba. Praca na gałęzi `docs/part-2` (worktree `.claude/worktrees/docs-part-2`), pull request do `main`.

## 5. Struktura i zakres plików

### 5.1. Nowe pliki

Układ to propozycja wykonawcy specu, zaakceptowana przez Jakuba w rozmowie jako kierunek. Numery są stałe, bo inne pliki do nich linkują.

| Plik | Typ (Diátaxis) | Zakres |
| --- | --- | --- |
| `12-moduly-kitu.md` | wyjaśnienie + referencja | Przepisany od nowa. Czym moduł kitu różni się od rdzenia i od funkcji projektu; lista modułów z jednym zdaniem i macierzą zależności; **warstwa szwów** (§5.3); wspólne zasady modułów (izolacja organizacji, tryb serwisowy, moduł nie edytuje rdzenia); jak wybrać moduły dla projektu. |
| `13-modul-audit-logs.md` | wg szkieletu §5.2 | Moduł `audit-logs`. |
| `14-modul-api-keys.md` | wg szkieletu §5.2 | Moduł `api-keys`. |
| `15-modul-uploads.md` | wg szkieletu §5.2 | Moduł `uploads`. |
| `16-cli-wa.md` | how-to + referencja | CLI w projekcie: `wa create`, `add`, `remove`, `list`, źródło kitu, cofanie i jego granice, bezpieczeństwo `remove`, komunikaty i kody wyjścia. `wa generate` zostaje w 02b. |
| `16b-rozwoj-kitu.md` | wyjaśnienie + how-to + referencja | Praca nad repozytorium kitu: `kit/kit.json`, manifesty, `wa kit sync`, test własności plików i zależności, hashe, placeholdery, bundel CLI, bramka i mutacje CLI, CI kitu (`kit.yml`, macierz `assemble`), wydanie i tagi, jak dodać do kitu nowy moduł. |

Wykonawca może podzielić plik modułu na część „b”, jeśli przekroczy około 500 linii (reguła z części 1).

### 5.2. Szkielet pliku modułu (13, 14, 15)

Szkielet powstał z researchu dobrych dokumentacji modułów (Rails Guides „Active Storage Overview”, Laravel „Sanctum”, Django „Customizing authentication”, Medusa „Modules”, szablony The Good Docs Project, zasady Write the Docs). Jakub uznał go za dobry. Kolejność sekcji jest stała we wszystkich trzech plikach:

1. Nagłówek z części 1: „Po przeczytaniu będziesz wiedzieć”, „Zweryfikowano z kodem”, „Źródła”.
2. **Co robi moduł i kiedy go nie dodawać.** Problem, który rozwiązuje, w kilku zdaniach; czego nie robi (na przykład brak retencji w `audit-logs`).
3. **Wymagania.** Wymagane moduły, usługi (MinIO), zmienne środowiskowe, zależności npm.
4. **Instalacja i usunięcie.** `wa create --modules` / `wa add`, migracja, zmienne, Docker lokalnie, CI, wdrożenie; `wa remove` i co zostaje (dane w bazie, pliki w magazynie, zależności).
5. **Co moduł dodaje do aplikacji.** Na poziomie `05-moduly-rdzenia.md`: manifest, tabele (tabela modeli z polami, indeksami i zachowaniem przy usunięciu organizacji/użytkownika), trasy i strony, trasy API, komponenty, komendy i query z jednym zdaniem o każdej, dostęp według ról (z odnośnikiem do macierzy w 04), namespace i18n.
6. **Szwy modułu.** Co moduł wpina w każdy szew z §5.3 i każdy punkt wejścia opisany jako kontrakt (wzór: Django): co implementuje albo deklaruje kod korzystający z modułu, co i kiedy woła rdzeń albo moduł, wartości domyślne, zachowanie bez modułu, ostrzeżenia.
7. **Użycie z własnego kodu.** Osobna sekcja na każdy scenariusz (wzór: Sanctum), z fragmentem kodu z repozytorium albo z prawdziwego przebiegu.
8. **Bezpieczeństwo i izolacja organizacji.** Także przy zachowaniach w sekcjach 5–7, w miejscu, którego dotyczą; tu zebrane w jednej liście z odnośnikami.
9. **Testowanie własnego kodu z modułem.** Jak testy projektu postępują z modułem (mocki I/O, baza `_test`, MinIO w testach integracyjnych, test izolacji).
10. **Typowe problemy.** Objaw → przyczyna → co zrobić.
11. **Referencja.** Tabele: pola deklaracji w `module.ts`, zmienne env, trasy API z kodami odpowiedzi, akcje audytu, zakresy, cele uploadu, komunikaty błędów.

### 5.3. Warstwa szwów (rdzeń `12-moduly-kitu.md`)

Jedna sekcja opisuje drogę modułu od kitu do działającej funkcji, w kolejności, w jakiej deweloper ją przechodzi:

1. **Manifest** `kit/modules/<x>.json`: które pola czyta która komenda (szczegóły pól w 02b i 16b).
2. **Wybór i kopiowanie**: `wa create --modules`, `wa add`, `wa remove` (szczegóły w 16).
3. **Szwy generowane**: rejestr (`modules`, `clientModules`, `moduleEnvSchemas`, `authPlugins`, `authClientPlugins`, `auditSinks`, `moduleMessages`, `locales`) i regiony `wa:relations`, `wa:modules`, `wa:services`, `wa:ci-integration` (szczegóły w 02b).
4. **Punkty wejścia w kodzie rdzenia i deklaracje w `module.ts`**: `trackAudit`/`auditActor` (`src/shared/lib/audit.ts`), `auditActions`, `apiScopes`, `uploadPurposes` (`src/shared/lib/modules/define-module.ts`) oraz każdy inny punkt wejścia, który wykonawca znajdzie w kodzie (na przykład zmiany w `use-service-mode-action.tsx`). Dla każdego: kontrakt i zachowanie, gdy modułu nie ma.
5. **Diagram** (mermaid) drogi: manifest → CLI → pliki projektu → `wa generate` → rejestr i regiony → rdzeń woła moduł.

`AGENTS.md` (sekcja „Moduły i pliki generowane”) zostaje źródłem reguł; dokument je wyjaśnia, nie przepisuje. Jeśli `AGENTS.md` nie wymienia nowego szwu, to rozbieżność do notatki (§7).

### 5.4. Zmiany w istniejących plikach

- `README.md`: spis plików, ścieżki czytania (co najmniej: „zakładam projekt i dobieram moduły”, „używam modułu w swoim kodzie”, „rozwijam kit”), słownik (manifest modułu, moduł projektu, bundel CLI, źródło kitu, plik tylko dla kitu, placeholder, hash pliku i plik zarządzany, szew i punkt wejścia), tabela planów, akapit o CLI.
- `decyzje.md`: wpisy dla decyzji planu 2 (D1–D12 planu, w tym puste statyczne workspaces) i planu 3 (rozproszonych w specu planu 3: §4 „Kształt pracy” i bloki „Moje decyzje” w §5–§7; plan wylicza je sam), od D28 wzwyż. Według reguły „Statusy i numeracja” z `decyzje.md`: decyzja, której treść się zmieniła, dostaje status `zastąpiona przez Dxx` i nowy wpis (na pewno D01 — plan 3 wprowadził punkty rozszerzeń — i D02 — własność plików w manifestach `kit/modules/`); wpis, w którym zmieniły się tylko fakty (na przykład lista plików generowanych w D04, lista języków w D27), jest poprawiany w miejscu. Odnośniki `decyzje.md#dNN` w innych plikach wskazują wtedy decyzję obowiązującą. Każdy wpis z polami z części 1, „jak egzekwowana” sprawdzone w kodzie.
- `02`, `02b`: CLI i `kit/` w mapie katalogów, słownik, przykład `.wa/kit.json`, schemat `kitStateSchema` i manifestu (z `ciSteps`), pliki generowane (z `locales.generated.ts`), komunikaty generatora, lista sytuacji, w których uruchomić generator.
- `05`, `06`, `03`, `04`, `04b`: tylko tam, gdzie plan 3 zmienił rdzeń (na przykład `use-service-mode-action.tsx`, `define-module.ts`, nowe trasy API). Wykonawca ustala zakres porównaniem `git diff <commit z nagłówka>..HEAD -- <źródła pliku>`.
- `07`: dodawanie języka po `locales.generated.ts`; zmienne modułów.
- `08`, `08b`: testy CLI, bramka mutacji CLI, MinIO w testach integracyjnych, testy rdzenia filtrowane do modułów rdzenia.
- `09`, `09b`: wejście `.wa/kit.json` z aktualnymi polami; dopiski planu 3 w 09b sprawdzone i ewentualnie przeniesione do plików modułów (09b zostaje tutorialem funkcji projektu, z odnośnikami do 13–15).
- `10`: wdrożenie z modułami (zmienne, MinIO/S3, `ci-integration`).
- `11`: CLI, praca nad kitem, trzy pliki generowane, słowo „Obecnie”.
- `znane-ograniczenia.md`: pozycje CLI i modułów, sprawdzone w kodzie. Tag jest ustawiany ręcznie przy każdym wydaniu, więc ryzyko wersji bez tagu zostaje jako pozycja (bez wysokiego priorytetu).
- `kit/README.md`: bramka CLI z lintem; odnośnik do 16 i 16b. To jedyna zmiana poza `docs/`.

### 5.5. Materiał wejściowy

- [Notatka recenzji szkicu](../notes/2026-10-30-docs-part-2-draft-review.md): 28 niezgodności, lista pominiętych zachowań i fakty ustalone przy uruchomieniu.
- Szkic CLI (poza repozytorium; plan wskazuje, skąd go wziąć) i obecny `docs/12-moduly-kitu.md`.
- Spec i plan planu 3, wątki review PR webamigos/wa-kit#6–#8 (rozwiązane 2026-10-30), komunikaty commitów.

## 6. Weryfikacja

Jak §6 części 1, z uzupełnieniami:

- Każdy plik: przeczytanie źródeł i testów, skrypt kontrolny (ścieżki, linki, kotwice, dosłowność fragmentów kodu, `npm run`, słowa zakazane; skrypt rozumie też `npm run … --prefix kit/cli`), świeży recenzent według szablonu F z planu części 1.
- **Przebiegi na kopii** (w katalogu tymczasowym): `wa create` z każdym modułem i ze wszystkimi naraz, `wa add` i `wa remove` modułu, `wa list`. Z ich wyników pochodzą fragmenty „(sprawdzone)” w 12–16.
- **Przejście „użycie z własnego kodu”** dla każdego modułu na roboczej kopii projektu: na przykład feature projektu zapisujący zdarzenie przez `trackAudit`, trasa chroniona kluczem API z własnym zakresem, własny cel uploadu z `<FileUpload>`. Przejście musi zakończyć się zielonym `npm run verify` (i testem integracyjnym, gdzie dotyczy). Kod z przejścia może trafić do dokumentu jako przykład, jak tutorial w części 1. Zakres przejść ustala plan.
- Na koniec przegląd całości: czy każdy plik modułu ma wszystkie sekcje szkieletu i czy pliki 12–16 są zgodne ze sobą i z 02b.

## 7. Rozbieżności

Nowa notatka `docs/superpowers/notes/2026-10-30-docs-part-2-discrepancies.md` w formacie notatki z części 1. Wykonawca nie poprawia kodu; na koniec Jakub dostaje streszczenie.

## 8. Do decyzji wykonawcy

- Sformułowania, kolejność podsekcji wewnątrz sekcji szkieletu, liczba diagramów.
- Podział pliku na „b” przy przekroczeniu około 500 linii.
- Wybór fragmentów kodu i scenariuszy użycia, o ile pochodzą z repozytorium albo z prawdziwego przebiegu.
- Kolejność zadań w planie, z jednym wymogiem: najpierw pliki 12 i 16/16b (warstwa szwów i CLI), bo pliki modułów do nich linkują.

## 9. Decyzje podjęte przeze mnie (do sprawdzenia przez Jakuba)

- Numeracja i nazwy plików 12–16b; plik 12 przepisany zamiast dopisywany.
- Szkic CLI i obecny `12-moduly-kitu.md` jako materiał wejściowy, nie baza do poprawek.
- `wa generate` zostaje w 02b, a 16 do niego odsyła.
- Przejścia „użycie z własnego kodu” na roboczej kopii, z zielonym `npm run verify`, jako wymóg weryfikacji.
- Notatka recenzji szkicu i sam szkic CLI zapisane w repozytorium (`docs/superpowers/notes/`), żeby plan mógł do nich linkować i żeby nie zginęły.
- Zmienione decyzje D01 i D02 dostają status „zastąpiona” i nowe wpisy, zgodnie z regułą rejestru; poprawki faktów w miejscu.
- `kit/README.md` jako jedyny plik poza `docs/`, który się zmienia.
