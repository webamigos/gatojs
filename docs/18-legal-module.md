# The `legal` module: terms, privacy policy and a cookie banner

After reading this you will know:

- what `legal` adds to a project and what it deliberately leaves out;
- how to put your own terms and privacy policy on `/terms` and `/privacy`;
- when the cookie banner appears, how it stores the choice and how to gate your own scripts with it;
- how the banner behaves for keyboard and screen-reader users;
- what is still missing and which questions are open.

Verified against the code: branch `feat/legal-module`, 2026-11-27.

Sources:

- `kit/modules/legal.json`
- `src/features/legal/` (`module.ts`, `legal-config.ts`, `legal.config.ts`, `consent/`, `components/`, `services/legal-documents.ts`,
  `content/`, `slots.ts`) with tests in `__tests__/`
- `src/app/[locale]/(legal)/` (`layout.tsx`, `terms/page.tsx`, `privacy/page.tsx`)
- Spec `docs/superpowers/specs/2026-11-27-legal-module.md`, plan `docs/superpowers/plans/2026-11-27-legal-module.md`

## What it adds

| Part | Where |
| --- | --- |
| Public pages `/terms` and `/privacy` (`/en/terms`, `/en/privacy` in English) | `src/app/[locale]/(legal)/` |
| Content of both documents in `pl` and `en`, a template with bracketed fields | `src/features/legal/content/<document>.<locale>.tsx` |
| Cookie categories that need consent (none by default) | `src/features/legal/legal.config.ts` |
| Cookie banner, rendered only when categories are declared | `components/cookie-banner.tsx`, on every page through the core slot `app.root` |
| Links Terms · Privacy · Cookie settings | `components/legal-links.tsx`, through the core slots `auth.footer` and `app.sidebar.footer` |
| Client API for your code | `@/features/legal/consent` |

No database model, no environment variable, no external service, no dependency.

## Out of the box: no banner

GatoJS stores only strictly necessary data in the browser: the better-auth session cookies
(`better-auth.session_token`, `better-auth.session_data`, `better-auth.dont_remember`, and `better-auth.admin_session`
while an administrator impersonates someone), next-intl's `NEXT_LOCALE` when the visitor picks a language, and nothing in
`localStorage`. Strictly necessary storage needs no consent (ePrivacy Directive Art. 5(3)), so with the default
`cookieCategories: []` the module shows no banner. The privacy template lists these cookies; keep the list in step with
what your project adds.

## Your own documents

The content and config files are **seed files**: the project gets them once and owns them. Edit them directly; no
eject is needed, `npm run wa -- doctor --files` stays clean, `wa update` never overwrites them, and the protect hook
lets agents edit them:

```
src/features/legal/legal.config.ts
src/features/legal/content/index.ts
src/features/legal/content/{terms,privacy}.{pl,en}.tsx
```

Seed files import nothing from the module (only core paths such as `@/shared/config/project`, or each other; a kit test
enforces it). So `npm run wa -- remove legal` can leave them behind and the project still compiles: `remove` keeps them,
because they are yours, and lists them (`Kept seed files of legal …`). Delete them yourself if you no longer need the
text. The "Change cookie settings" button under the privacy policy is rendered by the module, not by the content file.

Each content file exports a server component with plain JSX and `updatedAt`, an ISO date shown as "Last updated":

```tsx
export const updatedAt = "2026-12-01";

export default function PrivacyPolicy() {
  return (
    <>
      <h2>1. Controller</h2>
      <p>Acme sp. z o.o., …</p>
    </>
  );
}
```

`content/index.ts` maps documents and locales to loaders. A locale without a file falls back to the default locale
(`defaultLocale`, `pl`).

**The shipped text is a placeholder, not legal advice.** Nothing checks it automatically, so before launch:

- replace every bracketed field (`[company name]`, `[address]`, `[contact e-mail]`, `[hosting provider]`, …): search the
  content folder for `[`;
- delete the "Template" notice at the top of each document;
- list the processors, retention periods and cookies your deployment really uses;
- have the text reviewed by a lawyer and set `updatedAt`.

To remove the links from a footer, remove the contribution in `src/gato.config.ts`:

```ts
export default defineGatoConfig({
  modules: {
    app: { slots: { "app.sidebar.footer": { "legal.sidebar-footer-links": null } } },
    auth: { slots: { "auth.footer": { "legal.auth-footer-links": null } } },
  },
});
```

`modules: { legal: { enabled: false } }` turns the module off: both pages answer 404 (the module is checked before any
translation is loaded), and the banner and links disappear.

## Optional cookies and the banner

When your project adds something that stores optional data in the browser (an analytics tool, a marketing pixel, a
preference that is not needed to use the app), declare its category:

```ts
export const legalConfig = {
  cookieCategories: ["analytics"],
  consentVersion: 1,
  consentCookieName: "cookie_consent", // optional, the default
  consentMaxAgeDays: 180,              // optional, the default
};
```

The file is plain data; the module validates it (`legal-settings.ts`).

Allowed categories: `preferences`, `analytics`, `marketing`. The config is checked with a Zod schema
(`contracts/legal-config.schemas.ts`): a duplicate or unknown category, a `consentVersion` that is not a positive
integer, a cookie name that is not 1–64 letters, digits, `_` or `-`, or a lifetime outside 1–395 days is invalid. The
cookie name must also not be `NEXT_LOCALE`, start with `better-auth`, or use the `__Host-`/`__Secure-` prefixes (any
case): those belong to next-intl and better-auth, and browsers drop prefixed cookies set over plain HTTP.

An invalid config **fails closed** instead of breaking every page:

- no optional category is active anywhere (`hasConsent` is `false`, no banner);
- the banner slot logs `Invalid legal config` with the error on the server;
- `/terms` and `/privacy` answer 500 and throw `LegalConfigError` with a message that names the file and each field, for
  example `Invalid src/features/legal/legal.config.ts: consentMaxAgeDays: consentMaxAgeDays must be an integer from 1 to 395`.

Open `/privacy` after editing the config to check it. Changing `consentCookieName` makes every stored choice invisible
(the old cookie is ignored and expires on its own), so every visitor is asked again.

The banner then appears until the visitor decides. It offers "Accept all", "Reject all" and "Choose", all three with
the same look; "Choose" lists one unchecked checkbox per category next to the always-on "Essential" row. Nothing
optional is allowed before a decision.

The choice is stored in a first-party cookie (`cookie_consent` by default): URL-encoded JSON
`{"v":<consentVersion>,"c":{"analytics":true},"t":<epoch seconds>}`, validated with a Zod schema when read, `Path=/`,
`Max-Age` = `consentMaxAgeDays` (180 by default), `SameSite=Lax`,
`Secure` on HTTPS. A record from another `consentVersion`, or one without a decision for a category you added later,
counts as no decision: the banner returns and every category is denied. Raise `consentVersion` when a purpose
changes and you need everyone to decide again.

### Gating your scripts

```tsx
"use client";
import Script from "next/script";
import { ConsentGate } from "@/features/legal/consent";

export function Analytics() {
  return (
    <ConsentGate category="analytics">
      <Script src="https://stats.example.com/script.js" strategy="afterInteractive" />
    </ConsentGate>
  );
}
```

| API | Use |
| --- | --- |
| `<ConsentGate category fallback?>` | Renders its children only after consent; never on the server. |
| `useCookieConsent()` | `{ ready, categories, choices, needsChoice, hasConsent, acceptAll, rejectAll, save, openSettings }`; re-renders after every decision. `ready` is `false` during the server render and hydration. |
| `hasConsent(category)` | Synchronous check outside React. `false` on the server, without a valid record, and for an undeclared category. |
| `onConsentChange(listener)` | Called with the new record after each decision; returns an unsubscribe function. |
| `openCookieSettings()` | Reopens the banner with the stored choices, for a "Cookie settings" link in your own footer. |

Withdrawing consent stops your gated components from rendering, but it does not delete cookies a third-party script
already set. Reload the page after a withdrawal if the script keeps state in memory, and clear its cookies if the
vendor documents how.

### Where the banner and the links show

- The banner: on every page, through the contribution `legal.cookie-banner` to the core slot `app.root`, which the
  locale layout renders at the end of each page (sign-in, sign-up, the app, the legal pages). The slot renders for an
  anonymous viewer, because the root layout does not read the session; only public modules contribute there. The banner
  is fixed to the bottom of the viewport, so it moves nothing.
- The links Terms · Privacy · Cookie settings: under the sign-in, sign-up and password pages (`auth.footer`), under the
  user menu of the app sidebar when it is expanded (`app.sidebar.footer`), and in the footer of the legal pages. "Cookie
  settings" appears only with declared categories. The privacy text also has a "Change cookie settings" button.
- The three core slots are `experimental` (see `EXTENSION_POINTS.md`); other modules can contribute to them too.

### Accessibility

- The banner is a non-modal dialog (`role="dialog"`, `aria-modal="false"`) named by its heading and described by its
  text. It does not trap focus or lock scrolling.
- On its first appearance it does not take focus; it is early in the document order. "Choose" moves focus to the
  first category checkbox. Reopening through `openCookieSettings()` moves focus to the dialog heading.
- After a decision, or "Close"/`Escape` in the reopened settings, focus returns to the element that had it before.
  `Escape` does nothing on the first appearance, because closing without a decision would hide the question.
- Every control is a native button, checkbox or link.

## Limits and follow-ups

- No proof of consent on the server (decision 6).
- Terms acceptance at sign-up is not available yet: it needs a core extension point in the sign-up form (spec,
  decision 7).
- Fixed category list; no per-organization documents.

Decisions and follow-ups are in the spec under "Decisions".
