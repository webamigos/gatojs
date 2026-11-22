# ADR-53: Decisions are ADR files; gotchas go to a lessons catalog

**Status:** Accepted
**Date:** 2026-11-22
**Decided by:** Patryk

## Context

The kit recorded decisions in one Polish file, `docs/decyzje.md` (D01–D49 on `main`, with D47 in PR #14 and D50–D52 in PR #29). Two problems showed up:

- Parallel branches append to the same file. Phase 1 of the harness work produced three branches that each added a decision (D50, D51, D52); all three conflicted in the header line, the number range, the index table and the entries, and had to be merged by hand.
- The kit had no place for non-obvious gotchas that are not decisions: a build that stops once on a Next.js security notice, `smtp://localhost` taking 17 seconds on macOS, Prisma refusing a database reset from an AI agent. They lived only in agent reports and were rediscovered by the next agent.

Ragen solves both with one file per ADR (`docs/adrs/NN-*.md`) and a lessons catalog (`docs/lessons.md` plus `docs/lessons/*.md`). The repository also moves to English-first content (spec `2026-11-22-english-first-design.md`).

## Decision

- New decisions are ADR files in `docs/adrs/`, in English, numbered from 53 so they continue the D-log without reusing a number. Format and rules: [`README.md`](README.md).
- `docs/decyzje.md` stays as the log of D01–D52 (D47 and D50–D52 arrive with PRs #14 and #29; their numbers are reserved) until the English migration splits it into ADR files with the same numbers.
- Non-obvious corrections and gotchas go to the lessons catalog: one file per lesson in `docs/lessons/<slug>.md` and one title-only line in [`../lessons.md`](../lessons.md). Each lesson has front matter (`title`, `areas`, `topics`), an "In short" paragraph and four sections: Context, Problem, Rule, Applies to.
- An agent checks the lessons for the area it touches before nontrivial work, and adds or extends a lesson after a nontrivial correction (`kit/CLAUDE.md`).

## Rejected alternatives

- Keep the single log and assign numbers up front: it works for planned work, but not for decisions that come up during review, and it still conflicts on the shared index and header.
- Lessons inside ADRs: most gotchas are not decisions, and mixing them makes the ADR index noisy.

## Consequences

- `docs/` stays kit-only (`kitOnly` in `kit/kit.json`): projects get neither ADRs nor lessons. Rules that projects need still go into `AGENTS.md` and `CLAUDE.md`.
- `docs/agents/domain.md` points the engineering skills at `docs/adrs/`.
- The lessons index lists titles only, so it stays cheap to read before starting work.

## Enforcement

Convention only, through `kit/CLAUDE.md` and `docs/agents/domain.md`. A test that keeps `docs/lessons.md` an index (titles and links only, as in Ragen's `the-lessons-index-stays-an-index.test.ts`) is part of harness phase 2.

## Sources

- Ragen: `docs/adrs/`, `docs/lessons.md`, `docs/lessons/`.
- Harness phase 1 integration (merge of D50–D52), 2026-11-22.
- Spec `docs/superpowers/specs/2026-11-22-english-first-design.md` (PR #28).
