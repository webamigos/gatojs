# Dokumentacja wa-kit

Ta dokumentacja jest dla dewelopera Web Amigos, który pracuje na wa-kit albo w projekcie zbudowanym z kitu. Zakłada, że znasz Next.js, TypeScript i Prismę. Nie zakłada znajomości better-auth, historii projektu ani procesu testów: każde pojęcie jest wyjaśnione przy pierwszym użyciu albo ma odnośnik do miejsca, które je wyjaśnia ([słownik](#slownik)). Agenci AI korzystają z tej samej dokumentacji przez wskazanie w `AGENTS.md`, ale nie są głównym odbiorcą.

Zweryfikowano z kodem: 25adbb8, 2026-10-28 (dotyczy dokumentów 01–11; dokument 12 ma własny nagłówek „Zweryfikowano z kodem”)

## Czego dotyczy

Dokumentacja opisuje kod z gałęzi `refactor/app-url` po commicie `4a6ffcb` (koniec planu superadmina). Każde twierdzenie o zachowaniu kodu jest sprawdzone w kodzie i wskazuje plik źródłowy. Gdy kod, testy i `AGENTS.md` się różnią, dokumentacja idzie za kodem, potem za testami, potem za `AGENTS.md` i `CLAUDE.md`, a na końcu za specami, planami i notatkami.

Dokumentacja leży tylko w repozytorium kitu `webamigos/wa-kit`. Opisuje najnowszą wersję kitu, a nie wersję Twojego projektu: wersję projektu podaje `.wa/kit.json`. Jeśli projekt jest starszy niż kit, część opisanych zachowań może w nim wyglądać inaczej.

### Jak czytać pliki

Każdy plik numerowany zaczyna się tak samo:

- „Po przeczytaniu będziesz wiedzieć:” z 3–6 punktami, żebyś zdecydował, czy to ten plik;
- linia „Zweryfikowano z kodem: `<commit>`, `<data>`”;
- lista „Źródła:” z plikami, które plik opisuje.

Ten nagłówek pozwala sprawdzić, czy plik się zestarzał. Podstaw commit z jego nagłówka i ścieżki z listy „Źródła:”, a `git log` pokaże zmiany w opisywanym kodzie od tamtej pory:

```bash
git log 4a6ffcb..HEAD -- <ścieżki ze źródeł>
```

Plik, którego źródła się zmieniły, trzeba sprawdzić ponownie. Poza nagłówkiem obowiązuje kilka stałych reguł:

- Pliki 02, 03, 04, 07 i 08 oraz każdy plik z literą „b” kończą się sekcją „Referencja” z materiałem do wyszukiwania: tabelami, listami pól i macierzami. Tekst nad nią wyjaśnia, a sekcja służy do szukania.
- Fragment kodu z repozytorium ma nad blokiem linię ze ścieżką pliku, a w bloku tekst dosłowny. Pominięcie oznacza osobna linia `// …` albo `# …`. Kod w tutorialu ([09](09-nowy-modul.md), [09b](09b-implementacja-i-bramki.md)) pochodzi z prawdziwego przebiegu na kopii roboczej, a każdy fragment wskazuje istniejący wzorzec.
- „(sprawdzone)” przy zachowaniu znaczy, że potwierdziło je uruchomienie kodu z repozytorium: skryptu, zbudowanego serwera albo lokalnego odbiornika. Bez tego oznaczenia zachowanie wynika z czytania kodu.
- Powody decyzji są w [decyzje.md](decyzje.md): `[D07](decyzje.md#d07)` prowadzi do wpisu z kontekstem, odrzuconymi alternatywami i opisem tego, co pilnuje, żeby decyzja była przestrzegana.
- Pliki 01–11 opisują stan kodu bez słów „dziś” i „obecnie”: datę i stan niesie nagłówek. Plany pojawiają się tylko w tym pliku i w [znane-ograniczenia.md](znane-ograniczenia.md).

## Spis plików

Kolejność to kolejność czytania dla nowej osoby. Podział na pliki z literą „b” (na przykład 02b) oznacza drugą część tematu, której nie dało się zmieścić w jednym pliku.

| Plik | O czym jest |
| --- | --- |
| [01-uruchomienie.md](01-uruchomienie.md) | Jak uruchomić aplikację lokalnie: klon, Docker, `.env`, pierwsze konto administratora, tryby `MULTI_ORG`, `AUTH_PUBLIC_SIGNUP` i `ADMIN_IMPERSONATION` oraz typowe problemy. |
| [02-architektura.md](02-architektura.md) | Z czego składa się kit, jak żądanie przechodzi od przeglądarki do bazy, gdzie leży każdy rodzaj kodu i co zawiera definicja modułu. |
| [02b-rejestr-i-generator.md](02b-rejestr-i-generator.md) | Co zapisują rejestr modułów i `.wa/kit.json`, jak `wa generate` wykrywa feature i przepisuje regiony `wa:*` oraz jak rozpoznać błędy rejestracji feature. |
| [03-dane-i-organizacje.md](03-dane-i-organizacje.md) | Model danych rdzenia, `getOrgContext()`, filtr `organizationId`, test izolacji organizacji, aktywna organizacja i tryby `MULTI_ORG`. |
| [03b-schemat-i-migracje.md](03b-schemat-i-migracje.md) | Pliki schematu Prisma, klient i połączenie z bazą, migracje w projekcie klienta i rozjazd historii migracji. |
| [04-auth-i-role.md](04-auth-i-role.md) | better-auth w kicie: logowanie, rejestracja, zaproszenia, role, macierz dostępu, guardy i `npm run admin:create`. |
| [04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md) | Superadmin, ochrona kont serwisowych, impersonacja i tryb serwisowy z kontraktem potwierdzania zmian danych. |
| [05-moduly-rdzenia.md](05-moduly-rdzenia.md) | Strony, komponenty, komendy i query pięciu feature rdzenia (`auth`, `organizations`, `users`, `account`, `dashboard`) i ich wspólne części. |
| [06-wzorce-kodu.md](06-wzorce-kodu.md) | Wzorce kodu: komenda, query, kontrakty, wywołanie z interfejsu, reguły stylu i test architektury punktów wejścia serwera. |
| [07-i18n-mail-env.md](07-i18n-mail-env.md) | Tłumaczenia (next-intl), maile (SMTP, Resend albo log) i walidacja zmiennych środowiskowych. |
| [07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md) | Logger i eksport OpenTelemetry, nagłówki bezpieczeństwa oraz `/api/healthcheck`. |
| [08-testy.md](08-testy.md) | Rodzaje testów, komendy czyszczące bazę i ich zabezpieczenia, test izolacji organizacji, czas przebiegów i CI. |
| [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md) | System testów adwersarialnych: role `test-writer` i `test-reviewer`, hook `protect-tests`, Stryker i bramka plików krytycznych. |
| [09-nowy-modul.md](09-nowy-modul.md) | Tutorial: dodanie funkcji domenowej do projektu klienta, od katalogu feature i wpisu w `.wa/kit.json` po testy napisane przed kodem. |
| [09b-implementacja-i-bramki.md](09b-implementacja-i-bramki.md) | Dalszy ciąg tutorialu: query, komenda, komponent i strona, bramki (`npm run verify`, integracja, mutacje) i commit. |
| [10-wdrozenie.md](10-wdrozenie.md) | Obraz Docker, `railway.toml`, wdrożenie na Railway, konta na produkcji, przekazanie aplikacji klientowi i workflowy CI. |
| [11-praca-z-kitem.md](11-praca-z-kitem.md) | Zmiany lokalne a poprawki do kitu, commity, bramka `npm run verify`, praca z agentami AI, proces superpowers i pliki generowane. |
| [12-moduly-kitu.md](12-moduly-kitu.md) | Moduły opcjonalne kitu: czym różnią się od rdzenia, macierz składania w CI i moduły `audit-logs` (model, strona, `<AuditTrail>`, zdarzenia, redakcja, brak retencji) i `api-keys` (klucze API, zakresy, uwierzytelnianie tras, pepper). |
| [decyzje.md](decyzje.md) | Rejestr decyzji D01–D27: dlaczego kit jest zbudowany tak, a nie inaczej, i co pilnuje przestrzegania każdej decyzji. |
| [znane-ograniczenia.md](znane-ograniczenia.md) | Znane luki kodu z ich skutkami, plikami i obejściami: dwie pozycje o wysokim priorytecie i reszta pogrupowana tematycznie. |
| README.md | Ten plik: indeks, ścieżki czytania, słownik i zakres dokumentacji. |

Katalog `docs/superpowers/` nie jest częścią dokumentacji. Trzyma specyfikacje, plany i notatki procesu, z których powstał kit: [design doc](superpowers/specs/2026-10-26-wa-kit-design.md), [plan 1 (rdzeń)](superpowers/plans/2026-10-26-wa-kit-plan-1-core.md) i [handoff planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md). Opisują zamiar z chwili pisania, a w trakcie wykonania zmieniły go rulingi i poprawki, więc przy sprzeczności rozstrzyga kod ([11-praca-z-kitem.md](11-praca-z-kitem.md#superpowers)).

## Ścieżki czytania

| Cel | Kolejność | Dlaczego tak |
| --- | --- | --- |
| Pierwszy dzień | [01](01-uruchomienie.md) → [02](02-architektura.md) → [05](05-moduly-rdzenia.md) | Uruchom aplikację, zrozum układ repozytorium i drogę żądania, potem przejrzyj kod rdzenia, na którym będziesz pracować. |
| Dodaję funkcję do projektu klienta (piszę moduł) | [02](02-architektura.md) → [02b](02b-rejestr-i-generator.md) → [03](03-dane-i-organizacje.md) → [03b](03b-schemat-i-migracje.md) → [04](04-auth-i-role.md) → [06](06-wzorce-kodu.md) → [09](09-nowy-modul.md) → [09b](09b-implementacja-i-bramki.md) → [08](08-testy.md) → [08b](08b-testy-adwersarialne.md) | Najpierw architektura i rejestr, potem dane, migracje i role, które funkcja musi respektować, potem wzorce kodu i tutorial. Testy na końcu, bo tutorial odsyła do nich w kroku 6: jeśli wolisz, przeczytaj 08 i 08b przed 09. |
| Wdrażam albo przekazuję aplikację | [07](07-i18n-mail-env.md) → [10](10-wdrozenie.md) → [07b](07b-logi-naglowki-healthcheck.md) → [04b](04b-superadmin-i-tryb-serwisowy.md) | Zmienne i maile, potem wdrożenie, logi i healthcheck, a na końcu konta serwisowe i odcięcie dostępu Web Amigos. |
| Piszę testy albo pracuję z agentem AI | [08](08-testy.md) → [08b](08b-testy-adwersarialne.md) → [11](11-praca-z-kitem.md) | Rodzaje testów i bazy, potem proces tester ≠ implementer i bramka mutacji, potem hooki i zasady pracy z agentami. |
| Chcę wiedzieć, dlaczego tak to zbudowano | [02](02-architektura.md#zasady-kitu) → [decyzje.md](decyzje.md) | „Zasady kitu” streszczają fundamenty, a każda decyzja ma kontekst i odrzucone alternatywy. |
| Coś nie działa | [01, typowe problemy](01-uruchomienie.md#typowe-problemy) → [znane-ograniczenia.md](znane-ograniczenia.md) → plik o danej części | Najpierw błędy startu, potem lista znanych luk: zachowanie, które wygląda na błąd, bywa opisanym ograniczeniem. |

<a id="slownik"></a>

## Słownik

Jedno pojęcie oznacza w całej dokumentacji jedną rzecz. Definicje „moduł”, „feature”, „definicja modułu” i „rejestr modułów” są takie same jak w sekcji [Pojęcia](decyzje.md#pojęcia) rejestru decyzji. `AGENTS.md` używa słowa „moduł” luźniej: w dokumentacji „moduł” zawsze znaczy wpis w `.wa/kit.json`.

| Pojęcie | Znaczenie | Opisuje |
| --- | --- | --- |
| Kit (wa-kit) | To repozytorium: działająca aplikacja referencyjna, z której kod trafia do projektów jako zwykły kod, bez paczek npm. | [02](02-architektura.md#kit-rdzen-moduly), [D01](decyzje.md#d01) |
| Projekt | Aplikacja zbudowana z kodu kitu. Kod kitu jest w niej zwykłym kodem, który projekt może zmieniać. | [11](11-praca-z-kitem.md#projekt-a-kit) |
| Rdzeń | Część kitu, którą ma każdy projekt: logowanie, organizacje, użytkownicy, konto i dashboard. Rdzeń to moduł `core`. | [02](02-architektura.md#kit-rdzen-moduly), [05](05-moduly-rdzenia.md) |
| Moduł (moduł kitu) | Wpis w `.wa/kit.json` z manifestem plików. Rdzeń to moduł `core`; moduł może obejmować kilka feature. | [02b](02b-rejestr-i-generator.md#kit-json) |
| Feature | Katalog `src/features/<x>/` z kodem jednej funkcji: komponentami, komendami, query i tłumaczeniami. | [02](02-architektura.md#anatomia-feature) |
| Definicja modułu | Plik `src/features/<x>/module.ts` z `defineModule(...)` (typ `ModuleDef`). Opisuje feature dla nawigacji i guardów; najważniejsze pole to `key`. | [02](02-architektura.md#definicja-modulu) |
| Rejestr modułów | Tablice w `src/modules.generated.ts` i `src/modules.client.generated.ts`, z których nawigacja, guardy, tłumaczenia i walidacja env dowiadują się o feature. | [02b](02b-rejestr-i-generator.md#rejestr-modulow) |
| Plik generowany | Plik, który przepisuje `wa generate`. Nie edytujesz go ręcznie: po zmianie źródła uruchom generator. | [02b](02b-rejestr-i-generator.md#referencja-pliki-generowane), [11](11-praca-z-kitem.md#pliki-generowane) |
| Region `wa:*` | Fragment pliku między liniami `wa:<nazwa>:start` i `wa:<nazwa>:end`, który przepisuje generator. Szew to miejsce, w którym rdzeń dowiaduje się o modułach: plik generowany albo region. | [02b](02b-rejestr-i-generator.md#regiony), [D03](decyzje.md#d03) |
| Organizacja | Firma albo zespół, do którego należą użytkownicy i dane. Jeden poziom, bez drzewa organizacji. | [03](03-dane-i-organizacje.md#model-danych), [D06](decyzje.md#d06) |
| Aktywna organizacja | Organizacja, w której zalogowany użytkownik pracuje w danej chwili. Zawsze jedna naraz. | [03](03-dane-i-organizacje.md#aktywna-organizacja) |
| Kontekst organizacji | Wynik `getOrgContext()`: `userId`, `organizationId`, role i `serviceMode` z sesji. Jedyne źródło `organizationId` w zapytaniach domenowych. | [03](03-dane-i-organizacje.md#kontekst-organizacji), [D07](decyzje.md#d07) |
| `MULTI_ORG` | Flaga, która przełącza interfejs i przepływy między jedną organizacją a wieloma. Model danych jest ten sam w obu trybach. | [03](03-dane-i-organizacje.md#tryby-multi-org) |
| Rola globalna | `user`, `admin` albo `superadmin`. Dotyczy konta w całej aplikacji. | [04](04-auth-i-role.md#role), [D08](decyzje.md#d08) |
| Rola w organizacji | `owner`, `admin` albo `member`. Dotyczy członkostwa w jednej organizacji. | [04](04-auth-i-role.md#role) |
| Superadmin | Konto serwisowe Web Amigos: ma wszystko, co `admin`, plus impersonację i wejście do każdej organizacji. Jego konta są nietykalne dla `admin`. | [04b](04b-superadmin-i-tryb-serwisowy.md#superadmin), [D19](decyzje.md#d19) |
| Tryb serwisowy | Praca superadmina w organizacji, do której nie należy. Każda zmiana danych wymaga wtedy potwierdzenia. | [04b](04b-superadmin-i-tryb-serwisowy.md#tryb-serwisowy), [D22](decyzje.md#d22) |
| Impersonacja | Praca na koncie innego użytkownika bez jego hasła (przycisk „Zaloguj jako”). Kto pod kogo może się podszyć, zależy od roli. | [04b](04b-superadmin-i-tryb-serwisowy.md#impersonacja), [D20](decyzje.md#d20) |
| Guard | Funkcja, która sprawdza sesję albo uprawnienia, zanim kod sięgnie do danych, na przykład `getOrgContext()` albo `requireModuleAccess()`. | [02](02-architektura.md#kto-co-sprawdza), [04](04-auth-i-role.md#guardy) |
| Komenda | Funkcja serwerowa, która zapisuje dane: plik z `"use server"` w `services/commands/`. Zwraca `OperationResult`. | [06](06-wzorce-kodu.md#komenda) |
| Query | Funkcja serwerowa, która odczytuje dane: plik w `services/queries/`. Sprawdza sesję przed Prismą i filtruje po `organizationId`. | [06](06-wzorce-kodu.md#query) |
| `OperationResult` | Typ wyniku komendy: `{ success, data?, error? }` z `src/shared/types/common.ts`. | [06](06-wzorce-kodu.md#wynik-i-bledy) |
| Kontrakt | Schematy Zod i typy w `contracts/`, wspólne dla formularza i komendy. | [06](06-wzorce-kodu.md#kontrakty) |
| Migracja | Zapis zmiany schematu bazy w `prisma/migrations/`. Kit ich nie commituje, a projekt tak. | [03b](03b-schemat-i-migracje.md#migracje), [D13](decyzje.md#d13) |
| Test izolacji | Test na prawdziwej bazie z dwiema organizacjami: odczyt i zapis z kontekstem jednej nie dotyka danych drugiej. | [08](08-testy.md#izolacja) |
| `test-writer`, `test-reviewer` | Agenci procesu testów adwersarialnych: pierwszy pisze testy zadania przed kodem, drugi sprawdza ich siłę mutacjami. Tester to nie implementer. | [08b](08b-testy-adwersarialne.md#role), [D25](decyzje.md#d25) |
| Faza `implement` | Stan zapisany w `.superpowers/phase`, w którym hook `protect-tests` blokuje edycję testów. | [08b](08b-testy-adwersarialne.md#faza) |
| Mutant | Kopia kodu z jedną celową zmianą, na przykład odwróconym warunkiem. Mutant, którego żaden test nie wykrywa, wskazuje lukę w testach. | [08b](08b-testy-adwersarialne.md#wynik) |
| Bramka mutacji | `npm run test:mutation:gate`: w plikach z listy `critical` w `mutation-gate.json` każdy niewykryty mutant musi być zabity albo mieć wpis w `allowed`. | [08b](08b-testy-adwersarialne.md#bramka), [D26](decyzje.md#d26) |
| Handoff, ruling | Handoff to notatka przekazania pracy między sesjami. Ruling to decyzja, którą prowadzący wykonanie planu podjął sam, gdy plan czegoś nie rozstrzygał. | [decyzje.md](decyzje.md#pojęcia) |

<a id="plany"></a>

## Czego ta dokumentacja nie opisuje

Dokumenty 01–11 opisują tylko to, co działa w kodzie z commitu `25adbb8`, a dokument 12 wskazuje własny commit w nagłówku „Zweryfikowano z kodem”. Funkcje zaplanowane i niezrobione są poza nią i rosną razem z kolejnymi planami. Gdy któraś zostanie wdrożona, odpowiedni plik dostanie własną sekcję, a ta tabela straci wiersz.

| Funkcja zaplanowana | Plan | Gdzie jest opisana |
| --- | --- | --- |
| Moduły opcjonalne `uploads`, `worker` i `legal`, dalsze rozszerzenie macierzy składania w CI (`audit-logs` i `api-keys` są opisane w [12](12-moduly-kitu.md)) | Plan 3 | [Design doc, sekcja Moduły opcjonalne](superpowers/specs/2026-10-26-wa-kit-design.md#moduły-opcjonalne-v1) |
| `wa update`, `wa diff`, wersjonowanie kitu i modułów, scalanie zmian | Plan 4 | [Design doc, sekcja Wersjonowanie i aktualizacje](superpowers/specs/2026-10-26-wa-kit-design.md#44-wersjonowanie-i-aktualizacje) |

CLI ma komendy `create`, `add`, `remove`, `list`, `generate` i `kit sync`; ich użycie opisuje [kit/README.md](../kit/README.md). W projekcie uruchamia się je jako `npm run wa -- <komenda>`, tak jak w `AGENTS.md` (na przykład `wa generate`, [02b](02b-rejestr-i-generator.md#wa-generate)). Znane luki istniejącego kodu, w tym kierunki ich zamknięcia, są w [znane-ograniczenia.md](znane-ograniczenia.md).

Poza zakresem są też:

- dokumentacja w projektach klientów (leży tylko w repozytorium kitu);
- strona internetowa z dokumentacją, wersja angielska i dokumentacja dla klienta końcowego;
- automatyczna kontrola zgodności dokumentacji z kodem w CI;
- plik z historią zmian kitu (changelog), notatki z aktualizacji i dokumentacja przypięta do wersji kitu, które pojawią się razem z `wa update`.
