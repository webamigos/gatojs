# English-first repository

Date: 2026-11-22, refreshed on 2026-11-24 against `main` at `69243ee` (after #81, #82, #85, #87, #90, #91, #92). Decided by Patryk: GatoJS is an open-source framework on GitHub (`webamigos/gatojs`, public), so the repository moves to English. This spec describes the scope and order of the migration.

**Status: Accepted by Patryk on 2026-11-23** (decisions in section 7).

## 1. Decision

- Everything in the repository is written in English: file names, documentation, specs, plans, the decision log, `AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, skills, agents and hooks, CLI messages, env validation messages, test names, code identifiers and `// WHY:` comments, manifest descriptions, commit messages and PR descriptions.
- Polish stays only as an application locale: `src/app/messages/pl.json`, `src/features/*/i18n/pl.json`, including the `pl` texts of the email templates (decision 5). `pl` remains a supported locale; `en` becomes the default of new projects (decision 1, outside this migration).
- New content is English since 2026-11-22. Existing content is migrated by this plan, not ad hoc, because it touches almost every file other branches touch.
- Naming follows GatoJS / gato. "kit" stays only as a plain descriptive noun ("a Next.js kit"), never as a name, in new file names and translated text.
- User-facing documentation lives on https://docs.gatojs.com, a separate site (decision 3). `docs/` in the repository is for contributors and agents: architecture, decisions, lessons. It is translated in place.

## 2. Inventory (`main`, `69243ee`)

| Area | Status | What is left |
| --- | --- | --- |
| `AGENTS.md`, `CLAUDE.md` | **Done in #81** (English; the task router links docs.gatojs.com) | One Polish UI string quoted in `AGENTS.md` (the service-mode error); it follows the message when step 5 moves it to i18n |
| `.github/README.md` | **Done in #81** (docs.gatojs.com, `create-gato-app` quick start) | — |
| `README.md`, `kit/README.md` (copied into projects) | Docs link points at docs.gatojs.com (#81) | Text is Polish (~40 lines each) |
| `kit/CLAUDE.md` | — | Polish (~45 lines) |
| `.claude/hooks/*.mjs` | **Done in #82** (`protect-tests`) and #92 (`.gato/phase`) | — |
| `.claude/skills/gato-task/SKILL.md` | **English since #87** | Polish trigger phrases in `description` are deliberate (Polish-speaking users), keep them |
| `.claude/skills/wa-*/SKILL.md`, `.claude/agents/test-writer.md`, `test-reviewer.md` | — | Polish |
| CLI messages (`packages/gato-cli/src`) | **Done in #82** (messages, prompts, `update` plan/report, manifest validation, generated-file header, first commit) | 3 Polish `// WHY:` comments (`kit/source.ts`, `commands/update.ts`) |
| `packages/create-gato-app` | **English since #85** | — |
| Env validation (`packages/env`, module `env.ts`) | **Done in #82** | — |
| Developer-facing app messages (admin:create, mutation gate output, `TenantScopeError`, `NoOrganizationError`, mailer log errors, i18n merge errors, database guards, ESLint rule messages) | **Done in #82** | — |
| Manifest `description` in `kit/modules/*.json` | **Done in #82** | — |
| `mutation-gate.json` `reason` texts (root and `packages/gato-cli`) | **Done in #82** | 11 `original`/`replacement` fields in the root file still quote Polish UI messages (invitation, invite, impersonation audit, API key errors, `"Nieprawidłowe dane"`); they change with the messages in step 5 |
| End-user messages (toast errors, better-auth errors, emails, `DataTable` labels, default organization name) | **In review: #84** (`feat/i18n-user-messages`) moves them to `pl`/`en` messages | After #84 its "left Polish" list: `DataTable` `resultsLabel`, `NOT_CONFIGURED_MESSAGE` in `signup-membership.ts`, Zod issue messages passed through by `inviteUserCommand`; about 16 non-test files in `src/` hold Polish literals today |
| `docs/*.md` (30 files, 27 with Polish names, ~172k words) | — | `01-uruchomienie.md` … `16b-rozwoj-kitu.md`, `decyzje.md` (D01–D52), `znane-ograniczenia.md`, `README.md`. Already English: `17-encryption-module.md`, `lessons.md`, `docs/adrs/` (ADR-53–58), `docs/lessons/` (17 files), `docs/agents/` |
| `docs/superpowers/**` (specs, plans, notes) | — | 27 Polish working documents from before 2026-11-21 (7 specs, 13 plans, 7 notes) plus the `notes/2026-10-30-docs-part-2-cli-draft/` folder; English ones from 2026-11-21 on. Agent-workflow Task 3 moves the folder first (section 5) |
| Test titles | — | ~1,870 `it`/`test`/`describe` titles with Polish text in ~180 files (33 in `packages/gato-cli`) |
| `// WHY:` comments | — | 6 with Polish text |

## 3. Principles

1. **User-facing text goes through i18n, not English literals.** A server error message that reaches the UI as a Polish literal becomes an i18n key translated in the user's locale (the approach of #84). Replacing `"Brak dostępu do organizacji"` with `"No access to the organization"` would only move the problem: a Polish user would then see English. Log messages and developer-facing errors (CLI, env validation, hooks) are plain English (done in #82).
2. **Behaviour does not change.** Test titles, docs and messages are translated; assertions on literal user-visible text change only together with the i18n move in principle 1, with the expected value still a literal from the spec.
3. **Anchors and references survive.** Every renamed doc gets a redirect table (old file name → new file name) in `docs/README.md` and a one-line stub at its old path, and `decyzje.md` becomes an anchor map (`#dNN` → ADR file), all for one minor release (decision 4). Decision numbers stay the same: `D01`–`D52` become `docs/adrs/01-…` … `docs/adrs/52-…` (ADR-53: new decisions are ADR files from 53, as `docs/adrs/README.md` already says).
4. **History stays readable.** Translating the old working documents costs more than it is worth. They move to `docs/archive/pl/` unchanged, with a note in English (decision 2); new specs, plans and notes are English in `docs/specs`, `docs/plans`, `docs/notes`.
5. **`docs/` is for contributors and agents.** Guides for people building on GatoJS belong on docs.gatojs.com; when a chapter in `docs/` turns out to be a user guide already covered there, the translation PR may shorten it to the contributor view and link the site, but it does not delete decisions, lessons or architecture notes.

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
| `decyzje.md` | split into `adrs/01-…md` … `adrs/52-…md` (same numbers), index in `adrs/README.md`; `decyzje.md` stays one minor release as the anchor map |
| `znane-ograniczenia.md` | `known-limitations.md` |

`17-encryption-module.md` is already English. The `16-*` names avoid `wa`: `gato-cli` ships the `gato` binary, and `wa` stays only as an alias until the rename plan (section 6). The self-hosting runbook (plan `2026-11-23-self-hosting.md`) is born English as `docs/self-hosting.md` and needs no rename.

## 5. Order of work

Each step is its own PR, so review stays readable and conflicts with other branches stay small.

**Before step 0: the agent-workflow plan** (`2026-11-22-agent-workflow.md`). Task 1 (`gato-task` skill, ADR-57) is **done in #87** and Task 2 (`.gato/phase`) is **done in #92**. Task 3 moves `docs/superpowers/{specs,plans,notes}` to `docs/specs`, `docs/plans`, `docs/notes` and is still open. It starts once this spec (#28) is merged, because the move breaks this branch's path; this spec moves with the folder. Every later step uses the new folders.

0. **Freeze window.** Agree with Kuba on a short window: merge or rebase the branches open at that time (today #84 and any plan branches in flight; the earlier spec PRs #26 and #59 are merged), then run steps 2 and 4 back to back. Branches opened during the window rebase onto the result.
1. **Agent instructions.** `AGENTS.md`, `CLAUDE.md`, `.github/README.md` and the hooks are **done (#81, #82, #92)**; `gato-task` is English (#87). Left: `kit/CLAUDE.md`, `README.md`, `kit/README.md`, `.claude/agents/test-writer.md`, `test-reviewer.md`, `.claude/skills/wa-*/SKILL.md` (Polish trigger phrases stay in `description`, as in `gato-task`). First, because agents writing the rest of the migration must read English rules. The architecture tests `cited-paths-exist`, `documented-commands-exist` and `agent-instructions-fit-the-budget` guard the references and the size. Owned by `core`: minor bump.
2. **Docs rename** (`git mv` per the table in section 4, plus link updates across the repo, ADR files included), no content change. A pure rename keeps `git log --follow` and review simple. The same PR adds the redirect table in `docs/README.md`, a one-line stub at every old path and the `decyzje.md` anchor map (decision 4).
3. **Docs translation**, in place in `docs/` (decision 3), one PR per chapter group (01–04b, 05–08b, 09–12, 13–16b, the D01–D52 split into `docs/adrs/`, `known-limitations.md`), each with one reviewer, Patryk or Kuba (decision 6). Translators keep anchors (`<a id>`) in English and add the old Polish anchors as extra `<a id>` aliases for one release. The ADR split fills the `decyzje.md` anchor map with the final ADR paths and updates the links that still point at `decyzje.md#dNN` (ADR-56, `docs/adrs/README.md`) and the "Numbering" paragraph of `docs/adrs/README.md`. Chapters that duplicate a docs.gatojs.com guide follow principle 5.
4. **Archive** the Polish working documents from before 2026-11-21, by then in `docs/specs`, `docs/plans` and `docs/notes`, to `docs/archive/pl/{specs,plans,notes}/` unchanged (decision 2), with an English `docs/archive/pl/README.md`. The same PR updates every link to a moved file (including `docs/README.md` and `AGENTS.md`, which cites `2026-10-27-adversarial-testing-research.md`), so no reference points at the old path.
5. **Remaining code messages.** Most of this step is done: developer-facing messages, CLI, env, hooks and manifest descriptions in **#82**; end-user errors, better-auth errors, emails and `DataTable` labels in **#84** (in review). Left after #84: its "left Polish" list (section 2), the email locale rule from decision 5 (see the note there), and the matching `original` fields of `mutation-gate.json`, changed in the same commit as their message, otherwise the gate stops on a stale entry. Test titles in the touched files are translated in the same PR. Follows the test-writer → implementer → test-reviewer process.
6. **Remaining test titles and `// WHY:` comments**, file by file, with no assertion changes.
7. ~~**Mutation gate reasons**~~ **Done in #82** (both files; the four `manifest/schema.ts` `original` fields too).
8. **Guard:** an architecture test that fails on Polish diacritics outside `**/i18n/pl.json`, `src/app/messages/pl.json`, `docs/archive/pl/` and the trigger phrases in skill `description` fields. In test files it inspects only test titles (`describe`/`it`/`test` names), not assertions, because tests that render the `pl` locale legitimately assert Polish UI text (for example `Hasło` in the sign-up tests).

Dependencies: agent-workflow Task 3 after this spec merges; step 1 before any other step, so every worker reads English rules. Step 2 (rename) is merged before step 3 (translation) and step 4 (archive) start. Within step 3 the chapter PRs can run in parallel. Step 5 waits for #84; step 8 comes last. Every step that changes a GatoJS file bumps the owning module's version and runs `npm run wa -- kit sync && npm run wa -- generate`, as the other plans do.

Remaining work, in order: agent-workflow Task 3 → step 1 (rest) → step 2 → steps 3 and 4 (parallel) → step 5 (after #84) → step 6 → step 8.

## 6. Out of scope

- Changing the default locale of new projects to `en` and the manifest schema rule (decision 1): a `create-gato-app` / `gato-cli` follow-up.
- Renaming `wa`/`.wa`, the `wa:*` markers, `kit/`, `kit.yml` and the `wa-*` skills to gato names: the packages plan leaves these to a separate rename plan (gato-cli spec, open question 1).
- Translating `docs/archive/pl/`.
- Writing the user documentation: it lives on docs.gatojs.com (decision 3).

## 7. Decisions (Patryk, 2026-11-23)

1. **Default locale of a new project:** `en` is the default, `pl` is an option in the `create-gato-app` wizard. The manifest schema rule `locales must include "pl"` (`packages/gato-cli/src/manifest/schema.ts`) becomes "the default locale must be listed". Implemented as a `create-gato-app` / `gato-cli` follow-up, not in this migration.
2. **Old working documents:** archived unchanged in `docs/archive/pl/` (step 4). No deletion or redaction; the history keeps them anyway.
3. **Where the docs live:** user-facing documentation lives on docs.gatojs.com. `docs/` in the repository stays for contributors and agents (architecture, decisions, lessons) and is translated in place (steps 2–3).
4. **Old paths after the rename:** the redirect table in `docs/README.md` plus a one-line stub at every old path linking to the new file, and a `decyzje.md` anchor map (`#dNN` → ADR), kept for one minor release (step 2, filled in step 3).
5. **Email templates:** their texts move to `src/app/messages/{pl,en}.json` and are rendered in the app's default locale. Note: #84 (in review) moves the texts to `emails` messages but renders them in the locale of the request that sends the email; Patryk decides on #84 whether that replaces this rule or #84 switches to the default locale before merging.
6. **Review of translated ADRs 01–52:** one reviewer (Patryk or Kuba) per ADR-translation PR, comparing meaning, numbers, paths and the "verified against code" commits.
