# wa-kit — Superadmin (admin systemowy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Globalna rola `superadmin` (serwis Web Amigos) obok `admin` (zleceniodawca): nietykalne konta serwisowe, impersonacja zależna od roli i `ADMIN_IMPERSONATION`, wejście superadmina do dowolnej organizacji z dialogiem-przypomnieniem przed zmianą danych.

**Architecture:** Rola żyje w `user.role` (plugin admin better-auth z `createAccessControl`). Reguły „kto może co zrobić komu” są czystymi funkcjami w `src/shared/lib/auth/`, używanymi przez hook `before` better-auth i przez UI. Wejście do cudzej organizacji to zwykła aktywna organizacja w sesji: `getOrgContext()` dla superadmina bez członkostwa zwraca `orgRole: "owner"` i `serviceMode: true`; każda komenda `"use server"` na danych organizacji wymaga potwierdzenia trybu serwisowego (`assertServiceModeConfirmed`), które UI zbiera jednym wspólnym dialogiem.

**Tech Stack:** Next.js 16, better-auth 1.7 (`admin`, `organization`, `better-auth/plugins/access`), Prisma 7, zod 4, next-intl, Vitest + Testing Library, testy integracyjne na Postgresie, Stryker + bramka mutacji.

**Spec:** `.superpowers/system-admin/spec.md` (decyzje Jakuba 1–4), `docs/superpowers/specs/2026-10-26-wa-kit-design.md` §3.1, macierz dostępu `.superpowers/access-matrix/draft.md`, reguły testów `AGENTS.md` („Testy, które próbują złamać kod”).

## Global Constraints

- Role globalne: `user`, `admin`, `superadmin` (dokładnie te napisy w `user.role`). Role w organizacji bez zmian: `owner`, `admin`, `member`.
- Etykieta konta superadmina w UI: PL „Serwis (Web Amigos)”, EN „Service (Web Amigos)”.
- Dialog trybu serwisowego: tytuł PL „Tryb serwisowy”, treść „Zmieniasz dane organizacji {name} jako serwis Web Amigos.”, przyciski „Anuluj” / „Zmień”. EN: „Service mode”, „You are changing data of organization {name} as Web Amigos service.”, „Cancel” / „Change”.
- Pasek: PL „Tryb serwisowy: {name}”, EN „Service mode: {name}”.
- `ADMIN_IMPERSONATION` parsowane jak `MULTI_ORG` (`true`/`false`, wielkość liter i spacje bez znaczenia, inne wartości = błąd), domyślnie `false`. Dopisać do `.env.example` w części rdzenia (poza regionem `wa:modules`).
- Superadmin nigdy nie dostaje „wszystkich danych naraz”: brak aktywnej organizacji = `NoOrganizationError`, nigdy pusty filtr.
- Proces każdego zadania (`AGENTS.md`): sekcje „Zachowania” i „Mutacje do zabicia” poniżej są specyfikacją dla `test-writer`; implementer pracuje z `.superpowers/phase` = `implement`; `test-reviewer` uruchamia `npm run test:mutation:task -- <pliki>` i `npm run test:mutation:gate`. Nowe pliki w `src/shared/lib/auth/` są krytyczne automatycznie (prefiks w `mutation-gate.json`).
- Bez komentarzy w kodzie, Conventional Commits z `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, praca na bieżącej gałęzi, bez pusha.
- Bramka: `npm run verify` i `npm run test:integration` (Postgres: `DB_PORT=5439 docker compose up -d db`, `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5439/wa_app_test`).

## Review Focus

- Admin klienta wywołuje bezpośrednio API better-auth (`/admin/set-role`, `/admin/remove-user`, `/admin/ban-user`, `/admin/set-user-password`, `/admin/update-user`, `/admin/impersonate-user`) na koncie superadmina → 403 i brak zmiany w bazie → testy w Task 2.
- Admin nadaje komuś (albo sobie) rolę `superadmin` przez `/admin/set-role` lub `/admin/create-user` z `role: "superadmin"` → 403 → testy w Task 2.
- Superadmin przełącza się na organizację B, a cookie cache sesji trzyma jeszcze A → `getOrgContext()` od razu zwraca B → test integracyjny w Task 4.
- Dialog potwierdzono w organizacji A, a komenda wykonuje się już w B (np. drugi tab) → komenda odrzuca potwierdzenie z innym `organizationId` → test w Task 5.
- Owner organizacji A (nie superadmin) podaje `enterOrganizationCommand(<id B>)` ręcznie → odmowa, sesja bez zmian → test integracyjny w Task 4.

---

### Task 1: Rola `superadmin` w regułach dostępu

**Files:**
- Modify: `src/shared/lib/auth/roles.ts`, `src/shared/lib/auth/permissions.ts`, `src/shared/lib/auth/single-org-guard.ts`, `src/shared/lib/auth/helpers.ts`, `src/shared/lib/modules/nav.ts`, `src/app/[locale]/(app)/users/page.tsx`, `src/features/users/components/user-account-columns.tsx`, `src/features/users/i18n/{pl,en}.json`
- Test: `src/shared/lib/auth/__tests__/access-matrix.test.ts` (nowy), istniejące `roles.test.ts`, `permissions.test.ts`, `helpers.test.ts`, `single-org-guard.test.ts`, `nav.test.ts`, `user-account-columns.test.tsx`

**Interfaces:**
- Produces: `USER_ROLES.SUPERADMIN = "superadmin"`; `type UserRole = "user" | "admin" | "superadmin"`; `isGlobalAdmin(role: unknown): boolean` (prawda dla `admin` i `superadmin`); `toUserRole(role: unknown): UserRole` rozpoznaje `superadmin`.

**Zachowania:**
- `toUserRole`: `"superadmin"` → `superadmin`, `"admin"` → `admin`, `"SuperAdmin"`, `"root"`, `null` → `user`.
- `isGlobalAdmin`: `admin`, `superadmin` → `true`; `user`, `"owner"`, `undefined` → `false`.
- Macierz `access-matrix.test.ts` jako literał (moduły × kolumny): kolumny `superadmin` i `admin` identyczne. Wartości z `.superpowers/access-matrix/draft.md`. Dla każdej kombinacji `userRole` ∈ {user, admin, superadmin} × `orgRole` ∈ {owner, admin, member, null} × `multiOrg` ∈ {false, true} sprawdza `canAccessModule` dla 5 modułów rejestru. Ten sam test sprawdza, że `getNavEntries` zwraca dokładnie pozycje modułów z ✓ (decyzja 3: nawigacja = macierz).
- Etykieta „Członkowie” w nawigacji (MULTI_ORG=true) nie pojawia się ani dla `admin`, ani dla `superadmin`.
- `assertGlobalAdmin("superadmin")` przepuszcza; `getAdminUserOrNull` zwraca superadmina; `/users` renderuje `UsersManager` dla `superadmin`.
- Kolumna roli: `superadmin` → badge „Serwis (Web Amigos)”.

**Mutacje do zabicia:** `isGlobalAdmin` zwracające prawdę tylko dla jednej z ról; `toUserRole` bez gałęzi superadmin; porównania `=== USER_ROLES.ADMIN` pozostawione w `permissions.ts`, `nav.ts`, `helpers.ts`, `single-org-guard.ts`, `users/page.tsx`.

- [ ] **Step 1:** `test-writer` pisze testy z „Zachowania” (macierz jako literał tabeli). Run: `npx vitest run src/shared/lib/auth src/shared/lib/modules src/features/users` → nowe testy FAIL.
- [ ] **Step 2:** Implementacja: `isGlobalAdmin` zastępuje każde porównanie z `USER_ROLES.ADMIN` w plikach z listy; etykieta i18n `role-superadmin`.
- [ ] **Step 3:** Run testów z kroku 1 → PASS; `test-reviewer` (mutacje na zmienionych plikach + bramka).
- [ ] **Step 4: Commit** — `feat(auth): add superadmin global role to access rules`

---

### Task 2: Uprawnienia pluginu admin i ochrona kont superadmina

**Files:**
- Create: `src/shared/lib/auth/admin-access.ts`, `src/shared/lib/auth/impersonation-policy.ts`
- Modify: `src/shared/lib/auth/index.ts` (plugin `admin` i hook `before`), `src/shared/lib/env.ts` (`ADMIN_IMPERSONATION`), `.env.example`
- Test: `src/shared/lib/auth/__tests__/admin-access.test.ts`, `impersonation-policy.test.ts` (nowe), `auth-config.test.ts` (rozszerzenie), `src/shared/lib/__tests__/env.test.ts`

**Interfaces:**
- Consumes: `USER_ROLES`, `isGlobalAdmin` (Task 1).
- Produces:
  - `createAdminRoles(options: { adminImpersonation: boolean }): { ac: AccessControl; roles: Record<UserRole, Role> }`: `superadmin` = wszystkie uprawnienia `defaultStatements`; `admin` = `user: ["create","list","set-role","ban","delete","set-password","set-email","get","update"]`, `session: ["list","revoke","delete"]`, plus `impersonate` tylko gdy `adminImpersonation`; `user` = brak.
  - `canImpersonate(input: { actorRole: UserRole; targetRole: UserRole; adminImpersonation: boolean }): boolean`.
  - `assertAdminActionAllowed(input: { path: string; actorRole: UserRole; targetRole: UserRole | null; requestedRole: string | null; adminImpersonation: boolean }): void`, rzuca `APIError("FORBIDDEN")`.
  - `ADMIN_TARGET_PATHS`: `/admin/set-role`, `/admin/ban-user`, `/admin/unban-user`, `/admin/remove-user`, `/admin/set-user-password`, `/admin/update-user`, `/admin/impersonate-user`, `/admin/revoke-user-session`, `/admin/revoke-user-sessions`, `/admin/list-user-sessions`.
  - Hook `before` w `index.ts`: dla ścieżki z `ADMIN_TARGET_PATHS` albo `/admin/create-user` czyta rolę aktora z sesji i rolę celu z `prisma.user.findUnique({ where: { id: body.userId }, select: { role: true } })`, potem woła `assertAdminActionAllowed`.

**Zachowania:**
- `canImpersonate`:

  | aktor \ cel | user | admin | superadmin |
  |---|---|---|---|
  | superadmin | ✓ | ✓ | ✗ |
  | admin, `adminImpersonation=false` | ✗ | ✗ | ✗ |
  | admin, `adminImpersonation=true` | ✓ | ✗ | ✗ |
  | user | ✗ | ✗ | ✗ |

- `assertAdminActionAllowed`: aktor ≠ superadmin i cel = superadmin → 403 na każdej ścieżce z listy. `requestedRole === "superadmin"` (set-role, create-user) i aktor ≠ superadmin → 403. Impersonacja zgodnie z `canImpersonate`. Superadmin na innym superadminie: dozwolone wszystko poza impersonacją.
- Przez prawdziwe `auth` (wzorzec `auth-config.test.ts`): admin → `setRole`, `removeUser`, `banUser`, `setUserPassword`, `impersonateUser` na koncie superadmina → 403, `prisma.user.update`/`delete` nie wywołane. Admin → `setRole(role: "superadmin")` na zwykłym userze → 403. Admin → `createUser({ role: "superadmin" })` → 403. Superadmin → `setRole` admina na `user` → sukces. Superadmin → `impersonateUser` admina → sukces. Admin z `ADMIN_IMPERSONATION=true` → `impersonateUser` usera → sukces, admina → 403.
- `ADMIN_IMPERSONATION`: brak → `false`; `"TRUE"` → `true`; `"1"` → błąd z nazwą zmiennej.

**Mutacje do zabicia:** brak ścieżki na liście `ADMIN_TARGET_PATHS`; warunek celu superadmin odwrócony lub pominięty; brak sprawdzenia `requestedRole`; `canImpersonate` ignorujące `adminImpersonation` albo cel `admin`; `admin` z uprawnieniem `impersonate` niezależnie od flagi.

- [ ] **Step 1:** `test-writer` → testy czerwone. Run: `npx vitest run src/shared/lib/auth src/shared/lib/__tests__/env.test.ts`.
- [ ] **Step 2:** Implementacja `admin-access.ts`, `impersonation-policy.ts`, env, hook i konfiguracja `admin({ ac, roles, adminRoles: ["admin","superadmin"], defaultRole: "user" })`.
- [ ] **Step 3:** PASS; `test-reviewer`.
- [ ] **Step 4: Commit** — `feat(auth): protect superadmin accounts and gate impersonation by role`

---

### Task 3: `admin:create --role`

**Files:**
- Modify: `scripts/lib/admin-create.ts`, `scripts/admin-create.ts`, `README.md` (sekcja admina)
- Test: `scripts/lib/__tests__/admin-create.test.ts`

**Interfaces:**
- Produces: `AdminCreateOptions.role?: "admin" | "superadmin"` (domyślnie `"admin"`); flaga CLI `--role`.

**Zachowania:**
- Nowe konto → `createUser` z `role` równym opcji (`admin` domyślnie, `superadmin` przy `--role superadmin`).
- Istniejące `user` → potwierdzenie „Użytkownik {email} istnieje. Nadać rolę {rola}? [t/N]” (albo `--yes`) → rola nadana.
- Istniejące `admin` + `--role superadmin` → potwierdzenie → `superadmin`.
- Istniejące `superadmin` + `--role admin` (lub bez `--role`) → rola **bez zmian**, bez pytania, komunikat „Administrator {email} gotowy”.
- `--role root` → błąd „Nieznana rola: root (dozwolone: admin, superadmin)” przed jakimkolwiek zapisem.
- Członkostwo `owner` w pierwszej organizacji jak dotąd.

**Mutacje do zabicia:** obniżenie roli superadmin; brak pytania przy podniesieniu; brak walidacji roli; zawsze `USER_ROLES.ADMIN` w `createUser`.

- [ ] **Step 1:** `test-writer` → czerwone. Run: `npx vitest run scripts/lib/__tests__/admin-create.test.ts`.
- [ ] **Step 2:** Implementacja.
- [ ] **Step 3:** PASS; `test-reviewer`.
- [ ] **Step 4: Commit** — `feat(cli): admin:create --role admin|superadmin`

---

### Task 4: Superadmin wchodzi do dowolnej organizacji

**Files:**
- Modify: `src/shared/lib/auth/org-context.ts`, `src/features/organizations/services/queries/default-organization-query.ts`, `src/features/organizations/components/org-switcher.tsx`, `src/app/[locale]/(app)/layout.tsx`, `src/app/[locale]/no-organization/page.tsx`
- Create: `src/features/organizations/services/commands/enter-organization-command.ts`, `src/features/organizations/services/queries/switchable-organizations-query.ts`
- Test: `org-context.test.ts`, `default-organization-query.test.ts`, `org-switcher.test.tsx`, `organization-isolation.integration.test.ts` (rozszerzenie), nowe testy komendy i query

**Interfaces:**
- Consumes: `isGlobalAdmin`, `USER_ROLES.SUPERADMIN` (Task 1).
- Produces:
  - `OrgContext` + `serviceMode: boolean`.
  - `enterOrganizationCommand(organizationId: unknown): Promise<OperationResult>`: `"use server"`, ustawia `activeOrganizationId` sesji (`prisma.session.update` po `session.id`) dla superadmina (organizacja musi istnieć) albo członka; inaczej `{ success: false, error: "Brak dostępu do organizacji" }`.
  - `type SwitchableOrganization = { id: string; name: string; isMember: boolean }` (w `src/features/organizations/contracts/organization-switcher.types.ts`).
  - `getSwitchableOrganizationsQuery(): Promise<SwitchableOrganization[]>`: superadmin → wszystkie organizacje (po nazwie), inni → swoje członkostwa.
  - `OrgSwitcher` props: `{ organizations: SwitchableOrganization[]; activeOrganizationId: string; }` (widoczny, gdy `organizations.length > 1`), przełączenie przez `enterOrganizationCommand` + `router.refresh()`.

**Zachowania:**
- `getOrgContext()` superadmina bez członkostwa w aktywnej organizacji, która istnieje → `{ orgRole: "owner", serviceMode: true }`; członek (także superadmin z członkostwem) → `serviceMode: false`; superadmin z aktywną organizacją, która nie istnieje → `NoOrganizationError`; superadmin bez aktywnej organizacji → `NoOrganizationError` (nigdy „wszystko”).
- Dla superadmina `getOrgContext()` czyta sesję z `disableCookieCache: true`, więc przełączenie działa od razu.
- `getDefaultActiveOrganizationId(userId)`: członkostwo → najstarsze; brak członkostwa i rola `superadmin` → najstarsza organizacja; inaczej `null`.
- Integracja (Postgres, `organization-isolation.integration.test.ts`): superadmin bez członkostwa wchodzi do B → `getOrganizationMembersQuery()` zwraca członków B; owner A → `enterOrganizationCommand(B)` → odmowa, `activeOrganizationId` sesji bez zmian; admin klienta (rola `admin`) bez członkostwa w B → odmowa; superadmin → `enterOrganizationCommand("nie-istnieje")` → odmowa.
- `/no-organization` dla superadmina pokazuje listę z `getSwitchableOrganizationsQuery()` z przyciskiem wejścia.

**Mutacje do zabicia:** `serviceMode` zawsze `false`/`true`; superadmin wpuszczany do nieistniejącej organizacji; członkostwo wymagane od superadmina; brak sprawdzenia członkostwa dla nie-superadmina w komendzie; query zwracające wszystkie organizacje nie-superadminowi.

- [ ] **Step 1:** `test-writer` → czerwone (unit + integracja). Run: `npx vitest run src/shared/lib/auth src/features/organizations` oraz `npm run test:integration`.
- [ ] **Step 2:** Implementacja.
- [ ] **Step 3:** PASS; `test-reviewer` z `npm run test:mutation:integration` dla zmienionych plików organizacji.
- [ ] **Step 4: Commit** — `feat(organizations): let superadmin enter any organization`

---

### Task 5: Tryb serwisowy: pasek, dialog i potwierdzenie po stronie serwera

**Files:**
- Create: `src/shared/lib/auth/service-mode.ts`, `src/shared/components/service-mode/service-mode-provider.tsx`, `src/shared/components/service-mode/service-mode-banner.tsx`, `src/shared/components/service-mode/use-service-mode-action.tsx`
- Modify: `src/app/[locale]/(app)/layout.tsx`, `src/features/users/services/commands/invite-user-command.ts`, `src/features/users/components/invite-user-dialog.tsx`, `src/app/messages/{pl,en}.json` (namespace `serviceMode`), `src/__tests__/server-entrypoints-guard.test.ts`
- Test: `service-mode.test.ts`, testy komponentów `service-mode/__tests__/`, `invite-user-command.test.ts`, `invite-user-dialog.test.tsx`, test architektury

**Interfaces:**
- Consumes: `OrgContext.serviceMode` (Task 4).
- Produces:
  - `type ServiceModeConfirmation = { serviceModeConfirmed: true; organizationId: string }`.
  - `class ServiceModeConfirmationError extends DomainError` z komunikatem „Potwierdź zmianę w trybie serwisowym”.
  - `assertServiceModeConfirmed(context: OrgContext, confirmation: unknown): void`.
  - `ServiceModeProvider` (props `{ active: boolean; organizationId: string; organizationName: string; children }`), `useServiceMode()`.
  - `useServiceModeAction(): { run<TInput, TResult>(action: (input: TInput, confirmation?: ServiceModeConfirmation) => Promise<TResult>, input: TInput): Promise<TResult | null>; dialog: React.ReactNode }`. Poza trybem serwisowym `run` woła akcję bez dialogu i bez potwierdzenia. W trybie serwisowym otwiera dialog, a po „Zmień” woła akcję z `{ serviceModeConfirmed: true, organizationId }`. Po „Anuluj” zwraca `null` bez wywołania.
  - Komendy na danych organizacji mają sygnaturę `(input: unknown, confirmation?: unknown)`.

**Zachowania:**
- `assertServiceModeConfirmed`: `serviceMode: false` → nic, niezależnie od `confirmation`; `serviceMode: true` i `confirmation` = `{ serviceModeConfirmed: true, organizationId: <aktywna> }` → nic; brak, `serviceModeConfirmed: false`, inne `organizationId`, `"yes"`, `null` → `ServiceModeConfirmationError`.
- `inviteUserCommand` w trybie serwisowym bez potwierdzenia → `{ success: false, error: "Potwierdź zmianę w trybie serwisowym" }`, bez zapisu do bazy; z potwierdzeniem → jak dotąd.
- Dialog i pasek: teksty z Global Constraints; pasek widoczny tylko przy `serviceMode`.
- `InviteUserDialog` w trybie serwisowym: wysłanie formularza otwiera dialog; „Anuluj” → komenda nie wywołana; „Zmień” → komenda wywołana z potwierdzeniem.
- Test architektury: każda eksportowana funkcja w pliku `"use server"`, która woła `getOrgContext` (wprost albo przez lokalny helper), woła też `assertServiceModeConfirmed` przed pierwszym dostępem do Prismy. Analizator ma testy na wrogich przykładach (brak wywołania, wywołanie po Prismie, wywołanie ukryte w helperze).

**Mutacje do zabicia:** porównanie `organizationId` pominięte; `serviceMode` ignorowane; dialog wywołujący akcję po „Anuluj”; potwierdzenie przekazywane poza trybem serwisowym bez znaczenia (dozwolone), ale brak potwierdzenia w trybie serwisowym przepuszczony.

- [ ] **Step 1:** `test-writer` → czerwone. Run: `npx vitest run src/shared src/features/users src/__tests__`.
- [ ] **Step 2:** Implementacja.
- [ ] **Step 3:** PASS; `test-reviewer`.
- [ ] **Step 4: Commit** — `feat(auth): confirm data changes in superadmin service mode`

---

### Task 6: Panel użytkowników: konta serwisowe i impersonacja

**Files:**
- Modify: `src/features/users/components/user-account-columns.tsx`, `src/features/users/components/users-manager.tsx`, `src/app/[locale]/(app)/users/page.tsx`
- Test: `user-account-columns.test.tsx`, `users-manager.test.tsx`

**Interfaces:**
- Consumes: `canImpersonate` (Task 2), `USER_ROLES.SUPERADMIN` (Task 1).
- Produces: `UsersManager` props + `currentUserRole: UserRole`, `adminImpersonation: boolean` (strona czyta `env.ADMIN_IMPERSONATION`).

**Zachowania:**
- Przycisk impersonacji jest widoczny tylko, gdy `canImpersonate({ actorRole: currentUserRole, targetRole: row.role, adminImpersonation })` i wiersz nie jest bieżącym użytkownikiem. Przypadki z tabeli z Task 2 jako `it.each` na renderze.
- Wiersz superadmina: badge „Serwis (Web Amigos)”, bez akcji dla `admin`.

**Mutacje do zabicia:** przycisk zawsze widoczny; ukrycie zależne tylko od roli celu; pominięcie `adminImpersonation`.

- [ ] **Step 1:** `test-writer` → czerwone. Run: `npx vitest run src/features/users`.
- [ ] **Step 2:** Implementacja.
- [ ] **Step 3:** PASS; `test-reviewer`; na koniec `npm run verify`, `npm run test:integration`, `npm run test:mutation && npm run test:mutation:integration && npm run test:mutation:gate`.
- [ ] **Step 4: Commit** — `feat(users): service accounts and role-aware impersonation in users panel`
