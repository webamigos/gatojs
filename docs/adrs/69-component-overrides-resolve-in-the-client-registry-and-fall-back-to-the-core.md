# ADR-69: Component overrides are declared in `components.ts`, resolved once in the client registry, and fall back to the core component

**Status:** Accepted
**Date:** 2026-11-26
**Decided by:** an agent with the coordinator (extensibility plan Task 17, decision 11A)

## Context

Slots (ADR-68) add UI next to a Gato component; some projects need to change the component itself, for example the invite dialog of the `users` page, without editing the Gato file (ADR-59). Spec §5.4 lets `gato.config.ts` or a module replace or wrap a component that has a handle. An override replaces core UI, so a careless design would let it widen what the page shows, take the page down when it throws, apply although its module is disabled, or let two modules fight silently over one handle.

## Decision

- The library is `src/shared/lib/modules/component-overrides.ts` (client-safe, no registry import). A host module declares its handles in `src/features/<x>/components.ts`: `export const componentHandles = [defineComponentHandle("<x>.<name>")]`, and the props type in the same file by extending `ComponentHandleMap` (`declare module "@/shared/lib/modules/component-overrides" { interface ComponentHandleMap { "<x>.<name>": <props> } }`), like slot context types.
- A module overrides a handle in its own `components.ts`: `export const componentOverrides = [defineComponentOverride("<handle>", { replace: () => import(…) })]` or `{ wrap: () => import(…) }`. A replacement gets the handle's props; a wrapper gets the same props plus `Base`, the core component. Nothing else is passed, so an override sees exactly the data the core component sees. Two modes only: changing props is a wrapper.
- `components.ts` goes into the client registry only: `clientComponentOverrides = componentOverrideRegistry([{ module, value }…], gatoConfig)` in `src/modules.client.generated.ts` (`gato-cli` 0.11.0, `kitFormat` 8). The list is not filtered by `enabledEntries`, because a disabled host's handles stay declared; the registry drops disabled modules' overrides itself. When it loads it throws, in this order: `ComponentOverrideError` for a handle without its module's prefix, a handle declared twice, or an override of an unknown handle (disabled modules included); `GatoConfigError` for a bad `modules.<owner>.components.<handle>` entry (unknown handle, handle under a module that does not declare it, not exactly one of `replace`, `wrap`, `module`, or `null`, a loader that is not a function, `module` naming a module without an enabled override); `ComponentOverrideError` for a handle overridden by two or more enabled modules without a config entry (`users.invite-dialog is overridden by both crm and invoices; choose one under modules.users.components in src/gato.config.ts`).
- Resolution, per handle: a config entry wins and counts as the single override (`null` → the core component, `{ replace }`/`{ wrap }` → the project's own override, `{ module: "<m>" }` → that module's override); otherwise the one enabled module's override; otherwise none. Disabling a module resolves a conflict.
- `overridable(handle, Base)` (`src/shared/lib/modules/overridable.tsx`, client) looks the handle up at render. No override → `<Base {...props} />`, synchronously, as before the handle existed. An override → `React.lazy` (one per override, cached) inside `Suspense` (fallback `null`) inside `OverrideErrorBoundary` (`src/shared/components/override-error-boundary.tsx`), whose fallback is the core component with the same props. A rejected loader, a throwing replacement or a throwing wrapper renders the core component and logs `Component override failed to render:` with the handle and the source (module key or `src/gato.config.ts`). If the core component itself throws inside the fallback, the error goes up as it would without an override.
- First handle (decision 11A): `users.invite-dialog`, `InviteUserDialog = overridable("users.invite-dialog", InviteUserDialogBase)`. Further handles come on request.

## Rejected alternatives

- Overrides in the server registry as well, as `client-slots.ts` is: the client registry already loads on the server (`src/shared/lib/auth/permissions.ts`, which `requireModuleAccess` uses, imports it) and in the SSR of every app page (`app-sidebar.tsx`), so a bad override already fails closed before a page renders; a second import would only repeat the same check.
- A handle declared next to the component (`overridable` registering it): the registry would have to import every overridable component to know the handles, and `overridable` reads the registry, so it would be an import cycle; the declaration lives in `components.ts` like `slotDefinitions` in `slots.ts`.
- Last override wins, or registry order wins: a silent winner is the behaviour the spec rules out; a conflict is an error with the config key that resolves it.
- A `Suspense` fallback of the core component while the override loads: the core UI would flash and then change; the slot components use `null` too.

## Consequences

- An override is client code: `components.ts` and every file it lazily imports ship to the browser, each lazily imported file starts with `"use client"`, and data comes through server actions or queries that check access themselves. A disabled module's override never renders.
- A failing override degrades to the core UI instead of failing the page; the failure shows only in the browser console.
- Core tests that check a component with a handle pin it with `vi.mock("@/shared/lib/modules/overridable", () => ({ overridable: (_handle, Base) => Base }))`, so they pass in a project that overrides the handle; the created-project fixture `notes` wraps `users.invite-dialog` to prove it in CI.
- A module cannot declare a handle outside its own key prefix, and the config for a handle sits under its host module (`modules.users.components`), never under the overriding module.

## Enforcement

- `componentOverrideRegistry` runs when `src/modules.client.generated.ts` loads; `src/shared/lib/modules/__tests__/registry-components.test.ts` builds the real registry, and `component-overrides.test.ts` pins every message.
- `src/__tests__/architecture/client-bundles-stay-server-free.test.ts`: `src/features/<x>/components.ts` is a client entry, its lazy targets and those of `src/gato.config.ts` need `"use client"`. `src/__tests__/architecture/gato-config-keys-exist.test.ts` lists bad `components` config keys.
- `src/shared/lib/modules/__tests__/overridable.test.tsx` and `src/shared/components/__tests__/override-error-boundary.test.tsx`: replace, wrap with `Base`, and the fallback to the core component for a throwing or rejected override.
- CI (`.github/workflows/kit.yml`, step "Project module is registered without editing core tests") builds and tests a created project whose `notes` fixture wraps `users.invite-dialog`.

## Sources

- Spec `docs/superpowers/specs/2026-11-22-extensibility-design.md` §5.2, §5.4; plan `docs/superpowers/plans/2026-11-23-extensibility.md`, Task 17 and its contract; ADR-68.
