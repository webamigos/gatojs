---
title: 'A caret range like `^1.6.26` can already resolve to 1.7.x, so read the lockfile to learn which version actually runs'
areas: ['dependencies']
topics: ['npm', 'semver', 'lockfile', 'better-auth']
---

# A caret range like `^1.6.26` can already resolve to 1.7.x, so read the lockfile to learn which version actually runs

**In short**: `package.json` declared `better-auth` `^1.6.26`, but `package-lock.json` had resolved 1.7.13. The kit ran 1.7 while every document and plan said 1.6, and the “upgrade to 1.7” was really 1.7.13 → 1.7.27 plus raising the floor.

**Context**: The better-auth upgrade on 2026-11-22.

**Problem**:

- Changelog review starts from the wrong version, so changes between 1.6 and 1.7.13 look new and changes already in production look untested.
- Docs cite versions that were never installed.

**Rule**: Before planning an upgrade, read the resolved version: `node -p "require('./package-lock.json').packages['node_modules/<pkg>'].version"` or `npm ls <pkg>`. Review the changelog from that version, and raise the declared floor to what actually runs.

**Applies to**: `package.json`, `package-lock.json`, the `wa-upgrade-dependency` skill.
