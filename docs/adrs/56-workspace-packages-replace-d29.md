# ADR-56: GatoJS code that needs its own package lives in `packages/`, as a tool package or a project package

**Status:** Accepted (supersedes [D29](../decyzje.md#d29) and the "outside the workspaces" part of [D28](../decyzje.md#d28))
**Date:** 2026-11-22
**Decided by:** Patryk (spec decisions of 2026-11-22), written up by an agent

## Context

The root `package.json` has declared `workspaces: ["packages/*", "apps/*"]` since the first plan, but D29 kept
both directories empty and D28 put the CLI outside the workspaces, in `kit/cli` with its own lockfile. The reason
was that a workspace makes the root lockfile and the `Dockerfile` depend on it, so a project assembled without it
would not build its Docker image.

Two kinds of code now want a package: the GatoJS tools published to npm (`gato-cli`, `create-gato-app`) and shared
code a project uses (`@gatojs/env`, `@gatojs/observability`, `@gatojs/crypto`, `@gatojs/eslint-config`). Nothing
could hold a package: the `Dockerfile` copied only the root `package.json` and lockfile before `npm ci`, and
`tsconfig.json`, ESLint and Vitest ignored `packages/**`.

## Decision

- **Two kinds of packages.**
  - *Tool packages* (`packages/gato-cli`, `packages/create-gato-app`): unscoped npm names, their own build to
    `dist/`, their own `tsconfig.json`, ESLint config, Vitest and Stryker setup, published to npm by package tags.
    They are on the `kitOnly` list in `kit/kit.json`, so a project never gets them; a project installs them from
    npm. `packages/gato-cli` still produces the committed `.wa/bin/wa.mjs`.
  - *Project packages* (`@gatojs/<name>`, `private: true`): copied into projects like any GatoJS file and owned by
    a manifest. No build step: `exports` point at TypeScript sources, consumed through `transpilePackages`.
- **One lockfile.** Every workspace present in the GatoJS repository is in the root `package-lock.json`;
  `packages/gato-cli/package-lock.json` is gone. `wa create` copies the lockfile and `npm install` drops the
  `kitOnly` tool packages from it.
- **Dockerfile region.** The `deps` stage has a `# wa:workspaces:start` / `# wa:workspaces:end` region between
  `COPY package.json package-lock.json ./` and `RUN npm ci`. `wa generate` fills it with
  `COPY packages/<name>/package.json ./packages/<name>/package.json` for every `packages/<name>` directory with a
  `package.json`, sorted by code point (`workspacesBody` in `packages/gato-cli/src/generate/targets.ts`). A
  project with no packages gets an empty region. `COPY packages/*/package.json` is not used because classic
  Docker flattens the paths.
- **Quality gates.** The root `tsconfig.json`, `eslint.config.mjs` and Stryker `mutate` cover `packages/**` except
  the tool packages. `vitest.config.ts` has two projects: `app` (the earlier include list, jsdom) and `packages`
  (`packages/*/src/**/*.test.ts`, node). Project packages have no test runner and no `test` script of their own;
  tool packages keep theirs (`TOOL_PACKAGES` in `scripts/lib/architecture/workspaces.ts`). `.lintstagedrc.json`
  runs the root ESLint on every staged file and, for a workspace with its own `eslint.config.*`,
  `npm exec --workspace=<name> -- eslint`, because ESLint 9 reads the config from its working directory.
- **Ownership.** A manifest may own `packages/<name>/**` through `files`; D38's one-owner rule and D31's hashes
  apply unchanged. A project package declares its npm dependencies in its own `package.json`, which the owning
  manifest owns. The root `package.json` and the manifests' `dependencies` stay for the app. (This replaces the
  spec's §3.3 wording that put package dependencies into the manifest.)

## Rejected alternatives

- Keeping the CLI outside the workspaces with its own lockfile (D28): two lockfiles to keep in sync, two installs
  in CI, and no place for project packages anyway.
- A build step for project packages: `next build`, `npm run dev` and Stryker would need a package build order.
- `COPY packages/*/package.json ./packages/` in the Dockerfile: classic Docker flattens the paths.
- Per-package Vitest for project packages: two runners and two Stryker entry points.

## Consequences

- Install everything, the CLI included, with `npm ci` in the repository root; add a CLI dependency with
  `npx -y npm@11.21.1 install <pkg> --workspace gato-cli`.
- `npm run verify` runs `turbo run test typecheck lint`, which now includes the tool packages' own scripts.
- A new tool package goes into `TOOL_PACKAGES`, `kitOnly`, the root ignores (`tsconfig.json`, `eslint.config.mjs`,
  `vitest.config.ts`, `stryker.config.json`) and, if it has its own ESLint config, `.lintstagedrc.json`.
- A project created with `--no-install` keeps the GatoJS lockfile, which still lists the tool packages, until its
  first `npm install`.

## Enforcement

- `src/__tests__/architecture/dockerfile-installs-every-workspace.test.ts`: the region lists exactly the
  `packages/*` directories with a `package.json`.
- `src/__tests__/architecture/one-test-runner-for-every-workspace.test.ts`: project package tests are inside the
  root `packages` Vitest project and project packages declare no `test` script; tool packages have their own.
- `src/__tests__/architecture/lint-staged-covers-every-workspace.test.ts`: every workspace with source files is
  linted on commit.
- `packages/gato-cli/src/kit/__tests__/ownership.test.ts`: every file has one owner or is `kitOnly`.
- The `assemble` job in `.github/workflows/kit.yml`: an assembled project has an empty region and builds its image.

## Sources

- Spec [2026-11-22-packages-design.md](../superpowers/specs/2026-11-22-packages-design.md) §2, §3 and §7.
- Plan [2026-11-22-packages.md](../superpowers/plans/2026-11-22-packages.md), Task 1.
- Ragen's `a-scoped-dockerfile-installs-every-workspace-dep`, `one-test-runner-for-every-workspace` and
  `lint-staged-covers-every-workspace` architecture tests.
