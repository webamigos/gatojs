# wa-kit — dokumentacja frameworka

Data: 2026-10-27 · Status: spis treści zaakceptowany przez Jakuba w rozmowie (2026-10-27), dokument do przeglądu

## 1. Po co

Wiedza o wa-kit jest dziś rozproszona. `AGENTS.md` i `CLAUDE.md` zawierają zwięzłe reguły dla agentów, `README.md` opisuje start, a powody decyzji są w specu, planach, notatkach i handoffach. Część z nich leży w `.superpowers/` (gitignore), więc nie ma ich w repo. Dobry przykład: design doc linkuje do `.superpowers/system-admin/spec.md`, a ten link w repo prowadzi donikąd.

Deweloper Web Amigos, który siada do projektu na wa-kit, ma znaleźć w jednym miejscu:

- jak uruchomić projekt;
- z czego składa się framework i jak działa każda część;
- jak go używać na co dzień (nowa funkcja, nowy moduł, testy, wdrożenie);
- dlaczego jest zbudowany właśnie tak.

## 2. Odbiorca

Deweloper Web Amigos pracujący na wa-kit (decyzja Jakuba). Zna Next.js, TypeScript i Prismę. Nie zna better-auth w szczegółach, nie zna decyzji podjętych w planach 1 i superadmin ani procesu testów adwersarialnych.

Agenci AI korzystają z tej samej dokumentacji przez link z `AGENTS.md`, ale nie są głównym odbiorcą.

## 3. Cele, non-goals, anty-cele

**Cele**

- Dokumentacja opisuje stan kodu na gałęzi `refactor/app-url` po commicie `4a6ffcb` (koniec planu superadmina).
- Każde twierdzenie o zachowaniu kodu jest sprawdzone w kodzie i wskazuje plik źródłowy.
- Każda decyzja, która obowiązuje w kodzie, ma w rejestrze kontekst, alternatywy i źródło.
- Tutorial „nowy moduł” jest przejściem, które naprawdę wykonano na roboczej kopii i które działa.

**Non-goals**

- Funkcje zaplanowane, ale niezrobione (decyzja Jakuba: tylko to, co działa dziś):
  - `wa create`, `wa add`, `wa remove`, `wa list`, `wa update`, `wa diff`;
  - `kit/modules/*.json` i przeniesienie CLI do `kit/cli` (plan 2);
  - moduły `api-keys`, `audit-logs`, `uploads`, `worker`, `legal` (plan 3).
  Dokumentacja rośnie razem z kolejnymi planami.
- Dokumentacja w projektach klientów. Leży tylko w repo kitu (decyzja Jakuba); plan 2 traktuje `docs/` jako katalog tylko dla kitu.
- Strona internetowa z dokumentacją, wersja angielska, dokumentacja dla klienta końcowego.
- Automatyczna kontrola zgodności dokumentacji z kodem w CI (np. job z lychee). Decyzja Jakuba: osobny temat po dokumentacji, przy pisaniu wystarczy jednorazowy skrypt.
- `CHANGELOG.md`, notatki z aktualizacji, dokumentacja przypięta do wersji kitu. Będą potrzebne razem z `wa update` (plany 2 i 4).
- Zmiany w treści `AGENTS.md` poza jedną linią odnośnika (decyzja Jakuba: długie listy zostają w `AGENTS.md`).
- Poprawianie kodu. Rozbieżności znalezione przy pisaniu trafiają na listę dla Jakuba (sekcja 7), a dokumentacja opisuje to, co robi kod.

**Anty-cele (porażka, nawet jeśli dokumenty powstaną)**

- Dokumentacja opisuje to, co mówi spec albo plan, a nie to, co robi kod.
- Dokumentacja przepisuje `AGENTS.md` słowo w słowo. Wtedy przy każdej zmianie reguł trzeba poprawiać dwa miejsca i jedno zostanie stare.
- Opisane są funkcje, których nie ma (np. `wa add` jako gotowa komenda).
- Linki do plików, których nie ma w repo (`.superpowers/`, niezacommitowane notatki).
- Przykłady kodu wymyślone na potrzeby dokumentu zamiast wziętych z repo.

## 4. Ograniczenia

- Język: polski, pełne zdania, rzeczowo. Identyfikatory, komendy i ścieżki bez zmian.
- Format: Markdown renderowany przez GitHub. Diagramy w blokach `mermaid`.
- Miejsce: `docs/` w repo kitu, obok `docs/superpowers/` (który zostaje na specy, plany i notatki procesu).
- Linki tylko do plików śledzonych przez git. Treść z `.superpowers/` i z niezacommitowanych notatek trafia do dokumentacji jako streszczenie, nie jako link. Wyjątek: jeśli Jakub zacommituje notatki przed końcem pracy, można do nich linkować.
- Źródła prawdy, w tej kolejności: kod (`src/`, `packages/`, `scripts/`, `prisma/`, `e2e/`, konfiguracja w root) → testy → `AGENTS.md`/`CLAUDE.md` → spec i plany → notatki i handoffy. Gdy wyższe źródło przeczy niższemu, dokumentacja idzie za wyższym, a rozbieżność trafia na listę z sekcji 7.
- Odnośniki do kodu: ścieżka pliku i nazwa symbolu (`src/shared/lib/auth/org-context.ts`, `getOrgContext`). Bez numerów linii, bo szybko się dezaktualizują.
- Każdy plik 01–11 zaczyna się od tego samego nagłówka (wzór: Rails Guides i rozdz. 10 „Software Engineering at Google”):
  - „Po przeczytaniu będziesz wiedzieć:” i 3–6 punktów;
  - „Zweryfikowano z kodem: `<commit>`, `<data>`”;
  - „Źródła:” z listą ścieżek opisywanego kodu.
  Wtedy `git log <commit>..HEAD -- <źródła>` pokazuje, który plik trzeba sprawdzić ponownie.
- Język ponadczasowy (Google developer style: timeless documentation). W plikach 01–11 nie ma słów „dziś”, „obecnie”, „na razie”, „jeszcze nie”, „wkrótce” ani zapowiedzi funkcji. Datę i stan niesie nagłówek. Plany pojawiają się tylko w `README.md` (sekcja o tym, co dokumentacja pomija) i w `znane-ograniczenia.md`.
- Pliki mieszające typy treści (Diátaxis) kończą się sekcją „Referencja” z materiałem do wyszukiwania: tabele, listy pól, macierze. Tak jest w 02, 03, 04, 07 i 08. Tekst nad nią wyjaśnia.
- Bez zmian w kodzie. Wyjątki są dwa:
  - jedna linia w `AGENTS.md` z linkiem do `docs/README.md`;
  - naprawa martwego linku w `docs/superpowers/specs/2026-10-26-wa-kit-design.md` §3.1. Ten plik ma niezacommitowaną zmianę z innej sesji, więc poprawka dotyka tylko tego linku.
- Commit tylko na wyraźną prośbę Jakuba. Bez pusha.

## 5. Struktura i zakres plików

Spis treści zaakceptowany przez Jakuba. Kolejność plików to kolejność czytania dla nowej osoby.

### `docs/README.md` — indeks

- Dla kogo jest dokumentacja i jakiego stanu kodu dotyczy (gałąź, commit).
- Spis plików z jednym zdaniem o każdym. Ścieżki czytania: „pierwszy dzień” (01 → 02 → 05) i „piszę moduł” (02 → 03 → 04 → 06 → 09 → 08).
- Słownik pojęć: kit, rdzeń, moduł, feature, rejestr modułów, plik generowany, region `wa:*`, organizacja, aktywna organizacja, rola globalna, rola w organizacji, superadmin, tryb serwisowy, impersonacja, komenda, query, `OperationResult`, mutant, bramka mutacji.
- Co dokumentacja świadomie pomija (funkcje z planów 2–4), z linkiem do planów w `docs/superpowers/plans/`.

### `docs/01-uruchomienie.md`

- Wymagania: Node z `.nvmrc`, npm, Docker. Uwaga o npm 10.9 i instalacji przez npm 11, jeśli nadal aktualna (sprawdzić).
- Kolejne kroki: `npm install`, `docker compose up -d`, `.env` z `.env.example`, `npx prisma migrate dev --name init`, `npm run admin:create`, `npm run dev`.
- Usługi z `docker-compose.yml` (Postgres, mailpit) i ich porty, zmienne `DB_PORT`, `MAILPIT_UI_PORT`, `MAILPIT_SMTP_PORT`.
- Logowanie pierwszy raz, gdzie czytać maile (mailpit).
- Tryby uruchomienia: `MULTI_ORG`, `AUTH_PUBLIC_SIGNUP`, `ADMIN_IMPERSONATION`. Co widać w UI w każdym trybie.
- Typowe problemy: zajęty port, za krótki `BETTER_AUTH_SECRET`, brak wygenerowanego klienta Prisma (`postinstall`), błędy walidacji env.

### `docs/02-architektura.md`

- „Zasady kitu”: kilka zdań o tym, na czym kit się opiera. Kolejność priorytetów linkowana do `AGENTS.md`, nie kopiowana. Zasady linkują do wpisów w `decyzje.md`.
- Kit jako aplikacja referencyjna: rdzeń plus moduły, kod kopiowany do projektu, a nie paczka npm. Krótko, z linkiem do `decyzje.md`.
- Diagram kontenerów (poziom 2 modelu C4, jako zwykły `flowchart` mermaid): aplikacja Next.js, Postgres, mailpit albo Resend, eksport OTLP, Railway.
- Mapa katalogów repo: `src/app`, `src/features`, `src/shared`, `src/components/ui`, `src/i18n`, `prisma/schema`, `scripts`, `e2e`, `packages/cli`, `.wa`, `.claude`, `.github/workflows`, `docs`.
- Anatomia feature: `module.ts`, `components/`, `contracts/`, `services/commands`, `services/queries`, `i18n/`, opcjonalne `env.ts`, `auth.ts`, `auth-client.ts`, `__tests__/`.
- Droga żądania (diagram): `src/proxy.ts` → layout `(app)` → `requireModuleAccess` → strona → akcja serwerowa → `getOrgContext` / `assertServiceModeConfirmed` → Prisma. Każdy krok sprawdzony w kodzie.
- `defineModule`: wszystkie pola `ModuleDef` z `src/shared/lib/modules/define-module.ts` i to, jak czytają je nawigacja i guardy.
- `.wa/kit.json`: format (schemat z `packages/cli/src/manifest/schema.ts`), znaczenie pól i stan dzisiejszy (tylko `core`).
- CLI dzisiaj: jedyna komenda to `wa generate`. Co generuje (`src/modules.generated.ts`, `src/modules.client.generated.ts`, regiony), jak wykrywa feature (glob `src/features/<x>/` w `files` manifestu plus obecność plików), idempotencja, kontrola diffu w CI, wpisy w `.prettierignore` i eslint ignores.
- Regiony `wa:*:start/end`: lista miejsc i co do nich trafia.

### `docs/03-dane-i-organizacje.md`

- Schemat Prisma w wielu plikach (`prisma/schema/*.prisma`), klient generowany do `src/generated/prisma`, adapter pg, `src/shared/lib/prisma.ts`.
- Modele rdzenia i relacje (diagram ER z `auth.prisma` i `organizations.prisma`).
- `getOrgContext()`: co zwraca, skąd bierze dane (sesja, świeże dane czy cache), kiedy rzuca `NoOrganizationError`, zachowanie dla superadmina bez członkostwa.
- Reguła filtra `organizationId`: brak automatycznego filtrowania, przykład z istniejącej query.
- `MULTI_ORG=false` i `true`: co się zmienia w przepływach (rejestracja, zaproszenia, przełącznik, tworzenie organizacji, etykieta „Członkowie”), a co zostaje takie samo (model danych).
- Aktywna organizacja: ustawianie po zalogowaniu, przełączanie, strona `no-organization`.
- Izolacja organizacji: jak jest testowana (testy integracyjne).
- Migracje: dlaczego kit nie commituje `prisma/migrations` i co zrobić w projekcie.

### `docs/04-auth-i-role.md`

- Konfiguracja better-auth (`src/shared/lib/auth/index.ts`): pluginy `admin` i `organization`, hooki `before`/`after`, sesja i cookie cache, klient (`client.ts`).
- Przepływy: logowanie, rejestracja z bramką (`AUTH_PUBLIC_SIGNUP`, `invitationId`, `signup-gate`, `signup-policy`, `signup-membership`), zaproszenie, `set-password` i mail powitalny, reset hasła, zmiana hasła.
- Role globalne `user | admin | superadmin` i role w organizacji `owner | admin | member`: `roles.ts`, `permissions.ts` (`createAccessControl`), dwa czytniki roli (`toUserRole`, `roleFromStored`).
- Macierz dostępu moduł × rola × `MULTI_ORG`: przepisana z literału w `access-matrix.test.ts`, nie ze specu.
- Guardy: `requireModuleAccess`, `canAccessPath`, `admin-guard`, `single-org-guard`, `getAdminUserOrNull`. Dla każdego: gdzie działa i co chroni.
- Superadmin: kim jest, co może więcej niż `admin`, ochrona kont serwisowych (`ADMIN_TARGET_PATHS`, hook `before` na `/admin/*`), etykieta „Serwis (Web Amigos)”.
- Impersonacja: kto pod kogo może się podszyć (tabela), `ADMIN_IMPERSONATION`, baner impersonacji.
- Tryb serwisowy: wejście superadmina do organizacji (`enterOrganizationCommand`, przełącznik), `serviceMode` w kontekście, pasek, kontrakt `assertServiceModeConfirmed` i `useServiceModeAction().run` (diagram sekwencji), przypadek nieaktualnej karty po przełączeniu organizacji.
- `admin:create`: wszystkie opcje, idempotencja, brak obniżania roli, zmienne `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- Treść specu `.superpowers/system-admin/spec.md`, zweryfikowana z kodem, trafia tutaj i do `decyzje.md`.

### `docs/05-moduly-rdzenia.md`

Jedna sekcja na feature: `auth`, `organizations`, `users`, `account`, `dashboard`. W każdej:

- `module.ts`: klucz, pozycje nawigacji, `routePrefixes`, role, `adminOnly`, `multiOrgRoles`, `public` (tylko pola faktycznie ustawione);
- trasy w `src/app/[locale]/...` i co na nich jest;
- komponenty, komendy i queries z jednym zdaniem o każdej;
- kto ma dostęp (odnośnik do macierzy w 04);
- namespace i18n.

Na końcu wspólne części `src/shared`: `app-sidebar`, `service-mode/*`, `config/project.ts`, `constants`, `types`, `utils`, `components/ui` (shadcn na base-ui).

### `docs/06-wzorce-kodu.md`

- Komenda: `"use server"`, sygnatura `(input, confirmation?)`, kolejność walidacja → kontekst → assert trybu serwisowego → serwis/Prisma, `OperationResult<T>`, `handleCommandError()`. Jedna prawdziwa komenda z repo jako przykład.
- Query: guard sesji przed Prismą, filtr `organizationId`.
- Kontrakty: Zod w `contracts/*.schemas.ts`, typy w `*.types.ts`.
- UI: wołanie komend przez `useServiceModeAction().run`, renderowanie `dialog`, obsługa `null` po „Anuluj”, formularze (react-hook-form, jeśli używane — sprawdzić).
- Reguły stylu z `AGENTS.md` z uzasadnieniem: bez komentarzy (i hook, który to wymusza), `// WHY:`, bez zagnieżdżonych ternary, bez cichych `catch`, bez `any`, logika poza komponentami i `page.tsx`.
- Test architektury `server-entrypoints-guard.test.ts`: co wymusza, jak dodać wyjątek, świadome ograniczenia (streszczone; pełna lista zostaje w `AGENTS.md`, link).

### `docs/07-i18n-mail-env.md`

- i18n: `src/i18n/{config,routing,request,merge-messages}.ts`, `localePrefix: "as-needed"`, wspólne komunikaty w `src/app/messages`, namespace modułu, dodawanie tekstu i języka.
- Mail: `src/shared/lib/mailer.ts`, kolejność SMTP → Resend → log, wymogi produkcji, szablony react-email w `src/app/emails`, podgląd w mailpit.
- Env: `src/shared/lib/env.ts`, pełna tabela zmiennych (z kodu, nie z README), reguły parsowania flag, schematy env modułów (`moduleEnvSchemas`), region w `.env.example`.
- Logger i OpenTelemetry: `logger.ts`, `instrumentation.ts`, `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT`.
- `security-headers.ts`, `/api/healthcheck`.

### `docs/08-testy.md`

- Rodzaje testów i komendy: unit/komponentowe (Vitest + Testing Library), integracyjne (`*.integration.test.ts`, baza `_test`, `src/test/integration/`), e2e (Playwright, dwa projekty i serwery, `globalSetup`, mailpit), testy CLI, testy hooków.
- Test izolacji organizacji: wymóg i wzór z istniejącego testu.
- System testów adwersarialnych: dlaczego (streszczenie researchu), role `test-writer` i `test-reviewer` (`.claude/agents/`), plik `.superpowers/phase` i hook `protect-tests.mjs`, sekcje planu „Zachowania” i „Mutacje do zabicia”, zasady (literały, testy negatywne, mockowanie tylko I/O, `test.prop`).
- Stryker: konfiguracje unit i integracyjna, `test:mutation:task`, tryb incremental, raporty, próg `thresholds.break`, job CI.
- Bramka mutacji: `mutation-gate.json` (`critical`, `allowed`), `scripts/mutation-gate.ts`, kto dopisuje wpisy, nieaktualny wpis.
- Praktyczne uwagi: czas przebiegów, nie uruchamiać dwóch Strykerów naraz (sprawdzić w konfiguracji).

### `docs/09-nowy-modul.md` — tutorial

- Tutorial uczy dodawania **funkcji domenowej projektu klienta** jako nowego feature (decyzja Jakuba). Nie uczy pisania modułu kitu.
- Przykładowy feature z jedną tabelą domenową, stroną, komendą i query. Nazwę i domenę wybiera wykonawca, byle neutralną.
- Dziś `wa generate` rejestruje feature tylko wtedy, gdy glob `src/features/<x>/**` jest w `files` jakiegoś modułu w `.wa/kit.json`. Rejestracja daje nawigację, `requireModuleAccess` i tłumaczenia. Relacje zwrotne w modelach rdzenia trafiają do regionów tylko przez `schemaRelations` manifestu. Tutorial opisuje więc wpis feature w `.wa/kit.json` jako osobny moduł pod własną nazwą.
- Przy tym kroku jest wyraźne ostrzeżenie: `.wa/kit.json` z założenia opisuje kod pochodzący z kitu, więc wpis funkcji klienta jest obejściem. Szczegóły i plany zmian tego pliku są w `znane-ograniczenia.md` (zgodnie z regułą języka ponadczasowego, nie w tutorialu).
- Tutorial pisany jest z perspektywy projektu klienta. Różnice względem repo kitu wymienia jawnie, np. migracje: projekt je commituje, a kit ignoruje `prisma/migrations/`.
- Kroki:
  1. katalog feature;
  2. `module.ts`;
  3. i18n;
  4. plik `prisma/schema/<x>.prisma` z `organizationId` i indeksem;
  5. relacje zwrotne (dziś ręcznie albo przez region; sprawdzić, co obsługuje `generate`);
  6. wpis modułu w `.wa/kit.json`;
  7. `npm run build -w @wa-kit/cli && npm run wa -- generate`;
  8. migracja;
  9. strona z `requireModuleAccess`;
  10. query i komenda zgodne z kontraktem;
  11. komponent z `useServiceModeAction`;
  12. testy (w tym izolacji, przez proces test-writer);
  13. `npm run verify`.
- Wymóg: wykonawca przechodzi tutorial naprawdę na roboczej kopii (osobny worktree albo gałąź robocza), aż `npm run verify` przejdzie. Potem kopię usuwa. Dokument opisuje to, co zadziałało, łącznie z pułapkami.
- Kod w tutorialu to wyjątek od reguły „przykłady tylko z istniejących plików”. Pochodzi z tego przebiegu i przeszedł `npm run verify`. Każdy fragment wskazuje istniejący wzorzec, na którym się opiera (np. `src/features/users/services/commands/invite-user-command.ts`). Skrypt ścieżek z §6 pomija ścieżki plików tworzonych w tutorialu.
- Osobna krótka sekcja: „nowa funkcja w istniejącym module” (bez `.wa/kit.json`). To how-to, nie tutorial, więc ma osobny nagłówek pod tutorialem.

### `docs/10-wdrozenie.md`

- Obraz Docker (`Dockerfile`, `output: standalone`), `railway.toml` (build, `preDeployCommand`, healthcheck, restart).
- Railway krok po kroku, zmienne produkcyjne, `prisma migrate deploy` i commitowanie migracji w projekcie, `admin:create` przez `railway run` z publicznym URL bazy.
- Przekazanie aplikacji klientowi: konta superadmin i admin, odcięcie dostępu Web Amigos po okresie wsparcia.
- CI: każdy workflow z `.github/workflows/` w jednym zdaniu (co uruchamia, kiedy).

### `docs/11-praca-z-kitem.md`

- Zmiany lokalne a poprawki do kitu: co zgłaszać do `webamigos/wa-kit` i jak (PR), bez obietnic `wa update`.
- Commity: Conventional Commits, temat małymi literami, husky, lint-staged, commitlint, `npm run verify` jako bramka.
- Praca z agentami AI: `CLAUDE.md`/`AGENTS.md` (po co dwa pliki), hooki w `.claude/hooks/`, agenci w `.claude/agents/`, `.claude/settings.json`.
- Proces superpowers w tym repo: spec → plan → SDD, gdzie leżą `docs/superpowers/{specs,plans,notes}`, `.superpowers/` jako lokalny warsztat (gitignore).
- Pliki generowane: czego nie edytować ręcznie i co zrobić po zmianie.

### `docs/decyzje.md` — rejestr decyzji

- Format wpisu (Nygard/MADR w jednym pliku):
  - stałe ID `D01`, `D02`… w nagłówku; numerów nie używa się ponownie;
  - tytuł, status (`obowiązuje` albo `zastąpiona przez Dxx`), data, kto zdecydował;
  - kontekst, decyzja, odrzucone alternatywy, konsekwencje;
  - **jak egzekwowana**: test, hook, CI, guard w kodzie albo „tylko konwencja” (pole „Confirmation” z MADR);
  - źródło (plik lub commit).
- Zastąpione decyzje zostają w pliku ze statusem. Inne pliki linkują do wpisów przez stałe kotwice.
- Jeden plik wystarczy, dopóki decyzje dopisuje jedna gałąź naraz. Przejście na `docs/decyzje/NNNN-*.md` rozważyć, gdy zaczną to robić równolegle różne gałęzie albo agenci.
- Tylko decyzje obowiązujące w kodzie dzisiaj. Źródła:
  - design doc §2–4 i §9;
  - rulingi R1–R22 z `docs/superpowers/notes/2026-10-26-plan-1-handoff.md` (tylko te, które mają znaczenie dla dewelopera, np. R3, R9, R13, R15, R17, R18, R19, R21, R22);
  - decyzje Jakuba 1–4 ze specu superadmina;
  - zmiana `BETTER_AUTH_URL` → `APP_URL`;
  - system testów adwersarialnych (research i audyt);
  - bramka mutacji.
- Decyzje planu 2 (D1–D10) nie wchodzą, bo nie są wdrożone.

### `docs/znane-ograniczenia.md`

- Pozycje „Odłożone” z handoffu planu 1 i „Otwarte sprawy” z handoffu `.claude/handoffs/2026-10-27-1705-handoff.md`. Każda pozycja jest sprawdzona w kodzie: nieaktualne odpadają, aktualne mają opis skutku dla dewelopera i plik.
- Rozbieżności dokumentów z kodem znalezione przy pisaniu (sekcja 7) też tu trafiają, jeśli dotyczą zachowania kodu.

### Zmiany poza `docs/`

- `AGENTS.md`: jedna linia w sekcji „Co to jest” z linkiem do dokumentacji. `CLAUDE.md` bez zmian.
- `README.md`: jedna linia z linkiem do dokumentacji. Sekcja startu zostaje.
- Oba odnośniki to tekst, nie link: „Dokumentacja kitu: `docs/README.md` w repo `webamigos/wa-kit`”. Plan 2 kopiuje `AGENTS.md` i `README.md` do projektów bez zmian, a `docs/` nie, więc link względny byłby martwy w każdym projekcie. Absolutny URL też odpada: lokalne repo nie ma remote, a `gh repo view webamigos/wa-kit` nie rozpoznaje repo. Linia mówi też, że dokumentacja opisuje najnowszą wersję kitu, a wersję projektu podaje `.wa/kit.json`.
- `docs/superpowers/specs/2026-10-26-wa-kit-design.md` §3.1: link do `.superpowers/system-admin/spec.md` zastąpiony linkiem do `docs/04-auth-i-role.md` i `docs/decyzje.md`.

## 6. Weryfikacja

- Przy pisaniu każdego pliku wykonawca czyta kod, który opisuje. Nie pisze z pamięci ani ze specu.
- Komendy z dokumentacji, które da się bezpiecznie uruchomić lokalnie, są uruchomione: `npm run wa -- generate` (oczekiwany brak diffu), `npm run verify` po zmianach w `AGENTS.md`/`README.md`, tutorial z pliku 09 w całości. Komend niszczących bazę nie uruchamia się. Lokalna baza: `DB_PORT=5439`.
- Po napisaniu każdego pliku osobny recenzent (świeży subagent) dostaje plik i dostęp do kodu. Szuka twierdzeń niezgodnych z kodem, ścieżek, których nie ma, i linków do nieśledzonych plików. Ma też wskazać, co z zakresu sekcji 5 pominięto.
- Na koniec skrypt jednorazowy (w scratchpadzie, nie w repo) sprawdza w `docs/*.md`:
  - każda ścieżka w backtickach i każdy link względny (z kotwicą) istnieje w `git ls-files` albo jest jawnie oznaczony jako generowany lub lokalny;
  - każdy blok kodu poprzedzony ścieżką występuje dosłownie w tym pliku. Pominięcia oznacza się linią `// …` albo `# …`, a skrypt dzieli blok w tym miejscu;
  - każda komenda `npm run <skrypt>` istnieje w `package.json`;
  - w plikach 01–11 nie ma słów zakazanych przez regułę języka ponadczasowego.
  lychee i Vale odpadają: nie są zainstalowane, a Vale nie ma reguł dla polskiego.

## 7. Rozbieżności i znaleziska

Wykonawca nie poprawia kodu. Każdą rozbieżność między kodem a `AGENTS.md`/`CLAUDE.md`/README/specem zapisuje w `docs/superpowers/notes/2026-10-27-docs-discrepancies.md`. Wpis zawiera: co mówi dokument, co robi kod, plik i propozycję. Na koniec pracy Jakub dostaje streszczenie tej listy.

Znane już teraz:

- Nagłówek plików generowanych mówi `npx wa generate` (`packages/cli/src/generate/registry.ts`), a `CLAUDE.md`/`AGENTS.md` mówią `npm run build -w @wa-kit/cli && npm run wa -- generate`.
- `AGENTS.md` linkuje do `docs/superpowers/notes/2026-10-27-adversarial-testing-research.md`, który nie jest zacommitowany.
- Luka dla planu 2 (decyzja Jakuba: zapisać). Nie ma pojęcia „moduł należący do projektu”: funkcja klienta musi dziś mieć wpis w `.wa/kit.json`, a plan 2 i 4 traktują ten plik jako opis kodu z kitu. Wpis w notatce rozbieżności zawiera propozycję dla planu 2. Ta sama luka trafia do `znane-ograniczenia.md`.

## 8. Do decyzji wykonawcy

- Dokładne sformułowania, kolejność sekcji wewnątrz pliku, liczba i szczegółowość diagramów.
- Podział pliku na dwa, jeśli przekroczy około 500 linii (np. `04-auth-i-role.md`). Nazwy nowych plików w tym samym schemacie numeracji.
- Wybór przykładów kodu, pod warunkiem że są fragmentami istniejących plików z podaną ścieżką.
- Domena przykładowego modułu w tutorialu.
- Kolejność pisania plików i podział na zadania planu.

## 9. Decyzje podjęte przeze mnie (do sprawdzenia przez Jakuba)

- Markdown po polsku w `docs/`, diagramy mermaid, numerowane pliki.
- Rejestr decyzji w jednym pliku `decyzje.md`, a nie ADR jako osobne pliki.
- `AGENTS.md` zostaje źródłem reguł. Dokumentacja je wyjaśnia i linkuje, nie kopiuje.
- Tutorial przechodzony naprawdę na roboczej kopii przed opisaniem.
- Rozbieżności z kodem zapisywane w osobnej notatce, kod bez zmian.
- Linki do `README.md` i `AGENTS.md`, naprawa martwego linku w design doc.
- Treść `.superpowers/system-admin/spec.md` i `.superpowers/access-matrix/draft.md` przenoszona do dokumentacji po weryfikacji z kodem; macierz z testu, nie z draftu.
- Linki z `AGENTS.md` i `README.md` absolutne do `main` w `webamigos/wa-kit`.
- Kod tutorialu pochodzi z prawdziwego przebiegu na roboczej kopii; przykładowy moduł nie zostaje w repo.
- Tutorial pisany z perspektywy projektu klienta, z jawnie wymienionymi różnicami względem repo kitu.
- Po researchu (2026-10-27):
  - nagłówek „Po przeczytaniu / Zweryfikowano / Źródła” w każdym pliku;
  - język ponadczasowy;
  - sekcje „Referencja”;
  - pole „jak egzekwowana” i statusy w `decyzje.md`;
  - diagram kontenerów i „Zasady kitu” w 02;
  - skrypt sprawdza też dosłowność fragmentów kodu, komendy `npm run` i słowa zakazane;
  - odnośnik w `AGENTS.md`/`README.md` jako tekst, nie link.
- Odrzucone po researchu: generator strony (Docusaurus, MkDocs), include przez remark, embedme, Vale, adr-tools, pełny arc42, poziomy C4 poniżej kontenerów, llms.txt, podział `docs/` na katalogi Diátaxis.
