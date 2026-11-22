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

**Rule**: After `npm install`, read the lockfile diff. Restore unrelated entries the installer rewrote (the `libc` fields), then check with `npm ci --dry-run`.

**Applies to**: `package-lock.json`, any dependency change.
