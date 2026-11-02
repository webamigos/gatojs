# Rozbieżności i znaleziska z pisania dokumentacji wa-kit, część 2

Data: 2026-10-30 · Stan kodu: gałąź `docs/part-2`, start od `dcaac50` (na `main` `76ca2d7`)

Notatka zbiera rozbieżności między kodem a `AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, `README.md`, `kit/README.md`, workflow CI i specami, które wyszły przy pisaniu części 2 dokumentacji.
Kod nie jest poprawiany. Dokumentacja opisuje to, co robi kod. Każdy wpis ma pola: Dokument, Kod, Propozycja, Status. Wpisy części 1 są w [notatce części 1](2026-10-27-docs-discrepancies.md).

## R1. `AGENTS.md` nie opisuje regionu `wa:ci-integration`, tablicy `auditSinks`, pola `ciSteps` ani pliku `src/i18n/locales.generated.ts`

- **Dokument:** `AGENTS.md`, sekcja „Moduły i pliki generowane”, wymienia jako miejsca łączenia `src/modules.generated.ts`, `src/modules.client.generated.ts` i regiony w `prisma/schema/auth.prisma`, `prisma/schema/organizations.prisma`, `.env.example` oraz `docker-compose.yml`. Wymienia też opcjonalne pliki feature (`env.ts`, `auth.ts`, `auth-client.ts`, `i18n/{pl,en}.json`).
- **Kod:** `.github/workflows/ci.yml` ma region `# wa:ci-integration:start/end` (linie 70 i 89), który generator wypełnia z pola `ciSteps` manifestów (`kit/cli/src/manifest/schema.ts`). Feature może mieć plik `audit-sink.ts`, z którego generator buduje tablicę `auditSinks` w `src/modules.generated.ts`. `grep` po `AGENTS.md`, `CLAUDE.md` i `kit/CLAUDE.md` nie znajduje żadnego z tych trzech haseł. Trzeci plik generowany, `src/i18n/locales.generated.ts` (`generatedFiles` w `kit/kit.json`), nie jest wymieniony ani w `AGENTS.md` („Moduły i pliki generowane”), ani w `CLAUDE.md` („Pliki generowane”), które każą nie edytować tylko `src/modules.generated.ts` i `src/modules.client.generated.ts`. Region `wa:ci-integration` jest w `CLAUDE.md` chroniony wzorcem („ani regionów `wa:*:start/end`”), ale z nazwy nie występuje; brakuje go w jawnej liście regionów `AGENTS.md` (doprecyzowane w Task 11).
- **Propozycja:** dopisać do listy regionów `.github/workflows/ci.yml` (`# wa:ci-integration:start/end`), do listy plików feature `audit-sink.ts` (`auditSink`) i wspomnieć o `ciSteps` w manifeście; dopisać `src/i18n/locales.generated.ts` do listy plików generowanych w `AGENTS.md` i `CLAUDE.md`.
- **Status:** otwarte.

## R2. `kit/README.md` opisuje bramkę CLI bez lintu

- **Dokument:** `kit/README.md`, sekcja „Rozwój kitu” (linia 64): bramka CLI to „typecheck, testy, build bundla”.
- **Kod:** `kit/cli/package.json`, skrypt `verify`: `npm run lint && npm run typecheck && npm test && npm run build`. `kit/CLAUDE.md` opisuje to poprawnie („lint → typecheck → testy → build bundla”).
- **Propozycja:** dopisać lint w `kit/README.md` (zmiana w Task 12 części 2).
- **Status:** naprawione w Task 12 (`kit/README.md`, „Rozwój kitu”: „lint → typecheck → testy → build bundla”).

## R3. Krok „Bundle is up to date” w `kit.yml` nie może się nie udać

- **Dokument:** `kit/CLAUDE.md`, sekcja „Bundel CLI”: „CI sprawdza `git diff --exit-code -- .wa/bin/wa.mjs`: nieaktualny bundel zatrzymuje job”.
- **Kod:** `.github/workflows/kit.yml`, job `cli`. Krok „Verify CLI” uruchamia `npm run verify --prefix kit/cli`, który kończy się `npm run build`, czyli przebudowuje `.wa/bin/wa.mjs`. Następny krok „Kit state and generated files are up to date” robi `git diff --exit-code` na całym drzewie, więc nieaktualny bundel zatrzymuje job już w nim. Dopiero po nim idzie krok „Bundle is up to date” (`git diff --exit-code -- .wa/bin/wa.mjs`), który po udanym poprzednim kroku zawsze przechodzi. Pierwotne źródło: [notatka recenzji szkicu](2026-10-30-docs-part-2-draft-review.md), pkt 11.
- **Propozycja:** albo przenieść krok „Bundle is up to date” przed krok z `git diff --exit-code` na całym drzewie (od razu po „Verify CLI”), albo go usunąć jako zbędny. W obu wypadkach poprawić zdanie w `kit/CLAUDE.md`.
- **Status:** otwarte.

## R4. Spec planu 3 podaje dokładną listę kluczy wrażliwych, kod dopasowuje fragmenty

- **Dokument:** [spec planu 3](../specs/2026-10-28-wa-kit-plan-3-modules-design.md), §5, „Moje decyzje”: `SENSITIVE_KEYS` to `password`, `passwordHash`, `secret`, `token`, `accessToken`, `refreshToken`, `apiKey`, `hashedKey`, `authorization`, `cookie`, porównanie bez wielkości liter.
- **Kod:** `src/features/audit-logs/services/redact.ts`: klucz jest wrażliwy, gdy po zmianie na małe litery i usunięciu `-` i `_` zawiera fragment z listy `password`, `secret`, `token`, `apikey`, `authorization`, `cookie`, `privatekey`, `hashedkey` (rozszerzone przy recenzji PR #6, commity `012fe4d` i `3746be8`). Redagowany jest też wynik `toJSON`.
- **Propozycja:** dopisać w specu adnotację, że lista została zastąpiona dopasowaniem fragmentów. Dokumentacja opisuje kod ([D41](../../decyzje.md#d41)).
- **Status:** otwarte.

## R5. Pole manifestu `workspaces` istnieje, ale żaden kod go nie czyta

- **Dokument:** design doc §4.3 zapowiada generowane `workspaces` w `package.json`; plan 2 (D3) zostawia je statyczne.
- **Kod:** `moduleManifestSchema` w `kit/cli/src/manifest/schema.ts` ma `workspaces: z.array(z.string()).default([])`, ale `grep -rn workspaces kit/cli/src` poza testami i schematem nic nie znajduje. Root `package.json` ma stałe `["packages/*", "apps/*"]`.
- **Propozycja:** usunąć pole ze schematu albo opisać je w `kit/CLAUDE.md` jako zarezerwowane dla przyszłego modułu `worker`. Dokumentacja: [D29](../../decyzje.md#d29).
- **Status:** otwarte.

## R6. Test własności sprawdza położenie pliku `compose`, ale nie pliku `ciSteps`

- **Dokument:** [spec planu 3](../specs/2026-10-28-wa-kit-plan-3-modules-design.md), §3: „każdy plik należy do dokładnie jednego manifestu”; `kit/CLAUDE.md` nie mówi o `ciSteps`.
- **Kod:** `checkOwnership` w `kit/cli/src/kit/ownership.ts` zgłasza `composeOutsideModule`, gdy plik z pola `compose` nie należy do plików modułu. Dla pola `ciSteps` (dodanego w commicie `2e8db6e`) nie ma odpowiednika: manifest może wskazać plik kroków CI należący do innego modułu albo do `core`, a test przejdzie. Fragment czytany jest z katalogu projektu, więc w projekcie bez modułu-właściciela pliku `wa generate` skończy się błędem odczytu.
- **Propozycja:** dodać do raportu `ciStepsOutsideModule` analogiczne do `composeOutsideModule`. Dokumentacja: [D38](../../decyzje.md#d38), [D45](../../decyzje.md#d45).
- **Status:** otwarte.

## R7. Plan 2 mówi, że placeholdery działają „nigdy w testach”, kod tego nie sprawdza

- **Dokument:** [plan 2](../plans/2026-10-27-wa-kit-plan-2-cli.md), decyzja D6: podmiana „działa tylko w plikach z `placeholderFiles`, nigdy w testach”.
- **Kod:** `applyPlaceholders` w `kit/cli/src/assemble/placeholders.ts` sprawdza tylko obecność pliku na liście `placeholderFiles`. Test dopisany do listy zostałby zmieniony. Krok „No placeholders left in the project” w `kit.yml` pomija testy w `git grep`, więc też tego nie zatrzyma (pierwotne źródło: notatka recenzji szkicu, pkt 16).
- **Propozycja:** test w `kit/cli`, który odrzuca wpisy `placeholderFiles` pasujące do `__tests__/` albo `*.test.*`. Dokumentacja: [D32](../../decyzje.md#d32).
- **Status:** otwarte.

## R8. `wa add` nie dopisuje zmiennych modułu do `.env`; `kit/README.md` o tym nie mówi

- **Dokument:** `kit/README.md`, „Komendy w projekcie”: `wa add` „kopiuje pliki modułu i jego zależności, dopisuje zależności npm i uruchamia `wa generate`”; wiersz `api-keys` w tabeli modułów mówi tylko, że `wa create` nie losuje `API_KEY_PEPPER`.
- **Kod:** `add` w `kit/cli/src/commands/add.ts` nie czyta ani nie zapisuje `.env`; `wa generate` wypełnia tylko region `wa:modules` w `.env.example`. `.env` powstaje raz, w `create` (`writeEnvFile`). Przebieg 2026-10-30 (Task 3): po `wa add api-keys` w projekcie z `uploads` `.env` nie ma `API_KEY_PEPPER`, więc `parseEnv` w `src/shared/lib/env.ts` przy pierwszym odczycie `env` rzuci `Nieprawidłowe zmienne środowiskowe: API_KEY_PEPPER: …`. Symetrycznie `wa remove` zostawia zmienne modułu w `.env` (sprawdzone dla `S3_*`).
- **Propozycja:** dopisać w `kit/README.md` krok „skopiuj nowe zmienne z regionu `wa:modules` w `.env.example` do `.env`” albo wypisywać go w `add` obok podpowiedzi migracji; pozycja do `znane-ograniczenia.md` (Task 12). Dokumentacja: [16-cli-wa.md](../../16-cli-wa.md#add-po).
- **Status:** dokumentacja naprawiona w Task 12: `kit/README.md` („Komendy w projekcie”) mówi, że `add` nie zmienia `.env`, a [znane-ograniczenia.md](../../znane-ograniczenia.md#add-env) ma pozycję. Kod: otwarte (zgłoszenie do kitu).

## R9. `wa create` wymaga `git` także z `--no-git`

- **Dokument:** `kit/README.md`, tabela opcji `wa create`: `--no-git` „Pomija `git init` i pierwszy commit”; uwaga pod tabelą wiąże wymóg `git` tylko z commitem.
- **Kod:** `assemblableFiles` → `listKitFiles` w `kit/cli/src/kit/files.ts` uruchamia `git -C <kit> ls-files` przy każdym `create` i `add` z lokalnym źródłem. Bez `git` w `PATH` `create --no-git` kończy się `spawn git ENOENT`, a katalog projektu jest usuwany (przebieg 2026-10-30, Task 3). Katalog kitu bez `.git` daje `<ścieżka> nie jest repozytorium git` także w `create`, nie tylko w `add` (uzupełnienie pkt 8 notatki recenzji szkicu).
- **Propozycja:** w `kit/README.md` napisać, że `git` jest wymagany zawsze, a `--no-git` pomija tylko repozytorium projektu (Task 12). Dokumentacja: [16-cli-wa.md](../../16-cli-wa.md#create-opcje).
- **Status:** naprawione w Task 12: `kit/README.md`, tabela opcji `wa create` (`--no-git`), i pozycja w [znane-ograniczenia.md](../../znane-ograniczenia.md#cli-male).

## R10. Test własności nie pilnuje „dokładnie jednego właściciela” zależności

- **Dokument:** nazwa testu w `kit/cli/src/kit/__tests__/ownership.test.ts`: „każdy plik i każda zależność ma dokładnie jednego właściciela”; [spec planu 3](../specs/2026-10-28-wa-kit-plan-3-modules-design.md) §3 mówi o jednym właścicielu pliku.
- **Kod:** `checkOwnership` w `kit/cli/src/kit/ownership.ts` liczy właścicieli tylko dla plików (`multiOwned`). Dla zależności sprawdza, że każda z `package.json` jest zadeklarowana w jakimś manifeście tej sekcji (`unownedDependencies`) i że wersje się zgadzają (`dependencyMismatch`); dwa manifesty z tą samą zależnością w tej samej sekcji i wersji nie dają żadnego wpisu. Przebieg 2026-10-30 (Task 4): `zod` `^4.3.6` dopisany do `dependencies` w `kit/modules/audit-logs.json` obok `core`, test na repozytorium przechodzi. Skutek: `wa remove` takiego modułu zostawia zależność, dopóki deklaruje ją inny moduł (`removeDependencies`).
- **Propozycja:** albo dodać do raportu `multiOwnedDependencies`, albo zmienić nazwę testu na „każdy plik ma jednego właściciela, każda zależność ma właściciela”. Dokumentacja: [16b-rozwoj-kitu.md](../../16b-rozwoj-kitu.md#wlasnosc), [D30](../../decyzje.md#d30).
- **Status:** otwarte.

## R11. `kit/CLAUDE.md` nie wymienia podbicia wersji kitu w krokach wydania

- **Dokument:** `kit/CLAUDE.md`, „Składanie i wydanie”: „Wydanie: podbij `version` zmienionych modułów, uruchom `npm run wa -- kit sync`, zmerguj do `main`; tag `v<version>` ustawia człowiek.” Nie mówi, że chodzi o `version` z `kit/kit.json` ani że trzeba ją podbić. `kit/README.md` („Rozwój kitu”) mówi tylko, że wersja kitu z `kit/kit.json` wyznacza tag.
- **Kod:** `cloneKit` w `kit/cli/src/kit/source.ts` klonuje `v<kitVersion>`, a `kitVersion` projektu to `version` z `kit/kit.json` (`create.ts`, `kit-sync.ts`). Bez podbicia `kit/kit.json` nowe wydanie miałoby nazwę tagu, który już istnieje i wskazuje poprzedni commit. W planie 3 `core` przeszedł z `0.1.0` do `0.4.0`, a `kit/kit.json` zostało `0.1.0` (pierwszy tag, `v0.1.0`, ustawiono na końcowym commicie planu, więc tu nie było konfliktu).
- **Propozycja:** dopisać w `kit/CLAUDE.md` krok „podbij `version` w `kit/kit.json`” i polecenie tagu z adnotacją (`git tag -a v<version> -m "wa-kit v<version>"`). Dokumentacja: [16b-rozwoj-kitu.md](../../16b-rozwoj-kitu.md#wydanie), [D46](../../decyzje.md#d46).
- **Status:** otwarte.

## R12. Reguła „moduł nie edytuje plików rdzenia” a praktyka modułów kitu w planie 3

- **Dokument:** `AGENTS.md`, „Moduły i pliki generowane”: „Moduł nie edytuje plików rdzenia”; `CLAUDE.md`, „Pliki generowane”: to samo zdanie; `kit/CLAUDE.md`, „Moduły i manifest”: „Zmieniasz pliki modułu: podbij jego `version`”, bez słowa o plikach rdzenia, których wymaga moduł.
- **Kod:** każdy moduł planu 3 wymagał zmian w plikach `core`, a większość weszła w commitach modułów bez podbicia wersji `core` (podbicia tylko w `c8a0ffd`, `102b706`, `2e8db6e`):
  - szwy: `trackAudit` w `src/features/organizations/services/commands/member-commands.ts` (`9569cbc`), `requestConfirmation` w `src/shared/components/service-mode/use-service-mode-action.tsx` (`6279545`), `src/proxy.ts` (`7b069fc`);
  - konfiguracja testów: `src/test/integration/setup-env.ts` (`c6c26c4`, `2199cea`, `76b5956`), `e2e/env.ts` (`76b5956`; `102b706` z podbiciem), `vi.mock("@/modules.generated", …)` w `src/shared/lib/__tests__/env.test.ts` (`102b706`), `stryker.integration.config.json` (`04ce5d3`), wyjątek `UNGUARDED_ALLOWED` w `src/__tests__/server-entrypoints-guard.test.ts` (dodany w `b3da758`, usunięty w `0b5c91d`);
  - bramka mutacji: `critical` i `allowed` w root `mutation-gate.json` (`c8b5f74`, `c6c26c4`, `36dd132`).
  Skutek: projekt z samym `core` dostaje katalogi `critical` nieobecnych modułów, wpisy `allowed` dla plików `api-keys` i wartości `API_KEY_PEPPER`, `S3_*` w plikach testowych; nieszkodliwe, bo `checkMutationGate` (`scripts/lib/mutation-gate.ts`) ocenia tylko pliki z raportu.
- **Propozycja:** dopisać w `kit/CLAUDE.md`, że moduł kitu może wymagać zmian plików rdzenia (setup testów, `mutation-gate.json`, szwy), które robi się osobnym commitem `core` z podbiciem jego wersji; albo przenieść wartości testowe modułów do plików modułów (na przykład przez region generowany z manifestu). Dokumentacja: [16b-rozwoj-kitu.md](../../16b-rozwoj-kitu.md#nowy-modul-kitu).
- **Status:** otwarte.

## R13. `AGENTS.md` nie wymienia punktów wejścia rdzenia dla modułów, a kontrakt trybu serwisowego w UI zna tylko `run`

- **Dokument:** `AGENTS.md`, „Moduły i pliki generowane”, opisuje jako miejsca łączenia tylko pliki generowane i regiony. „Dane i organizacje” mówi: „UI woła komendę przez `useServiceModeAction().run(command, input)` … Moduły nie piszą własnego dialogu”.
- **Kod:** rdzeń ma punkty wejścia, które importują moduły kitu i moduły projektu: `trackAudit` i `auditActor` (`src/shared/lib/audit.ts`), pola `auditActions`, `apiScopes`, `uploadPurposes` w `ModuleDef` (`src/shared/lib/modules/define-module.ts`) i `requestConfirmation()` w `useServiceModeAction` (`src/shared/components/service-mode/use-service-mode-action.tsx`). `grep` po `AGENTS.md`, `CLAUDE.md` i `kit/CLAUDE.md` nie znajduje żadnego z nich. `<FileUpload>` (`src/features/uploads/components/file-upload.tsx`) nie woła `run`, tylko `requestConfirmation()`, i wysyła potwierdzenie w formularzu `fetch` do `POST /api/uploads`; dialog nadal pochodzi z rdzenia.
- **Propozycja:** dopisać w `AGENTS.md` („Moduły i pliki generowane”) akapit o punktach wejścia (wołanie `trackAudit` po udanym zapisie, deklaracje w `defineModule` jako czyste dane, które bez modułu obsługującego nic nie robią), a w „Dane i organizacje” zdanie, że wywołanie spoza komendy serwerowej (trasa API przez `fetch`) pobiera potwierdzenie przez `requestConfirmation()`, a trasa sprawdza je `assertServiceModeConfirmed`. Dokumentacja: [12-moduly-kitu.md](../../12-moduly-kitu.md#punkty-wejscia).
- **Status:** otwarte.

## R14. `02b-rejestr-i-generator.md` opisuje rejestr i generator sprzed planów 2 i 3

- **Dokument:** `docs/02b-rejestr-i-generator.md` (nagłówek `012fe4d`): tabela w „Rejestr modułów” mówi, że `modules` czyta „nikt w kodzie aplikacji”; „Wykrywanie feature” cytuje `const LOCALES = ["pl", "en"];`; „Regiony `wa:*`” mówi o czterech regionach i cytuje `regionTargets` bez `wa:ci-integration`; Referencja `kitStateSchema` nie ma pól `kitRepo`, `project`, `locales`, `projectModules`, a `moduleManifestSchema` pola `ciSteps`; tabela „Pliki generowane” nie ma `src/i18n/locales.generated.ts` ani regionu `wa:ci-integration`; zdanie „Moduł `api-keys` dokłada `moduleEnvSchemas`” pomija `uploads`.
- **Kod:** `modules` z `src/modules.generated.ts` czytają `knownApiScopes` (`src/features/api-keys/services/api-scopes.ts`), `listUploadPurposes` (`src/features/uploads/services/upload-purposes.ts`) i `<AuditTrail>` (`src/features/audit-logs/components/audit-trail.tsx`); `kit/cli/src/generate/index.ts` bierze języki z `state.locales` i zapisuje `LOCALES_FILE = "src/i18n/locales.generated.ts"`; `regionTargets` w `kit/cli/src/generate/targets.ts` ma pięć wpisów (z `.github/workflows/ci.yml`, marker `ci-integration`); `kitStateSchema` w `kit/cli/src/manifest/schema.ts` ma `kitRepo`, `project`, `locales` i `projectModules`; `uploads` ma `env.ts`, więc trafia do `moduleEnvSchemas`. Rejestracja modułów projektu (`registeredModules` w `kit/cli/src/manifest/kit-state.ts`) też nie jest opisana.
- **Propozycja:** poprawić 02b w Task 9 części 2. Plik [12-moduly-kitu.md](../../12-moduly-kitu.md#szwy-generowane) opisuje stan z kodu.
- **Status:** naprawione w Task 9.

## R15. Test kitu `audit-log-view.test.tsx` zależy od treści rejestru; akcja `delivery.received` z przykładów psuje `npm run verify` projektu

- **Dokument:** `docs/09b-implementacja-i-bramki.md` („Dziennik zdarzeń w funkcji projektu”, „Trasy API”) i [spec planu 3](../specs/2026-10-28-wa-kit-plan-3-modules-design.md) §5 używają jako przykładu akcji `delivery.received`, którą funkcja projektu deklaruje w `auditActions`.
- **Kod:** test „pokazuje surowy action, gdy akcja nie ma deklaracji” w `src/features/audit-logs/components/__tests__/audit-log-view.test.tsx` renderuje `AuditLogView` na prawdziwym `clientModules` (bez `vi.mock("@/modules.client.generated")`, inaczej niż `audit-log-view-labels.test.tsx`) i oczekuje surowego napisu `delivery.received`. W przebiegu Task 6 (projekt z `v0.1.0`, `audit-logs` i funkcją projektu deklarującą `delivery.received`) `npm run verify` padł: `Tests  1 failed | 1455 passed (1456)`, `Unable to find an element with the text: delivery.received`. Po zmianie nazwy akcji na `delivery.accepted` przebieg był zielony.
- **Propozycja:** w teście kitu zamockować rejestr albo użyć nazwy akcji, której projekt nie zadeklaruje (na przykład z prefiksem `test.`); do czasu poprawki przykłady w 09b zmienić na inną akcję. `docs/13b-modul-audit-logs-uzycie.md` opisuje objaw w „Typowych problemach”.
- **Status:** częściowo naprawione. 09b naprawione w Task 11: sekcje „Dziennik zdarzeń w funkcji projektu” i „Trasa API z kluczem w funkcji projektu” odsyłają do 13b i 14b (przykłady z `delivery.accepted`) i nie zawierają już `delivery.received`. Kod: otwarte (zgłoszenie do kitu). Pozycja w [znane-ograniczenia.md](../../znane-ograniczenia.md#moduly-male) (Task 12).

## R16. Spec planu 3 zapowiada kanał `API` dla żądań z kluczem, kod kitu go nie zapisuje

- **Dokument:** [spec planu 3](../specs/2026-10-28-wa-kit-plan-3-modules-design.md) §5, „Kanał”: wpis ma `channel` (`API` dla żądań uwierzytelnionych kluczem) i `credentialId`.
- **Kod:** `src/shared/lib/audit.ts` i `writeAuditLog` przyjmują `channel` i `credentialId`, ale żaden plik kitu ich nie ustawia (`grep -rn "channel\|credentialId" src` poza `audit-logs` i `audit.ts` nic nie znajduje). Jedyna trasa z kluczem, `GET /api/v1/organization`, tylko czyta i nie woła `trackAudit`.
- **Propozycja:** brak zmiany w kodzie; dokumentacja (`13-modul-audit-logs.md`, „Zdarzenia rdzenia i modułów kitu”) mówi, że pola wypełnia kod projektu.
- **Status:** informacyjne.

## R17. Wartość `INTEGRATION_DATABASE_URL=wa_app_test` dla przejść nie działa w projekcie z innym zestawem modułów

- **Dokument:** plan części 2, „Global Constraints” (bazy w `wa-kit-db-1`: `wa_app_test` dla testów integracyjnych) i brief Task 6 (przejście z `INTEGRATION_DATABASE_URL` na `wa_app_test`).
- **Kod:** `src/test/integration/global-setup.ts` uruchamia `npx prisma db push` ze schematem projektu. Projekt z samym `audit-logs` nie ma tabel `api_keys` i `uploads`, więc `db push` na `wa_app_test` (z wierszem w `api_keys`) zatrzymał się na ``You are about to drop the `api_keys` table, which is not empty (1 rows).`` i testy się nie uruchomiły. Wymuszenie (`--accept-data-loss`) skasowałoby dane bazy testowej kitu.
- **Propozycja:** w przejściach Task 7–8 używać osobnej bazy `<slug>_runs_test` w `wa-kit-db-1` (tworzy ją `globalSetup`); Task 6 użył `audit_demo_runs_test`. Dopisać tę bazę do listy baz z przejść w raporcie Task 13.
- **Status:** obejście zastosowane w Task 6.

## R18. Komendy `api-keys` sprawdzają dostęp przed walidacją, a błąd walidacji daje ogólny komunikat

- **Dokument:** `AGENTS.md`, „Struktura”: „Akcje serwerowe: walidacja → autoryzacja → wywołanie serwisu”; `docs/06-wzorce-kodu.md` („Kolejność kroków w nowej komendzie”: `try` obejmuje całe ciało, walidacja przed kontekstem).
- **Kod:** `createApiKeyCommand`, `revokeApiKeyCommand` i `deleteApiKeyCommand` (`src/features/api-keys/services/commands/api-key-commands.ts`) wołają `requireModuleAccess` przed `try`, potem `assertServiceModeConfirmed`, a dopiero potem `parse` schematu. `ZodError` nie jest `DomainError`, więc `handleCommandError` zwraca ogólny komunikat („Nie udało się utworzyć klucza”) i loguje błąd na poziomie `error`. Bezpieczeństwa to nie narusza (Prisma jest za guardem i potwierdzeniem); ten sam rodzaj odstępstwa w rdzeniu opisuje R37 notatki części 1.
- **Propozycja:** brak zmiany w kodzie; `docs/14-modul-api-keys.md` („Komponenty, komendy i serwisy”) opisuje komunikaty, a przykład własnej trasy w `14b` waliduje wejście w serwisie.
- **Status:** informacyjne.

## R19. Odnośniki do opisu peppera i trasy z kluczem prowadzą do skróconej sekcji w 12

- **Dokument:** `docs/10-wdrozenie.md` („Zmienne produkcyjne”, wiersz `API_KEY_PEPPER`, odnośnik „pepper”), `docs/07-i18n-mail-env.md` („Kiedy i jak działa walidacja”) i `docs/09b-implementacja-i-bramki.md` („Trasa API z kluczem w funkcji projektu”) odsyłają do `12-moduly-kitu.md#api-keys`; po przepisaniu 12 ta sekcja ma jedno zdanie, a pepper, kontrakt `authenticateApiKey` i trasa z kluczem są w [14-modul-api-keys.md](../../14-modul-api-keys.md#pepper) i [14b-modul-api-keys-uzycie.md](../../14b-modul-api-keys-uzycie.md#wlasna-trasa).
- **Kod:** nie dotyczy.
- **Propozycja:** w Task 11 zmienić odnośniki na sekcje „Konfiguracja peppera” w 14 i „Trasa z kluczem i serwis z filtrem organizacji” w 14b; przykład w 09b z akcją `delivery.received` poprawić zgodnie z R15.
- **Status:** naprawione. `07-i18n-mail-env.md` odsyła do [14-modul-api-keys.md](../../14-modul-api-keys.md#pepper) (Task 10); `10-wdrozenie.md` (wiersz `API_KEY_PEPPER`) do `14-modul-api-keys.md#pepper`, a `09b-implementacja-i-bramki.md` („Trasa API z kluczem w funkcji projektu”) do `14b-modul-api-keys-uzycie.md#wlasna-trasa`, `14-modul-api-keys.md#authenticate`, `#bez-orgcontext` i `#pepper` (Task 11).

## R20. D44: odpowiedź 404 `GET /api/uploads/<id>` ma `X-Content-Type-Options: nosniff` z `next.config.ts`

- **Dokument:** [D44](../../decyzje.md#d44), „Decyzja”, ostatni punkt: „odpowiedź 404 nie ma tych nagłówków” (`X-Content-Type-Options: nosniff` i `Content-Security-Policy`).
- **Kod:** `readUploadForDownload` dodaje te nagłówki tylko do odpowiedzi 200, ale `next.config.ts` dokłada nagłówki bezpieczeństwa (w tym `X-Content-Type-Options: nosniff`) do każdej ścieżki (`source: "/(.*)"`). Na zbudowanym serwerze w przebiegu Task 8 odpowiedź 404 miała `X-Content-Type-Options: nosniff`, a nie miała `Content-Security-Policy`.
- **Propozycja:** w D44 zawęzić zdanie do nagłówków ustawianych przez trasę („trasa nie dodaje do 404 nagłówków pliku ani `Content-Security-Policy`”). `docs/15-modul-uploads.md` („Pobieranie”) opisuje stan z przebiegu.
- **Status:** naprawione w D44 (Task 8).

## R21. D45: lokalne testy integracyjne z MinIO nie wymagają `INTEGRATION_S3_ENDPOINT`

- **Dokument:** [D45](../../decyzje.md#d45), „Konsekwencje”: „Lokalne testy integracyjne z MinIO wymagają `INTEGRATION_S3_ENDPOINT` i własnego kontenera; region działa tylko w CI.”
- **Kod:** `src/test/integration/setup-env.ts` ma domyślne `http://localhost:9000` i bucket `<slug>-uploads`, czyli wartości MinIO z `docker-compose.yml` projektu (usługi `minio` i `minio-init`). Zmienna jest potrzebna tylko wtedy, gdy MinIO działa na innym porcie (w przebiegu Task 8 port 9000 zajmował MinIO innego projektu, więc testy dostały `INTEGRATION_S3_ENDPOINT=http://localhost:9100`).
- **Propozycja:** w D45 napisać, że lokalnie testy korzystają z MinIO z `docker compose up -d`, a `INTEGRATION_S3_ENDPOINT`/`INTEGRATION_S3_BUCKET` zmieniają adres i bucket. `docs/15b-modul-uploads-uzycie.md` („Testowanie”) opisuje to z kodu.
- **Status:** naprawione w D45 (Task 8).

## R22. `storage.integration.test.ts` zostawia obiekty w buckecie testowym

- **Dokument:** `AGENTS.md`, „Testy” (testy integracyjne na bazie `_test`; nic o sprzątaniu magazynu).
- **Kod:** `src/features/uploads/services/__tests__/storage.integration.test.ts` zapisuje obiekty `orgs/o1/test/<uuid>.txt` i `orgs/o2/test/<uuid>.txt` i nie usuwa ich (`read-upload.integration.test.ts` i `uploads-isolation.integration.test.ts` usuwają swoje w `afterAll`). Po przebiegu Task 8 w buckecie `upload-demo-uploads` zostało siedem takich obiektów.
- **Propozycja:** w teście kitu zbierać klucze i usuwać je w `afterAll` (zgłoszenie do kitu). `docs/15b-modul-uploads-uzycie.md` („Testowanie”) ostrzega przed wskazywaniem testom bucketu z danymi.
- **Status:** otwarte (kod: zgłoszenie do kitu). Pozycja w [znane-ograniczenia.md](../../znane-ograniczenia.md#moduly-male) (Task 12).

## R23. 01 i 09b odsyłają do usuniętych sekcji `uploads` w 12

- **Dokument:** `docs/01-uruchomienie.md` („MinIO”) linkuje `12-moduly-kitu.md#uploads` (sekcja ma jedno zdanie), `docs/09b-implementacja-i-bramki.md` („Pliki w funkcji projektu”) linkuje `12-moduly-kitu.md#uploads` i `12-moduly-kitu.md#usuwanie` (kotwicy nie ma).
- **Kod:** nie dotyczy.
- **Propozycja:** w Task 11 zmienić odnośniki na [15-modul-uploads.md](../../15-modul-uploads.md) (`#minio`, `#usuwanie`) i [15b-modul-uploads-uzycie.md](../../15b-modul-uploads-uzycie.md#uzycie); w 09b przykład celu `delivery-photo` jest zgodny z przebiegiem Task 8.
- **Status:** naprawione w Task 11. `01-uruchomienie.md` odsyła do `15-modul-uploads.md#minio` (jedyna zmiana w 01, SHA bez zmian); `09b-implementacja-i-bramki.md` („Pliki w funkcji projektu”) do `15b-modul-uploads-uzycie.md` (`#wlasny-cel`, `#formularz`, `#zapis-id`, `#usuwanie-z-encja`) i `15-modul-uploads.md` (`#szwy`, `#usuwanie`, `#minio`).

## R24. `filename*` w `Content-Disposition` zostawia `*`, `(` i `)` bez kodowania

- **Dokument:** RFC 5987/8187 (`attr-char`: litery, cyfry i ``!#$&+-.^_`|~``) i [spec planu 3](../specs/2026-10-28-wa-kit-plan-3-modules-design.md) §7 („Poprawny `Content-Disposition` (RFC 6266, `filename*`)”).
- **Kod:** `src/features/uploads/services/content-disposition.ts` koduje `filename*` przez `encodeURIComponent` i zamienia tylko `'` na `%27`; `encodeURIComponent` zostawia `!~*()` (`encodeURIComponent("a!~*()b.png")` daje `a!~*()b.png`). `*`, `(` i `)` nie są `attr-char`, więc nazwa z nawiasami daje wartość niezgodną ze składnią RFC.
- **Propozycja:** w kodzie kitu zamieniać też `*`, `(`, `)` na `%2A`, `%28`, `%29` i dopisać przypadek testu (zgłoszenie do kitu). `docs/15-modul-uploads.md` („Pobieranie”) opisuje zachowanie z kodu.
- **Status:** otwarte (kod: zgłoszenie do kitu). Pozycja w [znane-ograniczenia.md](../../znane-ograniczenia.md#moduly-male) (Task 12).

## R25. `mutation.yml` nie uruchamia MinIO, a przebieg integracyjny Strykera obejmuje testy `uploads`

- **Dokument:** `AGENTS.md`, „Testy” (`.github/workflows/mutation.yml` uruchamiany ręcznie, pełny przebieg przed releasem kitu) i [D26](../../decyzje.md#d26).
- **Kod:** `.github/workflows/mutation.yml` ma tylko usługę `postgres:16` i nie ma regionu `wa:ci-integration` ani kroków MinIO, a krok „Run Stryker (integration)” uruchamia `npm run test:mutation:integration` z `vitest.integration.config.ts`, czyli także `src/features/uploads/services/__tests__/*.integration.test.ts`, które łączą się z S3 pod `http://localhost:9000` (`setup-env.ts`, `storage.integration.test.ts`). Lista `mutate` w `stryker.integration.config.json` obejmuje `src/features/*/services/**/*.ts`. Bez MinIO testy `uploads` nie przejdą już w przebiegu początkowym Strykera, więc przebieg integracyjny w tym workflowie w repozytorium kitu i w projekcie z `uploads` najpewniej zakończy się błędem (wniosek z kodu workflowu i testów; workflow nie był uruchamiany). Job `integration` w `ci.yml` ma te kroki w regionie `wa:ci-integration`.
- **Propozycja:** dodać do `mutation.yml` region `# wa:ci-integration:start/end` przed krokiem „Run Stryker (integration)” i wpisać ten plik do regionów generatora (zgłoszenie do kitu). `docs/08-testy.md` („CI”) opisuje stan z kodu.
- **Status:** otwarte (kod: zgłoszenie do kitu). Pozycja w [znane-ograniczenia.md](../../znane-ograniczenia.md#moduly-male) (Task 12).

## R26. Nagłówki „Zweryfikowano z kodem” wskazywały commity spoza historii `main`

- **Dokument:** `docs/01-uruchomienie.md` i `docs/10-wdrozenie.md` (`09744c4`), `docs/07-i18n-mail-env.md` (`f965e0a`), `docs/09b-implementacja-i-bramki.md` (`a4d5af3`), linia 11. `git merge-base --is-ancestor <sha> HEAD` daje fałsz dla wszystkich trzech, a `git branch -a --contains` nie wskazuje żadnej gałęzi: te commity nie są osiągalne z żadnej gałęzi (ten sam temat i data co commity na `main`, więc najpewniej wersje sprzed przepisania historii gałęzi modułów).
- **Kod:** odpowiedniki na `origin/main` (ten sam temat commitu, ta sama data): `09744c4` → `1166d08` („ci(kit): assemble uploads and all combos”), `f965e0a` → `e2a4a2a` („fix(api-keys): confirm before revoking or deleting keys”), `a4d5af3` → `0b5c91d` („fix(uploads): flatten images, forbid xml and sandbox downloads”). Lokalna gałąź `main` (`5b2d308`) jest za `origin/main` (`76ca2d7`) i nie zawiera żadnego z nich; `origin/main` jest przodkiem `docs/part-2`. Wynik `git diff <stary> <odpowiednik> -- <pliki z „Źródła”>` (bez ścieżek w `node_modules/` i dokumentacji zewnętrznej, które nie są w gicie):
  - 01: 41 ścieżek, diff pusty;
  - 07: 45 ścieżek, diff pusty;
  - 09b: 25 ścieżek, diff pusty;
  - 10: 31 ścieżek, diff niepusty: `src/proxy.ts`, matcher `"/((?!api|_next|_vercel|.*\\..*).*)"` → `"/((?!api(?:/|$)|_next|_vercel|.*\\..*).*)"` (commit `7b069fc` „fix(app): run i18n proxy for paths that only start with api”, jest w historii `1166d08`, nie ma go w historii `09744c4`).
- **Propozycja:** w 01, 07 i 09b SHA zamienione na odpowiednik z `main`, data bez zmian (final-fix I1, ruling R17). W 10 SHA zostaje `09744c4`. Decyzja dla Jakuba: zweryfikować 10 ponownie na `1166d08` i zmienić SHA albo zostawić. Zdania 10 o proxy („ścieżki `/api` omijają proxy”, linie 96 i 206) dotyczą ścieżek `/api/…` i po zmianie matchera pozostają prawdziwe; ścieżki zaczynające się od `api` bez ukośnika (np. `/apixyz`) przechodzą przez proxy dopiero po `7b069fc` (wniosek z diffu matchera, nie sprawdzano przebiegiem).
- **Status:** 01, 07, 09b naprawione w final-fix; 10 otwarte (decyzja dla Jakuba).
