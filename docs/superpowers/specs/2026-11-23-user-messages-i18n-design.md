# End-user messages through next-intl

Date: 2026-11-23. Follow-up to #82 (developer-facing messages in English).

## Why

The UI is translated (`pl`, `en`), but some end-user text is hardcoded Polish: command errors shown in toasts,
better-auth errors, emails, the default organization name and `DataTable` labels. An English user sees Polish.

## Locale resolution

| Context | Locale |
| --- | --- |
| Server action / command (page route, next-intl middleware ran) | `currentLocale()` |
| better-auth hooks and callbacks under `/api/auth` (no next-intl middleware) | `localeFromHeaders(headers)` |
| Client component | `useTranslations` |

Emails use the locale of the request that sends them (the person resetting a password; the admin who invites).
There is no per-user locale preference yet.

## API

`src/i18n/server-locale.ts`

- `currentLocale(): Promise<AppLocale>`: next-intl `getLocale()`; returns `routing.defaultLocale` when it throws or returns a
  locale not in `routing.locales`.
- `localeFromHeaders(headers: Headers | null | undefined): AppLocale`, in order:
  1. cookie `NEXT_LOCALE` if it is a supported locale;
  2. the first path segment of the `Referer` URL if it is a supported locale (`https://x/en/sign-in` → `en`);
  3. `routing.defaultLocale`.
  Unparseable `Referer`, unknown values and missing headers fall through to the next step.

`src/i18n/server-translator.ts`

- `getTranslator(locale: AppLocale, namespace: string): Promise<(key: string, values?: Record<string, string | number>) => string>`:
  next-intl `createTranslator` over the same merged messages as `src/i18n/request.ts` (core + module messages). Move the
  loading code into one shared function so both use it.

`AppLocale` is the union of `routing.locales`.

`src/shared/utils/error-handling.ts`

- `DomainError` gets an optional translation: `new DomainError(message, { key, namespace?, values? })` (namespace defaults to
  `errors`). Existing `new DomainError(message)` keeps working.
- `handleCommandError(error, defaultMessage)` becomes `async` and returns `Promise<OperationResult<never>>`. For a `DomainError`
  with a translation it returns the text translated in `currentLocale()`; otherwise `error.message` as before. Callers already
  `return` it from async functions.
- `ServiceModeConfirmationError` uses key `errors.serviceModeConfirmationRequired`.

Mailer (`src/shared/lib/mailer.ts`): `sendPasswordResetEmail`, `sendWelcomeSetPasswordEmail`, `sendOrganizationInvitationEmail`
take a required `locale: AppLocale`; subject and template text come from namespace `emails` in that locale. Templates take the
translated strings (or a translator) as props; no Polish literals stay in `src/app/emails/`.

`DataTable` (`src/components/ui/data-table.tsx`): label props stay overridable; defaults come from `common.dataTable` via
`useTranslations`.

## Messages

Core `src/app/messages/{pl,en}.json`. Module strings go to the module's own `src/features/<x>/i18n/{pl,en}.json` (a module does
not edit core files).

### `errors` (core)

| Key | pl | en |
| --- | --- | --- |
| `serviceModeConfirmationRequired` | Potwierdź zmianę w trybie serwisowym | Confirm the change in service mode |
| `noPermission` | Brak uprawnień | You don't have permission to do this |
| `invalidData` | Nieprawidłowe dane | Invalid data |
| `sessionExpired` | Sesja wygasła. Zaloguj się ponownie. | Your session has expired. Sign in again. |
| `changePasswordFailed` | Nie udało się zmienić hasła. Sprawdź aktualne hasło. | Couldn't change the password. Check your current password. |
| `userExists` | Użytkownik z tym adresem już istnieje | A user with this email already exists |
| `inviteFailed` | Nie udało się zaprosić użytkownika | Couldn't invite the user |
| `impersonationLogFailed` | Nie udało się zapisać zdarzenia impersonacji | Couldn't record the impersonation event |
| `noOrganizationAccess` | Brak dostępu do organizacji | You don't have access to this organization |
| `signupDisabled` | Rejestracja jest wyłączona | Sign-up is disabled |
| `invitationInvalid` | Zaproszenie jest nieprawidłowe lub wygasło | The invitation is invalid or has expired |
| `superadminRoleOnlyBySuperadmin` | Rolę superadmin może nadać tylko superadmin | Only a superadmin can grant the superadmin role |
| `impersonationForbidden` | Brak uprawnień do podszycia się pod tego użytkownika | You can't sign in as this user |
| `serviceAccountOnlyBySuperadmin` | Konto serwisowe może zmieniać tylko superadmin | Only a superadmin can change a service account |
| `accountForbidden` | Brak uprawnień do tego konta | You don't have permission to change this account |
| `orgManagementRequiresAdmin` | Zarządzanie organizacją wymaga roli administratora | Managing the organization requires the admin role |

The last six come from better-auth hooks (`signup-policy.ts`, `signup-membership.ts`, `admin-access.ts`,
`single-org-guard.ts`) and use `localeFromHeaders` with the hook's request headers.

### `common` (core)

| Key | pl | en |
| --- | --- | --- |
| `defaultOrganizationName` | `{name} — organizacja` | `{name}'s organization` |
| `dataTable.rowsPerPage` | Wierszy na stronę | Rows per page |
| `dataTable.previous` | Poprzednia | Previous |
| `dataTable.next` | Następna | Next |
| `dataTable.noResults` | Brak wyników. | No results. |

`defaultOrganizationName` replaces `` `${userName} — organizacja` `` in `signup-membership.ts` (locale from the sign-up request).
The slug fallback `organizacja` in `organization-slug.ts` is URL data and stays.

### `emails` (new core namespace)

| Key | pl | en |
| --- | --- | --- |
| `passwordReset.subject` | Zresetuj hasło | Reset your password |
| `passwordReset.intro` | Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta. | We received a request to reset the password for your account. |
| `passwordReset.instruction` | Kliknij poniższy przycisk, aby ustawić nowe hasło: | Click the button below to set a new password: |
| `passwordReset.cta` | Zresetuj hasło | Reset password |
| `passwordReset.footer` | Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość. Link wygaśnie za 48 godzin. | If you didn't ask to reset your password, ignore this email. The link expires in 48 hours. |
| `welcome.subject` | Witamy w {appName} | Welcome to {appName} |
| `welcome.greeting` | Cześć {name}, | Hi {name}, |
| `welcome.greetingNoName` | Cześć, | Hi, |
| `welcome.body` | Utworzono dla Ciebie konto w {appName}. Aby dokończyć zakładanie konta, ustaw swoje hasło: | An account was created for you in {appName}. To finish setting it up, set your password: |
| `welcome.cta` | Ustaw hasło | Set password |
| `welcome.footer` | Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją. Link jest ważny przez 48 godzin. | If you weren't expecting this email, ignore it. The link is valid for 48 hours. |
| `invitation.subject` | Zaproszenie do {organizationName} | Invitation to {organizationName} |
| `invitation.greeting` | Cześć, | Hi, |
| `invitation.bodyWithInviter` | {inviterName} zaprasza Cię do organizacji {organizationName}. | {inviterName} invited you to join {organizationName}. |
| `invitation.body` | Zaproszono Cię do organizacji {organizationName}. | You've been invited to join {organizationName}. |
| `invitation.cta` | Przyjmij zaproszenie | Accept invitation |
| `invitation.footer` | Jeśli nie spodziewałeś się tej wiadomości, zignoruj ją. | If you weren't expecting this email, ignore it. |

`emails` joins the reserved core namespaces (`common`, `errors`, `sidebar`, `serviceMode`), so a feature can't use it.

### Module `api-keys` (`errors.*` in its i18n files)

| Key | pl | en |
| --- | --- | --- |
| `errors.keyNotFound` | Nie znaleziono klucza | Key not found |
| `errors.keyLimitReached` | Osiągnięto limit 10 aktywnych kluczy | You've reached the limit of 10 active keys |
| `errors.createFailed` | Nie udało się utworzyć klucza | Couldn't create the key |
| `errors.revokeFailed` | Nie udało się unieważnić klucza | Couldn't revoke the key |
| `errors.deleteFailed` | Nie udało się usunąć klucza | Couldn't delete the key |

### Module `uploads` (`errors.*` in its i18n files)

| Key | pl | en |
| --- | --- | --- |
| `errors.deleteFailed` | Nie udało się usunąć pliku | Couldn't delete the file |
| `errors.noDeletePermission` | Brak uprawnień do usunięcia pliku | You don't have permission to delete this file |

## Behaviors (input → expected)

1. `localeFromHeaders`: cookie `NEXT_LOCALE=en` → `en`; cookie `NEXT_LOCALE=de`, Referer `https://app.test/en/users` → `en`;
   no cookie, Referer `https://app.test/users` → `pl`; Referer `not a url` → `pl`; `undefined` → `pl`; cookie `pl` and Referer
   `/en/...` → `pl` (cookie wins).
2. `currentLocale`: `getLocale` returns `en` → `en`; returns `de` → `pl`; throws → `pl`.
3. `getTranslator("en", "errors")("noPermission")` → `You don't have permission to do this`; `("pl", ...)` → `Brak uprawnień`;
   module namespace: `getTranslator("en", "api-keys")("errors.keyNotFound")` → `Key not found`.
4. `handleCommandError(new DomainError("x", { key: "noPermission" }), "fallback")` with locale `en` →
   `{ success: false, error: "You don't have permission to do this" }`; plain `DomainError("plain")` → `error: "plain"`;
   non-domain error → `error: "fallback"`; a Next redirect error is rethrown.
5. A command in service mode without confirmation returns `Confirm the change in service mode` in `en`,
   `Potwierdź zmianę w trybie serwisowym` in `pl`.
6. Each listed command error returns the table text in the current locale (`en` and `pl`), e.g. invite of an existing email in
   `en` → `A user with this email already exists`; 11th active API key in `en` → `You've reached the limit of 10 active keys`.
7. better-auth: sign-up with public sign-up off and a request with cookie `NEXT_LOCALE=en` → `APIError` message
   `Sign-up is disabled`; admin acting on a superadmin with Referer `/en/...` → `Only a superadmin can change a service account`.
8. Multi-org sign-up of user `Ann` from an `en` request → organization `Ann's organization`; from `pl` → `Ann — organizacja`.
9. Mailer: `sendPasswordResetEmail({ to, resetUrl, locale: "en" })` sends subject `Reset your password` and HTML containing
   `Reset password` and the reset URL, no Polish text; `locale: "pl"` → subject `Zresetuj hasło`. Welcome in `en` with name
   `Ann` → subject `Welcome to <project name>`, body `Hi Ann,`; without name `Hi,`. Invitation in `en` with inviter `Bob`,
   org `Acme` → subject `Invitation to Acme`, body `Bob invited you to join Acme.`
10. better-auth `sendResetPassword` and `sendInvitationEmail` pass `localeFromHeaders` of their request to the mailer;
    `inviteUserCommand` passes `currentLocale()`.
11. `DataTable` rendered under `en` messages without label props shows `Rows per page`, `Previous`, `Next`, `No results.`;
    explicit props still win.
12. Every key exists in both `pl` and `en` (the existing `i18n-keys-exist-in-every-locale` architecture test).

## Mutations to kill

- `localeFromHeaders` ignoring the cookie, preferring Referer over cookie, or returning an unsupported locale.
- `currentLocale` returning the raw `getLocale()` value without validation.
- `handleCommandError` returning `error.message` instead of the translation (or the reverse), or swallowing a redirect.
- A mailer function hardcoding `pl` or ignoring `locale`.
- `invitation` body ignoring `inviterName`; `welcome` greeting ignoring `name`.
- `signup-membership` default name not using the request locale.

## Out of scope

- Per-user locale preference stored in the database.
- Test titles (still Polish), `e2e/helpers.ts` labels (they match the default `pl` UI).
