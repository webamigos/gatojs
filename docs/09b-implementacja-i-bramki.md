# Nowa funkcja w projekcie klienta: implementacja i bramki

Po przeczytaniu będziesz wiedzieć:

- jak napisać query, komendę, komponent i stronę feature tak, żeby testy z części pierwszej przeszły;
- dlaczego `npm run verify` po dodaniu feature nie wymaga zmiany testów rdzenia i co pilnuje spójności rejestru;
- jak uruchomić testy integracyjne i Strykera dla nowego feature i jak czytać ich wynik;
- jak wystawić trasę API uwierzytelnianą kluczem i gdzie umieścić wołany przez nią serwis ([trasy API](#trasy-api));
- jak zadeklarować cel uploadu w module projektu, wstawić `<FileUpload>` i zapisać `id` pliku w encji ([pliki](#pliki-w-funkcji-projektu));
- co zacommitować i jak dodać kolejną funkcję do feature, który już jest w rejestrze.

Zweryfikowano z kodem: a4d5af3, 2026-10-29

Źródła:

- `src/shared/lib/auth/require-module-access.ts`
- `src/shared/lib/auth/service-mode.ts`
- `src/shared/lib/auth/org-context.ts`
- `src/shared/utils/error-handling.ts`
- `src/shared/components/service-mode/use-service-mode-action.tsx`
- `src/features/users/services/commands/invite-user-command.ts`
- `src/features/users/services/queries/user-account-queries.ts`
- `src/features/users/components/invite-user-dialog.tsx`
- `src/features/users/components/users-manager.tsx`
- `src/features/users/components/user-account-columns.tsx`
- `src/features/organizations/services/queries/organization-queries.ts`
- `src/shared/lib/audit.ts`
- `src/features/audit-logs/components/audit-trail.tsx`
- `src/features/audit-logs/services/audit-action-labels.ts`
- `src/features/api-keys/services/authenticate-api-key.ts`
- `src/features/api-keys/services/api-scopes.ts`
- `src/app/api/v1/organization/route.ts`
- `src/app/[locale]/(app)/dashboard/page.tsx`
- `src/__tests__/server-entrypoints-guard.test.ts`
- `src/shared/lib/modules/__tests__/registry-consistency.test.ts`
- `src/test/core-modules.ts`
- `src/test/integration/database.ts`
- `stryker.config.json`
- `mutation-gate.json`
- `.github/workflows/ci.yml`
- `node_modules/next/dist/server/lib/generate-agent-files.js` (Next.js 16.3.8)
- `node_modules/next/dist/server/lib/app-info-log.js` (Next.js 16.3.8, `ensureAgentRulesForDev`)

To druga część tutorialu z [09-nowy-modul.md](09-nowy-modul.md). Zaczyna się w stanie po kroku 6: feature `notes` jest w rejestrze, tabela `notes` ma migrację, kontrakty są gotowe, a testy komendy i izolacji są czerwone z powodu `TypeError: … is not a function`. Kod pochodzi z tego samego przebiegu z 2026-10-28 na kopii kitu z commita `4a6ffcb`. Pojęcia wyjaśnia początek części pierwszej.

<a id="krok-7"></a>

## Krok 7. Query, komenda, komponent i strona

<a id="query"></a>

### Query

Wzorzec: `getOrganizationMembersQuery` (filtr z kontekstu) i `src/features/users/services/queries/user-account-queries.ts` (`server-only`). Reguły: [Query](06-wzorce-kodu.md#query).

`src/features/notes/services/queries/list-notes-query.ts`

```ts
import "server-only";

import { prisma } from "@/shared/lib/prisma";
import { getOrgContext } from "@/shared/lib/auth/org-context";
import type { NoteListItem } from "../../contracts/note.types";

export async function listNotesQuery(): Promise<NoteListItem[]> {
  const { organizationId } = await getOrgContext();

  return prisma.note.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true },
  });
}
```

Query ma własny guard, chociaż strona wywołuje wcześniej `requireModuleAccess`: może je zaimportować inna strona, a test architektury wymaga guardu w każdym eksporcie z `services/queries/` ([Wiele wywołań w jednym żądaniu](03-dane-i-organizacje.md#wiele-wywolan)). Plik nie ma `"use server"`, więc nie jest endpointem i w trybie serwisowym odczyt nie wymaga potwierdzenia.

<a id="komenda"></a>

### Komenda

Pełna komenda według [kolejności z 06-wzorce-kodu.md](06-wzorce-kodu.md#kolejnosc). Wzorzec: `src/features/users/services/commands/invite-user-command.ts`, z trzema różnicami opisanymi w 06: walidacja przed guardem, `requireModuleAccess` zamiast osobnego guardu roli i rola z kontekstu zamiast z cookie cache (tu bez własnej reguły ról; `requireModuleAccess` i tak ocenia role z kontekstu).

`src/features/notes/services/commands/create-note-command.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/shared/lib/prisma";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { assertServiceModeConfirmed } from "@/shared/lib/auth/service-mode";
import { handleCommandError } from "@/shared/utils/error-handling";
import { createNoteSchema } from "../../contracts/note.schemas";
import type { OperationResult } from "@/shared/types/common";

export async function createNoteCommand(
  input: unknown,
  confirmation?: unknown,
): Promise<OperationResult<{ noteId: string }>> {
  try {
    const parsed = createNoteSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane",
      };
    }

    const context = await requireModuleAccess("notes");
    assertServiceModeConfirmed(context, confirmation);

    const note = await prisma.note.create({
      data: {
        organizationId: context.organizationId,
        title: parsed.data.title,
      },
      select: { id: true },
    });

    revalidatePath("/notes");
    return { success: true, data: { noteId: note.id } };
  } catch (error) {
    return handleCommandError(error, "Nie udało się dodać notatki");
  }
}
```

| Krok z 06 | W komendzie | Uwagi |
| --- | --- | --- |
| 1–3 | `"use server"`, sygnatura `(input: unknown, confirmation?: unknown)`, ciało w `try` z `handleCommandError` | Plik eksportuje tylko komendę, bo każdy eksport jest endpointem `POST`. |
| 4 | `createNoteSchema.safeParse(input)` | Błędne wejście kończy się przed zapytaniami do bazy, które wykonuje guard. |
| 5 | `requireModuleAccess("notes")` | Ten sam klucz co w `module.ts` i na stronie. Komenda dostaje tę samą decyzję o dostępie co strona ([D11](decyzje.md#d11)). |
| 6 | `assertServiceModeConfirmed(context, confirmation)` | Zaraz za kontekstem, przed Prismą, z parametrem przekazanym bez zmian ([Kontrakt potwierdzenia](04b-superadmin-i-tryb-serwisowy.md#kontrakt-potwierdzenia)). |
| 7 | brak | Każda rola w organizacji może dodać notatkę, więc węższa reguła nie jest potrzebna. |
| 8 | `organizationId: context.organizationId` w `data` | Nigdy z `input` ([Filtr `organizationId`](03-dane-i-organizacje.md#filtr-organizationid)). |
| 9 | `revalidatePath("/notes")` i wynik `{ success: true, data }` | |

`requireModuleAccess` jest wewnątrz `try`, bez `unstable_rethrow`. Odmowa dostępu kończy się więc komunikatem „Nie udało się dodać notatki” i wpisem `error` w logu, a nie stroną 404. Powód tej decyzji opisuje [Wynik i błędy](06-wzorce-kodu.md#wynik-i-bledy).

<a id="komponent"></a>

### Komponent

Wzorzec: `src/features/users/components/invite-user-dialog.tsx` (formularz i `run`) i `users-manager.tsx` (karta, lista, wybór `dateLocale`) oraz `user-account-columns.tsx` (formatowanie daty). Komponent woła komendę przez `run` z `useServiceModeAction()` i renderuje dialog, który zwraca hook ([Wywołanie z interfejsu](06-wzorce-kodu.md#interfejs)):

`src/features/notes/components/notes-manager.tsx`

```tsx
"use client";

import { format } from "date-fns";
import { pl, enUS } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormLabel, FormError } from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useServiceModeAction } from "@/shared/components/service-mode/use-service-mode-action";
import { createNoteCommand } from "../services/commands/create-note-command";
import {
  createNoteSchema,
  type CreateNoteValues,
} from "../contracts/note.schemas";
import type { NoteListItem } from "../contracts/note.types";

const DATE_FNS_LOCALES: Record<string, DateFnsLocale> = { pl, en: enUS };

type CreateNoteFormValues = z.input<typeof createNoteSchema>;

interface NotesManagerProps {
  notes: NoteListItem[];
}

export function NotesManager({ notes }: NotesManagerProps) {
  const router = useRouter();
  const t = useTranslations("notes");
  const dateLocale = DATE_FNS_LOCALES[useLocale()] ?? pl;
  const serviceModeAction = useServiceModeAction();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateNoteFormValues, unknown, CreateNoteValues>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: { title: "" },
  });

  async function onSubmit(values: CreateNoteValues) {
    const result = await serviceModeAction.run(createNoteCommand, values);
    if (result === null) {
      return;
    }
    if (result.success) {
      toast.success(t("toast-created"));
      reset();
      router.refresh();
    } else {
      toast.error(result.error ?? t("toast-create-error"));
    }
  }
// …
      {serviceModeAction.dialog}
    </Card>
```

Pominięty JSX to karta z formularzem i listą. Formularz ma `FormField` z `FormLabel`, `Input` z `{...register("title")}` i `FormError` z `t("error-title-required")`, gdy jest `errors.title`, oraz przycisk wysyłki. Lista pokazuje tytuł notatki i datę z `format(new Date(note.createdAt), "d MMM yyyy", { locale: dateLocale })`, a bez notatek tekst `t("empty")`. Ten sam układ mają `src/features/users/components/invite-user-dialog.tsx` (pola formularza) i `users-manager.tsx` (karta, pusta lista, wybór `dateLocale`). Datę w formacie `d MMM yyyy` formatuje `user-account-columns.tsx`, który `users-manager.tsx` tylko importuje.

- `CreateNoteFormValues` to `z.input<typeof createNoteSchema>`, a `useForm` dostaje trzy parametry typu, bo schemat przycina tytuł ([Formularz](06-wzorce-kodu.md#formularz)).
- `null` z `run` oznacza „Anuluj” w dialogu trybu serwisowego: komponent nic nie robi.
- Zmiana danych poza akcją serwerową (na przykład `fetch` do route handlera, jak w `FileUpload`) bierze potwierdzenie z `requestConfirmation()` tego samego hooka i przekazuje je serwerowi (`FileUpload` wysyła je w polu `serviceModeConfirmation` ciała multipart). Funkcja pokazuje dialog w trybie serwisowym i zwraca obiekt potwierdzenia, a poza trybem serwisowym `undefined`; `null` oznacza „Anuluj”, więc komponent przerywa zapis. Dialog nadal renderuje `{serviceModeAction.dialog}`.
- Po sukcesie `router.refresh()` (z `@/i18n/routing`) pobiera stronę od nowa, więc query wykonuje się ponownie.
- Bez `{serviceModeAction.dialog}` superadmin w trybie serwisowym nie zobaczy dialogu, a `run` będzie czekać ([`run`](04b-superadmin-i-tryb-serwisowy.md#run)).

<a id="strona"></a>

### Strona

Wzorzec: `src/app/[locale]/(app)/dashboard/page.tsx`. Strona leży w grupie `(app)`, więc ma menu, pasek trybu serwisowego i `ServiceModeProvider`, którego potrzebuje `run`.

`src/app/[locale]/(app)/notes/page.tsx`

```tsx
import { setRequestLocale } from "next-intl/server";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import { NotesManager } from "@/features/notes/components/notes-manager";
import { listNotesQuery } from "@/features/notes/services/queries/list-notes-query";

interface NotesPageProps {
  params: Promise<{ locale: string }>;
}

export default async function NotesPage({ params }: NotesPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModuleAccess("notes");
  const notes = await listNotesQuery();
  return <NotesManager notes={notes} />;
}
```

Strona nie zmienia danych, tylko czyta i renderuje komponent ([Zmiana danych tylko w akcji serwerowej](06-wzorce-kodu.md#zmiana-danych)).

Po implementacji testy jednostkowe dają `Tests  20 passed (20)`, a testy izolacji `Tests  7 passed (7)`. Test architektury `src/__tests__/server-entrypoints-guard.test.ts` przechodzi z nowymi plikami bez wpisów wyjątków ([Test architektury](06-wzorce-kodu.md#test-architektury)).

<a id="krok-8"></a>

## Krok 8. Bramki

### Pliki generowane

`npm run wa -- generate` musi wypisać `Bez zmian`. Job `verify` w CI uruchamia generator i kończy się błędem, gdy pliki generowane różnią się od zacommitowanych ([Idempotencja i kontrola w CI](02b-rejestr-i-generator.md#idempotencja-i-kontrola-w-ci)).

<a id="testy-rdzenia"></a>

### `npm run verify` i testy rdzenia

Dodanie feature `notes` nie wymaga zmiany żadnego istniejącego testu. Testy rdzenia, które porównują rejestr z listą wpisaną na stałe (`access-matrix.test.ts`, `nav.test.ts`, `app-sidebar.test.tsx`), biorą z rejestru tylko moduły rdzenia: `src/test/core-modules.ts` eksportuje `CORE_MODULE_KEYS` (`account`, `auth`, `dashboard`, `organizations`, `users`) i `coreClientModules`, czyli `clientModules` przefiltrowany do tych kluczy. Moduły kitu i moduły projektu z `projectModules` nie wchodzą do literałowej macierzy dostępu ani do list adresów menu.

Spójność całego rejestru, razem z `notes`, sprawdza `src/shared/lib/modules/__tests__/registry-consistency.test.ts`. Dla każdego modułu z `clientModules` wymaga on:

- unikalnych kluczy modułów i unikalnych `href` pozycji menu, zaczynających się od `/`;
- dla każdego języka z `locales` i każdej pozycji menu: loadera tłumaczeń modułu w `moduleMessages` oraz niepustego napisu pod `labelKey` (i `multiOrgLabelKey`, jeśli jest);
- dla 24 kombinacji ról globalnych, ról w organizacji i `MULTI_ORG`: `href` modułu jest w `getNavEntries(context)` wtedy i tylko wtedy, gdy `canAccessModule(moduleDef, context)`.

To test spójności danych rejestru, a nie pokrycie reguł dostępu. Reguły dla modułów rdzenia pokrywa literałowa macierz z [macierzy dostępu](04-auth-i-role.md#macierz-dostepu). Reguły własnej funkcji, na przykład zawężenie `roles` albo `adminOnly` w `module.ts`, pokrywasz własnym testem obok feature, z oczekiwanym wynikiem wpisanym literałem.

Brak pozycji w tłumaczeniach albo powtórzony `href` pokaże `registry-consistency.test.ts` z nazwą modułu w komunikacie. Pierwszy przebieg `npm run verify` po dodaniu feature przechodzi bez poprawek w testach rdzenia.

<a id="krok-8-integracja"></a>

### Testy integracyjne

Pełny przebieg wszystkich testów integracyjnych. Ostrzeżenie o czyszczeniu bazy, wariant bez zmiennej (port 5432) i linię `Datasource` do sprawdzenia opisuje [Uruchomienie testów](09-nowy-modul.md#uruchomienie-testow) w części pierwszej. W przebiegu baza działała na porcie 5439:

```bash
INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5439/wa_app_tutorial_test npm run test:integration
```

Wynik: `Test Files  2 passed (2)` i `Tests  45 passed (45)` (38 testów rdzenia i 7 testów notatek), około 5 sekund.

Tabela `notes` nie jest na liście `TABLES` w `src/test/integration/database.ts`, ale `resetDatabase()` i tak ją czyści, bo ma klucz obcy do `organizations`, a `TRUNCATE … CASCADE` czyści też tabele z kluczami do czyszczonych tabel ([Czyszczenie tabel feature](08-testy.md#izolacja-czyszczenie)). Po przebiegu w bazie zostały tylko 3 notatki z ostatniego `beforeEach`, a ręczne wykonanie tej samej instrukcji wypisało `NOTICE:  truncate cascades to table "notes"`. Tabelę feature bez klucza obcego do tabel rdzenia czyścisz w `beforeEach` sam.

Stryker nie zrobi za Ciebie mutacji pod testami integracyjnymi, bo plików feature nie ma w `mutate` konfiguracji integracyjnej. Sprawdź ręcznie, że test izolacji umie się wywrócić: usuń na chwilę `organizationId` z `where` w query i uruchom test ([Jak go zbudować](08-testy.md#izolacja), punkt 6).

<a id="krok-8-stryker"></a>

### Mutacje

W procesie z agentami mutacje uruchamia `test-reviewer` po implementacji, przed oceną kodu. Bierze wszystkie pliki produkcyjne zadania z diffu, uruchamia `npm run test:mutation:task` i `npm run test:mutation:gate`, klasyfikuje każdy przeżyły mutant w liniach zadania (luka, równoważny, komunikat) i wydaje werdykt: OK albo powrót do autora testów. Wpisy wyjątków w `mutation-gate.json` tylko proponuje, a dopisuje je człowiek w pull requeście ([Przebieg zadania](08b-testy-adwersarialne.md#przebieg)). W przebiegu tutorialu nie było agentów, więc Strykera uruchomiono ręcznie i tylko na pliku komendy, a nie na wszystkich plikach z diffu (w tym query i `note.schemas.ts`): w komendzie leżą reguły bezpieczeństwa (guard, potwierdzenie, `organizationId` z kontekstu). Query ma testy tylko integracyjne, więc w przebiegu unitowym jego mutanty dostałyby status `NoCoverage` ([Stryker](08b-testy-adwersarialne.md#stryker)). `note.schemas.ts` pominięto dla zwięzłości. W zadaniu warto go dodać: mutanty `trim`, `min(1)` i `max(200)` powinny zginąć w testach walidacji komendy, ale przebieg tego nie sprawdził.

Sprawdź, że nie działa inny Stryker (`pgrep -fl stryker` nic nie wypisuje), i uruchom przebieg na pliku komendy ([Przebieg na plikach zadania](08b-testy-adwersarialne.md#task)):

```bash
npm run test:mutation:task -- src/features/notes/services/commands/create-note-command.ts
```

Fragment wyniku z przebiegu (znaczniki czasu usunięte):

```text
INFO ProjectReader No incremental result file found at reports/stryker-incremental.json, a full mutation testing run will be performed.
INFO Instrumenter Instrumented 1 source file(s) with 23 mutant(s)
INFO DryRunExecutor Initial test run succeeded. Ran 20 tests in 1 second (net 7.278248000000076 ms, overhead 1445.721752 ms).
ERROR MutationTestReportHelper Final mutation score 66.67 under breaking threshold 75, setting exit code to 1 (failure).
INFO MutationTestExecutor Done in 45 seconds.
```

Z 23 mutantów 14 odrzucił TypeScript (`CompileError`, nie liczą się do wyniku), 6 zginęło (`Killed`), 2 przeżyły (`Survived`), a 1 nie ma pokrycia (`NoCoverage`). Wynik 6 / 9 to 66,67% ([Statusy i wynik mutacji](08b-testy-adwersarialne.md#wynik)).

**Dlaczego kod wyjścia 1.** Projekt nie miał pliku trybu przyrostowego `reports/stryker-incremental.json`, więc raport objął tylko plik komendy, a próg `break` 75 dotyczy jego wyniku ([Progi](08b-testy-adwersarialne.md#progi)). Gdy plik przyrostowy istnieje, na przykład po pełnym `npm run test:mutation`, wynik końcowy obejmuje cały projekt i patrzysz na wiersz swojego pliku ([Przebieg na plikach zadania](08b-testy-adwersarialne.md#task), punkt 4). Mały plik z kilkoma mutantami nie do zabicia spada poniżej progu łatwo, więc oceniasz każdy przeżyły mutant, a nie samą liczbę. Przeżyłe mutanty z przebiegu nie zostały zabite na siłę:

| Status | Mutacja w linii z komunikatem walidacji | Klasyfikacja |
| --- | --- | --- |
| `Survived` | `parsed.error.issues[0]?.message ?? "Nieprawidłowe dane"` → `… && "Nieprawidłowe dane"` | komunikat: zamiast tekstu Zod wraca tekst zapasowy, a testy sprawdzają tylko niepusty napis; zabije go test z literałem komunikatu Zod |
| `Survived` | `issues[0]?.message` → `issues[0].message` | równoważny: nieudany `safeParse` ma zawsze co najmniej jeden błąd |
| `NoCoverage` | `"Nieprawidłowe dane"` → `""` | równoważny: tekst zapasowy jest nieosiągalny z tego samego powodu |

Zginęły mutanty: usunięcie wywołania `assertServiceModeConfirmed`, pusty klucz w `requireModuleAccess`, pusta ścieżka w `revalidatePath`, pusty komunikat domyślny i odwrócone `success` w wyniku błędu walidacji i w wyniku sukcesu. `npm run test:mutation:gate` wypisuje `Bramka mutacji: OK (raporty: reports/mutation/mutation.json).`, bo plików feature nie ma na liście `critical` w `mutation-gate.json` ([Bramka mutacji](08b-testy-adwersarialne.md#bramka)). Przebieg trwał 46 sekund na komputerze z 8 rdzeniami.

<a id="krok-8-przegladarka"></a>

### Sprawdzenie w przeglądarce

`npm run dev`, logowanie i `/notes` ([pierwsze uruchomienie](01-uruchomienie.md#pierwsze-uruchomienie), kroki 7–8). Co pokazał przebieg na koncie admina globalnego:

- menu: „Dashboard”, „Notatki”, „Użytkownicy”, „Konto”;
- karta „Notatki” z opisem, polem „Tytuł” i przyciskiem „Dodaj notatkę”, a bez notatek tekst „Brak notatek.”;
- po dodaniu notatka na liście z datą (na przykład „28 paź 2026”), pusty tytuł daje pod polem „Podaj tytuł od 1 do 200 znaków”;
- superadmin w organizacji, do której nie należy (tryb serwisowy), widzi pustą listę tej organizacji, a „Dodaj notatkę” otwiera dialog „Tryb serwisowy” z treścią „Zmieniasz dane organizacji `<nazwa>` jako serwis Web Amigos.” i przyciskami „Anuluj” i „Zmień”. Po „Zmień” notatka zapisuje się w tej organizacji.

**Pułapka: `next dev` uruchomione przez agenta AI.** Next.js 16.3.8 wykrywa agenta AI (na przykład sesję Claude Code) i przy starcie `next dev` dopisuje do `AGENTS.md` blok między liniami `<!-- BEGIN:nextjs-agent-rules -->` i `<!-- END:nextjs-agent-rules -->`, a w terminalu wypisuje ``✓ Generated AGENTS.md for AI agents. Set `agentRules: false` in next.config to disable.`` Uruchomienie przez człowieka w zwykłym terminalu niczego nie dopisuje. `AGENTS.md` pochodzi z kitu, więc tego bloku nie commituj razem z feature. Jeśli sam nie zmieniasz `AGENTS.md`, cofnij go przed `git add -A` przez `git restore AGENTS.md`; ta komenda kasuje też Twoje niezacommitowane zmiany w pliku, więc gdy je masz, usuń blok ręcznie. Jeśli zmiana jest już w indeksie, samo `git restore AGENTS.md` nic nie cofa, bo przywraca plik z indeksu: użyj `git restore --staged --worktree AGENTS.md`. Przy następnym starcie przez agenta blok wraca.

<a id="krok-9"></a>

## Krok 9. Commit

Przed `git add` polecenie `git status --short` pokazuje zmienione pliki z ` M`, a nowe pliki i katalogi z `??` (nowy katalog jako jedna linia, na przykład `?? src/features/notes/`). Po `git add -A` widać każdy plik osobno, `A` dla nowych i `M` dla zmienionych:

```bash
git add -A
git status --short
```

```text
M  .wa/kit.json
A  prisma/migrations/20261028044413_add_notes/migration.sql
A  prisma/schema/notes.prisma
M  prisma/schema/organizations.prisma
A  src/app/[locale]/(app)/notes/page.tsx
A  src/features/notes/components/notes-manager.tsx
A  src/features/notes/contracts/note.schemas.ts
A  src/features/notes/contracts/note.types.ts
A  src/features/notes/i18n/en.json
A  src/features/notes/i18n/pl.json
A  src/features/notes/module.ts
A  src/features/notes/services/__tests__/notes-isolation.integration.test.ts
A  src/features/notes/services/commands/__tests__/create-note-command.test.ts
A  src/features/notes/services/commands/create-note-command.ts
A  src/features/notes/services/queries/list-notes-query.ts
M  src/modules.client.generated.ts
M  src/modules.generated.ts
```

Znacznik czasu w nazwie migracji będzie u Ciebie inny. Jeśli `next dev` uruchamiał agent AI, na liście jest też `M  AGENTS.md`: cofnij go przez `git restore --staged --worktree AGENTS.md` (pułapka wyżej).

Zacommituj wszystko razem: pliki generowane i migracja należą do zmiany, która je wywołała ([D04](decyzje.md#d04)). Temat commita według Conventional Commits, małymi literami, na przykład `feat(notes): organization notes`. Przy commicie lint-staged uruchamia `eslint --fix` i Prettiera, a commitlint sprawdza temat. Przy wdrożeniu Railway zastosuje migrację `add-notes` przez `npx prisma migrate deploy` ([10-wdrozenie.md](10-wdrozenie.md)).

<a id="dziennik-zdarzen"></a>

## Dziennik zdarzeń w funkcji projektu

Ta sekcja dotyczy projektu z zainstalowanym modułem `audit-logs` ([12-moduly-kitu.md](12-moduly-kitu.md#audit-logs)). Funkcja, która chce zostawiać ślad zmian, robi trzy rzeczy.

1. **Wywołanie `trackAudit` w komendzie**, po udanym zapisie i po `assertServiceModeConfirmed`. `auditActor(context)` wypełnia organizację, użytkownika i tryb serwisowy:

```ts
import { auditActor, trackAudit } from "@/shared/lib/audit";

await trackAudit({
  ...auditActor(context),
  action: "delivery.received",
  entityType: "delivery",
  entityId: delivery.id,
});
```

`oldData` i `newData` są opcjonalne; dane wrażliwe z listy modułu zostają zredagowane przed zapisem. Awaria ujścia nie przerywa komendy: `trackAudit` loguje błąd i wraca. `trackAudit` należy do rdzenia, więc kod działa też w projekcie bez `audit-logs` (wtedy nic nie zapisuje).

2. **Deklaracja `auditActions` w `module.ts` feature** z kluczem etykiety w jego własnej przestrzeni nazw tłumaczeń:

```ts
auditActions: [
  { action: "delivery.received", labelKey: "action-delivery-received" },
],
```

Klucz `action-delivery-received` dodaj do `src/features/<x>/i18n/pl.json` i `en.json` tego samego feature. Strona `/audit-log` i `<AuditTrail>` szukają etykiety w module, który akcję zadeklarował. Akcja bez deklaracji wyświetla się jako surowy napis `delivery.received`.

3. **Historia encji na stronie** przez `<AuditTrail>` z `src/features/audit-logs/components/audit-trail.tsx`:

```tsx
import { AuditTrail } from "@/features/audit-logs/components/audit-trail";

<AuditTrail entityType="delivery" entityId={delivery.id} />
```

Komponent wymaga zainstalowanego `audit-logs`: import z `src/features/audit-logs/` nie skompiluje się w projekcie bez modułu. Feature, który ma działać w obu wariantach, nie osadza komponentu, tylko samo woła `trackAudit`. Komponent nie renderuje nic użytkownikowi bez dostępu do modułu (role `owner` i `admin` organizacji), a pokazuje 50 ostatnich wpisów encji z aktywnej organizacji.

<a id="pliki-w-funkcji-projektu"></a>

## Pliki w funkcji projektu

Ta sekcja dotyczy projektu z zainstalowanym modułem `uploads` ([12-moduly-kitu.md](12-moduly-kitu.md#uploads)). Funkcja, która przyjmuje pliki, robi trzy rzeczy.

1. **Deklaracja celu w `module.ts` feature.** Cel mówi, jakie typy i jak duże pliki przyjmuje funkcja oraz kto je potem zobaczy:

```ts
uploadPurposes: [
  {
    key: "delivery-photo",
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 8 * 1024 * 1024,
    visibility: "organization",
    resizeImage: { maxWidth: 1600 },
  },
],
```

`key` musi być unikalny w całym rejestrze modułów. Dla zdjęć dokumentów i danych organizacji wybierz `visibility: "organization"`: adres pliku działa wtedy tylko dla sesji z aktywną organizacją pliku. `"public"` oznacza adres dostępny dla każdego, bez sesji. SVG, HTML, XHTML i XML (`image/svg+xml`, `text/html`, `application/xhtml+xml`, `application/xml`, `text/xml`) nie wolno wpisać do `mimeTypes`: SVG albo XHTML z prologiem XML jest wykrywany jako `application/xml` i mógłby wykonać skrypt. Formaty tekstowe (`text/plain`, `text/csv`, `application/json`) nie mają sygnatury w bajtach, więc cel z nimi zawsze odpowiada 415. Po dodaniu `module.ts` uruchom `npm run wa -- generate` ([Nowa funkcja w istniejącym module](#nowa-funkcja-w-istniejącym-module), punkt 1).

2. **Komponent `<FileUpload>`** w formularzu feature (komponent kliencki). Po udanym zapisie woła `onUploaded` z `{ id, url, fileName, mimeType, size }`:

```tsx
import { FileUpload } from "@/features/uploads/components/file-upload";

<FileUpload
  purpose="delivery-photo"
  accept="image/*"
  onUploaded={(upload) => setPhotoUploadId(upload.id)}
/>
```

Komponent sam prosi o potwierdzenie w trybie serwisowym, więc formularz nie dokłada własnego dialogu. `accept` tylko podpowiada przeglądarce: serwer sprawdza typ po zawartości pliku, a `purpose` decyduje o limitach. Komponent wymaga zainstalowanego `uploads`: import z `src/features/uploads/` nie skompiluje się w projekcie bez modułu.

3. **Zapis `id` pliku w encji feature**, w kolumnie ze schematu Prismy (na przykład `photoUploadId String? @db.Uuid`), przekazanej do komendy razem z resztą danych formularza. Komenda zapisuje samo `id`, a nie adres. Adres pliku to zawsze `/api/uploads/<id>`.

```ts
const photoUrl = delivery.photoUploadId ? `/api/uploads/${delivery.photoUploadId}` : null;
```

Zwróć uwagę na dwie rzeczy:

- `id` w polu encji nie ma klucza obcego do tabeli `uploads` (moduł nie zna encji projektu), więc komenda, która zapisuje `id` z wejścia, odpowiada za to, że wskazuje plik własnej organizacji. Sprawdź to zapytaniem `prisma.upload.findFirst({ where: { id, organizationId: context.organizationId } })` przed zapisem.
- Usunięcie encji nie usuwa pliku. Wołaj `deleteUploadCommand` z `src/features/uploads/services/commands/upload-commands.ts` ([12](12-moduly-kitu.md#usuwanie)) w tym samym przepływie, który usuwa encję, albo świadomie zostaw plik.

Test izolacji pliku (odczyt i usunięcie z kontekstem innej organizacji) dostaje moduł `uploads` w swoich testach integracyjnych. Test funkcji projektu pokrywa tylko własną regułę: że komenda odrzuca `id` pliku z innej organizacji.

<a id="trasy-api"></a>

## Trasa API z kluczem w funkcji projektu

Ta sekcja dotyczy projektu z zainstalowanym modułem `api-keys` ([12-moduly-kitu.md](12-moduly-kitu.md#api-keys)). Funkcja, która wystawia trasę dla zewnętrznych systemów, robi trzy rzeczy.

1. **Deklaracja zakresu w `module.ts` feature** z kluczem etykiety w jego własnej przestrzeni nazw tłumaczeń:

```ts
apiScopes: [
  { key: "deliveries:write", labelKey: "scopes.deliveriesWrite" },
],
```

Klucz `scopes.deliveriesWrite` dodaj do `src/features/<x>/i18n/pl.json` i `en.json` tego samego feature. Strona `/api-keys` pokazuje zakresy wszystkich zainstalowanych modułów i szuka etykiety w module, który zakres zadeklarował. Zakres z `apiScopes` trafia do `knownApiScopes()` dopiero po `npm run wa -- generate`, bo rejestr `modules` pochodzi z pliku generowanego.

2. **Trasa w `src/app/api/v1/<zasób>/route.ts`**, która najpierw woła `authenticateApiKey`, a dopiero potem dotyka danych. Wszystkie zapytania filtrują po `context.organizationId`; organizacji nie bierze się z treści żądania:

```ts
import { authenticateApiKey } from "@/features/api-keys/services/authenticate-api-key";
import { receiveDelivery } from "@/features/deliveries/services/receive-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request, "deliveries:write");
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }
  const delivery = await receiveDelivery(auth.context, await request.json());
  return Response.json(delivery, { status: 201, headers: NO_STORE });
}
```

Trasa przekazuje `auth.context` do serwisu, który waliduje wejście Zod-em; logiki biznesowej nie trzyma w pliku `route.ts`. Serwis wołany z trasy z kluczem przyjmuje `ApiKeyContext` i leży w katalogu głównym `services/` feature, w pliku bez `"use server"` (jak `services/organization-api.ts` w module `api-keys`). Nie kładź go w `services/queries/`, bo test architektury wymaga tam guarda sesji. Nie kładź go też w pliku komend z `"use server"`: każda eksportowana funkcja takiego pliku to publiczna akcja serwerowa, w której wywołujący sam wybierałby `organizationId`. Odpowiedź ma `Cache-Control: no-store`, tak jak trasa przykładowa `GET /api/v1/organization`. Klucz nie jest sesją, więc `getOrgContext()` i `assertServiceModeConfirmed` nie mają tu zastosowania: tożsamością jest `context.organizationId`, a zakres sprawdza `authenticateApiKey`.

3. **Audyt zapisu wykonanego kluczem** przez `trackAudit` z kanałem `API`. Zdarzenie nie ma użytkownika, a identyfikatorem poświadczenia jest id klucza:

```ts
import { trackAudit } from "@/shared/lib/audit";

await trackAudit({
  organizationId: context.organizationId,
  actorUserId: null,
  action: "delivery.received",
  entityType: "delivery",
  entityId: delivery.id,
  channel: "API",
  credentialId: context.apiKeyId,
});
```

Dzięki temu strona `/audit-log` odróżnia zapis z API od zapisu z interfejsu, a wpis wskazuje klucz, który go wykonał. Akcję deklaruje się w `auditActions` jak w [sekcji o dzienniku zdarzeń](#dziennik-zdarzen).

<a id="istniejacy-modul"></a>

## Nowa funkcja w istniejącym module

Ta sekcja dotyczy zmiany w feature, który już ma wpis w `.wa/kit.json` i definicję modułu, na przykład usuwania notatek w feature `notes`. Nowego wpisu nie dodajesz, ale istniejący czasem zmieniasz (nowa relacja zwrotna, zmienna, wzorzec pliku).

1. **Generator po nowym pliku z listy albo po zmianie wpisu.** Uruchom `npm run wa -- generate` wtedy, gdy w feature dochodzi plik `module.ts`, `env.ts`, `auth.ts`, `auth-client.ts` albo `i18n/<locale>.json`, albo gdy zmieniasz wpis w `.wa/kit.json` (`schemaRelations`, `env`, `compose`), bo z niego generator wypełnia regiony ([Uruchomienie](02b-rejestr-i-generator.md#uruchomienie)). Nowa komenda, query, komponent, strona albo klucz w istniejącym pliku tłumaczeń generatora nie wymagają, bo rejestr importuje pliki, a nie kopiuje ich treść.
2. **Plan i testy przed kodem**, jak w [kroku 6](09-nowy-modul.md#krok-6): zachowania z literałami, mutacje do zabicia, `test-writer`, czerwony przebieg z właściwego powodu.
3. **Komenda według [kolejności z 06](06-wzorce-kodu.md#kolejnosc).** Gdy komenda zmienia albo usuwa rekord po `id` z wejścia, warunek ma postać `{ id, organizationId }`, bo samo `id` może wskazywać rekord innej organizacji ([Filtr `organizationId`](03-dane-i-organizacje.md#filtr-organizationid)). Reguła węższa niż dostęp do strony, na przykład usuwanie tylko przez ownera, sprawdza `context.orgRole` po `assertServiceModeConfirmed`.
4. **Test izolacji dla nowej komendy albo query**: zalogowany użytkownik A podaje `id` rekordu organizacji B, komenda odmawia, a rekord B w bazie się nie zmienia ([Jak go zbudować](08-testy.md#izolacja), punkt 4). Dopisz go w istniejącym pliku `*.integration.test.ts` feature.
5. **Zmiana schematu**: `npx prisma migrate dev --name <nazwa>`, potem `npm run db:generate`, i commit migracji razem ze zmianą ([krok 4](09-nowy-modul.md#krok-4)). Nowa relacja do `User` albo `Organization` wymaga najpierw nowej pozycji w `schemaRelations` istniejącego wpisu i przebiegu generatora. Bez tego Prisma zgłasza brak relacji zwrotnej i podpowiada `prisma format`, którego nie uruchamiaj ([pułapka relacji](09-nowy-modul.md#pulapka-relacji)).
6. **Nowa strona feature** w `src/app/[locale]/(app)/<trasa>/page.tsx` woła `requireModuleAccess` z kluczem feature. Trasa spoza wzorców `files` wpisu działa, ale dopisz jej wzorzec, żeby zapis własności plików był pełny.
7. **Zmiana dostępu albo menu w `module.ts`** (`nav`, `roles`, `adminOnly`, `multiOrgRoles`, `public`) zmienia wynik `canAccessModule` i listy menu. Testów rdzenia nie poprawiasz: spójność menu z `canAccessModule` dla całego rejestru sprawdza `registry-consistency.test.ts`, a własne reguły dostępu feature pokrywasz własnym testem ([krok 8](#testy-rdzenia)).
8. **Bramki** jak w [kroku 8](#krok-8): `npm run wa -- generate` bez zmian, `npm run verify`, testy integracyjne i `npm run test:mutation:task` na zmienionych plikach produkcyjnych. Plik sprawdzany tylko testem integracyjnym, jak query, dostanie w tym przebiegu `NoCoverage`, więc jego test izolacji sprawdzasz ręcznie ([Testy integracyjne](#krok-8-integracja)).

Nowy katalog w `src/features/` to zawsze nowy feature i nowy wzorzec w `.wa/kit.json`, więc przechodzi cały tutorial.

<a id="referencja"></a>

## Referencja

<a id="referencja-komunikaty"></a>

### Komunikaty z przebiegu

| Komunikat | Kiedy | Co zrobić |
| --- | --- | --- |
| `Bez zmian` po dodaniu `module.ts` | Feature bez wzorca w `.wa/kit.json`. | [Krok 3](09-nowy-modul.md#krok-3). |
| `404 This page could not be found.` na stronie feature | Feature poza rejestrem albo inny klucz w `requireModuleAccess` niż `key` w `module.ts`. | Sprawdź wpis, przebieg generatora i klucz ([objaw](09-nowy-modul.md#objaw-braku-wpisu)). |
| `Type "Note" is neither a built-in type, nor refers to another model, composite type, or enum.` | Region ma już relację, a pliku schematu modułu nie ma. | Zapisz plik schematu ([krok 4](09-nowy-modul.md#krok-4)). |
| ``The relation field `organization` on model `Note` is missing an opposite relation field on the model `Organization`. Either run `prisma format` or add it manually.`` | Plik schematu jest, a `schemaRelations` albo przebiegu generatora brak. | Uzupełnij `schemaRelations` i uruchom generator. Nie uruchamiaj `prisma format` ([pułapka](09-nowy-modul.md#pulapka-relacji)). |
| `Field "notes" is already defined on model "Organization".` | Relacja dopisana ręcznie albo przez `prisma format` i drugi raz przez generator. | Usuń linię spoza regionu `wa:relations`. |
| `error TS2339: Property 'note' does not exist on type 'PrismaClient'.` | Po migracji nie wygenerowano klienta. | `npm run db:generate`. |
| `Error: Failed to resolve import "../create-note-command" from "…". Does the file exist?` | Testy przed kodem bez pustego pliku (`export {};`). | Pusty plik z `export {};` ([krok 6](09-nowy-modul.md#krok-6)). |
| `TypeError: createNoteCommand is not a function` | Czerwony przebieg z właściwego powodu: brak eksportu. | Implementacja ([krok 7](#krok-7)). |
| `Error: Invariant: static generation store missing in revalidatePath /notes` w logu testu i wynik „Nie udało się dodać notatki” | Test integracyjny komendy z `revalidatePath` bez mocka `next/cache`. | `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` w teście. |
| Błąd w `registry-consistency.test.ts` z nazwą modułu | Brak tłumaczenia pozycji menu w jednym z języków, powtórzony `href` albo klucz modułu. | [Testy rdzenia](#testy-rdzenia). |
| `Final mutation score 66.67 under breaking threshold 75, setting exit code to 1 (failure).` | Przebieg na plikach zadania bez pliku przyrostowego. | Oceń przeżyłe mutanty ([Mutacje](#krok-8-stryker)). |
| `✓ Generated AGENTS.md for AI agents. …` | `next dev` uruchomione przez agenta AI. | Przed `git add -A`: `git restore AGENTS.md`; po `git add`: `git restore --staged --worktree AGENTS.md`. |

<a id="referencja-pliki"></a>

### Pliki feature i ich wzorce

| Plik | Wzorzec w rdzeniu | Reguły |
| --- | --- | --- |
| `src/features/notes/module.ts` | `src/features/account/module.ts`, `src/features/dashboard/module.ts` | [Definicja modułu](02-architektura.md#definicja-modulu) |
| `src/features/notes/i18n/pl.json`, `en.json` | `src/features/users/i18n/pl.json` | [Dodawanie tekstu](07-i18n-mail-env.md#dodawanie-tekstu) |
| `prisma/schema/notes.prisma` | model `Invitation` w `prisma/schema/organizations.prisma` | [Model danych rdzenia](03-dane-i-organizacje.md#model-danych) |
| `src/features/notes/contracts/note.schemas.ts`, `note.types.ts` | `src/features/users/contracts/user-account.schemas.ts`, `user-account.types.ts` | [Kontrakty](06-wzorce-kodu.md#kontrakty) |
| `src/features/notes/services/queries/list-notes-query.ts` | `src/features/organizations/services/queries/organization-queries.ts`, `src/features/users/services/queries/user-account-queries.ts` | [Query](06-wzorce-kodu.md#query) |
| `src/features/notes/services/commands/create-note-command.ts` | `src/features/users/services/commands/invite-user-command.ts` | [Kolejność kroków w nowej komendzie](06-wzorce-kodu.md#kolejnosc) |
| `src/features/notes/components/notes-manager.tsx` | `src/features/users/components/invite-user-dialog.tsx`, `users-manager.tsx`, `user-account-columns.tsx` | [Wywołanie z interfejsu](06-wzorce-kodu.md#interfejs) |
| `src/app/[locale]/(app)/notes/page.tsx` | `src/app/[locale]/(app)/dashboard/page.tsx` | [D11](decyzje.md#d11) |
| `src/features/notes/services/commands/__tests__/create-note-command.test.ts` | `src/features/users/services/commands/__tests__/invite-user-command.test.ts` | [Zasady pisania testów](08b-testy-adwersarialne.md#zasady) |
| `src/features/notes/services/__tests__/notes-isolation.integration.test.ts` | `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts` | [Test izolacji organizacji](08-testy.md#izolacja) |
