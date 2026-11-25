# create-gato-app

Create a new [GatoJS](https://github.com/webamigos/gatojs) project, the open-source Next.js kit, with one command:

```bash
npx create-gato-app my-app
# or
npm create gato-app@latest my-app
```

You need Node.js in the range the chosen kit version declares (`engines.node`; `^22.12.0 || ^24.0.0 || ^26.0.0`
today), `git`, and Docker for the database.

## What it does

The order follows the rule "refuse before anything is written":

1. **Checks the flags, the directory and the project name.** The last segment of `<dir>` becomes the project
   name (lowercase letters, digits and hyphens, starting with a letter, 2-50 characters); the directory must be
   missing or empty. `--title` and `--admin-email` are validated here.
2. **Picks the kit version** (`--kit-version <x.y.z>`, or the highest `v<x.y.z>` tag of `webamigos/gatojs`) and
   **checks Node** against that version's `engines.node`, read from GitHub before the download. The refusal says
   whether Node is too old, an unsupported odd-numbered release line, or too new. `--yes` does not bypass it;
   `--skip-install` turns it into a warning. Kit versions without `engines.node` are checked against `>=22`.
3. **Downloads the kit** tag tarball into a temporary directory (no clone, no history), removed at the end.
4. **Asks the questions** (defaults with `--yes`): modules with their descriptions from that kit version, locales,
   display name, first admin's email, file storage when `uploads` is chosen (`local`, or `s3` with endpoint and
   keys; the default endpoint `http://localhost:9000` is a local MinIO started with Docker), how the app sends mail
   (`smtp`, `resend` or `console`), and whether to set up the database now. A flag skips its question.
5. **Assembles the project** with the `gato-cli` version `create-gato-app` pins
   (`node <gato-cli>/dist/gato.mjs create … --yes --no-install --no-git`). The project gets
   `"gato-cli": "^<that version>"` in `devDependencies`.
6. **Writes `.env`**: every manifest variable with a `generate` field (`BETTER_AUTH_SECRET`, `API_KEY_PEPPER`, …)
   gets a random value; `COMPOSE_PROJECT_NAME=<slug>-<6 random characters>` is written once, so two projects in
   directories with the same name never share containers or volumes; the storage and mail answers are filled in.
   Mail: `smtp` with the default host `127.0.0.1` keeps the local mailpit `SMTP_URL` from `.env.example`; another
   SMTP host writes `MAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT` (and `SMTP_USER`/`SMTP_PASS` when a user is
   given); `resend` writes `MAIL_PROVIDER=resend` and `RESEND_API_KEY`; `console` writes `MAIL_PROVIDER=console`
   (no mail is sent). Every answer except the local mailpit empties `SMTP_URL`, so only one SMTP source is set.
7. **Starts Docker** (unless `--skip-docker`, `--skip-install` or "no" to setup): probes every port
   `docker-compose.yml` publishes for the services it starts (plus the `s3` profile for a local MinIO). A busy port
   stops this step with the `*_PORT` variables to set in `.env` (and the URLs that use them); otherwise
   `docker compose up -d --wait`.
8. **`git init`, `npm install`, `prisma migrate dev --name init`, `admin:create`** (when an email was given; the
   generated password is printed once), then **the first commit**. The commit comes last so it holds the lockfile
   `npm install` rewrote and the first migration: the tree is clean when the wizard ends.
9. **Prints the next steps**, listing only what it did not do.

Exit code 1 means a step the run wanted did not finish (busy port, Docker not running, a failed install or
migration); the project stays in place and the next steps say how to continue.

`--skip-install` writes files only: no `npm install`, Docker, migration or first commit (a commit before the first
`npm install` would be dirty right away, because npm rewrites the lockfile). `git init` still runs.

## Flags

| Flag                             | Meaning                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `--modules a,b`                  | Kit modules besides the core (`--modules ""` = core only).                        |
| `--locales pl\|pl,en`            | App locales (`pl` is required).                                                   |
| `--title <text>`                 | Display name (1-60 characters, no quotes, backslashes, `<`, `>`, `$`, backticks). |
| `--admin-email <email>`          | First admin's email.                                                              |
| `--storage local\|s3`            | File storage when `uploads` is chosen.                                            |
| `--s3-endpoint <url>`            | S3 endpoint (default `http://localhost:9000`, local MinIO).                       |
| `--s3-access-key-id <id>`        | S3 access key id (needed with `--yes` and a non-local endpoint).                  |
| `--s3-secret-access-key <key>`   | S3 secret access key (same).                                                      |
| `--mail-provider <smtp\|resend\|console>` | How the app sends mail (default `smtp` with the local mailpit).          |
| `--smtp-host <host>`             | SMTP relay host (default `127.0.0.1`, local mailpit); needs `--mail-provider smtp`. |
| `--smtp-port <port>`             | SMTP relay port, 1-65535 (default 587).                                           |
| `--smtp-user <user>`             | SMTP user; none means no authentication.                                          |
| `--smtp-pass <pass>`             | SMTP password (needed with `--yes` and `--smtp-user`).                            |
| `--resend-api-key <key>`         | Resend API key (needed with `--yes` and `--mail-provider resend`).                |
| `--yes`                          | Ask nothing; defaults for everything not given (setup included).                  |
| `--setup`                        | Set up the database without asking.                                               |
| `--skip-docker`                  | Do not start Docker (and so no migration or admin).                               |
| `--skip-install`, `--no-install` | Write files only; an unsupported Node only warns.                                 |
| `--no-git`                       | No `git init` and no first commit.                                                |
| `--kit-version <x.y.z>`          | Kit version (tag `v<x.y.z>`). Default: the highest `v<x.y.z>` tag.                |
| `--kit <path>`                   | Use a local kit checkout instead of downloading one (kit development, CI).        |
| `--cli-source <tgz>`             | The project's `gato-cli` from a packed tarball (`file:`), for CI.                 |
| `--help`, `-h`                   | Print usage.                                                                      |
| `--version`, `-v`                | Print the `create-gato-app` version.                                              |

Examples:

```bash
npx create-gato-app my-app
npx create-gato-app my-app --yes --modules uploads,api-keys --admin-email you@example.com
npx create-gato-app my-app --yes --modules uploads --storage s3 \
  --s3-endpoint https://s3.example.com --s3-access-key-id AKIA… --s3-secret-access-key …
npx create-gato-app my-app --yes --mail-provider smtp --smtp-host smtp.example.com \
  --smtp-user app --smtp-pass …
npx create-gato-app my-app --kit ../gatojs --yes --skip-install --no-git
```

## GitHub token

`webamigos/gatojs` is public, so `create-gato-app` works without a token. Anonymous requests to the GitHub API are
rate limited (60 per hour); a token raises the limit. `create-gato-app` sends a token from, in order:

1. `GITHUB_TOKEN`,
2. `GH_TOKEN`,
3. `gh auth token`, when the [GitHub CLI](https://cli.github.com) is installed and logged in.

```bash
GITHUB_TOKEN=$(gh auth token) npx create-gato-app my-app
```

The token is only sent to `api.github.com`; it is never printed. When GitHub rejects the token (401),
`create-gato-app` says so and retries once without it. On a 403 or 429 (rate limit or missing access) without a
token, set `GITHUB_TOKEN` (or `GH_TOKEN`) or log in with `gh auth login`; with a token, check that it can read
`webamigos/gatojs`. Either way you can wait for the limit to reset, or pass `--kit <path>` to use a local GatoJS
checkout. `--kit-version` does not help here: it still calls the GitHub API.

## Not yet

The default kit version still comes from the highest tag; choosing it from GitHub Releases filtered by `kitFormat`
(spec `docs/superpowers/specs/2026-11-21-gato-cli-design.md` §5) comes later.

## Development

```bash
npm ci                                              # in the repository root; this package is a workspace
npm run verify --prefix packages/create-gato-app    # lint, typecheck, unit tests, build
SMOKE_INSTALL=1 bash packages/create-gato-app/scripts/smoke-pack.sh "$PWD"
```

The smoke script packs `gato-cli` and `create-gato-app`, installs both tarballs into an empty prefix, creates projects
from this checkout (with and without `--cli-source <gato-cli tarball>`), and checks versions, the `gato-cli` tarball's
file list, the exact pin, generated secrets, `COMPOSE_PROJECT_NAME`, the storage answers and the mail answer in
`.env`. With `SMOKE_INSTALL=1` it also creates a project with `--mail-provider console` and checks its `.env` with
`checkEnv` from `@gatojs/env` inside the project.
`SMOKE_INSTALL=1` also lets the wizard install a project with `--skip-docker` (one commit, clean tree), checks that the
projects' `gato` is the packed one, and runs the wizard against a busy `DB_PORT`. CI runs the same script in `.github/workflows/packages.yml`.

## Publishing

`create-gato-app` depends on `gato-cli` at an exact version, which must equal `packages/gato-cli/package.json`
(a unit test and CI check it). When both change, publish `gato-cli` first and wait until its staged version is
approved and live; `publish-packages.yml` refuses to publish `create-gato-app` before that. The runbook is in
`kit/CLAUDE.md` of the GatoJS repository.

## License

Apache-2.0
