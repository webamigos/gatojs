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
| Cookie banner, rendered only when categories are declared | `components/cookie-banner.tsx`, mounted in the legal layout and through the `app.header.actions` slot |
| Client API for your code | `@/features/legal/consent` |
| Sidebar links `legal.privacy` and `legal.terms` | `module.ts` |

No database model, no environment variable, no external service, no dependency.

## Out of the box: no banner

GatoJS stores only strictly necessary data in the browser: the better-auth session cookies
(`better-auth.session_token`, `better-auth.session_data`, `better-auth.dont_remember`, and `better-auth.admin_session`
while an administrator impersonates someone), next-intl's `NEXT_LOCALE` when the visitor picks a language, and nothing in
`localStorage`. Strictly necessary storage needs no consent (ePrivacy Directive Art. 5(3)), so with the default
`cookieCategories: []` the module shows no banner. The privacy template lists these cookies; keep the list in step with
what your project adds.

## Your own documents

The content files are module files today. Before you edit one, take ownership of it:

```bash
npm run wa -- eject src/features/legal/content/privacy.pl.tsx --reason "project legal text"
```

(Repeat for each file you edit, including `legal.config.ts`. A later kit release may turn these files into seed files,
which a project owns without ejecting; see open question 0 in the spec.)

Each file exports a server component with plain JSX and `updatedAt`, an ISO date shown as "Last updated":

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
(`defaultLocale`, `pl`). Fill every bracketed field (`[company name]`, `[address]`, `[contact e-mail]`) and have the
text reviewed by a lawyer: the template is a starting point, not legal advice.

To remove the sidebar links, hide them in `src/gato.config.ts`:

```ts
export default defineGatoConfig({
  modules: { legal: { nav: { "legal.terms": { hidden: true } } } },
});
```

`modules: { legal: { enabled: false } }` turns the module off: both pages answer 404 and the banner disappears.

## Optional cookies and the banner

When your project adds something that stores optional data in the browser (an analytics tool, a marketing pixel, a
preference that is not needed to use the app), declare its category:

```ts
export const legalConfig = defineLegalConfig({
  cookieCategories: ["analytics"],
  consentVersion: 1,
});
```

Allowed categories: `preferences`, `analytics`, `marketing`. A duplicate, an unknown category or a `consentVersion`
that is not a positive integer throws `LegalConfigError` when the file loads, so `next build` fails.

The banner then appears until the visitor decides. It offers "Accept all", "Reject all" and "Choose", all three with
the same look; "Choose" lists one unchecked checkbox per category next to the always-on "Essential" row. Nothing
optional is allowed before a decision.

The choice is stored in the first-party cookie `cookie_consent`: URL-encoded JSON
`{"v":<consentVersion>,"c":{"analytics":true},"t":<epoch seconds>}`, `Path=/`, `Max-Age` 180 days, `SameSite=Lax`,
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

### Where the banner shows

- On `/terms` and `/privacy` (the legal layout), with a "Cookie settings" link in their footer and a "Change cookie
  settings" button in the privacy text.
- On every signed-in page, through the contribution `legal.cookie-banner` to the core slot `app.header.actions`. The
  banner is fixed to the bottom of the viewport, so it does not move the header.
- **Not** on sign-in, sign-up and the other `(auth)` pages: there is no core slot there yet. `hasConsent` stays
  `false` on those pages, so nothing optional runs before the visitor signs in.

### Accessibility

- The banner is a non-modal dialog (`role="dialog"`, `aria-modal="false"`) named by its heading and described by its
  text. It does not trap focus or lock scrolling.
- On its first appearance it does not take focus; it is early in the document order. "Choose" moves focus to the
  first category checkbox. Reopening through `openCookieSettings()` moves focus to the dialog heading.
- After a decision, or "Close"/`Escape` in the reopened settings, focus returns to the element that had it before.
  `Escape` does nothing on the first appearance, because closing without a decision would hide the question.
- Every control is a native button, checkbox or link.

## Limits and open questions

- No banner and no legal links on `(auth)` pages, and the links sit in the sidebar instead of a footer: both need core
  slots (`app.root`, `auth.footer`, `app.sidebar.footer` proposed).
- No proof of consent on the server and no terms acceptance at sign-up.
- Fixed category list; no per-organization documents.

The full list, with the recommended answers, is in the spec under "Open questions for Patryk".
