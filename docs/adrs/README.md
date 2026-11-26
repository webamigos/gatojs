# Architecture Decision Records

One file per decision: `docs/adrs/NN-kebab-case-title.md`, where the title states the decision (`53-decisions-are-adrs-and-lessons-are-a-catalog.md`, not `53-decisions.md`).

## Numbering

ADR numbers continue the kit's earlier decision log. Decisions `D01`–`D52` live in [`../decyzje.md`](../decyzje.md); `D47` (`wa update`) landed there with PR #14. The English migration splits D01–D52 into `docs/adrs/01-…` … `docs/adrs/52-…` with the same numbers. New decisions start at **ADR-53**. A link to an old decision stays `decyzje.md#dNN` until then.

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
| [55](55-code-review-does-not-depend-on-coderabbit.md) | Code review does not depend on CodeRabbit | Accepted |
| [56](56-workspace-packages-replace-d29.md) | GatoJS code that needs its own package lives in `packages/`, as a tool package or a project package | Accepted (supersedes D29, part of D28) |
| [57](57-the-agent-workflow-is-shipped-by-gatojs.md) | The agent task workflow is the `gato-task` skill shipped by GatoJS; the superpowers plugin is an optional recommendation | Accepted |
| [58](58-organization-data-keys-are-wrapped-rows-created-on-first-use.md) | Each organization's data key is one wrapped row, created on first use, with no rotation yet | Accepted |
| [59](59-gato-files-are-protected-and-ejected-with-a-reason.md) | Gato files are protected and ejected with a recorded reason; the CLI state carries `kitFormat`, `ejected` and `seed` | Accepted |
| [60](60-project-configuration-is-applied-by-the-generated-registries.md) | Project configuration lives in `src/gato.config.ts` and is applied by the generated registries when they load | Accepted |
| [61](61-domain-events-run-subscribers-after-success.md) | Domain events carry the organization of their origin and run subscribers one at a time after the operation succeeded | Accepted |
| [64](64-production-mail-needs-a-configured-provider-or-explicit-console.md) | Production mail needs a configured provider or an explicit `console`, not Resend specifically | Accepted (supersedes the production `RESEND_API_KEY` rule of D17 and the note in D18) |
| [65](65-the-self-hosted-stack-is-a-core-compose-file-with-module-regions.md) | The self-hosted stack is a core Compose file with module regions, and it has no mail relay | Accepted |
| [67](67-projects-publish-their-own-multi-arch-image.md) | Projects publish their own multi-arch image to GHCR with `docker-publish.yml`; Railway is configured in the dashboard, not with `railway.json` | Accepted |
| [68](68-ui-slots-split-server-and-client-contributions.md) | UI slots keep server contributions out of the client registry, and core-hosted slots are configured under `modules.app` | Accepted |
