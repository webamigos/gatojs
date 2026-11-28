# ADR-71: A change to the user's own profile is a user-level action that emits no domain event and writes no audit row

**Status:** Proposed
**Date:** 2026-11-28
**Decided by:** an agent with Patryk Omiotek (finding from a browser test of a fresh project with all modules)

## Context

The account page showed the display name (better-auth sets it to the local part of the email, e.g. `hello`) with no way
to change it. The fix adds a name form backed by a server action. The kit has a queued gap "account changes emit
nothing": a password change emits no event and writes no audit row, and the question was whether the new action should
emit an `account.profile-updated` event.

Domain events (ADR-61) carry the organization of their origin: `emitEvent(origin, …)` needs an `organizationId`, the bus
delivers it with that organization, and every subscriber filters by it. ADR-70 adds that the actor and the
organization come from the code that knows who acted. Audit rows (`trackAudit`) are per organization as well.

## Decision

- `updateAccountNameCommand(input)` (`src/features/account/services/commands/update-account-name-command.ts`) is a
  user-level server action, like `changePasswordCommand`: `requireModuleEnabled("account")` → `accountNameSchema`
  (`src/features/account/contracts/account.schemas.ts`, trimmed, 1–100 characters) → the better-auth session →
  `auth.api.updateUser({ body: { name } })`. It does not call `getOrgContext()` and needs no service-mode confirmation,
  because the name is not organization data.
- It emits no domain event and writes no audit row. The gap "account changes emit nothing" stays open, for the name
  and the password alike, until the kit has a user-scoped event channel.

## Rejected alternatives

- Emit `account.profile-updated` with the session's active organization as origin: the name applies to every
  membership, so one organization would learn about a change that belongs to all of them, and with `MULTI_ORG=true`
  which one depends on whichever happened to be active. A subscriber writing org data from it would write into an
  arbitrary tenant.
- Emit the event once per membership: an action on the user's own account would fan out into N organization events
  and N audit rows, and the audit log of an organization would record a change the organization did not make.
- Make the name an organization command with service-mode confirmation: a superadmin in service mode does not edit
  the users of an organization through the account page; the page always edits the signed-in user.

## Consequences

- A project that must react to a name change hooks better-auth's `/update-user` path in its module `auth.ts` plugin,
  where it knows the user, and decides itself which organizations to tell.
- When a user-scoped event channel exists, both the password change and the name change get their events there.

## Enforcement

- `src/features/account/services/commands/__tests__/update-account-name-command.test.ts` (validation, session, exact
  `updateUser` body, the module check first).
- `src/__tests__/server-entrypoints-guard.test.ts` and `src/__tests__/architecture/module-entry-points-check-enabled.test.ts`
  cover the new server action without exceptions.
- No event is a convention: review catches an `emitEvent` added to the action.

## Sources

- Plan `docs/superpowers/plans/2026-11-28-ui-consistency.md`.
- ADR-61, ADR-70.
