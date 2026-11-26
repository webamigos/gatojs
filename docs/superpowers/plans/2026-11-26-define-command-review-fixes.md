# `defineCommand` security review fixes (extensibility Task 12 follow-up)

Findings of the independent security review of PR #122. Nothing blocked the merge; these close the gaps before it.
ADR-62 is updated for items 1, 2 and 4.

## 1. `runCommand` counts as a guard only when returned at the top level of the function

Files: `scripts/lib/architecture/module-entry-points.ts` (`isReturnedDirectly`), `src/__tests__/server-entrypoints-guard.test.ts`
(`isReturnedDirectly`, `isReturnedCommandRun`).

`runCommand` counts (module-enabled guard; session guard; service-mode confirmation) only when its `return` (optionally
`return await`) is a statement directly in the body block of the analyzed function, or it is the concise body of the
analyzed arrow function. A return nested in an `if`, a block, `try`, a loop, a `switch` or an inner function does not count.

### Behaviors

| Fixture (exported server action with `(input, confirmation)`) | module-entry-points check | server-entrypoints guard | service-mode rule |
| --- | --- | --- | --- |
| `if (input.soft) return runCommand(cmd, input, confirmation); return prisma.invoice.deleteMany({});` | reported | reported | reported |
| `if (input.soft) { return runCommand(cmd, input, confirmation); } return prisma.invoice.deleteMany({});` | reported | reported | reported |
| `try { return runCommand(cmd, input, confirmation); } finally { await prisma.invoice.deleteMany({}); }` | reported | reported | reported |
| `const later = () => runCommand(cmd, input, confirmation); await prisma.invoice.deleteMany({}); return later();` | reported | reported | reported |
| `return runCommand(cmd, input, confirmation);` (top level) | passes | passes | passes |
| `return await runCommand(cmd, input, confirmation);` (top level) | passes | passes | passes |
| `async (input, confirmation) => runCommand(cmd, input, confirmation)` (concise body) | passes | passes | passes |

### Mutations to kill

- `isReturnedDirectly` accepting any `ReturnStatement` parent (the old rule).
- Dropping the "body of the analyzed function" check (accepting a return in a nested function's body).
- Dropping the concise-arrow-body branch.

## 2. `organizationScoped` marks under wrappers are followed or rejected

File: `src/shared/lib/commands/define-command.ts` (`isMarked`, `organizationScopedKeys`, `defineCommand`).

`organizationScopedKeys` follows a top-level field's schema through: `innerType` wrappers (`optional`, `nullable`, `default`,
`catch`, `readonly`, `nonoptional`, `prefault`), pipes (`.pipe()` and `.transform()`: both `def.in` and `def.out`),
unions and discriminated unions (every option), intersections (both sides) and `z.lazy` (its getter, cycle-safe).
A field with a mark anywhere on those paths is organization-scoped.

`defineCommand` throws `CommandError` with the message `organizationScoped mark is not reachable: <field>` when a
top-level field's schema contains an `organizationScoped: true` mark that those paths do not reach (for example inside
`z.array(...)`, a nested `z.object(...)`, `z.record(...)`, `z.tuple(...)`). A mark is never silently ignored; that includes a mark on a check (`z.string().check(z.custom(() => true).meta({ organizationScoped: true }))`).
Schemas whose definition holds plain data (`z.literal("a")`, `z.enum(["a", "b"])`) are accepted.

### Behaviors

- `organizationScopedKeys(z.object({ teamId: <field> }))` → `["teamId"]` for each field:
  - `z.string().meta({ organizationScoped: true }).transform((value) => value)`
  - `z.string().meta({ organizationScoped: true }).pipe(z.string())`
  - `z.string().pipe(z.string().meta({ organizationScoped: true }))`
  - `z.union([z.string().meta({ organizationScoped: true }), z.null()])`
  - `z.lazy(() => z.string().meta({ organizationScoped: true }))`
  - `z.intersection(z.string(), z.string().meta({ organizationScoped: true }))`
  - `z.string().meta({ organizationScoped: true }).catch("x")`, `.readonly()`
  - combinations: `z.lazy(() => z.union([z.string().meta({ organizationScoped: true }), z.null()])).optional()`
- Unmarked wrappers stay out: `z.string().transform((value) => value)`, `z.union([z.string(), z.null()])`,
  `z.lazy(() => z.string())` → `[]`.
- A recursive `z.lazy` without a mark does not loop.
- `defineCommand({ ..., input: z.object({ ids: z.array(z.string().meta({ organizationScoped: true })) }) })` throws
  `organizationScoped mark is not reachable: ids`; same for `z.object({ nested: z.object({ teamId: marked }) })`
  (`nested`), `z.record(z.string(), marked)`, `z.tuple([marked])`.
- `runCommand` with each followed wrapper (transform, pipe, union with null, lazy): input with the field set to another
  organization's id → `{ success: false, error: failureMessage }` and `run` is not called; set to the context's
  `organizationId` → `run` is called.

### Mutations to kill

- Not following `def.in` or `def.out` of a pipe; not following union options; not following the lazy getter; not following
  intersection sides.
- Removing the "not reachable" check in `defineCommand`, or making it ignore one container kind.
- Infinite recursion on a recursive lazy schema (a missing visited set).

## 3. A hook cannot use a swapped id to bypass the uploader rule

Files: tests only (`src/features/uploads/services/commands/__tests__/upload-commands.test.ts`,
`src/features/uploads/services/__tests__/delete-upload-hooks.integration.test.ts`).

### Behaviors

- A `member` without `uploads.delete-others` deletes their own upload id; a `before` hook on `uploads.delete` swaps the id to
  an upload of another member of the same organization → `{ success: false, error: "Brak uprawnień do usunięcia pliku" }`;
  both uploads (rows and stored objects) remain, no audit entry, no `uploads.deleted` event.

### Mutations to kill

- `run` checking the uploader against the pre-hook input instead of the record it loaded.
- Removing the `uploadedById === context.userId` rule.

## 4. The command object is tied to its module and its key

File: `src/shared/lib/commands/run-command.ts`.

Before any other step (before `requireModuleEnabled`):

- the command's `key` must start with `"<module>."` and have something after the dot; otherwise `CommandError`
  `command key <key> is not owned by module <module>` (the caller gets `failureMessage`, `run` is not called). This catches
  an object built or spread without `defineCommand`, for example `{ ...defineCommand({ key: "probe.borrowed", module: "probe", ... }), module: "zeta" }`
  where module `zeta` declares `probe.borrowed`.
- the first command object run for a key is remembered for the process; a different object for the same key fails with
  `CommandError` `two command objects registered for <key>` (`failureMessage`, `run` of the second object not called), and
  the first object keeps working. The same object run again passes. When `NODE_ENV` is `development` the newest object
  replaces the remembered one and runs (a dev-server reload re-evaluates command files and creates new objects).

### Behaviors

- Forged module (above) → `{ success: false, error: FAILURE }`, `run` not called, `requireModuleEnabled`/session guard not reached.
- Key `"probe."` with module `"probe"` built by hand → failure, `run` not called.
- Two `defineCommand` objects with key `probe.delete`: the first runs; the second → failure, its `run` not called;
  the first runs again afterwards.
- `vi.stubEnv("NODE_ENV", "development")`: the second object runs, and the first one runs again afterwards.

### Mutations to kill

- Removing the prefix check; comparing only `startsWith(module)` without the dot; accepting an empty name after the dot.
- Removing the duplicate check; comparing keys instead of object identity; replacing the remembered object outside development.

Existing `run-command.test.ts` tests create a fresh `probeCommand()` per test with shared keys; they need one object per key
per module instance (for example `vi.resetModules()` and a fresh import, or distinct keys declared in the mock).
