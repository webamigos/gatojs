# Feature rdzenia (moduł `core`)

Po przeczytaniu będziesz wiedzieć:

- które strony, komponenty, kontrakty i funkcje serwerowe ma każdy z pięciu feature rdzenia i w których plikach leżą;
- co ustawia definicja modułu każdego feature i gdzie sprawdzić, kto wchodzi na jego strony;
- które akcje serwerowe rdzenia spełniają kontrakt trybu serwisowego `(input, confirmation?)`, a które nie i dlaczego;
- pod jakim namespace leżą teksty każdego feature i z których wspólnych tekstów korzysta;
- co feature biorą ze wspólnych części: menu bocznego, komponentów trybu serwisowego, `src/shared` i `src/components/ui`.

Zweryfikowano z kodem: 4a6ffcb, 2026-10-27

Źródła:

- `src/features/auth/`
- `src/features/organizations/`
- `src/features/users/`
- `src/features/account/`
- `src/features/dashboard/`
- `src/app/[locale]/(app)/`
- `src/app/[locale]/(auth)/`
- `src/app/[locale]/accept-invitation/[id]/page.tsx`
- `src/app/[locale]/no-organization/`
- `src/app/[locale]/layout.tsx`
- `src/app/layout.tsx`
- `src/app/messages/pl.json`
- `src/app/emails/`
- `src/shared/components/`
- `src/shared/config/project.ts`
- `src/shared/constants/table-pagination.ts`
- `src/shared/types/common.ts`
- `src/shared/utils/error-handling.ts`
- `src/shared/lib/utils.ts`
- `src/shared/lib/auth/*.ts` (`helpers.ts`, `index.ts`, `client.ts`, `permissions.ts`, `require-module-access.ts`, `service-mode.ts`, `roles.ts`, `impersonation-policy.ts`)
- `src/shared/lib/modules/` (`define-module.ts`, `nav.ts`)
- `src/shared/lib/mailer.ts`
- `src/shared/lib/logger.ts`
- `src/instrumentation.ts`
- `scripts/lib/admin-create.ts`
- `src/components/ui/`
- `components.json`
- `src/__tests__/server-entrypoints-guard.test.ts`
- `.claude/hooks/block-comments.mjs`
- `mutation-gate.json`
- `.wa/kit.json`
- `.env.example`
- `package.json`
- `node_modules/better-auth/dist/api/routes/update-user.mjs` (better-auth 1.7.13)

Rdzeń kitu to jeden moduł, `core` w `.wa/kit.json`, który obejmuje pięć feature: `auth`, `organizations`, `users`, `account` i `dashboard` ([02-architektura.md](02-architektura.md#kit-rdzen-moduly)). Nazwa pliku mówi o „modułach rdzenia”, bo każdy z tych feature ma własną definicję modułu (`module.ts`), ale w tej dokumentacji moduł to wpis w `.wa/kit.json`, więc tekst mówi o feature. Plik jest referencją: szukasz w nim, co jest w danym feature i gdzie. Jak te części działają razem, opisują [02-architektura.md](02-architektura.md), [03-dane-i-organizacje.md](03-dane-i-organizacje.md), [04-auth-i-role.md](04-auth-i-role.md) i [04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md). Tutaj są do nich odnośniki.

<a id="jak-czytac"></a>

## Jak czytać ten plik

- **Definicja modułu** to `src/features/<x>/module.ts`. Tabele definicji podają tylko pola ustawione w pliku. Znaczenie wszystkich pól: [Referencja `ModuleDef`](02-architektura.md#referencja-moduledef). Pole `routePrefixes` w żadnej definicji nie chroni tras, a `public: true` nie oznacza stron bez logowania ([02-architektura.md](02-architektura.md#pulapki-definicji)): z pól definicji przy ochronie stron korzysta tylko `requireModuleAccess(key)` na stronach `(app)`.
- **Dostęp.** O tym, kto otworzy stronę feature i kto zobaczy jego pozycję w menu, rozstrzyga `canAccessModule` na podstawie pól definicji. Wynik dla każdej roli i wartości `MULTI_ORG` jest w [macierzy dostępu](04-auth-i-role.md#macierz-dostepu) i w [tabeli menu](04-auth-i-role.md#macierz-menu). Ten plik ich nie powtarza.
- **Rodzaje funkcji serwerowych** ([02-architektura.md](02-architektura.md#anatomia-feature)):
  - **akcja serwerowa**: eksportowana funkcja z pliku z dyrektywą `"use server"`. Next.js wywołuje ją wprost z przeglądarki żądaniem POST, więc sama sprawdza sesję;
  - **query**: funkcja z `services/queries/`, którą woła strona, layout albo hook better-auth;
  - **funkcja wewnętrzna** (w `services/commands/` bez `"use server"`) i **serwis** (w `services/`): woła je tylko inny kod serwera, więc nie da się ich wywołać z przeglądarki.
- **Komenda** to, jak w [Pojęciach](decyzje.md#pojęcia), funkcja z `services/commands/` w pliku z `"use server"`, która zapisuje dane. Końcówka `Command` w nazwie nie przesądza rodzaju: `logImpersonationStartCommand` i `logImpersonationStopCommand` nie zapisują danych, tylko wpis w logu, więc ten plik nazywa je akcjami logu, a `joinOrganizationCommand` i `createOrganizationWithOwnerCommand` są funkcjami wewnętrznymi.
- **Sygnatury** w tabelach są przepisane z kodu bez słów `export`, `async` i `function`. Zapis z kilku linii jest połączony w jedną linię, bez końcowych przecinków i średników. Tak samo zapisane są wartości z `module.ts`. Komponenty są podane z nazwami props, bez typów.

<a id="przeglad"></a>

## Przegląd

| Feature | Strony | Pozycja w menu | Guard strony | Namespace tekstów |
| --- | --- | --- | --- | --- |
| [`auth`](#auth) | `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/set-password` | brak | brak, strony działają bez sesji | `auth` |
| [`organizations`](#organizations) | `/accept-invitation/<id>`, `/no-organization` | brak | brak, strony same czytają sesję | `organizations` |
| [`users`](#users) | `/users` | „Użytkownicy” albo „Członkowie”, `order: 80` | `requireModuleAccess("users")` | `users` |
| [`account`](#account) | `/account` | „Konto”, `order: 90` | `requireModuleAccess("account")` | `account` |
| [`dashboard`](#dashboard) | `/dashboard` | „Dashboard”, `order: 10` | `requireModuleAccess("dashboard")` | `dashboard` |

Strony leżą w `src/app/[locale]/`, a nie w katalogu feature, bo trasy App Router wyznacza katalog `src/app/` ([02-architektura.md](02-architektura.md#anatomia-feature)). Poza stronami i layoutami w `src/app/` są części, które nie należą do żadnego feature: endpoint better-auth `api/auth/[...all]` ([04-auth-i-role.md](04-auth-i-role.md#konfiguracja)), `api/healthcheck` ([02-architektura.md](02-architektura.md#uslugi)), szablony maili w `emails/` ([07-i18n-mail-env.md](07-i18n-mail-env.md)) i teksty rdzenia w `messages/` z namespace `common`, `errors`, `sidebar` i `serviceMode`. Niektóre strony i layout składają się z części kilku feature:

| Miejsce | Plik | Co bierze z feature |
| --- | --- | --- |
| Layout `(app)`, wspólny dla `/dashboard`, `/users` i `/account` | `src/app/[locale]/(app)/layout.tsx` | `organizations`: `OrgSwitcher`, `getSwitchableOrganizationsQuery`. `users`: `ImpersonationBanner`, `logImpersonationStopCommand`. Do tego wspólne `AppSidebar`, `MobileHeader`, `SidebarProvider`, `ServiceModeProvider` i `ServiceModeBanner`. |
| `/users` | `src/app/[locale]/(app)/users/page.tsx` | `users`: `UsersManager`, `getUserAccountsQuery`. `organizations`: `OrganizationMembers`, `getOrganizationMembersQuery`. |
| `/account` | `src/app/[locale]/(app)/account/page.tsx` | `account`: `AccountDetails`. `auth`: `ChangePasswordForm`. |
| Konfiguracja better-auth | `src/shared/lib/auth/index.ts` | `auth`: `enforceSignupPolicy`, `readBodyString`. `organizations`: `resolveSignupMembership`, `applySignupMembership`, `getDefaultActiveOrganizationId`. |

Żaden feature rdzenia nie importuje kodu innego feature. Łączą je tylko strony, layout `(app)` i konfiguracja better-auth z tabeli wyżej. Złożenie layoutu `(app)` (przekierowania, role dla menu, przełącznik, pasek trybu serwisowego i baner impersonacji) sprawdza `src/app/[locale]/(app)/__tests__/layout.test.tsx`.

Pliki w `services/` feature `auth`, `organizations` i `users` to kod bezpieczeństwa: rejestracja, organizacje, role i zaproszenia. Dlatego są na liście `critical` w `mutation-gate.json`: każdy przeżyły mutant w tych plikach zatrzymuje bramkę mutacji, chyba że człowiek dopisze go do `allowed` z uzasadnieniem ([D26](decyzje.md#d26), [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#bramka)).

<a id="kontrakt"></a>

## Akcje serwerowe a kontrakt trybu serwisowego

Komenda na danych organizacji ma stały kontrakt: sygnaturę `(input: unknown, confirmation?: unknown)`, wywołanie `assertServiceModeConfirmed(context, confirmation)` zaraz po `getOrgContext()` albo `requireModuleAccess()` i przed Prismą oraz wywołanie z interfejsu przez `useServiceModeAction().run` ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#kontrakt-potwierdzenia), wzorzec komendy: [06-wzorce-kodu.md](06-wzorce-kodu.md)). Dzięki temu superadmin w organizacji, do której nie należy, nie zmieni jej danych bez potwierdzenia w dialogu ([D22](decyzje.md#d22)).

Rdzeń ma pięć akcji serwerowych. Kontrakt spełnia jedna:

| Akcja serwerowa | Feature | Kontrakt | Dlaczego | Guard sesji | Kto ją woła |
| --- | --- | --- | --- | --- | --- |
| `inviteUserCommand` | `users` | spełnia | Zapisuje zaproszenie i konto w aktywnej organizacji. | `getAdminUserOrNull` (cookie cache) | `InviteUserDialog` przez `run`. |
| `enterOrganizationCommand` | `organizations` | nie | Zmienia aktywną organizację bieżącej sesji, a nie dane organizacji, i nie woła `getOrgContext()` ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#wejscie-do-organizacji)). Przyjmuje jeden argument. | `auth.api.getSession` (z bazy, `disableCookieCache: true`) | `OrgSwitcher` i `EnterOrganizationList`, wprost. |
| `changePasswordCommand` | `auth` | nie | Zmienia hasło własnego konta, a nie dane organizacji. Ma sygnaturę `(currentPassword, newPassword)`. | `auth.api.getSession` (cookie cache) | `ChangePasswordForm`, wprost. |
| `logImpersonationStartCommand`, `logImpersonationStopCommand` | `users` | nie | Bez argumentów. Tylko zapisują wpis w logu, bez Prismy i bez kontekstu organizacji. | `getImpersonatedByUserId` (cookie cache) | Start: `UsersManager`, wprost. Stop: `ImpersonationBanner`, któremu layout `(app)` przekazuje tę akcję w `onStopLogged`. |

Test architektury `src/__tests__/server-entrypoints-guard.test.ts` wymaga `assertServiceModeConfirmed` przed Prismą od każdej eksportowanej funkcji z pliku z `"use server"`, która woła `getOrgContext` albo `requireModuleAccess` ([D24](decyzje.md#d24)). Cztery akcje spoza kontraktu tych funkcji nie wołają, więc reguła ich nie obejmuje. Ten sam test wymaga od każdej akcji serwerowej i każdego query wywołania guardu sesji przed Prismą: guardy akcji podaje kolumna „Guard sesji”, a guardy query tabele feature. Jedynym wyjątkiem jest query `getDefaultActiveOrganizationId` z listy `UNGUARDED_ALLOWED` w teście: woła je hook `databaseHooks.session.create.before` z `userId` konta, zanim jego sesja powstanie, więc nie ma sesji do sprawdzenia.

W `services/commands/` feature `organizations` są też dwie funkcje wewnętrzne bez `"use server"`: `joinOrganizationCommand` i `createOrganizationWithOwnerCommand`. Mimo nazwy nie są akcjami serwerowymi. Woła je tylko `applySignupMembership` podczas rejestracji, nie zwracają `OperationResult`, a test architektury ich nie sprawdza, bo przeglądarka nie może ich wywołać ([02-architektura.md](02-architektura.md#anatomia-feature)).

<a id="auth"></a>

## `auth`

Logowanie, rejestracja i hasła: formularze stron grupy `(auth)`, formularz zmiany hasła na `/account`, akcja zmiany hasła i bramka rejestracji, którą woła hook `before` better-auth. Przepływy krok po kroku opisuje [04-auth-i-role.md](04-auth-i-role.md#przeplywy).

### Definicja modułu

`src/features/auth/module.ts`:

| Pole | Wartość | Skutek |
| --- | --- | --- |
| `key` | `"auth"` | Klucz definicji w rejestrze. Żadna strona nie woła `requireModuleAccess("auth")`. |
| `nav` | `[]` | Brak pozycji w menu. |
| `routePrefixes` | `["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/set-password"]` | Adresy stron feature. |
| `public` | `true` | `canAccessModule` daje dostęp każdej roli. To pole nie sprawia, że strony działają bez logowania. Strony `(auth)` działają bez sesji z innego powodu: nie wołają guardu. |

W działającej aplikacji ta definicja niczego nie zmienia: menu nie ma czego pokazać, a guard jej nie czyta ([02-architektura.md](02-architektura.md#pulapki-definicji)). Wiersze `auth` w [macierzy dostępu](04-auth-i-role.md#macierz-dostepu) opisują tylko wynik funkcji `canAccessModule`.

### Trasy

| Adres | Plik | Zawartość |
| --- | --- | --- |
| `/sign-in` | `src/app/[locale]/(auth)/sign-in/page.tsx` | `SignInForm`. |
| `/sign-up` | `src/app/[locale]/(auth)/sign-up/page.tsx` | Przy `AUTH_PUBLIC_SIGNUP=false` bez parametru `invitationId` przekierowanie na `/sign-in`, w pozostałych przypadkach `SignUpForm` z `invitationId`. Parametr `invitationId` podany w adresie kilka razy strona traktuje jak brak parametru. |
| `/forgot-password` | `src/app/[locale]/(auth)/forgot-password/page.tsx` | `ForgotPasswordForm`. |
| `/reset-password` | `src/app/[locale]/(auth)/reset-password/page.tsx` | `ResetPasswordForm` w `Suspense`, bo formularz czyta parametry adresu przez `useSearchParams`. |
| `/set-password` | `src/app/[locale]/(auth)/set-password/page.tsx` | `SetPasswordForm` w `Suspense`. Na tę stronę prowadzi link z maila powitalnego po „Zaproś użytkownika” ([04-auth-i-role.md](04-auth-i-role.md#hasla)). |

Layout `src/app/[locale]/(auth)/layout.tsx` tylko wyśrodkowuje treść. Strony grupy `(auth)` nie sprawdzają sesji, więc zalogowany użytkownik też zobaczy na nich formularz. Nie mają menu ani pasków, bo leżą poza grupą `(app)`.

### Komponenty

Wszystkie są komponentami klienckimi (`"use client"`) w `src/features/auth/components/`. Endpointy better-auth wołają przez `authClient`, czyli klienta better-auth w przeglądarce z `src/shared/lib/auth/client.ts` ([04-auth-i-role.md](04-auth-i-role.md#konfiguracja)).

| Komponent | Plik | Działanie |
| --- | --- | --- |
| `SignInForm` | `sign-in-form.tsx` | Sprawdza pola schematem `signInSchema`, woła `authClient.signIn.email` i po sukcesie zawsze przechodzi na `/dashboard`, bez parametru powrotu. |
| `SignUpForm({ invitationId })` | `sign-up-form.tsx` | Sprawdza pola schematem `signUpSchema`, woła `authClient.signUp.email` z `invitationId`, gdy strona go przekazała, i po sukcesie pokazuje „Konto zostało utworzone. Zaloguj się.” oraz przechodzi na `/sign-in`. |
| `ForgotPasswordForm` | `forgot-password-form.tsx` | Sprawdza adres schematem `forgotPasswordSchema`, woła `authClient.requestPasswordReset` z `redirectTo: "/reset-password"` i po sukcesie pokazuje zamiast formularza potwierdzenie z adresem. |
| `PasswordTokenForm({ title, description, expiredTitle, expiredDescription })` | `password-token-form.tsx` | Wspólny formularz nowego hasła: czyta z adresu `token` i `error`, sprawdza pola schematem `resetPasswordSchema`, woła `authClient.resetPassword` i po sukcesie przechodzi na `/sign-in`, a bez tokenu albo z `error` pokazuje kartę wygasłego linku z odnośnikiem do `/forgot-password`. |
| `ResetPasswordForm`, `SetPasswordForm` | `reset-password-form.tsx`, `set-password-form.tsx` | `PasswordTokenForm` z tekstami resetu („Ustaw nowe hasło”) albo powitania („Witamy”). |
| `ChangePasswordForm` | `change-password-form.tsx` | Karta „Zmiana hasła” na `/account`, która sprawdza pola schematem `changePasswordSchema` i woła `changePasswordCommand` wprost, bez `run`, bo zmiana hasła nie jest zmianą danych organizacji. |

Trzy rzeczy związane z tymi formularzami łatwo przeoczyć. Opisuje je [04-auth-i-role.md](04-auth-i-role.md), razem z [komunikatami](04-auth-i-role.md#referencja-komunikaty) formularzy, a tutaj są tylko odnośniki:

- logowanie z przycisku „Zaloguj się” na stronie zaproszenia nie wraca do zaproszenia ([Link `/accept-invitation/<id>`](04-auth-i-role.md#accept-invitation));
- rejestracja na adres, który ma już konto, też kończy się komunikatem sukcesu ([Rejestracja](04-auth-i-role.md#rejestracja));
- reset hasła z `/forgot-password` naprawia konto bez hasła po `admin:create` z pustą `ADMIN_PASSWORD=` ([Pusta `ADMIN_PASSWORD=`](04-auth-i-role.md#pusta-admin-password)).

### Kontrakty

`src/features/auth/contracts/auth.schemas.ts` zawiera schematy Zod i typy wartości formularzy (`SignInValues`, `SignUpValues` i tak dalej, `z.infer` każdego schematu):

| Schemat | Pola | Używa |
| --- | --- | --- |
| `signInSchema` | `email` (adres e-mail), `password` (niepuste) | `SignInForm` |
| `signUpSchema` | `name` (niepuste), `email`, `password` (co najmniej 8 znaków) | `SignUpForm` |
| `forgotPasswordSchema` | `email` | `ForgotPasswordForm` |
| `resetPasswordSchema` | `password` i `confirm` (co najmniej 8 znaków, równe) | `PasswordTokenForm` |
| `changePasswordSchema` | `currentPassword` (niepuste), `newPassword` i `confirmPassword` (co najmniej 8 znaków, równe) | `ChangePasswordForm` |
| `initialAccountSchema` | `name`, `email`, `password`, `confirmPassword` | nie używa go żaden plik |

Schematy sprawdzają dane tylko w formularzach w przeglądarce (`zodResolver` z react-hook-form). Na serwerze dane sprawdza better-auth: `changePasswordCommand` przekazuje oba hasła bez własnej walidacji, a długość nowego hasła sprawdza endpoint `changePassword` (`assertPasswordNotTooShort` w `node_modules/better-auth/dist/api/routes/update-user.mjs`).

### Komendy i serwisy

| Sygnatura | Plik | Rodzaj | Działanie |
| --- | --- | --- | --- |
| `changePasswordCommand(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }>` | `src/features/auth/services/commands/change-password-command.ts` | akcja serwerowa, poza [kontraktem](#kontrakt) | Zmienia hasło zalogowanego konta przez `auth.api.changePassword` z `revokeOtherSessions: false`, z sesją odczytaną z [cookie cache](03-dane-i-organizacje.md#cookie-cache), czyli kopii sesji w ciasteczku ([04-auth-i-role.md](04-auth-i-role.md#hasla)). |
| `enforceSignupPolicy(body: unknown, publicSignup: boolean): Promise<void>` | `src/features/auth/services/signup-gate.ts` | serwis, hook `before` na `/sign-up/email` | Przy `publicSignup` równym `false` rzuca 403 przez `assertSignupAllowed`, chyba że w bazie jest oczekujące, ważne zaproszenie o `invitationId` i adresie z ciała żądania. |
| `readBodyString(body: unknown, key: string): string \| undefined` | `src/features/auth/services/signup-gate.ts` | serwis | Zwraca niepusty napis spod klucza ciała żądania albo `undefined`, a hook czyta nim `invitationId`, `name` i `email`. |
| `assertSignupAllowed({ publicSignup, hasInvitation }: SignupPolicyInput): void` | `src/features/auth/services/signup-policy.ts` | serwis | Rzuca `APIError` `FORBIDDEN` „Rejestracja jest wyłączona”, gdy rejestracja publiczna jest wyłączona, a pasującego zaproszenia nie ma. |

Feature nie ma query. Bramkę rejestracji i jej wyniki dla każdej kombinacji flag opisuje [04-auth-i-role.md](04-auth-i-role.md#rejestracja).

### Teksty i testy

- **Namespace** `auth`: `src/features/auth/i18n/pl.json` i `en.json`. Formularze biorą też `saving` z `common` i `generic` albo `connection` z `errors` (wspólne teksty w `src/app/messages/`).
- **Testy:** `src/features/auth/components/__tests__/` (każdy formularz), `src/features/auth/services/__tests__/` (`signup-gate.test.ts`, `signup-policy.test.ts`), `src/features/auth/services/commands/__tests__/change-password-command.test.ts`.

<a id="organizations"></a>

## `organizations`

Organizacje: przełącznik i wybór aktywnej organizacji, strona zaproszenia, strona braku organizacji, widok członków dla ról w organizacji i członkostwo zakładane przy rejestracji. Model danych, kontekst organizacji i aktywną organizację opisuje [03-dane-i-organizacje.md](03-dane-i-organizacje.md).

### Definicja modułu

`src/features/organizations/module.ts`:

| Pole | Wartość | Skutek |
| --- | --- | --- |
| `key` | `"organizations"` | Klucz definicji w rejestrze. Żadna strona nie woła `requireModuleAccess("organizations")`. |
| `nav` | `[]` | Brak pozycji w menu. |
| `routePrefixes` | `["/accept-invitation", "/no-organization"]` | Adresy stron feature. |
| `public` | `true` | Jak w [`auth`](#auth): `canAccessModule` daje dostęp każdej roli, ale żadna strona tego feature go nie sprawdza, więc definicja niczego nie zmienia w działającej aplikacji ([macierz dostępu](04-auth-i-role.md#macierz-dostepu), wiersze `organizations`). |

### Trasy

| Adres | Plik | Zawartość |
| --- | --- | --- |
| `/accept-invitation/<id>` | `src/app/[locale]/accept-invitation/[id]/page.tsx` | Bez sesji karta „Zaproszenie do organizacji” z przyciskami „Zaloguj się” (`/sign-in`) i „Załóż konto” (`/sign-up?invitationId=<id>`). Z sesją strona od razu woła `auth.api.acceptInvitation` i `auth.api.setActiveOrganization`, a potem przekierowuje na `/dashboard`. Gdy better-auth odrzuci przyjęcie, pokazuje „Nie udało się przyjąć zaproszenia”. To jedyna strona rdzenia, która zmienia dane w `page.tsx`, i to przy samym otwarciu adresu, wbrew regule „logika biznesowa nie trafia do `page.tsx`” z [AGENTS.md](../AGENTS.md#struktura); nowa funkcja robi to akcją serwerową ([06-wzorce-kodu.md](06-wzorce-kodu.md)). Warunki i pułapki obu przycisków: [04-auth-i-role.md](04-auth-i-role.md#accept-invitation). |
| `/no-organization` | `src/app/[locale]/no-organization/page.tsx` | Karta „Brak organizacji” z listą „Wejdź do organizacji” (`EnterOrganizationList`, gdy jest do czego wejść), formularzem `CreateOrganizationForm` (tylko przy `MULTI_ORG=true`) i przyciskiem `SignOutButton`. Z działającym kontekstem organizacji przekierowuje na `/dashboard` ([03-dane-i-organizacje.md](03-dane-i-organizacje.md#no-organization)). |

Obie strony leżą poza grupą `(app)`, więc nie wymagają aktywnej organizacji i nie mają menu ani pasków ([D12](decyzje.md#d12)). Dwie części feature działają na stronach grupy `(app)`: layout renderuje nad treścią `OrgSwitcher`, a strona `/users` pokazuje `OrganizationMembers` kontom z rolą globalną `user` ([`users`](#users)).

### Komponenty

Wszystkie są komponentami klienckimi w `src/features/organizations/components/`.

| Komponent | Plik | Działanie |
| --- | --- | --- |
| `OrgSwitcher({ organizations, activeOrganizationId, canCreateOrganization })` | `org-switcher.tsx` | Pokazuje listę wyboru, gdy organizacji jest więcej niż jedna (wybór woła `enterOrganizationCommand`, a po sukcesie `router.refresh()`), i przycisk „+” z dialogiem „Utwórz organizację”, gdy `canCreateOrganization` (z layoutu: `MULTI_ORG`) jest prawdą, a bez obu nic nie renderuje. |
| `CreateOrganizationForm({ onCreated })` | `create-organization-form.tsx` | Woła `authClient.organization.create` z nazwą bez spacji na brzegach i slugiem ze `slugifyOrganizationName`, a po sukcesie przechodzi na `/dashboard` w nowej organizacji, którą better-auth ustawia jako aktywną ([03-dane-i-organizacje.md](03-dane-i-organizacje.md#aktywna-organizacja)). |
| `EnterOrganizationList({ organizations })` | `enter-organization-list.tsx` | Lista „Wejdź do organizacji” na `/no-organization`, w której przycisk woła `enterOrganizationCommand` i po sukcesie przechodzi na `/dashboard`. |
| `OrganizationMembers({ organizationName, currentUserId, currentRole, members, invitations })` | `organization-members.tsx` | Widok „Członkowie” na `/users` z listą członków aktywnej organizacji, w którym `owner` i `admin` organizacji (`canManage`) zmieniają role (`admin`, `member`) i usuwają członków z wyjątkiem ownera i siebie, a do tego widzą formularz „Zaproś osobę” i oczekujące zaproszenia z przyciskiem anulowania. |
| `SignOutButton` | `sign-out-button.tsx` | Przycisk „Wyloguj się” na `/no-organization`, który woła `authClient.signOut()` i przechodzi na `/sign-in`. |

`CreateOrganizationForm` i `OrganizationMembers` zmieniają dane przez endpointy better-auth (`authClient.organization.*`), a nie komendy kitu, więc bez dialogu trybu serwisowego ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#authclient-organization)).

### Kontrakty

| Eksport | Plik w `contracts/` | Zawartość |
| --- | --- | --- |
| `OrganizationMemberRow`, `OrganizationInvitationRow` | `organization-members.types.ts` | Wiersz członka (`memberId`, `userId`, `name`, `email`, `role`) i zaproszenia (`id`, `email`, `role`, `status`, `expiresAt` jako napis ISO albo `null`). |
| `SwitchableOrganization` | `organization-switcher.types.ts` | `{ id, name, isMember }`: pozycja przełącznika i listy „Wejdź do organizacji”. |
| `slugifyOrganizationName(name: string): string` | `organization-slug.ts` | Slug z nazwy z 8-znakowym losowym sufiksem ([Modele i pola](03-dane-i-organizacje.md#referencja-modele)). Używa jej formularz w przeglądarce (`CreateOrganizationForm`) i `createOrganizationWithOwnerCommand` na serwerze. |

### Komendy, funkcje wewnętrzne, query i serwisy

| Sygnatura | Plik | Rodzaj | Działanie |
| --- | --- | --- | --- |
| `enterOrganizationCommand(organizationId: unknown): Promise<OperationResult>` | `src/features/organizations/services/commands/enter-organization-command.ts` | akcja serwerowa, poza [kontraktem](#kontrakt) | Ustawia `activeOrganizationId` bieżącej sesji, gdy `canEnterOrganization` pozwala, a przy każdej odmowie i każdym błędzie zwraca „Brak dostępu do organizacji”. |
| `joinOrganizationCommand(input: { userId: string; organizationId: string; role: OrgRole; invitationId?: string }): Promise<void>` | `src/features/organizations/services/commands/member-commands.ts` | funkcja wewnętrzna | Tworzy członkostwo, a z `invitationId` w tej samej transakcji zmienia status zaproszenia na `accepted`. |
| `createOrganizationWithOwnerCommand(input: { name: string; ownerId: string }): Promise<{ id: string }>` | `src/features/organizations/services/commands/organization-commands.ts` | funkcja wewnętrzna | Tworzy organizację ze slugiem i członkostwem `owner`. |
| `canEnterOrganization(input: { userId: string; userRole: UserRole; organizationId: string }): Promise<boolean>` | `src/features/organizations/services/organization-access.ts` | serwis | Zwraca `true`, gdy organizacja istnieje (superadmin) albo gdy konto ma w niej członkostwo (pozostałe konta). |
| `resolveSignupMembership(input: ResolveSignupMembershipInput): Promise<SignupMembership>` | `src/features/organizations/services/signup-membership.ts` | serwis, hook `before` na `/sign-up/email` | Decyduje, gdzie trafi nowe konto: `join` (organizacja zaproszenia albo najstarsza organizacja) albo `create` (nowa organizacja „`<imię>` — organizacja”). |
| `applySignupMembership(userId: string, membership: SignupMembership): Promise<void>` | `src/features/organizations/services/signup-membership.ts` | serwis, hook `databaseHooks.user.create.after` | Wykonuje tę decyzję przez `joinOrganizationCommand` albo `createOrganizationWithOwnerCommand`. |
| `getOrganizationMembersQuery(): Promise<OrganizationMembersData>` | `src/features/organizations/services/queries/organization-queries.ts` | query, guard `getOrgContext()` | Zwraca nazwę aktywnej organizacji, identyfikator i rolę wywołującego, członków od najstarszego członkostwa i oczekujące zaproszenia od najnowszego, z `organizationId` z `getOrgContext()`. |
| `getSwitchableOrganizationsQuery(): Promise<SwitchableOrganization[]>` | `src/features/organizations/services/queries/switchable-organizations-query.ts` | query, guard `auth.api.getSession` (cookie cache) | Zwraca organizacje do przełącznika i na `/no-organization` po nazwie: superadminowi wszystkie, z `isMember` mówiącym, czy ma w danej członkostwo, innym kontom tylko te z członkostwem, a bez sesji `[]`. |
| `getDefaultActiveOrganizationId(userId: string): Promise<string \| null>` | `src/features/organizations/services/queries/default-organization-query.ts` | query bez guardu, hook `databaseHooks.session.create.before` | Zwraca aktywną organizację nowej sesji: organizację najstarszego członkostwa, dla superadmina bez członkostw najstarszą organizację, a w pozostałych przypadkach i przy błędzie bazy `null`. |

`signup-membership.ts` eksportuje też typy `SignupMembership` i `ResolveSignupMembershipInput` oraz stałą `NOT_CONFIGURED_MESSAGE` („Aplikacja nie jest skonfigurowana: uruchom npm run admin:create”), a `organization-queries.ts` typ `OrganizationMembersData`. Skąd każda z tych funkcji czyta sesję: [Funkcje w 03-dane-i-organizacje.md](03-dane-i-organizacje.md#referencja-funkcje). Rejestrację i jej wyniki opisuje [04-auth-i-role.md](04-auth-i-role.md#rejestracja).

### Teksty i testy

- **Namespace** `organizations`: `src/features/organizations/i18n/pl.json` i `en.json`, z zagnieżdżonymi nazwami ról pod `role` (`role.owner`, `role.admin`, `role.member`). Teksty stron `/accept-invitation/<id>` i `/no-organization` też są w tym namespace. `OrganizationMembers` bierze dodatkowo `cancel` z `common`.
- **Testy:** `src/features/organizations/components/__tests__/` (`org-switcher.test.tsx`, `organization-members.test.tsx`), `src/features/organizations/contracts/__tests__/organization-slug.test.ts`, `src/features/organizations/services/__tests__/` (`signup-membership.test.ts` i test izolacji na prawdziwej bazie `organization-isolation.integration.test.ts`, [03-dane-i-organizacje.md](03-dane-i-organizacje.md#izolacja)), `src/features/organizations/services/commands/__tests__/enter-organization-command.test.ts`, `src/features/organizations/services/queries/__tests__/`, `src/app/[locale]/no-organization/__tests__/page.test.tsx`. Strona `/accept-invitation/<id>` nie ma testu.

<a id="users"></a>

## `users`

Konta aplikacji z perspektywy roli globalnej: lista wszystkich kont, „Zaproś użytkownika” i impersonacja. Ta sama strona `/users` pokazuje kontom z rolą globalną `user` widok „Członkowie” z feature [`organizations`](#organizations). Superadmina, ochronę kont serwisowych i impersonację opisuje [04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md).

### Definicja modułu

`src/features/users/module.ts`:

| Pole | Wartość | Skutek |
| --- | --- | --- |
| `key` | `"users"` | Strona `/users` woła `requireModuleAccess("users")`. |
| `nav` | `[{ href: "/users", labelKey: "nav", multiOrgLabelKey: "nav-members", icon: "users", order: 80 }]` | Pozycja „Użytkownicy” (`users.nav`). Przy `MULTI_ORG=true` konto z rolą globalną `user` widzi ją jako „Członkowie” (`users.nav-members`). |
| `routePrefixes` | `["/users"]` | Adres strony feature. |
| `adminOnly` | `true` | Rola w organizacji daje dostęp tylko przy `MULTI_ORG=true` i tylko wtedy, gdy jest na liście `multiOrgRoles`. Rola globalna `admin` i `superadmin` ma dostęp zawsze, więc przy `MULTI_ORG=false` stronę widzi tylko ona (decyzja Jakuba, [D05](decyzje.md#d05)). |
| `multiOrgRoles` | `["owner", "admin"]` | `owner` i `admin` organizacji przy `MULTI_ORG=true`. `member` nie dostaje strony w żadnym trybie. |

Dostęp dla każdej kombinacji ról: [macierz dostępu](04-auth-i-role.md#macierz-dostepu), wiersze `users`.

### Trasy

| Adres | Plik | Zawartość |
| --- | --- | --- |
| `/users` | `src/app/[locale]/(app)/users/page.tsx` | `requireModuleAccess("users")`, potem wybór widoku według roli globalnej z kontekstu. Rola `admin` albo `superadmin` (`isGlobalAdmin`): `getUserAccountsQuery()` i `UsersManager` z flagą `ADMIN_IMPERSONATION`. Pozostałe konta, czyli `owner` i `admin` organizacji przy `MULTI_ORG=true`: `getOrganizationMembersQuery()` i `OrganizationMembers`. |

Superadmin w trybie serwisowym ma rolę globalną `superadmin`, więc zawsze dostaje listę kont, a nie widok „Członkowie”. Do tego layout `(app)` renderuje na każdej stronie `ImpersonationBanner`, który pokazuje się tylko w sesji impersonacji.

### Komponenty

| Komponent | Plik w `components/` | Działanie |
| --- | --- | --- |
| `UsersManager({ users, currentUserId, currentUserRole, adminImpersonation })` | `users-manager.tsx` | Karta „Użytkownicy” z tabelą kont (`DataTable`) i przyciskiem „Zaproś użytkownika”, w której „Zaloguj jako” woła `authClient.admin.impersonateUser`, potem `logImpersonationStartCommand()` i przechodzi na `/dashboard` ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#impersonacja)). |
| `buildUserAccountColumns(t: ReturnType<typeof useTranslations<"users">>, dateLocale: DateFnsLocale, viewer: UserAccountViewer, pendingId: string \| null, onImpersonate: (userId: string) => void): ColumnDef<UserAccountListItem>[]` | `user-account-columns.tsx` | Funkcja (nie komponent), która buduje kolumny tabeli: imię i nazwisko, adres, odznakę roli („Użytkownik”, „Administrator”, „Serwis (Web Amigos)”), datę utworzenia i przycisk „Zaloguj jako” tam, gdzie wiersz nie jest własnym kontem, a `canImpersonate` pozwala. |
| `InviteUserDialog` | `invite-user-dialog.tsx` | Dialog „Zaproś użytkownika” (imię, adres, rola w organizacji `member` albo `admin`), który wysyła dane przez `useServiceModeAction().run(inviteUserCommand, values)` i renderuje `dialog` trybu serwisowego ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#run)). |
| `ImpersonationBanner({ active, userName, onStopLogged })` | `impersonation-banner.tsx` | Pasek „Zalogowano jako `<imię>`” w layoucie `(app)`, którego przycisk „Wróć do własnego konta” woła najpierw `onStopLogged`, potem `authClient.admin.stopImpersonating()` i przechodzi na `/users`. |

`InviteUserDialog` to jedyny komponent rdzenia, który woła komendę przez `run`. Komponenty z `"use client"` to `UsersManager`, `InviteUserDialog` i `ImpersonationBanner`. `user-account-columns.tsx` nie ma tej dyrektywy, ale trafia do przeglądarki przez import w `UsersManager`. Ten plik eksportuje też typ `UserAccountViewer` (`userId`, `role` i `adminImpersonation` oglądającego).

### Kontrakty

| Eksport | Plik w `contracts/` | Zawartość |
| --- | --- | --- |
| `inviteUserSchema`, `InviteUserValues` | `user-account.schemas.ts` | Imię od 1 do 200 znaków po przycięciu spacji, adres po przycięciu i zamianie na małe litery, rola `admin` albo `member` (domyślnie `member`). Schemat sprawdza formularz w przeglądarce i ponownie `inviteUserCommand` na serwerze. |
| `UserAccountListItem` | `user-account.types.ts` | `{ id, name, email, role, emailVerified, createdAt }` z rolą typu `UserRole`. |

### Akcje serwerowe i query

| Sygnatura | Plik | Rodzaj | Działanie |
| --- | --- | --- | --- |
| `inviteUserCommand(input: unknown, confirmation?: unknown): Promise<OperationResult<{ userId: string }> & { warning?: "mail-failed" }>` | `src/features/users/services/commands/invite-user-command.ts` | akcja serwerowa, spełnia [kontrakt](#kontrakt) | Zakłada konto z zaproszeniem w aktywnej organizacji i wysyła mail z linkiem do ustawienia hasła (kroki i komunikaty: [04-auth-i-role.md](04-auth-i-role.md#zapros-uzytkownika)). |
| `logImpersonationStartCommand(): Promise<OperationResult>` | `src/features/users/services/commands/impersonation-commands.ts` | akcja serwerowa, poza [kontraktem](#kontrakt) | W sesji impersonacji zapisuje w logu `[USERS] Impersonation started` z `impersonatorUserId` i `targetUserId`, a poza nią tylko zwraca sukces. |
| `logImpersonationStopCommand(): Promise<OperationResult>` | `src/features/users/services/commands/impersonation-commands.ts` | akcja serwerowa, poza [kontraktem](#kontrakt) | Działa tak samo, z wpisem `[USERS] Impersonation stopped`. |
| `getUserAccountsQuery(): Promise<UserAccountListItem[]>` | `src/features/users/services/queries/user-account-queries.ts` | query, guard `getAdminUserOrNull` (cookie cache) | Zwraca wszystkie konta aplikacji od najnowszego z rolą zawężoną przez `toUserRole`, a bez sesji przekierowuje na `/sign-in` i bez roli globalnej `admin` lub `superadmin` kończy się 404 (`notFound()`). |

Wpis o impersonacji powstaje tylko wtedy, gdy akcję logu wywoła interfejs. Podszycie przez endpoint better-auth z pominięciem interfejsu nie zostawia wpisu ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#impersonacja)).

`getUserAccountsQuery` nie filtruje po `organizationId`, bo konto należy do całej aplikacji, a nie do organizacji, i listę wszystkich kont widzi tylko rola globalna ([D08](decyzje.md#d08)). Rolę sprawdza `getAdminUserOrNull` na podstawie cookie cache, co ma skutki po zmianie roli w trakcie sesji ([04-auth-i-role.md](04-auth-i-role.md#rola-z-cookie-cache)).

### Teksty i testy

- **Namespace** `users`: `src/features/users/i18n/pl.json` i `en.json`. `InviteUserDialog` bierze też `cancel` z `common`, a dialog trybu serwisowego teksty z `serviceMode`.
- **Testy:** `src/features/users/components/__tests__/` (każdy komponent i `buildUserAccountColumns`), `src/features/users/services/commands/__tests__/` (`invite-user-command.test.ts`, `impersonation-commands.test.ts`), `src/features/users/services/queries/__tests__/user-account-queries.test.ts`, `src/app/[locale]/(app)/users/__tests__/page.test.tsx` (wybór widoku według roli globalnej).

<a id="account"></a>

## `account`

Strona konta zalogowanego użytkownika. Feature ma tylko komponent, który wyświetla imię i adres. Formularz zmiany hasła na tej stronie pochodzi z feature [`auth`](#auth).

### Definicja modułu

`src/features/account/module.ts`:

| Pole | Wartość | Skutek |
| --- | --- | --- |
| `key` | `"account"` | Strona `/account` woła `requireModuleAccess("account")`. Definicja nie zawęża ról, więc stronę otwiera każde konto z aktywną organizacją ([macierz dostępu](04-auth-i-role.md#macierz-dostepu), wiersze `account`). |
| `nav` | `[{ href: "/account", labelKey: "nav", icon: "user-cog", order: 90 }]` | Pozycja „Konto” (`account.nav`), ostatnia wśród pozycji rdzenia. |
| `routePrefixes` | `["/account"]` | Adres strony feature. |

### Trasy

| Adres | Plik | Zawartość |
| --- | --- | --- |
| `/account` | `src/app/[locale]/(app)/account/page.tsx` | `requireModuleAccess("account")`, potem `requireUser()` (użytkownik z sesji z cookie cache), `AccountDetails` z imieniem i adresem oraz `ChangePasswordForm`. |

Do `/account` prowadzi też link „Konto” w oknie użytkownika na dole menu bocznego. Jest wpisany na stałe w `app-sidebar.tsx` i nie zależy od definicji modułu ([Menu boczne](#app-sidebar)).

### Komponenty

| Komponent | Plik | Działanie |
| --- | --- | --- |
| `AccountDetails({ name, email })` | `src/features/account/components/account-details.tsx` | Wyświetla nagłówek „Konto” i kartę „Dane użytkownika” z imieniem i nazwiskiem (albo „-”, gdy puste) i adresem, a renderuje się na serwerze, bo plik nie ma `"use client"`. |

Feature nie ma kontraktów ani kodu w `services/`. Kit nie ma formularza zmiany imienia ani adresu e-mail.

### Teksty i testy

- **Namespace** `account`: `src/features/account/i18n/pl.json` i `en.json` (klucze `nav`, `title`, `user-data`, `name`, `email`).
- **Testy:** feature nie ma własnych testów. Formularz zmiany hasła testuje `src/features/auth/components/__tests__/change-password-form.test.tsx`, a pozycję „Konto” z ikoną `user-cog` test menu `src/shared/components/__tests__/app-sidebar.test.tsx`.

<a id="dashboard"></a>

## `dashboard`

Strona startowa po zalogowaniu z treścią zastępczą, którą projekt klienta zastępuje własną.

### Definicja modułu

`src/features/dashboard/module.ts`:

| Pole | Wartość | Skutek |
| --- | --- | --- |
| `key` | `"dashboard"` | Strona `/dashboard` woła `requireModuleAccess("dashboard")`. Jak w `account`, definicja nie zawęża ról ([macierz dostępu](04-auth-i-role.md#macierz-dostepu), wiersze `dashboard`). |
| `nav` | `[{ href: "/dashboard", labelKey: "nav", icon: "layout-dashboard", order: 10 }]` | Pozycja „Dashboard” (`dashboard.nav`), pierwsza w menu. |
| `routePrefixes` | `["/dashboard"]` | Adres strony feature. |

### Trasy

| Adres | Plik | Zawartość |
| --- | --- | --- |
| `/dashboard` | `src/app/[locale]/(app)/dashboard/page.tsx` | `requireModuleAccess("dashboard")`, potem `requireUser()` i `DashboardPlaceholder` z imieniem użytkownika albo jego adresem, gdy imię jest puste. |

Adres `/dashboard` jest wpisany na stałe jako cel przejścia w sześciu miejscach. Kto zmieni adres strony startowej, musi poprawić każde z nich:

- `SignInForm` po zalogowaniu (`src/features/auth/components/sign-in-form.tsx`);
- strona zaproszenia po przyjęciu, stała `APP_HOME_PATH` (`src/app/[locale]/accept-invitation/[id]/page.tsx`);
- strona `/no-organization` przy działającym kontekście (`src/app/[locale]/no-organization/page.tsx`);
- `EnterOrganizationList` po wejściu do organizacji (`src/features/organizations/components/enter-organization-list.tsx`);
- `CreateOrganizationForm` po utworzeniu organizacji (`src/features/organizations/components/create-organization-form.tsx`);
- `UsersManager` po rozpoczęciu impersonacji (`src/features/users/components/users-manager.tsx`).

### Komponenty

| Komponent | Plik | Działanie |
| --- | --- | --- |
| `DashboardPlaceholder({ userName })` | `src/features/dashboard/components/dashboard-placeholder.tsx` | Wyświetla nagłówek „Dashboard”, powitanie „Witaj, `<imię>`” i tekst „Tutaj pojawi się zawartość Twojej aplikacji.”, a renderuje się na serwerze, bo plik nie ma `"use client"`. |

Feature nie ma kontraktów ani kodu w `services/`.

### Teksty i testy

- **Namespace** `dashboard`: `src/features/dashboard/i18n/pl.json` i `en.json` (klucze `nav`, `title`, `welcome`, `placeholder`).
- **Testy:** feature nie ma własnych testów. Pozycję „Dashboard” i jej podświetlenie sprawdza `src/shared/components/__tests__/app-sidebar.test.tsx`.

<a id="wspolne"></a>

## Wspólne części

Kod w `src/shared/` i `src/components/ui/` należy do modułu `core` (wzorce `src/shared/**` i `src/components/ui/**` w `.wa/kit.json`), ale nie jest żadnym feature: korzystają z niego wszystkie. Biblioteki w `src/shared/lib/` opisują inne pliki: auth i guardy [04-auth-i-role.md](04-auth-i-role.md#guardy), kontekst organizacji [03-dane-i-organizacje.md](03-dane-i-organizacje.md#kontekst-organizacji), `defineModule` i nawigację [02-architektura.md](02-architektura.md#definicja-modulu), `env.ts` i `mailer.ts` [07-i18n-mail-env.md](07-i18n-mail-env.md), `logger.ts` [07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#logger).

<a id="app-sidebar"></a>

### Menu boczne: `src/shared/components/app-sidebar.tsx`

Komponent kliencki (`"use client"`). Pozycje menu powstają z definicji modułów, a nie z tego pliku: nową pozycję dodaje się wpisem `nav` w `module.ts` ([02-architektura.md](02-architektura.md#definicja-modulu)).

| Eksport | Działanie |
| --- | --- |
| `SidebarProvider` | Stan menu: zwinięte (`collapsed`) i otwarte na wąskim ekranie (`mobileOpen`). Layout `(app)` obejmuje nim całą stronę. |
| `useSidebar()` | Odczyt i zmiana tego stanu. |
| `MobileHeader` | Nagłówek z `project.name` i przyciskiem otwierającym menu, widoczny tylko poniżej szerokości `md`. |
| `AppSidebar({ accessContext, userName, userEmail })` | Menu: `project.name`, pozycje z `getNavEntries(accessContext)` z ikonami lucide (`DynamicIcon`) i podświetleniem bieżącej pozycji (`isActiveEntry`). Na dole przycisk z inicjałami i imieniem otwiera okno z adresem e-mail, linkiem „Konto” do `/account` i przyciskiem „Wyloguj” (`authClient.signOut()`, przejście na `/sign-in`, `router.refresh()`). |

`AppSidebar` woła `useTranslations()` bez namespace, bo etykiety pozycji leżą w namespace różnych feature (`<key>.<labelKey>`), a własne teksty menu w namespace `sidebar` z `src/app/messages/`. Layout przekazuje do `accessContext` role z kontekstu organizacji i `MULTI_ORG`, więc menu pokazuje to samo, co przepuszcza `requireModuleAccess` ([D05](decyzje.md#d05)). Testy: `src/shared/components/__tests__/app-sidebar.test.tsx`.

<a id="service-mode"></a>

### Tryb serwisowy: `src/shared/components/service-mode/`

Trzy pliki dla interfejsu trybu serwisowego. Pełny opis z przebiegiem: [04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#referencja-tryb-serwisowy).

| Plik | Eksport | Działanie |
| --- | --- | --- |
| `service-mode-provider.tsx` | `ServiceModeProvider({ active, organizationId, organizationName, children })`, `useServiceMode()`, typ `ServiceModeState` | Stan trybu serwisowego dla komponentów. Layout `(app)` ustawia go z kontekstu organizacji. Bez providera tryb jest nieaktywny. |
| `service-mode-banner.tsx` | `ServiceModeBanner` | Pasek „Tryb serwisowy: `<nazwa organizacji>`”, gdy tryb jest aktywny ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#pasek)). |
| `use-service-mode-action.tsx` | `useServiceModeAction(): ServiceModeActionRunner`, typ `ServiceModeActionRunner` | Zwraca `{ run, dialog }`. `run(command, input)` poza trybem serwisowym woła komendę od razu, a w trybie serwisowym po „Zmień” w dialogu, z potwierdzeniem aktywnej organizacji. Po „Anuluj” zwraca `null` ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#run)). |

Teksty paska i dialogu są w namespace `serviceMode` w `src/app/messages/` ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#referencja-teksty)). Testy: `src/shared/components/service-mode/__tests__/`.

<a id="project"></a>

### Nazwa projektu: `src/shared/config/project.ts`

`src/shared/config/project.ts`

```ts
export const project = {
  name: "WA App",
  slug: "wa-app",
} as const;
```

| Pole | Gdzie trafia |
| --- | --- |
| `project.name` | Tytuł strony (`metadata` w `src/app/layout.tsx`), nagłówek menu i `MobileHeader`, szablony maili w `src/app/emails/` i temat maila powitalnego „Witamy w WA App” (`src/shared/lib/mailer.ts`), domyślna nazwa pierwszej organizacji w `admin:create` (`scripts/lib/admin-create.ts`). |
| `project.slug` | Nazwa loggera (`src/shared/lib/logger.ts`), domyślne `service.name` w eksporcie logów, gdy nie ustawiono `OTEL_SERVICE_NAME` (`src/instrumentation.ts`), zapasowy slug pierwszej organizacji w `admin:create`. |

Ten plik nie zmienia wszystkich wystąpień nazwy: nadawca maili jest w zmiennej `EMAIL_FROM` (w `.env.example` `"WA App <noreply@example.com>"`), a nazwa paczki w polu `name` w `package.json` (`wa-app`).

<a id="stale-typy-narzedzia"></a>

### Stałe, typy i narzędzia

`src/shared/types/common.ts`

```ts
export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

| Plik | Eksport | Działanie |
| --- | --- | --- |
| `src/shared/types/common.ts` | `OperationResult<T = unknown>`, `PaginatedResult<T>` | `OperationResult` zwracają `inviteUserCommand`, `enterOrganizationCommand` i akcje logu impersonacji, a wzorzec komendy opisuje [06-wzorce-kodu.md](06-wzorce-kodu.md). `PaginatedResult` (`items`, `totalItems`, `totalPages`, `currentPage`, `pageSize`) nie ma użycia w kodzie. |
| `src/shared/utils/error-handling.ts` | `DomainError`, `handleCommandError(error: unknown, defaultMessage: string): OperationResult<never>` | Wspólna obsługa błędów akcji serwerowych. Przekierowanie Next.js (`NEXT_REDIRECT`) rzuca dalej, `DomainError` zamienia na `{ success: false, error: <komunikat błędu> }` z wpisem `warn` w logu, a każdy inny błąd na `{ success: false, error: defaultMessage }` z wpisem `error`. Dzięki temu komunikat techniczny nie trafia do przeglądarki. |
| `src/shared/constants/table-pagination.ts` | `TABLE_PAGE_SIZE_OPTIONS` (`[25, 50, 100]`), `TABLE_DEFAULT_PAGE_SIZE` (`50`), `TABLE_PAGE_SIZE_COOKIE` (`"table_page_size"`) | `DataTablePagination` z `src/components/ui/data-table.tsx` bierze `TABLE_PAGE_SIZE_OPTIONS`, gdy nie dostanie własnych opcji. Dwóch pozostałych stałych kod nie używa. |
| `src/shared/lib/utils.ts` | `cn(...inputs: ClassValue[])` | Łączy klasy Tailwind (`clsx` i `tailwind-merge`). Na ten plik wskazuje alias `utils` w `components.json`. |

`ServiceModeConfirmationError` z `src/shared/lib/auth/service-mode.ts` jest podklasą `DomainError`, dlatego `handleCommandError` zwraca jego komunikat „Potwierdź zmianę w trybie serwisowym” ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#kontrakt-potwierdzenia)).

<a id="components-ui"></a>

### Komponenty interfejsu: `src/components/ui/`

Komponenty w stylu shadcn/ui. Dialogi, listy wyboru, menu, podpowiedzi i pozostałe komponenty z grupy pierwszej w tabeli niżej są zbudowane na prymitywach `@base-ui/react`. `components.json` zapisuje konfigurację dla CLI shadcn: styl `base-nova`, `rsc: true`, ikony `lucide`, style Tailwind w `src/app/globals.css`, komponenty pod aliasem `@/components/ui`, a funkcję `cn` pod aliasem `@/shared/lib/utils`.

| Grupa | Pliki |
| --- | --- |
| Na `@base-ui/react` | `alert-dialog.tsx`, `avatar.tsx`, `badge.tsx`, `button.tsx`, `checkbox.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`, `popover.tsx`, `select.tsx`, `separator.tsx`, `switch.tsx`, `tabs.tsx`, `tooltip.tsx`, `use-tap-to-open-tooltip.ts` |
| Na innych bibliotekach | `command.tsx` (`cmdk`), `sonner.tsx` (`Toaster` na `sonner` i `next-themes`, renderowany w `src/app/[locale]/layout.tsx`), `data-table.tsx`, `data-table-column-visibility.tsx` i `use-column-visibility.ts` (`@tanstack/react-table`) |
| Bez bezpośredniego importu prymitywów (React i Tailwind, czasem ikony `lucide-react` albo `class-variance-authority`); `form.tsx`, `password-input.tsx` i `input-group.tsx` korzystają z komponentów pierwszej grupy | `alert.tsx` (`InlineAlert`), `button-variants.ts` (`buttonVariants`), `card.tsx`, `error-state.tsx` (`ErrorState`), `form.tsx` (`FormField`, `FormLabel`, `FormError`, `FormHint`), `input-group.tsx`, `label.tsx`, `password-input.tsx` (`PasswordInput`), `skeleton.tsx`, `table.tsx`, `textarea.tsx` |

Dwie rzeczy, które łatwo założyć inaczej:

- **`form.tsx` nie łączy się z react-hook-form.** To elementy układu pola: etykieta, błąd i podpowiedź. Formularze rdzenia wiążą pola z `useForm` same, przez `register` albo `Controller` (na przykład `InviteUserDialog`).
- **`DataTable` nie dzieli wierszy na strony sam.** Bez `pagination` pokazuje wszystkie wiersze i sortuje je w przeglądarce, chyba że dostanie `sorting` i `onSortingChange`: wtedy sortowanie należy do wywołującego (`manualSorting`). Z `pagination` sortowanie i podział na strony zawsze należą do wywołującego (`manualSorting`, `manualPagination`), a pod tabelą pojawia się `DataTablePagination`. Panel widocznych kolumn zapamiętuje wybór w `localStorage` tylko wtedy, gdy podasz `storageKey`. W rdzeniu tabeli używa tylko `UsersManager`, bez `pagination` i bez `storageKey`.

Hook komentarzy `.claude/hooks/block-comments.mjs` pomija katalog `components/ui/` ([D23](decyzje.md#d23)), więc kilka plików ma komentarze. Katalog nie ma własnych testów. Komponenty działają w testach feature, które renderują je bez atrap, na przykład `DataTable` w `users-manager.test.tsx`.
