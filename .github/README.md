# GatoJS

**The boring half of your next business app, already written.**

GatoJS is an open-source Next.js kit for multi-tenant business applications. Sign-in, invitations, organizations, roles and an admin panel land in your repository as plain code. No package to update, no framework to fight: you read it, change it and ship it.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](../LICENSE)
[![CI status on main](https://github.com/webamigos/gatojs/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/webamigos/gatojs/actions/workflows/ci.yml)
[![E2E status on main](https://github.com/webamigos/gatojs/actions/workflows/e2e.yml/badge.svg?branch=main)](https://github.com/webamigos/gatojs/actions/workflows/e2e.yml)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](../CONTRIBUTING.md)
[![Built with TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Built with Next.js 16](https://img.shields.io/badge/Next.js-16-555555.svg?logo=nextdotjs&logoColor=white&labelColor=000000)](https://nextjs.org)

[Quick start](#-quick-start) ·
[What's in the core](#-whats-in-the-core) ·
[Modules](#-modules) ·
[Built for AI agents](#-built-for-ai-agents) ·
[Roadmap](#-roadmap) ·
[Contributing](../CONTRIBUTING.md) ·
[Security](../SECURITY.md)

```bash
git clone --depth 1 https://github.com/webamigos/gatojs.git gatojs
node gatojs/.wa/bin/wa.mjs create acme-crm
cd acme-crm && docker compose up -d && npm run dev
```

Needs Node.js 22 and Docker. `npm create gato-app` is on the way ([roadmap](#-roadmap)).

> **Work in progress.** GatoJS is the open-source release of the kit Web Amigos builds client apps on (working name `wa-kit`). Parts of the documentation are still in Polish while we translate them, and breaking changes can land before 1.0.

Built and maintained by **[Web Amigos](https://webamigos.pl/en?utm_source=github&utm_medium=readme&utm_campaign=gatojs)**.

---

## 🧩 The problem

Every business app starts with the same weeks of work: accounts, teams, permissions, invitations, emails, an admin panel, deployment. It is never the part the client pays for, and it is the part where a mistake costs the most: one missing filter and a customer sees another customer's data.

The usual answers both hurt. A SaaS boilerplate gives you code once and leaves you alone with it. A framework package keeps the code in `node_modules`, where changing how something works means config flags, overrides or a fork, and an upgrade you did not write can break your app.

## 💡 Why GatoJS

**Copied into your repo, not installed from npm.** A small CLI copies the core and the modules you choose into a fresh repository. It's plain Next.js, Prisma and TypeScript, next to your own code. A fix that would help everyone goes back to the kit as a pull request.

| | A framework package | GatoJS |
| --- | --- | --- |
| Changing how something works | Config options, overrides or a fork | Edit the file |
| Reading the source | Somewhere in `node_modules` | In your editor, next to your code |
| What breaks your app | An upgrade you didn't write | A change you made and can see in git |
| Getting upstream fixes | `npm update` | You pull them in deliberately |

**Organization isolation is enforced, not hoped for.** Every record belongs to an organization. Queries go through the organization context, a runtime guard rejects a query on organization data without an organization filter, and an isolation test on a real database proves that one organization never sees another's data.

**Roles the server enforces.** The menu and the page guard use the same access check, so what people see is exactly what they can open. Every server action checks permissions itself.

**Safe support access.** Your team gets superadmin accounts that client admins can't touch. Sign in as a user to reproduce a bug; in a client's organization, every change to their data asks for confirmation first.

**Tests that try to break the code.** A separate agent writes the tests before the code exists, expected values come from the spec, and mutation testing flips conditions in the new code. A surviving mutant in a security-critical file blocks the change.

## 📦 What's in the core

- **Sign-in and invitations:** email and password, password reset and invitations, built on better-auth. Public sign-up stays off until you turn it on.
- **Organizations:** one flag switches between an app for a single company and a multi-tenant SaaS with an organization switcher. The data model stays the same.
- **Roles:** `user`, `admin` and `superadmin` across the app; `owner`, `admin` and `member` inside an organization.
- **Two languages from day one:** English and Polish through next-intl, with each feature's translations next to its code.
- **Email that works locally:** SMTP or Resend in production, mailpit on your machine, so invitations and resets are testable without a real inbox.
- **Production basics:** environment checked at startup, OpenTelemetry logs, security headers, a health check endpoint, a Dockerfile and a Railway config.
- **Tests:** Vitest for units, Playwright end to end, integration tests on real PostgreSQL, Stryker mutation testing.

## 🧱 Modules

Add them when a project needs them, remove them when it doesn't. A module only adds files: it never edits core code, because the core learns about it through a generated registry. Each module brings its own database models, screens, translations and tests.

| Module | What it does | Status |
| --- | --- | --- |
| `audit-logs` | Who changed what, and when, in each organization: a ready audit log page plus one call to record events from your own code | Ready |
| `api-keys` | Organization API keys with scopes, stored as hashes; your endpoints declare the scopes they need and get the organization from the key | Ready |
| `uploads` | Organization files on local disk or S3-compatible storage, with public and private files | Ready |
| Background jobs | A job queue and scheduled tasks, including retention and cleanup | Planned |
| MCP | Expose your app to AI assistants over MCP with OAuth, built on better-auth 1.7 | Planned |
| Legal pages | Terms, privacy policy and a cookie banner | Planned |

```bash
npm run wa -- add uploads
```

## 🤖 Built for AI agents

The kit is built to be worked on with AI coding agents, and to stay correct when they do. The process that built it ships with every project.

1. **You** describe the task: a short spec of what the feature does and which rules it touches.
2. **A test writer** writes the tests first. Expected values come from the spec, never from the code under test.
3. **An implementer** writes the code. A hook locks the test files, so the only way to green is working code.
4. **A test reviewer** tries to break the tests with mutation testing. A surviving mutant in a critical file blocks the task.
5. **The gate**, `npm run verify`: lint, types, tests and a production build. Nothing ships until it passes.

`AGENTS.md` and `CLAUDE.md` explain the architecture and the hard rules, such as filtering every query by organization. Project skills cover code review, new modules and dependency upgrades, and architecture tests keep the instructions honest: every command and path they cite has to exist.

## 📸 Screenshots

Coming soon.

## 🚀 Quick start

```bash
git clone --depth 1 https://github.com/webamigos/gatojs.git gatojs
node gatojs/.wa/bin/wa.mjs create acme-crm   # asks for modules, languages and the first admin
cd acme-crm
docker compose up -d                          # PostgreSQL and mailpit
npx prisma migrate dev --name init
npm run admin:create -- --email you@example.com
npm run dev                                   # http://localhost:3000
```

`create` can also start Docker, run the first migration and create the admin for you (`--setup`). The full guide is in [`docs/01-uruchomienie.md`](../docs/01-uruchomienie.md) (Polish, being translated).

## 🧰 Built on tools you already know

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma 7 · PostgreSQL · better-auth · next-intl · Vitest · Playwright · Stryker · OpenTelemetry · Docker

## 🧭 Roadmap

- `npm create gato-app` and a `gato` CLI on npm ([spec](../docs/superpowers/specs/2026-11-21-gato-cli-design.md))
- Extending kit behaviour without editing kit files: slots, component overrides, events and command hooks
- English documentation
- Background jobs and MCP modules
- A guided upgrade command for existing projects

## 📚 Documentation

- Rules for contributors and agents: [`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md)
- Kit documentation: [`docs/README.md`](../docs/README.md) (Polish, being translated)
- Decisions: [`docs/adrs/`](../docs/adrs/README.md) (ADR-53 onwards) and [`docs/decyzje.md`](../docs/decyzje.md) (D01–D52); gotchas: [`docs/lessons.md`](../docs/lessons.md)

## 🤝 Contributing

Issues and pull requests are welcome. Read [`CONTRIBUTING.md`](../CONTRIBUTING.md) and the [Code of Conduct](../CODE_OF_CONDUCT.md) first. Security issues go through [`SECURITY.md`](../SECURITY.md), never a public issue.

## 📄 License

[Apache License 2.0](../LICENSE).

## ℹ️ About

GatoJS is built by **[Web Amigos](https://webamigos.pl/en?utm_source=github&utm_medium=readme&utm_campaign=gatojs&utm_content=about)**. It is the kit our own client projects start from, published so others can start from it too.
