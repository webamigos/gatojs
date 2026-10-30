# wa-kit plan 3: moduły `audit-logs`, `api-keys`, `uploads` — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trzy moduły kitu (`audit-logs`, `api-keys`, `uploads`) instalowane przez `wa create --modules`/`wa add`, ze szwami w rdzeniu, które pozwalają modułom projektu dopisywać akcje audytu, scope'y kluczy i cele uploadu bez edycji plików kitu.

**Architecture:** Każdy moduł to katalog `src/features/<x>/`, plik `prisma/schema/<x>.prisma`, strony i trasy API oraz manifest `kit/modules/<x>.json`. Rdzeń dostaje szew `trackAudit()` (no-op bez modułu), nowe pola danych w `defineModule` i dwa rozszerzenia generatora CLI: rejestr `auditSinks` i region kroków CI. Kod przenosimy z `company-dashboard-app`, `justnails-app` i `pgm-elearning`, bez domeny klientów.

**Tech Stack:** Next.js 16, Prisma 7 (schemat wieloplikowy), better-auth (pluginy `admin`, `organization`), next-intl, Zod 4, Vitest + Testing Library + `@fast-check/vitest`, Stryker, `@aws-sdk/client-s3`, `sharp`, `file-type`, MinIO, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-10-28-wa-kit-plan-3-modules-design.md](../specs/2026-10-28-wa-kit-plan-3-modules-design.md). Wykonawca czyta spec razem z planem.

**Ten plan to 3 z 4.** `worker` i `legal` dostaną osobny projekt. Plan 4: `wa update`, `wa diff`.

## Global Constraints

- Reguły `CLAUDE.md` i `AGENTS.md` obowiązują w każdym zadaniu: `getOrgContext()`/`requireModuleAccess()` i jawny filtr `organizationId`; komendy `(input: unknown, confirmation?: unknown)` z `assertServiceModeConfirmed` przed Prismą; UI przez `useServiceModeAction().run`; Zod w `contracts/`; `OperationResult<T>` i `handleCommandError()`; bez komentarzy poza `// WHY:`; bez `any`, zagnieżdżonych ternary i cichych `catch {}`.
- Każde nowe query i komenda na danych domenowych dostaje test izolacji (`*.integration.test.ts`): dwie organizacje, odczyt i zapis z kontekstem jednej nie dotyka drugiej.
- Test `src/__tests__/server-entrypoints-guard.test.ts` przechodzi bez osłabiania reguł. Jedyny przewidziany wyjątek: Task 17.
- Nie edytuj ręcznie `src/modules*.generated.ts` ani regionów `wa:*`. Uruchom `npm run wa -- generate`.
- Zmiana w `kit/cli/src` → `npm run build --prefix kit/cli` i commit `.wa/bin/wa.mjs` w tym samym commicie.
- Zmiana plików modułu → podbij `version` w `kit/modules/<x>.json`, potem `npm run wa -- kit sync`. Nowe moduły startują od `0.1.0`. Zmiana plików rdzenia w PR → `core` raz w tym PR podbity o minor.
- Zależności npm instaluj przez `npx -y npm@11.21.1 install`; wersję wpisz do manifestu modułu, który jej używa (test własności zależności).
- Wersje zgodne z kitem, nie ze źródeł (np. OTel `^0.218.0`, `@types/node ^22`).
- Prefiks klucza API: `${project.slug.replaceAll("-", "_")}_live_` (`src/shared/config/project.ts`).
- Wpisy `allowed` w `mutation-gate.json` dopisuje tylko Jakub. Agent je proponuje w opisie PR.
- Commity: Conventional Commits, temat małymi literami, stopka `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Bramki przed oddaniem PR: `npm run verify`, `npm run verify --prefix kit/cli`, `npm run test:integration` (wymaga `docker compose up -d db`, a od Task 14 także `minio`).

## Proces każdego zadania

Wymagany przez `AGENTS.md`; kroki zadań poniżej zakładają ten cykl i go nie powtarzają.

1. Subagent `test-writer` pisze testy z sekcji „Zachowania” i „Mutacje do zabicia” oraz z interfejsów zadania. Pokazuje czerwony przebieg z właściwego powodu (brak symbolu albo złe zachowanie, nie błąd składni).
2. Orkiestrator: `printf implement > .superpowers/phase`. Implementer pisze kod, nie dotyka testów; błędny test zgłasza.
3. Orkiestrator: `rm .superpowers/phase`. Subagent `test-reviewer` uruchamia `npm run test:mutation:task -- <pliki zadania>` (dla `kit/cli`: `npm run test:mutation:task --prefix kit/cli -- <pliki>`). Przeżyły mutant w logice bezpieczeństwa wraca do testera.
4. Recenzja kodu zadania, commit.

Subagenci na `sonnet`. Recenzja Opusem: zadania 2, 6, 9, 10, 16, 17 (bezpieczeństwo) i recenzja końcowa każdego PR.

## Gałęzie i PR

| PR | Gałąź (z `main`) | Zadania |
|---|---|---|
| A | `feat/plan-3-audit-logs` | 1–7 |
| B | `feat/plan-3-api-keys` (po merge A) | 8–12 |
| C | `feat/plan-3-uploads` (po merge B) | 13–19 |

## Review Focus

1. **SVG i HTML jako „obraz”.** Cel uploadu z `image/svg+xml` albo `text/html` w `mimeTypes` dałby XSS z naszej domeny. Oczekiwane: walidacja definicji celu odrzuca te typy, a pobieranie zawsze wysyła `X-Content-Type-Options: nosniff`. Test: Task 15 i Task 17.
2. **Nazwa pliku z cudzysłowem, nową linią albo znakami spoza ASCII** w `Content-Disposition`. Oczekiwane: brak wstrzyknięcia nagłówka, poprawny `filename*`. Test: Task 17.
3. **Klucz API z inną wielkością liter, białymi znakami albo bez prefiksu `Bearer`.** Oczekiwane: 401 `invalid`/`missing`, bez wyjątku. Test: Task 10.
4. **Wpis audytu z danymi wrażliwymi zagnieżdżonymi w tablicy obiektów** (`{ users: [{ password }] }`) albo pod kluczem z inną wielkością liter (`Authorization`). Oczekiwane: `"[REDACTED]"`. Test: Task 3.
5. **Filtry widoku audytu z nieprawidłowymi wartościami w URL** (`page=-1`, `pageSize=1000`, `from=abc`). Oczekiwane: wartości domyślne, bez błędu 500. Test: Task 4.

---

## PR A: `audit-logs`

### Task 1: Rejestr `auditSinks` w generatorze CLI

**Files:**
- Modify: `kit/cli/src/generate/registry.ts` (`RegistryModule`, `renderRegistry`)
- Modify: `kit/cli/src/generate/index.ts:36-41` (wykrywanie pliku)
- Test: `kit/cli/src/generate/__tests__/registry.test.ts` (istniejący plik testów generatora; jeśli nazwany inaczej, ten, który testuje `renderRegistry`)
- Modify: `.wa/bin/wa.mjs` (przebudowa), `src/modules.generated.ts` (przez `wa generate`)

**Interfaces:**
- Produces: `RegistryModule.hasAuditSink: boolean`; w `src/modules.generated.ts` eksport `auditSinks` (`never[]` bez modułów; inaczej tablica importów `import { auditSink as <camel>AuditSink } from "@/features/<x>/audit-sink";`). Plik modułu: `src/features/<x>/audit-sink.ts` z eksportem `auditSink`.

**Zachowania:**
- moduł z `audit-sink.ts` → `auditSinks = [auditLogsAuditSink]` i linia importu z `@/features/audit-logs/audit-sink`.
- brak modułów z plikiem → `export const auditSinks: never[] = [];`.
- dwa moduły z plikiem → kolejność jak `modules` (alfabetyczna po nazwie, tak jak dziś dla `authPlugins`).
- `auditSinks` tylko w pliku serwerowym; `modules.client.generated.ts` bez zmian.

**Mutacje do zabicia:** pominięcie filtra `hasAuditSink` (import dla modułu bez pliku); `auditSinks` trafia do pliku klienta; zamiana `never[]` na `[]` bez typu.

- [ ] **Step 1:** Testy `renderRegistry` dla trzech przypadków z „Zachowań”, asercje na dokładne linie tekstu (literały).
- [ ] **Step 2:** `npm test --prefix kit/cli -- registry` → FAIL (brak `hasAuditSink`/`auditSinks`).
- [ ] **Step 3:** Dodaj `hasAuditSink` (wykrycie `audit-sink.ts` jak `env.ts`) i `typedArray("auditSinks", …)` po `authPlugins`.
- [ ] **Step 4:** `npm run verify --prefix kit/cli` → PASS; `npm run build --prefix kit/cli`; `npm run wa -- generate`; `git diff src/modules.generated.ts` pokazuje `export const auditSinks: never[] = [];`.
- [ ] **Step 5:** Commit `feat(cli): collect audit sinks in module registry` z bundlem i plikiem generowanym.

### Task 2: Szew audytu i pola `defineModule` w rdzeniu

**Files:**
- Create: `src/shared/lib/audit.ts`
- Modify: `src/shared/lib/modules/define-module.ts`
- Modify: `src/features/organizations/services/commands/enter-organization-command.ts`
- Test: `src/shared/lib/__tests__/audit.test.ts`, `src/features/organizations/services/commands/__tests__/enter-organization-command.test.ts`
- Modify: `mutation-gate.json` (`critical` += `"src/shared/lib/audit.ts"`), `kit/modules/core.json` (`version` → `0.2.0`)

**Interfaces:**
- Consumes: `auditSinks` z Task 1; `OrgContext` z `src/shared/lib/auth/org-context.ts`.
- Produces:
  ```ts
  export type AuditChannel = "WEB" | "API";
  export interface AuditEvent {
    organizationId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    oldData?: unknown;
    newData?: unknown;
    channel?: AuditChannel;
    credentialId?: string | null;
    serviceMode?: boolean;
  }
  export type AuditSink = (event: AuditEvent) => Promise<void>;
  export function auditActor(context: OrgContext): Pick<AuditEvent, "organizationId" | "actorUserId" | "serviceMode">;
  export async function trackAudit(event: AuditEvent, sinks?: readonly AuditSink[]): Promise<void>;
  ```
  W `define-module.ts`:
  ```ts
  export interface ModuleAuditAction { action: string; labelKey: string }
  export interface ModuleApiScope { key: string; labelKey: string }
  export interface ModuleUploadPurpose {
    key: string;
    mimeTypes: readonly string[];
    maxBytes: number;
    visibility: "public" | "organization";
    resizeImage?: { maxWidth: number };
  }
  ```
  oraz opcjonalne `auditActions?: ModuleAuditAction[]`, `apiScopes?: ModuleApiScope[]`, `uploadPurposes?: ModuleUploadPurpose[]` w `ModuleDef`. `labelKey` to klucz w namespace modułu (`key`).

**Zachowania:**
- `trackAudit(event, [])` → resolves `undefined`, nic nie woła.
- `trackAudit(event, [sinkA, sinkB])` → oba dostają ten sam obiekt zdarzenia, w kolejności.
- `sinkA` rzuca `new Error("db down")` → `trackAudit` nie rzuca, `sinkB` nadal wywołany, `logger.error` dostaje komunikat `"trackAudit failed"` i atrybut `action`.
- `auditActor({ userId: "u1", organizationId: "o1", orgRole: "owner", userRole: "superadmin", serviceMode: true })` → `{ organizationId: "o1", actorUserId: "u1", serviceMode: true }`.
- `src/shared/lib/audit.ts` nie zawiera dyrektywy `"use server"` (test czyta źródło pliku).
- `enterOrganizationCommand("o2")` przez superadmina bez członkostwa w `o2` → jeden `trackAudit` z `{ organizationId: "o2", actorUserId: <superadmin>, action: "organization.entered", entityType: "organization", entityId: "o2", serviceMode: true }`.
- `enterOrganizationCommand` przez członka organizacji → brak wpisu; odmowa dostępu → brak wpisu.

**Mutacje do zabicia:** usunięcie `try/catch` wokół sinka; `break` po pierwszym błędzie; `serviceMode` zawsze `false`; wpis przy wejściu członka; wpis przed sprawdzeniem dostępu.

- [ ] **Step 1:** Testy z „Zachowań” (sinki jako `vi.fn()`; komenda z istniejącym wzorcem testu komendy, `trackAudit` z `@/shared/lib/audit` mockowany jako I/O granica).
- [ ] **Step 2:** `npx vitest run src/shared/lib/__tests__/audit.test.ts src/features/organizations/services/commands/__tests__/enter-organization-command.test.ts` → FAIL.
- [ ] **Step 3:** Zaimplementuj `audit.ts` (domyślne `sinks = auditSinks` z `@/modules.generated`), typy w `define-module.ts`, wpis w `enterOrganizationCommand` po `prisma.session.update` tylko gdy superadmin nie ma członkostwa (członkostwo ustala się zapytaniem `member.findFirst({ where: { organizationId, userId } })` albo z `canEnterOrganization`, jeśli zwraca tę informację).
- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit `feat(core): add audit seam and module declarations`.

### Task 3: Moduł `audit-logs`: manifest, schemat, sink

**Files:**
- Create: `kit/modules/audit-logs.json`, `prisma/schema/audit-logs.prisma`, `src/features/audit-logs/module.ts`, `src/features/audit-logs/i18n/{pl,en}.json`, `src/features/audit-logs/audit-sink.ts`, `src/features/audit-logs/services/redact.ts`, `src/features/audit-logs/services/write-audit-log.ts`
- Test: `src/features/audit-logs/services/__tests__/redact.test.ts`, `src/features/audit-logs/services/__tests__/write-audit-log.integration.test.ts`
- Modify (przez `generate`/`kit sync`): `src/modules*.generated.ts`, `prisma/schema/{auth,organizations}.prisma` (regiony), `.wa/kit.json`, `mutation-gate.json` (`critical` += `"src/features/audit-logs/services/"`)

**Interfaces:**
- Consumes: `AuditEvent`, `AuditSink` (Task 2).
- Produces:
  - Model `AuditLog` (`@@map("audit_logs")`): `id String @id @default(uuid()) @db.Uuid`, `organizationId String` (relacja `Organization`, `onDelete: Cascade`), `userId String?` (relacja `User`, `onDelete: SetNull`), `action String`, `entityType String`, `entityId String?`, `oldData Json?`, `newData Json?`, `channel AuditChannel @default(WEB)`, `credentialId String?`, `serviceMode Boolean @default(false)`, `createdAt DateTime @default(now()) @db.Timestamptz`; indeksy `[organizationId, createdAt]`, `[organizationId, entityType, entityId]`, `[organizationId, userId, createdAt]`; `enum AuditChannel { WEB API }`. Manifest: `schemaRelations` `User: auditLogs AuditLog[]`, `Organization: auditLogs AuditLog[]`.
  - `module.ts`: `key: "audit-logs"`, nav `{ href: "/audit-log", labelKey: "nav", icon: "scroll-text", order: 90 }`, `routePrefixes: ["/audit-log"]`, `roles: ["owner", "admin"]`, `auditActions` dla `organization.entered`, `member.invited`, `invitation.canceled`, `invitation.accepted`, `member.role_changed`, `member.removed`.
  - `export function redactSensitive(value: unknown): unknown` — rekurencyjnie, klucze porównywane bez wielkości liter z `password`, `passwordhash`, `secret`, `token`, `accesstoken`, `refreshtoken`, `apikey`, `hashedkey`, `authorization`, `cookie`; wartość → `"[REDACTED]"`.
  - `export async function writeAuditLog(event: AuditEvent): Promise<void>` — `prisma.auditLog.create` z `redactSensitive` na `oldData`/`newData`, `channel` domyślnie `"WEB"`, `serviceMode` domyślnie `false`.
  - `audit-sink.ts`: `export const auditSink: AuditSink = writeAuditLog;`.

**Zachowania:**
- `redactSensitive({ name: "A", password: "x" })` → `{ name: "A", password: "[REDACTED]" }`.
- `redactSensitive({ users: [{ Authorization: "Bearer y", id: 1 }] })` → `{ users: [{ Authorization: "[REDACTED]", id: 1 }] }`.
- `redactSensitive("text")` → `"text"`; `redactSensitive(null)` → `null`; `Date` zostaje datą.
- Własność (`test.prop`): dla dowolnego JSON bez kluczy wrażliwych wynik równy wejściu; dla dowolnego obiektu wynik nie zawiera wartości spod klucza wrażliwego na żadnej głębokości.
- Integracja: `writeAuditLog` dla organizacji A tworzy wiersz z `organizationId` A; odczyt wierszy organizacji B nie zwraca go; `oldData.password` zapisane jako `"[REDACTED]"`; usunięcie użytkownika zostawia wiersz z `userId = null`; usunięcie organizacji usuwa jej wiersze.

**Mutacje do zabicia:** porównanie kluczy z wielkością liter; brak rekursji w tablicach; usunięcie redakcji `newData`; `onDelete: Cascade` na `User`; brak `organizationId` w `create`.

- [ ] **Step 1:** Testy z „Zachowań”; test integracyjny według wzoru `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts` (helpery `src/test/integration/database.ts`).
- [ ] **Step 2:** `npx vitest run src/features/audit-logs` → FAIL; `npm run test:integration -- audit-logs` → FAIL.
- [ ] **Step 3:** Manifest (`files`: `src/features/audit-logs/**`, `src/app/[locale]/(app)/audit-log/**`, `prisma/schema/audit-logs.prisma`; `version: "0.1.0"`), schemat, `module.ts`, i18n (etykiety akcji rdzenia i `nav`), `redact.ts`, `write-audit-log.ts`, `audit-sink.ts`. Potem `npm run wa -- kit sync && npm run wa -- generate`.
- [ ] **Step 4:** `npx prisma validate`; `npm run verify`; `npm run test:integration` → PASS. Test własności plików (`kit/cli/src/kit/__tests__/ownership.test.ts`) przechodzi.
- [ ] **Step 5:** Commit `feat(audit-logs): add audit log model and sink`.

### Task 4: Widok `/audit-log`

**Files:**
- Create: `src/features/audit-logs/contracts/audit-log.schemas.ts`, `src/features/audit-logs/contracts/audit-log.types.ts`, `src/features/audit-logs/services/queries/audit-log-queries.ts`, `src/features/audit-logs/components/audit-log-view.tsx`, `src/app/[locale]/(app)/audit-log/page.tsx`
- Test: `src/features/audit-logs/contracts/__tests__/audit-log.schemas.test.ts`, `src/features/audit-logs/services/queries/__tests__/audit-log-queries.integration.test.ts`, `src/features/audit-logs/components/__tests__/audit-log-view.test.tsx`

**Interfaces:**
- Consumes: model `AuditLog` (Task 3), `requireModuleAccess`, `PaginatedResult<T>` z `src/shared/types/common.ts`.
- Produces:
  ```ts
  export const auditLogFiltersSchema: z.ZodType<AuditLogFilters>;
  export interface AuditLogFilters {
    page: number; pageSize: 10 | 25 | 50 | 100;
    sortBy: "createdAt" | "action" | "entityType"; sortDir: "asc" | "desc";
    userId?: string; action?: string; entityType?: string; entityId?: string;
    from?: Date; to?: Date;
  }
  export interface AuditLogRow {
    id: string; createdAt: Date; action: string; entityType: string; entityId: string | null;
    actor: { id: string; name: string; email: string } | null;
    oldData: unknown; newData: unknown; channel: "WEB" | "API"; serviceMode: boolean;
  }
  export async function listAuditLogsQuery(input: unknown): Promise<PaginatedResult<AuditLogRow>>;
  export async function listAuditLogActorsQuery(): Promise<Array<{ id: string; name: string }>>;
  ```
  Etykieta akcji: `auditActions` ze wszystkich `clientModules`; brak deklaracji → surowy `action`.

**Zachowania:**
- `auditLogFiltersSchema.parse({})` → `{ page: 1, pageSize: 25, sortBy: "createdAt", sortDir: "desc" }`.
- `parse({ page: "-1", pageSize: "1000", from: "abc" })` → `page: 1`, `pageSize: 25`, bez `from` (nieprawidłowe wartości zastępowane domyślnymi, `safeParse` per pole; bez wyjątku).
- `parse({ to: "2026-10-29" })` → `to` = koniec dnia `2026-10-29T23:59:59.999Z` (UTC).
- Query z kontekstem owner organizacji A: tylko wiersze A; filtr `entityType: "delivery", entityId: "123"` zwraca wyłącznie wpisy tej rzeczy; filtr `userId` wyłącznie wpisy tej osoby; `totalItems`/`totalPages` zgodne z liczbą wierszy (np. 30 wierszy, `pageSize: 25` → `totalPages: 2`).
- Kontekst `member` → `requireModuleAccess` woła `notFound()` (test oczekuje błędu `NEXT_NOT_FOUND`), bez zapytania o wiersze.
- `listAuditLogActorsQuery` zwraca tylko użytkowników z wpisami w aktywnej organizacji.
- Komponent: akcja `member.invited` pokazuje etykietę z i18n; akcja `delivery.received` bez deklaracji pokazuje `delivery.received`; wpis `serviceMode: true` ma oznaczenie trybu serwisowego; wpis `channel: "API"` ma oznaczenie API.

**Mutacje do zabicia:** usunięcie filtra `organizationId`; `member` dostaje dostęp; `sortDir` ignorowany; `skip` liczony bez `-1`; filtr `entityId` pominięty.

- [ ] **Step 1:** Testy z „Zachowań”.
- [ ] **Step 2:** Uruchom → FAIL.
- [ ] **Step 3:** Zaimplementuj. Widok przenieś z `_sources/justnails-app/src/features/audit-logs/components/audit-log-view.tsx` (DataTable, filtry, `DateRangePicker` jeśli jest w `src/components/ui`, inaczej dwa pola daty), bez cookie rozmiaru strony i filtra impersonacji. Strona: `requireModuleAccess("audit-logs")`, `searchParams` → `listAuditLogsQuery`.
- [ ] **Step 4:** `npm run verify`; `npm run test:integration` → PASS.
- [ ] **Step 5:** Commit `feat(audit-logs): add audit log view`.

### Task 5: Historia rzeczy `<AuditTrail>`

**Files:**
- Create: `src/features/audit-logs/services/queries/audit-trail-query.ts`, `src/features/audit-logs/components/audit-trail.tsx`
- Test: `src/features/audit-logs/services/queries/__tests__/audit-trail-query.integration.test.ts`, `src/features/audit-logs/components/__tests__/audit-trail.test.tsx`

**Interfaces:**
- Consumes: `AuditLogRow` (Task 4), `getOrgContext`, `canAccessModule`/`moduleByKey` z `src/shared/lib/auth/permissions.ts`.
- Produces:
  ```ts
  export async function getEntityAuditTrailQuery(entityType: string, entityId: string): Promise<AuditLogRow[] | null>;
  export async function AuditTrail(props: { entityType: string; entityId: string }): Promise<React.ReactElement | null>;
  ```
  `null` = brak uprawnień; komponent wtedy nic nie renderuje (nie `notFound()`, bo stoi na cudzej stronie).

**Zachowania:**
- owner/admin organizacji A, encja z 3 wpisami w A i 1 w B o tym samym `entityId` → 3 wiersze, od najnowszego.
- 60 wpisów → 50 najnowszych.
- `member` → `null`; komponent renderuje pusty wynik, strona nie dostaje 404.
- brak wpisów → `[]`; komponent pokazuje tekst „Brak historii” z i18n.

**Mutacje do zabicia:** brak filtra `organizationId`; `member` dostaje wpisy; limit 50 usunięty; kolejność rosnąca.

- [ ] **Step 1–5:** cykl jak w Task 4; commit `feat(audit-logs): add entity audit trail`.

### Task 6: Zdarzenia organizacji z better-auth

**Files:**
- Create: `src/features/audit-logs/auth.ts`, `src/features/audit-logs/services/organization-audit-events.ts`
- Test: `src/features/audit-logs/services/__tests__/organization-audit-events.test.ts`, `src/features/audit-logs/__tests__/auth-plugin.integration.test.ts`

**Interfaces:**
- Consumes: `trackAudit`, `authPlugins` (rejestr istnieje: `src/features/<x>/auth.ts` z eksportem `authPlugin`).
- Produces: `export const authPlugin` (obiekt `BetterAuthPlugin`, `id: "audit-logs"`) i czysta funkcja
  ```ts
  export function organizationAuditEvent(input: {
    path: string; actorUserId: string | null; body: unknown; returned: unknown;
  }): AuditEvent | null;
  ```

**Zachowania** (ścieżki endpointów pluginu `organization`; dokładne nazwy pól ciała i odpowiedzi wykonawca sprawdza w `node_modules/better-auth` i wpisuje do testu jako literały):
- `/organization/invite-member` → `{ action: "member.invited", entityType: "invitation", entityId: <id zaproszenia>, newData: { email, role } }`.
- `/organization/cancel-invitation` → `invitation.canceled`, `entityId` = id zaproszenia.
- `/organization/accept-invitation` → `invitation.accepted`, aktorem jest przyjmujący.
- `/organization/update-member-role` → `member.role_changed`, `oldData: { role: <poprzednia> }`, `newData: { role: <nowa> }`.
- `/organization/remove-member` → `member.removed`, `oldData: { userId, role }`.
- inna ścieżka → `null`; odpowiedź błędu (brak `returned` albo błąd API) → `null`.
- Integracja: zaproszenie wysłane przez `auth.api.createInvitation` w organizacji A tworzy wpis `member.invited` w A, nie w B.

**Mutacje do zabicia:** wpis przy błędzie endpointu; zamiana `oldData`/`newData` przy zmianie roli; zły `organizationId` (z sesji zamiast z ciała/odpowiedzi); brak wpisu dla `remove-member`.

- [ ] **Step 1:** Testy funkcji czystej (literały ciał i odpowiedzi) i test integracyjny pluginu.
- [ ] **Step 2:** Uruchom → FAIL.
- [ ] **Step 3:** Plugin z `hooks.after` (`createAuthMiddleware`), który woła `organizationAuditEvent` i `trackAudit`. Poprzednią rolę przy `update-member-role` odczytaj w `hooks.before` i przekaż przez kontekst. Jeśli przyjęcie zaproszenia w rdzeniu (`joinOrganizationCommand`, `applySignupMembership`) omija endpoint, dopisz tam `trackAudit` z tą samą akcją i opisz to w PR.
- [ ] **Step 4:** `npm run wa -- generate`; `npm run verify`; `npm run test:integration` → PASS.
- [ ] **Step 5:** Commit `feat(audit-logs): log organization membership events`.

### Task 7: Macierz CI, dokumentacja i domknięcie PR A

**Files:**
- Modify: `.github/workflows/kit.yml` (macierz `combo`), `kit/README.md`, `docs/05-moduly-rdzenia.md` albo nowy `docs/12-moduly-kitu.md` (link z `docs/README.md`), `docs/09b-implementacja-i-bramki.md` (sekcja o `trackAudit` i `auditActions` w module projektu)

**Zachowania:**
- Macierz zawiera `{ name: core, modules: "" }` i `{ name: audit-logs, modules: "audit-logs" }`.
- Dokumentacja pokazuje, jak moduł projektu woła `trackAudit({ ...auditActor(context), action: "delivery.received", entityType: "delivery", entityId })`, deklaruje `auditActions` i wstawia `<AuditTrail>` (z uwagą, że wymaga zainstalowanego `audit-logs`).

**Mutacje do zabicia:** nie dotyczy (bez logiki).

- [ ] **Step 1:** Dopisz combo i dokumentację.
- [ ] **Step 2:** Lokalna symulacja: `node .wa/bin/wa.mjs create /tmp/wa-a --yes --kit "$PWD" --modules audit-logs --no-git` (katalog poza repo; przy małej ilości miejsca na dysku `--no-install` i tylko `npx prisma validate` w projekcie), sprawdź obecność `src/features/audit-logs` i brak placeholderów.
- [ ] **Step 3:** `npm run verify`; `npm run verify --prefix kit/cli`; `npm run test:mutation:gate` po `npm run test:mutation` (przeżyłe mutanty w `critical` → wraca do testera albo propozycja wpisu dla Jakuba).
- [ ] **Step 4:** Commit `ci(kit): assemble audit-logs combo` i `docs: describe audit-logs module`; push; PR do `main`; recenzja końcowa Opusem.

---

## PR B: `api-keys`

### Task 8: Sekret klucza, model i env

**Files:**
- Create: `kit/modules/api-keys.json`, `prisma/schema/api-keys.prisma`, `src/features/api-keys/module.ts`, `src/features/api-keys/i18n/{pl,en}.json`, `src/features/api-keys/env.ts`, `src/features/api-keys/services/api-key-secret.ts`
- Test: `src/features/api-keys/services/__tests__/api-key-secret.test.ts`, `src/features/api-keys/__tests__/env.test.ts`
- Modify: `mutation-gate.json` (`critical` += `"src/features/api-keys/services/"`), `kit/modules/core.json` (`version` → `0.3.0`, bo `mutation-gate.json` to plik rdzenia)

**Interfaces:**
- Produces:
  - Model `ApiKey` (`@@map("api_keys")`): `id` uuid, `organizationId String` (Cascade), `createdById String?` (`User`, SetNull), `name String`, `displayPrefix String`, `hashedKey String @unique`, `scopes String[] @default([])`, `lastUsedAt DateTime?`, `expiresAt DateTime?`, `revokedAt DateTime?`, `createdAt`, `updatedAt`; indeks `[organizationId, createdAt]`. `schemaRelations`: `User: createdApiKeys ApiKey[]`, `Organization: apiKeys ApiKey[]`.
  - `module.ts`: `key: "api-keys"`, nav `/api-keys` (`icon: "key-round"`, `order: 85`), `roles: ["owner", "admin"]`, `apiScopes: [{ key: "organization:read", labelKey: "scopes.organizationRead" }]`, `auditActions` dla `api_key.created`, `api_key.revoked`, `api_key.deleted`.
  - `env.ts`: `envSchema` z `API_KEY_PEPPER: z.string().min(32)`, a przy `NODE_ENV === "production"` odrzuca wartość przykładową z manifestu. Manifest `env`: `{ name: "API_KEY_PEPPER", example: "dev-only-api-key-pepper-change-me-0123456789", required: true }`.
  - ```ts
    export function apiKeyPrefix(): string;
    export function generateApiKey(prefix?: string): { plaintext: string; displayPrefix: string };
    export function hashApiKey(plaintext: string, pepper: string): string;
    ```
    `plaintext = prefix + randomBytes(32).toString("base64url")`; `displayPrefix = plaintext.slice(0, prefix.length + 6)`; `hashApiKey` = HMAC-SHA256 hex.

**Zachowania:**
- `apiKeyPrefix()` przy `project.slug = "wa-app"` → `"wa_app_live_"`.
- `generateApiKey("wa_app_live_")` → `plaintext` pasuje do `/^wa_app_live_[A-Za-z0-9_-]{43}$/`, `displayPrefix.length === 18`, dwa wywołania dają różne klucze.
- `hashApiKey("abc", "p".repeat(32))` → stały hex (wartość literalna policzona raz `openssl dgst -sha256 -hmac` i wpisana do testu).
- Własność: `hashApiKey(k, p1) !== hashApiKey(k, p2)` dla `p1 !== p2`; wynik ma 64 znaki hex.
- `envSchema` odrzuca pepper krótszy niż 32 znaki; w produkcji odrzuca wartość przykładową; poza produkcją ją przyjmuje.

**Mutacje do zabicia:** SHA-256 bez HMAC (pepper ignorowany); krótszy sekret (`randomBytes(16)`); `displayPrefix` zawiera cały klucz; brak blokady przykładowego peppera w produkcji.

- [ ] **Step 1–2:** testy, FAIL.
- [ ] **Step 3:** Manifest (`files`: `src/features/api-keys/**`, `src/app/[locale]/(app)/api-keys/**`, `src/app/api/v1/organization/**`, `prisma/schema/api-keys.prisma`; `version: "0.1.0"`), implementacja; `npm run wa -- kit sync && npm run wa -- generate`.
- [ ] **Step 4:** `npx prisma validate`; `npm run verify` → PASS.
- [ ] **Step 5:** Commit `feat(api-keys): add key model and secret handling`.

### Task 9: Komendy i lista kluczy

**Files:**
- Create: `src/features/api-keys/contracts/api-key.schemas.ts`, `src/features/api-keys/contracts/api-key.types.ts`, `src/features/api-keys/services/commands/api-key-commands.ts` (`"use server"`), `src/features/api-keys/services/queries/api-key-queries.ts`, `src/features/api-keys/services/api-scopes.ts`
- Test: `src/features/api-keys/services/commands/__tests__/api-key-commands.test.ts`, `src/features/api-keys/services/__tests__/api-keys-isolation.integration.test.ts`

**Interfaces:**
- Consumes: Task 8; `requireModuleAccess`, `assertServiceModeConfirmed`, `trackAudit`, `auditActor`.
- Produces:
  ```ts
  export function knownApiScopes(): string[];
  export async function createApiKeyCommand(input: unknown, confirmation?: unknown):
    Promise<OperationResult<{ id: string; plaintext: string }>>;
  export async function revokeApiKeyCommand(input: unknown, confirmation?: unknown): Promise<OperationResult>;
  export async function deleteApiKeyCommand(input: unknown, confirmation?: unknown): Promise<OperationResult>;
  export async function listApiKeysQuery(): Promise<ApiKeyRow[]>;
  export interface ApiKeyRow {
    id: string; name: string; displayPrefix: string; scopes: string[];
    lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date;
    createdBy: { id: string; name: string } | null;
  }
  ```
  Wejście `create`: `{ name: string (1–100, trim), scopes: string[] (min 1, każdy z knownApiScopes()), expiresInDays: 30 | 90 | 365 | null }`. `revoke`/`delete`: `{ id: string (uuid) }`.

**Zachowania:**
- owner tworzy klucz → `success: true`, `plaintext` zaczyna się od `apiKeyPrefix()`, w bazie `hashedKey === hashApiKey(plaintext, pepper)` i brak `plaintext`; jeden `trackAudit` z `action: "api_key.created"`, `newData: { name, scopes, displayPrefix }` (bez klucza i hasha).
- 10 aktywnych kluczy (nieunieważnionych i niewygasłych) → 11. `create` zwraca `{ success: false, error: "Osiągnięto limit 10 aktywnych kluczy" }`; unieważnione i wygasłe nie liczą się do limitu.
- `scopes: ["nieznany:scope"]` → błąd walidacji; `scopes: []` → błąd walidacji.
- `expiresInDays: 30` → `expiresAt` = teraz + 30 dni (zegar zamrożony w teście).
- `member` → `notFound()` z `requireModuleAccess`, brak zapisu.
- tryb serwisowy bez potwierdzenia → `{ success: false, error: "Potwierdź zmianę w trybie serwisowym" }`, brak zapisu; z potwierdzeniem aktywnej organizacji → zapis i `serviceMode: true` w audycie.
- `revoke` klucza organizacji B z kontekstu A → `{ success: false }`, klucz B nietknięty (integracja); `revoke` ustawia `revokedAt` tylko gdy było `null`.
- `listApiKeysQuery` nie zwraca `hashedKey` (sprawdzenie kluczy obiektu).

**Mutacje do zabicia:** brak filtra `organizationId` w `revoke`/`delete`; limit `>` zamiast `>=`; unieważnione liczone do limitu; zapis przed `assertServiceModeConfirmed`; `plaintext` w audycie.

- [ ] **Step 1–5:** cykl; commit `feat(api-keys): manage organization api keys`.

### Task 10: `authenticateApiKey` i przykładowa trasa

**Files:**
- Create: `src/features/api-keys/services/authenticate-api-key.ts`, `src/app/api/v1/organization/route.ts`, `src/features/api-keys/services/organization-api.ts`
- Test: `src/features/api-keys/services/__tests__/authenticate-api-key.test.ts`, `src/features/api-keys/__tests__/organization-route.integration.test.ts`

**Interfaces:**
- Consumes: Task 8, `knownApiScopes()` (Task 9).
- Produces:
  ```ts
  export interface ApiKeyContext { organizationId: string; apiKeyId: string; scopes: string[] }
  export type ApiKeyAuthResult =
    | { ok: true; context: ApiKeyContext }
    | { ok: false; status: 401 | 403; error: "missing" | "invalid" | "revoked" | "expired" | "scope" };
  export async function authenticateApiKey(request: Request, requiredScope: string): Promise<ApiKeyAuthResult>;
  export async function readOrganizationForApiKey(context: ApiKeyContext): Promise<{ id: string; name: string; slug: string }>;
  ```
  `GET /api/v1/organization`: scope `organization:read`; 200 `{ id, name, slug }`; błąd → `{ error }` ze statusem z wyniku. Trasa tylko składa wywołania (logika w `services/`).

**Zachowania:**
- brak nagłówka → 401 `missing`; `Authorization: Basic …` → 401 `missing`; `Authorization: Bearer ` (pusto) → 401 `missing`.
- nieznany klucz, klucz z inną wielkością liter, klucz z dopisaną spacją → 401 `invalid`.
- `revokedAt` ustawione → 401 `revoked`; `expiresAt` w przeszłości → 401 `expired`; `expiresAt` w przyszłości → OK.
- klucz bez `organization:read` → 403 `scope`; scope z bazy nieobecny w `knownApiScopes()` jest pomijany w `context.scopes`.
- poprawny klucz → `lastUsedAt` zaktualizowane (bez czekania na zapis w odpowiedzi; błąd aktualizacji tylko logowany).
- integracja: klucz organizacji A na `GET /api/v1/organization` → 200 z `id` A, nigdy danych B.
- lookup po `hashedKey` (`findUnique`), bez porównania stringów klucza w JS.

**Mutacje do zabicia:** pominięcie sprawdzenia `revokedAt`; `expiresAt` porównane odwrotnie; brak sprawdzenia scope'u; `organizationId` z nagłówka/zapytania zamiast z rekordu; 401 zamiast 403 przy braku scope'u.

- [ ] **Step 1–5:** cykl; commit `feat(api-keys): authenticate api routes with keys`.

### Task 11: UI `/api-keys`

**Files:**
- Create: `src/features/api-keys/components/api-keys-manager.tsx`, `src/features/api-keys/components/api-key-columns.tsx`, `src/app/[locale]/(app)/api-keys/page.tsx`
- Test: `src/features/api-keys/components/__tests__/api-keys-manager.test.tsx`

**Interfaces:**
- Consumes: komendy i query z Task 9; `useServiceModeAction`; `clientModules` (`apiScopes` z etykietami w namespace modułu).

**Zachowania:**
- tworzenie: formularz (nazwa, scope'y jako checkboxy, wygaśnięcie 30/90/365/bez) → `run(createApiKeyCommand, input)`; po sukcesie dialog z pełnym kluczem i przyciskiem kopiowania; po zamknięciu dialogu klucza nie da się odczytać ponownie.
- `run` zwraca `null` (anulowany tryb serwisowy) → brak toasta błędu, formularz zostaje.
- błąd komendy → toast z `error`.
- lista: nazwa, `displayPrefix…`, scope'y (etykiety), ostatnie użycie, status (aktywny/unieważniony/wygasły), autor; akcje unieważnij/usuń przez `run`.

**Mutacje do zabicia:** wywołanie komendy bez `run`; klucz pokazany w liście; brak obsługi `null`.

- [ ] **Step 1–5:** cykl (UI przenieś z `_sources/justnails-app/src/features/api-keys/components/`); commit `feat(api-keys): add api keys page`.

### Task 12: Macierz CI, dokumentacja i domknięcie PR B

**Files:** `.github/workflows/kit.yml` (combo `api-keys`), `kit/README.md`, dokument modułów z Task 7, `docs/09b-implementacja-i-bramki.md` (deklaracja `apiScopes` i użycie `authenticateApiKey` w trasie projektu, zapis audytu z `channel: "API"`, `credentialId: context.apiKeyId`, `actorUserId: null`), opis rotacji peppera.

**Zachowania:** macierz `core`, `audit-logs`, `api-keys`; dokumentacja z przykładem trasy projektu ze scope'em `deliveries:write`.

**Mutacje do zabicia:** nie dotyczy.

- [ ] **Step 1–4:** jak Task 7 (symulacja `--modules api-keys`); commit `ci(kit): assemble api-keys combo`, `docs: describe api-keys module`; PR B, recenzja końcowa Opusem.

---

## PR C: `uploads`

### Task 13: Region kroków CI w generatorze

**Files:**
- Modify: `kit/cli/src/manifest/schema.ts` (pole `ciSteps`), `kit/cli/src/generate/targets.ts` (`regionTargets`), `.github/workflows/ci.yml` (markery), `kit/modules/core.json` (`version` → `0.4.0`)
- Test: `kit/cli/src/generate/__tests__/targets.test.ts` (albo plik testujący `regionTargets`), `kit/cli/src/manifest/__tests__/schema.test.ts`
- Modify: `.wa/bin/wa.mjs`

**Interfaces:**
- Produces: `moduleManifestSchema.ciSteps: string | null` (domyślnie `null`; ścieżka pliku w projekcie, jak `compose`). Region `ci-integration` w `.github/workflows/ci.yml`, w jobie `integration`, między krokiem `Install dependencies` a `Integration tests`:
  ```yaml
        # wa:ci-integration:start
        # wa:ci-integration:end
  ```
  Treść fragmentu wcięta tak, żeby kroki były na poziomie `steps` (6 spacji).

**Zachowania:**
- manifest bez `ciSteps` → `null`; region pusty, `ci.yml` bez zmian po `generate`.
- moduł z `ciSteps: "ci/uploads.integration-steps.yml"` (dwa kroki) → region zawiera oba kroki z wcięciem 6 spacji; `actionlint` przechodzi na wyniku.
- dwa moduły → fragmenty w kolejności modułów, oddzielone pustą linią.
- hash pliku `ci.yml` w `.wa/kit.json` nie zmienia się po `generate` (regiony są wyłączone z hasha).

**Mutacje do zabicia:** złe wcięcie (4 spacje); `ciSteps` czytane z katalogu kitu zamiast projektu; region pominięty w `REGION_FILES`.

- [ ] **Step 1–2:** testy, FAIL.
- [ ] **Step 3:** Implementacja, markery w `ci.yml`, `npm run build --prefix kit/cli`, `npm run wa -- generate`.
- [ ] **Step 4:** `npm run verify --prefix kit/cli`; `npm run verify` → PASS.
- [ ] **Step 5:** Commit `feat(cli): add ci integration steps region`.

### Task 14: Storage S3, env, MinIO

**Files:**
- Create: `kit/modules/uploads.json`, `src/features/uploads/module.ts` (szkielet: `key: "uploads"`, `nav: []`, `routePrefixes: []`), `src/features/uploads/i18n/{pl,en}.json`, `src/features/uploads/env.ts`, `src/features/uploads/services/storage.ts`, `docker/uploads.compose.yml`, `ci/uploads.integration-steps.yml`
- Test: `src/features/uploads/services/__tests__/storage.integration.test.ts`, `src/features/uploads/__tests__/env.test.ts`
- Modify: `mutation-gate.json` (`critical` += `"src/features/uploads/services/"`), `src/test/integration/` tylko jeśli potrzebny wspólny helper adresu MinIO (wtedy plik rdzenia, `core` już podbity w Task 13)

**Interfaces:**
- Produces:
  - `envSchema`: `S3_ENDPOINT` (url), `S3_REGION` (domyślnie `"auto"`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` (`"true"`/`"false"` → boolean, domyślnie `false`). Manifest `env` z przykładami MinIO: `http://localhost:9000`, `minioadmin`, `minioadmin`, `wa-app-uploads`, `true`.
  - ```ts
    export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
    export async function getObject(key: string): Promise<{ body: Uint8Array; contentType: string | undefined } | null>;
    export async function deleteObject(key: string): Promise<void>;
    ```
    Klient `S3Client` z `requestChecksumCalculation: "WHEN_REQUIRED"`, `responseChecksumValidation: "WHEN_REQUIRED"`, `forcePathStyle` z env (wzór: `_sources/company-dashboard-app/src/shared/lib/s3.ts`). `getObject` dla nieistniejącego klucza → `null`.
  - `docker/uploads.compose.yml`: serwis `minio` (`minio/minio`, `server /data --console-address ":9001"`, porty `9000:9000`, `9001:9001`, wolumen `./volumes/minio:/data`, healthcheck) i `minio-init` (`minio/mc`, `depends_on: minio: condition: service_healthy`, tworzy bucket `wa-app-uploads`, idempotentnie). Manifest: `compose: "docker/uploads.compose.yml"`, `ciSteps: "ci/uploads.integration-steps.yml"`, `files`: `src/features/uploads/**`, `src/app/api/uploads/**`, `prisma/schema/uploads.prisma`, `docker/uploads.compose.yml`, `ci/uploads.integration-steps.yml`; `version: "0.1.0"`.
  - `ci/uploads.integration-steps.yml`: krok `Start MinIO` (`docker run -d -p 9000:9000 … minio/minio server /data`, czekanie na `/minio/health/live`) i krok tworzenia bucketu (`docker run --network host minio/mc …`).
  - Test integracyjny czyta `INTEGRATION_S3_ENDPOINT` (domyślnie `http://localhost:9000`) i resztę z wartości przykładowych.

**Zachowania:**
- `putObject("orgs/o1/test/a.txt", bytes("hello"), "text/plain")`, potem `getObject` → te same bajty i `contentType: "text/plain"`.
- `getObject("brak")` → `null`.
- `deleteObject` istniejącego → kolejny `getObject` → `null`; `deleteObject` nieistniejącego nie rzuca.
- `envSchema` odrzuca brak `S3_BUCKET`; `S3_FORCE_PATH_STYLE: "true"` → `true`, brak → `false`.
- `npm run wa -- generate` wstawia MinIO do `docker-compose.yml` i kroki do `ci.yml`; `docker compose config` przechodzi.

**Mutacje do zabicia:** brak `forcePathStyle`; `getObject` rzuca zamiast `null` dla `NoSuchKey`; checksum flags usunięte (zabija test na MinIO tylko pośrednio — wtedy wpis „równoważny/konfiguracja” proponowany Jakubowi).

- [ ] **Step 1–2:** testy, FAIL (MinIO: `docker compose up -d minio minio-init`).
- [ ] **Step 3:** `npx -y npm@11.21.1 install @aws-sdk/client-s3`; wersja do manifestu `uploads`; implementacja; `kit sync`, `generate`.
- [ ] **Step 4:** `npm run verify`; `npm run test:integration` → PASS.
- [ ] **Step 5:** Commit `feat(uploads): add s3 storage and minio`.

### Task 15: Cele uploadu i walidacja pliku

**Files:**
- Create: `src/features/uploads/services/upload-purposes.ts`, `src/features/uploads/services/validate-upload.ts`, `src/features/uploads/services/prepare-upload-body.ts`
- Modify: `src/features/uploads/module.ts` (`uploadPurposes` z `editor-image`)
- Test: `src/features/uploads/services/__tests__/upload-purposes.test.ts`, `src/features/uploads/services/__tests__/validate-upload.test.ts`, `src/features/uploads/services/__tests__/prepare-upload-body.test.ts`

**Interfaces:**
- Consumes: `ModuleUploadPurpose` (Task 2), `modules` z `@/modules.generated`.
- Produces:
  ```ts
  export const FORBIDDEN_MIME_TYPES: readonly string[];
  export function listUploadPurposes(): ModuleUploadPurpose[];
  export function resolveUploadPurpose(key: string): ModuleUploadPurpose | null;
  export function maxUploadBytes(): number;
  export function objectKey(input: { organizationId: string; purpose: string; id: string; extension: string }): string;
  export type UploadValidation =
    | { ok: true; mimeType: string; extension: string }
    | { ok: false; status: 400 | 413 | 415; error: "empty" | "too_large" | "unsupported_type" };
  export async function validateUpload(bytes: Uint8Array, purpose: ModuleUploadPurpose): Promise<UploadValidation>;
  export async function prepareUploadBody(bytes: Uint8Array, purpose: ModuleUploadPurpose, mimeType: string):
    Promise<{ bytes: Uint8Array; mimeType: string; extension: string }>;
  ```
  `editor-image`: `mimeTypes: ["image/jpeg", "image/png", "image/webp"]`, `maxBytes: 5 * 1024 * 1024`, `visibility: "public"`, `resizeImage: { maxWidth: 1200 }`. Zmniejszanie: `sharp(...).resize({ width: maxWidth, withoutEnlargement: true }).jpeg({ quality: 82 })`, wynik `image/jpeg`, `jpg`. Typ wykrywany przez `file-type` (`fileTypeFromBuffer`).

**Zachowania:**
- `FORBIDDEN_MIME_TYPES` zawiera `image/svg+xml`, `text/html`, `application/xhtml+xml`; `listUploadPurposes()` rzuca `Error` z nazwą celu, jeśli którykolwiek moduł deklaruje taki typ albo dwa moduły deklarują ten sam `key`.
- `resolveUploadPurpose("editor-image")` → definicja; `resolveUploadPurpose("x")` → `null`.
- `maxUploadBytes()` = największe `maxBytes` spośród celów (przy samym `editor-image`: `5242880`).
- `objectKey({ organizationId: "o1", purpose: "editor-image", id: "u1", extension: "jpg" })` → `"orgs/o1/editor-image/u1.jpg"`.
- bajty PNG (8-bajtowa sygnatura + IHDR z fixtury) z nazwą `x.pdf` i deklarowanym `image/gif` → `{ ok: true, mimeType: "image/png", extension: "png" }` (nazwa i typ klienta ignorowane).
- tekst `<svg …>` → `415 unsupported_type`; PDF dla `editor-image` → `415`; pusty → `400 empty`; `maxBytes + 1` → `413 too_large`; dokładnie `maxBytes` → OK.
- `prepareUploadBody` obrazu 3000 px dla `editor-image` → szerokość 1200, `mimeType: "image/jpeg"`, `extension: "jpg"`; obraz 800 px → szerokość 800; cel bez `resizeImage` → bajty bez zmian.
- Własność: `objectKey` zawsze zaczyna się od `orgs/${organizationId}/` i nie zawiera `..` dla `id` będącego uuid.

**Mutacje do zabicia:** typ z `file.type`/nazwy; `>` zamiast `>=` przy limicie; brak odrzucenia SVG; `withoutEnlargement` usunięte; `maxUploadBytes` z pierwszego celu zamiast maksimum.

- [ ] **Step 1–2:** testy (fixtury obrazów generuj w teście przez `sharp` z `create`), FAIL.
- [ ] **Step 3:** `npx -y npm@11.21.1 install sharp file-type`; wersje do manifestu `uploads`; implementacja. Sprawdź `npm run build` (sharp w `output: "standalone"` i obrazie `node:22-alpine`).
- [ ] **Step 4:** `npm run verify` → PASS.
- [ ] **Step 5:** Commit `feat(uploads): validate uploads by purpose`.

### Task 16: `POST /api/uploads` z trybem serwisowym

**Files:**
- Create: `prisma/schema/uploads.prisma`, `src/features/uploads/contracts/upload.types.ts`, `src/features/uploads/services/commands/create-upload.ts`, `src/features/uploads/services/api-org-context.ts`, `src/app/api/uploads/route.ts`
- Test: `src/features/uploads/services/commands/__tests__/create-upload.test.ts`, `src/features/uploads/services/__tests__/uploads-isolation.integration.test.ts`

**Interfaces:**
- Consumes: Task 14, Task 15, `getOrgContext`, `assertServiceModeConfirmed`, `trackAudit`.
- Produces:
  - Model `Upload` (`@@map("uploads")`): `id` uuid, `organizationId String` (Cascade), `uploadedById String?` (`User`, SetNull), `purpose String`, `key String @unique`, `fileName String`, `mimeType String`, `size Int`, `visibility UploadVisibility`, `createdAt`; indeks `[organizationId, createdAt]`; `enum UploadVisibility { PUBLIC ORGANIZATION }`. `schemaRelations`: `User: uploads Upload[]`, `Organization: uploads Upload[]`.
  - ```ts
    export interface UploadResponse { id: string; url: string; fileName: string; mimeType: string; size: number }
    export type ApiOrgContextResult = { ok: true; context: OrgContext } | { ok: false; status: 401 | 403 };
    export async function readOrgContextForApi(): Promise<ApiOrgContextResult>;
    export async function createUpload(formData: FormData):
      Promise<{ status: 201; body: UploadResponse } | { status: 400 | 401 | 403 | 413 | 415 | 500; body: { error: string } }>;
    ```
  - Trasa: `export const runtime = "nodejs"`; `Content-Length` > `maxUploadBytes() + 64 KiB` → 413 przed `formData()`; dalej `createUpload`, odpowiedź `NextResponse.json(body, { status })`.
  - Potwierdzenie trybu serwisowego: pole formularza `serviceModeConfirmation` (JSON `{"serviceModeConfirmed":true,"organizationId":"…"}`); brak pola = `undefined`.

**Zachowania:**
- brak sesji → 401 (bez przekierowania); brak organizacji (`NoOrganizationError`) → 403.
- brak `file` → 400; nieznany `purpose` → 400; walidacja z Task 15 → jej status.
- członek organizacji A wgrywa PNG jako `editor-image` → 201, `url: "/api/uploads/<id>"`, rekord z `organizationId` A, `uploadedById`, `visibility: PUBLIC`, `key` = `orgs/<A>/editor-image/<id>.jpg`, obiekt w storage; `trackAudit` z `action: "upload.created"`.
- `member` też może wgrać (201).
- superadmin w trybie serwisowym bez pola → 403 `{ error: "Potwierdź zmianę w trybie serwisowym" }`, brak obiektu i rekordu; z potwierdzeniem organizacji A → 201; z potwierdzeniem innej organizacji → 403.
- błąd zapisu rekordu → obiekt usunięty ze storage (`deleteObject` wywołane z tym samym kluczem), 500.
- integracja: upload z kontekstem A nie tworzy rekordu widocznego w B.

**Mutacje do zabicia:** `assertServiceModeConfirmed` po `putObject`; brak rollbacku; `organizationId` z formularza; `visibility` nie z celu; brak 401 dla braku sesji (przekierowanie).

- [ ] **Step 1–5:** cykl; `npx prisma validate`; commit `feat(uploads): accept uploads with service mode confirmation`.

### Task 17: Pobieranie i usuwanie

**Files:**
- Create: `src/features/uploads/services/queries/read-upload.ts`, `src/features/uploads/services/content-disposition.ts`, `src/features/uploads/services/commands/upload-commands.ts` (`"use server"`), `src/app/api/uploads/[id]/route.ts`
- Modify: `src/__tests__/server-entrypoints-guard.test.ts` (`UNGUARDED_ALLOWED` += `src/features/uploads/services/queries/read-upload.ts#readUploadForDownload` z uzasadnieniem „pliki publiczne są dostępne bez sesji; pliki organizacji sprawdzane getOrgContext po odczycie widoczności”; zmiana w Step 1 przez `test-writer`)
- Test: `src/features/uploads/services/__tests__/content-disposition.test.ts`, `src/features/uploads/services/queries/__tests__/read-upload.integration.test.ts`, `src/features/uploads/services/commands/__tests__/upload-commands.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function contentDisposition(fileName: string, disposition: "inline" | "attachment"): string;
  export async function readUploadForDownload(id: string):
    Promise<{ status: 200; body: Uint8Array; headers: Record<string, string> } | { status: 404 }>;
  export async function deleteUploadCommand(input: unknown, confirmation?: unknown): Promise<OperationResult>;
  ```
  Nagłówki 200: `Content-Type` z rekordu, `Content-Disposition` z `contentDisposition(fileName, "inline")`, `X-Content-Type-Options: nosniff`, `Cache-Control`: `public, max-age=31536000, immutable` (PUBLIC) albo `private, max-age=300` (ORGANIZATION).

**Zachowania:**
- `contentDisposition("raport.pdf", "inline")` → `inline; filename="raport.pdf"; filename*=UTF-8''raport.pdf`.
- `contentDisposition("zażółć \"x\".pdf", "inline")` → `filename` tylko ASCII bez `"` (np. `za___ _x_.pdf`; dokładny literał ustala test), `filename*=UTF-8''za%C5%BC%C3%B3%C5%82%C4%87%20%22x%22.pdf`.
- nazwa z `\r\n` → wynik bez `\r` i `\n`.
- `id` nie-uuid → 404 bez zapytania; nieistniejący → 404.
- plik PUBLIC bez sesji → 200; plik ORGANIZATION bez sesji → 404; z aktywną organizacją pliku → 200; z aktywną inną organizacją (członek obu) → 404; obiekt zniknął ze storage → 404.
- `deleteUploadCommand({ id })`: autor (`member`) usuwa swój → OK; `member` usuwa cudzy → `{ success: false, error: "Brak uprawnień do usunięcia pliku" }`, nic nie usunięte; owner/admin usuwa cudzy → OK; plik organizacji B z kontekstu A → `{ success: false }`; tryb serwisowy bez potwierdzenia → błąd potwierdzenia; po sukcesie `deleteObject` wywołane, rekord usunięty, `trackAudit` `upload.deleted`; błąd `deleteObject` → rekord i tak usunięty, błąd zalogowany.

**Mutacje do zabicia:** PUBLIC/ORGANIZATION zamienione; brak porównania `organizationId` z aktywną organizacją; `member` usuwa cudzy plik; `nosniff` usunięty; nagłówek z surową nazwą pliku.

- [ ] **Step 1–5:** cykl; commit `feat(uploads): serve and delete uploads`.

### Task 18: `<FileUpload>` i potwierdzenie dla `fetch`

**Files:**
- Modify: `src/shared/components/service-mode/use-service-mode-action.tsx`
- Create: `src/features/uploads/components/file-upload.tsx`
- Test: `src/shared/components/service-mode/__tests__/use-service-mode-action.test.tsx` (istniejący), `src/features/uploads/components/__tests__/file-upload.test.tsx`

**Interfaces:**
- Produces: w `ServiceModeActionRunner` nowa metoda
  ```ts
  requestConfirmation(): Promise<ServiceModeConfirmation | undefined | null>;
  ```
  `undefined` poza trybem serwisowym (bez dialogu), `null` po „Anuluj”, potwierdzenie aktywnej organizacji po „Potwierdź”. `run` działa jak dotąd.
  ```ts
  export function FileUpload(props: { purpose: string; accept?: string; onUploaded: (upload: UploadResponse) => void }): React.ReactElement;
  ```

**Zachowania:**
- poza trybem: `requestConfirmation()` → `undefined`, dialog się nie otwiera.
- w trybie: otwiera dialog; „Anuluj” → `null`; „Potwierdź” → `{ serviceModeConfirmed: true, organizationId: <aktywna> }`.
- `FileUpload`: wybór pliku → `POST /api/uploads` z `file`, `purpose` i (w trybie) `serviceModeConfirmation` jako JSON; 201 → `onUploaded` z odpowiedzią i podgląd obrazu; `requestConfirmation()` = `null` → brak żądania; odpowiedź 413/415 → komunikat z i18n (`too_large`, `unsupported_type`).

**Mutacje do zabicia:** `requestConfirmation` zwraca potwierdzenie bez dialogu w trybie; pole potwierdzenia pominięte w `FormData`; `onUploaded` wołane przy błędzie.

- [ ] **Step 1–5:** cykl; commit `feat(uploads): add file upload component`.

### Task 19: Macierz CI, dokumentacja i domknięcie PR C

**Files:** `.github/workflows/kit.yml`, `kit/README.md`, dokument modułów, `docs/09b-implementacja-i-bramki.md` (cel uploadu w module projektu, `<FileUpload>`, zapis `id` w encji), `docs/01-uruchomienie.md` (MinIO lokalnie, `docker compose up -d`).

**Zachowania:**
- Macierz: `core`, `audit-logs`, `api-keys`, `uploads`, `all` (`modules: "audit-logs,api-keys,uploads"`).
- `assemble` przed `Integration tests` uruchamia MinIO i bucket, gdy `contains(matrix.combo.modules, 'uploads')` (te same polecenia co `ci/uploads.integration-steps.yml`), i ustawia `INTEGRATION_S3_ENDPOINT`.
- `Docker image builds` także dla `all` (`if: matrix.combo.name == 'core' || matrix.combo.name == 'all'`).
- Projekt `core` po `generate` ma pusty region `ci-integration` i nie startuje MinIO.

**Mutacje do zabicia:** nie dotyczy.

- [ ] **Step 1:** Zmiany w `kit.yml` i dokumentacji.
- [ ] **Step 2:** Symulacja `--modules uploads` i `--modules audit-logs,api-keys,uploads` (jak Task 7); w projekcie `all` `npx prisma validate` i `docker compose config`.
- [ ] **Step 3:** `npm run verify`; `npm run verify --prefix kit/cli`; `npm run test:integration`; `npm run test:mutation` i `npm run test:mutation:gate`; `actionlint` na `ci.yml` i `kit.yml`.
- [ ] **Step 4:** Commit `ci(kit): assemble uploads and all combos`, `docs: describe uploads module`; PR C; recenzja końcowa Opusem. W opisie PR: proponowane wpisy `allowed` (jeśli są) do decyzji Jakuba i propozycja podbicia `kit/kit.json` przed tagiem.
