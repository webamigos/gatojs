---
title: '`smtp://localhost` takes about 17 seconds per mail on macOS, so an e2e step that sends mail times out; use `127.0.0.1`'
areas: ['testing']
topics: ['e2e', 'mail', 'mailpit', 'macos', 'ipv6']
---

# `smtp://localhost` takes about 17 seconds per mail on macOS, so an e2e step that sends mail times out; use `127.0.0.1`

**In short**: On a Mac, nodemailer with `SMTP_URL=smtp://localhost:<port>` took about 17 s to send one mail to mailpit; `smtp://127.0.0.1:<port>` took 0.4 s. The e2e test that invites a user waits 5 s, so it failed every time, although the invitation, the user and the audit log were in the database.

**Context**: Harness phase 1, task 2: `npm run test:e2e` run locally against a worker's own mailpit container.

**Problem**:

- `localhost` resolves to `::1` first, while the mailpit port is published on IPv4, so each connection waits for the IPv6 attempt to fail (inferred from the timings).
- The failure looks like a broken invite flow, not like an environment problem.

**Rule**: Locally, point e2e at `127.0.0.1`: `SMTP_URL=smtp://127.0.0.1:<smtp port> MAILPIT_URL=http://127.0.0.1:<ui port>`. Before blaming the code for a mail timeout, time one send.

**Applies to**: `e2e/env.ts`, local e2e runs, any test that sends mail through mailpit.
