# wa-kit — Plan 2: CLI (`create-wa-app`, `wa add/remove/list`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Z repozytorium wa-kit jedną komendą powstaje nowy projekt (rdzeń + wybrane moduły), który przechodzi `npm run verify`. W istniejącym projekcie moduły dodaje się i usuwa przez `wa add` / `wa remove`, a `wa list` pokazuje stan. Każdy plik i każda zależność kitu ma dokładnie jednego właściciela, a CI składa projekt `core` i go weryfikuje.

**Architecture:** CLI wychodzi z npm workspaces i trafia do `kit/cli` (samodzielna paczka z własnym lockfile). Jest bundlowane esbuildem do jednego pliku `.wa/bin/wa.mjs`, który jest commitowany i należy do `core`. Ten sam plik działa w kicie i w projekcie (`"wa": "node .wa/bin/wa.mjs"`), więc projekt nie potrzebuje rejestru npm. Kit pobiera się przez `git clone --branch v<wersja>`, a nowy projekt tworzy się z klonu (`node <klon>/.wa/bin/wa.mjs create <nazwa>`). Konfiguracja kitu jest w `kit/kit.json` (wersja, repo, pliki tylko dla kitu, placeholdery, pliki generowane i zarządzane). Manifesty modułów są w `kit/modules/<x>.json`, a `wa kit sync` przepisuje z nich `.wa/kit.json` kitu.

**Tech Stack:** Node 22 (ESM, `node:util` `parseArgs`, `node:readline/promises`, `node:child_process`), TypeScript 5, zod 4, esbuild (bundel), vitest 4, git (lista plików i pobieranie kitu), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-wa-kit-design.md` (§4, §5, §7, §8). Rulingi planu 1: `docs/superpowers/notes/2026-10-26-plan-1-handoff.md`.

**Ten plan to 2 z 4.** Plan 3: moduły `api-keys`, `audit-logs`, `uploads`, `worker`, `legal` i rozszerzenie macierzy CI. Plan 4: `wa update` i `wa diff`.

## Decyzje planu 2 (do akceptacji Jakuba)

- **D1. CLI przechodzi do `kit/cli` i przestaje być workspace.** Teraz root lockfile i `Dockerfile` (`COPY packages/cli/package.json`) zależą od CLI. Projekt bez `packages/cli` nie zbudowałby obrazu Dockera i miałby inny lockfile. Po przeniesieniu `package.json`, `package-lock.json`, `Dockerfile`, `ci.yml`, `CLAUDE.md`, `AGENTS.md` i `README.md` są identyczne w kicie i w projekcie, więc nie trzeba ich transformować.
- **D2. Dystrybucja: commitowany bundel `.wa/bin/wa.mjs` i `git clone` tagu.** Nie ma rejestru npm ani GitHub Packages, a jedynym wymogiem jest zalogowany `git`/`gh` (spec §8). Bootstrap wygląda tak: `git clone --depth 1 --branch v0.1.0 https://github.com/webamigos/wa-kit.git /tmp/wa-kit && node /tmp/wa-kit/.wa/bin/wa.mjs create <nazwa>`. Odstępstwo od spec §5: komenda nazywa się `wa create`, a `create-wa-app` to nazwa tego one-linera w dokumentacji. Osobny bin nie powstaje.
- **D3. Workspaces zostają statyczne (`packages/*`, `apps/*`)**, jak w planie 1. Sprawdziłem: `turbo run test typecheck` bez pakietów kończy się kodem 0, więc `verify` działa w projekcie bez workspace'ów.
- **D4. Zależności mają właścicieli tak jak pliki.** `core.json` jawnie wymienia wszystkie zależności rdzenia. `package.json` projektu to suma zależności zainstalowanych manifestów. Test pilnuje, żeby każda zależność w root `package.json` miała właściciela z tą samą wersją.
- **D5. Hashe w `.wa/kit.json` liczone są z treści bez ciał regionów `wa:*`**, więc `wa generate` ich nie zmienia. Pliki generowane (`src/modules*.generated.ts`, `src/i18n/locales.generated.ts`) nie mają właściciela i tworzy je `generate`. `package.json` i `package-lock.json` są „zarządzane” (hash `"managed"`); ich scalanie rozwiąże plan 4.
- **D6. Placeholdery to podmiana literałów** `WA App` → nazwa, `wa-app` → slug, `wa_app` → slug z `_`. Działa tylko w plikach z `placeholderFiles`, nigdy w testach.
- **D7. Języki (`--locales`) przez plik generowany** `src/i18n/locales.generated.ts` z `locales` zapisanych w `.wa/kit.json`. Brak `en` nie usuwa plików `en.json`.
- **D8. R22 bez transformacji.** Linia `prisma/migrations/` znika z root `.gitignore`. Kit-only plik `prisma/migrations/.gitignore` (`*` + `!.gitignore`) ignoruje migracje tylko w kicie.
- **D9. `wa remove` działa „wszystko albo nic”.** Jeśli choć jeden plik modułu się zmienił, bez `--force` nic nie jest usuwane i komenda kończy się kodem 1.
- **D10. Baza i admin przy tworzeniu są opcjonalne (`--setup`).** Domyślnie `create` zapisuje `.env` z losowym `BETTER_AUTH_SECRET` i wypisuje kolejne kroki. Z flagą `--setup` uruchamia `docker compose up -d --wait`, `prisma migrate dev --name init` i `admin:create`. Powód: konflikty portów na maszynach deweloperów.

## Global Constraints

- Publiczny adres aplikacji to `APP_URL` (dawniej `BETTER_AUTH_URL`; zmienione 2026-10-27 na prośbę Patryka, gałąź `refactor/app-url`). Nowy kod i dokumenty używają wyłącznie `APP_URL`.
- Node 22, npm. W tym środowisku instaluj przez `npx npm@11 install` (npm 10.9 się wywraca).
- Jedyna zależność runtime CLI to `zod` `^4.3.6`. Dev: `typescript` `^5`, `vitest` `^4.1.2`, `@types/node` `^22`, `esbuild` (aktualne `^0.x`). Argumenty parsuje `node:util` `parseArgs`, prompty obsługuje `node:readline/promises`, globy dopasowuje własny matcher (Task 3). Bez picomatch, commandera, inquirera.
- Komunikaty CLI są po polsku. Błędy wychodzą jako `Error` z treścią z planu, a bin wypisuje `message` i kończy się kodem 1.
- Bez komentarzy w kodzie (hook `.claude/hooks/block-comments.mjs`), z wyjątkami z `CLAUDE.md`.
- Pliki generowane zaczynają się od `// generated by wa — nie edytuj. Uruchom: npm run wa -- generate`. Są w `.prettierignore` i eslint ignores i muszą być bajtowo równe wyjściu `generate` (R17).
- Bundel `.wa/bin/wa.mjs` jest w `.prettierignore` i eslint ignores. Po każdej zmianie w `kit/cli/src` trzeba uruchomić `npm run build --prefix kit/cli` i scommitować bundel.
- Bramka kitu: `npm run verify && npm run verify --prefix kit/cli`. Bramka projektu: `npm run verify`.
- Nie uruchamiaj `prisma migrate reset` ani `db push --force-reset`. Lokalna baza: `DB_PORT=5439`, `docker compose -p wa-kit-plan2 …`. Innych kontenerów nie ruszaj, bazy `wa_app` nie usuwaj.
- Commity: Conventional Commits, temat małymi literami, na końcu `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pracuj na gałęzi `feat/plan-2-cli`, bez remote i bez pusha.

## Review Focus

- `create` do katalogu, który istnieje i nie jest pusty → odmowa, żaden plik nie zmieniony → test w Task 6.
- Nazwa projektu `Moja Apka`, `../x` albo `1app` → błąd przed utworzeniem czegokolwiek → testy w Task 5 (`projectNames`) i Task 6.
- Brak dostępu do repo kitu albo brak tagu → komunikat z podpowiedzią `gh auth status` / `--kit` zamiast surowego stderr gita → test w Task 7.
- `npm install` pada po skopiowaniu plików → `.wa/kit.json` zapisany, komunikat co uruchomić, kod 1, katalog zostaje → testy w Task 6 i Task 7.
- Literówka w nazwie modułu (`--modules api-key`) → błąd z listą dostępnych modułów → test w Task 5.

---

### Task 1: CLI w `kit/cli` i bundel `.wa/bin/wa.mjs`

**Files:**
- Move: `packages/cli/**` → `kit/cli/**` (`git mv`, razem z fixtures i testami)
- Modify: `kit/cli/package.json` (`"private": true`; usunąć `bin` i `files`; skrypty: `"typecheck": "tsc --noEmit -p tsconfig.json"`, `"test": "vitest run"`, `"build": "npm run typecheck && node bundle.mjs"`, `"verify": "npm run typecheck && npm test && npm run build"`; devDependency `esbuild`), `kit/cli/tsconfig.json` (`noEmit`, bez `outDir`/`declaration`)
- Create: `kit/cli/bundle.mjs`, `kit/cli/package-lock.json`, `.wa/bin/wa.mjs` (wynik builda), `kit/CLAUDE.md`, `.github/workflows/kit.yml`
- Modify: root `package.json` (`"wa": "node .wa/bin/wa.mjs"`), root `package-lock.json` (bez workspace `@wa-kit/cli`), `Dockerfile` (usunąć `COPY packages/cli/package.json ./packages/cli/`), `.dockerignore` (usunąć `packages/cli/dist`, dodać `kit`, `docs`), `.github/workflows/ci.yml` (usunąć krok „Build wa CLI”), `eslint.config.mjs` i `.prettierignore` (dodać `.wa/**`), `CLAUDE.md`, `AGENTS.md`, `README.md` (wszystkie `npm run build -w @wa-kit/cli && npm run wa -- generate` → `npm run wa -- generate`; z opisu `verify` usunąć „testy CLI”), `kit/cli/src/generate/registry.ts` (`GENERATED_HEADER` → `// generated by wa — nie edytuj. Uruchom: npm run wa -- generate`), `src/modules.generated.ts`, `src/modules.client.generated.ts` (regeneracja)

**Interfaces:**
- Produces: `npm run wa -- <komenda>` działa w kicie bez budowania. `kit/cli/bundle.mjs` woła esbuild: `entryPoints: ["src/bin.ts"]`, `bundle: true`, `platform: "node"`, `format: "esm"`, `target: "node22"`, `banner: { js: "#!/usr/bin/env node" }`, `outfile: "../../.wa/bin/wa.mjs"`, `legalComments: "none"`.
- `kit.yml`, job `cli`: `npm ci --prefix kit/cli` → `npm run verify --prefix kit/cli` → `git diff --exit-code -- .wa/bin/wa.mjs` (bundel aktualny).
- `kit/CLAUDE.md` (kit-only): bramka kitu, rebuild i commit bundla po zmianie CLI, podbicie `version` modułu przy zmianie jego plików, rola `kit/modules/*.json` i `kit/kit.json`.

- [ ] **Step 1:** `git mv packages/cli kit/cli`, poprawić package.json/tsconfig, `cd kit/cli && npx npm@11 install`, potem w root `npx npm@11 install`. Run: `npm test --prefix kit/cli` → 22 testy PASS.
- [ ] **Step 2:** Dodać `bundle.mjs`. Run: `npm run build --prefix kit/cli && npm run wa -- generate`. Expected: zmienione tylko dwa pliki `src/modules*.generated.ts` (nowy nagłówek). Drugie `npm run wa -- generate` → `Bez zmian`.
- [ ] **Step 3:** Poprawki w root (Dockerfile, ci.yml, dokumenty, ignores) i `kit.yml`. Run: `grep -rn "@wa-kit/cli\|packages/cli" --exclude-dir=node_modules --exclude-dir=docs --exclude-dir=kit . ; echo $?` → `1` (brak trafień).
- [ ] **Step 4:** Run: `npm run verify && npm run verify --prefix kit/cli` → PASS. Run: `docker build .` → sukces.
- [ ] **Step 5: Commit** — `refactor(cli): move cli to kit/cli and ship single-file bundle`

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
    "kitOnly": ["kit/**", "docs/**", ".superpowers/**", ".claude/handoffs/**", ".wa/kit.json", ".github/workflows/kit.yml", "prisma/migrations/.gitignore"],
    "placeholders": { "projectName": "WA App", "projectSlug": "wa-app", "projectSnake": "wa_app" },
    "placeholderFiles": ["src/shared/config/project.ts", "package.json", "docker-compose.yml", ".env.example", "e2e/env.ts", ".github/workflows/e2e.yml", "README.md"],
    "generatedFiles": ["src/modules.generated.ts", "src/modules.client.generated.ts", "src/i18n/locales.generated.ts"],
    "managedFiles": ["package.json", "package-lock.json"]
  }
  ```
- `kit.yml`, job `cli`: po `verify` dochodzi krok `npm run wa -- kit sync && npm run wa -- generate && git diff --exit-code`.

- [ ] **Step 1: Failing tests**
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
  `fixtureKit` to nowy `kit/cli/src/__tests__/fixtures/kit/` z `kit/kit.json` (`version: "0.1.0"`, reszta jak w kicie) i manifestami `core`, `demo` (env `DEMO_TOKEN` = `{{projectSlug}}_demo_`, `schemaRelations` `User.demos Demo[]`, `compose` `src/features/demo/compose.yml`, `dependencies: { "left-pad": "^1.3.0" }`) oraz `needs-demo` (`requires: ["demo"]`). Pliki aplikacji fixture dochodzą w Task 3 i Task 6.
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
- Zasady `core.json`: globy na poziomie katalogów, które nie zachodzą na ścieżki modułów ze spec §3. Na przykład `src/app/[locale]/(app)/dashboard/**` zamiast `src/app/**`, a pliki w `src/app/[locale]/(app)/` przez `src/app/[locale]/(app)/*`. `core.json` obejmuje też: `.wa/bin/wa.mjs`, `.claude/hooks/**`, `.claude/settings.json`, `.github/workflows/` (5 plików poza `kit.yml`), `.husky/**`, `scripts/**`, `e2e/**`, `src/proxy.ts`, `src/instrumentation.ts`, `src/types/**` i każdy plik konfiguracyjny w root. Plan 3 zawęzi globy `src/shared/lib/*`, gdy moduły dodadzą tam pliki.

- [ ] **Step 1: Failing tests**
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
- [ ] **Step 2:** Run `npm test --prefix kit/cli` → FAIL.
- [ ] **Step 3:** Implementacja i uzupełnienie `core.json` aż test repo przejdzie. Potem pliki higieny (`.gitignore`, `prisma/migrations/.gitignore`, przypięte wersje akcji z `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name`, `.coderabbit.yaml`) i `npm run wa -- kit sync`.
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

- [ ] **Step 1: Failing tests**
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

### Task 5: Prymitywy składania

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
  - `addDependencies(packageJson: string, manifest: ModuleManifest): string` oraz `removeDependencies(packageJson: string, removed: ModuleManifest, remaining: ModuleManifest[]): string`. Usuwa tylko zależności `removed`, których nie deklaruje żaden z `remaining`; zależności dodane ręcznie w projekcie zostają.
  - `stripRegions(content: string): string`. Usuwa linie między `wa:<x>:start` i `wa:<x>:end` dla każdego `x`; same znaczniki zostają.
  - `fileHash(file: string, content: string, config: KitConfig): string` → `"managed"` dla `managedFiles`, w przeciwnym razie sha256 hex z `stripRegions(content)`.
  - `moduleFiles(manifest: ModuleManifest, files: string[]): string[]` = `matchFiles(manifest.files, files)` (`files` = wynik `assemblableFiles`).
  - `copyFiles(input: { kitDir: string; projectDir: string; files: string[]; config: KitConfig; names: ProjectNames }): Promise<Record<string, string>>`. Kopiuje z placeholderami, zachowuje bit wykonywalności, zwraca ścieżka → `fileHash`.

- [ ] **Step 1: Failing tests**
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

### Task 6: `wa create` (`create-wa-app`)

**Files:**
- Create: `kit/cli/src/commands/create.ts`, `kit/cli/src/process/runner.ts`, `kit/cli/src/process/prompter.ts`, `kit/cli/src/args.ts`
- Modify: `kit/cli/src/bin.ts`, fixture `kit/cli/src/__tests__/fixtures/kit/`. Fixture dostaje minimalną aplikację: `package.json` (deps `zod`, `left-pad`), `package-lock.json`, `.env.example` i `docker-compose.yml` z regionami, `prisma/schema/{auth,organizations}.prisma` z regionami, `src/shared/config/project.ts` z `WA App`/`wa-app`, `src/features/{auth,demo,needs-demo}/module.ts`, `src/features/demo/{env.ts,compose.yml,i18n/pl.json}`, `src/i18n/config.ts`, `.wa/bin/wa.mjs` (atrapa), `docs/readme.md` (kit-only).
- Test: `kit/cli/src/commands/__tests__/create.test.ts`

**Interfaces:**
- Consumes: wszystko z Task 2–5 oraz `generate` (Task 4).
- Produces:
  - `type Runner = (command: string, args: string[], cwd: string) => Promise<void>`. Implementacja `spawnRunner` używa `spawn` z `stdio: "inherit"`. Kod ≠ 0 → `Error("<command> <args…> zakończone kodem <n>")`.
  - `type Prompter = { ask(question: string, fallback: string): Promise<string>; confirm(question: string, fallback: boolean): Promise<boolean> }`. Implementacja `readlinePrompter`. Bez TTY i bez `--yes` → `Error("Brak terminala: użyj --yes")`.
  - `type CreateOptions = { target: string; kitDir: string; modules: string[] | null; locales: ("pl"|"en")[] | null; title: string | null; adminEmail: string | null; yes: boolean; setup: boolean; install: boolean; git: boolean; runner: Runner; prompter: Prompter; log: (line: string) => void }`.
  - `create(options: CreateOptions): Promise<{ projectDir: string; modules: string[] }>`. Kolejność:
    1. `projectNames` (błąd, zanim cokolwiek powstanie). Katalog istnieje i nie jest pusty → `Error("Katalog <dir> istnieje i nie jest pusty")`.
    2. Bez `--yes` dopytuje o brakujące: moduły (lista `nazwa — opis`, wpis po przecinku, puste = żaden), języki (domyślnie `pl,en`), nazwę wyświetlaną (domyślnie z `projectNames`), email admina (puste = pomiń), `Uruchomić bazę, migrację i admin:create teraz? [t/N]`.
    3. Kopiuje `moduleFiles` wybranych modułów, nadpisuje `package.json` przez `projectPackageJson` i zapisuje `.wa/kit.json` (`kitVersion: config.version`, `kitRepo: config.repo`, `project`, `locales`, moduły z `files` = hashe) przez `writeKitState`. Potem `generate(projectDir)`. Błąd w tym kroku → usuwa katalog, jeśli `create` go utworzył, i rzuca dalej.
    4. `.env` = `.env.example` z `BETTER_AUTH_SECRET=<randomBytes(32).toString("base64url")>` i `ADMIN_EMAIL=<email>`, jeśli podany.
    5. `install` → `npm install`. Błąd → `Error("Projekt utworzony w <dir>, ale npm install się nie powiódł. Uruchom: cd <dir> && npm install")`.
    6. `git` → `git init -q`, `git add -A`, `git commit -q --no-verify -m "chore: initial commit from wa-kit v<version>"`. Błąd commita → `log("Uwaga: nie utworzono commita (<message>). Skonfiguruj git i zrób commit ręcznie.")`, bez przerywania.
    7. `setup` → `docker compose up -d --wait`, `npx prisma migrate dev --name init`, a przy podanym emailu `npm run admin:create -- --email <email>`.
    8. Wypisuje kroki: `cd <dir>`, `docker compose up -d`, `npx prisma migrate dev --name init`, `npm run admin:create -- --email <email|twój-email>`, `npm run dev`. Po `setup` tylko `cd` i `npm run dev`.
  - Bin: `wa create <target> [--modules a,b] [--locales pl,en] [--title <t>] [--admin-email <e>] [--setup] [--yes] [--no-install] [--no-git] [--kit <dir>]`. Domyślne `kitDir` = `resolve(dirname(fileURLToPath(import.meta.url)), "../..")`. Brak tam `kit/kit.json` → `Error("Uruchom create z klonu wa-kit albo podaj --kit <ścieżka>")`. `--locales` spoza `pl,en` albo bez `pl` → `Error("--locales: dozwolone pl,en; pl jest wymagany")`.

- [ ] **Step 1: Failing tests** (`runner` = spy, `install: false`, `git: false`, o ile test nie mówi inaczej)
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
    "npm install", "git init -q", "git add -A",
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

### Task 7: `wa add` i źródło kitu

**Files:**
- Create: `kit/cli/src/kit/source.ts`, `kit/cli/src/commands/add.ts`
- Modify: `kit/cli/src/bin.ts`
- Test: `kit/cli/src/kit/__tests__/source.test.ts`, `kit/cli/src/commands/__tests__/add.test.ts`

**Interfaces:**
- Consumes: Task 2–6.
- Produces:
  - `resolveKitSource(input: { kitFlag: string | null; envSource: string | undefined; state: KitState; runner: Runner; tmpDir: string }): Promise<string>`. Źródło: `kitFlag` ?? `envSource` (`WA_KIT_SOURCE`) ?? `state.kitRepo`.
    - Ścieżka lokalna: `kit/kit.json` musi mieć `version === state.kitVersion`, inaczej `Error("Kit w <dir> ma wersję <a>, projekt używa <b>")`.
    - URL (zawiera `://` albo zaczyna się od `git@`): `git clone --depth 1 --branch v<kitVersion> --quiet <url> <tmpDir>/wa-kit`. Błąd → `Error("Nie udało się pobrać wa-kit v<ver> z <url>. Sprawdź dostęp (gh auth status) albo podaj --kit <ścieżka>")`.
  - `add(options: { projectDir: string; module: string; kitDir: string; install: boolean; runner: Runner; log: (line: string) => void }): Promise<{ added: string[] }>`. Kolejność:
    1. Moduł zainstalowany → `Error("Moduł <x> jest już zainstalowany")`.
    2. `resolveModules` minus zainstalowane.
    3. Pliki docelowe, które już istnieją → `Error("Pliki już istnieją, przerwano bez zmian:\n  <a>\n  <b>")`.
    4. `copyFiles`, `addDependencies` dla każdego dodanego modułu, `writeKitState`, `generate`.
    5. `install` → `npm install`. Błąd → `Error("Moduł dodany, ale npm install się nie powiódł. Uruchom: npm install")`.
    6. Wypisuje `npx prisma migrate dev --name add-<x>`.
  - Bin: `wa add <moduł> [--kit <ścieżka|url>] [--no-install]`. Katalog tymczasowy z `mkdtemp` jest usuwany w `finally`.

- [ ] **Step 1: Failing tests**
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

### Task 8: `wa remove` i `wa list`

**Files:**
- Create: `kit/cli/src/commands/{remove,list}.ts`
- Modify: `kit/cli/src/bin.ts`
- Test: `kit/cli/src/commands/__tests__/{remove,list}.test.ts`

**Interfaces:**
- Consumes: Task 2–7.
- Produces:
  - `remove(options: { projectDir: string; module: string; force: boolean; install: boolean; runner: Runner; log: (line: string) => void }): Promise<{ removed: string[] }>`. Kolejność:
    1. `core` → `Error("Nie można usunąć rdzenia")`. Moduł niezainstalowany → `Error("Moduł <x> nie jest zainstalowany")`. Wymagany przez inny zainstalowany → `Error("Moduł <x> jest wymagany przez: <y, z>")`.
    2. Zmienione = istniejące pliki z `fileHash` ≠ zapisany (brakujące pomija). Zmienione i brak `--force` → `Error("Zmienione pliki modułu <x> (użyj --force):\n  <a>")`, bez żadnej zmiany.
    3. Usuwa pliki i puste katalogi nadrzędne (nie wyżej niż `projectDir`), robi `removeDependencies`, usuwa moduł z `.wa/kit.json`, uruchamia `generate`, a przy `install` także `npm install`.
    4. Wypisuje `npx prisma migrate dev --name remove-<x>`.
  - `list(options: { state: KitState; available: ModuleManifest[] | null; availableError: string | null; log: (line: string) => void }): void`. Format:
    ```
    Zainstalowane:
      core 0.1.0
      demo 1.0.0
    Dostępne:
      needs-demo 1.0.0 — <opis> (wymaga: demo)
    ```
    Gdy `available === null`: `Dostępne: nie udało się pobrać kitu (<availableError>)`. Bin `wa list [--kit …]` łapie błąd `resolveKitSource` i przekazuje go jako `availableError`.
  - Bin: `wa remove <moduł> [--force] [--no-install]`.

- [ ] **Step 1: Failing tests**
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

### Task 9: Macierz składania w CI, dokumentacja i wersja 0.1.0

**Files:**
- Modify: `.github/workflows/kit.yml` (job `assemble`), `README.md` (sekcja „Moduły wa-kit”), `kit/CLAUDE.md`
- Create: `kit/README.md`
- Modify: `kit/modules/core.json` (`version: "0.1.0"`), `.wa/kit.json` (`wa kit sync`)

**Interfaces:**
- `kit.yml`, job `assemble`:
  - `strategy.matrix.combo: [{ name: core, modules: "" }]`. Plan 3 dopisze moduły i `all`. Serwis `postgres:16` z bazą `matrix_e2e`.
  - Kroki: checkout → setup-node (`.nvmrc`) → `git config --global user.name/email` (bot actions) → `node .wa/bin/wa.mjs create "$RUNNER_TEMP/matrix-app" --yes --kit "$GITHUB_WORKSPACE" --modules "${{ matrix.combo.modules }}"` → w `matrix-app` (`.env` zapisał już `create`): `npx prisma validate` → `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/matrix_e2e npx prisma migrate dev --name init` → `npm run wa -- generate && git diff --exit-code` → `npm run verify` → `docker build .` (tylko `core`).
  - `--modules ""` oznacza „bez modułów” (Task 6: pusty string → `[]`).
- `README.md` projektu, sekcja „Moduły wa-kit”: `npm run wa -- list`, `npm run wa -- add <moduł>` (opcja `--kit`, `WA_KIT_SOURCE`, wymagany dostęp do `webamigos/wa-kit`), `npm run wa -- remove <moduł> [--force]`, przypomnienie o migracji po add/remove.
- `kit/README.md`: bootstrap `create-wa-app` (one-liner z D2), flagi `wa create`, rozwój kitu (bramka, rebuild bundla, `wa kit sync`, ownership test, podbijanie wersji, tag `v<version>` po merge'u robi człowiek).

- [ ] **Step 1:** Workflow i dokumentacja. Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:<przypięta wersja z Task 3>` → brak błędów.
- [ ] **Step 2:** Lokalny odpowiednik macierzy: `node .wa/bin/wa.mjs create <scratch>/matrix-app --yes --modules ""`, potem w nim `DB_PORT=5439 docker compose -p wa-kit-plan2 up -d --wait db`, `DATABASE_URL=postgresql://postgres:postgres@localhost:5439/matrix_app npx prisma migrate dev --name init`, `npm run wa -- generate && git diff --exit-code`, `npm run verify`, `git status --porcelain prisma/migrations` (migracja widoczna do commita, R22). Expected: wszystko PASS, migracja nieignorowana. Na koniec `docker compose -p wa-kit-plan2 down`.
- [ ] **Step 3:** Run `npm run verify && npm run verify --prefix kit/cli` → PASS.
- [ ] **Step 4: Commit** — `ci: assemble matrix for core and kit docs, release 0.1.0`
