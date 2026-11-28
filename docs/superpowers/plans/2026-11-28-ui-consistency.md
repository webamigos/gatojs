# UI consistency: editable display name, API key dialog controls, one page header

Findings from a browser test of a fresh project with all modules:

1. The account page shows the display name (it defaults to the local part of the email, e.g. `hello`) and offers no way to change it.
2. In the "New key" dialog of `api-keys`, the unchecked scope checkbox is barely visible (`border-input` is `#d7dde8` on a white dialog) and the expiry options are native browser radios.
3. Page headers differ: Users has a card header with an icon and a description; API keys, Account, Audit log and Dashboard have a plain `<h1>` with different weights (`font-bold` and `font-semibold`).

Out of scope: a language switcher (there is none today; see "Language switcher" at the end).

## Decisions

- **The name change is a user-level server action, not an organization command.** The display name belongs to the user, not to organization data, so the action does not call `getOrgContext()` or `assertServiceModeConfirmed`. It works like `changePasswordCommand`: it checks the better-auth session, validates the input with Zod and calls `auth.api.updateUser`. It starts with `requireModuleEnabled("account")` (AGENTS.md: a module server action without `requireModuleAccess` checks that its module is enabled).
- **It emits no domain event and writes no audit row** ([ADR-71](../../adrs/71-account-profile-changes-emit-no-organization-event.md)). ADR-61 events and audit rows carry the organization of their origin. A user's name is not organization data: emitting it under the session's active organization would show one organization a change that applies to every membership, and with `MULTI_ORG=true` the choice of organization would depend on whichever one was active. The queued gap "account changes emit nothing" stays open until there is a user-scoped event channel. Password changes behave the same way today.
- **One shared `PageHeader`** in `src/shared/components/page-header.tsx`: title (`<h1>`), optional description, optional actions. No icon, so every page looks the same; the Users icon goes. The page or the client manager that owns the actions renders it.
- **Shadcn base-ui `RadioGroup`** in `src/components/ui/radio-group.tsx` (style `base-nova`, `@base-ui/react/radio-group` and `@base-ui/react/radio`). The `Checkbox` component gets a stronger unchecked border, which helps every checkbox, not only the dialog.

## Files and signatures

Core (`kit/modules/core.json`, minor bump):

- `src/shared/components/page-header.tsx` (new):
  `export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }): JSX.Element`.
  It renders `<header data-slot="page-header">` with an `<h1>` holding the title, a `<p>` with the description only when one is given, and a wrapper with the actions only when they are given. No `"use client"` and no server-only imports, so server pages and client managers can both use it.
- `src/components/ui/radio-group.tsx` (new): `RadioGroup` (props of `RadioGroupPrimitive`) and `RadioGroupItem` (props of `RadioPrimitive.Root`), `data-slot="radio-group"` / `"radio-group-item"`.
- `src/components/ui/checkbox.tsx`: unchecked border `border-muted-foreground/50` instead of `border-input` (visual change only).
- `src/features/account/contracts/account.schemas.ts` (new):
  `export const accountNameSchema = z.object({ name: z.string().trim().min(1).max(100) })`, `export type AccountNameValues = z.infer<typeof accountNameSchema>`.
- `src/features/account/services/commands/update-account-name-command.ts` (new, `"use server"`):
  `export async function updateAccountNameCommand(input: unknown): Promise<OperationResult<{ name: string }>>`.
  Order: `requireModuleEnabled("account")` → `accountNameSchema.safeParse(input)` (invalid → `{ success: false, error: "Podaj imię i nazwisko (od 1 do 100 znaków)." }`, no better-auth call) → `auth.api.getSession({ headers })` (`null` → `{ success: false, error: "Sesja wygasła. Zaloguj się ponownie." }`, no update) → `auth.api.updateUser({ body: { name }, headers })` with the trimmed name → `{ success: true, data: { name } }`. Any thrown error → `handleCommandError(error, "Nie udało się zapisać imienia i nazwiska.")`.
- `src/features/account/components/account-name-form.tsx` (new, `"use client"`):
  `export function AccountNameForm({ defaultName }: { defaultName: string })`. `react-hook-form` with `zodResolver(accountNameSchema)`; input `id="account-name"` labelled `t("name")`; submit button `t("save-name")`. Success: `toast.success(t("name-saved"))` and `router.refresh()` (from `@/i18n/routing`). Failure: `toast.error(result.error)`. Invalid value: `t("name-invalid")` under the input, no command call.
- `src/features/account/components/account-details.tsx`: no `<h1>`; the card shows `AccountNameForm` (default value `name ?? ""`) and the read-only email.
- `src/features/account/i18n/{pl,en}.json`: `description`, `save-name`, `name-saved`, `name-invalid`.
- `src/app/[locale]/(app)/account/page.tsx`: `PageHeader` with `t("title")` and `t("description")` above `AccountDetails`; slot `account.sections` unchanged.
- `src/app/[locale]/(app)/dashboard/page.tsx`: `PageHeader` with `t("title")`; slot `dashboard.sections` and its fallback unchanged.
- `src/features/users/components/users-manager.tsx`: `PageHeader` with `t("title")`, `t("description")` and `<InviteUserDialog viewer={viewer} />` as actions, then a `Card` with the table. The `users.invite-dialog` handle and both users slots keep working.
- `src/features/organizations/components/organization-members.tsx`: `PageHeader` with the organization name instead of the bare `<h1>`.

`api-keys` (`kit/modules/api-keys.json`, minor bump):

- `src/features/api-keys/components/api-keys-manager.tsx`: `PageHeader` with `t("title")`, `t("description")` and the "New key" button as actions; the expiry options use `RadioGroup` (labelled by the "Expiry" legend, values `"30" | "90" | "365" | "never"` mapped to `30 | 90 | 365 | null`) with one labelled `RadioGroupItem` each. Scope checkboxes stay the shared `Checkbox` with a `Label`.
- `src/app/[locale]/(app)/api-keys/page.tsx`: no `<h1>` of its own.
- `src/features/api-keys/i18n/{pl,en}.json`: `description`.

`audit-logs` (`kit/modules/audit-logs.json`, patch bump):

- `src/app/[locale]/(app)/audit-log/page.tsx`: `PageHeader` with `t("title")` and `t("description")`.
- `src/features/audit-logs/i18n/{pl,en}.json`: `description`.

## New strings

| Namespace.key | pl | en |
| --- | --- | --- |
| `account.description` | Zarządzaj swoimi danymi i hasłem. | Manage your details and password. |
| `account.save-name` | Zapisz | Save |
| `account.name-saved` | Zapisano imię i nazwisko | Name saved |
| `account.name-invalid` | Podaj imię i nazwisko (od 1 do 100 znaków). | Enter a name (1 to 100 characters). |
| `api-keys.description` | Klucze dostępu do API organizacji. Sekret widać tylko raz, przy tworzeniu klucza. | Keys for the organization API. The secret is shown only once, when the key is created. |
| `audit-logs.description` | Historia zmian w organizacji. | History of changes in the organization. |

## Behaviours

PageHeader:

- `title="Klucze API"` → one heading of level 1 with the text `Klucze API`.
- `description="Opis"` → the text `Opis` is rendered; without `description` no `<p>` is rendered inside the header.
- `actions={<button>Nowy</button>}` → the button `Nowy` is rendered inside the header; without `actions` the header holds only the title block.

`accountNameSchema`:

- `{ name: "  Jan Kowalski  " }` → `{ name: "Jan Kowalski" }`.
- `{ name: "" }`, `{ name: "   " }`, `{}`, `{ name: 5 }` → fail.
- a name of 100 characters passes; 101 characters fail.
- property: for any string whose trimmed length is from 1 to 100, `parse` returns its trimmed form; a string of whitespace only always fails.

`updateAccountNameCommand`:

- valid session, input `{ name: "  Jan Kowalski  " }` → `auth.api.updateUser` called once with `body: { name: "Jan Kowalski" }` (and headers); result `{ success: true, data: { name: "Jan Kowalski" } }`.
- input `{ name: "" }`, `{ name: "a".repeat(101) }`, `null`, `"Jan"` → `{ success: false, error: "Podaj imię i nazwisko (od 1 do 100 znaków)." }`; `updateUser` not called.
- no session (`getSession` → `null`) → `{ success: false, error: "Sesja wygasła. Zaloguj się ponownie." }`; `updateUser` not called.
- `updateUser` throws → `{ success: false, error: "Nie udało się zapisać imienia i nazwiska." }`.
- `account` module disabled (`requireModuleEnabled` throws `ModuleDisabledError`) → `{ success: false, error: "Nie udało się zapisać imienia i nazwiska." }`; neither `getSession` nor `updateUser` called.
- the input object is not trusted for anything but the name: `{ name: "Jan", email: "x@y.z", role: "admin" }` → `updateUser` body is exactly `{ name: "Jan" }`.
- the architecture tests (`server-entrypoints-guard`, `module-entry-points-check-enabled`) pass with the new file and without new exceptions.

`AccountNameForm`:

- `defaultName="hello"` → the textbox labelled `Imię i nazwisko` has the value `hello`.
- change to `Jan Kowalski` and submit → `updateAccountNameCommand` called with `{ name: "Jan Kowalski" }`; on `{ success: true }` the toast `Zapisano imię i nazwisko` and `router.refresh()`.
- command returns `{ success: false, error: "Błąd X" }` → `toast.error("Błąd X")`, no refresh.
- cleared field and submit → the message `Podaj imię i nazwisko (od 1 do 100 znaków).` (i18n key `name-invalid`), the command not called.

Pages and managers:

- Account page → one level-1 heading `Konto`, the description, the name form with the user's name, the change-password form and the `account.sections` slot with `{ userId }`.
- Dashboard page → one level-1 heading `Dashboard`; the slot and its fallback unchanged.
- `UsersManager` → one level-1 heading `Użytkownicy`, the description, the invite button inside the page header; the table and the contributed columns and row actions still render; the `users.invite-dialog` override still replaces the dialog.
- `OrganizationMembers` → one level-1 heading with the organization name.
- `ApiKeysManager` → one level-1 heading `Klucze API`, the description, and the button `Nowy klucz` inside the page header.
- In the "New key" dialog: a `radiogroup` named `Wygaśnięcie` with four radios `30 dni`, `90 dni`, `365 dni`, `Bez wygaśnięcia`; `90 dni` is checked at start; choosing `Bez wygaśnięcia` sends `expiresInDays: null`, choosing `30 dni` sends `30`, leaving the default sends `90`; no native `input[type=radio]` is visible (base-ui renders a hidden input only).
- Scope checkboxes are reachable by role `checkbox` with the scope label as name; toggling sends `scopes: ["organization:read"]`.
- Audit log page → one level-1 heading `Dziennik zdarzeń` and the description.

## Mutations to kill

- `updateAccountNameCommand`: removing the session check; removing `safeParse` (passing raw input through); dropping `.trim()`; changing `max(100)` or `min(1)`; spreading the whole input into the `updateUser` body; returning `success: true` without `data`; returning success when `updateUser` throws; removing `requireModuleEnabled("account")` or moving it after `updateUser`.
- `AccountNameForm`: calling the command without the form value; skipping `router.refresh()` on success; showing the success toast on failure.
- `PageHeader`: always rendering the description `<p>` or the actions wrapper; rendering the title in something other than `<h1>`.
- `ApiKeysManager`: mapping `"never"` to anything other than `null`; changing the default from 90; dropping the radiogroup label.

## Verification

- `npm test` on the touched tests; `npm run lint`; `npm run typecheck`.
- `npm run test:mutation:task -- src/features/account/services/commands/update-account-name-command.ts,src/features/account/contracts/account.schemas.ts,src/features/account/components/account-name-form.tsx,src/shared/components/page-header.tsx,src/features/api-keys/components/api-keys-manager.tsx` (`--concurrency 4`), then `npm run test:mutation:gate`.
- `npm run wa -- kit sync`, `npm run wa -- generate`, `git diff --exit-code`; one `npm run verify`.
- Screenshots before and after of the account, users, API keys (with the dialog), audit log and dashboard pages, from a built app on a throwaway Postgres container.

## Language switcher

There is none: no component switches the locale, and no slot sits in the user menu or the auth layout. Proposal (separate task): a `LocaleSwitcher` client component (it keeps the path through `usePathname`/`useRouter` from `@/i18n/routing` and swaps the locale) in the sidebar user menu of `src/shared/components/app-sidebar.tsx`, plus a new `auth.footer` slot in `src/app/[locale]/(auth)/layout.tsx` with the same switcher as its default contribution, so signed-out users can change the language too. It shows only when `locales.length > 1`.
