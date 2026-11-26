# Auth events: single-valued roles and `/organization/leave` (review fixes for Task 10)

Follow-up to extensibility plan Task 10 (draft PR #121) after an independent security review.

## Problem

1. **Audit bypass (blocking).** better-auth `/organization/invite-member` and `/organization/update-member-role` accept
   `role: string | string[]` and store a list comma-joined (`["member","member"]` → `"member,member"`, `"admin,member"`).
   The core event schemas allow only `owner | admin | member`, so `emitEvent` throws, `emitLogged` swallows the error and no
   audit row is written: not for the invite, not for the role change, and later not for `member-removed` of that member.
2. `/organization/leave` deletes a membership and emits nothing, so no `member.removed` audit row.
3. `/organization/delete` emits nothing either; ADR-61 does not say so.
4. `docs/13b-modul-audit-logs-uzycie.md` says core never calls `trackAudit` for `invitation.accepted`, but
   `joinOrganizationCommand` still does on a sign-up with an invitation.

## Design

- New core better-auth plugin `orgRoleGuardPlugin` (id `gato-org-role-guard`) in
  `src/shared/lib/auth/org-role-guard-plugin.ts`, registered in `src/shared/lib/auth/index.ts` right after
  `organization(...)` and before `eventsPlugin`. One `before` hook matching exactly `/organization/invite-member` and
  `/organization/update-member-role`. When `ctx.body.role` is not exactly one of the strings `owner`, `admin`, `member`
  it throws `new APIError("BAD_REQUEST", { message: "Invalid organization role" })`, before better-auth writes anything.
- New pure guard `isOrgRole(value: unknown): value is OrgRole` in `src/shared/lib/auth/roles.ts`: `true` only for the
  strings `"owner"`, `"admin"`, `"member"`.
- `/organization/leave` is added to `ORGANIZATION_EVENT_PATHS`; `organizationEvents` maps it to
  `organizations.member-removed` built from the returned member row itself (better-auth returns the row, not
  `{ member }`): organization = the row's `organizationId`, actor = the session user (the one leaving),
  payload `{ memberId, userId, role }`. The audit subscriber then writes `member.removed` as for remove-member.
- `/organization/delete` stays without events: the organization and its rows (audit log included, `onDelete: Cascade`)
  are gone, so there is no organization to write into. Documented in ADR-61 and `docs/05-moduly-rdzenia.md`.

## Behaviours

Unit (`roles.test.ts`):

- `isOrgRole("owner")`, `("admin")`, `("member")` → `true`.
- `isOrgRole` of `"Admin"`, `"admin "`, `"admin,member"`, `"member,member"`, `""`, `["admin"]`, `["admin","member"]`,
  `undefined`, `null`, `1`, `"superadmin"`, `"user"` → `false`.
- property: any string other than the three → `false`.

Unit (`org-role-guard-plugin.test.ts`):

- plugin id is `gato-org-role-guard`; exactly one `before` hook matches `/organization/invite-member` and exactly one
  matches `/organization/update-member-role`; none matches `/organization/create`, `/organization/remove-member`,
  `/organization/leave`, `/organization/accept-invitation`, `/organization/add-member`, `/sign-up/email`, `undefined`;
  the plugin has no `after` hooks.
- body `{ role: "admin" }` (also `owner`, `member`) → handler resolves without throwing.
- body role `["admin","member"]`, `["member"]`, `"member,member"`, `"admin,member"`, `"superadmin"`, missing role,
  body `null` → throws `APIError` with `status: "BAD_REQUEST"`, `statusCode: 400`, message `"Invalid organization role"`.

Unit (`organization-events.test.ts`, `events-plugin.test.ts`):

- `organizationEvents({ path: "/organization/leave", actorUserId: "user-leaving", returned: { id: "mem-1",
  organizationId: "org-b", userId: "user-leaving", role: "member" } })` →
  `[{ origin: { organizationId: "org-b", actorUserId: "user-leaving" }, name: "organizations.member-removed",
  payload: { memberId: "mem-1", userId: "user-leaving", role: "member" } }]`.
- `/organization/leave` with `returned` `null`, `{ member: {...} }` or a row missing `organizationId` → `[]`.
- `eventsPlugin` has exactly one `after` hook for `/organization/leave`; still none for `/organization/delete`.
- `eventsPlugin` after hook on `/organization/leave` emits `organizations.member-removed` in the row's organization
  (not the session's active organization) with the session user as actor.

Integration, real better-auth (`events-plugin.integration.test.ts`; `organization-audit.integration.test.ts` for rows):

- `createInvitation` with role `["admin","member"]`, `"member,member"`, `"admin,member"` → rejects with
  `statusCode: 400`; `invitation` count 0; no event; no `AuditLog` row.
- `updateMemberRole` of a `member` with role `["admin","member"]`, `"member,member"`, `"admin,member"` → rejects with
  `statusCode: 400`; the stored role is still `"member"`; no event; no `AuditLog` row.
- the same through `auth.handler(new Request(...))` (HTTP) for one case per endpoint → response status `400`.
- `createInvitation` with role `"admin"` still succeeds and emits `users.invited` with role `"admin"` / writes one
  `member.invited` row.
- `updateMemberRole` with role `"admin"` still succeeds (event + `member.role_changed` row).
- Two organizations: a user who is a `member` of A and of B, active organization A, calls `leaveOrganization` with
  `organizationId: B` → exactly one `organizations.member-removed` with `organizationId: B`, `actorUserId` = that user,
  payload `{ memberId: <B membership>, userId, role: "member" }`; nothing in A; the membership in A still exists.
  With audit-logs: one `member.removed` row in B (`userId` = the leaving user, `entityId` = B membership id,
  `oldData: { userId, role: "member" }`), none in A.
- The only owner leaving is rejected → no event, no row.
- `deleteOrganization` (owner, MULTI_ORG irrelevant) → no event.

## Mutations to kill

- the role guard hook does not match `/organization/invite-member` (or `/organization/update-member-role`);
- the matcher matches every path (e.g. `() => true`) or `/organization/add-member`;
- `isOrgRole` accepts arrays (e.g. checks `Array.isArray(v) ? v.every(...)`), a comma list (`split(",")`), a substring
  (`includes`), any string, or is case-insensitive / trims;
- the hook returns instead of throwing, or throws a status other than 400;
- `/organization/leave` removed from `ORGANIZATION_EVENT_PATHS`, or mapped through `field(returned, "member")`;
- the leave origin uses the session's active organization or the body `organizationId` instead of the row;
- the leave actor is `null` or the member's `userId` from somewhere other than the session (covered by the
  integration test where they are equal, and the unit test where `actorUserId` differs from the row's `userId`).

## Files

- `src/shared/lib/auth/roles.ts` (`isOrgRole`), `src/shared/lib/auth/org-role-guard-plugin.ts` (new),
  `src/shared/lib/auth/index.ts` (registration), `src/shared/lib/auth/organization-events.ts` (leave).
- Docs: ADR-61 (single-valued roles and why; leave; delete not emitted), `docs/05-moduly-rdzenia.md`,
  `docs/13-modul-audit-logs.md` if it lists the paths, `docs/13b-modul-audit-logs-uzycie.md:161`.
