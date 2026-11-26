# `users.invite` security review fixes (extensibility Task 13 follow-up)

Findings of the independent security review of PR #123. Nothing blocked the merge; one audit-trail regression is fixed
before it, and two gaps in the tests and docs are closed. ADR-62 and `docs/06-wzorce-kodu.md` are updated for item 2.

## 1. The invited user's email is verified when the account is created

Files: `src/shared/lib/auth/index.ts` (`databaseHooks.user.create.before`),
`src/features/users/services/commands/invite-user-command.ts` (`markEmailVerified` removed).

Before: `users.invite` called `auth.api.signUpEmail` (which creates the user, the account and, in
`databaseHooks.user.create.after`, the Member row) and then a separate `prisma.user.update({ emailVerified: true })`.
A failure of that update failed the command after the Member row existed: no `users.invited` event, so no
`member.invited` audit row and no welcome mail, and a retry answered "Użytkownik z tym adresem już istnieje".

After: `databaseHooks.user.create.before` returns `{ data: { ...user, emailVerified: true } }` when `isInviteSignup()` is
true, and leaves the user unchanged otherwise. `isInviteSignup()` reads the server-only `AsyncLocalStorage` set by
`withInviteSignup` (only `registerInvitedUser` in the invite command sets it); request body fields and headers never
reach it. The command makes no write between `signUpEmail` and returning its result, so a created Member always
gets its `users.invited` event.

### Behaviors

| Input | Expected |
| --- | --- |
| `user.create.before` called inside `withInviteSignup` with `{ email: "jan@example.com", emailVerified: false, … }` | resolves to `{ data: { …same fields, emailVerified: true } }` |
| `user.create.before` called outside `withInviteSignup` with `emailVerified: false` | the user is not marked verified (`undefined`, or `data.emailVerified === false`) |
| `auth.api.signUpEmail` inside `withInviteSignup` (mocked Prisma) | `prisma.user.create` receives `data.emailVerified: true` |
| public `auth.api.signUpEmail` (no scope) | `prisma.user.create` receives `data.emailVerified: false` |
| public sign-up with body `emailVerified: true`, `inviteSignup: true`, `isInviteSignup: true` and headers `x-invite-signup: 1` | `prisma.user.create` receives `data.emailVerified: false` |
| `inviteUserCommand` success (unit, mocked Prisma) | `prisma.user.update` never called |
| `inviteUserCommand` (unit), `prisma.user.update` would reject with `db down` | the invite still succeeds and emits `users.invited` once (the update is not called) |
| Integration (real better-auth, own `_test` database): admin of A invites `nowy@example.com` | the user row has `emailVerified: true`; exactly one `AuditLog` row with `action: "member.invited"` for A; the Member row in A exists |
| Integration: after a set of invites, every Member row of an invited user | has a `member.invited` audit row with the invited email (no Member without its audit row) |
| Integration: public sign-up with an invitation into A | `emailVerified: false` |
| Integration: public sign-up with forged body `emailVerified: true`, `isInviteSignup: true` and header `x-invite-signup: 1` | `emailVerified: false` |

### Mutations to kill

- The `before` hook marking every user verified (dropping the `isInviteSignup()` check).
- The `before` hook returning `emailVerified: false` or not returning `data` for an invite.
- The `before` hook dropping other user fields (returning only `{ emailVerified: true }`).
- Keeping a separate `prisma.user.update` after `signUpEmail` in the command.

## 2. Hook rewrites: comma-joined roles and the email field

File: `src/features/users/services/commands/__tests__/invite-user-command-hooks.test.ts`; docs: ADR-62, `docs/06-wzorce-kodu.md`.

The schema allows `role` only as `"admin"` or `"member"`. A hook that returns a comma-joined role fails the re-parse after
the hooks, before any database access.

### Behaviors

| Hook returns | Expected |
| --- | --- |
| `{ ...input, role: "admin,owner" }` | `{ success: false, error: "Nie udało się zaprosić użytkownika" }`; `prisma.user.findUnique`, `prisma.invitation.create`, `auth.api.signUpEmail` not called; no event |
| `{ ...input, role: "member,member" }` | same as above |

Docs: `email` is a field a `before` hook of `users.invite` may rewrite (the re-parse trims and lowercases it and checks the
format; the existing-user check runs on the rewritten email).

### Mutations to kill

- The re-parse after the hooks removed (the joined role reaches `prisma.invitation.create`).
