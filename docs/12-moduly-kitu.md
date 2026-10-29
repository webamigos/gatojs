# Moduły opcjonalne kitu

Po przeczytaniu będziesz wiedzieć:

- czym moduł opcjonalny różni się od rdzenia i jak go dodać do projektu albo usunąć z niego;
- co daje moduł `audit-logs`: model `AuditLog`, stronę `/audit-log`, komponent `<AuditTrail>` i zdarzenia, które loguje sam;
- jak działa wspólny punkt wejścia `trackAudit` z rdzenia, jeśli moduł nie jest zainstalowany, i jak działa lista ujść (`auditSinks`);
- co robi redakcja danych wrażliwych i dlaczego retencja jeszcze nie istnieje.

Zweryfikowano z kodem: 999e651, 2026-10-29

Źródła:

- `kit/modules/audit-logs.json`
- `src/features/audit-logs/module.ts`
- `src/features/audit-logs/audit-sink.ts`
- `src/features/audit-logs/auth.ts`
- `src/features/audit-logs/components/audit-trail.tsx`
- `src/features/audit-logs/services/write-audit-log.ts`
- `src/features/audit-logs/services/redact.ts`
- `src/features/audit-logs/services/organization-audit-events.ts`
- `src/features/audit-logs/services/audit-action-labels.ts`
- `src/features/audit-logs/services/queries/audit-log-queries.ts`
- `src/features/audit-logs/services/queries/audit-trail-query.ts`
- `src/shared/lib/audit.ts`
- `src/shared/lib/modules/define-module.ts`
- `src/features/organizations/services/commands/member-commands.ts`
- `src/features/organizations/services/commands/enter-organization-command.ts`
- `prisma/schema/audit-logs.prisma`
- `.github/workflows/kit.yml`

## Moduł kitu a rdzeń

Rdzeń (`core`) ma każdy projekt. Moduł opcjonalny to osobny wpis w `.wa/kit.json` z manifestem plików (`kit/modules/<nazwa>.json`), który projekt instaluje przez `wa create --modules <nazwa>` albo `npm run wa -- add <nazwa>` i usuwa przez `wa remove <nazwa>` ([kit/README.md](../kit/README.md)). Po instalacji i usunięciu zmienia się schemat bazy, więc migrację tworzy i commituje projekt ([03b](03b-schemat-i-migracje.md#migracje)).

Rdzeń nie importuje plików modułów opcjonalnych. Łączą się przez pliki generowane ([02b](02b-rejestr-i-generator.md#rejestr-modulow)): `wa generate` dopisuje moduł do tablicy `modules` w `src/modules.generated.ts`, a pliki `auth.ts` i `audit-sink.ts` modułu do tablic `authPlugins` i `auditSinks`. Rdzeń czyta te tablice, więc działa tak samo z modułem i bez niego.

Instalowanych kombinacji pilnuje job `assemble` w `.github/workflows/kit.yml`: dla każdego wpisu macierzy `combo` składa projekt z kitu i uruchamia w nim bramki. Macierz zawiera kombinację `core` (sam rdzeń) i `audit-logs`.

## `audit-logs`

Dziennik zdarzeń organizacji: kto, kiedy i co zmienił w danych organizacji. Moduł wymaga tylko rdzenia (`requires` jest puste).

| Część | Plik | Co robi |
| --- | --- | --- |
| Model | `prisma/schema/audit-logs.prisma` | Tabela `audit_logs` z modelem `AuditLog` (organizacja, opcjonalny użytkownik, `action`, `entityType`, `entityId`, `oldData`, `newData`, `channel`, `credentialId`, `serviceMode`, `createdAt`) i trzema indeksami z `organizationId`. Usunięcie organizacji kasuje wpisy, usunięcie użytkownika zeruje `userId`. |
| Ujście | `src/features/audit-logs/audit-sink.ts` | Eksportuje `auditSink`, czyli `writeAuditLog`: zapisuje zdarzenie w tabeli po redakcji danych wrażliwych. |
| Strona | `src/app/[locale]/(app)/audit-log/page.tsx` | Strona `/audit-log` chroniona przez `requireModuleAccess("audit-logs")`, dostępna dla ról `owner` i `admin` organizacji (`roles` w `module.ts`). Filtry: użytkownik, akcja, typ i id encji, zakres dat; sortowanie i paginacja. |
| Komponent | `src/features/audit-logs/components/audit-trail.tsx` | `<AuditTrail entityType entityId />`: historia jednej encji (50 ostatnich wpisów organizacji). |
| Plugin auth | `src/features/audit-logs/auth.ts` | Hooki better-auth, które logują zdarzenia członkostwa. |

### Punkt wejścia `trackAudit`

`trackAudit(event)` z `src/shared/lib/audit.ts` należy do rdzenia i woła po kolei każde ujście z `auditSinks`. Błąd ujścia jest tylko logowany (`trackAudit failed`), więc nie przerywa komendy, która go wywołała. Bez zainstalowanego `audit-logs` `auditSinks` jest puste, a `trackAudit` nic nie robi. Dzięki temu rdzeń i moduły projektu mogą go wołać bez sprawdzania, czy dziennik jest zainstalowany.

`AuditEvent` ma pola `organizationId`, `actorUserId`, `action`, `entityType` (wymagane) oraz `entityId`, `oldData`, `newData`, `channel` (`WEB` domyślnie albo `API`), `credentialId` i `serviceMode`. `auditActor(context)` wypełnia `organizationId`, `actorUserId` i `serviceMode` z kontekstu organizacji.

### Zdarzenia logowane przez moduł

| Akcja | Źródło | Encja |
| --- | --- | --- |
| `member.invited` | hook better-auth `/organization/invite-member` | `invitation` (w `newData` e-mail i rola) |
| `invitation.canceled` | hook `/organization/cancel-invitation` | `invitation` |
| `invitation.accepted` | hook `/organization/accept-invitation` oraz `joinOrganizationCommand` rdzenia (rejestracja z zaproszenia) | `invitation` |
| `member.role_changed` | hook `/organization/update-member-role` (poprzednia rola z hooka `before`) | `member` (`oldData`, `newData` z rolą) |
| `member.removed` | hook `/organization/remove-member` | `member` (w `oldData` użytkownik i rola) |
| `organization.entered` | `enterOrganizationCommand` rdzenia, tylko gdy superadmin wchodzi do organizacji bez członkostwa | `organization` |

Hooki obejmują wyłącznie ścieżki z `AUDITED_ORGANIZATION_PATHS`. Zdarzenie powstaje po udanym wywołaniu, z danych zwróconych przez better-auth. Zmiany wykonane przez superadmina w trybie serwisowym dostają `serviceMode: true`, a strona `/audit-log` oznacza je plakietką.

### Etykiety akcji

Każdy moduł deklaruje swoje akcje w `auditActions` w `module.ts` jako pary `{ action, labelKey }`. Etykietę czyta się z przestrzeni nazw tłumaczeń modułu, który akcję zadeklarował (`findAuditActionLabel` zwraca klucz modułu i `labelKey`). Akcja bez deklaracji jest wyświetlana jako surowy napis. Akcje członkostwa deklaruje `audit-logs` i trzyma ich etykiety w `src/features/audit-logs/i18n/{pl,en}.json`.

### Redakcja danych wrażliwych

Przed zapisem `oldData` i `newData` przechodzą przez `redactSensitive`: wartość pola o nazwie z listy (`password`, `passwordHash`, `secret`, `token`, `accessToken`, `refreshToken`, `apiKey`, `hashedKey`, `authorization`, `cookie`, bez rozróżniania wielkości liter) zamienia się na `[REDACTED]`, także w obiektach zagnieżdżonych i tablicach.

### Izolacja organizacji

Strona i `<AuditTrail>` czytają wpisy przez `getOrgContext()` i zawsze filtrują po `organizationId` aktywnej organizacji. `<AuditTrail>` nie renderuje nic, gdy rola użytkownika nie ma dostępu do modułu `audit-logs`, więc można go bezpiecznie wstawić na stronie dostępnej dla szerszej grupy.

### Retencja

Retencji (automatycznego usuwania starych wpisów) jeszcze nie ma. Wpisy rosną bez limitu, dopóki projekt sam ich nie usunie. Retencja pojawi się razem z modułem `worker`, który ma uruchamiać zadania w tle.

Jak użyć dziennika w funkcji projektu: [09b, sekcja o dzienniku zdarzeń](09b-implementacja-i-bramki.md#dziennik-zdarzen).
