# ADR-55: Code review does not depend on CodeRabbit

**Status:** Accepted
**Date:** 2026-11-22
**Decided by:** Patryk

## Context

The repository is public, and pull requests now come from people who may not have, or want, CodeRabbit: an external contributor, a fork, a project assembled from the kit without the CodeRabbit app, or a moment when CodeRabbit is rate limited (it was, on PR #25). Until now the docs described CodeRabbit as the reviewer of pull requests (`docs/11-praca-z-kitem.md`, "Praca z agentami AI"), which reads as a requirement.

What a review must check is already in the repo, independent of any service: the `wa-code-review` skill (`.claude/skills/wa-code-review/SKILL.md`) lists the invariants `npm run verify` cannot check, the PR template has the same checklist, and the required status checks run on GitHub Actions.

## Decision

- CodeRabbit is optional. It is never a required status check in the `main` ruleset, and no workflow, script or merge rule waits for it.
- The canonical review checklist is `.claude/skills/wa-code-review/SKILL.md`. It is a plain Markdown file: Claude Code loads it as a skill, any other agent (Codex, Cursor, Copilot) or a human reads it directly. A contributor without CodeRabbit runs `npm run verify`, goes through that checklist and the PR template, and states the result in the pull request.
- A pull request is merged on the required checks plus a maintainer's approval (ruleset "Protect main"). CodeRabbit comments, when present, are treated like any reviewer's comments: fixed or answered, not a gate.
- `.coderabbit.yaml` stays in the core, so projects that use CodeRabbit get the kit's settings; without the CodeRabbit app installed the file does nothing.

## Rejected alternatives

- CodeRabbit as a required check: it would block every contributor and fork without the app, and every PR while it is rate limited.
- Removing `.coderabbit.yaml`: teams that use CodeRabbit would lose the kit's configuration (guidelines from `AGENTS.md` and `CLAUDE.md`, tools, auto-review rules).

## Consequences

- `CONTRIBUTING.md`, the PR template, `AGENTS.md` and `docs/11-praca-z-kitem.md` say that review works without CodeRabbit and point to the checklist.
- The checklist must stay usable outside Claude Code: no step may depend on a Claude-only tool without naming the plain command next to it.

## Enforcement

The `main` ruleset lists only GitHub Actions checks (`Generate + verify`, `Integration tests (Postgres)`, `CLI (verify + bundle)`, `Scan for committed secrets`). Otherwise convention.

## Sources

- Patryk, 2026-11-22: "the project should not depend on CodeRabbit, only use it optionally".
- Ragen `AGENTS.md`, Post-Task Workflow: "`/coderabbit:review` where the plugin is installed, otherwise the `ragen-code-review` skill".
