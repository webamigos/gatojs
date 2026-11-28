---
title: A server-side `auth.api` call drops better-auth's `Set-Cookie`, so the 5-minute cookie cache keeps serving the old user; forward the cookies from `returnHeaders`
areas: [architecture]
topics: [better-auth, cookies, session, server-actions]
---

**In short**: the kit's better-auth has no `nextCookies` plugin, so `auth.api.updateUser` (or any endpoint that refreshes the session) called from a server action writes the database but never sets the refreshed `session_data` cookie. `session.cookieCache` (5 minutes) then serves the old user to `getSession`, and the layout shows stale data even after `router.refresh()` or a reload. Call the endpoint with `returnHeaders: true` and pass the headers to `forwardAuthCookies` (`src/features/account/services/forward-auth-cookies.ts`).

## Context

The account page got a name form backed by `updateAccountNameCommand`. Tests passed; the after-screenshot run showed the new name in the form and the old name in the sidebar.

## Problem

better-auth returns the `Set-Cookie` header with the response. Over HTTP the browser stores it; through `auth.api` in a server action nothing writes it unless `nextCookies()` (or your own code) copies it into `next/headers` `cookies()`. The database is correct, so unit tests and a database check both look fine.

## Rule

A server action that calls a better-auth endpoint which changes the user or the session asks for `returnHeaders: true` and forwards the `set-cookie` header with `forwardAuthCookies`. Check the result in the running app (sidebar or header), not only in the database.

## Applies to

`src/features/*/services/commands/*` calling `auth.api.*` with side effects on the session; `src/shared/lib/auth/index.ts` (`session.cookieCache`).
