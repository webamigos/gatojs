# GatoJS

**An open-source Next.js kit for multi-tenant business applications.** Sign-in, invitations, organizations, roles and an admin panel arrive as plain code in your repository: yours to read, change and ship.

> **Work in progress.** GatoJS is the public name of a kit Web Amigos has used internally (working name `wa-kit`). We are opening it up step by step: parts of the documentation are still in Polish, and the `create-gato-app` / `gato-cli` npm packages are not released yet. Expect breaking changes before 1.0.

## What you get

- **Core:** sign-in and sessions (better-auth), organizations and members, global roles (`user`, `admin`, `superadmin`) and organization roles (`owner`, `admin`, `member`), invitations, account settings, a dashboard, i18n (`pl`, `en`), mail, logs and a health check.
- **Organization isolation by default:** every domain query goes through the organization context, and a runtime guard rejects queries without an organization filter.
- **Optional modules:** `api-keys`, `audit-logs`, `uploads` (local disk or S3).
- **A harness for AI agents:** rules in `AGENTS.md`, hooks that block code comments and protect tests from the implementer, adversarial tests written by a separate agent, a mutation gate for security-critical files.

## Quick look

Today a project is created from a clone of this repository with the bundled CLI:

```bash
git clone --depth 1 https://github.com/webamigos/gatojs.git gatojs
node gatojs/.wa/bin/wa.mjs create my-app
```

`npm create gato-app` is planned (spec in `docs/superpowers/specs/2026-11-21-gato-cli-design.md`).

## Documentation

- Rules for contributors and agents: [`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md)
- Kit documentation: [`docs/README.md`](../docs/README.md) (Polish, being translated)
- Decisions: `docs/adrs/` and [`docs/decyzje.md`](../docs/decyzje.md); gotchas: `docs/lessons.md`

## Contributing and security

See [`CONTRIBUTING.md`](../CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) and [`SECURITY.md`](../SECURITY.md).

## License

[Apache License 2.0](../LICENSE). Built by [Web Amigos](https://webamigos.pl).
