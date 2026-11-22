# Plan: the GatoJS agent workflow without a hidden dependency on superpowers

Date: 2026-11-22. Written by Patryk with an agent. Follows the packages plan (`2026-11-22-packages.md`); start after its Task 1 merges.

**Goal:** the task workflow (plan → `test-writer` → implementer with locked tests → `test-reviewer` → gates) is described and shipped by GatoJS itself, works in Claude Code without any plugin and in other agents through `AGENTS.md`, and no GatoJS path or name refers to the superpowers plugin.

## Where we are

- The repo relies on the superpowers plugin (`obra/superpowers`, MIT) without declaring it: `.claude/settings.json` does not enable it, while `.claude/agents/test-writer.md` and `test-reviewer.md` say "use in subagent-driven-development" (a superpowers skill) and `docs/08b-testy-adwersarialne.md` describes the orchestrator as superpowers' subagent-driven-development mode.
- The mechanism that matters is ours, but carries the plugin's name: the phase file `.superpowers/phase`, read by `.claude/hooks/protect-tests.mjs` (`PHASE_FILE`) and ignored in `.gitignore`, `.dockerignore`, `.prettierignore`, `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `stryker.config.json`, `stryker.integration.config.json` and `kit/kit.json` (`kitOnly`). The plugin knows nothing about it.
- Specs, plans and notes live in `docs/superpowers/{specs,plans,notes}`, linked from `AGENTS.md`, `.github/README.md`, `docs/README.md`, `docs/02-architektura.md`, `docs/11-praca-z-kitem.md`, ADR-53 and 16 files inside `docs/superpowers/` itself.
- Someone without the plugin (Codex, Cursor, Copilot, or Claude Code without it) has no description of how to run a task end to end.

## Decisions

- **Not vendored.** Copying superpowers' skills into the repo would ship a dozen generic skills into every project as core files and drift from upstream. GatoJS uses three of them (brainstorming, writing-plans, subagent-driven-development).
- **Recommended, not required.** `.claude/settings.json` declares the superpowers marketplace and plugin, so Claude Code offers to install it; nothing in GatoJS breaks without it.
- **Our workflow is our skill.** A `gato-task` skill holds the GatoJS-specific steps. `AGENTS.md` keeps the same steps in prose for other agents.
- **Names follow GatoJS** (Patryk, 2026-11-22: new names say GatoJS or gato): `.gato/phase`, `docs/specs`, `docs/plans`, `docs/notes`.
- Recorded as ADR-57 (next free number after ADR-56 from the packages plan; take the next free one if that moved).

## Rules for every task

- Read `CLAUDE.md`, `AGENTS.md`, `kit/CLAUDE.md` first.
- Hook changes are tested before they are changed: `test-writer` writes the failing cases in `.claude/hooks/*.test.mjs`, then the implementer works with the phase file set (in its own worktree).
- Every Gato file change bumps the owning module's version in `kit/modules/<module>.json`, then `npm run wa -- kit sync && npm run wa -- generate`, committed, then `git diff --exit-code`.
- Gates: `npm run verify` (includes `test:hooks` and the architecture tests `cited-paths-exist` and `documented-commands-exist`, which catch stale paths), `npm run verify --prefix packages/gato-cli` where CLI fixtures change.
- Conventional Commits, lowercase subjects, body lines ≤ 100 characters, footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push or PR; the coordinator does that.

```text
Task 1 (skill, agents, AGENTS.md, settings, ADR-57)
  └── Task 2 (.superpowers/phase → .gato/phase)
        └── Task 3 (docs/superpowers → docs/specs, docs/plans, docs/notes)
```

---

### Task 1: The `gato-task` skill and an explicit plugin recommendation

**Branch:** `feat/gato-task-skill`

- `.claude/skills/gato-task/SKILL.md` (owned by `core`, ships to projects): when to use (any task that changes code with tests: a feature, a fix, a module); steps:
  1. plan with "Zachowania" (input → literal expected result) and "Mutacje do zabicia" sections, saved as a spec or plan file;
  2. `test-writer` subagent writes the tests from the plan and the signatures, shows a red run for the right reason;
  3. the orchestrator writes `implement` to the phase file in the implementer's working copy (its worktree, not the main copy);
  4. implementer subagent makes them green without touching tests; a wrong test is reported, not fixed;
  5. the orchestrator removes the phase file;
  6. `test-reviewer` runs `npm run test:mutation:task -- <files>` and `npm run test:mutation:gate`; survivors go back to `test-writer`, `allowed` entries are only proposed;
  7. gates: `npm run verify`, integration tests for data code, `wa-code-review` skill.
  It links `docs/08b-testy-adwersarialne.md` for the reasons and mentions superpowers' brainstorming / writing-plans / subagent-driven-development as optional helpers for steps 1 and 2–6, never as required.
- `.claude/agents/test-writer.md`, `test-reviewer.md`: descriptions say "use in the `gato-task` workflow" instead of naming subagent-driven-development.
- `.claude/settings.json`: `extraKnownMarketplaces` with the superpowers marketplace (`obra/superpowers-marketplace` on GitHub) and `enabledPlugins` `superpowers@superpowers-marketplace: true`. Verify the exact marketplace and plugin ids against the plugin's README before committing, and that a session without network access to GitHub still starts.
- `AGENTS.md` (Task Router and "Testy, które próbują złamać kod"): a row "Zadanie z testami (funkcja, poprawka, moduł)" → skill `gato-task`; the orchestrator steps in prose for agents without skills. `CLAUDE.md` keeps its hard rules; `agent-instructions-fit-the-budget` must still pass.
- `.claude/skills/wa-new-module/SKILL.md` steps 7–9 point to `gato-task` instead of repeating it.
- `docs/08b-testy-adwersarialne.md`: the orchestrator is "the main agent session following the `gato-task` skill"; superpowers is optional.
- `docs/adrs/57-the-agent-workflow-is-shipped-by-gatojs.md` (from `TEMPLATE.md`), index in `docs/adrs/README.md`.
- Behaviours: `cited-paths-exist` and `documented-commands-exist` pass with the new skill; a project assembled with `node .wa/bin/wa.mjs create /tmp/x --kit . --yes --no-install --no-git` contains `.claude/skills/gato-task/SKILL.md`.

### Task 2: `.superpowers/phase` → `.gato/phase`

**Branch:** `refactor/gato-phase-file`

- `.claude/hooks/protect-tests.mjs`: `PHASE_FILE` becomes `.gato/phase`. For one minor version it also reads the legacy `.superpowers/phase`, so a project updated in the middle of a task, or an orchestrator still writing the old path, keeps its tests locked; the legacy read and its test are removed in the next minor version (note it in `docs/znane-ograniczenia.md` with the version).
- Tests first (`.claude/hooks/protect-tests.test.mjs`): blocks with `.gato/phase` = `implement`; blocks with the legacy file; passes with neither; the worktree and session-directory cases already covered for the old path are repeated for the new one.
- Ignores: `.gitignore`, `.dockerignore`, `.prettierignore`, `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `stryker.config.json`, `stryker.integration.config.json` get `.gato` (keep `.superpowers` next to it for the transition version); `kit/kit.json` `kitOnly` `.gato/**`; the CLI fixtures `kit/kit.json` copies under `packages/gato-cli/src/__tests__/fixtures/` follow.
- Docs and instructions: `CLAUDE.md`, `AGENTS.md`, `.claude/skills/*`, `docs/06-wzorce-kodu.md`, `docs/08-testy.md`, `docs/08b-testy-adwersarialne.md` (including the mermaid diagram and the shell snippet), `docs/09-nowy-modul.md`, `docs/10-wdrozenie.md`, `docs/11-praca-z-kitem.md`, `docs/16-cli-wa.md`, `docs/16b-rozwoj-kitu.md`, `docs/README.md`, `docs/decyzje.md` (a note under the decision that introduced the phase file, not a rewrite).
- `core` minor bump.
- Behaviours: `npm run test:hooks` green with the new cases; `git grep -n "\.superpowers"` outside the legacy read, its test, the transition ignores and dated notes/plans returns nothing.

### Task 3: `docs/superpowers/` → `docs/specs`, `docs/plans`, `docs/notes`

**Branch:** `docs/move-specs-and-plans`

- Start only when the spec and plan PRs open at that time are merged or rebased (today #26, #28, #59 and the packages plan), because the move breaks their paths; list the open ones in the PR description.
- `git mv docs/superpowers/specs docs/specs`, `plans` → `docs/plans`, `notes` → `docs/notes`; remove `docs/superpowers/`.
- Update links in `AGENTS.md`, `.github/README.md`, `docs/README.md`, `docs/02-architektura.md`, `docs/11-praca-z-kitem.md`, ADR-53 and the files inside the moved folders (16 today). Dated specs and plans keep their text; only paths change.
- Coordinate with the English migration spec (#28): if it renames docs files, this move goes first and #28 follows the new folders.
- `docs/**` is `kitOnly`, so projects are not affected; no module bump.
- Behaviours: `cited-paths-exist` passes; `git grep -n "docs/superpowers"` returns nothing.

---

## Definition of done

- `gato-task` skill in projects and the repo; agents and docs do not depend on the superpowers plugin; the plugin is a declared recommendation.
- Phase file `.gato/phase`, with the legacy path read for one minor version and its removal scheduled.
- Specs, plans and notes in `docs/specs`, `docs/plans`, `docs/notes`.
- ADR-57 merged; `verify`, hook tests and the architecture tests green.

## Out of scope

- Renaming the `wa-*` skills (`wa-code-review`, `wa-new-module`, `wa-upgrade-dependency`) to `gato-*`: part of the separate plan for the remaining kit → gato renames (`.wa/kit.json`, `wa kit sync`, `kit/`), so projects migrate once.
