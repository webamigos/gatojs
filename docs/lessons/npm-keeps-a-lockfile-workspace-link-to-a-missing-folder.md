---
title: 'npm keeps a workspace link from a copied lockfile even when the folder is gone, so a project lockfile must not list kit-only workspaces'
areas: ['dependencies', 'kit']
topics: ['npm', 'lockfile', 'workspaces', 'gato-cli', 'create']
---

# npm keeps a workspace link from a copied lockfile even when the folder is gone, so a project lockfile must not list kit-only workspaces

**In short**: `gato create` copied the GatoJS `package-lock.json` verbatim. It holds `"node_modules/gato-cli": {"resolved": "packages/gato-cli", "link": true}`, and `npm install` kept that link although `packages/gato-cli` is kit-only and missing in the project and `package.json` asked for `gato-cli@^0.2.1`. The result was a dangling symlink: `npx gato` said "could not determine executable to run".

**Context**: Hands-on QA of gato-cli 0.2.1 and create-gato-app 0.1.0 on 2026-11-23. The smoke test installed only the project created with `--cli-source`, where the `file:` spec forces npm to re-resolve, so CI never saw it.

**Problem**:

- npm trusts the lockfile's workspace link and does not check that the target folder exists.
- `npm ls gato-cli` reports `ELSPROBLEMS invalid`, but `npm install` exits 0.

**Rule**: A project lockfile never lists a kit-only workspace. `projectPackageLock` drops the workspace entries, their nested `node_modules` and their `node_modules/<name>` links. When you add a tool package, add it to `kitOnly`. The smoke test checks the lockfile of the project created without `--cli-source`. Test an install path with the default dependency spec, not only with a `file:` override.

**Applies to**: `packages/gato-cli/src/assemble/package-lock.ts`, `packages/create-gato-app/scripts/smoke-pack.sh`, `kit/kit.json` (`kitOnly`).
