# ADR-64: Production mail needs a configured provider or an explicit `console`, not Resend specifically

**Status:** Accepted (supersedes the production `RESEND_API_KEY` rule of [D17](../decyzje.md#d17) and the matching note in [D18](../decyzje.md#d18))
**Date:** 2026-11-24
**Decided by:** Patryk (self-hosting spec, decisions of 2026-11-22 and 2026-11-23), written up by an agent

## Context

Production required `RESEND_API_KEY` (a refine in `coreEnvSchema`, D17). `SMTP_URL` already won over Resend, even in
production, but the refine still demanded a Resend key. A company with its own mail relay, or one that may not send
anything to an outside service, could not deploy without a Resend account. A `console` fallback (log only) existed, but
only implicitly, so a production install without credentials would silently lose every invitation and password reset.

## Decision

- `MAIL_PROVIDER` = `smtp` | `resend` | `console` in `coreEnvSchema` (`packages/env/src/core-env-schema.ts`), blank →
  unset, trimmed and lower-cased. Unset detects from credentials: `SMTP_URL` or `SMTP_HOST` selects SMTP, then
  `RESEND_API_KEY` selects Resend; with neither, mail is logged (`console`). An explicit value wins over detection.
- SMTP by host: `SMTP_HOST`, `SMTP_PORT` (default 587, integer 1–65535), `SMTP_USER` and `SMTP_PASS` (both or neither;
  authentication only when set), `SMTP_SECURE` (flag). `SMTP_URL` stays as the one-variable form (mailpit in dev and e2e).
- `SMTP_URL` next to any of `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` or `SMTP_SECURE` is a startup error, in
  every `NODE_ENV`: one source of SMTP settings (decision 9.1).
- Production rule: with `NODE_ENV=production` and none of `MAIL_PROVIDER`, `SMTP_HOST`, `SMTP_URL`, `RESEND_API_KEY`
  set, the app refuses to start with "no mail provider configured for production: set SMTP_HOST, SMTP_URL or
  RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail". `MAIL_PROVIDER=console` is the explicit way to send none.
- `mailRules` (`packages/env/src/mail.ts`) holds the rules: `requiredForProvider("MAIL_PROVIDER", "resend",
  ["RESEND_API_KEY"])`, `allOrNone(["SMTP_USER", "SMTP_PASS"], "SMTP authentication")`, SMTP needs a host or a URL,
  the `SMTP_URL` conflict and the production rule. They read the raw variables, because parsed `SMTP_PORT` and
  `SMTP_SECURE` carry defaults that must not count as set.
- `resolveMailConfig(env)` (pure, `@gatojs/env`) returns the `MailConfig` the mailer (`src/shared/lib/mailer.ts`) uses:
  an SMTP URL or options for `nodemailer.createTransport`, a Resend key, or `console`.

## Rejected alternatives

- Keep the Resend requirement and let self-hosted installs set a dummy key: the key would never be used while SMTP wins,
  so the rule protects nothing and the docs would teach a workaround.
- Fall back to `console` in production without saying so: an operator would learn about lost invitations from users.
- Let `SMTP_URL` and the split variables be merged (URL first, variables override): two sources of the same setting,
  and a stale `.env.example` `SMTP_URL` would quietly win over the relay an operator configured.
- HTTP providers beyond Resend (Postmark, SES API, SendGrid): all are reachable through SMTP; a new variant is a small
  follow-up when a project needs one.

## Consequences

- Existing deploys with only `RESEND_API_KEY` keep starting; deploys with only `SMTP_URL` no longer need a Resend key.
- A self-hosted install sets `SMTP_HOST` (and optionally port, credentials, TLS) or `MAIL_PROVIDER=console`.
- Developers copying `.env.example` keep mailpit through `SMTP_URL`; setting `SMTP_HOST` there means blanking `SMTP_URL`.

## Enforcement

`verifyEnvOnStartup` at server start and `parseEnv` on the first `env` read (D48). Tests:
`packages/env/src/__tests__/mail.test.ts`, `packages/env/src/__tests__/core-env-schema.test.ts`,
`packages/env/src/__tests__/env-check.test.ts`, `src/shared/lib/__tests__/mailer.test.ts`,
`src/__tests__/architecture/env-example-passes-validation.test.ts`.

## Sources

- Spec [2026-11-22-self-hosting-design.md](../superpowers/specs/2026-11-22-self-hosting-design.md) §2, §8, §9.1.
- Plan [2026-11-23-self-hosting.md](../superpowers/plans/2026-11-23-self-hosting.md), Task 1.
