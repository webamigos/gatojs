---
title: 'A side effect written inside a nested call (better-auth sign-up, a database hook) lands before the command''s deferred events and under the nested actor; emit it from the command or gate it on the scope'
areas: ['architecture']
topics: ['events', 'audit', 'better-auth', 'invite', 'commands']
---

# A side effect written inside a nested call (better-auth sign-up, a database hook) lands before the command's deferred events and under the nested actor; emit it from the command or gate it on the scope

**In short**: `users.invite` registers the invitee with `auth.api.signUpEmail`. The sign-up hook ran `joinOrganizationCommand`, which wrote an `invitation.accepted` audit row with the *invitee* as actor. `runCommand` delivers the command's own `users.invited` only after `run` returns, so the audit log showed an acceptance nobody made, a second before the invite.

**Context**: Browser test of a fresh 0.40.0 project, 2026-11-28 ([ADR-70](../adrs/70-membership-events-come-from-the-actor-who-added-the-member.md)).

**Problem**:

- A helper shared by two flows (public sign-up and admin invite) wrote a side effect directly instead of emitting an event, so the invite scope check (`isInviteSignup()`) that guarded `auth.signed-up` never applied to it.
- Anything written inside the nested call runs before the outer command's recorded events, so timestamps invert.
- The existing integration test asserted the phantom row ("the acceptance has the invitee as actor"): a test written after the code pinned the bug.

**Rule**: Shared core helpers (`joinOrganizationCommand`, membership writes) return ids and emit nothing. The caller that knows who acted builds the events: the sign-up hook outside the invite scope (`signupEvents`), the command through `emit` (so the actor and `serviceMode` come from its context and the order follows `users.invited`). When a nested better-auth call runs inside a command, check every hook it triggers for writes and emits.

**Applies to**: `src/shared/lib/auth/index.ts` hooks, `src/features/organizations/services/`, any command that calls `auth.api.*`.
