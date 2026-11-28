---
title: 'During an OAuth sign-in the better-auth client navigates to the returned URL by itself, so a sign-in form that also pushes `/dashboard` races it and drops the authorization'
areas: ['mcp']
topics: ['mcp', 'oauth', 'better-auth', 'sign-in', 'i18n']
---

# During an OAuth sign-in the better-auth client navigates to the returned URL by itself, so a sign-in form that also pushes `/dashboard` races it and drops the authorization

**In short**: With the signed `oauth_query` in the body, `POST /api/auth/sign-in/email` answers
`{ redirect: true, url: "/oauth/consent?…" }` (or `/oauth/organization?…` when `postLogin.shouldRedirect` is true).
better-auth's client `redirectPlugin` sets `window.location.href` to that URL on success. `sign-in-form.tsx` then calls
`router.push("/dashboard")` unconditionally, so the two navigations race.

**Context**: Phase 0 spike of the MCP module on 2026-11-28 (better-auth 1.7.27, `@better-auth/oauth-provider` 1.7.27,
`src/features/auth/components/sign-in-form.tsx`).

**Problem**:

- Without `oauthProviderClient()` in the auth client nothing adds `oauth_query`, the response is `{ redirect: false }`,
  and the user lands on the dashboard with the AI app still waiting.
- `oauthProviderClient()` adds `oauth_query` only to a JSON or form string body; a body built another way is sent without it.
- The signed query repeats `ba_param` once per signed parameter. The next-intl redirect from `/sign-in` to
  `/en/sign-in` keeps the repeated parameters (verified), but any code that rebuilds the query through an object loses
  them and the signature fails.

**Rule**: Install `oauthProviderClient()` through the module's `auth-client.ts`. In the sign-in form, do nothing after
a successful sign-in whose data has `redirect: true` (the plugin navigates); push `/dashboard` only otherwise. Never
rebuild the sign-in or consent query from an object.

**Applies to**: `src/features/auth/components/sign-in-form.tsx`, `src/features/mcp/auth-client.ts`, the consent and
organization pages, MCP plan Task 0.3 and Task 1.4.
