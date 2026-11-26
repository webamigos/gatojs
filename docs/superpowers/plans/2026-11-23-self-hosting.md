# Self-hosting: implementation plan

**Goal:** a GatoJS project runs for a company that sends nothing to outside services. Production mail works through the company's own SMTP relay (or is explicitly off). The build fetches no fonts. Storage has documented S3-compatible presets and temporary credentials. A core `docker-compose.selfhost.yml` runs the whole app with a runbook for install, backup, restore and upgrade. An egress check proves at runtime that no container leaves the network. The `Dockerfile` builds for amd64 and arm64, and a Helm chart covers Kubernetes.

**Spec:** [docs/superpowers/specs/2026-11-22-self-hosting-design.md](../specs/2026-11-22-self-hosting-design.md), accepted by Patryk on 2026-11-23. His decisions are in its sections 8 and 9. Read it together with this plan.

**Execution:** Orca workers, one task per worker, each on its own branch from `main`, one PR per task. Order and parallelism follow spec section 6, split so that each PR fits a few hours:

```
wave 1 (parallel, all from main)
  Task 1 (mail providers, core) ─────────┬─────────────────────────────┐
  Task 2 (wizard mail question) ── merges after Task 1                  │
  Task 3 (self-hosted Inter + no-fetch/no-telemetry tests) ─────────┐   │
  Task 4 (storage presets + S3_SESSION_TOKEN) ──────────────────────┼───┤
  Task 5 (gato-cli: self-host regions) ─────────────────────────────┼───┤
  Task 8 (multi-arch build check) ── independent                    │   │
                                                                    │   ▼
wave 2                                       Task 6 (selfhost compose, .env.selfhost.example, runbook)
                                                                    │   │ after 1, 4, 5
wave 3 (parallel; Task 10, image publishing + Railway, after 6 and 8)                                                   ▼   ▼
                                     Task 7 (egress check + workflow)   Task 9 (Helm chart + helm.yml)
                                     after 6 (and 3 for a clean run)    after 6
```

- Tasks 1, 3, 4, 5 and 8 start together. Task 2 starts with them (the plan fixes the variable names) but merges after Task 1, because its smoke test assembles a project from the checked-out GatoJS repo and that project must know `MAIL_PROVIDER`.
- Task 6 needs Task 1 (`MAIL_PROVIDER=smtp` in `.env.selfhost.example`), Task 4 (`S3_SESSION_TOKEN` in the uploads env list) and Task 5 (the regions it fills).
- Task 7 needs Task 6 (the stack it seals). It also needs Task 3 merged: before it, the image still downloads nothing at runtime, but `next/font/google` would make the egress check's own build depend on Google.
- Task 9 needs Task 6 (same env contract and runbook).
- Spec step 7 (wizard questions) is Task 2, moved into wave 1 by decision 9.3. Self-host settings (`.env.selfhost`) stay out of the wizard (decision 9.3).

Several tasks bump `kit/modules/core.json` (Tasks 1, 3, 5, 6, 9), and Tasks 2 and 5 both bump `packages/create-gato-app`. The second PR to merge rebases and takes the next free version.

**Order across the extensibility and self-hosting plans** (set 2026-11-24, at most two workers at once). Two lanes, so that two running tasks never both change `packages/gato-cli` (version, `.wa/bin/wa.mjs`, the generator):

- Lane A, `gato-cli` and the generator, one task at a time: extensibility T2 → self-hosting T5 → extensibility T5 → extensibility T7, T9, T15 and the rest of the generator tasks.
- Lane B, no `gato-cli` changes: self-hosting T8 → extensibility T3 → extensibility T4 → self-hosting T6 (as soon as self-hosting T5 has merged; it jumps the queue) → self-hosting T7, T9 and T10 → extensibility T6 and T8 (after extensibility T5).

When a slot frees up, the next task of its lane starts if its dependencies have merged; otherwise the first ready task of the other lane that does not touch `gato-cli`. Versions (`gato-cli`, `create-gato-app`, `core`, `kitFormat`) are always the next free ones at merge time, whatever the task text says.

## Global constraints

- Rules in `CLAUDE.md`, `AGENTS.md` and `kit/CLAUDE.md` apply: no code comments except `// WHY:` (at most 3 lines) and tool directives; no `any`, nested ternaries or silent `catch {}`; Zod at external input; error class `name` as a string. Ragen files are references, not copies: their long doc comments do not come along.
- New content (code, docs, commit messages, test titles, env messages) is English. Existing Polish docs (`docs/07-i18n-mail-env.md`, `docs/10-wdrozenie.md`, `docs/15-modul-uploads.md`, `docs/16-cli-wa.md`, `docs/02b-rejestr-i-generator.md`, `kit/CLAUDE.md`) are edited in their current language until the English migration. If that migration has renamed a file by the time a task runs, follow the new name.
- Naming: new names say GatoJS or gato. "kit" stays only as a plain noun and in existing names (`.wa/kit.json`, `kit/modules/*.json`, `wa:*` regions, `npm run wa --`, `kit.yml`).
- New decisions are ADR files in `docs/adrs/` from `docs/adrs/TEMPLATE.md`, with an index row in `docs/adrs/README.md`. Numbers planned here: ADR-64 (Task 1), ADR-65 (Task 6), ADR-66 (Task 7). Take the next free number when writing; if another branch took it, renumber and fix links before merging. A non-obvious gotcha goes to `docs/lessons/` with its line in `docs/lessons.md`.
- Tests are written by the `test-writer` subagent from this plan and the named signatures, before implementation, with a red run for the right reason. During implementation the phase file holds `implement` in the worker's worktree: `.superpowers/phase` today, `.gato/phase` once agent-workflow Task 2 has merged (use the path the `protect-tests` hook on `main` reads). Then the `test-reviewer` subagent runs `npm run test:mutation:task -- <files>` (with `--prefix packages/gato-cli` or `--prefix packages/create-gato-app` for tool files) and `npm run test:mutation:gate`. Expected values are literals or come from the spec. Surviving mutants are classified; `allowed` entries are proposed, never added.
- Every GatoJS file change bumps the owning module's `version` in `kit/modules/<module>.json` (patch for fixes, minor for new behaviour), then `npm run wa -- kit sync && npm run wa -- generate`, committed, then `git diff --exit-code`. Core changes a module needs go in a separate commit from the module's own (`kit/CLAUDE.md`, "Modules and manifest").
- A new file outside an owned glob needs a manifest entry, and only the CLI gate notices (lesson `a-new-file-needs-an-owner-only-the-cli-gate-checks`). Kit-only files go on `kitOnly` in `kit/kit.json`.
- Gates before handing in: `npm run verify`, the CLI gate (`npm run verify --prefix packages/gato-cli`) when manifests or the CLI change, `npm run verify --prefix packages/create-gato-app` for wizard changes, `npm run test:integration` for env, mailer and storage code, and `npm run test:e2e` when the task touches runtime code. e2e resets `wa_app_e2e`: ask the coordinator for Patryk's consent text before each run (lesson `prisma-refuses-a-database-reset-from-an-agent`), and use your own ports, uploads directory and containers (lesson `parallel-worktrees-need-their-own-ports-and-dirs`).
- Use `127.0.0.1`, not `localhost`, for SMTP in tests and examples that send mail on macOS (lesson `smtp-localhost-is-slow-on-macos`).
- Conventional Commits, lowercase subjects, body lines ≤ 100 characters, footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, PR, tag or publish; the coordinator does that.
- docs.gatojs.com lives outside this repository. When a task changes behaviour documented there (mail, env variables, uploads, self-hosting), the report lists the pages to update. The coordinator files them for the website repo.
- Report: branch, commits, gate results with numbers, surviving mutants with classification, proposed `allowed` entries, anything unverified (with what was tried), gotchas, docs.gatojs.com pages to update.

---

### Task 1: Mail providers (`MAIL_PROVIDER`, SMTP by host, production rule) — ADR-64

**Branch:** `feat/mail-providers`

**Files:**
- `packages/env/src/core-env-schema.ts`, `coreEnvSchema`:
  - new fields: `MAIL_PROVIDER` (blank → undefined, then trimmed and lower-cased, then `z.enum(["smtp", "resend", "console"])`), `SMTP_HOST` (`optionalString()`), `SMTP_PORT` (blank → `587`, otherwise an integer 1–65535), `SMTP_USER`, `SMTP_PASS` (`optionalString()`), `SMTP_SECURE` (`flag()`);
  - the production refine on `RESEND_API_KEY` is removed and replaced by `.superRefine(mailRules)`. The `BETTER_AUTH_SECRET` refine stays.
- `packages/env/src/mail.ts` (new), exported from `packages/env/src/index.ts`:
  - `type MailConfig = { provider: "smtp"; transport: string } | { provider: "smtp"; transport: SmtpOptions } | { provider: "resend"; apiKey: string } | { provider: "console"; explicit: boolean }`, where `SmtpOptions = { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } }`;
  - `resolveMailConfig(env: Pick<CoreEnv, "MAIL_PROVIDER" | "SMTP_URL" | "SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASS" | "SMTP_SECURE" | "RESEND_API_KEY">): MailConfig` (pure; explicit `MAIL_PROVIDER` first, then detection: SMTP (`SMTP_URL` or `SMTP_HOST`) wins over Resend, as today);
  - `mailRules: EnvRule`, built from `requiredForProvider("MAIL_PROVIDER", "resend", ["RESEND_API_KEY"])`, `allOrNone(["SMTP_USER", "SMTP_PASS"], "SMTP authentication")` and three local rules: SMTP needs a host or a URL, `SMTP_URL` excludes the split variables (decision 9.1), production needs a provider.
- `src/shared/lib/mailer.ts`: `sendTransactionalEmail` calls `resolveMailConfig(env)` instead of reading `SMTP_URL`/`RESEND_API_KEY`. `getSmtpTransport` takes `string | SmtpOptions` and passes it to `nodemailer.createTransport`. `deliverViaSmtp` keeps `from: env.EMAIL_FROM`. The `console` branch keeps today's `logger.info(<message>, { to, subject })` and `{ data: null }`, with the message `"[MAILER] mail provider is console, email not sent"`.
- `.env.example` (core part, above the `wa:modules` region): after `SMTP_URL=smtp://localhost:1025` add `MAIL_PROVIDER=`, `SMTP_HOST=`, `SMTP_PORT=`, `SMTP_USER=`, `SMTP_PASS=`, `SMTP_SECURE=`. `SMTP_URL` stays, so mailpit in dev and e2e keeps working (`e2e/env.ts`, `docker-compose.yml` unchanged).
- Tests to update (test-writer): `packages/env/src/__tests__/core-env-schema.test.ts` (the `RESEND_API_KEY` production cases at lines ~270 and ~344–358), `packages/env/src/__tests__/env-check.test.ts` (the report at ~210 and ~311–322), `src/__tests__/architecture/env-example-passes-validation.test.ts` (~128), `src/shared/lib/__tests__/mailer.test.ts` (new `envMock` fields; existing Polish test titles may stay). New: `packages/env/src/__tests__/mail.test.ts`.
- Docs:
  - ADR-64 `docs/adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md` supersedes the production `RESEND_API_KEY` rule of D17 and the matching note in D18. Add an index row and a status line under D17 and D18 in `docs/decyzje.md` pointing to ADR-64.
  - `AGENTS.md` "Mail" section (two lines; stay inside the agent-instructions budget, `src/__tests__/architecture/agent-instructions-fit-the-budget.test.ts`).
  - `docs/07-i18n-mail-env.md` (Polish) and `docs/10-wdrozenie.md` "Zmienne produkcyjne" (Polish): the provider table and the production rule.
  - Report lists docs.gatojs.com `guides/email` and `configuration/environment-variables`.
- `kit/modules/core.json`: minor bump.

**Behaviours** (`parseCore` = `parseEnv(source, [])` with the minimal valid core config, as in `core-env-schema.test.ts`):
- `resolveMailConfig(parseCore({ SMTP_URL: "smtp://127.0.0.1:1025" }))` → `{ provider: "smtp", transport: "smtp://127.0.0.1:1025" }`.
- `SMTP_HOST: "relay.internal"` → `{ provider: "smtp", transport: { host: "relay.internal", port: 587, secure: false } }`, with no `auth` key.
- `SMTP_HOST: "relay.internal", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "app", SMTP_PASS: "pw"` → `{ provider: "smtp", transport: { host: "relay.internal", port: 465, secure: true, auth: { user: "app", pass: "pw" } } }`.
- `RESEND_API_KEY: "re_x"` → `{ provider: "resend", apiKey: "re_x" }`; `SMTP_HOST: "relay.internal", RESEND_API_KEY: "re_x"` → the SMTP config.
- Nothing set → `{ provider: "console", explicit: false }`; `MAIL_PROVIDER: "console", SMTP_HOST: "relay.internal"` → `{ provider: "console", explicit: true }`.
- `MAIL_PROVIDER: " Resend ", RESEND_API_KEY: "re_x", SMTP_URL: "smtp://127.0.0.1:1025"` → `{ provider: "resend", apiKey: "re_x" }` (explicit choice wins over detection).
- `checkEnv` issues, as literal `{ name, message }`:
  - `NODE_ENV: "production"`, no mail variables → `[{ name: "MAIL_PROVIDER", message: "no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail" }]`;
  - production with `MAIL_PROVIDER: "console"`, with only `SMTP_HOST`, with only `SMTP_URL`, or with only `RESEND_API_KEY` → no issue. Existing Railway deploys with a Resend key keep starting.
  - `SMTP_URL` and `SMTP_HOST` both set (any `NODE_ENV`) → `[{ name: "SMTP_HOST", message: "SMTP_URL is set: drop SMTP_HOST, or drop SMTP_URL and use SMTP_HOST" }]`; the same message shape for `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_SECURE` next to `SMTP_URL` (open question 1);
  - `MAIL_PROVIDER: "smtp"` without host or URL → `[{ name: "SMTP_HOST", message: "SMTP_HOST or SMTP_URL is required when MAIL_PROVIDER is \"smtp\"" }]`;
  - `MAIL_PROVIDER: "resend"` without a key → `[{ name: "RESEND_API_KEY", message: "RESEND_API_KEY is required when MAIL_PROVIDER is \"resend\"" }]`;
  - `MAIL_PROVIDER: "sendgrid"` → one issue named `MAIL_PROVIDER`;
  - `SMTP_HOST` + `SMTP_USER` without `SMTP_PASS` → `[{ name: "SMTP_USER", message: "SMTP authentication is half-configured: SMTP_USER, SMTP_PASS must all be set or all be omitted (missing: SMTP_PASS)" }]`;
  - `SMTP_PORT` of `"0"`, `"65536"`, `"25.5"` or `"abc"` → one issue named `SMTP_PORT`; `"   "` → parsed `587`.
- `formatEnvReport` for production without a provider → `"Invalid environment variables (1):\n- MAIL_PROVIDER: no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail"`.
- Mailer (only `nodemailer`, `resend` and the logger mocked):
  - host config → `createTransport` called once with `{ host: "relay.internal", port: 587, secure: false }`;
  - with user → the same plus `auth: { user: "app", pass: "pw" }`;
  - `SMTP_URL` → `createTransport("smtp://127.0.0.1:1025")` (unchanged);
  - explicit `console` with `SMTP_HOST` set → no transport and no Resend call, `info` called with `{ to, subject }`, result `{ data: null }`.
- `.env.example` still passes `env-example-passes-validation` and `src/__tests__/env-example.test.ts`.

**Mutations to kill:** SMTP/Resend precedence reversed; explicit `MAIL_PROVIDER` ignored in favour of detection; `auth` set when `SMTP_USER` is unset; default port not 587; `secure` defaulting to true; production rule removed or applied outside production; `console` accepted only when unset; the `SMTP_URL` + `SMTP_HOST` conflict check removed; port bounds off by one.

**Lessons:** `smtp-localhost-is-slow-on-macos`, `vitest-runs-what-tsc-rejects`.

---

### Task 2: Wizard mail question and `--mail-provider` (`create-gato-app` 0.3.0)

**Branch:** `feat/wizard-mail-provider` (in parallel with Task 1, merges after it)

**Files:**
- `packages/create-gato-app/src/args.ts`:
  - `type MailProvider = "smtp" | "resend" | "console"`;
  - `CreateCliArgs` += `mailProvider`, `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `resendApiKey` (all `| null`);
  - `parseMail(values)` next to `parseStorage`, and `assertMailCredentials(args)` next to `assertExternalS3Keys`;
  - `USAGE` lines for `--mail-provider <smtp|resend|console>`, `--smtp-host <host>`, `--smtp-port <port>`, `--smtp-user <user>`, `--smtp-pass <pass>`, `--resend-api-key <key>`.
- `packages/create-gato-app/src/questions.ts`:
  - `MailAnswer = { provider: "smtp"; localMailpit: true } | { provider: "smtp"; localMailpit: false; host: string; port: number; user: string | null; pass: string | null } | { provider: "resend"; apiKey: string } | { provider: "console" }`;
  - `LOCAL_MAILPIT_HOST = "127.0.0.1"`;
  - `askMail(context)` after `askStorage` in `collectAnswers`. It uses a `select` with options `smtp` (hint "local mailpit in development, or your own relay"), `resend` and `console`, default `smtp`. For `smtp` it asks the host (default `LOCAL_MAILPIT_HOST`); for another host it asks the port (default 587), the user (empty = no authentication) and, with a user, the password. For `resend` it asks for the key (`password`, validated with `envValueError`);
  - `Answers` += `mail: MailAnswer`.
- `packages/create-gato-app/src/env-file.ts`: `wizardEnvValues` takes `mail` and adds `mailValues(mail)`. `packages/create-gato-app/src/wizard.ts` `writeWizardEnv` passes `answers.mail`.
- `packages/create-gato-app/README.md` (flags), `packages/create-gato-app/package.json` `version` 0.2.0 → 0.3.0. The `gato-cli` pin is unchanged.
- `.github/workflows/packages.yml` job `smoke` (via `packages/create-gato-app/scripts/smoke-pack.sh`): one extra run with `--yes --mail-provider console`. The assembled project's `.env` (not `.env.example`) must pass `checkEnv` from `@gatojs/env` with the project's module schemas, run inside the project with `npx tsx`.

**Behaviours:**
- `parseCliArgs(["app", "--mail-provider", "sendgrid"])` → throws `"--mail-provider: use smtp, resend or console"`.
- `parseCliArgs(["app", "--smtp-host", "relay.internal"])` → throws `"--smtp-host needs --mail-provider smtp"`; the same for `--smtp-port`, `--smtp-user` and `--smtp-pass`. `--resend-api-key` without `--mail-provider resend` → `"--resend-api-key needs --mail-provider resend"`.
- `--mail-provider smtp --smtp-port 70000` → throws `"--smtp-port: expected a port 1-65535"`.
- `--yes --mail-provider resend` without `--resend-api-key` → throws `"--mail-provider resend needs --resend-api-key (or drop --yes to be asked)"`. `--yes --mail-provider smtp --smtp-user app` without `--smtp-pass` → throws `"--smtp-user needs --smtp-pass (or drop --yes to be asked)"`.
- `collectAnswers` with `--yes` and no mail flags → `mail: { provider: "smtp", localMailpit: true }` and no prompt.
- `wizardEnvValues` mail part, as exact objects (with `existing` already holding `COMPOSE_PROJECT_NAME`, so only mail keys appear):
  - `{ provider: "smtp", localMailpit: true }` → `{}` (the `.env.example` `SMTP_URL` stays);
  - `{ provider: "smtp", localMailpit: false, host: "relay.internal", port: 587, user: null, pass: null }` → `{ MAIL_PROVIDER: "smtp", SMTP_URL: "", SMTP_HOST: "relay.internal", SMTP_PORT: "587" }`;
  - the same with `user: "app", pass: "pw"` → also `SMTP_USER: "app", SMTP_PASS: "pw"`;
  - `{ provider: "resend", apiKey: "re_x" }` → `{ MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x", SMTP_URL: "" }`;
  - `{ provider: "console" }` → `{ MAIL_PROVIDER: "console", SMTP_URL: "" }`.
- `setEnvValues` on a `.env.example` copy with those values leaves exactly one `SMTP_URL=` line, which is empty (the both-set error of decision 9.1 cannot happen).
- Interactive run (fake prompter, `src/__tests__/fake-prompter.ts`): choosing `smtp` and the default host asks no port or user.
- Smoke: the assembled project with `--mail-provider console` passes its env check.

**Mutations to kill:** `SMTP_URL` not blanked for a non-mailpit SMTP host; `SMTP_USER` written when empty; the flag-needs-provider checks removed; port bounds off by one; `--yes` asking a question.

**Release:** after merge, the coordinator tags `create-gato-app@0.3.0` (staged publishing runbook in `kit/CLAUDE.md`).

---

### Task 3: Self-hosted Inter and the no-fetch / no-telemetry architecture tests

**Branch:** `feat/self-hosted-fonts`

**Files:**
- `src/app/fonts/` (new): `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2`, `LICENSE-inter.txt` (SIL OFL 1.1), taken from Fontsource `@fontsource-variable/inter` at one pinned version. Ragen's copies in `apps/web/src/app/fonts/` are the same files; record the Fontsource version and the SHA-256 of each file in the PR body.
- `src/app/fonts/fonts.ts`: `interLatin` and `interLatinExt` with `next/font/local` as in Ragen's `apps/web/src/app/fonts/fonts.ts`:
  - `weight: "100 900"`, `display: "swap"`, variables `--font-inter-latin` and `--font-inter-latin-ext`, Google's `unicode-range` for each subset;
  - `adjustFontFallback: false` and `preload: true` on latin; `preload: false` on latin-ext, which keeps the metric-adjusted fallback. One `// WHY:` line on the latin `adjustFontFallback`;
  - `export const fontVariables = [interLatin.variable, interLatinExt.variable].join(" ")`. Loader options are literals (Next reads them statically).
- `src/app/layout.tsx`: drop the `next/font/google` import. `<html className={`${fontVariables} antialiased`}>`.
- `src/app/globals.css`: `--font-sans: var(--font-inter-latin), var(--font-inter-latin-ext), ui-sans-serif, system-ui, sans-serif;`.
- `Dockerfile`: `ENV CHECKPOINT_DISABLE=1` in the `runner` stage next to `NEXT_TELEMETRY_DISABLED=1`, because `prisma migrate deploy` in the image otherwise calls Prisma's checkpoint server (Ragen's `third-party-telemetry-stays-off` checks the same). The `builder` stage gets it too, for `prisma generate`.
- Architecture tests in `src/__tests__/architecture/` with detection functions in `scripts/lib/architecture/`:
  - `fonts-are-not-fetched-at-build.test.ts` + `scripts/lib/architecture/fonts.ts` (`findRemoteFontImports(source)`, `findMissingLocalFontFiles(root)`, `checkFonts(root)`): no `next/font/google` import (static or dynamic) in `src/**` or `packages/*/src/**`; every `src:` path of a `next/font/local` call exists; `src/app/fonts/` has a `LICENSE-*.txt` for each font family.
  - `third-party-telemetry-stays-off.test.ts` + `scripts/lib/architecture/telemetry.ts` (`dockerfileStageEnv(dockerfile, stage)`, `findAnalyticsPackages(packageJson)`, `findHardcodedAnalyticsIds(source)`, `checkTelemetry(root)`):
    - `builder` and `runner` set `NEXT_TELEMETRY_DISABLED=1` and `CHECKPOINT_DISABLE=1`;
    - neither the root `package.json` nor `kit/modules/core.json` (when present) depends on `@vercel/analytics`, `@vercel/speed-insights`, `posthog-js`, `posthog-node`, `mixpanel-browser`, `@segment/analytics-next`, `@amplitude/analytics-browser`, `react-ga4` or `@hotjar/browser`;
    - no hard-coded Google Analytics, Tag Manager or PostHog id (Ragen's `analytics-ids-are-not-hardcoded` patterns) in `src/**`.
- `kit/modules/core.json`: `files` += `src/app/fonts/**` (the `src/app/*` glob does not reach a subdirectory; confirm with the CLI gate); minor bump.
- Lesson `docs/lessons/a-build-that-fetches-fonts-fails-on-googles-answer.md` (category `ci`), adapted from Ragen's lesson of the same name, with the GatoJS fix.
- `docs/02-architektura.md` (Polish): one line on self-hosted fonts and the two tests.

**Behaviours:**
- `findRemoteFontImports('import { Inter } from "next/font/google";')` → `["next/font/google"]`; `'import x from "next/font/local";'` → `[]`; `'await import("next/font/google")'` → `["next/font/google"]`.
- `checkFonts` on a fixture directory with `localFont({ src: "./missing.woff2" })` in `src/app/fonts/fonts.ts` → `["src/app/fonts/fonts.ts: ./missing.woff2 does not exist"]`; on the repository → `[]`.
- `dockerfileStageEnv(<Dockerfile text>, "runner")` contains `"NEXT_TELEMETRY_DISABLED=1"` and `"CHECKPOINT_DISABLE=1"`. With `NEXT_TELEMETRY_DISABLED` removed from `runner` only, `checkTelemetry` → `["Dockerfile runner: NEXT_TELEMETRY_DISABLED=1 missing"]`.
- `findAnalyticsPackages({ dependencies: { "@vercel/analytics": "^1.0.0", zod: "^4" } })` → `["@vercel/analytics"]`.
- `findHardcodedAnalyticsIds('gtag("config", "G-ABC123XYZ9")')` → `["G-ABC123XYZ9"]`; `"GTM-AB12CD3"` and `"UA-12345678-1"` are reported; `"phc_"` followed by 43 alphanumerics is reported; `"G-Suite"` is not.
- `npm run build` succeeds with `fonts.googleapis.com` and `fonts.gstatic.com` unresolvable (for example `/etc/hosts` entries to `0.0.0.0` in the worker's shell, or the CI log of a build with them blocked). Polish text ("Zażółć gęślą jaźń") renders in Inter on the sign-in page: screenshot in the report, checked in the browser's font panel.

**Mutations to kill:** dynamic `import()` of `next/font/google` not caught; one Dockerfile stage not checked; the analytics deny list matched by prefix only; the id regex accepting `G-Suite`.

**Lessons:** `macos-lists-directories-in-sorted-order` (sort any directory listing in the detection functions), `next-security-notice-stops-the-first-build`.

---

### Task 4: Storage presets and `S3_SESSION_TOKEN` (`uploads` 0.3.0)

**Branch:** `feat/uploads-session-token`

**Files:**
- `src/features/uploads/env.ts`: `envSchema` += `S3_SESSION_TOKEN: optionalText`.
- `src/features/uploads/services/storage-env.ts`: `s3EnvSchema` += `S3_SESSION_TOKEN` (blank → undefined; `blankAsUndefined` from `@gatojs/env`).
- `src/features/uploads/contracts/storage.types.ts`: `S3StorageEnv` += `S3_SESSION_TOKEN?: string`.
- `src/features/uploads/services/s3-storage.ts` `createS3Storage`: `credentials` gets `sessionToken` only when the token is set.
- `kit/modules/uploads.json`: `env` += `{ "name": "S3_SESSION_TOKEN", "example": "", "required": false }` after `S3_SECRET_ACCESS_KEY`; `version` 0.2.7 → 0.3.0; `wa generate` adds `S3_SESSION_TOKEN=` to the `.env.example` region.
- Presets, verified where possible:
  - `.github/workflows/kit.yml` gets a new job `storage-presets` (kit-only workflow). Its matrix `store: [minio, rustfs]` starts the store (`cgr.dev/chainguard/minio` as in `ci/uploads.integration-steps.yml`; RustFS from `rustfs/rustfs` pinned by digest, credentials per its docs), creates the bucket with `amazon/aws-cli:2.39.2` and runs `npx vitest run --config vitest.integration.config.ts src/features/uploads/services/__tests__/storage.integration.test.ts` with `INTEGRATION_S3_ENDPOINT` and `INTEGRATION_S3_BUCKET`. The test today hard-codes `minioadmin` keys: add `INTEGRATION_S3_ACCESS_KEY_ID` and `INTEGRATION_S3_SECRET_ACCESS_KEY` with `minioadmin` as default.
  - `ci/uploads.integration-steps.yml` stays MinIO-only (it runs in every project).
- Docs: `docs/15-modul-uploads.md` (Polish) gets a preset table. Columns: provider, `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, notes, verified. Rows:
  - AWS S3: `https://s3.<region>.amazonaws.com`, `<region>`, `false`;
  - Cloudflare R2: `https://<account_id>.r2.cloudflarestorage.com`, `auto`, `false`;
  - Scaleway: `https://s3.<region>.scw.cloud`, `<region>`, `false`;
  - Backblaze B2: `https://s3.<region>.backblazeb2.com`, `<region>`, `false`;
  - MinIO: `http://minio:9000`, `us-east-1`, `true`;
  - RustFS: `http://rustfs:9000`, `us-east-1`, `true`.

  Check each cloud row against the provider's current docs and mark it "from the provider's docs, <date>, not run". Mark MinIO and RustFS "verified in CI (`kit.yml` `storage-presets`)". `S3_SESSION_TOKEN` is documented with AWS STS as the example. `docs/10-wdrozenie.md` "Własny serwer" links the table. The report lists docs.gatojs.com `modules/uploads`.

**Behaviours:**
- `resolveStorageEnv({ STORAGE_PROVIDER: "s3", S3_ENDPOINT: "http://127.0.0.1:9000", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_BUCKET: "b", S3_SESSION_TOKEN: "tok" }, "/app")` → `{ ok: true, env: { STORAGE_PROVIDER: "s3", S3_ENDPOINT: "http://127.0.0.1:9000", S3_REGION: "auto", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_BUCKET: "b", S3_FORCE_PATH_STYLE: false, S3_SESSION_TOKEN: "tok" } }`.
- The same with `S3_SESSION_TOKEN: "   "` or without it → `env` has no `S3_SESSION_TOKEN` value (`undefined`).
- `createS3Storage` with a token → `S3Client` constructed with `credentials: { accessKeyId: "k", secretAccessKey: "s", sessionToken: "tok" }`; without → `credentials` has exactly `accessKeyId` and `secretAccessKey`. The `S3Client` constructor is the I/O boundary that may be mocked.
- `storage.integration.test.ts` passes unchanged against MinIO and against RustFS in the `storage-presets` job.
- `.env.example` region contains `S3_SESSION_TOKEN=` right after `S3_SECRET_ACCESS_KEY=minioadmin`.

**Mutations to kill:** token dropped on the way to the client; a blank token passed as `""`; `sessionToken: undefined` key present when unset (if the test pins exact keys).

**Lessons:** `parallel-worktrees-need-their-own-ports-and-dirs` (RustFS on another port than MinIO locally).

---

### Task 5: gato-cli self-host regions (`selfhostCompose`, `env[].selfhostExample`) — `gato-cli` 0.4.0

**Branch:** `feat/cli-selfhost-regions`

Why: `docker-compose.selfhost.yml` and `.env.selfhost.example` are core files (decision 9.4), but the MinIO service and the module variables belong to modules. A module does not edit core files, so both files get `wa:*` regions filled from manifests, like `docker-compose.yml` and `.env.example` today. The dev values in `env[].example` are wrong for a production install (`STORAGE_LOCAL_PATH=./volumes/uploads` stops a production start, and dev keys must never ship), so a manifest can give a self-host value.

**Files:**
- `packages/gato-cli/src/manifest/schema.ts` `moduleManifestSchema`: `selfhostCompose: z.string().nullable().default(null)`; `env[]` item += `selfhostExample: z.string().optional()`.
- `packages/gato-cli/src/generate/targets.ts`:
  - `selfhostComposeBody` (like `composeBody`, reading `m.selfhostCompose`) and `selfhostEnvBody` (like `envBody`, using `selfhostExample ?? example`, placeholders filled the same way);
  - `regionTargets` += `{ file: "docker-compose.selfhost.yml", marker: "services", body: selfhostComposeBody }` and `{ file: ".env.selfhost.example", marker: "modules", body: selfhostEnvBody }`. `REGION_FILES` stays sorted.
- Wherever `compose` paths are validated against the module's `files` (kit sync / ownership in `packages/gato-cli/src/kit/`), `selfhostCompose` gets the same check.
- `packages/gato-cli/package.json` 0.3.0 → 0.4.0; `npm run build --prefix packages/gato-cli` and commit `.wa/bin/wa.mjs` (core-owned: `kit/modules/core.json` patch bump).
- `packages/create-gato-app/package.json`: pin `gato-cli` `0.4.0` and patch bump (the pin test `package.test.ts` requires equality, `kit/CLAUDE.md` "create-gato-app").
- Docs: `docs/02b-rejestr-i-generator.md` and `docs/16b-rozwoj-kitu.md` (Polish): the two manifest fields and regions. `AGENTS.md` changes in Task 6, once the files exist (the cited-paths test).

**Behaviours:**
- `moduleManifestSchema.parse({ name: "x", version: "0.1.0", description: "" })` → `selfhostCompose: null`; an env item without `selfhostExample` parses unchanged.
- `selfhostEnvBody` for project slug `my-app` and a module `uploads` with env `[{ name: "STORAGE_LOCAL_PATH", example: "./volumes/uploads", selfhostExample: "/app/volumes/uploads" }, { name: "S3_BUCKET", example: "{{projectSlug}}-uploads" }, { name: "S3_SECRET_ACCESS_KEY", example: "minioadmin", selfhostExample: "" }]` → `"# uploads\nSTORAGE_LOCAL_PATH=/app/volumes/uploads\nS3_BUCKET=my-app-uploads\nS3_SECRET_ACCESS_KEY="`.
- `selfhostComposeBody` with one module whose `selfhostCompose` file contains `"minio:\n  image: x\n"` → `"  minio:\n    image: x"`; modules with `selfhostCompose: null` → `""`.
- `renderRegionTarget` for `docker-compose.selfhost.yml` in a project without that file → `null` (today's behaviour). The CLI therefore lands before Task 6.
- `npm run wa -- generate` in the GatoJS repo leaves no diff.

**Mutations to kill:** `example` used instead of `selfhostExample` when both are set; an empty `selfhostExample` treated as missing (`||` instead of `??`); the new targets missing from `regionTargets`; `selfhostCompose` not checked against `files`.

**Release:** after merge, the coordinator tags `gato-cli@0.4.0`, then `create-gato-app` with the new pin (order in `kit/CLAUDE.md`).

**Lessons:** `cli-tests-time-out-under-heavy-load`, `macos-lists-directories-in-sorted-order`.

---

### Task 6: `docker-compose.selfhost.yml`, `.env.selfhost.example` and the runbook — ADR-65

**Branch:** `feat/selfhost-stack` (after Tasks 1, 4 and 5)

**Files:**
- `docker-compose.selfhost.yml` (core, placeholder file):
  - `db`: `postgres:16` (the same image as `docker-compose.yml`), named volume `postgres-data`, `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env.selfhost}`, `POSTGRES_DB: wa_app`, healthcheck `pg_isready`, no published port;
  - `migrate`: `build: .`, `image: wa-app:local`, command `["node_modules/.bin/prisma", "migrate", "deploy"]` (the CLI the `runner` stage installs), `env_file: .env.selfhost`, `DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/wa_app`, `depends_on: db: condition: service_healthy`, `restart: "no"`;
  - `app`: the same image, `env_file: .env.selfhost`, the same `DATABASE_URL`, `depends_on: migrate: condition: service_completed_successfully`, a healthcheck on `http://127.0.0.1:3000/api/healthcheck` (busybox `wget` in `node:22-alpine`; check it exists), ports `${APP_PORT:-3000}:3000`, named volume `uploads:/app/volumes/uploads`, `restart: unless-stopped`;
  - `tools`: `build: { context: ., target: builder }`, `profiles: ["tools"]`, the same env. It runs `npm run admin:create -- --email <email>`, because the `runner` image has no `tsx` or `scripts/` (open question 4);
  - `# wa:services:start` / `# wa:services:end` inside `services:`;
  - top-level `volumes: { postgres-data: {}, uploads: {} }`;
  - no mail relay (decision 8.1).
- `docker/uploads.selfhost.compose.yml` (owned by `uploads`; `kit/modules/uploads.json` `files` += it, `selfhostCompose` = it, patch bump):
  - `minio` and `minio-init` under profile `s3`, with no published ports;
  - credentials from `${S3_ACCESS_KEY_ID}` / `${S3_SECRET_ACCESS_KEY}`;
  - data under `./volumes/minio` (a bind mount, because a region inside `services:` cannot declare a top-level volume);
  - the bucket `wa-app-uploads`.
- `selfhostExample` values in manifests (each module patch bump, a separate commit per module):
  - `uploads`: `STORAGE_LOCAL_PATH=/app/volumes/uploads`, `S3_ENDPOINT=http://minio:9000`, `S3_REGION=us-east-1`, `S3_ACCESS_KEY_ID=` and `S3_SECRET_ACCESS_KEY=` empty;
  - `api-keys`: `API_KEY_PEPPER=` empty;
  - `encryption`: `ENCRYPTION_MASTER_KEY=` empty.
- `.env.selfhost.example` (core, placeholder file):
  - core part: `APP_URL=https://app.example.com`, `BETTER_AUTH_SECRET=` (empty: the runbook gives `openssl rand -base64 32`), `POSTGRES_PASSWORD=`, `EMAIL_FROM="WA App <noreply@example.com>"`, `MAIL_PROVIDER=smtp`, commented `# SMTP_HOST=` / `# SMTP_PORT=587` / `# SMTP_USER=` / `# SMTP_PASS=`, `AUTH_PUBLIC_SIGNUP=false`, `MULTI_ORG=false`, `LOG_LEVEL=info`, `OTEL_EXPORTER_OTLP_ENDPOINT=`;
  - then `# wa:modules:start` / `# wa:modules:end`.
- `.gitignore`: `!.env.selfhost.example` after `!.env.example` (`.env*` would ignore it). `.env.selfhost` stays ignored and is already outside the image (`.dockerignore` `.env.*`).
- `kit/modules/core.json`: `files` += `docker-compose.selfhost.yml`, `.env.selfhost.example`; `devDependencies` += `yaml` (root `package.json` too, exact range from the lockfile's current transitive version; lesson `pinned-npm-drops-libc-fields-from-the-lockfile`); minor bump. `kit/kit.json` `placeholderFiles` += both files.
- Architecture test `src/__tests__/architecture/selfhost-stack.test.ts` + `scripts/lib/architecture/selfhost.ts` (`checkSelfhostCompose(root)`, `checkSelfhostEnvExample(root)`):
  - compose: `app` waits for `migrate` to complete, `migrate` waits for a healthy `db`, `app` has a healthcheck on `/api/healthcheck`, `db` publishes no port, no service uses an `axllent/mailpit` image;
  - env example: with its empty values filled by fixed test values (`BETTER_AUTH_SECRET` = 32 × `"s"`, `POSTGRES_PASSWORD` = `"pw"`, `DATABASE_URL` added as compose sets it, `SMTP_HOST` = `"relay.internal"`, `NODE_ENV` = `"production"`), `.env.selfhost.example` passes `checkEnv` with the project's module schemas (`moduleEnvSchemas` as `env-example-passes-validation` uses them).
- `docs/self-hosting.md` (English, kit-only):
  - requirements (Docker Engine with Compose v2.20+ for `--wait` and `service_completed_successfully`);
  - install: copy `.env.selfhost.example` to `.env.selfhost`, generate secrets (one command per variable; the `generate` kind in manifests tells which), `docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build --wait`;
  - first admin through the `tools` profile;
  - mail: own relay, or `MAIL_PROVIDER=console`;
  - storage: local volume (one instance) or the `s3` profile / an external preset (link to the Task 4 table);
  - TLS with Caddy and nginx examples;
  - backup: `pg_dump` from `db`, plus the `uploads` volume or the bucket;
  - restore on a new machine;
  - upgrade: `npm run wa -- update <version>`, rebuild, `up --wait` runs `migrate` first;
  - "Prove nothing leaves the machine" left as a heading that Task 7 fills.

  Modelled on Ragen's `docs/appliance-runbook.md`. `docs/10-wdrozenie.md` "Własny serwer" links it; `docs/README.md` lists it.
- `AGENTS.md` "Modules and generated files": the two new joining points (`docker-compose.selfhost.yml`: `# wa:services:start/end`, `.env.selfhost.example`: `# wa:modules:start/end`).
- ADR-65 `docs/adrs/65-the-self-hosted-stack-is-a-core-compose-file-with-module-regions.md`: decision 9.4, decision 8.1 (no relay), the manifest fields from Task 5, bind mount for module data.

**Behaviours:**
- `checkSelfhostCompose` on the repository → `[]`. On a fixture with `app.depends_on.migrate.condition` = `service_started` → `["docker-compose.selfhost.yml: app must wait for migrate to complete (service_completed_successfully)"]`. A fixture with `db.ports` → `["docker-compose.selfhost.yml: db must not publish a port"]`. A fixture with a `mail` service on `axllent/mailpit` → `["docker-compose.selfhost.yml: no mail relay in the self-hosted stack (mail)"]`.
- `checkSelfhostEnvExample` on the repository → `[]`; without the `MAIL_PROVIDER=smtp` line and with no `SMTP_HOST` filled → the Task 1 production issue on `MAIL_PROVIDER`.
- `npm run wa -- generate` fills the `.env.selfhost.example` region with `STORAGE_LOCAL_PATH=/app/volumes/uploads` and the compose region with `minio` / `minio-init`. It is idempotent.
- Manual, recorded with dates in the runbook ("verified 2026-11-xx", as `docs/10-wdrozenie.md` does):
  - `up -d --build --wait` from a clean checkout ends with `app` healthy;
  - `tools` creates the admin, who signs in at `APP_URL`;
  - an upload survives `docker compose down && up --wait`;
  - `--profile s3` with `STORAGE_PROVIDER=s3` stores the file in MinIO;
  - a backup restored into a fresh project directory (new volumes) signs in and downloads the file.
- `assemble` in `kit.yml`: every combo's project has both files with regions filled (`no placeholders left` still passes).

**Mutations to kill:** each compose check accepting its negative fixture; the env check passing with a blank `MAIL_PROVIDER` in production.

**Lessons:** `parallel-worktrees-need-their-own-ports-and-dirs` (`COMPOSE_PROJECT_NAME`, `APP_PORT`), `a-new-file-needs-an-owner-only-the-cli-gate-checks`, `npm-keeps-a-lockfile-workspace-link-to-a-missing-folder` (no new workspace here).

---

### Task 7: Egress check and its workflow — ADR-66

**Branch:** `feat/egress-check` (after Task 6; Task 3 merged)

**Files:**
- `kit/egress-check/` (kit-only through `kit/**`), its own package like `kit/release/`: `package.json` (`private`, `type: module`, dependencies `yaml`, `tsx`; tests with `node --test` or Vitest), installed with `npm ci --prefix kit/egress-check`. It is not a root workspace (lesson `npm-keeps-a-lockfile-workspace-link-to-a-missing-folder`).
  - `src/seal.ts` `sealCompose(compose, { image, subnet })`: takes the parsed `docker-compose.selfhost.yml` and returns a sealed copy:
    - every service on one network `sealed` with `internal: true` and a fixed subnet;
    - `build` replaced by the prebuilt `image`, `ports` removed;
    - added services `relay` (mailpit, inside the network), `canary` (one lookup and one TCP connection that must fail) and `capture` (tcpdump on the sealed bridge; Ragen's `infra/appliance/egress-check/Dockerfile` tools image).
  - `src/capture.ts` `findEscapes(lines, subnet)`: parses tcpdump lines into `{ source, destination, name? }` for every packet addressed outside the subnet, with the DNS name when the packet is a forwarded query.
  - `src/scenario.ts`, over HTTP from a container inside the network:
    - create the admin (`tools` profile);
    - sign in (`/api/auth/sign-in/email`);
    - invite a member (`/api/auth/organization/invite-member`) and see the mail in the relay's API (`/api/v1/messages`);
    - upload and download a file (`/api/uploads`).
  - `src/run.mts`:
    - builds the image while still online;
    - writes a temporary `.env.selfhost` with generated secrets, `MAIL_PROVIDER=smtp`, `SMTP_HOST=relay`, `SMTP_PORT=1025`;
    - starts the sealed stack in its own Compose project from a temp directory;
    - proves the capture saw the canary, runs the scenario, reads the capture and tears down. `--keep` leaves the stack up;
    - `--storage local|s3` (`s3` = the MinIO profile inside the network).
- `.github/workflows/egress-check.yml` (kit-only; `kit/kit.json` `kitOnly` += it):
  - `on: pull_request` with `paths` from decision 9.2: `Dockerfile`, `docker-compose.selfhost.yml`, `.env.selfhost.example`, `src/shared/lib/mailer.ts`, `src/features/uploads/**`, `packages/env/**`, `package-lock.json`, plus `kit/egress-check/**` and the workflow itself; and `workflow_dispatch`;
  - jobs `scripts` (unit tests) and `egress-check` (matrix `storage: [local, s3]`).
- `docs/self-hosting.md`: fill "Prove nothing leaves the machine" (what it runs, how to run it on the operator's own host, what a failure looks like).
- ADR-66 `docs/adrs/66-the-app-calls-only-configured-endpoints-and-the-build-fetches-only-packages.md`: spec section 7, second decision. Enforcement: `src/__tests__/architecture/fonts-are-not-fetched-at-build.test.ts`, `src/__tests__/architecture/third-party-telemetry-stays-off.test.ts`, `.github/workflows/egress-check.yml`. Scope per decision 8.4: runtime only, the build may fetch npm packages and base images.
- `kit/CLAUDE.md` (Polish): how to run the check locally and when CI runs it.

**Behaviours:**
- `findEscapes(["12:00:00.000000 IP 172.30.0.5.41234 > 172.30.0.3.5432: Flags [S]"], "172.30.0.0/16")` → `[]`.
- `findEscapes(["12:00:00.000000 IP 172.30.0.5.41234 > 8.8.8.8.53: 1+ A? fonts.googleapis.com. (38)"], "172.30.0.0/16")` → `[{ source: "172.30.0.5", destination: "8.8.8.8:53", name: "fonts.googleapis.com" }]`.
- `findEscapes(["… IP 172.30.0.5.41234 > 93.184.215.14.443: Flags [S]"], …)` → `[{ source: "172.30.0.5", destination: "93.184.215.14:443" }]`.
- `sealCompose` of the repository's `docker-compose.selfhost.yml` → every service lists only `sealed`, `networks.sealed.internal` is `true`, no service has `build` or `ports`, and `relay`, `canary` and `capture` exist.
- A run whose capture misses the canary → exit 1 with `"capture saw no canary attempt; refusing to report a clean result"`.
- On `main` after Task 6: both matrix legs exit 0 with `"no container tried to leave the network"`.
- With a deliberate `await fetch("https://example.com")` in `src/app/api/healthcheck/route.ts` (local experiment, not committed) → exit 1 with a line naming the `app` container and `example.com`. Paste it in the report.

**Mutations to kill:** packets to the subnet reported; packets outside it missed; the canary guard removed; a service left on the default network.

**Lessons:** read Ragen's `scripts/appliance-egress-check.mts` header for the capture design; `parallel-worktrees-need-their-own-ports-and-dirs`.

---

### Task 8: Multi-arch build check

**Branch:** `ci/docker-platforms` (independent; can start any time)

**Files:**
- `.github/workflows/docker-platforms.yml` (kit-only; `kit/kit.json` `kitOnly` += it):
  - `on: pull_request` and `push` to `main` with `paths: [Dockerfile, .dockerignore, package.json, package-lock.json, "packages/*/package.json", .github/workflows/docker-platforms.yml]`, plus `workflow_dispatch`;
  - matrix `runner: [ubuntu-latest, ubuntu-24.04-arm]` (native arm64 runners; the repository is public);
  - steps: `docker build -t gato-platform-check .`, then `docker run --rm gato-platform-check node node_modules/prisma/build/index.js --version`, because Prisma's engines are per architecture.
- `kit/CLAUDE.md` (Polish): one line under "Składanie i wydanie".
- `docs/self-hosting.md` mentions both architectures only after Task 6 has created it (if Task 8 merges first, Task 6 adds the line).

**Behaviours:**
- Both legs build and `prisma --version` exits 0 on `main`.
- Manual negative check, not committed: `FROM --platform=linux/amd64 node:22-alpine AS base` makes the arm64 leg fail at the `prisma --version` step or earlier. Paste the result in the report.
- `workflow-lint.yml` (actionlint) passes on the new file.

**Mutations to kill:** none (CI configuration only); the negative check above stands in.

---

### Task 9: Helm chart and `helm.yml`

**Branch:** `feat/helm-chart` (after Task 6)

**Files:**
- `deploy/helm/gatojs/` (core; open question 3 on the directory name):
  - `Chart.yaml` (`name: wa-app`, placeholder file);
  - `values.yaml` (placeholder file): `image.repository: wa-app`, `image.tag`, `replicaCount: 1`, `existingSecret` (required; holds `DATABASE_URL`, `BETTER_AUTH_SECRET` and the mail and storage secrets), `env` (non-secret variables), `storage.provider: local | s3`, `persistence.size`, `ingress.enabled: false`, `ingress.host`, `ingress.className`, `ingress.tls`;
  - `.helmignore`;
  - `templates/_helpers.tpl`, `templates/deployment.yaml` (readiness and liveness probes on `/api/healthcheck`, port 3000, `envFrom` the secret), `templates/service.yaml`, `templates/ingress.yaml`, `templates/pvc.yaml` (only for `local`, mounted at `/app/volumes/uploads` with `STORAGE_LOCAL_PATH=/app/volumes/uploads`), `templates/migrate-job.yaml` (hook `pre-install,pre-upgrade`, `node_modules/.bin/prisma migrate deploy`), `templates/NOTES.txt`;
  - `README.md`.

  Modelled on Ragen's `deploy/helm/ragen`, reduced to one app.
- Chart tests with helm-unittest (pinned plugin version): `deploy/helm/gatojs/tests/*_test.yaml`, written first by the test-writer.
- `.github/workflows/helm.yml` (core, shipped to projects, as in Ragen's `helm.yml`):
  - `paths: ['deploy/**', '.github/workflows/helm.yml']` on `pull_request` and `push` to `main`;
  - `azure/setup-helm` pinned;
  - `helm lint`, `helm unittest`, `helm template` with default values, with `storage.provider=s3`, and with ingress on, each piped to kubeconform (checksum-verified download, as Ragen does).
- `kit/modules/core.json`: `files` += `deploy/helm/**`, `.github/workflows/helm.yml`; minor bump. `kit/kit.json` `placeholderFiles` += `deploy/helm/gatojs/Chart.yaml`, `deploy/helm/gatojs/values.yaml`.
- `docs/self-hosting.md`: a "Kubernetes (Helm)" section (build and push the image to the cluster's registry, create the secret, `helm install`, upgrade order).

**Behaviours (helm-unittest, literal values):**
- Default values with `existingSecret: app-env` → one Deployment with `replicas: 1`, `readinessProbe.httpGet.path: /api/healthcheck`, `livenessProbe.httpGet.path: /api/healthcheck`, `containerPort: 3000`, `envFrom[0].secretRef.name: app-env`; one PVC; env `STORAGE_LOCAL_PATH=/app/volumes/uploads`.
- `existingSecret` unset → render fails with `"set existingSecret: a Secret with DATABASE_URL, BETTER_AUTH_SECRET and the mail and storage secrets"`.
- `storage.provider: local, replicaCount: 2` → render fails with `"storage.provider=local supports one replica; use storage.provider=s3 for more"`.
- `storage.provider: s3, replicaCount: 3` → `replicas: 3`, no PVC, no `STORAGE_LOCAL_PATH`.
- Migrate Job has annotation `helm.sh/hook: pre-install,pre-upgrade` and command `["node_modules/.bin/prisma", "migrate", "deploy"]`.
- `ingress.enabled: false` → no Ingress; `true` with `host: app.example.com` → an Ingress with that host routing to the Service on port 3000.
- `helm lint` passes. kubeconform accepts all three renders.
- In an `assemble`d project, `Chart.yaml` and `values.yaml` carry the project's slug (`no placeholders left` passes).
- Optional, reported if done: `helm install` on a local kind cluster reaches a ready pod.

**Mutations to kill:** probe path changed; the replica guard removed; PVC rendered for `s3`; hook annotation dropped (the helm-unittest cases above are the kill list).

**Lessons:** `a-new-file-needs-an-owner-only-the-cli-gate-checks`.

---

### Task 10: Image publishing to GHCR and Railway — ADR-67

**Branch:** `feat/image-publishing` (after Task 6 and Task 8; lane B, no `gato-cli` changes). Added 2026-11-24 by Patryk's decision.

**Changed 2026-11-26 (coordinator):** Railway's Config as Code is deprecated (new services cannot use it; files stop being read on 2026-12-01), so no `railway.json` and no `checkRailwayConfig`; the runbook gives the dashboard settings instead and ADR-67 records why. Follow-ups: `.railway/railway.ts` and removing `railway.toml`. The pull_request issue text is `docker-publish.yml: must not run on pull_request; it pushes images`.

Why: a project built with GatoJS should deploy one tested image to every environment (staging, production, a rollback to the previous tag) instead of rebuilding on each host. GatoJS itself is a framework, so its own image (`ghcr.io/webamigos/gatojs`) is a demo and the input of the egress check, not something a client project deploys. The same workflow file serves both: it names the image after `github.repository`.

**Files:**
- `.github/workflows/docker-publish.yml` (core, shipped to projects; `kit/modules/core.json` `files` += it):
  - triggers: `push` to `main` (tags `edge` and `sha-<short>`), `push` of tags `v*` (semver tags `X.Y.Z`, `X.Y`, `latest`), `workflow_dispatch`, and `workflow_call` with an optional `version` input (see the release note below); never on `pull_request` (Task 8 already builds on PRs);
  - image name `ghcr.io/<owner>/<repo>` lowercased in a step (`github.repository` keeps the owner's case and GHCR rejects upper case);
  - native runners, no QEMU: matrix `ubuntu-latest` / `ubuntu-24.04-arm`, each `docker/build-push-action` pushes by digest (`outputs: type=image,push-by-digest=true,name-canonical=true,push=true`), uploads the digest as an artifact; a `merge` job creates the multi-arch manifest with `docker buildx imagetools create` and the tags from `docker/metadata-action`;
  - `provenance: mode=max`, `sbom: true`; `actions/attest-build-provenance` on the merged digest;
  - permissions per job: `contents: read`, `packages: write`, `id-token: write` and `attestations: write` only where needed; `GITHUB_TOKEN` only, no secrets;
  - `concurrency` per ref; actions pinned the way the other workflows pin them.
- GatoJS repo only: `.github/workflows/release.yml` (kit-only) calls `docker-publish.yml` through `workflow_call` with the released version after semantic-release, because a tag pushed with `GITHUB_TOKEN` does not trigger other workflows. Projects tag by hand or with their own release flow, so the `v*` trigger works for them.
- `docker-compose.selfhost.yml` (Task 6): `migrate` and `app` use `image: ${APP_IMAGE:-wa-app:local}`, so `APP_IMAGE=ghcr.io/<owner>/<repo>:1.2.3` plus `up --wait --no-build` deploys a published image; `.env.selfhost.example` gets a commented `# APP_IMAGE=`.
- `railway.json` (core, shipped, placeholder-free): `build.builder: DOCKERFILE`, `deploy.preDeployCommand: ["node_modules/.bin/prisma migrate deploy"]`, `deploy.healthcheckPath: /api/healthcheck`, `deploy.restartPolicyType: ON_FAILURE`. Verify the field names against the current Railway config-as-code schema (`https://railway.com/railway.schema.json`) and add `$schema`. Other hosts ignore this file.
- Architecture test `src/__tests__/architecture/image-publishing.test.ts` + `scripts/lib/architecture/image-publishing.ts`:
  - `checkPublishWorkflow(yamlText)`: no `pull_request` trigger; both runners in the matrix; the image name passes through a lowercase step; `provenance` and `sbom` set; `packages: write` not granted at workflow level;
  - `checkRailwayConfig(jsonText)`: `preDeployCommand` runs `prisma migrate deploy`; `healthcheckPath` equals the path the Dockerfile `HEALTHCHECK` and the compose `app` healthcheck use (read from the repo, not a copy).
- `docs/self-hosting.md` (English, kit-only), two sections:
  - "Published images": what the workflow publishes and when, making the GHCR package public or giving the host a pull token, pinning a version in `APP_IMAGE`, rollback by tag, checking a signature/attestation with `gh attestation verify`;
  - "Railway": (a) build from the repo with `railway.json` (the default), (b) deploy the GHCR image (private registry credentials in Railway), Postgres from Railway's database service (`DATABASE_URL` reference variable), `BETTER_AUTH_SECRET` and `APP_URL`, uploads on a Railway volume mounted at `/app/volumes/uploads` (one replica) or an S3 preset from Task 4 (more replicas), mail via SMTP or Resend, first admin with `railway run npm run admin:create -- --email …` from a checkout. "verified 2026-11-xx" only for what was actually deployed.
- `docs/10-wdrozenie.md` links both sections; `docs/README.md` lists nothing new (same page).
- ADR-67 `docs/adrs/67-projects-publish-their-own-multi-arch-image.md`: one workflow for GatoJS and projects, digest-merge on native runners instead of QEMU, GHCR with `GITHUB_TOKEN`, `railway.json` shipped to every project, GatoJS image as demo and egress-check input. (ADR-65 and 66 stay reserved for Tasks 6 and 7.)
- `core` minor bump.

**Behaviours:**
- `checkPublishWorkflow` on the repository file → `[]`. Fixtures: a `pull_request` trigger → `["docker-publish.yml: must not run on pull_request (Task 8 covers PR builds)"]`; only `ubuntu-latest` → `["docker-publish.yml: both ubuntu-latest and ubuntu-24.04-arm are required"]`; image name `ghcr.io/${{ github.repository }}` used directly → `["docker-publish.yml: lowercase the image name before pushing"]`; `permissions: packages: write` at the top → `["docker-publish.yml: grant packages: write per job, not to the whole workflow"]`.
- `checkRailwayConfig` on the repository file → `[]`; `healthcheckPath: /health` → `["railway.json: healthcheckPath /health differs from /api/healthcheck"]`; no `preDeployCommand` → `["railway.json: preDeployCommand must run prisma migrate deploy"]`.
- `assemble` in `kit.yml`: every combo's project has `docker-publish.yml` and `railway.json`; actionlint passes on the project's workflows.
- On GitHub, after merge (coordinator, reported in the PR): the push to `main` publishes `ghcr.io/webamigos/gatojs:edge`; `docker buildx imagetools inspect` lists `linux/amd64` and `linux/arm64`; `gh attestation verify oci://ghcr.io/webamigos/gatojs:edge --owner webamigos` passes. Making the package public is Patryk's click in the package settings.
- Manual, optional (Patryk's Railway account; the worker does not create accounts): a project from `create-gato-app` deployed to Railway from its repo reaches a healthy deployment and the migrations ran. Recorded with a date in the runbook only if done.

**Mutations to kill:** each workflow check accepting its negative fixture; the Railway check accepting a different health path or no migration step.

**Lessons:** `a-new-file-needs-an-owner-only-the-cli-gate-checks`; workflow steps run with `bash -e`; a tag or release created with `GITHUB_TOKEN` starts no workflow (write a lesson if none exists).

---

## Open questions (not settled by the spec; each task applies the default stated here unless Patryk overrides it)

1. **`SMTP_URL` next to `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` or `SMTP_SECURE`.** Decision 9.1 covers `SMTP_HOST`. Default (Task 1): the same startup error for every split variable, one source of SMTP settings.
2. **Wizard defaults** (Task 2). The default `smtp` with the local mailpit host writes nothing, so `.env` stays as `.env.example`. `resend` and `console` blank `SMTP_URL`. A non-mailpit SMTP host blanks `SMTP_URL` and writes the split variables.
3. **Helm chart directory vs chart name.** The spec says `deploy/helm/gatojs`; the chart name comes from the project slug. If `helm lint` rejects a directory name that differs from the chart name, the default is `deploy/helm/app`, and the report says so.
4. **First admin in the self-hosted stack.** The `runner` image cannot run `admin:create` (no `tsx`, no `scripts/`). Default (Task 6): a `tools` service built from the `builder` stage under a `tools` profile. Alternatives are a compiled script in the `runner` image, or running it from a checkout against a published database port.
5. **Module values in `.env.selfhost.example`.** Default (Tasks 5 and 6): new manifest fields `selfhostExample` and `selfhostCompose` with two new `wa:*` regions. The alternative, hard-coding uploads' variables and MinIO in the core files, breaks "a module does not edit core files".
6. **`CHECKPOINT_DISABLE=1`** (Task 3) is beyond the spec's text: it follows Ragen's test and the spec's runtime rule (`prisma migrate deploy` calls Prisma's checkpoint server).
7. **Multi-arch as its own workflow** (Task 8), not inside the egress-check workflow, so it can merge first and also runs on pushes to `main`.
8. **`railway.json` in every project** (Task 10). Default: shipped, since other hosts ignore it. The alternative is a snippet in the runbook only.

## Definition of done (all tasks)

- `main` has the mail providers with ADR-64, the wizard mail question in `create-gato-app` 0.3.x, self-hosted Inter with the two architecture tests, `S3_SESSION_TOKEN` and the preset table, `gato-cli` 0.4.0 regions, `docker-compose.selfhost.yml` + `.env.selfhost.example` + `docs/self-hosting.md` with ADR-65, the egress check with ADR-66, the multi-arch check, the Helm chart with `helm.yml`, and image publishing to GHCR with `railway.json` and ADR-67.
- `verify`, CLI gate, create-gato-app gate, integration, e2e, `assemble`, `storage-presets`, `egress-check` (both legs), `docker-platforms` (both legs), `helm.yml` and `docker-publish.yml` (on `main`) are green.
- `gato-cli` 0.4.0 and `create-gato-app` with the mail question are published (coordinator: tags in the order `kit/CLAUDE.md` gives, then Patryk's staged approval).
- The docs.gatojs.com pages listed in the task reports have issues or PRs in the website repo.
- Follow-ups outside this plan: the wizard writing `.env.selfhost` (the spec defers it), a fully offline install bundle (decision 8.4), native Azure Blob and GCS providers, HTTP mail providers beyond Resend, and Terraform.
