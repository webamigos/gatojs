# `wa update`: aktualizacja projektu do nowszej wersji kitu

Data: 2026-11-03 · Status: zatwierdzony przez Jakuba (2026-11-03) · Rozmowa: Jakub i Claude (brainstorming)

## 1. Po co

Kod rdzenia i modułów trafia do projektu jako zwykły kod ([D39](../../decyzje.md#d39)). Gdy kit dostaje poprawkę
(łatkę bezpieczeństwa, rozszerzenie albo zmianę zachowania w rdzeniu lub module), projekty założone wcześniej jej nie
mają. Dziś przenosi się ją ręcznie, plik po pliku, z diffu między tagami, więc w praktyce projekty poprawek nie
dostają. To główny koszt modelu kopiowania.

`wa update <wersja>` przenosi projekt z `kitVersion` zapisanej w `.wa/kit.json` na tag `v<wersja>` kitu: nakłada na
projekt różnicę kitu między tymi wersjami, zachowując lokalne zmiany projektu. Uruchamia ją deweloper albo agent
w repozytorium projektu, a wynik przegląda w `git diff` przed commitem.

## 2. Cele, nie-cele, anty-cele

**Cele**

- Jedna komenda przenosi rdzeń i wszystkie zainstalowane moduły kitu na wskazaną wersję.
- Lokalne zmiany projektu przetrwają; zmiana kitu w tych samych liniach daje konflikt z markerami, nie utratę kodu.
- Przed jakąkolwiek zmianą widać, co się stanie (`--dry-run`).
- Cofnięcie całej aktualizacji to jedna komenda gita, bo komenda startuje tylko na czystym drzewie.

**Nie-cele**

- Aktualizacja pojedynczego modułu (`wa update core`, `wa update uploads`). Projekt ma jedną `kitVersion`
  ([D46](../../decyzje.md#d46)) i `wa add` pobiera kit właśnie w tej wersji. Decyzja Jakuba: wystarczy całość.
- Wybór pojedynczych poprawek (cherry-pick). Pojedynczy plik cofa `git restore <plik>`.
- Domyślna „najnowsza wersja”. Wersja docelowa jest obowiązkowym argumentem (decyzja Jakuba).
- Migracje danych i kod migracji (jak `ng update`). Kit nie dostarcza `prisma/migrations` ([D13](../../decyzje.md#d13));
  komenda tylko podpowiada utworzenie migracji.
- Obniżanie wersji.
- `wa diff` z design docu: jego rolę pełni `--dry-run`.
- Aktualizacja `.env`.

**Anty-cele** (porażka, nawet jeśli „działa”)

- Cicha utrata lokalnej zmiany projektu (nadpisanie albo usunięcie pliku zmienionego w projekcie).
- Stan pośredni bez drogi powrotu: pół plików zaktualizowanych, `.wa/kit.json` w starej wersji, i nic nie mówi, co
  zrobić.
- Projekt z modułami w różnych wersjach kitu.

## 3. Wywołanie

```bash
npm run wa -- update <wersja> [--kit <źródło>] [--dry-run] [--no-install]
```

- `<wersja>`: wersja kitu bez `v`, na przykład `0.2.0`. Obowiązkowa, dokładnie jeden argument pozycyjny.
- `--kit <źródło>`: jak w `wa add` i `wa list` ([16-cli-wa.md](../../16-cli-wa.md#zrodlo-kitu)); bez opcji
  `WA_KIT_SOURCE`, potem `kitRepo` z `.wa/kit.json`.
- `--dry-run`: wypisuje plan i kończy się bez zmian w projekcie.
- `--no-install`: bez `npm install` na końcu.

Brak `--force`: konflikt nie jest błędem do obejścia, tylko miejscem do ręcznego scalenia.

### 3.1. Aktualizację liczy CLI wersji docelowej

Bundel projektu ma reguły swojej wersji: `REGION_FILES`, schematy `kit/kit.json` i `.wa/kit.json` (Zod obcina
nieznane pola), `projectPackageJson`, generator. Stara wersja nie może więc poprawnie policzyć planu dla nowszej.
Dlatego:

- `wa update <wersja>` w bundlu projektu sprawdza kroki 1–4 z § 4, klonuje tag docelowy i przekazuje pracę
  bundlowi z klonu: `node <klon>/.wa/bin/wa.mjs update <wersja> --from-kit <klon> …` z katalogiem projektu jako
  katalogiem roboczym i tymi samymi opcjami. Kod wyjścia procesu potomnego staje się kodem komendy.
- Bundel z `--from-kit` (opcja wewnętrzna, nieopisana w `USAGE`) wykonuje kroki 2–12 sam, własnym kodem: baza
  liczona jest regułami wersji docelowej (stripowanie regionów działa też na plikach bazy bez nowych markerów),
  `wa generate` w kroku 11 to generator wersji docelowej wywołany w procesie.
- **Pierwsza aktualizacja projektu z `v0.1.0`**: jego bundel nie zna `update`, więc dokumentacja podaje one-liner
  jak przy `create`: `KIT_DIR=$(mktemp -d) && git clone --depth 1 --branch v<wersja> <repo> "$KIT_DIR" && node
  "$KIT_DIR/.wa/bin/wa.mjs" update <wersja>` uruchamiany w katalogu projektu. Bundel uruchomiony spoza projektu
  (z klonu) wykonuje pracę sam, bo jest już wersją docelową; sprawdza tylko, że `version` jego kitu równa się
  `<wersja>` (inaczej błąd).

## 4. Kolejność (wszystkie kontrole przed pierwszym zapisem)

1. Opcje i argument. Wersja w formacie semver bez prefiksu (`<liczba>.<liczba>.<liczba>`, opcjonalnie z sufiksem
   prerelease); inaczej błąd.
2. `.wa/kit.json` (`readKitState`, jak w innych komendach).
3. Wersja docelowa różna od `kitVersion` i od niej wyższa (porównanie semver). Równa: `Projekt ma już wa-kit
   <wersja>` i kod 0. Niższa: błąd.
4. Czyste drzewo git projektu: `git status --porcelain` pusty (pliki ignorowane się nie liczą). Katalog bez
   repozytorium git: błąd. Brudne drzewo: błąd z prośbą o commit albo stash. `--dry-run` tego nie wymaga.
5. Pobranie dwóch wersji kitu: bazowej (`v<kitVersion>`) i docelowej (`v<wersja>`) — § 5.
6. Walidacja `kit/kit.json` i manifestów obu wersji.
7. Moduły:
   - każdy moduł kitu z `.wa/kit.json` musi istnieć w obu wersjach kitu; inaczej błąd (moduł usunięty albo
     przemianowany w kicie wymaga ręcznej decyzji);
   - `requires` modułów w wersji docelowej muszą być spełnione przez moduły zainstalowane; inaczej błąd z listą
     brakujących (komenda nie dodaje modułów sama);
   - `projectModules` bez zmian; ich `requires` dalej muszą być spełnione.
8. Plan dla każdego pliku (§ 6), liczony w pamięci, razem ze scaleniem treści.
9. `--dry-run`: wypisanie planu i koniec (kod 0, także gdy plan przewiduje konflikty).
10. Zapis: pliki, `package.json`, `.wa/kit.json` (§ 7). Błąd zapisu uruchamia cofanie (§ 9).
11. Bez konfliktów: `wa generate`, potem `npm install` (bez `--no-install`). Z konfliktami: oba kroki pominięte (§ 8).
12. Podsumowanie i podpowiedzi (§ 10).

## 5. Źródło kitu i treść trzech stron

- Obie wersje pobierane są przez `git clone --depth 1 --branch v<wersja>` do katalogu tymczasowego, także gdy źródłem
  jest ścieżka lokalna (klon z lokalnego repozytorium nie potrzebuje sieci). Treść pochodzi więc zawsze z tagu, nie
  z drzewa roboczego klonu. Brak tagu w źródle: komunikat jak w `add` z numerem brakującej wersji. Katalogi
  tymczasowe znikają po komendzie, także po błędzie.
- Lista plików wersji: `assemblableFiles` (bez `kitOnly` i `generatedFiles` tej wersji), przypisanie do modułów:
  `moduleFiles(manifest, available)` dla zainstalowanych modułów.
- **Baza** = plik z wersji bazowej po `applyPlaceholders` z konfiguracją wersji bazowej i nazwami z
  `.wa/kit.json` projektu. **Kit** = to samo dla wersji docelowej. **Projekt** = plik na dysku.
- Dla `package.json`: baza = `projectPackageJson(package.json kitu bazowego, manifesty bazowe zainstalowanych
  modułów, nazwy)`, kit = to samo dla wersji docelowej. Zmiana zależności albo skryptu w kicie scala się wtedy
  z lokalnymi zmianami projektu (własne skrypty, zależności modułów projektu, podbita wersja).

## 6. Plan dla pliku

Zbiór ścieżek = pliki zainstalowanych modułów w wersji bazowej ∪ w wersji docelowej, plus `package.json`.
`package-lock.json` jest wyłączony z planu.

| Baza | Kit | Projekt | Wynik | Kategoria |
| --- | --- | --- | --- | --- |
| jest | taki sam jak baza | dowolny | bez zmian | — |
| jest | inny | równy bazie | treść kitu | zaktualizowany |
| jest | inny | równy kitowi | bez zmian | — |
| jest | inny | inny niż oba | scalenie 3-way | scalony albo konflikt |
| jest | inny | brak | plik nie wraca | do decyzji: usunięty w projekcie, zmieniony w kicie |
| jest | brak | równy bazie | usunięcie | usunięty |
| jest | brak | inny niż baza | zostaje | do decyzji: zmieniony w projekcie, usunięty w kicie |
| jest | brak | brak | nic | — |
| brak | jest | brak | dodanie | dodany |
| brak | jest | równy kitowi | bez zmian | — |
| brak | jest | inny | zostaje treść projektu | konflikt: plik projektu na ścieżce nowego pliku kitu |

Szczegóły:

- **Baza niezgodna z `.wa/kit.json`.** Projekt mógł powstać z drzewa roboczego klonu, a nie z tagu (`create` i
  `add --kit <ścieżka>` nie sprawdzają tagu), więc baza z tagu może różnić się od tego, co faktycznie skopiowano.
  „Projekt równy bazie” wymaga więc dwóch warunków: hash pliku projektu równy hashowi zapisanemu w `.wa/kit.json`
  **i** hash bazy z tagu równy temu samemu hashowi. Gdy brakuje drugiego, plik idzie ścieżką „inny niż baza”
  (scalenie albo „do decyzji”), nigdy nadpisaniem ani usunięciem. Komenda wypisuje wtedy jedną linię
  `Uwaga: <n> plików różni się od v<stara> z tagu; potraktowano je jak zmienione w projekcie`.
- **Równość** liczona jak hash w `.wa/kit.json` ([D31](../../decyzje.md#d31)): dla plików z `REGION_FILES` bez treści
  regionów `wa:*`, dla pozostałych bajt w bajt.
- **Scalenie**: `git merge-file -p` (z etykietami `projekt`, `v<stara>`, `v<nowa>`) na trzech plikach tymczasowych.
  Kod wyjścia > 0 = liczba konfliktów; wynik z markerami trafia do pliku. Ujemny/inny błąd = błąd komendy przed
  zapisem.
- **Pliki z regionami**: przed scaleniem treść między markerami `wa:*` w trzech wersjach jest czyszczona, więc
  różnice regionów nie dają konfliktów; regiony wypełnia `wa generate`.
- **Pliki binarne** (bajt NUL w którejś wersji): bez scalania tekstowego; zmiana po obu stronach = konflikt, plik
  zostaje w wersji projektu.
- **Bity uprawnień**: plik zaktualizowany albo dodany dostaje bity z wersji docelowej kitu (jak `copyFiles`).
- **Ścieżki**: każda ścieżka z planu musi leżeć w projekcie po rozwiązaniu symlinków (jak `insideProject` w
  `remove`); inaczej błąd przed zapisem. Symlink na ścieżce pliku jest traktowany jak plik projektu różny od bazy.
- Plik, który zmienia właściciela między modułami, nie jest zmianą: liczy się tylko treść.
- Bundel `.wa/bin/wa.mjs` należy do `core` i aktualizuje się jak każdy plik. Uruchomiony proces ma już załadowaną
  starą wersję, więc to bezpieczne.

## 7. Co zapisuje

- Pliki według planu (dodane, zaktualizowane, scalone, z konfliktem, usunięte; po usunięciu puste katalogi jak
  w `remove`).
- `package.json` według planu.
- `.wa/kit.json`: `kitVersion` = wersja docelowa; dla każdego modułu `version` i `manifest` z wersji docelowej,
  `files` = hashe treści **kitu** (nie scalonej treści) wszystkich plików modułu w wersji docelowej, a dla plików
  z `managedFiles` znacznik `managed`. Dzięki temu po aktualizacji „plik różny od hasha” nadal znaczy „projekt
  zmienił plik kitu”, a `wa remove` i kolejny `wa update` mają właściwą bazę. Plik pozostawiony „do decyzji”
  albo nieobecny w wersji docelowej nie ma wpisu. `kitRepo`, `project`, `locales`, `projectModules` bez zmian.
- `.wa/kit.json` jest zapisywany także przy konfliktach: po rozwiązaniu markerów projekt jest w wersji docelowej.

## 8. Konflikty

- Konflikt zostawia w pliku markery `<<<<<<< projekt` / `=======` / `>>>>>>> v<nowa>` (z `|||||||` bazy, jeśli
  wybierze to builder; decyzja niżej w § 12).
- Komenda wypisuje listę konfliktów i plików „do decyzji” i kończy się kodem 1: oba wymagają decyzji człowieka,
  więc skrypt i agent dostają ten sam sygnał.
- Przy konfliktach `wa generate` i `npm install` nie są uruchamiane (markery mogą psuć regiony i `package.json`).
  Same pliki „do decyzji” nie mają markerów, więc wtedy oba kroki się wykonują, a kod wyjścia i tak wynosi 1. Ostatnie linie
  mówią, co zrobić: rozwiązać konflikty, `npm run wa -- generate`, `npm install`, commit. Cofnięcie całości:
  `git restore . && git clean -fd`.

## 9. Cofanie

Spójnie z „wszystko albo nic” ([D34](../../decyzje.md#d34)) i z `wa add`:

- Błąd w krokach 1–9 niczego nie zmienia: treść każdego pliku, łącznie ze scaleniem, powstaje w pamięci przed
  pierwszym zapisem.
- Błąd w kroku 10 (zapis) cofa zmiany jak `rollbackAdd`: przywraca oryginalną treść zmienionych i usuniętych
  plików (zapamiętaną w pamięci jako bajty), usuwa dodane pliki i utworzone katalogi, przywraca `package.json` i
  `.wa/kit.json`. Nieudany krok sprzątania: linia `Nie udało się posprzątać: <ścieżka> (<kod>)`, potem pierwotny
  błąd. Czyste drzewo git jest siatką bezpieczeństwa: komunikat błędu przypomina `git restore . && git clean -fd`.
- Błąd `wa generate` albo `npm install` (krok 11) nie cofa zmian, jak w `add`: komunikat mówi, co uruchomić.
- Konflikt nie jest błędem zapisu i nie uruchamia cofania.

## 10. Wyjście

Na stdout, po jednej linii na plik, posortowane w kategoriach:

```text
Aktualizacja wa-kit 0.1.0 → 0.2.0
  zaktualizowano src/shared/lib/auth/org-context.ts
  scalono       src/shared/lib/env.ts
  dodano        src/shared/lib/rate-limit.ts
  usunięto      src/shared/lib/legacy.ts
  konflikt      src/features/uploads/services/upload-purposes.ts
  do decyzji    src/shared/lib/old-helper.ts (zmieniony w projekcie, usunięty w kicie)
```

`--dry-run` wypisuje te same linie z nagłówkiem `Plan aktualizacji wa-kit … (bez zmian w projekcie)`.

Po udanej aktualizacji:

- gdy kit zmienił któryś plik `prisma/schema/**`: `npx prisma migrate dev --name kit-<wersja>`;
- gdy manifesty wersji docelowej mają zmienne `env`, których nie było w wersji bazowej: linia
  `Nowe zmienne w .env.example: <lista>; uzupełnij .env`.

Gdy kit nie zmienił żadnego pliku projektu, komenda i tak zapisuje `.wa/kit.json` z nową wersją.

## 11. Testy i dokumentacja

- Fiksture kitu z dwiema wersjami: repozytorium git tworzone w teście z tagami `v0.1.0` i `v0.2.0`, źródło
  `--kit <ścieżka>`; projekt składany `create` z `v0.1.0`. Przypadki z design docu: brak zmian, zmiana tylko
  w projekcie, tylko w kicie, konflikt, plik dodany, usunięty (niezmieniony i zmieniony), plik binarny, regiony,
  `package.json` (zależność podbita w kicie i w projekcie), brudne drzewo, `--dry-run` bez zmian w projekcie,
  błąd zapisu z cofaniem, brakujący `requires`, moduł usunięty z kitu, wersja równa i niższa.
- Plik krytyczny dla bramki mutacji CLI: logika planu i scalania (`kit/cli/mutation-gate.json`, wpis dopisuje
  człowiek).
- Dokumentacja: sekcja `wa update` w `docs/16-cli-wa.md` (kolejność, cofanie, komunikaty, kody wyjścia), nowa
  decyzja w `docs/decyzje.md`, aktualizacja D46 (konsekwencja „nie ma `wa update`”), `docs/znane-ograniczenia.md`
  (pozycja „Projekt nie przejdzie na nowszą wersję kitu”), `kit/README.md`, `USAGE` w `bin.ts`.

## 12. Decyzje Jakuba i decyzje Claude

**Jakub:**

- konflikt zostawia markery w pliku; komenda wymaga czystego drzewa git; podgląd przez `--dry-run`;
- aktualizacja całego projektu do jednej wersji kitu, bez aktualizacji pojedynczego modułu;
- wersja docelowa jest obowiązkowym argumentem.

**Claude (do sprawdzenia przy czytaniu):**

- tabela przypadków w § 6, w tym: plik usunięty w projekcie nie wraca; plik projektu na ścieżce nowego pliku kitu
  to konflikt bez nadpisania;
- `package.json` scalany tekstowo z bazą i kitem odtworzonymi przez `projectPackageJson`; `package-lock.json`
  tylko przez `npm install`;
- hashe w `.wa/kit.json` po aktualizacji = treść kitu, nie scalona;
- `.wa/kit.json` zapisywany także przy konfliktach; `generate` i `npm install` wtedy pominięte;
- obie wersje kitu zawsze z tagu (także z lokalnej ścieżki), nie z drzewa roboczego;
- moduł usunięty z kitu i niespełnione `requires` zatrzymują komendę przed zmianami;
- cofanie przy błędzie zapisu w pamięci, jak `rollbackAdd`;
- podpowiedzi migracji i nowych zmiennych `env`; bez zmian w `.env`;
- brak `--force`;
- aktualizację liczy bundel wersji docelowej (§ 3.1); projekt z `v0.1.0` aktualizuje się pierwszy raz one-linerem;
- plik równy zapisanemu hashowi, ale różny od bazy z tagu, traktowany jak zmieniony w projekcie;
- pliki „do decyzji” bez konfliktów: kod 1, ale `generate` i `npm install` się wykonują.

**Dla buildera:** format markerów (`merge` czy `diff3`), dokładne brzmienie komunikatów, podział na pliki w
`kit/cli/src`, sposób porównania semver (bez nowej zależności).
