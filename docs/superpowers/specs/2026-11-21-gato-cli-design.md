# `create-gato-app` and `gato-cli`: public tools for the kit

Date: 2026-11-21. Drafted by Patryk with an agent. Draft for review, not an implementation plan.

Sources:

- the `wa` CLI in `kit/cli` (`create`, `add`, `remove`, `list`, `generate`, `kit sync`) and its docs: `docs/16-cli-wa.md`, `docs/16b-rozwoj-kitu.md`;
- decisions [D28](../../decyzje.md#d28) (CLI in `kit/cli`, bundle `.wa/bin/wa.mjs`, no npm), [D29](../../decyzje.md#d29) (empty `packages/*`), [D46](../../decyzje.md#d46) (kit released by tag);
- `ragen-app/packages/create-ragen-app` (installer wizard, `giget`, `@clack/prompts`, Node version range, port probing, `COMPOSE_PROJECT_NAME`) and `.github/workflows/installer.yml` (smoke test of the packed tarball);
- `ragen-app/packages/ragen-cli` (package name differs from the command name, `doctor`, `version`, packed CLI test in `.github/workflows/ragen-cli.yml`);
- the `gato-website` site (`src/config/site.ts`: public name GatoJS, "open-source Next.js kit").

## 1. Why

The kit (working name "wa-kit") becomes the public framework GatoJS in the `webamigos/gatojs` repository. Today a new project starts from a one-liner with `git clone` of a private repo, and every project carries a copied bundle `.wa/bin/wa.mjs`. That works inside Web Amigos but not for people outside it:

- it needs `git` with access to a private repo and a hand-typed tag;
- there is no wizard: no Node version or port checks, no module secrets, no storage provider question;
- the CLI version in a project is a file in the repo that nothing updates, and there is no `wa update` on `main` yet (PR #14).

Ragen solved the same problem with two public npm packages. This spec brings that layout to the kit.

## 2. Patryk's decisions (2026-11-21)

1. The kit (core and modules) becomes public.
2. `gato-cli` reaches a project as a `devDependency`. The committed bundle `.wa/bin/wa.mjs` goes away.
3. The sources of both packages live in the kit repo's `packages/` directory.
4. The CLI has its own semver, independent of the kit version. Compatibility is tracked by a kit format number.
5. "wa-kit" is a working name. The framework is called **GatoJS** and the repository is **`webamigos/gatojs`**.

## 3. Two packages

| | `create-gato-app` | `gato-cli` |
| --- | --- | --- |
| How to run | `npm create gato-app@latest <dir>` (alias `npx create-gato-app`) | `npx gato <command>` in a project (from `devDependencies`) |
| Role | Wizard: creates a project and brings it to a working `npm run dev` | Project lifecycle: `add`, `remove`, `list`, `generate`, `doctor`, later `upgrade` |
| Command | `create-gato-app` | `gato` |
| Depends on | `gato-cli` (the project assembly library), pinned exactly | `zod` |

One implementation of project assembly: the `create` code from `kit/cli` moves into `gato-cli` as an exported function (`createProject`), and `create-gato-app` adds only the wizard UI and environment steps. This is the same lesson as in Ragen (`ragen create` delegates to `create-ragen-app` instead of copying the wizard), in the opposite direction. `gato add` and `create` then share the same copy, placeholder and hash rules.

Outside a project (no `.wa/kit.json`), `gato` does not assemble anything; it prints `npm create gato-app@latest <dir>`.

### 3.1 npm names

- `gato` is taken (an unrelated package). `gato-cli`, `create-gato-app`, `gatojs` and the `@gatojs` scope were free on 2026-11-21.
- Reserved on 2026-11-22: Patryk published `create-gato-app` and `gato-cli` 0.0.1 by hand (placeholders whose bin prints how to create a project from the repository) and owns the `@gatojs` npm organization. npm accepted both names, so the `@gatojs/cli` fallback is not needed. `gatojs` without a scope cannot be registered: npm rejects it as too similar to `mathjs` (403 on 2026-11-22), which keeps it from anyone else too.
- Patryk's npm account uses staged publishing: every publish waits for his approval on npmjs.com, and until then the registry serves only a `0.0.0-stage` stub. The release flow in section 9 accounts for it (plan `2026-11-22-packages.md`, Task 6).
- Open: a second owner for both names and members of the `@gatojs` organization, so publishing and approvals do not depend on one account.

## 4. `packages/` in the kit repo

### 4.1 Two kinds of packages

- **Kit tools** (`packages/gato-cli`, `packages/create-gato-app`): published to npm, **not copied into projects** (`kitOnly` list in `kit/kit.json`). A project gets `gato-cli` from npm.
- **Project packages** (later: `env`, `observability`, `connector-guard`): copied into a project as core or module files. Out of scope here, but the infrastructure in 4.2 has to support them unchanged.

### 4.2 Workspace infrastructure (a new decision replacing D29 and part of D28)

- `kit/cli` moves to `packages/gato-cli` with no behaviour change (first step, separate PR).
- The kit's root `package.json` keeps `workspaces: ["packages/*", "apps/*"]`. The kit lockfile includes the tool packages. `create` adapts the project lockfile through `npm install`, as today.
- `Dockerfile`: the `deps` stage copies `packages/*/package.json` before `npm ci` (Ragen's pattern and its `a-scoped-dockerfile-installs-every-workspace-dep` test). The kit's architecture tests get a test that guards this pattern.
- ESLint: `packages/**` is no longer ignored; each package has its own `eslint.config.mjs` (until there is an `eslint-config` package).
- The kit's `npm run verify` covers packages through `turbo run test typecheck lint build`. The `npm run verify --prefix kit/cli` gate goes away with `kit/cli`.
- Stryker and `mutation-gate.json` for `gato-cli` move from `kit/cli` with unchanged thresholds and critical files.

## 5. Fetching the kit without git

- The source is the tag tarball from GitHub (`https://codeload.github.com/<owner>/<repo>/tar.gz/refs/tags/v<version>`), with no login and no `git`. The tarball contains exactly the files tracked by git, so it replaces `git ls-files` in `listKitFiles`. A `.gitattributes` file with `export-ignore` can also drop `docs/` and `packages/` from the tarball to make it smaller.
- A local clone (`--kit <path>`, `GATO_KIT_SOURCE`) stays for kit development and CI.
- Provenance: the CLI records the tag's commit sha in `.wa/kit.json` (from the response header or the GitHub API), so `gato doctor` and `upgrade` know what the project was created from.
- Default kit version for `create`: the newest GitHub Release whose `kitFormat` the CLI supports (GitHub API without a token; on a rate limit, a message suggesting `--kit-version <version>`). `--kit-version` and `--kit` override it.

## 6. Versions and compatibility

- `kit/kit.json` gains `kitFormat` (an integer; a project or kit without the field is format `1`, and the first kit that declares it is format `2`). The format changes when a contract read by the CLI changes: the manifest schema, `.wa/kit.json`, `wa:*` regions, the layout of generated files.
- `gato-cli` declares the formats it supports (`SUPPORTED_KIT_FORMATS`). A project or kit in a format outside that list ends the command with an error: `This project uses kit format <n>; update gato-cli (npm i -D gato-cli@latest) or run: npx gato-cli@latest update <version>` (the second hint is for a project whose bundled CLI, `npm run wa`, is older than the target kit; decided by Patryk on 2026-11-23, implemented in extensibility Task 1, ADR-59), or, for a format older than any supported one, the last CLI version that knows it.
- **Which `gato-cli` a new project gets.** `create-gato-app` depends on an exact `gato-cli` version (no range) and writes `"gato-cli": "^<that exact version>"` into the project. The version therefore always exists in the registry, whatever the creator's own version number is. The release workflow publishes `gato-cli` before `create-gato-app` when both change, and a CI check fails when the creator's pinned `gato-cli` version is not the one in the workspace.
- `.wa/kit.json` records `kitFormat` and `cliVersion` at the time of the last operation.

## 7. `create-gato-app`: the wizard

Order follows Ragen: first everything that can refuse without side effects, then download and write.

1. **Node:** the kit's `engines` range is checked before download. The refusal says "too old", "unsupported odd-numbered line" or "too new", not just "requires Node X".
2. **Directory and slug:** the rules of today's `wa create` (`SLUG_PATTERN`, empty directory), plus validation and escaping of `--title` and `--admin-email` (not validated today, as `docs/16-cli-wa.md` describes).
3. **Questions** (`@clack/prompts`; with `--yes`, defaults): modules with descriptions from the chosen kit version's manifests, locales, title, admin email, storage provider when `uploads` is chosen (`local`, or `s3` with endpoint and keys), setup.
4. **Assembly:** `createProject` from `gato-cli` (files, placeholders, hashes, `package.json` with `gato-cli` in `devDependencies`, `wa generate`). `wa generate` runs in-process and needs no installed dependencies.
5. **Secrets:** every manifest variable with a new `generate` field (`secret-32`, `secret-64`) gets a random value in `.env`. Today only `BETTER_AUTH_SECRET` does; `API_KEY_PEPPER` stays an example value and blocks production.
6. **Docker:** `.env` gets `COMPOSE_PROJECT_NAME=<slug>-<6 random characters>`. The suffix is generated once at creation, stored in `.env` and never regenerated, so two projects in directories with the same name do not share containers or volumes. The wizard probes the ports from `docker-compose.yml` (plus the profiles it starts) before `docker compose up`. A busy port ends with a suggestion of the `*_PORT` variables.
7. **Git, `npm install`, first commit, setup** (`migrate`, `admin:create`) as today (D35).
8. **Next steps** at the end, listing only what the wizard did not do.

Flags: the `wa create` set plus `--kit-version`, `--skip-docker`, `--skip-install`.

`--skip-install` means "write files, run nothing that needs installed dependencies or services":

| Step | With `--skip-install` |
| --- | --- |
| 1. Node check | Warning instead of refusal |
| 2–5. Directory, questions, assembly (including `wa generate`), secrets | Run |
| 6. Docker (port probe, `docker compose up`) | Skipped, as with `--skip-docker` |
| 7. `git init` and first commit | Run (unless `--no-git`) |
| 7. `npm install`, `migrate`, `admin:create` | Skipped |
| 8. Next steps | List `npm install`, `docker compose up -d`, `npx prisma migrate dev --name init`, `npm run admin:create` and `npm run dev` |

`--yes` does not bypass the Node check: it means "accept defaults", not "ignore a requirement".

## 8. `gato-cli`: commands

| Command | Status | Notes |
| --- | --- | --- |
| `gato add`, `remove`, `list`, `generate` | from `wa` | `npm run wa -- x` → `npx gato x`; the `wa` script stays in `package.json` as an alias for one minor, then goes away |
| `gato doctor` | new | Node in range, `kitFormat` supported, generated files current, core file hashes (list of locally changed files), `.env` passes the project's `checkEnv`, Docker and ports. Non-zero exit on failure. Modelled on `ragen doctor` |
| `gato version`, `--help` | new | Version from `package.json`; an unknown command exits with code 1 |
| `gato kit sync` | from `wa`, hidden | Works only in the kit repo |
| `gato upgrade` | later | Moves a project to a newer kit version with a three-way merge based on the hashes in `.wa/kit.json`. Builds on `wa update` (PR #14). Separate spec |

Messages: see open question 2.

## 9. Publishing and CI

- A `release-packages.yml` workflow reacts to a `gato-cli@<version>` or `create-gato-app@<version>` tag set by a human (as in D46) and publishes with `--provenance` through npm trusted publishing (OIDC, no `NPM_TOKEN` secret).
- A `packages.yml` workflow on PRs and `main`, modelled on `ragen-cli.yml` and `installer.yml`:
  - `npm pack` of each package and installation from the tarball;
  - `gato --version` equals the version in `package.json`; an unknown command exits non-zero;
  - `create-gato-app` assembles a project from the commit under test (`--kit <checkout>`, `--yes`, `--skip-docker`) for the module sets of the `assemble` job. The packed `gato-cli` from the same run is used inside the generated project through a CI-only flag, `--cli-source <path to tarball>`, which writes `"gato-cli": "file:<path>"` instead of the registry version. `npm install` then installs the PR's CLI, and `npx gato doctor` runs that build. An assertion script checks the result (secrets generated, `gato-cli` in `devDependencies`, no `.wa/bin`, `npx gato doctor` with no configuration errors);
  - refusal on a Node version outside the range.
- The `assemble` job in `kit.yml` switches to `create-gato-app` from the packed tarball, with the same `--cli-source`.

## 10. Making the kit public: prerequisites

- License (Ragen: Apache-2.0 with `NOTICE`), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- A secret scan of the whole history (trufflehog on the full history, not only on diffs) before the visibility changes.
- Repository rename `webamigos/wa-kit` → `webamigos/gatojs` (GitHub keeps a redirect from the old address, but `kitRepo` in `kit/kit.json` and in projects has to be rewritten).
- The working name disappears from user-visible code and text: `@wa-kit/cli`, messages like "Run create from a wa-kit clone", the `wa-list-` temp directory prefix, `WA_KIT_SOURCE` (→ `GATO_KIT_SOURCE`, the old name read during a transition), the commit subject `chore: initial commit from wa-kit v<version>`, `README.md`, `kit/README.md`, `AGENTS.md`, `CLAUDE.md` and `docs/`. Collect the list with `grep -rni "wa-kit\|wa_kit"`.
- Review files for client data and internal references (ClickUp links, names in plans under `docs/superpowers/`).
- English-first content (decided 2026-11-22): file names, docs, messages and test names in English; a separate migration spec covers it.

## 11. Order of work

1. Reserve the npm names (`0.0.0`) and the `@gatojs` organization. Manual, done by a human.
2. `packages/` infrastructure and the move `kit/cli` → `packages/gato-cli` with no behaviour change. A new decision replacing D29 and part of D28.
3. `kitFormat`, the GitHub tarball source, `gato-cli` as a `devDependency` instead of the bundle, the `wa` alias.
4. `create-gato-app`: the wizard from section 7.
5. `gato doctor`, `gato version`.
6. Publishing workflows and smoke tests from section 9.
7. Rename to GatoJS in code and docs, move the repo to `webamigos/gatojs`, make it public (section 10), first npm release.

Steps 2–6 can happen while the repo is private: CI uses `--kit <checkout>`, and the GitHub tarball works with a token (`GATO_GITHUB_TOKEN`) until the repo is public.

## 12. Open questions

1. **The `.wa/` directory and `wa:*` names:** after the GatoJS naming decision, the recommendation is `.gato/` and `gato:*` before the first public release (the CLI reads both during a transition). To be confirmed.
2. **CLI message language:** English (decided 2026-11-22 for repo content). Is a Polish translation of CLI messages needed at all?
3. **Documentation after going public:** a separate docs site (the website mentions Mintlify) or `docs/` in the repo?
4. **Existing projects with `.wa/bin/wa.mjs`:** are there any at clients? If so, a migration command or guide is needed (bundle → `devDependency`).
5. **License:** Apache-2.0 like Ragen, or MIT?
