# `legal` module: task plan

Spec: [2026-11-27-legal-module.md](../specs/2026-11-27-legal-module.md). Run with the `gato-task` skill: `test-writer`
writes the tests of each task from this file before the code, the implementer works with `.gato/phase` = `implement`,
`test-reviewer` runs `npm run test:mutation:task -- <files>`.

All test files live in `__tests__/` next to the code. Component tests use jsdom, `NextIntlClientProvider` with
`src/app/messages/pl.json` plus `{ legal: <src/features/legal/i18n/pl.json> }`. Expected values are literals from this
file. Mock only I/O; the cookie is `document.cookie` of jsdom (clear it in `beforeEach` by expiring `cookie_consent`).

## i18n (`src/features/legal/i18n/{pl,en}.json`, namespace `legal`)

| key | pl | en |
| --- | --- | --- |
| `nav-privacy` | Polityka prywatności | Privacy policy |
| `nav-terms` | Regulamin | Terms of service |
| `privacy-title` | Polityka prywatności | Privacy policy |
| `terms-title` | Regulamin | Terms of service |
| `last-updated` | Ostatnia aktualizacja: {date} | Last updated: {date} |
| `footer-terms` | Regulamin | Terms |
| `footer-privacy` | Prywatność | Privacy |
| `footer-cookie-settings` | Ustawienia cookies | Cookie settings |
| `footer-home` | Strona główna | Home |
| `banner-title` | Pliki cookie | Cookies |
| `banner-description` | Używamy niezbędnych plików cookie, żeby utrzymać Twoją sesję. Za Twoją zgodą użyjemy też opcjonalnych plików cookie wymienionych niżej. Wybór zmienisz w każdej chwili w ustawieniach cookies. | We use essential cookies to keep you signed in. With your consent we also use the optional cookies listed below. You can change your choice at any time in the cookie settings. |
| `banner-accept-all` | Akceptuj wszystkie | Accept all |
| `banner-reject-all` | Odrzuć wszystkie | Reject all |
| `banner-choose` | Wybierz | Choose |
| `banner-save` | Zapisz wybór | Save choices |
| `banner-close` | Zamknij | Close |
| `category-essential` | Niezbędne | Essential |
| `category-essential-description` | Logowanie, język i zapis tej decyzji. Zawsze włączone. | Sign-in, language and this choice. Always on. |
| `category-preferences` | Preferencje | Preferences |
| `category-preferences-description` | Zapamiętują Twoje ustawienia wyglądu i działania. | Remember your display and behaviour settings. |
| `category-analytics` | Analityczne | Analytics |
| `category-analytics-description` | Pomagają nam zrozumieć, jak korzystasz z aplikacji. | Help us understand how the app is used. |
| `category-marketing` | Marketingowe | Marketing |
| `category-marketing-description` | Służą do mierzenia i dopasowania reklam. | Measure and personalise advertising. |
| `change-cookie-settings` | Zmień ustawienia cookies | Change cookie settings |

## Task 1 — config and consent record (pure)

Files: `src/features/legal/legal-config.ts`, `src/features/legal/consent/consent-record.ts`.

```ts
// legal-config.ts
export const COOKIE_CATEGORIES = ["preferences", "analytics", "marketing"] as const;
export type CookieCategory = (typeof COOKIE_CATEGORIES)[number];
export interface LegalConfig { readonly cookieCategories: readonly CookieCategory[]; readonly consentVersion: number }
export class LegalConfigError extends Error {}            // name "LegalConfigError"
export function defineLegalConfig(input: LegalConfig): LegalConfig;

// consent/consent-record.ts
export const CONSENT_COOKIE_NAME = "cookie_consent";
export const CONSENT_MAX_AGE_SECONDS = 15552000;
export type ConsentChoices = Partial<Record<CookieCategory, boolean>>;
export interface ConsentRecord { version: number; choices: ConsentChoices; decidedAt: number }
export function parseConsent(raw: string | null | undefined): ConsentRecord | null;
export function serializeConsent(record: ConsentRecord): string;
export function consentCookieValue(cookieHeader: string): string | undefined;
export function consentCookieString(record: ConsentRecord, options: { secure: boolean }): string;
export function isConsentValid(record: ConsentRecord | null, config: LegalConfig): boolean;
export function needsChoice(record: ConsentRecord | null, config: LegalConfig): boolean;
export function isGranted(record: ConsentRecord | null, category: CookieCategory, config: LegalConfig): boolean;
export function decide(config: LegalConfig, choices: ConsentChoices, now: number): ConsentRecord;
export function allChoices(config: LegalConfig, value: boolean): ConsentChoices;
```

### Behaviours

- `defineLegalConfig({ cookieCategories: [], consentVersion: 1 })` → `{ cookieCategories: [], consentVersion: 1 }`.
- `defineLegalConfig({ cookieCategories: ["analytics", "marketing"], consentVersion: 3 })` → same object values.
- `["analytics", "analytics"]` → throws `LegalConfigError`, message contains `duplicate cookie category: analytics`.
- `["tracking"]` (cast) → throws `LegalConfigError`, message contains `unknown cookie category: tracking`.
- `consentVersion` `0`, `-1`, `1.5` → throws `LegalConfigError`, message contains `consentVersion must be a positive integer`.
- Thrown error has `name === "LegalConfigError"`.
- `serializeConsent({ version: 1, choices: { analytics: true }, decidedAt: 1700000000 })` →
  `"%7B%22v%22%3A1%2C%22c%22%3A%7B%22analytics%22%3Atrue%7D%2C%22t%22%3A1700000000%7D"`.
- `parseConsent` of that string → `{ version: 1, choices: { analytics: true }, decidedAt: 1700000000 }`.
- `parseConsent(undefined)`, `parseConsent("")`, `parseConsent("not-json")`, `parseConsent("%7B")` → `null`.
- `parseConsent(encodeURIComponent('{"v":0,"c":{},"t":1}'))` → `null` (version not positive);
  `'{"v":1.5,"c":{},"t":1}'` → `null`; `'{"v":1,"c":[],"t":1}'` → `null`; `'{"v":1,"c":{"analytics":"yes"},"t":1}'` → `null`;
  `'{"v":1,"c":{},"t":"x"}'` → `null`; `'[1]'` → `null`; `'null'` → `null`.
- `parseConsent(encodeURIComponent('{"v":2,"c":{"analytics":false,"other":true},"t":5}'))` →
  `{ version: 2, choices: { analytics: false }, decidedAt: 5 }` (unknown keys dropped).
- Property (`test.prop`, `@fast-check/vitest`): for any version (positive int), any subset of categories mapped to
  booleans and any non-negative integer `decidedAt`, `parseConsent(serializeConsent(r))` deep-equals `r`.
- `consentCookieValue("a=1; cookie_consent=abc; b=2")` → `"abc"`; `consentCookieValue("cookie_consent=x")` → `"x"`;
  `consentCookieValue("my_cookie_consent=x")` → `undefined`; `consentCookieValue("")` → `undefined`.
- `consentCookieString({ version: 1, choices: { analytics: true }, decidedAt: 1700000000 }, { secure: true })` →
  `"cookie_consent=%7B%22v%22%3A1%2C%22c%22%3A%7B%22analytics%22%3Atrue%7D%2C%22t%22%3A1700000000%7D; Path=/; Max-Age=15552000; SameSite=Lax; Secure"`;
  with `{ secure: false }` the same without `"; Secure"`.
- With `config = { cookieCategories: ["analytics", "marketing"], consentVersion: 2 }`:
  - `isConsentValid(null, config)` → `false`;
  - `{ version: 2, choices: { analytics: true, marketing: false }, decidedAt: 1 }` → `true`;
  - `{ version: 1, choices: { analytics: true, marketing: true }, … }` → `false` (old version);
  - `{ version: 2, choices: { analytics: true }, … }` → `false` (marketing undecided);
  - `needsChoice` is the negation of `isConsentValid` for this config;
  - `isGranted(valid {analytics: true, marketing: false}, "analytics")` → `true`, `"marketing"` → `false`;
  - `isGranted(record with version 1 and analytics true, "analytics")` → `false`;
  - `isGranted(record { analytics: true } only, "analytics")` → `false` (record invalid);
  - `isGranted(null, "analytics")` → `false`.
- With `config = { cookieCategories: ["analytics"], consentVersion: 1 }`:
  `isGranted({ version: 1, choices: { analytics: true, marketing: true }, decidedAt: 1 }, "marketing")` → `false`
  (undeclared category).
- With `config = { cookieCategories: [], consentVersion: 1 }`: `needsChoice(null, config)` → `false`.
- `decide(config2, { analytics: true }, 1700000000)` (config2 = analytics+marketing, v2) →
  `{ version: 2, choices: { analytics: true, marketing: false }, decidedAt: 1700000000 }`;
  `decide(config1 /* analytics only */, { analytics: true, marketing: true }, 9)` →
  `{ version: 1, choices: { analytics: true }, decidedAt: 9 }`.
- `allChoices(config2, true)` → `{ analytics: true, marketing: true }`; `allChoices(config2, false)` →
  `{ analytics: false, marketing: false }`.

### Mutations to kill

- version check removed or `!==` flipped in `isConsentValid`; "every declared category decided" turned into "some".
- `isGranted` ignoring the declared list, or returning `choices[c] !== false`.
- `decide` keeping undeclared categories or defaulting missing ones to `true`.
- `parseConsent` accepting non-boolean values, non-integer or zero versions, arrays.
- `Secure` always or never added; `Max-Age` or `SameSite` dropped; prefix match in `consentCookieValue`
  (`endsWith`/`includes`).
- `defineLegalConfig` not checking duplicates, unknown categories or the version.

## Task 2 — browser store, hook and gate

Files: `src/features/legal/consent/consent-store.ts`, `use-cookie-consent.ts` (`"use client"`),
`consent-gate.tsx` (`"use client"`), `index.ts`.

```ts
// consent-store.ts (client-safe, no React)
export function readConsent(): ConsentRecord | null;                       // null when typeof document === "undefined"
export function writeConsent(choices: ConsentChoices, config?: LegalConfig, now?: number): ConsentRecord;
export function hasConsent(category: CookieCategory, config?: LegalConfig): boolean;
export function onConsentChange(listener: (record: ConsentRecord | null) => void): () => void;
export function openCookieSettings(): void;
export function onOpenCookieSettings(listener: () => void): () => void;
export function subscribeConsent(listener: () => void): () => void;        // for useSyncExternalStore
export function consentSnapshot(): ConsentRecord | null;                   // same object while the cookie is unchanged
// config defaults to legalConfig from "../legal.config"; now defaults to Math.floor(Date.now() / 1000)

// use-cookie-consent.ts
export interface CookieConsentState {
  ready: boolean;
  categories: readonly CookieCategory[];
  choices: ConsentChoices;            // {} when no valid record
  needsChoice: boolean;               // false while !ready
  hasConsent(category: CookieCategory): boolean;
  acceptAll(): void;
  rejectAll(): void;
  save(choices: ConsentChoices): void;
  openSettings(): void;
}
export function useCookieConsent(config?: LegalConfig): CookieConsentState;

// consent-gate.tsx
export function ConsentGate(props: { category: CookieCategory; config?: LegalConfig; fallback?: ReactNode; children: ReactNode }): ReactNode;

// index.ts re-exports: hasConsent, onConsentChange, openCookieSettings, useCookieConsent, ConsentGate,
// types CookieCategory, ConsentChoices, ConsentRecord
```

### Behaviours (config = analytics + marketing, version 2)

- No cookie → `readConsent()` → `null`; `hasConsent("analytics", config)` → `false`.
- `writeConsent({ analytics: true }, config, 1700000000)` → returns
  `{ version: 2, choices: { analytics: true, marketing: false }, decidedAt: 1700000000 }`, then `document.cookie`
  contains `cookie_consent=%7B%22v%22%3A2%2C%22c%22%3A%7B%22analytics%22%3Atrue%2C%22marketing%22%3Afalse%7D%2C%22t%22%3A1700000000%7D`,
  `hasConsent("analytics", config)` → `true`, `hasConsent("marketing", config)` → `false`.
- On `http:` (jsdom default `http://localhost:3000`) the cookie string written has no `Secure`
  (spy on the `document.cookie` setter: the written string ends with `SameSite=Lax`).
- `onConsentChange(listener)`: after `writeConsent` the listener gets the new record once; after the returned
  unsubscribe it is not called again.
- `openCookieSettings()` calls every `onOpenCookieSettings` listener once; unsubscribed listeners are not called.
- `consentSnapshot()` returns the identical object (`toBe`) on two calls without a cookie change, and a different one
  after `writeConsent`.
- A cookie with `v: 1` while config version is 2 → `hasConsent("analytics", config)` → `false`.
- Hook: `renderHook(() => useCookieConsent(config))` → after mount `ready` `true`, `needsChoice` `true`,
  `choices` `{}`, `categories` `["analytics", "marketing"]`; `act(() => result.current.acceptAll())` →
  `needsChoice` `false`, `choices` `{ analytics: true, marketing: true }`, `hasConsent("marketing")` `true`;
  `rejectAll()` → both `false`; `save({ marketing: true })` → `{ analytics: false, marketing: true }`.
- Hook with config `{ cookieCategories: [], consentVersion: 1 }` → `needsChoice` `false`.
- Two hooks rendered at once: `acceptAll` in one updates `choices` in the other (shared store).
- Hook during server render (`renderToString` of a component printing `String(ready)`) → `"false"`.
- `ConsentGate`: no consent → renders `fallback` (or nothing); after `writeConsent({ analytics: true })` (inside
  `act`) the children appear without a remount; `renderToString` with a granted cookie still renders no children
  (server render never shows gated content).

### Mutations to kill

- `hasConsent` reading the record without validating it against the config.
- Listeners not notified after a write, or notified after unsubscribe.
- `Secure` decided by something other than `location.protocol === "https:"`.
- Snapshot recomputed on every call (would loop `useSyncExternalStore`; a test with `toBe` catches it).
- `ConsentGate` rendering children on the server or while not `ready`.
- `acceptAll`/`rejectAll` swapped or writing only some categories.

## Task 3 — cookie banner

Files: `src/features/legal/components/cookie-banner.tsx` (`"use client"`),
`src/features/legal/components/cookie-settings-button.tsx` (`"use client"`),
`src/features/legal/components/cookie-banner-slot.tsx` (server, default export for the slot),
`src/features/legal/slots.ts`.

```ts
export function CookieBanner(props: { config?: LegalConfig; privacyHref?: string }): ReactNode;
export function CookieSettingsButton(props: { config?: LegalConfig; variant?: "link" | "button"; label?: "footer" | "page" }): ReactNode; // nothing when no categories
export default function CookieBannerSlot(props: { organizationId: string }): ReactNode;
export const slots: SlotContribution[]; // [defineContribution("app.header.actions", { id: "legal.cookie-banner", priority: 1000, component: () => import("./components/cookie-banner-slot") })]
```

### Behaviours (pl messages; config = analytics + marketing, version 2 unless stated)

- Config with no categories → the banner renders nothing (`container` empty), also with no cookie.
- No cookie → `getByRole("dialog", { name: "Pliki cookie" })`, with `aria-modal="false"` and an accessible description
  starting with `Używamy niezbędnych plików cookie`; buttons `Akceptuj wszystkie`, `Odrzuć wszystkie`, `Wybierz`.
- The three buttons have the identical `className` (equal prominence).
- Server render (`renderToString`) with no cookie → output contains no `Pliki cookie` (banner appears after mount).
- `Odrzuć wszystkie` → dialog gone; `hasConsent("analytics", config)` `false`, `hasConsent("marketing", config)` `false`,
  and a valid record exists (`readConsent()` not `null`).
- `Akceptuj wszystkie` → dialog gone; both granted.
- `Wybierz` → checkboxes `Analityczne` and `Marketingowe` unchecked and enabled, `Niezbędne` checked and disabled;
  focus is on `Analityczne`; button `Zapisz wybór` present; checking `Marketingowe` and clicking `Zapisz wybór` →
  dialog gone, `marketing` granted, `analytics` not.
- Keyboard: `userEvent.tab()` from the body reaches `Akceptuj wszystkie` → `Odrzuć wszystkie` → `Wybierz` in this order
  (no `tabindex` > 0); `Enter` on a focused button triggers it.
- Focus restore: a button `Before` focused before the banner opens (render the banner after focusing it, then the
  banner does not steal focus on first appearance); after `Odrzuć wszystkie` focus is on `Before`.
- A valid cookie (`v: 2`, both decided) → no dialog. A cookie with `v: 1` → dialog.
- With a valid cookie `{ analytics: true, marketing: false }`, `act(() => openCookieSettings())` → dialog opens in the
  choose view: `Analityczne` checked, `Marketingowe` unchecked, a `Zamknij` button; the dialog heading has focus;
  `Escape` closes it, the cookie is unchanged, focus returns to the element focused before `openCookieSettings`.
- `Escape` in the first-visit banner (no cookie) does nothing: the dialog stays.
- `privacyHref="/privacy"` → a link `Polityka prywatności` with `href` `/privacy` inside the dialog.
- `CookieSettingsButton` with categories → a button `Ustawienia cookies` (`label="footer"`) or
  `Zmień ustawienia cookies` (`label="page"`); clicking it calls the `onOpenCookieSettings` listeners; with no
  categories → nothing.
- `slots` has one contribution: `slot` `"app.header.actions"`, `id` `"legal.cookie-banner"`, `priority` `1000`,
  no `roles`.

### Mutations to kill

- One button styled as primary (className differs).
- Banner rendered on the server or when categories are empty.
- `Escape` dismissing the first-visit banner (would hide it without a decision).
- Focus not restored, or moved into the banner on first appearance.
- Checkboxes pre-checked on first visit; `Niezbędne` toggleable.
- Settings view not pre-filled from the stored record.

## Task 4 — documents and pages

Files: `src/features/legal/services/legal-documents.ts`, `src/features/legal/components/legal-document-page.tsx`
(server), `src/app/[locale]/(legal)/layout.tsx`, `terms/page.tsx`, `privacy/page.tsx`, content and config (seeds later)
`src/features/legal/content/{index.ts,terms.pl.tsx,terms.en.tsx,privacy.pl.tsx,privacy.en.tsx}`,
`src/features/legal/legal.config.ts`.

```ts
export type LegalDocumentKey = "terms" | "privacy";
export type LegalDocumentModule = { default: ComponentType; updatedAt: string };
export type LegalDocumentLoaders = Record<LegalDocumentKey, Partial<Record<string, () => Promise<LegalDocumentModule>>>>;
export class LegalDocumentMissingError extends Error {}   // name "LegalDocumentMissingError"
export async function resolveLegalDocument(
  document: LegalDocumentKey, locale: string, loaders?: LegalDocumentLoaders, fallbackLocale?: string,
): Promise<{ Content: ComponentType; updatedAt: string; locale: string }>;
// loaders default to legalDocuments from "../content", fallbackLocale to defaultLocale
export async function LegalDocumentPage(props: { document: LegalDocumentKey; locale: string }): Promise<ReactNode>;
```

### Behaviours

- Loaders `{ terms: { pl: A, en: B }, privacy: { pl: C } }`: `("terms", "en")` → `B`'s content, `locale` `"en"`;
  `("privacy", "en", loaders, "pl")` → `C`'s content, `locale` `"pl"`; `("terms", "de", loaders, "pl")` → `A`, `"pl"`;
  only the chosen loader is called (spies).
- `{ terms: {}, privacy: {} }`, `("terms", "en", loaders, "pl")` → rejects with `LegalDocumentMissingError`, message
  `No legal document "terms" for locale en or pl`.
- The shipped content map has `pl` and `en` for both documents, and each module has a non-empty `updatedAt` matching
  `/^\d{4}-\d{2}-\d{2}$/`.
- `LegalDocumentPage({ document: "privacy", locale: "pl" })` rendered → heading level 1 `Polityka prywatności`, text
  `Ostatnia aktualizacja: ` followed by the formatted `updatedAt`, the content inside `<article>`.
- Privacy content (`pl` and `en`) mentions every essential cookie name from the spec table:
  `better-auth.session_token`, `better-auth.session_data`, `better-auth.dont_remember`, `NEXT_LOCALE`, `cookie_consent`.
- Page `terms/page.tsx` and `privacy/page.tsx`: with the module disabled (`isModuleEnabled("legal")` → `false`,
  mocked registry without `legal`) the page calls `notFound()`; enabled → renders `LegalDocumentPage` with its document.
- `legal.config.ts`: `legalConfig` equals `{ cookieCategories: [], consentVersion: 1 }`.
- No content or config file contains `WA App`, `wa-app` or `wa_app` (placeholders check).

### Mutations to kill

- Fallback skipped (missing locale → error instead of default locale), or fallback used although the locale exists.
- `notFound()` check removed from a page.
- Every loader called instead of only the chosen one.

## Task 5 — module wiring, manifest, docs (no new tests beyond the architecture suite)

- `src/features/legal/module.ts`: `defineModule({ key: "legal", public: true, routePrefixes: ["/terms", "/privacy"],
  nav: [{ id: "legal.privacy", href: "/privacy", labelKey: "nav-privacy", icon: "shield", order: 900 },
  { id: "legal.terms", href: "/terms", labelKey: "nav-terms", icon: "file-text", order: 910 }] })`.
  A test pins the nav ids, hrefs, orders and `public: true`.
- `src/features/legal/extension-points.json`: module (stable) and both nav ids (stable).
- `kit/modules/legal.json` 0.1.0, files `src/features/legal/**`, `src/app/[locale]/(legal)/**`; no `seedFiles`
  change in v1 (open question 0); `.github/workflows/kit.yml` assemble matrix: `legal`, and `legal` in `all`.
- `npm run wa -- generate`, `npm run wa -- kit sync`, `git diff --exit-code` after both.
- `docs/18-legal-module.md` (usage: editing content, declaring categories, gating scripts, a11y, limits) and the line in
  `docs/README.md`/`docs/12-moduly-kitu.md` where modules are listed.

### Gates

`npm run verify`; `npm run test:mutation:task -- <task files>` (concurrency 3); `npm run test:mutation:gate`;
created projects `core + legal` and `all` with their own `npm ci` and `npm run verify`; replay with `legal` disabled
in `src/gato.config.ts` (`modules: { legal: { enabled: false } }`) → `/privacy` 404, `generate` clean, build passes.

---

# Revision 2: Patryk's decisions (2026-11-27)

Decisions are recorded in the spec ("Decisions"). Tasks below follow the same rules (literals, mutations to kill,
`test-writer` first). Core changes (Tasks 6–7) go in their own commits with a core **minor** bump (0.36.1 → 0.37.0).

## Task 6 — core slots `app.root`, `app.sidebar.footer`, `auth.footer` (core)

All three are **server** slots, catalogued `experimental` (ADR-63).

```ts
// src/shared/lib/modules/slots.ts
interface SlotContextMap {
  "app.header.actions": { organizationId: string };
  "app.root": { locale: string };
  "app.sidebar.footer": { organizationId: string };
}
export const coreSlotDefinitions = [
  { id: "app.header.actions", kind: "server" },
  { id: "app.root", kind: "server" },
  { id: "app.sidebar.footer", kind: "server" },
];

// src/features/auth/slots.ts (new; auth is a core feature module)
declare module "@/shared/lib/modules/slots" { interface SlotContextMap { "auth.footer": { locale: string } } }
export const slotDefinitions = [defineSlot("auth.footer", { kind: "server" })];

// src/shared/lib/modules/slot-access.ts
export function anonymousViewer(multiOrg: boolean): AccessContext; // { userRole: "user", orgRole: null, multiOrg }
```

Rendering:
- `src/app/[locale]/layout.tsx`: after `{children}` (inside `NextIntlClientProvider`), `<Slot id="app.root" context={{ locale }} viewer={anonymousViewer(env.MULTI_ORG)} />`. The viewer is anonymous on purpose: the root layout does not read the session, so only contributions of `public` modules without `roles` render there.
- `src/app/[locale]/(auth)/layout.tsx`: below the page, `<footer>` containing `<Slot id="auth.footer" context={{ locale }} viewer={anonymousViewer(env.MULTI_ORG)} />`; the `<footer>` element is rendered only when the slot renders something (use `fallback`/wrapper so an empty slot leaves no empty landmark: render the footer element inside the contribution is not allowed, so the layout renders `<footer>` only when `visibleContributions(moduleSlots, "auth.footer", viewer).length > 0`).
- `src/app/[locale]/(app)/layout.tsx`: passes `footer={<Slot id="app.sidebar.footer" context={{ organizationId }} viewer={accessContext} />}` to `AppSidebar`; `AppSidebar` gets an optional `footer?: ReactNode` prop rendered below the user menu, only when the sidebar is not collapsed.
- Catalog: `src/shared/lib/modules/extension-points.json` gains `app.root` ("Server contributions rendered once at the end of every page, for an anonymous viewer (public modules only)") and `app.sidebar.footer` ("Server contributions under the user menu of the app sidebar, rendered with the organization id"), `src/features/auth/extension-points.json` gains `slots.auth.footer` ("Server contributions in the footer of the sign-in, sign-up and password pages, for an anonymous viewer"); all `experimental`.

### Behaviours
- `coreSlotDefinitions` equals the three literals above, in that order.
- `anonymousViewer(true)` → `{ userRole: "user", orgRole: null, multiOrg: true }`.
- A non-public module's contribution to `app.root` is not rendered for the anonymous viewer; a public module's contribution without roles is; a public module's contribution with `roles: ["owner"]` is not.
- `AppSidebar` with `footer={<p>Footer</p>}` renders `Footer`; collapsed → not rendered; without the prop → nothing extra.
- Auth layout: with a visible contribution the page has a `contentinfo` landmark containing it; without any → no `contentinfo`.
- Locale layout renders the `app.root` contributions after the children.
- Generated registry includes `auth` slots (`npm run wa -- generate`).

### Mutations to kill
- `app.root` rendered with the real session viewer or a non-anonymous role; `orgRole` not `null` in `anonymousViewer`.
- Sidebar footer rendered while collapsed; empty `<footer>` landmark in the auth layout.

## Task 7 — seed files (core test + kit config)

`kit/kit.json` `seedFiles` += `src/features/legal/legal.config.ts`, `src/features/legal/content/index.ts`,
`src/features/legal/content/{terms,privacy}.{pl,en}.tsx`; `seed-files-are-declared.test.ts` pins the full new list.
Tests that assert the **content** of these seed files (`content.test.tsx`: shipped map, `updatedAt`, cookie names,
`legalConfig` value) run only in the kit repo (`describe.runIf(fs.existsSync(<repo>/kit/kit.json))`), because a
project owns and edits them.

## Task 8 — legal module: slots instead of nav, configurable cookie

- `module.ts`: `nav: []` (decision 3); `extension-points.json` drops `nav`.
- `slots.ts`:
  - `legal.cookie-banner` → slot `app.root`, priority 1000, component `cookie-banner-slot` (renders `<CookieBanner privacyHref="/privacy" />`);
  - `legal.auth-footer-links` → `auth.footer`, priority 100, component `legal-links-slot`;
  - `legal.sidebar-footer-links` → `app.sidebar.footer`, priority 100, component `legal-links-slot`.
  The `app.header.actions` contribution is removed. The legal layout no longer renders its own `CookieBanner` (the root slot does).
- `components/legal-links.tsx` (`"use client"`): `LegalLinks({ config?, className? })` → `<nav aria-label="Informacje prawne">` with links `Regulamin` → `/terms`, `Prywatność` → `/privacy` and, only with declared categories, the `Ustawienia cookies` button; `legal-links-slot.tsx` default export renders `<LegalLinks />`.
- Config (decision 5): `LegalConfig` gains optional `consentCookieName?: string` and `consentMaxAgeDays?: number`; `defineLegalConfig` validates with a Zod schema in `src/features/legal/contracts/legal-config.schemas.ts` and returns them filled with defaults `"cookie_consent"` and `180`.
  - name: `/^[A-Za-z0-9_-]{1,64}$/`, else `LegalConfigError` with `consentCookieName must be 1-64 letters, digits, _ or -`;
  - days: integer 1–395, else `consentMaxAgeDays must be an integer from 1 to 395`;
  - existing messages unchanged (`duplicate cookie category: analytics`, `unknown cookie category: tracking`, `consentVersion must be a positive integer`).
- `consent-record.ts`: `consentCookieValue(cookieHeader, name = CONSENT_COOKIE_NAME)`;
  `consentCookieString(record, { secure, name?, maxAgeSeconds? })` (defaults `cookie_consent`, `15552000`).
- `consent-store.ts`: reads and writes the cookie named `config.consentCookieName ?? "cookie_consent"` with
  `Max-Age = (config.consentMaxAgeDays ?? 180) * 86400`; `consentSnapshot(config?)` caches by name and raw value.
  A cookie under another name is ignored: after renaming, every visitor is asked again.

### Behaviours
- `defineLegalConfig({ cookieCategories: [], consentVersion: 1 })` → `{ cookieCategories: [], consentVersion: 1, consentCookieName: "cookie_consent", consentMaxAgeDays: 180 }`.
- `{ …, consentCookieName: "acme_consent", consentMaxAgeDays: 30 }` → kept.
- names `""`, `"a b"`, `"a;b"`, `"ä"`, 65 × `a` → throw; `"a"`, `"A-1_b"`, 64 × `a` → accepted.
- days `0`, `396`, `1.5`, `-1` → throw; `1`, `395` → accepted.
- `consentCookieValue("cookie_consent=x; acme=y", "acme")` → `"y"`; `consentCookieValue("cookie_consent=x", "acme")` → `undefined`.
- `consentCookieString({ version: 1, choices: {}, decidedAt: 1 }, { secure: false, name: "acme", maxAgeSeconds: 86400 })` →
  `"acme=%7B%22v%22%3A1%2C%22c%22%3A%7B%7D%2C%22t%22%3A1%7D; Path=/; Max-Age=86400; SameSite=Lax"`.
- Store with config `{ cookieCategories: ["analytics"], consentVersion: 1, consentCookieName: "acme", consentMaxAgeDays: 30 }`:
  `writeConsent({ analytics: true }, config, 1)` writes a string starting `acme=` and containing `Max-Age=2592000`;
  `hasConsent("analytics", config)` → `true`; with a valid `cookie_consent` cookie only → `false`.
- `slots` literal list: three contributions as above (slot, id, priority, no roles); no `app.header.actions` contribution.
- `LegalLinks`: links and hrefs as above; no settings button with no categories; the button opens the settings.
- `module.nav` is `[]`.

### Mutations to kill
- name or max age ignored (always the default), `* 86400` dropped, snapshot cache not keyed by name.
- Zod bounds off by one (0/1, 395/396, 64/65 chars).
- Cookie settings button shown without categories.

## Task 9 — terms acceptance at sign-up (decision 7): follow-up only

Enforcing acceptance needs a field in the core sign-up form (`sign-up-form.tsx` has a fixed Zod schema and payload, no
slot) and a way to send it with `authClient.signUp.email`. That core extension point does not exist, so nothing is
implemented; the spec and PR record the follow-up.
