# Recenzja szkicu dokumentacji CLI (wejście do części 2 dokumentacji)

Data: 2026-10-30. Szkic powstał 2026-10-29 na `main` sprzed scalenia planu 3 (commit `5b2d308`): pliki `docs/12-cli-wa.md` i `docs/12b-rozwoj-kitu.md`, decyzje D28–D36 i poprawki w 02, 02b, 07, 09, 11, README i `znane-ograniczenia.md`. Szkic nie trafił do repozytorium. Dwóch niezależnych recenzentów porównało go z kodem `kit/cli/src` z `5b2d308`. Ta notatka zbiera ich ustalenia, żeby wykonawca części 2 nie musiał ich odkrywać ponownie. Każde ustalenie trzeba sprawdzić jeszcze raz na kodzie z `main` po planie 3, bo plan 3 zmienił generator (`ciSteps`, region `wa:ci-integration`, `auditSinks`) i manifesty.

## Twierdzenia szkicu niezgodne z kodem

### CLI w projekcie (`12-cli-wa.md`)

1. `wa list` przy błędzie źródła kitu (zła ścieżka, `ext::sh`, nieudany `git clone`, pusty `WA_KIT_SOURCE`) wypisuje `Dostępne: nie udało się pobrać kitu (<powód>)` na stdout i kończy się kodem 0 (`bin.ts`, `listCommand`). Szkic przypisywał tym komunikatom kod 1.
2. `wa add` najpierw pobiera kit (`addFromSource` → `resolveKitSource`), a dopiero potem sprawdza „już zainstalowany” i „moduł projektu”. `wa add core --kit /nonexist` daje błąd źródła, nie odmowę. Przy domyślnym `kitRepo` nawet odmowa wymaga sieci.
3. Sprzątanie po błędzie `wa add`: katalog, w którym został obcy plik, daje linię `Nie udało się posprzątać: <katalog> (ENOTEMPTY)` (test w `add-rollback.test.ts`). Pierwotny błąd to surowy komunikat Node po angielsku, np. `EEXIST: file already exists, mkdir …`.
4. Hash bez treści regionów dotyczy tylko plików z `REGION_FILES` (`generate/targets.ts`). Wszystkie należą do `core`, więc dla plików usuwanego modułu każda zmiana bajtu się liczy.
5. Pusta wartość opcji jest błędem tylko dla `--kit` (`optionalValue` w `args.ts`). `--title=` daje pustą nazwę, `--admin-email=` pusty `ADMIN_EMAIL=`, `--modules=` sam rdzeń, `--locales=` błąd `--locales: …`. Komunikat „wymaga wartości” pada też, gdy po opcji stoi inna opcja albo wartość zaczyna się od `-`.
6. `kitOnly` zawiera też `.superpowers/**` i `.claude/handoffs/**`.
7. `managedFiles` (`package.json`, `package-lock.json`) mają w `files` znacznik `managed`, nie hash.
8. Kit z lokalnego klonu: lista plików pochodzi z `git ls-files` (indeks), ale treść z drzewa roboczego (`copyFiles`). Niezacommitowane zmiany śledzonych plików trafiają do projektu, nowe pliki przed `git add` nie. `resolveKitSource` porównuje tylko `version`, nie commit ani tag. `add` wymaga, żeby klon był repozytorium git (`<ścieżka> nie jest repozytorium git`), `list` nie.
9. Szkic cytował zły test dla sprzątania w `create`. Sprzątanie sprawdza `describe("create: błąd podczas składania")` w `create.test.ts`; nieznany moduł pada przed `mkdir`.
10. Brakujące komunikaty: `<ścieżka> nie jest repozytorium git`, `<polecenie> zakończone kodem <n>`, `spawn <cmd> ENOENT`, `kit/modules/<plik>: name "<x>" nie zgadza się z nazwą pliku`, błędy walidacji `projectModules`, surowy błąd Zod przy uszkodzonym `.wa/kit.json` albo `kit/kit.json`, `Użycie: …` w tabeli.

### Rozwój kitu (`12b-rozwoj-kitu.md`), decyzje i poprawki

11. Nieaktualny bundel zatrzymuje job `cli` już w kroku „Kit state and generated files are up to date”, bo `npm run verify --prefix kit/cli` przebudowuje bundel, a ten krok robi `git diff --exit-code` na całym drzewie. Krok „Bundle is up to date” w praktyce nie może się nie udać.
12. W `kit/modules/*.json` test własności (`checkOwnership`) zgłasza wzorce z `{` (`brace`) i wzorce bez dopasowań (`empty`). Zdanie D02 „manifest może wymieniać feature z wyprzedzeniem” dotyczy tylko generatora, czyli `projectModules`.
13. Trzeci język wymaga zmian w `kit/cli/src/generate/registry.ts` (typy `("pl" | "en")[]`) i w `kit/cli/src/commands/kit-sync.ts` (zawsze zapisuje `["pl", "en"]`).
14. Test własności widzi tylko pliki z indeksu gita: nowy plik przed `git add` jest niewidoczny i test przechodzi.
15. Test własności działa na prawdziwym repozytorium (`REPO_ROOT`), nie na kopii fikstury.
16. D35: nic nie zabrania dopisania testu do `placeholderFiles`; „nigdy w testach” to konwencja.
17. `requires` czytają też `list` i `readKitState` (walidacja `projectModules`); `compose` czyta też test własności (`composeOutsideModule`).
18. `kit/modules/core.json` `files` zaczyna się od `.claude/agents/test-reviewer.md`.
19. 02b „Pozostałych pól generator nie używa”: `readKitState` w ścieżce `wa generate` czyta `requires` modułów projektu.
20. Pliki generowane nie mają właściciela; zdanie „wszystkie pliki należą do `core`” wymaga wyjątku.

### Nieaktualne zdania sprzed planu 2 w obecnej dokumentacji

21. D02 i jego wiersz w indeksie: „własność plików w `.wa/kit.json`”; źródłem są manifesty `kit/modules/<x>.json`.
22. D03 i 02b (tabela objawów): „wzorzec w `.wa/kit.json`” dla modułu kitu; w kicie wzorzec trafia do `kit/modules/<x>.json` i przechodzi przez `wa kit sync`.
23. `decyzje.md`, statusy: przykład „na przykład przy planie 2” jest nieaktualny.
24. README, tabela planów: wersje kitu i modułów istnieją; zaplanowane są aktualizacja projektu do nowszej wersji kitu i scalanie zmian.
25. 11, l. ~234: trzy pliki generowane w ignorach, nie dwa. 11, l. ~258: słowo „Obecnie”.
26. 02 (słownik) i README: „Moduł: wpis w `.wa/kit.json` z manifestem” wymaga dopisku o `kit/modules/<nazwa>.json`.
27. Brak decyzji planu 2 D3 (puste, statyczne workspaces `packages/*` i `apps/*`) w rejestrze decyzji.
28. `kit/README.md`, „Rozwój kitu”: bramka CLI pomija lint.

## Zachowania pominięte w szkicu

- `create`: błędy po złożeniu (zapis `.env`, `git init`, `--setup`) niczego nie cofają; przy błędzie setupu commit już istnieje, a kolejne kroki się nie wypisują.
- `create`: pytanie o setup pada nawet przy komplecie opcji bez `--yes`; w CI kończy się `Brak terminala: użyj --yes`.
- `create`: kolejność walidacji (parsowanie → slug → katalog → kit → pytania → moduły); zła odpowiedź na pytanie o języki kończy komendę bez ponowienia.
- `create`: `--title` i `--admin-email` nie są walidowane ani escapowane; `--title 'Acme "Q"'` psuje składnię `src/shared/config/project.ts`. Tytuł zawierający `wa-app` albo `wa_app` zostanie dodatkowo podmieniony.
- `create --setup` bez adresu admina: kolejne kroki to tylko `cd` i `npm run dev`, bez przypomnienia o `admin:create`.
- `create --no-install`: `package-lock.json` ma `"name": "wa-app"` i zależności kitu do pierwszego `npm install`.
- `create` kopiuje bity uprawnień plików z kitu; klon z one-linera nie jest usuwany; błąd sprzątania jest połykany.
- `add`: zależność, którą projekt ma w innej sekcji, trafia do obu sekcji bez ostrzeżenia; podpowiedź migracji pada zawsze, z nazwą z argumentu; pusty `WA_KIT_SOURCE` rozwiązuje się do katalogu bieżącego.
- `remove`: brak cofania (stan częściowy domyka ponowne `wa remove`); usuwa zależność modułu także wtedy, gdy projekt miał ją wcześniej albo zmienił wersję; nie potrzebuje kitu ani sieci; wpis `files` będący katalogiem daje `EISDIR`, pod zwykłym plikiem `ENOTDIR`.
- `generate` i `kit sync` ignorują nadmiarowe argumenty i opcje; `wa kit` bez `sync` daje `Użycie: …`.

## Ustalone przy uruchomieniu (2026-10-29/30)

- `git ls-remote --tags origin` nie zwraca żadnego tagu: one-liner z `--branch v0.1.0` oraz `wa add`/`wa list` z domyślnym źródłem kończą się błędem pobierania.
- Generator przy `{{projectSlug}}` w `env[].example` daje np. `DEMO_TOKEN=acme-app_demo_` (fikstura `kit/cli/src/__tests__/fixtures/kit`).
- `ci/uploads.integration-steps.yml` jest w `placeholderFiles`: projekt `acme-app` z modułem `uploads` tworzy bucket `acme-app-uploads` w fragmencie CI, w regionie `wa:ci-integration` i w `docker-compose.yml`.
