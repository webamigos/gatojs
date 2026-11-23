---
name: gato-task
description: Run a GatoJS task that changes code with tests (a feature, a fix, a module) end to end - plan with behaviours and mutations to kill, tests by `test-writer` before the code, an implementer with locked tests, `test-reviewer` with mutation testing, then the gates. Use when starting or orchestrating any such task. Triggers - "implement this task", "run the plan", "fix this bug with a test", "new feature", "zadanie z testami", "wykonaj plan", "popraw błąd z testem".
---

# A GatoJS task with tests

A test written by the code's author, after the code, repeats the author's assumptions and passes trivially. So the tests are written by a different agent than the code, before it, and the implementer cannot edit them. The rules are in `AGENTS.md` ("Tests that try to break the code"); the reasons and the full walk-through are in `docs/08b-testy-adwersarialne.md` in the `webamigos/gatojs` repo and at https://docs.gatojs.com/guides/ai-agents.

You are the **orchestrator**: the main agent session. You don't write the task's tests or code yourself; you run subagents, write and remove the phase file, and decide when a subagent reports a problem.

## Steps

1. **Plan.** Save the task as a spec or plan file. Every task has a "Behaviours" section (input → expected result as a literal) and a "Mutations to kill" section (code changes a test must catch, e.g. "removing the `organizationId` filter", "the `member` role gets access"). Name the files and signatures the task touches.
2. **Tests first.** Run the `test-writer` subagent (`.claude/agents/test-writer.md`) with the task from the plan and the signatures, not the implementation. It writes the tests and shows a red run for the right reason: a missing export or a wrong value, not a syntax or import error. For integration tests give it `npm run test:integration -- <files>` and the `_test` database. Commit the tests.
3. **Lock the tests.** Write `implement` to `.superpowers/phase` in the implementer's working copy: its worktree when it has one, not the main copy (`mkdir -p .superpowers && printf 'implement\n' > .superpowers/phase`). The `.claude/hooks/protect-tests.mjs` hook then blocks `Edit`/`Write` on `__tests__/`, `*.test.*`, `*.spec.*` and `e2e/`.
4. **Implement.** Run an implementer subagent with the plan and the test files. It makes the tests green without touching them. A test it thinks is wrong is reported, not fixed; you decide, and a changed test goes back to `test-writer`.
5. **Unlock.** When the tests are green, remove the phase file (`rm .superpowers/phase`).
6. **Review the tests.** Run the `test-reviewer` subagent (`.claude/agents/test-reviewer.md`). It runs `npm run test:mutation:task -- <files>` on the task's changed production files only (never the full `npm run test:mutation` suite) and `npm run test:mutation:gate`, then classifies every surviving mutant as a gap, an equivalent mutant or message text. Gaps go back to `test-writer`; security logic (auth, organizations, roles, guards, sign-up) has no gaps. New `allowed` entries in `mutation-gate.json` are only proposed in the report; a human adds them.
7. **Gates.** `npm run verify`; `npm run test:integration` when the task touches data code (every new query or command has an organization isolation test); then the `wa-code-review` skill (`.claude/skills/wa-code-review/SKILL.md`). Report the results with numbers, and say what was not run.

## Optional helpers

The superpowers plugin (`superpowers@superpowers-marketplace`, recommended in `.claude/settings.json`) has generic skills that fit around these steps: brainstorming and writing-plans for step 1, subagent-driven-development for running steps 2–6 task by task. They are optional. Nothing in GatoJS needs them, and when one of them disagrees with this skill, this skill wins: it knows the phase file, the agents and the gates.
