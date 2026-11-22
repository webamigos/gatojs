# create-gato-app

Create a new [GatoJS](https://github.com/webamigos/gatojs) project, the open-source Next.js kit, with one command:

```bash
npx create-gato-app my-app
# or
npm create gato-app@latest my-app
```

You need Node.js 22 or newer and `git` (the kit's `wa create` lists the kit files with `git ls-files`).

## What it does

1. **Checks Node** against the kit's supported range (`>=22.0.0`). An unsupported Node stops the command before
   anything is downloaded, with a message saying whether it is too old or too new. `--skip-install` (or `--no-install`)
   turns the refusal into a warning, because nothing is installed then. `--yes` does not bypass the check.
2. **Picks the kit version:** `--kit-version <x.y.z>`, or the highest `v<x.y.z>` tag of `webamigos/gatojs`
   (GitHub tags API; prerelease and other tags are ignored).
3. **Downloads the kit** tag tarball into a temporary directory and extracts it with the system `tar`. No clone, no git
   history.
4. **Runs the kit's own `wa create`** from that tag (`node <kit>/.wa/bin/wa.mjs create <dir> … --kit <kit>`) with your
   terminal attached, so its prompts and flags work exactly as documented for `wa create`. The exit code is
   `wa create`'s.
5. **Removes the temporary directory**, also when something fails.

## Flags

Flags of `create-gato-app` itself:

| Flag                    | Meaning                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--kit-version <x.y.z>` | Kit version (tag `v<x.y.z>`). Default: the highest `v<x.y.z>` tag.                                                  |
| `--kit <path>`          | Use a local kit checkout instead of downloading one (kit development, CI). Cannot be combined with `--kit-version`. |
| `--skip-install`        | Write files only: passes `--no-install` to `wa create` and turns the Node refusal into a warning.                   |
| `--help`, `-h`          | Print usage.                                                                                                        |
| `--version`, `-v`       | Print the `create-gato-app` version.                                                                                |

Every other argument goes to `wa create` unchanged, for example:

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

This is a first, minimal version. Planned (see `docs/superpowers/specs/2026-11-21-gato-cli-design.md` in the kit
repository):

- an interactive wizard (`@clack/prompts`) with module descriptions, storage provider questions and next steps;
- generated secrets for module variables, `COMPOSE_PROJECT_NAME`, port probing, `--skip-docker`;
- `gato-cli` as a project `devDependency` instead of the bundled `.wa/bin/wa.mjs`, and a `kitFormat` compatibility
  check;
- choosing the default version from GitHub Releases.

The package lives in `kit/create-gato-app/` for now and moves to `packages/create-gato-app` together with `gato-cli`.

## Development

```bash
npm ci --prefix kit/create-gato-app
npm run verify --prefix kit/create-gato-app      # lint, typecheck, unit tests, build
npm run test:smoke --prefix kit/create-gato-app -- "$PWD"   # pack, install the tarball, create a project from this checkout
```

## License

Apache-2.0
