# `legal` module: terms, privacy policy and a cookie banner

Roadmap item "Legal pages: Terms, privacy policy and a cookie banner". Kit module `legal`, version 0.1.0.
Plan: [2026-11-27-legal-module.md](../plans/2026-11-27-legal-module.md).

## Goal

A GatoJS project gets two public pages, `/terms` and `/privacy`, filled from content files the project owns, and a
cookie banner that appears only when the project declares cookies that need consent. GDPR-minded by default: no
external services, no tracking, nothing loaded before consent, "Reject" as easy as "Accept", the choice changeable
later. App-wide (not per organization), no database model.

## What GatoJS itself stores in the browser (checked 2026-11-27)

| Cookie | Set by | Purpose | Lifetime | Essential |
| --- | --- | --- | --- | --- |
| `better-auth.session_token` (`__Secure-` prefix on HTTPS) | better-auth 1.7.27 | sign-in session | session expiry (better-auth default 7 days) | yes |
| `better-auth.session_data` | better-auth `session.cookieCache` (`src/shared/lib/auth/index.ts`) | signed copy of the session, avoids a DB read | 5 minutes | yes |
| `better-auth.dont_remember` | better-auth, sign-in without "remember me" | ends the session with the browser | browser session | yes |
| `better-auth.admin_session` | better-auth `admin` plugin, impersonation only | the admin's own session while impersonating | session expiry | yes (staff only) |
| `NEXT_LOCALE` | next-intl 4.15.3 middleware | the chosen language; set only when it differs from the URL locale | browser session | yes (requested by the user) |
| `cookie_consent` | this module, only when the project declares categories | the visitor's choice | 180 days | yes |

No `localStorage`, `sessionStorage` or `document.cookie` writes exist in `src/` today (grep). Fonts are served from the
repository (`next/font/local`), and `third-party-telemetry-stays-off.test.ts` keeps telemetry off. So a project built
only from GatoJS needs no consent banner: under ePrivacy Art. 5(3) strictly necessary storage is exempt. The module
therefore shows **no banner by default** and the privacy template lists the cookies above.

## Scope

### In

1. **Public pages** `/terms` and `/privacy` (route group `src/app/[locale]/(legal)/`, `localePrefix: "as-needed"`
   like every page: `/privacy` in `pl`, `/en/privacy` in `en`). No session needed: the pages read no data. Each page
   starts with `isModuleEnabled("legal")` and calls `notFound()` when the module is disabled in `src/gato.config.ts`.
   `generateMetadata` gives the title from the module's i18n. The layout: brand logo (`getBranding()`), the article, a
   footer with links Terms · Privacy · Cookie settings (the last only when categories are declared) and a link back to
   `/`.
2. **Content the project owns.** Per document and locale one TSX file, `src/features/legal/content/<document>.<locale>.tsx`,
   exporting `default` (a server component, plain JSX, no dependency) and `updatedAt` (ISO date shown as "Last
   updated"). A map `src/features/legal/content/index.ts` lists the loaders. The kit ships a placeholder template in
   `pl` and `en` with bracketed fields (`[company name]`, `[address]`, `[contact e-mail]`), an explicit "template, have it
   reviewed by a lawyer" notice, and the cookie table above. These six files are **seed files** (see "Seed files"
   below): the project owns and edits them, `wa update`, `wa doctor --files` and the protect hook leave them alone. A locale without
   a file falls back to the default locale's file (`defaultLocale` from `src/i18n/config.ts`).
3. **Cookie categories declared in a project config**, `src/features/legal/legal.config.ts`:

   ```ts
   export const legalConfig = defineLegalConfig({
     cookieCategories: [],   // e.g. ["analytics"]; allowed: "preferences" | "analytics" | "marketing"
     consentVersion: 1,      // raise to ask everyone again (e.g. a new purpose)
     consentCookieName: "cookie_consent", // optional, default; 1-64 letters, digits, _ or -
     consentMaxAgeDays: 180,              // optional, default; integer 1-395
   });
   ```

   Client-safe (no server import), so the banner and the client API read it directly. `defineLegalConfig` (Gato file)
   validates it with a Zod schema (`contracts/legal-config.schemas.ts`) at import: duplicate categories, an unknown
   category, a `consentVersion` that is not a positive integer, a bad cookie name or lifetime throw `LegalConfigError`
   (fail at build, not in a visitor's browser). Renaming the cookie makes every stored choice invisible: everyone is
   asked again.
4. **Consent record** in a first-party cookie (default name `cookie_consent`): `encodeURIComponent(JSON.stringify({ v, c, t }))`,
   `v` = `consentVersion`, `c` = `{ [category]: boolean }` for every category the visitor decided, `t` = decision time
   in epoch seconds. Attributes `Path=/; Max-Age=<consentMaxAgeDays × 86400>` (default 180 days); `SameSite=Lax`; `Secure` on HTTPS. Not
   `HttpOnly`: the browser code reads it. A record is **valid** when it parses, `v` equals `consentVersion` and every
   declared category has a boolean. Anything else (missing, garbage, other version, a new category) means "no choice
   yet": every category is denied and the banner shows.
5. **Banner** (`CookieBanner`, client): rendered only when `cookieCategories` is non-empty and the record is not
   valid. Fixed to the bottom of the viewport (out of flow: no layout shift for content), `role="dialog"`,
   `aria-modal="false"`, `aria-labelledby`/`aria-describedby`, no focus trap and no scroll lock (the page stays
   usable). Three buttons of the same variant and size: "Accept all", "Reject all", "Choose". "Choose" expands one
   checkbox per category (unchecked) plus the disabled, checked "Essential" row, and "Save choices"; focus moves to the
   first checkbox. Keyboard: every control is a native `button`/`input`, Tab order follows the DOM. After a decision
   the banner unmounts and focus goes back to where it was before it moved into the banner (`document.activeElement`
   captured on open), or to `document.body` when that element is gone. Rendered client-side only (it reads
   `document.cookie` after hydration), so the server HTML never contains it and hydration cannot mismatch.
6. **Changing the choice later.** `openCookieSettings()` reopens the banner with the current choices pre-checked in the
   "Choose" view and an extra "Close" button; `Escape` also closes it in this mode (the stored choice stays). It moves
   focus to the dialog heading and restores it to the opener on close. Entry points: the "Cookie settings" link in the
   legal layout footer and a "Change cookie settings" button on the privacy page (both rendered only when categories are
   declared). Project code can call it from its own footer.
7. **Client API for project code** (`src/features/legal/consent/index.ts`, client-safe):
   - `hasConsent(category): boolean` — synchronous, reads the cookie; `false` for an undeclared category, without a
     valid record, and on the server (no `document`).
   - `useCookieConsent(): { ready, choices, needsChoice, hasConsent, acceptAll, rejectAll, save, openSettings }` —
     `useSyncExternalStore` on a small module-level store, so every consumer re-renders after a decision without a
     provider; `ready` is `false` during SSR and hydration.
   - `<ConsentGate category="analytics">…</ConsentGate>` renders its children only after consent (for `next/script`
     tags), and nothing on the server.
   - `onConsentChange(listener)` — returns an unsubscribe function; for code that must react outside React.
   Withdrawal: switching a category off removes nothing the third-party script already set; the docs say so and
   recommend reloading the page (`save` does not reload by itself).
8. **Where the banner is mounted.** Through the core slot `app.root` (server, rendered by `src/app/[locale]/layout.tsx`
   at the end of every page, `(auth)` and legal pages included) with the contribution `legal.cookie-banner`. The slot is
   rendered for an anonymous viewer (`anonymousViewer(env.MULTI_ORG)`: the root layout does not read the session), so
   only public modules' contributions without `roles` appear there.
9. **Links to the pages.** Through the core slots `auth.footer` (a `<footer>` under the sign-in, sign-up and password
   pages, only when something is contributed) and `app.sidebar.footer` (under the sidebar's user menu, hidden when the
   sidebar is collapsed), with `legal.auth-footer-links` and `legal.sidebar-footer-links`: `LegalLinks` = Terms ·
   Privacy · Cookie settings (the last only with declared categories). No sidebar nav items. The legal layout has its
   own footer with the same links.

### Out (v1)

- Per-organization documents or consent, a database record of consent (proof of consent), versioned document history,
  acceptance of terms at sign-up (a checkbox): see "Decisions" (6, 7).
- Blocking third-party scripts automatically (script rewriting, Google Consent Mode); the project gates its own scripts
  with `ConsentGate`/`hasConsent`.
- Markdown or a CMS for the content (no new dependency in v1).

## Design decisions

- **No DB model.** Consent is about the browser, also before sign-in, so it lives in the browser. GDPR Art. 7(1) asks
  to be able to demonstrate consent; for a first-party cookie the usual practice is the record in the cookie itself
  plus the published policy version. A server log of consent would itself be personal data and needs an identifier; it
  is not built (decision 6).
- **Fixed category set** (`preferences`, `analytics`, `marketing`): labels and descriptions live in the module's i18n,
  so the banner is translated without project strings. A project needing another purpose raises it (decision 4).
- **Content as TSX, not Markdown:** zero dependencies, server-rendered, can import `project.name`, type-checked. A
  lawyer's text is pasted once per locale.
- **Version bump re-asks everyone; a new category re-asks too** (the record has no decision for it). Removing a
  category keeps the record valid (extra keys are ignored).
- **180 days** (configurable) before the cookie expires and the banner returns (CNIL's recommendation of about 6 months; neither
  the GDPR nor ePrivacy fixes a period).
- **No banner on the server**, rendered after hydration: avoids a hydration mismatch and keeps the HTML cacheable; the
  banner is fixed-position, so its late appearance moves nothing.

## Seed files

`kit/CLAUDE.md`: a file a project gets once and then edits as its own is a `seedFiles` entry in `kit/kit.json`, owned by
a module's `files`. The module adds six paths:

```
src/features/legal/legal.config.ts
src/features/legal/content/index.ts
src/features/legal/content/terms.pl.tsx
src/features/legal/content/terms.en.tsx
src/features/legal/content/privacy.pl.tsx
src/features/legal/content/privacy.en.tsx
```

Filling `seedFiles` does not change `kitFormat` (`kit/CLAUDE.md`). The core architecture test
`src/__tests__/architecture/seed-files-are-declared.test.ts` pins the full list, so it changed with the core commit
(core 0.37.0). Module tests that assert the shipped content of these files (`content.test.tsx`) run only in the kit
repository (`describe.runIf(kit/kit.json exists)`), because a project rewrites them. Checked in a created project:
the files are recorded with hash `seed` in `.wa/kit.json`, editing `legal.config.ts` and `privacy.pl.tsx` leaves
`wa doctor --files` clean, the protect hook allows the edit (and still blocks a Gato file of the module), and the
project's `verify` passes.

## Files

```
kit/modules/legal.json                               manifest, version 0.1.0, no dependencies, no env
src/features/legal/module.ts                          key "legal", public, no nav, routePrefixes ["/terms", "/privacy"]
src/features/legal/extension-points.json             module
src/features/legal/i18n/{pl,en}.json                 page titles, banner, categories, nav
src/features/legal/slots.ts                          legal.cookie-banner → app.root, legal.auth-footer-links → auth.footer,
                                                     legal.sidebar-footer-links → app.sidebar.footer
src/features/legal/contracts/                        Zod schemas: consent cookie payload, legal config
src/features/legal/components/legal-links.tsx        footer links (Terms · Privacy · Cookie settings)
src/features/legal/legal-config.ts                   defineLegalConfig, LegalConfigError, COOKIE_CATEGORIES
src/features/legal/legal.config.ts                   (seed) the project's config
src/features/legal/content/*.tsx, index.ts            (seed) templates and loader map
src/features/legal/services/legal-documents.ts       resolveLegalDocument(document, locale)
src/features/legal/consent/consent-record.ts         pure: parse, serialize, validity, grants
src/features/legal/consent/consent-store.ts          cookie read/write, listeners, openCookieSettings
src/features/legal/consent/use-cookie-consent.ts     hook
src/features/legal/consent/consent-gate.tsx          <ConsentGate>
src/features/legal/consent/index.ts                  public client API
src/features/legal/components/cookie-banner.tsx      banner (client)
src/features/legal/components/cookie-banner-slot.tsx server wrapper for the slot
src/features/legal/components/cookie-settings-button.tsx
src/features/legal/components/legal-document-page.tsx
src/app/[locale]/(legal)/layout.tsx, terms/page.tsx, privacy/page.tsx
docs/18-legal-module.md                              usage (repo docs)
.github/workflows/kit.yml                            assemble matrix: legal, and legal in "all"
```

Core changes (own commit, core 0.37.0): slots `app.root` and `app.sidebar.footer` (`coreSlotDefinitions`), `auth.footer`
(`src/features/auth/slots.ts`), all experimental (ADR-63, ADR-68 amendment); `anonymousViewer` in `slot-access.ts`;
rendering in the locale, `(auth)` and `(app)` layouts and `AppSidebar`'s `footer` prop; `seedFiles` and its test.
`kitFormat` and `gato-cli` stay: the generator already handles `slots.ts` of any module.

## Decisions (Patryk, 2026-11-27)

1. **Core slots: yes.** `app.root`, `auth.footer`, `app.sidebar.footer` added to the core as experimental server slots;
   the banner and the footer links render through them, `(auth)` pages included.
2. **Seed files: yes.** The six content/config files are `seedFiles`; verified in a created project (see "Seed files").
3. **No sidebar nav items.** Removed; the links live in the footers.
4. **Fixed category set** (`preferences`, `analytics`, `marketing`) stays for now.
5. **180 days and `cookie_consent` stay the defaults**, configurable as `consentMaxAgeDays` (1–395) and
   `consentCookieName` (1–64 letters, digits, `_`, `-`), validated with Zod. A renamed cookie ignores old consent.
6. **No server-side proof of consent** for now.
7. **Terms acceptance at sign-up: opt-in per deployer, not built yet.** Enforcing it needs a field in the core sign-up
   form and a way to send it with `authClient.signUp.email`: `sign-up-form.tsx` has a fixed Zod schema and payload and
   no slot, so no existing extension point fits. **Follow-up (core):** a client slot or field contribution in the
   sign-up form (e.g. `auth.sign-up.fields`) whose values reach the sign-up request, then the legal module adds an
   opt-in `termsAcceptance` flag, a checkbox through that slot, a `before` hook on `/sign-up/email` in its `auth.ts`
   plugin that rejects a missing acceptance, and storage of the accepted version and time (`User` additional field or
   a module table).
8. **No vetted base text.** The placeholder template stays, marked as a placeholder the deployer must replace; the
   docs carry a pre-launch checklist (no automated check).
9. **TSX content** stays (no Markdown dependency).
