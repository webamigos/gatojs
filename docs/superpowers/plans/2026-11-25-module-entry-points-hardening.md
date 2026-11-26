# Extensibility Task 6 follow-up: harden the module entry point detector (task plan)

Parent: [2026-11-25-require-module-enabled.md](2026-11-25-require-module-enabled.md). An independent security review
found the runtime guards correct but `scripts/lib/architecture/module-entry-points.ts` too easy to bypass. This file is
the `gato-task` step 1 plan: signatures, behaviours with literal expectations, mutations to kill.

## Files and signatures

- `scripts/lib/architecture/module-entry-points.ts` (`core`):
  - `export const MODULE_GUARDS: readonly string[] = ["requireModuleAccess", "requireModuleEnabled", "isModuleEnabled"]`
    (`runCommand` removed; Task 12 adds it back with its import path).
  - `export const MODULE_GUARD_SOURCES: Readonly<Record<string, string>>`:
    `requireModuleAccess` → `"@/shared/lib/auth/require-module-access"`,
    `requireModuleEnabled` → `"@/shared/lib/modules/require-module-enabled"`,
    `isModuleEnabled` → `"@/shared/lib/modules/require-module-enabled"`.
  - `findModuleEntryPoints(root)`, `findUnguardedModuleEntryPoints(root, allowed)`, `findStaleAllowances(root, allowed)`:
    signatures unchanged, output `<repo path>#<export name>`, sorted.
- `scripts/kit/manifest-deps.ts` (`core`): `globToRegExp` becomes an export (reused for module ownership).
- `src/__tests__/architecture/module-entry-points-check-enabled.test.ts` (`core`): fixtures below; allow-map reasons
  reworded (impersonation is logged with `logger.info`, not audited; disabling `users` does not disable the better-auth
  admin plugin endpoints under `/api/auth/*`, which only global admins can call).
- `docs/06-wzorce-kodu.md` (Polish): the rules below and the detector's remaining known limitations.

## Rules

### Owning module

- `src/features/<x>/…` → `<x>`.
- Any other path → the module whose `manifest.files` glob in `<root>/.wa/kit.json` matches it (`modules.<key>` and
  `projectModules.<key>`, the key is the module name), ignoring `core`. Globs: `**` any depth, `*` one segment,
  everything else literal (`[locale]` and `(app)` are literal). No `.wa/kit.json` or no non-`core` match → no owner.

### Scanned files and entry points

- `src/app/**/route.ts(x)`: exported HTTP methods (`GET`, `HEAD`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`) and
  `export * from "…"` as the name `*`.
- `src/app/**/*.ts(x)` (not a route file) whose first statement is `"use server"`: every export (including `*`).
- `src/features/<x>/**/*.ts(x)` with `"use server"` first, except `auth` and `organizations`: every export.
- `src/shared/**/*.ts(x)` with `"use server"` first and a non-`core` owner: every export.
- Test files (`*.test.ts(x)`, `__tests__/`) are skipped everywhere, as before.

### Guarded

An entry point is guarded when its first event (by source position) in its body is a valid guard event.

- Events are collected in the body without entering nested functions (arrow functions, function expressions, function
  declarations, methods inside the body): a guard or Prisma use there does not count.
- Prisma event: an identifier `prisma` or a local name imported from `@/shared/lib/prisma`.
- A call to a local top-level function contributes, at the call position, the first event of that function's body
  (computed with the same rules in "helper" mode, cycle-safe).
- Guard identifier: a named import (alias allowed) of a `MODULE_GUARDS` name from its `MODULE_GUARD_SOURCES` path only.
- Guard argument: the first argument is a string literal equal to the owning module, or an identifier naming a
  top-level `const` initialised with such a string literal. No owner → no argument is valid.
- `requireModuleEnabled(key)` / `requireModuleAccess(key)`: any call position.
- `isModuleEnabled(key)`: only as `if (!isModuleEnabled(key)) <exit>`, where the `if` condition is exactly the `!`
  call and `<exit>` is a `return`/`throw` statement or a block whose last statement is one. In helper mode only `throw`
  counts (a `return` leaves the helper, not the entry point).
- A guard event inside the `try` block of a `try … catch` (any enclosing `try` within the same function) is dropped
  unless the catch block's last statement is a `throw` or `return handleCommandError(…)`, with `handleCommandError`
  imported (alias allowed) from `@/shared/utils/error-handling`. A `try … finally` without `catch` does not drop it.

## Behaviours

Fixture `.wa/kit.json` (written in fixtures that need an `src/app` or `src/shared` owner):

```json
{
  "modules": {
    "core": { "manifest": { "name": "core", "files": ["src/app/*", "src/app/api/auth/**", "src/shared/**"] } },
    "billing": {
      "manifest": {
        "name": "billing",
        "files": ["src/features/billing/**", "src/app/api/billing/**", "src/app/[locale]/(app)/billing/**",
                  "src/shared/lib/billing/**"]
      }
    }
  },
  "projectModules": {
    "reports": { "manifest": { "name": "reports", "files": ["src/features/reports/**", "src/app/api/reports/**"] } }
  }
}
```

`R = src/app/api/billing/route.ts`, `C = src/features/billing/services/commands/a.ts`,
`A = src/app/[locale]/(app)/billing/actions.ts`. Imports: `E` = `import { requireModuleEnabled } from
"@/shared/lib/modules/require-module-enabled";`, `I` = `isModuleEnabled` from the same path, `M` =
`import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";`, `H` =
`import { handleCommandError } from "@/shared/utils/error-handling";`, `P` = `import { prisma } from "@/shared/lib/prisma";`.

1. `MODULE_GUARDS` → `["requireModuleAccess", "requireModuleEnabled", "isModuleEnabled"]`; `MODULE_GUARD_SOURCES` →
   the three literal pairs above.
2. `R` = `export * from "./handlers";` → `findModuleEntryPoints` and unguarded `["src/app/api/billing/route.ts#*"]`.
   Same in `C` with `"use server"` → `["src/features/billing/services/commands/a.ts#*"]`.
3. Ordering: `R` with `P`, `E`, `GET() { await prisma.x.findMany(); requireModuleEnabled("billing"); … }` → `[R#GET]`.
   Through a local helper that touches Prisma first, then the guard → `[R#GET]`. Guard first, Prisma after → `[]`.
   A helper whose first event is the guard, called before Prisma → `[]`.
4. Module argument: `requireModuleEnabled("auth")` in `C` → `[C#doIt]`; `requireModuleEnabled("billing")` in `C` → `[]`;
   `requireModuleAccess("users")` in `R` → `[R#GET]`; `requireModuleAccess("billing")` in `R` → `[]`; an argument that
   is a variable (`requireModuleEnabled(key)` with a parameter `key`) → reported; `const MODULE_KEY = "billing"` +
   `requireModuleEnabled(MODULE_KEY)` → `[]`; `let MODULE_KEY = "billing"` → reported; `const MODULE_KEY = "auth"` →
   reported; no argument → reported; a template literal → reported.
   Owner from `.wa/kit.json`: `src/app/api/reports/route.ts` guarded with `"reports"` → `[]` (projectModules);
   with `"billing"` → reported. A route with no owner (`src/app/api/other/route.ts`, guarded with `"other"`) →
   reported. Without `.wa/kit.json`, `R` guarded with `"billing"` → reported. A route under `src/app/api/auth/` (core) →
   reported whatever the key. The `[locale]`/`(app)` segments match literally: `A` guarded with `"billing"` → `[]`.
5. `isModuleEnabled`: `isModuleEnabled("billing");` as a statement → `[R#GET]`; `await isModuleEnabled("billing")` →
   reported; `const on = isModuleEnabled("billing"); if (!on) return …` → reported;
   `if (!isModuleEnabled("billing")) { return new Response(null, { status: 404 }); }` → `[]`;
   `if (!isModuleEnabled("billing")) return new Response(null);` (no block) → `[]`;
   `if (!isModuleEnabled("billing")) { throw new Error("off"); }` → `[]`;
   `if (isModuleEnabled("billing")) { return … }` (no `!`) → reported;
   `if (!isModuleEnabled("billing")) { console.log("off"); }` → reported;
   `if (!isModuleEnabled("billing")) { return …; } ` where the block has a `return` that is not the last statement
   (`{ if (x) { return a; } log(); }`) → reported;
   `if (!isModuleEnabled("billing") || x) return …` → reported; an empty block → reported.
   Helper mode: `function check() { if (!isModuleEnabled("billing")) { return new Response(null); } }` called by `GET`
   → reported; the same helper with `throw new Error("off")` → `[]`.
6. Nested functions: `GET() { const later = () => requireModuleEnabled("billing"); return new Response("ok"); }` →
   reported; guard inside `function inner() { … }` declared in the body → reported; inside `[1].forEach(() => …)` →
   reported; inside a class method inside the body → reported. Prisma inside a nested callback before the guard does not
   make the entry point unguarded (`const load = () => prisma.x.findMany(); requireModuleEnabled("billing");` → `[]`).
7. `try`/`catch`: `try { requireModuleEnabled("billing"); } catch {}` → reported;
   `catch (error) { return { success: false }; }` → reported;
   `catch (error) { throw error; }` → `[]`; `catch (error) { log(error); throw error; }` → `[]`;
   `catch (error) { return handleCommandError(error, "x"); }` with `H` → `[]`; with `H` aliased
   (`import { handleCommandError as handle } …`, `return handle(error, "x")`) → `[]`;
   `handleCommandError` imported from another path → reported; a local function named `handleCommandError` → reported;
   `catch (error) { handleCommandError(error, "x"); }` (not returned) → reported;
   `catch (error) { if (x) { throw error; } return { success: false }; }` → reported (last statement decides);
   `try { requireModuleEnabled("billing"); } finally { log(); }` → `[]`;
   guard before the `try` with a swallowing catch → `[]`;
   guard in an inner `try` with `throw` inside an outer `try` with a swallowing catch → reported;
   guard in a local helper called inside a swallowing `try` → reported;
   guard inside the `catch` block of a swallowing `try` is not covered (no behaviour).
8. Import path: `import { requireModuleEnabled } from "@/shared/lib/other";` + call → reported;
   `requireModuleAccess` imported from `@/shared/lib/modules/require-module-enabled` → reported;
   `isModuleEnabled` from `@/shared/lib/auth/require-module-access` → reported; `runCommand` from
   `@/shared/lib/run-command` called with `"billing"` → reported.
9. Scanning: `A` with `"use server"` and an unguarded export → `findModuleEntryPoints` `[A#doIt]`, unguarded `[A#doIt]`;
   `A` without the directive → `[]`; `src/app/x/actions.ts` (`"use server"`, no owner) → entry point and reported;
   `src/app/x/__tests__/a.ts` and `src/app/x/a.test.ts` → skipped;
   `src/shared/lib/billing/actions.ts` with `"use server"` (owner `billing`) → `[…#doIt]`, guarded with `"billing"` →
   `[]`; `src/shared/lib/actions.ts` (owner `core`) → not scanned (`[]`); a route file under `src/app` with
   `"use server"` keeps the HTTP-method filter (`export async function helper` is not an entry point).
10. Repository: `findUnguardedModuleEntryPoints(repoRoot, ALLOWED)` → `[]`; `findStaleAllowances` → `[]`;
    the entry points include `src/app/api/v1/organization/route.ts#GET`,
    `src/features/uploads/services/commands/upload-commands.ts#deleteUploadCommand` and
    `src/features/users/services/commands/invite-user-command.ts#inviteUserCommand`.

Existing fixtures keep their meaning; ones that guard `src/app/api/billing/route.ts` write the fixture `.wa/kit.json`
and use the key `"billing"`; `isModuleEnabled` fixtures use the `if (!…) return` form; the `runCommand` cases become
negative ones.

## Mutations to kill

- `export *` not turned into `#*`, or `*` filtered out of route files.
- Prisma event dropped, or the order check inverted (guard anywhere counts).
- Helper's first event ignored or taken as "any guard in helper".
- Module argument check removed; literal compared with something else (file path, any non-empty string); `const` resolution
  accepting `let`; owner lookup returning `core`; glob `*` crossing `/`; brackets read as a class.
- `isModuleEnabled` accepted in any position; `!` not required; non-exit then-branch accepted; `return` accepted in
  helper mode; "last statement" changed to "any statement".
- Nested functions entered.
- `try` check removed; `catch` with no statements treated as propagating; `handleCommandError` accepted from any path or
  without `return`; `finally`-only `try` treated as swallowing; only the innermost `try` checked.
- Import path check removed or a guard accepted from the other guard's path; `runCommand` still accepted.
- `"use server"` files under `src/app` or owned `src/shared` not scanned; `core`-owned `src/shared` files scanned;
  test files under `src/app` scanned.

## Behaviours added after the mutation review

`F` = `findUnguardedModuleEntryPoints(root, NONE)` with the fixture `.wa/kit.json` unless noted.

11. `prisma` counts as an identifier even when imported from another path (`"../../../shared/lib/prisma"`): Prisma
    before the guard in `R` → `[R#GET]`.
12. Only `src/features/<x>/` at the start of the path names the owner: `src/app/api/x/src/features/billing/route.ts`
    guarded with `"billing"` → reported.
13. Only a file named `route.ts(x)` gets the HTTP-method filter: `src/app/api/billing/route.ts.actions.ts` with
    `"use server"` and an unguarded `doIt` → `[…route.ts.actions.ts#doIt]`.
14. A file with no owner and a key that resolves to nothing (`requireModuleEnabled(moduleKey)` with a parameter, or no
    argument) in `src/app/x/actions.ts` → `[src/app/x/actions.ts#doIt]`.
15. `if (+isModuleEnabled("billing")) { return … }` (a prefix operator other than `!`) → `[R#GET]`.
16. Only `handleCommandError` from `@/shared/utils/error-handling` counts: `return logCommandError(error)` with
    `logCommandError` imported from that path → `[R#GET]`.
17. An empty `"use server"`-less feature file (`""`) → `[]`, no throw.
18. `declare const MODULE_KEY: string;` and `const MODULE_KEY = billing;` (an identifier, not a literal) as the key →
    reported.
19. `export * as tools from "./tools";` in a `"use server"` file is an entry point named `tools` with no body: reported
    (`[C#tools]`); in a route file the name is filtered like any other non-method name.
20. `catch { return; }` swallows → `[R#GET]`.
21. A `.wa/kit.json` module entry without `manifest` (`legacy: {}`) is ignored: `R` guarded with `"billing"` → `[]`, no
    throw.
22. `export type Input = { id: string };` in a `"use server"` file is not an entry point.
