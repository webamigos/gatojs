# Contributing to GatoJS

Thanks for your interest. GatoJS is a Next.js kit: a working application (core plus optional modules) whose code is copied into each new project. Changes here reach every project built from the kit, so the bar is correctness first.

> GatoJS is moving from an internal kit to an open-source project. Parts of the documentation are still in Polish and are being translated; English is the language for all new content.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Read [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md). They are the rules for humans and AI agents alike: data access through `getOrgContext()` and an `organizationId` filter, the service mode contract, no code comments except `// WHY:`, no edits to generated files.
- Kit-only rules (the CLI, manifests, releases) are in [`kit/CLAUDE.md`](kit/CLAUDE.md). New decisions are ADRs in [`docs/adrs/`](docs/adrs/README.md) (earlier ones in [`docs/decyzje.md`](docs/decyzje.md)); known gotchas are in [`docs/lessons.md`](docs/lessons.md).

## Development

```bash
npm ci
docker compose up -d          # Postgres and mailpit
npm run dev                   # http://localhost:3000
```

The getting-started guide is `docs/01-uruchomienie.md` (being translated).

## Pull requests

- Target `main`. Keep a pull request to one concern.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) with a lowercase subject (`feat(core): …`, `fix(uploads): …`). Husky runs lint-staged and commitlint.
- Run `npm run verify` before you open the pull request. For changes in `packages/gato-cli`, also `npm run verify --prefix packages/gato-cli`; for `packages/create-gato-app`, `npm run verify --prefix packages/create-gato-app`.
- Add tests for every behaviour you change. A bug fix comes with a test that fails without the fix. Expected values are literals or come from a spec, never from the code under test.
- Data access, auth, organizations and roles are covered by a mutation gate (`npm run test:mutation:task -- <files>`, `npm run test:mutation:gate`). Surviving mutants need a test or a justified `allowed` entry, which a maintainer approves.
- Changes to kit files bump the owning module's `version` in `kit/modules/<module>.json`, followed by `npm run wa -- kit sync`.

## Code review

You do not need CodeRabbit ([ADR-55](docs/adrs/55-code-review-does-not-depend-on-coderabbit.md)). Review your own change against [`.claude/skills/wa-code-review/SKILL.md`](.claude/skills/wa-code-review/SKILL.md), the checklist of what `npm run verify` cannot check (organization scoping, service mode, generated files, tests, i18n), and tick the PR template. In Claude Code the same checklist runs as the `wa-code-review` skill. If CodeRabbit is installed on the repository it comments on your pull request; treat its comments like any reviewer's. A pull request merges on the required checks and a maintainer's approval. CodeRabbit does not review pull requests automatically; if you want its review, comment `@coderabbitai review` on your PR.

## Reporting bugs and security issues

- Bugs and feature requests: GitHub issues, using the templates.
- Security vulnerabilities: never in a public issue. See [`SECURITY.md`](SECURITY.md).

## Code of conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
