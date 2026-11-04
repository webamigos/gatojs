# Moduł `uploads`: provider storage lokalny albo S3 — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Moduł `uploads` zapisuje pliki domyślnie na lokalnym dysku, a S3 włącza się przez `STORAGE_PROVIDER=s3`. Aplikacja sprawdza całe `env` przy starcie procesu i przy błędzie kończy pracę z raportem wszystkich problemów.

**Architecture:** Rdzeń dostaje sprawdzenie `env` w `register()` z `src/instrumentation.ts`: raport na `console.error`, kod wyjścia 1, pominięte w fazie `next build`. Moduł dostaje czystą funkcję `resolveStorageEnv` z regułami providera i katalogu oraz dwa providery za wspólnym interfejsem `ObjectStorage` (`local-storage.ts`, `s3-storage.ts`). Dyspozytor w `storage.ts` zachowuje dzisiejsze `putObject`, `getObject` i `deleteObject`, więc reszta modułu się nie zmienia. MinIO przechodzi do profilu Compose `s3`, a obraz Dockera dostaje katalog `/app/volumes/uploads`.

**Tech Stack:** Next.js 16.4 (`instrumentation.ts`, `next/constants`), Zod 4, `node:fs/promises` i `node:path`, `@aws-sdk/client-s3`, Vitest z `@fast-check/vitest`, Stryker, Docker Compose (profile), Playwright.

**Spec:** [docs/superpowers/specs/2026-11-04-uploads-storage-provider-design.md](../specs/2026-11-04-uploads-storage-provider-design.md). Wykonawca czyta spec razem z planem.

## Global Constraints

- Reguły `CLAUDE.md` i `AGENTS.md` obowiązują w każdym zadaniu: bez komentarzy w kodzie poza `// WHY:` (najwyżej 3 linie) i dyrektywami narzędzi; bez `any`, zagnieżdżonych ternary i cichych `catch {}`; Zod na każdym wejściu z zewnątrz.
- `STORAGE_PROVIDER`: `local` albo `s3`, domyślnie `local`. Pusta wartość znaczy „nieustawiona”.
- `STORAGE_LOCAL_PATH`, gdy nieustawiona: `RAILWAY_VOLUME_MOUNT_PATH`, jeśli jest ustawiona, a inaczej `./volumes/uploads` od katalogu roboczego procesu.
- Nazwy `S3_*` bez zmian (`S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`) i z dzisiejszymi regułami formatu. Obowiązują tylko przy `s3`.
- Reguły produkcyjne providera `local` działają tylko przy `NODE_ENV=production`.
- Raport startowy: pierwsza linia `Nieprawidłowe zmienne środowiskowe (<liczba problemów>):`, potem jedna linia `- <nazwa>: <komunikat>` na problem. Raport idzie na `console.error`, potem `process.exit(1)`. Przy `NEXT_PHASE=phase-production-build` nie ma sprawdzenia ani raportu.
- `putObject`, `getObject` i `deleteObject` zachowują sygnatury. Nie zmieniają się: `create-upload.ts`, `upload-commands.ts`, `read-upload.ts`, `api-org-context.ts` i trasy `src/app/api/uploads/**`.
- Zmiana pliku rdzenia (`src/shared/`, `src/instrumentation.ts`, `src/__tests__/`, `src/test/integration/setup-env.ts`, `e2e/env.ts`, `Dockerfile`) idzie osobnym commitem od zmian modułu (`kit/CLAUDE.md`).
- `kit/modules/core.json`: `version` `0.4.0` → `0.5.0` raz, w Task 1. `kit/modules/uploads.json`: `version` `0.1.0` → `0.2.0` raz, w Task 2. Po każdej zmianie manifestu uruchom `npm run wa -- kit sync && npm run wa -- generate`. Ponowne uruchomienie musi dawać czyste `git diff --exit-code` (tak sprawdza job `cli` w `kit.yml`).
- Plan nie zmienia `kit/cli/src`. Gdyby zmiana okazała się potrzebna: `npm run build --prefix kit/cli` i commit `.wa/bin/wa.mjs` w tym samym commicie.
- Testy jednostkowe nie mogą zależeć od lokalnego `.env`. Uruchamiaj je przez `env -i PATH="$PATH" HOME="$HOME" npx vitest run <pliki>`.
- Wpisy `allowed` w `mutation-gate.json` dopisuje tylko Jakub. Agent proponuje je w opisie PR z uzasadnieniem.
- Commity: Conventional Commits, temat małymi literami, stopka `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Bez pusha, PR i uruchamiania workflowów bez zgody Jakuba.
- Dokumentacja po polsku, w stylu bezczasowym (bez „teraz” i „obecnie”). W każdym zmienionym pliku `docs/` podbij nagłówek `Zweryfikowano z kodem: <krótki sha>, <data>`. Twierdzenia niesprawdzone na żywym systemie oznacz „(niesprawdzone)”.

## Przygotowanie (raz, przed Task 1)

- Worktree: `/Users/jakubszewczyk/Documents/WebAmigos/wa-kit/.claude/worktrees/uploads-storage-provider`, gałąź `feat/uploads-storage-provider`. Wszystkie komendy uruchamiaj stąd.
- `npm ci` i `npm ci --prefix kit/cli`. Worktree nie ma `node_modules` ani `.env`. Brak `.env` jest celowy: sprawdza, że `npm run build` działa bez niego.
- `df -h /System/Volumes/Data`: przed `docker build`, `npm run test:e2e` i mutacjami potrzeba co najmniej 15 GB wolnego miejsca. Bezpiecznie zwolnisz miejsce, usuwając `.next` w worktree i uruchamiając `docker builder prune -af`.
- Baza i MinIO do testów integracyjnych: sprawdź `docker ps`. Działający kontener Postgresa podaj w `INTEGRATION_DATABASE_URL` (baza z sufiksem `_test`). MinIO: `docker start wa-kit-minio-test` (port 9100, bucket `wa-app-uploads`), a potem `INTEGRATION_S3_ENDPOINT=http://localhost:9100 INTEGRATION_S3_BUCKET=wa-app-uploads`. Portu 9000 nie używaj, zajmuje go inny projekt.
- Ledger SDD: `.superpowers/sdd/2026-11-04-uploads-storage-provider/progress.md` (katalog jest w `.gitignore`).

## Proces każdego zadania

Wymagany przez `AGENTS.md`. Kroki zadań poniżej zakładają ten cykl i go nie powtarzają.

1. Subagent `test-writer` pisze testy z sekcji „Zachowania”, „Mutacje do zabicia” i „Interfaces” zadania. Pokazuje czerwony przebieg z właściwego powodu: brak symbolu albo złe zachowanie, nie błąd składni.
2. Orkiestrator: `printf implement > .superpowers/phase`. Implementer pisze kod i nie dotyka testów. Błędny test zgłasza zamiast go poprawiać.
3. Orkiestrator: `rm .superpowers/phase`. Subagent `test-reviewer` uruchamia `npm run test:mutation:task -- <pliki zadania>` (pliki oddzielone przecinkami) i `npm run test:mutation:gate`. Przeżyły mutant w `src/features/uploads/services/` wraca do testera albo dostaje propozycję wpisu `allowed` z uzasadnieniem.
4. Recenzja kodu zadania, potem commit albo commity.

Wszyscy subagenci i recenzenci pracują na Opusie (pamięć projektu: dokładność ponad tempo).

## Gałąź i PR

Jedna gałąź `feat/uploads-storage-provider` z `main` (spec: commit `f6c85a4`) i jeden PR po Task 6, otwarty na prośbę Jakuba. Przed PR scal najnowszy `main`. Otwarte PR [webamigos/wa-kit#12](https://github.com/webamigos/wa-kit/pull/12), [#13](https://github.com/webamigos/wa-kit/pull/13) i [#14](https://github.com/webamigos/wa-kit/pull/14) mogą podbić `core.json` albo zająć numer decyzji D47. Wtedy `core` dostaje kolejny minor po wersji z `main`, a decyzje kolejne wolne numery.

## Review Focus

1. **Klucz wskazujący katalog albo przechodzący przez plik** (`orgs` po zapisie `orgs/a.txt`, `a.txt/b` po zapisie `a.txt`) przy providerze `local`. Oczekiwane: `getObject` zwraca `null`, czyli 404, tak jak S3, a nie 500. Test: Task 2.
2. **`STORAGE_LOCAL_PATH`, które tylko zaczyna się tym samym tekstem co wolumen Railway** (`/database` przy wolumenie `/data`) albo wychodzi z niego przez `..`. Oczekiwane: błąd walidacji. Wolumen z ukośnikiem na końcu (`/data/`) nadal obejmuje `/data/uploads`. Test: Task 3.
3. **`STORAGE_PROVIDER` zapisany inaczej niż w dokumentacji** (`S3`, ` local `, pusty napis). Oczekiwane: wartość po `trim()` i zamianie na małe litery, a pusta daje `local`. Test: Task 3.
4. **`next build` z niepełnym `env`** (`NEXT_PHASE=phase-production-build`). Oczekiwane: bez raportu i bez wyjścia, build przechodzi tak jak dziś. Test: Task 1.
5. **Kilka błędnych zmiennych naraz, w rdzeniu i w module** (brak `DATABASE_URL` i zła zmienna modułu). Oczekiwane: jeden raport z obiema liniami i jedno wyjście z kodem 1. Test: Task 1.

---

### Task 1: Walidacja `env` przy starcie (rdzeń)

**Files:**
- Modify: `src/shared/lib/env.ts` (nowe `checkEnv`, `formatEnvReport`, `verifyEnvOnStartup`; `parseEnv` korzysta z `checkEnv`)
- Modify: `src/instrumentation.ts`
- Modify: `kit/modules/core.json` (`version` `0.5.0`), potem `npm run wa -- kit sync` (`.wa/kit.json`)
- Test: Create `src/shared/lib/__tests__/env-startup.test.ts`, Create `src/__tests__/instrumentation.test.ts`. `src/shared/lib/__tests__/env.test.ts` zostaje bez zmian, bo kontrakt `parseEnv` się nie zmienia.
- Docs:
  - `docs/07-i18n-mail-env.md` (`#walidacja-env`): sprawdzenie przy starcie, format raportu, wyjście, leniwe Proxy dla buildu i testów;
  - `docs/07b-logi-naglowki-healthcheck.md`: raport startowy idzie na konsolę mimo D15, healthcheck bez zmian;
  - `docs/10-wdrozenie.md`: akapit o walidacji (dziś „przy pierwszym odczycie `env`, a nie przy starcie”) i sekcja `#blad-env`. Błędne zmienne zatrzymują start, a Railway zostawia poprzednie wdrożenie (niesprawdzone);
  - `docs/16b-rozwoj-kitu.md`, punkt 6 „Zmienne w testach aplikacji referencyjnej”: brak wymaganej zmiennej w `e2e/env.ts` zatrzymuje serwery e2e przy starcie;
  - `docs/decyzje.md`: nowa decyzja rdzenia D48 „Walidacja `env` przy starcie procesu” (kontekst, decyzja, odrzucone alternatywy: walidacja leniwa i proces żyjący dalej jak `apps/web` w Ragenie, konsekwencje, egzekwowanie) oraz odsyłacz do D48 w konsekwencjach D15. W konsekwencjach D48: każda reguła `env` rdzenia i modułów zatrzymuje start, także reguła produkcyjna `API_KEY_PEPPER` z `api-keys`.

**Interfaces:**
- Produces (`src/shared/lib/env.ts`):
  ```ts
  export interface EnvIssue { name: string; message: string }
  export type EnvCheck = { ok: true; env: CoreEnv } | { ok: false; issues: EnvIssue[] };
  export function checkEnv(source: Record<string, string | undefined>): EnvCheck;
  export function formatEnvReport(issues: readonly EnvIssue[]): string;
  export function parseEnv(source: Record<string, string | undefined>): CoreEnv;
  export function verifyEnvOnStartup(
    source: Record<string, string | undefined>,
    io: { error: (message: string) => void; exit: (code: number) => void },
  ): void;
  ```
- `checkEnv` używa `fullSchema.safeParse`. `name` to `issue.path.join(".")`, a pusta ścieżka daje `"(env)"`.
- `parseEnv` przy błędzie rzuca ten sam tekst co dziś: `Nieprawidłowe zmienne środowiskowe: <nazwa>: <komunikat>; <nazwa>: <komunikat>`.
- `verifyEnvOnStartup` przy `source.NEXT_PHASE === PHASE_PRODUCTION_BUILD` (z `next/constants`) wraca bez sprawdzania. W innym przypadku przy błędzie woła `io.error(formatEnvReport(issues))`, a potem `io.exit(1)`. Bez flagi „już sprawdzone”: przy sukcesie nic nie wypisuje, a przy błędzie proces kończy pracę, więc kolejne wywołanie `register()` niczego nie powtórzy.
- `register()`: zaraz po sprawdzeniu `NEXT_RUNTIME !== "nodejs"`, a przed warunkiem `OTEL_EXPORTER_OTLP_ENDPOINT`:
  ```ts
  const { verifyEnvOnStartup } = await import("@/shared/lib/env");
  verifyEnvOnStartup(process.env, {
    error: (message) => console.error(message),
    exit: (code) => process.exit(code),
  });
  ```
  Import dynamiczny trzyma Zod i rejestr modułów poza bundlem Edge, tak jak dzisiejsze importy OTel. Leniwe Proxy `env` i jego `// WHY:` zostają bez zmian.

**Zachowania** (`env-startup.test.ts` mockuje `@/modules.generated` jednym schematem modułu: `z.object({ DEMO_TOKEN: z.string().min(1) }).transform(({ DEMO_TOKEN }) => ({ DEMO_TOKEN }))`; `validCore` jak w `env.test.ts` plus `DEMO_TOKEN: "t"`):
- `checkEnv(validCore)` → `ok: true`, a `env.DATABASE_URL` → `"postgresql://postgres:postgres@localhost:5432/wa"`.
- `checkEnv({ ...validCore, DATABASE_URL: undefined, DEMO_TOKEN: "" })` → `ok: false`, a `issues.map((i) => i.name).sort()` → `["DATABASE_URL", "DEMO_TOKEN"]`.
- `formatEnvReport([{ name: "DATABASE_URL", message: "brak" }, { name: "DEMO_TOKEN", message: "pusty" }])` → `"Nieprawidłowe zmienne środowiskowe (2):\n- DATABASE_URL: brak\n- DEMO_TOKEN: pusty"`.
- `formatEnvReport([{ name: "(env)", message: "x" }])` → `"Nieprawidłowe zmienne środowiskowe (1):\n- (env): x"`.
- `parseEnv({ ...validCore, DATABASE_URL: undefined })` rzuca błąd, którego tekst zaczyna się od `"Nieprawidłowe zmienne środowiskowe: DATABASE_URL: "`.
- `verifyEnvOnStartup(validCore, io)` → `io.error` i `io.exit` bez wywołań.
- `verifyEnvOnStartup({ ...validCore, DATABASE_URL: undefined, DEMO_TOKEN: "" }, io)`:
  - `io.error` wywołane raz, z napisem zaczynającym się od `"Nieprawidłowe zmienne środowiskowe (2):\n"` i zawierającym linie `- DATABASE_URL: ` i `- DEMO_TOKEN: `;
  - `io.exit` wywołane raz z `1`;
  - `io.error` przed `io.exit` (`mock.invocationCallOrder`).
- `verifyEnvOnStartup({ NEXT_PHASE: "phase-production-build" }, io)` → bez wywołań.
- `verifyEnvOnStartup({ ...validCore, DATABASE_URL: undefined, NEXT_PHASE: "phase-production-server" }, io)` → `io.exit(1)`.
- `instrumentation.test.ts` z prawdziwym rejestrem modułów: `vi.stubEnv("NEXT_RUNTIME", "nodejs")`, `vi.stubEnv("DATABASE_URL", "")`, `vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "")` oraz `vi.spyOn(process, "exit")` i `vi.spyOn(console, "error")` z pustą implementacją:
  - `await register()` → `process.exit` wywołane z `1`, a `console.error` z napisem zawierającym `- DATABASE_URL: `;
  - przy `NEXT_RUNTIME="edge"` → bez `process.exit` i bez `console.error`;
  - przy `NEXT_RUNTIME="nodejs"` i `NEXT_PHASE="phase-production-build"` → bez `process.exit`.

**Mutacje do zabicia:** pominięcie sprawdzenia w każdej fazie, a nie tylko w fazie buildu (`!==` zamiast `===`); `exit(0)` zamiast `exit(1)`; raport tylko z pierwszym problemem; `io.exit` przed `io.error`; inna nazwa pustej ścieżki niż `(env)`; sprawdzenie przeniesione za warunek `OTEL_EXPORTER_OTLP_ENDPOINT` w `register()` (łapie to `instrumentation.test.ts`, bo `src/instrumentation.ts` nie jest w `mutate` Strykera).

- [ ] **Step 1:** Testy. `env -i PATH="$PATH" HOME="$HOME" npx vitest run src/shared/lib/__tests__/env-startup.test.ts src/__tests__/instrumentation.test.ts` → FAIL z powodu braku `checkEnv`, `formatEnvReport` i `verifyEnvOnStartup`.
- [ ] **Step 2:** Implementacja, podbicie `core.json`, `npm run wa -- kit sync`.
- [ ] **Step 3:** Ta sama komenda z `src/shared/lib/__tests__/env.test.ts` na liście → PASS.
- [ ] **Step 4:** Build bez `.env`: `npm run build` → PASS. Ręczny start bez zmiennych: `env -i PATH="$PATH" PORT=3998 node .next/standalone/server.js; echo "exit=$?"`. Jeśli proces nie skończy się sam w ciągu 10 sekund, wyślij z drugiego terminala `curl -s http://localhost:3998/api/healthcheck`. Oczekiwane: na stderr raport zaczynający się od `Nieprawidłowe zmienne środowiskowe (`, potem `exit=1`. Zapisz w raporcie zadania, czy proces skończył się przy starcie, czy dopiero po pierwszym żądaniu. Od tego zależy opis w `docs/10-wdrozenie.md`.
- [ ] **Step 5:** Dokumentacja z listy „Docs”.
- [ ] **Step 6:** `npm run test:mutation:task -- src/shared/lib/env.ts`. Przeżyły mutant w zmienionych liniach wraca do testera (plik nie jest w `critical`, ale luka to luka).
- [ ] **Step 7:** `npm run verify` → PASS. Commit `feat(core): validate env at startup`.

### Task 2: Provider lokalny

**Files:**
- Create: `src/features/uploads/contracts/storage.types.ts`
- Create: `src/features/uploads/services/path-inside.ts`
- Create: `src/features/uploads/services/local-storage.ts`
- Modify: `src/features/uploads/services/storage.ts`: tylko `StoredObject` przechodzi do `contracts/storage.types.ts`, a `storage.ts` go reeksportuje (`export type { StoredObject } from "../contracts/storage.types";`)
- Modify: `kit/modules/uploads.json` (`version` `0.2.0`), potem `npm run wa -- kit sync`
- Test: Create `src/features/uploads/services/__tests__/path-inside.test.ts` i `src/features/uploads/services/__tests__/local-storage.test.ts`. Oba z `// @vitest-environment node`. Katalog magazynu z `mkdtemp(join(tmpdir(), "wa-uploads-"))`, sprzątany w `afterEach`.

**Interfaces:**
- Produces:
  ```ts
  // contracts/storage.types.ts
  export interface StoredObject { body: Uint8Array; contentType: string | undefined }
  export interface ObjectStorage {
    put(key: string, body: Uint8Array, contentType: string): Promise<void>;
    get(key: string): Promise<StoredObject | null>;
    delete(key: string): Promise<void>;
  }
  // services/path-inside.ts
  export function isPathInside(parent: string, child: string): boolean;
  // services/local-storage.ts
  export class InvalidStorageKeyError extends Error {}
  export function resolveObjectPath(root: string, key: string): string;
  export function createLocalStorage(root: string): ObjectStorage;
  ```
- `isPathInside` (prawda, gdy `child` jest równe `parent` albo leży pod nim):
  ```ts
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  ```
- `resolveObjectPath` rzuca `InvalidStorageKeyError`, gdy:
  - klucz zawiera `"\0"`;
  - `path.isAbsolute(key)`;
  - `key.split(/[\\/]/)` zawiera `".."`;
  - `resolved = path.resolve(root, key)` nie spełnia `isPathInside(root, resolved)` albo jest równe `path.resolve(root)`.

  W innym przypadku zwraca `resolved`.
- `createLocalStorage(root)`:
  - `put`: `mkdir(dirname, { recursive: true })`, potem `writeFile`; bez pliku tymczasowego, bo klucze to nowe UUID-y, a rekord powstaje po zapisie (spec, 5);
  - `get`: `readFile`. Błąd `ENOENT`, `ENOTDIR` albo `EISDIR` daje `null`, a każdy inny jest rzucany dalej. `contentType` zawsze `undefined`;
  - `delete`: `rm(path, { force: true })`;
  - każda metoda najpierw woła `resolveObjectPath`.

**Zachowania** (`root` z `mkdtemp`, `bytes = (t: string) => new TextEncoder().encode(t)`):
- `isPathInside`:
  - `("/data", "/data")` → `true`;
  - `("/data", "/data/a/b")` → `true`;
  - `("/data/", "/data/a")` → `true`;
  - `("/data", "/data/..foo")` → `true`;
  - `("/", "/x")` → `true`;
  - `("/data", "/database")` → `false`;
  - `("/data", "/")` → `false`;
  - `("/data", "/data/../etc")` → `false`.
- `test.prop` dla segmentów bez `""`, `"."`, `".."`, `"/"`, `"\\"` i `"\0"`:
  - `isPathInside(p, path.join(p, ...segmenty))` → `true`;
  - `isPathInside(path.join(p, segment), p)` → `false`.
- `resolveObjectPath(root, "orgs/o1/editor-image/u.jpg")` → `path.join(root, "orgs/o1/editor-image/u.jpg")`, a `resolveObjectPath(root, "./a.txt")` → `path.join(root, "a.txt")`.
- `InvalidStorageKeyError` dla każdego z kluczy: `""`, `"."`, `"/etc/passwd"`, `path.join(root, "x")` (absolutny, choć wewnątrz `root`), `"../x"`, `"orgs/../../x"`, `"a/../b"`, `"orgs\\..\\x"`, `"a\u0000b"`.
- `test.prop` dla dowolnego napisu jako klucza: albo `InvalidStorageKeyError`, albo ścieżka `p` z `isPathInside(root, p) && p !== root`. Każdy inny wyjątek oblewa test.
- `put("orgs/o1/test/a.txt", bytes("hello"), "text/plain")`:
  - `readFile(path.join(root, "orgs/o1/test/a.txt"), "utf8")` → `"hello"`;
  - `get` → `body` `[104, 101, 108, 108, 111]` i `contentType` `undefined`.
- Bajty `[0, 255, 1, 254, 128]` wracają bez zmian. Pusty `Uint8Array` wraca jako obiekt z `body.length === 0`, a nie `null`.
- `put` z `bytes("one")`, potem z `bytes("two!")` pod tym samym kluczem → `get` daje `[116, 119, 111, 33]`.
- `get` zwraca `null` dla:
  - nieistniejącego klucza;
  - nieistniejącego klucza zagnieżdżonego `orgs/o1/test/<uuid>/brak.txt`;
  - `"orgs"` po zapisie `orgs/a.txt` (Review Focus 1);
  - `"a.txt/b"` po zapisie `a.txt` (Review Focus 1).
- `delete`:
  - istniejącego klucza → `get` daje `null`;
  - nieistniejącego → `resolves.toBeUndefined()`;
  - dwa razy pod rząd → bez błędu;
  - usuwa tylko wskazany klucz.
- Klucze `orgs/o1/test/<x>` i `orgs/o2/test/<x>` się nie nakładają (`[65]` i `[66]`).
- Odrzucenie z `InvalidStorageKeyError`:
  - `put("../escape.txt", …)`, a w `path.dirname(root)` nie powstaje `escape.txt`;
  - `get("../x")`;
  - `delete("../x")`.
- `put("a.txt/b", …)` po zapisie `a.txt` → odrzucenie błędem systemu plików, nie `InvalidStorageKeyError` i nie cisza.
- `get` pliku bez prawa odczytu (`chmod 0o000`) → odrzucenie. Test pomijany, gdy `process.getuid?.() === 0`.

**Mutacje do zabicia:**
- `get` rzuca dalej `ENOENT`, `ENOTDIR` albo `EISDIR`, albo zamienia na `null` każdy błąd;
- usunięty warunek `".."`, `isAbsolute` albo `"\0"`;
- `startsWith(parent)` bez separatora (pułapka `/database`);
- `recursive: true` albo `force: true` usunięte;
- `contentType` zwracany z zapisu.

Uwaga dla recenzenta: po pierwszym warunku `resolveObjectPath` część „poza `root`” drugiego warunku jest na POSIX nieosiągalna, a osiągalna zostaje tylko równość z `root` (klucz `"."`). To zamierzona obrona w głąb (spec 4.4). Taki przeżyły mutant to mutant równoważny: zgłoś go jako propozycję wpisu `allowed` dla Jakuba.

- [ ] **Step 1:** Testy. `env -i PATH="$PATH" HOME="$HOME" npx vitest run src/features/uploads/services/__tests__/path-inside.test.ts src/features/uploads/services/__tests__/local-storage.test.ts` → FAIL (brak modułów).
- [ ] **Step 2:** Implementacja, `version` w manifeście, `npm run wa -- kit sync && npm run wa -- generate`.
- [ ] **Step 3:** Ta sama komenda → PASS.
- [ ] **Step 4:** `npm run test:mutation:task -- src/features/uploads/services/path-inside.ts,src/features/uploads/services/local-storage.ts`, potem `npm run test:mutation:gate`.
- [ ] **Step 5:** `npm run verify` → PASS. Commit `feat(uploads): add local storage provider`.

### Task 3: Wybór providera i reguły katalogu z `env`

**Files:**
- Modify: `src/features/uploads/contracts/storage.types.ts` (typy env)
- Create: `src/features/uploads/services/storage-env.ts`
- Test: Create `src/features/uploads/services/__tests__/storage-env.test.ts`

**Interfaces:**
- Consumes: `isPathInside` (Task 2).
- Produces:
  ```ts
  // contracts/storage.types.ts
  export interface LocalStorageEnv { STORAGE_PROVIDER: "local"; STORAGE_LOCAL_PATH: string }
  export interface S3StorageEnv {
    STORAGE_PROVIDER: "s3";
    S3_ENDPOINT: string;
    S3_REGION: string;
    S3_ACCESS_KEY_ID: string;
    S3_SECRET_ACCESS_KEY: string;
    S3_BUCKET: string;
    S3_FORCE_PATH_STYLE: boolean;
  }
  export type StorageEnv = LocalStorageEnv | S3StorageEnv;
  // services/storage-env.ts
  export const DEFAULT_LOCAL_STORAGE_PATH = "./volumes/uploads";
  export interface StorageEnvIssue { name: string; message: string }
  export type StorageEnvResult = { ok: true; env: StorageEnv } | { ok: false; issues: StorageEnvIssue[] };
  export function resolveStorageEnv(
    source: Readonly<Record<string, string | undefined>>,
    cwd: string,
  ): StorageEnvResult;
  ```
- Kolejność reguł:
  1. `STORAGE_PROVIDER`, `STORAGE_LOCAL_PATH`, `RAILWAY_ENVIRONMENT_ID` i `RAILWAY_VOLUME_MOUNT_PATH` po `trim()`. Pusty napis znaczy „nieustawiona”. `STORAGE_PROVIDER` dodatkowo zamieniany na małe litery.
  2. Provider spoza `local` i `s3` daje jeden problem `STORAGE_PROVIDER`, bez dalszych reguł.
  3. Przy `s3` obowiązuje dzisiejszy schemat z `src/features/uploads/env.ts`, przeniesiony tu bez zmian reguł:
     - `S3_ENDPOINT` to `z.url()`;
     - `S3_REGION` to `z.string().min(1).default("auto")`;
     - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` i `S3_BUCKET` to `z.string().min(1)`;
     - `S3_FORCE_PATH_STYLE` przyjmuje `"true"` albo `"false"`, a brak daje `false`.

     Problem ma `name = issue.path[0]` i komunikat Zod. Wynik zawiera `STORAGE_PROVIDER: "s3"` i sześć pól `S3_*`.
  4. Przy `local`: `production = source.NODE_ENV === "production"`, `onRailway` = ustawione `RAILWAY_ENVIRONMENT_ID`, `volume` = `RAILWAY_VOLUME_MOUNT_PATH`, `explicit` = `STORAGE_LOCAL_PATH`.
     - `production && onRailway && !volume` daje problem Railway (tylko ten jeden).
     - `production && onRailway && volume && explicit && !isPathInside(resolve(cwd, volume), resolve(cwd, explicit))` daje problem „poza wolumenem”.
     - `production && !onRailway && !explicit` daje problem „wymagana”.
     - W pozostałych przypadkach wynik to `{ STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: path.resolve(cwd, explicit ?? volume ?? DEFAULT_LOCAL_STORAGE_PATH) }`.
- Komunikaty (dokładny tekst):

  | Problem | `name` | `message` |
  |---|---|---|
  | Nieznany provider | `STORAGE_PROVIDER` | `dozwolone wartości: local, s3` |
  | Railway bez wolumenu | `STORAGE_PROVIDER` | `na Railway bez wolumenu pliki zginą przy redeployu: podepnij wolumen albo ustaw STORAGE_PROVIDER=s3` |
  | Ścieżka poza wolumenem | `STORAGE_LOCAL_PATH` | `` `musi leżeć wewnątrz wolumenu Railway (${volume})` `` (wartość `RAILWAY_VOLUME_MOUNT_PATH` po `trim()`) |
  | Produkcja poza Railway bez ścieżki | `STORAGE_LOCAL_PATH` | `wymagana w produkcji przy STORAGE_PROVIDER=local: wskaż trwały katalog` |

**Zachowania** (`cwd = "/app"`; `S3_OK = { S3_ENDPOINT: "https://t3.storageapi.dev", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_BUCKET: "b" }`; `env` porównywane przez `toEqual`; problemy przez `toEqual` na tablicy z tabeli komunikatów):

| `source` | Wynik |
|---|---|
| `{}` | `local`, `/app/volumes/uploads` |
| `{ STORAGE_PROVIDER: "" }` albo `"  "` | `local`, `/app/volumes/uploads` |
| `{ STORAGE_PROVIDER: " LOCAL " }` | `local`, `/app/volumes/uploads` |
| `{ STORAGE_PROVIDER: "ftp" }` | problem „Nieznany provider” |
| `{ STORAGE_LOCAL_PATH: "/srv/files" }` | `local`, `/srv/files` |
| `{ STORAGE_LOCAL_PATH: "data/u" }` | `local`, `/app/data/u` |
| `{ S3_ENDPOINT: "nie-url" }` | `local`, `/app/volumes/uploads`; klucze wyniku dokładnie `["STORAGE_LOCAL_PATH", "STORAGE_PROVIDER"]` |
| `{ STORAGE_PROVIDER: " S3 ", ...S3_OK }` | `{ STORAGE_PROVIDER: "s3", ...S3_OK, S3_REGION: "auto", S3_FORCE_PATH_STYLE: false }` |
| `{ STORAGE_PROVIDER: "s3", ...S3_OK, S3_FORCE_PATH_STYLE: "true" }` | `S3_FORCE_PATH_STYLE: true` |
| `{ STORAGE_PROVIDER: "s3", ...S3_OK, S3_FORCE_PATH_STYLE: "tak" }` | problem z `name` `S3_FORCE_PATH_STYLE` |
| `{ STORAGE_PROVIDER: "s3", ...S3_OK, S3_BUCKET: undefined }` | jeden problem, `name` `S3_BUCKET` |
| `{ STORAGE_PROVIDER: "s3" }` | nazwy problemów po sortowaniu: `["S3_ACCESS_KEY_ID", "S3_BUCKET", "S3_ENDPOINT", "S3_SECRET_ACCESS_KEY"]` |
| `{ STORAGE_PROVIDER: "s3", ...S3_OK, NODE_ENV: "production", RAILWAY_ENVIRONMENT_ID: "e1" }` | `s3` bez problemów |
| `{ NODE_ENV: "production" }` | problem „Produkcja poza Railway bez ścieżki” |
| `{ NODE_ENV: "production", STORAGE_LOCAL_PATH: "/app/volumes/uploads" }` | `local`, `/app/volumes/uploads` |
| `{ NODE_ENV: "production", STORAGE_LOCAL_PATH: "./volumes/uploads" }` | `local`, `/app/volumes/uploads` |
| `{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_ID: "e1" }` | tylko problem „Railway bez wolumenu” |
| `{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_ID: "e1", RAILWAY_VOLUME_MOUNT_PATH: "  " }` | tylko problem „Railway bez wolumenu” |
| `{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_ID: "e1", RAILWAY_VOLUME_MOUNT_PATH: "/data" }` | `local`, `/data` |
| to samo plus `STORAGE_LOCAL_PATH: "/data/uploads"` | `local`, `/data/uploads` |
| `RAILWAY_VOLUME_MOUNT_PATH: "/data/"` plus `STORAGE_LOCAL_PATH: "/data/uploads"` (produkcja, Railway) | `local`, `/data/uploads` |
| `RAILWAY_VOLUME_MOUNT_PATH: "/data"` plus `STORAGE_LOCAL_PATH: "/database"` (produkcja, Railway) | problem „poza wolumenem” z `(/data)` |
| `RAILWAY_VOLUME_MOUNT_PATH: "/data"` plus `STORAGE_LOCAL_PATH: "/data/../etc"` (produkcja, Railway) | problem „poza wolumenem” z `(/data)` |
| `RAILWAY_VOLUME_MOUNT_PATH: "/app/volumes/uploads"` plus `STORAGE_LOCAL_PATH: "./volumes/uploads"` (produkcja, Railway) | `local`, `/app/volumes/uploads` |
| `{ RAILWAY_ENVIRONMENT_ID: "e1" }` (bez produkcji) | `local`, `/app/volumes/uploads` |
| `{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_ID: "" }` | problem „Produkcja poza Railway bez ścieżki” |

**Mutacje do zabicia:**
- domyślny provider inny niż `local`;
- brak `trim()` albo zamiany na małe litery;
- reguły produkcyjne działają poza produkcją albo wcale;
- reguła Railway pominięta, albo przy Railway bez wolumenu dochodzi też problem „wymagana”;
- `RAILWAY_VOLUME_MOUNT_PATH` nieużywane jako domyślny katalog;
- porównanie z wolumenem przez `startsWith` bez separatora;
- walidacja `S3_*` pominięta przy `s3` albo wykonana przy `local`;
- wynik `local` zawiera pola `S3_*`;
- `cwd` ignorowane (ścieżka względna zostaje względna).

- [ ] **Step 1:** Testy. `env -i PATH="$PATH" HOME="$HOME" npx vitest run src/features/uploads/services/__tests__/storage-env.test.ts` → FAIL (brak modułu).
- [ ] **Step 2:** Implementacja.
- [ ] **Step 3:** Ta sama komenda → PASS.
- [ ] **Step 4:** `npm run test:mutation:task -- src/features/uploads/services/storage-env.ts`, potem `npm run test:mutation:gate`.
- [ ] **Step 5:** `npm run verify` → PASS. Commit `feat(uploads): resolve storage provider from env`.

### Task 4: Podłączenie providerów do `env` i `storage.ts`

**Files:**
- Modify: `src/features/uploads/env.ts`: dzisiejszy schemat S3 znika z tego pliku, bo jego reguły od Task 3 są w `storage-env.ts`
- Create: `src/features/uploads/services/s3-storage.ts`: kod S3 przeniesiony z `storage.ts` bez zmiany zachowania (klient z `requestChecksumCalculation: "WHEN_REQUIRED"`, `responseChecksumValidation: "WHEN_REQUIRED"` i `forcePathStyle` z konfiguracji; `NoSuchKey` jako instancja SDK albo `Error` o tej nazwie daje `null`)
- Modify: `src/features/uploads/services/storage.ts` (dyspozytor)
- Modify (rdzeń, osobny commit):
  - `src/test/integration/setup-env.ts`: dopisz `STORAGE_PROVIDER: "s3"`, `S3_*` zostają;
  - `e2e/env.ts`: w `appEnv` zamień pięć zmiennych `S3_*` na `STORAGE_PROVIDER: "local"` i `STORAGE_LOCAL_PATH: process.env.E2E_UPLOADS_DIR ?? join(tmpdir(), "wa-app-e2e-uploads")` (`join` z `node:path`, `tmpdir` z `node:os`). Napis `wa-app` zamienia na slug `placeholderFiles`.
- Test:
  - Modify `src/features/uploads/__tests__/env.test.ts` (przepisany na nowy kontrakt);
  - Modify `src/features/uploads/services/__tests__/storage.test.ts` (mock `env` dostaje `STORAGE_PROVIDER: "s3"`, asercje bez zmian);
  - Modify `src/features/uploads/services/__tests__/storage.integration.test.ts` (`mockEnv` dostaje `STORAGE_PROVIDER: "s3"`, asercje bez zmian);
  - Create `src/features/uploads/services/__tests__/create-object-storage.test.ts`;
  - Create `src/features/uploads/services/__tests__/storage-local-env.test.ts` (mock `env` z `STORAGE_PROVIDER: "local"` i katalogiem z `mkdtemp`).

**Interfaces:**
- Consumes: `resolveStorageEnv` (Task 3), `createLocalStorage` (Task 2), typy z `contracts/storage.types.ts`.
- Produces: `envSchema` w `env.ts` (schemat Zod, dla którego `z.output<typeof envSchema>` to `StorageEnv`) oraz:
  ```ts
  // env.ts
  export type UploadsEnv = StorageEnv;
  // services/s3-storage.ts
  export function createS3Storage(config: S3StorageEnv): ObjectStorage;
  // services/storage.ts
  export type { StoredObject } from "../contracts/storage.types";
  export function createObjectStorage(config: StorageEnv): ObjectStorage;
  export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
  export async function getObject(key: string): Promise<StoredObject | null>;
  export async function deleteObject(key: string): Promise<void>;
  ```
- `envSchema`:
  - `z.object` z polami `NODE_ENV`, `STORAGE_PROVIDER`, `STORAGE_LOCAL_PATH`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_VOLUME_MOUNT_PATH` i sześcioma `S3_*`, każde `z.string().optional()`;
  - `transform` woła `resolveStorageEnv(source, process.cwd())`;
  - każdy problem trafia do Zod jako issue `code: "custom"` z `path: [name]` i `message`, a wynik to `z.NEVER`;
  - wynik zawiera tylko klucze `StorageEnv`, bez `NODE_ENV` i `RAILWAY_*`, bo przecięcie z `coreEnvSchema` w `src/shared/lib/env.ts` nie może dostać dwóch wartości `NODE_ENV`.
- `createObjectStorage`: `local` → `createLocalStorage(config.STORAGE_LOCAL_PATH)`, a `s3` → `createS3Storage(config)`.
- `storage.ts` trzyma jedną instancję na proces, tworzoną przy pierwszym użyciu z `env as CoreEnv & UploadsEnv`, tak jak dziś klienta S3.

**Zachowania:**
- `envSchema.safeParse({})` → sukces, `data` → `` { STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: `${process.cwd()}/volumes/uploads` } ``.
- `envSchema.parse({ STORAGE_PROVIDER: "s3", S3_ENDPOINT: "http://localhost:9000", S3_ACCESS_KEY_ID: "minioadmin", S3_SECRET_ACCESS_KEY: "minioadmin", S3_BUCKET: "test-bucket", S3_FORCE_PATH_STYLE: "true" })` → `{ STORAGE_PROVIDER: "s3", S3_ENDPOINT: "http://localhost:9000", S3_REGION: "auto", S3_ACCESS_KEY_ID: "minioadmin", S3_SECRET_ACCESS_KEY: "minioadmin", S3_BUCKET: "test-bucket", S3_FORCE_PATH_STYLE: true }`.
- `s3` bez `S3_BUCKET` → `error.issues.map((i) => i.path)` → `[["S3_BUCKET"]]`.
- `{ NODE_ENV: "production", RAILWAY_ENVIRONMENT_ID: "e1" }` → jeden issue, `path` `["STORAGE_PROVIDER"]`, `message` jak w tabeli Task 3.
- `{ STORAGE_PROVIDER: "ftp", S3_ENDPOINT: "nie-url" }` → jeden issue, `path` `["STORAGE_PROVIDER"]`.
- Klucze wyniku po sortowaniu:
  - `s3` z dodanymi `NODE_ENV: "production"`, `DATABASE_URL: "postgres://x"` i `RAILWAY_ENVIRONMENT_ID: "e1"` → `["S3_ACCESS_KEY_ID", "S3_BUCKET", "S3_ENDPOINT", "S3_FORCE_PATH_STYLE", "S3_REGION", "S3_SECRET_ACCESS_KEY", "STORAGE_PROVIDER"]`;
  - `local` → `["STORAGE_LOCAL_PATH", "STORAGE_PROVIDER"]`.
- `z.intersection(z.object({ NODE_ENV: z.enum(["development", "test", "production"]).default("development") }), envSchema).parse({})` → `` { NODE_ENV: "development", STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: `${process.cwd()}/volumes/uploads` } ``.
- `createObjectStorage({ STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: dir }).put("orgs/o1/test/a.txt", bytes("hi"), "text/plain")` → `readFile(join(dir, "orgs/o1/test/a.txt"), "utf8")` → `"hi"`.
- `createObjectStorage(<config s3 z S3_BUCKET "test-bucket">).put(...)` → zamockowany `S3Client.send` dostaje komendę z `input.Bucket === "test-bucket"` i `input.Key === "orgs/o1/test/a.txt"`.
- `storage-local-env.test.ts`:
  - `putObject("orgs/o1/test/a.txt", bytes("hi"), "text/plain")` → plik leży w katalogu z mocka;
  - `getObject` → `[104, 105]`;
  - `deleteObject`, potem `getObject` → `null`.
- `storage.test.ts` i `storage.integration.test.ts` (MinIO) przechodzą z tymi samymi asercjami co dziś. `read-upload.integration.test.ts` i `uploads-isolation.integration.test.ts` przechodzą bez zmian.

**Mutacje do zabicia:**
- dyspozytor zawsze wybiera `s3` albo zawsze `local`;
- `createObjectStorage` ignoruje `STORAGE_LOCAL_PATH`;
- `envSchema` gubi problemy z `resolveStorageEnv` (wynik bez issue);
- `process.cwd()` zastąpione stałą;
- `Bucket` z innego pola konfiguracji;
- mieszanie konfiguracji między wywołaniami (instancja tworzona dla każdego wywołania z innego źródła niż `env`).

- [ ] **Step 1:** Testy. `env -i PATH="$PATH" HOME="$HOME" npx vitest run src/features/uploads` → FAIL na nowych plikach testów i na `env.test.ts`.
- [ ] **Step 2:** Implementacja modułu, potem zmiany rdzenia w `setup-env.ts` i `e2e/env.ts`.
- [ ] **Step 3:** `env -i PATH="$PATH" HOME="$HOME" npx vitest run src/features/uploads src/app/api/uploads src/__tests__` → PASS.
- [ ] **Step 4:** `INTEGRATION_DATABASE_URL=<…> INTEGRATION_S3_ENDPOINT=http://localhost:9100 INTEGRATION_S3_BUCKET=wa-app-uploads npm run test:integration` → PASS.
- [ ] **Step 5:** `npm run test:mutation:task -- src/features/uploads/services/storage.ts,src/features/uploads/services/s3-storage.ts`, potem `npm run test:mutation:gate`.
- [ ] **Step 6:** `npm run verify` → PASS. Commity w tej kolejności:
  1. `chore(core): set storage providers in integration and e2e env` (`setup-env.ts`, `e2e/env.ts`);
  2. `feat(uploads): store files locally by default` (moduł i testy).

  Serwery e2e przechodzą dopiero po obu commitach.

### Task 5: MinIO jako profil, manifest i katalog w obrazie

**Files:**
- Modify: `docker/uploads.compose.yml`: klucz `profiles: ["s3"]` w usługach `minio` i `minio-init`
- Modify: `kit/modules/uploads.json`:
  - `description`: `"Pliki organizacji na dysku albo w magazynie S3"`;
  - `env` w kolejności: `STORAGE_PROVIDER` (przykład `local`, `required: false`), `STORAGE_LOCAL_PATH` (przykład `./volumes/uploads`, `required: false`), sześć `S3_*` z dzisiejszymi przykładami i `required: false`;
  - `dependencies` bez zmian, `@aws-sdk/client-s3` zostaje.
- Generated: `npm run wa -- kit sync && npm run wa -- generate` aktualizuje `.wa/kit.json`, region `wa:modules` w `.env.example` i region `wa:services` w `docker-compose.yml`.
- Modify (rdzeń, osobny commit): `Dockerfile`, w etapie `runner` przed `USER nextjs`: `RUN mkdir -p /app/volumes/uploads && chown -R nextjs:nodejs /app/volumes`

**Zachowania:**
- Blok modułu w `.env.example` po `generate`:
  ```
  # uploads
  STORAGE_PROVIDER=local
  STORAGE_LOCAL_PATH=./volumes/uploads
  S3_ENDPOINT=http://localhost:9000
  S3_REGION=auto
  S3_ACCESS_KEY_ID=minioadmin
  S3_SECRET_ACCESS_KEY=minioadmin
  S3_BUCKET=wa-app-uploads
  S3_FORCE_PATH_STYLE=true
  ```
- `docker compose config --services | sort` → `db`, `mail`.
- `docker compose --profile s3 config --services | sort` → `db`, `mail`, `minio`, `minio-init`.
- Drugie `npm run wa -- kit sync && npm run wa -- generate && git diff --exit-code` → kod wyjścia 0.
- Projekt z kitu (`S` = katalog scratchpadu):
  - `node .wa/bin/wa.mjs create "$S/storage-check" --yes --kit "$PWD" --modules uploads --no-git --no-install` → `.env` zawiera linie `STORAGE_PROVIDER=local` i `STORAGE_LOCAL_PATH=./volumes/uploads`;
  - `docker compose -f "$S/storage-check/docker-compose.yml" config --services` nie wypisuje `minio`;
  - potem usuń `$S/storage-check`.
- Obraz, po sprawdzeniu `df -h`:
  - `docker build -t wa-kit-storage-check .`;
  - `docker run --rm --entrypoint sh wa-kit-storage-check -c 'id -u; stat -c %U /app/volumes/uploads; touch /app/volumes/uploads/probe'` → `1001`, `nextjs`, kod 0;
  - `docker run --rm -v wa-kit-storage-check:/app/volumes/uploads --entrypoint sh wa-kit-storage-check -c 'touch /app/volumes/uploads/probe'` → kod 0;
  - na koniec `docker volume rm wa-kit-storage-check && docker image rm wa-kit-storage-check && docker builder prune -f`.

**Mutacje do zabicia:** nie dotyczy (konfiguracja, bez logiki).

- [ ] **Step 1:** Zmiany w `docker/uploads.compose.yml` i manifeście, `kit sync`, `generate`.
- [ ] **Step 2:** Sprawdzenia z „Zachowań” dla Compose, `.env.example`, `git diff` i `wa create`.
- [ ] **Step 3:** Zmiana `Dockerfile` i sprawdzenie obrazu.
- [ ] **Step 4:** `npm run verify` → PASS. Commity:
  1. `chore(core): create uploads directory in docker image` (`Dockerfile`);
  2. `feat(uploads): start minio only with the s3 profile` (compose, manifest, pliki generowane, `.wa/kit.json`).

### Task 6: Dokumentacja modułu, decyzje i bramki końcowe

**Files** (fakty z specu 4.1 i 4.3–4.7):
- `docs/15-modul-uploads.md`:
  - tytuł i wstęp: dysk albo S3;
  - wymagania;
  - instalacja: `wa create` wpisuje `STORAGE_*`, MinIO tylko z `--profile s3`;
  - nowa sekcja „Provider storage”: zmienne, domyślny katalog, trzy reguły produkcyjne z komunikatami, ochrona przed path traversal, ograniczenia `local` (jedna instancja, trwały katalog, brak przenoszenia plików);
  - „Zmienne S3”: wymagane tylko przy `s3`;
  - „MinIO lokalnie”: profil `s3`, `MINIO_PORT`;
  - CI: testy integracyjne na `s3`;
  - „Usunięcie”: pliki w `STORAGE_LOCAL_PATH` zostają;
  - „Osierocone obiekty”: dotyczy obu providerów.
- `docs/15b-modul-uploads-uzycie.md`: testowanie (lokalnie bez MinIO, integracja na MinIO), typowe problemy z komunikatami walidacji.
- `docs/10-wdrozenie.md`:
  - tabela zmiennych (`STORAGE_PROVIDER`, `STORAGE_LOCAL_PATH`, `S3_*` tylko przy `s3`);
  - Railway z wolumenem (podpięcie pod `/app/volumes/uploads`, `RAILWAY_RUN_UID=0` — niesprawdzone, brak replik, krótka przerwa przy redeployu);
  - Railway Bucket z referencjami `${{<bucket>.BUCKET}}`, `${{<bucket>.ENDPOINT}}`, `${{<bucket>.REGION}}`, `${{<bucket>.ACCESS_KEY_ID}}`, `${{<bucket>.SECRET_ACCESS_KEY}}`, bez `S3_FORCE_PATH_STYLE`;
  - bez twierdzeń o wolumenie w fazie `preDeployCommand` (`prisma migrate deploy`), bo nie jest sprawdzone, czy Railway go tam montuje;
  - rekomendacja: na Railway bucket;
  - własny serwer: `STORAGE_LOCAL_PATH` na trwałym wolumenie (`docker run -v uploads:/app/volumes/uploads`).
- `docs/01-uruchomienie.md` (`#minio`): MinIO z `docker compose --profile s3 up -d`, projekt z `uploads` startuje bez MinIO.
- `docs/02-architektura.md` (usługi modułów), `docs/02b-rejestr-i-generator.md` (przykład manifestu `uploads`), `docs/12-moduly-kitu.md` (opis modułu, region `wa:services`, tabela wyboru modułów).
- `docs/08-testy.md`:
  - kroki integracyjne z `--profile s3`;
  - `setup-env.ts` z `STORAGE_PROVIDER=s3`;
  - `appEnv` z `STORAGE_PROVIDER=local` i `E2E_UPLOADS_DIR`;
  - tabela zmiennych testów.
- `docs/16-cli-wa.md` (`.env` z `wa create`, regiony, co zostaje po `wa remove`), `docs/16b-rozwoj-kitu.md` (wersja `uploads` `0.2.0`, fragment compose z profilem), `docs/README.md`, `kit/README.md`.
- `docs/znane-ograniczenia.md`:
  - `local` wymaga jednej instancji i trwałego katalogu;
  - brak przenoszenia plików między providerami;
  - ręczne `node .next/standalone/server.js` wymaga `STORAGE_LOCAL_PATH`, bo standalone zmienia katalog roboczy na `.next/standalone`.
- `docs/decyzje.md`:
  - nowa decyzja D49 „Uploads: provider storage `local` albo `s3`, domyślnie `local`”: kontekst ze spotkania, reguły z 4.3, profil MinIO, katalog w obrazie, odrzucone alternatywy (S3 jako domyślny, nazwy zmiennych Ragena, ostrzeżenie w logach zamiast reguły);
  - aktualizacja pierwszego punktu „Decyzja” w D44 z odsyłaczem do D49.

**Zachowania:** w dokumentacji nie zostaje twierdzenie, że moduł wymaga S3 albo MinIO. Sprawdzenie: `grep -rn "wymaga.*MinIO\|S3_ENDPOINT.*wymagan" docs/*.md kit/README.md` zwraca tylko miejsca opisujące wariant `s3`. Każdy przykład komendy z dokumentacji, który dotyczy storage, jest uruchomiony albo oznaczony „(niesprawdzone)”.

**Mutacje do zabicia:** nie dotyczy.

- [ ] **Step 1:** Dokumentacja.
- [ ] **Step 2:** Bramki końcowe:
  - `npm run verify`;
  - `npm run verify --prefix kit/cli`;
  - `npm run wa -- kit sync && npm run wa -- generate && git diff --exit-code`;
  - `npm run test:integration` (jak w Task 4);
  - `npm run test:mutation:gate`;
  - `npm run test:e2e` po `docker compose up -d db mail` (serwery e2e startują z `STORAGE_PROVIDER=local`, czyli przechodzą walidację przy starcie).
- [ ] **Step 3:** Commit `docs(uploads): describe local and s3 storage providers`.

## Zakończenie

- Recenzja końcowa całej gałęzi (Opus), potem zbiorcze rozstrzygnięcia z ledgera dla Jakuba („Rulings I made”).
- Opis PR:
  - co i dlaczego;
  - zmiany rdzenia osobno (D48, `Dockerfile`, `setup-env.ts`, `e2e/env.ts`);
  - propozycje wpisów `allowed` z uzasadnieniem;
  - niesprawdzone na żywym Railway: prawa zapisu do wolumenu i zachowanie po nieudanym healthchecku.
- `superpowers:finishing-a-development-branch`. Push i PR tylko na prośbę Jakuba. Potem link do PR w zadaniu ClickUp [WA Kit · uploads: provider storage lokalny dysk albo S3](https://app.clickup.com/t/86bcxy1r3).
