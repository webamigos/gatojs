# Domain events: review fixes before merge (extensibility Task 9)

Branch `feat/domain-events`, draft PR #116. An independent review found no tenant leak, but four points must be fixed before merge.

## 1. Admin invite does not emit `auth.signed-up`

`inviteUserCommand` creates the account through `auth.api.signUpEmail({ body: { …, invitationId } })`. That runs the sign-up hook `databaseHooks.user.create.after` in `src/shared/lib/auth/index.ts`, which emits `auth.signed-up` (actor = the invited user) before the command emits `users.invited`. An admin invite is not a sign-up by the user.

Fix: a server-only marker in a new file `src/shared/lib/auth/invite-signup-scope.ts`:

```ts
export function withInviteSignup<T>(run: () => Promise<T>): Promise<T>;
export function isInviteSignup(): boolean;
```

An `AsyncLocalStorage<true>`: `withInviteSignup` runs `run` inside the scope, `isInviteSignup()` is `true` only inside it (also after `await`s inside `run`), `false` outside and after it settles (resolved or rejected). `registerInvitedUser` in `invite-user-command.ts` wraps the `auth.api.signUpEmail` call in `withInviteSignup`. The sign-up hook still applies the membership inside the scope, but skips `emitEvent("auth.signed-up")`. The marker is never read from the request body, headers or the better-auth context: a public sign-up cannot set it.

What the ADR promises after the fix: an admin invite emits only `users.invited` (the membership and invitation events come with Task 10). A public sign-up (with or without an invitation) emits `auth.signed-up` for the organization of the membership it produced, actor = the new user.

### Behaviours

- `isInviteSignup()` outside any scope → `false`.
- inside `withInviteSignup(async () => { await Promise.resolve(); return isInviteSignup(); })` → resolves to `true`.
- after `await withInviteSignup(async () => "x")` → returns `"x"`, and `isInviteSignup()` afterwards → `false`.
- `withInviteSignup(async () => { throw new Error("boom") })` → rejects with that error; `isInviteSignup()` afterwards → `false`.
- unit, `user-create-hooks.test.ts` (real `auth`, mocked Prisma): `withInviteSignup(() => auth.api.signUpEmail({ body: { name: "Jan", email: "jan@example.com", password: "password123", invitationId: "inv-1" } }))` with an invitation `{ id: "inv-1", organizationId: "org-invited", role: "admin" }` → no `auth.signed-up` delivered (`[]`), and the membership is still created (`member.create` called with `organizationId: "org-invited"`, role `"admin"`).
- unit: a public sign-up with forged body fields `inviteSignup: true` (and/or `adminInvite: true`, `isInviteSignup: true`) outside the scope → exactly one `auth.signed-up` for the joined organization, actor `"user-new"`.
- unit: a public sign-up by invitation (outside the scope) → exactly one `auth.signed-up` with `organizationId: "org-invited"`, actor = the new user (already pinned; keep).
- unit, `invite-user-command.test.ts` (auth mocked): while the mocked `auth.api.signUpEmail` runs, `isInviteSignup()` is `true`; after the command finishes it is `false`.
- integration, `invite-user-command.integration.test.ts` (real better-auth, real `_test` DB): a probe subscriber on `auth.signed-up` and `users.invited` records event names in order; a successful admin invite records exactly `["users.invited"]`, with `organizationId` = the admin's active organization and `actorUserId` = the admin.
- integration: a public `auth.api.signUpEmail({ body: { …, invitationId } })` for a pending invitation of org A (not wrapped) records exactly `["auth.signed-up"]` with `organizationId` = org A, actor = the new user's id.

### Mutations to kill

- `registerInvitedUser` calls `signUpEmail` without `withInviteSignup`.
- the hook ignores `isInviteSignup()` (always emits), or negates it (never emits on a public sign-up).
- the hook returns before `applySignupMembership` when `isInviteSignup()` (membership lost).
- `isInviteSignup()` returns `true` outside a scope (`?? true`, `!== undefined` → `=== undefined`).
- `withInviteSignup` does not run inside the storage (`run()` instead of `storage.run(true, run)`).
- the marker read from `ctx.body` / request.

## 2. Payload guarantees

In `src/shared/lib/events/event-bus.ts`:

- the parsed payload is deep-frozen: every nested plain object and array of `parsed.data` is frozen, not only the top level.
- `createEventBus` rejects (in the same single `EventError` that lists all registry problems) an event schema that is not a strip-mode `z.object()`: a schema with a catchall (`z.looseObject`, `.passthrough()`, `.loose()`, `.catchall(x)`, `z.strictObject`, `.strict()`), and a schema that is not a `ZodObject` at all (e.g. `z.object({...}).transform(...)`). Message lines (literal):
  - `event <name> must be a z.object() that strips unknown keys` for a catchall, loose, passthrough or strict object;
  - `event <name> must be a z.object() schema` for a non-object schema.
  The check covers module and core events.

### Behaviours

- emit with a schema `z.object({ meta: z.object({ tags: z.array(z.string()) }) })` and payload `{ meta: { tags: ["a"] } }`; a subscriber that tries `event.payload.meta.tags.push("b")` and `(event.payload.meta as any).x = 1` → both throw `TypeError` inside the subscriber (logged as a subscriber failure), and the next subscriber sees `{ meta: { tags: ["a"] } }`; `Object.isFrozen(event.payload.meta)` and `Object.isFrozen(event.payload.meta.tags)` → `true`.
- `createEventBus` with a module event `"m.x": z.looseObject({ a: z.string() })` → throws `EventError` whose message contains `event m.x must be a z.object() that strips unknown keys`.
- the same for `z.object({ a: z.string() }).passthrough()`, `.catchall(z.string())`, `z.strictObject({...})`.
- `"m.x": z.object({ a: z.string() }).transform((v) => v)` (cast to the type) → message contains `event m.x must be a z.object() schema`, and `createEventBus` does not crash with a `TypeError`.
- a plain `z.object({ a: z.string() })` → no error.
- a payload with an extra `organizationId: "org-evil"` for a plain schema still reaches the subscriber without `organizationId` (already pinned; keep).

### Mutations to kill

- shallow `Object.freeze(parsed.data)` instead of a deep freeze; deep freeze skipping arrays.
- the catchall check removed or inverted; the non-object check removed.
- the problem appended only for module events (core skipped).

## 3. Re-entrancy cap

In `event-bus.ts`: an `AsyncLocalStorage<number>` per bus counts nested emits. An emit at nesting depth `n` (the top-level emit has `n = 0`) runs its subscribers inside depth `n + 1`. The chain may hold at most 8 emits (`MAX_EVENT_DEPTH = 8`): an emit whose depth is already 8 runs no subscribers, does not throw, and logs exactly once `logger.error("Event depth exceeded", { event: <name>, error })` where `error` is an `EventError` with the message `event depth exceeded 8: <name>`.

### Behaviours

- events `m.a`, `m.b`; subscriber `m.on-a` on `m.a` emits `m.b`, `m.on-b` on `m.b` emits `m.a` (same bus, same origin). Top-level `emit(origin, "m.a", {})` → resolves; `m.on-a` ran 4 times, `m.on-b` ran 4 times; `logger.error` called exactly once, with `"Event depth exceeded"` and `{ event: "m.a", error: EventError("event depth exceeded 8: m.a") }`; no `"Event subscriber failed"` log.
- a chain of exactly 8 emits (e.g. a counter subscriber that re-emits while its count < 8) → 8 runs, no `logger.error`.
- two sequential top-level emits each start at depth 0 (the second one, after the first chain overflowed, still runs its subscribers).
- sibling emits at the same level do not add up: a subscriber that emits `m.b` three times in a row at depth 1 → `m.on-b` runs 3 times, no log.

### Mutations to kill

- `>=` → `>` (9 emits allowed), cap constant changed, depth not incremented, depth taken from a module-level counter that never decrements, overflow throwing instead of logging, logging per level.

## 4. Docs

- ADR-61: the invite marker (decision + enforcement), deep freeze, the strip-mode-object rule, the depth cap; Consequences: the registry import cycle risk (a subscriber that imports `@/shared/lib/auth` must import it dynamically, as `inviteUserCommand` does: `const { auth } = await import("@/shared/lib/auth")`, because `auth/index.ts` imports `emitEvent` and the registry).
- `docs/05-moduly-rdzenia.md`: event table (`auth.signed-up` not on the admin invite path; `users.invited` alone on admin invite), `/organization/create` (better-auth endpoint) does not emit `organizations.created` yet (Task 10), the bus rules above.

## Files

- new `src/shared/lib/auth/invite-signup-scope.ts` (+ `__tests__/invite-signup-scope.test.ts`)
- `src/shared/lib/auth/index.ts`
- `src/features/users/services/commands/invite-user-command.ts`
- `src/shared/lib/events/event-bus.ts`
- tests: `src/shared/lib/auth/__tests__/user-create-hooks.test.ts`, `src/features/users/services/commands/__tests__/invite-user-command.test.ts`, `src/features/users/services/commands/__tests__/invite-user-command.integration.test.ts`, `src/shared/lib/events/__tests__/event-bus.test.ts`
