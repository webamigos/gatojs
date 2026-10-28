# wa-kit — Plan 2: CLI (`create-wa-app`, `wa add/remove/list`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Z repozytorium wa-kit jedną komendą powstaje nowy projekt (rdzeń + wybrane moduły), który przechodzi `npm run verify`. W istniejącym projekcie moduły dodaje się i usuwa przez `wa add` / `wa remove`, a `wa list` pokazuje stan. Każdy plik i każda zależność kitu ma dokładnie jednego właściciela, a CI składa projekt `core` i go weryfikuje.

**Architecture:** CLI wychodzi z npm workspaces i trafia do `kit/cli` (samodzielna paczka z własnym lockfile). Jest bundlowane esbuildem do jednego pliku `.wa/bin/wa.mjs`, który jest commitowany i należy do `core`. Ten sam plik działa w kicie i w projekcie (`"wa": "node .wa/bin/wa.mjs"`), więc projekt nie potrzebuje rejestru npm. Kit pobiera się przez `git clone --branch v<wersja>`, a nowy projekt tworzy się z klonu (`node <klon>/.wa/bin/wa.mjs create <nazwa>`). Konfiguracja kitu jest w `kit/kit.json` (wersja, repo, pliki tylko dla kitu, placeholdery, pliki generowane i zarządzane). Manifesty modułów są w `kit/modules/<x>.json`, a `wa kit sync` przepisuje z nich `.wa/kit.json` kitu.

**Tech Stack:** Node 22 (ESM, `node:util` `parseArgs`, `node:readline/promises`, `node:child_process`), TypeScript 5, zod 4, esbuild (bundel), vitest 4, git (lista plików i pobieranie kitu), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-wa-kit-design.md` (§4, §5, §7, §8). Rulingi planu 1: `docs/superpowers/notes/2026-10-26-plan-1-handoff.md`.

**Ten plan to 2 z 4.** Plan 3: moduły `api-keys`, `audit-logs`, `uploads`, `worker`, `legal` i rozszerzenie macierzy CI. Plan 4: `wa update` i `wa diff`.

**Zakres poszerzony 2026-10-28** (przegląd z Jakubem): moduły projektu i testy rdzenia niezależne od modułów projektu (Task 5, notatka rozbieżności R3 i R56), uzupełnienia z `docs/superpowers/notes/2026-10-27-plan-2-test-additions.md` (Task 1, 3, 10) oraz sekcje „Zachowania” i „Mutacje do zabicia” w każdym zadaniu.

## Decyzje planu 2 (zaakceptowane przez Jakuba 2026-10-28)

- **D1. CLI przechodzi do `kit/cli` i przestaje być workspace.** Teraz root lockfile i `Dockerfile` (`COPY packages/cli/package.json`) zależą od CLI. Projekt bez `packages/cli` nie zbudowałby obrazu Dockera i miałby inny lockfile. Po przeniesieniu `package.json`, `package-lock.json`, `Dockerfile`, `ci.yml`, `CLAUDE.md`, `AGENTS.md` i `README.md` nie wymagają transformacji strukturalnej (usuwania kroków czy sekcji CLI). Jedyne zmiany przy składaniu to podmiana placeholderów (D6) i złożenie zależności w `package.json` (D4). `CLAUDE.md` i `AGENTS.md` nie zawierają placeholderów i są bajtowo identyczne.
- **D2. Dystrybucja: commitowany bundel `.wa/bin/wa.mjs` i `git clone` tagu.** Nie ma rejestru npm ani GitHub Packages, a jedynym wymogiem jest zalogowany `git`/`gh` (spec §8). Bootstrap wygląda tak: `git clone --depth 1 --branch v0.1.0 https://github.com/webamigos/wa-kit.git /tmp/wa-kit && node /tmp/wa-kit/.wa/bin/wa.mjs create <nazwa>`. Odstępstwo od spec §5: komenda nazywa się `wa create`, a `create-wa-app` to nazwa tego one-linera w dokumentacji. Osobny bin nie powstaje.
- **D3. Workspaces zostają statyczne (`packages/*`, `apps/*`)**, jak w planie 1. Sprawdziłem: `turbo run test typecheck` bez pakietów kończy się kodem 0, więc `verify` działa w projekcie bez workspace'ów.
- **D4. Zależności mają właścicieli tak jak pliki.** `core.json` jawnie wymienia wszystkie zależności rdzenia. `package.json` projektu to suma zależności zainstalowanych manifestów. Test pilnuje, żeby każda zależność w root `package.json` miała właściciela z tą samą wersją. Format `nazwa → wersja` jak w specu §4; koszt (bump zależności w kicie = edycja `package.json` i manifestu) przyjęty świadomie, bo test zgodności nie pozwala o tym zapomnieć.
- **D5. Hashe w `.wa/kit.json` liczone są z treści bez ciał regionów `wa:*`**, więc `wa generate` ich nie zmienia. Pliki generowane (`src/modules*.generated.ts`, `src/i18n/locales.generated.ts`) nie mają właściciela i tworzy je `generate`. `package.json` i `package-lock.json` są „zarządzane” (hash `"managed"`); ich scalanie rozwiąże plan 4.
- **D6. Placeholdery to podmiana literałów** `WA App` → nazwa, `wa-app` → slug, `wa_app` → slug z `_`. Działa tylko w plikach z `placeholderFiles`, nigdy w testach. Lista obejmuje też `src/test/integration/database-url.ts`, `.github/workflows/ci.yml` i `.github/workflows/mutation.yml`, żeby baza testów integracyjnych projektu nazywała się `<snake>_test`, a nie `wa_app_test` wspólne dla wszystkich projektów na maszynie. `package-lock.json` poprawia `npm install`.
- **D7. Języki (`--locales`) przez plik generowany** `src/i18n/locales.generated.ts` z `locales` zapisanych w `.wa/kit.json`. Brak `en` nie usuwa plików `en.json`.
- **D8. R22 bez transformacji.** Linia `prisma/migrations/` znika z root `.gitignore`. Kit-only plik `prisma/migrations/.gitignore` (`*` + `!.gitignore`) ignoruje migracje tylko w kicie.
- **D9. `wa remove` działa „wszystko albo nic”.** Jeśli choć jeden plik modułu się zmienił, bez `--force` nic nie jest usuwane i komenda kończy się kodem 1.
- **D10. Baza i admin przy tworzeniu są opcjonalne (`--setup`).** Domyślnie `create` zapisuje `.env` z losowym `BETTER_AUTH_SECRET` i wypisuje kolejne kroki. Z flagą `--setup` uruchamia `docker compose up -d --wait`, `prisma migrate dev --name init` i `admin:create`. Powód: konflikty portów na maszynach deweloperów.
- **D11. Moduły projektu (R3).** Funkcja napisana dla klienta (np. `notes`) ma wpis w sekcji `projectModules` w `.wa/kit.json`: `{ "<x>": { "manifest": <manifest> } }`, bez wersji wpisu i bez hashy plików. Manifest ma ten sam schemat co `kit/modules/<x>.json`, więc awans funkcji do kitu to przeniesienie pliku manifestu i plików, bez przepisywania. `wa generate` rejestruje moduły projektu tak jak moduły kitu (rejestr, regiony env/relacji/compose). `wa remove`, `wa kit sync`, a w planie 4 `wa update` i `wa diff` ich nie ruszają. Przełączenie wpisu z `projectModules` do `modules` po awansie robi się ręcznie (opis w dokumentacji); komenda do tego wychodzi poza plan 2.
- **D12. Testy rdzenia sprawdzają tylko rdzeń (R56).** Testy rdzenia, które porównują rejestr z literałem (`access-matrix.test.ts`, `nav.test.ts`, `app-sidebar.test.tsx`), filtrują rejestr do pięciu kluczy rdzenia. Moduły spoza rdzenia (projektu i przyszłe moduły kitu) pilnuje jeden ogólny test spójności rejestru. Dodanie funkcji klienta nie wymaga edycji plików rdzenia.

## Global Constraints

- Publiczny adres aplikacji to `APP_URL` (dawniej `BETTER_AUTH_URL`; zmienione 2026-10-27 na prośbę Patryka, gałąź `refactor/app-url`). Nowy kod i dokumenty używają wyłącznie `APP_URL`.
- Node 22, npm. W tym środowisku instaluj przez `npx -y npm@11.21.1 install` (npm 10.9 się wywraca).
- Jedyna zależność runtime CLI to `zod` `^4.3.6`. Dev: `typescript` `^5`, `vitest` `^4.1.2`, `@types/node` `^22`, `esbuild` (aktualne `^0.x`). Argumenty parsuje `node:util` `parseArgs`, prompty obsługuje `node:readline/promises`, globy dopasowuje własny matcher (Task 3). Bez picomatch, commandera, inquirera.
- Komunikaty CLI są po polsku. Błędy wychodzą jako `Error` z treścią z planu, a bin wypisuje `message` i kończy się kodem 1.
- Bez komentarzy w kodzie (hook `.claude/hooks/block-comments.mjs`), z wyjątkami z `CLAUDE.md`.
- Pliki generowane zaczynają się od `// generated by wa — nie edytuj. Uruchom: npm run wa -- generate`. Są w `.prettierignore` i eslint ignores i muszą być bajtowo równe wyjściu `generate` (R17).
- Bundel `.wa/bin/wa.mjs` jest w `.prettierignore` i eslint ignores. Po każdej zmianie w `kit/cli/src` trzeba uruchomić `npm run build --prefix kit/cli` i scommitować bundel.
- Bramka kitu: `npm run verify && npm run verify --prefix kit/cli`. Bramka projektu: `npm run verify`.
- Nie uruchamiaj `prisma migrate reset` ani `db push --force-reset`. Lokalna baza: `DB_PORT=5439`, `docker compose -p wa-kit-plan2 …`. Innych kontenerów nie ruszaj, bazy `wa_app` nie usuwaj.
- Commity: Conventional Commits, temat małymi literami, na końcu `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pracuj na gałęzi `feat/plan-2-cli` (z `main`). Push i PR tylko na prośbę Jakuba.
- Proces każdego zadania (`AGENTS.md`, „Testy, które próbują złamać kod”):
  1. `test-writer` (model `sonnet`) pisze testy z sekcji „Zachowania” i „Mutacje do zabicia” zadania. Przykłady testów w krokach to wzór stylu i wartości, nie pełna lista. Testy są czerwone z właściwego powodu (brak eksportu albo zła wartość). Commit testów osobno: `test(<zakres>): …`.
  2. Implementer (`general-purpose`, `sonnet`) pracuje przy `printf implement > .superpowers/phase`; po pracy `rm .superpowers/phase`.
  3. `test-reviewer` (`sonnet`) uruchamia mutacje dla plików zadania (`npm run test:mutation:task -- <pliki>` w root albo `npm run test:mutation:task --prefix kit/cli -- <pliki>` dla CLI) i bramkę (`npm run test:mutation:gate`, dla CLI `npm run test:mutation:gate --prefix kit/cli`). Sprawdza też nietknięte testy: `git diff --stat <commit-testów>..HEAD -- '**/__tests__/**' '**/*.test.*' 'e2e/**'` musi być puste; każda zmiana wymaga zgody Jakuba (hook nie łapie zapisu przez `Bash`).
  4. Wpisy `allowed` w `mutation-gate.json` i `kit/cli/mutation-gate.json` dodaje albo usuwa tylko Jakub; agent proponuje listę i czeka.
  5. Recenzja końcowa całej gałęzi: `opus`.
- Stryker: nigdy dwa przebiegi naraz (root i `kit/cli` też nie).

## Review Focus

- `create` do katalogu, który istnieje i nie jest pusty → odmowa, żaden plik nie zmieniony → test w Task 7.
- Nazwa projektu `Moja Apka`, `../x` albo `1app` → błąd przed utworzeniem czegokolwiek → testy w Task 6 (`projectNames`) i Task 7.
- Brak dostępu do repo kitu albo brak tagu → komunikat z podpowiedzią `gh auth status` / `--kit` zamiast surowego stderr gita → test w Task 8.
- `npm install` pada po skopiowaniu plików → `.wa/kit.json` zapisany, komunikat co uruchomić, kod 1, katalog zostaje → testy w Task 7 i Task 8.
- Literówka w nazwie modułu (`--modules api-key`) → błąd z listą dostępnych modułów → test w Task 6.
- Klient dodaje funkcję `notes` jako moduł projektu → `wa generate` ją rejestruje, `npm run verify` przechodzi bez edycji testów rdzenia, a `wa remove notes` odmawia i niczego nie kasuje → testy w Task 5 i Task 9.

---

### Task 1: CLI w `kit/cli` i bundel `.wa/bin/wa.mjs`

**Files:**
- Move: `packages/cli/**` → `kit/cli/**` (`git mv`, razem z fixtures i testami)
- Modify: `kit/cli/package.json` (`"private": true`; usunąć `bin` i `files`; skrypty: `"typecheck": "tsc --noEmit -p tsconfig.json"`, `"test": "vitest run"`, `"build": "npm run typecheck && node bundle.mjs"`, `"verify": "npm run typecheck && npm test && npm run build"`; devDependency `esbuild`), `kit/cli/tsconfig.json` (`noEmit`, bez `outDir`/`declaration`)
- Create: `kit/cli/bundle.mjs`, `kit/cli/package-lock.json`, `.wa/bin/wa.mjs` (wynik builda), `kit/CLAUDE.md`, `.github/workflows/kit.yml`, `.github/workflows/kit-mutation.yml`, `kit/cli/stryker.config.json`, `kit/cli/mutation-gate.json`
- Modify: root `package.json` (`"wa": "node .wa/bin/wa.mjs"`), root `package-lock.json` (bez workspace `@wa-kit/cli`), `Dockerfile` (usunąć `COPY packages/cli/package.json ./packages/cli/`), `.dockerignore` (usunąć `packages/cli/dist`, dodać `kit`, `docs`), `.github/workflows/ci.yml` (usunąć krok „Build wa CLI”), `eslint.config.mjs` i `.prettierignore` (dodać `.wa/**`; w `eslint.config.mjs` i `vitest.config.ts` dodać `kit/**` obok `packages/**` (D3), bo `tsconfig.json` już wyklucza `kit/**`, a bez tego root `npm test` i lint wezmą testy i fixtures CLI), `CLAUDE.md`, `AGENTS.md`, `README.md` (wszystkie `npm run build -w @wa-kit/cli && npm run wa -- generate` → `npm run wa -- generate`; z opisu `verify` usunąć „testy CLI”), `kit/cli/src/generate/registry.ts` (`GENERATED_HEADER` → `// generated by wa — nie edytuj. Uruchom: npm run wa -- generate`), `src/modules.generated.ts`, `src/modules.client.generated.ts` (regeneracja)

**Interfaces:**
- Produces: `npm run wa -- <komenda>` działa w kicie bez budowania. `kit/cli/bundle.mjs` woła esbuild: `entryPoints: ["src/bin.ts"]`, `bundle: true`, `platform: "node"`, `format: "esm"`, `target: "node22"`, `banner: { js: "#!/usr/bin/env node" }`, `outfile: "../../.wa/bin/wa.mjs"`, `legalComments: "none"`.
- `kit.yml`, job `cli`: `npm ci --prefix kit/cli` → `npm run verify --prefix kit/cli` → `git diff --exit-code -- .wa/bin/wa.mjs` (bundel aktualny).
- `kit/CLAUDE.md` (kit-only): bramka kitu, rebuild i commit bundla po zmianie CLI, podbicie `version` modułu przy zmianie jego plików, rola `kit/modules/*.json` i `kit/kit.json`.
- Mutacje CLI (z `plan-2-test-additions.md`):
  - `kit/cli/stryker.config.json`: `testRunner: "vitest"`, `checkers: ["typescript"]`, `mutate: ["src/**/*.ts", "!src/**/__tests__/**", "!src/bin.ts"]`, `incremental: true`, `incrementalFile: "reports/stryker-incremental.json"`, `thresholds.break: 75`, raport `json` w `reports/mutation/mutation.json`.
  - `kit/cli/package.json`: skrypty `"test:mutation": "stryker run"`, `"test:mutation:task": "stryker run --force --mutate"`, `"test:mutation:gate": "tsx ../../scripts/mutation-gate.ts"`; devDependencies `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@stryker-mutator/typescript-checker`, `fast-check`, `@fast-check/vitest`, `tsx` w wersjach z root `package.json`.
  - `kit/cli/mutation-gate.json`: `{ "critical": ["src/generate/", "src/manifest/", "src/assemble/", "src/commands/"], "allowed": [] }`. Osobny plik, bo raport Strykera z `kit/cli` ma ścieżki względem `kit/cli`, a `scripts/mutation-gate.ts` czyta `mutation-gate.json` i raporty z bieżącego katalogu.
  - `.gitignore`: `kit/cli/reports/`, `kit/cli/.stryker-tmp/`.
  - `.github/workflows/kit-mutation.yml` (kit-only, tylko `workflow_dispatch`, jak `mutation.yml`, decyzja D26): `npm ci --prefix kit/cli` → `npm run test:mutation --prefix kit/cli` → `npm run test:mutation:gate --prefix kit/cli`.

**Zachowania:**
- W kicie bez wcześniejszego builda `npm run wa -- generate` kończy się kodem 0; drugie wywołanie wypisuje `Bez zmian`.
- `src/modules.generated.ts` i `src/modules.client.generated.ts` zaczynają się od `// generated by wa — nie edytuj. Uruchom: npm run wa -- generate` (test `registry.test.ts` na literale nagłówka).
- Wszystkie 35 istniejących testów CLI przechodzi po przeniesieniu bez zmian w asercjach (poza literałem nagłówka).
- `grep -rn "@wa-kit/cli\|packages/cli"` poza `node_modules`, `docs`, `kit` → brak trafień; `docker build .` → sukces.
- `.wa/bin/wa.mjs` zaczyna się od `#!/usr/bin/env node`; `npm run build --prefix kit/cli` dwa razy z rzędu daje bajtowo ten sam plik.
- `npm run test:mutation:task --prefix kit/cli -- src/generate/regions.ts` tworzy `kit/cli/reports/mutation/mutation.json`, a `npm run test:mutation:gate --prefix kit/cli` czyta go i kończy się kodem 0 albo listą mutantów do decyzji.

**Mutacje do zabicia:** brak nowej logiki (przeniesienie). Jedyna zmiana w kodzie to `GENERATED_HEADER`: test asertuje pełny literał, więc mutacja tekstu nagłówka pada.

- [ ] **Step 0:** `test-writer` zmienia w `registry.test.ts` (i innych testach z literałem nagłówka) oczekiwany nagłówek na nowy literał. Run: `npx vitest run --root packages/cli` → FAIL tylko na nagłówku. Commit testów.
- [ ] **Step 1:** `git mv packages/cli kit/cli`, poprawić package.json/tsconfig, `cd kit/cli && npx -y npm@11.21.1 install`, potem w root `npx -y npm@11.21.1 install`. Run: `npm test --prefix kit/cli` → 35 testów PASS.
- [ ] **Step 2:** Dodać `bundle.mjs`. Run: `npm run build --prefix kit/cli && npm run wa -- generate`. Expected: zmienione tylko dwa pliki `src/modules*.generated.ts` (nowy nagłówek). Drugie `npm run wa -- generate` → `Bez zmian`.
- [ ] **Step 3:** Poprawki w root (Dockerfile, ci.yml, dokumenty, ignores) i `kit.yml`. Run: `grep -rn "@wa-kit/cli\|packages/cli" --exclude-dir=node_modules --exclude-dir=docs --exclude-dir=kit . ; echo $?` → `1` (brak trafień).
- [ ] **Step 4:** Stryker w `kit/cli` (`stryker.config.json`, skrypty, `mutation-gate.json`, `kit-mutation.yml`). Run: `npm run test:mutation:task --prefix kit/cli -- src/generate/regions.ts && npm run test:mutation:gate --prefix kit/cli` → raport powstaje, bramka zwraca wynik (przeżyłe mutanty w plikach krytycznych idą do Jakuba jako propozycje wpisów `allowed` albo do `test-writer`).
- [ ] **Step 5:** Run: `npm run verify && npm run verify --prefix kit/cli` → PASS. Run: `docker build .` → sukces.
- [ ] **Step 6: Commit** — `refactor(cli): move cli to kit/cli and ship single-file bundle`

---

### Task 2: `kit/kit.json`, rozszerzony stan projektu i `wa kit sync`

**Files:**
- Create: `kit/kit.json`, `kit/modules/core.json` (na start: manifest `core` przeniesiony z obecnego `.wa/kit.json`), `kit/cli/src/kit/kit-config.ts`, `kit/cli/src/commands/kit-sync.ts`
- Modify: `kit/cli/src/manifest/schema.ts`, `kit/cli/src/bin.ts`, `.wa/kit.json` (wynik `wa kit sync`)
- Test: `kit/cli/src/kit/__tests__/kit-config.test.ts`, `kit/cli/src/commands/__tests__/kit-sync.test.ts`, istniejące `manifest/__tests__/*` (nowe pola)

**Interfaces:**
- Produces:
  - `kitStateSchema` dostaje pola z domyślnymi wartościami: `kitRepo: string` (`"https://github.com/webamigos/wa-kit.git"`), `project: { name: string; slug: string }` (`{ name: "WA App", slug: "wa-app" }`), `locales: ("pl" | "en")[]` (`["pl", "en"]`, min. 1 element, musi zawierać `"pl"`). `writeKitState` zapisuje je przed `modules`.
  - `type KitConfig = { version: string; repo: string; kitOnly: string[]; placeholders: { projectName: string; projectSlug: string; projectSnake: string }; placeholderFiles: string[]; generatedFiles: string[]; managedFiles: string[] }` i `kitConfigSchema`.
  - `readKitConfig(kitDir: string): Promise<KitConfig>`. Brak pliku → `Error("Brak kit/kit.json w <kitDir> — to nie jest repozytorium wa-kit")`.
  - `readKitManifests(kitDir: string): Promise<ModuleManifest[]>`. Czyta `kit/modules/*.json`, kolejność: `core`, potem alfabetycznie. Gdy `name` ≠ nazwa pliku → `Error("kit/modules/<plik>: name \"<name>\" nie zgadza się z nazwą pliku")`.
  - `kitSync(kitDir: string): Promise<{ changed: boolean }>`. Zapisuje `.wa/kit.json` = `{ kitVersion: config.version, kitRepo: config.repo, project: { name: placeholders.projectName, slug: placeholders.projectSlug }, locales: ["pl","en"], modules: <wszystkie manifesty, version z manifestu, files: {}> }`. Bin: `wa kit sync`.
- `kit/kit.json`:
  ```json
  {
    "version": "0.1.0",
    "repo": "https://github.com/webamigos/wa-kit.git",
    "kitOnly": ["kit/**", "docs/**", ".superpowers/**", ".claude/handoffs/**", ".wa/kit.json", ".github/workflows/kit.yml", ".github/workflows/kit-mutation.yml", "prisma/migrations/.gitignore"],
    "placeholders": { "projectName": "WA App", "projectSlug": "wa-app", "projectSnake": "wa_app" },
    "placeholderFiles": ["src/shared/config/project.ts", "package.json", "docker-compose.yml", ".env.example", "e2e/env.ts", ".github/workflows/e2e.yml", ".github/workflows/ci.yml", ".github/workflows/mutation.yml", "src/test/integration/database-url.ts", "README.md"],
    "generatedFiles": ["src/modules.generated.ts", "src/modules.client.generated.ts", "src/i18n/locales.generated.ts"],
    "managedFiles": ["package.json", "package-lock.json"]
  }
  ```
- `kit.yml`, job `cli`: po `verify` dochodzi krok `npm run wa -- kit sync && npm run wa -- generate && git diff --exit-code`.

**Zachowania:**
- `.wa/kit.json` w starym formacie `{ "kitVersion": "0.0.0", "modules": {} }` → `readKitState` zwraca `kitRepo: "https://github.com/webamigos/wa-kit.git"`, `project: { name: "WA App", slug: "wa-app" }`, `locales: ["pl", "en"]`.
- `locales`: `["pl"]` i `["pl", "en"]` poprawne; `["en"]`, `[]`, `["pl", "de"]`, `["pl", "pl"]` → błąd walidacji.
- `writeKitState` zapisuje klucze w kolejności `kitVersion`, `kitRepo`, `project`, `locales`, `modules` (porównanie z literałem JSON), wcięcie 2, końcowy `\n`.
- `readKitConfig` w katalogu bez `kit/kit.json` → `Brak kit/kit.json w <kitDir> — to nie jest repozytorium wa-kit`; plik z brakującym polem (np. bez `placeholderFiles`) → błąd walidacji.
- `readKitManifests`: kolejność `core`, potem alfabetycznie (fixture `core`, `needs-demo`, `demo` → `["core", "demo", "needs-demo"]`); `name` ≠ nazwa pliku → `kit/modules/demo.json: name "inny" nie zgadza się z nazwą pliku`.
- `kitSync`: pierwsze wywołanie → `{ changed: true }` i `.wa/kit.json` z `kitVersion: "0.1.0"`, wersjami modułów z manifestów i `files: {}`; drugie → `{ changed: false }` i plik bajtowo bez zmian.

**Mutacje do zabicia:** usunięcie wartości domyślnych nowych pól; `locales` bez wymogu `"pl"` albo bez wymogu min. 1 elementu; `core` nie na początku (sortowanie tylko alfabetyczne); brak sprawdzenia `name` ↔ nazwa pliku; `kitSync` zwracające zawsze `changed: true`; `kitSync` biorące wersję modułu z `config.version` zamiast z manifestu.

- [ ] **Step 1: Failing tests** (przykłady; `test-writer` pokrywa wszystkie „Zachowania”)
```ts
it("stary kit.json bez nowych pól dostaje wartości domyślne", async () => {
  await writeRaw(tmp, { kitVersion: "0.0.0", modules: {} });
  expect(await readKitState(tmp)).toMatchObject({ project: { name: "WA App", slug: "wa-app" }, locales: ["pl", "en"] });
});
it("locales bez pl → błąd walidacji", () => {
  expect(kitStateSchema.safeParse({ ...validState, locales: ["en"] }).success).toBe(false);
});
it("readKitManifests: core pierwszy, potem alfabetycznie", async () => {
  expect((await readKitManifests(fixtureKit)).map((m) => m.name)).toEqual(["core", "demo", "needs-demo"]);
});
it("name niezgodne z plikiem → błąd z nazwą pliku", async () => {
  await expect(readKitManifests(badKit)).rejects.toThrow('kit/modules/demo.json: name "inny" nie zgadza się z nazwą pliku');
});
it("kitSync zapisuje wszystkie moduły, drugie wywołanie bez zmian", async () => {
  expect(await kitSync(kitDir)).toEqual({ changed: true });
  expect(Object.keys((await readKitState(kitDir)).modules)).toEqual(["core", "demo", "needs-demo"]);
  expect(await kitSync(kitDir)).toEqual({ changed: false });
});
```
  `fixtureKit` to nowy `kit/cli/src/__tests__/fixtures/kit/` z `kit/kit.json` (`version: "0.1.0"`, reszta jak w kicie) i manifestami `core`, `demo` (env `DEMO_TOKEN` = `{{projectSlug}}_demo_`, `schemaRelations` `User.demos Demo[]`, `compose` `src/features/demo/compose.yml`, `dependencies: { "left-pad": "^1.3.0" }`) oraz `needs-demo` (`requires: ["demo"]`). Pliki aplikacji fixture dochodzą w Task 3 i Task 7.
- [ ] **Step 2:** Run `npm test --prefix kit/cli` → FAIL.
- [ ] **Step 3:** Implementacja, potem `npm run build --prefix kit/cli && npm run wa -- kit sync && npm run wa -- generate`.
- [ ] **Step 4:** Run `npm run verify --prefix kit/cli && npm run verify` → PASS.
- [ ] **Step 5: Commit** — `feat(cli): kit config, extended kit state and wa kit sync`

---

### Task 3: Własność plików i zależności, higiena repo

**Files:**
- Create: `kit/cli/src/kit/files.ts`, `kit/cli/src/kit/ownership.ts`, `prisma/migrations/.gitignore` (treść: `*` i `!.gitignore`)
- Modify: `kit/modules/core.json` (pełne `files` i `dependencies`/`devDependencies`), `.gitignore` (usunąć `prisma/migrations/`), `.github/workflows/security-secret-scan.yml` (`trufflesecurity/trufflehog@main` → najnowszy tag release), `.github/workflows/workflow-lint.yml` (`rhysd/actionlint:latest` → najnowszy tag), `.coderabbit.yaml` (komentarz o gałęzi `dev` z justnails → neutralny opis `main`)
- Test: `kit/cli/src/kit/__tests__/files.test.ts`, `kit/cli/src/kit/__tests__/ownership.test.ts`

**Interfaces:**
- Produces:
  - `globToRegExp(glob: string): RegExp`. Tylko `**` (dowolna liczba segmentów, także zero) i `*` (znaki poza `/`). Pozostałe znaki, w tym `[locale]` i `(app)`, są literałami.
  - `matchFiles(globs: string[], files: string[]): string[]`. Zwraca pliki pasujące do któregokolwiek globu, posortowane.
  - `listKitFiles(kitDir: string): Promise<string[]>`. `git -C <kitDir> ls-files -z`, posortowane. Poza repo git → `Error("<kitDir> nie jest repozytorium git")`.
  - `assemblableFiles(kitDir: string, config: KitConfig): Promise<string[]>` = `listKitFiles` minus `kitOnly` minus `generatedFiles`.
  - `checkOwnership(kitDir: string): Promise<OwnershipReport>`, gdzie `type OwnershipReport = { unowned: string[]; multiOwned: { file: string; owners: string[] }[]; globErrors: { module: string; glob: string; reason: "empty" | "brace" }[]; unownedDependencies: string[]; dependencyMismatch: { module: string; name: string; manifest: string; packageJson: string }[]; composeOutsideModule: string[] }`.
    - `globErrors.empty`: glob nie pasuje do żadnego pliku. `brace`: glob zawiera `{` (R14).
    - Zależności: każdy klucz `dependencies`/`devDependencies` root `package.json` jest zadeklarowany przez ≥1 manifest z identyczną wersją. Zależność manifestu, której nie ma w `package.json`, trafia do `dependencyMismatch` z `packageJson: "<brak>"`.
    - `composeOutsideModule`: moduły, których `compose` nie jest wśród ich własnych plików.
- Zasady `core.json`: globy na poziomie katalogów, które nie zachodzą na ścieżki modułów ze spec §3. Na przykład `src/app/[locale]/(app)/dashboard/**` zamiast `src/app/**`, a pliki w `src/app/[locale]/(app)/` przez `src/app/[locale]/(app)/*`. `core.json` obejmuje też: `.wa/bin/wa.mjs`, `.claude/hooks/**`, `.claude/settings.json`, `.github/workflows/` (6 plików poza `kit.yml` i `kit-mutation.yml`: `ci`, `e2e`, `mutation`, `security-audit`, `security-secret-scan`, `workflow-lint`), `.husky/**`, `scripts/**`, `e2e/**`, `src/proxy.ts`, `src/instrumentation.ts`, `src/types/**` i każdy plik konfiguracyjny w root. Plan 3 zawęzi globy `src/shared/lib/*`, gdy moduły dodadzą tam pliki.
- `core.json` obejmuje też system testów adwersarialnych (z `plan-2-test-additions.md`): `stryker.config.json`, `stryker.integration.config.json`, `mutation-gate.json`, `scripts/mutation-gate.ts`, `scripts/lib/mutation-gate.ts` (+ testy), `vitest.integration.config.ts`, `src/test/**` (w tym `src/test/integration/**`), `src/__tests__/server-entrypoints-guard.test.ts`, `.claude/hooks/protect-tests.mjs` (+ test), `.claude/agents/test-writer.md`, `.claude/agents/test-reviewer.md`, `.github/workflows/mutation.yml`. DevDependencies `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@stryker-mutator/typescript-checker`, `fast-check`, `@fast-check/vitest` należą do `core`.
- Pliki rdzenia niezależne od nazwy projektu (warunek asercji placeholderów w Task 10):
  - `AGENTS.md:141`: `(domyślnie postgresql://…/wa_app_test)` → `(domyślny adres w src/test/integration/database-url.ts, baza <nazwa_projektu>_test)`; `AGENTS.md` i `CLAUDE.md` nie zawierają `WA App`, `wa-app` ani `wa_app`.
  - `scripts/lib/__tests__/admin-create.test.ts` (zmienia `test-writer`): testy organizacji domyślnej (linie 156 i 274) mockują `@/shared/config/project` na `{ name: "Test Projekt", slug: "test-projekt" }` i oczekują tych literałów. Bez tego w złożonym projekcie (`project.ts` po podmianie) testy padają. `slugifyOrgName("WA App")` (linia 708) zostaje, bo to wejście czystej funkcji.
- Kolejność w raporcie: każda lista posortowana po pliku, a potem po module/nazwie zależności (`compareCodePoint`); `dependencyMismatch` po `module`, potem `name`. Glob z `{` daje tylko wpis `brace`, bez `empty`.

**Zachowania:**
- `globToRegExp`:
  - `src/app/[locale]/(app)/users/**` pasuje do `src/app/[locale]/(app)/users/page.tsx` i `src/app/[locale]/(app)/users/a/b.tsx`, nie pasuje do `src/app/l/(app)/users/page.tsx`, `src/app/[locale]/(app)/users` (bez `/`) ani `xsrc/app/[locale]/(app)/users/page.tsx`;
  - `src/**/x.ts` pasuje do `src/x.ts` i `src/a/b/x.ts`, nie do `src/ax.ts`;
  - `src/*` pasuje do `src/a.ts`, nie do `src/a/b.ts`;
  - `a.b` nie pasuje do `aXb` (kropka jest literałem); `src/a+b.ts` pasuje tylko do siebie.
- `matchFiles(["src/**", "src/a.ts"], ["b.ts", "src/b.ts", "src/a.ts"])` → `["src/a.ts", "src/b.ts"]` (bez duplikatów, posortowane).
- `listKitFiles` w katalogu bez `.git` → `<kitDir> nie jest repozytorium git`; plik nieśledzony (nie dodany do indeksu) nie trafia na listę.
- `assemblableFiles` nie zawiera plików z `kitOnly` (`docs/readme.md`) ani `generatedFiles`.
- `checkOwnership` na fixture `ownership-broken`:
  - `unowned: ["orphan.ts"]`;
  - `multiOwned: [{ file: "src/shared/x.ts", owners: ["core", "demo"] }]`;
  - `globErrors`: `{ module: "demo", glob: "src/nie-ma/**", reason: "empty" }` oraz `{ module: "demo", glob: "src/{a,b}/**", reason: "brace" }`;
  - `unownedDependencies: ["lonely-dep"]`;
  - `dependencyMismatch`: `{ module: "demo", name: "ghost", manifest: "1.0.0", packageJson: "<brak>" }` oraz `{ module: "demo", name: "left-pad", manifest: "^1.3.0", packageJson: "^1.2.0" }`;
  - `composeOutsideModule: ["demo"]` (compose `other/compose.yml` poza plikami `demo`).
- `checkOwnership(REPO_ROOT)` → wszystkie listy puste.
- Po `prisma migrate dev --create-only` `git status --porcelain prisma/` jest puste (Step 4).

**Mutacje do zabicia:** `**` niepasujące do zera segmentów; `*` przechodzące przez `/`; brak escapowania znaków specjalnych regex (`.`, `(`, `[`, `+`); brak kotwic `^`/`$`; próg `multiOwned` `> 2` zamiast `> 1`; brak porównania wersji zależności; brak odjęcia `kitOnly` albo `generatedFiles`; brak wykrycia `{` w globie.

- [ ] **Step 1: Failing tests** (przykłady)
```ts
it("[locale] i (app) są literałami, ** obejmuje zero segmentów", () => {
  const re = globToRegExp("src/app/[locale]/(app)/users/**");
  expect(re.test("src/app/[locale]/(app)/users/page.tsx")).toBe(true);
  expect(re.test("src/app/l/(app)/users/page.tsx")).toBe(false);
  expect(globToRegExp("src/**/x.ts").test("src/x.ts")).toBe(true);
  expect(globToRegExp("src/*").test("src/a/b.ts")).toBe(false);
});
it("fixture: wykrywa plik bez właściciela, podwójnego właściciela, pusty glob i zależność bez właściciela", async () => {
  const report = await checkOwnership(await makeKitRepo("ownership-broken"));
  expect(report.unowned).toEqual(["orphan.ts"]);
  expect(report.multiOwned).toEqual([{ file: "src/shared/x.ts", owners: ["core", "demo"] }]);
  expect(report.globErrors).toEqual([{ module: "demo", glob: "src/nie-ma/**", reason: "empty" }]);
  expect(report.unownedDependencies).toEqual(["lonely-dep"]);
});
it("repozytorium wa-kit: każdy plik i każda zależność ma dokładnie jednego właściciela", async () => {
  expect(await checkOwnership(REPO_ROOT)).toEqual({
    unowned: [], multiOwned: [], globErrors: [], unownedDependencies: [], dependencyMismatch: [], composeOutsideModule: [],
  });
});
```
  `makeKitRepo(name)` (`kit/cli/src/__tests__/helpers.ts`) kopiuje fixture do katalogu tymczasowego, potem robi `git init -q` i `git add -A`. `REPO_ROOT = resolve(import.meta.dirname, "../../../../..")`.
- [ ] **Step 2:** Run `npm test --prefix kit/cli` → FAIL. `test-writer` przepina też `admin-create.test.ts` na mock `project` (Run: `npx vitest run scripts/lib` → PASS). Commit testów.
- [ ] **Step 3:** Implementacja i uzupełnienie `core.json` aż test repo przejdzie. Poprawka `AGENTS.md:141`. Potem pliki higieny (`.gitignore`, `prisma/migrations/.gitignore`, przypięte wersje akcji z `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name`, `.coderabbit.yaml`) i `npm run wa -- kit sync`.
- [ ] **Step 4:** Run: `docker compose -p wa-kit-plan2 up -d --wait db` (z `DB_PORT=5439`), potem `DATABASE_URL=postgresql://postgres:postgres@localhost:5439/wa_kit_plan2 npx prisma migrate dev --name init --create-only`. Expected: migracja powstaje, a `git status --porcelain prisma/` jest puste (ignorowana przez zagnieżdżony `.gitignore`, Prisma toleruje plik w katalogu migracji). Usunąć wygenerowany katalog migracji i `docker compose -p wa-kit-plan2 down`.
- [ ] **Step 5:** Run `npm run verify --prefix kit/cli && npm run verify` → PASS.
- [ ] **Step 6: Commit** — `feat(cli): file and dependency ownership check with full core manifest`

---

### Task 4: `generate`: języki i placeholdery w env

**Files:**
- Modify: `kit/cli/src/generate/{index,registry,targets}.ts`, `src/i18n/config.ts` (`locales` importowane z `./locales.generated`, eksport `locales`, `Locale`, `defaultLocale` bez zmian), `.prettierignore`, `eslint.config.mjs` (dodać `src/i18n/locales.generated.ts`)
- Create (przez `generate`): `src/i18n/locales.generated.ts`
- Test: `kit/cli/src/generate/__tests__/{registry,generate}.test.ts` (aktualizacja i nowe przypadki)

**Interfaces:**
- Consumes: `KitState.locales`, `KitState.project` (Task 2).
- Produces:
  - `renderRegistry(modules: RegistryModule[], locales: ("pl"|"en")[]): { server: string; client: string }`. `moduleMessages` ma typ `Record<Locale, MessageLoader[]>` (`import type { Locale } from "@/i18n/config"`) i klucze tylko z `locales`.
  - `renderLocales(locales: ("pl"|"en")[]): string` → nagłówek + `export const locales = ["pl", "en"] as const;\n`. Cel generowania `src/i18n/locales.generated.ts`.
  - `RegionTarget.body` dostaje kontekst `{ modules: ModuleManifest[]; projectDir: string; project: { name: string; slug: string } }`. `envBody` podmienia w `example` `{{projectSlug}}` i `{{projectName}}`.

**Zachowania:**
- `locales: ["pl"]` → `src/i18n/locales.generated.ts` = nagłówek + `export const locales = ["pl"] as const;\n`; `moduleMessages` w `src/modules.generated.ts` ma tylko klucz `pl`.
- `locales: ["pl", "en"]` → `src/modules.generated.ts` i `src/modules.client.generated.ts` w kicie bajtowo takie jak przed zmianą (poza nagłówkiem z Task 1); `locales.generated.ts` z `["pl", "en"]`.
- Moduł z `i18n/en.json` przy `locales: ["pl"]` → loader `en` nie trafia do rejestru, plik `en.json` zostaje na dysku.
- `example` `{{projectSlug}}_demo_{{projectSlug}}` przy slugu `acme-shop` → `acme-shop_demo_acme-shop` (każde wystąpienie); `{{projectName}}` → `Acme Shop`.
- Drugie `generate` po pierwszym → `changed: []`.
- `src/i18n/config.ts` eksportuje te same `locales`, `Locale` i `defaultLocale` co przed zmianą (typecheck i istniejące testy i18n przechodzą).

**Mutacje do zabicia:** `locales` ignorowane (zawsze `pl, en`); `replace` zamiast `replaceAll`; zamienione `{{projectName}}` i `{{projectSlug}}`; plik języków bez `as const`.

- [ ] **Step 1: Failing tests** (przykłady)
```ts
it("locales [pl] → plik języków i moduleMessages tylko z pl", async () => {
  const dir = await copyFixture("minimal");
  await setState(dir, { locales: ["pl"] });
  await generate(dir);
  expect(await read(dir, "src/i18n/locales.generated.ts")).toContain('export const locales = ["pl"] as const;');
  expect(await read(dir, "src/modules.generated.ts")).not.toMatch(/^\s+en:/m);
});
it("{{projectSlug}} w przykładzie env podmieniony slugiem projektu", async () => {
  const dir = await copyFixture("minimal");
  await setState(dir, { project: { name: "Acme Shop", slug: "acme-shop" } });
  await generate(dir);
  expect(await read(dir, ".env.example")).toContain("DEMO_TOKEN=acme-shop_demo_");
});
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementacja, `npm run build --prefix kit/cli && npm run wa -- generate`. **Step 4:** Run `npm run verify --prefix kit/cli && npm run verify` → PASS.
- [ ] **Step 5: Commit** — `feat(cli): generate locales file and project placeholders in env examples`

---

### Task 5: Moduły projektu i testy rdzenia niezależne od modułów projektu (D11, D12)

**Files:**
- Modify: `kit/cli/src/manifest/schema.ts`, `kit/cli/src/manifest/kit-state.ts`, `kit/cli/src/generate/index.ts`
- Create: `src/test/core-modules.ts`, `src/shared/lib/modules/__tests__/registry-consistency.test.ts`
- Modify (testy rdzenia, pisze je `test-writer`): `src/shared/lib/auth/__tests__/access-matrix.test.ts`, `src/shared/lib/modules/__tests__/nav.test.ts`, `src/shared/components/__tests__/app-sidebar.test.tsx`
- Modify (dokumentacja): `AGENTS.md` („Moduły i pliki generowane”: akapit o `projectModules`), `docs/09-nowy-modul.md` i `docs/09b-implementacja-i-bramki.md` (krok „dopisz wpis do `projectModules`” zamiast edycji testów rdzenia), `docs/znane-ograniczenia.md` (usunąć albo zaktualizować sekcję z kotwicą `modul-projektu`), `docs/superpowers/notes/2026-10-27-docs-discrepancies.md` (R3 i R56: status „rozwiązane w planie 2, Task 5”)
- Test: `kit/cli/src/manifest/__tests__/kit-state.test.ts`, `kit/cli/src/generate/__tests__/generate.test.ts`

**Interfaces:**
- Produces (CLI):
  - `kitStateSchema` dostaje `projectModules: Record<string, { manifest: ModuleManifest }>`, domyślnie `{}`. `writeKitState` zapisuje je po `modules`, z kluczami posortowanymi.
  - `projectModuleManifests(state: KitState): ModuleManifest[]` (alfabetycznie) i `registeredModules(state: KitState): ModuleManifest[]` = `installedModules(state)`, potem `projectModuleManifests(state)`.
  - `readKitState` po parsowaniu sprawdza moduły projektu i rzuca:
    - klucz ≠ `manifest.name` → `Error("projectModules.<klucz>: name \"<name>\" nie zgadza się z kluczem")`;
    - nazwa w `modules` i `projectModules` → `Error("Moduł <x> jest jednocześnie modułem kitu i modułem projektu")`;
    - `requires` modułu projektu spoza `modules` i `projectModules` → `Error("Moduł projektu <x> wymaga niezainstalowanego modułu: <y>")`;
    - `files` modułu projektu bez wzorca zaczynającego się od `src/features/<name>/` (rejestr wykrywa feature po `FEATURE_GLOB` w `generate/index.ts`) → `Error("Moduł projektu <x>: files musi obejmować src/features/<x>/**")`.
  - `kitSync` (Task 2) zachowuje `projectModules` z istniejącego `.wa/kit.json`.
  - Wpis modułu projektu (wzorzec dla fixture, tutoriala i Task 10); `version` jest wymagane przez `moduleManifestSchema` i przy awansie staje się wersją modułu kitu, a wpis nie ma własnej wersji ani hashy:
    ```json
    "projectModules": {
      "notes": {
        "manifest": {
          "name": "notes",
          "version": "0.1.0",
          "description": "Notatki",
          "requires": [],
          "files": ["src/features/notes/**", "prisma/schema/notes.prisma"],
          "dependencies": {},
          "devDependencies": {},
          "env": [{ "name": "NOTES_LIMIT", "example": "10" }],
          "schemaRelations": [{ "model": "Organization", "field": "notes Note[]" }],
          "compose": null,
          "workspaces": []
        }
      }
    }
    ```
  - `generate` używa `registeredModules` do rejestru i regionów (`env`, `schemaRelations`, `compose`).
- Produces (rdzeń):
  - `src/test/core-modules.ts`: `CORE_MODULE_KEYS = ["account", "auth", "dashboard", "organizations", "users"] as const` i `coreClientModules` (rejestr `clientModules` przefiltrowany do tych kluczy).
  - Testy rdzenia porównujące rejestr z literałem używają `coreClientModules`: `access-matrix.test.ts` i `nav.test.ts` przekazują je do `getNavEntries(context, coreClientModules)`; `app-sidebar.test.tsx` mockuje `@/modules.client.generated` przez `importOriginal` i zostawia tylko moduły rdzenia (rejestr to dane, nie reguła bezpieczeństwa).
  - `registry-consistency.test.ts` sprawdza cały rejestr (rdzeń, moduły kitu i projektu): opis w „Zachowania”.
- Używają: Task 8 (`wa add`) i Task 9 (`wa remove`, `wa list`) czytają `projectModules`.

**Zachowania:**
- `.wa/kit.json` bez `projectModules` → `readKitState` zwraca `projectModules: {}`.
- `writeKitState` zapisuje klucze w kolejności `kitVersion`, `kitRepo`, `project`, `locales`, `modules`, `projectModules`; moduły projektu `zeta`, `alfa` → w pliku `alfa`, `zeta`.
- Fixture `minimal` z modułem projektu `notes` (wpis z „Interfaces”, pliki `src/features/notes/module.ts` i `i18n/pl.json`):
  - `src/modules.generated.ts` i `src/modules.client.generated.ts` importują `@/features/notes/module` po modułach kitu;
  - `.env.example` ma `NOTES_LIMIT=10` w regionie `wa:modules`; `prisma/schema/organizations.prisma` ma `notes Note[]` w regionie `wa:relations`;
  - drugie `generate` → `changed: []`.
- Kolejność rejestru: `core`, moduły kitu alfabetycznie, potem moduły projektu alfabetycznie (kit `demo` + projekt `alfa` → `…demo…, …alfa…`).
- Błędy `readKitState` (literały z „Interfaces”): klucz `notes` z `name: "inne"`; `demo` w `modules` i w `projectModules`; moduł projektu `notes` z `requires: ["uploads"]` bez `uploads`; `notes` z `files: ["lib/notes/**"]`. Moduł projektu wymagający modułu kitu (`requires: ["demo"]`) albo innego modułu projektu jest poprawny.
- `kitSync` na `.wa/kit.json` z wpisem `notes` w `projectModules` → wpis zostaje bez zmian.
- Testy rdzenia w kicie: `coreClientModules` ma dokładnie klucze `account, auth, dashboard, organizations, users`; macierz i listy nawigacji bez zmian wartości.
- `registry-consistency.test.ts` dla każdego modułu z `clientModules`:
  - klucze modułów są unikalne;
  - `href` pozycji menu są unikalne w całym rejestrze i zaczynają się od `/`;
  - dla każdego języka z `locales` i każdej pozycji menu: w `moduleMessages[locale]` jest loader z kluczem modułu, a wczytany JSON ma pod `labelKey` (i `multiOrgLabelKey`, jeśli jest) niepusty napis; ścieżka z kropkami schodzi w głąb obiektu;
  - dla 24 kontekstów (`userRole` ∈ user, admin, superadmin × `orgRole` ∈ owner, admin, member, null × `multiOrg` ∈ false, true): `href` modułu są w `getNavEntries(context)` wtedy i tylko wtedy, gdy `canAccessModule(moduleDef, context)`. To test spójności danych rejestru, a nie pokrycie reguł dostępu: reguły dla rdzenia pokrywa literałowa macierz w `access-matrix.test.ts`.
- Sprawdzenie ręczne (Step 5): w kopii kitu (`git worktree add <scratch>/wa-notes`) minimalny moduł `notes` (module.ts z jedną pozycją menu `/notes`, `i18n/{pl,en}.json`) z wpisem w `projectModules` → `npm run wa -- generate && npm test` → PASS bez edycji testów rdzenia.

**Mutacje do zabicia:** `generate` ignorujące `projectModules` (rejestr i regiony); moduły projektu przed modułami kitu; brak któregokolwiek z czterech sprawdzeń w `readKitState`; `kitSync` kasujące `projectModules`; sprawdzenie `requires` uwzględniające tylko `modules` (moduł projektu wymagający innego modułu projektu odrzucony); `writeKitState` bez sortowania `projectModules`.

- [ ] **Step 1:** `test-writer` pisze testy CLI z „Zachowania”, tworzy `src/test/core-modules.ts` (pomocnik testów, implementer go nie zmienia), przepina testy rdzenia na `coreClientModules` i pisze `registry-consistency.test.ts`. Run: `npm test --prefix kit/cli` → nowe testy CLI FAIL; `npx vitest run src/shared/lib/modules src/shared/lib/auth src/shared/components` → PASS (testy rdzenia nie zależą od implementacji CLI). Commit testów.
- [ ] **Step 2:** Implementacja CLI (implementer, faza `implement`), potem `npm run build --prefix kit/cli && npm run wa -- generate` (kit: `projectModules: {}`, rejestr bez zmian).
- [ ] **Step 3:** Run: `npm run verify --prefix kit/cli && npm run verify` → PASS.
- [ ] **Step 4:** Dokumentacja (`AGENTS.md`, `docs/09-nowy-modul.md`, `docs/09b-implementacja-i-bramki.md`, `docs/znane-ograniczenia.md`, notatka rozbieżności). Tutorial dopisuje wpis do `projectModules` i nie edytuje testów rdzenia.
- [ ] **Step 5:** Sprawdzenie ręczne z „Zachowania” w worktree w scratchpadzie; potem `git worktree remove`.
- [ ] **Step 6: Commit** — `feat(cli): project modules in kit state; core tests ignore non-core modules`

---

### Task 6: Prymitywy składania

**Files:**
- Create: `kit/cli/src/assemble/{resolve-modules,project-names,placeholders,package-json,hash,copy}.ts`
- Test: `kit/cli/src/assemble/__tests__/*.test.ts`

**Interfaces:**
- Consumes: `KitConfig`, `ModuleManifest`, `matchFiles`, `assemblableFiles` (Task 2–3).
- Produces:
  - `resolveModules(requested: string[], available: ModuleManifest[]): ModuleManifest[]`. Zawsze dodaje `core` i przechodnio `requires`, bez duplikatów, kolejność: `core`, potem alfabetycznie. Nieznana nazwa (także w `requires`) → `Error("Nieznany moduł: <x>. Dostępne: <a, b>")` (dostępne bez `core`, alfabetycznie).
  - `type ProjectNames = { name: string; slug: string; snake: string }`. `projectNames(target: string, title: string | null): ProjectNames`. `slug = basename(target)` musi pasować do `/^[a-z][a-z0-9-]{1,49}$/`, inaczej `Error("Nazwa projektu \"<slug>\": dozwolone małe litery, cyfry i myślniki, pierwsza litera, 2–50 znaków")`. `name = title ?? slug` (słowa po `-` z wielkiej litery, połączone spacją). `snake` = slug z `-` → `_`.
  - `applyPlaceholders(file: string, content: string, config: KitConfig, names: ProjectNames): string`. Działa tylko dla `config.placeholderFiles`. Kolejność `replaceAll`: `projectName` → `names.name`, `projectSlug` → `names.slug`, `projectSnake` → `names.snake`.
  - `projectPackageJson(kitPackageJson: string, manifests: ModuleManifest[], names: ProjectNames): string`. `name` = slug, `version` = `"0.1.0"`, `dependencies`/`devDependencies` = suma z manifestów z kluczami posortowanymi. Pozostałe pola bez zmian. Wcięcie 2, końcowy `\n`.
  - `addDependencies(packageJson: string, manifest: ModuleManifest): string` (dopisuje brakujące, nie zmienia wersji zależności, które projekt już ma) oraz `removeDependencies(packageJson: string, removed: ModuleManifest, remaining: ModuleManifest[]): string`. Usuwa tylko zależności `removed`, których nie deklaruje żaden z `remaining`; zależności dodane ręcznie w projekcie zostają.
  - `stripRegions(content: string): string`. Usuwa linie między `wa:<x>:start` i `wa:<x>:end` dla każdego `x`; same znaczniki zostają.
  - `fileHash(file: string, content: string, config: KitConfig): string` → `"managed"` dla `managedFiles`, w przeciwnym razie sha256 hex z `stripRegions(content)`.
  - `moduleFiles(manifest: ModuleManifest, files: string[]): string[]` = `matchFiles(manifest.files, files)` (`files` = wynik `assemblableFiles`).
  - `copyFiles(input: { kitDir: string; projectDir: string; files: string[]; config: KitConfig; names: ProjectNames }): Promise<Record<string, string>>`. Kopiuje z placeholderami, zachowuje bit wykonywalności, zwraca ścieżka → `fileHash`.

**Zachowania:**
- `resolveModules`:
  - `["needs-demo"]` → `core, demo, needs-demo`; `[]` → `core`; `["demo", "demo"]` → `core, demo`; `["core"]` → `core`;
  - `["dem"]` → `Nieznany moduł: dem. Dostępne: demo, needs-demo` (bez `core`, alfabetycznie);
  - nieznany moduł w `requires` (manifest `broken` z `requires: ["ghost"]`) → `Nieznany moduł: ghost. Dostępne: …`;
  - cykl `a` ↔ `b` w `requires` → `core, a, b`, bez zawieszenia.
- `projectNames`:
  - poprawne: `ab`, `a-1`, slug z 50 znaków; `"/tmp/acme-shop"` → `{ name: "Acme Shop", slug: "acme-shop", snake: "acme_shop" }`; z `title: "ACME Sklep"` → `name: "ACME Sklep"`;
  - odrzucone (komunikat z „Interfaces”): `a`, slug z 51 znaków, `1app`, `Moja Apka`, `acme_shop`, `Acme`, `../x` (basename `x` ma jeden znak);
  - `target` to ścieżka wybrana przez użytkownika, więc `../xy` jest poprawne (`slug: "xy"`, projekt w katalogu nadrzędnym); slug sprawdza tylko basename;
  - `test.prop`: dla każdego poprawnego sluga `snake` nie zawiera `-`, a `snake.replaceAll("_", "-") === slug`.
- `applyPlaceholders` w `src/shared/config/project.ts`: `WA App wa-app wa_app WA App` → `Acme Shop acme-shop acme_shop Acme Shop` (każde wystąpienie); w pliku spoza `placeholderFiles` treść bez zmian.
- `projectPackageJson`: kit z `dependencies` `{ next, left-pad, kit-only }`, manifesty `core` `{ next }` i `demo` `{ left-pad }` → `dependencies` dokładnie `{ "left-pad", "next" }` w tej kolejności, `name: "acme-shop"`, `version: "0.1.0"`, `scripts` bez zmian, wcięcie 2, końcowy `\n`; brak zależności dev w manifestach → `devDependencies: {}`.
- `addDependencies`: dopisuje brakujące, sortuje klucze; zależność, którą projekt już ma (np. podbita ręcznie `zod: "^4.4.0"`), zostaje w wersji projektu.
- `removeDependencies`: jak w przykładzie (zależność współdzielona z `remaining` i dodana ręcznie zostają).
- `stripRegions`: dwa regiony (`wa:modules`, `wa:services`) → oba puste, znaczniki i treść poza nimi bez zmian.
- `fileHash`: 64 znaki hex; ten sam wynik przy różnej treści regionów; inny przy zmianie treści poza regionem; `package.json` i `package-lock.json` → `"managed"`.
- `copyFiles`: tworzy katalogi pośrednie, stosuje placeholdery, plik z trybem `0o755` ma po skopiowaniu bit wykonywalności, wynik ma wpis dla każdego pliku równy `fileHash` treści po podmianie.

**Mutacje do zabicia:** `core` nie dodawany; `requires` rozwijane tylko o jeden poziom; brak deduplikacji; nieznany moduł w `requires` pomijany po cichu; `core` na liście „Dostępne”; brak kotwic w regexie sluga albo przesunięte granice długości; `name` bez wielkich liter; placeholdery poza `placeholderFiles`; `replace` zamiast `replaceAll`; `projectPackageJson` przepisujące zależności kitu spoza manifestów; nieposortowane klucze; `removeDependencies` usuwające zależność współdzieloną albo ręczną; `addDependencies` nadpisujące wersję projektu; `stripRegions` usuwające znaczniki; `fileHash` bez `managed`; utrata bitu wykonywalności.

- [ ] **Step 1: Failing tests** (przykłady)
```ts
it("requires przechodnie i core zawsze", () => {
  expect(resolveModules(["needs-demo"], fixtureManifests).map((m) => m.name)).toEqual(["core", "demo", "needs-demo"]);
});
it("literówka → lista dostępnych", () => {
  expect(() => resolveModules(["dem"], fixtureManifests)).toThrow("Nieznany moduł: dem. Dostępne: demo, needs-demo");
});
it.each(["Moja Apka", "1app", "a", "../x", "x".repeat(51)])("nazwa %j odrzucona", (bad) => {
  expect(() => projectNames(bad, null)).toThrow("dozwolone małe litery");
});
it("slug z basename ścieżki, nazwa wyświetlana ze sluga", () => {
  expect(projectNames("/tmp/acme-shop", null)).toEqual({ name: "Acme Shop", slug: "acme-shop", snake: "acme_shop" });
});
it("placeholdery tylko w placeholderFiles", () => {
  expect(applyPlaceholders("src/shared/config/project.ts", 'name: "WA App", slug: "wa-app"', config, names)).toBe('name: "Acme Shop", slug: "acme-shop"');
  expect(applyPlaceholders("src/x.test.ts", '"WA App"', config, names)).toBe('"WA App"');
});
it("hash nie zależy od treści regionów", () => {
  const a = "x\n# wa:modules:start\nA=1\n# wa:modules:end\n";
  const b = "x\n# wa:modules:start\n# wa:modules:end\n";
  expect(fileHash(".env.example", a, config)).toBe(fileHash(".env.example", b, config));
  expect(fileHash("package.json", "{}", config)).toBe("managed");
});
it("removeDependencies zostawia zależności współdzielone i ręczne", () => {
  const pkg = JSON.stringify({ dependencies: { "left-pad": "^1.3.0", zod: "^4.3.6", own: "1.0.0" } });
  const out = JSON.parse(removeDependencies(pkg, demoWith({ "left-pad": "^1.3.0", zod: "^4.3.6" }), [coreWith({ zod: "^4.3.6" })]));
  expect(out.dependencies).toEqual({ own: "1.0.0", zod: "^4.3.6" });
});
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementacja. **Step 4:** Run `npm test --prefix kit/cli` → PASS.
- [ ] **Step 5: Commit** — `feat(cli): assembly primitives for modules, placeholders, package.json and hashes`

---

### Task 7: `wa create` (`create-wa-app`)

**Files:**
- Create: `kit/cli/src/commands/create.ts`, `kit/cli/src/process/runner.ts`, `kit/cli/src/process/prompter.ts`, `kit/cli/src/args.ts`
- Modify: `kit/cli/src/bin.ts`, fixture `kit/cli/src/__tests__/fixtures/kit/`. Fixture dostaje minimalną aplikację: `package.json` (deps `zod`, `left-pad`), `package-lock.json`, `.env.example` i `docker-compose.yml` z regionami, `prisma/schema/{auth,organizations}.prisma` z regionami, `src/shared/config/project.ts` z `WA App`/`wa-app`, `src/features/{auth,demo,needs-demo}/module.ts`, `src/features/demo/{env.ts,compose.yml,i18n/pl.json}`, `src/i18n/config.ts`, `.wa/bin/wa.mjs` (atrapa), `docs/readme.md` (kit-only).
- Test: `kit/cli/src/commands/__tests__/create.test.ts`

**Interfaces:**
- Consumes: wszystko z Task 2–6 oraz `generate` (Task 4).
- Produces:
  - `type Runner = (command: string, args: string[], cwd: string) => Promise<void>`. Implementacja `spawnRunner` używa `spawn` z `stdio: "inherit"`. Kod ≠ 0 → `Error("<command> <args…> zakończone kodem <n>")`.
  - `type Prompter = { ask(question: string, fallback: string): Promise<string>; confirm(question: string, fallback: boolean): Promise<boolean> }`. Implementacja `readlinePrompter`. Bez TTY i bez `--yes` → `Error("Brak terminala: użyj --yes")`.
  - `type CreateOptions = { target: string; kitDir: string; modules: string[] | null; locales: ("pl"|"en")[] | null; title: string | null; adminEmail: string | null; yes: boolean; setup: boolean; install: boolean; git: boolean; runner: Runner; prompter: Prompter; log: (line: string) => void }`.
  - `create(options: CreateOptions): Promise<{ projectDir: string; modules: string[] }>`. Kolejność:
    1. `projectNames` (błąd, zanim cokolwiek powstanie). Katalog istnieje i nie jest pusty → `Error("Katalog <dir> istnieje i nie jest pusty")`.
    2. Bez `--yes` dopytuje o brakujące: moduły (lista `nazwa — opis`, wpis po przecinku, puste = żaden), języki (domyślnie `pl,en`), nazwę wyświetlaną (domyślnie z `projectNames`), email admina (puste = pomiń), `Uruchomić bazę, migrację i admin:create teraz? [t/N]` (tylko gdy nie podano `--setup`). Odpowiedź o językach przechodzi tę samą walidację co `--locales` (błąd, bez ponawiania pytania).
    3. Kopiuje `moduleFiles` wybranych modułów, nadpisuje `package.json` przez `projectPackageJson` i zapisuje `.wa/kit.json` (`kitVersion: config.version`, `kitRepo: config.repo`, `project`, `locales`, moduły z `files` = hashe) przez `writeKitState`. Potem `generate(projectDir)`. Błąd w tym kroku → usuwa katalog, jeśli `create` go utworzył; jeśli katalog istniał (pusty), usuwa całą jego zawartość. Potem rzuca dalej.
    4. `.env` = `.env.example` z `BETTER_AUTH_SECRET=<randomBytes(32).toString("base64url")>` i `ADMIN_EMAIL=<email>`, jeśli podany.
    5. `git` → `git init -q` przed instalacją, żeby skrypt `prepare` (`husky`) ustawił hooki w nowym repo.
    6. `install` → `npm install`. Błąd → `Error("Projekt utworzony w <dir>, ale npm install się nie powiódł. Uruchom: cd <dir> && npm install")`.
    7. `git` → `git add -A`, `git commit -q --no-verify -m "chore: initial commit from wa-kit v<version>"`. Błąd commita → `log("Uwaga: nie utworzono commita (<message>). Skonfiguruj git i zrób commit ręcznie.")`, bez przerywania.
    8. `setup` → `docker compose up -d --wait`, `npx prisma migrate dev --name init`, a przy podanym emailu `npm run admin:create -- --email <email>`.
    9. Wypisuje kroki: `cd <dir>`, `docker compose up -d`, `npx prisma migrate dev --name init`, `npm run admin:create -- --email <email|twój-email>`, `npm run dev`. Po `setup` tylko `cd` i `npm run dev`.
  - Bin: `wa create <target> [--modules a,b] [--locales pl,en] [--title <t>] [--admin-email <e>] [--setup] [--yes] [--no-install] [--no-git] [--kit <dir>]`. Domyślne `kitDir` = `resolve(dirname(fileURLToPath(import.meta.url)), "../..")`. Brak tam `kit/kit.json` → `Error("Uruchom create z klonu wa-kit albo podaj --kit <ścieżka>")`. `--locales` spoza `pl,en` albo bez `pl` → `Error("--locales: dozwolone pl,en; pl jest wymagany")`. `--setup` z `--no-install` → `Error("--setup wymaga instalacji zależności (bez --no-install)")`.

  - `parseCreateArgs(argv: string[]): Omit<CreateOptions, "kitDir" | "runner" | "prompter" | "log"> & { kit: string | null }` w `kit/cli/src/args.ts`.

**Zachowania:**
- Złożenie `core` + `demo` (przykład w Step 1): brak `docs/`, `kit/`, `.wa/kit.json` ma `project`, `locales`, `modules` `core` i `demo` z hashami (64 hex) i `projectModules: {}`; placeholdery podmienione; `package.json` z `name: "acme-shop"`.
- `.env`: `BETTER_AUTH_SECRET` ma 43 znaki `[A-Za-z0-9_-]` i różni się między dwoma wywołaniami `create`; nie zawiera `change-me`; przy `adminEmail: "a@x.pl"` zawiera `ADMIN_EMAIL=a@x.pl`.
- Bez modułów: brak zależności `demo` i drugie `generate` → `changed: []`.
- Katalog niepusty → `Katalog <dir> istnieje i nie jest pusty`, zawartość nietknięta; katalog istniejący i pusty → sukces.
- Zła nazwa → błąd `Nazwa projektu …`, katalog nie powstaje.
- Błąd w kroku 3 (np. `generate` rzuca, bo fixture ma uszkodzony region): katalog utworzony przez `create` znika; katalog, który istniał wcześniej, zostaje i jest pusty.
- `install + git` bez `setup`: `git init -q` przed `npm install` (hooki `husky` w nowym repo).
- `install + git + setup` → wywołania `runner` w kolejności z przykładu; bez `adminEmail` brak `admin:create`.
- `npm install` pada → komunikat `Uruchom: cd <dir> && npm install`, `.wa/kit.json` istnieje; `git commit` pada → `log` z `Uwaga: nie utworzono commita` i `create` kończy się sukcesem.
- Bez `yes`: `prompter` z odpowiedziami `"demo"`, `"pl"`, `"Acme"`, `""` (email) i `false` (setup) → moduły `core, demo`, `locales: ["pl"]`, `project.name: "Acme"`, brak `ADMIN_EMAIL`. `readlinePrompter` bez TTY → `Brak terminala: użyj --yes`.
- Kroki końcowe: bez `setup` wypisuje 5 linii z „Interfaces” (z `twój-email` przy braku emaila); po `setup` tylko `cd <dir>` i `npm run dev`.
- `parseCreateArgs`: `--modules ""` → `[]`; `--modules a,b` → `["a", "b"]`; brak `--modules` → `null`; `--locales en` i `--locales pl,de` → `--locales: dozwolone pl,en; pl jest wymagany`; `--no-install` → `install: false`; `--setup --no-install` → `--setup wymaga instalacji zależności (bez --no-install)`.
- `kitDir` bez `kit/kit.json` → `Uruchom create z klonu wa-kit albo podaj --kit <ścieżka>`.

**Mutacje do zabicia:** sprawdzenie niepustego katalogu po kopiowaniu zamiast przed; brak sprzątania po błędzie w kroku 3 albo usuwanie katalogu, który istniał wcześniej; kopiowanie plików `kitOnly` albo generowanych z kitu; stały `BETTER_AUTH_SECRET`; zmieniona kolejność komend; błąd `git commit` przerywający `create`; `setup` uruchamiany bez flagi; `--modules ""` jako `[""]`; brak walidacji `--locales`.

- [ ] **Step 1: Failing tests** (przykłady; `runner` = spy, `install: false`, `git: false`, o ile test nie mówi inaczej)
```ts
it("składa core + demo bez plików kit-only, z placeholderami i hashami", async () => {
  const dir = join(tmp, "acme-shop");
  await create(opts({ target: dir, modules: ["demo"], yes: true }));
  expect(existsSync(join(dir, "docs"))).toBe(false);
  expect(existsSync(join(dir, "kit"))).toBe(false);
  expect(await read(dir, "src/shared/config/project.ts")).toContain('"Acme Shop"');
  expect(await read(dir, "src/modules.generated.ts")).toContain("@/features/demo/module");
  expect(await read(dir, ".env.example")).toContain("DEMO_TOKEN=acme-shop_demo_");
  const state = await readKitState(dir);
  expect(Object.keys(state.modules)).toEqual(["core", "demo"]);
  expect(state.modules.demo.files["src/features/demo/module.ts"]).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.parse(await read(dir, "package.json"))).toMatchObject({ name: "acme-shop", dependencies: { "left-pad": "^1.3.0" } });
  expect(await read(dir, ".env")).not.toContain("change-me");
});
it("bez modułów: brak zależności demo i drugie generate bez zmian", async () => {
  const dir = join(tmp, "core-only");
  await create(opts({ target: dir, modules: [], yes: true }));
  expect(JSON.parse(await read(dir, "package.json")).dependencies).not.toHaveProperty("left-pad");
  expect((await generate(dir)).changed).toEqual([]);
});
it("niepusty katalog → błąd, istniejący plik nietknięty", async () => {
  await mkdir(join(tmp, "zajety"));
  await writeFile(join(tmp, "zajety", "x.txt"), "x");
  await expect(create(opts({ target: join(tmp, "zajety"), yes: true }))).rejects.toThrow("istnieje i nie jest pusty");
  expect(await readdir(join(tmp, "zajety"))).toEqual(["x.txt"]);
});
it("zła nazwa → nic nie powstaje", async () => {
  await expect(create(opts({ target: join(tmp, "Zla Nazwa"), yes: true }))).rejects.toThrow("Nazwa projektu");
  expect(existsSync(join(tmp, "Zla Nazwa"))).toBe(false);
});
it("install + git + setup: komendy w kolejności", async () => {
  await create(opts({ target: join(tmp, "full"), yes: true, install: true, git: true, setup: true, adminEmail: "a@x.pl" }));
  expect(runner.mock.calls.map(([c, a]) => [c, ...a].join(" "))).toEqual([
    "git init -q", "npm install", "git add -A",
    'git commit -q --no-verify -m chore: initial commit from wa-kit v0.1.0',
    "docker compose up -d --wait", "npx prisma migrate dev --name init", "npm run admin:create -- --email a@x.pl",
  ]);
});
it("npm install pada → kit.json zapisany, komunikat, katalog zostaje", async () => {
  runner.mockRejectedValueOnce(new Error("npm install zakończone kodem 1"));
  const dir = join(tmp, "broken-install");
  await expect(create(opts({ target: dir, yes: true, install: true }))).rejects.toThrow(`Uruchom: cd ${dir} && npm install`);
  expect(existsSync(join(dir, ".wa/kit.json"))).toBe(true);
});
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementacja, potem `npm run build --prefix kit/cli`.
- [ ] **Step 4:** Run `npm run verify --prefix kit/cli` → PASS. Ręcznie: `node .wa/bin/wa.mjs create <scratch>/wa-core --yes --no-git`, potem w nim `npm run verify` → PASS.
- [ ] **Step 5: Commit** — `feat(cli): wa create assembles a new project from the kit`

---

### Task 8: `wa add` i źródło kitu

**Files:**
- Create: `kit/cli/src/kit/source.ts`, `kit/cli/src/commands/add.ts`
- Modify: `kit/cli/src/bin.ts`
- Test: `kit/cli/src/kit/__tests__/source.test.ts`, `kit/cli/src/commands/__tests__/add.test.ts`

**Interfaces:**
- Consumes: Task 2–7.
- Produces:
  - `resolveKitSource(input: { kitFlag: string | null; envSource: string | undefined; state: KitState; runner: Runner; tmpDir: string }): Promise<string>`. Źródło: `kitFlag` ?? `envSource` (`WA_KIT_SOURCE`) ?? `state.kitRepo`.
    - Ścieżka lokalna: `kit/kit.json` musi mieć `version === state.kitVersion`, inaczej `Error("Kit w <dir> ma wersję <a>, projekt używa <b>")`.
    - URL (zawiera `://` albo zaczyna się od `git@`): `git clone --depth 1 --branch v<kitVersion> --quiet <url> <tmpDir>/wa-kit`. Błąd → `Error("Nie udało się pobrać wa-kit v<ver> z <url>. Sprawdź dostęp (gh auth status) albo podaj --kit <ścieżka>")`.
  - `add(options: { projectDir: string; module: string; kitDir: string; install: boolean; runner: Runner; log: (line: string) => void }): Promise<{ added: string[] }>`. Kolejność:
    1. Moduł zainstalowany → `Error("Moduł <x> jest już zainstalowany")`. Moduł o tej nazwie jest w `projectModules` → `Error("Moduł <x> jest modułem projektu; zmień jego nazwę albo usuń wpis z projectModules")`.
    2. `resolveModules` minus zainstalowane.
    3. Pliki docelowe, które już istnieją → `Error("Pliki już istnieją, przerwano bez zmian:\n  <a>\n  <b>")`.
    4. `copyFiles` (z `names` = `{ name: state.project.name, slug: state.project.slug, snake: slug z "-" → "_" }`), `addDependencies` dla każdego dodanego modułu, `writeKitState`, `generate`.
    5. `install` → `npm install`. Błąd → `Error("Moduł dodany, ale npm install się nie powiódł. Uruchom: npm install")`.
    6. Wypisuje `npx prisma migrate dev --name add-<x>`.
  - Bin: `wa add <moduł> [--kit <ścieżka|url>] [--no-install]`. Katalog tymczasowy z `mkdtemp` jest usuwany w `finally`.

**Zachowania:**
- `core` + `add demo` daje katalog identyczny z `create --modules demo` (poza `IGNORE`).
- `add needs-demo` w projekcie z samym `core` → `added: ["demo", "needs-demo"]`; w projekcie z `demo` → `added: ["needs-demo"]`.
- `add demo` drugi raz → `Moduł demo jest już zainstalowany`, projekt bez zmian.
- `add demo` przy wpisie `demo` w `projectModules` → komunikat z „Interfaces”, projekt bez zmian.
- Istniejący plik docelowy → `Pliki już istnieją, przerwano bez zmian:` z listą wszystkich kolidujących plików (dwa pliki → dwie linie), projekt bajtowo bez zmian.
- `package.json` po `add demo`: dochodzi `left-pad`, zależność dodana wcześniej ręcznie zostaje.
- Ostatnia linia `log` → `npx prisma migrate dev --name add-demo`.
- `resolveKitSource`: `kitFlag` ma pierwszeństwo przed `WA_KIT_SOURCE`, a ten przed `state.kitRepo` (trzy przypadki z różnymi ścieżkami lokalnymi); `file:///nie/istnieje.git` → podpowiedź `gh auth status` / `--kit`; lokalny kit w wersji `0.1.0` przy projekcie `9.9.9` → `ma wersję 0.1.0, projekt używa 9.9.9`; URL z `git@github.com:…` traktowany jak URL (`runner` dostaje `git clone --depth 1 --branch v0.1.0 --quiet …`).
- `npm install` pada → komunikat `Uruchom: npm install`, `.wa/kit.json` zawiera `demo`.
- Bin: katalog tymczasowy nie istnieje po zakończeniu `add`, także po błędzie.

**Mutacje do zabicia:** sprawdzenie istniejących plików po kopiowaniu (częściowy zapis); zgłoszenie tylko pierwszego kolidującego pliku; brak sprawdzenia „już zainstalowany” albo kolizji z `projectModules`; dodanie ponownie modułu z `requires`, który już jest; brak porównania wersji lokalnego kitu; zła kolejność źródeł; `git@` traktowane jak ścieżka; brak sprzątania katalogu tymczasowego.

- [ ] **Step 1: Failing tests** (przykłady)
```ts
it("core + add demo daje to samo co create --modules demo", async () => {
  const viaAdd = await createProject("app", []);
  await add({ projectDir: viaAdd, module: "demo", kitDir, install: false, runner, log });
  const viaCreate = await createProject("app", ["demo"], "other");
  expect(await snapshotDir(viaAdd, IGNORE)).toEqual(await snapshotDir(viaCreate, IGNORE));
});
it("add needs-demo dodaje też demo", async () => {
  const dir = await createProject("app", []);
  expect((await add({ projectDir: dir, module: "needs-demo", kitDir, install: false, runner, log })).added).toEqual(["demo", "needs-demo"]);
});
it("istniejący plik → błąd, projekt bez zmian", async () => {
  const dir = await createProject("app", []);
  await mkdir(join(dir, "src/features/demo"), { recursive: true });
  await writeFile(join(dir, "src/features/demo/module.ts"), "export default 1;\n");
  const snap = await snapshotDir(dir, IGNORE);
  await expect(add({ projectDir: dir, module: "demo", kitDir, install: false, runner, log })).rejects.toThrow("Pliki już istnieją, przerwano bez zmian");
  expect(await snapshotDir(dir, IGNORE)).toEqual(snap);
});
it("niedostępne repo → podpowiedź --kit", async () => {
  await expect(resolveKitSource({ kitFlag: "file:///nie/istnieje.git", envSource: undefined, state, runner: spawnRunner, tmpDir: tmp }))
    .rejects.toThrow("Sprawdź dostęp (gh auth status) albo podaj --kit <ścieżka>");
});
it("lokalny kit w innej wersji → błąd", async () => {
  await expect(resolveKitSource({ kitFlag: kitDir, envSource: undefined, state: { ...state, kitVersion: "9.9.9" }, runner, tmpDir: tmp }))
    .rejects.toThrow("ma wersję 0.1.0, projekt używa 9.9.9");
});
it("npm install pada → kit.json z modułem, komunikat", async () => {
  const dir = await createProject("app", []);
  runner.mockRejectedValueOnce(new Error("x"));
  await expect(add({ projectDir: dir, module: "demo", kitDir, install: true, runner, log })).rejects.toThrow("Uruchom: npm install");
  expect(Object.keys((await readKitState(dir)).modules)).toContain("demo");
});
```
  Pomocniki w `kit/cli/src/__tests__/helpers.ts`: `IGNORE` = `.git`, `node_modules`, `.env` (losowy sekret); `snapshotDir(dir, ignore)` → mapa ścieżka → treść; `createProject(name, modules, parent?)` = `create` z `yes: true`, `install: false`, `git: false` w `tmp/<parent>/<name>` (ten sam slug, żeby placeholdery się zgadzały).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementacja, `npm run build --prefix kit/cli`. **Step 4:** Run `npm run verify --prefix kit/cli` → PASS.
- [ ] **Step 5: Commit** — `feat(cli): wa add with kit source resolution`

---

### Task 9: `wa remove` i `wa list`

**Files:**
- Create: `kit/cli/src/commands/{remove,list}.ts`
- Modify: `kit/cli/src/bin.ts`
- Test: `kit/cli/src/commands/__tests__/{remove,list}.test.ts`

**Interfaces:**
- Consumes: Task 2–8.
- Produces:
  - `remove(options: { projectDir: string; module: string; force: boolean; install: boolean; runner: Runner; log: (line: string) => void }): Promise<{ removed: string[] }>`. Kolejność:
    1. `core` → `Error("Nie można usunąć rdzenia")`. Moduł projektu → `Error("Moduł <x> należy do projektu; wa remove usuwa tylko moduły kitu. Usuń jego pliki i wpis w projectModules ręcznie")`. Moduł niezainstalowany → `Error("Moduł <x> nie jest zainstalowany")`. Wymagany przez inny zainstalowany moduł kitu albo moduł projektu → `Error("Moduł <x> jest wymagany przez: <y, z>")` (alfabetycznie).
    2. Zmienione = istniejące pliki z `fileHash` ≠ zapisany (brakujące pomija). Zmienione i brak `--force` → `Error("Zmienione pliki modułu <x> (użyj --force):\n  <a>")`, bez żadnej zmiany.
    3. Usuwa pliki i puste katalogi nadrzędne (nie wyżej niż `projectDir`), robi `removeDependencies` (`remaining` = pozostałe moduły kitu i moduły projektu), usuwa moduł z `.wa/kit.json`, uruchamia `generate`, a przy `install` także `npm install`.
    4. Wypisuje `npx prisma migrate dev --name remove-<x>`.
  - `list(options: { state: KitState; available: ModuleManifest[] | null; availableError: string | null; log: (line: string) => void }): void`. Format:
    ```
    Zainstalowane:
      core 0.1.0
      demo 1.0.0
    Dostępne:
      needs-demo 1.0.0 — <opis> (wymaga: demo)
    ```
    Gdy `available === null`: `Dostępne: nie udało się pobrać kitu (<availableError>)`. Bin `wa list [--kit …]` łapie błąd `resolveKitSource` i przekazuje go jako `availableError`. Gdy są moduły projektu, po „Dostępne” dochodzi grupa `Projektu:` z liniami `  <nazwa> — <opis>` (alfabetycznie); bez modułów projektu grupy nie ma. „Dostępne” pomija zainstalowane moduły i `core`; gdy nic nie zostaje → linia `Dostępne: brak`.
  - Bin: `wa remove <moduł> [--force] [--no-install]`.

**Zachowania:**
- `create --modules demo` + `remove demo` daje katalog identyczny z `create` bez modułów (poza `IGNORE`); katalog `src/features/demo` nie istnieje.
- Zmieniony plik bez `--force` → `Zmienione pliki modułu demo (użyj --force):` z listą zmienionych plików, projekt bajtowo bez zmian; z `--force` → moduł usunięty.
- Zmiana tylko w treści regionu `wa:*` pliku modułu nie liczy się jako zmiana; brakujący plik modułu nie blokuje `remove`.
- `remove core` → `Nie można usunąć rdzenia`; `remove needs-demo` w projekcie bez niego → `Moduł needs-demo nie jest zainstalowany`.
- `demo` wymagane przez `needs-demo` → `Moduł demo jest wymagany przez: needs-demo`; `demo` wymagane przez moduł projektu `notes` → `… wymagany przez: notes`.
- `remove notes` (moduł projektu) → komunikat z „Interfaces”, żaden plik nie usunięty.
- Zależność `left-pad` modułu `demo`, którą deklaruje też moduł projektu `notes` → zostaje w `package.json` po `remove demo`.
- Puste katalogi nadrzędne znikają, katalog z plikiem spoza modułu zostaje; `projectDir` nigdy nie jest usuwany.
- Ostatnia linia `log` → `npx prisma migrate dev --name remove-demo`.
- `list`: przykład w Step 1; przy `available: null` i `availableError: "brak sieci"` → `Dostępne: nie udało się pobrać kitu (brak sieci)`; moduł projektu `notes` z opisem `Notatki` → linie `Projektu:` i `  notes — Notatki` na końcu; wszystkie moduły kitu zainstalowane → `Dostępne: brak`.

**Mutacje do zabicia:** odwrócone porównanie hashy; ignorowanie `--force`; usuwanie plików przed sprawdzeniem zmian; usuwanie katalogów powyżej `projectDir`; `removeDependencies` bez modułów projektu w `remaining`; brak odmowy dla `core` albo modułu projektu; „wymagany przez” sprawdzane tylko w modułach kitu; `list` bez grupy `Projektu:`.

- [ ] **Step 1: Failing tests** (przykłady)
```ts
it("create demo → remove demo daje to samo co create core", async () => {
  const dir = await createProject("app", ["demo"]);
  await remove({ projectDir: dir, module: "demo", force: false, install: false, runner, log });
  expect(await snapshotDir(dir, IGNORE)).toEqual(await snapshotDir(await createProject("app", [], "other"), IGNORE));
});
it("zmieniony plik bez --force → nic nie usunięte", async () => {
  const dir = await createProject("app", ["demo"]);
  await appendFile(join(dir, "src/features/demo/module.ts"), "\n");
  const snap = await snapshotDir(dir, IGNORE);
  await expect(remove({ projectDir: dir, module: "demo", force: false, install: false, runner, log })).rejects.toThrow("Zmienione pliki modułu demo (użyj --force)");
  expect(await snapshotDir(dir, IGNORE)).toEqual(snap);
});
it("--force usuwa mimo zmian", async () => {
  const dir = await createProject("app", ["demo"]);
  await appendFile(join(dir, "src/features/demo/module.ts"), "\n");
  await remove({ projectDir: dir, module: "demo", force: true, install: false, runner, log });
  expect(existsSync(join(dir, "src/features/demo"))).toBe(false);
});
it("demo wymagane przez needs-demo → odmowa", async () => {
  const dir = await createProject("app", ["needs-demo"]);
  await expect(remove({ projectDir: dir, module: "demo", force: false, install: false, runner, log })).rejects.toThrow("Moduł demo jest wymagany przez: needs-demo");
});
it("list: zainstalowane i dostępne", () => {
  const lines: string[] = [];
  list({ state: stateWith(["core", "demo"]), available: fixtureManifests, availableError: null, log: (l) => lines.push(l) });
  expect(lines).toEqual(["Zainstalowane:", "  core 0.1.0", "  demo 1.0.0", "Dostępne:", "  needs-demo 1.0.0 — Wymaga dema (wymaga: demo)"]);
});
```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementacja, `npm run build --prefix kit/cli`. **Step 4:** Run `npm run verify --prefix kit/cli` → PASS.
- [ ] **Step 5: Commit** — `feat(cli): wa remove and wa list`

---

### Task 10: Macierz składania w CI, dokumentacja i wersja 0.1.0

**Files:**
- Modify: `.github/workflows/kit.yml` (job `assemble`), `README.md` (sekcja „Moduły wa-kit”), `kit/CLAUDE.md`
- Create: `kit/README.md`, `kit/cli/src/__tests__/fixtures/project-module/` (`src/features/notes/{module.ts,i18n/pl.json,i18n/en.json}`, `prisma/schema/notes.prisma`)
- Modify: `kit/modules/core.json` (`version: "0.1.0"`), `.wa/kit.json` (`wa kit sync`)

**Interfaces:**
- `kit.yml`, job `assemble`:
  - `strategy.matrix.combo: [{ name: core, modules: "" }]`. Plan 3 dopisze moduły i `all`. Serwis `postgres:16` z bazą `matrix_e2e`.
  - Kroki: checkout → setup-node (`.nvmrc`) → `git config --global user.name/email` (bot actions) → `node .wa/bin/wa.mjs create "$RUNNER_TEMP/matrix-app" --yes --kit "$GITHUB_WORKSPACE" --modules "${{ matrix.combo.modules }}"` → w `matrix-app` (`.env` zapisał już `create`): `npx prisma validate` → `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/matrix_e2e npx prisma migrate dev --name init` → `npm run wa -- generate && git diff --exit-code` → `npm run verify` → `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/matrix_app_test npm run test:integration` (izolacja organizacji w złożonym projekcie) → `docker build .` (tylko `core`).
  - Asercje po `create` (krok `sh`):
    - bramki testowe są w projekcie: `test -f stryker.config.json && test -f mutation-gate.json && test -f .claude/hooks/protect-tests.mjs && test -f .claude/agents/test-writer.md && test -f .claude/agents/test-reviewer.md`;
    - placeholdery nie zostały poza testami i lockfile: `git grep -nE "WA App|wa-app|wa_app" -- . ':!**/__tests__/**' ':!**/*.test.*' ':!package-lock.json'` → brak trafień (kod wyjścia 1).
  - Moduł projektu (D11, D12): po `verify` krok kopiuje zawartość fixture `kit/cli/src/__tests__/fixtures/project-module/` do katalogu projektu, dopisuje wpis `notes` z Task 5 („Interfaces”) do `projectModules` (`node -e` na `.wa/kit.json`; fixture zawiera też `prisma/schema/notes.prisma` z modelem `Note` i relacją do `Organization`), uruchamia `npm run wa -- generate` i `npm test` → PASS bez edycji testów rdzenia. Fixture: `module.ts` z jedną pozycją menu `/notes` bez `roles`, `i18n/{pl,en}.json` z etykietą.
  - `--modules ""` oznacza „bez modułów” (Task 7: pusty string → `[]`).
- `README.md` projektu, sekcja „Moduły wa-kit”: `npm run wa -- list`, `npm run wa -- add <moduł>` (opcja `--kit`, `WA_KIT_SOURCE`, wymagany dostęp do `webamigos/wa-kit`), `npm run wa -- remove <moduł> [--force]`, przypomnienie o migracji po add/remove.
- `kit/README.md`: bootstrap `create-wa-app` (one-liner z D2), flagi `wa create`, rozwój kitu (bramka, rebuild bundla, `wa kit sync`, ownership test, podbijanie wersji, tag `v<version>` po merge'u robi człowiek).

- [ ] **Step 1:** Workflow i dokumentacja. Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:<przypięta wersja z Task 3>` → brak błędów.
- [ ] **Step 2:** Lokalny odpowiednik macierzy: `node .wa/bin/wa.mjs create <scratch>/matrix-app --yes --modules ""`, potem w nim `DB_PORT=5439 docker compose -p wa-kit-plan2 up -d --wait db`, `DATABASE_URL=postgresql://postgres:postgres@localhost:5439/matrix_app npx prisma migrate dev --name init`, `npm run wa -- generate && git diff --exit-code`, `npm run verify`, `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5439/matrix_app_test npm run test:integration` (bazę zakłada `src/test/integration/global-setup.ts`), asercje bramek i placeholderów z „Interfaces”, krok modułu projektu `notes`, `git status --porcelain prisma/migrations` (migracja widoczna do commita, R22). Expected: wszystko PASS, migracja nieignorowana. Na koniec `docker compose -p wa-kit-plan2 down`.

**Zachowania** (sprawdzane przebiegiem, bez testów jednostkowych): wszystkie kroki joba `assemble` przechodzą lokalnie (Step 2) i w CI; `actionlint` bez błędów; README projektu i `kit/README.md` opisują komendy z flagami takimi jak w `parseCreateArgs` i binie.

**Mutacje do zabicia:** brak (workflow i dokumentacja). Job `assemble` sam jest testem regresji całego składania.
- [ ] **Step 3:** Run `npm run verify && npm run verify --prefix kit/cli` → PASS.
- [ ] **Step 4: Commit** — `ci: assemble matrix for core and kit docs, release 0.1.0`
