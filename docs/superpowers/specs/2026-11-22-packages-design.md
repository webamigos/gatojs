# `packages/`: workspace packages for GatoJS tools and shared code

Date: 2026-11-22. Drafted by Patryk with an agent. Draft for review (CodeRabbit and Patryk); a plan follows acceptance.

Sources:

- Ragen's packages: `ragen-app/packages/env` (typed env fragments, `parse.ts`, `rules.ts`, `fragments.ts`), `observability` (`otel-logger.ts`, `telemetry.ts`), `crypto` (`envelope.ts`, `master-key.ts`, `key-provider/*`, `probe.ts`, `require-encryption.ts`), `eslint-config` (`base.js`, `next.js`, `node.js`), and the architecture tests `a-scoped-dockerfile-installs-every-workspace-dep`, `packages-build-in-dependency-order`, `lint-staged-covers-every-workspace`;
- the first research answer of 2026-11-21 (what to take from each Ragen package);
- kit decisions D28 (CLI in `kit/cli`, committed bundle), D29 (empty `packages/*`), D30 (project `package.json` is the sum of manifests), D31 (hashes), D38 (one owner per file), D39 (kit code is plain code in the project); ADR-54 (semantic-release, PR #52);
- specs: `2026-11-21-gato-cli-design.md` (§4: `packages/` for the tools), `2026-11-22-extensibility-design.md` (PR #26);
- `Dockerfile`, `tsconfig.json` (`exclude: packages/**`), `eslint.config.mjs` (`globalIgnores: packages/**`), `vitest.config.ts`, `stryker.config.json`, `turbo.json`, `src/shared/lib/env.ts`, `src/shared/lib/logger.ts`, `src/instrumentation.ts`.

## 1. Why

`package.json` has declared `workspaces: ["packages/*", "apps/*"]` since plan 1, but D29 keeps both directories empty. Two kinds of code now want a package:

- **Kit tools** published to npm: `gato-cli` (today `kit/cli`) and `create-gato-app` (being built in `kit/create-gato-app`). Patryk decided on 2026-11-21 that their sources live in `packages/`.
- **Shared code** a project uses, ported from Ragen: typed env fragments, OpenTelemetry helpers, envelope encryption, a shared ESLint config.

Nothing in the repo can hold a package today: the `Dockerfile` copies only the root `package.json` and lockfile before `npm ci`, `tsconfig.json` and ESLint ignore `packages/**`, and no manifest can own a package.

## 2. Two kinds of packages

| | Tool packages | Project packages |
| --- | --- | --- |
| Examples | `packages/gato-cli`, `packages/create-gato-app` | `packages/env`, `packages/observability`, `packages/crypto`, `packages/eslint-config` |
| Reach a project | No (`kitOnly`); a project installs them from npm | Yes, copied like any kit file, owned by a manifest (`core` or a module) |
| Build | Own `build` (tsc or esbuild) to `dist/`, published to npm | No build: `exports` point at TypeScript sources, consumed through `transpilePackages` |
| Released by | Package tags (`gato-cli@x.y.z`), gato spec §9 | The kit release (ADR-54), as part of the kit version |
| Name | Unscoped npm names (`gato-cli`, `create-gato-app`) | `@gatojs/<name>`, `private: true` |

A project package is plain code in the project, exactly like `src/shared/lib/*` today (D39): a project can read and change it, and hashes in `.wa/kit.json` track it. The package boundary adds what a folder does not: its own `package.json` dependencies, its own tests and typecheck, and an import name (`@gatojs/env`) that does not depend on the app's path aliases.

## 3. Workspace infrastructure (ADR-56, replaces D29 and the "no npm" part of D28)

### 3.1 Install and build

- Root `workspaces` stays `["packages/*", "apps/*"]`. The lockfile includes every workspace present in the kit. A project's lockfile is adjusted by `npm install` at `create` (as today), so tool packages that are `kitOnly` drop out of it.
- **Dockerfile:** the `deps` stage must see every workspace manifest before `npm ci`. `COPY packages/*/package.json` flattens paths in classic Docker, so the stage copies each manifest explicitly from a generated region:

  ```dockerfile
  COPY package.json package-lock.json ./
  # wa:workspaces:start
  COPY packages/env/package.json ./packages/env/package.json
  COPY packages/observability/package.json ./packages/observability/package.json
  # wa:workspaces:end
  RUN npm ci --ignore-scripts
  ```

  `wa generate` fills the region from the workspace directories present in the project (kit-only tool packages are absent in projects, so they never appear there). An architecture test (Ragen's `a-scoped-dockerfile-installs-every-workspace-dep`) checks that the region lists exactly the workspaces on disk.
- **No build step for project packages:** `"exports": { ".": "./src/index.ts" }`; `next.config.ts` lists them in `transpilePackages`; Vitest and `tsc` resolve them through the workspace symlink in `node_modules`. This keeps `next build`, `npm run dev` and Stryker free of a package build order.
- **Tool packages** keep their own build (`gato-cli`: esbuild bundle, as `kit/cli` today; `create-gato-app`: tsc). The committed `.wa/bin/wa.mjs` keeps being produced from `packages/gato-cli` until the gato spec's devDependency step removes it.

### 3.2 Quality gates

- `tsconfig.json` and `eslint.config.mjs` stop ignoring `packages/**`. Each package has `typecheck`, `test` and `lint` scripts; `turbo run test typecheck lint` (already in `npm run verify`) runs them.
- **One root Vitest with projects, as in Ragen:** `vitest.config.ts` gets `test.projects`: `app` (today's `src/**` and `scripts/**` tests, jsdom setup unchanged) and `packages` (`packages/*/src/**/*.test.ts`, node environment). Project packages have no test runner or `test` script of their own; tool packages keep their own runner (`gato-cli` today runs Vitest with its own Stryker setup, which stays). `npm test` and Stryker keep one entry point. An architecture test (Ragen's `one-test-runner-for-every-workspace`) fails when a project package has tests the root config does not include, or declares its own `test` script.
- Stryker `mutate` covers `packages/*/src/**/*.ts` (minus tests). `packages/crypto/src/` is added to `mutation-gate.json` `critical`.
- lint-staged runs ESLint per workspace; an architecture test keeps the list complete (Ragen's `lint-staged-covers-every-workspace`).
- The kit's `assemble` job keeps proving that a project with any module set builds, tests and runs `docker build`.

### 3.3 Ownership

- Manifests own packages through `files` (`"packages/env/**"` in `core`, `"packages/crypto/**"` in the `encryption` module). D38's one-owner rule and D31's hashes apply unchanged.
- A package's npm dependencies are listed in the owning manifest's `dependencies`, like today's module dependencies, so `wa add`/`wa remove` keep working (D30). The root `package.json` does not list them.
- `kitFormat` (gato spec §6) is bumped when the first project package ships, because a project's layout and Dockerfile change.

## 4. The packages

### 4.1 `packages/gato-cli` and `packages/create-gato-app` (tools)

`git mv kit/cli packages/gato-cli` and `git mv kit/create-gato-app packages/create-gato-app`, with no behaviour change, plus the path updates (`kit.yml`, `kit/CLAUDE.md`, docs, Stryker and mutation-gate paths of the CLI). Both stay `kitOnly`. Publishing follows the gato spec §9.

### 4.2 `packages/env` (project, owned by `core`)

From Ragen's `env`, only the generic parts:

- the whole env layer moves into the package, as in Ragen, and **`src/shared/lib/env.ts` is removed**:
  - `coreEnvSchema` (today's schema in `src/shared/lib/env.ts`, rewritten with the fragments below);
  - `checkEnv`, `formatEnvReport`, `parseEnv` and `verifyEnvOnStartup` (D48), returning every issue at once;
  - `createEnv(moduleSchemas)`, which returns the lazy, validated `env` object for the core schema merged with module schemas;
- fragments: `httpUrl()` (rejects a scheme-less URL: `z.url()` accepts `localhost:4318`, checked on 2026-11-21, so `S3_ENDPOINT` and `OTEL_EXPORTER_OTLP_ENDPOINT` accept a typo today), `blankAsUndefined()` (empty or whitespace-only means unset; today `optionalString` handles only `""`), `flag()`;
- rules: `allOrNone(names)`, `requiredForProvider(providerVar, value, names)`.

- The package cannot import the app's generated registry, so the binding lives in the generated file: `wa generate` writes `export const env = createEnv(moduleEnvSchemas)` into `src/modules.generated.ts` (server registry). Code imports `env` from there, or through a stable re-export `@/env` that the generator also writes; every import of `@/shared/lib/env` is migrated.
- Module `env.ts` files build their schemas from the package's fragments and rules.
- Ragen's `defineConfig`, provider seams and config groups are Ragen-specific and stay out; the mail and storage provider rules of the self-hosting spec (#59) are written with `requiredForProvider`.

### 4.3 `packages/observability` (project, owned by `core`)

- `createLogger(scope)`: today's `src/shared/lib/logger.ts`, including its fix for minified error class names (Ragen's copy still reads `constructor.name`).
- `createTelemetry(serviceName)` with `withSpan(name, attributes, fn)`, `tracer` and `meter`.
- `src/instrumentation.ts` registers a trace exporter (`/v1/traces`) next to the log exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and optionally `@prisma/instrumentation`. No exporter is created without the endpoint, as today.
- Ragen's pino bridge stays out (the kit does not use pino).

### 4.4 `packages/crypto` and an `encryption` module

- `packages/crypto` (owned by the new `encryption` module, so a project without it carries nothing): Ragen's `envelope.ts` (AES-256-GCM, format `base64(IV[12] ‖ ciphertext ‖ tag[16])`, pinned by a fixed test vector), `parseMasterKey` (hex or base64, 32 bytes), the `KeyProvider` interface, `probeEncryptionProvider` and `assertEncryptionAvailable`. Ragen's thread, owner-key and MCP-service code is Ragen-specific and stays out.
- **Key providers, decided:** the first version ships `local` only (`ENCRYPTION_PROVIDER=local`, a master key in `ENCRYPTION_MASTER_KEY` wrapping per-organization data keys). It needs no external service, so it works self-hosted (#59) and on Railway, which has no KMS. `aws-kms` and `scaleway-kms` come in a follow-up step behind the same `KeyProvider` interface, ported from Ragen with their tests, when a project needs a managed KMS; their SDKs (`@aws-sdk/client-kms`) are then the module's dependencies only for that variant.
- The `encryption` module adds env (`ENCRYPTION_PROVIDER`, `ENCRYPTION_MASTER_KEY`, provider credentials) with `requiredForProvider` rules from `packages/env`, a startup probe, and a small API for modules: `encryptForOrganization(organizationId, plaintext)` / `decrypt…` with a per-organization data key stored encrypted.
- Security-critical: `packages/crypto/src/` and the module's services are in `mutation-gate.json` `critical`.

### 4.5 `packages/eslint-config` (project, owned by `core`), last

Ragen's base rules that fit the kit (`eqeqeq`, `no-console`, `consistent-type-imports`, the ignore list including Playwright output), plus the kit's rules (`curly`, `no-nested-ternary`, the error-class-name rule). Ragen's relaxations (`no-explicit-any: off`, React Compiler rules as warnings) stay out. The root `eslint.config.mjs` and every package import it. It ships only when there are at least two workspaces to lint, which step 2 provides.

## 5. Order of work

1. **Infrastructure** (ADR-56): Dockerfile region and generator support, tsconfig/ESLint/Vitest/Stryker/turbo changes, architecture tests, manifest ownership of packages, `kitFormat` bump. Proven with an empty probe package that is removed before merge, or with step 2.
2. **Move the tools** to `packages/gato-cli` and `packages/create-gato-app` (no behaviour change). The current `gato-cli` and `create-gato-app` workers' branches are rebased onto this.
3. **`packages/env`** and its use in `src/shared/lib/env.ts` and the `uploads` env (`S3_ENDPOINT` through `httpUrl`).
4. **`packages/observability`**, the logger move and tracing in `instrumentation.ts`.
5. **`packages/crypto`** and the `encryption` module.
6. **`packages/eslint-config`**.

Each step is a PR with the usual process (test-writer before the implementer, mutation review for critical files, `npm run verify` and the `assemble` matrix).

## 6. Out of scope

- `apps/*` (a worker or an API app) and a jobs package; they come with a background-jobs module.
- Publishing project packages to npm. They are copied into projects (D39); publishing them would be the extensibility spec's variant B (#26).
- Ragen's `connector-guard` (SSRF-safe fetch) and `storage` (the `uploads` module already has its providers).

## 7. Decisions (Patryk, 2026-11-22)

1. Project packages are named `@gatojs/<name>` (`private: true`, not published).
2. `@gatojs/env` replaces `src/shared/lib/env.ts` entirely, as in Ragen (section 4.2).
3. Key providers: `local` first, `aws-kms` and `scaleway-kms` as a follow-up (section 4.4).
4. Tests: one root Vitest with `app` and `packages` projects, as in Ragen; project packages have no runner of their own (section 3.2).
