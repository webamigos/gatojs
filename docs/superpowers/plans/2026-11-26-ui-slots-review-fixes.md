# UI slots: review fixes before merge (extensibility Task 15)

Branch `feat/ui-slots`, draft PR #119. An independent review found no data exposure and nothing blocking, but asks for four fixes before merge. Record the behaviour in [ADR-68](../../adrs/68-ui-slots-split-server-and-client-contributions.md).

## 1. One failing contribution does not take down the host

`Slot` (`src/shared/components/slot.tsx`) awaits every loader with `Promise.all` and renders the components bare, so one rejected loader fails the slot and one throwing component fails the `(app)` layout (`app.header.actions`) or the dashboard and account pages.

New client component `src/shared/components/slot-error-boundary.tsx`:

```tsx
"use client";
export interface SlotErrorBoundaryProps {
  contributionId: string;
  children?: ReactNode;
}
export class SlotErrorBoundary extends Component<SlotErrorBoundaryProps, { failed: boolean }>;
```

- renders `children` until a child throws, then renders nothing (`null`);
- logs the error once per failure: `console.error("Slot contribution failed to render:", contributionId, error)` (a client component has no server logger).

`Slot`:

- loads contributions with `Promise.allSettled`; a rejected loader is skipped and logged on the server: `logger.error("Slot contribution failed to load", { slot: id, contribution: <contribution id>, error })` (`@/shared/lib/logger`); the others render in registry order;
- when every visible loader rejects, the slot renders `fallback`;
- renders each contribution as `<SlotErrorBoundary key={contributionId} contributionId={contributionId}><Suspense fallback={null}><Component {...context} /></Suspense></SlotErrorBoundary>`. The `Suspense` matters for server rendering: a server component that throws during the RSC render is re-thrown when React renders that spot; on the server React falls back to the nearest `Suspense` and retries on the client, where the boundary catches it. Without the `Suspense` the error escapes to the page shell;
- `slot.tsx` starts with `import "server-only";`.

`ClientSlot` (`src/shared/components/client-slot.tsx`) wraps each lazy contribution in the same boundary (`key` and `contributionId` = contribution id), inside its `Suspense`: a rejected lazy loader or a throwing component hides that contribution only.

### Behaviours

- `Slot` for a slot with three contributions `a` (renders `<p>a</p>`), `boom` (component throws `new Error("boom")` when rendered), `c` (renders `<p>c</p>`), rendered next to host markup `<p>host</p>` → the document shows `host`, `a`, `c`; `boom` shows nothing; no error escapes `render`.
- the same with `boom`'s loader rejecting (`() => Promise.reject(new Error("load failed"))`) → `Slot` resolves (does not reject); `a` and `c` render in that order; `logger.error` is called once with `"Slot contribution failed to load"` and attributes containing `slot: "dashboard.sections"`, `contribution: "dashboard.boom"`.
- every visible loader rejects, `fallback: <p>nothing here</p>` → renders `nothing here`.
- `SlotErrorBoundary` with a throwing child → renders nothing (container empty); `console.error` called with `"Slot contribution failed to render:"`, `"dashboard.boom"` and the thrown error; a sibling `SlotErrorBoundary` with a healthy child still renders it.
- `SlotErrorBoundary` with a healthy child → renders the child unchanged.
- `ClientSlot` with a contribution whose lazy loader rejects next to a healthy one → the healthy one renders, the failed one renders nothing.
- `ClientSlot` with a contribution whose component throws next to a healthy one → the healthy one renders.

### Mutations to kill

- `Promise.allSettled` back to `Promise.all` (one rejected loader rejects the slot).
- rejected results kept (rendering `undefined` as a component) or fulfilled results dropped.
- the boundary removed from `Slot` or `ClientSlot`, or one boundary around all contributions (a failure hides the healthy ones).
- `getDerivedStateFromError` not setting the failed state (the error escapes); the boundary rendering `children` after a failure.
- the "all failed → fallback" branch removed or inverted.
- the log call removed (loader failure is silent).

## 2. The client-bundle check misses three paths

`scripts/lib/architecture/client-imports.ts`, tested by `src/__tests__/architecture/client-bundles-stay-server-free.test.ts`. Each new rule gets a negative fixture that passes today.

a) **Relative specifiers.** In `checkClientBundles`, a relative specifier (`./…`, `../…`) in a checked file (a `"use client"` file or a client entry: `src/gato.config.ts`, `src/shared/lib/modules/gato-config.ts`, `src/features/<x>/client-slots.ts`) is resolved against the importing file's directory; a resolved `src/<rest>` is checked as the alias `@/<rest>` with a trailing `.ts` or `.tsx` dropped. A violation is reported with the specifier **as written**: `src/features/x/client-slots.ts: ./slots`, `src/features/notes/client-slots.ts: ../invoices/slots`. `findServerImportsInClient(source)` has no path and keeps ignoring relative specifiers.

b) **Feature services.** `@/features/<x>/services` and anything below it is a server module for a client file, except `@/features/<x>/services/commands` and below (`"use server"` actions, which client components import by design).

c) **Lazy targets of `client-slots.ts`.** Every dynamic `import("<spec>")` in `src/features/<x>/client-slots.ts` with a relative or `@/` specifier is resolved to a file (`<path>.tsx`, `<path>.ts`, `<path>/index.tsx`, `<path>/index.ts`, or `<path>` itself when it names an existing file). A target whose first statement is not `"use client"` is reported as `src/features/x/client-slots.ts: ./components/card (missing "use client")`. A target that does not resolve and a package specifier are not reported (the build fails on a missing file). Requiring the directive means the target is itself checked as a client file, so its own server imports are reported too.

d) **Slot host and server registry.** `@/shared/components/slot` and `@/modules.generated` (and their subpaths, segment boundary as for the other server modules) are server modules for a client file.

Order: files sorted by path (as today); within a file, import violations in order of appearance, then missing-directive targets in order of appearance.

### Behaviours

- `src/features/x/client-slots.ts` with `import { slots } from "./slots";` → `["src/features/x/client-slots.ts: ./slots"]`.
- `src/features/notes/client-slots.ts` with `export const clientSlots = [{ component: () => import("../invoices/slots") }];` → `["src/features/notes/client-slots.ts: ../invoices/slots"]`.
- `./slots.ts` from `src/features/x/client-slots.ts` → reported as `./slots.ts`.
- a `"use client"` file `src/features/x/components/w.tsx` with `import { q } from "../services/queries/q";` → `["src/features/x/components/w.tsx: ../services/queries/q"]`.
- the same file with `import { c } from "../services/commands/c";` → `[]`.
- `./slots-list`, `./components/slots`, `../x/client-slots` relative from `src/features/x/client-slots.ts` → `[]`.
- a relative `./slots` in `src/features/x/components/card.tsx` **without** `"use client"` → `[]` (not a checked file).
- `findServerImportsInClient` on a client source importing `@/features/invoices/services/queries/list` and `@/features/invoices/services/invoice-service` → both reported, in order; `@/features/invoices/services/commands/create` and `@/features/invoices/services-list` → not reported.
- `src/features/x/client-slots.ts` with `component: () => import("./components/card")` and `src/features/x/components/card.tsx` without `"use client"` → `["src/features/x/client-slots.ts: ./components/card (missing \"use client\")"]`; with `"use client"` as its first statement → `[]`.
- the same through `@/features/x/components/card` → reported with that specifier and the suffix.
- a target `./components/card/index.tsx` resolved from `./components/card` without the directive → reported.
- a missing target `./components/nope` → `[]`; a package `import("some-lib")` → `[]`.
- the lazy target in a `"use client"` card imports `@/shared/lib/prisma` → `["src/features/x/components/card.tsx: @/shared/lib/prisma"]` (already true for client files; keep one test showing the chain).
- a static `import "./components/card"` in client-slots.ts without the directive in the target → `[]` (only dynamic imports are component loaders).
- a `"use client"` source importing `@/shared/components/slot` and `@/modules.generated` → both reported; `@/shared/components/slot-error-boundary`, `@/shared/components/client-slot`, `@/modules.client.generated` → not reported.
- the real repo stays clean (`checkClientBundles(repoRoot)` → `[]`).

### Mutations to kill

- relative specifiers not resolved (`./slots` passes), resolved against the repo root instead of the file, or the `.ts` extension not dropped.
- the commands exception removed (client components importing commands become violations: the real-repo test catches it) or widened to all of `services`.
- the missing-directive check inverted, skipped for `@/` specifiers, or applied to static imports.
- index resolution removed.
- `@/shared/components/slot` or `@/modules.generated` removed from the server list; segment boundary removed (`slot-error-boundary` reported).

## 3. CI proves a server contribution builds

- `packages/gato-cli/src/__tests__/fixtures/project-module/src/features/notes/components/notes-summary-card.tsx` becomes an async server component that awaits `getOrgContext()` and `getTranslations("notes")` (`next-intl/server`).
- `.github/workflows/kit.yml`, step "Project module is registered without editing core tests": add `npm run build` after `npm test`.
- Correct `docs/lessons/a-lazy-import-in-the-client-registry-still-ships-to-the-browser.md` to what is checked: CI builds the created project with the async `notes` card; the client-bundle check now follows relative specifiers and requires `"use client"` on lazy targets of `client-slots.ts`.

No unit tests: the CI step is the proof. Locally: create a project, copy the fixture, register `notes`, `wa generate`, `typecheck`, `test`, `build`.

## 4. Small

a) **Reserved `app`.** `readKitState` (`packages/gato-cli/src/manifest/kit-state.ts`, `validateProjectModules`) throws for a project module keyed `app`: message `projectModules.app: "app" is reserved for core-hosted slot config (modules.app)`. In the app, `gatoConfigProblems(modules, config)` (`src/shared/lib/modules/gato-config.ts`) reports a module whose key is `app`: `modules.app: the key app is reserved for core-hosted slots and cannot be a module key`.

b) **Finite priority.** `slotConfigProblems` (`src/shared/lib/modules/slots.ts`) reports a non-null override of a known contribution whose `priority` is not a finite number: `modules.<key>.slots.<slotId>.<contributionId>.priority: must be a finite number: <String(value)>`. `null` (remove) stays valid; an unknown contribution is reported only as unknown.

c) **`ClientSlot` takes only client slot ids (type error).** In `src/shared/lib/modules/slots.ts`:

```ts
export interface SlotContextMap { "app.header.actions": { organizationId: string } }   // server slots
export interface ClientSlotContextMap {}                                               // client slots, augmented by host modules
export type ServerSlotId = keyof SlotContextMap & string;
export type ClientSlotId = keyof ClientSlotContextMap & string;
export type SlotId = ServerSlotId | ClientSlotId;
export type SlotContext<Id extends SlotId>;                                            // context from the map the id belongs to
export function defineSlot<Id extends ServerSlotId>(id: Id, options: { kind: "server" }): SlotDefinition;
export function defineSlot<Id extends ClientSlotId>(id: Id, options: { kind: "client" }): SlotDefinition;
export function defineContribution<Id extends SlotId>(slot: Id, input: ContributionInput<Id>): SlotContribution;
```

`Slot<Id extends ServerSlotId>`, `ClientSlot<Id extends ClientSlotId>`. A host declares a client slot's context by augmenting `ClientSlotContextMap`. Runtime is unchanged.

### Behaviours

- `readKitState` on a `.wa/kit.json` with `projectModules.app` (manifest name `app`, files `src/features/app/**`) → rejects with `projectModules.app: "app" is reserved for core-hosted slot config (modules.app)`; `projectModules.apps` → accepted.
- `gatoConfigProblems([{ key: "app", nav: [], routePrefixes: [] }], {})` → `["modules.app: the key app is reserved for core-hosted slots and cannot be a module key"]`; `applyGatoConfig` with that module throws `GatoConfigError`; key `apps` → `[]`.
- `slotConfigProblems` with `modules.dashboard.slots["dashboard.sections"]["notes.card"]` set to `{ priority: Number.NaN }` → `["modules.dashboard.slots.dashboard.sections.notes.card.priority: must be a finite number: NaN"]`; `Infinity` → `…: Infinity`; `-Infinity` → `…: -Infinity`; `"5"` (cast) → `…: 5`; `{}` (cast) → `…: undefined`; `{ priority: 0 }`, `{ priority: -3.5 }`, `null` → `[]`.
- the same bad priority on an unknown contribution → only the unknown-contribution problem.
- `slotRegistry` with `{ priority: Number.NaN }` → throws `GatoConfigError`.
- types (checked by `npm run typecheck` through `@ts-expect-error`): `<ClientSlot id="dashboard.sections" …>` and `<ClientSlot id="app.header.actions" …>` are errors; `defineSlot("dashboard.sections", { kind: "client" })` is an error; `defineSlot("dashboard.sections", { kind: "server" })` and `<Slot id="dashboard.sections" …>` are not.

### Mutations to kill

- the reserved-key check removed, or compared with `startsWith` (`apps` rejected).
- `Number.isFinite` replaced by `typeof === "number"` (NaN, Infinity pass) or the check skipped for known contributions.
- `null` treated as an invalid priority.
