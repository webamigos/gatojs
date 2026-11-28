# Installer ports and 404: review follow-ups

Branch `fix/installer-ports-and-404` (PR #137), on top of `2026-11-28-installer-ports-and-404.md`. Findings of an
independent review, each checked against the code first.

## 1. Nothing serves `/` or `/en`

Checked: no `src/app/[locale]/page.tsx` and no `(app)/page.tsx`; on a production build `GET /` and `GET /en` answer
404 with the not-found page, so the 404 page's "back home" link (`href="/"`) leads to another 404, and a fresh
project's root URL is a 404.

Change: `src/app/[locale]/page.tsx` redirects to `/dashboard` for the request locale (`redirect` from
`@/i18n/routing`). The `(app)` layout then sends a signed-out user to `/sign-in`. The 404 link stays `href="/"`.
The file matches the existing core glob `src/app/[locale]/*`.

Signature: `export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> })`,
calls `redirect({ href: "/dashboard", locale })`.

### Behaviours

- `params = { locale: "pl" }` → `redirect` called with `{ href: "/dashboard", locale: "pl" }`.
- `params = { locale: "en" }` → `redirect` called with `{ href: "/dashboard", locale: "en" }`.
- e2e (signed out): open `/does-not-exist`, click „Wróć na stronę główną” → URL path `/sign-in`, heading of the
  sign-in page visible, no 404 heading.
- e2e (signed out): `GET /en` → ends on `/en/sign-in` with status 200.

### Mutations to kill

- redirect to `/` or `/sign-in` instead of `/dashboard`; dropping `locale` (English user lands on the Polish page);
  page file missing.

## 2. Tests ignore ports moved by the installer

Checked: `e2e/env.ts` reads `DB_PORT`/`MAILPIT_*` only from the process environment and
`src/test/integration/database-url.ts` hard-codes `localhost:5432`; neither reads `.env`, where the installer writes
moved ports. After a move, `npm run test:integration` and `npm run test:e2e` connect to whatever owns the default
port (e.g. a Homebrew Postgres), not the project's Docker services.

Change: a new helper `src/test/service-ports.ts` (owned by `src/test/**`):

```ts
export interface ServicePorts { db: number; mailpitUi: number; mailpitSmtp: number; minio: number }
export const SERVICE_PORT_VARIABLES: readonly ["DB_PORT", "MAILPIT_UI_PORT", "MAILPIT_SMTP_PORT", "MINIO_PORT"];
export function servicePorts(env: Record<string, string | undefined>): ServicePorts;
export function readServicePortEnv(options?: { cwd?: string; env?: Record<string, string | undefined> }): Record<string, string | undefined>;
export function localServicePorts(): ServicePorts;
```

- `servicePorts`: defaults `5432`, `8025`, `1025`, `9000`; a blank value means the default; a value that is not an
  integer in 1–65535 throws an `Error` whose message names the variable (never silently falls back to the default,
  which could be another server).
- `readServicePortEnv`: returns only the four variables, precedence process env > `.env.local` > `.env` (same order as
  `prisma.config.ts` and `vitest.setup.ts`); missing files are fine; it never writes to `process.env` and never
  returns other keys. WHY: loading `.env` into `process.env` would hand e2e the dev `DATABASE_URL`.
- `localServicePorts()` = `servicePorts(readServicePortEnv())`.

Users:

- `e2e/env.ts`: `E2E_DATABASE_URL` default `postgresql://postgres:postgres@localhost:<db>/wa_app_e2e`, `MAILPIT_URL`
  default `http://localhost:<mailpitUi>`, `SMTP_URL` default `smtp://localhost:<mailpitSmtp>`, from
  `localServicePorts()`. Explicit `DATABASE_URL`, `MAILPIT_URL`, `SMTP_URL` in the process env still win.
- `src/test/integration/database-url.ts`: `defaultIntegrationDatabaseUrl(dbPort: number)` →
  `postgresql://postgres:postgres@localhost:<dbPort>/wa_app_test`; `integrationDatabaseUrl(env = process.env)` →
  `env.INTEGRATION_DATABASE_URL ?? defaultIntegrationDatabaseUrl(localServicePorts().db)`. `DEFAULT_INTEGRATION_DATABASE_URL` goes.
- `src/test/integration/setup-env.ts`: S3 endpoint default `http://localhost:<minio>`.
- Installer (`packages/create-gato-app/src/compose-ports.ts`): when at least one port moved, `movedPortsReport` ends
  with the line `npm run test:integration and npm run test:e2e read the moved ports from .env.`; no such line when
  nothing moved.

### Behaviours

- `servicePorts({})` → `{ db: 5432, mailpitUi: 8025, mailpitSmtp: 1025, minio: 9000 }`.
- `servicePorts({ DB_PORT: "5433", MAILPIT_UI_PORT: "8026", MAILPIT_SMTP_PORT: "1026", MINIO_PORT: "9002" })` →
  `{ db: 5433, mailpitUi: 8026, mailpitSmtp: 1026, minio: 9002 }`.
- `servicePorts({ DB_PORT: "" })` → `db: 5432`; `servicePorts({ DB_PORT: "abc" })`, `"0"`, `"65536"`, `"54.3"` → throws
  with `DB_PORT` in the message.
- `.env` has `DB_PORT=5433`, no `.env.local`, empty env → `{ DB_PORT: "5433" }` (other keys absent or undefined).
- `.env` `DB_PORT=5433`, `.env.local` `DB_PORT=5434` → `5434`; plus env `DB_PORT=5435` → `5435`.
- `.env` with `DATABASE_URL=...` and `DB_PORT=5433` → result has no `DATABASE_URL`; `process.env.DB_PORT` unchanged.
- No `.env` files → `{}`-like (all four undefined), no throw.
- `defaultIntegrationDatabaseUrl(5433)` → the default dev URL on port 5433: user and password `postgres`, host `localhost`, database `wa_app_test`.
- `integrationDatabaseUrl({ INTEGRATION_DATABASE_URL: "postgresql://h:1/x_test" })` → that URL.
- installer, 5432 busy → output contains the tests line; all ports free → output has no tests line.

### Mutations to kill

- `.env` overriding the process env; `.env` overriding `.env.local`; returning keys other than the four; writing to
  `process.env`; an invalid port falling back to the default; the default port wrong; integration ignoring `DB_PORT`;
  the tests line printed when nothing moved.

## 3. Port probe misses servers on `::1`

Checked: `port-probe.ts` connects to `127.0.0.1` and listens on `0.0.0.0`. A server bound only to `[::1]` (e.g.
`next start` with `HOSTNAME=localhost` on macOS) is reported free.

Change: `isPortBusy` also connects to `::1`; a host without IPv6 makes that connect fail (error → not busy from this
probe), never throw.

### Behaviours

- server on `::1` only → `isPortBusy(port)` is `true` (test skipped when the host cannot listen on `::1`); after
  closing → `false`.
- existing IPv4 behaviours unchanged.

### Mutations to kill

- dropping the `::1` probe; treating a connect error as busy.

## 4. The `[locale]/[...rest]` catch-all blocks other catch-alls

Checked: a project or module adding `[locale]/(app)/[...slug]` fails the build next to `[locale]/[...rest]`.
Evaluated on a production build (Next 16.4.6) without the catch-all: `/does-not-exist`, `/a/b`, `/en/does-not-exist`
all answer 404 with the localized page rendered inside the `[locale]` layout (`lang`, messages, link `/` or `/en`),
identical to the build with the catch-all. So the catch-all goes (safer: no route conflict, no extra file); unknown
paths reach `src/app/[locale]/not-found.tsx` by Next's own matching. Drop the glob from `core.json`/`.wa/kit.json`.
Docs: module guide note (a module may add its own catch-all; the core has none), lesson line.

### Behaviours

- `src/app/[locale]/[...rest]/page.tsx` does not exist; e2e 404 tests (Polish and English) stay green without it.

## 5. Docs quote Next's default 404 text

`docs/09-nowy-modul.md:176`, `docs/09b-implementacja-i-bramki.md:430`: replace "This page could not be found." with
the localized heading „Nie znaleziono strony”.
