# wa-kit — dokumentacja frameworka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W `docs/` powstaje dokumentacja wa-kit dla deweloperów Web Amigos (14 plików Markdown po polsku). Opisuje stan kodu po commicie `4a6ffcb`, a każde twierdzenie jest sprawdzone w kodzie.

**Architecture:** Dokumenty pisze się z kodu, nie ze specu. Każde zadanie kończy się dwiema kontrolami:
- jednorazowy skrypt w scratchpadzie sprawdza ścieżki, linki, kotwice, dosłowność fragmentów kodu, komendy `npm run` i słowa zakazane;
- świeży recenzent sprawdza każde twierdzenie z kodem (szablon F).

Rozbieżności z kodem trafiają do notatki dla Jakuba, kod zostaje bez zmian. Tutorial (zadanie 10) jest najpierw wykonany na roboczym worktree, a dopiero potem opisany.

**Tech Stack:** Markdown (GitHub), mermaid, Node 22 (skrypt kontrolny, ESM, bez zależności), git worktree, Postgres w kontenerze `wa-kit-db-1` (port 5439).

**Spec:** `docs/superpowers/specs/2026-10-27-wa-kit-docs-design.md` (zakres każdego pliku w §5, weryfikacja w §6). Wykonawca czyta spec i plan.

## Global Constraints

- Stan kodu: gałąź `refactor/app-url`, commit `4a6ffcb`. W nagłówkach plików: `Zweryfikowano z kodem: 4a6ffcb, 2026-10-27`.
- Język polski, pełne zdania, identyfikatory i komendy bez zmian. Bez słów „dziś”, „dzisiaj”, „obecnie”, „aktualnie”, „na razie”, „jeszcze nie”, „wkrótce” w plikach `docs/NN-*.md` (spec §4).
- Każdy plik `docs/NN-*.md` zaczyna się od: tytułu H1, bloku „Po przeczytaniu będziesz wiedzieć:” (3–6 punktów), linii `Zweryfikowano z kodem: 4a6ffcb, 2026-10-27`, listy „Źródła:” (ścieżki). Pliki 02, 03, 04, 07 i 08 kończą się sekcją `## Referencja`.
- Kolejność źródeł prawdy: kod → testy → `AGENTS.md`/`CLAUDE.md` → spec i plany → notatki i handoffy (spec §4).
- Linki tylko do plików śledzonych przez git albo do nowych plików `docs/*.md`. Nigdy do `.superpowers/`, `.claude/handoffs/` ani niezacommitowanych notatek. Ścieżki lokalne (np. `.superpowers/phase`) wolno wymienić w backtickach.
- Fragment kodu z repo: nad blokiem linia ze ścieżką w backtickach, w bloku tekst dosłowny. Pominięcie oznacza osobna linia `// …` albo `# …`.
- Odwołania do decyzji: `[D07](decyzje.md#d07)`. Lista ID jest stała (zadanie 2); ID nieobowiązującej decyzji zostaje pominięte bez przenumerowania.
- Bez zmian w kodzie. Poza `docs/` wolno zmienić tylko: jedną linię w `AGENTS.md`, jedną linię w `README.md` i link w §3.1 `docs/superpowers/specs/2026-10-26-wa-kit-design.md` (zadanie 13).
- To zadanie nie zmienia kodu, więc nie dotyczą go `test-writer`, `test-reviewer` ani `.superpowers/phase`. Nie twórz pliku `.superpowers/phase`.
- Bez commitów i bez pusha. Commit tylko na wyraźną prośbę Jakuba, po zadaniu 13.
- Nie edytuj plików innych sesji: `docs/superpowers/plans/2026-10-27-wa-kit-plan-2-cli.md`, `.claude/handoffs/*`, notatek `docs/superpowers/notes/2026-10-27-*` poza notatką rozbieżności.
- Baza: tylko kontener `wa-kit-db-1` (`localhost:5439`). Innych kontenerów nie ruszaj. Nie uruchamiaj `prisma migrate reset`, `db push --force-reset` ani `dropdb`. Nie dotykaj baz `wa_app` i `wa_app_test`.
- npm: `npx -y npm@11.21.1 …` (npm 10.9 wywraca się przy instalacji).
- Stryker: nigdy dwa przebiegi naraz.
- Scratchpad (`$S`): `/private/tmp/claude-501/-Users-jakubszewczyk-Documents-WebAmigos-wa-kit/0e88664b-bc6d-4a40-9bf4-8a58ac0fd3dd/scratchpad`. Skrypt kontrolny: `$S/check-docs.mjs`. Snapshot tutorialu: `$S/tutorial-snapshot/`.

## Procedura zadania dokumentacyjnego (P)

Każde zadanie 1 i 3–12 przechodzi te kroki dla swoich plików, zadanie 2 i 13 też, z różnicami opisanymi w zadaniu:

1. Przeczytaj w całości pliki z listy „Źródła” zadania i testy z listy „Testy”. Nie pisz z pamięci ani ze specu.
2. Napisz plik według spec §5 (sekcja tego pliku) i punktów „Wymagane” zadania.
3. Uruchom `node $S/check-docs.mjs docs/<plik>.md`. Oczekiwane: `OK`. Każde zgłoszenie usuń w dokumencie, a nie w skrypcie. Wyjątek: zgłoszenie wynika z błędu skryptu — wtedy popraw skrypt i zapisz to w raporcie.
4. Fact-check: świeży subagent z szablonem F. W trybie subagent-driven to jest recenzja zadania. Każde „niezgodne” poprawiasz zgodnie z kodem, potem wracasz do kroku 3.
5. Każdą rozbieżność kod ↔ `AGENTS.md`/`CLAUDE.md`/README/spec dopisz do notatki rozbieżności (format w zadaniu 1).
6. Bez commitu.

### Szablon F (prompt recenzenta)

```
Jesteś recenzentem dokumentacji. Repo: /Users/jakubszewczyk/Documents/WebAmigos/wa-kit (tylko odczyt).
Przeczytaj docs/<plik>.md, spec docs/superpowers/specs/2026-10-27-wa-kit-docs-design.md (§4 i sekcję tego pliku w §5)
oraz plan docs/superpowers/plans/2026-10-27-wa-kit-docs.md (zadanie <N>).
1. Dla każdego twierdzenia o zachowaniu kodu (co robi funkcja, jakie wartości, kolejność, domyślne, kto ma dostęp,
   jakie komendy działają) znajdź kod, który je potwierdza albo obala. Wynik: twierdzenie (cytat do 15 słów),
   werdykt zgodne / niezgodne / nie da się sprawdzić, dowód (ścieżka + symbol).
   Podawaj tylko werdykty niezgodne i nie da się sprawdzić, a na końcu liczbę zgodnych.
2. Wypisz punkty zakresu ze spec §5 i „Wymagane” z zadania, których w pliku brakuje.
3. Wypisz linki do plików nieśledzonych przez git, słowa zakazane z §4 i fragmenty kodu, które nie są dosłowne.
Nie edytuj plików. Odpowiedź po polsku, zwięźle.
```

## Review Focus

1. Czytelnik ma zajęty port 5432 i idzie za `01-uruchomienie.md`. Oczekuje, że dokument każe zmienić razem `DB_PORT` i port w `DATABASE_URL` w `.env` → zadanie 1, „Wymagane”.
2. Czytelnik uruchamia komendę, która czyści bazę (`npm run test:e2e` → `globalSetup`, `npm run test:integration` → `db push` i `resetDatabase`), na bazie deweloperskiej. Oczekuje, że dokument wymieni każdą taką komendę i jej zabezpieczenie (`_e2e`, `_test`) → zadanie 9, „Wymagane”.
3. Czytelnik kopiuje z dokumentacji komendę, która nie istnieje. Przykład: nagłówek pliku generowanego mówi `npx wa generate` → skrypt sprawdza `npm run`. W dokumentacji występuje tylko `npm run build -w @wa-kit/cli && npm run wa -- generate`, a rozbieżność nagłówka jest w notatce (zadanie 1).
4. Czytelnik w projekcie klienta szuka dokumentacji przez `AGENTS.md`. Oczekuje działającego wskazania, a nie martwego linku → zadanie 13: tekst zamiast linku.
5. Czytelnik dodaje funkcję bez wpisu w `.wa/kit.json`. Oczekuje, że dokument powie, jaki będzie objaw (brak w rejestrze, zachowanie `requireModuleAccess` dla nieznanego klucza) → zadanie 10, krok z objawem.

---

### Task 1: Narzędzia kontroli, notatka rozbieżności i `01-uruchomienie.md`

**Files:**
- Create: `$S/check-docs.mjs`, `docs/superpowers/notes/2026-10-27-docs-discrepancies.md`, `docs/01-uruchomienie.md`

**Interfaces:**
- Produces: `node $S/check-docs.mjs [--alt-root <dir>] <plik.md>...`. Uruchamiany z root repo. Wypisuje linie `<RODZAJ> <plik>:<linia> <treść>`, gdzie `RODZAJ` ∈ `BRAK`, `LINK`, `KOTWICA`, `KOD`, `SKRYPT`, `SŁOWO`. Kod wyjścia 1, gdy jest choć jedna linia; w przeciwnym razie wypisuje `OK` i kończy kodem 0.
- Produces: notatka rozbieżności z wpisami `## R<n>. <tytuł>` (pola: Dokument, Kod, Propozycja, Status).

- [ ] **Step 1: Napisz `$S/check-docs.mjs`** (Node 22, ESM, bez zależności). Sprawdzenia:
  - `BRAK`: ścieżka w backtickach nie istnieje. Kandydat to token bez spacji i bez znaków `< > * { } $`, który nie zaczyna się od `/` ani nie zawiera `://`. `@/` zamienia się na `src/`. Usuwa się sufiks `:<liczba>` i końcowe `/`. Kandydat:
    - zawiera `/`, a jego pierwszy segment jest pierwszym segmentem jakiegoś pliku z `git ls-files` albo lokalnym korzeniem;
    - albo jest gołą nazwą pliku z rozszerzeniem `ts|tsx|mjs|json|md|prisma|yml|yaml|toml`.
    Istnieje, gdy:
    - jest plikiem z `git ls-files`;
    - albo jest prefiksem katalogu takiego pliku;
    - albo jest plikiem `docs/*.md`;
    - albo zaczyna się od lokalnego korzenia: `.superpowers`, `src/generated`, `.next`, `node_modules`, `reports`, `.stryker-tmp`, `prisma/migrations`, `packages/cli/dist`, `.env`, `volumes`;
    - albo istnieje pod `--alt-root`.
    Goła nazwa pliku istnieje, gdy jakiś śledzony plik ma tę nazwę.
  - `LINK`: link Markdown `](cel)` (bez `http`, `mailto`, samego `#`) po rozwiązaniu względem katalogu pliku nie jest plikiem śledzonym ani `docs/*.md`. Link do `.superpowers/` zawsze daje `LINK`.
  - `KOTWICA`: fragment `#x` nie odpowiada ani `<a id="x">`, ani slugowi nagłówka w pliku docelowym. Slug: małe litery, usunięte znaki inne niż `\p{L}\p{N}`, spacja i `-`, spacje → `-`.
  - `KOD`: blok kodu, nad którym (do 2 linii wyżej) stoi ścieżka w backtickach, ma segmenty rozdzielone liniami `// …` / `# …`. Każdy segment musi wystąpić w tym pliku (repo albo `--alt-root`) jako ciąg kolejnych linii po `trimStart`, z pominięciem pustych linii na brzegach.
  - `SKRYPT`: `npm run <nazwa>` bez `-w` → `<nazwa>` w `scripts` root `package.json`. Z `-w @wa-kit/cli` → w `packages/cli/package.json`.
  - `SŁOWO`: tylko w plikach `docs/NN-*.md`. Słowa z Global Constraints, bez rozróżniania wielkości liter, z granicami `(?<!\p{L})…(?!\p{L})`. Pomija bloki kodu.

- [ ] **Step 2: Sprawdź skrypt na znanym przypadku**

  Run: `node $S/check-docs.mjs AGENTS.md`
  Expected: kod 1. Wśród zgłoszeń jest `BRAK AGENTS.md:<n> docs/superpowers/notes/2026-10-27-adversarial-testing-research.md`. Każde inne zgłoszenie jest albo prawdziwym brakiem (wtedy dopisz go do notatki), albo błędem skryptu (wtedy popraw skrypt i uruchom ponownie).

  Run: `node $S/check-docs.mjs README.md CLAUDE.md`
  Expected: zgłoszenia ocenione tak samo jak wyżej.

- [ ] **Step 3: Załóż notatkę rozbieżności z wpisami startowymi**
  - R1: nagłówek plików generowanych `npx wa generate` (`packages/cli/src/generate/registry.ts`, `GENERATED_HEADER`) a `npm run build -w @wa-kit/cli && npm run wa -- generate` w `CLAUDE.md`/`AGENTS.md`.
  - R2: `AGENTS.md` wskazuje niezacommitowaną notatkę o testach adwersarialnych.
  - R3: luka dla planu 2. Nie ma pojęcia „moduł należący do projektu”: funkcja klienta wymaga wpisu w `.wa/kit.json`, a plany 2 i 4 traktują ten plik jako opis kodu z kitu. Propozycja dla planu 2: osobna sekcja albo flaga modułów projektu, pomijana przez `wa update`/`wa diff` i `wa kit sync`.
  - Do tego zgłoszenia ze Step 2.

- [ ] **Step 4: Napisz `docs/01-uruchomienie.md` procedurą P**
  - Źródła: `README.md`, `.env.example`, `docker-compose.yml`, `.nvmrc`, `package.json` (`scripts`, `engines`, `packageManager`), `prisma.config.ts`, `src/shared/lib/env.ts`, `scripts/admin-create.ts`, `scripts/lib/admin-create.ts`.
  - Testy: `src/shared/lib/__tests__/env.test.ts`, `scripts/lib/__tests__/admin-create.test.ts`.
  - Wymagane:
    - Przy zajętym porcie zmienić `DB_PORT` i port w `DATABASE_URL` (oraz analogicznie `MAILPIT_*` i `SMTP_URL`). Wartości domyślne z `.env.example` i `docker-compose.yml`.
    - Każdy błąd walidacji env, który może zobaczyć nowa osoba, z dosłownym komunikatem z `env.ts`.
    - Co pokazuje UI w kombinacjach `MULTI_ORG` × `AUTH_PUBLIC_SIGNUP` (szczegóły w 03/04, tutaj tylko odnośnik).
    - Sekcja „Typowe problemy” jako how-to: objaw → przyczyna → rozwiązanie.
  - Uruchom (sprawdzenie, że opisane komendy istnieją i działają bez niszczenia danych): `docker compose config --services`. Expected: `db` i `mailpit` (albo nazwy z pliku, zapisane w dokumencie dokładnie).

### Task 2: `docs/decyzje.md` — rejestr decyzji

**Files:**
- Create: `docs/decyzje.md`

**Interfaces:**
- Produces: kotwice `d01`…`d27`. Każdy wpis zaczyna się linią `<a id="dNN"></a>`, a pod nią jest nagłówek `## DNN · <tytuł>`. Pozostałe pliki linkują `[DNN](decyzje.md#dNN)`.

Stała lista ID (tytuł roboczy → główne źródło). Wykonawca sprawdza, że każda decyzja obowiązuje w kodzie. Nieobowiązującą pomija bez przenumerowania i dopisuje do notatki rozbieżności.

| ID | Decyzja | Źródło |
|---|---|---|
| D01 | Kod kopiowany do projektu; bez paczek npm i punktów rozszerzeń | spec wa-kit §2 anty-cele, §9 |
| D02 | Aplikacja referencyjna w root repo; własność plików w `.wa/kit.json` | spec §4.1, §6 |
| D03 | Moduł nie edytuje rdzenia; szwy przez pliki generowane i regiony `wa:*` | spec §4.1, §4.3, `CLAUDE.md` |
| D04 | Pliki generowane commitowane, bajtowo równe wyjściu `generate`, poza prettier/eslint | R17 |
| D05 | `module.ts` to czyste dane bezpieczne dla klienta; pola `adminOnly`, `multiOrgRoles`, `public` | R3, R9, R13 |
| D06 | Organizacje w rdzeniu, jeden poziom, `MULTI_ORG` przełącza tylko UI | spec §3.1, §9 |
| D07 | Jawny filtr `organizationId` przez `getOrgContext()`, bez rozszerzenia Prisma | spec §3.1 |
| D08 | Dwa poziomy ról: globalne i w organizacji | spec §3.1 |
| D09 | Pierwszy admin przez `admin:create`, bez strony `initial-account` | spec §9 |
| D10 | Rejestracja przez bramkę serwerową; domyślnie tylko z zaproszenia | spec §9, R7, R8 |
| D11 | Strony chroni `requireModuleAccess` z rejestru; nawigacja nie jest ochroną | R21 |
| D12 | `no-organization` poza guardem `(app)` | R19 |
| D13 | Kit nie commituje migracji; projekt commituje | spec §5, R2, R22 |
| D14 | Prisma w wielu plikach; klient w `src/generated/prisma` | spec §9, R16 |
| D15 | Logger na OpenTelemetry zamiast pino | R15 |
| D16 | `APP_URL` jako publiczny adres (zamiast `BETTER_AUTH_URL`) | commit `50a4d9e` |
| D17 | Ścisła walidacja env: sekret ≥ 32 znaki, flagi tylko `true`/`false` | R18, commit `494224e` |
| D18 | Mail: SMTP → Resend → log | `AGENTS.md` „Mail”, `mailer.ts` |
| D19 | `superadmin` jako rola serwisowa; konta nietykalne dla `admin` | spec superadmina, decyzja 1 |
| D20 | Impersonacja zależna od roli; `ADMIN_IMPERSONATION` | decyzja 2 |
| D21 | Superadmin wchodzi do dowolnej organizacji, zawsze jednej; bez widoków zbiorczych | decyzja 3 |
| D22 | Tryb serwisowy: dialog w UI i potwierdzenie wymuszane w komendzie | decyzja 4 |
| D23 | Bez komentarzy w kodzie | `CLAUDE.md`, `.claude/hooks/block-comments.mjs` |
| D24 | Test architektury: guard sesji i assert trybu serwisowego w entrypointach | commit `6d05826`, `a81b392` |
| D25 | Testy adwersarialne: tester ≠ implementer, testy tylko do odczytu | commity `0650fc4`, `e40c0e8` |
| D26 | Mutation testing i bramka plików krytycznych | commity `c9d7b25`, `54efbcf` |
| D27 | next-intl: `pl` domyślny, `as-needed`, namespace = klucz modułu | spec §3, §4.3 |

- [ ] **Step 1: Przeczytaj źródła:**
  - `docs/superpowers/specs/2026-10-26-wa-kit-design.md`;
  - `docs/superpowers/notes/2026-10-26-plan-1-handoff.md`;
  - `.superpowers/system-admin/spec.md` (lokalnie; nie linkować);
  - `docs/superpowers/notes/2026-10-27-adversarial-testing-research.md` i `docs/superpowers/notes/2026-10-27-plan-1-adversarial-audit.md` (lokalnie);
  - `git show --stat` dla commitów z tabeli.
  Dla każdego wpisu przeczytaj też kod, który decyzję realizuje.
- [ ] **Step 2: Napisz plik.** Wstęp: format wpisu, statusy, zasada stałych ID. Każdy wpis ma pola: status, data, kto zdecydował, kontekst, decyzja, odrzucone alternatywy, konsekwencje, **jak egzekwowana**, źródło.
  - W polu „jak egzekwowana” jest konkretny test, hook, workflow CI albo guard ze ścieżką, a jeśli niczego takiego nie ma — „tylko konwencja”.
  - Alternatywy biorą się ze źródeł. Gdy źródło ich nie podaje, pole brzmi „nie zapisano”.
- [ ] **Step 3: Procedura P kroki 3–6.** Szablon F sprawdza dodatkowo pole „jak egzekwowana” każdego wpisu.

### Task 3: `docs/02-architektura.md`

**Files:**
- Create: `docs/02-architektura.md`

- [ ] **Step 1: Procedura P.**
  - Źródła:
    - `src/proxy.ts`, `src/app/[locale]/(app)/layout.tsx`, `src/app/[locale]/layout.tsx`;
    - `src/shared/lib/auth/require-module-access.ts`, `src/shared/lib/modules/define-module.ts`, `src/shared/lib/modules/nav.ts`;
    - `src/modules.generated.ts`, `src/modules.client.generated.ts`, `.wa/kit.json`;
    - `packages/cli/src/**` (bez testów), `packages/cli/package.json`;
    - `.prettierignore`, `eslint.config.mjs`, `.github/workflows/ci.yml`;
    - `prisma/schema/*.prisma` (markery), `.env.example`, `docker-compose.yml`, `next.config.ts`, `src/instrumentation.ts`, `src/shared/lib/security-headers.ts`.
  - Testy: `packages/cli/src/generate/__tests__/*.test.ts`, `packages/cli/src/manifest/__tests__/*.test.ts`, `src/shared/lib/modules/__tests__/nav.test.ts`, `src/app/[locale]/(app)/__tests__/layout.test.tsx`.
  - Wymagane:
    - „Zasady kitu” z linkami do D01–D05.
    - Diagram kontenerów (`flowchart`).
    - Diagram drogi żądania (`sequenceDiagram`), w którym każda strzałka ma odpowiednik w kodzie.
    - Opis wykrywania feature przez `wa generate` (glob `src/features/<x>/` w `files` i obecność `module.ts`, `env.ts`, `auth.ts`, `auth-client.ts`, `i18n/<locale>.json`).
    - Tabela regionów: plik, marker, źródło treści.
    - `## Referencja`: pola `ModuleDef` i `ModuleNavItem`, schemat manifestu z `packages/cli/src/manifest/schema.ts` (pole, typ, domyślna wartość), lista plików generowanych.
  - Uruchom: `npm run build -w @wa-kit/cli && npm run wa -- generate`. Expected: `Bez zmian`, a `git status --short src/modules*.generated.ts` jest pusty. Inny wynik to rozbieżność: zapisz ją, plików nie commituj.

### Task 4: `docs/03-dane-i-organizacje.md`

**Files:**
- Create: `docs/03-dane-i-organizacje.md`

- [ ] **Step 1: Procedura P.**
  - Źródła:
    - `prisma/schema/*.prisma`, `prisma.config.ts`, `src/shared/lib/prisma.ts`;
    - `src/shared/lib/auth/org-context.ts`, `src/shared/lib/auth/helpers.ts`, `src/shared/lib/auth/single-org-guard.ts`, `src/shared/lib/auth/signup-membership-context.ts`;
    - `src/features/organizations/**` (bez testów);
    - `src/app/[locale]/no-organization/page.tsx`, `src/app/[locale]/accept-invitation/[id]/page.tsx`, `src/shared/lib/env.ts` (`MULTI_ORG`).
  - Testy:
    - `src/shared/lib/auth/__tests__/org-context.test.ts`, `single-org-guard.test.ts`, `signup-membership-context.test.ts`;
    - `src/features/organizations/services/__tests__/*.test.ts`, w tym `organization-isolation.integration.test.ts`;
    - `src/features/organizations/services/queries/__tests__/*.test.ts`, `src/app/[locale]/no-organization/__tests__/page.test.tsx`, `e2e/multi-org.spec.ts`.
  - Wymagane:
    - Diagram ER (`erDiagram`) zgodny z plikami `.prisma`.
    - Pełny kształt zwracany przez `getOrgContext()`, wszystkie gałęzie (członek, superadmin bez członkostwa, brak organizacji) i źródło danych sesji (cache czy świeże dane).
    - Tabela różnic `MULTI_ORG=false`/`true`.
    - Wzór query z filtrem `organizationId` jako dosłowny fragment.
    - `## Referencja`: modele i pola, wyjątki (`NoOrganizationError` i inne).

### Task 5: `docs/04-auth-i-role.md`

**Files:**
- Create: `docs/04-auth-i-role.md`. Jeśli plik przekroczy ~500 linii, podziel go na `04-auth-i-role.md` i `04b-superadmin-i-tryb-serwisowy.md` (spec §8) i popraw linki.

- [ ] **Step 1: Procedura P.**
  - Źródła:
    - `src/shared/lib/auth/*.ts` (wszystkie);
    - `src/features/auth/**`, `src/features/users/**` (bez testów);
    - `src/shared/components/service-mode/*.tsx`;
    - `src/features/organizations/services/commands/enter-organization-command.ts`, `src/features/organizations/components/enter-organization-list.tsx`, `src/features/organizations/components/org-switcher.tsx`;
    - `src/app/api/auth/[...all]/route.ts`;
    - `src/app/[locale]/(auth)/**`, `src/app/[locale]/accept-invitation/[id]/page.tsx`;
    - `src/app/emails/*.tsx`;
    - `scripts/admin-create.ts`, `scripts/lib/admin-create.ts`;
    - `.superpowers/system-admin/spec.md` (lokalnie, tylko jako lista tematów do sprawdzenia).
  - Testy:
    - `src/shared/lib/auth/__tests__/*.test.ts` (w tym `access-matrix.test.ts`, `service-mode.test.ts`, `impersonation-policy.test.ts`, `admin-access.test.ts`, `signup-endpoint.test.ts`);
    - `src/features/auth/services/__tests__/*.test.ts`, `src/features/users/**/__tests__/*.test.ts*`;
    - `src/shared/components/service-mode/__tests__/*.test.tsx`, `e2e/core-auth.spec.ts`.
  - Wymagane:
    - Macierz dostępu przepisana z literału w `access-matrix.test.ts` (wszystkie kombinacje `userRole` × `orgRole` × `multiOrg` × moduł, jak w teście).
    - Tabela impersonacji: kto → pod kogo, z `ADMIN_IMPERSONATION` i bez.
    - Pełna lista `ADMIN_TARGET_PATHS` z kodu.
    - Diagram sekwencji trybu serwisowego: `run` → komenda → błąd potwierdzenia → dialog → ponowne wywołanie z `{ serviceModeConfirmed: true, organizationId }`.
    - Dosłowne komunikaty PL dialogu i paska z `i18n`.
    - Niespójność `toUserRole`/`roleFromStored` opisana jako zachowanie i dopisana do notatki rozbieżności.
    - Linki do D06, D08–D11, D19–D22.
    - `## Referencja`: role, uprawnienia `createAccessControl`, opcje `admin:create`, zmienne env auth.

### Task 6: `docs/05-moduly-rdzenia.md`

**Files:**
- Create: `docs/05-moduly-rdzenia.md`

- [ ] **Step 1: Procedura P.**
  - Źródła: `src/features/{auth,organizations,users,account,dashboard}/**` (bez testów), `src/app/[locale]/(app)/**/page.tsx`, `src/app/[locale]/(auth)/**/page.tsx`, `src/shared/components/**` (bez testów), `src/shared/{config,constants,types,utils}/**`, `components.json`, `src/components/ui/` (lista plików).
  - Testy: `src/features/**/__tests__/*.test.ts*`, `src/shared/components/__tests__/app-sidebar.test.tsx`, `src/app/[locale]/(app)/users/__tests__/page.test.tsx`.
  - Wymagane:
    - Sekcje w kolejności `auth`, `organizations`, `users`, `account`, `dashboard`.
    - W każdej tabela z polami `module.ts` dokładnie takimi, jak w pliku.
    - Każda komenda i query z sygnaturą i jednym zdaniem.
    - Dostęp przez odnośnik do macierzy w 04, bez kopiowania macierzy.

### Task 7: `docs/06-wzorce-kodu.md`

**Files:**
- Create: `docs/06-wzorce-kodu.md`

- [ ] **Step 1: Procedura P.**
  - Źródła:
    - `src/shared/types/common.ts`, `src/shared/utils/error-handling.ts`, `src/shared/lib/auth/service-mode.ts`, `src/shared/components/service-mode/use-service-mode-action.tsx`;
    - po jednej komendzie i query z każdego feature, który je ma (`src/features/*/services/**`);
    - `src/features/*/contracts/*`;
    - `eslint.config.mjs`, `.claude/hooks/block-comments.mjs`, `src/__tests__/server-entrypoints-guard.test.ts`, `AGENTS.md`.
  - Testy: `src/__tests__/server-entrypoints-guard.test.ts`, `src/shared/components/service-mode/__tests__/use-service-mode-action.test.tsx`, `.claude/hooks/block-comments.test.mjs`.
  - Wymagane:
    - Jedna kompletna komenda z repo jako dosłowny fragment (preferowana `src/features/users/services/commands/invite-user-command.ts`, jeśli spełnia kontrakt `(input, confirmation?)`; inaczej inna, która spełnia).
    - Jedno wywołanie z UI przez `run`.
    - Które reguły stylu wymusza eslint, które hook, a które tylko konwencja — sprawdzone w konfiguracji, nie z `AGENTS.md`.
    - Mechanizm `UNGUARDED_ALLOWED` z dosłownym przykładem wpisu, jeśli lista nie jest pusta.
    - Ograniczenia testu architektury: tylko odnośnik do `AGENTS.md` i jedno zdanie streszczenia (decyzja Jakuba: lista zostaje w `AGENTS.md`).

### Task 8: `docs/07-i18n-mail-env.md`

**Files:**
- Create: `docs/07-i18n-mail-env.md`

- [ ] **Step 1: Procedura P.**
  - Źródła: `src/i18n/*.ts`, `src/app/messages/*.json` (struktura kluczy), `src/features/*/i18n/*.json` (lista), `src/shared/lib/mailer.ts`, `src/app/emails/**`, `src/shared/lib/env.ts`, `.env.example`, `src/shared/lib/logger.ts`, `src/instrumentation.ts`, `src/shared/lib/security-headers.ts`, `next.config.ts`, `src/app/api/healthcheck/route.ts`.
  - Testy: `src/i18n/__tests__/merge-messages.test.ts`, `src/shared/lib/__tests__/mailer.test.ts`, `src/shared/lib/__tests__/env.test.ts`, `src/app/api/healthcheck/__tests__/route.test.ts`.
  - Wymagane:
    - Kolejność wyboru transportu maila i zachowanie na produkcji (warunek z kodu, dosłownie).
    - Jak `merge-messages` łączy namespace modułu z komunikatami rdzenia i co robi przy kolizji.
    - `## Referencja`: tabela wszystkich zmiennych z `env.ts` (nazwa, typ/parsowanie, domyślna, wymagana na produkcji, opis). Zmienne z `.env.example`, których nie ma w `env.ts`, idą do notatki rozbieżności (i odwrotnie).

### Task 9: `docs/08-testy.md`

**Files:**
- Create: `docs/08-testy.md`

- [ ] **Step 1: Procedura P.**
  - Źródła:
    - `vitest.config.ts`, `vitest.integration.config.ts`, `vitest.setup.ts`, `src/test/**`, `playwright.config.ts`, `e2e/*.ts`;
    - `stryker.config.json`, `stryker.integration.config.json`, `mutation-gate.json`, `scripts/mutation-gate.ts`, `scripts/lib/mutation-gate.ts`;
    - `.claude/agents/test-writer.md`, `.claude/agents/test-reviewer.md`, `.claude/hooks/protect-tests.mjs`;
    - `.github/workflows/mutation.yml`, `.github/workflows/e2e.yml`, `turbo.json`;
    - notatki o testach adwersarialnych (lokalnie; nie linkować).
  - Testy: `scripts/lib/__tests__/mutation-gate.test.ts`, `e2e/__tests__/database-guard.test.ts`, `.claude/hooks/protect-tests.test.mjs`.
  - Wymagane:
    - Lista każdej komendy, która czyści albo przebudowuje bazę: `npm run test:e2e` (`globalSetup`), `npm run test:integration` (`db push`, `resetDatabase`). Dla każdej: którą bazę rusza, skąd bierze URL i jakie ma zabezpieczenie nazwy (`_e2e`, `_test`), dosłownie z kodu.
    - Próg `thresholds.break` i pozostałe progi z `stryker.config.json`.
    - Pola `mutation-gate.json` i jeden dosłowny wpis `allowed` jako przykład.
    - Wzór testu izolacji organizacji jako dosłowny fragment z `organization-isolation.integration.test.ts`.
    - Przebieg zadania z test-writer/test-reviewer jako diagram (`flowchart`).
    - `## Referencja`: komendy testowe (z `package.json`) i pliki konfiguracji.

### Task 10: `docs/09-nowy-modul.md` — tutorial wykonany naprawdę

**Files:**
- Create: `docs/09-nowy-modul.md`, `$S/tutorial-snapshot/**`
- Roboczo (usuwane w Step 9): worktree `$S/wa-kit-tutorial`, gałąź `docs/tutorial-scratch`, bazy `wa_app_tutorial` i `wa_app_tutorial_test` w `wa-kit-db-1` (bazy zostają; patrz Step 9)

**Interfaces:**
- Przykładowy feature: `notes` (notatki organizacji).
  - Model `Note` (tabela `notes`): `id`, `organizationId` (wymagane, indeks, relacja do `Organization`), `title`, `createdAt`.
  - Relacja zwrotna: `schemaRelations: [{ "model": "Organization", "field": "notes Note[]" }]`.
  - Query `listNotesQuery()`, komenda `createNoteCommand(input: unknown, confirmation?: unknown)`, strona `/notes`.

- [ ] **Step 1: Przygotuj worktree projektu**

  ```bash
  git worktree add $S/wa-kit-tutorial -b docs/tutorial-scratch 4a6ffcb
  ```

  W worktree: `npx -y npm@11.21.1 ci`, `cp .env.example .env`. W `.env` ustaw:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5439/wa_app_tutorial`;
  - `BETTER_AUTH_SECRET` z `openssl rand -base64 32`.

  Potem `npx prisma migrate dev --name init` (stan „projekt klienta po starcie”).
  Expected: migracja `init` utworzona, baza `wa_app_tutorial` istnieje.

- [ ] **Step 2: Objaw braku wpisu w `.wa/kit.json`.**
  - Utwórz `src/features/notes/module.ts` i `i18n/{pl,en}.json`, jeszcze bez wpisu w `.wa/kit.json`.
  - Uruchom `npm run build -w @wa-kit/cli && npm run wa -- generate`.
  - Expected: `Bez zmian`, `notes` nie ma w `src/modules.generated.ts`.
  - Z kodu `require-module-access.ts` zapisz, co dzieje się dla klucza spoza rejestru. To trafi do tutorialu jako objaw.

- [ ] **Step 3: Dodaj wpis modułu `notes` do `.wa/kit.json`** (manifest zgodny ze schematem z `packages/cli/src/manifest/schema.ts`):
  - `files`: `src/features/notes/**`, `src/app/[locale]/(app)/notes/**`, `prisma/schema/notes.prisma`;
  - `schemaRelations` jak w Interfaces.

  Potem `npm run wa -- generate`.
  Expected: zmienione `src/modules.generated.ts`, `src/modules.client.generated.ts`, `prisma/schema/organizations.prisma` (region `wa:relations`).

- [ ] **Step 4: Schemat i migracja.** `prisma/schema/notes.prisma`, potem `npx prisma migrate dev --name add-notes`. Expected: migracja `add-notes` z tabelą `notes` i indeksem na `organizationId`.

- [ ] **Step 5: Kod feature według `06-wzorce-kodu.md`:**
  - `contracts/note.schemas.ts`, `services/queries/list-notes-query.ts`, `services/commands/create-note-command.ts`;
  - `components/notes-manager.tsx` (wywołanie przez `useServiceModeAction().run`);
  - `src/app/[locale]/(app)/notes/page.tsx` z `requireModuleAccess("notes")`.
  Każdy plik opiera się na istniejącym wzorcu. Zapisz, na którym, do tutorialu.

- [ ] **Step 6: Testy.**
  - Unit: `src/features/notes/services/commands/__tests__/create-note-command.test.ts`. Asercje: niepoprawne wejście → błąd walidacji; brak organizacji → błąd; tryb serwisowy bez potwierdzenia → komunikat „Potwierdź zmianę w trybie serwisowym”; zapis z `organizationId` z kontekstu, nie z wejścia.
  - Integracyjny: `src/features/notes/services/__tests__/notes-isolation.integration.test.ts`. Asercje: dwie organizacje, `listNotesQuery` z kontekstem A nie zwraca notatki B, `createNoteCommand` z kontekstem A zapisuje `organizationId` A.
  - Wzory: istniejące testy z zadania 9.

- [ ] **Step 7: Bramki w worktree**

  Run: `npm run verify`
  Expected: kod 0 (w tym `server-entrypoints-guard.test.ts` z nowymi plikami).

  Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5439/wa_app_tutorial_test npm run test:integration`
  Expected: PASS, w tym test izolacji `notes`.

  Run: `npm run test:mutation:task -- src/features/notes/services/commands/create-note-command.ts`
  Expected: raport z wynikiem. Wynik i czas trwania zapisz do tutorialu. Przeżyłe mutanty opisz tak, jak są — nie poprawiaj ich na siłę.

- [ ] **Step 8: Snapshot.** Skopiuj wszystkie nowe i zmienione pliki worktree do `$S/tutorial-snapshot/` z zachowaniem ścieżek (`git -C $S/wa-kit-tutorial status --short` jako lista). Dodaj `git diff` do `$S/tutorial-snapshot/changes.diff`.

- [ ] **Step 9: Sprzątanie**

  ```bash
  git worktree remove --force $S/wa-kit-tutorial
  git branch -D docs/tutorial-scratch
  ```

  Baz nie usuwaj. W raporcie końcowym podaj Jakubowi nazwy `wa_app_tutorial` i `wa_app_tutorial_test` do ewentualnego usunięcia.

- [ ] **Step 10: Napisz `docs/09-nowy-modul.md` procedurą P**, sprawdzając skryptem z `--alt-root $S/tutorial-snapshot`.
  - Kroki tutorialu w kolejności Step 1–7 (Step 1 jako „projekt po starcie”).
  - Ostrzeżenie przy wpisie w `.wa/kit.json` odsyła do `znane-ograniczenia.md` (pozycja powstaje w zadaniu 13).
  - Różnice projekt ↔ repo kitu (migracje, `.gitignore`).
  - Objaw ze Step 2.
  - Pod tutorialem sekcja how-to „Nowa funkcja w istniejącym module”.
  - Pułapki z przebiegu, każda z dokładnym komunikatem błędu.

### Task 11: `docs/10-wdrozenie.md`

**Files:**
- Create: `docs/10-wdrozenie.md`

- [ ] **Step 1: Procedura P.**
  - Źródła: `Dockerfile`, `.dockerignore`, `railway.toml`, `next.config.ts` (`output`), `.github/workflows/*.yml`, `README.md` (sekcja Railway), `scripts/admin-create.ts`, `.gitignore`, `src/app/api/healthcheck/route.ts`, `src/shared/lib/env.ts` (wymogi produkcji).
  - Wymagane:
    - Każdy workflow: wyzwalacz (`on:`) i joby, dosłownie z pliku.
    - Zmienne wymagane na produkcji według `env.ts`.
    - Procedura przekazania klientowi: konta, kolejność, odcięcie dostępu Web Amigos (link do D19).
    - Usunięcie linii `prisma/migrations/` z `.gitignore` w projekcie (link do D13).

### Task 12: `docs/11-praca-z-kitem.md`

**Files:**
- Create: `docs/11-praca-z-kitem.md`

- [ ] **Step 1: Procedura P.**
  - Źródła: `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `.claude/hooks/*.mjs`, `.claude/agents/*.md`, `.husky/*`, `.lintstagedrc.json`, `commitlint.config.mjs`, `.coderabbit.yaml`, `package.json` (`verify`), `.gitignore` (`.superpowers/`), `docs/superpowers/` (lista plików).
  - Wymagane:
    - Co zgłaszać do `webamigos/wa-kit`, a co zostawić w projekcie.
    - Po co są dwa pliki `CLAUDE.md` i `AGENTS.md` (import `@AGENTS.md`).
    - Każdy hook: na jakie narzędzia działa i co blokuje (z `settings.json` i kodu hooka).
    - Proces superpowers jako krótki opis z linkami do istniejących specu i planów, bez kopiowania ich treści.

### Task 13: `znane-ograniczenia.md`, `docs/README.md`, odnośniki poza `docs/`, kontrola całości

**Files:**
- Create: `docs/znane-ograniczenia.md`, `docs/README.md`
- Modify: `AGENTS.md` (sekcja „Co to jest”, jedna linia), `README.md` (sekcja „wa-kit”, jedna linia), `docs/superpowers/specs/2026-10-26-wa-kit-design.md` (§3.1, tylko zdanie „Szczegóły: …”)

- [ ] **Step 1: `docs/znane-ograniczenia.md` procedurą P.**
  - Źródła: sekcja „Odłożone” z `docs/superpowers/notes/2026-10-26-plan-1-handoff.md`, „Otwarte sprawy” z `.claude/handoffs/2026-10-27-1705-handoff.md` (lokalnie), notatka rozbieżności.
  - Każdą pozycję sprawdź w kodzie. Nieaktualna odpada, a w raporcie jest zdanie, dlaczego. Aktualna dostaje: skutek dla dewelopera, plik, obejście (jeśli jest).
  - Obowiązkowa pozycja: funkcja klienta w `.wa/kit.json` (R3) z kotwicą, do której linkuje 09.
  - Tutaj wolno pisać o planach (spec §4).
- [ ] **Step 2: `docs/README.md` procedurą P.** Zawartość według spec §5:
  - indeks wszystkich plików z jednym zdaniem o każdym;
  - ścieżki czytania;
  - słownik pojęć (każde pojęcie z odnośnikiem do pliku, który je opisuje);
  - sekcja „Czego ta dokumentacja nie opisuje” z linkami do planów w `docs/superpowers/plans/`.
- [ ] **Step 3: Odnośniki poza `docs/`.**
  - `AGENTS.md` i `README.md` dostają tę samą linię tekstu (nie linku): „Dokumentacja kitu: `docs/README.md` w repo `webamigos/wa-kit`. Opisuje najnowszą wersję kitu; wersję projektu podaje `.wa/kit.json`.”
  - W design doc §3.1 zamień `Szczegóły: \`.superpowers/system-admin/spec.md\`.` na `Szczegóły: [docs/04-auth-i-role.md](../../04-auth-i-role.md), decyzje D19–D22 w [docs/decyzje.md](../../decyzje.md).` Ścieżki dopasuj, jeśli zadanie 5 podzieliło plik 04.
  - Nie zmieniaj niczego więcej w tych plikach. Design doc ma niezacommitowaną zmianę z innej sesji, której nie wolno ruszać.
- [ ] **Step 4: Kontrola całości**

  Run: `node $S/check-docs.mjs docs/*.md AGENTS.md README.md docs/superpowers/specs/2026-10-26-wa-kit-design.md`
  Expected: jedyne zgłoszenie to `BRAK` dla notatki o testach adwersarialnych w `AGENTS.md` (R2), dopóki Jakub jej nie zacommituje. Każde inne zgłoszenie trzeba usunąć.

  Run: `npm run verify`
  Expected: kod 0. Zmiany w `AGENTS.md` i `README.md` nie mogą zepsuć lint-staged ani testów hooków.

  Run: `git status --short`
  Expected: nowe `docs/*.md`, zmienione `AGENTS.md`, `README.md` i `docs/superpowers/specs/2026-10-26-wa-kit-design.md`, nowe plan, spec i notatka rozbieżności. Nic poza tym (pliki innych sesji jak na starcie).

- [ ] **Step 5: Raport dla Jakuba.**
  - Lista plików z liczbą linii.
  - Streszczenie notatki rozbieżności: każdy wpis w jednym zdaniu, najważniejsze pierwsze.
  - Bazy tutorialu do ewentualnego usunięcia.
  - Pytanie o commit (bez commitowania).
