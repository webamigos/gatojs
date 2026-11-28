# Installer picks free ports; localized 404 page

Branch `fix/installer-ports-and-404`. Bugs from a browser test of a fresh project.

## 1. create-gato-app picks free host ports

Root cause: on macOS a Homebrew Postgres on `127.0.0.1:5432` and Docker's `*:5432` publish can both bind, and
`DATABASE_URL=localhost:5432` then reaches the local server. The wizard already probes the published ports
(`port-probe.ts`) but only refuses to start Docker and prints suggestions; a user who runs `docker compose up -d`
by hand ends up on the wrong database.

Change (`packages/create-gato-app/src/wizard.ts`, `compose-ports.ts`): when the wizard starts the Docker services
(`answers.setup`), before `docker info` it probes the published ports of the services in the active profiles. For each
busy port whose variable (`DB_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`, `MINIO_PORT`, `MINIO_CONSOLE_PORT`) is not
set in the process environment, it picks the next free port (`suggestFreePort`, distinct from other published ports and
from ports already picked), writes `VAR=<port>` and every `.env` value that pointed at `localhost:<old>` or
`127.0.0.1:<old>` (e.g. `DATABASE_URL`, `SMTP_URL`, `S3_ENDPOINT`) to `.env`, prints one line per change, and continues
with `docker compose up`. Free ports keep their defaults and nothing is written for them.

It still refuses (old report, exit 1, no compose) when a busy port cannot be moved: a literal port without a variable,
a variable set in the process environment (Compose prefers it over `.env`), or no free port within the search limit.

New pure function in `compose-ports.ts`:

```ts
export function portAssignments(input: {
  busy: PublishedPort[];
  free: ReadonlyMap<number, number | null>;
  envText: string;
  shellEnv: Record<string, string | undefined>;
}): { values: Record<string, string>; unresolved: PublishedPort[] };
```

### Behaviours

- 5432 busy, nothing in the shell env → `.env` has `DB_PORT=5433` and
  `DATABASE_URL=postgresql://postgres:<password>@localhost:<DB_PORT>/my_app` (here `<DB_PORT>` = 5433) before `docker compose up -d --wait`; compose
  and migration run; exit 0; output contains `5432` and `5433` and `DB_PORT`.
- All ports free → `.env` has no `DB_PORT=`, `MAILPIT_UI_PORT=`, `MAILPIT_SMTP_PORT=` line; `DATABASE_URL` keeps
  `localhost:5432`.
- 1025 busy → `MAILPIT_SMTP_PORT=1026`, `SMTP_URL=smtp://localhost:1026`.
- 9000 and 9001 busy with uploads + local MinIO → `MINIO_PORT=9002`, `MINIO_CONSOLE_PORT=9003`,
  `S3_ENDPOINT=http://localhost:9002`; compose runs with `--profile s3`.
- 5432 and 5433 busy → `DB_PORT=5434`.
- `DB_PORT=5544` in the process env and 5544 busy → no compose, exit 1, report names `DB_PORT` (old behaviour).
- 5432 busy and no free port in the next 100 → no compose, exit 1.
- `--skip-docker` → no probe, `.env` unchanged by the port step.
- A line `# DATABASE_URL=...localhost:5432` (comment) is not rewritten; `localhost:54321` is not rewritten for 5432.

### Mutations to kill

- writing the busy port instead of the free one; skipping the dependent `DATABASE_URL` rewrite;
- assigning a variable that is set in the shell env; treating a literal port as movable;
- picking the same free port for two busy ports; writing defaults for free ports;
- writing `.env` after `docker compose up` instead of before; continuing to compose when a port is unresolved.

## 2. Localized not-found page

The project's 404 is Next's default black English page. Add:

- `src/shared/components/not-found-view.tsx`: app-styled view (centered card like the auth layout) with a localized
  title, description and a link home (`Link` from `@/i18n/routing`, `href="/"`).
- `src/app/[locale]/not-found.tsx`: renders the view (catches `notFound()` from pages and module guards such as
  `requireModuleAccess` for a disabled module).
- `src/app/[locale]/[...rest]/page.tsx`: calls `notFound()` so unknown paths under a locale reach the localized page.
- `src/app/not-found.tsx`: root fallback for requests the middleware does not localize (default locale messages).
- Messages `common.notFound.{title,description,backHome}` in `src/app/messages/{pl,en}.json`.

### Behaviours

- `GET /does-not-exist` → 404, Polish title „Nie znaleziono strony”, a link to `/`.
- `GET /en/does-not-exist` → 404, English title "Page not found", link to `/en`.
- A module page whose module is disabled (`requireModuleAccess` → `notFound()`) → the same localized page.

### Mutations to kill

- wrong message key / locale; missing link home; catch-all route missing.

Signatures: `export async function NotFoundView()` (server component, `getTranslations("common.notFound")`, `Link`
from `@/i18n/routing`); `src/app/[locale]/not-found.tsx` and `src/app/not-found.tsx` default-export a component that
renders `<NotFoundView />`; `src/app/[locale]/[...rest]/page.tsx` default-exports a function that calls `notFound()`.
Messages: pl `title` = „Nie znaleziono strony”, `description` = „Strona, której szukasz, nie istnieje albo została
przeniesiona.”, `backHome` = „Wróć na stronę główną”; en `title` = "Page not found", `description` = "The page you are
looking for does not exist or has been moved.", `backHome` = "Back to the home page".

## 3. `/sign-in` on `127.0.0.1` when `APP_URL` is `localhost`

Reproduced on the standalone build (`HOSTNAME=0.0.0.0 PORT=3917`, `APP_URL=http://localhost:3917`): no 307 loop at
`/sign-in` in a matrix of `Accept-Language` × `NEXT_LOCALE` cookie × path (every redirect is a single hop:
`/sign-in → /en/sign-in` for English, `/pl/sign-in → /sign-in`). The real failure: the sign-in `POST
/api/auth/sign-in/email` answers `403 {"code":"INVALID_ORIGIN"}`, because better-auth trusts only the `APP_URL` origin
and `http://127.0.0.1:3917` is a different origin; the form shows the generic "could not sign in" toast, and every
protected page keeps redirecting to `/sign-in`, which looks like a loop. With `HOSTNAME=localhost` (the e2e setting) the
server listens on `[::1]` only, so `127.0.0.1` is not reachable at all. Not a GatoJS bug: open the app at the exact
`APP_URL`. Documented in the project README.
