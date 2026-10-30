# wa-kit — dokumentacja, część 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W `docs/` powstają pliki 12–16b (moduły kitu i warstwa szwów, trzy moduły planu 3, CLI i rozwój kitu), a pliki części 1, rejestr decyzji i `kit/README.md` są zgodne z kodem `main` po planach 2 i 3.

**Architecture:** Dokumenty pisze się z kodu i testów, nie ze specu ani z istniejących opisów. Istniejący `docs/12-moduly-kitu.md`, dopiski planu 3 i szkic CLI są tylko materiałem wejściowym. Każde zadanie kończy się skryptem kontrolnym i świeżym recenzentem (szablon F). Zachowania, które da się bezpiecznie uruchomić, są uruchamiane na kopiach w katalogu tymczasowym. Dla każdego modułu powstaje prawdziwe przejście „użycie z własnego kodu” na roboczej kopii projektu.

**Tech Stack:** Markdown (GitHub), mermaid, Node 22 (skrypt kontrolny, ESM, bez zależności), bundel `.wa/bin/wa.mjs`, git, Postgres w kontenerze `wa-kit-db-1` (port 5439), MinIO w kontenerze `wa-kit-minio-test` (port 9100).

**Spec:** `docs/superpowers/specs/2026-10-30-wa-kit-docs-part-2-design.md`, a przez niego `docs/superpowers/specs/2026-10-27-wa-kit-docs-design.md` (§4, §6 obowiązują). Wzór procesu: `docs/superpowers/plans/2026-10-27-wa-kit-docs.md` (procedura P, szablon F, skrypt kontrolny). Wykonawca czyta oba specy i ten plan.

## Global Constraints

- Gałąź `docs/part-2`, worktree `.claude/worktrees/docs-part-2`, start od `dcaac50` (na `main` `76ca2d7`). Wszystkie komendy uruchamiaj w tym worktree.
- Nagłówek każdego pliku `docs/NN-*.md`, który zadanie tworzy albo zmienia: tytuł H1, „Po przeczytaniu będziesz wiedzieć:” (3–6 punktów), `Zweryfikowano z kodem: <krótki SHA HEAD gałęzi z chwili weryfikacji>, <data>`, „Źródła:”. Zmieniany plik części 1 dostaje nowy SHA tylko wtedy, gdy sprawdzono go w całości ze źródłami; inaczej zostaje stary SHA, a zmiana dotyczy tylko akapitów objętych zadaniem i jego „Źródła” się nie zmieniają.
- Język polski, pełne zdania, identyfikatory i komendy bez zmian. W `docs/NN-*.md` nie ma słów „dziś”, „dzisiaj”, „obecnie”, „aktualnie”, „na razie”, „jeszcze nie”, „wkrótce”.
- Źródła prawdy: kod → testy → `AGENTS.md`/`CLAUDE.md`/`kit/CLAUDE.md` → specy i plany → notatki.
- Fragment kodu z repozytorium: nad blokiem linia ze ścieżką w backtickach, w bloku tekst dosłowny, pominięcie oznacza linia `// …` albo `# …`. Kod z przejść (Task 7–9) jest wyjątkiem: pochodzi z przebiegu, który skończył się zielonym `npm run verify`, a nad blokiem stoi ścieżka pliku z przejścia i zdanie, że to przykład (wzór: tutorial 09).
- „(sprawdzone)” tylko przy zachowaniu potwierdzonym uruchomieniem w ramach tego planu.
- Linki tylko do plików śledzonych przez git i do `docs/*.md`. Odwołania do decyzji `[DNN](decyzje.md#dNN)`.
- Bez zmian w kodzie. Poza `docs/` zmienia się tylko `kit/README.md` (Task 12). Rozbieżności kod ↔ `AGENTS.md`/`CLAUDE.md`/README/specy idą do notatki rozbieżności (Task 1).
- Bez komend niszczących bazę (`prisma migrate reset`, `db push --force-reset`, `dropdb`). Bazy tylko w `wa-kit-db-1`: `wa_app_test` (testy integracyjne) i nowe bazy `<slug>_runs` z przejść (nie usuwamy ich; lista w raporcie Task 13); MinIO tylko `wa-kit-minio-test` (`INTEGRATION_S3_ENDPOINT=http://localhost:9100`). Innych kontenerów nie ruszaj.
- npm: `npx -y npm@11.21.1 …`. Stryker: plan go nie uruchamia.
- Scratchpad (`$S`): `/private/tmp/claude-501/-Users-jakubszewczyk-Documents-WebAmigos-wa-kit/f6256c0a-a268-4b54-835d-dd61c937f392/scratchpad`. Skrypt kontrolny: `$S/check-docs.mjs`. Przejścia i przebiegi CLI: podkatalogi `$S/runs/`.
- Commit na koniec każdego zadania (Conventional Commits, temat małymi literami, `docs:`), bez pusha. Push i PR po Task 13, na prośbę Jakuba.
- Subagenci: autor pliku i recenzent F to osobne, świeże agenty; recenzent F na najmocniejszym dostępnym modelu (preferencja Jakuba: dokładność ponad tempo).

## Procedura P (dla każdego pliku dokumentacji)

Jak w planie części 1:

1. Przeczytaj w całości pliki z „Źródła” zadania i wskazane testy. Nie pisz z pamięci, ze specu ani z materiału wejściowego.
2. Napisz plik według specu części 2 (§5) i punktów „Wymagane” zadania.
3. `node $S/check-docs.mjs docs/<plik>.md` → `OK`. Zgłoszenia usuwasz w dokumencie; błąd skryptu poprawiasz w skrypcie i opisujesz w raporcie.
4. Recenzja: świeży subagent z szablonem F (plan części 1), z dopiskami: „spec: `docs/superpowers/specs/2026-10-30-wa-kit-docs-part-2-design.md` (§3, §5 i sekcja tego pliku); plan: ten plik (zadanie N)” oraz dla plików 13–15: „sprawdź, że plik ma wszystkie sekcje szkieletu §5.2 w tej kolejności, a każdy punkt wejścia ma kontrakt i zachowanie bez modułu”. Każde „niezgodne” poprawiasz i wracasz do kroku 3.
5. Rozbieżności dopisz do notatki rozbieżności.
6. Commit.

## Review Focus

1. Deweloper kopiuje z 13–15 przykład użycia modułu do funkcji projektu, w którym modułu nie ma. Oczekuje, że dokument powie, co się wtedy stanie (na przykład `trackAudit` bez `audit-logs` nic nie zapisuje; import `<AuditTrail>` bez modułu nie zbuduje się) → Task 6–8, „Wymagane”, i recenzja F.
2. Deweloper usuwa moduł (`wa remove`) w projekcie z danymi. Oczekuje informacji, co zostaje w bazie, w magazynie S3 i w `package.json`, i jaką migrację utworzyć → Task 3 (16, sekcja `wa remove`) i Task 6–8 (sekcja „Instalacja i usunięcie”), przebieg na kopii.
3. Deweloper wdraża projekt z `uploads` albo `api-keys` na produkcję. Oczekuje pełnej listy wymaganych zmiennych (`API_KEY_PEPPER`, zmienne S3) i skutków ich zmiany (zmiana peppera unieważnia klucze) → Task 7–8 i Task 11 (`10-wdrozenie.md`).
4. Deweloper zakłada projekt one-linerem i widzi ostrzeżenie gita o tagu i odłączonym HEAD. Oczekuje, że dokument powie, że to nie błąd → Task 3, przebieg one-linera z GitHuba.
5. Deweloper czyta stary odnośnik `[D01](decyzje.md#d01)` albo `#d02` w pliku części 1. Oczekuje, że wpis prowadzi do decyzji obowiązującej albo jasno wskazuje następczynię → Task 2, „Wymagane”.

---

### Task 1: Narzędzia kontroli i notatka rozbieżności

**Files:**
- Create: `$S/check-docs.mjs`, `docs/superpowers/notes/2026-10-30-docs-part-2-discrepancies.md`

**Interfaces:**
- Produces: `node $S/check-docs.mjs [--alt-root <dir>] <plik.md>...` z rodzajami zgłoszeń `BRAK`, `LINK`, `KOTWICA`, `KOD`, `SKRYPT`, `SŁOWO`; kod 1 przy zgłoszeniach, `OK` i kod 0 bez nich. Notatka z wpisami `## R<n>. <tytuł>` (pola: Dokument, Kod, Propozycja, Status).

- [ ] **Step 1: Napisz `$S/check-docs.mjs`** według Step 1 Task 1 planu części 1, z trzema zmianami: `SKRYPT` rozpoznaje `npm run <nazwa> --prefix kit/cli` (sprawdza `kit/cli/package.json`) i `npm run wa -- <komenda>` (sprawdza tylko `wa` w root); lista lokalnych korzeni dostaje `kit/cli/node_modules`, `kit/cli/reports`, `volumes/minio`; `SŁOWO` obejmuje `docs/NN-*.md` i `docs/NNb-*.md`.
- [ ] **Step 2: Sprawdź skrypt**
  Run: `node $S/check-docs.mjs docs/12-moduly-kitu.md docs/02b-rejestr-i-generator.md`
  Expected: kod 0 albo zgłoszenia, które ręcznie ocenisz jako prawdziwe (zapisz je do notatki) albo błędy skryptu (popraw skrypt).
- [ ] **Step 3: Załóż notatkę z wpisami startowymi**
  - R1: `AGENTS.md` („Moduły i pliki generowane”) nie wymienia regionu `# wa:ci-integration:start/end` w `.github/workflows/ci.yml`, tablicy `auditSinks` ani pola `ciSteps`. Propozycja: dopisać.
  - R2: `kit/README.md` („Rozwój kitu”) opisuje bramkę CLI bez lintu, a `kit/cli/package.json` `verify` zaczyna się od `npm run lint` (Task 12 to poprawia).
  - R3: krok „Bundle is up to date” w `.github/workflows/kit.yml` nie może się nie udać, bo wcześniejszy krok robi `git diff --exit-code` na całym drzewie po przebudowie bundla (notatka recenzji szkicu, pkt 11). Propozycja: kolejność kroków albo usunięcie zbędnego.
  - Każda inna pozycja z [notatki recenzji szkicu](../notes/2026-10-30-docs-part-2-draft-review.md), która jest rozbieżnością kodu z dokumentem spoza `docs/`.
- [ ] **Step 4: Commit** `docs: discrepancy note for documentation part 2`

### Task 2: `docs/decyzje.md` — decyzje planów 2 i 3

**Files:**
- Modify: `docs/decyzje.md`

**Interfaces:**
- Produces: kotwice `d28`… (lista niżej). Pozostałe zadania linkują tylko ID z tej tabeli.

Stała lista ID. Wykonawca sprawdza w kodzie, że decyzja obowiązuje; nieobowiązującą pomija bez przenumerowania i dopisuje do notatki rozbieżności. Może połączyć dwie pozycje w jeden wpis (wtedy drugi numer jest pominięty) albo wydzielić decyzję, której lista nie ma (wtedy dostaje D47 i kolejne).

| ID | Decyzja | Źródło |
| --- | --- | --- |
| D28 | CLI w `kit/cli`, poza workspace'ami; bundel `.wa/bin/wa.mjs` commitowany; dystrybucja przez `git clone` tagu; `wa create` zamiast osobnego `create-wa-app` | plan 2 D1, D2 |
| D29 | Workspaces `packages/*`, `apps/*` statyczne i puste | plan 2 D3 |
| D30 | Zależności npm mają właścicieli jak pliki; `package.json` projektu to suma manifestów; przy konflikcie w `wa add` wygrywa wersja projektu | plan 2 D4, plan „drobiazgi” zad. 3–4 |
| D31 | Hashe plików bez treści regionów; `package.json`/`package-lock.json` zarządzane; pliki generowane bez właściciela | plan 2 D5 |
| D32 | Placeholdery to dosłowna podmiana w `placeholderFiles` | plan 2 D6 |
| D33 | Języki projektu w `.wa/kit.json` i `src/i18n/locales.generated.ts` | plan 2 D7 |
| D34 | `wa remove` „wszystko albo nic”, `--force` | plan 2 D9 |
| D35 | `--setup` przy `wa create` opcjonalny | plan 2 D10 |
| D36 | Funkcje projektu w `projectModules` | plan 2 D11 |
| D37 | Testy rdzenia sprawdzają tylko moduły rdzenia | plan 2 D12 |
| D38 | Własność plików i zależności w manifestach `kit/modules/*.json`, pilnowana testem własności (zastępuje D02) | plan 2 zad. 2–3, `kit/cli/src/kit/ownership.ts` |
| D39 | Moduł wpina się przez deklaracje danych w `defineModule` (`auditActions`, `apiScopes`, `uploadPurposes`) i szwy rdzenia; zastępuje „bez punktów rozszerzeń” z D01 | spec planu 3 §5–§7 |
| D40 | `trackAudit` w rdzeniu działa bez modułu; ujścia `auditSinks`; awaria ujścia nie przerywa komendy | spec planu 3 §5 |
| D41 | Redakcja danych wrażliwych przed zapisem; brak retencji w module | spec planu 3 §5 |
| D42 | Zdarzenia rdzenia (zaproszenia, role) łapane hookami better-auth | spec planu 3 §5 |
| D43 | Klucze API: HMAC z `API_KEY_PEPPER`, zakresy, limit aktywnych kluczy, brak `OrgContext`, jawny filtr organizacji | spec planu 3 §6 |
| D44 | Uploads: magazyn S3 (MinIO lokalnie), cele uploadu, widoczność `public`/`organization` z `Cache-Control`, cofnięcie obiektu przy błędzie zapisu rekordu | spec planu 3 §7, wątki PR #8 |
| D45 | Region `wa:ci-integration` i pole manifestu `ciSteps`; pusty region bez markerów pomijany | spec planu 3 §7, commit `1753a2d` |
| D46 | Kit wydawany tagiem `v<version>` ustawianym przez człowieka; projekt pobiera kit tylko w swojej wersji | `kit/CLAUDE.md`, `kit/cli/src/kit/source.ts` |

- [ ] **Step 1: Przeczytaj źródła:** plan 2 (sekcja decyzji), spec planu 3 (§4–§8), plany „drobiazgi” i „ograniczenia add”, [notatkę recenzji szkicu](../notes/2026-10-30-docs-part-2-draft-review.md), łatkę szkicu `docs/superpowers/notes/2026-10-30-docs-part-2-cli-draft/docs-edits.patch` (wpisy D28–D36 szkicu jako wejście), kod wymieniony w „jak egzekwowana” każdego wpisu.
- [ ] **Step 2: Dopisz wpisy D28–D46** z polami z części 1 (status, data, kto zdecydował, kontekst, decyzja, odrzucone alternatywy, konsekwencje, jak egzekwowana, źródło). „Jak egzekwowana” wskazuje test, workflow albo „tylko konwencja” — sprawdzone w kodzie (na przykład krok z punktu R3 nie egzekwuje D28).
- [ ] **Step 3: Zastąpione decyzje.** D01 i D02 dostają status `zastąpiona przez D39` i `zastąpiona przez D38`, a w treści jedno zdanie, co się zmieniło. Pozostała treść zostaje jako zapis historii.
- [ ] **Step 4: Poprawki faktów w miejscu:** D03 (szwy z `auditSinks`, `wa:ci-integration`; wzorzec w `kit/modules/<x>.json` + `wa kit sync` dla modułu kitu, `projectModules` dla funkcji projektu), D04 (trzy pliki generowane, nagłówek równy komendzie z `AGENTS.md`), D13 (ignorowanie migracji plikiem tylko w kicie, jeśli treść tego nie mówi), D27 (języki z `.wa/kit.json`; trzeci język wymaga zmian w `schema.ts`, `args.ts`, `registry.ts`, `kit-sync.ts`). Sekcja „Statusy i numeracja”: zakres D01–D46, przykład bez „przy planie 2”. Spis decyzji z nowymi wierszami i statusami.
- [ ] **Step 5: Odnośniki.** `grep -n 'decyzje.md#d0[12]' docs/*.md`: każdy odnośnik, który opisuje stan po planie 2 albo 3, wskazuje D38/D39; pozostałe zostają (wpis zastąpiony mówi, kto go zastąpił).
- [ ] **Step 6: Procedura P, kroki 3–6** (recenzent F sprawdza każdy nowy wpis z kodem i regułę statusów).

### Task 3: `docs/16-cli-wa.md` — CLI w projekcie

**Files:**
- Create: `docs/16-cli-wa.md`

**Interfaces:**
- Consumes: D28–D38, D46 (Task 2).
- Produces: kotwice `wa-create`, `zrodlo-kitu`, `wa-add`, `wa-remove`, `wa-list`, `moduly-projektu`, `referencja-komunikaty`, `referencja-opcje`.

- [ ] **Step 1: Źródła:** `kit/cli/src/bin.ts`, `args.ts`, `commands/{create,add,remove,list}.ts`, `assemble/*.ts`, `kit/{source,files,kit-config}.ts`, `manifest/kit-state.ts`, `process/*.ts`, testy w `kit/cli/src/**/__tests__/`, `kit/kit.json`, `kit/modules/*.json`, `kit/README.md`. Wejście: `docs/superpowers/notes/2026-10-30-docs-part-2-cli-draft/12-cli-wa.md` i notatka recenzji szkicu (pkt 1–10 i „Zachowania pominięte”).
- [ ] **Step 2: Przebiegi na kopii** (`$S/runs/cli/`), wyniki zapisane w raporcie zadania:
  - one-liner z GitHuba (`git clone --depth 1 --branch v0.1.0 …` + `create <nazwa> --yes --no-install --no-git`), z pełnym wyjściem gita;
  - `create` z `--modules audit-logs`, `api-keys`, `uploads` i wszystkimi naraz; zawartość `.wa/kit.json`, `package.json`, regionów;
  - w projekcie z `uploads`: `wa list`, `wa add api-keys`, `wa remove api-keys` (z lokalną zmianą i bez, z `--force`), `wa remove audit-logs`, gdy moduł projektu go wymaga;
  - błędy z tabeli komunikatów, które da się wywołać bez sieci.
- [ ] **Step 3: Napisz plik** procedurą P.
  - Wymagane: kolejność kontroli i pobrania kitu w `add`; kody wyjścia (`list` z błędem źródła kończy się kodem 0); granice cofania w `create`/`add`/`remove`; co zostaje po `wa remove` (dane w bazie, obiekty w S3, zależności) i jaka migracja; one-liner jako droga podstawowa z wyjaśnieniem ostrzeżenia gita; lokalny klon z `--kit` jako droga bez sieci; bezpieczeństwo `remove`; pełna tabela komunikatów (także `nie jest repozytorium git`, `zakończone kodem`, `spawn … ENOENT`).

### Task 4: `docs/16b-rozwoj-kitu.md` — praca nad repozytorium kitu

**Files:**
- Create: `docs/16b-rozwoj-kitu.md`

**Interfaces:**
- Consumes: D28–D38, D45, D46.
- Produces: kotwice `kit-a-projekt`, `manifesty`, `kit-sync`, `wlasnosc`, `hashe`, `placeholdery`, `bundel`, `bramka-cli`, `ci-kitu`, `wydanie`, `nowy-modul-kitu`, `referencja-kit-json`.

- [ ] **Step 1: Źródła:** `kit/kit.json`, `kit/modules/*.json`, `kit/CLAUDE.md`, `kit/README.md`, `kit/cli/{package.json,bundle.mjs,eslint.config.mjs,stryker.config.json,mutation-gate.json}`, `kit/cli/src/commands/kit-sync.ts`, `kit/cli/src/kit/*.ts`, `kit/cli/src/assemble/{hash,placeholders,package-json,copy}.ts`, `kit/cli/src/generate/targets.ts`, `kit/cli/src/kit/__tests__/ownership.test.ts`, `kit/cli/src/__tests__/fixtures/project-module/`, `.github/workflows/{kit,kit-mutation}.yml`, `.dockerignore`, `.gitignore`, `.prettierignore`, `eslint.config.mjs`, `vitest.config.ts`, `tsconfig.json`. Wejście: szkic `12b-rozwoj-kitu.md` i notatka recenzji (pkt 11–20).
- [ ] **Step 2: Napisz plik** procedurą P.
  - Wymagane: macierz `assemble` z czterech modułów i `all`; test własności widzi tylko indeks gita (nowy plik po `git add`); treść kopiowana z drzewa roboczego; `ciSteps` i `docker/`, `ci/` jako pliki modułów; wydanie z tagiem z adnotacją; „jak dodać moduł kitu” sprawdzone krok po kroku z tym, co zrobił plan 3 (commity modułów).

### Task 5: `docs/12-moduly-kitu.md` — moduły kitu i warstwa szwów

**Files:**
- Modify (przepisanie): `docs/12-moduly-kitu.md`

**Interfaces:**
- Consumes: 16, 16b (Task 3–4), D03, D38–D45.
- Produces: kotwice `modul-a-rdzen`, `lista-modulow`, `warstwa-szwow`, `szwy-generowane`, `punkty-wejscia`, `wybor-modulow`. Pliki 13–15 linkują `12-moduly-kitu.md#punkty-wejscia` i `#szwy-generowane`.

- [ ] **Step 1: Źródła:** `kit/modules/*.json`, `src/modules.generated.ts`, `src/modules.client.generated.ts`, `src/shared/lib/audit.ts`, `src/shared/lib/modules/define-module.ts`, `src/shared/components/service-mode/use-service-mode-action.tsx`, `kit/cli/src/generate/{index,registry,targets}.ts`, `AGENTS.md` („Moduły i pliki generowane”), wyniki `git diff 5b2d308..76ca2d7 -- src/shared src/app/api src/i18n prisma/schema/auth.prisma prisma/schema/organizations.prisma` (punkty wejścia dodane przez plan 3). Wejście: obecny `12-moduly-kitu.md`.
- [ ] **Step 2: Napisz plik** według specu §5.3, procedurą P.
  - Wymagane: diagram drogi modułu (mermaid); tabela punktów wejścia (nazwa, plik, kontrakt w jednym zdaniu, zachowanie bez modułu, plik modułu, który z niego korzysta); macierz zależności modułów (`requires`); jak wybrać moduły; odnośniki do 13–16b. Treść specyficzna dla jednego modułu trafia do 13–15, nie tutaj.

### Task 6: `docs/13-modul-audit-logs.md`

**Files:**
- Create: `docs/13-modul-audit-logs.md`
- Create (poza repo): `$S/runs/audit-logs/` — przejście

**Interfaces:**
- Consumes: Task 3–5, D39–D42.

- [ ] **Step 1: Źródła:** `kit/modules/audit-logs.json`, `prisma/schema/audit-logs.prisma`, `src/features/audit-logs/**` z testami, `src/app/[locale]/(app)/audit-log/**`, `src/shared/lib/audit.ts`, komendy rdzenia wołające `trackAudit` (`grep -rln trackAudit src --include=*.ts`), spec planu 3 §5. Wejście: sekcja `audit-logs` obecnego 12 i dopiski w 09b.
- [ ] **Step 2: Przejście „użycie z własnego kodu”** w `$S/runs/audit-logs/`: projekt z `wa create --modules audit-logs` (pełna instalacja; `DATABASE_URL` na bazę `<slug>_runs` w `wa-kit-db-1`, którą tworzy `prisma migrate dev`; `INTEGRATION_DATABASE_URL` na `wa_app_test`), funkcja projektu (`projectModules`) z komendą zapisującą zdarzenie przez `trackAudit` + deklaracją `auditActions` + `<AuditTrail>` na stronie; test komendy. Expected: `npm run verify` zielony; zapis zdarzenia widoczny w teście integracyjnym. Zapisz kod przejścia do raportu.
- [ ] **Step 3: Napisz plik** w szkielecie specu §5.2, procedurą P.
  - Wymagane: tabela modelu `AuditLog` (pola, indeksy, kaskady); lista zdarzeń logowanych przez rdzeń i moduł; kontrakt `trackAudit`/`auditActor`/`auditSinks` z zachowaniem bez modułu; redakcja (reguła `toJSON`, klucze wrażliwe) przy opisie zapisu; strefa czasowa filtrów dat; brak retencji; `serviceMode` w zdarzeniach; testowanie kodu projektu, który woła `trackAudit`.

### Task 7: `docs/14-modul-api-keys.md`

**Files:**
- Create: `docs/14-modul-api-keys.md`, `$S/runs/api-keys/`

**Interfaces:**
- Consumes: Task 3–5, D39, D43.

- [ ] **Step 1: Źródła:** `kit/modules/api-keys.json`, `prisma/schema/api-keys.prisma`, `src/features/api-keys/**` z testami (także integracyjnymi), `src/app/api/v1/organization/route.ts`, `src/app/[locale]/(app)/api-keys/**`, spec planu 3 §6. Wejście: sekcja `api-keys` obecnego 12.
- [ ] **Step 2: Przejście** w `$S/runs/api-keys/` (bazy jak w Task 6): projekt z `api-keys`, funkcja projektu z trasą `GET /api/v1/<x>` chronioną `authenticateApiKey` i własnym zakresem w `apiScopes`; test trasy (brak klucza 401, zły zakres 403, klucz innej organizacji nie widzi danych). Expected: `npm run verify` zielony.
- [ ] **Step 3: Napisz plik** w szkielecie §5.2, procedurą P.
  - Wymagane: cykl życia klucza (utworzenie, jednorazowe pokazanie sekretu, unieważnienie, usunięcie, wygaśnięcie, limit aktywnych); kontrakt `authenticateApiKey` z kodami odpowiedzi; brak `OrgContext` i jawny filtr organizacji; pepper (wymagany w produkcji, zmiana unieważnia klucze) przy opisie konfiguracji; zdarzenia audytu z kanałem `API`; blokada przy limicie; testowanie trasy projektu z kluczem.

### Task 8: `docs/15-modul-uploads.md`

**Files:**
- Create: `docs/15-modul-uploads.md`, `$S/runs/uploads/`

**Interfaces:**
- Consumes: Task 3–5, D39, D44, D45.

- [ ] **Step 1: Źródła:** `kit/modules/uploads.json`, `prisma/schema/uploads.prisma`, `docker/uploads.compose.yml`, `ci/uploads.integration-steps.yml`, `src/features/uploads/**` z testami, `src/app/api/uploads/**`, `src/test/integration/setup-env.ts`, spec planu 3 §7, wątki PR webamigos/wa-kit#8. Wejście: sekcja `uploads` obecnego 12 i dopiski w 01, 09b, 10.
- [ ] **Step 2: Przejście** w `$S/runs/uploads/` (bazy jak w Task 6): projekt z `uploads`, funkcja projektu z własnym celem w `uploadPurposes` (obraz z `resizeImage`), formularz z `<FileUpload>` zapisujący `id` w encji, test integracyjny na MinIO (`INTEGRATION_S3_ENDPOINT=http://localhost:9100`). Expected: `npm run verify` i test integracyjny zielone.
- [ ] **Step 3: Napisz plik** w szkielecie §5.2, procedurą P.
  - Wymagane: zmienne S3 i MinIO lokalnie (obrazy przypięte, porty); `POST /api/uploads` (411 bez `Content-Length`, 413, limit nazwy pliku 255) i `GET /api/uploads/<id>` (`Cache-Control` dla `public` i `organization`, `Content-Disposition`); kontrakt celu uploadu; cofnięcie obiektu przy błędzie rekordu; usuwanie i osierocone obiekty; region `wa:ci-integration`; testowanie z MinIO.

### Task 9: `02-architektura.md` i `02b-rejestr-i-generator.md`

**Files:**
- Modify: `docs/02-architektura.md`, `docs/02b-rejestr-i-generator.md`

- [ ] **Step 1:** `git diff <SHA z nagłówka>..HEAD -- <źródła pliku>` dla obu plików i lista akapitów do zmiany; wejście: łatka szkicu (fragmenty 02 i 02b) i notatka recenzji (pkt 19, 22, 26).
- [ ] **Step 2: Popraw** procedurą P. Wymagane w 02b: przykład `.wa/kit.json` (aktualny, skrócony liniami `// …`), schematy `kitStateSchema` i manifestu z `ciSteps`, pliki generowane z `locales.generated.ts`, tablica `auditSinks`, region `wa:ci-integration`, lista „Generator uruchom po” z `ciSteps`, komunikaty (także pliku bez markerów, `projectModules`), `Użycie: …`. W 02: `kit/` i CLI w mapie katalogów, słownik, odnośniki do 12 i 16.

### Task 10: Rdzeń po planie 3: `03`, `04`, `04b`, `05`, `06`, `07`

**Files:**
- Modify: tylko te z wymienionych, dla których `git diff <SHA z nagłówka>..HEAD -- <źródła>` pokazuje zmianę opisanego zachowania.

- [ ] **Step 1:** Dla każdego pliku: diff źródeł i lista zmienionych zachowań (w raporcie). Pliki bez zmian zachowania nie są edytowane.
- [ ] **Step 2: Popraw** procedurą P. Wymagane: 07 „Dodawanie języka” po `locales.generated.ts` (szkic zawiera sprawdzony przebieg: `generate` przełącza języki, nieznany język kończy się błędem Zod); 05/06 — zmiany `use-service-mode-action.tsx` i pola `defineModule` z planu 3 (odnośnik do 12 zamiast opisu modułów).

### Task 11: `08`, `08b`, `09`, `09b`, `10`, `11`

**Files:**
- Modify: `docs/08-testy.md`, `docs/08b-testy-adwersarialne.md`, `docs/09-nowy-modul.md`, `docs/09b-implementacja-i-bramki.md`, `docs/10-wdrozenie.md`, `docs/11-praca-z-kitem.md`

- [ ] **Step 1:** Jak Task 10, Step 1.
- [ ] **Step 2: Popraw** procedurą P. Wymagane: 08 — testy CLI (lint, bramka mutacji CLI), MinIO w testach integracyjnych, testy rdzenia filtrowane (`src/test/core-modules.ts`); 09 — przykład `.wa/kit.json` z aktualnymi polami; 09b — dopiski planu 3 sprawdzone, treść specyficzna dla modułów zastąpiona odnośnikami do 13–15; 10 — zmienne modułów na produkcji, MinIO/S3, `ci-integration`; 11 — CLI i praca nad kitem (odnośniki do 16, 16b), trzy pliki generowane, słowo „Obecnie”.

### Task 12: `znane-ograniczenia.md`, `README.md`, `kit/README.md`

**Files:**
- Modify: `docs/znane-ograniczenia.md`, `docs/README.md`, `kit/README.md`

- [ ] **Step 1: `znane-ograniczenia.md`** procedurą P: sekcja CLI (pozycje z notatki recenzji szkicu i ze szkicu, ponownie sprawdzone; wydanie bez tagu jako zwykła pozycja) i sekcja modułów (na przykład brak retencji, osierocone obiekty S3, wymóg `API_KEY_PEPPER`), każda z polami z części 1.
- [ ] **Step 2: `README.md`:** spis plików 12–16b, ścieżki czytania (co najmniej „zakładam projekt i dobieram moduły”, „używam modułu w swoim kodzie”, „rozwijam kit”), słownik (spec §5.4), tabela planów (`worker`, `legal`, `wa update`, `wa diff`), akapit o CLI, zakres D01–D46.
- [ ] **Step 3: `kit/README.md`:** bramka CLI „lint → typecheck → testy → build bundla”, odnośnik tekstowy do `docs/16-cli-wa.md` i `docs/16b-rozwoj-kitu.md` w repozytorium kitu.
- [ ] **Step 4:** skrypt kontrolny na trzech plikach, recenzent F, commit.

### Task 13: Przegląd całości

- [ ] **Step 1:** `node $S/check-docs.mjs docs/*.md kit/README.md` → `OK`.
- [ ] **Step 2:** świeży recenzent (najmocniejszy model) dostaje spec części 2 i wszystkie zmienione pliki. Sprawdza: kompletność §5 specu; szkielet §5.2 w 13–15; spójność 12 ↔ 13–15 ↔ 16/16b ↔ 02b ↔ `decyzje.md`; pięć punktów Review Focus; kryterium sukcesu (decyzja, instalacja i użycie modułu z samego pliku modułu).
- [ ] **Step 3:** lista baz `*_runs` utworzonych w przejściach; `npm run verify` w worktree (dokumentacja nie zmienia kodu; sprawdzenie, że nic nie zepsuto) i streszczenie notatki rozbieżności dla Jakuba.
- [ ] **Step 4:** commit poprawek; push i PR na prośbę Jakuba.
