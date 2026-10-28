# wa-kit — starter projektów Web Amigos

Data: 2026-10-26 · Status: zaakceptowany przez Jakuba (2026-10-26)

## 1. Po co

Każdy nowy projekt Web Amigos startuje od ręcznego wyciągania kodu z poprzednich repo: auth, users, admin, maile, i18n, logowanie, CI, Docker, Railway, często organizacje, API keys, audit log, upload, worker. Analiza 20 repo z `webamigos` (X 2026) pokazuje, że stack i moduły są niemal identyczne (Next.js 15/16, Prisma, better-auth w 13–14 repo; te same modele `User/Session/Account/Verification` w 14 repo; te same trasy `sign-in/sign-up/forgot-password/reset-password/initial-account`).

Cel: **jedna komenda tworzy nowy, działający projekt z rdzeniem i wybranymi modułami**, zbudowany z kodu, który już działa produkcyjnie (company-dashboard-app, justnails-app).

Inspiracja: OpenMercato (`create-mercato-app`, lista `enabledModules`, jednolita anatomia modułu, „eject”). Świadomie bierzemy tylko pomysł, nie architekturę — patrz anty-cele.

Poprzednia próba, GatoJS (XI 2025, Nx + generator `preset`), umarła, bo nie było wiadomo, co do niej przenieść. Ten dokument zaczyna od inwentarza tego, co się realnie powtarza.

## 2. Cele, non-goals, anty-cele

**Cele**
- `create-wa-app <nazwa>` → repo, w którym po `docker compose up` + `prisma migrate dev` + `npm run dev` można zalogować się na konto admina utworzone przez CLI. Czas od komendy do zalogowania: < 10 min.
- Moduły opcjonalne włączane przy tworzeniu i dodawane później (`wa add`), bez ręcznego wpinania w schemat, nawigację, tłumaczenia, env.
- Kod modułów trafia do projektu jako zwykły kod — projekt może go dowolnie zmieniać.
- Możliwość ściągania poprawek z kitu do projektu (`wa update`) dzięki zapisanej wersji bazowej.
- Kit sam testuje każdą kombinację modułów w CI, żeby nie zgnił.

**Non-goals (teraz)**
- Migracja istniejących projektów (pgm, justnails, ragen) na kit. Możliwa decyzja w przyszłości — architektura nie może jej blokować, ale v1 jej nie wspiera.
- RagenAI (inna architektura, własne `create-ragen-app`).
- Moduły v2: OAuth/MCP provider, AI chat + ai-usage, billing/subskrypcje, KSeF/Fakturownia, eksport Excel.
- Aplikacje mobilne, strony Astro, slajdy.

**Anty-cele (porażka, nawet jeśli działa)**
- Kit staje się frameworkiem: DI, runtime plugin loading, system overrides jak w OpenMercato. Moduł to katalog kodu, nie paczka z extension points.
- Moduły jako paczki npm wymagające wersjonowania i publikacji przy każdej zmianie.
- Składanie projektu przez runtime feature flagi (`FEATURE_X=true`) — w projekcie jest tylko kod modułów, które wybrano.
- Wygenerowany projekt wygląda/działa inaczej niż nasze obecne projekty (inna struktura, inne konwencje). Ma wyglądać jak justnails/company-dashboard, tylko bez domeny klienta.
- Kit, którego nikt nie aktualizuje: po pół roku gorszy niż ostatni projekt.

## 3. Zakres v1

### Rdzeń (zawsze)
Źródło: justnails-app i company-dashboard-app (nowa linia: `src/features/*`, `src/shared/*`, `proxy.ts`, Next 16).

- Next.js 16 (App Router), TypeScript, Tailwind 4 + shadcn (`components.json`), lucide, sonner, next-themes
- Prisma 7 + `@prisma/adapter-pg`, Postgres; zod, react-hook-form
- `auth`: better-auth (email + hasło, plugin `admin` z rolami jak w `justnails-app/src/shared/lib/auth`), formularze i trasy: `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `set-password`, `change-password`; pierwszy admin przez `npm run admin:create` (sekcja 9)
- `organizations` (w rdzeniu, sekcja 3.1): better-auth plugin `organization`, modele `Organization/Member/Invitation`, aktywna organizacja w sesji, zaproszenia mailem, `accept-invitation/[id]`, zarządzanie członkami, role org. Źródło: company-dashboard-app (`shared/lib/auth/index.ts`, `org-access.ts`)
- `users` (lista, zaproszenie/utworzenie, role, impersonacja z pluginu admin), `account` (profil, zmiana hasła)
- i18n: next-intl, `src/i18n/{routing,request,config}.ts`, routing `[locale]`; domyślnie `pl`, opcjonalnie `en`
- Maile: Resend + react-email (`src/app/emails`, `src/shared/lib/mailer.ts`): reset hasła, welcome/set-password
- `src/shared/lib/env.ts` (walidacja zod), `/api/healthcheck`, pino (`logger`), OpenTelemetry (`instrumentation.ts`), `security-headers`
- Layout aplikacji: `app-sidebar` czytający rejestr modułów (sekcja 4.3), dashboard placeholder
- Jakość: vitest + testing-library, Playwright (e2e auth), eslint, prettier, husky + lint-staged + commitlint, semantic-release
- CI: workflowy z justnails (`ci.yml`, `e2e.yml`, `release.yml`, `security-audit.yml`, `security-secret-scan.yml`, `workflow-lint.yml`)
- Deploy: `Dockerfile`, `docker-compose.yml` (postgres + mailpit lub odpowiednik), `railway.toml`
- `CLAUDE.md`, `AGENTS.md`, `.coderabbit.yaml`, `.env.example`, `README.md` z instrukcją startu

### 3.1 Organizacje i tenancy (moja decyzja; Jakub nie był pewien)

Każdy projekt z kitu ma model danych multi-tenant, a UI domyślnie działa w trybie jednej organizacji.

- **Jeden poziom:** `Organization`. Bez poziomu `Tenant`, bez drzewa organizacji i bez widoków zbiorczych „dane wszystkich organizacji naraz”. Wyjątek (decyzja Jakuba 2026-10-27): globalna rola `superadmin` (Web Amigos) może wejść do dowolnej organizacji i działać w niej jak owner, zawsze w kontekście jednej organizacji; przed zmianą danych w organizacji, do której nie należy, widzi dialog-przypomnienie. Szczegóły: [docs/04b-superadmin-i-tryb-serwisowy.md](../../04b-superadmin-i-tryb-serwisowy.md), decyzje D19–D22 w [docs/decyzje.md](../../decyzje.md).
- **Dane:** każda tabela domenowa, w tym w modułach (`ApiKey`, `AuditLog`, pliki z `uploads`, joby workera), ma wymagane `organizationId` z indeksem.
- **Filtrowanie:** jawne, przez helper `getOrgContext()` (`src/shared/lib/auth/org-context.ts`), który zwraca `{ userId, organizationId, orgRole }` z sesji lub klucza API i rzuca błąd, gdy brak organizacji. Brak automatycznego filtrowania przez rozszerzenie Prisma. `CLAUDE.md` projektu wymaga, żeby zapytania domenowe szły przez `getOrgContext()`; kit ma test, że dane jednej organizacji nie są widoczne z drugiej (dla każdego modułu).
- **Role:** globalna rola użytkownika (`user`/`admin`/`superadmin`, plugin `admin`): `admin` = admin aplikacji po stronie zleceniodawcy, `superadmin` = serwis Web Amigos (impersonacja, wejście do każdej organizacji, konta superadminów nietykalne dla `admin`; impersonację dla `admin` włącza `ADMIN_IMPERSONATION=true`). Rola w organizacji (`owner`/`admin`/`member`, plugin `organization`) = uprawnienia w firmie. `defineModule({ roles })` deklaruje role organizacyjne; globalny `admin` ma dostęp do wszystkiego.
- **`MULTI_ORG`** (env, domyślnie `false`), przełącza tylko UI i przepływy, nie model danych:
  - `false`: `admin:create` zakłada jedyną organizację (`--org-name`, domyślnie nazwa projektu). Rejestracja i zaproszenia dodają użytkownika do niej. Przełącznik organizacji i tworzenie nowych organizacji są ukryte. Ekran członków działa jako „Użytkownicy”.
  - `true`: widoczny przełącznik organizacji, tworzenie organizacji, zaproszenia per organizacja. Rejestracja bez zaproszenia tworzy nową organizację z rejestrującym jako `owner`.
  - Przejście `false → true` nie wymaga migracji.
- **Aktywna organizacja** ustawiana w sesji po zalogowaniu (pierwsze członkostwo), jak w company-dashboard-app.

### Moduły opcjonalne v1

| Moduł | Zawartość | Źródło | Wymaga |
|---|---|---|---|
| `api-keys` | model `ApiKey`, generowanie/hash (SHA-256, prefiks), `api-key-auth.ts` do autoryzacji tras API, UI `api-keys-manager` | justnails-app (`shared/lib/api-keys.ts`, `features/api-keys`) | — |
| `audit-logs` | model `AuditLog`, `trackAudit()`, widok `audit-log` | justnails-app / company-dashboard-app (`features/audit-logs`) | — |
| `uploads` | `shared/lib/s3.ts`, `/api/upload`, komponent uploadu, MinIO w docker-compose | justnails-app, bended-app (`api/upload`) | — |
| `worker` | `apps/worker` (BullMQ, bull-board, rejestr jobów, otel, logger), `packages/queue`, Redis w docker-compose, `railway.worker.toml`, joby cykliczne | company-dashboard-app (`apps/worker`, `packages/queue`) | — |
| `legal` | `(legal)/regulamin`, `polityka-prywatnosci`, `polityka-cookies`, baner cookies, linki w stopce; treści jako szablony z placeholderami danych firmy | pgm-elearning, bended-app | — |

Rdzeń + wszystkie moduły nie zawierają żadnej logiki domenowej klientów (faktury, CRM, kursy itd.).

## 4. Jak działa włączanie modułów

### 4.1 Model: aplikacja referencyjna + własność plików

Kit zawiera **jedną działającą aplikację referencyjną** ze wszystkimi modułami włączonymi. Programista rozwija kit jak normalny projekt (`npm run dev`).

Każdy moduł ma manifest deklarujący, **które pliki są jego**. Tworzenie projektu = skopiowanie aplikacji referencyjnej bez plików należących do niewybranych modułów + regeneracja plików składających (4.3).

Zasada: **moduł dodaje pliki, nie edytuje plików rdzenia**. Wszystkie miejsca, w których rdzeń „wie” o modułach, to pliki generowane albo regiony między markerami, przepisywane przez `wa generate`.

### 4.2 Anatomia modułu

```
src/features/<modul>/
  module.ts            # manifest runtime (defineModule) — patrz 4.3
  contracts/           # typy, schematy zod
  components/
  services/{queries,commands}/
  i18n/{pl,en}.json    # tłumaczenia modułu, namespace = key modułu
  env.ts               # opcjonalnie: schemat zod zmiennych modułu
  auth.ts              # opcjonalnie: plugin better-auth (serwer)
  auth-client.ts       # opcjonalnie: plugin better-auth (klient)
  __tests__/
prisma/schema/<modul>.prisma
src/app/[locale]/(app)/<trasa>/**    # strony modułu
src/app/api/<trasa>/**               # trasy API modułu
kit/modules/<modul>.json             # manifest CLI (tylko w repo kitu)
```

Manifest CLI (`kit/modules/<modul>.json`), np.:
```json
{
  "name": "api-keys",
  "version": "1.0.0",
  "description": "Klucze API z hashowaniem i autoryzacją tras",
  "requires": [],
  "files": [
    "src/features/api-keys/**",
    "src/app/[locale]/(app)/api-keys/**",
    "src/shared/lib/api-keys.ts",
    "src/shared/lib/auth/api-key-auth.ts",
    "prisma/schema/api-keys.prisma"
  ],
  "dependencies": {},
  "devDependencies": {},
  "env": [{ "name": "API_KEY_PREFIX", "example": "{{projectSlug}}_live_" }],
  "schemaRelations": [{ "model": "User", "field": "apiKeys ApiKey[]" }],
  "compose": null
}
```

Rdzeń ma taki sam manifest (`kit/modules/core.json`) — dzięki temu `wa update core` działa tak samo jak dla modułu. Każdy plik aplikacji referencyjnej należy do dokładnie jednego manifestu (sprawdzane w CI).

### 4.3 Szwy (seams) — jak rdzeń widzi moduły

| Miejsce | Mechanizm |
|---|---|
| Nawigacja, uprawnienia tras, role | `src/features/<x>/module.ts` eksportuje `defineModule({ key, nav, routePrefixes, roles })`. `wa generate` tworzy `src/modules.generated.ts` importujący wszystkie manifesty. Sidebar i `canAccessPath` czytają rejestr. Wzór: `company-dashboard-app/src/shared/lib/auth/modules.ts` (`MODULE_REGISTRY` + macierz ról). |
| Schemat Prisma | Prisma multi-file schema: `prisma/schema/*.prisma`. Pola relacji zwrotnych w modelach rdzenia (np. `User.apiKeys`) są w regionie `// wa:relations:start … // wa:relations:end` w `prisma/schema/auth.prisma`, generowanym z `schemaRelations` manifestów. |
| Pluginy better-auth | `src/shared/lib/auth/plugins.generated.ts` i `auth-client-plugins.generated.ts` zbierają `features/<x>/auth.ts` / `auth-client.ts`. `auth/index.ts` rozwija tablicę pluginów. |
| Tłumaczenia | `src/i18n/request.ts` scala `src/app/messages/<locale>.json` (rdzeń) z `features/<x>/i18n/<locale>.json` przez wygenerowaną mapę importów. Namespace = `key` modułu. |
| Env | `src/shared/lib/env.ts` łączy schemat rdzenia ze schematami `features/<x>/env.ts` z rejestru. `.env.example` ma region generowany z `env` manifestów CLI. |
| Docker / Railway | Regiony markerów w `docker-compose.yml` (`# wa:services:start/end`); moduł dostarcza fragment w `kit/modules/<x>.compose.yml`. Pliki typu `railway.worker.toml` to po prostu pliki modułu. |
| Audit z innych modułów | Rdzeń ma `src/shared/lib/audit.ts` z `trackAudit()` — no-op, dopóki moduł `audit-logs` nie zarejestruje implementacji w rejestrze. Inne moduły mogą wołać `trackAudit` bezwarunkowo. |
| Workspaces npm | `package.json` → `workspaces` generowane: `apps/*`, `packages/*` tylko gdy istnieją (moduł `worker`). |

Pliki generowane są commitowane w projekcie (projekt działa bez CLI), oznaczone nagłówkiem „generated by wa — nie edytuj”.

### 4.4 Wersjonowanie i aktualizacje

- Kit ma wersję (semver, tag git). Każdy moduł ma własną wersję w manifeście.
- Projekt zapisuje `.wa/kit.json`: wersja kitu, lista modułów z wersją i hashem każdego skopiowanego pliku.
- Treść bazowa plików nie jest trzymana w projekcie — CLI pobiera ją z tagu kitu zapisanego w `.wa/kit.json`.
- `wa update [modul|core]`: dla każdego pliku 3-way merge (baza = plik z wersji zapisanej, „ours” = projekt, „theirs” = nowa wersja kitu), np. przez `git merge-file`. Konflikty zostają w plikach z markerami; CLI listuje je i kończy z kodem ≠ 0. Pliki nowe w kicie są dodawane; usunięte w kicie, a niezmienione w projekcie — usuwane; usunięte, ale zmienione — zgłaszane. Na koniec `wa generate` i aktualizacja `.wa/kit.json`.
- `wa update` wymaga czystego drzewa git (żeby dało się wycofać `git checkout .`).

## 5. CLI

Jedna paczka, dwa wejścia: `create-wa-app` i `wa`.

| Komenda | Działanie |
|---|---|
| `create-wa-app <nazwa> [--modules a,b] [--locales pl,en] [--yes]` | Pyta (jeśli brak flag) o moduły i języki. Pobiera kit z tagu, kopiuje rdzeń + moduły (z zależnościami `requires`), podmienia placeholdery (`{{projectName}}`, `{{projectSlug}}`: nazwa paczki, prefiks API key, nazwy cookies, tytuły), uruchamia `wa generate`, scala `package.json` (deps modułów), zapisuje `.wa/kit.json`, `npm install`, `git init` + pierwszy commit, wypisuje kolejne kroki. |
| `wa add <modul>` | W istniejącym projekcie kitu: kopiuje pliki modułu (+ `requires`), dopisuje zależności, region env i compose, `wa generate`, `npm install`; wypisuje `npx prisma migrate dev --name add-<modul>`. Przerywa, jeśli plik docelowy już istnieje. |
| `wa remove <modul>` | Usuwa pliki modułu niezmienione względem bazy; zmienione — zgłasza i nie usuwa bez `--force`. Odmawia, gdy inny moduł go wymaga. `wa generate`. |
| `wa update [modul\|core]` | Jak w 4.4. |
| `wa diff <modul\|core>` | Różnice projekt ↔ najnowsza wersja kitu (podgląd przed `update`). |
| `wa generate` | Przepisuje pliki generowane i regiony markerów na podstawie modułów obecnych w `.wa/kit.json`. Idempotentne. |
| `wa list` | Moduły dostępne, zainstalowane, ich wersje. |

Migracje: kit nie dostarcza katalogu `prisma/migrations`. Nowy projekt robi `prisma migrate dev --name init` po złożeniu; `wa add` każe utworzyć migrację modułu.

## 6. Repozytorium kitu

> Zmiana przy planowaniu (2026-10-26): aplikacja referencyjna leży w katalogu głównym repo, nie w `app/` — ma identyczny układ jak wygenerowany projekt, a zagnieżdżone workspaces npm (`apps/worker` w `app/`) nie działają. Pliki tylko dla kitu (`packages/cli`, `kit/`, `docs/`) CLI pomija przy kopiowaniu.

```
wa-kit/
  (root)                  # aplikacja referencyjna (rdzeń + wszystkie moduły), uruchamialna
  kit/
    modules/*.json        # manifesty CLI (core + moduły)
    modules/*.compose.yml # fragmenty docker-compose
  packages/cli/           # create-wa-app + wa
  docs/
  .github/workflows/
```

Jak się rozwija kit:
- Zmiana w module = zwykła zmiana w `app/` + podbicie `version` modułu w manifeście.
- Poprawka znaleziona w projekcie klienta wraca do kitu jako PR (proces, nie automat). `CLAUDE.md` projektów wygenerowanych mówi, że kod z `.wa/kit.json` pochodzi z kitu i poprawki ogólne należy zgłaszać do `wa-kit`.

## 7. Testy i CI kitu

- Unit/komponentowe testy aplikacji referencyjnej (przenoszone z repo źródłowych razem z kodem).
- Testy CLI: kopiowanie wg manifestów, generate (snapshoty), merge w `update` (przypadki: brak zmian, zmiana tylko w projekcie, tylko w kicie, konflikt, plik usunięty).
- **Macierz składania** w CI: `core`, każdy moduł osobno (+ `requires`), `all`. Dla każdej: `create-wa-app --yes` do katalogu tymczasowego → `npm install` → `prisma validate` → `prisma migrate dev` na Postgres z service container → `lint`, `typecheck`, `test`, `build`.
- E2E Playwright na kombinacji `all` i `core`: ścieżka z sekcji 9 (admin:create → logowanie → zaproszenie → set-password), reset hasła, oraz oba tryby `MULTI_ORG` (przy `true`: druga organizacja nie widzi danych pierwszej).
- Test „każdy plik ma właściciela”: każdy plik w `app/` (poza ignorowanymi) należy do dokładnie jednego manifestu.
- Test `add`/`remove`: `core` + `wa add <modul>` daje ten sam wynik co `create-wa-app --modules <modul>`.

## 8. Ograniczenia

- npm + `package-lock.json` (jak w źródłowych repo), Node z `.nvmrc`.
- Repo kitu prywatne w org `webamigos`; CLI musi działać dla każdego, kto ma dostęp do org, bez dodatkowej konfiguracji poza zalogowanym `gh`/git.
- Kod modułów przenoszony z działających repo, nie pisany od zera. Usuwamy logikę domenową i nazwy klientów (np. prefiks `cba_live_` → `{{projectSlug}}_live_`).
- Wersje zależności: jak w company-dashboard-app/justnails-app w momencie przenoszenia.

## 9. Decyzje

**Ustalone z Jakubem**
- Starter na wzór OpenMercato, ale mniejszy; uruchamiany komendą; korzysta z istniejącego kodu.
- Zakres to więcej niż auth.
- Kit dla przyszłych projektów; migracja istniejących — możliwa kiedyś, nie teraz.
- Zakres v1: rdzeń + `api-keys`, `audit-logs`, `uploads`, `worker`, `legal`; reszta w v2. (Organizacje przeniesione do rdzenia — patrz moje decyzje.)
- Nowe repo `wa-kit`; nie budujemy na `gatojs` (Nx, brak kodu do zachowania).
- Pierwszy admin przez komendę CLI, jak w OpenMercato; `sign-up` bez specjalnej logiki admina.

**Moje decyzje (do weryfikacji)**
- Model kopiowania kodu + `.wa/kit.json` + 3-way merge zamiast paczek npm.
- Aplikacja referencyjna z manifestami własności plików zamiast osobnych katalogów modułów.
- Szwy przez pliki generowane i regiony markerów; rejestr modułów wzorowany na `company-dashboard-app/src/shared/lib/auth/modules.ts`.
- Prisma multi-file schema; brak commitowanych migracji w kicie.
- Nazwy: repo `wa-kit`, komendy `create-wa-app` i `wa`.
- `wa remove` i `wa diff` w v1 (tanie, a domykają cykl życia modułu).
- **Pierwszy admin przez komendę CLI (ustalone z Jakubem — szczegóły implementacji moje):** brak strony `initial-account` i brak specjalnej logiki w `sign-up`. Rdzeń ma skrypt `npm run admin:create -- --email <email> [--password <hasło>] [--name <imię>] [--org-name <nazwa>]` (`tsx scripts/admin-create.ts`), który tworzy użytkownika z rolą `admin` przez API better-auth oraz (jeśli nie istnieje) pierwszą organizację z nim jako `owner`. Bez `--password` skrypt generuje losowe hasło i je wypisuje. Skrypt jest idempotentny: gdy użytkownik o tym emailu istnieje, nadaje mu rolę `admin` (po potwierdzeniu albo z `--yes`). Wartości domyślne z env: `ADMIN_EMAIL`, `ADMIN_PASSWORD`. `create-wa-app` pyta o email admina i po `prisma migrate dev` uruchamia skrypt lokalnie. Na produkcji (Railway) admin uruchamia skrypt raz, np. `railway run npm run admin:create -- --email …`; README to opisuje. Publiczny `sign-up` steruje `AUTH_PUBLIC_SIGNUP` (domyślnie `false`; to ustawienie działania aplikacji, nie składania projektu) i zawsze tworzy zwykłego `user`. Zaproszeni użytkownicy ustawiają hasło przez `set-password`. E2E rdzenia: `admin:create` → logowanie admina → zaproszenie użytkownika → set-password → logowanie; rejestracja przy `AUTH_PUBLIC_SIGNUP=false` jest odrzucana, przy `true` tworzy `user`.
- **Organizacje w rdzeniu, `MULTI_ORG` przełącza tylko UI** (sekcja 3.1). Jakub nie był pewien; decyzja moja, uzasadnienie: 7 z 14 projektów z auth używa organizacji, a dodanie tenancy do działającej aplikacji jest dużo droższe niż kolumna `organizationId` od początku.
- **Role:** dwa poziomy, opisane w sekcji 3.1.
- **Worker:** źródłem jest company-dashboard-app (`apps/worker`, `packages/queue`). Worker może importować z aplikacji (`@/shared/lib/*`, `@/features/*`), tak jak w źródle. Dlatego `src/shared/lib/{prisma,logger,mailer,env}.ts` to stabilny kontrakt rdzenia, którego `wa update core` nie łamie bez podbicia wersji major. `packages/db` i `packages/jobs` z company-dashboard nie wchodzą; moduł zawiera jeden przykładowy job cykliczny (healthcheck/cleanup sesji).
- **Prisma multi-file:** repo źródłowe mają jeden `schema.prisma`; podział na pliki to część pracy przy przenoszeniu.

## 10. Do decyzji wykonawcy

- Biblioteki CLI (parser argumentów, prompty), sposób pobierania kitu z tagu (git clone/sparse checkout vs tarball przez `gh api`), dystrybucja CLI (`npx github:webamigos/wa-kit` vs GitHub Packages) — w granicach ograniczenia z sekcji 8.
- Dokładny format manifestów i nagłówków plików generowanych.
- Kolejność przenoszenia modułów i dzielenie pracy na PR-y.
- Wybór lokalnego serwera maili w docker-compose.
