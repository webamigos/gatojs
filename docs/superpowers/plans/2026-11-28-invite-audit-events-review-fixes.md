# Invite audit events: security review follow-ups (PR #138)

Four findings from an independent security review of PR #138 (no blockers). Plan for the `gato-task` run.

## 1. Invite-signup scope shared across module copies

Turbopack production builds can duplicate a module into several chunks (see the tenant-scope bypass fix, commit
23a39b7). `src/shared/lib/auth/invite-signup-scope.ts` keeps its `AsyncLocalStorage` in a module variable, so a copy of
the module in the auth chunk would not see the scope opened by the copy in the users chunk: the phantom
`invitation.accepted`, a double `member-added` and an unverified email would come back.

- Store the `AsyncLocalStorage` on `globalThis` under `Symbol.for("gatojs.auth.invite-signup")`, created once, reused
  when one is already registered (same shape as `sharedBypassStorage()` in `tenant-scope-extension.ts`).
- The store is a mutable record `{ memberId: string | null }` per scope (see 2).

## 2. Admin invite reads the member row after the registration

`inviteUserCommand` calls `prisma.member.findUnique` after `registerInvitedUser`. The user and member are already
committed; a failure of that read fails the command, so no `users.invited` is delivered for a membership that exists
(ADR-62). Remove the read: the sign-up hook passes the member id back through the invite scope.

Signatures (`src/shared/lib/auth/invite-signup-scope.ts`):

```ts
export interface InviteSignupOutcome<T> { result: T; memberId: string | null }
export function withInviteSignup<T>(run: () => Promise<T>): Promise<InviteSignupOutcome<T>>;
export function isInviteSignup(): boolean;
export function recordInviteSignupMember(memberId: string | null): void; // no-op outside a scope
```

- `databaseHooks.user.create.after` (`src/shared/lib/auth/index.ts`): inside the invite scope it calls
  `recordInviteSignupMember(applied.memberId)` and emits nothing.
- `inviteUserCommand`: `const { result, memberId } = await withInviteSignup(() => auth.api.signUpEmail(...))`; emits
  `users.invited`, then `organizations.member-added` `{ memberId, userId, role }` when `memberId` is not null. No
  Prisma read between the registration and the emits.

## 3. `admin:create` joining the existing oldest organization emits no event

`ensureOrganizationOwner` (`scripts/lib/admin-create.ts`) adds an `owner` member to the oldest organization when the
user has none there, without an event. Emit `organizations.member-added` after the transaction:
origin `{ organizationId: <oldest>, actorUserId: <the admin's user id> }`, payload
`{ memberId: <created member id>, userId, role: "owner" }`.

Actor decision (recorded in ADR-70): the created/promoted user, like `organizations.created` from the same script and
like a sign-up joining an organization. A CLI run has no signed-in actor, and `null` would hide who got the access.
No event when the member already existed or when the script created the organization (`organizations.created` covers
the owner, like `/organization/create`).

## 4. English test titles

Translate the Polish `it`/`describe`/`test.prop` titles in `src/shared/lib/auth/__tests__/signup-events.test.ts` and
`src/features/users/services/commands/__tests__/invite-user-command.integration.test.ts` to English (meaning unchanged).

## Behaviours

| Input | Expected |
| --- | --- |
| Two copies of `invite-signup-scope` (`vi.resetModules()` + re-import): scope opened by copy A | copy B's `isInviteSignup()` is `true` inside, `false` outside / after it resolves / after it rejects / in a parallel chain |
| Copy B's `recordInviteSignupMember("mem-1")` inside copy A's scope | copy A's `withInviteSignup` resolves `{ result, memberId: "mem-1" }` |
| A store pre-registered under `Symbol.for("gatojs.auth.invite-signup")` | a fresh copy uses it (`injected.run({ memberId: null }, () => isInviteSignup())` is `true`) |
| `withInviteSignup(async () => "x")` with no record | `{ result: "x", memberId: null }` |
| `recordInviteSignupMember("m")` outside a scope | no throw; a later scope still starts with `memberId: null` |
| Nested scopes: inner records `"inner"` | inner outcome `memberId: "inner"`; outer outcome `memberId: null` unless it records itself |
| Two parallel scopes each recording their own id | each outcome has its own id |
| Hook unit: sign-up inside `withInviteSignup`, member row `mem-9` | outcome `memberId: "mem-9"`, no event |
| Hook unit: invite scope with `MULTI_ORG=true` create path (`memberId: null`) | outcome `memberId: null` |
| Command unit: success, sign-up records member `mem-1` | events `users.invited`, then `organizations.member-added { memberId: "mem-1", userId, role }`; `prisma.member.findUnique` never called |
| Command unit: sign-up records no member | only `users.invited` |
| Command unit: any Prisma read after the registration would throw (`prisma.member.findUnique` rejects) | command still succeeds with both events |
| `adminCreate` with an existing oldest organization and a new user | exactly one `organizations.member-added`, origin `{ organizationId: <oldest>, actorUserId: <user> }`, payload `{ memberId: <created member id>, userId: <user>, role: "owner" }`, emitted after the transaction resolved |
| `adminCreate` second run (member exists) / first run creating the organization / failing transaction | no `member-added` |
| e2e `core-auth`: after the admin invites Jan, `/audit-log` | exactly one "Zaproszenie członka" row, no "Przyjęcie zaproszenia" row |

## Mutations to kill

- A module-level `new AsyncLocalStorage()` instead of the global one (copies stop sharing the scope).
- A different `Symbol.for` key, or always creating a new store (ignoring the registered one).
- `recordInviteSignupMember` writing outside a scope / into the outer scope; dropping the record call in the hook.
- `withInviteSignup` returning a hard-coded `memberId: null`, or the user id as member id.
- The command emitting `member-added` with `memberId: null`, or reading Prisma again.
- `admin:create`: emitting `member-added` when the member already existed or the organization was created; actor
  `null` or another user; role other than `owner`; `memberId` = user id; emitting inside the transaction callback.
