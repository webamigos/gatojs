# ADR-66: UI slots keep server contributions out of the client registry, and core-hosted slots are configured under `modules.app`

**Status:** Accepted (the `modules.app` config shape waits for Patryk's confirmation before release)
**Date:** 2026-11-26
**Decided by:** an agent with the coordinator (extensibility plan Task 15, decision 11A)

## Context

A project module has to put its own UI into Gato pages (a dashboard card, a header button, an account section) without editing them (ADR-59). The spec (§5.3) and the plan put every module's `slots.ts` into both generated registries. The client registry reaches the browser: `src/shared/components/app-sidebar.tsx` is a client component and imports it. A lazy `() => import("./card")` inside a module that the browser bundle contains still makes the bundler build `card` for the browser, so a contribution that is an async server component calling a query (`getOrgContext()`, `next/headers`, Prisma) would break `next build`.

The first slot list also has `app.header.actions`, hosted by the `(app)` layout. The layout belongs to the core, not to a feature module, so the rule "a key starts with the key of the module that owns it" and the config shape `modules.<host>.slots.<slotId>.<contributionId>` have no module for it.

## Decision

- The slot library is `src/shared/lib/modules/slots.ts` (client-safe, no registry import). A host module declares its slots in `src/features/<x>/slots.ts`: `export const slotDefinitions = [defineSlot("<x>.<name>", { kind: "server" | "client" })]`, and the slot's context type in the same file by extending `SlotContextMap` (`declare module "@/shared/lib/modules/slots" { interface SlotContextMap { "<x>.<name>": { … } } }`). `defineContribution("<slotId>", { id, priority, roles?, component: () => import(…) })` and `<Slot id … context … />` are type-checked against that map.
- Contributions live in two files by the kind of slot they fill: `slots.ts` (`export const slots = [...]`) fills **server** slots and goes into the server registry only, so its components may be async server components; `client-slots.ts` (`export const clientSlots = [...]`) fills **client** slots and goes into the client registry (`clientModuleSlots`) and into the server registry. The server registry (`moduleSlots = slotRegistry({ slots, clientSlots }, gatoConfig)`) validates everything when it loads and throws one `SlotError`: key prefixes, duplicate slot or contribution ids (naming the modules), a contribution to an unknown slot, and a contribution in the wrong file for its slot's kind.
- Core-hosted slots are declared in the library (`coreSlotDefinitions`, today only `app.header.actions`, server, context `{ organizationId }`), exempt from the prefix rule. Their config lives under the reserved key `modules.app` (constant `CORE_SLOTS_CONFIG_KEY` in `src/shared/lib/modules/gato-config.ts`), which accepts only `slots`. Every other slot is configured under its host module: `modules.<host>.slots.<slotId>.<contributionId>: null` removes a contribution, `{ priority }` replaces its priority. Unknown slot or contribution ids throw `GatoConfigError`, and `gato-config-keys-exist.test.ts` lists them.
- Rendering: `Slot` (`src/shared/components/slot.tsx`, server) and `ClientSlot` (`src/shared/components/client-slot.tsx`, client) take `id`, `context`, `viewer` (`AccessContext`) and `fallback`. They render the slot's contributions sorted by priority, then id in code point order, and keep only those whose module is enabled and accessible to the viewer (`canAccessModule`) and whose `roles` include the viewer's organization role (global admins pass). `roles` hides UI; it is not a security boundary: a contribution that reads data calls a query that runs `getOrgContext()` itself. With nothing to render, the slot renders `fallback`.
- First slots: `dashboard.sections` (`{ organizationId }`, the dashboard placeholder is the fallback), `app.header.actions` (`{ organizationId }`, next to the organization switcher), `account.sections` (`{ userId }`, after the password form). The generator (`gato-cli` 0.10.0) detects `slots.ts` and `client-slots.ts`; the generated files change shape, so `kitFormat` is 7.

## Rejected alternatives

- One `slots.ts` in both registries, as the spec sketched: breaks `next build` as soon as a server contribution imports server code (see Context).
- A typed definition handle that contributors import from the host module (`defineContribution(dashboardSections, …)`): a `client-slots.ts` importing a host's `slots.ts` would pull the host's server contributions into the browser bundle.
- A top-level `slots` section in `src/gato.config.ts` for every slot: simpler, but every other per-module setting (nav, access, permissions, and the planned component handles) sits under `modules.<key>`.

## Consequences

- A module author picks the file by the slot's kind: a server slot takes contributions in `slots.ts`, a client slot in `client-slots.ts`; the registry error says which file to move a misplaced contribution to.
- `client-slots.ts` ships to the browser and is checked as a client entry by `client-bundles-stay-server-free.test.ts`; `@/features/<x>/slots` is a server module for client files.
- A disabled module's contributions disappear, while its slot definitions stay, so a contributor to a disabled host's slot still loads.
- A project module named `app` would collide with the reserved key.

## Enforcement

- `slotRegistry` runs when `src/modules.generated.ts` loads, so `next build`, `npm run dev` and every test importing the registry fail on a bad key; `src/shared/lib/modules/__tests__/registry-slots.test.ts` builds the real registries.
- `src/__tests__/architecture/client-bundles-stay-server-free.test.ts` (client entries) and `src/__tests__/architecture/gato-config-keys-exist.test.ts` (config keys).
- TypeScript: an unknown slot id or a component whose props do not match the slot's context fails `npm run typecheck`.

## Sources

- Spec `docs/superpowers/specs/2026-11-22-extensibility-design.md` §5.2, §5.3, §6; plan `docs/superpowers/plans/2026-11-23-extensibility.md`, Task 15 and its contract.
