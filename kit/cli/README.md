# gato-cli

The command line for [GatoJS](https://github.com/webamigos/gatojs), an open-source Next.js kit: a core
(auth, organizations, users, account, dashboard) plus modules you add and remove. `gato` assembles a
project from the kit and keeps it in shape afterwards. It is project tooling, not a client for a
running application.

```bash
npx gato-cli@latest help      # no install
npm install -g gato-cli       # or install it, then just `gato`
```

Reach for `npx` for a one-off `create`. A global install goes stale without saying so; upgrade it
yourself (`npm install -g gato-cli@latest`).

> **The GatoJS repository is private until it goes public.** Until then `gato` needs read access to
> `webamigos/gatojs`: either a local clone passed with `--kit`, or `git` credentials that can clone it
> (`gh auth status`).

## The package is `gato-cli`; the command is `gato`

`gato` on npm is an unrelated package. `bin` is independent of `name`, so the command you type is
still `gato`.

The split only bites with `npx`, which resolves a **package**: `npx gato-cli <command>` works,
`npx gato <command>` fetches the unrelated `gato` package. (It may appear to work on a machine that has
`gato-cli` installed globally, because npx runs a binary it finds on `PATH` before it fetches
anything.)

## Commands

```
gato create <dir> [options]   assemble a new project from a kit checkout (--kit is required)
gato add <module>             copy a kit module into the project, add its npm deps, regenerate
gato remove <module>          remove a module's files and unused deps, regenerate
gato list                     installed modules, modules available in the kit, project modules
gato update <version>         move core and kit modules to tag v<version>, merging local changes
gato generate                 rewrite generated files and wa:* regions from .wa/kit.json
gato kit sync                 refresh .wa/kit.json from kit/ (only inside the kit repository)
gato help                     also --help, -h
gato version                  also --version, -v
```

An unknown command, or no command, prints the usage to stderr and exits with code 1.

### `gato create`

```bash
git clone https://github.com/webamigos/gatojs.git ~/gatojs
gato create ./my-app --kit ~/gatojs
gato create ./my-app --kit ~/gatojs --yes --modules audit-logs,api-keys --no-install
```

| Option | Meaning |
| --- | --- |
| `--kit <path>` | Local GatoJS checkout the project is assembled from. Required for `gato`. |
| `--modules a,b` | Kit modules to install. `--modules ""` (and `--yes` without this option) means core only. |
| `--locales pl,en` | App languages; `pl` and `en` are allowed, `pl` is required (default `pl,en`). |
| `--title <text>` | Display name (default: from the directory name). |
| `--admin-email <email>` | First admin's address. |
| `--yes` | No questions; options you did not give get defaults. Required without a terminal. |
| `--setup` | After install, start Docker, migrate and create the admin. Not with `--no-install`. |
| `--no-install` | Skip `npm install`. |
| `--no-git` | Skip `git init` and the first commit. `git` is still needed to read the kit's files. |

`create` copies the files git tracks in the checkout, so the checkout must be a git repository. Without
`--no-git` the project gets a first commit, so `git` needs `user.name` and `user.email`.

A one-step `npm create gato-app@latest <dir>` that fetches the kit itself is planned as a separate
package, `create-gato-app`.

### Commands inside a project

Run them in the project root (the directory with `.wa/kit.json`):

```bash
gato list
gato add uploads
gato remove uploads --force
gato generate
```

After `add` and `remove` the database schema changes: create and commit a migration. `add` does not
touch `.env`; copy the module's new variables from the `wa:modules` region of `.env.example`.

`gato update <version> [--kit <source>] [--dry-run] [--no-install]` needs a clean git tree (except
with `--dry-run`, which only prints the plan). Conflicts leave markers and exit with code 1; details in
[kit/README.md](../README.md).

## Where `add`, `list` and `update` find the kit

In this order:

1. `--kit <source>`;
2. the `GATO_KIT_SOURCE` environment variable (the older name `WA_KIT_SOURCE` still works; an empty value
   counts as unset);
3. `kitRepo` from `.wa/kit.json`, cloned at the tag `v<kitVersion>` with `git clone --depth 1`.

`update` clones its source at two tags, `v<kitVersion>` (the base of the merge) and `v<version>`, so its
source must be a git repository with both tags.

A source is a local path or a `https://`, `ssh://`, `file://` or `git@` URL. A local checkout must have
the same kit version as the project (`kit/kit.json` vs `kitVersion` in `.wa/kit.json`).

## `gato` and `npm run wa`

Projects created from the kit also carry the same CLI as a committed bundle, `.wa/bin/wa.mjs`, run as
`npm run wa -- <command>`. Both are built from the same source in one build; they differ only in the
name they print. Inside the kit checkout, `npm run wa -- create <dir>` uses that checkout without
`--kit`.

## Node

`engines` asks for Node 22 or newer. The CLI is a single ESM file with its dependencies bundled, so
the package has no runtime dependencies.

## Versioning

`gato-cli` has its own semver, independent of the kit version a project uses. `gato --version` prints
the CLI's version.

## Publishing (manual)

There is no publish job in CI. From a clean checkout of `main`:

```bash
cd kit/cli
npm version <patch|minor|major> --no-git-tag-version
npm run build                     # updates .wa/bin/wa.mjs, which embeds the version
```

Commit `package.json`, `package-lock.json` and `.wa/bin/wa.mjs` and land them on `main` **before**
publishing: npm versions are immutable, and `npm unpublish` is limited to 72 hours and burns the
version number.

```bash
cd kit/cli
npm ci
npm publish --dry-run             # check the file list: dist/gato.mjs, README.md, LICENSE, NOTICE, package.json
npm publish
```

`prepack` copies `LICENSE` and `NOTICE` from the repository root and runs the build (typecheck and
bundle), so the tarball always holds a fresh `dist/gato.mjs`.

Then exercise what was actually published:

```bash
npx gato-cli@latest --version
```

## Licence

Apache-2.0.
