# Extensibility Task 16: users table slots (task plan)

Parent plan: [2026-11-23-extensibility.md](2026-11-23-extensibility.md), "Task 16", on top of Task 15
([ADR-68](../../adrs/68-ui-slots-split-server-and-client-contributions.md)). This file is the `gato-task` step 1 plan:
signatures, behaviours with literal expectations, mutations to kill.

Scope: the global-admin `UsersManager` table on `/users`. `OrganizationMembers` gets no slot (parent plan, open
question 2). No generator change, no `gato-cli` or `kitFormat` bump: `src/features/users/slots.ts` is picked up by the
existing `hasSlots` detection. `core` minor bump. Task 17 runs in parallel and touches the slot registry, so this task
leaves `src/shared/lib/modules/slots.ts` and `slot-access.ts` unchanged.

## Security contract

- The table already holds only rows the viewer may see (`getUserAccountsQuery`, global admin only). A contribution
  gets one row at a time and nothing else: a row action gets `{ userId, organizationId }`, a column cell gets
  `{ row, organizationId }`. No contribution gets the user list, callbacks of the host (`onImpersonate`) or the
  viewer's session. The host runs no query for a contribution.
- `roles` and module access (`visibleContributions`) hide UI; they are not protection. A row action that changes data
  calls a server action in `services/commands/` that runs its own guard (`getOrgContext()`/`requireModuleAccess()` and
  `assertServiceModeConfirmed`). Enforced by existing architecture tests: `client-bundles-stay-server-free.test.ts`
  (a client file may import `services/commands/**` only, never queries or Prisma) and
  `server-entrypoints-guard.test.ts` (every `"use server"` export calls a session guard before Prisma).
- A disabled or inaccessible module contributes nothing (columns and row actions).
- A contribution that throws while loading or rendering hides only itself: the table, its other columns and rows
  stay.

## Files and signatures

- `src/shared/lib/modules/column-slots.ts` (new, client-safe; runtime imports only `./slots` types):
  - `export interface ColumnContribution extends SlotContribution { header: string }` (`header` is a label key in the
    contributing module's i18n namespace; `component` is the cell loader).
  - `export interface ColumnContributionInput<Id extends ClientSlotId> { id: string; priority: number;
    roles?: readonly OrgRole[]; header: string; cell: () => Promise<{ default: ComponentType<SlotContext<Id>> }> }`.
  - `export function defineColumnContribution<Id extends ClientSlotId>(slot: Id, input: ColumnContributionInput<Id>):
    ColumnContribution` → `{ slot, id, priority, roles, header, component: cell }`.
  - `export function isColumnContribution<T extends SlotContribution>(contribution: T):
    contribution is T & { header: string }` → `true` only when `header` is a non-empty string.
- `src/shared/components/client-slot.tsx`: new export
  `ClientSlotContribution({ contribution, props }: { contribution: RegisteredContribution; props: SlotComponentProps })`
  renders the contribution's lazy component (the same cached `lazy()` per contribution that `ClientSlot` uses) inside
  `SlotErrorBoundary` (`contributionId` = `contribution.id`) and `<Suspense fallback={null}>`. `ClientSlot` itself
  behaves as today.
- `src/features/users/slots.ts` (new, server registry):
  - `declare module "@/shared/lib/modules/slots" { interface ClientSlotContextMap {
    "users.table.row-actions": UserTableRowActionProps; "users.table.columns": UserTableCellProps } }`.
  - `export const slotDefinitions = [defineSlot("users.table.row-actions", { kind: "client" }),
    defineSlot("users.table.columns", { kind: "client" })]`.
- `src/features/users/contracts/user-account.types.ts`: `export interface UserTableRowActionProps { userId: string;
  organizationId: string }`, `export interface UserTableCellProps { row: UserAccountListItem; organizationId: string }`.
- `src/features/users/components/user-table-slot-columns.tsx` (new, `"use client"`):
  `export function buildContributedUserColumns(contributions: readonly RegisteredContribution[],
  translate: (key: string) => string, organizationId: string): ColumnDef<UserAccountListItem>[]`. Keeps input order
  and only `isColumnContribution` entries (a non-column contribution to `users.table.columns` is skipped and logged
  with `console.error("Slot contribution is not a column:", id)`). Each column: `id` = contribution id,
  `header` and `meta.label` = `translate("<module>.<header>")`, `enableSorting: false`, `cell` renders
  `ClientSlotContribution` with props `{ row: row.original, organizationId }`.
- `src/features/users/components/user-account-columns.tsx`:
  - `UserAccountViewer` gains `organizationId: string`, `orgRole: OrgRole | null`, `multiOrg: boolean`.
  - `buildUserAccountColumns(t, dateLocale, viewer, pendingId, onImpersonate, contributedColumns:
    readonly ColumnDef<UserAccountListItem>[])` returns the four built-in columns, then `contributedColumns` in order,
    then `actions`.
  - The `actions` cell keeps `<div className="flex justify-end">` with the impersonate button first, then
    `<ClientSlot id="users.table.row-actions" context={{ userId: row.original.id, organizationId: viewer.organizationId }}
    viewer={{ userRole: viewer.role, orgRole: viewer.orgRole, multiOrg: viewer.multiOrg }} />`.
- `src/features/users/components/users-manager.tsx`: props gain `organizationId: string`,
  `currentOrgRole: OrgRole | null`, `multiOrg: boolean`. Reads `clientModuleSlots` from `@/modules.client.generated`,
  takes `visibleContributions(clientModuleSlots, "users.table.columns", access)` (access =
  `{ userRole: currentUserRole, orgRole: currentOrgRole, multiOrg }`), builds the contributed columns with
  `useTranslations()` (root) and passes them to `buildUserAccountColumns`.
- `src/app/[locale]/(app)/users/page.tsx`: passes `organizationId`, `currentOrgRole={orgRole}` and
  `multiOrg={env.MULTI_ORG}` from `requireModuleAccess("users")` to `UsersManager`.
- `npm run wa -- generate` (registry imports `@/features/users/slots`); `kit/modules/core.json` minor bump,
  `npm run wa -- kit sync`.
- Docs: `docs/09-nowy-modul.md` (section "Wkład do slotu UI": the two users slots, `defineColumnContribution`, the
  security contract above), ADR-68 gets an "Amendment (Task 16)" paragraph on the column contribution shape.

## Behaviours

`buildContributedUserColumns` / `defineColumnContribution` / `isColumnContribution`:
- `defineColumnContribution("users.table.columns", { id: "crm.score", priority: 10, header: "col-score", cell })` →
  `{ slot: "users.table.columns", id: "crm.score", priority: 10, roles: undefined, header: "col-score",
  component: cell }`.
- `isColumnContribution({ …, header: "col-score" })` → `true`; without `header` → `false`; `header: ""` → `false`.
- Two column contributions `crm.a`, `crm.b` (module `crm`, headers `col-a`, `col-b`) and a translate that maps
  `crm.col-a` → `"Ocena"`, `crm.col-b` → `"Etap"` → two columns with ids `crm.a`, `crm.b`, headers `"Ocena"`, `"Etap"`.
- A plain contribution (no `header`) to `users.table.columns` → no column; `console.error` called with
  `"Slot contribution is not a column:"` and its id.

`UsersManager` (real `ClientSlot`, mocked `@/modules.client.generated`; users `u-1` `ula@firma.pl`, `u-2`
`adam@firma.pl`; `organizationId` `org-1`):
- No contributions → table headers exactly as today (`Nazwa`, `E-mail`, `Rola`, `Utworzono` and the actions column),
  no extra cells; every existing `users-manager.test.tsx` and `user-account-columns.test.tsx` assertion still passes.
- One row-action contribution (module `users`-accessible, e.g. module `crm` registered in `clientModules`) rendering
  `action userId=<userId> organizationId=<organizationId>` → `action userId=u-1 organizationId=org-1` inside the row of
  `ula@firma.pl` and `action userId=u-2 organizationId=org-1` inside the row of `adam@firma.pl`, exactly once per row.
- The row-action component receives exactly the props `{ userId, organizationId }` (no other keys).
- One column contribution `crm.score` with header key `col-score` translated as `"Ocena"` → a header `Ocena` placed
  after `Utworzono` and before the actions column; the cell in the row of `ula@firma.pl` shows
  `score u-1 ula@firma.pl org-1`, in the row of `adam@firma.pl` `score u-2 adam@firma.pl org-1`.
- The cell component receives exactly the props `{ row, organizationId }`, `row` equal to that row's item.
- A contribution (column and row action) of a module missing from `clientModules` (disabled) → no header, no cell, no
  action.
- A contribution whose `roles` exclude the viewer is still shown to a global admin (UsersManager is the global-admin
  view; `roleAllows` passes global admins) — and hidden when `visibleContributions` gets a non-admin viewer (covered
  by Task 15 tests; not repeated).
- A column cell component that throws → the other cells and the other contributed column still render, the header
  stays, the built-in cells (`ula@firma.pl`) stay; `console.error` called with `"Slot contribution failed to render:"`.
- A column contribution whose loader rejects → the same: only its cells are empty.
- A row action that throws → the impersonate button and the other row action in that row still render.

`buildUserAccountColumns`:
- With `contributedColumns` `[{ id: "crm.score" }, { id: "crm.stage" }]` → column ids in order `name`, `email`,
  `role`, `createdAt`, `crm.score`, `crm.stage`, `actions`.
- With `[]` → `name`, `email`, `role`, `createdAt`, `actions`.

`/users` page:
- Global admin with context `{ userId: "u1", organizationId: "org-1", orgRole: "member", userRole: "admin" }` and
  `MULTI_ORG` `true` → `UsersManager` gets `organizationId: "org-1"`, `currentOrgRole: "member"`, `multiOrg: true`.

Registry:
- The real server registry constructs without error with `src/features/users/slots.ts`
  (`registry-slots.test.ts` keeps passing); `slotDefinitions` of `users/slots.ts` are exactly the two client slots.

## Mutations to kill

- Contributed column placed after `actions` (or before the built-ins).
- Row context from the wrong row (`userId` of the first row everywhere, or of the viewer).
- `organizationId` dropped or replaced in either context.
- Extra props leaked to a contribution (the users list, `onImpersonate`).
- Disabled module's column still added (module filter skipped in `UsersManager`).
- `isColumnContribution` accepting an empty or missing `header`.
- Header translated without the module namespace.
- Error boundary or `Suspense` removed around a cell (a throwing cell takes down the table).
- `ClientSlot` for row actions removed or given a wrong slot id.
