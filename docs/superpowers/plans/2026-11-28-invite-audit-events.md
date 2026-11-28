# Admin invite writes a phantom "invitation accepted" audit row; sign-up by invitation emits no member events

## Bug

Fresh project (GatoJS 0.40.0, all modules). An admin invites a user on `/users`. The audit log shows two rows:
`member.invited` (actor: the admin) and `invitation.accepted` (actor: the invited user, 1 s *earlier*). The invitee
accepted nothing: they only got a set-password mail.

## Root cause

`inviteUserCommand` creates the `Invitation`, then registers the account with `auth.api.signUpEmail({ invitationId })`
inside `withInviteSignup`. The sign-up runs `databaseHooks.user.create.after` → `applySignupMembership` →
`joinOrganizationCommand`, and `joinOrganizationCommand` calls `trackAudit({ action: "invitation.accepted",
actorUserId: <new user> })` directly, bypassing the event bus and the invite-scope check. That row is written inside
`signUpEmail`; the command's `users.invited` emit is recorded and delivered only after `run` succeeds (ADR-61,
`runCommand`), so the `member.invited` row lands after the phantom row.

The same direct `trackAudit` is also the only trace of a *public* sign-up by invitation: the hook emits only
`auth.signed-up`, so `users.invitation-accepted` and `organizations.member-added` never reach subscribers (the ADR-61
gap "a sign-up by invitation does not go through `/organization/accept-invitation`"). Members added by an admin invite
or by a single-organization public sign-up never emit `organizations.member-added` either.

## Event semantics after the fix

| Operation | Events, in order (origin organization = the membership's) | Audit rows (audit-logs) |
| --- | --- | --- |
| Admin invite (`users.invite`, admin or confirmed superadmin) | `users.invited`, `organizations.member-added`; both actor = the inviting admin, `serviceMode` from the context | exactly one `member.invited` (actor admin) |
| Public sign-up with an invitation | `auth.signed-up`, `users.invitation-accepted`, `organizations.member-added`; actor = the new user | exactly one `invitation.accepted` (actor new user) |
| Public sign-up, `MULTI_ORG=false`, no invitation (joins the only organization) | `auth.signed-up`, `organizations.member-added` (role `member`); actor = the new user | none |
| Public sign-up, `MULTI_ORG=true`, no invitation | `organizations.created`, `auth.signed-up` (unchanged; no `member-added`, like `/organization/create`) | none |
| `/organization/accept-invitation` (existing user) | unchanged: `users.invitation-accepted`, `organizations.member-added` | unchanged: one `invitation.accepted` |

An admin invite never emits `users.invitation-accepted` or `auth.signed-up`: the invitee did not act.

## Files and signatures

- `src/features/organizations/services/commands/member-commands.ts`:
  `joinOrganizationCommand(input: { userId; organizationId; role: OrgRole; invitationId?: string }): Promise<{ memberId: string }>`.
  Writes the member (and with `invitationId` marks the invitation `accepted` in the same transaction); **no `trackAudit`**.
- `src/features/organizations/services/signup-membership.ts`:
  `applySignupMembership(userId, membership): Promise<{ organizationId: string; memberId: string | null }>`
  (`memberId` of the joined member for `join`, `null` for `create`).
- New pure module `src/shared/lib/auth/signup-events.ts`:
  `signupEvents(input: { userId: string; email: string; membership: SignupMembership; applied: { organizationId: string; memberId: string | null } }): SignupEventEmit[]`
  where `SignupEventEmit` is `{ origin: EventOrigin; name; payload }` for `auth.signed-up`, `users.invitation-accepted`,
  `organizations.member-added` (same shape as `OrganizationEventEmit` in `organization-events.ts`). Rows from the table
  above; `origin = { organizationId: applied.organizationId, actorUserId: userId }`; `member-added` payload
  `{ memberId: applied.memberId, userId, role: membership.role }`; `invitation-accepted` payload
  `{ invitationId: membership.invitationId, userId }`. A `join` with `memberId: null` returns only `auth.signed-up`.
- `src/shared/lib/auth/index.ts` `databaseHooks.user.create.after`: inside `withInviteSignup` it applies the membership
  and emits nothing (unchanged); otherwise it emits every `signupEvents(...)` entry in order with `emitEvent`.
- `src/features/users/services/commands/invite-user-command.ts`: `events: ["users.invited", "organizations.member-added"]`;
  after the registration it reads the invitee's member row in `context.organizationId`
  (`prisma.member.findUnique({ where: { organizationId_userId: … }, select: { id: true } })`) and emits
  `users.invited`, then `organizations.member-added` `{ memberId, userId, role }` (role = the invited role). A missing
  member row emits only `users.invited`.
- Docs: new ADR-70 (supersedes the sign-up/invite event bullets of ADR-61), `src/features/organizations/extension-points.json`
  descriptions if they name the emitters, `EXTENSION_POINTS.md` via generate if it changes, `kit/modules/core.json`
  patch bump, lesson in `docs/lessons/`.

## Behaviours

| Input | Expected |
| --- | --- |
| Unit `joinOrganizationCommand({ userId: "user-new", organizationId: "org-a", role: "member", invitationId: "inv-1" })`, `$transaction` resolves `[{ id: "mem-1" }, { id: "inv-1" }]` | resolves `{ memberId: "mem-1" }`; `trackAudit` never called (no `@/shared/lib/audit` import needed) |
| Unit `joinOrganizationCommand` without `invitationId`, `member.create` resolves `{ id: "mem-2" }` | resolves `{ memberId: "mem-2" }`; no invitation update |
| Unit `applySignupMembership("user-1", { action: "join", organizationId: "org-a", role: "admin", invitationId: "inv-1" })` | `{ organizationId: "org-a", memberId: <member id from Prisma mock> }` |
| Unit `applySignupMembership` with `create` | `{ organizationId: <new org id>, memberId: null }` |
| `signupEvents` join with invitation (`userId: "u1"`, `email: "a@x.pl"`, org `org-a`, member `m1`, role `admin`, invitation `inv-1`) | exactly `[auth.signed-up {userId:"u1",email:"a@x.pl"}, users.invitation-accepted {invitationId:"inv-1",userId:"u1"}, organizations.member-added {memberId:"m1",userId:"u1",role:"admin"}]`, each origin `{ organizationId: "org-a", actorUserId: "u1" }` |
| `signupEvents` join without invitation | `[auth.signed-up, organizations.member-added {role:"member"}]` |
| `signupEvents` create (`applied.memberId: null`) | `[auth.signed-up]` only |
| `signupEvents` join with `memberId: null` | `[auth.signed-up]` only |
| Hook unit (`user-create-hooks.test.ts`, mocked Prisma): public sign-up with invitation | subscribers see `auth.signed-up`, `users.invitation-accepted`, `organizations.member-added` in that order, organization = the invitation's, actor = new user |
| Hook unit: sign-up inside `withInviteSignup` | no event at all (none of the three), membership still written |
| Hook unit: public sign-up with forged `inviteSignup`/`isInviteSignup` body fields or headers and an invitation | still the three events |
| Hook unit: failing membership transaction | no event |
| Command unit (`invite-user-command.test.ts`): admin invite success | recorded events exactly `users.invited`, then `organizations.member-added` with the member id from the mocked member row, invited user id and role, origin = context organization, actor admin |
| Command unit: member row missing | only `users.invited` |
| Command unit: existing email / failed registration / no admin role / service mode without confirmation | no event |
| Integration (real better-auth, two organizations): admin of A invites `nowy@a.example` | audit rows in A: exactly one, `member.invited`, actor admin; **no `invitation.accepted` row anywhere**; B has no rows |
| Integration: same invite | domain events exactly `["users.invited", "organizations.member-added"]`; `member-added` organization A, actor admin, `serviceMode: false`, `memberId` = the DB member id of the invitee in A, `role` = invited role; no `users.invitation-accepted`, no `auth.signed-up` |
| Integration: confirmed superadmin invite in A | `member-added` actor superadmin, `serviceMode: true` |
| Integration: public sign-up with an invitation into A | domain events exactly `["auth.signed-up", "users.invitation-accepted", "organizations.member-added"]`, organization A, actor new user, `invitationId` = the invitation, `memberId` = the DB member id; audit rows: exactly one `invitation.accepted` in A (actor new user), none in B |
| Integration: public sign-up with forged marker fields and an invitation | same three events |

## Mutations to kill

- Keeping the direct `trackAudit("invitation.accepted")` in `joinOrganizationCommand` (admin invite gets a phantom row; public sign-up gets two `invitation.accepted` rows).
- Dropping the `isInviteSignup()` early return in the hook (admin invite emits `users.invitation-accepted`/`auth.signed-up` with the invitee as actor).
- Emitting `users.invitation-accepted` for a join without an invitation, or `organizations.member-added` for `create`.
- Swapping the order of the emits (command: `member-added` before `users.invited`; hook: any other order).
- `member-added` actor = the invitee instead of the admin; `serviceMode` not carried for a superadmin.
- `memberId` = `userId` or another member's id; `role` hard-coded; `invitationId` from anywhere but the membership.
- Organization of an event taken from anything but the membership/context (a second organization must stay empty).
- Returning `{ memberId: undefined }` or the invitation id from `joinOrganizationCommand`.
