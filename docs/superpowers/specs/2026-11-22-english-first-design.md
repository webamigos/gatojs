# English-first repository

Date: 2026-11-22, refreshed on 2026-11-23 against `main` at `e32ebab` (GatoJS 0.7.0). Decided by Patryk: GatoJS is an open-source framework on GitHub (`webamigos/gatojs`, public), so the repository moves to English. This spec describes the scope and order of the migration. Draft for review.

## 1. Decision

- Everything in the repository is written in English: file names, documentation, specs, plans, the decision log, `AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, skills, agents and hooks, CLI messages, env validation messages, test names, code identifiers, manifest descriptions, commit messages and PR descriptions.
- Polish stays only as an application locale: `src/app/messages/pl.json`, `src/features/*/i18n/pl.json` and, after step 5, the `pl` texts of the email templates (decision 5). `pl` remains a supported locale; whether it stays the default is decision 1.
- New content is English since 2026-11-22 (already the rule in the packages and agent-workflow plans). Existing content is migrated by this plan, not ad hoc, because it touches almost every file other branches touch.
- Naming follows GatoJS / gato. "kit" stays only as a plain descriptive noun ("a Next.js kit"), never as a name, in new file names and translated text.

## 2. Inventory (`main`, `e32ebab`)

| Area | Size | Notes |
| --- | --- | --- |
| `docs/*.md` (user documentation, 30 files, 27 with Polish names) | ~172k words | `01-uruchomienie.md` … `16b-rozwoj-kitu.md`, `decyzje.md` (D01–D52), `znane-ograniczenia.md`, `README.md`. `lessons.md` is already English. |
| Already English | — | `docs/adrs/` (ADR-53–56, `README.md`, `TEMPLATE.md`), `docs/lessons/` (14 files), `docs/agents/`, `.github/README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `packages/create-gato-app` |
| `docs/superpowers/**` (specs, plans, notes) | ~116k words, 37 files | 30 Polish working documents from before 2026-11-21; 7 English ones from 2026-11-21 on (plus the open spec PRs #26, #28, #59). The agent-workflow plan moves the folder to `docs/specs`, `docs/plans`, `docs/notes` (section 5). |
| Agent instructions | `AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, `kit/README.md`, `README.md`, `.claude/agents/*.md`, `.claude/skills/wa-*/SKILL.md`, hook messages in `.claude/hooks/*.mjs` | Rules the agents follow; must stay consistent with each other and within the 31,744-byte budget (`agent-instructions-fit-the-budget`) |
| Production code with Polish strings | ~50 files | Server error messages returned to the UI (`"Brak dostępu do organizacji"`, `"Sesja wygasła. Zaloguj się ponownie."`), CLI messages in `packages/gato-cli/src` (19 files), env validation messages in `packages/env/src/core-env-schema.ts` and module `env.ts` files, email templates in `src/app/emails/*.tsx` (Polish literals, not i18n), the generated-file header |
| Manifests | `kit/modules/*.json` `description`, copied into `.wa/kit.json` | Shown by `wa list` and `wa add` |
| Test names | ~1,700 `it`/`test`/`describe` titles with Polish text | Mostly in `__tests__/`, `packages/gato-cli/src/**/__tests__`, `e2e/` |
| Mutation gates | `mutation-gate.json` and `packages/gato-cli/mutation-gate.json` | `allowed[].reason` is Polish. 12 `original` fields in the root file and 4 in the CLI file (`src/manifest/schema.ts`) quote Polish messages; entries are matched by mutant, so a changed message makes its entry stale |

## 3. Principles

1. **User-facing text goes through i18n, not English literals.** A server error message that reaches the UI today as a Polish literal becomes an error code (or i18n key) translated by the UI in the user's locale. Replacing `"Brak dostępu do organizacji"` with `"No access to the organization"` would only move the problem: a Polish user would then see English. Log messages and developer-facing errors (CLI, env validation, hooks) become plain English.
2. **Behaviour does not change.** Test titles, docs and messages are translated; assertions on literal user-visible text change only together with the i18n move in principle 1, with the expected value still a literal from the spec.
3. **Anchors and references survive.** Every renamed doc keeps a redirect table (old file name → new file name) in `docs/README.md` for one release; how old paths keep working is decision 4. Decision numbers stay the same: `D01`–`D52` become `docs/adrs/01-…` … `docs/adrs/52-…` (ADR-53: new decisions are ADR files from 53, as `docs/adrs/README.md` already says).
4. **History stays readable.** Translating the old working documents costs more than it is worth. They move to `docs/archive/pl/` unchanged, with a note in English; new specs, plans and notes are English in `docs/specs`, `docs/plans`, `docs/notes`.

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
| `11-praca-z-kitem.md` | `11-working-with-gatojs.md` |
| `12-moduly-kitu.md` | `12-gatojs-modules.md` |
| `13-modul-audit-logs.md`, `13b-…-uzycie.md` | `13-audit-logs-module.md`, `13b-audit-logs-usage.md` |
| `14-modul-api-keys.md`, `14b-…-uzycie.md` | `14-api-keys-module.md`, `14b-api-keys-usage.md` |
| `15-modul-uploads.md`, `15b-…-uzycie.md` | `15-uploads-module.md`, `15b-uploads-usage.md` |
| `16-cli-wa.md`, `16b-rozwoj-kitu.md` | `16-cli.md`, `16b-developing-gatojs.md` |
| `decyzje.md` | split into `adrs/01-…md` … `adrs/52-…md` (same numbers), index in `adrs/README.md` |
| `znane-ograniczenia.md` | `known-limitations.md` |

The `16-*` names avoid `wa`: `gato-cli` 0.2.x already ships the `gato` binary, and `wa` stays only as an alias until the rename plan (section 6). A self-hosting runbook from spec `2026-11-22-self-hosting-design.md` is born English as `docs/self-hosting.md` and needs no rename.

## 5. Order of work

Each step is its own PR, so review stays readable and conflicts with other branches stay small.

**Before step 0: the agent-workflow plan** (`2026-11-22-agent-workflow.md`) runs its Tasks 1–3 first. Task 3 moves `docs/superpowers/{specs,plans,notes}` to `docs/specs`, `docs/plans`, `docs/notes`, and that plan already says the folder move goes first and this migration follows the new folders. Task 1 adds the `gato-task` skill and rewrites `.claude/agents/*.md`, so step 1 below translates the result instead of conflicting with it. This spec itself is merged before that Task 3 (it starts only after the open spec PRs merge or rebase) and moves with the folder.

0. **Freeze window.** Agree with Kuba on a short window: merge or rebase the branches open at that time (today the spec PRs #26 and #59 and any plan branches in flight), then run steps 1–3 back to back. Branches opened during the window rebase onto the result.
1. **Agent instructions** (`AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, `.claude/**`, `README.md`, `kit/README.md`). First, because agents writing the rest of the migration must read English rules. The architecture tests `cited-paths-exist`, `documented-commands-exist` and `agent-instructions-fit-the-budget` guard the references and the size.
2. **Docs rename** (`git mv` per the table in section 4, plus link updates across the repo, ADR files included), no content change. A pure rename keeps `git log --follow` and review simple. The same PR adds the redirect table and whatever decision 4 chooses for the old paths.
3. **Docs translation**, one PR per chapter group (01–04b, 05–08b, 09–12, 13–16b, the D01–D52 split into `docs/adrs/`, `known-limitations.md`). Translators keep anchors (`<a id>`) in English and add the old Polish anchors as extra `<a id>` aliases for one release. The ADR split also updates the links that still point at `decyzje.md#dNN` (ADR-56, `docs/adrs/README.md`) and the "Numbering" paragraph of `docs/adrs/README.md`.
4. **Archive** the Polish working documents from before 2026-11-21, now in `docs/specs`, `docs/plans` and `docs/notes`, to `docs/archive/pl/{specs,plans,notes}/`. The same PR updates every link to a moved file (including `docs/README.md` and the note cited by `AGENTS.md`), so no reference points at the old path.
5. **Code messages:** server errors returned to the UI become error codes with i18n keys in `pl` and `en`; email template texts move to i18n (decision 5); CLI, env validation, log and hook messages and the manifest `description` fields become English. Test titles in the touched files are translated in the same PR. When a message quoted in an `original` field of either mutation gate changes, that `original` field changes in the same commit, otherwise the gate stops on a stale entry.
6. **Remaining test titles**, file by file, with no assertion changes.
7. **Mutation gate reasons** in both `mutation-gate.json` files translated (the human-approved entries keep their meaning; Patryk or Kuba approves the PR).
8. **Guard:** an architecture test that fails on Polish diacritics outside `**/i18n/pl.json`, `src/app/messages/pl.json` and `docs/archive/pl/`. In test files it inspects only test titles (`describe`/`it`/`test` names), not assertions, because tests that render the `pl` locale legitimately assert Polish UI text (for example `Hasło` in the sign-up tests).

Dependencies: step 1 is merged before any other step starts, so every worker reads English rules. Step 2 (rename) is merged before step 3 (translation) and step 4 (archive) start. Within step 3 the chapter PRs can run in parallel. Steps 5–7 change code and follow the usual test-writer → implementer → test-reviewer process for step 5; step 8 comes last. Every step that changes a GatoJS file bumps the owning module's version and runs `npm run wa -- kit sync && npm run wa -- generate`, as the other plans do.

## 6. Out of scope

- Changing the default locale of the application (decision 1 decides the direction; the change itself belongs to the wizard follow-up).
- Renaming `wa`/`.wa`, the `wa:*` markers, `kit/`, `kit.yml` and the `wa-*` skills to gato names: the packages plan leaves these to a separate rename plan (gato-cli spec, open question 1).
- Translating `docs/archive/pl/`.

## 7. Decisions for Patryk

1. **Default locale of a new project.** Today `pl` is the default and `packages/gato-cli/src/manifest/schema.ts` requires `pl` in `locales` (`'locales musi zawierać "pl"'`).
   - a) Keep `pl` default and required.
   - b) `en` default, `pl` an option in the wizard; the `pl` requirement in the manifest schema becomes "the default locale must be listed".
   - c) `en` default, `pl` still required.

   Recommendation: b), decided now and implemented with the `create-gato-app` wizard follow-up, not in this migration. An open-source framework whose new projects start in Polish surprises most users.
2. **The old working documents.** The repository is already public, so the documents and their internal names and ClickUp links are visible in the history whatever happens to the tree.
   - a) Archive in `docs/archive/pl/` unchanged (step 4).
   - b) Delete them from the tree; history keeps them.
   - c) Redact internal references, then archive.

   Recommendation: a). Deleting hides nothing from the history and loses the trail that ADRs and notes link to; if something sensitive turns up, the pre-public review of the gato spec §10 handles it on its own.
3. **Where the docs live after the migration** (gato-cli spec, open question 3).
   - a) `docs/` in the repository, translated in place; a docs site (for example Mintlify) can render the same Markdown later.
   - b) Move to a separate docs site now; steps 2–3 translate straight into it.

   Recommendation: a). Agents and the architecture tests (`cited-paths-exist`) read `docs/` in the repository, and a site can be added without moving files.
4. **Old paths after the rename.** Older projects' `AGENTS.md` and external links point at `docs/03-dane-i-organizacje.md` or `decyzje.md#d07`, and `docs/**` is read from `main` on GitHub.
   - a) Only the redirect table in `docs/README.md`.
   - b) The table plus a one-line stub at every old path linking to the new file, and a `decyzje.md` stub that maps each `#dNN` anchor to its ADR, for one minor release.

   Recommendation: b). The stubs cost one PR and keep links from projects that have not run `wa update` working.
5. **Email templates** (`src/app/emails/*.tsx`, Polish literals today).
   - a) Move their texts to `src/app/messages/{pl,en}.json` in step 5 and render them in the app's default locale, so nothing changes for a Polish install.
   - b) Keep the Polish literals and exclude `src/app/emails/**` from the guard.

   Recommendation: a). It follows principle 1, and choosing the recipient's locale can come later without touching the templates again.
6. **Review of the translated ADRs 01–52.**
   - a) Machine translation checked by one reviewer (Patryk or Kuba) per PR, comparing meaning, numbers, paths and the "verified against code" commits.
   - b) Two reviewers per PR.

   Recommendation: a). The ADRs are decisions already in force, the translation changes no meaning, and the original Polish stays in the git history.
