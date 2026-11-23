# ADR-57: The agent task workflow is shipped by GatoJS; the superpowers plugin is an optional recommendation

**Status:** Proposed
**Date:** 2026-11-23
**Decided by:** an agent with Patryk (plan `docs/superpowers/plans/2026-11-22-agent-workflow.md`, 2026-11-22)

## Context

A task that changes code with tests runs in a fixed order: plan with behaviours and mutations to kill, tests by `test-writer` before the code, an implementer with the tests locked by the phase file and `.claude/hooks/protect-tests.mjs`, `test-reviewer` with mutation testing, then the gates ([D25](../decyzje.md#d25), [D26](../decyzje.md#d26)).

Until now that order was described as a mode of the superpowers plugin (`obra/superpowers`, MIT): the `test-writer` and `test-reviewer` agents said "use in subagent-driven-development" (a superpowers skill), and `docs/08b-testy-adwersarialne.md` called the orchestrator superpowers' subagent-driven-development mode. `.claude/settings.json` did not declare the plugin. Someone without it (Codex, Cursor, Copilot, or Claude Code without the plugin) had no description of how to run a task end to end, and nothing told them the plugin was expected.

## Decision

- The workflow is a GatoJS skill: `.claude/skills/gato-task/SKILL.md`, owned by `core`, so it ships to every project. It lists the seven steps (plan, `test-writer`, lock, implement, unlock, `test-reviewer`, gates) with the GatoJS-specific files and commands.
- `AGENTS.md` keeps the same steps in prose ("Running a task" under "Tests that try to break the code") and routes "Task with tests" to the skill, for agents that don't load skills.
- `test-writer` and `test-reviewer` describe themselves as part of the `gato-task` workflow. The `wa-new-module` skill points to `gato-task` instead of repeating its steps.
- The superpowers plugin is a declared recommendation: `.claude/settings.json` has `extraKnownMarketplaces` `superpowers-marketplace` (GitHub `obra/superpowers-marketplace`) and `enabledPlugins` `superpowers@superpowers-marketplace: true`, the ids from the plugin's README. Claude Code offers to install it; its brainstorming, writing-plans and subagent-driven-development skills are optional helpers for steps 1–6. Nothing in GatoJS breaks without it.

## Rejected alternatives

- Vendoring the superpowers skills into `.claude/skills/`: a dozen generic skills would ship into every project as core files and drift from upstream, while GatoJS uses three of them.
- Requiring the plugin: other agents can't install it, and the GatoJS-specific parts (phase file, agents, gates) are not in it anyway.
- The official marketplace id `superpowers@claude-plugins-official`: also valid per the README; the plan chose the plugin author's marketplace, which is what the team uses. Either works, only one is declared.

## Consequences

- A change to the task workflow is made in `.claude/skills/gato-task/SKILL.md` and in the "Running a task" steps in `AGENTS.md`, together, with a `core` version bump.
- Agent definitions and docs don't name superpowers skills as required steps.
- The phase file is still `.superpowers/phase`; renaming it to `.gato/phase` is the next task of the same plan.

## Enforcement

`src/__tests__/architecture/agent-workflow-is-shipped.test.ts` (skill exists with its steps in order, plugin declared with the verified ids, hooks kept, agents point to `gato-task`, `AGENTS.md` and `wa-new-module` point to it). `cited-paths-exist` and `documented-commands-exist` check the paths and commands the skill names.

## Sources

- Plan `docs/superpowers/plans/2026-11-22-agent-workflow.md`, Task 1.
- Superpowers README, "Claude Code" section (`/plugin marketplace add obra/superpowers-marketplace`, `/plugin install superpowers@superpowers-marketplace`), and `obra/superpowers-marketplace` `.claude-plugin/marketplace.json` (`name: superpowers-marketplace`, plugin `superpowers`), checked 2026-11-23.
