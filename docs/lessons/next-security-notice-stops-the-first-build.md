---
title: '`next build` on Next.js 16.4.3 stops once with `SecurityFatalError`; the retry passes, and the fix is an upgrade'
areas: ['ci']
topics: ['nextjs', 'build', 'security', 'e2e']
---

# `next build` on Next.js 16.4.3 stops once with `SecurityFatalError`; the retry passes, and the fix is an upgrade

**In short**: With Next.js 16.4.3, `next build` (inside `npm run verify` and `npm run test:e2e`) sometimes exits with `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability`. It is an upgrade notice, not a build error: running the same command again continues. A red gate from this message is not a regression in the change under test.

**Context**: Harness phase 1 (2026-11-21/22). Three parallel workers and the integration run all hit it in `npm run verify` and `npm run test:e2e`.

**Problem**:

- The first build in a session stops with the notice; the retry passes.
- An agent that reads the red gate as its own failure starts fixing unrelated code.
- The notice also asks the agent to offer an upgrade; doing it inside an unrelated task mixes a dependency bump into the change.

**Rule**: Retry the command once. If it passes, report the notice and keep going; do not bump Next.js inside the task. The real fix is a separate upgrade (`wa-upgrade-dependency` skill) with `verify`, integration and e2e.

**Applies to**: `next build`, `npm run verify`, `npm run test:e2e`, the `assemble` job.
