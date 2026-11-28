# ADR-70: Membership events name the person who acted, so an admin invite emits no invitation acceptance and a sign-up by invitation emits the member events

**Status:** Accepted (supersedes the sign-up and admin-invite event bullets of ADR-61)
**Date:** 2026-11-28
**Decided by:** an agent with Patryk Omiotek (bug from a browser test of a fresh 0.40.0 project)

## Context

An admin invited a user on `/users`. The audit log showed two rows: `member.invited` (actor: the admin) and
`invitation.accepted` (actor: the invitee), the second one about a second *earlier*. The invitee had accepted nothing:
they only got a mail with a set-password link.

`inviteUserCommand` creates the `Invitation` and registers the account with `auth.api.signUpEmail({ invitationId })`
inside `withInviteSignup`. The sign-up hook `databaseHooks.user.create.after` calls `applySignupMembership` →
`joinOrganizationCommand`, which wrote `trackAudit({ action: "invitation.accepted", actorUserId: <new user> })`
directly, bypassing the event bus and the invite-scope check. That write happens inside `signUpEmail`, while the
command's `users.invited` is delivered only after `run` succeeds (ADR-61), so the phantom row came first.

The same direct write was the only trace of a public sign-up by invitation: ADR-61 left that path emitting only
`auth.signed-up`, so a subscriber of `users.invitation-accepted` or `organizations.member-added` never saw it. A member
added by an admin invite or by a single-organization sign-up never emitted `organizations.member-added` either.

## Decision

- `joinOrganizationCommand` (`src/features/organizations/services/commands/member-commands.ts`) writes the member (with
  `invitationId`, also the invitation status `accepted`, in one transaction), returns `{ memberId }` and writes no audit
  row. Core writes no organization audit row directly; every one comes from an event subscriber (ADR-61).
- `applySignupMembership` returns `{ organizationId, memberId }` (`memberId: null` for a new organization).
- The pure `signupEvents` (`src/shared/lib/auth/signup-events.ts`) maps a sign-up to events, all with the membership's
  organization and the new user as actor:
  - join with an invitation: `auth.signed-up`, `users.invitation-accepted`, `organizations.member-added`;
  - join without an invitation (`MULTI_ORG=false`): `auth.signed-up`, `organizations.member-added` (role `member`);
  - a new organization (`MULTI_ORG=true`): `auth.signed-up` only (`organizations.created` comes from
    `createOrganizationWithOwnerCommand`, like `/organization/create` emits no `member-added` for the owner).
  The hook emits them in that order outside `withInviteSignup`. Inside it the hook emits nothing and records the
  written `memberId` in the invite scope (`recordInviteSignupMember`), and `withInviteSignup` resolves
  `{ result, memberId }`.
- The invite scope (`src/shared/lib/auth/invite-signup-scope.ts`) keeps its `AsyncLocalStorage` on `globalThis` under
  `Symbol.for("gatojs.auth.invite-signup")`, like the tenant-scope bypass store: a production build can bundle the
  module into several chunks (the users command and the auth hook), and a copy with its own store would not see the
  scope, bringing back the phantom `invitation.accepted` row, a second `member-added` and an unverified email.
- An admin invite (`users.invite`) declares `users.invited` and `organizations.member-added`. After the registration it
  emits `users.invited`, then `organizations.member-added` (`memberId` from the invite scope, invitee `userId`, invited
  `role`), both through `runCommand`, so the actor is the admin and `serviceMode` comes from the context. It reads
  nothing from the database between the registration and the emits: the user and member are already committed, and a
  failing read would leave a membership without `users.invited` (ADR-62). Without a recorded member it emits only
  `users.invited`. It never emits `users.invitation-accepted` or `auth.signed-up`: the invitee did not act.
- `npm run admin:create` that adds the admin as `owner` of the existing oldest organization emits
  `organizations.member-added` (`role: "owner"`) after its transaction, with the admin's own user id as actor, like
  `organizations.created` from the same script and like a sign-up joining an organization. A CLI run has no signed-in
  actor, and `null` would hide who got the access. No event when the membership already existed or when the script
  created the organization (`organizations.created` covers the owner).
- With `audit-logs`, an admin invite writes exactly one row (`member.invited`, actor admin), a public sign-up by
  invitation exactly one `invitation.accepted` (actor new user), and `/organization/accept-invitation` is unchanged.

## Rejected alternatives

- Keeping the direct `trackAudit` and skipping it inside `withInviteSignup`: the sign-up by invitation would still emit
  no member events, and core would keep one organization audit row outside the subscribers.
- Emitting `member-added` for the admin invite from the sign-up hook: the hook does not know the admin, and it runs
  before the command's deferred `users.invited`, so subscribers would see the membership before the invitation.
- Emitting `users.invitation-accepted` for an admin invite with the admin as actor: nobody accepted anything; the
  invitation is only marked `accepted` because the account and membership exist at once.

## Consequences

- A subscriber of `organizations.member-added` now sees members from admin invites and sign-ups too, not only from
  `/organization/accept-invitation`. A project that counted on the narrower set filters by `actorUserId` or listens to
  `users.invitation-accepted` instead.
- Without `audit-logs`, a sign-up by invitation writes no `invitation.accepted` row (before, core wrote it into every
  audit sink). A project sink that wants it subscribes to `users.invitation-accepted`.
- Projects already running 0.40.0 or older keep the phantom `invitation.accepted` rows written by past admin invites:
  rows with `action = 'invitation.accepted'` whose `entity_id` is an invitation that also has a `member.invited` row
  from the same invite. They are history, not something the fix rewrites.

## Enforcement

- `src/shared/lib/auth/__tests__/signup-events.test.ts` (literal event lists, property tests),
  `user-create-hooks.test.ts` (order, invite scope emits nothing, forged markers),
  `src/features/users/services/commands/__tests__/invite-user-command.test.ts` and
  `invite-user-command.integration.test.ts` (two organizations: exactly `users.invited` then `organizations.member-added`,
  one `member.invited` row and no `invitation.accepted` row for an admin invite; three events and one
  `invitation.accepted` row for a public sign-up by invitation),
  `src/features/audit-logs/__tests__/organization-audit.integration.test.ts`,
  `member-commands.test.ts` (no `trackAudit`), `invite-signup-scope-shared-store.test.ts` (two module copies share
  the scope and the recorded member), `scripts/lib/__tests__/admin-create.test.ts` (`member-added` for the oldest
  organization), the `core-auth` e2e (one "member invited" and no "invitation accepted" row on `/audit-log` after an
  admin invite), and the mutation gate (`src/shared/lib/auth/` is `critical`).

## Sources

- Plan `docs/superpowers/plans/2026-11-28-invite-audit-events.md` and the review follow-up
  `docs/superpowers/plans/2026-11-28-invite-audit-events-review-fixes.md`.
- Commit 23a39b7 (tenant-scope bypass store shared across bundled copies).
- ADR-61 (domain events), ADR-62 (commands).
