# English-first repository

Date: 2026-11-22. Decided by Patryk: GatoJS is going to be an open-source framework on GitHub (`webamigos/gatojs`), so the repository moves to English. This spec describes the scope and order of the migration. Draft for review.

## 1. Decision

- Everything in the repository is written in English: file names, documentation, specs, plans, the decision log, `AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, skills, agents and hooks, CLI messages, test names, code identifiers, commit messages and PR descriptions.
- Polish stays only as an application locale: `src/app/messages/pl.json`, `src/features/*/i18n/pl.json` and email templates rendered in `pl`. `pl` remains a supported locale; whether it stays the default is open question 1.
- New content is English from 2026-11-22. Existing content is migrated by this plan, not ad hoc, because it touches almost every file Kuba's open PRs touch.

## 2. Inventory (`main`, `bd82b0d`)

| Area | Size | Notes |
| --- | --- | --- |
| `docs/*.md` (user documentation, 28 files, Polish file names) | ~161k words | `01-uruchomienie.md` … `16b-rozwoj-kitu.md`, `decyzje.md` (D01–D49), `znane-ograniczenia.md`, `README.md` |
| `docs/superpowers/**` (specs, plans, notes from past work) | ~80k words, 31 files | Historical working documents |
| Agent instructions | `AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, `kit/README.md`, `README.md`, `.claude/agents/*.md`, hook messages | Rules the agents follow; must stay consistent with each other |
| Production code with Polish strings | ~44 files | Server error messages returned to the UI (`"Brak dostępu do organizacji"`, `"Sesja wygasła. Zaloguj się ponownie."`), CLI messages in `kit/cli/src`, env validation messages, the generated-file header |
| Test names | ~1,200 `it`/`test`/`describe` titles | Mostly in `__tests__/`, `kit/cli/src/**/__tests__`, `e2e/` |
| Mutation gate | `mutation-gate.json` `allowed[].reason` | Reasons are Polish; entries are matched by mutant, not by reason |

## 3. Principles

1. **User-facing text goes through i18n, not English literals.** A server error message that reaches the UI today as a Polish literal becomes an error code (or i18n key) translated by the UI in the user's locale. Replacing `"Brak dostępu do organizacji"` with `"No access to the organization"` would only move the problem: a Polish user would then see English. Log messages and developer-facing errors become plain English.
2. **Behaviour does not change.** Test titles, docs and messages are translated; assertions on literal user-visible text change only together with the i18n move in principle 1, with the expected value still a literal from the spec.
3. **Anchors and references survive.** Every renamed doc keeps a redirect table (old file name → new file name) in `docs/README.md` for one release, and decision numbers stay the same: `D01`–`D52` become `docs/adrs/01-…` … `docs/adrs/52-…` (ADR-53, PR #27: new decisions are ADR files from 53).
4. **History stays readable.** Translating the old working documents in `docs/superpowers/` costs more than it is worth. They move to `docs/archive/pl/` unchanged, with a note in English; new specs and plans live in `docs/superpowers/` in English.

## 4. Rename map for `docs/`

| Today | After |
| --- | --- |
| `01-uruchomienie.md` | `01-getting-started.md` |
| `02-architektura.md` | `02-architecture.md` |
| `02b-rejestr-i-generator.md` | `02b-registry-and-generator.md` |
| `03-dane-i-organizacje.md` | `03-data-and-organizations.md` |
| `03b-schemat-i-migracje.md` | `03b-schema-and-migrations.md` |
| `04-auth-i-role.md` | `04-auth-and-roles.md` |
| `04b-superadmin-i-tryb-serwisowy.md` | `04b-superadmin-and-service-mode.md` |
| `05-moduly-rdzenia.md` | `05-core-modules.md` |
| `06-wzorce-kodu.md` | `06-code-patterns.md` |
| `07-i18n-mail-env.md` | `07-i18n-mail-env.md` |
| `07b-logi-naglowki-healthcheck.md` | `07b-logs-headers-healthcheck.md` |
| `08-testy.md` | `08-testing.md` |
| `08b-testy-adwersarialne.md` | `08b-adversarial-testing.md` |
| `09-nowy-modul.md` | `09-new-module.md` |
| `09b-implementacja-i-bramki.md` | `09b-implementation-and-gates.md` |
| `10-wdrozenie.md` | `10-deployment.md` |
| `11-praca-z-kitem.md` | `11-working-with-the-kit.md` |
| `12-moduly-kitu.md` | `12-kit-modules.md` |
| `13-modul-audit-logs.md`, `13b-…-uzycie.md` | `13-audit-logs-module.md`, `13b-audit-logs-usage.md` |
| `14-modul-api-keys.md`, `14b-…-uzycie.md` | `14-api-keys-module.md`, `14b-api-keys-usage.md` |
| `15-modul-uploads.md`, `15b-…-uzycie.md` | `15-uploads-module.md`, `15b-uploads-usage.md` |
| `16-cli-wa.md`, `16b-rozwoj-kitu.md` | `16-cli.md`, `16b-developing-the-kit.md` |
| `decyzje.md` | split into `adrs/01-…md` … `adrs/52-…md` (same numbers), index in `adrs/README.md` |
| `znane-ograniczenia.md` | `known-limitations.md` |

The `16-*` names avoid `wa`, because the CLI is renamed to `gato` by the gato spec (#25).

## 5. Order of work

Each step is its own PR, so review stays readable and conflicts with other branches stay small.

0. **Freeze window.** Agree with Kuba on a short window: merge or rebase #14 and #22 first, then run steps 1–3 back to back. Branches opened during the window rebase onto the result.
1. **Agent instructions** (`AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, `.claude/**`, `README.md`, `kit/README.md`). First, because agents writing the rest of the migration must read English rules. The architecture tests from the harness plan (`cited-paths-exist`, `documented-commands-exist`) guard the references.
2. **Docs rename** (`git mv` per the table in section 4, plus link updates across the repo), no content change. A pure rename keeps `git log --follow` and review simple.
3. **Docs translation**, one PR per numbered chapter group (01–04b, 05–08b, 09–12, 13–16b, the D01–D52 split into `docs/adrs/`, `known-limitations.md`). Translators keep anchors (`<a id>`) in English and add the old Polish anchors as extra `<a id>` aliases for one release.
4. **Archive** `docs/superpowers/` working documents from before 2026-11-21 to `docs/archive/pl/`. The same PR updates every link to a moved file (including `docs/README.md`), so no reference points at the old path.
5. **Code messages:** server errors returned to the UI become error codes with i18n keys in `pl` and `en`; CLI, env validation, log and hook messages become English literals. Test titles in the touched files are translated in the same PR.
6. **Remaining test titles**, file by file, with no assertion changes.
7. **`mutation-gate.json` reasons** translated (the human-approved entries keep their meaning; Patryk or Kuba approves the PR). When step 5 changes a message quoted in an entry's `original` field (for example the Polish messages in `kit/cli/src/manifest/schema.ts`), that `original` field changes in the same commit, otherwise the gate stops on a stale entry.
8. **Guard:** an architecture test that fails on Polish diacritics outside `**/i18n/pl.json`, `src/app/messages/pl.json`, email `pl` templates and `docs/archive/pl/`. In test files it inspects only test titles (`describe`/`it`/`test` names), not assertions, because tests that render the `pl` locale legitimately assert Polish UI text (for example `Hasło` in the sign-up tests).

Dependencies: step 1 is merged before any other step starts, so every worker reads English rules. Step 2 (rename) is merged before step 3 (translation) and step 4 (archive) start. Within step 3 the chapter PRs can run in parallel. Steps 5–7 change code and follow the usual test-writer → implementer → test-reviewer process for step 5; step 8 comes last.

## 6. Out of scope

- Changing the default locale of the application (open question 1).
- Renaming `wa`/`.wa` to `gato`/`.gato` (gato spec, #25).
- Translating `docs/archive/pl/`.

## 7. Open questions

1. Should `en` become the default locale of a new project, with `pl` as an option in the wizard?
2. Archive the old `docs/superpowers/` documents in the repo (`docs/archive/pl/`) or remove them from the public repo entirely (they contain internal names and ClickUp links; see the gato spec §10)?
3. Do the docs stay in the repo after going public, or move to a separate docs site (gato spec, open question 3)? If they move, steps 2–3 should translate straight into the docs site.
4. Who approves the translated ADRs 01–52: is a careful machine translation reviewed by one person enough?
