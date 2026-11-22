# Architecture Decision Records

One file per decision: `docs/adrs/NN-kebab-case-title.md`, where the title states the decision (`53-decisions-are-adrs-and-lessons-are-a-catalog.md`, not `53-decisions.md`).

## Numbering

ADR numbers continue the kit's earlier decision log. Decisions `D01`–`D46` and `D48`–`D52` live in [`../decyzje.md`](../decyzje.md). `D47` (`wa update`) is recorded in PR #14; its number is reserved and it lands in `decyzje.md` with that PR. The English migration splits D01–D52 into `docs/adrs/01-…` … `docs/adrs/52-…` with the same numbers. New decisions start at **ADR-53**. A link to an old decision stays `decyzje.md#dNN` until then.

Take the next free number when the ADR is written. Two branches can take the same number; the second one to merge renumbers its file and links before merging.

## Format

Copy [`TEMPLATE.md`](TEMPLATE.md). Required fields:

| Field | Content |
| --- | --- |
| Status | `Accepted`, `Accepted (supersedes ADR-NN)`, `Superseded by ADR-NN`, or `Proposed` while the PR is open |
| Date | The day the decision was recorded or shipped |
| Decided by | A person, or "an agent with <person>" |
| Context | The problem, understandable without the project's history |
| Decision | What was chosen and how it looks in the code |
| Rejected alternatives | Only the ones actually considered; "None recorded" otherwise |
| Consequences | What follows for someone writing code |
| Enforcement | The guard, test, CI workflow or hook that stops a violation, with its path; "Convention only" when only review catches it |
| Sources | Specs, plans, commits, PRs |

An ADR is not edited after it is accepted, except to fix a mistake or to add "Superseded by". A changed decision is a new ADR that supersedes the old one.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| [53](53-decisions-are-adrs-and-lessons-are-a-catalog.md) | Decisions are ADR files; gotchas go to a lessons catalog | Accepted |
| [54](54-kit-releases-are-cut-by-semantic-release.md) | Kit releases are cut by semantic-release from Conventional Commits on `main` | Accepted |
