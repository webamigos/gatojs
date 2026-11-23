---
title: 'The pinned npm rewrites unrelated lockfile entries (it drops `libc` from `@next/swc-linux-*`); restore them to keep the diff about your change'
areas: ['dependencies']
topics: ['npm', 'lockfile', 'nextjs']
---

# The pinned npm rewrites unrelated lockfile entries (it drops `libc` from `@next/swc-linux-*`); restore them to keep the diff about your change

**In short**: `npm install` with the pinned npm@11.21.1 removed the `libc` fields from four `@next/swc-linux-*` entries in `package-lock.json`, although the task only changed better-auth.

**Context**: The better-auth upgrade on 2026-11-22.

**Problem**:

- The lockfile diff mixes the real change with unrelated churn, which hides what the upgrade touched.
- Removing `libc` can change which native binary Linux CI picks.

**Also**: on 2026-11-22 (Task 6 of the packages plan) `npm version 0.2.0 --no-git-tag-version` inside
`packages/gato-cli`, run with the machine's npm instead of the pinned one, rewrote `"devOptional": true` to
`"dev": true` across the root lockfile. Run every npm command that writes the lockfile (`install`, `version`,
`uninstall`) through the pinned npm (`npx -y npm@11.21.1 …`); if it already happened, revert the lockfile and redo
the change with the pinned npm.

**Rule**: After `npm install`, read the lockfile diff. Restore unrelated entries the installer rewrote (the `libc` fields), then check with `npm ci --dry-run`.

**Applies to**: `package-lock.json`, any dependency change.
