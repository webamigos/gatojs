# create-gato-app wizard (spec 2026-11-21-gato-cli-design.md §7)

Date: 2026-11-23. Branch `feat/create-gato-app-wizard`. Follow-up of Task 6 in `2026-11-22-packages.md`.

## Decisions

- **Assembly stays a spawn of `gato create`** (`node <gato-cli>/dist/gato.mjs create … --kit <kit>`). A `createProject`
  library export would need a second bundle entry, type declarations and a bigger `gato-cli` tarball, and the wizard
  needs nothing from assembly except the exit code. The wizard asks every question itself and runs
  `gato create <dir> --yes --no-install --no-git --modules=… --locales=… --title=… [--admin-email=…] [--cli-source=…] --kit=<kit>`
  with piped output (shown only on failure), so `gato create` never prompts and its Polish messages never reach the
  user. Values use the `--flag=value` form so a value starting with `-` is never read as a flag.
- **Secrets live in `gato-cli`** (`gato create` writes `.env`): a manifest env variable may carry
  `generate: "secret-32" | "secret-64" | "hex-32"`. `secret-N` = N random bytes, base64url without padding
  (43 or 86 characters); `hex-32` = 32 random bytes as 64 lowercase hex characters (the `encryption` module's
  `ENCRYPTION_MASTER_KEY`). `BETTER_AUTH_SECRET` is always generated as `secret-32` (core keeps its variables in
  `.env.example`, not in the manifest, and older kit versions have no `generate` fields).
- **The wizard writes the rest of `.env`**: `COMPOSE_PROJECT_NAME=<slug>-<6 chars of [a-z0-9]>` (only when `.env` has
  none) and the storage answers (`STORAGE_PROVIDER`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).
- **Node range from the kit**: `engines.node` of the kit's root `package.json` (local `--kit`, or the GitHub contents
  API for the chosen tag) is checked before the tarball download. A kit without `engines.node` (≤ v0.8.x) is checked
  against the built-in `>=22`. The kit gets `"engines": { "node": "^22.12.0 || ^24.0.0 || ^26.0.0" }`.
- **Title and admin email: validation makes escaping unnecessary.** The title lands in a TypeScript string literal,
  a double-quoted dotenv value that Next.js expands (`$`), an e-mail `From` display name and a Markdown heading. The
  validator rejects exactly the characters that would need escaping there (control characters, `"`, `\`, `<`, `>`,
  `$`, backtick), so no file ever gets an escaped value. Values the wizard prints in shell commands go through
  `shellQuote`.
- **Order** (spec §7): flags and directory → kit version → Node range → download → questions → `gato create` →
  `.env` (wizard values) → Docker (port probe, `docker info`, `docker compose up -d --wait`) → `git init` →
  `npm install` → `prisma migrate dev` → `admin:create` → first commit → next steps.
- **First commit after install and setup** (QA P3): the commit holds the lockfile `npm install` rewrote and the
  `init` migration, so the tree is clean right after the wizard. With `--skip-install` there is `git init` but no
  commit: a commit before the first `npm install` is always dirty afterwards (the lockfile changes), which blocks
  `gato update`; next steps list the commit after `npm install` and the migration. This deviates from the spec table
  (row "git init and first commit: run") on purpose.
- **Setup default is yes** (interactive confirm, initial yes; `--yes` accepts it). `--skip-docker` or
  `--skip-install` turn it off; `--setup` skips the question.
- **Exit code 1** when a step the run wanted did not finish: assembly, Docker unavailable, busy port, compose up,
  npm install, migrate, admin:create. A failed first commit is a warning (exit 0), as today.

## Signatures

Stubs are in place (`throw new Error("not implemented…")`). Tests import from these files.

`packages/create-gato-app/src/`:

- `args.ts`: `parseCliArgs(argv): CliArgs`, `USAGE`, types `CreateCliArgs`, `Locale`, `StorageProvider`.
- `validate.ts`: `titleError(title)`, `adminEmailError(email)`, `envValueError(label, value)` → `string | null`.
- `node-version.ts`: existing API plus `parseEnginesRange(range): NodeRange[] | null`.
- `kit-engines.ts`: `nodeRangesFromPackageJson(packageJson): { ranges, warning }`, `readKitPackageJson(kitDir)`.
- `github.ts`: existing API plus `packageJsonUrl(version)`, `fetchKitPackageJson({ fetch, token, version })`.
- `kit-modules.ts`: `parseKitModule(raw, file)`, `readKitModules(kitDir)`, `withRequired(selected, modules)`.
- `questions.ts`: `Prompter`, `Answers`, `StorageAnswer`, `CancelledError`, `displayName(slug)`,
  `collectAnswers({ args, slug, modules, prompter })`, `LOCAL_MINIO_ENDPOINT`, `LOCAL_MINIO_KEY`.
- `env-file.ts`: `setEnvValues`, `readEnvValue`, `randomSuffix`, `composeProjectName`, `wizardEnvValues`.
- `compose-ports.ts`: `publishedPorts`, `suggestFreePort`, `portSettings`, `busyPortsReport`.
- `port-probe.ts`: `isPortBusy(port)` (real sockets).
- `next-steps.ts`: `shellQuote`, `displayDir`, `nextSteps(outcome)`.
- `delegate.ts`: `gatoCreateCommand({ nodePath, gatoBin, kitDir, projectDir, answers, cliSource })`.
- `ui.ts`: `Ui` (intro, step, info, warn, note, outro, `task(label, work)`).
- `cli.ts`: `run(argv, deps)`; `CliDeps` gains `interactive`, `prompter`, `ui`, `isPortBusy`, `randomBytes`.

`packages/gato-cli/src/`:

- `manifest/schema.ts`: env entry gains optional `generate` (done).
- `assemble/secrets.ts`: `SECRET_KINDS`, `generateSecret(kind, randomBytes)`, `generatedVariables(manifests)`,
  `withGeneratedSecrets(envText, variables, randomBytes)`.
- `commands/create.ts`: `.env` gets every generated variable (existing `create` tests keep passing).

## Behaviours

### args (`parseCliArgs`)

- `["my-app"]` → `{ kind: "create", target: "my-app", kitVersion: null, kitPath: null, modules: null, locales: null,
  title: null, adminEmail: null, yes: false, setup: false, install: true, docker: true, git: true, cliSource: null,
  storage: null, s3Endpoint: null, s3AccessKeyId: null, s3SecretAccessKey: null }`.
- `--help`/`-h` → `{ kind: "help" }`; `--version`/`-v` → `{ kind: "version" }` (anywhere in argv).
- `--modules ""` → `modules: []`; `--modules "api-keys, uploads"` → `["api-keys", "uploads"]`; `--modules=uploads` works.
- `--locales pl` → `["pl"]`; `--locales pl,en` → `["pl", "en"]`; `--locales en` and `--locales pl,de` and
  `--locales pl,pl` → throw `--locales: use pl or pl,en (pl is required)`.
- `--title "  Acme  "` → `title: "Acme"`; `--title 'A"B'` → throws a message starting with `--title: `.
- `--admin-email a@b.co` → `adminEmail: "a@b.co"`; `--admin-email nope` → throws a message starting with `--admin-email: `.
- `--skip-install` and `--no-install` → `install: false, docker: false`; `--skip-docker` → `docker: false`, `install: true`.
- `--no-git` → `git: false`; `--yes` → `yes: true`; `--setup` → `setup: true`.
- `--setup --skip-install` and `--setup --skip-docker` → throw `--setup needs npm install and Docker; drop --skip-install/--skip-docker`.
- `--cli-source x.tgz` → `cliSource: "x.tgz"`.
- `--storage s3` → `storage: "s3"`; `--storage gcs` → throw `--storage: use local or s3`.
- `--s3-endpoint https://s3.example.com` without `--storage s3` → throw `--s3-endpoint needs --storage s3`
  (same for `--s3-access-key-id`, `--s3-secret-access-key`).
- `--storage s3 --s3-endpoint ftp://x` → throw `--s3-endpoint: expected an http(s) URL`.
- `--yes --storage s3 --s3-endpoint https://s3.example.com` without both keys → throw
  `--storage s3 with --s3-endpoint needs --s3-access-key-id and --s3-secret-access-key (or drop --yes to be asked)`.
  With `http://localhost:9000` (local MinIO) no keys are needed.
- `--s3-secret-access-key 'a b'` → throws (via `envValueError`).
- Existing `--kit`/`--kit-version` rules stay (value required, not together, x.y.z with optional `v`).
- No positional, or `""` → throw starting with `Missing project directory.`; two positionals → throw
  `Unexpected argument: <second>`; unknown flag `--nope` → throw `Unknown option: --nope`.
- A value flag without a value (`--title` last) → throw `--title needs a value`.

### validate

- `titleError("Acme Shop")`, `titleError("Zażółć & Co's")` → `null`; `titleError("")`, `titleError("   ")`,
  `titleError("x".repeat(61))` → message; `"x".repeat(60)` → `null`.
- Each of `A"B`, `A\B`, `A<B`, `A>B`, `A$B`, `` A`B ``, `A\nB`, `A\tB`, `A\u007fB` → message
  `Title: use 1-60 characters without quotes, backslashes, <, >, $, backticks or control characters`.
- `adminEmailError("admin@example.com")`, `("first.last+tag@sub.example.co")` → `null`; `""`, `"admin"`,
  `"a@b"`, `"a b@example.com"`, `"a@-x.com"`, `"a'b@example.com"`, a 255-character address → message
  `Admin email: expected an address like admin@example.com`.
- `envValueError("S3 secret", "abc/DEF+123=")` → `null`; `""` → `S3 secret: required`; `"a b"`, `'a"b'`, `"a'b"`,
  `"a\\b"`, `"a#b"`, `"a$b"`, `` "a`b" `` → `S3 secret: no spaces, quotes, backslashes, #, $ or backticks`.

### node-version / kit-engines

- `parseEnginesRange(">=22")` → `[{ from: "22.0.0" }]`; `">= 22.12"` → `[{ from: "22.12.0" }]`;
  `"^22"` → `[{ from: "22.0.0", belowMajor: 23 }]`;
  `"^24.0.0 || ^22.12.0"` → `[{ from: "22.12.0", belowMajor: 23 }, { from: "24.0.0", belowMajor: 25 }]` (sorted);
  `"22.x"`, `"~22.1.0"`, `"*"`, `""`, `"^22 ||"` → `null`.
- With ranges of `"^22.12.0 || ^24.0.0 || ^26.0.0"` and `willInstall: true`:
  `20.11.0` and `22.11.0` → refuse, first line `Node <v> is too old: GatoJS needs Node ^22.12.0 || ^24.0.0 || ^26.0.0.`;
  `23.3.0`, `25.1.0` → refuse, first line `Node <v> is an unsupported odd-numbered release line: GatoJS supports Node ^22.12.0 || ^24.0.0 || ^26.0.0.`;
  `27.0.0` → refuse, first line `Node 27.0.0 is too new: GatoJS supports Node ^22.12.0 || ^24.0.0 || ^26.0.0.`;
  `22.12.0`, `24.15.0`, `26.1.0` → ok. The refusal contains
  `Stopping before anything is downloaded: create-gato-app runs npm install under this Node.` and `nvm install 22`.
- Even major between ranges (ranges `^20.0.0 || ^24.0.0`, Node `22.1.0`) → `Node 22.1.0 is an unsupported release line: …`.
- `willInstall: false` → `warn`, message starts `Warning: Node <v> is too old` and contains `--skip-install`.
- `nodeRangesFromPackageJson({ engines: { node: "^22.12.0 || ^24.0.0" } })` → ranges as parsed, `warning: null`;
  `{}`, `{ engines: {} }`, `null`, `"x"` → `SUPPORTED_NODE_RANGES` (`[{ from: "22.0.0" }]`), `warning: null`;
  `{ engines: { node: "22.x" } }` → `SUPPORTED_NODE_RANGES`, warning
  `The kit's Node range "22.x" is not one create-gato-app understands; checking against >=22 instead.`
- `readKitPackageJson(dir)` → parsed `<dir>/package.json`; missing file → throws `<dir> is not a GatoJS checkout (no package.json)`.

### github

- `packageJsonUrl("0.9.0")` → `https://api.github.com/repos/webamigos/gatojs/contents/package.json?ref=v0.9.0`.
- `fetchKitPackageJson` decodes `{ encoding: "base64", content: <base64 with newlines> }` into the parsed object; sends
  `Authorization: Bearer <token>` only with a token; any other payload → throws
  `GitHub returned an unexpected package.json for kit v0.9.0`; HTTP errors as `request` (401 with token →
  `GitHubTokenRejectedError`, 404 message).

### kit-modules

- A kit dir with `kit/modules/{core,uploads,api-keys,needs-demo,demo}.json` → `readKitModules` returns all but core,
  sorted by name, each `{ name, description, requires }` (`requires` default `[]`).
- `parseKitModule({ name: "x" }, "kit/modules/x.json")` → `{ name: "x", description: "", requires: [] }`;
  `null`, `{}`, `{ name: 3 }`, `{ name: "x", requires: "y" }` → throw `kit/modules/x.json is not a valid module manifest`.
- `withRequired(["needs-demo"], modules)` → `["demo", "needs-demo"]` (order of `modules`, i.e. by name);
  `withRequired(["core", "uploads"], …)` → `["uploads"]`; `withRequired(["nope"], …)` → throw
  `Unknown module "nope". Available: api-keys, demo, needs-demo, uploads.`; transitive requires are followed.

### questions (`collectAnswers`, slug `acme-shop`)

- `displayName("acme-shop")` → `"Acme Shop"`.
- `--yes`, nothing else → `{ modules: [], locales: ["pl", "en"], title: "Acme Shop", adminEmail: null, storage: null,
  setup: true }`; the prompter is never called.
- `--yes --modules uploads` → `storage: { provider: "local" }`. `--yes --modules needs-demo` → modules
  `["demo", "needs-demo"]`.
- `--yes --modules uploads --storage s3` → `{ provider: "s3", endpoint: "http://localhost:9000",
  accessKeyId: "minioadmin", secretAccessKey: "minioadmin", localMinio: true }`.
- `--yes --modules uploads --storage s3 --s3-endpoint https://s3.example.com --s3-access-key-id AK
  --s3-secret-access-key SK` → `{ provider: "s3", endpoint: "https://s3.example.com", accessKeyId: "AK",
  secretAccessKey: "SK", localMinio: false }`.
- `--storage s3` without `uploads` in the modules → `storage: null`.
- Interactive, nothing given, answers: modules `["uploads"]`, English yes, title default, email `""`,
  storage `local`, setup yes. Calls in order: `multiselect` (message `Modules (space to toggle, enter to confirm)`,
  options `{ value: <name>, label: <name>, hint: <description> }` for every module, `initialValues: []`),
  `confirm` (`Add English? Polish is always included.`, initial `true`), `text` (`Display name`, default
  `"Acme Shop"`), `text` (`First admin's email (empty to skip)`, default `""`), `select` (`File storage for uploads`,
  options `local` and `s3`, initial `"local"`), `confirm` (`Start the database with Docker, run migrations and create the admin now?`,
  initial `true`). Result: locales `["pl", "en"]`, adminEmail `null`, storage local, setup true.
- English answered no → `locales: ["pl"]`.
- The title `validate` returns the `titleError` message for `A"B` and `undefined` for `Acme`; the email `validate`
  returns `undefined` for `""` and `a@b.co`, the `adminEmailError` message for `nope`. A typed title is trimmed.
- Storage `s3`, endpoint answered `https://s3.example.com` → `text` for the access key id, `password` for the secret
  (both validated with `envValueError`); endpoint answered `http://localhost:9000` → no key questions, minioadmin keys.
  The endpoint `text` (`S3 endpoint (http://localhost:9000 = local MinIO started with Docker)`) has default
  `http://localhost:9000` and rejects a non-http(s) value.
- Flags skip their question (`--title X` → no title `text`; `--modules ""` → no `multiselect`; `--locales pl` → no
  English confirm; `--admin-email` → no email `text`; `--storage local` → no storage `select`).
- `install: false` or `docker: false` → `setup: false` and no setup question; `--setup` → `setup: true`, no question.
- A prompter that throws `CancelledError` → `collectAnswers` rejects with it.

### env-file

- `setEnvValues("A=1\nB=2\n", { B: "x" })` → `"A=1\nB=x\n"`; `("A=1\n", { C: "3" })` → `"A=1\nC=3\n"`;
  `("A=1", { C: "3" })` → `"A=1\nC=3\n"`; `("BB=2\n# B=old\n", { B: "x" })` → `"BB=2\n# B=old\nB=x\n"`;
  `("B=1\n", { B: "$&$1" })` → `"B=$&$1\n"`.
- `readEnvValue("A=1\nB=two\n", "B")` → `"two"`; missing → `null`; `"BB=2"` does not match `B`.
- `randomSuffix(Uint8Array.from([0, 1, 2, 35, 36, 255]))` → `"abc9ad"`; any 6 bytes → `/^[a-z0-9]{6}$/` (property).
- `composeProjectName("acme-shop", "abc9ad")` → `"acme-shop-abc9ad"`.
- `wizardEnvValues({ existing: "A=1\n", slug: "acme-shop", suffix: "abc9ad", storage: null })` →
  `{ COMPOSE_PROJECT_NAME: "acme-shop-abc9ad" }`; with `existing` containing `COMPOSE_PROJECT_NAME=old` → no
  `COMPOSE_PROJECT_NAME` key; storage local → `+ { STORAGE_PROVIDER: "local" }`; storage s3 → `+ { STORAGE_PROVIDER: "s3",
  S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY }` with the answered values.

### compose-ports

- On the kit's own `docker-compose.yml` (copy it into the test as a literal), profiles `[]`, env `{}` →
  `[{ service: "db", variable: "DB_PORT", port: 5432 }, { service: "mail", variable: "MAILPIT_UI_PORT", port: 8025 },
  { service: "mail", variable: "MAILPIT_SMTP_PORT", port: 1025 }]`; profiles `["s3"]` → the same plus
  `{ minio, MINIO_PORT, 9000 }`, `{ minio, MINIO_CONSOLE_PORT, 9001 }` (minio-init publishes nothing).
- env `{ DB_PORT: "5544" }` → db port 5544; `{ DB_PORT: "abc" }` or `""` → 5432.
- A literal mapping `- "8080:80"` → `{ service, variable: null, port: 8080 }`; `- 3000` (container port only) → nothing;
  unquoted `- ${X_PORT:-7000}:70` → `{ variable: "X_PORT", port: 7000 }`.
- `suggestFreePort(5432, busy = p => p === 5433, taken = [5434])` → `5435`; all busy within
  `FREE_PORT_SEARCH_LIMIT` (100) → `null`; never returns the busy port itself.
- `portSettings({ busy: [db 5432], free: Map{5432→5433}, envText: "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/acme_shop\nSMTP_URL=smtp://localhost:1025\n" })`
  → `["DB_PORT=5433", "DATABASE_URL=postgresql://postgres:postgres@localhost:5433/acme_shop"]`.
  Busy `MAILPIT_SMTP_PORT` 1025→1026 → `["MAILPIT_SMTP_PORT=1026", "SMTP_URL=smtp://localhost:1026"]`.
  `127.0.0.1:5432` is rewritten too; `localhost:54320` is not. Free `null` → `["DB_PORT=<free port>"]` and no
  dependent lines. `variable: null` → no line.
- `busyPortsReport([db 5432], ["DB_PORT=5433", "DATABASE_URL=…"])` →
  `["Port 5432 (DB_PORT, service db) is already in use, so the Docker services were not started.",
  "Set free ports in .env, then run the remaining steps below:", "  DB_PORT=5433", "  DATABASE_URL=…"]`;
  a `variable: null` port reads `Port 8080 (service web) is already in use, …`.

### port-probe

- A server listening on `127.0.0.1:<p>` → `isPortBusy(p)` is `true`; after it closes → `false`.

### next-steps

- `shellQuote("my-app")` → `"my-app"`; `"my app"` → `"'my app'"`; `"it's"` → `"'it'\\''s'"`; `""` → `"''"`.
- `displayDir("/w", "/w/my-app")` → `"my-app"`; `("/w", "/w")` → `"."`; `("/w", "/x/app")` → `"/x/app"`;
  `("/w", "/w/a b")` → `"a b"` (quoting happens in `nextSteps`).
- Nothing done (`git: true`, every flag false, `adminEmail: null`, dir `my-app`, profiles `[]`) →
  `["cd my-app", "npm install", "docker compose up -d", "npx prisma migrate dev --name init",
  "git add -A && git commit -m \"chore: initial commit\"", "npm run admin:create -- --email <your-email>", "npm run dev"]`.
- Everything done → `["cd my-app", "npm run dev"]`; dir `.` → no `cd`; dir `a b` → `cd 'a b'`;
  profiles `["s3"]` → `docker compose --profile s3 up -d`; `git: false` → no commit line;
  `adminEmail: "a@b.co"` → `npm run admin:create -- --email a@b.co`.

### delegate

- `gatoCreateCommand({ nodePath: "/n", gatoBin: "/g.mjs", kitDir: "/k", projectDir: "/w/acme-shop",
  answers: { modules: ["uploads"], locales: ["pl", "en"], title: "Acme Shop", adminEmail: "a@b.co" }, cliSource: "/c.tgz" })`
  → `{ command: "/n", args: ["/g.mjs", "create", "/w/acme-shop", "--yes", "--no-install", "--no-git",
  "--modules=uploads", "--locales=pl,en", "--title=Acme Shop", "--admin-email=a@b.co", "--cli-source=/c.tgz", "--kit=/k"] }`;
  without email and cliSource those two entries are absent; modules `[]` → `"--modules="`.

### cli (`run`) with fakes: fake spawn writes the project files when it sees `gato create`

Project fixture written by the fake `gato create`: `.env` (`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/my_app`,
`BETTER_AUTH_SECRET=<43 chars>`, `ADMIN_EMAIL=`, uploads lines), `docker-compose.yml` (the kit's), `.wa/kit.json`
(`{"kitVersion":"0.9.0"}`). The local kit fixture has `package.json` with `engines.node` and `kit/modules/*.json`.

- `my-app --kit <kit> --yes --skip-docker` → spawns, in order: `node <gato> create <cwd>/my-app --yes --no-install
  --no-git --modules= --locales=pl,en --title=My App --kit=<kit>` (stdio pipe), `git init -q`, `npm install`,
  `git add -A`, `git commit -q --no-verify -m "chore: initial commit from GatoJS v0.9.0"` (cwd = project); no
  `docker`, no `npx prisma`; exit 0; `.env` has `COMPOSE_PROJECT_NAME=my-app-` + 6 chars of `[a-z0-9]` derived
  from `randomBytes`; the `Next steps` note lists `docker compose up -d`, `npx prisma migrate dev --name init`,
  `npm run admin:create -- --email <your-email>`, `npm run dev` and not `npm install` nor `git commit`.
- `--skip-install` → only `gato create` and `git init -q`; exit 0; next steps start `cd my-app`, `npm install`.
- `--yes` (setup), all ports free → `docker info`, `docker compose up -d --wait`, `git init -q`, `npm install`,
  `npx prisma migrate dev --name init`, `git add -A`, `git commit …` in this order; `.env` already holds
  `COMPOSE_PROJECT_NAME` when `docker compose up` runs; with `--admin-email a@b.co` also
  `npm run admin:create -- --email a@b.co` (stdio `inherit`) after migrate and before `git add`; next steps are
  `cd my-app`, `npm run dev`; exit 0.
- `--modules uploads --storage s3` with setup → `docker compose --profile s3 up -d --wait`; ports 9000/9001 are probed;
  `.env` has `STORAGE_PROVIDER=s3`, `S3_ENDPOINT=http://localhost:9000`.
- Port 5432 busy (`isPortBusy` true only for 5432) → no `docker info`, no `docker compose`, no migrate;
  `git init`, `npm install`, commit still run; exit 1; error output contains `DB_PORT=5433` and
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/my_app`; next steps contain `docker compose up -d`.
- `DB_PORT=5544` in `deps.env` → 5544 is probed instead of 5432.
- `docker info` exits 1 → no compose; exit 1; error contains `Docker is not available`.
- `docker compose up` exits 1 → no migrate, no admin; commit still runs; exit 1; error contains `docker compose up failed`.
- `npm install` exits 1 → no migrate, no commit; exit 1; error contains `npm install failed`; next steps contain `npm install`.
- `npx prisma migrate dev` exits 1 → no admin:create; commit runs; exit 1.
- `git commit` exits 1 → warning containing `Could not create the first commit`; exit 0; next steps contain the commit line.
- `--no-git` → no `git` spawn at all.
- `gato create` exits 2 with stderr `boom` → exit 1, error contains `boom`; nothing else spawned.
- Target directory exists and is not empty → exit 1, error `Directory <abs> exists and is not empty; choose another name or empty it.`,
  no fetch, no spawn. An existing empty directory is fine.
- `interactive: false` without `--yes` → exit 1, error starts `No terminal for questions: pass --yes`, no fetch.
- Invalid `--title` → exit 1 before any fetch or spawn.
- Kit `package.json` with `engines.node: "^24.0.0"` and Node `v22.23.2` → exit 1, error contains `too old`, nothing
  spawned; with `--skip-install` → warning and the run continues.
- Download path (no `--kit`): fetches the tag list, then `contents/package.json?ref=v<version>`, refuses an old Node
  before the tarball URL is fetched; a kit without `engines.node` uses `>=22`.
- Prompter throws `CancelledError` → exit 1, error `Cancelled; nothing was written.`, no `gato create`, target not created.
- Existing download, token and temp-dir behaviour stays (temp dir removed after success and failure).

### gato-cli secrets

- `generateSecret("secret-32", n => new Uint8Array(n))` → `"A".repeat(43)`; `"secret-64"` → `"A".repeat(86)`;
  `"hex-32"` → `"0".repeat(64)`; bytes all `255` with `hex-32` → `"f".repeat(64)`; with `secret-32` →
  `"_".repeat(42) + "w"`; requested sizes 32, 64, 32.
- `generatedVariables([core, demo with env DEMO_SECRET generate secret-64 and DEMO_TOKEN without])` →
  `[{ name: "BETTER_AUTH_SECRET", kind: "secret-32" }, { name: "DEMO_SECRET", kind: "secret-64" }]`; a manifest that
  also lists `BETTER_AUTH_SECRET` does not duplicate it.
- `withGeneratedSecrets("A=1\nDEMO_SECRET=example\n", [DEMO_SECRET secret-64], zeros)` →
  `"A=1\nDEMO_SECRET=" + "A".repeat(86) + "\n"`; a variable not in the text is not added; `# DEMO_SECRET=x` untouched.
- Schema: env `{ name, example, generate: "secret-64" }` parses and keeps `generate`; `generate: "secret-16"` fails.
- `create` with the demo fixture module carrying `DEMO_SECRET` (`generate: "secret-64"`): `.env` has
  `DEMO_SECRET=[A-Za-z0-9_-]{86}`, the example value is gone, `DEMO_TOKEN` keeps its example, two creates differ.

## Mutations to kill

- Node: odd major treated as ok; `belowMajor` off by one (`^22` accepting 23); range sort dropped; `--skip-install`
  refusing instead of warning; `--yes` bypassing the check; engines read after the tarball download.
- Validation: one forbidden character allowed; length 60/61 boundary; email without a dot in the domain accepted.
- Questions: a flag no longer skips its question; `--yes` asking anything; setup asked with `--skip-docker`;
  storage asked without uploads; requires closure dropped.
- `.env`: `COMPOSE_PROJECT_NAME` regenerated when present; suffix outside `[a-z0-9]` or not 6 long; a value replaced in a
  prefix-matching key (`BB` for `B`); `$&` interpreted.
- Ports: profile services always included or never; env override ignored; dependent URL not rewritten or rewritten
  for `54320`; busy port still running `docker compose up`.
- Order: commit before `npm install` or before migrate; `docker compose up` before `.env` has `COMPOSE_PROJECT_NAME`;
  admin:create without migrate; commit after a failed install.
- Exit code 0 after a busy port, failed install or failed migrate.
- Secrets: wrong byte count; hex vs base64url swapped; generated variable left at the example value; duplicate
  `BETTER_AUTH_SECRET`.
