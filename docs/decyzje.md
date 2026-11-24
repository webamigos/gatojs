# Rejestr decyzji

Ten plik wyjaśnia, dlaczego wa-kit jest zbudowany tak, a nie inaczej. Każdy wpis mówi, jaki problem rozwiązuje decyzja, co wybrano, co odrzucono, co z tego wynika przy pisaniu kodu i co pilnuje, żeby decyzja była przestrzegana. Jak dana część działa krok po kroku, opisują pliki `01`–`16b` (spis w [README.md](README.md)).

Zweryfikowano z kodem: b0f6382, 2026-11-21 (wpis D50); 8c9f5eb, 2026-11-21 (wpis D52); 2c83429, 2026-11-21 (wpis D51 i odnośniki do niego w D07); cdf13ba, 2026-11-03 (wpis D47 i odnośniki do niego w D31 i D46); 6c05f1f, 2026-11-05 (wpis D49); 734391b, 2026-11-04 (poprawki w D44, D45 i D48); 2788536, 2026-11-04 (wpis D48 i odnośniki do niego w D15, D17 i D43); 98a669c, 2026-10-30 (wpisy D28–D46, statusy D01 i D02 oraz poprawki w D03, D04, D13 i D27); pozostałe wpisy: 25adbb8, 2026-10-28

Rejestr obejmuje decyzje, które obowiązują w kodzie, i decyzje zastąpione, zostawione jako zapis historii. Funkcje zaplanowane, ale niezrobione (na przykład moduły `worker` i `legal`), pojawiają się wyłącznie jako kontekst albo konsekwencja.

## Jak czytać wpis

Wpis zaczyna się kotwicą i nagłówkiem `DNN · tytuł`, a pod nim są te pola:

| Pole | Co zawiera |
| --- | --- |
| Status | `obowiązuje`, `obowiązuje (zastępuje Dxx)` dla decyzji, która zastąpiła wcześniejszą, albo `zastąpiona przez Dxx`. |
| Data | Dzień, w którym decyzję zapisano albo wdrożono. |
| Kto zdecydował | Jakub, autor design doc, autor albo wykonawca planu 1, autor specu planu 3, wykonawca planu 3, autor specu `wa update` albo wykonawca planu `wa update` (wyjaśnienie pod tabelą). „Nie zapisano”, gdy źródła tego nie podają. |
| Kontekst | Problem, który decyzja rozwiązuje, opisany tak, żeby dało się go zrozumieć bez historii projektu. |
| Decyzja | Co wybrano i jak to wygląda w kodzie. |
| Odrzucone alternatywy | Tylko te, które wymieniają źródła. „Nie zapisano”, gdy źródło żadnej nie podaje. |
| Konsekwencje | Co z decyzji wynika dla osoby, która pisze kod. |
| Jak egzekwowana | Guard, test, workflow CI albo hook, który zatrzyma naruszenie, ze ścieżką. „Tylko konwencja”, gdy pilnuje jej wyłącznie przegląd kodu. |
| Źródło | Dokument albo commit, z którego pochodzi decyzja. |

„Autor design doc” to agent, który spisał główny dokument projektowy w sesji z Jakubem. Decyzje z sekcji „Moje decyzje” podjął sam (poza punktem o pierwszym adminie, ustalonym z Jakubem: [D09](#d09)), a Jakub zatwierdził je razem z całym dokumentem 2026-10-26 (status design doc; handoff z 12:09 pisze o decyzji w sprawie organizacji: „podjąłem ją ja, ale zaakceptował cały spec”). „Autor planu 1” to agent, który napisał plan 1 na podstawie design doc; źródła nie mówią, czy Jakub zatwierdzał plan przed wykonaniem (handoff z 12:09 mówi tylko, że wybrał sposób jego wykonania). „Wykonawca planu 1” to agent, który prowadził wykonanie planu 1 i zapisał swoje decyzje jako rulingi w handoffie planu 1. Handoff nie mówi, czy Jakub zatwierdzał rulingi pojedynczo.

Decyzje D1–D12 planu 2 Jakub zaakceptował 2026-10-28 (nagłówek sekcji decyzji w planie 2); w tym rejestrze mają numery D28–D37, a D8 (migracje) poprawia w miejscu [D13](#d13). „Autor specu planu 3” to agent, który spisał spec planu 3 w burzy mózgów z Jakubem. Spec rozdziela ustalenia „zaakceptowane przez Jakuba” od bloków „Moje decyzje”, które autor zostawił „do sprawdzenia przy czytaniu”; nagłówek specu nie podaje statusu zatwierdzenia całości, a plan 3 wykonano według specu. „Wykonawca planu 3” to agent, który wybierał to, co spec zostawił wykonawcy (§10: nazwy pól i plików, hooki better-auth, mechanizm MinIO w CI). Poprawki z recenzji pull requestów #6–#8 i ustalenia z 2026-10-30 podjął Jakub w rozmowie; ich śledzonym zapisem są commity na `main` (`git log 5b2d308..76ca2d7`). „Autor specu `wa update`” to Claude, który spisał spec `wa update` w burzy mózgów z Jakubem; spec rozdziela decyzje Jakuba od decyzji Claude, a Jakub zatwierdził całość 2026-11-03 (nagłówek specu). „Wykonawca planu `wa update`” to agent, który prowadził wykonanie planu i zapisywał rulingi w notatce postępu (lokalnie w `.superpowers/`, poza repozytorium); ich śledzonym zapisem są commity `de54292..cdf13ba`.

Sposoby egzekwowania różnią się siłą:

| Sposób | Kiedy zatrzymuje naruszenie |
| --- | --- |
| Guard w kodzie | Przy każdym żądaniu, także na produkcji. |
| Test w `npm run verify` | Lokalnie przed oddaniem pracy i w CI (job `verify` w `.github/workflows/ci.yml`). |
| Osobny workflow CI | Przy pull requeście i pushu do `main` (`.github/workflows/e2e.yml`, job `integration` w `ci.yml`), nie przy `npm run verify`. `.github/workflows/mutation.yml` tylko po ręcznym uruchomieniu. |
| Bramka CLI i workflow kitu | `npm run verify --prefix kit/cli` lokalnie oraz `.github/workflows/kit.yml` (joby `cli` i `assemble`) przy pull requeście i pushu do `main`. Tylko w repozytorium kitu: `kit/` i `kit.yml` nie trafiają do projektu. |
| Hook w `.claude/hooks/` | Tylko w sesji Claude Code, przy narzędziach `Edit` i `Write`. |
| Tylko konwencja | Wyłącznie wtedy, gdy zauważy to recenzent. |

## Statusy i numeracja

- `obowiązuje`: decyzja jest w kodzie.
- `obowiązuje (zastępuje Dxx)`: decyzja jest w kodzie i zastąpiła wpis Dxx; zastąpiony wpis ma status `zastąpiona przez` z numerem tej decyzji.
- `zastąpiona przez Dxx`: decyzja przestała obowiązywać. Wpis zostaje w pliku z nowym statusem i jednym zdaniem o tym, co się zmieniło, a decyzja, która go zastąpiła, ma własny numer i mówi, co zmieniła. Pozostała treść zastąpionego wpisu jest zapisem historii i nie opisuje kodu.
- Gdy w decyzji zmieniły się tylko fakty (na przykład lista plików generowanych albo miejsc w kodzie), wpis poprawia się w miejscu, bez nowego numeru.
- Numery `D01`, `D02`… są stałe i nie są używane ponownie. Inne pliki linkują do wpisu przez kotwicę, na przykład `[D07](decyzje.md#d07)`, więc zmiana numeru zepsułaby linki. Odnośnik, który opisuje bieżący stan kodu, wskazuje decyzję obowiązującą, a nie zastąpioną.
- Numer decyzji, która nie obowiązuje w kodzie, jest pomijany bez przenumerowania pozostałych. Rejestr obejmuje numery D01–D52 bez luk: D01 i D02 są zastąpione (przez [D39](#d39) i [D38](#d38)), D29 przez [ADR-56](adrs/56-workspace-packages-replace-d29.md), a D28 częściowo przez ADR-56, D17 i D18 częściowo przez [ADR-64](adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md); pozostałe obowiązują.
- Nową decyzję dopisuje się na końcu z następnym wolnym numerem, kotwicą `<a id="dNN"></a>` i wszystkimi polami.
- Jeden plik wystarcza, dopóki decyzje dopisuje jedna gałąź naraz. Gdy zaczną to robić równolegle różne gałęzie, dwie mogą dopisać ten sam następny numer; wtedy warto rozważyć osobne pliki `docs/decyzje/NNNN-*.md`.

## Pojęcia

Pełny słownik jest w [README.md](README.md). W rejestrze najczęściej pojawiają się:

- **Kit** (wa-kit): to repozytorium. Zawiera działającą aplikację, z której kopiuje się kod do projektów klientów.
- **Rdzeń**: część kitu, którą ma każdy projekt: logowanie, organizacje, użytkownicy, konto i dashboard.
- **Moduł** (moduł kitu): zestaw plików opisany manifestem `kit/modules/<nazwa>.json`, który `wa kit sync` kopiuje do `.wa/kit.json` ([D38](#d38)). Rdzeń to moduł `core`; moduły opcjonalne to `audit-logs`, `api-keys` i `uploads`. Moduł może obejmować kilka feature.
- **Moduł projektu**: funkcja napisana w projekcie klienta, opisana wpisem w `projectModules` w `.wa/kit.json` ([D36](#d36)).
- **Bundel CLI**: plik `.wa/bin/wa.mjs` z całym CLI `wa` w jednym pliku ([D28](#d28)).
- **Feature**: katalog `src/features/<x>/` z kodem jednej funkcji (komponenty, komendy, query, tłumaczenia).
- **Definicja modułu**: plik `src/features/<x>/module.ts` z `defineModule(...)` (typ `ModuleDef`). Opisuje feature dla nawigacji i guardów; najważniejsze pole to `key`, na przykład `users`.
- **Rejestr modułów**: tablice w `src/modules.generated.ts` i `src/modules.client.generated.ts` (na przykład `clientModules`), z których nawigacja, guardy, tłumaczenia i walidacja env dowiadują się o feature.
- **Plik generowany, region `wa:*`, szew**: plik albo fragment pliku między liniami z `wa:<nazwa>:start` i `wa:<nazwa>:end`, który przepisuje generator kitu (`npm run wa -- generate`). Szew to miejsce, w którym rdzeń dowiaduje się o modułach: plik generowany albo region.
- **Punkt wejścia, deklaracja modułu**: funkcja rdzenia, którą woła kod modułu albo projektu (na przykład `trackAudit`), i pole danych w `defineModule`, z którego moduł czyta wkład innych modułów (na przykład `apiScopes`) ([D39](#d39)).
- **Organizacja, aktywna organizacja**: firma albo zespół, do którego należą użytkownicy i dane. Zalogowany użytkownik pracuje zawsze w jednej organizacji naraz, nazywanej aktywną.
- **Rola globalna** (`user`, `admin`, `superadmin`) dotyczy konta w całej aplikacji. **Rola w organizacji** (`owner`, `admin`, `member`) dotyczy członkostwa w jednej organizacji.
- **Superadmin, tryb serwisowy, impersonacja**: konto serwisowe Web Amigos; praca superadmina w organizacji, do której nie należy; praca na koncie innego użytkownika bez jego hasła.
- **Komenda, query**: funkcja serwerowa, która zapisuje dane (`services/commands/`, plik z `"use server"`) albo je odczytuje (`services/queries/`).
- **Guard**: funkcja, która sprawdza sesję albo uprawnienia, zanim kod sięgnie do danych, na przykład `getOrgContext()` albo `requireModuleAccess()`.
- **Mutant**: kopia kodu z jedną celową zmianą, na przykład odwróconym warunkiem. Mutant, którego żaden test nie wykrywa, wskazuje lukę w testach.
- **Test właściwości** (`test.prop` z `@fast-check/vitest`): test, który sprawdza jedną regułę na wielu (domyślnie 100) losowych wejściach zamiast na kilku przykładach.
- **better-auth**: biblioteka logowania i sesji. Kit używa jej pluginów `admin` (role globalne, impersonacja) i `organization` (organizacje, członkowie, zaproszenia).
- **Railway**: platforma, na której działa produkcja projektów ([10-wdrozenie.md](10-wdrozenie.md)).

Źródła, na które powołują się wpisy:

- **Design doc**: [główny dokument projektowy kitu](superpowers/specs/2026-10-26-wa-kit-design.md) z 2026-10-26.
- **Plan 1**: [plan budowy rdzenia](superpowers/plans/2026-10-26-wa-kit-plan-1-core.md).
- **Plan 2**: [plan CLI](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md) z decyzjami D1–D12 (numeracja planu, inna niż w tym rejestrze) oraz plany poprawek po nim: [drobiazgi](superpowers/plans/2026-10-28-wa-kit-cli-drobiazgi.md) i [ograniczenia `wa add`](superpowers/plans/2026-10-28-wa-kit-cli-ograniczenia-add.md).
- **Spec planu 3, plan 3**: [projekt modułów `audit-logs`, `api-keys` i `uploads`](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) i [plan ich wykonania](superpowers/plans/2026-10-29-wa-kit-plan-3-modules.md), wdrożone pull requestami #6–#8 (scalone 2026-10-30, commit `76ca2d7`).
- **Spec `wa update`, plan `wa update`**: [projekt komendy](superpowers/specs/2026-11-03-wa-update-design.md) i [plan jej wykonania](superpowers/plans/2026-11-03-wa-update.md) z 2026-11-03.
- **kit/CLAUDE.md**: [reguły plików tylko dla kitu](../kit/CLAUDE.md): bramka CLI, bundel, manifesty, wydanie.
- **Handoff, ruling**: handoff to notatka przekazania pracy między sesjami. [Handoff planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md) zawiera rulingi R1–R22, czyli decyzje podjęte w trakcie wykonania planu 1. Pozostałe handoffy (z 2026-10-27, godz. 12:09 i 17:05) leżą lokalnie, poza repozytorium.
- **Spec superadmina**: projekt roli `superadmin` z decyzjami Jakuba 1–4. Plik leży lokalnie w `.superpowers/`, poza repozytorium. Jego treść, sprawdzoną z kodem, opisują wpisy D19–D22 i [04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md).
- **Decyzje Jakuba do macierzy dostępu**: odpowiedzi na trzy pytania o dostęp (zapisane w handoffie z 17:05). Śledzonym zapisem są nazwy testów w `src/shared/lib/auth/__tests__/access-matrix.test.ts`, które cytują je jako „decyzja 1”, „decyzja 2” i „decyzja 3”.
- **Research i audyt testów**: dwie notatki z 2026-10-27, poza historią git. Research dotyczy testów pisanych przez agentów AI, a audyt sprawdzał testy planu 1 mutacjami i testami właściwości. Wnioski streszczają D24–D26 i [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#dlaczego).

## Spis decyzji

| ID | Decyzja | Obszar | Status |
| --- | --- | --- | --- |
| [D01](#d01) | Kod kitu trafia do projektu jako zwykły kod | Model kitu | zastąpiona przez [D39](#d39) |
| [D02](#d02) | Aplikacja referencyjna w katalogu głównym; własność plików w `.wa/kit.json` | Model kitu | zastąpiona przez [D38](#d38) |
| [D03](#d03) | Moduł nie edytuje rdzenia; łączą je pliki generowane i regiony | Model kitu | obowiązuje |
| [D04](#d04) | Pliki generowane są commitowane i bajtowo równe wyjściu generatora | Model kitu | obowiązuje |
| [D05](#d05) | Definicja modułu to czyste dane bezpieczne dla klienta | Model kitu | obowiązuje |
| [D06](#d06) | Organizacje w rdzeniu, jeden poziom; `MULTI_ORG` nie zmienia modelu danych | Dane i organizacje | obowiązuje |
| [D07](#d07) | Jawny filtr `organizationId` z `getOrgContext()` | Dane i organizacje | obowiązuje |
| [D08](#d08) | Dwa poziomy ról | Auth i role | obowiązuje |
| [D09](#d09) | Pierwszy admin przez `admin:create` | Auth i role | obowiązuje |
| [D10](#d10) | Rejestracja przez bramkę serwerową | Auth i role | obowiązuje |
| [D11](#d11) | Strony chroni `requireModuleAccess` | Auth i role | obowiązuje |
| [D12](#d12) | Strona `no-organization` poza guardem `(app)` | Dane i organizacje | obowiązuje |
| [D13](#d13) | Kit nie commituje migracji, projekt je commituje | Dane i organizacje | obowiązuje |
| [D14](#d14) | Schemat Prisma w wielu plikach | Dane i organizacje | obowiązuje |
| [D15](#d15) | Logger na OpenTelemetry | Konfiguracja i usługi | obowiązuje |
| [D16](#d16) | `APP_URL` jako publiczny adres | Konfiguracja i usługi | obowiązuje |
| [D17](#d17) | Ścisła walidacja zmiennych środowiskowych | Konfiguracja i usługi | obowiązuje częściowo ([ADR-64](adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md)) |
| [D18](#d18) | Maile: SMTP, Resend, log | Konfiguracja i usługi | obowiązuje częściowo ([ADR-64](adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md)) |
| [D19](#d19) | `superadmin` jako rola serwisowa | Superadmin | obowiązuje |
| [D20](#d20) | Impersonacja zależna od roli | Superadmin | obowiązuje |
| [D21](#d21) | Superadmin wchodzi do dowolnej organizacji, zawsze jednej | Superadmin | obowiązuje |
| [D22](#d22) | Tryb serwisowy: dialog i potwierdzenie w komendzie | Superadmin | obowiązuje |
| [D23](#d23) | Bez komentarzy w kodzie | Jakość i proces | obowiązuje |
| [D24](#d24) | Test architektury punktów wejścia serwera | Jakość i proces | obowiązuje |
| [D25](#d25) | Testy adwersarialne | Jakość i proces | obowiązuje |
| [D26](#d26) | Mutation testing i bramka plików krytycznych | Jakość i proces | obowiązuje |
| [D27](#d27) | next-intl i namespace tłumaczeń feature | i18n | obowiązuje |
| [D28](#d28) | CLI w `kit/cli`, commitowany bundel `.wa/bin/wa.mjs`, `git clone` tagu | CLI i składanie projektu | obowiązuje częściowo ([ADR-56](adrs/56-workspace-packages-replace-d29.md)) |
| [D29](#d29) | Workspaces `packages/*` i `apps/*` statyczne i puste | CLI i składanie projektu | zastąpiona ([ADR-56](adrs/56-workspace-packages-replace-d29.md)) |
| [D30](#d30) | Zależności npm mają właścicieli; przy konflikcie w `wa add` wygrywa wersja projektu | CLI i składanie projektu | obowiązuje |
| [D31](#d31) | Hashe plików bez treści regionów; pliki zarządzane i generowane | CLI i składanie projektu | obowiązuje |
| [D32](#d32) | Placeholdery jako dosłowna podmiana w `placeholderFiles` | CLI i składanie projektu | obowiązuje |
| [D33](#d33) | Języki projektu w `.wa/kit.json` i pliku generowanym | CLI i składanie projektu | obowiązuje |
| [D34](#d34) | `wa remove` „wszystko albo nic”, `--force` | CLI i składanie projektu | obowiązuje |
| [D35](#d35) | `--setup` przy `wa create` opcjonalny | CLI i składanie projektu | obowiązuje |
| [D36](#d36) | Funkcje projektu w `projectModules` | CLI i składanie projektu | obowiązuje |
| [D37](#d37) | Testy rdzenia sprawdzają tylko moduły rdzenia | CLI i składanie projektu | obowiązuje |
| [D38](#d38) | Własność plików i zależności w manifestach `kit/modules/*.json`, pilnowana testem | Model kitu | obowiązuje (zastępuje [D02](#d02)) |
| [D39](#d39) | Moduł wpina się przez deklaracje w `defineModule` i punkty wejścia rdzenia | Model kitu | obowiązuje (zastępuje [D01](#d01)) |
| [D40](#d40) | `trackAudit` w rdzeniu działa bez modułu; ujścia `auditSinks` | Moduły kitu | obowiązuje |
| [D41](#d41) | Redakcja danych wrażliwych przed zapisem; bez retencji | Moduły kitu | obowiązuje |
| [D42](#d42) | Zdarzenia organizacji łapane hookami better-auth | Moduły kitu | obowiązuje |
| [D43](#d43) | Klucze API: HMAC z pepperem, zakresy, limit, bez `OrgContext` | Moduły kitu | obowiązuje |
| [D44](#d44) | Uploads: magazyn plików, cele uploadu, widoczność i `Cache-Control`, cofnięcie obiektu | Moduły kitu | obowiązuje |
| [D45](#d45) | Region `wa:ci-integration` i pole `ciSteps`; pusty region bez markerów pomijany | CLI i składanie projektu | obowiązuje |
| [D46](#d46) | Kit wydawany tagiem `v<version>`; projekt pobiera kit tylko w swojej wersji | Wydanie | obowiązuje |
| [D47](#d47) | `wa update`: cały projekt do jednej wersji kitu, scalanie trójstronne, konflikty w plikach | CLI i składanie projektu | obowiązuje |
| [D48](#d48) | Walidacja `env` przy starcie procesu | Konfiguracja i usługi | obowiązuje |
| [D49](#d49) | Uploads: provider storage `local` albo `s3`, domyślnie `local` | Moduły kitu | obowiązuje |
| [D50](#d50) | Testy architektury repo w rdzeniu kitu | Jakość i proces | obowiązuje |
| [D51](#d51) | Guard organizacji w runtime rzuca błąd; `Member` i `Invitation` poza guardem; `withoutTenantScope` jako jedyne wyjście | Dane i organizacje | obowiązuje |
| [D52](#d52) | Skille projektowe, Task Router i allowlista `permissions` jako pliki rdzenia | Jakość i proces | obowiązuje |

<a id="d01"></a>

## D01 · Kod kitu trafia do projektu jako zwykły kod, bez paczek npm i punktów rozszerzeń

**Status:** zastąpiona przez [D39](#d39) · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (sekcja „Moje decyzje”); Jakub potwierdził model jako swoją decyzję (handoff z 2026-10-27 12:09)

**Co się zmieniło.** Plan 3 wprowadził deklaracje modułu w `defineModule` (`auditActions`, `apiScopes`, `uploadPurposes`) i punkt wejścia `trackAudit` z ujściami `auditSinks`, więc zdanie „bez punktów rozszerzeń” przestało być prawdą; kopiowanie kodu bez paczek npm zostaje i opisuje je [D39](#d39). Poniżej treść z 2026-10-28 jako zapis historii.

**Kontekst.** Każdy projekt Web Amigos zaczynał się od ręcznego przenoszenia kodu z poprzednich repozytoriów: logowania, użytkowników, maili, tłumaczeń, CI. Analiza 20 repozytoriów pokazała niemal identyczny stos i te same funkcje, a w 14 z nich te same modele kont i sesji. Kit ma dostarczać ten kod raz, sprawdzony. Trzeba było zdecydować, w jakiej postaci kod trafia do projektu: jako zależność, którą projekt instaluje i konfiguruje, czy jako zwykły kod w repozytorium projektu.

**Decyzja.** Kod rdzenia i modułów jest kopiowany do projektu i staje się jego zwykłym kodem, który projekt może dowolnie zmieniać. `.wa/kit.json` zapisuje, skąd kod pochodzi (wersja kitu, moduły). Moduł to zestaw plików w aplikacji, a nie paczka z punktami rozszerzeń. Rejestr modułów to statyczne importy w plikach generowanych ([D03](#d03), [D04](#d04)), a nie ładowanie w trakcie działania aplikacji.

**Odrzucone alternatywy.**

- Moduły jako paczki npm. Wymagałyby wersjonowania i publikacji przy każdej zmianie.
- Kit jako framework z wstrzykiwaniem zależności, ładowaniem pluginów w trakcie działania i systemem nadpisań, jak w OpenMercato (starterze, z którego design doc wziął sam pomysł).
- Składanie projektu przez flagi w trakcie działania (`FEATURE_X=true`). W projekcie ma być tylko kod wybranych modułów.

**Konsekwencje.**

- Zmiana w skopiowanym kodzie nie wymaga forka ani publikacji paczki. Poprawkę, która przyda się innym projektom, wysyła się jako pull request do `webamigos/wa-kit` (reguła „Pochodzenie kodu” w [CLAUDE.md](../CLAUDE.md)). To proces, a nie automat.
- Flagi `MULTI_ORG`, `AUTH_PUBLIC_SIGNUP` i `ADMIN_IMPERSONATION` zmieniają działanie aplikacji, a nie to, z jakiego kodu się składa.
- CLI kitu (`kit/cli/src/bin.ts`) ma komendy `create`, `add`, `remove`, `list`, `generate` i `kit sync`. Zakłada projekt z kitu, dodaje i usuwa moduły oraz odświeża pliki generowane, ale nie ściąga do projektu poprawek wprowadzonych w kicie po jego utworzeniu. Co dokumentacja świadomie pomija, opisuje [README.md](README.md).

**Jak egzekwowana.** Tylko konwencja. `package.json` aplikacji nie ma w zależnościach żadnej paczki kitu (CLI leży w `kit/cli`, a skrypt `npm run wa` uruchamia jego bundel `.wa/bin/wa.mjs`), ale nic nie blokuje dodania takiej zależności.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §1, §2 (anty-cele) i §9; [CLAUDE.md](../CLAUDE.md), „Pochodzenie kodu”.

<a id="d02"></a>

## D02 · Aplikacja referencyjna w katalogu głównym repozytorium; własność plików w `.wa/kit.json`

**Status:** zastąpiona przez [D38](#d38) · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§9); położenie w katalogu głównym zmieniono przy planowaniu planu 1 (adnotacja w design doc §6)

**Co się zmieniło.** Po planie 2 manifesty modułów leżą w `kit/modules/<nazwa>.json`, a `.wa/kit.json` kitu jest ich kopią z `wa kit sync`; kompletność własności plików i zależności sprawdza test, więc źródło i egzekwowanie opisane niżej są nieaktualne, a aplikacja referencyjna w katalogu głównym zostaje w [D38](#d38). Poniżej treść z 2026-10-28 jako zapis historii.

**Kontekst.** Kit trzeba rozwijać i testować jak zwykłą aplikację, a jednocześnie przy tworzeniu projektu musi się dać rozłożyć na rdzeń i moduły. Do tego potrzebna jest informacja, który plik należy do którego modułu.

**Decyzja.** Kit zawiera jedną działającą aplikację referencyjną ze wszystkimi modułami. Leży w katalogu głównym repozytorium, z takim samym układem katalogów jak projekt klienta. Każdy moduł ma manifest z listą swoich plików (`files`, wzorce glob). Projekt powstaje komendą `wa create`: kopiuje aplikację bez plików niewybranych modułów i przegenerowuje pliki łączące ([D03](#d03)).

Manifest leży w `.wa/kit.json` jako `modules.core.manifest` (schemat `kitStateSchema` w `kit/cli/src/manifest/schema.ts`). W kicie jest jeden moduł, `core`; projekt ma rdzeń i wybrane moduły. Pole `files` każdego modułu w `.wa/kit.json` projektu zawiera hashe skopiowanych plików, na których `wa remove` rozpoznaje lokalne zmiany. W kicie `files` jest puste, bo hashe powstają przy tworzeniu projektu.

**Odrzucone alternatywy.**

- Osobne katalogi modułów zamiast jednej aplikacji z manifestami własności (design doc §9).
- Aplikacja w podkatalogu `app/` (pierwotny design doc §6). Zagnieżdżone workspaces npm (`apps/worker` w `app/`) nie działają, a ten sam układ co w projekcie upraszcza kopiowanie i aktualizacje.

**Konsekwencje.**

- Pliki tylko dla kitu (`kit/`, `docs/`) leżą obok aplikacji i nie należą do żadnego manifestu.
- Kod czyta z `files` tylko wzorce zaczynające się od `src/features/<x>/`: na ich podstawie `wa generate` wykrywa feature (`FEATURE_GLOB` w `kit/cli/src/generate/index.ts`). Pozostałe wzorce (`src/shared/**`, `src/app/**` i inne) są tylko zapisem własności.
- Każdy feature musi mieć osobny wzorzec: wzorzec z nawiasami, na przykład `src/features/{auth,users}/**`, generator pomija bez błędu (ruling R14). Wzorzec katalogu, którego nie ma na dysku, też jest pomijany, więc manifest może wymieniać feature z wyprzedzeniem (ruling R5).
- Feature, którego nie obejmuje żaden wzorzec w `.wa/kit.json`, nie trafia do rejestru modułów: nie ma nawigacji, `requireModuleAccess` nie zna jego klucza, a jego tłumaczenia się nie ładują. Dotyczy to także funkcji projektu klienta, która dostaje wpis w `projectModules` ([krok 3 tutorialu](09-nowy-modul.md#krok-3)).
- Manifest `core` nie wymienia wszystkich plików rdzenia (brakuje na przykład `scripts/**`, `e2e/**` i `src/proxy.ts`; lista w checkliście handoffu planu 1). Design doc §4.2 i §7 zapowiadają kontrolę w CI, że każdy plik ma dokładnie jednego właściciela; w kodzie takiej kontroli nie ma.

**Jak egzekwowana.**

- `readKitState` w `kit/cli/src/manifest/kit-state.ts` sprawdza `.wa/kit.json` schematem Zod i przerywa `wa generate` przy błędnym pliku (testy: `kit/cli/src/manifest/__tests__/kit-state.test.ts`). CI uruchamia generator w każdym przebiegu (`.github/workflows/ci.yml`, krok „Regenerate wa files”).
- Kompletność własności (każdy plik należy do dokładnie jednego modułu): tylko konwencja.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §4.1, §4.2, §6, §7 i §9; [plan 1](superpowers/plans/2026-10-26-wa-kit-plan-1-core.md), sekcja „Architecture”; rulingi R5 i R14 oraz checklista dla planu 2 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md).

<a id="d03"></a>

## D03 · Moduł nie edytuje rdzenia; rdzeń widzi moduły przez pliki generowane i regiony `wa:*`

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§9 „Moje decyzje”)

**Kontekst.** Moduły mają się dać włączyć przy tworzeniu projektu i dodać później bez ręcznego wpinania w schemat bazy, nawigację, tłumaczenia i zmienne środowiskowe (design doc §2). Gdyby moduł zmieniał pliki rdzenia, każde dodanie, usunięcie albo aktualizacja modułu oznaczałaby scalanie cudzych zmian w tych samych plikach.

**Decyzja.** Moduł tylko dodaje pliki. Rdzeń „wie” o modułach wyłącznie przez szwy: pliki generowane i regiony między markerami, które przepisuje `wa generate`. Listę szwów podaje `AGENTS.md` („Moduły i pliki generowane”), ale bez pliku `src/i18n/locales.generated.ts`, regionu `wa:ci-integration` i tablicy `auditSinks`; `CLAUDE.md` („Pliki generowane”) też nie wymienia `src/i18n/locales.generated.ts` (rozbieżność R1 w notatce rozbieżności części 2); tabela podaje wszystkie szwy z kodu (`kit/cli/src/generate/registry.ts` i `targets.ts`), co do nich trafia i skąd generator to bierze:

| Szew | Co trafia do środka | Skąd |
| --- | --- | --- |
| `src/modules.generated.ts` | `modules`, `moduleEnvSchemas`, `authPlugins`, `auditSinks`, `moduleMessages` | `module.ts`, `env.ts`, `auth.ts`, `audit-sink.ts`, `i18n/<locale>.json` każdego feature |
| `src/modules.client.generated.ts` | `clientModules`, `authClientPlugins` | `module.ts`, `auth-client.ts` |
| `src/i18n/locales.generated.ts` | `locales` | pole `locales` w `.wa/kit.json` ([D33](#d33)) |
| region `wa:relations` w `prisma/schema/auth.prisma` i `prisma/schema/organizations.prisma` | pola relacji zwrotnych w modelach `User` i `Organization` | `schemaRelations` manifestów |
| region `wa:modules` w `.env.example` | zmienne modułów innych niż `core` | pole `env` manifestu |
| region `wa:services` w `docker-compose.yml` | usługi Dockera modułów | plik wskazany w polu `compose` manifestu |
| region `wa:ci-integration` w `.github/workflows/ci.yml` i `.github/workflows/mutation.yml` | kroki joba testów integracyjnych i przebiegu integracyjnego Strykera | plik wskazany w polu `ciSteps` manifestu ([D45](#d45)) |

Poza szwami generowanymi rdzeń ma punkty wejścia, które woła kod modułu albo projektu (`trackAudit`, `auditActor`), i pola danych w `defineModule`, z których moduły czytają wkład innych modułów ([D39](#d39), [D40](#d40)).

**Odrzucone alternatywy.**

- Ręczne wpinanie modułu w pliki rdzenia (cel z design doc §2 mówi wprost, że ma go nie być).
- Ładowanie modułów i pluginów w trakcie działania aplikacji ([D01](#d01), [D39](#d39)).

**Konsekwencje.**

- Nowy feature modułu kitu to nowe pliki, wzorzec w `kit/modules/<x>.json` i przebieg `npm run wa -- kit sync`, który przepisuje `.wa/kit.json` kitu ([D38](#d38)), a potem `npm run wa -- generate`. Funkcja projektu klienta dostaje zamiast tego wpis w `projectModules` w `.wa/kit.json` projektu ([D36](#d36)) i przebieg `npm run wa -- generate`.
- Uszkodzony marker (brak końca, podwójny początek) albo marker w treści regionu przerywa generator błędem z nazwą pliku i markera, a żaden plik nie zostaje zmieniony (`replaceRegion` w `kit/cli/src/generate/regions.ts`).
- Plik docelowy bez markerów jest pomijany, gdy region byłby pusty; gdy moduł ma coś do wpisania, generator kończy się błędem `brak regionu` ([D45](#d45)).
- Design doc §4.3 wymienia też szwy, których kod nie ma albo ma inaczej (osobne pliki pluginów better-auth, generowane `workspaces`). Pole `workspaces` manifestu istnieje w schemacie, ale żaden kod go nie czyta ([D29](#d29)). Obowiązuje tabela powyżej.

**Jak egzekwowana.**

- Ręczna zmiana w pliku generowanym albo w regionie: job `verify` w `.github/workflows/ci.yml` ([D04](#d04)).
- Poprawność regionów: testy `kit/cli/src/generate/__tests__/regions.test.ts`, `generate.test.ts` („uszkodzony marker: błąd i żaden plik nie zmieniony”) i `ci-steps.test.ts`, uruchamiane w bramce CLI (`npm run verify --prefix kit/cli`, job `cli` w `.github/workflows/kit.yml`).
- To, że moduł nie zmienia plików rdzenia poza regionami: tylko konwencja. Test własności ([D38](#d38)) zatrzyma plik, który należy do dwóch manifestów, ale nie zmianę treści pliku rdzenia.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §2, §4.1, §4.3 i §9; [AGENTS.md](../AGENTS.md), „Moduły i pliki generowane”; [CLAUDE.md](../CLAUDE.md), „Pliki generowane”; [spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) §7 i §8 (`auditSinks`, `wa:ci-integration`).

<a id="d04"></a>

## D04 · Pliki generowane są commitowane, bajtowo równe wyjściu `wa generate` i wyłączone z Prettiera i ESLint

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (commitowanie, §4.3); wykonawca planu 1 (ruling R17: równość bajtowa i wyłączenie z formatowania; ruling R12: bez nagłówka w regionach)

**Kontekst.** Aplikacja importuje rejestr modułów w wielu miejscach, na przykład `src/shared/lib/env.ts` importuje `@/modules.generated`. Bez tych plików nie działa `npm run build`, `npm run typecheck` ani `npm test`. Bundel CLI `.wa/bin/wa.mjs` jest w repozytorium, więc projekt nie wymaga budowania CLI przed generatorem. Z drugiej strony plik zmieniony ręcznie albo przez formatter rozjeżdża się z tym, co zapisze generator.

**Decyzja.** Trzy pliki generowane, `src/modules.generated.ts`, `src/modules.client.generated.ts` i `src/i18n/locales.generated.ts` ([D33](#d33)), oraz regiony `wa:*` są commitowane. Ich treść ma być bajt w bajt taka, jaką zapisuje `wa generate`. Wszystkie trzy pliki są wpisane do `.prettierignore` i do `globalIgnores` w `eslint.config.mjs`, więc `lint-staged` (`.lintstagedrc.json`) ich nie przeformatuje. Zaczynają się linią nagłówka `// generated by wa — nie edytuj. Uruchom: npm run wa -- generate` (`GENERATED_HEADER` w `kit/cli/src/generate/registry.ts`), z tą samą komendą, którą podaje `AGENTS.md`. Regiony nie mają nagłówka, bo oznaczają je same markery.

**Odrzucone alternatywy.** Nie zapisano. Design doc podaje powód commitowania: projekt działa bez CLI.

**Konsekwencje.**

- Po zmianie `.wa/kit.json` albo po dodaniu lub usunięciu `module.ts`, `env.ts`, `auth.ts`, `auth-client.ts`, `audit-sink.ts` lub `i18n/<locale>.json` w feature, a także po zmianie pliku wskazanego w polu `compose` albo `ciSteps` manifestu, uruchom `npm run wa -- generate` i zacommituj wynik razem ze zmianą. Generator wypisuje zmienione pliki albo `Bez zmian`.
- Pliki generowane nie należą do żadnego manifestu i nie mają hasha w `.wa/kit.json` projektu: `wa create` ich nie kopiuje, tylko tworzy generatorem ([D31](#d31)).

**Jak egzekwowana.**

- Job `verify` w `.github/workflows/ci.yml` (push i pull request do `main`): kroki „Regenerate wa files” (`npm run wa -- generate`) i „Generated files are up to date” (`git diff --exit-code`). Każda różnica przerywa job przed `npm run verify`.
- `.prettierignore` i `globalIgnores` w `eslint.config.mjs`.
- Idempotencja generatora: `kit/cli/src/generate/__tests__/generate.test.ts` („drugie uruchomienie nic nie zmienia”), w bramce CLI.
- W repozytorium kitu job `cli` w `.github/workflows/kit.yml` (krok „Kit state and generated files are up to date”), a w każdym złożonym projekcie job `assemble` (krok „Generated files are up to date”).

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §4.3 (ostatni akapit); rulingi R12 i R17 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md); [plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzje D5 i D7 oraz „Global Constraints” (nagłówek plików generowanych).

<a id="d05"></a>

## D05 · Definicja modułu (`module.ts`) to czyste dane bezpieczne dla klienta, z polami `adminOnly`, `multiOrgRoles` i `public`

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** wykonawca planu 1 (rulingi R3, R9 i R13); Jakub (decyzje 2 i 3 do macierzy dostępu: przy `MULTI_ORG=false` stronę „Użytkownicy” widzi tylko admin globalny, a nawigacja pokazuje dokładnie to, do czego jest dostęp)

**Kontekst.** Definicję modułu z `module.ts` czytają dwa miejsca: guard stron na serwerze (`requireModuleAccess` przez `src/shared/lib/auth/permissions.ts`) i menu boczne w przeglądarce (`src/shared/components/app-sidebar.tsx` z `"use client"`, przez `src/shared/lib/modules/nav.ts`). Oba biorą ją z `clientModules`. Gdyby `module.ts` importował kod serwerowy, ten kod trafiłby do paczki przeglądarki. Gdyby rejestr klienta miał tylko część pól, menu i guard mogłyby inaczej rozstrzygać, kto ma dostęp.

**Decyzja.**

- `module.ts` eksportuje domyślnie `defineModule({...})` (ruling R3). `defineModule` w `src/shared/lib/modules/define-module.ts` zwraca przekazany obiekt bez zmian, a TypeScript sprawdza, że pasuje do typu `ModuleDef`. Pliki opcjonalne feature mają nazwane eksporty: `env.ts` → `envSchema`, `auth.ts` → `authPlugin`, `auth-client.ts` → `authClientPlugin`, `audit-sink.ts` → `auditSink`.
- `module.ts` zawiera same dane, bez importów serwerowych (ruling R13). Rejestr klienta eksportuje pełne definicje modułów, a nie wybrane pola.
- Pola `ModuleDef`: `key`, `nav` (pozycje menu: `href`, `labelKey`, opcjonalny `multiOrgLabelKey`, `icon`, `order`), `routePrefixes`, `roles`, `public`, `adminOnly`, `multiOrgRoles`.
- Dostęp rozstrzyga `canAccessModule` w `src/shared/lib/auth/permissions.ts`, w tej kolejności: rola globalna `admin` lub `superadmin` → dostęp; `public: true` → dostęp; brak roli w organizacji → brak dostępu; `adminOnly: true` → dostęp tylko przy `MULTI_ORG=true` i roli z `multiOrgRoles` (ruling R9); w pozostałych przypadkach dostęp ma każda rola, chyba że `roles` zawęża listę.
- Definicja modułu `users` ma `adminOnly: true` i `multiOrgRoles: ["owner", "admin"]`.

**Odrzucone alternatywy.** Rejestr klienta z wybranymi polami zamiast pełnych definicji (pierwotny zapis planu 1, poprawiony rulingiem R13).

**Konsekwencje.**

- Menu pokazuje pozycje dokładnie tych definicji modułów, przez które guard wpuszcza, bo `getNavEntries` filtruje je tym samym `canAccessModule`. Ukrycie w menu nie jest jednak ochroną ([D11](#d11)).
- `routePrefixes` i `public` nie wpływają na to, kto wchodzi na stronę. `routePrefixes` czyta tylko `canAccessPath` i `moduleForPath`, których kod produkcyjny nie wywołuje. `public: true` mają definicje modułów `auth` i `organizations`, które nie mają pozycji w menu, a żadna strona nie woła dla nich `requireModuleAccess`.
- Import paczki `server-only` w `module.ts` kończy `npm run build` błędem, bo plik trafia do komponentu klienckiego.

**Jak egzekwowana.**

- `npm run typecheck`: `permissions.ts` i `nav.ts` przypisują `clientModules` do `readonly ModuleDef[]`, a pliki generowane importują domyślny eksport `module.ts` i nazwane eksporty pozostałych plików.
- `kit/cli/src/generate/__tests__/registry.test.ts` („klient eksportuje pełne obiekty modułów, nie projekcję pól”).
- `src/shared/lib/auth/__tests__/permissions.test.ts` i `src/shared/lib/auth/__tests__/access-matrix.test.ts` (120 kombinacji definicji modułu, roli globalnej, roli w organizacji i `MULTI_ORG` oraz zgodność menu z macierzą, „decyzja 3”).
- Brak importów serwerowych w `module.ts`: tylko pośrednio przez `npm run build`. Nie ma testu, który to sprawdza wprost.

**Źródło.** Rulingi R3, R9 i R13 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md); decyzje 2 i 3 do macierzy dostępu w nazwach testów `access-matrix.test.ts`.

<a id="d06"></a>

## D06 · Organizacje w rdzeniu, jeden poziom; `MULTI_ORG` nie zmienia modelu danych

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (Jakub nie był pewien); Jakub potwierdził ją jako decyzję (handoff z 2026-10-27 12:09)

**Kontekst.** Siedem z czternastu projektów Web Amigos z logowaniem używa organizacji. Dodanie podziału danych na organizacje do działającej aplikacji kosztuje dużo więcej niż kolumna `organizationId` od początku. Jednocześnie interfejs ma domyślnie działać w trybie jednej organizacji, bez tworzenia nowych organizacji (design doc §3.1).

**Decyzja.** Organizacje są w rdzeniu: plugin `organization` better-auth, modele `Organization`, `Member` i `Invitation` (`prisma/schema/organizations.prisma`), aktywna organizacja zapisana w sesji. Jest jeden poziom: bez nadrzędnego poziomu „Tenant” i bez drzewa organizacji. Model danych zawsze dopuszcza wiele organizacji, a flaga `MULTI_ORG` (domyślnie `false`) zmienia tylko przepływy i uprawnienia:

| Obszar | `MULTI_ORG=false` | `MULTI_ORG=true` |
| --- | --- | --- |
| Rejestracja bez zaproszenia (gdy pozwala na nią [D10](#d10)) | Konto dołącza do najstarszej organizacji jako `member`. | Powstaje nowa organizacja z kontem jako `owner`. |
| Tworzenie organizacji przez użytkownika | Wyłączone (`allowUserToCreateOrganization`). | Dozwolone (przycisk „+” nad treścią strony). |
| Przełącznik organizacji | Widoczny, gdy konto ma dostęp do więcej niż jednej organizacji. | Tak samo. |
| Endpointy better-auth do zarządzania organizacją (zaproszenia, członkowie, role, zespoły) | Tylko rola globalna `admin` lub `superadmin` (`src/shared/lib/auth/single-org-guard.ts`). | Według roli w organizacji. |
| Strona „Użytkownicy” (feature `users`) dla `owner` i `admin` organizacji | Brak dostępu. | Dostęp, w menu jako „Członkowie”. |

**Odrzucone alternatywy.**

- Osobny poziom „Tenant” nad organizacją i drzewo organizacji (design doc §3.1).
- Organizacje jako moduł opcjonalny (pierwotny zakres v1, design doc §9).

**Konsekwencje.**

- Przejście z `false` na `true` nie wymaga migracji.
- Każda tabela domenowa ma `organizationId` także w aplikacji z jedną organizacją ([D07](#d07)).
- Co widać w interfejsie w każdym trybie, opisuje [01-uruchomienie.md](01-uruchomienie.md#tryby-uruchomienia), a przepływy [03-dane-i-organizacje.md](03-dane-i-organizacje.md).

**Jak egzekwowana.**

- Schemat Prisma nie zależy od `MULTI_ORG`: tylko konwencja.
- Zachowanie obu trybów: `src/shared/lib/auth/__tests__/access-matrix.test.ts`, `src/shared/lib/auth/__tests__/single-org-guard.test.ts` (z testem kompletności, który wylicza endpointy pluginu `organization` i wymaga guardu dla każdego endpointu zarządzania), `src/shared/lib/auth/__tests__/signup-endpoint.test.ts`, `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts`.
- E2E w dwóch trybach: projekty `core-auth` (`MULTI_ORG=false`) i `multi-org` (`MULTI_ORG=true`) w `playwright.config.ts`, uruchamiane przez `.github/workflows/e2e.yml`.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §3.1 i §9.

<a id="d07"></a>

## D07 · Jawny filtr `organizationId` z `getOrgContext()`, bez rozszerzenia Prisma

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§3.1)

**Kontekst.** Dane wszystkich organizacji leżą w jednej bazie. Zapytanie, które pominie warunek na organizację, pokaże użytkownikowi jednej firmy dane innej. Trzeba było zdecydować, kto pilnuje tego warunku: kod każdego zapytania czy warstwa pod nim, która dokleja go automatycznie.

**Decyzja.**

- Każda tabela domenowa (także w modułach opcjonalnych) ma wymagane `organizationId` z indeksem.
- Zapytania i komendy na danych domenowych biorą `organizationId` z `getOrgContext()` (`src/shared/lib/auth/org-context.ts`) i filtrują po nim jawnie w każdym wywołaniu Prismy. Kod nie czyta `activeOrganizationId` z sesji samodzielnie.
- `getOrgContext()` zwraca `{ userId, organizationId, orgRole, userRole, serviceMode }`. Czyta sesję z bazy z pominięciem cookie cache better-auth (kopii sesji w ciasteczku, ważnej 5 minut), bo aktywna organizacja może się zmienić po stronie serwera. Bez sesji przekierowuje na `/sign-in`. Bez aktywnej organizacji albo bez członkostwa w niej rzuca `NoOrganizationError` (wyjątek dla superadmina opisuje [D21](#d21)). Nigdy nie zwraca kontekstu bez organizacji.
- Nie ma automatycznego filtrowania przez rozszerzenie Prisma. Rozszerzenie z [D51](#d51) niczego nie dokleja: odrzuca zapytanie, które filtra nie ma.

**Odrzucone alternatywy.** Automatyczne filtrowanie przez rozszerzenie klienta Prisma (design doc §3.1). Źródło nie podaje powodu odrzucenia.

**Konsekwencje.**

- Autor każdego nowego zapytania musi sam dopisać filtr. Od [D51](#d51) brak filtra na modelu z `organizationId` (poza `Member` i `Invitation`) kończy się błędem `TenantScopeError`. Filtr po złej organizacji guard przepuszcza, więc każde nowe query i komenda dostaje test izolacji z dwiema organizacjami (`AGENTS.md`).
- Brak organizacji kończy się błędem albo przekierowaniem, nigdy pustym filtrem, który zwróciłby dane wszystkich organizacji.
- Konta (`User`) są globalne, a nie domenowe. Lista kont dla admina globalnego (`getUserAccountsQuery`) nie filtruje po organizacji.
- Szczegóły i przykład z istniejącego query: [03-dane-i-organizacje.md](03-dane-i-organizacje.md).

**Jak egzekwowana.**

- `src/__tests__/server-entrypoints-guard.test.ts` wymaga, żeby każda eksportowana funkcja w pliku `"use server"` i w `services/queries/` wywołała guard sesji przed Prismą ([D24](#d24)). Nie sprawdza, czy zapytanie filtruje po `organizationId`.
- `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts` sprawdza izolację na prawdziwym Postgresie (job `integration` w `.github/workflows/ci.yml`).
- Bramka mutacji obejmuje `src/features/organizations/services/` i `src/shared/lib/auth/` ([D26](#d26)).
- Obecność filtra w nowym zapytaniu: guard organizacji w runtime ([D51](#d51)) dla zapytań przez delegata modelu. Raw SQL, zapytania zagnieżdżone, `Member` i `Invitation`: tylko konwencja i test izolacji, który dopisuje autor.
- Wymagane `organizationId` z indeksem w tabelach domenowych: tylko konwencja. Żaden test nie czyta schematu Prisma pod tym kątem.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §3.1; [AGENTS.md](../AGENTS.md) i [CLAUDE.md](../CLAUDE.md), „Dane i organizacje”.

<a id="d08"></a>

## D08 · Dwa poziomy ról: globalne i w organizacji

**Status:** obowiązuje · **Data:** 2026-10-26 (rola `superadmin` dodana 2026-10-27, [D19](#d19)) · **Kto zdecydował:** autor design doc (§3.1 i §9)

**Kontekst.** W aplikacji klienta są dwa rodzaje uprawnień. Ktoś zarządza kontami całej aplikacji, a w obrębie firmy ktoś inny zarządza jej członkami. Jedna rola nie opisze obu.

**Decyzja.**

- Rola globalna jest zapisana w `user.role` (plugin `admin` better-auth): `user`, `admin`, `superadmin`. `admin` to administrator aplikacji po stronie zleceniodawcy, `superadmin` to serwis Web Amigos.
- Rola w organizacji jest zapisana w `member.role` (plugin `organization`): `owner`, `admin`, `member`.
- Stałe i typy są w `src/shared/lib/auth/roles.ts` (`USER_ROLES`, `ORG_ROLES`). Pole `roles` definicji modułu zawęża dostęp do ról w organizacji, a rola globalna `admin` lub `superadmin` (`isGlobalAdmin`) przechodzi każde takie sprawdzenie.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Nazwa `admin` występuje na obu poziomach. W kodzie i rozmowie mów „rola globalna `admin`” albo „`admin` organizacji”.
- Nieznana wartość roli jest zawężana do najniższej: `toUserRole` → `user`, `toOrgRole` → `member`.
- Rolę globalną czytają dwie funkcje: `toUserRole` (dokładne dopasowanie) i `roleFromStored` w `src/shared/lib/auth/admin-guard.ts` (dzieli wartość po przecinku). Konto z rolą `admin,superadmin` jest więc chronione jak superadmin, ale nie dostaje trybu serwisowego. Niespójność jest świadomie odłożona.
- Macierz dostępu i opis ról: [04-auth-i-role.md](04-auth-i-role.md).

**Jak egzekwowana.**

- `src/shared/lib/auth/__tests__/roles.test.ts`, `permissions.test.ts`, `access-matrix.test.ts`.
- Uprawnienia ról globalnych w pluginie `admin` buduje `createAdminRoles` (`createAccessControl`) w `src/shared/lib/auth/admin-access.ts`: testy `src/shared/lib/auth/__tests__/admin-access.test.ts` i `auth-config.test.ts`.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §3.1 i §9; [AGENTS.md](../AGENTS.md), „Auth”.

<a id="d09"></a>

## D09 · Pierwszy admin przez `admin:create`, bez strony `initial-account`

**Status:** obowiązuje · **Data:** 2026-10-26 (opcja `--role` od 2026-10-27) · **Kto zdecydował:** Jakub (pierwszy admin przez komendę, rejestracja bez specjalnej logiki); szczegóły implementacji autor design doc

**Kontekst.** Wcześniejsze projekty Web Amigos miały trasę `initial-account` do założenia pierwszego konta. Przy rejestracji zamkniętej domyślnie ([D10](#d10)) ktoś musi założyć pierwsze konto i pierwszą organizację, zanim ktokolwiek się zaloguje.

**Decyzja.** Pierwsze konto zakłada skrypt `npm run admin:create -- --email <email>` (`scripts/admin-create.ts`, logika w `scripts/lib/admin-create.ts`):

- tworzy konto przez `auth.api.createUser` z rolą globalną `admin` (albo `superadmin` przy `--role superadmin`) i potwierdzonym adresem e-mail;
- na pustej bazie tworzy organizację z kontem jako `owner`, a gdy organizacja już jest, dopisuje konto do najstarszej jako `owner`;
- bez `--password` i `ADMIN_PASSWORD` generuje hasło i wypisuje je raz;
- jest idempotentny: drugie uruchomienie nie tworzy duplikatów i nie zmienia hasła;
- podnosi rolę istniejącego konta tylko po potwierdzeniu albo z `--yes` i nigdy jej nie obniża.

Nie ma strony `initial-account`, a rejestracja nie ma logiki dla administratora: zawsze tworzy konto z rolą `user`.

**Odrzucone alternatywy.** Strona `initial-account` i specjalna logika administratora w `sign-up` (design doc §9).

**Konsekwencje.**

- Przy `AUTH_PUBLIC_SIGNUP=true` i `MULTI_ORG=false` rejestracja bez zaproszenia przed uruchomieniem skryptu kończy się błędem „Aplikacja nie jest skonfigurowana: uruchom npm run admin:create” i nie zostawia konta bez organizacji. Przy domyślnym `AUTH_PUBLIC_SIGNUP=false` taką rejestrację wcześniej odrzuca bramka z [D10](#d10) (403 „Rejestracja jest wyłączona”).
- Na produkcji skrypt uruchamia się raz przez `railway run` z publicznym adresem bazy ([10-wdrozenie.md](10-wdrozenie.md)).
- Wszystkie opcje: [01-uruchomienie.md](01-uruchomienie.md#admin-create).

**Jak egzekwowana.**

- `scripts/lib/__tests__/admin-create.test.ts` (idempotencja, potwierdzenie, brak obniżania roli, nieznana rola).
- `src/shared/lib/auth/__tests__/signup-endpoint.test.ts` („MULTI_ORG=false bez organizacji → czytelny błąd i brak użytkownika”, przy publicznej rejestracji) i `auth-config.test.ts` („rejestracja tworzy użytkownika z rolą user”).
- `e2e/global-setup.ts` zakłada konto testowe tym skryptem przed testami e2e.
- Brak strony `initial-account`: tylko konwencja.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §1 i §9; commit `d7d9266` (`--role`).

<a id="d10"></a>

## D10 · Rejestracja przez bramkę serwerową; domyślnie tylko z zaproszenia

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§9: `AUTH_PUBLIC_SIGNUP`, domyślnie `false`); wykonawca planu 1 (rulingi R7 i R8)

**Kontekst.** Formularz rejestracji wysyła żądanie do publicznego endpointu better-auth `POST /api/auth/sign-up/email`. Ukrycie strony `/sign-up` nie blokuje wywołania tego endpointu wprost, więc o tym, kto może założyć konto, musi decydować serwer.

**Decyzja.** Hook `before` better-auth (funkcja, którą better-auth wywołuje przed obsługą każdego swojego endpointu) w `src/shared/lib/auth/index.ts` obsługuje `/sign-up/email` w dwóch krokach (ruling R7):

1. `enforceSignupPolicy` (`src/features/auth/services/signup-gate.ts`). Przy `AUTH_PUBLIC_SIGNUP=false` przepuszcza tylko żądanie z ważnym zaproszeniem: `invitationId` i `email` zgodny z zaproszeniem (bez względu na wielkość liter), status `pending`, termin niewygasły. Inne żądanie dostaje 403 „Rejestracja jest wyłączona”.
2. `resolveSignupMembership` (`src/features/organizations/services/signup-membership.ts`) ustala, gdzie trafi nowe konto: z zaproszeniem do organizacji i z rolą z zaproszenia (ruling R8), bez zaproszenia według `MULTI_ORG` ([D06](#d06)). Członkostwo zapisuje `databaseHooks.user.create.after`.

Strona `/sign-up` przy wyłączonej rejestracji i bez `invitationId` przekierowuje na `/sign-in`, ale to tylko wygoda: bramkę trzyma serwer.

**Odrzucone alternatywy.** Blokada wyłącznie w interfejsie, przez ukrycie strony (plan 1, „Review Focus”: bezpośredni `POST` musi zostać odrzucony po stronie serwera).

**Konsekwencje.**

- Rejestracja z `invitationId` działa w każdym trybie, ale tylko na adres z zaproszenia.
- „Zaproś użytkownika” na stronie „Użytkownicy” przechodzi przez tę samą bramkę: `inviteUserCommand` tworzy zaproszenie i rejestruje konto przez `auth.api.signUpEmail` z `invitationId`.
- Przepływy i komunikaty: [04-auth-i-role.md](04-auth-i-role.md).

**Jak egzekwowana.**

- Guard w kodzie: hook `before` w `src/shared/lib/auth/index.ts`.
- `src/features/auth/services/__tests__/signup-policy.test.ts`, `signup-gate.test.ts`, `src/shared/lib/auth/__tests__/signup-endpoint.test.ts`.
- `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts` (część „rejestracja z zaproszeniem na prawdziwej bazie”).
- `e2e/core-auth.spec.ts` („rejestracja bez zaproszenia zwraca 403”).
- Bramka mutacji obejmuje `src/features/auth/services/` ([D26](#d26)).

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §9; [plan 1](superpowers/plans/2026-10-26-wa-kit-plan-1-core.md), „Review Focus”; rulingi R7 i R8 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md).

<a id="d11"></a>

## D11 · Strony chroni `requireModuleAccess` z rejestru; nawigacja nie jest ochroną

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** wykonawca planu 1 (ruling R21, poprawka po recenzji); Jakub (decyzje 1 i 3 do macierzy dostępu)

**Kontekst.** Menu boczne ukrywa strony, do których użytkownik nie ma dostępu, ale adres strony można wpisać ręcznie. Layout grupy `(app)` sprawdza tylko sesję i aktywną organizację, a nie uprawnienia do konkretnej strony.

**Decyzja.**

- Każda strona feature w `(app)` wywołuje `requireModuleAccess(key)` (`src/shared/lib/auth/require-module-access.ts`) z kluczem swojej definicji modułu. Funkcja pobiera kontekst z `getOrgContext()`, szuka definicji po `key` w rejestrze (`clientModules`) i sprawdza dostęp tym samym `canAccessModule` co menu ([D05](#d05)).
- Brak dostępu i klucz, którego nie ma w rejestrze, kończą się `notFound()` (strona 404). Brak aktywnej organizacji przekierowuje na `/no-organization` ([D12](#d12)), a brak sesji na `/sign-in`.
- Akcja serwerowa jest osobnym endpointem `POST` i nie przechodzi przez layout ani stronę, więc każda sprawdza uprawnienia sama.

**Odrzucone alternatywy.** Ochrona przez ukrycie pozycji w nawigacji (ruling R21: „nav hiding is not protection”).

**Konsekwencje.**

- Rola globalna `admin` bez członkostwa w aktywnej organizacji też trafia na `/no-organization` („decyzja 1” w `access-matrix.test.ts`). Bez członkostwa wchodzi tylko `superadmin` ([D21](#d21)).
- `canAccessPath` (sprawdzenie po ścieżce) jest w `src/shared/lib/auth/permissions.ts` i ma testy, ale kod produkcyjny go nie wywołuje. Trasę chroni tylko `requireModuleAccess`.
- Macierz dostępu (definicja modułu × rola × `MULTI_ORG`): [04-auth-i-role.md](04-auth-i-role.md).

**Jak egzekwowana.**

- Guard w kodzie: `requireModuleAccess` w każdej stronie feature, czyli w `dashboard/page.tsx`, `users/page.tsx` i `account/page.tsx` w katalogu `src/app/[locale]/(app)/`.
- `src/shared/lib/auth/__tests__/require-module-access.test.ts`, `access-matrix.test.ts` i `src/app/[locale]/(app)/users/__tests__/page.test.tsx` („strona jest chroniona dostępem do modułu users”).
- Sprawdzanie sesji w akcjach serwerowych: `src/__tests__/server-entrypoints-guard.test.ts` ([D24](#d24)). Test nie sprawdza ról.
- To, że nowa strona woła `requireModuleAccess`: tylko konwencja. Nie ma testu, który przegląda strony.

**Źródło.** Ruling R21 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md); commit `48e7f6e`; [AGENTS.md](../AGENTS.md), „Dane i organizacje”; decyzje 1 i 3 do macierzy dostępu w nazwach testów `access-matrix.test.ts`.

<a id="d12"></a>

## D12 · Strona `no-organization` poza guardem `(app)`

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** wykonawca planu 1 (ruling R19)

**Kontekst.** Layout grupy `(app)` (`src/app/[locale]/(app)/layout.tsx`) przy `NoOrganizationError` przekierowuje na `/no-organization`. Gdyby ta strona leżała w `(app)`, ten sam layout przekierowywałby ją na nią samą bez końca.

**Decyzja.** Strona leży w `src/app/[locale]/no-organization/page.tsx`, poza grupą `(app)`, a jej adres się nie zmienia. Sama sprawdza kontekst i przenosi na `/dashboard`, gdy użytkownik ma organizację. Pokazuje organizacje, do których można wejść (członkostwa, a dla superadmina wszystkie), formularz tworzenia organizacji przy `MULTI_ORG=true` i przycisk wylogowania.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.** Strona nie ma menu bocznego ani paska trybu serwisowego. Definicja modułu `organizations` wymienia `/no-organization` w `routePrefixes` z `public: true`.

**Jak egzekwowana.**

- `src/app/[locale]/no-organization/__tests__/page.test.tsx` (przekierowanie na `/dashboard`, lista organizacji) i `src/app/[locale]/(app)/__tests__/layout.test.tsx` („użytkownik bez członkostwa → przekierowanie na /no-organization, nie 500”).
- Położenie strony poza `(app)`: tylko konwencja.

**Źródło.** Ruling R19 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md).

<a id="d13"></a>

## D13 · Kit nie commituje migracji, projekt je commituje

**Status:** obowiązuje · **Data:** 2026-10-26 (ignorowanie plikiem tylko w kicie od 2026-10-28) · **Kto zdecydował:** autor design doc (§5 i §9); wykonawca planu 1 (rulingi R2 i R22); Jakub (decyzja D8 planu 2: ignorowanie zagnieżdżonym `.gitignore` zamiast linii w root `.gitignore`)

**Kontekst.** Schemat bazy projektu zależy od wybranych modułów: każdy moduł dodaje własny plik schematu i relacje w regionach ([D03](#d03), [D14](#d14)). Źródła nie zapisują uzasadnienia wprost, ale z modelu składania wynika, że historia migracji kitu nie pasowałaby do projektu z innym zestawem modułów. Projekt na produkcji stosuje natomiast migracje komendą `npx prisma migrate deploy` (`preDeployCommand` w `railway.toml` albo w ustawieniach usługi, bo nowa usługa Railway nie czyta `railway.toml`, [10-wdrozenie.md](10-wdrozenie.md#config-as-code)), która bierze tylko migracje zapisane w repozytorium.

**Decyzja.** Kit nie dostarcza katalogu `prisma/migrations/` i ignoruje go plikiem `prisma/migrations/.gitignore` (treść: `*` i `!.gitignore`). Plik jest na liście `kitOnly` w `kit/kit.json`, więc `wa create` go nie kopiuje i ignorowanie migracji działa tylko w repozytorium kitu. Każda kopia repozytorium kitu tworzy własną migrację (`npx prisma migrate dev --name init`). Projekt klienta commituje swoje migracje.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Root `.gitignore` nie ignoruje `prisma/migrations/`, więc w projekcie migracje trafiają do repozytorium bez dodatkowych kroków. Bez zacommitowanych migracji `prisma migrate deploy` nie ma czego zastosować, a baza produkcyjna nie dostaje schematu.
- Testy działają bez zacommitowanych migracji: schemat tworzą `src/test/integration/global-setup.ts` (`prisma db push`) i `e2e/global-setup.ts` (`prisma db push --force-reset` albo, gdy migracje istnieją, `prisma migrate reset --force`), a `.github/workflows/e2e.yml` tworzy migrację w trakcie przebiegu. Które komendy czyszczą bazę i jak są zabezpieczone, opisuje [08-testy.md](08-testy.md).
- Rozjazd historii migracji we własnej bazie: [03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#dryf-migracji).

**Jak egzekwowana.** W repozytorium kitu: plik `prisma/migrations/.gitignore`. W projekcie klienta: brak ignorowania, bo plik jest w `kitOnly` i `wa create` go nie kopiuje. To, że projekt commituje migracje: tylko konwencja.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §5 i §9; rulingi R2 i R22 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md); [plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D8; `kit/kit.json` (`kitOnly`).

<a id="d14"></a>

## D14 · Schemat Prisma w wielu plikach; klient w `src/generated/prisma`

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§9, schemat w wielu plikach); wykonawca planu 1 (ruling R16, katalog klienta)

**Kontekst.** Moduł ma dodawać własne modele bez edytowania pliku schematu rdzenia ([D03](#d03)). Przy jednym pliku schematu każdy moduł zmieniałby ten sam plik.

**Decyzja.**

- Schemat jest podzielony na pliki w `prisma/schema/`: `base.prisma` (generator i źródło danych), `auth.prisma`, `organizations.prisma`. Moduł dodaje własny plik `prisma/schema/<modul>.prisma`. `prisma.config.ts` wskazuje katalog (`schema: "prisma/schema"`).
- Relacje zwrotne w modelach rdzenia (`User`, `Organization`) trafiają do regionów `wa:relations` z pola `schemaRelations` manifestu.
- Klient Prismy (generator `prisma-client`) powstaje w `src/generated/prisma` (katalog w `.gitignore`), generuje go skrypt `postinstall` (`prisma generate`), a kod importuje go z `@/generated/prisma/client`. Połączenie tworzy `src/shared/lib/prisma.ts` przez `@prisma/adapter-pg` i pulę `pg`.

**Odrzucone alternatywy.** Jeden plik schematu, jak w repozytoriach źródłowych (design doc §9: podział na pliki to część pracy przy przenoszeniu kodu).

**Konsekwencje.**

- Po instalacji zależności klient jest gotowy. Gdy go brakuje (na przykład po instalacji z `--ignore-scripts`), uruchom `npm run db:generate` ([01-uruchomienie.md](01-uruchomienie.md#typowe-problemy)).
- Pole relacji w modelu rdzenia dodaje się przez manifest i generator, a nie ręcznie w `auth.prisma` czy `organizations.prisma`.

**Jak egzekwowana.**

- Konfiguracja w `prisma.config.ts` i `prisma/schema/base.prisma`; `npm run typecheck` nie przejdzie bez wygenerowanego klienta.
- Ręczna zmiana regionów: job `verify` w `.github/workflows/ci.yml` ([D04](#d04)).
- Modele modułu we własnym pliku: tylko konwencja.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §4.2, §4.3 i §9; ruling R16 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md).

<a id="d15"></a>

## D15 · Logger na OpenTelemetry zamiast pino

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** wykonawca planu 1 (ruling R15)

**Kontekst.** Design doc i plan 1 zakładały logger pino „jak w źródłach”. Repozytoria źródłowe miały jednak logger oparty na OpenTelemetry, bez pino, a plan 1 wymagał przenoszenia kodu ze źródeł zamiast pisania go od nowa.

**Decyzja.** `logger` w `src/shared/lib/logger.ts` ma metody `debug`, `info`, `warn` i `error` (`message`, opcjonalne atrybuty) i wysyła wpisy przez API logów OpenTelemetry (`@opentelemetry/api-logs`). Gdy ustawiono `OTEL_EXPORTER_OTLP_ENDPOINT`, `src/instrumentation.ts` rejestruje eksport w protokole OTLP (format przesyłania danych OpenTelemetry) przez HTTP pod `<endpoint>/v1/logs`, z nazwą usługi z `OTEL_SERVICE_NAME` albo `project.slug`. Na konsolę logger pisze tylko wtedy, gdy `NODE_ENV` nie jest `production` i nie ustawiono endpointu.

**Odrzucone alternatywy.** pino (design doc §3, plan 1 „Tech Stack”).

**Konsekwencje.**

- Na produkcji bez `OTEL_EXPORTER_OTLP_ENDPOINT` wpisy z `logger` nie trafiają ani na konsolę, ani do eksportu, więc nie widać ich w logach usługi. Ustaw endpoint na produkcji ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#logger-cel), [10-wdrozenie.md](10-wdrozenie.md)).
- Raport walidacji zmiennych przy starcie procesu idzie przez `console.error`, a nie przez `logger`, bo bez eksportu wpis by zniknął. Wyjątek obejmuje tylko ten raport ([D48](#d48)).
- `LOG_LEVEL` jest walidowana w `src/shared/lib/env.ts`, ale logger jej nie czyta i nie filtruje po poziomie ([znane-ograniczenia.md](znane-ograniczenia.md)).
- Mutation testing nie obejmuje `logger.ts` (wykluczenie w `stryker.config.json`, [D26](#d26)).

**Jak egzekwowana.** Nie ma reguły lintera przeciw `console.log`, więc to, że kod loguje przez `logger`, jest tylko konwencją. Testy loggera (`src/shared/lib/__tests__/logger.test.ts`) sprawdzają tylko atrybuty błędu (`err.type`, `err.message` i `err.stacktrace`) we wpisie z `logger.error`, który trafia do eksportera OpenTelemetry.

**Źródło.** Ruling R15 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md); [design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §3.

<a id="d16"></a>

## D16 · `APP_URL` jako publiczny adres aplikacji zamiast `BETTER_AUTH_URL`

**Status:** obowiązuje · **Data:** 2026-10-27 · **Kto zdecydował:** nie zapisano; zmianę wprowadza commit `50a4d9e` na gałęzi `refactor/app-url`

**Kontekst.** Publiczny adres aplikacji był zapisany w zmiennej `BETTER_AUTH_URL`, chociaż służy nie tylko bibliotece better-auth, ale też do budowania linków w mailach. Commit `50a4d9e` podaje dwa powody zmiany nazwy: adres ma więcej zastosowań niż logowanie, a jedna zmienna o ogólnej nazwie zapobiega duplikowaniu zmiennych z tym samym adresem w projektach.

**Decyzja.** Publiczny adres to `APP_URL`. `src/shared/lib/env.ts` wymaga pełnego adresu `http://` albo `https://`. `src/shared/lib/auth/index.ts` przekazuje go better-auth jako `baseURL` i buduje z niego link akceptacji zaproszenia (`<APP_URL>/accept-invitation/<id>`, bez podwójnego ukośnika). Linki resetu hasła i ustawienia hasła powstają z `baseURL` better-auth, więc też z `APP_URL`. Kod nie używa `BETTER_AUTH_URL`.

**Odrzucone alternatywy.** Pozostanie przy `BETTER_AUTH_URL` (powody w kontekście).

**Konsekwencje.** Po zmianie portu lub domeny trzeba zmienić `APP_URL`, bo inaczej logowanie odrzuca żądania z innego adresu, a linki w mailach prowadzą pod zły adres ([01-uruchomienie.md](01-uruchomienie.md#port-aplikacji)).

**Jak egzekwowana.**

- `src/shared/lib/__tests__/env.test.ts` („brak APP_URL → błąd z nazwą zmiennej” i przypadki adresu bez `http(s)://`).
- `src/shared/lib/auth/__tests__/auth-config.test.ts` („APP_URL z końcowym ukośnikiem → link akceptacji bez podwójnego ukośnika”).
- Nie ma testu, który zabrania użycia `BETTER_AUTH_URL`.

**Źródło.** Commit `50a4d9e`.

<a id="d17"></a>

## D17 · Ścisła walidacja env: sekret co najmniej 32 znaki, flagi tylko `true` albo `false`

**Częściowo zastąpiona przez [ADR-64](adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md):** na produkcji nie jest już wymagany `RESEND_API_KEY`, tylko skonfigurowany dostawca maili (`SMTP_HOST`, `SMTP_URL`, `RESEND_API_KEY`) albo jawne `MAIL_PROVIDER=console`. Reszta decyzji obowiązuje.

**Status:** obowiązuje · **Data:** 2026-10-26 (minimalna długość sekretu), 2026-10-27 (flagi, `APP_URL`, sekret ze spacjami) · **Kto zdecydował:** wykonawca planu 1 (ruling R18, sekret); poprawki z audytu testów planu 1 (znaleziska P1–P3), wdrożone w commicie `494224e`

**Kontekst.** Audyt testów planu 1 znalazł trzy wartości, które schemat przyjmował bez błędu:

- `MULTI_ORG=TRUE` (także `1` albo `yes`) dawało po cichu `false`, więc literówka w zmiennych Railway wyłączała tryb wielu organizacji bez żadnego komunikatu;
- `APP_URL=localhost:3000` przechodził walidację, a linki w mailach były zepsute;
- sekret złożony z 32 spacji przechodził walidację.

Do tego better-auth oczekuje sekretu o długości co najmniej 32 znaków (ruling R18).

**Decyzja.** `coreEnvSchema` w `src/shared/lib/env.ts`:

- flagi `AUTH_PUBLIC_SIGNUP`, `MULTI_ORG` i `ADMIN_IMPERSONATION` przyjmują tylko `true` albo `false` (wielkość liter i spacje z brzegów bez znaczenia), brak lub pusta wartość daje `false`, a każda inna wartość jest błędem;
- `BETTER_AUTH_SECRET` musi mieć co najmniej 32 znaki po pominięciu spacji z brzegów, a sama wartość nie jest przycinana;
- `APP_URL` musi być pełnym adresem `http` albo `https`;
- przy `NODE_ENV=production` wymagany jest `RESEND_API_KEY`, a sekret nie może być wartością z `.env.example`.

Problemy trafiają do jednego komunikatu `Nieprawidłowe zmienne środowiskowe: …`, w dwóch etapach: dwa warunki produkcyjne Zod sprawdza dopiero wtedy, gdy wszystkie pola przejdą podstawowe sprawdzenie, więc błąd produkcyjny może pojawić się dopiero po poprawieniu pozostałych ([07-i18n-mail-env.md](07-i18n-mail-env.md#walidacja-env)). Schemat działa przy pierwszym odczycie `env`, a nie przy imporcie, żeby sam import nie przerywał `next build` ani testów bez pełnego środowiska. Serwer Next.js sprawdza ten sam schemat także przy starcie procesu ([D48](#d48)).

**Odrzucone alternatywy.** Wcześniejsza, łagodna walidacja: każda wartość flagi inna niż `true` dawała `false`, a `APP_URL` mógł być dowolnym niepustym napisem (stan sprzed `494224e`).

**Konsekwencje.**

- `npm run build` nie sprawdza zmiennych. Serwer Next.js kończy się przy starcie z raportem wszystkich problemów ([D48](#d48)), a `npm run admin:create` zgłasza błąd przy pierwszym odczycie `env`. Tabela komunikatów: [01-uruchomienie.md](01-uruchomienie.md#bledy-env).
- Schematy z plików `env.ts` feature (`moduleEnvSchemas` z rejestru) są łączone ze schematem rdzenia.

**Jak egzekwowana.** Guard w kodzie: `verifyEnvOnStartup` przy starcie serwera ([D48](#d48)) i `parseEnv` przy pierwszym odczycie `env`. Testy: `src/shared/lib/__tests__/env.test.ts` (flagi, sekret, adres, produkcja, `.env.example` jako `.env`).

**Źródło.** Commit `494224e`; ruling R18 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md); audyt testów planu 1 (znaleziska P1–P3).

<a id="d18"></a>

## D18 · Wysyłka maili: SMTP, potem Resend, potem tylko log

**Częściowo zastąpiona przez [ADR-64](adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md):** `MAIL_PROVIDER` (`smtp`, `resend`, `console`) wybiera dostawcę jawnie, SMTP można ustawić przez `SMTP_HOST` i pokrewne zmienne, a uwaga o `RESEND_API_KEY` wymaganym na produkcji nie obowiązuje. Kolejność wykrywania przy pustym `MAIL_PROVIDER` (SMTP, potem Resend, potem log) zostaje.

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor planu 1 (zadania z mailerem i infrastrukturą); wybór lokalnego serwera pocztowego design doc zostawił wykonawcy (§10)

**Kontekst.** Na produkcji maile wysyła Resend. Lokalnie i w testach e2e aplikacja ma działać bez konta Resend, a testy e2e muszą odczytać treść maila (link zaproszenia, reset hasła).

**Decyzja.** `sendTransactionalEmail` w `src/shared/lib/mailer.ts` wybiera sposób wysyłki w tej kolejności:

1. Ustawiony `SMTP_URL`: wysyłka przez SMTP (nodemailer). Lokalnie i w e2e to mailpit z `docker-compose.yml`, lokalny serwer pocztowy, który zbiera maile i pokazuje je w przeglądarce.
2. Ustawiony tylko `RESEND_API_KEY`: wysyłka przez Resend.
3. Brak obu: mail nie jest wysyłany, a `logger.info` zapisuje adresata i temat.

Błąd wysyłki nie rzuca wyjątku: funkcja zapisuje błąd w logu (z zamaskowanym adresem) i zwraca `{ error }`. Na produkcji `RESEND_API_KEY` jest wymagany przez walidację env ([D17](#d17)).

**Odrzucone alternatywy.** Nie zapisano. Design doc §3 wymienia tylko Resend; SMTP i log dodał plan 1, „żeby lokalnie i w e2e działało bez Resend”.

**Konsekwencje.**

- `SMTP_URL` wygrywa z `RESEND_API_KEY` także na produkcji. Jeśli ustawisz oba, maile pójdą przez SMTP.
- Nieudana wysyłka maila powitalnego nie cofa zaproszenia: `inviteUserCommand` zwraca sukces z ostrzeżeniem `mail-failed`.
- Szablony i podgląd w mailpit: [07-i18n-mail-env.md](07-i18n-mail-env.md).

**Jak egzekwowana.**

- `src/shared/lib/__tests__/mailer.test.ts` („SMTP_URL ma pierwszeństwo przed RESEND_API_KEY”, log bez klucza, błędy zwracane zamiast rzucanych).
- `src/shared/lib/__tests__/env.test.ts` („produkcja bez RESEND_API_KEY → błąd z nazwą zmiennej”).
- E2E czyta maile z mailpit (`e2e/helpers.ts`); `.github/workflows/e2e.yml` uruchamia mailpit jako usługę i ustawia `SMTP_URL`.

**Źródło.** [Plan 1](superpowers/plans/2026-10-26-wa-kit-plan-1-core.md) (zadanie z `mailer.ts` i zadanie z infrastrukturą, „SMTP do mailpit, jeśli `SMTP_URL` ustawione”); [AGENTS.md](../AGENTS.md), „Mail”; commity `376a80f` i `4219061`.

<a id="d19"></a>

## D19 · `superadmin` jako rola serwisowa; jego konta są nietykalne dla `admin`

**Status:** obowiązuje · **Data:** 2026-10-27 · **Kto zdecydował:** Jakub (decyzja 1 w specu superadmina); projekt roli zaakceptowany przez Jakuba

**Kontekst.** Web Amigos przekazuje aplikację klientowi, ale przez okres wsparcia potrzebuje do niej dostępu serwisowego. Administrator po stronie klienta (rola globalna `admin`) zarządza użytkownikami i nie powinien móc usunąć, zablokować ani zmienić kont Web Amigos. O tym, kiedy dostęp Web Amigos się kończy, decyduje Web Amigos.

**Decyzja.**

- Rola globalna `superadmin` to serwis Web Amigos. Ma wszystko, co `admin`, i do tego impersonację ([D20](#d20)) oraz wejście do każdej organizacji ([D21](#d21)).
- Na konto superadmina może działać tylko superadmin. Hook `before` better-auth w `src/shared/lib/auth/index.ts` dla ścieżek z `ADMIN_TARGET_PATHS` i `/admin/create-user` woła `assertAdminActionAllowed` (`src/shared/lib/auth/admin-access.ts`):
  - aktor inny niż superadmin, który działa na koncie superadmina (rola, ban i odblokowanie, usunięcie, hasło, dane konta z e-mailem, sesje), dostaje 403 „Konto serwisowe może zmieniać tylko superadmin”; gdy celu nie da się ustalić, dostaje 403 „Brak uprawnień do tego konta”;
  - rolę `superadmin` może nadać tylko superadmin (403 „Rolę superadmin może nadać tylko superadmin”);
  - impersonację rozstrzyga osobna reguła z własnym komunikatem ([D20](#d20)).
- Rolę celu hook czyta z bazy (`targetRoleOf` w `src/shared/lib/auth/admin-guard.ts`, po `userId` albo tokenie sesji), a rolę aktora z sesji w bazie, nie z cookie cache.
- Konta superadmina są widoczne dla `admin` na liście z etykietą „Serwis (Web Amigos)” i bez akcji.
- Konto superadmina zakłada się świadomie: `npm run admin:create -- --email <email> --role superadmin`.

**Odrzucone alternatywy.**

- Tylko role `user` i `admin`, bez nadpisywania przez superadmina (pierwotny design doc §3.1 w commicie `13f3549`, zmieniony decyzją Jakuba 2026-10-27).
- Klient sam usuwa albo zmienia konta Web Amigos po okresie wsparcia (decyzja 1: dostęp Web Amigos odcina tylko superadmin).

**Konsekwencje.**

- Przy przekazaniu aplikacji Web Amigos dostaje konto `superadmin`, a zleceniodawca `admin`. Po okresie wsparcia Web Amigos sam usuwa swoje konta ([README.md repozytorium](../README.md), sekcja „Railway”); spec superadmina dopuszcza też zmianę ich roli na `user`. Ostatniego konta superadmin nie usunie sam, bo better-auth nie pozwala usunąć własnego konta, więc odbiera mu rolę i członkostwa, a pozostałe konto bez roli usuwa admin klienta ([10-wdrozenie.md](10-wdrozenie.md#odciecie-dostepu)).
- Hook pomija wywołania z kodu serwera bez nagłówków i bez sesji. Dzięki temu `admin:create` zakłada konto superadmina przez `auth.api.createUser`. Wyjątek dotyczy każdego takiego wywołania, więc komenda, która woła API pluginu `admin` w imieniu zalogowanego użytkownika, przekazuje `headers`.
- Superadmin może działać na koncie innego superadmina, z wyjątkiem impersonacji.
- Szczegóły i lista ścieżek: [04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#ochrona-kont).

**Jak egzekwowana.**

- Guard w kodzie: hook `before` w `src/shared/lib/auth/index.ts`.
- `src/shared/lib/auth/__tests__/admin-access.test.ts` (w tym „ADMIN_TARGET_PATHS zawiera dokładnie ścieżki pluginu admin działające na wskazanym użytkowniku”), `admin-guard.test.ts`, `auth-config.test.ts` (prawdziwa instancja better-auth: konto superadmina nietykalne dla admina, nadanie roli `superadmin`, rola aktora z bazy).
- `src/features/users/components/__tests__/user-account-columns.test.tsx` (etykieta i brak przycisku), `scripts/lib/__tests__/admin-create.test.ts` (`--role`, brak obniżania roli).
- Bramka mutacji obejmuje `src/shared/lib/auth/` ([D26](#d26)).

**Źródło.** Spec superadmina (sekcje „Role globalne”, „Uprawnienia w panelu /users”, „Przekazanie aplikacji klientowi”, decyzja 1); [AGENTS.md](../AGENTS.md), „Auth”; commity `c902661`, `836835b`, `d7d9266`, `4a6ffcb`.

<a id="d20"></a>

## D20 · Impersonacja zależna od roli; `ADMIN_IMPERSONATION`

**Status:** obowiązuje · **Data:** 2026-10-27 · **Kto zdecydował:** Jakub (decyzja 2 w specu superadmina)

**Kontekst.** Impersonacja pozwala zobaczyć aplikację oczami konkretnego użytkownika, co pomaga we wsparciu, ale daje pełny dostęp do jego konta. Web Amigos potrzebuje jej w serwisie, a niektórzy klienci chcą, żeby ich administrator też mógł z niej korzystać.

**Decyzja.** Kto pod kogo może się podszyć, rozstrzyga `canImpersonate` w `src/shared/lib/auth/impersonation-policy.ts`:

| Aktor \ cel | `user` | `admin` | `superadmin` |
| --- | --- | --- | --- |
| `superadmin` | tak | tak | nie |
| `admin` przy `ADMIN_IMPERSONATION=false` (domyślnie) | nie | nie | nie |
| `admin` przy `ADMIN_IMPERSONATION=true` | tak | nie | nie |
| `user` | nie | nie | nie |

Reguła działa w dwóch miejscach na serwerze: rola `admin` dostaje uprawnienie `impersonate` w pluginie `admin` tylko przy włączonej fladze (`createAdminRoles`), a hook `before` na `/admin/impersonate-user` sprawdza `canImpersonate` z rolą celu z bazy. Przycisk „Zaloguj jako” pokazuje się tylko przy kontach, wobec których `canImpersonate` zwraca prawdę, i nigdy przy własnym koncie.

**Odrzucone alternatywy.**

- `admin` bez impersonacji w ogóle (tabela uprawnień w specu superadmina sprzed decyzji 2).
- Impersonacja kont `admin` i `superadmin` przez `admin` (decyzja 2: „pod admin i superadmin nadal nie”).

**Konsekwencje.**

- W trakcie impersonacji u góry strony jest pasek z przyciskiem „Wróć do własnego konta”.
- Początek i koniec impersonacji zapisuje `logger` przez `logImpersonationStartCommand` i `logImpersonationStopCommand`, które wywołuje przeglądarka. Na produkcji wpisy widać tylko z ustawionym eksportem OTLP ([D15](#d15)).

**Jak egzekwowana.**

- Guard w kodzie: uprawnienia pluginu `admin` i hook `before` w `src/shared/lib/auth/index.ts`.
- `src/shared/lib/auth/__tests__/impersonation-policy.test.ts`, `admin-access.test.ts` (`createAdminRoles` z flagą i bez), `auth-config.test.ts` (części „ADMIN_IMPERSONATION=true” i „uprawnienia superadmina”), `src/features/users/components/__tests__/user-account-columns.test.tsx`, `src/shared/lib/__tests__/env.test.ts` (parsowanie flagi).

**Źródło.** Spec superadmina (decyzja 2); [AGENTS.md](../AGENTS.md), „Auth”; commity `836835b` i `4a6ffcb`.

<a id="d21"></a>

## D21 · Superadmin wchodzi do dowolnej organizacji, zawsze jednej; bez widoków zbiorczych

**Status:** obowiązuje · **Data:** 2026-10-27 · **Kto zdecydował:** Jakub (decyzja 3 w specu superadmina); model „wejście do dowolnej organizacji” zaakceptowany przez Jakuba

**Kontekst.** Serwis Web Amigos musi widzieć i poprawiać dane klienta w każdej jego organizacji, także w takiej, do której nie należy. Widok „dane wszystkich organizacji naraz” każdy moduł musiałby projektować osobno, a każdy taki widok to okazja do wycieku danych między organizacjami. W innym projekcie Web Amigos (`llm-monitor`) admin bez aktywnej organizacji dostawał dane wszystkich organizacji, bo brak kontekstu wyłączał filtr.

**Decyzja.**

- Superadmin może ustawić jako aktywną każdą istniejącą organizację. Przełącznik pokazuje mu wszystkie organizacje posortowane po nazwie (`getSwitchableOrganizationsQuery`; query zwraca też pole `isMember`, ale żaden komponent go nie pokazuje). Wybór zapisuje `enterOrganizationCommand` (`canEnterOrganization`: superadmin → organizacja istnieje; inni → członkostwo).
- `getOrgContext()` dla superadmina bez członkostwa w istniejącej aktywnej organizacji zwraca `orgRole: "owner"` i `serviceMode: true` ([D22](#d22)). Z członkostwem dostaje rolę z członkostwa i `serviceMode: false`.
- Dane czyta się zawsze w kontekście jednej organizacji z filtrem `organizationId` ([D07](#d07)). Superadmin bez aktywnej organizacji albo z organizacją, której nie ma w bazie, dostaje `NoOrganizationError`, nigdy pusty filtr.
- Superadmin bez członkostw dostaje po zalogowaniu najstarszą organizację jako aktywną (`getDefaultActiveOrganizationId`), więc przy `MULTI_ORG=false` wchodzi do jedynej organizacji.
- Rola globalna `admin` nie ma tych uprawnień: bez członkostwa w aktywnej organizacji dostaje `NoOrganizationError`.

**Odrzucone alternatywy.**

- Widoki zbiorcze z danymi wszystkich organizacji naraz.
- Filtr wyłączany brakiem kontekstu, jak w `llm-monitor` (ryzyko „do nieprzenoszenia” w specu superadmina).
- Wejście przez osobną stronę organizacji zamiast przełącznika, jak w `llm-monitor`.
- Brak widoku „wszystkie organizacje” i nadpisywania przez superadmina (pierwotny design doc §3.1 w commicie `13f3549`).

**Konsekwencje.**

- Reguła [D07](#d07) i testy izolacji obowiązują bez zmian także dla superadmina.
- Rolę do listy w przełączniku `getSwitchableOrganizationsQuery` czyta z cookie cache sesji, więc konto, któremu odebrano rolę `superadmin`, widzi nazwy wszystkich organizacji jeszcze do 5 minut. Samo wejście do organizacji jest sprawdzane na świeżych danych.

**Jak egzekwowana.**

- Guard w kodzie: `getOrgContext()` i `canEnterOrganization` (`src/features/organizations/services/organization-access.ts`).
- `src/shared/lib/auth/__tests__/org-context.test.ts` (część „getOrgContext superadmina”), `src/features/organizations/services/commands/__tests__/enter-organization-command.test.ts`, `src/features/organizations/services/queries/__tests__/switchable-organizations-query.test.ts`, `default-organization-query.test.ts`.
- `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts` (części „superadmin wchodzi do organizacji na prawdziwej bazie”, „organizacje do przełączenia”, „domyślna organizacja superadmina”), job `integration` w `.github/workflows/ci.yml`.
- Brak widoków zbiorczych w nowym kodzie: tylko konwencja.

**Źródło.** Spec superadmina (decyzja 3, sekcje „Superadmin a organizacje” i „Wzorzec z webamigos/llm-monitor”); [AGENTS.md](../AGENTS.md), „Auth”; commit `270a171`.

<a id="d22"></a>

## D22 · Tryb serwisowy: dialog w UI i potwierdzenie wymuszane w komendzie

**Status:** obowiązuje · **Data:** 2026-10-27 · **Kto zdecydował:** Jakub (decyzja 4 w specu superadmina: dialog-przypomnienie); wymuszenie po stronie serwera opisuje sekcja specu o dialogu, zaakceptowana razem z decyzjami

**Kontekst.** Superadmin w cudzej organizacji działa z uprawnieniami ownera ([D21](#d21)). Decyzja 4 wymaga przypomnienia przed każdą zmianą danych tej organizacji. Sam dialog w interfejsie nie wystarczy: komponent, który go nie użyje, pominie przypomnienie po cichu i nikt tego nie zauważy.

**Decyzja.**

- **Tryb serwisowy** to superadmin w organizacji, w której nie ma członkostwa (`serviceMode: true` w kontekście). Layout `(app)` pokazuje wtedy pasek „Tryb serwisowy: <nazwa>”.
- **UI:** komendy kitu na danych organizacji interfejs wywołuje przez jeden wspólny mechanizm, `useServiceModeAction().run` (`src/shared/components/service-mode/use-service-mode-action.tsx`). W trybie serwisowym przed wywołaniem komendy otwiera on dialog „Zmieniasz dane organizacji <nazwa> jako serwis Web Amigos.” z przyciskami „Anuluj” i „Zmień”. Feature nie mają własnych dialogów.
- **Serwer:** komenda dostaje potwierdzenie z `organizationId` w osobnym parametrze i sprawdza je przez `assertServiceModeConfirmed` (`src/shared/lib/auth/service-mode.ts`) przed pierwszym dostępem do Prismy. Bez ważnego potwierdzenia w trybie serwisowym zwraca błąd.
- Pełny kontrakt (sygnatura, kolejność wywołań, zachowanie poza trybem serwisowym) jest w [AGENTS.md](../AGENTS.md), „Dane i organizacje”; wzorzec komendy w [06-wzorce-kodu.md](06-wzorce-kodu.md), przebieg w [04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#run).

**Odrzucone alternatywy.**

- Dialog tylko w interfejsie, bez sprawdzenia w komendzie (spec superadmina: komponent mógłby go pominąć po cichu).
- Potwierdzenie jako sama flaga `serviceModeConfirmed: true` w danych wejściowych komendy (propozycja ze specu superadmina). Kod przyjmuje osobny parametr, który oprócz flagi niesie `organizationId`. Dzięki temu karta otwarta w trybie serwisowym przed przełączeniem organizacji dostaje błąd zamiast zmienić dane innej organizacji.
- Własny dialog w każdym feature.

**Konsekwencje.**

- Dialog jest przypomnieniem, a nie zabezpieczeniem: uprawnienia sprawdza serwer.
- Komenda wywołana z UI bezpośrednio, bez `run`, kończy się w trybie serwisowym błędem, a żaden test tego nie wychwyci.
- Poza trybem serwisowym `run` nie wysyła `organizationId`, więc karta otwarta w organizacji z członkostwem, po przełączeniu w innej karcie na inną organizację z członkostwem, zapisuje dane w nowej organizacji bez błędu ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#nieaktualna-karta)).
- W kodzie z `4a6ffcb` przez dialog przechodzi jedna komenda: `inviteUserCommand` (`InviteUserDialog`). Komponent `organization-members.tsx` woła endpointy członków i zaproszeń pluginu `organization` bez dialogu, ale strona „Użytkownicy” pokazuje go tylko kontom bez roli globalnej `admin` lub `superadmin`. Te endpointy sprawdzają członkostwo wywołującego, więc superadmin w trybie serwisowym nie zmieni przez nie danych obcej organizacji.

**Jak egzekwowana.**

- Guard w kodzie: `assertServiceModeConfirmed` w każdej komendzie.
- `src/shared/lib/auth/__tests__/service-mode.test.ts` (także testy właściwości), `src/shared/components/service-mode/__tests__/use-service-mode-action.test.tsx`, `service-mode-banner.test.tsx`, `service-mode-provider.test.tsx`, `src/features/users/services/commands/__tests__/invite-user-command.test.ts`, `src/features/users/components/__tests__/invite-user-dialog.test.tsx`, `src/app/[locale]/(app)/__tests__/layout.test.tsx` (pasek).
- Wywołanie `assertServiceModeConfirmed` przed Prismą w akcjach `"use server"`: `src/__tests__/server-entrypoints-guard.test.ts` ([D24](#d24)).
- Wywoływanie komend z UI przez `run`: tylko konwencja.

**Źródło.** Spec superadmina (decyzja 4, sekcja „Dialog trybu serwisowego”); [AGENTS.md](../AGENTS.md) i [CLAUDE.md](../CLAUDE.md), „Dane i organizacje”; commit `a81b392`.

<a id="d23"></a>

## D23 · Bez komentarzy w kodzie

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** nie zapisano; reguła i hook pochodzą z innego projektu Web Amigos, ragen-rejestrio (commit `4e2c32b`), i trafiły do ograniczeń planu 1

**Kontekst.** Źródła uzasadniają regułę jednym zdaniem: kod ma się tłumaczyć nazwami, a nie komentarzami (`CLAUDE.md`, plan 1). Plan 1 przenosił kod z repozytoriów źródłowych i kazał przy tym usuwać komentarze, a hook miał pilnować, żeby nie wracały.

**Decyzja.** W plikach `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` nie pisze się komentarzy, a kod ma się tłumaczyć nazwami. Dozwolony jest tylko `// WHY: …` (najwyżej 3 linie) dla nieoczywistego powodu, którego kod nie pokaże, i dyrektywy narzędzi (`@ts-expect-error`, `eslint-disable…`, `@vitest-environment`, `prettier-ignore`, shebang). Przy przenoszeniu kodu ze źródeł komentarze się usuwa.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Zamiast komentarza: lepsza nazwa, wydzielona funkcja albo nazwana stała (tak podpowiada komunikat hooka).
- Wyjątki od mutacji ustawia się w `mutate` w konfiguracji Strykera, a nie komentarzem `// Stryker disable` ([D26](#d26)).
- Hook pomija pliki w `node_modules/`, `generated/` i `components/ui/` (komponenty shadcn) i przepuszcza kilka form spoza listy w `CLAUDE.md`, na przykład `/// <reference`. Reguły stylu: [06-wzorce-kodu.md](06-wzorce-kodu.md).

**Jak egzekwowana.**

- Hook `.claude/hooks/block-comments.mjs`, zarejestrowany w `.claude/settings.json` jako `PreToolUse` dla `Edit|Write`. Blokuje edycję, która dodaje komentarz (kod wyjścia 2, lista znalezionych linii). Testy hooka: `.claude/hooks/block-comments.test.mjs` (`npm run test:hooks`, część `npm run verify`).
- Hook działa tylko w Claude Code. Zmian wprowadzonych ręcznie, przez innych agentów albo przez zapis z powłoki nie zatrzymuje nic: nie ma reguły ESLint ani kontroli w CI.

**Źródło.** [CLAUDE.md](../CLAUDE.md) i [AGENTS.md](../AGENTS.md), „Bez komentarzy w kodzie”; [plan 1](superpowers/plans/2026-10-26-wa-kit-plan-1-core.md), „Global Constraints”; commit `4e2c32b`.

<a id="d24"></a>

## D24 · Test architektury: guard sesji i potwierdzenie trybu serwisowego w punktach wejścia serwera

**Status:** obowiązuje · **Data:** 2026-10-27 · **Kto zdecydował:** nie zapisano; regułę guardu sesji wprowadza commit `6d05826`, regułę trybu serwisowego commit `a81b392`

**Kontekst.** Akcja serwerowa to endpoint `POST`, który można wywołać z pominięciem interfejsu, a query czyta dane dla strony. Brak guardu sesji w takim miejscu to błąd bezpieczeństwa, którego nie wykryje mutation testing ([D26](#d26)): jeśli wywołania guardu nie ma w kodzie, nie ma czego mutować (commit `6d05826`).

**Decyzja.** `src/__tests__/server-entrypoints-guard.test.ts` analizuje składnię plików w `src/` (bez `__tests__/` i `generated/`) i sprawdza dwie reguły:

1. Każda eksportowana funkcja w pliku z `"use server"` i w `services/queries/` wywołuje guard sesji (`getOrgContext`, `requireModuleAccess`, `getAdminUserOrNull`, `requireUser`, `getCurrentUser`, `getImpersonatedByUserId`, `getSession`) przed pierwszym dostępem do Prismy. Wyjątki są w mapie `UNGUARDED_ALLOWED` z uzasadnieniem.
2. Każda eksportowana funkcja w pliku z `"use server"`, która woła `getOrgContext` albo `requireModuleAccess` (wprost, przez lokalny helper, alias importu albo stałą zadeklarowaną w pliku), woła też `assertServiceModeConfirmed` przed pierwszym dostępem do Prismy ([D22](#d22)).

Sam analizator ma testy na wrogich przykładach (aliasy, `export { x as y }`, podrobione potwierdzenie, Prisma ukryta w helperze).

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Test sprawdza tylko, że guard jest wywołany. Nie sprawdza ról ani filtra `organizationId` ([D07](#d07)).
- Analiza jest składniowa i ma świadome ograniczenia: łapie pomyłki, a nie celowe maskowanie. Pełna lista jest w [AGENTS.md](../AGENTS.md), sekcja „Testy”; omówienie w [06-wzorce-kodu.md](06-wzorce-kodu.md).
- Wyjątek od reguły 1 dopisuje się do `UNGUARDED_ALLOWED` z uzasadnieniem. Jedyny wpis to `getDefaultActiveOrganizationId`, które hook `session.create.before` wywołuje z `userId` tworzonej sesji. Reguła 2 nie ma mapy wyjątków.

**Jak egzekwowana.** Test w `npm test`, więc w `npm run verify` i w jobie `verify` w `.github/workflows/ci.yml`. Test „wyjątki z listy UNGUARDED_ALLOWED nadal istnieją” zatrzymuje nieaktualny wpis.

**Źródło.** Commity `6d05826` i `a81b392`; [AGENTS.md](../AGENTS.md), „Testy”.

<a id="d25"></a>

## D25 · Testy adwersarialne: tester ≠ implementer, testy tylko do odczytu

**Status:** obowiązuje · **Data:** 2026-10-27 · **Kto zdecydował:** nie zapisano; system wprowadzają commity `0650fc4` i `e40c0e8` po researchu z 2026-10-27

**Kontekst.** Test adwersarialny ma złamać kod, a nie potwierdzić to, co założył jego autor. Research o testach pisanych przez agentów AI zebrał trzy obserwacje:

- asercje generowane przez model odzwierciedlają to, co kod robi, a nie to, co powinien robić;
- testy napisane po wadliwym kodzie wykryły 14% błędów, a pisane niezależnie 25%, bo błąd z kodu przechodzi do testu i oba się zgadzają;
- agenci z dostępem do testów potrafią je zmienić zamiast poprawić kod.

Audyt testów planu 1 potwierdził to w repozytorium: testy były słabe tam, gdzie mockowały plik z regułą bezpieczeństwa albo sprawdzały dwa przykłady z dłuższej listy.

**Decyzja.**

- Testy zadania pisze inny agent niż kod: subagent `test-writer` (`.claude/agents/test-writer.md`), czyli osobna sesja agenta z własnym kontekstem. Pisze je z planu i sygnatur, przed implementacją, bez czytania implementacji.
- Implementer nie może zmienić testów: w fazie implementacji hook `.claude/hooks/protect-tests.mjs` blokuje edycję plików testowych, a błędny test implementer zgłasza.
- Siłę testów ocenia subagent `test-reviewer` (`.claude/agents/test-reviewer.md`) bez narzędzi `Edit` i `Write`, mierząc ją mutacjami ([D26](#d26)).
- Zasady pisania testów (literały jako wartości oczekiwane, testy negatywne na granicach, mockowanie tylko I/O, testy właściwości dla czystych funkcji) i przebieg zadania są w [AGENTS.md](../AGENTS.md), „Testy, które próbują złamać kod”, oraz w [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#zasady) (zasady i [przebieg zadania](08b-testy-adwersarialne.md#przebieg)).

**Odrzucone alternatywy.**

- Sama instrukcja „pisz dobre testy” (research: nie wystarcza).
- Znacznik fazy jako zmienna środowiskowa `WA_PHASE=implement` (research wymienia obie możliwości; wybrano plik `.superpowers/phase`).

**Konsekwencje.**

- Blokada działa, gdy orkiestrator (agent, który prowadzi zadanie i uruchamia subagentów) zapisze `implement` do `.superpowers/phase`. Plik jest w `.gitignore`, więc blokada obejmuje kopię roboczą, w której go ustawiono, a gdy jest to katalog projektu sesji Claude Code (`$CLAUDE_PROJECT_DIR`), także pozostałe kopie robocze edytowane w tej sesji ([Faza w worktree](08b-testy-adwersarialne.md#faza-worktree)).
- Hook nie łapie zapisu przez powłokę (na przykład heredoc w Bash).

**Jak egzekwowana.**

- Hook `.claude/hooks/protect-tests.mjs` (zarejestrowany w `.claude/settings.json`), testy `.claude/hooks/protect-tests.test.mjs` w `npm run test:hooks`.
- Definicje agentów w `.claude/agents/`.
- Rozdzielenie testera i implementera, literały i czerwony przebieg przed implementacją: tylko konwencja procesu, sprawdzana przez recenzenta i mierzona mutacjami ([D26](#d26)).

**Źródło.** Commity `0650fc4` i `e40c0e8`; [AGENTS.md](../AGENTS.md), „Testy, które próbują złamać kod”; [CLAUDE.md](../CLAUDE.md), „Testy”; research i audyt testów planu 1.

<a id="d26"></a>

## D26 · Mutation testing i bramka plików krytycznych

**Status:** obowiązuje · **Data:** 2026-10-27 (stały seed testów właściwości pod Strykerem od 2026-11-05) · **Kto zdecydował:** nie zapisano; Stryker wprowadza commit `c9d7b25`, bramkę commit `54efbcf`; wpisy wyjątków zatwierdza człowiek (`AGENTS.md`); stały seed: sesja agenta (commity `988a2a4` i `fdf7dbe`), do zatwierdzenia w pull requeście

**Kontekst.** Pokrycie kodu testami nie mówi, czy testy wykryją błąd. Mutation testing wstrzykuje do kodu drobne błędy (mutanty) i sprawdza, czy któryś test je zauważy. Autor testów nie może tego wyniku zinterpretować na swoją korzyść: mutant ginie albo nie. Audyt testów planu 1 (na commicie `50a4d9e`) dał wynik mutacji (mutation score) 71,75%, a najpoważniejsze luki, na przykład brak testu sprawdzenia roli admina w `getAdminUserOrNull`, wykrył tylko on. Po audycie dopisano testy zabijające wskazane mutanty (commit `bb935e6`), a przy wprowadzeniu Strykera do repozytorium wynik bazowy wynosił 77% (commit `c9d7b25`). Próg dla całego kodu przepuszcza jednak pojedyncze luki w plikach, w których każda luka jest błędem bezpieczeństwa.

**Decyzja.**

- Stryker (narzędzie do mutation testingu) mutuje logikę bez komponentów UI, w dwóch konfiguracjach: unitowej (`stryker.config.json`) i integracyjnej na prawdziwej bazie (`stryker.integration.config.json`). Recenzent zadania uruchamia go na plikach zadania (`npm run test:mutation:task -- <pliki>`).
- Bramka plików krytycznych (`npm run test:mutation:gate`, konfiguracja w `mutation-gate.json`): w plikach z prefiksami z listy `critical` (auth, organizacje, użytkownicy, sama bramka) każdy niezabity mutant, czyli ze statusem `Survived` albo `NoCoverage`, musi mieć wpis w `allowed` z uzasadnieniem. Wpis z pustym uzasadnieniem też zatrzymuje bramkę. Wpisy dopisuje człowiek; agent je tylko proponuje.
- Mutation testing nie jest częścią `npm run verify`. Działa w osobnym workflow, a przebieg unitowy pada poniżej `thresholds.break` (75%).
- Logikę bramki (statusy, łączenie raportów, dopasowanie wpisów, nieaktualne wpisy) zawiera `scripts/lib/mutation-gate.ts`. `AGENTS.md` („Testy, które próbują złamać kod”) podaje regułę łączenia raportów, nieaktualnych wpisów i zakaz obniżania progu, a [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#bramka) opisuje pracę z bramką.
- Testy właściwości (`test.prop`) mają w procesach Strykera stały seed, a w zwykłych przebiegach losowy ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#seed)). Stryker wybiera testy mutanta po nazwach z przebiegu suchego, a `@fast-check/vitest` dopisuje seed do nazwy testu, więc z losowym seedem testy właściwości nie uruchamiały się dla mutantów. Seed ustawiają `vitest.setup.ts` i `kit/cli/vitest.setup.ts`, tylko gdy istnieje zmienna `STRYKER_MUTATOR_WORKER`, którą Stryker ustawia w każdym swoim procesie.

**Odrzucone alternatywy.**

- Stryker w `npm run verify` (research: pełny przebieg to wielokrotność czasu `npm test`; zalecenie „dodać, ale nie do verify”).
- Start bez progu (`thresholds.break: null`) i późniejszy próg około 60 (propozycja researchu). Wybrano 75 przy wyniku bazowym 77.
- Wyłączanie mutacji komentarzem `// Stryker disable` (research: koliduje z regułą bez komentarzy, [D23](#d23), bo hook by go zablokował).
- Stały seed testów właściwości we wszystkich przebiegach: `npm test` przestałby sprawdzać nowe wejścia przy każdym uruchomieniu.
- Osobna konfiguracja Vitest dla Strykera (opcja `vitest.configFile` w konfiguracji Strykera) z plikiem ustawień, który zawsze ustawia seed: dodatkowe pliki konfiguracji w aplikacji, w konfiguracji integracyjnej i w CLI.
- Seed losowany raz na przebieg Strykera: musiałby trafić do wszystkich procesów jednego przebiegu, a między przebiegami zmieniałby nazwy testów, więc tryb przyrostowy nie użyłby starych wyników, a wynik mutacji i bramka nie byłyby powtarzalne.

**Konsekwencje.**

- Pełny przebieg unitowy trwa około 12 minut (audyt planu 1, 8 rdzeni). Nigdy nie uruchamiaj dwóch przebiegów naraz: dwa przebiegi `stryker.config.json` nadpisują sobie `reports/mutation/` i `reports/stryker-incremental.json`; przebieg integracyjny dzieli bazę `_test` z innym przebiegiem integracyjnym i z `npm run test:integration`, więc test, któremu drugi proces wyczyścił tabele, daje fałszywie zabitego mutanta; przy braku procesora testy przekraczają limit czasu, a status `Timeout` liczy się jako wykryty. Katalog `.stryker-tmp/` konfliktu nie powoduje, bo każdy przebieg tworzy w nim własny podkatalog `sandbox-*` i usuwa tylko swój ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#jeden-stryker)). Sam przebieg integracyjny ma znany problem: mimo `concurrency: 1` po sprawdzeniu typów działają w nim dwa procesy testów na wspólnej bazie `_test` ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#concurrency)).
- `npm run test:mutation:task` przy istniejącym pliku przyrostowym (`reports/stryker-incremental.json`) raportuje i ocenia progiem `break` cały projekt: wyniki pozostałych plików bierze z tego pliku. Wynik pliku zadania trzeba czytać z jego wiersza w raporcie ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#task)).
- Nowy plik w katalogu z listy `critical` jest objęty bramką od razu, bo bramka porównuje prefiksy ścieżek.
- W procesach Strykera test właściwości sprawdza w każdym przebiegu te same wejścia: mutant, którego nie wykrywają, przeżyje w każdym przebiegu, a zabije go dopiero test przykładowy albo lepsza właściwość. Przebieg integracyjny (`vitest.integration.config.ts`) nie ładuje `vitest.setup.ts` i nie ma stałego seeda; testy integracyjne nie używają `test.prop`.

**Jak egzekwowana.**

- Lokalnie: `test-reviewer` uruchamia `npm run test:mutation:task -- <pliki>` i `npm run test:mutation:gate` przy każdym zadaniu; pełny przebieg przed releasem kitu.
- `.github/workflows/mutation.yml` tylko po ręcznym uruchomieniu (`workflow_dispatch`): `npm run test:mutation`, `npm run test:mutation:integration`, `npm run test:mutation:gate`, z Postgresem jako usługą. Workflow nie działa przy pull requeście ani pushu: pełny przebieg trwa około godziny lokalnie i dłużej w GitHub Actions (2026-11-02: unitowy bez cache doszedł tam do 45% mutantów w 55 minut), zużywa minuty GitHub Actions, a przebieg integracyjny ma znany problem z bazą ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#concurrency)). Koszt: CI nie zatrzyma osłabienia testu w pliku krytycznym; pilnuje tego proces lokalny i recenzja pull requestu.
- `thresholds.break` w `stryker.config.json`.
- Logika bramki (`scripts/mutation-gate.ts`, `scripts/lib/mutation-gate.ts`): `scripts/lib/__tests__/mutation-gate.test.ts` w `npm test`.
- Stały seed testów właściwości pod Strykerem: `src/__tests__/vitest-setup.test.ts` w `npm test` i `kit/cli/src/__tests__/vitest-setup.test.ts` w bramce CLI.
- To, że wpisy w `allowed` dodaje człowiek: tylko konwencja (agent `test-reviewer` nie ma narzędzi `Edit` ani `Write`, ale ma `Bash`).

**Źródło.** Commity `c9d7b25` i `54efbcf`; stały seed: commity `988a2a4` i `fdf7dbe`; [AGENTS.md](../AGENTS.md), „Testy, które próbują złamać kod”; [CLAUDE.md](../CLAUDE.md), „Testy”; research i audyt testów planu 1.

<a id="d27"></a>

## D27 · next-intl: `pl` domyślny, prefiks `as-needed`, namespace tłumaczeń feature = nazwa katalogu

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§3 i §4.3); wykonawca planu 1 (ruling R4: klucz namespace to nazwa katalogu feature)

**Kontekst.** Design doc zakłada polski jako język domyślny i angielski jako opcjonalny. Feature, także z modułu opcjonalnego, musi dodać własne teksty bez edytowania plików tłumaczeń rdzenia ([D03](#d03)), a teksty różnych feature nie mogą się nadpisywać.

**Decyzja.**

- Tłumaczenia obsługuje next-intl. Dostępne języki to `pl` i `en`, domyślny `pl` (`src/i18n/config.ts`). Lista języków projektu pochodzi z pola `locales` w `.wa/kit.json` przez plik generowany `src/i18n/locales.generated.ts` ([D33](#d33)); kit ma oba języki. Routing używa `localePrefix: "as-needed"` (`src/i18n/routing.ts`): adresy polskie nie mają prefiksu, angielskie mają `/en`. Język ustala `src/proxy.ts` (middleware next-intl).
- Teksty rdzenia są w `src/app/messages/<locale>.json`, a teksty feature w `src/features/<x>/i18n/<locale>.json`. `src/i18n/request.ts` scala je przez `mergeMessages` (`src/i18n/merge-messages.ts`): teksty feature trafiają pod namespace równy nazwie jego katalogu (z `moduleMessages` w rejestrze).
- `mergeMessages` rzuca błąd przy nieprawidłowym kluczu namespace (wzorzec `^[a-z][a-zA-Z0-9-]*$`) i przy kolizji z namespace rdzenia (`common`, `errors`, `sidebar`, `serviceMode`) albo innego feature.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Etykiety menu są szukane pod `<key>.<labelKey>`, gdzie `key` pochodzi z definicji modułu, a tłumaczenia leżą pod nazwą katalogu. Nazwa katalogu feature i `key` w `defineModule` muszą być takie same. W rdzeniu są, ale nic tego nie sprawdza.
- Kolizja namespace kończy się błędem przy ładowaniu tłumaczeń (`getRequestConfig` w `src/i18n/request.ts`), więc strona się nie wyrenderuje.
- Decyzji o wykrywaniu języka nie zapisano ([znane-ograniczenia.md](znane-ograniczenia.md#wykrywanie-jezyka)): `src/i18n/routing.ts` nie ustawia `localeDetection`, więc działa domyślne zachowanie next-intl. Adres bez prefiksu bierze język z ciasteczka `NEXT_LOCALE`, a bez niego z nagłówka `Accept-Language`, więc przeglądarka, która woli angielski, trafia na `/en/...`. Szczegóły w [07-i18n-mail-env.md](07-i18n-mail-env.md).
- Trzeci język wymaga zmian w CLI, bo lista `pl`, `en` jest w czterech miejscach: `kit/cli/src/manifest/schema.ts` (`localesSchema`), `kit/cli/src/args.ts` (`ALLOWED_LOCALES` i typ `Locale`), `kit/cli/src/generate/registry.ts` (typy `("pl" | "en")[]`) i `kit/cli/src/commands/kit-sync.ts` (zapisuje w kicie zawsze `["pl", "en"]`). Po zmianie CLI trzeba przebudować bundel ([D28](#d28)) i dodać pliki `<locale>.json` rdzenia i feature.
- Dodawanie tekstów i języka: [07-i18n-mail-env.md](07-i18n-mail-env.md).

**Jak egzekwowana.**

- Guard w kodzie: `mergeMessages` przy każdym żądaniu.
- `src/i18n/__tests__/merge-messages.test.ts` (kolizje, nieprawidłowe klucze, klucze z prototypu `Object`).
- Zgodność nazwy katalogu z `key`: tylko konwencja.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §3 i §4.3; ruling R4 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md); [AGENTS.md](../AGENTS.md), „i18n”; commity `b27c07b` i `baeca4e`.

<a id="d28"></a>

## D28 · CLI w `kit/cli`, poza workspace'ami; commitowany bundel `.wa/bin/wa.mjs`; dystrybucja przez `git clone` tagu

**Status:** obowiązuje · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzje D1 i D2 planu 2)

**Częściowo zastąpiona przez [ADR-56](adrs/56-workspace-packages-replace-d29.md):** CLI jest workspace'em `packages/gato-cli` (pakiet narzędzia na liście `kitOnly`) bez własnego `package-lock.json`. Commitowany bundel `.wa/bin/wa.mjs` i dystrybucja kitu przez tag obowiązują dalej.

**Kontekst.** Projekt ma powstawać z kitu jedną komendą i później dodawać moduły, a kit nie jest publikowany w żadnym rejestrze paczek. W planie 1 CLI było workspace'em npm w katalogu packages/cli (katalogu już nie ma): główny lockfile i `Dockerfile` (instrukcja `COPY` jego `package.json`) zależały od niego, więc projekt bez CLI miałby inny lockfile i nie zbudowałby obrazu Dockera (plan 2, D1).

**Decyzja.**

- Kod CLI leży w `kit/cli` jako samodzielna paczka z własnym `package.json` i `package-lock.json`, poza workspace'ami aplikacji. Katalog `kit/**` jest na liście `kitOnly` w `kit/kit.json` i w `.dockerignore`, więc nie trafia do projektu ani do obrazu.
- esbuild (`kit/cli/bundle.mjs`) buduje z `kit/cli/src/bin.ts` jeden plik `.wa/bin/wa.mjs`. Bundel jest commitowany i należy do modułu `core` (`kit/modules/core.json`). Ten sam plik działa w kicie i w projekcie jako skrypt `wa` (`"wa": "node .wa/bin/wa.mjs"` w `package.json`), więc projekt nie buduje CLI i nie potrzebuje jego `node_modules`.
- Kit pobiera się przez `git clone --depth 1 --branch v<wersja>` ([D46](#d46)). Nowy projekt powstaje z klonu: `node <klon>/.wa/bin/wa.mjs create <nazwa>`, a domyślnym źródłem kitu dla `create` jest katalog główny klonu, z którego uruchomiono bundel (`resolve(dirname(<bundel>), "../..")` w `bin.ts`). W projekcie `wa add` i `wa list` klonują tag wersji zapisanej w `.wa/kit.json` (`kit/cli/src/kit/source.ts`).
- Komenda nazywa się `wa create`; `create-wa-app` to nazwa one-linera w dokumentacji, a nie osobny program.

**Odrzucone alternatywy.**

- Publikacja CLI w rejestrze npm albo GitHub Packages (plan 2, D2: jedynym wymogiem ma być zalogowany `git` albo `gh`).
- CLI jako workspace aplikacji, jak w planie 1 (powód w kontekście).
- Osobny program `create-wa-app` (design doc §5; odstępstwo zapisane w planie 2, D2).

**Konsekwencje.**

- Po każdej zmianie w `kit/cli/src` trzeba przebudować bundel (`npm run build --prefix kit/cli`) i zacommitować go razem ze zmianą (`kit/CLAUDE.md`, „Bundel CLI”).
- Bez tagu `v<wersja>` na GitHubie nie działa one-liner ani domyślne źródło `wa add`; `wa list` pokazuje wtedy tylko zainstalowane moduły ([D46](#d46)). Klonowanie tagu z adnotacją przy `--depth 1` wypisuje ostrzeżenie gita i komunikat o odłączonym HEAD; to nie jest błąd.
- `npm run verify` projektu nie testuje CLI: testy CLI leżą w `kit/cli` i działają tylko w repozytorium kitu.
- Zależności CLI z `dependencies` w `kit/cli/package.json` (`zod`, od 2026-11-03 także `@inquirer/checkbox` za zgodą Jakuba) trafiają do bundla i powiększają go. `@inquirer/checkbox` dołożyła około 65 KB. Nowa zależność wymaga zgody Jakuba. Zależności w CommonJS wołają `require`, więc `kit/cli/bundle.mjs` dokleja na początek bundla `createRequire(import.meta.url)`. Bez tego bundel ESM kończy się błędem `Dynamic require of "stream" is not supported` już przy starcie, a testy jednostkowe tego nie wykrywają, bo nie uruchamiają bundla.

**Jak egzekwowana.**

- Aktualność bundla: job `cli` w `.github/workflows/kit.yml`. Krok „Verify CLI” (`npm run verify --prefix kit/cli`) kończy się przebudową bundla, a następny krok „Kit state and generated files are up to date” robi `git diff --exit-code` na całym drzewie, więc nieaktualny bundel zatrzymuje job w tym kroku. Późniejszy krok „Bundle is up to date” po udanym poprzednim zawsze przechodzi (rozbieżność R3 w notatce rozbieżności części 2).
- Bundel ma właściciela `core`: test własności ([D38](#d38)).
- CLI poza workspace'ami i bez zależności w `package.json` aplikacji: test własności zatrzyma zależność w root `package.json` bez właściciela, ale samego położenia CLI pilnuje tylko konwencja.
- Dystrybucja przez tag: tylko konwencja ([D46](#d46)).

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzje D1 i D2; commit `cdeb794`; [kit/CLAUDE.md](../kit/CLAUDE.md), „Bundel CLI”.

<a id="d29"></a>

## D29 · Workspaces `packages/*` i `apps/*` statyczne i puste

**Status:** zastąpiona przez [ADR-56](adrs/56-workspace-packages-replace-d29.md) · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzja D3 planu 2)

**Kontekst.** Design doc §4.3 przewidywał, że pole `workspaces` w `package.json` projektu będzie generowane z modułów, które wnoszą własne pakiety (na przykład przyszły `worker` w `apps/worker`). Żaden moduł kitu takiego pakietu nie ma, a generowanie `package.json` oznaczałoby kolejny szew w pliku zarządzanym ([D31](#d31)).

**Decyzja.** Root `package.json` ma stałe `"workspaces": ["packages/*", "apps/*"]`, jak w planie 1. Katalogi `packages/` i `apps/` nie istnieją ani w kicie, ani w projekcie. `npm run verify` uruchamia `turbo run test typecheck`, które według planu 2 (D3) bez pakietów kończy się kodem 0. Manifest ma pole `workspaces` (`moduleManifestSchema` w `kit/cli/src/manifest/schema.ts`), ale żaden kod CLI go nie czyta.

**Odrzucone alternatywy.** Generowane `workspaces` z manifestów (design doc §4.3). Plan nie zapisuje powodu poza tym, że statyczna lista wystarcza.

**Konsekwencje.**

- Moduł, który wniesie pakiet w `apps/<x>` albo `packages/<x>`, nie wymaga zmiany `workspaces`. Pole `workspaces` w manifeście nic nie robi.
- `wa create` przenosi `workspaces` z `package.json` kitu bez zmian (`projectPackageJson` w `kit/cli/src/assemble/package-json.ts` podmienia tylko nazwę, wersję i zależności).

**Jak egzekwowana.** Tylko konwencja. Job `assemble` w `.github/workflows/kit.yml` uruchamia `npm run verify` w złożonym projekcie bez pakietów, więc zatrzyma zmianę, po której `turbo` bez pakietów kończy się błędem, ale nie zmianę samej listy.

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D3; [design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §4.3.

<a id="d30"></a>

## D30 · Zależności npm mają właścicieli jak pliki; `package.json` projektu to suma manifestów; przy konflikcie w `wa add` wygrywa wersja projektu

**Status:** obowiązuje · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzja D4 planu 2); porównanie zależności osobno dla każdej sekcji i ostrzeżenie o konflikcie wersji dodał plan poprawek „drobiazgi” (zadania 3 i 4), którego autora źródła nie zapisują

**Kontekst.** Projekt z samym rdzeniem nie powinien instalować zależności modułów, których nie ma, a `wa remove` musi wiedzieć, które pakiety może usunąć z `package.json`. Bez zapisanego właściciela zależności nie da się tego ustalić.

**Decyzja.**

- Każdy manifest wymienia swoje `dependencies` i `devDependencies` w formacie `nazwa → wersja`. `kit/modules/core.json` wymienia wszystkie zależności rdzenia.
- W kicie każda zależność z root `package.json` ma właściciela, który deklaruje ją w tej samej sekcji i w tej samej wersji ([D38](#d38)).
- `wa create` zapisuje w `package.json` projektu sumę zależności wybranych manifestów, posortowaną po nazwie (`projectPackageJson`).
- `wa add` dopisuje zależności modułu (`addDependencies`). Gdy projekt ma już tę zależność w innej wersji w tej samej sekcji, zostaje wersja projektu, a CLI wypisuje `Uwaga: <nazwa> (<sekcja>) ma w projekcie <wersja>, moduł <moduł> wymaga <wersja>; zostaje wersja projektu` (`dependencyConflicts`).
- `wa remove` usuwa zależności modułu, których nie deklaruje żaden pozostały moduł kitu ani moduł projektu (`removeDependencies`).

**Odrzucone alternatywy.** Nie zapisano. Plan przyjął świadomie koszt: aktualizacja zależności w kicie to zmiana w `package.json` i w manifeście właściciela.

**Konsekwencje.**

- Aktualizując zależność w kicie, zmień ją w `package.json` i w manifeście właściciela; test własności nie pozwala o tym zapomnieć.
- Ostrzeżenie w `wa add` nie przerywa komendy. Zgodność modułu z wersją projektu sprawdzasz sam.
- Zależność, którą projekt ma w innej sekcji niż moduł, nie jest konfliktem: trafia do obu sekcji bez ostrzeżenia.
- `wa remove` usuwa zależność modułu także wtedy, gdy projekt miał ją wcześniej albo zmienił jej wersję, chyba że deklaruje ją inny manifest (także `projectModules`, [D36](#d36)).

**Jak egzekwowana.**

- Bramka CLI i job `cli` w `.github/workflows/kit.yml`: test „każdy plik i każda zależność ma dokładnie jednego właściciela” w `kit/cli/src/kit/__tests__/ownership.test.ts`.
- Testy `kit/cli/src/assemble/__tests__/package-json.test.ts` (na przykład „zaleznosc podbita w projekcie zostaje w wersji projektu”) i `kit/cli/src/commands/__tests__/add.test.ts` (ostrzeżenia o konflikcie).
- W projekcie klienta nic nie pilnuje zgodności `package.json` z manifestami: test własności nie trafia do projektu.

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D4; [plan „drobiazgi”](superpowers/plans/2026-10-28-wa-kit-cli-drobiazgi.md), zadania 3 i 4.

<a id="d31"></a>

## D31 · Hashe plików bez treści regionów; `package.json` i `package-lock.json` zarządzane; pliki generowane bez właściciela

**Status:** obowiązuje · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzja D5 planu 2)

**Kontekst.** `wa remove` ma odmówić usunięcia pliku zmienionego lokalnie ([D34](#d34)), więc projekt musi pamiętać, jak wyglądał każdy skopiowany plik. Część plików zmienia jednak automat: regiony `wa:*` przepisuje `wa generate`, a `package.json` i lockfile zmieniają komendy CLI i `npm install`.

**Decyzja.**

- `wa create` i `wa add` zapisują w `.wa/kit.json` projektu, w polu `files` modułu, SHA-256 każdego skopiowanego pliku (`fileHash` w `kit/cli/src/assemble/hash.ts`).
- W plikach z regionami (`REGION_FILES` w `kit/cli/src/generate/targets.ts`) hash liczony jest z treści bez linii między markerami (`stripRegions`), więc przebieg `wa generate` nie zmienia hasha.
- Pliki z `managedFiles` w `kit/kit.json` (`package.json`, `package-lock.json`) dostają w `files` znacznik `managed` zamiast hasha.
- Pliki z `generatedFiles` w `kit/kit.json` (trzy pliki generowane, [D04](#d04)) nie należą do żadnego manifestu i nie mają hasha: `wa create` ich nie kopiuje, tylko tworzy generatorem.

**Odrzucone alternatywy.** Nie zapisano. Scalanie zmian w plikach zarządzanych przy aktualizacji kitu plan 2 zostawia na później; robi to `wa update` ([D47](#d47)), który porównuje pliki tym samym hashem.

**Konsekwencje.**

- Wszystkie pliki z `REGION_FILES` należą do `core`, a rdzenia nie da się usunąć. Dla plików usuwanego modułu liczy się więc każda zmiana bajtu.
- Zmiana poza regionem w `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml` albo w schemacie rdzenia liczy się jako lokalna zmiana pliku rdzenia.

**Jak egzekwowana.** Bramka CLI: testy `kit/cli/src/assemble/__tests__/hash.test.ts` oraz „zmiana tylko w treści regionu wa:* nie liczy się jako zmiana” i „zmiana poza regionem w pliku regionów liczy się jako zmiana” w `kit/cli/src/commands/__tests__/remove.test.ts`.

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D5; commit `d3bbfce`.

<a id="d32"></a>

## D32 · Placeholdery to dosłowna podmiana napisów w plikach z `placeholderFiles`

**Status:** obowiązuje · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzja D6 planu 2)

**Kontekst.** Kit jest działającą aplikacją o nazwie „WA App”, więc jego pliki zawierają tę nazwę, slug `wa-app` i nazwy baz `wa_app`. Projekt ma dostać własne nazwy, a pliki kitu muszą zostać zwykłym, działającym kodem bez składni szablonów.

**Decyzja.**

- Przy kopiowaniu pliku `applyPlaceholders` (`kit/cli/src/assemble/placeholders.ts`) zamienia `WA App` na nazwę wyświetlaną, `wa-app` na slug i `wa_app` na slug z `_` (wartości z `placeholders` w `kit/kit.json`), tylko w plikach z listy `placeholderFiles`. Inne pliki są kopiowane bajt w bajt.
- Lista obejmuje między innymi `src/test/integration/database-url.ts`, `.github/workflows/ci.yml` i `.github/workflows/mutation.yml`, żeby baza testów integracyjnych projektu nazywała się `<slug_z_podkreśleniami>_test`, a nie `wa_app_test` wspólne dla wszystkich projektów na jednej maszynie, oraz pliki modułu `uploads` (`docker/uploads.compose.yml`, `ci/uploads.integration-steps.yml`), żeby bucket nazywał się `<slug>-uploads`.
- Osobny mechanizm działa w generatorze: `{{projectSlug}}` i `{{projectName}}` w przykładowych wartościach `env` manifestu (`fillPlaceholders` w `kit/cli/src/generate/targets.ts`).
- `package-lock.json` nie jest na liście: poprawia go pierwszy `npm install`.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Nowy plik z nazwą projektu albo bazy trzeba dopisać do `placeholderFiles`. W plikach z listy tych napisów nie używa się w innym znaczeniu, bo zostaną podmienione.
- Plan 2 mówi, że podmiana działa „nigdy w testach”, ale kod tego nie sprawdza: test dopisany do `placeholderFiles` też zostanie zmieniony.
- Tytuł projektu nie jest walidowany ani escapowany: cudzysłów w `--title` psuje składnię `src/shared/config/project.ts`.

**Jak egzekwowana.** Job `assemble` w `.github/workflows/kit.yml`, krok „No placeholders left in the project” (`git grep` napisów `WA App`, `wa-app`, `wa_app` poza testami, `package-lock.json` i `.wa/bin/`). Testy `kit/cli/src/assemble/__tests__/placeholders.test.ts` w bramce CLI. Brak podmiany w testach: tylko konwencja.

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D6; `kit/kit.json`.

<a id="d33"></a>

## D33 · Języki projektu w `.wa/kit.json` i w pliku generowanym `src/i18n/locales.generated.ts`

**Status:** obowiązuje · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzja D7 planu 2)

**Kontekst.** Część projektów potrzebuje tylko polskiego. Lista języków nie może wymagać ręcznej zmiany `src/i18n/config.ts`, bo ten plik należy do rdzenia ([D03](#d03)).

**Decyzja.** `wa create --locales` (albo odpowiedź na pytanie o języki) zapisuje języki w polu `locales` w `.wa/kit.json`. `wa generate` zapisuje je w `src/i18n/locales.generated.ts` (`export const locales = [...] as const;`), z którego importuje `src/i18n/config.ts`, i rejestruje tłumaczenia feature tylko w tych językach. Dozwolone są `pl` i `en`, `pl` jest wymagany, bez powtórzeń (`localesSchema` w `kit/cli/src/manifest/schema.ts`). Bez pola `locales` schemat przyjmuje `["pl", "en"]`.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Projekt tylko z `pl` zachowuje pliki `en.json`; aplikacja ich nie ładuje.
- Język dodany później zmienia się w `.wa/kit.json` i przez `npm run wa -- generate`. Trzeci język wymaga zmian w CLI ([D27](#d27)).
- W kicie `wa kit sync` zawsze zapisuje `["pl", "en"]`.

**Jak egzekwowana.**

- Bramka CLI: `kit/cli/src/manifest/__tests__/schema.test.ts` i „wybrane języki trafiają do pliku locales.generated.ts” w `kit/cli/src/commands/__tests__/create.test.ts`.
- Zgodność pliku z `.wa/kit.json`: job `verify` w `.github/workflows/ci.yml` ([D04](#d04)).

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D7.

<a id="d34"></a>

## D34 · `wa remove` działa „wszystko albo nic”; lokalne zmiany wymagają `--force`

**Status:** obowiązuje · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzja D9 planu 2)

**Kontekst.** Kod kitu w projekcie jest zwykłym kodem, który projekt może zmieniać ([D39](#d39)). Usunięcie modułu nie może po cichu skasować takich zmian.

**Decyzja.** `remove` (`kit/cli/src/commands/remove.ts`), zanim cokolwiek usunie:

1. odmawia usunięcia rdzenia (`Nie można usunąć rdzenia`), modułu projektu, modułu niezainstalowanego i modułu wymaganego przez inny moduł kitu albo projektu;
2. sprawdza, że każdy plik z `files` modułu leży wewnątrz projektu, także po rozwiązaniu dowiązań symbolicznych (`Ścieżka poza projektem: <plik>`);
3. porównuje hashe wszystkich istniejących plików modułu z `.wa/kit.json` ([D31](#d31)). Jeśli choć jeden plik się zmienił, bez `--force` nic nie usuwa, wypisuje listę zmienionych plików i kończy się kodem 1.

Dopiero potem usuwa pliki i puste katalogi, zależności ([D30](#d30)), wpis w `.wa/kit.json`, uruchamia `wa generate` i `npm install` (chyba że `--no-install`) i wypisuje podpowiedź `npx prisma migrate dev --name remove-<moduł>`.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- „Wszystko albo nic” dotyczy sprawdzenia przed usuwaniem. Błąd w trakcie usuwania niczego nie cofa; stan częściowy domyka ponowne `wa remove`.
- `--force` usuwa także zmienione pliki. Zmiany, które chcesz zachować, przenieś wcześniej.
- Plik modułu, którego już nie ma na dysku, nie liczy się jako zmieniony.
- `wa remove` nie usuwa danych: tabele modułu znikają dopiero po migracji, a pliki w magazynie S3 zostają.

**Jak egzekwowana.** Bramka CLI: testy w `kit/cli/src/commands/__tests__/remove.test.ts`, na przykład „zmieniony plik bez --force kończy się błędem i nie zmienia projektu” i „zmiana pliku modułu z --force usuwa moduł mimo zmian”.

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D9; commit `b2128d9`.

<a id="d35"></a>

## D35 · Baza, migracja i pierwszy admin przy `wa create` są opcjonalne (`--setup`)

**Status:** obowiązuje · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzja D10 planu 2)

**Kontekst.** Uruchomienie Dockera i migracji w trakcie `create` zawodzi, gdy na maszynie dewelopera porty Postgresa albo mailpit zajmuje inny projekt (plan 2, D10).

**Decyzja.** Domyślnie `wa create` zapisuje `.env` z losowym `BETTER_AUTH_SECRET` (uprawnienia `0600`) i wypisuje kolejne kroki: `docker compose up -d`, `npx prisma migrate dev --name init`, `npm run admin:create` i `npm run dev`. Z `--setup` albo po potwierdzeniu w pytaniu (zadawanym bez `--yes`, gdy zależności są instalowane) uruchamia `docker compose up -d --wait`, `npx prisma migrate dev --name init` i, jeśli podano adres, `npm run admin:create -- --email <adres>` (`runSetup` w `kit/cli/src/commands/create.ts`). `--setup` razem z `--no-install` jest błędem.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Przed `--setup` ustaw wolne porty; bez `--setup` zmienisz je w `.env` przed pierwszym `docker compose up`.
- Błąd po złożeniu projektu (zapis `.env`, `git init`, `npm install`, kroki setupu) niczego nie cofa: katalog projektu zostaje.

**Jak egzekwowana.** Bramka CLI: `kit/cli/src/commands/__tests__/create.test.ts` (na przykład „bez flagi setup nie uruchamia bazy, migracji ani admin:create”, „setup bez adminEmail pomija admin:create”) i `kit/cli/src/__tests__/args.test.ts` (`--setup` z `--no-install`).

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D10.

<a id="d36"></a>

## D36 · Funkcje projektu jako moduły projektu w `projectModules`

**Status:** obowiązuje · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzja D11 planu 2; rozbieżność R3 z notatki części 1)

**Kontekst.** Funkcja napisana dla jednego klienta potrzebuje wpisu w rejestrze modułów, bo bez niego nie ma nawigacji, `requireModuleAccess` nie zna jej klucza, a tłumaczenia się nie ładują. Sekcja `modules` w `.wa/kit.json` opisuje jednak kod z kitu: wersje, hashe i to, co mogą zmieniać `wa add`, `wa remove` i przyszłe aktualizacje.

**Decyzja.** Funkcja projektu ma wpis w osobnej sekcji `projectModules`: `{ "<x>": { "manifest": <manifest> } }`, bez wersji wpisu i bez hashy. Manifest ma ten sam schemat co `kit/modules/<x>.json`, więc awans funkcji do kitu to przeniesienie manifestu i plików.

- `wa generate` rejestruje moduły projektu po modułach kitu, alfabetycznie (`registeredModules` w `kit/cli/src/manifest/kit-state.ts`), z tymi samymi szwami: rejestr, relacje, env, compose, kroki CI.
- `readKitState` sprawdza, że klucz równa się `name`, nazwa nie powtarza się w `modules`, moduły z `requires` są zainstalowane, a `files` zawiera wzorzec zaczynający się od `src/features/<x>/`.
- `wa remove` odmawia usunięcia modułu projektu, `wa add` odmawia modułu kitu o tej samej nazwie, a `wa kit sync` przepisuje `projectModules` bez zmian.

**Odrzucone alternatywy.** Wpis funkcji projektu w `modules`, jako obejście opisane w pierwszej wersji tutorialu (rozbieżność R3 części 1).

**Konsekwencje.**

- Przeniesienie wpisu z `projectModules` do `modules` po awansie funkcji do kitu robi się ręcznie.
- Generator pomija bez błędu wzorzec z nawiasami (`src/features/{a,b}/**`) i wzorzec katalogu, którego nie ma na dysku (rulingi R14 i R5). W `projectModules` nic tego nie zgłasza; w manifestach kitu zgłasza to test własności ([D38](#d38)).
- Tutorial: [09-nowy-modul.md](09-nowy-modul.md#krok-3).

**Jak egzekwowana.**

- Bramka CLI: `kit/cli/src/manifest/__tests__/kit-state.test.ts`, `kit/cli/src/commands/__tests__/remove.test.ts`, `add.test.ts`, `kit-sync.test.ts`.
- Job `assemble` w `.github/workflows/kit.yml`, krok „Project module is registered without editing core tests” (fikstura `kit/cli/src/__tests__/fixtures/project-module/`).

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D11; commit `1f1ec7f`; [AGENTS.md](../AGENTS.md), „Moduły i pliki generowane”.

<a id="d37"></a>

## D37 · Testy rdzenia sprawdzają tylko moduły rdzenia

**Status:** obowiązuje · **Data:** 2026-10-28 · **Kto zdecydował:** Jakub (decyzja D12 planu 2; rozbieżność R56 z notatki części 1)

**Kontekst.** Testy rdzenia porównują rejestr modułów z literałem: macierz dostępu, nawigację, menu boczne. Gdyby obejmowały cały rejestr, każda funkcja projektu albo nowy moduł kitu wymagałyby zmiany plików rdzenia, czego zabrania [D03](#d03).

**Decyzja.** `src/shared/lib/auth/__tests__/access-matrix.test.ts` i `src/shared/lib/modules/__tests__/nav.test.ts` filtrują rejestr do pięciu modułów rdzenia z `src/test/core-modules.ts` (`account`, `auth`, `dashboard`, `organizations`, `users`), a `src/shared/components/__tests__/app-sidebar.test.tsx` do tych samych pięciu kluczy wpisanych w teście. Wszystkie moduły pilnuje ogólny test spójności rejestru `src/shared/lib/modules/__tests__/registry-consistency.test.ts` (unikalne klucze i adresy menu, adresy od `/`, tłumaczenia we wszystkich językach).

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.** Funkcja projektu i nowy moduł kitu nie wymagają edycji testów rdzenia. Ich dostęp i nawigację testujesz w ich własnych katalogach.

**Jak egzekwowana.** Job `assemble` w `.github/workflows/kit.yml`, krok „Project module is registered without editing core tests” (`npm test` po dodaniu fikstury `notes`), oraz test spójności w `npm run verify`.

**Źródło.** [Plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D12; commit `6f4c758`; [AGENTS.md](../AGENTS.md), „Moduły i pliki generowane”.

<a id="d38"></a>

## D38 · Aplikacja referencyjna w katalogu głównym; własność plików i zależności w manifestach `kit/modules/*.json`, pilnowana testem

**Status:** obowiązuje (zastępuje [D02](#d02)) · **Data:** 2026-10-28 · **Kto zdecydował:** autor design doc (§4.2 i §7: każdy plik ma dokładnie jednego właściciela, sprawdzane w CI; §9: jedna aplikacja z manifestami własności); położenie manifestów w `kit/modules/`, `wa kit sync` i test własności: plan 2 (architektura, zadania 2–3); źródła nie zapisują osobnej akceptacji Jakuba poza sekcją „Decyzje planu 2”

**Kontekst.** Kit trzeba rozwijać i testować jak zwykłą aplikację, a przy tworzeniu projektu musi się dać rozłożyć na rdzeń i moduły. Do tego potrzebna jest pełna informacja, który plik i która zależność należą do którego modułu. W planie 1 manifest leżał tylko w `.wa/kit.json`, nie obejmował wszystkich plików rdzenia i nic nie sprawdzało jego kompletności ([D02](#d02)).

**Decyzja.**

- Kit zawiera jedną działającą aplikację referencyjną ze wszystkimi modułami, w katalogu głównym repozytorium, z takim samym układem katalogów jak projekt klienta.
- Każdy moduł kitu ma manifest `kit/modules/<nazwa>.json` (schemat `moduleManifestSchema` w `kit/cli/src/manifest/schema.ts`) z wzorcami plików (`files`) i zależnościami ([D30](#d30)). `kit/kit.json` opisuje kit: wersję, repozytorium, pliki tylko dla kitu (`kitOnly`), placeholdery, pliki generowane i zarządzane.
- `wa kit sync` (`kit/cli/src/commands/kit-sync.ts`) przepisuje manifesty do `.wa/kit.json` kitu jako `modules.<nazwa>.manifest`, z pustym `files`. Projekt dostaje w `.wa/kit.json` manifesty zainstalowanych modułów i hashe skopiowanych plików ([D31](#d31)).
- `checkOwnership` (`kit/cli/src/kit/ownership.ts`) bierze pliki z indeksu gita (`git ls-files`) bez `kitOnly` i `generatedFiles` i zgłasza: plik bez właściciela, plik z kilkoma właścicielami, wzorzec bez dopasowań (`empty`) albo z `{` (`brace`), zależność bez właściciela albo w innej wersji lub sekcji niż w `package.json` i plik z pola `compose` spoza plików modułu.
- Wzorce w `files` znają tylko `**` (dowolna liczba segmentów, także zero) i `*` (znaki poza `/`); pozostałe znaki, w tym `[locale]` i `(app)`, są literałami (`globToRegExp` w `kit/cli/src/kit/files.ts`).

**Odrzucone alternatywy.**

- Manifest tylko w `.wa/kit.json` kitu, bez kontroli kompletności (stan z [D02](#d02)).
- Osobne katalogi modułów zamiast jednej aplikacji z manifestami (design doc §9).
- Aplikacja w podkatalogu `app/` (pierwotny design doc §6): zagnieżdżone workspaces npm nie działają, a ten sam układ co w projekcie upraszcza kopiowanie.

**Konsekwencje.**

- Nowy plik w kicie dopisujesz do manifestu właściciela (dla rdzenia `kit/modules/core.json`), a po zmianie manifestu uruchamiasz `npm run wa -- kit sync`. Zmiana plików modułu wymaga podbicia jego `version` (`kit/CLAUDE.md`).
- Każdy feature potrzebuje osobnego wzorca bez nawiasów. W manifestach kitu wzorzec z `{` albo bez dopasowań zatrzymuje test; generator pomija go bez błędu (rulingi R5 i R14), co ma znaczenie dla `projectModules` ([D36](#d36)).
- Test widzi tylko pliki z indeksu gita: nowy plik przed `git add` jest dla niego niewidoczny. Działa na prawdziwym repozytorium kitu, a nie na kopii.
- Pliku z pola `ciSteps` test nie sprawdza pod kątem właściciela modułu, w przeciwieństwie do `compose` ([D45](#d45)).
- Test własności leży w `kit/cli` i nie trafia do projektu: w projekcie klienta nic nie pilnuje kompletności manifestów.

**Jak egzekwowana.**

- Bramka CLI i job `cli` w `.github/workflows/kit.yml`: test „każdy plik i każda zależność ma dokładnie jednego właściciela” w `kit/cli/src/kit/__tests__/ownership.test.ts` (`checkOwnership(REPO_ROOT)` daje pusty raport) oraz testy na fiksturach `ownership-broken`, `ownership-order` i `ownership-sections`.
- Zgodność `.wa/kit.json` kitu z manifestami: krok „Kit state and generated files are up to date” w jobie `cli` (`kit sync`, `generate` i `git diff --exit-code`).
- `readKitState` (`kit/cli/src/manifest/kit-state.ts`) sprawdza `.wa/kit.json` schematem Zod przy każdej komendzie, która go czyta (testy `kit/cli/src/manifest/__tests__/kit-state.test.ts`).
- Podbicie `version` po zmianie plików modułu: tylko konwencja.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §4.1, §4.2, §6, §7 i §9; [plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), architektura i zadania 2–3; [plan „drobiazgi”](superpowers/plans/2026-10-28-wa-kit-cli-drobiazgi.md), zadanie 3; [kit/CLAUDE.md](../kit/CLAUDE.md), „Moduły i manifest”.

<a id="d39"></a>

## D39 · Kod kitu trafia do projektu jako zwykły kod; moduł wpina się deklaracjami w `defineModule` i punktami wejścia rdzenia

**Status:** obowiązuje (zastępuje [D01](#d01)) · **Data:** 2026-10-29 · **Kto zdecydował:** model kopiowania kodu: autor design doc i Jakub ([D01](#d01)); cel „moduły projektu rozszerzają kit bez edycji plików kitu”: spec planu 3 (§2, cele z burzy mózgów z Jakubem); deklaracje jako pola danych w `defineModule`: autor specu planu 3 (bloki „Moje decyzje” w §5–§7, §8), kształt pól: wykonawca planu 3

**Kontekst.** [D01](#d01) zakładał, że moduł to zestaw plików bez punktów rozszerzeń, a rdzeń widzi moduły tylko przez szwy generowane. Moduły planu 3 potrzebują jednak wkładu innych modułów: widok audytu musi znać etykiety akcji dopisanych przez moduł projektu, klucze API muszą znać zakresy, a upload musi znać cele z limitami. Moduł projektu (na przykład magazyn klienta) ma te rzeczy dodawać bez edycji plików kitu (spec planu 3, §2).

**Decyzja.**

- Kod rdzenia i modułów nadal jest kopiowany do projektu i staje się jego zwykłym kodem, bez paczek npm i bez ładowania pluginów w trakcie działania. `.wa/kit.json` zapisuje, skąd kod pochodzi ([D38](#d38)).
- `ModuleDef` (`src/shared/lib/modules/define-module.ts`) ma trzy opcjonalne pola danych:
  - `auditActions: { action, labelKey }[]`: etykiety akcji audytu, czytane przez moduł `audit-logs` (`audit-action-labels.ts`, widok `/audit-log`);
  - `apiScopes: { key, labelKey }[]`: zakresy kluczy API, czytane przez moduł `api-keys` (`api-scopes.ts`, `api-scope-labels.ts`, formularz klucza);
  - `uploadPurposes: { key, mimeTypes, maxBytes, visibility, resizeImage? }[]`: cele uploadu, czytane przez moduł `uploads` (`upload-purposes.ts`).
  Rdzeń zna tylko typy tych pól; treść czyta moduł, który jej potrzebuje, z rejestru `modules` albo `clientModules`.
- Punkty wejścia w kodzie rdzenia, które woła kod modułu albo projektu: `trackAudit` i `auditActor` w `src/shared/lib/audit.ts` z ujściami `auditSinks` z rejestru ([D40](#d40)) oraz `requestConfirmation` w `useServiceModeAction` (`src/shared/components/service-mode/use-service-mode-action.tsx`), z którego korzysta upload przez `fetch` ([D44](#d44)).

**Odrzucone alternatywy.**

- Moduły jako paczki npm, framework z wstrzykiwaniem zależności i ładowaniem pluginów w trakcie działania, składanie projektu flagami (powody w [D01](#d01)).
- Zamknięta lista akcji audytu w kicie (spec planu 3, §5: akcje są otwarte, `action` to dowolny napis).
- Zastępczy komponent `<AuditTrail>` w rdzeniu (spec planu 3, §5: szwem rdzenia jest tylko `trackAudit`).

**Konsekwencje.**

- Moduł projektu deklaruje akcje, zakresy i cele we własnym `module.ts`, bez edycji plików kitu. Deklaracje to czyste dane, bo `module.ts` trafia do paczki przeglądarki ([D05](#d05)).
- Deklaracja bez modułu, który ją czyta, nic nie robi: bez `audit-logs` etykiety akcji nie są nigdzie pokazywane, bez `api-keys` zakresy nie są używane, bez `uploads` cele nie są czytane.
- Nieznany zakres w kluczu (na przykład po usunięciu modułu, który go deklarował) jest ignorowany ([D43](#d43)). Dwa cele uploadu o tym samym kluczu albo cel z typem `image/svg+xml`, `text/html`, `application/xhtml+xml`, `application/xml` lub `text/xml` kończą się błędem przy każdym odczycie celów (`listUploadPurposes` nie zapamiętuje wyniku). `POST /api/uploads` woła `maxUploadBytes()` zaraz po sprawdzeniu nagłówka `Content-Length`, przed sprawdzeniem sesji, więc każde żądanie z poprawnym `Content-Length` kończy się wtedy błędem 500; żądanie bez tego nagłówka dostaje wcześniej 411.
- Komponenty modułu (na przykład `<AuditTrail>` z `audit-logs`) importuje się z katalogu modułu. Bez zainstalowanego modułu taki import nie zbuduje się.
- Zmiana w skopiowanym kodzie nie wymaga forka ani publikacji paczki. Poprawkę przydatną innym projektom wysyła się jako pull request do `webamigos/wa-kit` ([CLAUDE.md](../CLAUDE.md), „Pochodzenie kodu”); to proces, a nie automat.

**Jak egzekwowana.**

- `npm run typecheck`: typ `ModuleDef` i pliki generowane, które importują `module.ts`.
- Testy modułów: `src/features/audit-logs/services/__tests__/audit-action-labels.test.ts`, `src/features/api-keys/services/__tests__/api-scopes.test.ts` i `api-scope-labels.test.ts`, `src/features/uploads/services/__tests__/upload-purposes.test.ts` (duplikaty i typy zabronione).
- Brak paczek kitu w zależnościach aplikacji i to, że moduł nie edytuje plików rdzenia: tylko konwencja.

**Źródło.** [Spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) §2, §5–§8 i §10; [plan 3](superpowers/plans/2026-10-29-wa-kit-plan-3-modules.md), „Architecture”; commity `c8a0ffd` i `2199cea`; [design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §1, §2 i §9.

<a id="d40"></a>

## D40 · `trackAudit` w rdzeniu działa bez modułu; ujścia `auditSinks`; awaria ujścia nie przerywa komendy

**Status:** obowiązuje · **Data:** 2026-10-29 · **Kto zdecydował:** Jakub (spec planu 3, §5, „Ustalone”: szew w rdzeniu, no-op bez modułu, nigdy nie rzuca, brak `"use server"`); autor specu planu 3 (§8: implementacja przez opcjonalny plik modułu zbierany przez generator); wykonawca planu 3 (nazwa pliku `audit-sink.ts`)

**Kontekst.** Kod rdzenia, modułów i projektu ma zapisywać zdarzenia audytu bezwarunkowo, bez sprawdzania, czy projekt ma moduł `audit-logs`. W repozytorium źródłowym (justnails) funkcja zapisu leżała w pliku `"use server"`, więc klient mógł sam dopisać wpis (anty-cel w specu planu 3, §2).

**Decyzja.**

- `src/shared/lib/audit.ts` (plik rdzenia, bez `"use server"`) eksportuje `trackAudit(event)` i `auditActor(context)`. `trackAudit` woła po kolei każde ujście z `auditSinks` (rejestr w `src/modules.generated.ts`). Bez ujść nic nie robi.
- Ujście to eksport `auditSink` z pliku `src/features/<x>/audit-sink.ts`, który `wa generate` zbiera do `auditSinks`. W kicie jedynym ujściem jest `audit-logs`, które zapisuje wpis do tabeli `audit_logs`.
- Błąd ujścia (także synchroniczny wyjątek) jest łapany i zapisywany w logu jako `trackAudit failed` z nazwą akcji; kolejne ujścia nadal są wołane, a `trackAudit` nigdy nie rzuca.
- `auditActor(context)` buduje z `OrgContext` pola `organizationId`, `actorUserId` i `serviceMode`, więc wpis superadmina w trybie serwisowym jest oznaczony.

**Odrzucone alternatywy.**

- Zapis audytu w akcji serwerowej osiągalnej z klienta (anty-cel, spec planu 3, §2).
- Warunkowe wywołanie zależne od obecności modułu w każdym miejscu kodu (cel w specu: wołanie bezwarunkowe).

**Konsekwencje.**

- Kod wywołuje `trackAudit` po udanym zapisie danych. Bez modułu `audit-logs` wywołanie nic nie zapisuje i nie zgłasza błędu.
- Nieudany zapis wpisu nie cofa operacji i nie dociera do użytkownika; widać go tylko w logach ([D15](#d15)).
- Ujście dostaje zdarzenie przed redakcją: redakcję robi ujście `audit-logs` ([D41](#d41)). Własne ujście musi zadbać o nią samo.

**Jak egzekwowana.**

- `src/shared/lib/__tests__/audit.test.ts` (ujście rzuca → `trackAudit` nie rzuca, kolejne ujście wywołane, błąd zalogowany; „nie zawiera dyrektywy use server”).
- Rejestr: `kit/cli/src/generate/__tests__/generate-rendering.test.ts` („moduł tylko z audit-sink.ts trafia do auditSinks, a nie do klienta”) w bramce CLI.
- Bramka mutacji: `src/shared/lib/audit.ts` i `src/features/audit-logs/services/` są na liście `critical` w `mutation-gate.json` ([D26](#d26)).
- Wołanie `trackAudit` po każdej zmianie danych: tylko konwencja.

**Źródło.** [Spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) §2, §5 i §8; commity `c8a0ffd`, `33b4edc` i `c8b5f74`.

<a id="d41"></a>

## D41 · Redakcja danych wrażliwych przed zapisem wpisu audytu; moduł nie ma retencji

**Status:** obowiązuje · **Data:** 2026-10-29 (rozszerzenie redakcji 2026-10-29 i 2026-10-30) · **Kto zdecydował:** Jakub (spec planu 3, §5, „Ustalone”: pola wrażliwe zamieniane rekurencyjnie na `"[REDACTED]"`; §2: retencja poza zakresem); autor specu planu 3 (lista kluczy wrażliwych); rozszerzenie dopasowania i obsługa `toJSON`: poprawki z recenzji PR #6 (commity `012fe4d` i `3746be8`)

**Kontekst.** Wpis audytu przechowuje stan przed zmianą i po niej (`oldData`, `newData`). Kod, który woła `trackAudit`, może przekazać obiekt z hasłem, tokenem albo kluczem API, a log audytu czyta owner i admin organizacji. Log rośnie bez końca, dopóki nie ma mechanizmu zadań w tle.

**Decyzja.**

- Ujście `audit-logs` (`writeAuditLog` w `src/features/audit-logs/services/write-audit-log.ts`) przed zapisem przepuszcza `oldData` i `newData` przez `redactSensitive` (`src/features/audit-logs/services/redact.ts`).
- Klucz jest wrażliwy, gdy po zmianie na małe litery i usunięciu `-` i `_` zawiera jeden z fragmentów: `password`, `secret`, `token`, `apikey`, `authorization`, `cookie`, `privatekey`, `hashedkey`. Jego wartość zamienia się na `"[REDACTED]"`.
- Redakcja schodzi rekurencyjnie przez obiekty i tablice. Obiekt z metodą `toJSON` jest redagowany na wyniku tej metody, czyli na tym, co zapisałby `JSON.stringify`.
- Moduł nie usuwa starych wpisów. Retencja (sprzątanie wpisów starszych niż 60 dni) jest w specu planu 3 nie-celem i ma przyjść z modułem `worker`.

**Odrzucone alternatywy.** Dokładna lista kluczy z porównaniem bez wielkości liter (pierwsza wersja ze specu planu 3, §5), zastąpiona dopasowaniem fragmentów przy recenzji. Powodu nie zapisano; skutek: redagowane są też klucze takie jak `userPassword` albo `x-api-key`.

**Konsekwencje.**

- Redakcja po nazwie klucza nie złapie sekretu pod neutralną nazwą (na przykład `value`) ani w samym napisie. Nie przekazuj takich danych do `trackAudit`.
- Klucze, które tylko zawierają fragment (na przykład `tokenCount`), też są redagowane.
- Tabela `audit_logs` rośnie bez ograniczeń; usunięcie organizacji kasuje jej wpisy (`onDelete: Cascade`), a usunięcie użytkownika zostawia wpisy z pustym `userId` (`SetNull`).

**Jak egzekwowana.**

- `src/features/audit-logs/services/__tests__/redact.test.ts` i `write-audit-log.integration.test.ts`.
- Bramka mutacji: `src/features/audit-logs/services/` w `critical` ([D26](#d26)).
- Brak retencji: stan kodu, bez mechanizmu.

**Źródło.** [Spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) §2 i §5; [plan 3](superpowers/plans/2026-10-29-wa-kit-plan-3-modules.md), „Review Focus” pkt 4; commity `012fe4d` i `3746be8`.

<a id="d42"></a>

## D42 · Zdarzenia organizacji (zaproszenia, role, członkowie) łapane hookami better-auth

**Status:** obowiązuje · **Data:** 2026-10-29 · **Kto zdecydował:** Jakub (spec planu 3, §5, „Ustalone”: lista zdarzeń rdzenia logowanych od razu); autor specu planu 3 („Moje decyzje”: hooki better-auth zamiast komend kitu, wejście superadmina do organizacji); wykonawca planu 3 (wybór hooków, §10)

**Kontekst.** Zaproszenia, zmiany ról i usuwanie członków przechodzą przez endpointy pluginu `organization` better-auth, a nie przez komendy kitu, więc `trackAudit` nie ma gdzie zostać wywołane w kodzie rdzenia. Moduł `audit-logs` nie może przy tym edytować plików rdzenia ([D03](#d03)).

**Decyzja.**

- `audit-logs` ma własny plugin better-auth (`src/features/audit-logs/auth.ts`, eksport `authPlugin`), który generator dopisuje do `authPlugins` w rejestrze.
- Hook `after` dla ścieżek z `AUDITED_ORGANIZATION_PATHS` (`src/features/audit-logs/services/organization-audit-events.ts`): `/organization/invite-member`, `/organization/cancel-invitation`, `/organization/accept-invitation`, `/organization/update-member-role`, `/organization/remove-member` buduje zdarzenie i woła `trackAudit`. Hook `before` dla `/organization/update-member-role` czyta poprzednią rolę członka, żeby wpis miał stan przed zmianą.
- Trzy zdarzenia woła kod rdzenia bezpośrednio: `invitation.accepted` przy rejestracji z zaproszeniem (`joinOrganizationCommand` w `src/features/organizations/services/commands/member-commands.ts`), `member.invited` przy zaproszeniu ze strony „Użytkownicy” (`inviteUserCommand`, które tworzy zaproszenie bez endpointu pluginu) i `organization.entered` przy wejściu do organizacji (`enterOrganizationCommand` oraz `trackServiceModeEntry` w hooku `session.create.after` przy logowaniu).

**Odrzucone alternatywy.** Nie zapisano. Spec dopuszczał też `organizationHooks` albo `databaseHooks`; wykonawca wybrał plugin z hookami ścieżek, ograniczony do ścieżek z listy (commit `999e651`).

**Konsekwencje.**

- Bez modułu `audit-logs` hooki nie istnieją, a wywołania w rdzeniu nic nie zapisują ([D40](#d40)).
- Nowy endpoint pluginu `organization`, który zmienia członkostwo, nie trafi do audytu, dopóki jego ścieżki nie dopisze się do `AUDITED_ORGANIZATION_PATHS`.
- Zmiana ustawień organizacji nie jest logowana: rdzeń nie ma takiej operacji (spec planu 3, §5).

**Jak egzekwowana.** `src/features/audit-logs/services/__tests__/organization-audit-events.test.ts`, `src/features/audit-logs/__tests__/auth-plugin.integration.test.ts` (prawdziwa instancja better-auth i baza, job `integration` w `.github/workflows/ci.yml`); bramka mutacji obejmuje `src/features/audit-logs/services/`.

**Źródło.** [Spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) §5 i §10; commity `9569cbc` i `999e651`.

<a id="d43"></a>

## D43 · Klucze API: HMAC z `API_KEY_PEPPER`, zakresy, limit 10 aktywnych kluczy, bez `OrgContext`, jawny filtr organizacji

**Status:** obowiązuje · **Data:** 2026-10-29 · **Kto zdecydował:** Jakub (spec planu 3, §6, „Ustalone”: klucz organizacji, zakresy, format, HMAC z pepperem, limit, kody 401/403, tryb serwisowy); autor specu planu 3 („Moje decyzje”: pepper wymagany w produkcji, brak `OrgContext`, przykładowa trasa, porównanie przez wyszukanie po unikalnym hashu); poprawki z recenzji PR #7 (commity `946e66d`, `97067f4`, `d2cf343`)

**Kontekst.** System zewnętrzny (agent AI, integracja) woła API aplikacji bez sesji użytkownika. Klucz musi działać po odejściu osoby, która go utworzyła, nie może dać się odczytać z bazy ani pokazać drugi raz, a trasa nie może zwrócić danych innej organizacji.

**Decyzja.**

- Klucz należy do organizacji. Ma postać `<slug_z_podkreśleniami>_live_<32 bajty base64url>` (`generateApiKey` w `src/features/api-keys/services/api-key-secret.ts`). Baza przechowuje prefiks do wyświetlania i HMAC-SHA256 klucza z sekretem `API_KEY_PEPPER` (`hashedKey`, unikalny). Pełny klucz widać raz, po utworzeniu.
- `authenticateApiKey(request, scope)` (`src/features/api-keys/services/authenticate-api-key.ts`) czyta nagłówek `Authorization: Bearer <klucz>` i szuka rekordu po hashu (bez porównania w JS). Wynik: brak lub zły nagłówek → 401 `missing`; brak rekordu → 401 `invalid`; unieważniony → 401 `revoked`; wygasły → 401 `expired`; brak zakresu → 403 `scope`. Zakresy klucza, których nie deklaruje żaden moduł ([D39](#d39)), są pomijane. `lastUsedAt` zapisuje się bez czekania na wynik.
- Sukces daje `ApiKeyContext` `{ organizationId, apiKeyId, scopes }`, a nie `OrgContext`: trasa nie woła `getOrgContext()` i filtruje dane jawnie po `organizationId` z kontekstu klucza. Przykład: `GET /api/v1/organization` z zakresem `organization:read`, z `Cache-Control: no-store`.
- Tworzenie, unieważnianie i usuwanie kluczy to komendy z kontraktem trybu serwisowego ([D22](#d22)), dostępne dla `owner` i `admin` organizacji. Utworzenie sprawdza limit 10 aktywnych kluczy pod blokadą `pg_advisory_xact_lock` na organizację. Każda operacja zapisuje wpis audytu bez klucza i hasha.
- `API_KEY_PEPPER` (zmienna modułu, `src/features/api-keys/env.ts`) ma co najmniej 32 znaki, a przy `NODE_ENV=production` nie może być wartością z `.env.example`.

**Odrzucone alternatywy.** Hash SHA-256 bez peppera ze źródeł (company-dashboard), serwer MCP, OAuth, rotacja kluczy i rate limiting (spec planu 3, §2 i §6).

**Konsekwencje.**

- Zmiana `API_KEY_PEPPER` unieważnia wszystkie istniejące klucze: żaden nie da tego samego hasha.
- Trasa z kluczem nie przechodzi przez `getOrgContext()`, więc reguła [D07](#d07) wymaga, żeby autor trasy sam filtrował po `organizationId` z `ApiKeyContext`.
- Klucz bez zakresów nic nie może. Zakres modułu usuniętego z projektu przestaje działać bez zmiany klucza.
- `AuditEvent` ma pola `channel` (`WEB` albo `API`) i `credentialId`, ale `auditActor` przyjmuje tylko `OrgContext`. Trasa z kluczem, która zmienia dane, buduje zdarzenie audytu ręcznie z `ApiKeyContext` (`channel: "API"`, `credentialId: apiKeyId`); pilnuje tego tylko konwencja. Jedyna trasa z kluczem w kicie tylko czyta dane i nie zapisuje audytu.

**Jak egzekwowana.**

- Guard w kodzie: `authenticateApiKey` w każdej trasie z kluczem (to, że trasa go woła: tylko konwencja).
- `src/features/api-keys/services/__tests__/authenticate-api-key.test.ts`, `api-key-secret.test.ts`, `api-keys-isolation.integration.test.ts` (dwie organizacje), `src/features/api-keys/services/commands/__tests__/api-key-commands.test.ts` („przy 10 aktywnych kluczach zwraca błąd limitu i nic nie zapisuje”).
- Walidacja peppera: `envSchema` modułu przy starcie serwera ([D48](#d48)) i przy pierwszym odczycie `env` ([D17](#d17)).
- Bramka mutacji: `src/features/api-keys/services/` w `critical` ([D26](#d26)).

**Źródło.** [Spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) §6; [plan 3](superpowers/plans/2026-10-29-wa-kit-plan-3-modules.md), „Global Constraints” (prefiks klucza) i „Review Focus” pkt 3; commity `102b706`, `946e66d`, `a6cffb0`, `97067f4`, `d2cf343`.

<a id="d44"></a>

## D44 · Uploads: magazyn plików, cele uploadu, widoczność `public`/`organization` z `Cache-Control`, cofnięcie obiektu przy błędzie zapisu rekordu

**Status:** obowiązuje · **Data:** 2026-10-29 (`no-store` dla plików organizacji 2026-10-30) · **Kto zdecydował:** Jakub (spec planu 3, §7, „Ustalone”: cele, walidacja typu po zawartości, rekord, role, tryb serwisowy, pobieranie z `Cache-Control` zależnym od widoczności, MinIO lokalnie; 2026-10-30: `private, no-store` dla plików organizacji, commit `2e557c3`); autor specu planu 3 („Moje decyzje”: cofnięcie obiektu, usunięcie rekordu mimo błędu magazynu, brak wyjątku od `getOrgContext()`); poprawki z recenzji PR #8 (commity `0b5c91d`, `19d18d6`, `2e557c3`)

**Kontekst.** Projekty potrzebują miniatur, obrazów w edytorach i załączników. Plik prywatny organizacji nie może wyciec do innej organizacji ani zostać w pamięci przeglądarki po wylogowaniu, a plik od użytkownika nie może wykonać skryptu z domeny aplikacji.

**Decyzja.**

- Pliki leżą w magazynie, który wybiera `STORAGE_PROVIDER` ([D49](#d49)): domyślnie w katalogu na dysku serwera (`local`), a przy `s3` w magazynie zgodnym z S3 (lokalnie MinIO z profilu Compose `s3` we fragmencie `docker/uploads.compose.yml`, na produkcji Railway Bucket albo R2). Zmienne S3: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`. Do 2026-11-04 (`uploads` `0.1.0`) S3 był jedynym magazynem.
- Cel uploadu deklaruje moduł w `uploadPurposes` ([D39](#d39)): dozwolone typy, limit rozmiaru, widoczność i opcjonalne zmniejszenie obrazu. Kit dostarcza cel `editor-image` (JPEG, PNG, WebP, do 5 MB, `public`, szerokość do 1200 px).
- `POST /api/uploads` (`src/app/api/uploads/route.ts`) najpierw wymaga nagłówka `Content-Length` (inaczej 411) z rozmiarem nie większym niż największy limit celu plus 64 KB na narzut formularza (inaczej 413). Sesję i organizację trasa sprawdza po nagłówku `Content-Length`, a przed odczytem ciała. Limit konkretnego celu sprawdza się po odczycie pliku. Typ pliku ustala się z zawartości (`file-type`), nie z `file.type`, a rozszerzenie z typu. W trybie serwisowym trasa wymaga potwierdzenia jak komenda ([D22](#d22)). Klucz obiektu: `orgs/<organizationId>/<cel>/<uuid>.<rozszerzenie>`.
- Gdy zapis rekordu `Upload` w bazie się nie uda, obiekt jest usuwany z magazynu (błąd sprzątania tylko w logu). Usunięcie pliku kasuje rekord także wtedy, gdy obiektu nie da się usunąć z magazynu.
- `GET /api/uploads/<id>`: plik `public` bez logowania z `Cache-Control: public, max-age=31536000, immutable`; plik `organization` tylko wtedy, gdy aktywna organizacja z `getOrgContext()` jest organizacją pliku, z `Cache-Control: private, no-store`, a w innym przypadku 404 bez zdradzania istnienia pliku. Odpowiedź z plikiem ma `X-Content-Type-Options: nosniff` i `Content-Security-Policy: sandbox; default-src 'none'`; do odpowiedzi 404 trasa nie dodaje nagłówków pliku ani `Content-Security-Policy`, a `X-Content-Type-Options: nosniff` ma ona z nagłówków bezpieczeństwa, które `next.config.ts` dokłada do każdej ścieżki.

**Odrzucone alternatywy.**

- Typ pliku z `file.type` przeglądarki albo rozszerzenie z nazwy (anty-cel, spec planu 3, §2).
- Dostęp sprawdzany po ścieżce obiektu zamiast po rekordzie (spec planu 3, §7).
- Wyjątek od `getOrgContext()` dla członka kilku organizacji z inną aktywną organizacją (spec planu 3, §7: plik potrzebny szerzej ma cel `public`).
- Cache dla plików organizacji (przeglądarka oddałaby plik po wylogowaniu; commit `2e557c3`).

**Konsekwencje.**

- Plik `public` jest dostępny dla każdego, kto zna adres, i zostaje w cache po stronie przeglądarki i pośredników do roku. Danych prywatnych nie wgrywa się do celu `public`.
- Członek kilku organizacji widzi plik `organization` tylko po przełączeniu na jego organizację.
- `wa remove uploads` i usunięcie rekordu z błędem magazynu zostawiają obiekty w magazynie (pliki w katalogu `STORAGE_LOCAL_PATH` albo obiekty w buckecie); sprzątanie osieroconych obiektów ma przyjść z modułem `worker`.
- SVG, HTML i XML nie mogą być celem uploadu ([D39](#d39)).

**Jak egzekwowana.**

- Guard w kodzie: trasy `src/app/api/uploads/route.ts` i `src/app/api/uploads/[id]/route.ts` z serwisami w `src/features/uploads/services/`.
- `src/features/uploads/services/__tests__/read-upload.test.ts` i `read-upload.integration.test.ts` („plik ORGANIZATION z aktywną organizacją pliku daje 200 z private, no-store…”), `validate-upload.test.ts`, `uploads-isolation.integration.test.ts`, `src/features/uploads/services/commands/__tests__/create-upload.test.ts` („usuwa obiekt z tym samym kluczem i zwraca 500, gdy zapis rekordu pada”), `upload-commands.test.ts`, `storage.integration.test.ts` na prawdziwym MinIO (job `integration` w `.github/workflows/ci.yml` z krokami z [D45](#d45)).
- Bramka mutacji: `src/features/uploads/services/` w `critical` ([D26](#d26)).

**Źródło.** [Spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) §2 i §7; [plan 3](superpowers/plans/2026-10-29-wa-kit-plan-3-modules.md), „Review Focus” pkt 1 i 2; commity `c6c26c4`, `2199cea`, `19d18d6`, `0b5c91d`, `2e557c3`.

<a id="d45"></a>

## D45 · Region `wa:ci-integration` i pole manifestu `ciSteps`; pusty region w pliku bez markerów jest pomijany

**Status:** obowiązuje · **Data:** 2026-10-29 (pomijanie pustego regionu 2026-10-30, region w `mutation.yml` 2026-11-02) · **Kto zdecydował:** Jakub (spec planu 3, §7, „CI projektu (Jakub)”: region markerów w `ci.yml` wypełniany krokami z manifestów; 2026-10-30: pomijanie pustego regionu w pliku bez markerów, commit `1753a2d`; 2026-11-02: naprawa R25 z notatki rozbieżności części 2); wykonawca planu 3 (nazwa regionu i pola, bez regionu w `e2e.yml`)

**Kontekst.** Testy integracyjne modułu `uploads` potrzebują MinIO z bucketem. W GitHub Actions `services:` nie uruchomi `minio server`, bo nie ma pola `command`, więc MinIO startuje krokiem joba. Projekt bez `uploads` nie powinien go uruchamiać, a moduł nie może edytować `ci.yml` rdzenia ([D03](#d03)).

**Decyzja.**

- `.github/workflows/ci.yml` ma w jobie `integration` region `# wa:ci-integration:start` / `# wa:ci-integration:end`. `wa generate` wpisuje do niego treść plików wskazanych w polu `ciSteps` manifestów, z wcięciem 6 spacji, fragmenty modułów oddzielone pustą linią (`ciStepsBody` w `kit/cli/src/generate/targets.ts`).
- `uploads` wnosi `ci/uploads.integration-steps.yml` (start MinIO i utworzenie bucketu `<slug>-uploads`); plik jest w `placeholderFiles` ([D32](#d32)).
- Od `core` 0.5.3 ten sam region (ten sam marker i ta sama treść) ma job `stryker` w `.github/workflows/mutation.yml`, przed krokiem „Run Stryker (integration)”, bo `stryker.integration.config.json` uruchamia te same testy integracyjne, w tym testy `uploads` na S3. Region zamiast kroków wpisanych wprost: projekt bez `uploads` nie uruchamia MinIO, a kroki modułu żyją w jednym pliku (`ciSteps`).
- Gdy plik docelowy dowolnego regionu nie ma markerów, a region byłby pusty, generator go pomija bez błędu. Gdy moduł ma coś do wpisania, brak markerów kończy się błędem `<plik>: brak regionu wa:<marker>; …`, a jeden marker bez drugiego jest błędem uszkodzonego regionu.

**Odrzucone alternatywy.** MinIO jako usługa `services:` w GitHub Actions (brak `command`, spec planu 3, §7). Powodu pomijania pustego regionu commit nie podaje; z testów wynika, że projekt bez markerów w pliku docelowym generuje się bez błędu, dopóki żaden moduł nie ma czego tam wpisać.

**Konsekwencje.**

- Projekt bez modułów z `ciSteps` ma pusty region i nie uruchamia MinIO.
- `e2e.yml` nie ma regionu: kroki modułów działają tylko w jobie `integration` (`ci.yml`) i w jobie `stryker` (`mutation.yml`).
- Projekt z modułem, który ma `ciSteps`, po przeniesieniu bundla `.wa/bin/wa.mjs` z `core` 0.5.3 bez nowego `mutation.yml` dostaje przy `wa generate` błąd `.github/workflows/mutation.yml: brak regionu wa:ci-integration; …` (test „mutation.yml bez markerów, a moduł ma ciSteps” w `ci-steps.test.ts`), więc markery przenosi się razem z bundlem. Projekt, który usunął `mutation.yml`, generuje się bez błędu.
- `AGENTS.md` nie wymienia regionu ani pola `ciSteps` (rozbieżność R1).
- Test własności sprawdza, że plik z `compose` należy do modułu, ale pliku z `ciSteps` nie sprawdza ([D38](#d38)).
- Region działa tylko w CI. Lokalnie testy integracyjne korzystają z MinIO projektu uruchomionego przez `docker compose --profile s3 up -d` ([D49](#d49)): domyślne wartości w `src/test/integration/setup-env.ts` (`http://localhost:9000`, bucket `<slug>-uploads`) odpowiadają usługom `minio` i `minio-init`, a `STORAGE_PROVIDER=s3` z tego pliku trzyma testy na S3 także w projekcie, którego aplikacja zapisuje pliki na dysku. `INTEGRATION_S3_ENDPOINT` i `INTEGRATION_S3_BUCKET` zmieniają adres i bucket, gdy MinIO działa gdzie indziej.

**Jak egzekwowana.** Bramka CLI: `kit/cli/src/generate/__tests__/ci-steps.test.ts` (wcięcie, kolejność, „ci.yml bez markerów i bez ciSteps → sukces, ci.yml bajt w bajt bez zmian”, „ci.yml bez markerów, a moduł ma ciSteps → błąd brak regionu i żaden plik nie zmieniony”). Zgodność regionu z manifestami: job `verify` w `.github/workflows/ci.yml` ([D04](#d04)). Job `assemble` w `.github/workflows/kit.yml` uruchamia MinIO własnymi krokami dla kombinacji z `uploads`.

**Źródło.** [Spec planu 3](superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md) §7; commity `2e8db6e` i `1753a2d`.

<a id="d46"></a>

## D46 · Kit wydawany tagiem `v<version>` ustawianym przez człowieka; projekt pobiera kit tylko w swojej wersji

**Status:** obowiązuje częściowo: wydanie i tag zastępuje [ADR-54](adrs/54-kit-releases-are-cut-by-semantic-release.md) (semantic-release na `main`); pobieranie kitu w wersji projektu obowiązuje · **Data:** 2026-10-30 · **Kto zdecydował:** reguła wydania: `kit/CLAUDE.md` (autora nie zapisano); Jakub (tag `v0.1.0` z adnotacją na `76ca2d7`, opublikowany na GitHubie 2026-10-30)

**Kontekst.** `wa add` i `wa list` w projekcie potrzebują kitu w tej samej wersji, z której projekt powstał, bo kopiują pliki modułu obok skopiowanego wcześniej rdzenia. Kit nie ma rejestru paczek ([D28](#d28)), więc wersję wskazuje tag gita.

**Decyzja.**

- Wydanie kitu: podbicie `version` zmienionych modułów, `npm run wa -- kit sync`, scalenie do `main`, a tag `v<version>` (wersja z `kit/kit.json`) ustawia człowiek (`kit/CLAUDE.md`, „Składanie i wydanie”). Żaden workflow nie tworzy tagów.
- `resolveKitSource` (`kit/cli/src/kit/source.ts`) bierze źródło z `--kit`, potem z `WA_KIT_SOURCE`, potem z `kitRepo` w `.wa/kit.json`. Adres zdalny (`https://`, `ssh://`, `file://`, `git@`) klonuje płytko tag `v<kitVersion>` projektu. Ścieżka lokalna musi mieć w `kit/kit.json` tę samą `version`, inaczej komenda kończy się błędem z obiema wersjami.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Bez tagu wersji projektu na GitHubie one-liner i `wa add` z domyślnym źródłem kończą się błędem pobierania. `wa list` łapie błąd źródła (`listCommand` w `kit/cli/src/bin.ts`): wypisuje zainstalowane moduły i `Dostępne: nie udało się pobrać kitu (<powód>)` i kończy się kodem 0. Wersja bez tagu to znane ryzyko ([znane-ograniczenia.md](znane-ograniczenia.md)).
- Lokalny klon porównywany jest tylko po `version`, nie po commicie ani tagu: klon z niezacommitowanymi zmianami w tej samej wersji zostanie użyty.
- Projekt przechodzi na nowszą wersję kitu tylko w całości, przez `wa update` ([D47](#d47)); `wa add` i `wa list` dalej przyjmują wyłącznie kit w wersji projektu.

**Jak egzekwowana.** Wersja źródła: guard w kodzie (`resolveKitSource`) i testy `kit/cli/src/kit/__tests__/source.test.ts` (na przykład „tag w klonie wynika z wersji projektu”, „lokalny kit w wersji 0.1.0 przy projekcie 9.9.9 kończy się błędem z obiema wersjami”). Ustawienie tagu przy wydaniu: tylko konwencja.

**Źródło.** [kit/CLAUDE.md](../kit/CLAUDE.md), „Składanie i wydanie”; `kit/cli/src/kit/source.ts`; [plan 2](superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D2.

<a id="d47"></a>

## D47 · `wa update`: cały projekt do jednej wersji kitu, scalanie trójstronne, konflikty w plikach

**Status:** obowiązuje · **Data:** 2026-11-03 · **Kto zdecydował:** Jakub (markery konfliktu w plikach, wymóg czystego drzewa git i podgląd `--dry-run`; aktualizacja całego projektu do jednej wersji kitu; wersja docelowa jako obowiązkowy argument); autor specu `wa update` (tabela przypadków dla pliku, scalanie `package.json`, hashe z treści kitu, zapis `.wa/kit.json` przy konfliktach, klonowanie obu wersji z tagu, liczenie aktualizacji bundlem wersji docelowej, pierwsza aktualizacja one-linerem, cofanie przy błędzie zapisu, kod 1 dla plików „do decyzji”, brak `--force`), zatwierdzone przez Jakuba razem ze specem; wykonawca planu `wa update` (markery w stylu `diff3`, brzmienie komunikatów, format wyjścia)

**Kontekst.** Kod rdzenia i modułów trafia do projektu jako zwykły kod ([D39](#d39)), a projekt pobiera kit tylko w swojej wersji ([D46](#d46)). Poprawka w kicie (łatka bezpieczeństwa, zmiana zachowania rdzenia albo modułu) nie docierała więc do projektów założonych wcześniej: trzeba ją było przenosić ręcznie, plik po pliku, z diffu między tagami. Projekt zmienia przy tym kod kitu jak własny, więc prosta podmiana plików zniszczyłaby lokalne zmiany.

**Decyzja.**

- `wa update <wersja>` (`kit/cli/src/commands/update.ts`) przenosi rdzeń i wszystkie zainstalowane moduły kitu z `kitVersion` na tag `v<wersja>`. Wersja jest obowiązkowa i musi być wyższa (porównanie semver w `kit/cli/src/update/version.ts`); równa kończy się kodem 0 bez zmian.
- Dla każdego pliku są trzy strony: baza (tag `v<kitVersion>`), kit (tag `v<wersja>`), obie po podmianie placeholderów nazwami projektu, i plik projektu. Plik zmieniony tylko w kicie dostaje treść kitu, zmieniony po obu stronach jest scalany przez `git merge-file --diff3`, a konflikt zostawia markery w pliku. Plik usunięty w projekcie nie wraca, a plik projektu na ścieżce nowego pliku kitu nie jest nadpisywany. Pełna tabela: [16-cli-wa.md](16-cli-wa.md#update-plan) (`planUpdate` w `kit/cli/src/update/plan.ts`).
- „Projekt równy bazie” wymaga równości z bazą z tagu i z hashem w `.wa/kit.json`. Plik zgodny z hashem, ale różny od bazy z tagu (projekt złożony z drzewa roboczego klonu), jest traktowany jak zmieniony w projekcie.
- `package.json` scala się tekstowo z bazą i kitem odtworzonymi z manifestów ([D30](#d30)); `package-lock.json` jest poza planem i zmienia go tylko `npm install`. `.env` nie jest zmieniany.
- Komenda startuje tylko na czystym drzewie git (bez `--dry-run`), więc całość cofa `git restore . && git clean -fd` (poza plikami ignorowanymi przez `.gitignore`, na przykład `node_modules` po `npm install`). Treść każdego pliku powstaje w pamięci przed pierwszym zapisem, a błąd zapisu cofa zmiany jak w `wa add` ([D34](#d34)).
- `.wa/kit.json` dostaje nową wersję, manifesty i hashe treści **kitu** (nie scalonej), także przy konfliktach. Przy konfliktach `wa generate` i `npm install` są pominięte; konflikt albo plik „do decyzji” kończy komendę kodem 1.
- Obie wersje kitu CLI klonuje z tagu, także ze ścieżki lokalnej. Aktualizację liczy bundel wersji docelowej: bundel projektu klonuje tag docelowy i uruchamia jego bundel z wewnętrzną opcją `--from-kit`. Projekt z `v0.1.0`, którego bundel nie zna `update`, aktualizuje się pierwszy raz one-linerem z klonu tagu docelowego.

**Odrzucone alternatywy.**

- Aktualizacja pojedynczego modułu (`wa update <moduł>`): projekt ma jedną `kitVersion`, a `wa add` pobiera kit w tej wersji (decyzja Jakuba: wystarczy całość).
- Domyślna „najnowsza wersja” (decyzja Jakuba: wersja jest argumentem).
- Wybór pojedynczych poprawek (cherry-pick); pojedynczy plik cofa `git restore <plik>`.
- Osobne `wa diff` z design docu: jego rolę pełni `--dry-run`.
- `--force` nadpisujący lokalne zmiany: konflikt jest miejscem do ręcznego scalenia.
- Liczenie planu bundlem projektu: starszy bundel nie zna reguł nowszej wersji (lista plików z regionami, schematy, budowa `package.json`, generator).
- Migracje danych dostarczane przez kit, jak w `ng update`: kit nie commituje migracji ([D13](#d13)), komenda tylko podpowiada `npx prisma migrate dev --name kit-<wersja>`.

**Konsekwencje.**

- Po `wa update` przeglądasz `git diff`, rozwiązujesz markery i pliki „do decyzji”, uruchamiasz `npm run wa -- generate` i `npm install` (przy konfliktach), tworzysz migrację i uzupełniasz `.env` ([16-cli-wa.md](16-cli-wa.md#update-konflikty)).
- Kod wyjścia 1 nie zawsze znaczy „nic się nie zmieniło”: przy konflikcie albo pliku „do decyzji” zmiany są zapisane, a `.wa/kit.json` ma już nową wersję.
- Moduł usunięty albo przemianowany w kicie i nowe `requires` zatrzymują komendę przed zmianami. `wa add` doda brakujący moduł tylko wtedy, gdy istnieje on w wersji kitu projektu, bo pobiera kit w wersji `kitVersion`; moduł, który pojawia się dopiero w wersji docelowej, blokuje `wa update`, a zmiany kitu trzeba wtedy przenieść ręcznie, jak przed `wa update` ([znane-ograniczenia.md](znane-ograniczenia.md#cli-male)). Wydanie kitu nie powinno więc dodawać do istniejącego modułu `requires` na moduł nowy w tym samym wydaniu.
- Wydanie kitu musi mieć tag dla obu wersji: bazowej projektu i docelowej ([D46](#d46)).
- Pierwsza aktualizacja projektu z `v0.1.0` wymaga one-linera ([16-cli-wa.md](16-cli-wa.md#update-pierwsza)).

**Jak egzekwowana.** Bramka CLI: `kit/cli/src/commands/__tests__/update.test.ts`, `update-rollback.test.ts` i `update-source.test.ts` oraz `kit/cli/src/update/__tests__/` (`plan.test.ts`, `merge.test.ts`, `snapshot.test.ts`, `version.test.ts`) na repozytoriach kitu z tagami tworzonymi w teście. `src/update/` i `src/commands/` są na liście `critical` w `kit/cli/mutation-gate.json`. Wymóg czystego drzewa i zakaz obniżania wersji: guardy w kodzie (`assertCleanTree`, `checkVersions`).

**Źródło.** [Spec `wa update`](superpowers/specs/2026-11-03-wa-update-design.md) (§ 12: podział decyzji między Jakuba i Claude); [plan `wa update`](superpowers/plans/2026-11-03-wa-update.md); commity `de54292..cdf13ba`.

<a id="d48"></a>

## D48 · Walidacja `env` przy starcie procesu

**Status:** obowiązuje · **Data:** 2026-11-04 · **Kto zdecydował:** Jakub (walidacja całego `env` przy starcie procesu tak jak w Ragenie, raport z linią na każdy problem, raport na konsoli: spec providera storage, §2 i §4.2); autor specu providera storage (wyjście z kodem 1, zapisane jako „moja interpretacja reguły Ragena, do sprawdzenia przy czytaniu”; spec Jakub zatwierdził 2026-11-04); autor planu providera storage (wariant bez rzucania `checkEnv`, nagłówek raportu z liczbą problemów, pominięcie fazy `next build` bez warunku); wykonawca planu providera storage (obiekt `processStartupIo` w `src/shared/lib/env.ts` zamiast obiektu `io` w `register()`)

**Kontekst.** Walidacja `env` była wyłącznie leniwa: obiekt `env` sprawdzał zmienne przy pierwszym odczycie, a healthcheck czyta tylko bazę. Błędne zmienne nie zatrzymywały więc wdrożenia. Healthcheck odpowiadał 200, więc według dokumentacji Railway ruch przechodził na nową wersję, a aplikacja zwracała 500 dopiero przy pierwszym żądaniu, które czyta `env`, na przykład przy logowaniu. Spec providera storage wymaga, żeby brak wymaganej zmiennej albo konfiguracja, która zgubiłaby pliki, kończyła się błędem przy starcie procesu, a nie przy pierwszym uploadzie. Ragen sprawdza `env` przy starcie i zbiera wszystkie problemy naraz, bo pętla restartów, która odsłania jedną zmienną na raz, wydłuża konfigurację.

**Decyzja.**

- `register()` w `src/instrumentation.ts`, tylko w środowisku `nodejs` i przed konfiguracją eksportu logów, woła `verifyEnvOnStartup(process.env, processStartupIo)` z `src/shared/lib/env.ts`. Obiekt `processStartupIo` z tego samego pliku przekazuje raport do `console.error`, a kod wyjścia do `process.exit`, więc `src/instrumentation.ts` nie odwołuje się do `process.exit`. Funkcja sprawdza pełny schemat, czyli `coreEnvSchema` razem ze schematami modułów z `moduleEnvSchemas`, tym samym schematem, którego używa `parseEnv`.
- Wszystkie problemy trafiają do jednego raportu (`formatEnvReport`): pierwsza linia `Nieprawidłowe zmienne środowiskowe (<liczba problemów>):`, potem po jednej linii `- <nazwa>: <komunikat>` na problem. Nazwą jest ścieżka problemu z Zod połączona kropkami, a problem bez ścieżki ma nazwę `(env)` (`checkEnv`).
- Raport idzie na `console.error`, a nie przez `logger`, a potem proces kończy się kodem 1. To wyjątek od [D15](#d15) tylko dla raportu startowego.
- `next build` działa bez zmiennych, bo nie wywołuje `register()` (sprawdzone w Next.js 16.4.3). Przy `NEXT_PHASE` równym `phase-production-build` (`PHASE_PRODUCTION_BUILD` z `next/constants`) `verifyEnvOnStartup` i tak niczego nie sprawdza: to zabezpieczenie na wypadek, gdyby build wywołał `register()`.
- Leniwe `env` zostaje i chroni import w `next build` oraz w testach bez pełnego środowiska ([D17](#d17)). `parseEnv` korzysta z `checkEnv` i rzuca jednoliniowy błąd w tym samym formacie co wcześniej (`Nieprawidłowe zmienne środowiskowe: <nazwa>: <komunikat>; …`). Różni się tylko problem bez ścieżki: ma nazwę `(env)`, a wcześniej miał pusty napis.
- Sprawdzenie nie ma flagi „już sprawdzone”: przy poprawnych zmiennych niczego nie wypisuje, a przy błędnych proces kończy się przy pierwszym wywołaniu, więc kolejne wywołanie `register()` raportu nie powtórzy.

**Odrzucone alternatywy.**

- Walidacja tylko leniwa, przy pierwszym odczycie `env`, czyli stan sprzed tej decyzji: błędne zmienne przechodziły healthcheck, a aplikacja zwracała 500 dopiero przy pierwszym żądaniu, które czyta `env` (spec §4.2).
- Proces, który żyje dalej mimo błędnych zmiennych, jak `apps/web` w Ragenie. Ragen zostawia go przy życiu, bo serwuje stronę konfiguracji z listą zmiennych do poprawienia. Kit nie ma takiej strony (nie-cel specu), więc jest w sytuacji `apps/api` i workera Ragena, które kończą pracę (`parseEnvOrExit`).
- Raport przez `logger`: na produkcji bez `OTEL_EXPORTER_OTLP_ENDPOINT` wpis by zniknął ([D15](#d15)). Ragen z tego samego powodu używa przy starcie konsoli.
- Sprawdzenie przy starcie, które łapie wyjątek z `parseEnv` i przerabia jego tekst na raport. Spec zostawił wybór wykonawcy (§5), a plan wybrał wariant bez rzucania (`checkEnv`), taki jak w Ragenie.

**Konsekwencje.**

- Każda reguła `env` rdzenia i modułów zatrzymuje start, także reguła produkcyjna `API_KEY_PEPPER` z `api-keys`: wartość z `.env.example` przy `NODE_ENV=production` kończy proces kodem 1 (sprawdzone na zbudowanym serwerze). To zamierzone (spec §4.2).
- Nowe wdrożenie z błędnymi zmiennymi nie przechodzi healthchecku, a Railway zostawia ruch przy poprzedniej wersji (niesprawdzone na Railway). Restart kontenera niczego nie zmienia, bo każdy start kończy się tym samym raportem ([10-wdrozenie.md](10-wdrozenie.md#blad-env)).
- Warunki produkcyjne schematu Zod sprawdza dopiero po przejściu podstawowych reguł tego samego schematu, więc po poprawieniu zmiennych kolejny start może pokazać nowy raport ([07-i18n-mail-env.md](07-i18n-mail-env.md#walidacja-env)).
- `npm run dev` z niepełnym `.env` kończy się raportem i kodem 1, zamiast startować i zgłaszać błąd przy pierwszym odczycie `env` (sprawdzone).
- Brak wymaganej zmiennej w `e2e/env.ts` zatrzymuje serwery e2e przy starcie ([16b-rozwoj-kitu.md](16b-rozwoj-kitu.md#nowy-modul-kitu)).
- Skrypty (`npm run admin:create`) i testy nie wywołują `register()`. Ich zmienne sprawdza dopiero pierwszy odczyt `env`, a błąd ma postać jednoliniowego wyjątku z `parseEnv`.

**Jak egzekwowana.**

- Guard w kodzie: `register()` w `src/instrumentation.ts` przy każdym starcie serwera Next.js.
- Testy w `npm run verify`: `src/shared/lib/__tests__/env-startup.test.ts` (na przykład „błędne zmienne → kończy proces raz, kodem 1” i „faza next build → bez sprawdzenia, raportu i wyjścia”) oraz `src/__tests__/instrumentation.test.ts` („runtime nodejs z błędnym env i bez OTel → raport na console.error i process.exit(1)”).

**Źródło.** [Spec providera storage](superpowers/specs/2026-11-04-uploads-storage-provider-design.md) §2, §4.2, §5 i §6; [plan](superpowers/plans/2026-11-04-uploads-storage-provider.md), Task 1; walidacja `env` w Ragenie (ADR-37, `packages/env/src/parse.ts`, `apps/web/src/instrumentation.ts`) w opisie specu.

<a id="d49"></a>

## D49 · Uploads: provider storage `local` albo `s3`, domyślnie `local`

**Status:** obowiązuje · **Data:** 2026-11-04 · **Kto zdecydował:** Jakub (zmienna `STORAGE_PROVIDER` z wartościami `local` i `s3`, domyślnie `local`, i błąd przy starcie procesu zamiast przy pierwszym uploadzie: spec providera storage, §1, §2 i §4.1; spec Jakub zatwierdził 2026-11-04); autor specu providera storage („Moje decyzje”, zapisane „do sprawdzenia przy czytaniu”: nazwy `S3_*` bez zmian, `STORAGE_LOCAL_PATH` z domyślnym `RAILWAY_VOLUME_MOUNT_PATH` i `./volumes/uploads`, trzy reguły produkcyjne, podwójna ochrona przed path traversal, MinIO w profilu Compose `s3`, katalog `/app/volumes/uploads` w obrazie, zalecenie Railway Bucket na Railway); autor planu providera storage (pliki `local-storage.ts`, `s3-storage.ts` i `storage-env.ts`, treść komunikatów, zapis pliku bez pliku tymczasowego); wykonawca planu providera storage (notka o przejściu z `uploads` `0.1.0`, ruling R17 w ledgerze wykonania; ruling R19 po recenzji końcowej gałęzi: czwarta reguła produkcyjna, ścieżka bezwzględna poza Railway, z uzasadnieniem ze specu §4.3)

**Kontekst.** Moduł `uploads` w wersji `0.1.0` zapisywał pliki wyłącznie w magazynie zgodnym z S3, więc nie działał bez bucketu: lokalnie potrzebny był MinIO w Dockerze, a na produkcji Railway Bucket albo R2. Na spotkaniu 2026-11-03 Patryk zwrócił uwagę, że będą wdrożenia bez S3, i wskazał jako wzór pakiet `storage` z Ragena, który ma provider lokalny i S3. Provider lokalny niesie ryzyko cichej utraty plików: na Railway bez wolumenu albo w kontenerze bez trwałego katalogu pliki znikają przy redeployu, a spec providera storage zapisuje to jako anty-cel.

**Decyzja.**

- `STORAGE_PROVIDER` wybiera magazyn: `local` albo `s3`. Wartość jest przycinana i zamieniana na małe litery, brak i pusta wartość dają `local`, a każda inna jest błędem walidacji. Provider `local` trzyma pliki w katalogu `STORAGE_LOCAL_PATH`, a gdy jej nie ma, w `RAILWAY_VOLUME_MOUNT_PATH`, a dalej w `./volumes/uploads` względem katalogu roboczego procesu. Zmienne `S3_*` zostają z dawnymi nazwami i regułami i obowiązują tylko przy `s3`.
- Wybór i reguły liczy czysta funkcja `resolveStorageEnv` (`src/features/uploads/services/storage-env.ts`), a woła ją schemat `src/features/uploads/env.ts`. Konfiguracja magazynu jest więc częścią sprawdzenia `env` przy starcie ([D48](#d48)). Wynik (`StorageEnv` w `contracts/storage.types.ts`) mówi wprost, który provider wybrano.
- Przy `NODE_ENV=production` i providerze `local` cztery reguły zatrzymują start: Railway (niepuste `RAILWAY_ENVIRONMENT_ID`) bez wolumenu, `STORAGE_LOCAL_PATH` poza wolumenem Railway, brak `STORAGE_LOCAL_PATH` poza Railway i `STORAGE_LOCAL_PATH` poza Railway, który po obcięciu spacji nie jest ścieżką bezwzględną (`path.isAbsolute`) ([15-modul-uploads.md](15-modul-uploads.md#reguly-produkcyjne)).
- `putObject`, `getObject` i `deleteObject` w `services/storage.ts` zachowują sygnatury i przekazują wywołania providerowi tworzonemu raz na proces: `local-storage.ts` albo `s3-storage.ts`, za wspólnym interfejsem `ObjectStorage`. Trasy i komendy modułu się nie zmieniły.
- Provider `local` odrzuca klucz bezwzględny, z segmentem `..` albo z bajtem `\0` i sprawdza, że ścieżka po rozwiązaniu leży w katalogu magazynu. To obrona w głąb, bo klucze tworzy sam moduł.
- Usługi `minio` i `minio-init` w `docker/uploads.compose.yml` mają profil Compose `s3`, więc `docker compose up -d` ich nie uruchamia. Testy integracyjne zostają na S3 (`STORAGE_PROVIDER=s3` w `src/test/integration/setup-env.ts`), a serwery e2e działają z `local` na katalogu tymczasowym (`e2e/env.ts`).
- `Dockerfile` (rdzeń) zakłada katalog `/app/volumes/uploads` należący do `nextjs:nodejs`, bo `/app` należy do roota, a proces działa jako `nextjs`.
- `@aws-sdk/client-s3` zostaje w zależnościach manifestu także dla projektów z `local`, bo warunkowa zależność komplikowałaby CLI.

**Odrzucone alternatywy.**

- S3 jako provider domyślny: świeży projekt ma działać bez konta w chmurze i bez dodatkowej usługi, z tym samym uzasadnieniem co ADR-27 Ragena (spec §1).
- Nazwy zmiennych z Ragena (`S3_ENDPOINT_URL`, `S3_BUCKET_NAME`): nie dają nic, a zmiana dotknęłaby dokumentacji, CI i e2e (spec §2 i §4.1).
- Ostrzeżenie w logach zamiast reguły dla `local` w produkcji poza Railway: według [D15](#d15) `logger` na produkcji bez `OTEL_EXPORTER_OTLP_ENDPOINT` nie pisze nigdzie, więc ostrzeżenie byłoby niewidoczne (spec §4.3).
- Każdy ustawiony `STORAGE_LOCAL_PATH` poza Railway, także względny, jako dowód świadomego wyboru katalogu (wiersz tabeli zachowań w planie, Task 3): `wa create` wpisuje do `.env` przykład `./volumes/uploads`, więc wymóg jawnej ścieżki byłby spełniony bez decyzji administratora, a `node .next/standalone/server.js` liczy tę ścieżkę od `.next/standalone`, który usuwa następny `next build` (ruling R19).
- Ogólny mechanizm „seamów” jak `STORAGE_SEAM` w Ragenie: przy jednym przełączniku byłby na wyrost (spec §2).

**Konsekwencje.**

- Projekt z `uploads` startuje lokalnie bez MinIO i bez zmiennych `S3_*`; pliki leżą w `volumes/uploads`, który jest w `.gitignore`.
- Na produkcji `local` wymaga jednej instancji i trwałego katalogu: wolumenu na Railway albo wolumenu Dockera na własnym serwerze. Na Railway dokumentacja kitu zaleca Railway Bucket, bo pozwala na repliki, nie ma przerwy przy redeployu i nie wymaga `RAILWAY_RUN_UID=0` ([10-wdrozenie.md](10-wdrozenie.md#pliki-uploads)).
- Na własnym serwerze `STORAGE_LOCAL_PATH` jest ścieżką bezwzględną, także przy `npm start` w trybie produkcyjnym na własnym komputerze. `./volumes/uploads` z `.env.example` przechodzi tylko poza produkcją i na Railway, gdzie po rozwiązaniu musi leżeć w wolumenie. Obraz Docker uruchomiony bez `-v`, z bezwzględnym `STORAGE_LOCAL_PATH=/app/volumes/uploads`, przechodzi start, choć pliki leżą na dysku kontenera: tego reguły nie wykrywają ([10-wdrozenie.md](10-wdrozenie.md#wlasny-serwer)).
- Moduł nie przenosi plików między providerami: po zmianie `STORAGE_PROVIDER` stare pliki zostają w poprzednim magazynie i dają 404 ([znane-ograniczenia.md](znane-ograniczenia.md#uploads-local)).
- Projekt, który używał S3 na `uploads` `0.1.0`, po przejściu na `0.2.0` ustawia `STORAGE_PROVIDER=s3`, a lokalny MinIO uruchamia przez `docker compose --profile s3 up -d`. Bez tego serwer deweloperski po cichu przechodzi na `local`, a produkcja poza Railway nie wystartuje, bo zatrzyma ją reguła `STORAGE_LOCAL_PATH` ([15-modul-uploads.md](15-modul-uploads.md#aktualizacja)). Według Jakuba w chwili decyzji żaden projekt nie używał `uploads`, więc zmiana domyślnego providera nie ma migracji (spec §1).
- `uploads` `0.2.0` wymaga `core` `0.5.0` (`src/shared/lib/env.ts`, `src/instrumentation.ts`, `e2e/env.ts`, `src/test/integration/setup-env.ts`, `Dockerfile`). CLI tego nie sprawdza: w lokalnym klonie kitu `wa add` porównuje tylko `version` z `kit/kit.json`, która także w kicie z `uploads` `0.2.0` ma wartość `0.1.0`, więc `wa add uploads --kit <klon>` w projekcie z tagu `v0.1.0` zainstaluje `uploads` `0.2.0` na `core` `0.4.0`. Z domyślnego źródła `wa add` instaluje moduł z tagu `v<kitVersion>`, czyli przy `0.1.0` `uploads` `0.1.0` (tylko S3). Skutki na `core` `0.4.0`: [15-modul-uploads.md](15-modul-uploads.md#wersja-core).
- Nazwy zmiennych magazynu są w trzech miejscach (pole `env` manifestu, `env.ts` i `storage-env.ts`), a nic ich nie porównuje ([15-modul-uploads.md](15-modul-uploads.md#lista-zmiennych)).
- Ochrona ścieżek jest leksykalna, więc katalog magazynu ma należeć wyłącznie do aplikacji.

**Jak egzekwowana.**

- Guard w kodzie: reguły `resolveStorageEnv` zatrzymują start przez `register()` ([D48](#d48)), a `resolveObjectPath` sprawdza klucz przy każdej operacji providera `local`.
- Testy w `npm run verify`: `src/features/uploads/services/__tests__/storage-env.test.ts` (na przykład „w produkcji pusty RAILWAY_ENVIRONMENT_ID znaczy poza Railway”, „w produkcji poza Railway względny STORAGE_LOCAL_PATH daje problem „musi być ścieżką bezwzględną”” i „nieznany STORAGE_PROVIDER daje jeden problem z listą dozwolonych wartości”), `local-storage.test.ts`, `path-inside.test.ts`, `create-object-storage.test.ts`, `storage-local-env.test.ts`, `storage.test.ts` i `src/features/uploads/__tests__/env.test.ts`.
- Osobny workflow CI: job `integration` w `.github/workflows/ci.yml` uruchamia testy integracyjne modułu na MinIO.
- Bramka mutacji: `src/features/uploads/services/` w `critical` ([D26](#d26)). `src/features/uploads/env.ts` nie jest we wzorcach `mutate` w `stryker.config.json`, dlatego reguły leżą w `services/`.
- Profil Compose `s3` i katalog `/app/volumes/uploads` w obrazie: tylko konwencja. Job `assemble` buduje obraz (`docker build .`), ale nie sprawdza katalogu ani listy usług Compose.

**Źródło.** [Spec providera storage](superpowers/specs/2026-11-04-uploads-storage-provider-design.md) §1–§6; [plan](superpowers/plans/2026-11-04-uploads-storage-provider.md), Task 2–6; commity `787fb39`, `c3b0a86`, `b435fda`, `cc7c13b`, `22bd604`, `a08b121`, `734391b` i `6c05f1f` (ruling R19); pakiet `storage` i ADR-27 Ragena oraz dokumentacja Railway ([wolumeny](https://docs.railway.com/volumes/reference), [Storage Buckets](https://docs.railway.com/storage-buckets)) w opisie specu.

<a id="d50"></a>

## D50 · Testy architektury repo w rdzeniu kitu

**Status:** obowiązuje · **Data:** 2026-11-21 · **Kto zdecydował:** Patryk (przeniesienie testów zgodności repo z Ragena do rdzenia kitu, lista siedmiu testów i zasada „naruszenie poprawia się w tym samym zadaniu”: spec harnessu z Ragena, §2 i §3); autor planu harnessu (reguły rozpoznawania ścieżek, kluczy, importów i literałów `node-version`, Task 1); wykonawca Task 1 (funkcje wykrywające w `scripts/lib/architecture/`, gołe nazwy plików z katalogu głównego tylko z rozszerzeniami plików konfiguracji, pominięcie `import type`, trzy moduły `@/shared/lib/auth` dozwolone w plikach klienckich)

**Kontekst.** Harness kitu pilnuje tego, jak agent pisze kod i testy (hooki, tester inny niż implementer, bramka mutacji), ale nie spójności repo: czy komendy i ścieżki z instrukcji agenta istnieją, czy klucze tłumaczeń są w obu językach, czy `.env.example` przechodzi walidację, czy wersja Node jest jedna. Monorepo Ragena ma na to około 125 testów zgodności w `tests/architecture/`. Przegląd harnessu z Patrykiem 2026-11-21 wybrał z nich siedem, które pasują do projektu złożonego z kitu.

**Decyzja.**

- Siedem testów w `src/__tests__/architecture/`: budżet `AGENTS.md` (31 744 bajty), istniejące komendy `npm run`, istniejące cytowane ścieżki, te same klucze tłumaczeń w każdym języku, `.env.example` zgodny z `checkEnv`, jedna wersja Node w `.nvmrc`, `Dockerfile` i workflow, pliki klienckie bez importów serwerowych. Lista i reguły: [08-testy.md](08-testy.md#architektura).
- Testy są plikami rdzenia (`src/__tests__/architecture/**` w `files` manifestu `core`), więc działają w każdym projekcie, i czytają tylko pliki, które projekt ma. Odsyłacze do `docs/` i `kit/` (`kitOnly`) są pomijane.
- Każdy test ma czystą funkcję wykrywającą w `scripts/lib/architecture/`, testowaną na literałach, i jedno wywołanie na prawdziwym repo, które oczekuje pustej listy naruszeń. Funkcje nie leżą w `src/__tests__/`, bo hook `protect-tests` blokuje tam zapis w fazie implementacji.
- Naruszenie w obecnym kodzie poprawia się w tym samym zadaniu. Przy wprowadzeniu testów żadnego nie było. Wyjątek z uzasadnieniem jest dopuszczalny tylko wtedy, gdy poprawka wykracza poza zadanie, i zadanie zgłasza go człowiekowi. Jedyny taki wyjątek to `CLIENT_SAFE_AUTH_MODULES`: komponenty rdzenia importują stałe ról z `@/shared/lib/auth/roles` i `@/shared/lib/auth/permissions`, a te pliki nie importują kodu serwera.

**Odrzucone alternatywy.**

- Testy tylko w repo kitu (na przykład w `kit/cli`): nie sprawdzałyby projektu, który zmienia `AGENTS.md`, dodaje tłumaczenia albo zmienia `Dockerfile` po `wa create`.
- Reguły ESLint zamiast testów: ESLint sprawdza pojedynczy plik źródłowy, a te niezmienniki łączą kilka plików różnych typów (Markdown z `package.json`, `.nvmrc` z `Dockerfile` i YAML, pary plików JSON). Importy w plikach klienckich dałoby się sprawdzić regułą `no-restricted-imports`, ale bez warunku na dyrektywę `"use client"`.

**Konsekwencje.**

- Projekt, który zmieni plik rdzenia w niezgodny sposób (wydłuży `AGENTS.md` ponad budżet, usunie skrypt z `package.json` wspomniany w `CLAUDE.md`, podbije Node tylko w `Dockerfile`), dostaje czerwony `npm test`. Poprawia plik albo test w swoim repo, a poprawkę ogólną zgłasza do kitu.
- Moduł kitu z tłumaczeniami musi mieć plik dla każdego języka projektu, a zmienna modułu z `.env.example` musi przejść schemat `env.ts` modułu.
- Testy są heurystyczne: nie widzą importu względnego ani pośredniego modułu serwerowego w pliku klienckim, gołej nazwy pliku z rozszerzeniem spoza listy ani komendy `npm test` czy `npm start`.

**Jak egzekwowana.**

- Testy w `npm run verify`: `src/__tests__/architecture/*.test.ts`, na przykład „AGENTS.md o bajt za duży zgłasza rozmiar i limit”, „różny kształt to naruszenie w obie strony” i „import typu jest ignorowany”.
- Bramka mutacji: `scripts/lib/architecture/` jest we wzorcach `mutate` w `stryker.config.json`, ale nie w `critical` w `mutation-gate.json`, bo to nie logika bezpieczeństwa.

**Źródło.** [Spec harnessu z Ragena](superpowers/specs/2026-11-21-harness-from-ragen-design.md) §1–§3 i §6; [plan](superpowers/plans/2026-11-21-harness-from-ragen.md), Task 1; testy Ragena `tests/architecture/` (w tym `agent-instructions-fit-the-budget.test.ts`, `documented-commands-exist.test.ts`, `i18n-keys-exist-in-every-locale.test.ts`, `the-node-floor-is-one-number.test.ts`, `client-bundles-stay-browser-safe.test.ts`) w opisie specu.

<a id="d51"></a>

## D51 · Guard organizacji w runtime rzuca błąd; `Member` i `Invitation` poza guardem; `withoutTenantScope` jako jedyne wyjście

**Status:** obowiązuje · **Data:** 2026-11-21 · **Kto zdecydował:** Patryk z agentem (research harnessu Ragena: spec harnessu z Ragena, §4); wykonawca planu (Task 2: lista modeli z `Prisma.ModelName` i `Prisma.<Model>ScalarFieldEnum`, `guardTenantQuery` z wstrzykiwanym `isScoped` dla testów rdzenia bez modeli modułów, filtr `{ id, organizationId }` przy zapisie `lastUsedAt` zamiast zwolnienia)

**Kontekst.** [D07](#d07) wymaga jawnego filtra `organizationId` w każdym zapytaniu domenowym, ale brak filtra nie dawał błędu, tylko wyciek danych. `src/__tests__/server-entrypoints-guard.test.ts` jest składniowy i sprawdza guard sesji, a nie filtr. Lukę łapał tylko test izolacji, który autor dopisał sam. Ragen ma rozszerzenie Prismy, które ostrzega przy zapytaniu bez filtra organizacji (`docs/tenant-scope-guard.md`, ADR-23). Zaczął od ostrzeżeń, bo miał ok. 200 miejsc bez audytu. Kit ma kilkanaście zapytań na modelach domenowych, a wszystkie poza dwoma filtrowały po `organizationId`.

**Decyzja.**

- `src/shared/lib/prisma.ts` eksportuje klienta z rozszerzeniem `tenantScopeExtension` (`query.$allModels.$allOperations`, `src/shared/lib/tenant-scope/`). Ten sam klient trafia do `prismaAdapter` better-auth.
- Guard obejmuje każdy model ze skalarnym polem `organizationId` z wyjątkiem `Member` i `Invitation`. Listę liczy `findTenantScopedModels` z wygenerowanego klienta (`Prisma.ModelName` i `Prisma.<Model>ScalarFieldEnum`), a nie z ręcznej mapy, bo moduł nie edytuje plików rdzenia ([D03](#d03)). Nowy model modułu albo funkcji projektu z `organizationId` jest objęty bez zmiany rdzenia.
- Zapytanie na modelu objętym guardem bez filtra organizacji rzuca `TenantScopeError` (`name = "TenantScopeError"`, pola `model` i `operation`) i nie trafia do bazy, w dev, testach i na produkcji. Co liczy się jako filtr, opisuje [03-dane-i-organizacje.md](03-dane-i-organizacje.md#guard-w-runtime) (za Ragenem: przypięta wartość, selektor złożony, element `AND`, `OR` z filtrem w każdej gałęzi; `NOT`, filtr relacji, `{ not }`, `{ notIn }` i `{ in: [] }` się nie liczą).
- `withoutTenantScope(reason, fn)` uruchamia `fn` ze zwolnieniem w `AsyncLocalStorage`. `reason` to niepusty napis. Każde zapytanie bez filtra wewnątrz `fn` zapisuje `logger.debug` z modelem, operacją i powodem. Zwolnienie działa w zagnieżdżeniu i kończy się z `fn`, także po błędzie.
- Zwolnienie mają dwa miejsca, w których organizacja jest nieznana przed odczytem: `authenticateApiKey` (odczyt po `hashedKey`) i `readUploadForDownload` (odczyt po `id` przed sprawdzeniem widoczności).

**Odrzucone alternatywy.**

- Ostrzeżenie zamiast błędu, jak w Ragenie: kit startuje ze stanu czystego, a błąd zatrzymuje pomyłkę w pierwszym teście integracyjnym albo e2e. Ostrzeżenie na produkcji bez `OTEL_EXPORTER_OTLP_ENDPOINT` nie trafia nigdzie ([D15](#d15)).
- Automatyczne doklejanie `organizationId` z kontekstu: rozszerzenie musiałoby znać sesję, a zapytania better-auth, hooków i tras z kluczem API nie mają `getOrgContext()`. Odrzucone już w [D07](#d07).
- `Member` i `Invitation` w guardzie: adapter better-auth czyta je po `id`, `userId` i e-mailu, a rdzeń czyta członkostwa jednego konta we wszystkich organizacjach. Zwolnienie byłoby potrzebne w większości zapytań na tych tabelach.
- Ręczna mapa modeli objętych guardem w rdzeniu: każdy moduł z nowym modelem musiałby edytować plik rdzenia.
- Osobny klient bez rozszerzenia dla testów: testy integracyjne sprawdzają kod produkcyjny na tym samym kliencie; asercje stanu bazy niezależne od organizacji używają `withoutTenantScope("test assertion", …)`.

**Konsekwencje.**

- Zapytanie bez filtra na `ApiKey`, `AuditLog`, `Upload` albo modelu funkcji projektu kończy się wyjątkiem. Komenda z `handleCommandError` zwraca wtedy komunikat domyślny i zapisuje `logger.error`.
- Raw SQL, zapytania przez relację zagnieżdżoną (`include`, `select` relacji, zapis zagnieżdżony z modelu nadrzędnego), `Member` i `Invitation` zostają poza guardem ([znane-ograniczenia.md](znane-ograniczenia.md#guard-organizacji)).
- Guard nie sprawdza, czy filtr wskazuje aktywną organizację. Test izolacji z dwiema organizacjami zostaje obowiązkowy ([D07](#d07)).
- Rdzeń nie ma modelu objętego guardem, więc testy rdzenia sprawdzają `guardTenantQuery` z wstrzykniętym `isScoped`, a testy `isTenantScoped("ApiKey" | "AuditLog" | "Upload")` i test na prawdziwej bazie leżą w katalogach modułów.
- Moduły `api-keys` i `uploads` zmieniły kod (zwolnienie i filtr przy `lastUsedAt`), a `audit-logs` tylko testy integracyjne, które czytały tabelę bez filtra.

**Jak egzekwowana.**

- Guard w kodzie: `guardTenantQuery` w `src/shared/lib/tenant-scope/tenant-scope-extension.ts` przy każdym zapytaniu przez delegata modelu.
- Testy w `npm run verify`: `src/shared/lib/tenant-scope/__tests__/tenant-scope.test.ts` (reguły filtra na literałach i `test.prop`, na przykład „OR z gałęzią bez organizacji na końcu” i „{ in: [] } nie przypina organizacji”), `tenant-scope-extension.test.ts` (odrzucenie bez wywołania zapytania, zwolnienie, sprzątanie po błędzie) i `src/features/<moduł>/services/__tests__/tenant-scope-model.test.ts`.
- Testy integracyjne (job `integration` w `.github/workflows/ci.yml`): `src/features/api-keys/services/__tests__/tenant-scope-guard.integration.test.ts` i `src/shared/lib/tenant-scope/__tests__/sign-in.integration.test.ts` (logowanie przez better-auth na kliencie z guardem).
- Bramka mutacji: `src/shared/lib/tenant-scope/` w `critical` ([D26](#d26)).
- Zwolnienie tylko z uzasadnionym powodem: `reason` niepusty sprawdza kod; to, czy powód jest uzasadniony, tylko recenzja.

**Źródło.** [Spec harnessu z Ragena](superpowers/specs/2026-11-21-harness-from-ragen-design.md) §4; [plan](superpowers/plans/2026-11-21-harness-from-ragen.md), Task 2; `ragen-app/docs/tenant-scope-guard.md`, ADR-23 i `packages/platform-contracts/src/tenant-scope/` Ragena w opisie specu.

<a id="d52"></a>

## D52 · Skille projektowe, Task Router i allowlista `permissions` jako pliki rdzenia

**Status:** obowiązuje · **Data:** 2026-11-21 · **Kto zdecydował:** Patryk (zakres i odrzucenie pluginu: [spec harnessu z Ragena](superpowers/specs/2026-11-21-harness-from-ragen-design.md) §5 i [plan](superpowers/plans/2026-11-21-harness-from-ragen.md), Task 3); wykonawca planu (lista reguł `permissions` dopasowana do składni Claude Code)

**Kontekst.** Instrukcje agenta w kicie to `CLAUDE.md` i `AGENTS.md`. Odsyłacze do dokumentacji były rozproszone po sekcjach `AGENTS.md`, a wiedza o powtarzalnych zadaniach (recenzja zmiany, podbicie zależności, nowa funkcja) była tylko w długich dokumentach repozytorium kitu, których projekt nie ma. Każda bramka i każda komenda tylko do odczytu wymagała zgody użytkownika, więc agent przerywał pracę na `npm run verify` czy `git diff`. Ragen (`ragen-app`) rozwiązuje to skillami w `.claude/skills/`, sekcją „Task Router” w `AGENTS.md` i listą `permissions.allow` w `.claude/settings.json`; spec przenosi te trzy elementy do kitu.

**Decyzja.**

- Trzy skille w `.claude/skills/<nazwa>/SKILL.md`: `wa-code-review` (niezmienniki, których `npm run verify` nie sprawdzi), `wa-upgrade-dependency` (podbicie zależności z e2e jako bramką, osobno better-auth, Prisma i Next.js), `wa-new-module` (funkcja projektu w `projectModules` albo moduł kitu). Nagłówek ma `name` i `description` z wyzwalaczami po polsku i angielsku, treść jest po polsku i zawiera tylko fakty sprawdzone w repozytorium.
- Skille należą do rdzenia (`.claude/skills/**` w `files` w `kit/modules/core.json`), więc trafiają do projektu przez `wa create`. Odsyłacze do `docs/` w skillach wskazują repozytorium `webamigos/wa-kit`, bo `docs/**` jest w `kitOnly`.
- `AGENTS.md` ma sekcję „Task Router”: tabela „zadanie → gdzie patrzeć”, w której każda komórka wskazuje plik repozytorium, dokument kitu albo skill. Wiersze modułów kitu wskazują tylko dokumentację, bo projekt bez modułu nie ma jego plików.
- `.claude/settings.json` dostaje `permissions.allow` z dokładnymi regułami dla bramek i komend, które nie piszą do żadnej bazy: `npm run verify`, `lint`, `typecheck`, `npm test`, `npm run test`, `test:hooks`, `test:mutation:gate`, `npm run wa -- generate`, `npx tsc --noEmit`, `git status`, `git diff`, `git log`, `git show` ([Uprawnienia](11-praca-z-kitem.md#uprawnienia)). Reguły z `*` dla komend testowych są wykluczone, bo przepuszczają konfigurację integracyjną, która czyści bazę `_test` (review CodeRabbita w #25). Sekcja `hooks` się nie zmienia.
- Plan wymieniał regułę `Bash(npm run test:*)`. Według dokumentacji Claude Code końcowe `:*` znaczy to samo co ` *`, więc reguła nie obejmuje skryptów `test:<nazwa>`. Skrypty, które piszą do bazy (`test:integration`, `test:mutation:integration`, `test:e2e`) albo przyjmują dowolną konfigurację Strykera (`test:mutation`, `test:mutation:task`), zostają poza listą; `test:watch` też, bo proces się nie kończy.

**Odrzucone alternatywy.**

- Plugin Claude Code wspólny dla wszystkich projektów Web Amigos: miałby wersjonowanie niezależne od kitu, więc skill mógłby opisywać inną wersję rdzenia niż ta w projekcie, a `wa kit sync` i manifesty kitu go nie obejmują (plan, Task 3).
- Reguła `Bash(npm run test:*)` z planu: nie obejmuje skryptów `test:<nazwa>` (decyzja wyżej).

**Konsekwencje.**

- Skill jest instrukcją jak `AGENTS.md`: zmiana reguły w kodzie to także zmiana skilla, który ją cytuje. Zmiana skilla w projekcie, która przyda się innym, wraca do kitu pull requestem.
- Nowy wiersz Task Routera zastępuje odsyłacz w innej sekcji `AGENTS.md`, a nie go dubluje, bo Codex po cichu ucina instrukcje powyżej 32 KiB.
- Agent uruchamia bramki i odczyt repozytorium bez pytania. Komendy, które zmieniają bazę poza bazą testową, instalują pakiety, usuwają pliki albo pushują, dalej wymagają zgody. Własne reguły projekt dopisuje w `.claude/settings.local.json`.
- Skille działają jako skille tylko w Claude Code. Inne narzędzia czytają je jako zwykłe pliki Markdown przez odsyłacze w routerze.

**Jak egzekwowana.**

- Test `npm run test:hooks` w `npm run verify` sprawdza hooki z `.claude/hooks/`, ale nie treść `permissions`.
- Istnienie komend `npm run` i ścieżek cytowanych w `AGENTS.md` i `.claude/**/*.md` oraz rozmiar `AGENTS.md` pilnują testy architektury z [D50](#d50).
- Zgodność treści skilli z kodem: tylko konwencja.

**Źródło.** [Spec harnessu z Ragena](superpowers/specs/2026-11-21-harness-from-ragen-design.md) §5 i §6; [plan](superpowers/plans/2026-11-21-harness-from-ragen.md), Task 3; `ragen-app/.claude/skills/`, sekcja „Task Router” w `ragen-app/AGENTS.md` i `ragen-app/.claude/settings.json`; [dokumentacja uprawnień Claude Code](https://code.claude.com/docs/en/permissions).
