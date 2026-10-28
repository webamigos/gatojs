# Nowa funkcja w projekcie klienta

Po przeczytaniu będziesz wiedzieć:

- jak przygotować projekt klienta do dodania własnej funkcji i jakie pliki powstaną po drodze;
- dlaczego funkcja projektu potrzebuje wpisu w `projectModules` w `.wa/kit.json` i po czym poznasz, że go brakuje;
- jak dodać tabelę domenową z `organizationId`, relację zwrotną i migrację;
- jak zaplanować i napisać testy komendy i test izolacji, zanim powstanie kod;
- jakie błędy Prismy i Vitest pojawiają się w tych krokach i co z nimi zrobić.

Zweryfikowano z kodem: 4a6ffcb, 2026-10-27

Źródła:

- `.wa/kit.json`
- `.gitignore`
- `kit/cli/src/manifest/schema.ts`
- `kit/cli/src/generate/index.ts`
- `prisma/schema/organizations.prisma`
- `src/shared/lib/modules/define-module.ts`
- `src/shared/lib/modules/nav.ts`
- `src/shared/lib/auth/require-module-access.ts`
- `src/shared/lib/auth/permissions.ts`
- `src/shared/utils/error-handling.ts`
- `src/shared/lib/env.ts`
- `src/features/account/module.ts`
- `src/features/dashboard/module.ts`
- `src/features/users/i18n/pl.json`
- `src/features/users/contracts/`
- `src/features/users/services/commands/__tests__/invite-user-command.test.ts`
- `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts`
- `src/test/integration/database.ts`
- `vitest.config.ts`
- `.github/workflows/ci.yml`
- `node_modules/next/dist/server/web/spec-extension/revalidate.js` (Next.js 16.3.8, `revalidate`)

Tutorial dodaje do projektu klienta funkcję domenową: notatki organizacji. Powstaje feature `notes` z tabelą `notes`, stroną `/notes` (lista i formularz), query `listNotesQuery`, komendą `createNoteCommand` i testami. Tutorial nie uczy pisania modułu kitu, czyli kodu, który trafia do wielu projektów ([11-praca-z-kitem.md](11-praca-z-kitem.md)).

Tutorial ma dwie części. Ten plik prowadzi przez kroki 1–6: rejestrację feature, schemat bazy, kontrakty i testy, które przed implementacją są czerwone. Kroki 7–9 (query, komenda, komponent, strona, bramki i commit) oraz how-to „Nowa funkcja w istniejącym module” są w [09b-implementacja-i-bramki.md](09b-implementacja-i-bramki.md).

Kroki zostały wykonane na kopii kitu przygotowanej jak projekt klienta, aż przeszły `npm run verify` i testy integracyjne; kod w blokach pochodzi z tego przebiegu. Przebieg Strykera i jego kod wyjścia opisuje [krok 8](09b-implementacja-i-bramki.md#krok-8-stryker). Pełnych plików feature `notes` nie ma w repozytorium kitu: w `kit/cli/src/__tests__/fixtures/project-module/` leży tylko jego minimalny szkielet (definicja modułu, tłumaczenia i model `Note`), którego CI używa do sprawdzenia, że moduł projektu rejestruje się bez edycji testów rdzenia. Przy każdym pliku podany jest plik rdzenia, na którym się wzoruje. Komunikaty błędów i wyniki komend są dosłowne.

Pojęcia, których używa tutorial:

- **Feature**: katalog `src/features/<x>/` z kodem jednej funkcji ([Anatomia feature](02-architektura.md#anatomia-feature)).
- **Moduł**: wpis w `.wa/kit.json` z manifestem plików. Rdzeń to moduł `core` ([02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#kit-json)).
- **Definicja modułu**: plik `module.ts` feature z `defineModule(...)` ([Definicja modułu](02-architektura.md#definicja-modulu)).
- **Rejestr modułów**: tablice w plikach generowanych `src/modules.generated.ts` i `src/modules.client.generated.ts`, z których menu, guard stron i tłumaczenia dowiadują się o feature ([Rejestr modułów](02b-rejestr-i-generator.md#rejestr-modulow)).
- **Komenda, query, guard, kontekst organizacji, tryb serwisowy**: [Pojęcia w 06-wzorce-kodu.md](06-wzorce-kodu.md).

<a id="co-powstanie"></a>

## Co powstanie

Kroki zmieniają te pliki. Kolumna „Kto” mówi, czy plik piszesz Ty, czy narzędzie.

| Plik | Krok | Kto |
| --- | --- | --- |
| `src/features/notes/module.ts`, `src/features/notes/i18n/pl.json`, `src/features/notes/i18n/en.json` | 2 | Ty |
| `.wa/kit.json` (wpis `notes` w `projectModules`) | 3 | Ty |
| `src/modules.generated.ts`, `src/modules.client.generated.ts`, region `wa:relations` w `prisma/schema/organizations.prisma` | 3 | generator (`npm run wa -- generate`) |
| `prisma/schema/notes.prisma` | 4 | Ty |
| `prisma/migrations/<data>_add_notes/migration.sql` | 4 | Prisma |
| `src/features/notes/contracts/note.schemas.ts`, `src/features/notes/contracts/note.types.ts` | 5 | Ty |
| `src/features/notes/services/commands/__tests__/create-note-command.test.ts`, `src/features/notes/services/__tests__/notes-isolation.integration.test.ts` | 6 | autor testów (w procesie z agentami `test-writer`) |
| `src/features/notes/services/queries/list-notes-query.ts`, `src/features/notes/services/commands/create-note-command.ts`, `src/features/notes/components/notes-manager.tsx`, `src/app/[locale]/(app)/notes/page.tsx` | 7 | autor kodu (w procesie z agentami implementer, który nie zmienia testów; [role](08b-testy-adwersarialne.md#role)) |

Kolejność kroków i punkty kontrolne:

```mermaid
flowchart TD
    s1["1. Projekt po starcie"] --> s2["2. module.ts i tłumaczenia"]
    s2 --> g1{"generator"}
    g1 -->|"Bez zmian: feature poza rejestrem"| s3["3. Wpis notes w projectModules"]
    s3 --> g2{"generator"}
    g2 -->|"rejestr i region wa:relations"| s4["4. notes.prisma, migracja, db:generate"]
    s4 --> s5["5. Kontrakty: schemat Zod i typ"]
    s5 --> s6["6. Testy przed kodem: czerwone"]
    s6 --> s7["7. Query, komenda, komponent, strona: testy zielone"]
    s7 --> s8["8. Bramki: verify, integracja, Stryker"]
    s8 --> s9["9. Commit"]
```

<a id="roznice"></a>

## Projekt klienta a repozytorium kitu

Tutorial zakłada projekt klienta. W repozytorium kitu te same kroki działają, ale część wyników ma inne miejsce:

| Temat | Projekt klienta | Repozytorium kitu |
| --- | --- | --- |
| Migracje | Commitowane. Linia `prisma/migrations/` jest usunięta z `.gitignore`, a migracja `init` jest w repozytorium ([03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#migracje-w-projekcie)). | Katalog `prisma/migrations/` jest w `.gitignore`, więc migracja `add-notes` zostaje tylko na dysku ([D13](decyzje.md#d13)). |
| `.wa/kit.json` | Moduły kitu w `modules`, moduły projektu w `projectModules`, tu `notes`. | Tylko moduły kitu. `projectModules` zostaje puste, bo funkcji projektu nie dopisuje się do kitu. |
| Poprawka rdzenia, która przyda się innym projektom | Zgłaszasz do repozytorium kitu ([11-praca-z-kitem.md](11-praca-z-kitem.md)). | Robisz ją tutaj. |

Jeśli chcesz przejść tutorial dla wprawy w repozytorium kitu, rób to w osobnej kopii roboczej (`git worktree`) z osobnymi bazami i niczego z niej nie commituj. W `.env` kopii ustaw w `DATABASE_URL` inną bazę niż `wa_app`, na przykład `wa_app_tutorial` (Prisma założy ją przy `npx prisma migrate dev`), a do testów integracyjnych podawaj osobną bazę z nazwą zakończoną na `_test`, na przykład `wa_app_tutorial_test`. Kopia, której `.env` powstał z `.env.example`, łączy się z tą samą bazą `wa_app` co kopia główna (ten sam port, ten sam kontener). Ta baza ma migrację `init` kopii głównej, której nie ma w ignorowanym katalogu `prisma/migrations/` kopii roboczej, więc `migrate dev` zgłosi rozjazd historii ([Rozjazd historii migracji](03b-schemat-i-migracje.md#dryf-migracji)). Gdyby migracja `add-notes` trafiła do `wa_app`, ten sam rozjazd zobaczyłaby kopia główna.

<a id="krok-1"></a>

## Krok 1. Projekt po starcie

Projekt musi przejść [pierwsze uruchomienie](01-uruchomienie.md#pierwsze-uruchomienie): zależności, `.env`, baza w Dockerze, migracja `init` i pierwsze konto. Trzy rzeczy sprawdź przed dalszymi krokami, bo każda psuje któryś z nich:

1. **Port bazy.** Gdy zmieniłeś `DB_PORT` w `.env`, port w `DATABASE_URL` musi być ten sam ([Zmiana portów](01-uruchomienie.md#zmiana-portow)). W przebiegu baza działała na porcie 5439, a `DATABASE_URL` wskazywał bazę `wa_app_tutorial` na tym porcie.
2. **Hasło pierwszego konta.** Pusta linia `ADMIN_PASSWORD=` w `.env` jest w porządku: `npm run admin:create` wygeneruje i wypisze hasło ([04-auth-i-role.md](04-auth-i-role.md#pusta-admin-password)).
3. **Migracje w git.** `git ls-files prisma/migrations` wypisuje `prisma/migrations/migration_lock.toml` i plik migracji `init`. Pusty wynik oznacza, że migracje są ignorowane: przejdź [Migracje w projekcie klienta](03b-schemat-i-migracje.md#migracje-w-projekcie).

Pracę zacznij na osobnej gałęzi, na przykład `git switch -c feat/notes`.

<a id="krok-2"></a>

## Krok 2. Katalog feature, definicja modułu i tłumaczenia

Feature to katalog `src/features/notes/`. Nazwa katalogu jest jednocześnie namespace tłumaczeń, a menu szuka etykiety pod `key` z definicji modułu, więc **`key` musi być równy nazwie katalogu** ([D27](decyzje.md#d27)). Nic tego nie sprawdza: przy `key: "note"` w katalogu `notes` menu pokaże zamiast etykiety ścieżkę klucza.

Definicja modułu (wzorzec: `src/features/account/module.ts` i `src/features/dashboard/module.ts`):

`src/features/notes/module.ts`

```ts
import { defineModule } from "@/shared/lib/modules/define-module";

export default defineModule({
  key: "notes",
  nav: [{ href: "/notes", labelKey: "nav", icon: "notebook-pen", order: 50 }],
  routePrefixes: ["/notes"],
});
```

- `nav`: jedna pozycja menu. `icon` to nazwa ikony lucide, a `order: 50` stawia ją między „Dashboard” (10) a „Użytkownicy” (80).
- `routePrefixes` jest wymagane przez typ, ale nie chroni trasy. Stronę chroni `requireModuleAccess("notes")` w kroku 7 ([pułapki definicji](02-architektura.md#pulapki-definicji)).
- Brak `roles`, `adminOnly` i `public` oznacza dostęp dla każdej roli w organizacji. Pozostałe pola opisuje [Referencja `ModuleDef`](02-architektura.md#referencja-moduledef).
- `module.ts` trafia do paczki przeglądarki przez menu, więc nie importuje kodu serwera ([D05](decyzje.md#d05)).

Teksty feature (wzorzec: `src/features/users/i18n/pl.json`). Klucze piszesz małymi literami z myślnikami:

`src/features/notes/i18n/pl.json`

```json
{
  "nav": "Notatki",
  "page-title": "Notatki",
  "page-description": "Notatki widzą wszyscy członkowie organizacji.",
  "empty": "Brak notatek.",
  "title-label": "Tytuł",
  "title-placeholder": "Np. Spotkanie z klientem",
  "error-title-required": "Podaj tytuł od 1 do 200 znaków",
  "submit": "Dodaj notatkę",
  "submitting": "Zapisywanie...",
  "toast-created": "Notatka dodana.",
  "toast-create-error": "Nie udało się dodać notatki."
}
```

Plik `en.json` ma te same klucze po angielsku. Żaden test nie porównuje kluczy obu plików, a brakujący klucz widać dopiero na stronie ([Dodawanie tekstu](07-i18n-mail-env.md#dodawanie-tekstu)).

Uruchom generator, tak jak po każdym dodaniu definicji modułu albo pliku tłumaczeń:

```bash
npm run wa -- generate
```

Wynik to `Bez zmian`, a w plikach rejestru nie ma słowa `notes`. To jest oczekiwane na tym etapie: generator rejestruje tylko feature, które wskazuje wzorzec w manifeście modułu z `.wa/kit.json` ([Wykrywanie feature](02b-rejestr-i-generator.md#wykrywanie-feature)). Wpis w `projectModules` dodasz w kroku 3.

<a id="objaw-braku-wpisu"></a>

### Objaw: feature bez wpisu w `projectModules`

Tak wygląda aplikacja, gdy feature ma pliki, ale nie ma wpisu. Wiersze generatora, menu, strony i Prismy pochodzą z przebiegu (menu i stronę sprawdzono w przeglądarce na koncie superadmina, po chwilowym usunięciu wpisu z gotowego feature). Wiersze komendy i tłumaczeń wynikają z kodu:

| Gdzie | Co widać | Dlaczego |
| --- | --- | --- |
| `npm run wa -- generate` | `Bez zmian`, `notes` nie ma w rejestrze. | Generator czyta tylko wzorce `src/features/<x>/` z manifestów w `.wa/kit.json`. |
| Menu | Brak pozycji „Notatki”. | `getNavEntries` przegląda tylko definicje z rejestru. |
| Strona `/notes` | Strona Next.js „404 This page could not be found.”, także dla admina i superadmina. | `requireModuleAccess("notes")` nie znajduje definicji i woła `notFound()` (kod niżej). Rola globalna daje dostęp tylko do definicji, którą guard znalazł. |
| Komenda `createNoteCommand` | Komunikat „Nie udało się dodać notatki” i wpis `error` w logu. | `notFound()` rzucone w `try` trafia do `handleCommandError` jak każdy nieznany błąd ([Wynik i błędy](06-wzorce-kodu.md#wynik-i-bledy)). |
| Tłumaczenia | Nic: namespace `notes` się nie ładuje, ale strona i pozycja menu, które by go używały, też się nie pokazują. | Teksty ładuje lista `moduleMessages` z rejestru. |
| Prisma, gdy istnieje `prisma/schema/notes.prisma` | Komendy Prismy, które wczytują schemat, na przykład `npx prisma validate`, kończą się błędem ``The relation field `organization` on model `Note` is missing an opposite relation field on the model `Organization`.`` | Pole relacji zwrotnej w `Organization` wpisuje tylko generator, z `schemaRelations` wpisu ([krok 3](#pulapka-relacji)). |

`src/shared/lib/auth/require-module-access.ts`

```ts
export async function requireModuleAccess(
  moduleKey: string,
): Promise<OrgContext> {
  const context = await resolveOrgContext();
  const moduleDef = moduleByKey(moduleKey);
  const allowed =
    moduleDef !== null &&
    canAccessModule(moduleDef, {
      userRole: context.userRole,
      orgRole: context.orgRole,
      multiOrg: env.MULTI_ORG,
    });
  if (!allowed) {
    notFound();
  }
  return context;
}
```

`moduleByKey` z `src/shared/lib/auth/permissions.ts` szuka definicji w `clientModules`. Dla klucza spoza rejestru zwraca `null`, więc `allowed` jest fałszem bez pytania o role.

<a id="krok-3"></a>

## Krok 3. Wpis w `projectModules`

`.wa/kit.json` ma dwie sekcje modułów. `modules` opisuje kod, który projekt dostał z kitu (wersje, hashe plików, aktualizacje). `projectModules` opisuje funkcje napisane w projekcie: wpis ma tylko `manifest`, bez własnej wersji i hashy plików, a `wa generate` czyta go tak samo jak moduły kitu ([D02](decyzje.md#d02)). Moduły projektu trafiają do rejestru po modułach kitu, alfabetycznie, a `wa kit sync` zachowuje je bez zmian.

Dopisz do słownika `projectModules` wpis `notes`. Manifest musi przejść schemat `moduleManifestSchema` z `kit/cli/src/manifest/schema.ts`, a `wa generate` przy odczycie sprawdza jeszcze cztery reguły, inaczej przerwie pracę z komunikatem po polsku ([Referencja manifestu](02b-rejestr-i-generator.md#referencja-manifest)):

- klucz wpisu jest równy `manifest.name`;
- nazwa nie występuje jednocześnie w `modules` i w `projectModules`;
- każdy moduł z `requires` jest w `modules` albo w `projectModules`;
- `files` zawiera wzorzec zaczynający się od `src/features/<nazwa>/`.

`.wa/kit.json`

```json
{
  "kitVersion": "0.0.0",
  "modules": {
// …
  },
  "projectModules": {
    "notes": {
      "manifest": {
        "name": "notes",
        "version": "0.1.0",
        "description": "Funkcja projektu: notatki organizacji",
        "requires": [],
        "files": [
          "src/features/notes/**",
          "src/app/[locale]/(app)/notes/**",
          "prisma/schema/notes.prisma"
        ],
        "dependencies": {},
        "devDependencies": {},
        "env": [],
        "schemaRelations": [
          { "model": "Organization", "field": "notes Note[]" }
        ],
        "compose": null,
        "workspaces": []
      }
    }
  }
}
```

| Pole | Znaczenie we wpisie `notes` |
| --- | --- |
| `files` | Generator czyta z tej listy tylko `src/features/notes/**`. Ten wzorzec rejestruje feature. Pozostałe dwa wzorce są zapisem własności plików, którego nic nie sprawdza. Każdy feature potrzebuje własnego wzorca ([D02](decyzje.md#d02)). |
| `schemaRelations` | Linia `notes Note[]` trafi do regionu `wa:relations` w modelu `Organization`. To jedyny sposób dodania relacji zwrotnej do modelu rdzenia. Generator obsługuje tylko modele `User` i `Organization`; relację z innym modelem pomija bez błędu ([Regiony](02b-rejestr-i-generator.md#regiony)). |
| `env`, `compose` | Puste: feature nie ma własnych zmiennych ani usług Dockera. |
| `name` | Musi być równe kluczowi wpisu. Generator używa go też jako nagłówka bloku modułu w `.env.example`, gdy `env` nie jest puste. |
| `version` | Schemat wymaga niepustego napisu. Przy awansie funkcji do kitu staje się wersją modułu kitu. |
| `requires` | Moduły kitu albo inne moduły projektu, od których zależy funkcja. Brakujący moduł kończy odczyt błędem. |
| `description`, `dependencies`, `devDependencies`, `workspaces` | Generator ich nie czyta. Muszą tylko przejść schemat. |

Literówka w nazwie pola (na przykład `schemaRelation`) nie daje błędu: pole dostaje wartość domyślną i relacja się nie pojawi. Po zapisie uruchom generator:

```bash
npm run wa -- generate
```

Wynik z przebiegu:

```text
zmieniono src/modules.generated.ts
zmieniono src/modules.client.generated.ts
zmieniono prisma/schema/organizations.prisma
```

Rejestr importuje teraz definicję modułu i tłumaczenia `notes` po modułach kitu, a region w modelu `Organization` zawiera relację:

`src/modules.client.generated.ts`

```ts
import notesModule from "@/features/notes/module";
// …
export const clientModules = [accountModule, authModule, dashboardModule, organizationsModule, usersModule, notesModule];
```

`prisma/schema/organizations.prisma`

```prisma
  // wa:relations:start
  notes Note[]
  // wa:relations:end
```

<a id="pulapka-relacji"></a>

**Pułapka: schemat Prisma między krokiem 3 a 4.** Relację zwrotną dodaje tylko `schemaRelations` i generator. Trzy błędy, które pojawiają się po drodze:

- **Wpis przed plikiem schematu** (kolejność z tego tutorialu). Region odwołuje się do modelu `Note`, którego przed krokiem 4 nie ma, więc komendy Prismy, które wczytują schemat (w przebiegu `npx prisma validate`), kończą się błędem `Type "Note" is neither a built-in type, nor refers to another model, composite type, or enum.` (kod `P1012`, `prisma/schema/organizations.prisma:14`). Nie uruchamiaj Prismy, dopóki nie zapiszesz pliku schematu z kroku 4.
- **Plik schematu przed wpisem.** Prisma zgłasza brak relacji zwrotnej i proponuje ``Either run `prisma format` or add it manually.`` Nie rób żadnego z tych dwóch: dodaj `schemaRelations` i uruchom generator.
- **Po `prisma format` albo ręcznym dopisaniu.** `prisma format` dopisuje `notes Note[]` pod linią `// wa:relations:end`, czyli w pliku rdzenia poza regionem. Następny przebieg generatora wstawia tę samą linię w region i schemat kończy się błędem `Field "notes" is already defined on model "Organization".` (sprawdzone na kopii schematu). Usuń linię spoza regionu.

Testy rdzenia nie zmieniają się: porównują rejestr tylko z modułami rdzenia, a spójność całego rejestru (unikalne klucze i adresy, etykiety menu w każdym języku, zgodność menu z `canAccessModule`) sprawdza `src/shared/lib/modules/__tests__/registry-consistency.test.ts`, który obejmuje też `notes` ([krok 8](09b-implementacja-i-bramki.md#testy-rdzenia)).

<a id="krok-4"></a>

## Krok 4. Schemat i migracja

Model `Note` w osobnym pliku schematu, bo moduł nie zmienia plików schematu rdzenia ([D14](decyzje.md#d14)). Wzorzec: model `Invitation` w `prisma/schema/organizations.prisma`.

`prisma/schema/notes.prisma`

```prisma
model Note {
  id             String   @id @default(cuid())
  organizationId String   @map("organization_id")
  title          String
  createdAt      DateTime @default(now()) @map("created_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("notes")
}
```

- **`organizationId` wymagane, z indeksem i relacją do `Organization`.** Tak wyglądają tabele domenowe rdzenia ([D07](decyzje.md#d07), [Model danych rdzenia](03-dane-i-organizacje.md#model-danych)). Każde zapytanie filtruje po tej kolumnie, więc indeks jest potrzebny, a wymagana kolumna nie pozwala zapisać notatki bez organizacji. Pilnuje tego tylko przegląd kodu.
- **`onDelete: Cascade`.** Usunięcie organizacji usuwa jej notatki. Klucz obcy do `organizations` sprawia też, że `resetDatabase()` w testach integracyjnych czyści tabelę `notes`: `TRUNCATE … CASCADE` czyści każdą tabelę z kluczem obcym do czyszczonych tabel, niezależnie od `onDelete` ([krok 8](09b-implementacja-i-bramki.md#krok-8-integracja)).
- **`@map` i `@@map`.** Kolumny i tabela mają nazwy w `snake_case`, tak jak w rdzeniu.

Utwórz migrację i klienta Prismy:

```bash
npx prisma migrate dev --name add-notes
npm run db:generate
```

`migrate dev` wypisuje linię `Datasource "db": …`, w której sprawdzasz bazę i port, a potem:

```text
Applying migration `20261028044413_add_notes`

The following migration(s) have been created and applied from new schema changes:

prisma/migrations/
  └─ 20261028044413_add_notes/
    └─ migration.sql

Your database is now in sync with your schema.
```

Znacznik czasu w nazwie katalogu będzie u Ciebie inny. Treść migracji z przebiegu:

`prisma/migrations/20261028044413_add_notes/migration.sql`

```sql
-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notes_organization_id_idx" ON "notes"("organization_id");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**Pułapka: klient Prismy.** W Prisma 7.10.1 `migrate dev` nie generuje klienta. Bez `npm run db:generate` TypeScript nie zna modelu: `npx tsc --noEmit` zgłasza `error TS2339: Property 'note' does not exist on type 'PrismaClient'.` ([Schemat i klient Prismy](03b-schemat-i-migracje.md#schemat)).

Katalog migracji commitujesz razem z feature, bo produkcja stosuje tylko migracje z repozytorium ([Migracje w projekcie klienta](03b-schemat-i-migracje.md#migracje-w-projekcie)).

<a id="krok-5"></a>

## Krok 5. Kontrakty

Kontrakty to schemat wejścia i typ wyniku. Powstają przed testami, bo testy i kod korzystają z nich tak samo, a formularz w przeglądarce i komenda na serwerze sprawdzają jeden schemat ([Kontrakty](06-wzorce-kodu.md#kontrakty)). Wzorce: `src/features/users/contracts/user-account.schemas.ts` i `user-account.types.ts`.

`src/features/notes/contracts/note.schemas.ts`

```ts
import { z } from "zod";

export const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export type CreateNoteValues = z.infer<typeof createNoteSchema>;
```

`src/features/notes/contracts/note.types.ts`

```ts
export interface NoteListItem {
  id: string;
  title: string;
  createdAt: Date;
}
```

`trim` sprawia, że tytuł z samych spacji jest pusty i nie przejdzie `min(1)`. `z.object` usuwa pola spoza schematu, więc `organizationId` wysłane z przeglądarki przychodzi do komendy w `input`, ale nie trafia do `parsed.data`. Przed zapisem do cudzej organizacji chroni jednak nie schemat, tylko `organizationId` z kontekstu w komendzie (krok 7). Komunikaty walidacji to domyślne teksty Zod po angielsku, na przykład `Too small: expected string to have >=1 characters` dla pustego tytułu i `Too big: expected string to have <=200 characters` dla 201 znaków. Formularz pokazuje własny tekst z tłumaczeń, a komunikat z serwera widać tylko przy żądaniu z pominięciem formularza.

<a id="krok-6"></a>

## Krok 6. Testy przed kodem

`CLAUDE.md` wymaga, żeby testy zadania napisał inny agent (`test-writer`) niż kod i żeby powstały przed implementacją. Test pisany po kodzie przez autora kodu zwykle odtwarza jego założenia i przechodzi ([Dlaczego](08b-testy-adwersarialne.md#dlaczego), [D25](decyzje.md#d25)). Przebieg zadania z rolami opisuje [08b-testy-adwersarialne.md](08b-testy-adwersarialne.md#przebieg): `test-writer` pisze testy, implementer kod, a `test-reviewer` sprawdza testy mutacjami. W przebiegu tutorialu testy i kod napisał ten sam autor, bez agentów `test-writer` i `test-reviewer`. Zachował tylko kolejność: testy powstały przed kodem, na podstawie planu i kontraktów. W zadaniu projektu role są rozdzielone tak, jak opisuje 08b.

### Plan: zachowania i mutacje

W procesie z agentami `test-writer` dostaje plan, a nie kod. Plan komendy z przebiegu:

| Zachowanie (wejście → oczekiwany wynik) | Mutacja, którą test ma zabić |
| --- | --- |
| member organizacji `org-1`, `{ title: "Spotkanie z klientem" }` → `{ success: true, data: { noteId: "note-1" } }`, zapis `{ organizationId: "org-1", title: "Spotkanie z klientem" }` | zły klucz w `requireModuleAccess`, brak zapisu |
| `{ title: "Plan", organizationId: "org-2" }` → zapis z `organizationId: "org-1"` | `organizationId` z wejścia zamiast z kontekstu |
| `"  Plan sprintu  "` → zapis `"Plan sprintu"` | brak `trim` |
| tytuł pusty, ze spacji, z 201 znaków, brak tytułu, liczba, `null` → `success: false`, brak zapisu | brak walidacji, zły limit |
| brak sesji, brak aktywnej organizacji → przekierowanie, brak zapisu | Prisma przed guardem |
| tryb serwisowy bez potwierdzenia albo z potwierdzeniem innej organizacji → „Potwierdź zmianę w trybie serwisowym”, brak zapisu | usunięcie `assertServiceModeConfirmed` |
| błąd bazy → „Nie udało się dodać notatki” | błąd techniczny w komunikacie |
| sukces → `revalidatePath("/notes")`; błąd → bez odświeżenia | brak odświeżenia |

Test izolacji ma własne zachowania: lista organizacji A nie zawiera notatek B, komenda z kontekstem A zapisuje w A, `organizationId` B w wejściu nie przenosi notatki, użytkownik A z aktywną organizacją B dostaje przekierowanie i nic nie zapisuje.

### Czerwony przebieg z właściwego powodu

Testy przed implementacją mają być czerwone przez brak eksportu albo złą wartość, a nie przez błąd importu. Gdy pliku komendy nie ma, Vitest kończy się błędem importu, który nie mówi nic o zachowaniu:

```text
Error: Failed to resolve import "../create-note-command" from "src/features/notes/services/commands/__tests__/create-note-command.test.ts". Does the file exist?
```

Dlatego przed testami powstają puste pliki komendy i query. Komenda: pierwsza linia `"use server";` i `export {};`. Query: `import "server-only";` i `export {};`. Kto je zakłada, definicje agentów nie mówią. W przebiegu powstały razem z planem zadania, przed testami. Wtedy wszystkie testy padają z właściwego powodu, na przykład `TypeError: createNoteCommand is not a function` (jednostkowe: 20 z 20, integracyjne: 7 z 7, w tym `TypeError: listNotesQuery is not a function`).

Gdy pracujesz z agentami, przed implementacją zapisz `implement` do `.superpowers/phase` w tej samej kopii roboczej, w której pracuje implementer, żeby hook zablokował mu edycję testów ([Faza implementacji](08b-testy-adwersarialne.md#faza)). Po implementacji orkiestrator usuwa ten plik. Bez tego nikt nie zmieni przez `Edit` i `Write` testów rdzenia z kroku 8, bo leżą w katalogach `__tests__/`.

### Test jednostkowy komendy

Wzorzec: `src/features/users/services/commands/__tests__/invite-user-command.test.ts`. Mockowane jest tylko wejście i wyjście: Prisma, kontekst sesji (`getOrgContext`), konfiguracja (`env`), logger, język oraz `notFound`, `redirect` i `revalidatePath` z Next.js. Prawdziwe zostają `requireModuleAccess`, rejestr modułów, `assertServiceModeConfirmed` i `handleCommandError`, czyli reguły, które test sprawdza ([Zasady pisania testów](08b-testy-adwersarialne.md#zasady)).

`src/features/notes/services/commands/__tests__/create-note-command.test.ts`

```ts
const { mockPrisma, mockGetOrgContext, mockLogger, NoOrganizationError } =
  vi.hoisted(() => ({
    mockPrisma: { note: { create: vi.fn() } },
    mockGetOrgContext: vi.fn(),
    mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    NoOrganizationError: class NoOrganizationError extends Error {},
  }));

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/shared/lib/auth/org-context", () => ({
  NoOrganizationError,
  getOrgContext: () => mockGetOrgContext(),
}));
vi.mock("@/shared/lib/env", () => ({ env: { MULTI_ORG: false } }));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "pl" }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  },
}));
vi.mock("@/i18n/routing", () => ({
  redirect: ({ href }: { href: string }) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;replace;${href};307;`,
    });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
```

- **`env` jako mock.** `requireModuleAccess` czyta `env.MULTI_ORG`, a `env` przy pierwszym odczycie sprawdza wszystkie zmienne rdzenia. Job `verify` w CI nie ma pliku `.env` ani tych zmiennych, więc prawdziwy `env` zgłosiłby tam błąd walidacji, chociaż lokalnie, z `.env`, test przechodzi (wniosek z `src/shared/lib/env.ts` i `.github/workflows/ci.yml`).
- **Błędy z `digest`.** `handleCommandError` rozpoznaje przekierowanie po polu `digest` zaczynającym się od `NEXT_REDIRECT`, tak jak w Next.js. Atrapa bez `digest` zrobiłaby z przekierowania komunikat domyślny i test sprawdzałby zachowanie, którego w aplikacji nie ma.

Dwa testy z pliku. Oczekiwane wartości są literałami:

`src/features/notes/services/commands/__tests__/create-note-command.test.ts`

```ts
  it("organizationId z wejścia jest ignorowane, zapis idzie do organizacji z kontekstu", async () => {
    await createNoteCommand({ title: "Plan", organizationId: "org-2" });

    expect(createdData()).toEqual({ organizationId: "org-1", title: "Plan" });
  });
// …
  describe("tryb serwisowy", () => {
    beforeEach(() => {
      mockGetOrgContext.mockResolvedValue(SERVICE_CONTEXT);
    });

    it("bez potwierdzenia → błąd trybu serwisowego i brak zapisu", async () => {
      const result = await createNoteCommand({ title: "Plan" });

      expect(result).toEqual(SERVICE_MODE_ERROR);
      expectNoWrite();
    });
```

`createdData()` zwraca pole `data` pierwszego wywołania `prisma.note.create`, a `expectNoWrite()` sprawdza, że nie było zapisu ani `revalidatePath`. `SERVICE_CONTEXT` to kontekst superadmina z `serviceMode: true`, a `SERVICE_MODE_ERROR` literał `{ success: false, error: "Potwierdź zmianę w trybie serwisowym" }`.

### Test izolacji na prawdziwej bazie

Wzorzec i opis budowy: [Test izolacji organizacji](08-testy.md#izolacja). Atrapy sesji, pięć wywołań `vi.mock` i `signInAs` są kopią z `src/features/organizations/services/__tests__/organization-isolation.integration.test.ts`, z dwiema zmianami:

`src/features/notes/services/__tests__/notes-isolation.integration.test.ts`

```ts
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(({ href }: { href: string }) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;replace;${href};307;`,
    });
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(readMockedSession) } },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
```

1. **`redirect` z `digest`.** Atrapa w teście rdzenia rzuca `new Error("NEXT_REDIRECT")` bez `digest`. Test rdzenia to wystarcza, bo żadna jego komenda nie przechodzi przez `handleCommandError` z przekierowaniem. Komenda z `requireModuleAccess` zamieniłaby taki błąd na komunikat domyślny.
2. **`next/cache` jako mock.** Bez niego `revalidatePath` poza żądaniem Next.js rzuca `Error: Invariant: static generation store missing in revalidatePath /notes`. Komenda łapie ten błąd po zapisie, więc rekord jest w bazie, a wynik to `{ success: false, error: "Nie udało się dodać notatki" }`. W przebiegu dwa testy komendy były przez to czerwone, a test, który sprawdzał tylko zawartość bazy, przeszedł. Dlatego testy komendy sprawdzają też jej wynik.

Dane obu organizacji powstają w `beforeEach` z literałów:

`src/features/notes/services/__tests__/notes-isolation.integration.test.ts`

```ts
  await resetDatabase();
  currentSession.value = null;
  const alice = await createUser({ email: "alice@a.example" });
  const bob = await createUser({ email: "bob@b.example" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [{ userId: alice.id, role: "owner" }],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [{ userId: bob.id, role: "member" }],
  });
  await prisma.note.create({
    data: {
      organizationId: orgA.id,
      title: "A: pierwsza",
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    },
  });
// …
  world = { alice, bob, orgA, orgB };
```

Test zapisu porównuje zawartość obu organizacji z literałami. `titlesIn(organizacja)` czyta tytuły notatek organizacji prosto przez `prisma`, posortowane alfabetycznie:

`src/features/notes/services/__tests__/notes-isolation.integration.test.ts`

```ts
  it("organizationId organizacji B w wejściu → notatka i tak trafia do A", async () => {
    await signInAs(world.alice, world.orgA);

    const result = await createNoteCommand({
      title: "A: przemycona",
      organizationId: world.orgB.id,
    });

    expect(result.success).toBe(true);
    await expect(titlesIn(world.orgB)).resolves.toEqual(["B: jedyna"]);
    await expect(titlesIn(world.orgA)).resolves.toEqual([
      "A: druga",
      "A: pierwsza",
      "A: przemycona",
    ]);
  });
```

<a id="uruchomienie-testow"></a>

### Uruchomienie testów

Test jednostkowy uruchamia Vitest z konfiguracją jednostkową. Test izolacji wymaga komendy integracyjnej i adresu bazy z nazwą zakończoną na `_test`, bo `npx vitest run` pomija pliki `*.integration.test.ts` ([Testy integracyjne](08-testy.md#integracyjne)). Komenda integracyjna czyści tę bazę, a sprawdza tylko jej nazwę, nie serwer ani port, więc przed pierwszym uruchomieniem przeczytaj [Komendy, które czyszczą albo przebudowują bazę](08-testy.md#baza). W przebiegu baza działała na porcie 5439:

```bash
npx vitest run src/features/notes/services/commands/__tests__/create-note-command.test.ts
INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5439/wa_app_tutorial_test npm run test:integration -- src/features/notes/services/__tests__/notes-isolation.integration.test.ts
```

Bez `INTEGRATION_DATABASE_URL` komenda integracyjna łączy się z `postgresql://postgres:postgres@localhost:5432/wa_app_test`, więc przy bazie w kontenerze na porcie 5432 wystarczy `npm run test:integration -- src/features/notes/services/__tests__/notes-isolation.integration.test.ts`. Zmienną ustawiasz w powłoce, bo wpis w `.env` nie działa ([Uruchomienie](08-testy.md#integracyjne)).

Przed implementacją oba przebiegi są czerwone z powodu `TypeError: … is not a function`. Komenda integracyjna wypisuje na początku linię `Datasource "db": PostgreSQL database "<baza>", schema "public" at "<host>:<port>"` (w przebiegu `wa_app_tutorial_test` i `localhost:5439`): sprawdź w niej nazwę bazy i port. Bazę testową zakłada `globalSetup`, gdy jej nie ma.

<a id="dalej"></a>

## Dalej

Kroki 7–9 opisuje [09b-implementacja-i-bramki.md](09b-implementacja-i-bramki.md): query, komenda, komponent i strona, po których testy z kroku 6 są zielone, potem `npm run verify` (testy rdzenia się nie zmieniają, rejestr pilnuje `registry-consistency.test.ts`), testy integracyjne, Stryker, sprawdzenie w przeglądarce i commit. Na końcu tamtego pliku jest how-to „Nowa funkcja w istniejącym module” i tabela komunikatów z całego przebiegu.

