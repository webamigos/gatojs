# Sprawdzenia startowe modułów i prawo zapisu dla `local` — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serwer z providerem `local` modułu `uploads`, który nie może pisać do katalogu magazynu, kończy się przy starcie raportem na konsoli i kodem 1, zamiast zwracać 500 `storage_failed` przy pierwszym uploadzie.

**Architecture:** Generator CLI zbiera z modułów opcjonalny plik `startup-check.ts` do tablicy `startupChecks` w rejestrze serwerowym. Rdzeń w `register()` po udanej walidacji `env` uruchamia sprawdzenia z tej tablicy, zbiera problemy do jednego raportu na `console.error` i kończy proces kodem 1. Moduł `uploads` dostarcza sprawdzenie, które przy `local` zakłada katalog, zapisuje w nim pusty plik próbny i go usuwa, a przy `s3` nic nie robi.

**Tech Stack:** Next.js 16.4 (`instrumentation.ts`), `node:fs/promises`, `node:crypto`, `node:path`, Vitest, Stryker, CLI `wa` (bundel esbuild `.wa/bin/wa.mjs`).

**Spec:** [docs/superpowers/specs/2026-11-05-uploads-startup-write-check-design.md](../specs/2026-11-05-uploads-startup-write-check-design.md), zatwierdzony przez Jakuba 2026-11-05 (commit `45633dc`). Wykonawca czyta spec razem z planem.

## Global Constraints

- Reguły `CLAUDE.md` i `AGENTS.md` w każdym zadaniu: bez komentarzy w kodzie poza `// WHY:` (najwyżej 3 linie) i dyrektywami narzędzi; bez `any`, zagnieżdżonych ternary i cichych `catch {}`.
- Konwencja szwu: plik `src/features/<katalog>/startup-check.ts` z nazwanym eksportem `startupCheck(env: CoreEnv): Promise<string[]>`. Pusta lista znaczy, że wszystko jest w porządku.
- Rejestr serwerowy `src/modules.generated.ts`: import `import { startupCheck as <camel>StartupCheck } from "@/features/<katalog>/startup-check";` po importach `audit-sink`, a tablica `export const startupChecks = [{ key: "<katalog>", check: <camel>StartupCheck }];` zaraz po linii `auditSinks`. Bez modułów ze sprawdzeniem: `export const startupChecks: never[] = [];`. `<camel>` liczy istniejąca funkcja `identifier` (`audit-logs` → `auditLogs`). Rejestr kliencki się nie zmienia.
- Raport sprawdzeń: pierwsza linia `Sprawdzenia startowe modułów nie przeszły (<liczba problemów>):`, potem po jednej linii `- <key>: <komunikat>` na problem, w kolejności rejestru i w kolejności zwróconej przez sprawdzenie. Wyjątek albo odrzucona obietnica sprawdzenia daje komunikat `sprawdzenie zakończyło się błędem: <error.message dla Error, String(error) dla innej wartości>`. Raport idzie przez `processStartupIo` (`console.error`), potem `exit(1)`.
- Sprawdzenia działają tylko w runtime `nodejs`, tylko gdy walidacja `env` nie zgłosiła problemów i nie trwa faza `next build`, zawsze przed konfiguracją eksportu logów OTel.
- Komunikat `uploads`, dosłownie: `nie można zapisać pliku w katalogu <katalog> (<code>)<uid>. Na Railway ustaw RAILWAY_RUN_UID=0 albo przejdź na Railway Bucket (STORAGE_PROVIDER=s3). W Dockerze podepnij nowy wolumen pod /app/volumes/uploads albo nadaj użytkownikowi procesu prawo zapisu do tego katalogu.` `<code>` to pole `code` błędu, a `<uid>` to `, proces działa z UID <liczba>` albo pusty napis, gdy UID jest nieznany. Odstępstwo od specu 4.2: komunikat nie ma wariantu „treść błędu, gdy kodu nie ma”, bo błędy `node:fs/promises` i błędy argumentów Node zawsze mają `code`, więc ta gałąź byłaby martwa, a jej mutant nie do zabicia.
- Plik próbny: `<katalog>/.write-check-<randomUUID()>`, zapis pustej treści z flagą `wx`, potem usunięcie. Przed zapisem `mkdir(<katalog>, { recursive: true })`.
- Wersje: `kit/modules/core.json` `0.5.0` → `0.6.0` raz, w Task 1; `kit/modules/uploads.json` `0.2.0` → `0.3.0` raz, w Task 3. Po zmianie manifestu: `npm run wa -- kit sync && npm run wa -- generate`, a drugi przebieg tej komendy niczego nie zmienia.
- Zmiana w `kit/cli/src`: `npm run build --prefix kit/cli` i `.wa/bin/wa.mjs` w tym samym commicie. Bramka CLI: `npm run verify --prefix kit/cli`.
- Zmiany rdzenia (Task 1 i 2) i modułu (Task 3) w osobnych commitach (`kit/CLAUDE.md`).
- Testy aplikacji uruchamiaj przez `env -i PATH="$PATH" HOME="$HOME" npx vitest run <pliki>`, żeby nie zależały od lokalnego `.env`.
- Wpisy `allowed` w `mutation-gate.json` i `kit/cli/mutation-gate.json` dopisuje tylko Jakub. Agent proponuje je w raporcie z uzasadnieniem.
- Commity: Conventional Commits, temat małymi literami, stopka `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Bez pusha, PR i uruchamiania workflowów bez zgody Jakuba.
- Dokumentacja po polsku, w stylu bezczasowym. W każdym zmienionym pliku `docs/` podbij nagłówek `Zweryfikowano z kodem: <krótki sha>, <data>`. Twierdzenia niesprawdzone na żywym systemie oznacz „(niesprawdzone)”.

## Przygotowanie (raz, przed Task 1)

- Worktree `/Users/jakubszewczyk/Documents/WebAmigos/wa-kit/.claude/worktrees/kind-goldberg-a73811`, gałąź `claude/kind-goldberg-a73811` na `feat/uploads-storage-provider` (PR #15), spec w `45633dc`. Wszystkie komendy uruchamiaj stąd.
- `npm ci`, `npm ci --prefix kit/cli` i `npm run db:generate`. Worktree nie ma `kit/cli/node_modules` ani `src/generated`. Brak `.env` jest celowy, bo `npm run build` ma działać bez niego.
- `df -h /System/Volumes/Data`: przed `npm run build`, `npm run test:e2e` i mutacjami potrzeba co najmniej 15 GB wolnego miejsca.
- Hook ochrony testów: `mkdir -p .superpowers && printf implement > .superpowers/phase`, potem narzędziem Edit spróbuj dopisać pustą linię na końcu `src/features/uploads/services/__tests__/path-inside.test.ts`. Oczekiwane: hook blokuje edycję. Jeśli edycja przeszła, cofnij ją (`git checkout -- src/features/uploads/services/__tests__/path-inside.test.ts`) i zapisz w ledgerze, że w tym worktree chronią testy tylko sumy SHA. Na koniec `rm .superpowers/phase`.
- Ledger SDD: `.superpowers/sdd/2026-11-05-uploads-startup-write-check/progress.md`.

## Proces każdego zadania

Wymagany przez `AGENTS.md`. Kroki zadań zakładają ten cykl i go nie powtarzają.

1. Subagent `test-writer` pisze i poprawia testy z sekcji „Zachowania”, „Mutacje do zabicia” i „Interfaces”. Pokazuje czerwony przebieg z właściwego powodu: brak symbolu albo złe zachowanie, nie błąd składni.
2. Orkiestrator zapisuje sumy plików testowych zadania (`shasum -a 256 <pliki> > .superpowers/sdd/2026-11-05-uploads-startup-write-check/task-<n>.sha`) i `printf implement > .superpowers/phase`. Implementer pisze kod i nie dotyka testów. Błędny test zgłasza.
3. Orkiestrator: `rm .superpowers/phase` i `shasum -a 256 -c .superpowers/sdd/2026-11-05-uploads-startup-write-check/task-<n>.sha` (wszystkie `OK`). Subagent `test-reviewer` uruchamia mutacje z kroku zadania i bramkę. Przeżyły mutant w pliku z `critical` wraca do testera albo dostaje propozycję wpisu `allowed`.
4. Recenzja kodu zadania, potem commit.

Wszyscy subagenci i recenzenci pracują na Opusie (pamięć projektu: dokładność ponad tempo).

## Gałąź i PR

Jedna gałąź `claude/kind-goldberg-a73811` i jeden PR po Task 4, otwarty na prośbę Jakuba. Dopóki PR #15 nie trafi do `main`, PR celuje w `feat/uploads-storage-provider`. Po scaleniu #15 gałąź dostaje `main`, a PR celuje w `main`. Numery `core` (#12 i #13: `0.4.1`, scalony #16: `0.4.2`, #15: `0.5.0`) i decyzji (D47 w #14) ustalamy przy scalaniu. PR #14 też zmienia `kit/cli`, więc po jego scaleniu trzeba przebudować bundel.

## Review Focus

1. **Katalog magazynu z istniejącymi plikami** (`orgs/<id>/editor-image/a.png`). Oczekiwane: start przechodzi, w katalogu nic nie przybywa ani nie znika, a treść plików się nie zmienia. Test: Task 3.
2. **Sprawdzenie modułu rzuca wyjątek albo odrzuca obietnicę** (błąd w kodzie modułu). Oczekiwane: czytelna linia raportu z nazwą modułu, problemy pozostałych modułów nadal w raporcie, kod wyjścia 1, bez nieobsłużonego odrzucenia. Test: Task 2.
3. **Błędne `env` i jednocześnie katalog bez prawa zapisu.** Oczekiwane: tylko raport `env`, bo sprawdzenia modułów działałyby na niezweryfikowanej konfiguracji. Test: Task 2.
4. **Faza `next build` i runtime Edge.** Oczekiwane: żadne sprawdzenie się nie uruchamia, więc build nie zakłada katalogów. Test: Task 2.
5. **Katalog jeszcze nie istnieje** (nowy podkatalog wolumenu albo pierwsze `npm run dev`). Oczekiwane: powstaje razem z katalogami nadrzędnymi i start przechodzi. Test: Task 3.

---

### Task 1: Generator dopisuje `startup-check.ts` do rejestru (rdzeń)

**Files:**
- Modify: `kit/cli/src/generate/registry.ts` (pole `hasStartupCheck` w `RegistryModule`, import i tablica `startupChecks` w `renderRegistry`)
- Modify: `kit/cli/src/generate/index.ts` (`detectFeature`)
- Build: `.wa/bin/wa.mjs` (`npm run build --prefix kit/cli`)
- Generate: `src/modules.generated.ts`. Dochodzi tylko `export const startupChecks: never[] = [];`, bo żaden moduł nie ma jeszcze pliku.
- Modify: `kit/modules/core.json` (`version` `0.6.0`), `.wa/kit.json` przez `kit sync`
- Test: Modify `kit/cli/src/generate/__tests__/registry.test.ts`, `generate-rendering.test.ts` i `generate.test.ts`. Literały `RegistryModule` (`base`, `demo` i pozostałe) dostają `hasStartupCheck: false`. Pełne oczekiwane treści rejestru serwerowego dostają linię `"export const startupChecks: never[] = [];"` zaraz po linii `auditSinks`.
- Docs (listy plików czytanych przez generator): `docs/02-architektura.md` (drzewo feature i zdanie pod nim), `docs/02b-rejestr-i-generator.md` (tabela plików, lista zdarzeń wymagających `generate`, opis wykrywania), `docs/09b-implementacja-i-bramki.md`, `docs/11-praca-z-kitem.md`, `docs/decyzje.md` (tabela w D03 i punkt w D04) oraz `AGENTS.md` (zdanie „opcjonalnie …” w „Moduły i pliki generowane”).

**Interfaces:**
- Produces: `RegistryModule.hasStartupCheck: boolean`, ustawiane w `detectFeature` przez `exists(join(base, "startup-check.ts"))`; rejestr serwerowy w formacie z Global Constraints.

**Zachowania** (`base` z `registry.test.ts`, `BOTH` = `["pl", "en"]`):
- `renderRegistry([{ name: "uploads", ...base, hasStartupCheck: true }], BOTH).server.split("\n")` zawiera `'import { startupCheck as uploadsStartupCheck } from "@/features/uploads/startup-check";'` i `'export const startupChecks = [{ key: "uploads", check: uploadsStartupCheck }];'`.
- `name: "audit-logs"` z `hasStartupCheck: true` → linia `'export const startupChecks = [{ key: "audit-logs", check: auditLogsStartupCheck }];'`.
- `alpha` i `beta` z `hasStartupCheck: true`, w tej kolejności → linia `'export const startupChecks = [{ key: "alpha", check: alphaStartupCheck }, { key: "beta", check: betaStartupCheck }];'`, a import `alpha` stoi przed importem `beta`.
- Żaden moduł bez `hasStartupCheck` → linia `"export const startupChecks: never[] = [];"`, a `server` nie zawiera `"startup-check"`.
- `uploads` ze sprawdzeniem i `b` bez niego → `server` nie zawiera `"@/features/b/startup-check"` ani `"bStartupCheck"`.
- Moduł z `hasAuditSink: true` i `hasStartupCheck: true` → linia importu `auditSink` przed linią importu `startupCheck`, a linia `auditSinks` przed linią `startupChecks`.
- `client` nie zawiera `"startup-check"` ani `"startupChecks"`, także dla modułu z `hasStartupCheck: true`.
- `generate(dir)` dla projektu z `alpha` (tylko `src/features/alpha/startup-check.ts` o treści `export const startupCheck = async () => [];`) i `beta` (tylko `module.ts`) → `src/modules.generated.ts` zawiera `'import { startupCheck as alphaStartupCheck } from "@/features/alpha/startup-check";\n'` i `'export const startupChecks = [{ key: "alpha", check: alphaStartupCheck }];\n'`, nie zawiera `"@/features/beta/startup-check"`; `src/modules.client.generated.ts` nie zawiera `"startup-check"`.
- `generate(dir)` dla `alpha` z plikiem `src/features/alpha/startupCheck.ts` (inna nazwa) i `module.ts` → `src/modules.generated.ts` zawiera `"export const startupChecks: never[] = [];"`.

**Mutacje do zabicia:** zła nazwa wykrywanego pliku; filtr modułów ze sprawdzeniem zastąpiony wszystkimi modułami; wpis w rejestrze klienckim; `key` z identyfikatora camelCase zamiast nazwy katalogu; pusta tablica bez typu `never[]`; zmieniona kolejność wpisów albo linii.

- [ ] **Step 1:** Testy. `npm test --prefix kit/cli -- src/generate` → FAIL (brak linii `startupChecks`).
- [ ] **Step 2:** Implementacja w `registry.ts` i `index.ts`.
- [ ] **Step 3:** `npm test --prefix kit/cli -- src/generate` → PASS.
- [ ] **Step 4:** `npm run build --prefix kit/cli`, podbicie `core.json`, `npm run wa -- kit sync && npm run wa -- generate`. `git diff src/modules.generated.ts` pokazuje tylko nową linię `startupChecks`. Drugi przebieg tej komendy niczego nie zmienia (`git status --short` bez nowych pozycji).
- [ ] **Step 5:** Dokumentacja z listy „Docs”.
- [ ] **Step 6:** `npm run test:mutation:task --prefix kit/cli -- src/generate/registry.ts,src/generate/index.ts` i `npm run test:mutation:gate --prefix kit/cli`. `src/generate/` jest w `critical` CLI.
- [ ] **Step 7:** `npm run verify --prefix kit/cli` i `npm run verify` → PASS. Commit `feat(core): collect module startup checks in the registry`.

### Task 2: Uruchamianie sprawdzeń w `register()` (rdzeń)

**Files:**
- Create: `src/shared/lib/startup-checks.ts`
- Modify: `src/shared/lib/env.ts` (`verifyEnvOnStartup` zwraca zweryfikowane `env` albo `null`)
- Modify: `src/instrumentation.ts`
- Test:
  - Create `src/shared/lib/__tests__/startup-checks.test.ts` z mockiem `@/modules.generated` (`startupChecks` z `vi.hoisted`), żeby wynik nie zależał od zainstalowanych modułów;
  - Create `src/__tests__/instrumentation-startup-checks.test.ts` z mockiem `@/modules.generated` (`moduleEnvSchemas: []`, `startupChecks` z `vi.hoisted`) i poprawnymi zmiennymi rdzenia przez `vi.stubEnv` (`NEXT_RUNTIME=nodejs`, `DATABASE_URL`, `BETTER_AUTH_SECRET` z co najmniej 32 znakami, `APP_URL`, `EMAIL_FROM`, pusty `OTEL_EXPORTER_OTLP_ENDPOINT`, chyba że przypadek mówi inaczej);
  - Modify `src/shared/lib/__tests__/env-startup.test.ts` (wartość zwracana).
  - `src/__tests__/instrumentation.test.ts` zostaje bez zmian. Jego przypadki mają błędne `env`, więc sprawdzenia modułów się w nich nie uruchamiają.
- Docs:
  - `docs/12-moduly-kitu.md`: wiersz `startupChecks` w tabeli tablic rejestru (plik `startup-check.ts`, eksport `startupCheck`; czyta `verifyStartupChecks` w `src/shared/lib/startup-checks.ts`, wołane z `register()`; pusta: brak sprawdzeń) i wiersz `StartupCheck` w tabeli punktów wejścia;
  - `docs/07-i18n-mail-env.md` (`#walidacja-env`): po udanej walidacji sprawdzenia modułów z osobnym raportem;
  - `docs/07b-logi-naglowki-healthcheck.md`: raport sprawdzeń też idzie na konsolę;
  - `docs/10-wdrozenie.md` (`#blad-env`): drugi rodzaj raportu startowego;
  - `docs/16b-rozwoj-kitu.md`, krok 1 „Szew w rdzeniu”: szew `startupChecks` (zmiana CLI z podbiciem `core`, sha z Task 1).

**Interfaces:**
- Consumes: `startupChecks` z `@/modules.generated` (Task 1); `CoreEnv` i `processStartupIo` z `@/shared/lib/env`.
- Produces (`src/shared/lib/startup-checks.ts`):
  ```ts
  export type StartupCheck = (env: CoreEnv) => Promise<string[]>;
  export interface ModuleStartupCheck { key: string; check: StartupCheck }
  export async function verifyStartupChecks(
    env: CoreEnv,
    io: { error: (message: string) => void; exit: (code: number) => void },
    checks: readonly ModuleStartupCheck[] = startupChecks,
  ): Promise<void>;
  ```
  Sprawdzenia uruchamiane kolejno, każde z własnym przechwyceniem wyjątku.
- Produces (`src/shared/lib/env.ts`): `verifyEnvOnStartup(source, io): CoreEnv | null`. Przy sukcesie zwraca `env` z `checkEnv`, a w fazie buildu i po zgłoszeniu problemów zwraca `null`, także gdy `io.exit` nie kończy procesu.
- `register()` zamiast dzisiejszego samego wywołania walidacji:
  ```ts
  const env = verifyEnvOnStartup(process.env, processStartupIo);
  if (env) {
    const { verifyStartupChecks } = await import("@/shared/lib/startup-checks");
    await verifyStartupChecks(env, processStartupIo);
  }
  ```

**Zachowania** (`startup-checks.test.ts`; `env` to literał `CoreEnv` z poprawnymi zmiennymi rdzenia; `io` z `vi.fn`):
- `verifyStartupChecks(env, io, [])` → `io.error` i `io.exit` bez wywołań.
- `[{ key: "demo", check }]`, gdzie `check` zwraca `[]` → `io` bez wywołań; `check` wywołane raz, z tym samym obiektem `env` (`toBe`).
- `check` zwraca `["katalog nie do zapisu"]` → `io.error` raz z `"Sprawdzenia startowe modułów nie przeszły (1):\n- demo: katalog nie do zapisu"`, `io.exit` raz z `1`, `io.error` przed `io.exit` (`mock.invocationCallOrder`).
- `alpha` zwraca `["a1", "a2"]`, `beta` zwraca `["b1"]` → `io.error` z `"Sprawdzenia startowe modułów nie przeszły (3):\n- alpha: a1\n- alpha: a2\n- beta: b1"`.
- `alpha` rzuca synchronicznie `new Error("boom")`, `beta` zwraca `["b1"]` → `io.error` z `"Sprawdzenia startowe modułów nie przeszły (2):\n- alpha: sprawdzenie zakończyło się błędem: boom\n- beta: b1"`; `beta` wywołane.
- `alpha` zwraca `Promise.reject("x")` → raport z linią `- alpha: sprawdzenie zakończyło się błędem: x`.
- Bez trzeciego argumentu, z mockiem rejestru `startupChecks: [{ key: "z-rejestru", check: async () => ["x"] }]` → `io.error` z `"Sprawdzenia startowe modułów nie przeszły (1):\n- z-rejestru: x"`.

**Zachowania** (`env-startup.test.ts`, istniejące `validCore`, `brokenEnv` i `createIo`):
- `verifyEnvOnStartup(validCore, io)` → obiekt z `DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wa"` i `DEMO_TOKEN: "t"` (`toMatchObject`).
- `verifyEnvOnStartup(brokenEnv, io)`, gdzie `io.exit` nie kończy procesu → `null`.
- `verifyEnvOnStartup({ NEXT_PHASE: "phase-production-build" }, io)` → `null`.

**Zachowania** (`instrumentation-startup-checks.test.ts`; `process.exit` i `console.error` szpiegowane z pustą implementacją; sprawdzenie `demo` to `vi.fn`):
- Poprawne `env`, `demo` zwraca `["zły katalog"]` → `console.error` z `"Sprawdzenia startowe modułów nie przeszły (1):\n- demo: zły katalog"`, `process.exit` z `1`; `demo` wywołane raz z obiektem zawierającym `DATABASE_URL` ze `stubEnv`.
- Poprawne `env`, `demo` zwraca `[]` → bez `process.exit` i bez `console.error`.
- `DATABASE_URL=""` → `demo` bez wywołań; `process.exit` wywołane z `1` dokładnie raz.
- `NEXT_PHASE=phase-production-build` → `demo` bez wywołań, bez `process.exit`.
- `NEXT_RUNTIME=edge` → `demo` bez wywołań.
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`, `demo` zwraca `["x"]`, `process.exit` rzuca błąd → `register()` odrzuca ten błąd, a `logs.getLoggerProvider()` jest tym samym obiektem co przed wywołaniem.

**Mutacje do zabicia:** sprawdzenia mimo błędnego `env` albo w fazie buildu; `exit(0)`; raport tylko z pierwszym problemem albo pierwszym sprawdzeniem; wyjątek przerywa kolejne sprawdzenia (`try` wokół całej pętli); `exit` przed `error`; zła liczba w nagłówku; `verifyEnvOnStartup` zwraca `env` mimo problemów; domyślna lista sprawdzeń inna niż rejestr; sprawdzenia za konfiguracją OTel (łapie to test `register()`, bo `src/instrumentation.ts` nie jest w `mutate`).

- [ ] **Step 1:** Testy. `env -i PATH="$PATH" HOME="$HOME" npx vitest run src/shared/lib/__tests__/startup-checks.test.ts src/shared/lib/__tests__/env-startup.test.ts src/__tests__/instrumentation-startup-checks.test.ts` → FAIL (brak `startup-checks`, `verifyEnvOnStartup` zwraca `undefined`).
- [ ] **Step 2:** Implementacja.
- [ ] **Step 3:** Ta sama komenda, z dopisanymi `src/__tests__/instrumentation.test.ts` i `src/shared/lib/__tests__/env.test.ts` → PASS.
- [ ] **Step 4:** `npm run build` bez `.env` → PASS. Turbopack kompiluje `instrumentation.ts` także dla Edge (spec §6).
- [ ] **Step 5:** Dokumentacja z listy „Docs”.
- [ ] **Step 6:** `npm run test:mutation:task -- src/shared/lib/startup-checks.ts,src/shared/lib/env.ts`. Przeżyły mutant w zmienionych liniach wraca do testera; plików nie ma w `critical`, ale luka to luka.
- [ ] **Step 7:** `npm run verify` → PASS. Commit `feat(core): run module startup checks after env validation`.

### Task 3: Sprawdzenie zapisu w `uploads` (moduł)

**Files:**
- Create: `src/features/uploads/services/storage-startup-check.ts`
- Create: `src/features/uploads/startup-check.ts`
- Generate: `src/modules.generated.ts` (import `uploadsStartupCheck` i `export const startupChecks = [{ key: "uploads", check: uploadsStartupCheck }];`)
- Modify: `kit/modules/uploads.json` (`version` `0.3.0`), `.wa/kit.json` przez `kit sync`
- Test: Create `src/features/uploads/services/__tests__/storage-startup-check.test.ts` i `src/features/uploads/__tests__/startup-check.test.ts`. Oba z `// @vitest-environment node`. Katalogi z `mkdtemp(join(tmpdir(), "wa-startup-check-"))`, sprzątane w `afterEach` (przed `rm` przywróć `chmod 0o755`). Pierwszy plik ma częściowe mocki `node:crypto` (`randomUUID: vi.fn(actual.randomUUID)`) i `node:fs/promises` (`rm: vi.fn(actual.rm)`), które domyślnie wołają prawdziwe funkcje.

**Interfaces:**
- Consumes: `CoreEnv` z `@/shared/lib/env`, `StorageEnv` z `src/features/uploads/contracts/storage.types.ts`, konwencja szwu (Task 1) i uruchamianie (Task 2).
- Produces:
  ```ts
  // src/features/uploads/services/storage-startup-check.ts
  export async function checkStorageOnStartup(config: StorageEnv, uid: number | undefined): Promise<string[]>;
  // src/features/uploads/startup-check.ts
  export async function startupCheck(env: CoreEnv): Promise<string[]>;
  ```
- `startupCheck` zwraca `checkStorageOnStartup(env as CoreEnv & StorageEnv, process.getuid?.())`, nie ma żadnej gałęzi i nie importuje nic z `@/shared/lib/startup-checks`.
- `checkStorageOnStartup`: przy `s3` zwraca `[]` bez żadnej operacji na dysku. Przy `local` wykonuje kroki z Global Constraints w jednym `try`, a każdy błąd daje jeden komunikat.

**Zachowania** (`storage-startup-check.test.ts`; `D` to katalog tymczasowy; `HINT` to stała testu `. Na Railway ustaw RAILWAY_RUN_UID=0 albo przejdź na Railway Bucket (STORAGE_PROVIDER=s3). W Dockerze podepnij nowy wolumen pod /app/volumes/uploads albo nadaj użytkownikowi procesu prawo zapisu do tego katalogu.`):
- `{ STORAGE_PROVIDER: "s3", S3_ENDPOINT: "http://localhost:9000", S3_REGION: "auto", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_BUCKET: "b", S3_FORCE_PATH_STYLE: true }`, `1001` → `[]`; `randomUUID` i `rm` bez wywołań.
- `local`, pusty `D`, `1001` → `[]`; `readdir(D)` → `[]`.
- `local`, `D` z plikiem `orgs/o1/editor-image/a.png` o treści `"obraz"` → `[]`; `readdir(D)` → `["orgs"]`; plik ma treść `"obraz"`.
- `local`, `join(D, "a", "b", "uploads")`, którego nie ma → `[]`; katalog istnieje i jest pusty.
- `local`, `join(D, "plik", "uploads")`, gdzie `D/plik` to zwykły plik, `1001` → `` [`nie można zapisać pliku w katalogu ${join(D, "plik", "uploads")} (ENOTDIR), proces działa z UID 1001${HINT}`] ``.
- To samo z `uid` równym `undefined` → `` [`nie można zapisać pliku w katalogu ${join(D, "plik", "uploads")} (ENOTDIR)${HINT}`] ``.
- `local`, `join(D, "plik")`, zwykły plik o treści `"x"` → jeden komunikat zawierający `(EEXIST)`; plik ma treść `"x"`.
- `local`, `D` po `chmod 0o555` (przypadek pominięty, gdy `process.getuid?.() === 0`) → jeden komunikat zawierający `(EACCES)`; `readdir(D)` → `[]`.
- `randomUUID` zwraca raz `"00000000-0000-4000-8000-000000000000"`, a w `D` istnieje `.write-check-00000000-0000-4000-8000-000000000000` o treści `"obcy"` → jeden komunikat zawierający `(EEXIST)`; plik ma treść `"obcy"`.
- `rm` odrzuca raz błędem z `code: "EPERM"` → jeden komunikat zawierający `(EPERM)`.

**Zachowania** (`startup-check.test.ts`; `coreEnv` to literał z poprawnymi zmiennymi rdzenia):
- `startupCheck({ ...coreEnv, STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: join(D, "nowy") } as CoreEnv)` → `[]`; katalog `D/nowy` istnieje.
- `STORAGE_LOCAL_PATH: join(D, "plik", "uploads")`, gdzie `D/plik` to zwykły plik → jeden komunikat zaczynający się od `` `nie można zapisać pliku w katalogu ${join(D, "plik", "uploads")} (ENOTDIR), proces działa z UID ${process.getuid()}` `` (przypadek tylko na POSIX).
- `STORAGE_PROVIDER: "s3"` z pełnymi `S3_*` → `[]`.

**Mutacje do zabicia:** odwrócony albo usunięty warunek providera; brak `recursive`; brak usunięcia pliku próbnego; brak flagi `wx` albo prefiksu `.write-check-` (łapie przypadek ze stałą nazwą); plik próbny poza katalogiem; brak UID albo odwrócona gałąź UID; zmieniony tekst komunikatu.

- [ ] **Step 1:** Testy. `env -i PATH="$PATH" HOME="$HOME" npx vitest run src/features/uploads/services/__tests__/storage-startup-check.test.ts src/features/uploads/__tests__/startup-check.test.ts` → FAIL (brak modułów).
- [ ] **Step 2:** Implementacja, `npm run wa -- generate` (wpis `uploads` w `startupChecks`), podbicie `uploads.json`, `npm run wa -- kit sync && npm run wa -- generate`. Drugi przebieg niczego nie zmienia.
- [ ] **Step 3:** Ta sama komenda testów → PASS. `npm run typecheck` → PASS: domyślny argument `verifyStartupChecks` sprawdza zgodność `startupCheck` z `ModuleStartupCheck`.
- [ ] **Step 4:** `npm run test:mutation:task -- src/features/uploads/services/storage-startup-check.ts` i `npm run test:mutation:gate`. Plik jest w `critical`, więc każdy przeżyły mutant jest zabity albo ma propozycję wpisu `allowed` dla Jakuba.
- [ ] **Step 5:** Sprawdzenie na żywo (spec 4.5). `docker compose up -d db`, `npm run build`. W katalogu tymczasowym `T`: `mkdir -p "$T/ro" "$T/rw" && chmod 555 "$T/ro"`. Start z kompletem zmiennych produkcyjnych (`DATABASE_URL` z `.env.example`, sekrety losowe):
  ```bash
  env -i PATH="$PATH" PORT=3997 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wa_app BETTER_AUTH_SECRET="$(openssl rand -hex 32)" APP_URL=http://localhost:3997 EMAIL_FROM="WA <noreply@example.com>" RESEND_API_KEY=re_test API_KEY_PEPPER="$(openssl rand -hex 32)" STORAGE_LOCAL_PATH="$T/ro" node .next/standalone/server.js; echo "exit=$?"
  ```
  Oczekiwane: na stderr `Sprawdzenia startowe modułów nie przeszły (1):` i linia `- uploads: nie można zapisać pliku w katalogu <T>/ro (EACCES), proces działa z UID <uid>. Na Railway …`, potem `exit=1`. Z `STORAGE_LOCAL_PATH="$T/rw"` serwer startuje, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3997/api/healthcheck` → `200`, a `ls -A "$T/rw"` jest puste. Healthcheck wykonuje `SELECT 1` na bazie z `DATABASE_URL`: gdy bazy `wa_app` nie ma, daje `503`, i wtedy do ledgera trafia ten kod oraz to, że proces nie zakończył się przy starcie. Opcjonalnie Docker: obraz z nazwanym wolumenem pod `/app/volumes/uploads`, którego wcześniej użył kontener działający jako root. Wyniki z datą trafiają do ledgera, a Task 4 przepisuje je do dokumentacji.
- [ ] **Step 6:** `npm run verify` → PASS. Commit `feat(uploads): check that the storage directory is writable at startup`.

### Task 4: Dokumentacja modułu, decyzja D50 i bramki końcowe

**Files:**
- `docs/decyzje.md`:
  - nowa decyzja D50 „Sprawdzenia startowe modułów; prawo zapisu dla `local` w `uploads`”: kontekst (D49, D15, recenzja PR #15), decyzja (szew, raport, kolejność względem `env` i OTel, plik próbny zamiast `access`, tylko katalog główny), odrzucone alternatywy (pole w `defineModule` przez D05, sprawdzenie w schemacie `env`, `access(W_OK)`, sprawdzenie S3 w tym zadaniu z kierunkiem na później), konsekwencje (`core` `0.6.0`, `uploads` `0.3.0`, zgodność ze starszym `core`), egzekwowanie (testy z Task 1–3, `critical`);
  - odsyłacz do D50 w konsekwencjach D48 i D49 oraz wpis w spisie decyzji.
- `docs/15-modul-uploads.md`: akapit „Reguły sprawdzają konfigurację, a nie dysk” (sprawdzenie zapisu przy starcie, komunikat, wynik z Task 3), wpis „Błąd magazynu nie wychodzi przy starcie” (S3 dalej bez sprawdzenia, kierunek w D50), tabela plików modułu (`startup-check.ts`, `services/storage-startup-check.ts`), wersja `0.3.0`.
- `docs/15b-modul-uploads-uzycie.md`: wiersz „Upload kończy się „Nie udało się przesłać pliku”…” (przy `local` brak prawa zapisu zatrzymuje start), nowy wiersz „Serwer nie startuje: `- uploads: nie można zapisać pliku…`” i wiersz w tabeli komunikatów.
- `docs/10-wdrozenie.md`: wolumen Railway (krok z `RAILWAY_RUN_UID=0` i to, co pokaże raport), własny serwer (wolumen należący do roota zatrzymuje start), akapit o regułach przy starcie w „Pliki modułu `uploads`”.
- `docs/znane-ograniczenia.md`, provider `local`: punkt „Trwały katalog” (zapis sprawdzany przy starcie, trwałość nie), „Kierunek zmiany” bez sprawdzenia zapisu, nowe ograniczenia: podkatalogi `orgs/…` niesprawdzane i plik próbny po przerwanym starcie.
- `docs/12-moduly-kitu.md` i `docs/16b-rozwoj-kitu.md`: odsyłacze do D50 przy szwie z Task 2.

**Zachowania:** dokumentacja nie twierdzi już, że brak prawa zapisu przy `local` wychodzi dopiero przy pierwszym uploadzie. Sprawdzenie: `grep -rn "pierwszy upload\|pierwszym uploadzie" docs/*.md` zwraca tylko miejsca o `s3`, o podkatalogach `orgs/…` albo o historii sprzed zmiany.

**Mutacje do zabicia:** nie dotyczy.

- [ ] **Step 1:** Dokumentacja.
- [ ] **Step 2:** Commit `docs(uploads): describe module startup checks and the local write check`. Bramki z kroku 3 działają na czystym drzewie, więc `git diff --exit-code` pokazuje tylko zmiany z `kit sync` i `generate`.
- [ ] **Step 3:** Bramki końcowe:
  - `npm run verify`;
  - `npm run verify --prefix kit/cli`;
  - `npm run wa -- kit sync && npm run wa -- generate && git diff --exit-code`;
  - `npm run test:mutation:gate` i `npm run test:mutation:gate --prefix kit/cli`;
  - `npm run test:e2e` po `docker compose up -d db mail`. Serwery e2e przechodzą sprawdzenie zapisu w katalogu tymczasowym z `e2e/env.ts`.

  Poprawka po nieudanej bramce idzie osobnym commitem.

## Zakończenie

- Recenzja końcowa całej gałęzi (Opus), potem zbiorcze rozstrzygnięcia z ledgera dla Jakuba.
- Raport dla Jakuba: co zrobione, propozycje wpisów `allowed` z uzasadnieniem, co zostało niesprawdzone na Railway (prawa zapisu wolumenu i reakcja na nieudany start).
- `superpowers:finishing-a-development-branch`. Push i PR tylko na prośbę Jakuba.
