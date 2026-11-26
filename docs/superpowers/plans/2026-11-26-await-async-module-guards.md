# Module entry point detector: async guards must be awaited

Branch `feat/require-module-enabled` (PR #112). Production file: `scripts/lib/architecture/module-entry-points.ts`.
Tests: `src/__tests__/architecture/module-entry-points-check-enabled.test.ts`.

## Problem

The detector counts a guard call as a guard whether or not its promise is awaited. `requireModuleAccess` is `async`,
and a local `async` helper turns even a synchronous `requireModuleEnabled` into a rejected promise. Without `await`
the rejection is lost and the code after it (Prisma) runs for a disabled module.

```ts
export async function wipe() { requireModuleAccess("billing"); await prisma.invoice.deleteMany({}); }

async function check() { requireModuleEnabled("billing"); }
export async function wipe() { check(); await prisma.invoice.deleteMany({}); }
```

Both pass today and must be reported.

A second, smaller gap: Prisma on the guard's failure path runs exactly when the module is disabled, yet it comes
after the guard in source order, so it passes today:

```ts
if (!isModuleEnabled("billing")) { await prisma.invoice.deleteMany({}); return new Response(null, { status: 404 }); }
try { requireModuleEnabled("billing"); } catch (error) { await prisma.invoice.deleteMany({}); throw error; }
```

## Rules after the change

1. A call of `requireModuleAccess` (async guard) counts as a guard only when the call is the direct operand of
   `await`: `await requireModuleAccess("billing")`, `const c = await requireModuleAccess("billing")`,
   `return await requireModuleAccess("billing")`.
2. A call of a local helper declared `async` (function declaration, arrow function or function expression) whose
   first event is a guard counts as a guard only when the call is the direct operand of `await`.
3. `return x(...)` without `await` does not count, not even in an `async` function: the rule stays syntactic and
   does not reason about `finally` blocks or about whether the caller awaits.
4. `requireModuleEnabled`, `isModuleEnabled` and synchronous local helpers keep counting without `await`.
5. An unawaited call that is not a guard is ignored (the scan goes on); an `async` helper whose first event is
   Prisma still counts as Prisma, awaited or not.
6. Prisma (directly, or through a local helper) on the guard's failure path counts as Prisma before the guard:
   - in the `then` branch of the early-exit `if (!isModuleEnabled(k))`;
   - in the `catch` block of a `try` whose `try` block contains the guard;
   - in the `finally` block of a `try` whose `try` or `catch` block contains the guard.
   Nested functions in those blocks are skipped, as everywhere else. Prisma in the `else` branch or in a `try`
   that does not enclose the guard does not count.

## Behaviours

Fixture paths: `BILLING_ROUTE` = `src/app/api/billing/route.ts` (owner `billing`), `BILLING_COMMAND` =
`src/features/billing/services/commands/a.ts` (`"use server"`). "Reported" = `findUnguardedModuleEntryPoints(root, NONE)`
returns exactly the listed id; "accepted" = `[]`.

### Awaiting `requireModuleAccess`

| # | Body of the exported function | Expected |
| --- | --- | --- |
| 1 | server action `wipe`: `requireModuleAccess("billing"); await prisma.invoice.deleteMany({});` | `["src/features/billing/services/commands/a.ts#wipe"]` |
| 2 | GET: `requireModuleAccess("billing");` (no Prisma) | `["src/app/api/billing/route.ts#GET"]` |
| 3 | GET: `void requireModuleAccess("billing");` | reported |
| 4 | GET: `await requireModuleAccess("billing").catch(() => null);` | reported |
| 5 | GET: `const pending = requireModuleAccess("billing");\n await pending;` | reported |
| 6 | GET: `await Promise.all([requireModuleAccess("billing"), prisma.invoice.findMany()]);` | reported |
| 7 | GET: `return requireModuleAccess("billing");` | reported |
| 8 | GET: `const context = await requireModuleAccess("billing");` then Prisma | accepted |
| 9 | GET: `return await requireModuleAccess("billing");` | accepted |
| 10 | GET: `await requireModuleEnabled("billing");` then Prisma | accepted |

### Awaiting async local helpers

| # | File | Expected |
| --- | --- | --- |
| 11 | `async function check() { requireModuleEnabled("billing"); }` + server action `wipe`: `check(); await prisma.invoice.deleteMany({});` | `["src/features/billing/services/commands/a.ts#wipe"]` |
| 12 | same as 11 with `await check();` | accepted |
| 13 | `const check = async () => { requireModuleEnabled("billing"); };` + GET `check();` | reported |
| 14 | same as 13 with `await check();` | accepted |
| 15 | `const check = async function () { requireModuleEnabled("billing"); };` + GET `check();` | reported |
| 16 | `async function check() { await requireModuleAccess("billing"); }` + GET `check();` | reported |
| 17 | same as 16 with `await check();` | accepted |
| 18 | `async function check() { requireModuleAccess("billing"); }` + GET `await check();` | reported |
| 19 | `function check() { return requireModuleAccess("billing"); }` + GET `await check();` | reported |
| 20 | `function inner() { requireModuleEnabled("billing"); }` + `async function outer() { inner(); }` + GET `outer();` | reported |
| 21 | same as 20 with `await outer();` | accepted |
| 22 | `async function inner() { requireModuleEnabled("billing"); }` + `function outer() { inner(); }` + GET `outer();` | reported |
| 23 | `async function check() { requireModuleEnabled("billing"); }` + GET `return check();` | reported |
| 24 | `async function check() { requireModuleEnabled("billing"); }` + GET `void check();` | reported |
| 25 | `async function check() { requireModuleEnabled("billing"); }` + server action `try { await check(); } catch {}` | reported |
| 26 | `async function load() { return prisma.invoice.findMany(); }` + GET `load();\n requireModuleEnabled("billing");` | reported |
| 27 | `function check() { requireModuleEnabled("billing"); }` + GET `check();` then Prisma (sync helper, no await) | accepted |

### Prisma on the guard's failure path

| # | Body | Expected |
| --- | --- | --- |
| 28 | GET: `if (!isModuleEnabled("billing")) { await prisma.invoice.deleteMany({}); return new Response(null, { status: 404 }); }` | reported |
| 29 | GET: same `if`, `then` branch calls a local `async function wipe() { await prisma.invoice.deleteMany({}); }` as `await wipe();` before `return` | reported |
| 30 | GET: `if (!isModuleEnabled("billing")) { return new Response(null, { status: 404 }); } else { await prisma.invoice.findMany(); }` | accepted |
| 31 | server action: `try { requireModuleEnabled("billing"); } catch (error) { await prisma.invoice.deleteMany({}); throw error; }` | reported |
| 32 | server action: `try { requireModuleEnabled("billing"); } catch (error) { await prisma.invoice.deleteMany({}); return handleCommandError(error, "x"); }` | reported |
| 33 | server action: catch calls a local helper touching Prisma, then `throw error;` | reported |
| 34 | server action: `try { requireModuleEnabled("billing"); } finally { await prisma.invoice.deleteMany({}); }` | reported |
| 35 | server action: `try { JSON.parse("{}"); } catch (error) { requireModuleEnabled("billing"); throw error; } finally { await prisma.invoice.deleteMany({}); }` (guard in `catch`, Prisma in `finally`) | reported |
| 36 | server action: outer `try { try { requireModuleEnabled("billing"); } catch (error) { throw error; } } catch (error) { await prisma.invoice.deleteMany({}); throw error; }` | reported |
| 37 | server action: `requireModuleEnabled("billing");` then `try { await prisma.invoice.findMany(); } catch (error) { await prisma.invoice.deleteMany({}); throw error; }` | accepted |
| 38 | server action: catch contains `const later = () => prisma.invoice.deleteMany({});` then `throw error;` | accepted |
| 39 | `function check() { try { requireModuleEnabled("billing"); } catch (error) { prisma.invoice.deleteMany({}); throw error; } }` + server action `check();` | reported |
| 40 | catch calls helpers `a`/`b` that call each other without Prisma, then `throw error;` | accepted, and the call terminates |
| 41 | `try { requireModuleEnabled("billing"); } catch (error) { throw error; }` then Prisma after the try (existing shape) | accepted |

### Repository

| # | Call | Expected |
| --- | --- | --- |
| 42 | `findUnguardedModuleEntryPoints(repoRoot, ALLOWED)` | `[]` (existing test) |

## Mutations to kill

- `requireModuleAccess` counts without `await` (await check removed or always true).
- The await check accepts any `await` ancestor instead of the direct parent (kills: 4, 6).
- `return x(...)` is treated like `await x(...)` (kills: 7, 19, 23).
- The await requirement applies to every guard (kills: existing sync tests, 27).
- The await requirement is dropped for async helpers (kills: 11, 13, 15, 16, 20).
- The await requirement applies to sync helpers too (kills: 27, existing "accepts a GET that calls a guarding local helper before Prisma").
- Async detection only for function declarations, not arrow functions or function expressions (kills: 13, 15).
- An unawaited guard is turned into Prisma or stops the scan instead of being skipped (kills: 2 vs. accepted variants).
- The `then`-branch check removed (kills: 28, 29); applied to the `else` branch (kills: 30).
- The `catch` check removed (kills: 31, 32, 33, 36); applied to a `try` that does not enclose the guard (kills: 37).
- The `finally` check removed (kills: 34, 35).
- Failure-path scan does not follow local helpers (kills: 29, 33).
- Failure-path scan enters nested functions (kills: 38).
- Recursion guard removed in the failure-path scan (kills: 40, by hanging).

## Docs

Update the limits list ("Analiza jest składniowa…") and the "Poprawne wywołanie guardu" list in
`docs/06-wzorce-kodu.md` (Polish).
