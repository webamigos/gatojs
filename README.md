# WA App

Aplikacja Next.js zbudowana na **wa-kit**: logowanie i zaproszenia (better-auth), organizacje
(`MULTI_ORG`), zarządzanie użytkownikami, konto, dashboard i moduły z rejestru `.wa/kit.json`.

Stos: Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui (base-ui) · Prisma 7 + PostgreSQL ·
better-auth · next-intl (pl/en) · Vitest · Playwright. Node 22 (`.nvmrc`).

Dokumentacja kitu: `docs/README.md` w repo `webamigos/wa-kit`. Opisuje najnowszą wersję kitu; wersję projektu podaje `.wa/kit.json`.

## Start

Wymagania: Node 22, npm, Docker.

```bash
npm install
docker compose up -d
cp .env.example .env
npx prisma migrate dev --name init
npm run admin:create -- --email <email>
npm run dev
```

1. `docker compose up -d` — PostgreSQL 16 (`localhost:5432`) i mailpit (UI `http://localhost:8025`, SMTP `localhost:1025`).
   Zajęty port zmienisz przez `DB_PORT`, `MAILPIT_UI_PORT`, `MAILPIT_SMTP_PORT` (wtedy popraw też `DATABASE_URL` / `SMTP_URL` w `.env`).
2. `cp .env.example .env` — ustaw `BETTER_AUTH_SECRET` (min. 32 znaki, np. `openssl rand -base64 32`).
3. `npx prisma migrate dev --name init` — tworzy pierwszą migrację i schemat bazy.
4. `npm run admin:create -- --email <email>` — tworzy administratora i pierwszą organizację.
   Bez `--password` hasło jest generowane i wypisywane raz. Opcje: `--password`, `--name`, `--org-name`, `--yes`,
   `--role admin|superadmin` (domyślnie `admin`; `superadmin` to konto serwisowe Web Amigos). Skrypt nigdy nie obniża roli.
5. `npm run dev` — aplikacja na `http://localhost:3000`. Maile (zaproszenia, reset hasła) zobaczysz w mailpit.

## Zmienne środowiskowe

| Zmienna                         | Opis                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                  | Połączenie z PostgreSQL                                                 |
| `BETTER_AUTH_SECRET`            | Sekret better-auth, min. 32 znaki                                       |
| `APP_URL`                       | Publiczny adres aplikacji (better-auth, linki w mailach)                |
| `RESEND_API_KEY`                | Klucz Resend; wymagany na produkcji                                     |
| `SMTP_URL`                      | SMTP (dev/e2e: mailpit); ma pierwszeństwo przed Resend                  |
| `EMAIL_FROM`                    | Nadawca maili                                                           |
| `AUTH_PUBLIC_SIGNUP`            | `true` — publiczna rejestracja; domyślnie `false` (tylko z zaproszenia) |
| `MULTI_ORG`                     | `true` — wiele organizacji i `OrgSwitcher`; domyślnie `false`           |
| `ADMIN_IMPERSONATION`           | `true` — admin klienta może podszyć się pod zwykłego użytkownika        |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Domyślne wartości dla `admin:create` (opcjonalne)                       |
| `LOG_LEVEL`                     | Poziom logowania                                                        |
| `OTEL_EXPORTER_OTLP_ENDPOINT`   | Eksport logów OpenTelemetry (opcjonalne)                                |

Zmienne modułów są dopisywane przez `wa generate` w regionie `# wa:modules:start/end` pliku `.env.example`.

## Komendy

```bash
npm run verify        # lint, typecheck, testy, build, turbo (zadania `test` i `typecheck` w workspace; bez pakietów nic nie robi) oraz testy hooków
npm test              # Vitest
npm run test:e2e      # build + Playwright (wymaga docker compose up -d)
npm run wa -- generate   # odśwież pliki generowane przez wa
```

### E2E

`npm run test:e2e` buduje aplikację i uruchamia dwa serwery standalone (`node .next/standalone/server.js`) z różnym env:

- projekt `core-auth` — port `E2E_CORE_PORT` (3000), `MULTI_ORG=false`, `AUTH_PUBLIC_SIGNUP=false`;
- projekt `multi-org` — port `E2E_MULTI_ORG_PORT` (3001), `MULTI_ORG=true`, `AUTH_PUBLIC_SIGNUP=true`.

`globalSetup` **czyści bazę** wskazaną przez `DATABASE_URL` (domyślnie `postgresql://postgres:postgres@localhost:${DB_PORT:-5432}/wa_app_e2e`),
uruchamia `admin:create --yes` i czyści skrzynkę mailpit (`MAILPIT_URL`, domyślnie `http://localhost:8025`).
Reset odbywa się tylko wtedy, gdy nazwa bazy kończy się na `_e2e` — inaczej `globalSetup` przerywa test.
`docker compose up -d` uruchamia tylko serwer Postgres (i mailpit) — nie zakłada bazy `wa_app_e2e`.
Tworzy ją Prisma (`prisma db push` / `prisma migrate reset`) przy pierwszym uruchomieniu `globalSetup`:

```bash
docker compose up -d
npm run test:e2e
```

## Railway

1. Utwórz projekt z usługą PostgreSQL i usługą aplikacji z tego repozytorium. Build: `Dockerfile` (`railway.toml`).
2. Ustaw zmienne: `DATABASE_URL` (referencja do Postgresa), `BETTER_AUTH_SECRET`, `APP_URL`
   (publiczny adres), `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_PUBLIC_SIGNUP`, `MULTI_ORG`.
3. Zacommituj katalog `prisma/migrations` — przed każdym wdrożeniem Railway uruchamia `npx prisma migrate deploy`.
   Healthcheck: `/api/healthcheck`.
4. Po pierwszym wdrożeniu utwórz administratora:

   ```bash
   railway run npm run admin:create -- --email <email>
   ```

   `railway run` uruchamia skrypt **na Twoim komputerze** ze zmiennymi z Railway, więc `DATABASE_URL` musi być
   osiągalny z zewnątrz (publiczny URL Postgresa, np. `DATABASE_PUBLIC_URL`), a nie wewnętrzny adres `*.railway.internal`:

   ```bash
   railway run sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run admin:create -- --email <email>'
   ```

5. Konta przy przekazaniu aplikacji: Web Amigos dostaje `--role superadmin`, zleceniodawca domyślne `admin`.
   Konta superadmina może zmienić lub usunąć tylko superadmin, więc po okresie wsparcia usuwamy je sami.

## Moduły wa-kit

```bash
npm run wa -- list                       # zainstalowane moduły i dostępne w kicie
npm run wa -- add <moduł>                # dodaj moduł z kitu
npm run wa -- remove <moduł> [--force]   # usuń moduł (--force: także pliki zmienione lokalnie)
```

- `add` i `list` pobierają kit z repozytorium `webamigos/wa-kit`, więc wymagają dostępu do niego (zalogowany `git`). Źródło można zmienić opcją `--kit <url|ścieżka>` albo zmienną `WA_KIT_SOURCE`: dozwolone są `https://`, `ssh://`, `file://`, `git@` i ścieżka lokalna.
- `add` i `remove` domyślnie uruchamiają `npm install`; opcja `--no-install` to pomija.
- Po `add` i `remove` zmienia się schemat bazy: utwórz i zacommituj migrację (`npx prisma migrate dev --name <nazwa>`).
- Moduły projektu (funkcje napisane w projekcie) są w `projectModules` w `.wa/kit.json`; `remove` ich nie usuwa.

## wa-kit

Kod rdzenia i modułów pochodzi z wa-kit (`.wa/kit.json`); poprawki ogólne zgłaszaj do repo `webamigos/wa-kit`.
