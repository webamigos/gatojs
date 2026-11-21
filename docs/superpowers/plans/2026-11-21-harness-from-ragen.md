# Harness z Ragena, faza 1 — plan implementacji

**Goal:** Rdzeń kitu dostaje testy architektury pilnujące spójności repo, guard organizacji w runtime, który rzuca błąd przy zapytaniu bez `organizationId`, oraz skille projektowe, Task Router w `AGENTS.md` i allowlistę `permissions`.

**Spec:** [docs/superpowers/specs/2026-11-21-harness-from-ragen-design.md](../specs/2026-11-21-harness-from-ragen-design.md). Wykonawca czyta spec razem z planem.

**Wykonanie:** trzy zadania równolegle w osobnych worktree (workerzy Orca), każde na własnej gałęzi od `feat/harness-from-ragen`. Koordynator scala je i wykonuje Task 4 (integracja).

## Global Constraints

- Reguły `CLAUDE.md` i `AGENTS.md` obowiązują w każdym zadaniu: bez komentarzy w kodzie poza `// WHY:` (najwyżej 3 linie) i dyrektywami narzędzi; bez `any`, zagnieżdżonych ternary i cichych `catch {}`; Zod na wejściu z zewnątrz; `name` klasy błędu napisem.
- **Nie zmieniaj `version` w `kit/modules/core.json`** ani wersji modułów. Robi to Task 4. Dopisz tylko nowe pozycje do `files` (jeśli zadanie tego wymaga) i uruchom `npm run wa -- kit sync && npm run wa -- generate`.
- Numery decyzji są przydzielone: Task 1 → D50, Task 2 → D51, Task 3 → D52. Nie zajmuj innych.
- Nie edytuj plików generowanych ani regionów `wa:*`.
- Plan nie zmienia `kit/cli/src`. Jeśli zmiana okaże się potrzebna, zatrzymaj się i zapytaj koordynatora.
- Testy jednostkowe nie mogą zależeć od lokalnego `.env`: `env -i PATH="$PATH" HOME="$HOME" npx vitest run <pliki>`.
- Wpisy `allowed` w `mutation-gate.json` dopisuje człowiek. Agent proponuje je w raporcie z uzasadnieniem.
- Commity: Conventional Commits, temat małymi literami, stopka `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Zmiany rdzenia i modułu w osobnych commitach (`kit/CLAUDE.md`).
- Bez pusha, PR i uruchamiania workflowów.
- Dokumentacja po polsku, w stylu bezczasowym. W każdym zmienionym pliku `docs/` podbij nagłówek `Zweryfikowano z kodem: <krótki sha>, <data>`.

## Przygotowanie (każdy worker, raz)

- `npm ci` i `npm ci --prefix kit/cli` w swoim worktree.
- Testy integracyjne: `docker ps`; działający Postgres podaj w `INTEGRATION_DATABASE_URL` (baza z sufiksem `_test`). Jeśli bazy nie ma: `docker compose up -d db`. Nie zatrzymuj kontenerów innych projektów.
- Przeczytaj `kit/CLAUDE.md`, `docs/08-testy.md`, `docs/08b-testy-adwersarialne.md`, `docs/11-praca-z-kitem.md`.

## Proces każdego zadania

1. Subagent `test-writer` pisze testy z „Zachowań” i „Mutacji do zabicia”. Pokazuje czerwony przebieg z właściwego powodu.
2. `printf implement > .superpowers/phase` w swoim worktree. Implementacja bez dotykania testów. Błędny test zgłoś zamiast poprawiać.
3. `rm .superpowers/phase`. Subagent `test-reviewer`: `npm run test:mutation:task -- <pliki>` i `npm run test:mutation:gate`.
4. `npm run verify` → PASS. Commity.
5. Raport dla koordynatora: gałąź, commity, wyniki bramek, przeżyłe mutanty z klasyfikacją, propozycje `allowed`, wszystko niesprawdzone.

---

### Task 1: Testy architektury w rdzeniu

**Gałąź:** `feat/harness-arch-tests`

**Files:**
- Create: `src/__tests__/architecture/*.test.ts` (siedem testów z §3 specu) i w razie potrzeby `src/__tests__/architecture/repo-files.ts` (wspólny odczyt plików: `git ls-files` albo przejście katalogów z pominięciem `node_modules`, `.next`, `src/generated`, `reports`, `.stryker-tmp`).
- Modify: `kit/modules/core.json` → `files` += `"src/__tests__/architecture/**"`.
- Modify: pliki, w których test znajdzie naruszenie (poprawka w tym samym zadaniu).
- Docs: `docs/08-testy.md` (nowa sekcja „Testy architektury”: lista, niezmienniki, jak dodać test), `docs/decyzje.md` (D50: kontekst = research z Ragena, decyzja, odrzucone: testy tylko w repo kitu, ESLint zamiast testów; konsekwencje: test pada w projekcie, który zmieni plik rdzenia w niezgodny sposób).

**Interfaces / reguły:**
- Testy są czystymi testami Vitest w `npm test` (bez bazy, bez sieci). Każdy czyta pliki z dysku, względem katalogu głównego repo.
- Każdy test ma eksportowaną czystą funkcję wykrywającą naruszenia (np. `findUndocumentedCommands(markdown, scripts)`) testowaną na literałach **oraz** jedno wywołanie na prawdziwym repo (`expect(violations).toEqual([])`). Komunikat naruszenia wskazuje plik i wartość.
- `cited-paths-exist`: ścieżka to tekst w backtickach albo cel linku Markdown, zaczynający się od `src/`, `prisma/`, `scripts/`, `e2e/`, `.claude/`, `.github/`, `kit/`, `docs/` albo będący nazwą pliku w katalogu głównym z rozszerzeniem. Odsyłacze do `docs/` i `kit/` w plikach projektu dotyczą repo `webamigos/wa-kit` i są pomijane (te katalogi są `kitOnly`). Wzorce z `<`, `*` lub `{` są pomijane. Kotwica `#…` jest odcinana.
- `i18n-keys-exist-in-every-locale`: klucz to pełna ścieżka liścia (`a.b.c`). Raport: plik, locale, brakujące klucze.
- `env-example-passes-validation`: parsuj `.env.example` (`KEY=value`, `#` i puste linie pomijane, wartość bez cudzysłowów po usunięciu ich z brzegów) i podaj do `checkEnv` z `NODE_ENV` nadpisanym na `"development"`.
- `node-version-is-one-number`: major z `.nvmrc` (np. `22`, `v22.14.0` → `22`); z `Dockerfile` każda linia `FROM node:<tag>`; z `.github/workflows/*.yml` każde `node-version:` z literałem to naruszenie.
- `client-bundles-stay-server-free`: pliki `.ts/.tsx` w `src/` z dyrektywą `"use client"` w pierwszej instrukcji; importy statyczne i `import()` z literałem.

**Zachowania** (funkcje wykrywające, na literałach):
- `findUndocumentedCommands("uruchom `npm run verify` i `npm run nope`", { verify: "x" })` → `["npm run nope"]`.
- `findUndocumentedCommands("npm run wa -- generate", { wa: "x" })` → `[]` (argumenty po nazwie skryptu ignorowane).
- `isWithinBudget(31744)` → `true`; `isWithinBudget(31745)` → `false`.
- `findMissingKeys({ pl: { a: { b: "x" }, c: "y" }, en: { a: { b: "x" } } })` → `[{ locale: "en", key: "c" }]`.
- `findMissingKeys({ pl: { a: "x" }, en: { a: { b: "y" } } })` → zgłasza `a` w `pl` jako brak `a.b` i `a` w `en` jako brak liścia `a` (różny kształt to naruszenie w obie strony).
- `parseDotenv("A=1\n# x\n\nB=\"two\"\n")` → `{ A: "1", B: "two" }`.
- `nodeMajor("v22.14.0\n")` → `"22"`; `findNodeLiterals("with:\n  node-version: 22\n")` → 1 naruszenie; `"node-version-file: .nvmrc"` → 0.
- `findServerImportsInClient("\"use client\";\nimport { prisma } from \"@/shared/lib/prisma\";")` → 1 naruszenie; ten sam import bez `"use client"` → 0; `import { authClient } from "@/shared/lib/auth/client"` z `"use client"` → 0; `import fs from "node:fs"` z `"use client"` → 1.
- `findMissingCitedPaths("zob. `src/nope.ts` i `src/features/<x>/module.ts` oraz [d](docs/02-architektura.md#a)", exists)` → `["src/nope.ts"]`.

**Mutacje do zabicia:** granica budżetu `<=` → `<`; pominięcie kluczy zagnieżdżonych (porównanie tylko najwyższego poziomu); porównanie tylko w jedną stronę (`pl` ⊆ `en`, ale nie odwrotnie); `"use client"` rozpoznawane gdziekolwiek w pliku zamiast tylko w pierwszej instrukcji; brak odcięcia kotwicy `#`; `node-version-file` liczony jako literał.

- [ ] Step 1: testy → czerwone.
- [ ] Step 2: implementacja funkcji i poprawki naruszeń w repo. Każde poprawione naruszenie wymień w raporcie.
- [ ] Step 3: `core.json` `files`, `npm run wa -- kit sync && npm run wa -- generate && git diff --exit-code -- src/modules.generated.ts src/modules.client.generated.ts`.
- [ ] Step 4: dokumentacja i D50.
- [ ] Step 5: `npm run test:mutation:task -- <pliki z funkcjami wykrywającymi>`, `npm run verify`. Commit `test(core): add architecture tests for repo consistency`.

---

### Task 2: Guard organizacji w runtime

**Gałąź:** `feat/harness-tenant-scope`

**Files:**
- Create: `src/shared/lib/tenant-scope/tenant-scope.ts` (czysta funkcja decyzji), `src/shared/lib/tenant-scope/tenant-scope-extension.ts` (rozszerzenie Prismy i AsyncLocalStorage), `src/shared/lib/tenant-scope/index.ts` jeśli potrzebny.
- Modify: `src/shared/lib/prisma.ts` (eksport klienta z rozszerzeniem; typ musi dalej działać z `prismaAdapter` better-auth i z `$transaction`).
- Modify (moduły, osobny commit na moduł): `src/features/api-keys/services/authenticate-api-key.ts`, `src/features/uploads/services/read-upload.ts` (§4.3 specu).
- Modify: `src/test/integration/database.ts` i inne pomocniki testów, które tego wymagają.
- Modify: `mutation-gate.json` → `critical` += `"src/shared/lib/tenant-scope/"` (to lista plików krytycznych, nie wpis `allowed`).
- Modify: `stryker.config.json` `mutate`, jeśli nowy katalog nie jest objęty.
- Docs: `docs/03-dane-i-organizacje.md` (sekcja „Guard w runtime”: co liczy się jako filtr, `withoutTenantScope`, ograniczenia z §4.2), `docs/09b-implementacja-i-bramki.md` (wzmianka przy query/komendzie), `docs/14-modul-api-keys.md` i `docs/15-modul-uploads.md` (dlaczego `withoutTenantScope`), `docs/znane-ograniczenia.md` (raw SQL, zapytania zagnieżdżone, `Member`/`Invitation`), `docs/decyzje.md` (D51), `AGENTS.md` sekcja „Dane i organizacje” (jedno zdanie + nazwa `withoutTenantScope`; budżet rozmiaru pilnuje Task 1).

**Interfaces:**
```ts
export class TenantScopeError extends Error { name = "TenantScopeError"; readonly model: string; readonly operation: string }
export function isTenantScoped(model: string): boolean;
export function isTenantScopeSatisfied(operation: string, args: unknown): boolean;
export function withoutTenantScope<T>(reason: string, fn: () => Promise<T>): Promise<T>;
```
- `isTenantScoped` czyta listę modeli z wygenerowanego klienta (np. pola skalarne z `Prisma.*ScalarFieldEnum` albo metadane runtime klienta Prisma 7). Ręczna mapa modeli jest niedozwolona. Jeśli wygenerowany klient nie udostępnia tej informacji, zatrzymaj się i zapytaj koordynatora z propozycją.
- `withoutTenantScope("", fn)` rzuca błąd przed wywołaniem `fn`.

**Zachowania** (czysta funkcja, na literałach; `organizationId` = `"org_a"`):
- `isTenantScopeSatisfied("findMany", { where: { organizationId: "org_a" } })` → `true`.
- `… { where: { organizationId: { equals: "org_a" } } }` → `true`; `{ in: ["org_a"] }` → `true`; `{ in: [] }` → `false`.
- `… { where: { organizationId: { not: "org_a" } } }` → `false`; `{ notIn: ["org_a"] }` → `false`; `{}` → `false`; `undefined` → `false`; `""` → `false`; `null` → `false`.
- `… { where: { id: "x" } }` → `false`; `{}` (bez `where`) → `false`.
- `… { where: { AND: [{ id: "x" }, { organizationId: "org_a" }] } }` → `true`; `AND` jako obiekt `{ organizationId: "org_a" }` → `true`.
- `… { where: { OR: [{ organizationId: "org_a" }, { organizationId: "org_b" }] } }` → `true`; `OR: [{ organizationId: "org_a" }, { id: "x" }]` → `false`; `OR: []` → `false`.
- `… { where: { NOT: { organizationId: "org_a" } } }` → `false`; `{ organization: { id: "org_a" } }` → `false`.
- `isTenantScopeSatisfied("findUnique", { where: { organizationId_userId: { organizationId: "org_a", userId: "u" } } })` → `true`.
- `isTenantScopeSatisfied("create", { data: { organizationId: "org_a" } })` → `true`; `{ data: { organization: { connect: { id: "org_a" } } } }` → `false`.
- `isTenantScopeSatisfied("createMany", { data: [{ organizationId: "org_a" }, { name: "x" }] })` → `false`; oba wiersze z `organizationId` → `true`; `data` jako pojedynczy obiekt z `organizationId` → `true`.
- `isTenantScopeSatisfied("upsert", { where: { organizationId: "org_a" }, create: { organizationId: "org_a" }, update: {} })` → `true`; bez `create.organizationId` → `false`.
- `isTenantScopeSatisfied("count", {})` → `false`; `("deleteMany", { where: { organizationId: "org_a" } })` → `true`.
- `isTenantScoped("ApiKey")` → `true`; `("AuditLog")` → `true`; `("Upload")` → `true` (w projekcie z modułami); `("Member")` → `false`; `("Invitation")` → `false`; `("User")` → `false`; `("Organization")` → `false`.
- Integracja (`*.integration.test.ts`, prawdziwa baza, dwie organizacje):
  - `prisma.apiKey.findMany({})` → odrzucone z `TenantScopeError` (`name === "TenantScopeError"`, `model === "ApiKey"`, `operation === "findMany"`), żaden wiersz nie zwrócony;
  - `prisma.apiKey.findMany({ where: { organizationId: orgA } })` → tylko klucze `orgA`;
  - `prisma.apiKey.deleteMany({ where: { id: keyB } })` → `TenantScopeError`, klucz `orgB` dalej istnieje;
  - `withoutTenantScope("test", () => prisma.apiKey.count())` → liczba kluczy obu organizacji; zaraz po nim `prisma.apiKey.count()` → `TenantScopeError`;
  - `withoutTenantScope("test", async () => { throw new Error("x") })` odrzucone z `"x"`, a następne zapytanie bez filtra → `TenantScopeError`;
  - `prisma.member.findMany({ where: { userId } })` → działa (model poza guardem);
  - logowanie przez better-auth i `authenticateApiKey` z poprawnym kluczem → działa;
  - odczyt publicznego pliku innej organizacji przez `readUploadForDownload` → 200; prywatnego → 404 (zachowanie bez zmian).
- `npm run test:e2e` → PASS (better-auth i całe UI przez guard).

**Mutacje do zabicia:** `every` → `some` w `OR`; `NOT` liczone jako filtr; `{ in: [] }` liczone jako filtr; `{ not }` liczone jako filtr; `createMany` sprawdzające tylko pierwszy wiersz; `upsert` bez sprawdzenia `create`; `Member` objęty guardem albo `ApiKey` wyłączony; stan `withoutTenantScope` niewyczyszczony po błędzie; pusty `reason` przyjęty; guard ostrzega zamiast rzucać.

- [ ] Step 1: testy (jednostkowe czystej funkcji + integracyjne) → czerwone.
- [ ] Step 2: implementacja guardu i podłączenie w `prisma.ts`.
- [ ] Step 3: `npm run test:integration` i `npm run test:e2e` (po `docker compose up -d db mail`). Każde zapytanie odrzucone przez guard: albo brakujący filtr (poprawka), albo świadomy odczyt między organizacjami (`withoutTenantScope` z powodem). Listę wymień w raporcie.
- [ ] Step 4: zmiany modułów `api-keys` i `uploads` osobnymi commitami.
- [ ] Step 5: dokumentacja i D51.
- [ ] Step 6: `npm run test:mutation:task -- src/shared/lib/tenant-scope/tenant-scope.ts,src/shared/lib/tenant-scope/tenant-scope-extension.ts`, `npm run test:mutation:gate`, `npm run verify`. Logika bezpieczeństwa nie może mieć luk. Commit rdzenia `feat(core): reject unscoped queries on organization models`.

---

### Task 3: Skille projektowe, Task Router i allowlista uprawnień

**Gałąź:** `feat/harness-skills-router`

**Files:**
- Create: `.claude/skills/wa-code-review/SKILL.md`, `.claude/skills/wa-upgrade-dependency/SKILL.md`, `.claude/skills/wa-new-module/SKILL.md`.
- Modify: `.claude/settings.json` (`permissions.allow`; `hooks` bez zmian).
- Modify: `AGENTS.md` (sekcja „Task Router”), `CLAUDE.md` tylko jeśli potrzebny odsyłacz (oba muszą być spójne).
- Modify: `kit/modules/core.json` → `files` += `".claude/skills/**"`.
- Docs: `docs/11-praca-z-kitem.md` (skille, Task Router, uprawnienia), `docs/decyzje.md` (D52: skille w projekcie, nie w pluginie; odrzucone: plugin wspólny dla wszystkich projektów Web Amigos — wersjonowanie niezależne od kitu i brak `wa kit sync`).

**Treść skilli** (format jak w Ragenie: frontmatter `name`, `description` z wyzwalaczami po polsku i angielsku; treść po polsku, zwięzła, uporządkowana według tego, co realnie się psuje; tylko fakty sprawdzone w repo):
- `wa-code-review`: najpierw `npm run verify`; potem to, czego bramka nie sprawdzi: `getOrgContext()`/`requireModuleAccess()` i filtr `organizationId`; kontrakt trybu serwisowego (`assertServiceModeConfirmed`, `useServiceModeAction().run`); `withoutTenantScope` tylko z powodem i tylko dla świadomego odczytu między organizacjami (Task 2 wprowadza tę nazwę); pliki generowane i regiony `wa:*`; moduł nie edytuje rdzenia; testy pisane przez innego agenta, wartości oczekiwane jako literały; wpisy `allowed` tylko od człowieka; `name` klasy błędu napisem; i18n w obu językach; brak komentarzy.
- `wa-upgrade-dependency`: kolejność (changelog → podbicie → `npm run verify` → `npm run test:integration` → `npm run test:e2e`); biblioteki z własnymi tabelami (better-auth, Prisma) wymagają e2e logowania i sprawdzenia migracji/`schemaRelations`; Next.js przez codemody; `npm audit`; podbicie w kicie vs w projekcie (`wa kit sync`). Lekcja z Ragena: better-auth 1.4 → 1.7 przeszło testy jednostkowe i build, a zepsuło logowanie, co złapały dopiero e2e.
- `wa-new-module`: wybór funkcja projektu (`projectModules`) vs moduł kitu; kroki według `docs/09-nowy-modul.md` i `docs/09b-implementacja-i-bramki.md` (repo kitu); `defineModule`, `requireModuleAccess`, `npm run wa -- generate`, migracja, test izolacji dwóch organizacji, guard organizacji obejmuje nowy model automatycznie.
- Odsyłacze do `docs/` w skillach dotyczą repo `webamigos/wa-kit` (w projekcie `docs/` nie istnieje). Pisz je jako „`docs/09-nowy-modul.md` w repo `webamigos/wa-kit`”.

**Task Router w `AGENTS.md`:** tabela „Zadanie → gdzie patrzeć” z wierszami co najmniej: nowa funkcja/moduł, zapytanie lub komenda na danych organizacji, odczyt między organizacjami (`withoutTenantScope`), tryb serwisowy, auth i role, migracja Prismy, zmienna środowiskowa, i18n, mail, pliki (`uploads`), klucze API, dziennik zdarzeń, podbicie zależności, testy i mutacje, recenzja zmiany. Każda komórka wskazuje plik repo, dokument w repo kitu albo skill. Usuń z innych sekcji odsyłacze, które router zastępuje, tak żeby `AGENTS.md` nie urósł o więcej niż ok. 3 KB.

**`permissions.allow`:** `Bash(npm run verify)`, `Bash(npm run lint)`, `Bash(npm run typecheck)`, `Bash(npm test)`, `Bash(npm run test:*)`, `Bash(npm run wa -- generate)`, `Bash(npx vitest run *)`, `Bash(npx tsc --noEmit*)`, `Bash(git status*)`, `Bash(git diff*)`, `Bash(git log*)`, `Bash(git show*)`. Sprawdź składnię wzorców w dokumentacji Claude Code (`https://docs.claude.com/en/docs/claude-code/settings`) i dopasuj do niej.

**Zachowania:**
- `.claude/settings.json` jest poprawnym JSON-em; `hooks.PreToolUse` jest identyczne z wersją sprzed zmiany (`node --test .claude/hooks/*.test.mjs` przechodzi).
- `permissions.allow` nie zawiera `git push`, `git reset`, `rm`, `prisma migrate`, `docker`, `npm install`.
- Każda komenda `npm run …` i każda ścieżka repo cytowana w `AGENTS.md` i skillach istnieje (sprawdzi to test z Task 1 po integracji; tu sprawdź ręcznie `grep` i wymień w raporcie).
- `wc -c AGENTS.md` ≤ 31 744.

**Mutacje do zabicia:** nie dotyczy (bez kodu produkcyjnego).

- [ ] Step 1: skille.
- [ ] Step 2: Task Router i porządki w `AGENTS.md`/`CLAUDE.md`.
- [ ] Step 3: `permissions`.
- [ ] Step 4: `core.json` `files`, `npm run wa -- kit sync && npm run wa -- generate`.
- [ ] Step 5: dokumentacja i D52, `npm run verify`. Commit `feat(core): add project skills, task router and permission allowlist`.

---

### Task 4: Integracja (koordynator)

- Scal gałęzie Task 1–3 do `feat/harness-from-ragen` (kolejność: 2, 3, 1 — testy architektury na końcu, żeby sprawdziły router i dokumentację guardu).
- `kit/modules/core.json` `version` `0.5.3` → `0.6.0`; `kit/modules/api-keys.json` `0.1.0` → `0.1.1`; `kit/modules/uploads.json` `0.2.2` → `0.2.3`; `npm run wa -- kit sync && npm run wa -- generate && git diff --exit-code`.
- `npm run verify`, `npm run verify --prefix kit/cli`, `npm run test:integration`, `npm run test:mutation:gate`, `npm run test:e2e`.
- `docs/16b-rozwoj-kitu.md` i `docs/README.md`: nowe wersje.
- Raport dla Patryka: co weszło, propozycje `allowed`, niesprawdzone, faza 2.
