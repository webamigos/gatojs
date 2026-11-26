# ADR-61: Domain events carry the organization of their origin and run subscribers one at a time after the operation succeeded

**Status:** Accepted
**Date:** 2026-11-26
**Decided by:** Patryk Omiotek (extensibility decision 7A), implemented by an agent

## Context

A project module often has to react to something a Gato module did: a member left the organization, an organization was created, a user was invited. Without a mechanism it edits the Gato command that does it, which turns a Gato file into a local change (ADR-59). The only reaction point so far, `auditSinks` (D40), is fixed to audit entries.

Events cross tenant boundaries easily. A reaction that reads the organization from the wrong place, or that a previous reaction changed, writes into another organization's data. And most core operations are not one Prisma transaction: `inviteUserCommand` calls better-auth `signUpEmail` and makes separate writes, better-auth endpoints manage their own writes, and the `databaseHooks.user.create.after` hook runs after better-auth's transaction has committed.

## Decision

New core library `src/shared/lib/events/` (in `mutation-gate.json` `critical`):

- A module declares events in `src/features/<x>/events.ts`: `export const events = defineEvents({ "<x>.<name>": z.object({ … }) })`. Keys start with the module key and a dot; a schema is a plain `z.object()` in strip mode (no `z.looseObject`, `.passthrough()`, `.loose()`, `.catchall()`, `z.strictObject`, `.strict()`, no `.transform()` around it) and must not declare `organizationId`. Core events are in `src/shared/lib/events/core-events.ts`: `organizations.created`, `organizations.member-added`, `organizations.member-removed`, `organizations.member-role-changed`, `users.invited`, `users.invitation-accepted`, `users.invitation-canceled`, `auth.signed-up`.
- A module subscribes in `src/features/<x>/subscribers.ts`: `export const subscribers = defineSubscribers({ "organizations.member-removed": { id: "<x>.<name>", run: async (event) => … } })`, one subscriber or an array per event. Subscriber ids start with the module key and a dot and are unique.
- Code emits with `emitEvent(origin, name, payload)`. `origin` is `{ organizationId, actorUserId }`: `eventOrigin(context)` from an `OrgContext`, or built from the row core code just wrote where no `OrgContext` exists (the sign-up hook, `createOrganizationWithOwnerCommand`, `scripts/lib/admin-create.ts`). The payload type has no `organizationId`, and the payload is parsed with the event's schema, which strips unknown keys (the registry check above rejects any schema that would keep them), so an `organizationId` in the payload never reaches a subscriber. The subscriber receives `{ name, organizationId, actorUserId, payload }`, frozen with the payload deep-frozen (every nested object and array), so one subscriber cannot change what the next one sees.
- Subscribers run after the operation succeeded, awaited, one at a time: in registry order, then by id within a module. A subscriber error is logged (`logger.error("Event subscriber failed", { event, subscriber, error })`) and never rethrown, as `trackAudit` does. An unknown event name or a payload failing its schema throws in the emitter before any subscriber runs: that is a bug in the emitting code, not a subscriber failure.
- The generator (`gato-cli` 0.9.0, `kitFormat` 6) detects `events.ts` and `subscribers.ts` and emits two lists in the server registry only: `moduleEvents` (`[{ module, value }]`, not filtered) and `moduleSubscribers` (`enabledModuleEntries([...], gatoConfig)`, without the subscribers of a module disabled in `src/gato.config.ts`). `moduleEvents` keeps a disabled module's schemas: the module emits nothing, and a subscriber of its events in another module still loads, while a misspelt event name fails.
- A subscriber may emit. The bus counts nested emits in an `AsyncLocalStorage` (one per bus): a chain holds at most 8 emits, the top-level one included. An emit at depth 8 runs no subscribers, does not throw and logs once `logger.error("Event depth exceeded", { event, error })` with `EventError("event depth exceeded 8: <name>")`, so a cycle (A emits B, B emits A) ends instead of looping forever. Sibling emits at one level do not add up, and each top-level emit starts at depth 0.
- `createEventBus` validates the registry and throws one `EventError` listing every problem (key prefix, duplicate event, a schema that is not a strip-mode `z.object()`, `organizationId` in a schema, subscriber id prefix, duplicate subscriber, subscriber of an undeclared event). `emitEvent` builds the bus on the first emit, because a subscriber that emits imports `emitEvent` from a file the registry imports; a test builds it from the real registry, so a bad key fails `npm test`.
- First emitters: `users.invited` in `inviteUserCommand` after `trackAudit`; `organizations.created` in `createOrganizationWithOwnerCommand` and in `adminCreate` after the transaction that created the organization; `auth.signed-up` in `databaseHooks.user.create.after` when a sign-up by the user (public, with or without an invitation) produced a membership: the organization is the membership's, the actor is the new user. An admin invite is not a sign-up by the user: `inviteUserCommand` creates the account through `auth.api.signUpEmail` inside `withInviteSignup` (`src/shared/lib/auth/invite-signup-scope.ts`, a server-only `AsyncLocalStorage` flag), and the hook applies the membership but skips `auth.signed-up` while `isInviteSignup()` is true. The flag is never read from the request body, headers or better-auth context, so a public sign-up cannot forge it. An admin invite emits exactly `users.invited`. The member and invitation events (`organizations.member-added`, `users.invitation-accepted` and the rest) come from a core better-auth plugin (extensibility plan Task 10); until then neither an admin invite nor a sign-up by invitation emits them, and the better-auth endpoint `/organization/create` does not emit `organizations.created`.

## Rejected alternatives

- An `in-transaction` mode where a subscriber error rolls the operation back: most core operations are not one transaction (see Context), so the promise could not be kept. Validation that must stop an operation goes into a command `before` hook (extensibility plan Task 12).
- Running subscribers in parallel: the order between subscribers of different modules would be accidental, and two subscribers writing the same rows would race.
- Taking `organizationId` from the payload or letting the caller set it: one wrong argument would deliver another organization's event.
- Rethrowing a subscriber error: a reaction in a project module would fail a core command whose write already happened.
- Building the bus when the module is imported: with a subscriber that emits, the registry and the events module import each other, and the bus would read the registry before it is evaluated.
- Turning `auditSinks` into subscribers now: a separate step, to keep the audit redaction (D41) unchanged in this release.

## Consequences

- A subscriber filters every query by `event.organizationId`; the tenant-scope guard (D51) still applies. In service mode it runs as part of an operation the superadmin already confirmed and asks nothing.
- Delivery is in-process and best effort: no queue, no retry, nothing durable (a `jobs` module would bring that). A slow subscriber slows the operation that emitted the event.
- Adding or removing `events.ts` or `subscribers.ts` needs `npm run wa -- generate`. The files are server-only: client files must not import them.
- Import cycle risk: `src/shared/lib/auth/index.ts` imports `emitEvent` and, through it, the registry (`@/modules.generated`), which imports every module's `subscribers.ts`. A subscriber (or anything it imports at the top level) that imports `@/shared/lib/auth` statically closes the cycle `auth → events → registry → subscriber → auth`, and one of them sees the other half-evaluated. A subscriber that needs `auth` imports it dynamically inside `run`, as `inviteUserCommand` does: `const { auth } = await import("@/shared/lib/auth")`.
- A cycle between subscribers is not an error at registration: it is cut at depth 8 and logged at run time.
- Spec §5.5 shows `event.userId`; the payload is under `event.payload` (`event.payload.userId`).

## Enforcement

- `src/shared/lib/events/__tests__/` (bus incl. deep freeze, strip-mode schemas and the depth cap; emit, core events, registry, two-organization integration test `event-isolation.integration.test.ts`), the emitter tests next to each emitter (`src/shared/lib/auth/__tests__/user-create-hooks.test.ts` and `invite-signup-scope.test.ts` for the invite marker incl. forged body fields and headers, `invite-user-command.test.ts` and `invite-user-command.integration.test.ts` for exactly `users.invited` on an admin invite), and the mutation gate (`src/shared/lib/events/` is `critical`).
- `src/__tests__/architecture/client-bundles-stay-server-free.test.ts`: a `"use client"` file importing `@/shared/lib/events` or `@/features/<x>/events`/`subscribers` fails.
- `packages/gato-cli/src/generate/__tests__/registry.test.ts` pins the generated lines.

## Sources

- Spec `docs/superpowers/specs/2026-11-22-extensibility-design.md` §5.5, decision 7A.
- Plan `docs/superpowers/plans/2026-11-23-extensibility.md`, Task 9 and its contract.
