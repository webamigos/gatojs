# AGENTS.md

Instrukcje dla agentów (Claude Code, Codex, Cursor, Copilot) pracujących w tym repozytorium.
`CLAUDE.md` zawiera twarde reguły i importuje ten plik — oba muszą być spójne.

## Co to jest

Aplikacja Next.js złożona z **wa-kit**: rdzeń (auth, organizacje, użytkownicy, konto, dashboard)
plus moduły. Stan kitu opisuje `.wa/kit.json`.

**Kod rdzenia i modułów pochodzi z wa-kit (`.wa/kit.json`); poprawki ogólne zgłaszaj do repo `webamigos/gatojs`.**
Zmiany specyficzne dla projektu rób lokalnie; poprawki, które przydadzą się innym projektom, wysyłaj jako PR do kitu.

Dokumentacja kitu: https://docs.gatojs.com (po angielsku). Opisuje najnowszą wersję kitu; wersję projektu podaje `.wa/kit.json`.

## Kolejność priorytetów

poprawność → utrzymywalność → czytelność → spójność → wydajność → szybkość dostarczenia.

## Task Router

Zadanie → gdzie patrzeć. Strony dokumentacji są pod https://docs.gatojs.com; skille w `.claude/skills/`.

| Zadanie | Gdzie patrzeć |
| --- | --- |
| Nowa funkcja albo moduł | skill `wa-new-module`; `projectModules` w `.wa/kit.json`; https://docs.gatojs.com/guides/build-a-feature, https://docs.gatojs.com/guides/finish-a-feature |
| Query lub komenda na danych organizacji | `src/shared/lib/auth/org-context.ts`; „Dane i organizacje” niżej; https://docs.gatojs.com/concepts/organizations |
| Odczyt między organizacjami | `withoutTenantScope(reason, fn)` z `src/shared/lib/tenant-scope/`, tylko z powodem; https://docs.gatojs.com/concepts/organizations |
| Tryb serwisowy | `src/shared/lib/auth/service-mode.ts`, `src/shared/components/service-mode/use-service-mode-action.tsx`; https://docs.gatojs.com/concepts/superadmin-and-service-mode |
| Auth i role | `src/shared/lib/auth/`; https://docs.gatojs.com/concepts/auth-and-roles |
| Migracja Prismy | `prisma/schema/`; https://docs.gatojs.com/guides/database-and-migrations |
| Zmienna środowiskowa | `packages/env/` (`@gatojs/env`: schemat rdzenia, `httpUrl()`, `blankAsUndefined()`, `allOrNone`, `requiredForProvider`), `src/env.ts` (`import { env } from "@/env"`), `src/features/<x>/env.ts`, `.env.example`; https://docs.gatojs.com/configuration/environment-variables |
| i18n | `src/app/messages/`, `src/features/<x>/i18n/`; https://docs.gatojs.com/guides/i18n |
| Mail | `src/shared/lib/mailer.ts`, `src/app/emails/`; https://docs.gatojs.com/guides/email |
| Pliki (moduł `uploads`) | https://docs.gatojs.com/modules/uploads |
| Klucze API (moduł `api-keys`) | https://docs.gatojs.com/modules/api-keys |
| Dziennik zdarzeń | `trackAudit` w `src/shared/lib/audit.ts`; moduł `audit-logs`: https://docs.gatojs.com/modules/audit-logs |
| Pliki generowane, CLI `wa` | `npm run wa -- generate`; https://docs.gatojs.com/concepts/module-registry, https://docs.gatojs.com/cli/overview |
| Podbicie zależności | skill `wa-upgrade-dependency` |
| Testy i mutacje | „Testy” niżej; `.claude/agents/test-writer.md`, `.claude/agents/test-reviewer.md`, `mutation-gate.json`; https://docs.gatojs.com/guides/testing, https://docs.gatojs.com/guides/ai-agents |
| Recenzja zmiany | skill `wa-code-review` (`.claude/skills/wa-code-review/SKILL.md`, zwykły Markdown: czyta go każdy agent i człowiek); CodeRabbit jest opcjonalny, nie jest bramką |

## Komendy

```bash
npm run verify               # bramka: lint → typecheck → test → build → test hooków
npm run dev                  # serwer deweloperski (port 3000)
npm run build                # build produkcyjny (output: standalone)
npm test                     # Vitest (src/**, scripts/**)
npm run test:e2e             # build + Playwright (wymaga docker compose up -d)
npm run test:integration     # Vitest na prawdziwym Postgresie (INTEGRATION_DATABASE_URL, baza *_test)
npm run test:mutation        # Stryker na logice (incremental), raport w reports/mutation/
npm run test:mutation:integration   # Stryker pod testami integracyjnymi (wymaga bazy)
npm run test:mutation:gate   # bramka plików krytycznych (mutation-gate.json) na raportach Strykera
npm run test:mutation:task -- src/a.ts,src/b.ts   # mutacje tylko w plikach zadania
npm run admin:create -- --email <email>   # pierwszy admin + pierwsza organizacja
npm run wa -- generate   # odśwież pliki generowane
npm run wa -- update <wersja>   # przenosi projekt na nowszą wersję kitu (wa-kit)
npx prisma migrate dev --name <nazwa>     # nowa migracja
```

## Twarde reguły

### Dane i organizacje

- **Zapytania do danych domenowych zawsze przez `getOrgContext()` i filtr `organizationId`.**
  `getOrgContext()` (`src/shared/lib/auth/org-context.ts`) zwraca `{ userId, organizationId, orgRole, userRole, serviceMode }`
  z sesji i rzuca `NoOrganizationError`, gdy użytkownik nie ma aktywnej organizacji. Nie ma automatycznego
  filtrowania w Prisma — każde zapytanie domenowe filtruje po `organizationId` jawnie. Guard w runtime
  (`src/shared/lib/tenant-scope/`) rzuca `TenantScopeError` przy zapytaniu bez filtra organizacji na modelu
  z `organizationId` (poza `Member`/`Invitation`); świadomy odczyt między organizacjami tylko przez
  `withoutTenantScope(reason, fn)`.
- Strony modułów chroni `requireModuleAccess(key)` (`src/shared/lib/auth/require-module-access.ts`), który czyta
  rejestr modułów. Ukrycie pozycji w nawigacji nie jest ochroną.
- Każda akcja serwerowa sama sprawdza uprawnienia (akcja to endpoint POST — nie przechodzi przez layout strony).
- **Komendy na danych organizacji potwierdzają tryb serwisowy.** Kontrakt:
  - sygnatura `(input: unknown, confirmation?: unknown)`;
  - zaraz po `getOrgContext()` albo `requireModuleAccess()` wywołanie
    `assertServiceModeConfirmed(context, confirmation)` (`src/shared/lib/auth/service-mode.ts`), przed pierwszym
    dostępem do Prismy;
  - w trybie serwisowym (`serviceMode: true`) bez potwierdzenia `{ serviceModeConfirmed: true, organizationId }`
    aktywnej organizacji komenda zwraca błąd „Potwierdź zmianę w trybie serwisowym”; poza trybem serwisowym
    przechodzi tylko brak potwierdzenia albo potwierdzenie aktywnej organizacji (nieaktualna karta po przełączeniu
    organizacji dostaje błąd);
  - UI woła komendę przez `useServiceModeAction().run(command, input)`
    (`src/shared/components/service-mode/use-service-mode-action.tsx`) i renderuje zwrócony `dialog`;
    po „Anuluj” `run` zwraca `null`. Zapis poza akcją serwerową (`fetch` do route handlera) bierze potwierdzenie
    z `requestConfirmation()` tego samego hooka i przekazuje je serwerowi; `null` oznacza „Anuluj”. Moduły nie piszą własnego dialogu. Komenda wołana z UI bezpośrednio
    w trybie serwisowym kończy się błędem, a tego żaden test nie wychwyci.

### Bez komentarzy w kodzie

- W plikach `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` nie piszemy komentarzy. Kod ma się tłumaczyć nazwami.
- Dozwolone wyłącznie: `// WHY: …` (maks. 3 linie) dla nieoczywistego powodu oraz dyrektywy narzędzi
  (`@ts-expect-error`, `eslint-disable…`, `@vitest-environment`, `prettier-ignore`, shebang).
- Hook `.claude/hooks/block-comments.mjs` (PreToolUse na `Edit|Write`) blokuje inne komentarze.

### Moduły i pliki generowane

- Moduł nie edytuje plików rdzenia. Jedyne miejsca łączenia: `src/modules.generated.ts`,
  `src/modules.client.generated.ts` i regiony markerów:
  - `prisma/schema/auth.prisma`, `prisma/schema/organizations.prisma` — `// wa:relations:start/end`
  - `.env.example` — `# wa:modules:start/end`
  - `docker-compose.yml` — `# wa:services:start/end`
- Plików generowanych i regionów nie edytuj ręcznie. Uruchom `npm run wa -- generate`. CI sprawdza, że po `generate` nie ma diffu.
- Funkcje napisane w projekcie (nie pochodzące z kitu) mają wpis w `projectModules` w `.wa/kit.json`: samo
  `manifest` (z `src/features/<x>/**` w `files`), bez wersji i hashy. `wa generate` rejestruje je po modułach kitu;
  `wa kit sync` ich nie rusza. Testy rdzenia porównują rejestr tylko z modułami rdzenia (`src/test/core-modules.ts`),
  więc nowa funkcja nie wymaga zmiany plików rdzenia.
- Każdy moduł: `src/features/<x>/module.ts` z `export default defineModule({...})`; opcjonalnie `env.ts`
  (`envSchema`), `auth.ts` (`authPlugin`), `auth-client.ts` (`authClientPlugin`), `i18n/{pl,en}.json`.

### Struktura

```
src/features/<x>/
├── components/          React + __tests__/
├── contracts/           typy i schematy Zod (*.types.ts, *.schemas.ts)
└── services/
    ├── commands/        zapisy — "use server", zwracają OperationResult<T>
    └── queries/         odczyty
src/shared/{lib,components,utils,types,config}
src/components/ui        shadcn (base-ui)
src/app/[locale]/(auth|app)
```

- Logika biznesowa nie trafia do komponentów, `page.tsx`, `layout.tsx` ani route handlerów.
- Prisma tylko w commands/queries/services, nigdy w UI.
- Każde wejście z zewnątrz walidujemy Zod; schematy w `contracts/`.
- Akcje serwerowe: walidacja → autoryzacja → wywołanie serwisu; zwracają `OperationResult<T>`
  i obsługują błędy przez `handleCommandError()`.
- Najpierw szukaj istniejącej implementacji (DRY). Nie wprowadzaj nowych wzorców bez potrzeby.
- Bez zagnieżdżonych ternary (`no-nested-ternary`), bez cichych `catch {}`, bez `any`.
- `name` klasy błędu ustawiaj napisem (`this.name = "KeyLimitError"` albo pole `name = "KeyLimitError"`); ESLint odrzuca
  `this.constructor.name`, `new.target.name` i `KeyLimitError.name`, bo build minifikuje nazwy klas.
- Klasa dziedzicząca wprost po `Error` ma własne `name`: pole `name = "KeyLimitError"` albo `this.name = "KeyLimitError"`
  jako osobna instrukcja konstruktora (nie w `if` ani w funkcji). ESLint zgłasza klasę bez niego poza testami, `e2e/`
  i plikami `*.d.ts`. Własne selektory `no-restricted-syntax` dopisuj do `restrictedSyntax` w `eslint.config.mjs`,
  bo obiekt konfiguracji dla tych plików powtarza tę listę.

### Auth

- better-auth z pluginami `admin` i `organization`. Role globalne: `user | admin | superadmin`; role w organizacji:
  `owner | admin | member`.
- `superadmin` to serwis Web Amigos: ma wszystko, co `admin`, plus impersonację (poza innymi superadminami).
  Admin nie wykona na koncie superadmina żadnej akcji z `ADMIN_TARGET_PATHS` (rola, ban, usunięcie, hasło, email,
  impersonacja, sesje) ani nie nada roli `superadmin` (hook `before` na `/admin/*`). `ADMIN_IMPERSONATION=true`
  pozwala adminowi podszyć się pod zwykłego `user`.
- Superadmin może wejść do każdej organizacji, zawsze jednej naraz (bez widoków zbiorczych). Bez członkostwa
  `getOrgContext()` zwraca `orgRole: "owner"` i `serviceMode: true` (tryb serwisowy): layout pokazuje pasek
  „Tryb serwisowy: <nazwa>”, a każda zmiana danych wymaga potwierdzenia w dialogu (kontrakt w „Dane i organizacje”).
- Rejestracja przechodzi przez bramkę serwerową: przy `AUTH_PUBLIC_SIGNUP=false` tylko z ważnym `invitationId`.
- `MULTI_ORG=false` — jedna organizacja (najstarsza); `MULTI_ORG=true` — każda rejestracja tworzy własną
  organizację, widoczny jest `OrgSwitcher`.
- Pierwszy admin: `npm run admin:create -- --email <email>` (bez `--password` hasło jest generowane i wypisane raz).
  `--role superadmin` zakłada konto serwisowe (domyślnie `admin`); skrypt nie obniża roli istniejącego konta.

### i18n

- next-intl, domyślnie `pl`, dostępny `en` (`localePrefix: "as-needed"`).
- Teksty modułu w `src/features/<x>/i18n/{pl,en}.json`; wspólne w `src/app/messages/`.

### Mail

- `SMTP_URL` (dev/e2e, mailpit z `docker-compose.yml`) ma pierwszeństwo, potem `RESEND_API_KEY`,
  bez obu mail jest tylko logowany. Na produkcji wymagany `RESEND_API_KEY`.

## Testy

- Unit/integracyjne: Vitest + Testing Library, pliki w `__tests__/` obok kodu.
- E2E: Playwright w `e2e/`. Dwa projekty z osobnymi serwerami (`node .next/standalone/server.js`):
  `core-auth` (port 3000, `MULTI_ORG=false`, `AUTH_PUBLIC_SIGNUP=false`) i
  `multi-org` (port 3001, `MULTI_ORG=true`, `AUTH_PUBLIC_SIGNUP=true`).
  `globalSetup` resetuje bazę (tylko gdy jej nazwa kończy się na `_e2e`) i uruchamia `admin:create`. Maile czyta `getLastMail(to)` z API mailpit.
- Bugfix = test, który bez poprawki nie przechodzi.
- Integracyjne: `*.integration.test.ts`, uruchamiane przez `npm run test:integration` (osobny config
  `vitest.integration.config.ts`, nie wchodzą do `npm test`). Baza z `INTEGRATION_DATABASE_URL`
  (domyślny adres w `src/test/integration/database-url.ts`, baza `<nazwa_projektu>_test`); nazwa musi kończyć się
  na `_test`, bo `resetDatabase()` czyści tabele. Lokalnie: `docker compose up -d db`. Pomocniki w
  `src/test/integration/`. Każde nowe query lub komenda na danych domenowych dostaje test izolacji:
  dwie organizacje, odczyt i zapis z kontekstem jednej nie dotyka danych drugiej.
- Test architektury `src/__tests__/server-entrypoints-guard.test.ts` wymaga, żeby każda eksportowana
  funkcja w pliku `"use server"` i w `services/queries/` wywołała guard sesji (`getOrgContext`,
  `requireModuleAccess`, `getAdminUserOrNull`, …) przed dostępem do Prismy. Wyjątek dopisujemy do
  `UNGUARDED_ALLOWED` z uzasadnieniem.
- Ten sam test wymaga, żeby każda eksportowana funkcja w pliku `"use server"`, która woła `getOrgContext` albo
  `requireModuleAccess` (wprost, przez lokalny helper, alias importu albo stałą modułu), wołała też
  `assertServiceModeConfirmed` przed pierwszym dostępem do Prismy. Analiza jest składniowa: łapie pomyłki,
  nie celowe maskowanie. Świadome ograniczenia:
  - kolejność sprawdzana jest tylko względem Prismy; assert wołany po serwisie z innego modułu przechodzi,
    więc wołaj go od razu po pobraniu kontekstu;
  - reguła obejmuje też akcje `"use server"` tylko do odczytu i nie ma dla niej mapy wyjątków;
  - inline server actions (`"use server"` w ciele funkcji) nie podlegają żadnej regule testu;
  - analiza obejmuje tylko lokalne funkcje najwyższego poziomu: kontekst lub Prisma w serwisie z innego modułu
    albo w helperze będącym metodą obiektu są niewidoczne;
  - assert w martwej gałęzi, połknięty w `try/catch` albo wołany warunkowo liczy się jak wywołany; kolejność
    zdarzeń jest składniowa, bez przepływu sterowania;
  - podszycie: lokalna deklaracja `assertServiceModeConfirmed` lub guardu, wywołanie przez właściwość obcego
    obiektu (`fake.getAdminUserOrNull()`), mutacja obiektu potwierdzenia w miejscu
    (`confirmation.organizationId = …`, `Object.assign`), przypisanie przez destrukturyzację,
    przesłonięcie nazwy parametru;
  - aliasy inne niż `const x = <identyfikator>` na poziomie modułu (destrukturyzacja, `let` przypisane później,
    parametr) oraz Prisma re-eksportowana przez moduł inny niż `@/shared/lib/prisma`.

### Testy, które próbują złamać kod

Test napisany przez autora kodu, po kodzie, odtwarza jego założenia i przechodzi trywialnie
(uzasadnienie i źródła: `docs/superpowers/notes/2026-10-27-adversarial-testing-research.md`).

- **Plan:** każde zadanie ma sekcje „Zachowania” (wejście → oczekiwany wynik jako literał) i
  „Mutacje do zabicia” (np. „usunięcie filtra `organizationId`”, „rola `member` dostaje dostęp”).
- **Tester ≠ implementer.** Testy zadania pisze subagent `test-writer` (`.claude/agents/test-writer.md`)
  z planu i sygnatur, przed implementacją; widać ich czerwony przebieg.
- **Testy są tylko do odczytu dla implementera.** Przed jego uruchomieniem orkiestrator zapisuje
  `implement` do `.superpowers/phase` w kopii roboczej implementera (w jego worktree, nie w głównej kopii),
  a hook `.claude/hooks/protect-tests.mjs` blokuje edycję `__tests__/`, `*.test.*`, `*.spec.*` i `e2e/`.
  Po implementacji orkiestrator usuwa plik. Błędny test implementer zgłasza, zamiast go poprawiać.
- **Wartość oczekiwana to literał** albo wartość ze specyfikacji. Nie liczymy jej kodem produkcyjnym,
  kopią jego algorytmu, pętlą ani helperem.
- **Granice mają testy negatywne:** niepoprawne wejście, brak sesji, cudza organizacja, za niska rola,
  awaria zależności.
- **Mockujemy tylko I/O.** Nie mockujemy modułu, który zawiera testowaną regułę bezpieczeństwa,
  i nie asertujemy na samym mocku.
- **Czyste funkcje z niezmiennikiem** (parsery, serializacja, normalizacja, slug) dostają `test.prop`
  z `@fast-check/vitest`.
- **Recenzent testów** (`.claude/agents/test-reviewer.md`) uruchamia
  `npm run test:mutation:task -- <pliki zadania>`. Każdy przeżyły mutant w zmienionych liniach to luka
  (wraca do testera), mutant równoważny (z uzasadnieniem) albo tekst komunikatu/logu. Logika
  bezpieczeństwa (auth, organizacje, role, guardy, rejestracja) nie może mieć luk.
- Pełny przebieg: `npm run test:mutation` (Stryker, tryb incremental, raport w `reports/mutation/`).
  Nie jest częścią `npm run verify` ani automatycznego CI: mutacje uruchamiamy lokalnie (recenzent przy każdym
  zadaniu, pełny przebieg przed releasem kitu). `.github/workflows/mutation.yml` działa tylko po ręcznym
  uruchomieniu (`workflow_dispatch`). Przebieg pada poniżej progu `thresholds.break` (75%, wynik bazowy 77%).
  Progu nie obniżamy, żeby przepuścić zmianę.
- **Bramka plików krytycznych** (`npm run test:mutation:gate`, `mutation-gate.json`): w plikach z listy `critical`
  (auth, organizacje, użytkownicy, bramka) każdy przeżyły mutant musi być zabity albo mieć wpis w `allowed`
  z uzasadnieniem: mutant równoważny, tylko komunikat/log albo świadoma stała konfiguracyjna. Wpisy dopisuje
  i zatwierdza człowiek w PR; agent je tylko proponuje. Nieaktualny wpis (mutant już zabity) też zatrzymuje bramkę.
  Raport integracyjny łączy się z unitowym: mutant zabity w którymkolwiek liczy się jako zabity. Wyjątki od mutacji ustawiamy w `mutate`
  w `stryker.config.json`, nie komentarzem `// Stryker disable`.

## Commity

Conventional Commits, temat małymi literami. Husky uruchamia lint-staged i commitlint.
Przed oddaniem pracy: `npm run verify`.
