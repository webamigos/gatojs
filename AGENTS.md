# AGENTS.md

Instrukcje dla agentów (Claude Code, Codex, Cursor, Copilot) pracujących w tym repozytorium.
`CLAUDE.md` zawiera twarde reguły i importuje ten plik — oba muszą być spójne.

## Co to jest

Aplikacja Next.js złożona z **wa-kit**: rdzeń (auth, organizacje, użytkownicy, konto, dashboard)
plus moduły. Stan kitu opisuje `.wa/kit.json`.

**Kod rdzenia i modułów pochodzi z wa-kit (`.wa/kit.json`); poprawki ogólne zgłaszaj do repo `webamigos/wa-kit`.**
Zmiany specyficzne dla projektu rób lokalnie; poprawki, które przydadzą się innym projektom, wysyłaj jako PR do kitu.

## Kolejność priorytetów

poprawność → utrzymywalność → czytelność → spójność → wydajność → szybkość dostarczenia.

## Komendy

```bash
npm run verify               # bramka: lint → typecheck → test → build → testy CLI → test hooków
npm run dev                  # serwer deweloperski (port 3000)
npm run build                # build produkcyjny (output: standalone)
npm test                     # Vitest (src/**, scripts/**)
npm run test:e2e             # build + Playwright (wymaga docker compose up -d)
npm run admin:create -- --email <email>   # pierwszy admin + pierwsza organizacja
npm run build -w @wa-kit/cli && npm run wa -- generate   # odśwież pliki generowane
npx prisma migrate dev --name <nazwa>     # nowa migracja
```

## Twarde reguły

### Dane i organizacje

- **Zapytania do danych domenowych zawsze przez `getOrgContext()` i filtr `organizationId`.**
  `getOrgContext()` (`src/shared/lib/auth/org-context.ts`) zwraca `{ userId, organizationId, orgRole, userRole }`
  z sesji i rzuca `NoOrganizationError`, gdy użytkownik nie ma aktywnej organizacji. Nie ma automatycznego
  filtrowania w Prisma — każde zapytanie domenowe filtruje po `organizationId` jawnie.
- Strony modułów chroni `requireModuleAccess(key)` (`src/shared/lib/auth/require-module-access.ts`), który czyta
  rejestr modułów. Ukrycie pozycji w nawigacji nie jest ochroną.
- Każda akcja serwerowa sama sprawdza uprawnienia (akcja to endpoint POST — nie przechodzi przez layout strony).

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
- Plików generowanych i regionów nie edytuj ręcznie. Uruchom `npm run wa -- generate`
  (najpierw `npm run build -w @wa-kit/cli`). CI sprawdza, że po `generate` nie ma diffu.
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

### Auth

- better-auth z pluginami `admin` i `organization`. Role globalne: `user | admin`; role w organizacji:
  `owner | admin | member`.
- Rejestracja przechodzi przez bramkę serwerową: przy `AUTH_PUBLIC_SIGNUP=false` tylko z ważnym `invitationId`.
- `MULTI_ORG=false` — jedna organizacja (najstarsza); `MULTI_ORG=true` — każda rejestracja tworzy własną
  organizację, widoczny jest `OrgSwitcher`.
- Pierwszy admin: `npm run admin:create -- --email <email>` (bez `--password` hasło jest generowane i wypisane raz).

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

## Commity

Conventional Commits, temat małymi literami. Husky uruchamia lint-staged i commitlint.
Przed oddaniem pracy: `npm run verify`.
