# Dokumentacja wa-kit

Ta dokumentacja jest dla dewelopera Web Amigos, który pracuje na wa-kit albo w projekcie zbudowanym z kitu. Zakłada, że znasz Next.js, TypeScript i Prismę. Nie zakłada znajomości better-auth, historii projektu ani procesu testów: każde pojęcie jest wyjaśnione przy pierwszym użyciu albo ma odnośnik do miejsca, które je wyjaśnia ([słownik](#slownik)). Agenci AI korzystają z tej samej dokumentacji przez wskazanie w `AGENTS.md`, ale nie są głównym odbiorcą.

Każdy dokument ma własny nagłówek „Zweryfikowano z kodem” z commitem, z którym go sprawdzono. Przy sprawdzaniu zmian w źródłach używaj commitu z nagłówka danego dokumentu.

## Czego dotyczy

Dokumentacja opisuje kit w wersji `0.1.0`: kod z commitu `76ca2d7` na `main` (koniec planu 3, tag `v0.1.0`). Pliki sprawdzano z różnymi commitami; commit, z którym sprawdzono dany plik, podaje jego nagłówek. Każde twierdzenie o zachowaniu kodu jest sprawdzone w kodzie i wskazuje plik źródłowy. Gdy kod, testy i `AGENTS.md` się różnią, dokumentacja idzie za kodem, potem za testami, potem za `AGENTS.md`, `CLAUDE.md` i `kit/CLAUDE.md` (dla plików w `kit/`), a na końcu za specami, planami i notatkami.

Dokumentacja leży tylko w repozytorium kitu `webamigos/wa-kit`. Opisuje najnowszą wersję kitu, a nie wersję Twojego projektu: wersję projektu podaje `.wa/kit.json`. Jeśli projekt jest starszy niż kit, część opisanych zachowań może w nim wyglądać inaczej.

### Jak czytać pliki

Każdy plik numerowany zaczyna się tak samo:

- „Po przeczytaniu będziesz wiedzieć:” z 3–6 punktami, żebyś zdecydował, czy to ten plik;
- linia „Zweryfikowano z kodem: `<commit>`, `<data>`”;
- lista „Źródła:” z plikami, które plik opisuje.

Ten nagłówek pozwala sprawdzić, czy plik się zestarzał. Podstaw commit z jego nagłówka i ścieżki z listy „Źródła:”, a `git log` pokaże zmiany w opisywanym kodzie od tamtej pory:

```bash
git log <commit z nagłówka>..HEAD -- <ścieżki ze źródeł>
```

Plik, którego źródła się zmieniły, trzeba sprawdzić ponownie. Poza nagłówkiem obowiązuje kilka stałych reguł:

- Pliki 02, 03, 04, 07, 08 i 16 oraz każdy plik z literą „b” kończą się sekcją „Referencja” z materiałem do wyszukiwania: tabelami, listami pól i macierzami. Tekst nad nią wyjaśnia, a sekcja służy do szukania.
- Fragment kodu z repozytorium ma nad blokiem linię ze ścieżką pliku, a w bloku tekst dosłowny. Pominięcie oznacza osobna linia `// …` albo `# …`. Kod w tutorialu ([09](09-nowy-modul.md), [09b](09b-implementacja-i-bramki.md)) i w przykładach użycia modułów ([13b](13b-modul-audit-logs-uzycie.md), [14b](14b-modul-api-keys-uzycie.md), [15b](15b-modul-uploads-uzycie.md)) pochodzi z prawdziwego przebiegu na kopii roboczej projektu, zakończonego zielonym `npm run verify`; nad blokiem stoi ścieżka pliku z przebiegu i zdanie, że to przykład.
- „(sprawdzone)” przy zachowaniu znaczy, że potwierdziło je uruchomienie kodu z repozytorium: skryptu, zbudowanego serwera, lokalnego odbiornika, bundla CLI na projekcie próbnym albo przebiegu na kopii projektu. Pliki 16 i 16b podają na początku, z jakiego przebiegu pochodzą ich oznaczenia. Bez tego oznaczenia zachowanie wynika z czytania kodu.
- Powody decyzji są w [decyzje.md](decyzje.md): `[D07](decyzje.md#d07)` prowadzi do wpisu z kontekstem, odrzuconymi alternatywami i opisem tego, co pilnuje, żeby decyzja była przestrzegana.
- Pliki 01–16b opisują stan kodu bez określeń czasu względnego: datę i stan niesie nagłówek. Plany pojawiają się tylko w tym pliku i w [znane-ograniczenia.md](znane-ograniczenia.md).

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
| [12-moduly-kitu.md](12-moduly-kitu.md) | Moduły kitu: czym różnią się od rdzenia i od modułów projektu, lista modułów i ich zależności, droga modułu od manifestu do aplikacji (warstwa szwów), punkty wejścia rdzenia, wspólne zasady i wybór modułów dla projektu. |
| [13-modul-audit-logs.md](13-modul-audit-logs.md) | Moduł `audit-logs`: co robi i czego nie (brak retencji), instalacja i usunięcie, model `AuditLog`, strona `/audit-log`, kontrakty `trackAudit` i `auditActor`, ujście `AuditSink`, redakcja i zdarzenia. |
| [13b-modul-audit-logs-uzycie.md](13b-modul-audit-logs-uzycie.md) | `audit-logs` we własnym kodzie: zapis zdarzenia w komendzie, etykieta akcji, `<AuditTrail>`, kod działający bez modułu, bezpieczeństwo, testy, typowe problemy i referencja. |
| [14-modul-api-keys.md](14-modul-api-keys.md) | Moduł `api-keys`: klucze API organizacji, pepper (`API_KEY_PEPPER`), model `ApiKey`, cykl życia klucza, trasa `GET /api/v1/organization`, kontrakt `authenticateApiKey` i deklaracja `apiScopes`. |
| [14b-modul-api-keys-uzycie.md](14b-modul-api-keys-uzycie.md) | `api-keys` we własnym kodzie: własny zakres, trasa z kluczem i jawnym filtrem organizacji, zdarzenie z kanałem `API`, wywołanie z zewnątrz, bezpieczeństwo, testy, typowe problemy i referencja. |
| [15-modul-uploads.md](15-modul-uploads.md) | Moduł `uploads`: pliki organizacji w magazynie S3, zmienne S3 i MinIO, model `Upload`, trasy zapisu i pobierania, usuwanie, osierocone obiekty, cele uploadu i kontrakt `<FileUpload>`. |
| [15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md) | `uploads` we własnym kodzie: własny cel, formularz z `<FileUpload>`, zapis `id` pliku w encji, pokazanie i usuwanie pliku, bezpieczeństwo, testy z MinIO, typowe problemy i referencja. |
| [16-cli-wa.md](16-cli-wa.md) | CLI `wa` w projekcie: `wa create` (one-liner z GitHuba i lokalny klon), źródło kitu, `wa add`, `wa remove`, `wa list`, cofanie i jego granice, moduły projektu, kody wyjścia i komunikaty. |
| [16b-rozwoj-kitu.md](16b-rozwoj-kitu.md) | Praca nad repozytorium kitu: pliki tylko dla kitu, manifesty, `wa kit sync`, własność plików i zależności, hashe, placeholdery, bundel CLI, bramka i mutacje CLI, CI kitu, wydanie z tagiem i dodanie nowego modułu. |
| [decyzje.md](decyzje.md) | Rejestr decyzji D01–D46: dlaczego kit jest zbudowany tak, a nie inaczej, co pilnuje przestrzegania każdej decyzji i które decyzje zastąpiono nowszymi. |
| [znane-ograniczenia.md](znane-ograniczenia.md) | Znane luki kodu z ich skutkami, plikami i obejściami: dwie pozycje o wysokim priorytecie, luki CLI i modułów kitu oraz reszta pogrupowana tematycznie. |
| README.md | Ten plik: indeks, ścieżki czytania, słownik i zakres dokumentacji. |

Katalog `docs/superpowers/` nie jest częścią dokumentacji. Trzyma specyfikacje, plany i notatki procesu, z których powstał kit: [design doc](superpowers/specs/2026-10-26-wa-kit-design.md), [plan 1 (rdzeń)](superpowers/plans/2026-10-26-wa-kit-plan-1-core.md) i [handoff planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md), [plan 2 (CLI)](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), [spec planu 3 (moduły)](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) i [plan 3](superpowers/plans/2026-10-29-wa-kit-plan-3-modules.md). Opisują zamiar z chwili pisania, a w trakcie wykonania zmieniły go rulingi i poprawki, więc przy sprzeczności rozstrzyga kod ([11-praca-z-kitem.md](11-praca-z-kitem.md#superpowers)).

## Ścieżki czytania

| Cel | Kolejność | Dlaczego tak |
| --- | --- | --- |
| Pierwszy dzień | [01](01-uruchomienie.md) → [02](02-architektura.md) → [05](05-moduly-rdzenia.md) | Uruchom aplikację, zrozum układ repozytorium i drogę żądania, potem przejrzyj kod rdzenia, na którym będziesz pracować. |
| Zakładam projekt i dobieram moduły | [12](12-moduly-kitu.md#wybor-modulow) → [16](16-cli-wa.md#wa-create) → [13](13-modul-audit-logs.md), [14](14-modul-api-keys.md), [15](15-modul-uploads.md) (sekcje „Wymagania” i „Instalacja i usunięcie”) → [01](01-uruchomienie.md#pierwsze-uruchomienie) → [03b](03b-schemat-i-migracje.md#migracje-w-projekcie) → [znane-ograniczenia, CLI](znane-ograniczenia.md#cli) | Najpierw czym są moduły i jak je wybrać, potem `wa create` albo `wa add`, wymagania wybranych modułów (zmienne, MinIO), uruchomienie projektu i pierwsza migracja, którą projekt commituje. Na końcu luki CLI, żeby wiedzieć, co sprawdzić ręcznie. |
| Używam modułu w swoim kodzie | [12](12-moduly-kitu.md#punkty-wejscia) → [13b](13b-modul-audit-logs-uzycie.md#uzycie), [14b](14b-modul-api-keys-uzycie.md#uzycie), [15b](15b-modul-uploads-uzycie.md#uzycie) → [13](13-modul-audit-logs.md#szwy), [14](14-modul-api-keys.md#szwy), [15](15-modul-uploads.md#szwy) → [09](09-nowy-modul.md) | Punkty wejścia rdzenia i ich zachowanie bez modułu, potem scenariusze użycia z kodem z przebiegu, bezpieczeństwem i testami. Kontrakty z sekcji „Szwy modułu” czytasz, gdy przykład nie wystarcza. Tutorial 09 pokazuje, jak taki kod zamknąć w funkcji projektu. |
| Dodaję funkcję do projektu klienta (piszę moduł) | [02](02-architektura.md) → [02b](02b-rejestr-i-generator.md) → [03](03-dane-i-organizacje.md) → [03b](03b-schemat-i-migracje.md) → [04](04-auth-i-role.md) → [06](06-wzorce-kodu.md) → [09](09-nowy-modul.md) → [09b](09b-implementacja-i-bramki.md) → [08](08-testy.md) → [08b](08b-testy-adwersarialne.md) | Najpierw architektura i rejestr, potem dane, migracje i role, które funkcja musi respektować, potem wzorce kodu i tutorial. Testy na końcu, bo tutorial odsyła do nich w kroku 6: jeśli wolisz, przeczytaj 08 i 08b przed 09. |
| Wdrażam albo przekazuję aplikację | [07](07-i18n-mail-env.md) → [10](10-wdrozenie.md) → [07b](07b-logi-naglowki-healthcheck.md) → [04b](04b-superadmin-i-tryb-serwisowy.md) | Zmienne i maile, potem wdrożenie, logi i healthcheck, a na końcu konta serwisowe i odcięcie dostępu Web Amigos. |
| Rozwijam kit (CLI, manifesty, nowy moduł, wydanie) | [02b](02b-rejestr-i-generator.md) → [12](12-moduly-kitu.md#warstwa-szwow) → [16b](16b-rozwoj-kitu.md) → [16](16-cli-wa.md) → [11](11-praca-z-kitem.md#pull-request) → [08b](08b-testy-adwersarialne.md) | Generator i `.wa/kit.json`, potem droga modułu przez szwy, potem pliki tylko dla kitu, bundel, CI i wydanie, potem zachowanie komend, które zmieniasz. Na końcu zasady pull requestów do kitu i proces testów. |
| Piszę testy albo pracuję z agentem AI | [08](08-testy.md) → [08b](08b-testy-adwersarialne.md) → [11](11-praca-z-kitem.md) | Rodzaje testów i bazy, potem proces tester ≠ implementer i bramka mutacji, potem hooki i zasady pracy z agentami. |
| Chcę wiedzieć, dlaczego tak to zbudowano | [02](02-architektura.md#zasady-kitu) → [decyzje.md](decyzje.md) | „Zasady kitu” streszczają fundamenty, a każda decyzja ma kontekst i odrzucone alternatywy. |
| Coś nie działa | [01, typowe problemy](01-uruchomienie.md#typowe-problemy) → [znane-ograniczenia.md](znane-ograniczenia.md) → plik o danej części | Najpierw błędy startu, potem lista znanych luk: zachowanie, które wygląda na błąd, bywa opisanym ograniczeniem. |

<a id="slownik"></a>

## Słownik

Jedno pojęcie oznacza w całej dokumentacji jedną rzecz. Definicje „moduł”, „feature”, „definicja modułu” i „rejestr modułów” są takie same jak w sekcji [Pojęcia](decyzje.md#pojęcia) rejestru decyzji. `AGENTS.md` używa słowa „moduł” luźniej: w dokumentacji „moduł” zawsze znaczy moduł kitu z manifestem w `kit/modules/<nazwa>.json` i wpisem w `.wa/kit.json`, a funkcja napisana w projekcie to „moduł projektu”.

| Pojęcie | Znaczenie | Opisuje |
| --- | --- | --- |
| Kit (wa-kit) | To repozytorium: działająca aplikacja referencyjna, z której kod trafia do projektów jako zwykły kod, bez paczek npm. | [02](02-architektura.md#kit-rdzen-moduly), [D39](decyzje.md#d39) |
| Projekt | Aplikacja zbudowana z kodu kitu. Kod kitu jest w niej zwykłym kodem, który projekt może zmieniać. | [11](11-praca-z-kitem.md#projekt-a-kit) |
| Rdzeń | Część kitu, którą ma każdy projekt: logowanie, organizacje, użytkownicy, konto i dashboard. Rdzeń to moduł `core`. | [02](02-architektura.md#kit-rdzen-moduly), [05](05-moduly-rdzenia.md) |
| Moduł (moduł kitu) | Jednostka, którą CLI kopiuje do projektu i z niego usuwa, opisana manifestem. W projekcie to wpis w `modules` w `.wa/kit.json`. Rdzeń to moduł `core`; moduły opcjonalne to `audit-logs`, `api-keys` i `uploads`. Moduł może obejmować kilka feature. | [02](02-architektura.md#kit-rdzen-moduly), [12](12-moduly-kitu.md#modul-a-rdzen) |
| Manifest modułu | Opis modułu kitu w `kit/modules/<nazwa>.json`: wersja, wzorce plików (`files`), zależności npm, wymagane moduły (`requires`), zmienne, relacje w schemacie, plik usług Dockera (`compose`) i kroki CI (`ciSteps`). `wa kit sync` kopiuje go do `.wa/kit.json` kitu, a CLI do `.wa/kit.json` projektu. | [16b](16b-rozwoj-kitu.md#manifesty), [02b](02b-rejestr-i-generator.md#referencja-manifest), [D38](decyzje.md#d38) |
| Moduł projektu | Funkcja napisana w jednym projekcie, z samym manifestem w `projectModules` w `.wa/kit.json`. `wa generate` ją rejestruje, a `wa add` i `wa remove` jej nie kopiują ani nie usuwają. | [16](16-cli-wa.md#moduly-projektu), [09](09-nowy-modul.md#krok-3), [D36](decyzje.md#d36) |
| CLI `wa`, bundel CLI | Narzędzie kitu do zakładania projektu i zarządzania modułami. Źródła leżą w `kit/cli`, a uruchamia się zacommitowany plik `.wa/bin/wa.mjs` (bundel), w projekcie przez `npm run wa -- <komenda>`. | [16](16-cli-wa.md), [16b](16b-rozwoj-kitu.md#bundel), [D28](decyzje.md#d28) |
| Źródło kitu | Repozytorium kitu, z którego `wa add` i `wa list` biorą manifesty i pliki: `--kit`, `WA_KIT_SOURCE` albo `kitRepo` z `.wa/kit.json`, zawsze w wersji kitu projektu. | [16](16-cli-wa.md#zrodlo-kitu), [D46](decyzje.md#d46) |
| Plik tylko dla kitu | Plik pasujący do wzorca z `kitOnly` w `kit/kit.json` (na przykład `kit/**`, `docs/**`). Nie trafia do projektów. | [16b](16b-rozwoj-kitu.md#kit-a-projekt) |
| Placeholder | Napis kitu (`WA App`, `wa-app`, `wa_app`), który przy kopiowaniu do projektu zastępują nazwy projektu, tylko w plikach z `placeholderFiles` w `kit/kit.json`. | [16b](16b-rozwoj-kitu.md#placeholdery), [D32](decyzje.md#d32) |
| Hash pliku, plik zarządzany | Odcisk SHA-256 skopiowanego pliku zapisany w `.wa/kit.json` projektu; po nim `wa remove` rozpoznaje lokalne zmiany. W plikach z regionami liczony bez treści regionów. Plik zarządzany (`package.json`, `package-lock.json`, `managedFiles` w `kit/kit.json`) ma zamiast hasha wartość `managed`. | [16b](16b-rozwoj-kitu.md#hashe), [D31](decyzje.md#d31) |
| Feature | Katalog `src/features/<x>/` z kodem jednej funkcji: komponentami, komendami, query i tłumaczeniami. | [02](02-architektura.md#anatomia-feature) |
| Definicja modułu | Plik `src/features/<x>/module.ts` z `defineModule(...)` (typ `ModuleDef`). Opisuje feature dla nawigacji i guardów; najważniejsze pole to `key`. | [02](02-architektura.md#definicja-modulu) |
| Rejestr modułów | Tablice w `src/modules.generated.ts` i `src/modules.client.generated.ts`, z których nawigacja, guardy, tłumaczenia, walidacja env, pluginy better-auth i ujścia audytu dowiadują się o feature. | [02b](02b-rejestr-i-generator.md#rejestr-modulow) |
| Plik generowany | Plik, który przepisuje `wa generate`. Nie edytujesz go ręcznie: po zmianie źródła uruchom generator. | [02b](02b-rejestr-i-generator.md#referencja-pliki-generowane), [11](11-praca-z-kitem.md#pliki-generowane) |
| Region `wa:*` | Fragment pliku między liniami `wa:<nazwa>:start` i `wa:<nazwa>:end`, który przepisuje generator. | [02b](02b-rejestr-i-generator.md#regiony), [D03](decyzje.md#d03) |
| Szew, punkt wejścia | Szew to miejsce, w którym rdzeń dowiaduje się o modułach: plik generowany albo region `wa:*`. Punkt wejścia to kod rdzenia, który importuje moduł kitu albo moduł projektu (na przykład `trackAudit`), i deklaracja w `defineModule` (`auditActions`, `apiScopes`, `uploadPurposes`); działa także bez modułu, który go obsługuje. | [12](12-moduly-kitu.md#warstwa-szwow), [12](12-moduly-kitu.md#punkty-wejscia), [D39](decyzje.md#d39) |
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

Dokumenty opisują tylko to, co działa w kodzie z commitu podanego w nagłówku „Zweryfikowano z kodem” każdego z nich. Funkcje zaplanowane i niezrobione są poza nią i rosną razem z kolejnymi planami. Gdy któraś zostanie wdrożona, odpowiedni plik dostanie własną sekcję, a ta tabela straci wiersz.

| Funkcja zaplanowana | Plan | Gdzie jest opisana |
| --- | --- | --- |
| Moduł `worker` (kolejka zadań i zadania cykliczne), a z nim retencja dziennika `audit_logs` i sprzątanie osieroconych obiektów S3 modułu `uploads` | Osobny plan po planie 3 | [Spec planu 3, sekcja Zostawione na później](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md#9-zostawione-na-później), [design doc, sekcja Moduły opcjonalne](superpowers/specs/2026-10-26-wa-kit-design.md#moduły-opcjonalne-v1) |
| Moduł `legal` (regulamin, polityki, baner cookies) | Osobny plan po planie 3 | [Spec planu 3, sekcja Zostawione na później](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md#9-zostawione-na-później), [design doc, sekcja Moduły opcjonalne](superpowers/specs/2026-10-26-wa-kit-design.md#moduły-opcjonalne-v1) |
| `wa update`: przeniesienie projektu na nowszą wersję kitu albo modułu ze scalaniem zmian (3-way merge). Wersje kitu i modułów już istnieją ([D46](decyzje.md#d46)), ale CLI przyjmuje kit tylko w wersji projektu ([16](16-cli-wa.md#zrodlo-kitu)) | Plan 4 | [Design doc, sekcja Wersjonowanie i aktualizacje](superpowers/specs/2026-10-26-wa-kit-design.md#44-wersjonowanie-i-aktualizacje) |
| `wa diff`: podgląd różnic między projektem a najnowszą wersją kitu albo modułu przed `wa update` | Plan 4 | [Design doc, sekcja CLI](superpowers/specs/2026-10-26-wa-kit-design.md#5-cli) |

CLI ma komendy `create`, `add`, `remove`, `list`, `generate` i `kit sync`. W projekcie uruchamia się je jako `npm run wa -- <komenda>`, tak jak w `AGENTS.md`, a nowy projekt zakłada się bundlem z klonu kitu ([one-liner](16-cli-wa.md#one-liner)). Użycie w projekcie opisuje [16-cli-wa.md](16-cli-wa.md), pracę nad CLI i kitem [16b-rozwoj-kitu.md](16b-rozwoj-kitu.md), a `wa generate` [02b](02b-rejestr-i-generator.md#wa-generate). Krótka ściąga jest w [kit/README.md](../kit/README.md), który leży tylko w repozytorium kitu. Znane luki istniejącego kodu, w tym CLI i modułów kitu, z kierunkami ich zamknięcia, są w [znane-ograniczenia.md](znane-ograniczenia.md).

Poza zakresem są też:

- dokumentacja w projektach klientów (leży tylko w repozytorium kitu);
- strona internetowa z dokumentacją, wersja angielska i dokumentacja dla klienta końcowego;
- automatyczna kontrola zgodności dokumentacji z kodem w CI;
- plik z historią zmian kitu (changelog), notatki z aktualizacji i dokumentacja przypięta do wersji kitu, które pojawią się razem z `wa update`.
