# Rejestr decyzji

Ten plik wyjaśnia, dlaczego wa-kit jest zbudowany tak, a nie inaczej. Każdy wpis mówi, jaki problem rozwiązuje decyzja, co wybrano, co odrzucono, co z tego wynika przy pisaniu kodu i co pilnuje, żeby decyzja była przestrzegana. Jak dana część działa krok po kroku, opisują pliki `01`–`11` (spis w [README.md](README.md)).

Zweryfikowano z kodem: 4a6ffcb, 2026-10-27

Rejestr obejmuje tylko decyzje, które obowiązują w kodzie z tego commitu. Funkcje zaplanowane, ale niezrobione (na przykład tworzenie projektu z kitu jedną komendą), pojawiają się wyłącznie jako kontekst albo konsekwencja.

## Jak czytać wpis

Wpis zaczyna się kotwicą i nagłówkiem `DNN · tytuł`, a pod nim są te pola:

| Pole | Co zawiera |
| --- | --- |
| Status | `obowiązuje` albo `zastąpiona przez Dxx`. |
| Data | Dzień, w którym decyzję zapisano albo wdrożono. |
| Kto zdecydował | Jakub, autor design doc, autor planu 1 albo wykonawca planu 1 (wyjaśnienie pod tabelą). „Nie zapisano”, gdy źródła tego nie podają. |
| Kontekst | Problem, który decyzja rozwiązuje, opisany tak, żeby dało się go zrozumieć bez historii projektu. |
| Decyzja | Co wybrano i jak to wygląda w kodzie. |
| Odrzucone alternatywy | Tylko te, które wymieniają źródła. „Nie zapisano”, gdy źródło żadnej nie podaje. |
| Konsekwencje | Co z decyzji wynika dla osoby, która pisze kod. |
| Jak egzekwowana | Guard, test, workflow CI albo hook, który zatrzyma naruszenie, ze ścieżką. „Tylko konwencja”, gdy pilnuje jej wyłącznie przegląd kodu. |
| Źródło | Dokument albo commit, z którego pochodzi decyzja. |

„Autor design doc” to agent, który spisał główny dokument projektowy w sesji z Jakubem. Decyzje z sekcji „Moje decyzje” podjął sam (poza punktem o pierwszym adminie, ustalonym z Jakubem: [D09](#d09)), a Jakub zatwierdził je razem z całym dokumentem 2026-10-26 (status design doc; handoff z 12:09 pisze o decyzji w sprawie organizacji: „podjąłem ją ja, ale zaakceptował cały spec”). „Autor planu 1” to agent, który napisał plan 1 na podstawie design doc; źródła nie mówią, czy Jakub zatwierdzał plan przed wykonaniem (handoff z 12:09 mówi tylko, że wybrał sposób jego wykonania). „Wykonawca planu 1” to agent, który prowadził wykonanie planu 1 i zapisał swoje decyzje jako rulingi w handoffie planu 1. Handoff nie mówi, czy Jakub zatwierdzał rulingi pojedynczo.

Sposoby egzekwowania różnią się siłą:

| Sposób | Kiedy zatrzymuje naruszenie |
| --- | --- |
| Guard w kodzie | Przy każdym żądaniu, także na produkcji. |
| Test w `npm run verify` | Lokalnie przed oddaniem pracy i w CI (job `verify` w `.github/workflows/ci.yml`). |
| Osobny workflow CI | Przy pull requeście i pushu do `main` (`.github/workflows/e2e.yml`, job `integration` w `ci.yml`), nie przy `npm run verify`. `.github/workflows/mutation.yml` tylko po ręcznym uruchomieniu. |
| Hook w `.claude/hooks/` | Tylko w sesji Claude Code, przy narzędziach `Edit` i `Write`. |
| Tylko konwencja | Wyłącznie wtedy, gdy zauważy to recenzent. |

## Statusy i numeracja

- `obowiązuje`: decyzja jest w kodzie.
- `zastąpiona przez Dxx`: decyzja przestała obowiązywać. Wpis zostaje w pliku z nowym statusem, a decyzja, która go zastąpiła, ma własny numer i mówi, co zmieniła.
- Numery `D01`, `D02`… są stałe i nie są używane ponownie. Inne pliki linkują do wpisu przez kotwicę, na przykład `[D07](decyzje.md#d07)`, więc zmiana numeru zepsułaby linki.
- Numer decyzji, która nie obowiązuje w kodzie, jest pomijany bez przenumerowania pozostałych. W wersji zweryfikowanej z `4a6ffcb` nie ma luk: obowiązują wszystkie decyzje od D01 do D27.
- Nową decyzję dopisuje się na końcu z następnym wolnym numerem, kotwicą `<a id="dNN"></a>` i wszystkimi polami.
- Jeden plik wystarcza, dopóki decyzje dopisuje jedna gałąź naraz. Gdy zaczną to robić równolegle różne gałęzie (na przykład przy planie 2), dwie mogą dopisać tę samą D28; wtedy warto rozważyć osobne pliki `docs/decyzje/NNNN-*.md`.

## Pojęcia

Pełny słownik jest w [README.md](README.md). W rejestrze najczęściej pojawiają się:

- **Kit** (wa-kit): to repozytorium. Zawiera działającą aplikację, z której kopiuje się kod do projektów klientów.
- **Rdzeń**: część kitu, którą ma każdy projekt: logowanie, organizacje, użytkownicy, konto i dashboard.
- **Moduł** (moduł kitu): wpis w `.wa/kit.json` z manifestem plików. Rdzeń to moduł `core`; moduły opcjonalne (na przykład klucze API) są zaplanowane w design doc. Moduł może obejmować kilka feature.
- **Feature**: katalog `src/features/<x>/` z kodem jednej funkcji (komponenty, komendy, query, tłumaczenia).
- **Definicja modułu**: plik `src/features/<x>/module.ts` z `defineModule(...)` (typ `ModuleDef`). Opisuje feature dla nawigacji i guardów; najważniejsze pole to `key`, na przykład `users`.
- **Rejestr modułów**: tablice w `src/modules.generated.ts` i `src/modules.client.generated.ts` (na przykład `clientModules`), z których nawigacja, guardy, tłumaczenia i walidacja env dowiadują się o feature.
- **Plik generowany, region `wa:*`, szew**: plik albo fragment pliku między liniami z `wa:<nazwa>:start` i `wa:<nazwa>:end`, który przepisuje generator kitu (`npm run build -w @wa-kit/cli && npm run wa -- generate`). Szew to miejsce, w którym rdzeń dowiaduje się o modułach: plik generowany albo region.
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
- **Handoff, ruling**: handoff to notatka przekazania pracy między sesjami. [Handoff planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md) zawiera rulingi R1–R22, czyli decyzje podjęte w trakcie wykonania planu 1. Pozostałe handoffy (z 2026-10-27, godz. 12:09 i 17:05) leżą lokalnie, poza repozytorium.
- **Spec superadmina**: projekt roli `superadmin` z decyzjami Jakuba 1–4. Plik leży lokalnie w `.superpowers/`, poza repozytorium. Jego treść, sprawdzoną z kodem, opisują wpisy D19–D22 i [04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md).
- **Decyzje Jakuba do macierzy dostępu**: odpowiedzi na trzy pytania o dostęp (zapisane w handoffie z 17:05). Śledzonym zapisem są nazwy testów w `src/shared/lib/auth/__tests__/access-matrix.test.ts`, które cytują je jako „decyzja 1”, „decyzja 2” i „decyzja 3”.
- **Research i audyt testów**: dwie notatki z 2026-10-27, poza historią git. Research dotyczy testów pisanych przez agentów AI, a audyt sprawdzał testy planu 1 mutacjami i testami właściwości. Wnioski streszczają D24–D26 i [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#dlaczego).

## Spis decyzji

| ID | Decyzja | Obszar |
| --- | --- | --- |
| [D01](#d01) | Kod kitu trafia do projektu jako zwykły kod | Model kitu |
| [D02](#d02) | Aplikacja referencyjna w katalogu głównym; własność plików w `.wa/kit.json` | Model kitu |
| [D03](#d03) | Moduł nie edytuje rdzenia; łączą je pliki generowane i regiony | Model kitu |
| [D04](#d04) | Pliki generowane są commitowane i bajtowo równe wyjściu generatora | Model kitu |
| [D05](#d05) | Definicja modułu to czyste dane bezpieczne dla klienta | Model kitu |
| [D06](#d06) | Organizacje w rdzeniu, jeden poziom; `MULTI_ORG` nie zmienia modelu danych | Dane i organizacje |
| [D07](#d07) | Jawny filtr `organizationId` z `getOrgContext()` | Dane i organizacje |
| [D08](#d08) | Dwa poziomy ról | Auth i role |
| [D09](#d09) | Pierwszy admin przez `admin:create` | Auth i role |
| [D10](#d10) | Rejestracja przez bramkę serwerową | Auth i role |
| [D11](#d11) | Strony chroni `requireModuleAccess` | Auth i role |
| [D12](#d12) | Strona `no-organization` poza guardem `(app)` | Dane i organizacje |
| [D13](#d13) | Kit nie commituje migracji, projekt je commituje | Dane i organizacje |
| [D14](#d14) | Schemat Prisma w wielu plikach | Dane i organizacje |
| [D15](#d15) | Logger na OpenTelemetry | Konfiguracja i usługi |
| [D16](#d16) | `APP_URL` jako publiczny adres | Konfiguracja i usługi |
| [D17](#d17) | Ścisła walidacja zmiennych środowiskowych | Konfiguracja i usługi |
| [D18](#d18) | Maile: SMTP, Resend, log | Konfiguracja i usługi |
| [D19](#d19) | `superadmin` jako rola serwisowa | Superadmin |
| [D20](#d20) | Impersonacja zależna od roli | Superadmin |
| [D21](#d21) | Superadmin wchodzi do dowolnej organizacji, zawsze jednej | Superadmin |
| [D22](#d22) | Tryb serwisowy: dialog i potwierdzenie w komendzie | Superadmin |
| [D23](#d23) | Bez komentarzy w kodzie | Jakość i proces |
| [D24](#d24) | Test architektury punktów wejścia serwera | Jakość i proces |
| [D25](#d25) | Testy adwersarialne | Jakość i proces |
| [D26](#d26) | Mutation testing i bramka plików krytycznych | Jakość i proces |
| [D27](#d27) | next-intl i namespace tłumaczeń feature | i18n |

<a id="d01"></a>

## D01 · Kod kitu trafia do projektu jako zwykły kod, bez paczek npm i punktów rozszerzeń

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (sekcja „Moje decyzje”); Jakub potwierdził model jako swoją decyzję (handoff z 2026-10-27 12:09)

**Kontekst.** Każdy projekt Web Amigos zaczynał się od ręcznego przenoszenia kodu z poprzednich repozytoriów: logowania, użytkowników, maili, tłumaczeń, CI. Analiza 20 repozytoriów pokazała niemal identyczny stos i te same funkcje, a w 14 z nich te same modele kont i sesji. Kit ma dostarczać ten kod raz, sprawdzony. Trzeba było zdecydować, w jakiej postaci kod trafia do projektu: jako zależność, którą projekt instaluje i konfiguruje, czy jako zwykły kod w repozytorium projektu.

**Decyzja.** Kod rdzenia i modułów jest kopiowany do projektu i staje się jego zwykłym kodem, który projekt może dowolnie zmieniać. `.wa/kit.json` zapisuje, skąd kod pochodzi (wersja kitu, moduły). Moduł to zestaw plików w aplikacji, a nie paczka z punktami rozszerzeń. Rejestr modułów to statyczne importy w plikach generowanych ([D03](#d03), [D04](#d04)), a nie ładowanie w trakcie działania aplikacji.

**Odrzucone alternatywy.**

- Moduły jako paczki npm. Wymagałyby wersjonowania i publikacji przy każdej zmianie.
- Kit jako framework z wstrzykiwaniem zależności, ładowaniem pluginów w trakcie działania i systemem nadpisań, jak w OpenMercato (starterze, z którego design doc wziął sam pomysł).
- Składanie projektu przez flagi w trakcie działania (`FEATURE_X=true`). W projekcie ma być tylko kod wybranych modułów.

**Konsekwencje.**

- Zmiana w skopiowanym kodzie nie wymaga forka ani publikacji paczki. Poprawkę, która przyda się innym projektom, wysyła się jako pull request do `webamigos/wa-kit` (reguła „Pochodzenie kodu” w [CLAUDE.md](../CLAUDE.md)). To proces, a nie automat.
- Flagi `MULTI_ORG`, `AUTH_PUBLIC_SIGNUP` i `ADMIN_IMPERSONATION` zmieniają działanie aplikacji, a nie to, z jakiego kodu się składa.
- CLI kitu ma w kodzie jedną komendę, `generate` (`packages/cli/src/bin.ts`). Kopiowania kitu do nowego projektu i ściągania poprawek z kitu nie obsługuje żadne narzędzie z tego commitu. Co dokumentacja świadomie pomija, opisuje [README.md](README.md).

**Jak egzekwowana.** Tylko konwencja. `package.json` aplikacji nie ma w zależnościach żadnej paczki kitu (`@wa-kit/cli` to workspace w `packages/cli`, używany przez skrypt `npm run wa`), ale nic nie blokuje dodania takiej zależności.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §1, §2 (anty-cele) i §9; [CLAUDE.md](../CLAUDE.md), „Pochodzenie kodu”.

<a id="d02"></a>

## D02 · Aplikacja referencyjna w katalogu głównym repozytorium; własność plików w `.wa/kit.json`

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§9); położenie w katalogu głównym zmieniono przy planowaniu planu 1 (adnotacja w design doc §6)

**Kontekst.** Kit trzeba rozwijać i testować jak zwykłą aplikację, a jednocześnie przy tworzeniu projektu musi się dać rozłożyć na rdzeń i moduły. Do tego potrzebna jest informacja, który plik należy do którego modułu.

**Decyzja.** Kit zawiera jedną działającą aplikację referencyjną ze wszystkimi modułami. Leży w katalogu głównym repozytorium, z takim samym układem katalogów jak projekt klienta. Każdy moduł ma manifest z listą swoich plików (`files`, wzorce glob). Projekt powstaje przez skopiowanie aplikacji bez plików niewybranych modułów i przegenerowanie plików łączących ([D03](#d03)). Narzędzia do takiego kopiowania nie ma, więc robi się to ręcznie ([D01](#d01)).

Manifest leży w `.wa/kit.json` jako `modules.core.manifest` (schemat `kitStateSchema` w `packages/cli/src/manifest/schema.ts`). Jest jeden moduł, `core`. Pole `modules.core.files`, w którym design doc §4.4 przewiduje hashe skopiowanych plików do aktualizacji, jest puste.

**Odrzucone alternatywy.**

- Osobne katalogi modułów zamiast jednej aplikacji z manifestami własności (design doc §9).
- Aplikacja w podkatalogu `app/` (pierwotny design doc §6). Zagnieżdżone workspaces npm (`apps/worker` w `app/`) nie działają, a ten sam układ co w projekcie upraszcza kopiowanie i aktualizacje.

**Konsekwencje.**

- Pliki tylko dla kitu (`packages/cli`, `docs/`) leżą obok aplikacji i nie należą do żadnego manifestu.
- Kod czyta z `files` tylko wzorce zaczynające się od `src/features/<x>/`: na ich podstawie `wa generate` wykrywa feature (`FEATURE_GLOB` w `packages/cli/src/generate/index.ts`). Pozostałe wzorce (`src/shared/**`, `src/app/**` i inne) są tylko zapisem własności.
- Każdy feature musi mieć osobny wzorzec: wzorzec z nawiasami, na przykład `src/features/{auth,users}/**`, generator pomija bez błędu (ruling R14). Wzorzec katalogu, którego nie ma na dysku, też jest pomijany, więc manifest może wymieniać feature z wyprzedzeniem (ruling R5).
- Feature, którego nie obejmuje żaden wzorzec w `.wa/kit.json`, nie trafia do rejestru modułów: nie ma nawigacji, `requireModuleAccess` nie zna jego klucza, a jego tłumaczenia się nie ładują. Dotyczy to także funkcji projektu klienta; skutki i obejście opisuje [znane-ograniczenia.md](znane-ograniczenia.md#modul-projektu).
- Manifest `core` nie wymienia wszystkich plików rdzenia (brakuje na przykład `scripts/**`, `e2e/**` i `src/proxy.ts`; lista w checkliście handoffu planu 1). Design doc §4.2 i §7 zapowiadają kontrolę w CI, że każdy plik ma dokładnie jednego właściciela; w kodzie takiej kontroli nie ma.

**Jak egzekwowana.**

- `readKitState` w `packages/cli/src/manifest/kit-state.ts` sprawdza `.wa/kit.json` schematem Zod i przerywa `wa generate` przy błędnym pliku (testy: `packages/cli/src/manifest/__tests__/kit-state.test.ts`). CI uruchamia generator w każdym przebiegu (`.github/workflows/ci.yml`, krok „Regenerate wa files”).
- Kompletność własności (każdy plik należy do dokładnie jednego modułu): tylko konwencja.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §4.1, §4.2, §6, §7 i §9; [plan 1](superpowers/plans/2026-10-26-wa-kit-plan-1-core.md), sekcja „Architecture”; rulingi R5 i R14 oraz checklista dla planu 2 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md).

<a id="d03"></a>

## D03 · Moduł nie edytuje rdzenia; rdzeń widzi moduły przez pliki generowane i regiony `wa:*`

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§9 „Moje decyzje”)

**Kontekst.** Moduły mają się dać włączyć przy tworzeniu projektu i dodać później bez ręcznego wpinania w schemat bazy, nawigację, tłumaczenia i zmienne środowiskowe (design doc §2). Gdyby moduł zmieniał pliki rdzenia, każde dodanie, usunięcie albo aktualizacja modułu oznaczałaby scalanie cudzych zmian w tych samych plikach.

**Decyzja.** Moduł tylko dodaje pliki. Rdzeń „wie” o modułach wyłącznie przez szwy: pliki generowane i regiony między markerami, które przepisuje `wa generate`. Listę szwów podaje `AGENTS.md` („Moduły i pliki generowane”); tabela dodaje, co do nich trafia i skąd generator to bierze:

| Szew | Co trafia do środka | Skąd |
| --- | --- | --- |
| `src/modules.generated.ts` | `modules`, `moduleEnvSchemas`, `authPlugins`, `moduleMessages` | `module.ts`, `env.ts`, `auth.ts`, `i18n/<locale>.json` każdego feature |
| `src/modules.client.generated.ts` | `clientModules`, `authClientPlugins` | `module.ts`, `auth-client.ts` |
| region `wa:relations` w `prisma/schema/auth.prisma` i `prisma/schema/organizations.prisma` | pola relacji zwrotnych w modelach `User` i `Organization` | `schemaRelations` manifestów |
| region `wa:modules` w `.env.example` | zmienne modułów innych niż `core` | pole `env` manifestu |
| region `wa:services` w `docker-compose.yml` | usługi Dockera modułów | plik wskazany w polu `compose` manifestu |

**Odrzucone alternatywy.**

- Ręczne wpinanie modułu w pliki rdzenia (cel z design doc §2 mówi wprost, że ma go nie być).
- Punkty rozszerzeń w trakcie działania aplikacji ([D01](#d01)).

**Konsekwencje.**

- Nowy feature to nowe pliki, wzorzec w `.wa/kit.json` ([D02](#d02)) i przebieg `npm run build -w @wa-kit/cli && npm run wa -- generate`.
- Uszkodzony marker (brak końca, podwójny początek) albo marker w treści regionu przerywa generator błędem z nazwą pliku i markera, a żaden plik nie zostaje zmieniony (`replaceRegion` w `packages/cli/src/generate/regions.ts`).
- Design doc §4.3 wymienia też szwy, których kod nie ma albo ma inaczej (osobne pliki pluginów better-auth, `trackAudit`, generowane `workspaces`). Obowiązuje tabela powyżej, zgodna z `AGENTS.md`.

**Jak egzekwowana.**

- Ręczna zmiana w pliku generowanym albo w regionie: job `verify` w `.github/workflows/ci.yml` ([D04](#d04)).
- Poprawność regionów: testy `packages/cli/src/generate/__tests__/regions.test.ts` i `generate.test.ts` („uszkodzony marker: błąd i żaden plik nie zmieniony”), uruchamiane w `npm run verify`.
- To, że moduł nie zmienia plików rdzenia poza regionami: tylko konwencja.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §2, §4.1, §4.3 i §9; [AGENTS.md](../AGENTS.md), „Moduły i pliki generowane”; [CLAUDE.md](../CLAUDE.md), „Pliki generowane”.

<a id="d04"></a>

## D04 · Pliki generowane są commitowane, bajtowo równe wyjściu `wa generate` i wyłączone z Prettiera i ESLint

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (commitowanie, §4.3); wykonawca planu 1 (ruling R17: równość bajtowa i wyłączenie z formatowania; ruling R12: bez nagłówka w regionach)

**Kontekst.** Aplikacja importuje rejestr modułów w wielu miejscach, na przykład `src/shared/lib/env.ts` importuje `@/modules.generated`. Bez tych plików nie działa `npm run build`, `npm run typecheck` ani `npm test`. CLI trzeba zbudować osobno (`packages/cli/dist` jest w `.gitignore`), więc projekt nie może zależeć od tego, że ktoś je zbudował. Z drugiej strony plik zmieniony ręcznie albo przez formatter rozjeżdża się z tym, co zapisze generator.

**Decyzja.** `src/modules.generated.ts`, `src/modules.client.generated.ts` i regiony `wa:*` są commitowane. Ich treść ma być bajt w bajt taka, jaką zapisuje `wa generate`. Oba pliki TypeScript są wpisane do `.prettierignore` i do `globalIgnores` w `eslint.config.mjs`, więc `lint-staged` (`.lintstagedrc.json`) ich nie przeformatuje. Zaczynają się linią nagłówka „generated by wa — nie edytuj”. Regiony nie mają nagłówka, bo oznaczają je same markery.

**Odrzucone alternatywy.** Nie zapisano. Design doc podaje powód commitowania: projekt działa bez CLI.

**Konsekwencje.**

- Po zmianie `.wa/kit.json` albo po dodaniu lub usunięciu `module.ts`, `env.ts`, `auth.ts`, `auth-client.ts` lub `i18n/<locale>.json` w feature uruchom `npm run build -w @wa-kit/cli && npm run wa -- generate` i zacommituj wynik razem ze zmianą. Generator wypisuje zmienione pliki albo `Bez zmian`.
- Nagłówek w plikach generowanych podaje inną komendę niż `AGENTS.md`. Używaj komendy z `AGENTS.md`, podanej wyżej.

**Jak egzekwowana.**

- Job `verify` w `.github/workflows/ci.yml` (push i pull request do `main`): kroki „Build wa CLI” (`npm run build -w @wa-kit/cli`), „Regenerate wa files” (`npm run wa -- generate`) i „Generated files are up to date” (`git diff --exit-code`). Każda różnica przerywa job przed `npm run verify`.
- `.prettierignore` i `globalIgnores` w `eslint.config.mjs`.
- Idempotencja generatora: `packages/cli/src/generate/__tests__/generate.test.ts` („drugie uruchomienie nic nie zmienia”).

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §4.3 (ostatni akapit); rulingi R12 i R17 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md).

<a id="d05"></a>

## D05 · Definicja modułu (`module.ts`) to czyste dane bezpieczne dla klienta, z polami `adminOnly`, `multiOrgRoles` i `public`

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** wykonawca planu 1 (rulingi R3, R9 i R13); Jakub (decyzje 2 i 3 do macierzy dostępu: przy `MULTI_ORG=false` stronę „Użytkownicy” widzi tylko admin globalny, a nawigacja pokazuje dokładnie to, do czego jest dostęp)

**Kontekst.** Definicję modułu z `module.ts` czytają dwa miejsca: guard stron na serwerze (`requireModuleAccess` przez `src/shared/lib/auth/permissions.ts`) i menu boczne w przeglądarce (`src/shared/components/app-sidebar.tsx` z `"use client"`, przez `src/shared/lib/modules/nav.ts`). Oba biorą ją z `clientModules`. Gdyby `module.ts` importował kod serwerowy, ten kod trafiłby do paczki przeglądarki. Gdyby rejestr klienta miał tylko część pól, menu i guard mogłyby inaczej rozstrzygać, kto ma dostęp.

**Decyzja.**

- `module.ts` eksportuje domyślnie `defineModule({...})` (ruling R3). `defineModule` w `src/shared/lib/modules/define-module.ts` zwraca przekazany obiekt bez zmian, a TypeScript sprawdza, że pasuje do typu `ModuleDef`. Pliki opcjonalne feature mają nazwane eksporty: `env.ts` → `envSchema`, `auth.ts` → `authPlugin`, `auth-client.ts` → `authClientPlugin`.
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
- `packages/cli/src/generate/__tests__/registry.test.ts` („klient eksportuje pełne obiekty modułów, nie projekcję pól”).
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
- Nie ma automatycznego filtrowania przez rozszerzenie Prisma.

**Odrzucone alternatywy.** Automatyczne filtrowanie przez rozszerzenie klienta Prisma (design doc §3.1). Źródło nie podaje powodu odrzucenia.

**Konsekwencje.**

- Autor każdego nowego zapytania musi sam dopisać filtr. Brak filtra nie powoduje błędu, tylko wyciek danych, więc każde nowe query i komenda dostaje test izolacji z dwiema organizacjami (`AGENTS.md`).
- Brak organizacji kończy się błędem albo przekierowaniem, nigdy pustym filtrem, który zwróciłby dane wszystkich organizacji.
- Konta (`User`) są globalne, a nie domenowe. Lista kont dla admina globalnego (`getUserAccountsQuery`) nie filtruje po organizacji.
- Szczegóły i przykład z istniejącego query: [03-dane-i-organizacje.md](03-dane-i-organizacje.md).

**Jak egzekwowana.**

- `src/__tests__/server-entrypoints-guard.test.ts` wymaga, żeby każda eksportowana funkcja w pliku `"use server"` i w `services/queries/` wywołała guard sesji przed Prismą ([D24](#d24)). Nie sprawdza, czy zapytanie filtruje po `organizationId`.
- `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts` sprawdza izolację na prawdziwym Postgresie (job `integration` w `.github/workflows/ci.yml`).
- Bramka mutacji obejmuje `src/features/organizations/services/` i `src/shared/lib/auth/` ([D26](#d26)).
- Obecność filtra w nowym zapytaniu: tylko konwencja i test izolacji, który dopisuje autor.
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

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§5 i §9); wykonawca planu 1 (rulingi R2 i R22)

**Kontekst.** Schemat bazy projektu zależy od wybranych modułów: każdy moduł dodaje własny plik schematu i relacje w regionach ([D03](#d03), [D14](#d14)). Źródła nie zapisują uzasadnienia wprost, ale z modelu składania wynika, że historia migracji kitu nie pasowałaby do projektu z innym zestawem modułów. Projekt na produkcji stosuje natomiast migracje komendą `npx prisma migrate deploy` (`preDeployCommand` w `railway.toml` albo w ustawieniach usługi, bo nowa usługa Railway nie czyta `railway.toml`, [10-wdrozenie.md](10-wdrozenie.md#config-as-code)), która bierze tylko migracje zapisane w repozytorium.

**Decyzja.** Kit nie dostarcza katalogu `prisma/migrations/` i ma go w `.gitignore`. Każda kopia repozytorium kitu tworzy własną migrację (`npx prisma migrate dev --name init`). Projekt klienta commituje swoje migracje.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- W projekcie skopiowanym z kitu trzeba przed pierwszym wdrożeniem usunąć linię `prisma/migrations/` z `.gitignore` (krok 3 sekcji „Railway” w [README.md repozytorium](../README.md)). Żadne narzędzie nie robi tego samo. Bez zacommitowanych migracji `prisma migrate deploy` nie ma czego zastosować, a baza produkcyjna nie dostaje schematu.
- Testy działają bez zacommitowanych migracji: schemat tworzą `src/test/integration/global-setup.ts` (`prisma db push`) i `e2e/global-setup.ts` (`prisma db push --force-reset` albo, gdy migracje istnieją, `prisma migrate reset --force`), a `.github/workflows/e2e.yml` tworzy migrację w trakcie przebiegu. Które komendy czyszczą bazę i jak są zabezpieczone, opisuje [08-testy.md](08-testy.md).
- Rozjazd historii migracji we własnej bazie: [03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#dryf-migracji).

**Jak egzekwowana.** W repozytorium kitu: wpis `prisma/migrations/` w `.gitignore`. W projekcie klienta: tylko konwencja (instrukcja w `README.md`).

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §5 i §9; rulingi R2 i R22 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md).

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
- `LOG_LEVEL` jest walidowana w `src/shared/lib/env.ts`, ale logger jej nie czyta i nie filtruje po poziomie ([znane-ograniczenia.md](znane-ograniczenia.md)).
- Mutation testing nie obejmuje `logger.ts` (wykluczenie w `stryker.config.json`, [D26](#d26)).

**Jak egzekwowana.** Tylko konwencja. Nie ma reguły lintera przeciw `console.log` ani testów loggera.

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

Problemy trafiają do jednego komunikatu `Nieprawidłowe zmienne środowiskowe: …`, w dwóch etapach: dwa warunki produkcyjne Zod sprawdza dopiero wtedy, gdy wszystkie pola przejdą podstawowe sprawdzenie, więc błąd produkcyjny może pojawić się dopiero po poprawieniu pozostałych ([07-i18n-mail-env.md](07-i18n-mail-env.md#walidacja-env)). Schemat działa przy pierwszym odczycie `env`, a nie przy imporcie, żeby sam import nie przerywał `next build` ani testów bez pełnego środowiska.

**Odrzucone alternatywy.** Wcześniejsza, łagodna walidacja: każda wartość flagi inna niż `true` dawała `false`, a `APP_URL` mógł być dowolnym niepustym napisem (stan sprzed `494224e`).

**Konsekwencje.**

- `npm run build` nie sprawdza zmiennych. Błąd pojawia się przy pierwszym odczycie: w terminalu serwera przy logowaniu albo od razu w `npm run admin:create`. Tabela komunikatów: [01-uruchomienie.md](01-uruchomienie.md#bledy-env).
- Schematy z plików `env.ts` feature (`moduleEnvSchemas` z rejestru) są łączone ze schematem rdzenia.

**Jak egzekwowana.** Guard w kodzie: `parseEnv` przy pierwszym odczycie `env`. Testy: `src/shared/lib/__tests__/env.test.ts` (flagi, sekret, adres, produkcja, `.env.example` jako `.env`).

**Źródło.** Commit `494224e`; ruling R18 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md); audyt testów planu 1 (znaleziska P1–P3).

<a id="d18"></a>

## D18 · Wysyłka maili: SMTP, potem Resend, potem tylko log

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

- Blokada działa, gdy orkiestrator (agent, który prowadzi zadanie i uruchamia subagentów) zapisze `implement` do `.superpowers/phase`. Plik jest w `.gitignore`, więc blokada obejmuje tylko kopię roboczą, w której go ustawiono.
- Hook nie łapie zapisu przez powłokę (na przykład heredoc w Bash).

**Jak egzekwowana.**

- Hook `.claude/hooks/protect-tests.mjs` (zarejestrowany w `.claude/settings.json`), testy `.claude/hooks/protect-tests.test.mjs` w `npm run test:hooks`.
- Definicje agentów w `.claude/agents/`.
- Rozdzielenie testera i implementera, literały i czerwony przebieg przed implementacją: tylko konwencja procesu, sprawdzana przez recenzenta i mierzona mutacjami ([D26](#d26)).

**Źródło.** Commity `0650fc4` i `e40c0e8`; [AGENTS.md](../AGENTS.md), „Testy, które próbują złamać kod”; [CLAUDE.md](../CLAUDE.md), „Testy”; research i audyt testów planu 1.

<a id="d26"></a>

## D26 · Mutation testing i bramka plików krytycznych

**Status:** obowiązuje · **Data:** 2026-10-27 · **Kto zdecydował:** nie zapisano; Stryker wprowadza commit `c9d7b25`, bramkę commit `54efbcf`; wpisy wyjątków zatwierdza człowiek (`AGENTS.md`)

**Kontekst.** Pokrycie kodu testami nie mówi, czy testy wykryją błąd. Mutation testing wstrzykuje do kodu drobne błędy (mutanty) i sprawdza, czy któryś test je zauważy. Autor testów nie może tego wyniku zinterpretować na swoją korzyść: mutant ginie albo nie. Audyt testów planu 1 (na commicie `50a4d9e`) dał wynik mutacji (mutation score) 71,75%, a najpoważniejsze luki, na przykład brak testu sprawdzenia roli admina w `getAdminUserOrNull`, wykrył tylko on. Po audycie dopisano testy zabijające wskazane mutanty (commit `bb935e6`), a przy wprowadzeniu Strykera do repozytorium wynik bazowy wynosił 77% (commit `c9d7b25`). Próg dla całego kodu przepuszcza jednak pojedyncze luki w plikach, w których każda luka jest błędem bezpieczeństwa.

**Decyzja.**

- Stryker (narzędzie do mutation testingu) mutuje logikę bez komponentów UI, w dwóch konfiguracjach: unitowej (`stryker.config.json`) i integracyjnej na prawdziwej bazie (`stryker.integration.config.json`). Recenzent zadania uruchamia go na plikach zadania (`npm run test:mutation:task -- <pliki>`).
- Bramka plików krytycznych (`npm run test:mutation:gate`, konfiguracja w `mutation-gate.json`): w plikach z prefiksami z listy `critical` (auth, organizacje, użytkownicy, sama bramka) każdy niezabity mutant, czyli ze statusem `Survived` albo `NoCoverage`, musi mieć wpis w `allowed` z uzasadnieniem. Wpis z pustym uzasadnieniem też zatrzymuje bramkę. Wpisy dopisuje człowiek; agent je tylko proponuje.
- Mutation testing nie jest częścią `npm run verify`. Działa w osobnym workflow, a przebieg unitowy pada poniżej `thresholds.break` (75%).
- Logikę bramki (statusy, łączenie raportów, dopasowanie wpisów, nieaktualne wpisy) zawiera `scripts/lib/mutation-gate.ts`. `AGENTS.md` („Testy, które próbują złamać kod”) podaje regułę łączenia raportów, nieaktualnych wpisów i zakaz obniżania progu, a [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#bramka) opisuje pracę z bramką.

**Odrzucone alternatywy.**

- Stryker w `npm run verify` (research: pełny przebieg to wielokrotność czasu `npm test`; zalecenie „dodać, ale nie do verify”).
- Start bez progu (`thresholds.break: null`) i późniejszy próg około 60 (propozycja researchu). Wybrano 75 przy wyniku bazowym 77.
- Wyłączanie mutacji komentarzem `// Stryker disable` (research: koliduje z regułą bez komentarzy, [D23](#d23), bo hook by go zablokował).

**Konsekwencje.**

- Pełny przebieg unitowy trwa około 12 minut (audyt planu 1, 8 rdzeni). Nigdy nie uruchamiaj dwóch przebiegów naraz: dwa przebiegi `stryker.config.json` nadpisują sobie `reports/mutation/` i `reports/stryker-incremental.json`; przebieg integracyjny dzieli bazę `_test` z innym przebiegiem integracyjnym i z `npm run test:integration`, więc test, któremu drugi proces wyczyścił tabele, daje fałszywie zabitego mutanta; przy braku procesora testy przekraczają limit czasu, a status `Timeout` liczy się jako wykryty. Katalog `.stryker-tmp/` konfliktu nie powoduje, bo każdy przebieg tworzy w nim własny podkatalog `sandbox-*` i usuwa tylko swój ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#jeden-stryker)). Sam przebieg integracyjny ma znany problem: mimo `concurrency: 1` po sprawdzeniu typów działają w nim dwa procesy testów na wspólnej bazie `_test` ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#concurrency)).
- `npm run test:mutation:task` przy istniejącym pliku przyrostowym (`reports/stryker-incremental.json`) raportuje i ocenia progiem `break` cały projekt: wyniki pozostałych plików bierze z tego pliku. Wynik pliku zadania trzeba czytać z jego wiersza w raporcie ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#task)).
- Nowy plik w katalogu z listy `critical` jest objęty bramką od razu, bo bramka porównuje prefiksy ścieżek.

**Jak egzekwowana.**

- Lokalnie: `test-reviewer` uruchamia `npm run test:mutation:task -- <pliki>` i `npm run test:mutation:gate` przy każdym zadaniu; pełny przebieg przed releasem kitu.
- `.github/workflows/mutation.yml` tylko po ręcznym uruchomieniu (`workflow_dispatch`): `npm run test:mutation`, `npm run test:mutation:integration`, `npm run test:mutation:gate`, z Postgresem jako usługą. Workflow nie działa przy pull requeście ani pushu: pełny przebieg trwa kilkanaście minut, zużywa minuty GitHub Actions, a przebieg integracyjny ma znany problem z bazą ([08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#concurrency)). Koszt: CI nie zatrzyma osłabienia testu w pliku krytycznym; pilnuje tego proces lokalny i recenzja pull requestu.
- `thresholds.break` w `stryker.config.json`.
- Logika bramki (`scripts/mutation-gate.ts`, `scripts/lib/mutation-gate.ts`): `scripts/lib/__tests__/mutation-gate.test.ts` w `npm test`.
- To, że wpisy w `allowed` dodaje człowiek: tylko konwencja (agent `test-reviewer` nie ma narzędzi `Edit` ani `Write`, ale ma `Bash`).

**Źródło.** Commity `c9d7b25` i `54efbcf`; [AGENTS.md](../AGENTS.md), „Testy, które próbują złamać kod”; [CLAUDE.md](../CLAUDE.md), „Testy”; research i audyt testów planu 1.

<a id="d27"></a>

## D27 · next-intl: `pl` domyślny, prefiks `as-needed`, namespace tłumaczeń feature = nazwa katalogu

**Status:** obowiązuje · **Data:** 2026-10-26 · **Kto zdecydował:** autor design doc (§3 i §4.3); wykonawca planu 1 (ruling R4: klucz namespace to nazwa katalogu feature)

**Kontekst.** Design doc zakłada polski jako język domyślny i angielski jako opcjonalny. Feature, także z modułu opcjonalnego, musi dodać własne teksty bez edytowania plików tłumaczeń rdzenia ([D03](#d03)), a teksty różnych feature nie mogą się nadpisywać.

**Decyzja.**

- Tłumaczenia obsługuje next-intl. Języki to `pl` i `en`, domyślny `pl` (`src/i18n/config.ts`), z `localePrefix: "as-needed"` (`src/i18n/routing.ts`): adresy polskie nie mają prefiksu, angielskie mają `/en`. Język ustala `src/proxy.ts` (middleware next-intl).
- Teksty rdzenia są w `src/app/messages/<locale>.json`, a teksty feature w `src/features/<x>/i18n/<locale>.json`. `src/i18n/request.ts` scala je przez `mergeMessages` (`src/i18n/merge-messages.ts`): teksty feature trafiają pod namespace równy nazwie jego katalogu (z `moduleMessages` w rejestrze).
- `mergeMessages` rzuca błąd przy nieprawidłowym kluczu namespace (wzorzec `^[a-z][a-zA-Z0-9-]*$`) i przy kolizji z namespace rdzenia (`common`, `errors`, `sidebar`, `serviceMode`) albo innego feature.

**Odrzucone alternatywy.** Nie zapisano.

**Konsekwencje.**

- Etykiety menu są szukane pod `<key>.<labelKey>`, gdzie `key` pochodzi z definicji modułu, a tłumaczenia leżą pod nazwą katalogu. Nazwa katalogu feature i `key` w `defineModule` muszą być takie same. W rdzeniu są, ale nic tego nie sprawdza.
- Kolizja namespace kończy się błędem przy ładowaniu tłumaczeń (`getRequestConfig` w `src/i18n/request.ts`), więc strona się nie wyrenderuje.
- Decyzji o wykrywaniu języka nie zapisano ([znane-ograniczenia.md](znane-ograniczenia.md#wykrywanie-jezyka)): `src/i18n/routing.ts` nie ustawia `localeDetection`, więc działa domyślne zachowanie next-intl. Adres bez prefiksu bierze język z ciasteczka `NEXT_LOCALE`, a bez niego z nagłówka `Accept-Language`, więc przeglądarka, która woli angielski, trafia na `/en/...`. Szczegóły w [07-i18n-mail-env.md](07-i18n-mail-env.md).
- Trzeci język wymaga zmian w `src/i18n/config.ts` i w generatorze (lista języków w `packages/cli/src/generate/index.ts` i `packages/cli/src/generate/registry.ts`).
- Dodawanie tekstów i języka: [07-i18n-mail-env.md](07-i18n-mail-env.md).

**Jak egzekwowana.**

- Guard w kodzie: `mergeMessages` przy każdym żądaniu.
- `src/i18n/__tests__/merge-messages.test.ts` (kolizje, nieprawidłowe klucze, klucze z prototypu `Object`).
- Zgodność nazwy katalogu z `key`: tylko konwencja.

**Źródło.** [Design doc](superpowers/specs/2026-10-26-wa-kit-design.md) §3 i §4.3; ruling R4 w [handoffie planu 1](superpowers/notes/2026-10-26-plan-1-handoff.md); [AGENTS.md](../AGENTS.md), „i18n”; commity `b27c07b` i `baeca4e`.
