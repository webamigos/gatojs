# Rozbieżności i znaleziska z pisania dokumentacji wa-kit, część 2

Data: 2026-10-30 · Stan kodu: gałąź `docs/part-2`, start od `dcaac50` (na `main` `76ca2d7`)

Notatka zbiera rozbieżności między kodem a `AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, `README.md`, `kit/README.md`, workflow CI i specami, które wyszły przy pisaniu części 2 dokumentacji.
Kod nie jest poprawiany. Dokumentacja opisuje to, co robi kod. Każdy wpis ma pola: Dokument, Kod, Propozycja, Status. Wpisy części 1 są w [notatce części 1](2026-10-27-docs-discrepancies.md).

## R1. `AGENTS.md` nie opisuje regionu `wa:ci-integration`, tablicy `auditSinks`, pola `ciSteps` ani pliku `src/i18n/locales.generated.ts`

- **Dokument:** `AGENTS.md`, sekcja „Moduły i pliki generowane”, wymienia jako miejsca łączenia `src/modules.generated.ts`, `src/modules.client.generated.ts` i regiony w `prisma/schema/auth.prisma`, `prisma/schema/organizations.prisma`, `.env.example` oraz `docker-compose.yml`. Wymienia też opcjonalne pliki feature (`env.ts`, `auth.ts`, `auth-client.ts`, `i18n/{pl,en}.json`).
- **Kod:** `.github/workflows/ci.yml` ma region `# wa:ci-integration:start/end` (linie 70 i 89), który generator wypełnia z pola `ciSteps` manifestów (`kit/cli/src/manifest/schema.ts`). Feature może mieć plik `audit-sink.ts`, z którego generator buduje tablicę `auditSinks` w `src/modules.generated.ts`. `grep` po `AGENTS.md`, `CLAUDE.md` i `kit/CLAUDE.md` nie znajduje żadnego z tych trzech haseł. Trzeci plik generowany, `src/i18n/locales.generated.ts` (`generatedFiles` w `kit/kit.json`), nie jest wymieniony ani w `AGENTS.md` („Moduły i pliki generowane”), ani w `CLAUDE.md` („Pliki generowane”), które każą nie edytować tylko `src/modules.generated.ts` i `src/modules.client.generated.ts`.
- **Propozycja:** dopisać do listy regionów `.github/workflows/ci.yml` (`# wa:ci-integration:start/end`), do listy plików feature `audit-sink.ts` (`auditSink`) i wspomnieć o `ciSteps` w manifeście; dopisać `src/i18n/locales.generated.ts` do listy plików generowanych w `AGENTS.md` i `CLAUDE.md`.
- **Status:** otwarte.

## R2. `kit/README.md` opisuje bramkę CLI bez lintu

- **Dokument:** `kit/README.md`, sekcja „Rozwój kitu” (linia 64): bramka CLI to „typecheck, testy, build bundla”.
- **Kod:** `kit/cli/package.json`, skrypt `verify`: `npm run lint && npm run typecheck && npm test && npm run build`. `kit/CLAUDE.md` opisuje to poprawnie („lint → typecheck → testy → build bundla”).
- **Propozycja:** dopisać lint w `kit/README.md` (zmiana w Task 12 części 2).
- **Status:** otwarte, naprawia Task 12.

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
- **Status:** otwarte.

## R9. `wa create` wymaga `git` także z `--no-git`

- **Dokument:** `kit/README.md`, tabela opcji `wa create`: `--no-git` „Pomija `git init` i pierwszy commit”; uwaga pod tabelą wiąże wymóg `git` tylko z commitem.
- **Kod:** `assemblableFiles` → `listKitFiles` w `kit/cli/src/kit/files.ts` uruchamia `git -C <kit> ls-files` przy każdym `create` i `add` z lokalnym źródłem. Bez `git` w `PATH` `create --no-git` kończy się `spawn git ENOENT`, a katalog projektu jest usuwany (przebieg 2026-10-30, Task 3). Katalog kitu bez `.git` daje `<ścieżka> nie jest repozytorium git` także w `create`, nie tylko w `add` (uzupełnienie pkt 8 notatki recenzji szkicu).
- **Propozycja:** w `kit/README.md` napisać, że `git` jest wymagany zawsze, a `--no-git` pomija tylko repozytorium projektu (Task 12). Dokumentacja: [16-cli-wa.md](../../16-cli-wa.md#create-opcje).
- **Status:** otwarte.

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
- **Status:** otwarte, naprawia Task 9.
