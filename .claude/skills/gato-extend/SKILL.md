---
name: gato-extend
description: Change how GatoJS behaves in a project without editing Gato files - find the extension point in `EXTENSION_POINTS.md` (project config, nav item, slot, component handle, event, command hook, better-auth hook, permission, organization setup), and eject a file with a reason only when none fits. Use before editing a file owned by a GatoJS module, when the protect-gato-files hook warns, or when asked to change, hide, replace, disable, react to or block core behaviour. Triggers - "change the dashboard", "hide the menu item", "replace the invite dialog", "when a member is removed", "block deleting a file", "disable api keys", "zmień zachowanie rdzenia", "podmień komponent", "ukryj moduł".
---

# Extending GatoJS without editing Gato files

A Gato file has a content hash in `modules.*.files` of `.wa/kit.json`; every `npm run wa -- update` replaces it, so an edit there is lost or conflicts with a security fix. Change behaviour from project files through the keys in `EXTENSION_POINTS.md`: it is generated from each module's `src/features/<x>/extension-points.json`, checked against the code by `src/__tests__/architecture/extension-points-exist.test.ts`, and lists every key with its module, label and one line of description. A missing extension point is a GatoJS bug, not a reason to edit the file.

## 1. Pick the point

| I want to… | Point | Where |
| --- | --- | --- |
| switch off a module, change who sees it | module key | `enabled: false` or `access` under modules.&lt;key&gt; in src/gato.config.ts |
| reorder or hide a menu item | nav item | modules.&lt;module&gt;.nav in src/gato.config.ts |
| change who holds a permission | permission | modules.&lt;module&gt;.permissions in src/gato.config.ts; in code `can(context, key)`, never a role comparison |
| show my component on a core page (dashboard, header, account, users table) | slot | `defineContribution` in `src/features/<x>/slots.ts` (server slot) or `src/features/<x>/client-slots.ts` (client slot); hide or reorder other contributions under modules.&lt;owner&gt;.slots |
| replace a core component, or wrap it to change its props | component handle | `defineComponentOverride` in `src/features/<x>/components.ts`, or modules.&lt;module&gt;.components in src/gato.config.ts |
| do something after a core operation | event | `defineSubscribers` in `src/features/<x>/subscribers.ts`; runs after success, a failure is logged and does not undo the operation |
| stop a core command or change its input | command | a `before` hook in `src/features/<x>/command-hooks.ts` (`defineCommandHooks`): throw a domain error or return the changed input |
| stop or follow a better-auth endpoint (role change, member removal, accepted invitation) | better-auth path | a `before` or `after` hook in the module's `src/features/<x>/auth.ts` plugin |
| create data for every new organization | setup | `defineSetup` in `src/features/<x>/setup.ts` (idempotent); existing organizations: `npm run setup:organizations` |
| logo | branding | `branding.logo` in src/gato.config.ts |
| colours and fonts | seed file | `src/theme.css` (project-owned after `create`) |
| project rules for agents | companion file | `AGENTS.project.md` |

src/gato.config.ts is a project file (create it with `defineGatoConfig` from `src/shared/lib/modules/gato-config.ts`). It ships to the browser: plain data and lazy `import()` of client components only.

## 2. Rules

- Use only keys listed in `EXTENSION_POINTS.md`. A `stable` key changes only with a `kitFormat` bump and a release note naming the old and new key; an `experimental` key can change in any release, so cover your use of it with a test.
- Name everything you add after your module: contribution, override, hook and subscriber ids, your events, commands and permissions are `<your-module>.<name>`.
- A wrong key fails loudly: `npm run typecheck` rejects it in `defineGatoConfig`, importing the registry throws, and the architecture tests name it. Fix the key; never silence the check.
- Your module's own points (its nav ids, slots, handles, events, commands, permissions) go into `src/features/<x>/extension-points.json` with `stability` and a one-line `description`; then `npm run wa -- generate`. Never edit `EXTENSION_POINTS.md` or `src/extension-points.generated.ts` by hand.
- Server code (Prisma, `getOrgContext()`) stays out of `module.ts`, `slots.ts`, `client-slots.ts`, `components.ts` and src/gato.config.ts; it belongs in `subscribers.ts`, `command-hooks.ts`, `setup.ts` or `services/`.
- A subscriber, hook or setup that touches data filters by the organization it receives, like any other query.

## 3. None fits: eject and ask for a point

1. Check again: search `EXTENSION_POINTS.md` for the module, and read the module's docs on https://docs.gatojs.com.
2. Tell the user that no extension point covers the change and that ejecting makes the file theirs: `npm run wa -- update` then merges it three-way instead of replacing it.
3. With their agreement: `npm run wa -- eject <file> --reason "<what the project needs and why no point fits>"`, then make the smallest change. `npm run wa -- doctor --files` lists ejected and modified Gato files.
4. Draft an issue for `webamigos/gatojs`, titled `Extension point: <what>`: the behaviour the project needs, the ejected file and lines, the kind (slot, handle, event, command hook, config) and the key you would expect (`<module>.<name>`). Show the draft; file it only when the user says so.

Generated files (`src/modules.generated.ts`, `src/modules.client.generated.ts`, `src/extension-points.generated.ts`, `EXTENSION_POINTS.md`) and `wa:*` regions are never edited or ejected: change the manifest or the module files and run `npm run wa -- generate`.
