# create-gato-app

Create a new [GatoJS](https://github.com/webamigos/gatojs) project, the open-source Next.js kit, with one command:

```bash
npx create-gato-app my-app
# or
npm create gato-app@latest my-app
```

You need Node.js 22 or newer and `git` (`gato create` lists the kit files with `git ls-files`).

## What it does

1. **Checks Node** against the supported range (`>=22`). An unsupported Node stops the command before
   anything is downloaded, with a message saying whether it is too old or too new. `--skip-install` (or `--no-install`)
   turns the refusal into a warning, because nothing is installed then. `--yes` does not bypass the check.
2. **Picks the kit version:** `--kit-version <x.y.z>`, or the highest `v<x.y.z>` tag of `webamigos/gatojs`
   (GitHub tags API; prerelease and other tags are ignored).
3. **Downloads the kit** tag tarball into a temporary directory and extracts it with the system `tar`. No clone, no git
   history.
4. **Runs `gato create`** from the `gato-cli` package that `create-gato-app` depends on at an exact version
   (`node <gato-cli>/dist/gato.mjs create <dir> … --kit <kit>`), with your terminal attached, so its prompts and flags
   work exactly as documented for `gato create`. The exit code is `gato create`'s. The new project gets
   `"gato-cli": "^<that version>"` in `devDependencies`. The kit's own `.wa/bin/wa.mjs` is not used.
5. **Removes the temporary directory**, also when something fails.

## Flags

Flags of `create-gato-app` itself:

| Flag                    | Meaning                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--kit-version <x.y.z>` | Kit version (tag `v<x.y.z>`). Default: the highest `v<x.y.z>` tag.                                                  |
| `--kit <path>`          | Use a local kit checkout instead of downloading one (kit development, CI). Cannot be combined with `--kit-version`. |
| `--skip-install`        | Write files only: passes `--no-install` to `gato create` and turns the Node refusal into a warning.                   |
| `--help`, `-h`          | Print usage.                                                                                                        |
| `--version`, `-v`       | Print the `create-gato-app` version.                                                                                |

Every other argument goes to `gato create` unchanged, for example:

| Flag                    | Meaning                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `--modules a,b`         | Kit modules besides the core (`--modules ""` = core only).    |
| `--locales pl,en`       | App locales (`pl` required).                                  |
| `--title <text>`        | Display name.                                                 |
| `--admin-email <email>` | First admin's email.                                          |
| `--yes`                 | No questions; defaults for everything not given.              |
| `--setup`               | After install: start the database, migrate, create the admin. |
| `--no-install`          | Skip `npm install`.                                           |
| `--no-git`              | Skip `git init` and the first commit.                         |
| `--cli-source <tgz>`    | The project's `gato-cli` from a packed tarball (`file:`), for CI. |

Examples:

```bash
npx create-gato-app my-app --yes --modules uploads,api-keys
npx create-gato-app my-app --kit-version 0.1.0 --skip-install
npx create-gato-app my-app --kit ../gatojs --yes --no-install --no-git
```

## Private repository

If `webamigos/gatojs` is private, GitHub answers 404 to anonymous requests. `create-gato-app` sends a token from,
in order:

1. `GITHUB_TOKEN`,
2. `GH_TOKEN`,
3. `gh auth token`, when the [GitHub CLI](https://cli.github.com) is installed and logged in.

```bash
GITHUB_TOKEN=$(gh auth token) npx create-gato-app my-app
```

The token needs read access to the repository's contents. It is only sent to `api.github.com`; it is never printed.
Without a token and on a 404, the error says the repository may be private and how to pass one. Anonymous requests to
the GitHub API are rate limited (60 per hour); on a 403 or 429, set a token or pass `--kit-version`.

## Not yet

This version installs a project; it is not the full wizard yet. Planned (spec
`docs/superpowers/specs/2026-11-21-gato-cli-design.md` §5–§7 in the GatoJS repository):

- an interactive wizard (`@clack/prompts`) with module descriptions from the chosen kit version, locales, title, admin
  email, and the storage provider for `uploads` (`local`, or `s3` with endpoint and keys);
- validation and escaping of `--title` and `--admin-email`;
- generated secrets for every manifest variable with a `generate` field (`secret-32`, `secret-64`);
- `COMPOSE_PROJECT_NAME=<slug>-<6 random characters>` in `.env`, port probing before `docker compose up`, `--skip-docker`;
- the default kit version from GitHub Releases filtered by `kitFormat`, and the `kitFormat` compatibility check;
- next steps that list only what the wizard did not do.

## Development

```bash
npm ci                                              # in the repository root; this package is a workspace
npm run verify --prefix packages/create-gato-app    # lint, typecheck, unit tests, build
SMOKE_INSTALL=1 bash packages/create-gato-app/scripts/smoke-pack.sh "$PWD"
```

The smoke script packs `gato-cli` and `create-gato-app`, installs both tarballs into an empty prefix, creates projects
from this checkout (one with `--cli-source <gato-cli tarball>`, one without), and checks versions, the `gato-cli`
tarball's file list and the exact pin. `SMOKE_INSTALL=1` also runs `npm install` in the project and checks that its
`gato` is the packed one. CI runs the same script in `.github/workflows/packages.yml`.

## Publishing

`create-gato-app` depends on `gato-cli` at an exact version, which must equal `packages/gato-cli/package.json`
(a unit test and CI check it). When both change, publish `gato-cli` first and wait until its staged version is
approved and live; `publish-packages.yml` refuses to publish `create-gato-app` before that. The runbook is in
`kit/CLAUDE.md` of the GatoJS repository.

## License

Apache-2.0
