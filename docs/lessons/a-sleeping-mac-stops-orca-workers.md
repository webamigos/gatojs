---
title: 'A Mac that goes to sleep stops every local Orca worker; the screen turning off is harmless, system sleep is not'
areas: ['process']
topics: ['orca', 'agents', 'macos', 'sleep']
---

# A Mac that goes to sleep stops every local Orca worker; the screen turning off is harmless, system sleep is not

**In short**: Orca runs workers as local processes. With `pmset` `sleep 1`, the Mac slept a minute after the screen turned off, and every worker paused until it woke up.

**Context**: Overnight harness work on 2026-11-22: the power log showed `Entering Sleep state` at 01:11 while workers were running.

**Problem**:

- Nothing fails: the work just pauses, so it looks like a slow or stuck worker.
- After waking, a worker can hit an API error (`ENOTFOUND`) and then waits for a human to continue its chat.

**Rule**: Before leaving workers running unattended, plug in the charger and run `caffeinate -i -s -t <seconds>`, or enable “Prevent automatic sleeping on power adapter when the display is off” (System Settings → Battery → Options). Keep the lid open unless an external display is connected.

**Applies to**: Orca workers and any long local run (Stryker, e2e) left unattended.
