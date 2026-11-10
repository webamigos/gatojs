# Dziennik zdarzeń: autor zaproszenia i wejście superadmina przy logowaniu

Dwie luki w dzienniku zdarzeń znalezione w ręcznych testach kitu na `077b809`. Obie są w rdzeniu (`core`).

## Potwierdzenie luk w kodzie

1. `inviteUserCommand` (`src/features/users/services/commands/invite-user-command.ts`) tworzy zaproszenie przez
   `prisma.invitation.create` i rejestruje konto przez `auth.api.signUpEmail`. Plugin `audit-logs` zapisuje
   `member.invited` tylko w hooku `after` ścieżki `/organization/invite-member`, której ta komenda nie woła.
   Jedyny wpis przy tym przebiegu to `invitation.accepted` z `joinOrganizationCommand`, a jego autorem jest
   osoba zaproszona. Komenda nie woła `trackAudit`.
2. Hook `databaseHooks.session.create.before` w `src/shared/lib/auth/index.ts` ustawia `activeOrganizationId`
   z `getDefaultActiveOrganizationId`. Dla superadmina bez członkostw jest to najstarsza organizacja
   (`oldestOrganizationForSuperadmin`), czyli tryb serwisowy. `organization.entered` zapisuje tylko
   `enterOrganizationCommand`, więc wejście przy logowaniu nie zostawia wpisu.

## Zadanie 1: `member.invited` w `inviteUserCommand`

Sygnatura bez zmian: `inviteUserCommand(input: unknown, confirmation?: unknown)`.
Komenda woła `trackAudit` z `@/shared/lib/audit` po udanym `auth.api.signUpEmail`:

```ts
{
  ...auditActor(context),
  action: "member.invited",
  entityType: "invitation",
  entityId: invitation.id,
  newData: { email, role },
}
```

`auditActor(context)` daje `organizationId`, `actorUserId` (= `context.userId`) i `serviceMode` z `getOrgContext()`.

### Zachowania

| Wejście | Oczekiwany wynik |
| --- | --- |
| Admin `admin-1` w `org-1` (`serviceMode: false`), `{ name: "Jan Kowalski", email: "jan@firma.pl", role: "member" }`, zaproszenie `inv-1`, rejestracja się udaje | jedno wywołanie `trackAudit` z `{ organizationId: "org-1", actorUserId: "admin-1", serviceMode: false, action: "member.invited", entityType: "invitation", entityId: "inv-1", newData: { email: "jan@firma.pl", role: "member" } }` |
| Jak wyżej, `role: "admin"`, adres `"  JAN@Firma.PL "` | `newData: { email: "jan@firma.pl", role: "admin" }` (wartości po walidacji schematu) |
| `signUpEmail` rzuca | zaproszenie usunięte, wynik `{ success: false, error: "Nie udało się zaprosić użytkownika" }`, `trackAudit` nie wywołany |
| Adres ma konto | „Użytkownik z tym adresem już istnieje”, `trackAudit` nie wywołany |
| Brak roli admina / błędne wejście | błąd jak dotąd, `trackAudit` nie wywołany |
| Superadmin `super-1` w trybie serwisowym `org-1`, potwierdzenie `{ serviceModeConfirmed: true, organizationId: "org-1" }` | sukces, `trackAudit` z `actorUserId: "super-1"`, `organizationId: "org-1"`, `serviceMode: true` |
| Tryb serwisowy bez potwierdzenia | „Potwierdź zmianę w trybie serwisowym”, brak zaproszenia i `trackAudit` |
| Mail powitalny się nie wysyła | sukces z `warning: "mail-failed"`, wpis `member.invited` jest |
| Integracja (prawdziwa baza i better-auth): admin z aktywną organizacją A zaprasza `nowy@a.example` | ujście audytu dostaje `member.invited` z `organizationId` A, `actorUserId` admina, `entityId` = id zaproszenia z bazy, `newData: { email: "nowy@a.example", role: "member" }`; oraz `invitation.accepted` z `actorUserId` nowego użytkownika; żaden wpis nie ma `organizationId` B |
| Integracja: superadmin bez członkostwa, aktywna A, z potwierdzeniem | `member.invited` z `actorUserId` superadmina i `serviceMode: true` |

### Mutacje do zabicia

- usunięcie wywołania `trackAudit`;
- `trackAudit` przed `signUpEmail` (wpis mimo wycofanego zaproszenia);
- `action` inny niż `"member.invited"`, `entityType` inny niż `"invitation"`;
- `entityId` pusty lub równy `userId` zamiast id zaproszenia;
- `newData` bez `email` albo bez `role`, albo z wartościami sprzed walidacji;
- aktor `admin.id` z `getAdminUserOrNull` zamiast `auditActor(context)` (w trybie serwisowym traci `serviceMode: true`);
- `serviceMode` stałe `false`.

## Zadanie 2: `organization.entered` przy tworzeniu sesji

Nowa funkcja w `src/features/organizations/services/service-mode-entry.ts`:

```ts
export async function trackServiceModeEntry(session: {
  userId: string;
  activeOrganizationId?: string | null;
}): Promise<void>
```

Wołana z `databaseHooks.session.create.after` w `src/shared/lib/auth/index.ts`. Zapisuje
`{ organizationId, actorUserId: userId, action: "organization.entered", entityType: "organization", entityId: organizationId, serviceMode: true }`
tylko gdy sesja ma aktywną organizację, rola globalna konta (z bazy) to `superadmin` i konto nie ma członkostwa
w tej organizacji. Każdy błąd (Prisma) zapisuje w logu i nie rzuca.

Dlaczego `after`, a nie `before`: wpis powstaje dopiero po zapisaniu sesji (nieudane utworzenie sesji nie zostawia
wpisu), query `getDefaultActiveOrganizationId` zostaje odczytem, a hook widzi organizację, którą sesja naprawdę
dostała (także gdy `activeOrganizationId` ustawi inny hook).

### Zachowania

| Wejście | Oczekiwany wynik |
| --- | --- |
| `{ userId: "super-1", activeOrganizationId: "org-1" }`, rola `superadmin`, brak członkostwa w `org-1` | jedno `trackAudit` z `{ organizationId: "org-1", actorUserId: "super-1", action: "organization.entered", entityType: "organization", entityId: "org-1", serviceMode: true }` |
| superadmin z członkostwem w `org-1` | brak wpisu |
| rola `user` albo `admin`, brak członkostwa w `org-1` | brak wpisu |
| `activeOrganizationId: null` albo brak pola | brak wpisu, bez zapytań o członkostwo |
| konto nie istnieje (`user.findUnique` → `null`) | brak wpisu |
| Prisma rzuca | funkcja kończy się bez wyjątku, `logger.error` wywołany, brak wpisu |
| Integracja: superadmin bez członkostw, organizacje A (starsza) i B; sesja tworzona przez better-auth (`(await auth.$context).internalAdapter.createSession(userId)`) | sesja ma aktywną A; ujście dostaje jeden `organization.entered` dla A z `serviceMode: true`; nic dla B |
| Integracja: superadmin z członkostwem w B (A starsza) | sesja ma aktywną B, brak wpisu |
| Integracja: zwykły użytkownik z członkostwem w A | brak wpisu |
| Integracja: ujście audytu rzuca | sesja powstaje (logowanie nie jest blokowane) |

### Mutacje do zabicia

- usunięcie sprawdzenia roli `superadmin`;
- usunięcie sprawdzenia członkostwa albo odwrócenie warunku;
- członkostwo szukane bez filtra `organizationId` (członkostwo w innej organizacji blokuje wpis);
- usunięcie sprawdzenia braku `activeOrganizationId`;
- `serviceMode: false` albo brak pola;
- `entityId`/`organizationId` inne niż aktywna organizacja;
- usunięcie `try/catch` (błąd blokuje logowanie);
- brak podpięcia funkcji w `session.create.after`.

## Testy integracyjne

Obie komendy należą do rdzenia, więc testy integracyjne są w rdzeniu i nie zależą od modułu `audit-logs`
(projekt złożony bez niego też je uruchamia). Ujście audytu podmienia `vi.mock("@/modules.generated")`
z `importActual` i własnym `auditSinks`, reszta (Prisma, better-auth) jest prawdziwa.
