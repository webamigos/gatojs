---
title: '`packages/gato-cli` tests that touch git and the filesystem time out at 5 seconds when the machine is busy; rerun before debugging'
areas: ['testing']
topics: ['kit-cli', 'vitest', 'timeouts', 'load']
---

# `packages/gato-cli` tests that touch git and the filesystem time out at 5 seconds when the machine is busy; rerun before debugging

**In short**: `npm run verify --prefix packages/gato-cli` failed with 22, then 3 tests timing out at 5000 ms while the load average was about 40 (several workers running Stryker and builds). The third run passed 643/643. Unit tests in the app showed the same pattern with 2–4 random UI tests.

**Context**: Harness phase 1 and the Next.js upgrade, 2026-11-22.

**Problem**:

- Timeouts move between runs and files, so they look like real failures in whatever the task touched.
- An agent may raise timeouts or change tests to make them pass.

**Rule**: When different tests time out on each run and the load is high (`uptime`), rerun the failing files alone. A pass in isolation is evidence of load, not proof: a test can also fail only alongside others that share git or filesystem state. Report it as "likely load", do not change the tests or the timeout, and rerun the full suite at normal load before ruling out a regression.

**Applies to**: `packages/gato-cli` tests, `npm run verify`, parallel workers.
