# wa-kit CLI: drobiazgi odłożone z planu 2

Gałąź od `main` (`08e63a9`), jeden PR do `webamigos/wa-kit`. Zakres: `kit/cli` i bundel `.wa/bin/wa.mjs`.
Bramka: `npm run verify`, `npm run verify --prefix kit/cli`, `npm run test:mutation:gate --prefix kit/cli`.

## Zadanie 1. Lint dla `kit/cli`

Pliki: `kit/cli/eslint.config.mjs` (nowy), `kit/cli/package.json`, `kit/cli/package-lock.json`, `kit/cli/src/compare.ts`.

- Własna konfiguracja ESLint w `kit/cli` (root ignoruje `kit/**`): `@eslint/js` recommended,
  `typescript-eslint` recommended, reguły `curly: "error"` i `no-nested-ternary: "error"` jak w root.
  Ignorowane: `node_modules`, `reports`, `.stryker-tmp`, `src/__tests__/fixtures/**`.
- Skrypt `lint: eslint .`; `verify`: lint → typecheck → test → build. CI (`kit.yml`, job `cli`) dostaje lint przez `verify`.
- `compareCodePoint` bez zagnieżdżonego ternary: `if (a < b) return -1; if (a > b) return 1; return 0;`.

### Zachowania

- `npm run lint --prefix kit/cli` na obecnym kodzie po poprawce → kod wyjścia 0.
- Zagnieżdżony ternary w `kit/cli/src/**` → `npm run lint --prefix kit/cli` kończy się błędem `no-nested-ternary` (sprawdzenie ręczne, nie test jednostkowy).
- `compareCodePoint("a", "b")` → `-1`; `("b", "a")` → `1`; `("a", "a")` → `0`; `("Z", "a")` → `-1` (kolejność code point, nie locale).

### Mutacje do zabicia

- `a < b` → `a <= b` (dla równych zwraca `-1`).
- `a > b` → `a >= b` / `true`.
- zamiana `-1` ↔ `1`, `return 0` → `return 1`.

## Zadanie 2. `kit/cli/src/args.ts`: błędy po polsku, nadmiarowe argumenty

- Wspólny helper w `args.ts` opakowuje `parseArgs` z `node:util`: błędy `ERR_PARSE_ARGS_*` zamienia na polskie komunikaty;
  inne błędy przepuszcza bez zmian.
- `create`, `add`, `remove` przyjmują dokładnie jeden argument pozycyjny; `list` żadnego (jak dziś).
  Nadmiarowy → `Nieoczekiwany argument: <wartość>` (ten sam tekst co w `list`).

### Zachowania

- `parseAddArgs(["auth", "extra"])` → błąd `Nieoczekiwany argument: extra`.
- `parseRemoveArgs(["auth", "extra"])` → błąd `Nieoczekiwany argument: extra`.
- `parseCreateArgs(["acme", "extra"])` → błąd `Nieoczekiwany argument: extra`.
- `parseCreateArgs(["acme", "b", "c"])` → błąd `Nieoczekiwany argument: b` (pierwszy nadmiarowy).
- `parseAddArgs(["auth", "--foo"])` → `Nieznana opcja: --foo`; `parseAddArgs(["auth", "-x"])` → `Nieznana opcja: -x`.
- `parseAddArgs(["auth", "--kit"])` → `Opcja --kit wymaga wartości`.
- `parseAddArgs(["auth", "--kit", "--no-install"])` → `Opcja --kit wymaga wartości` (Node: „argument is ambiguous”).
- `parseRemoveArgs(["auth", "--force=1"])` → `Opcja --force nie przyjmuje wartości`.
- `parseListArgs(["--foo"])` → `Nieznana opcja: --foo`; `parseCreateArgs(["acme", "--title"])` → `Opcja --title wymaga wartości`.
- Żaden komunikat nie zawiera angielskiego tekstu Node (`Unknown option`, `argument missing`).
- Dotychczasowe zachowania (`Podaj katalog projektu`, `Podaj nazwę modułu`, wartości domyślne) bez zmian.

### Mutacje do zabicia

- usunięcie sprawdzenia nadmiarowych argumentów w `create` / `add` / `remove`.
- warunek `positionals.length > 1` → `>= 1` albo `false`.
- zgłoszenie ostatniego zamiast pierwszego nadmiarowego argumentu.
- zamiana mapowania kodów (`UNKNOWN_OPTION` ↔ `INVALID_OPTION_VALUE`), pusta nazwa opcji w komunikacie.
- przepuszczenie oryginalnego błędu Node zamiast tłumaczenia.

## Zadanie 3. `kit/cli/src/kit/ownership.ts`: zależności osobno dla sekcji

- `dependencies` modułu porównujemy z `dependencies` z `package.json` kitu, `devDependencies` z `devDependencies`.
  Zależność w złej sekcji to rozbieżność.
- `dependencyMismatch[]` dostaje pole `section: "dependencies" | "devDependencies"`; sortowanie: moduł, sekcja
  (`dependencies` przed `devDependencies`), nazwa.
- `unownedDependencies` zmienia typ na `{ section, name }[]`: nazwa w sekcji `package.json`, której żaden moduł
  nie deklaruje w tej sekcji. Sortowanie: sekcja, nazwa.
- Bez redundantnego sortowania wejścia (dziś równoważny mutant z wpisem w `allowed`). Wpis
  `src/kit/ownership.ts` / `MethodExpression` stanie się nieaktualny i zatrzyma bramkę: usuwamy go w tym PR (zatwierdził Jakub).

### Zachowania

- Moduł deklaruje `zod@^4` w `dependencies`, `package.json` ma `zod@^4` tylko w `devDependencies` →
  `dependencyMismatch` zawiera `{ module, section: "dependencies", name: "zod", manifest: "^4", packageJson: "<brak>" }`
  oraz `unownedDependencies` zawiera `{ section: "devDependencies", name: "zod" }`.
- Ta sama nazwa i wersja w tej samej sekcji po obu stronach → brak wpisu.
- Inna wersja w tej samej sekcji → wpis z obiema wersjami i sekcją.
- Repozytorium wa-kit (`checkOwnership(REPO_ROOT)`) → nadal pusty raport (sprawdzone skryptem przed planem).

### Mutacje do zabicia

- powrót do scalania sekcji (`{ ...dependencies, ...devDependencies }`) po stronie modułu albo `package.json`.
- porównanie z niewłaściwą sekcją (`dependencies` ↔ `devDependencies`).
- usunięcie pola `section` albo stała wartość sekcji.
- `declared` liczone bez sekcji (zależność z innej sekcji znika z `unownedDependencies`).
- usunięcie lub odwrócenie sortowania po sekcji.

## Zadanie 4. `wa add`: ostrzeżenie o wersji i sprzątanie po błędzie I/O

Pliki: `kit/cli/src/commands/add.ts`, `kit/cli/src/assemble/package-json.ts`.

- Czysta funkcja `dependencyConflicts(packageJson: string, manifest)` w `package-json.ts` →
  `{ section, name, project, module }[]` dla zależności, które projekt ma w tej samej sekcji w innej wersji.
  Sortowanie: sekcja, nazwa. `addDependencies` bez zmian (wersja projektu wygrywa).
- `add` loguje każdy konflikt przed zapisem `package.json`:
  `Uwaga: <name> (<section>) ma w projekcie <project>, moduł <moduł> wymaga <module>; zostaje wersja projektu`.
  Przy kilku dodawanych modułach porównanie idzie względem `package.json` po dodaniu poprzednich.
- Błąd przed udanym `writeKitState` (kopiowanie, zapis `package.json`, zapis `.wa/kit.json`) → `add` usuwa wszystkie
  pliki modułów z tego wywołania, które zdążył utworzyć (kolizje wykluczono wcześniej, więc żaden nie istniał),
  usuwa katalogi utworzone przez siebie, jeśli zostały puste, przywraca oryginalny `package.json` i rzuca oryginalny błąd.
  Błąd w `generate` po zapisie stanu: bez cofania (stan spójny, `generate` można powtórzyć).

### Zachowania

- Projekt ma `zod@^3` w `dependencies`, moduł wymaga `zod@^4` → log zawiera
  `Uwaga: zod (dependencies) ma w projekcie ^3, moduł <x> wymaga ^4; zostaje wersja projektu`; `package.json` ma `^3`.
- Ta sama wersja → brak linii `Uwaga:`. Brak zależności w projekcie → brak linii, zależność dopisana.
- Projekt ma zależność w `devDependencies`, moduł w `dependencies` → brak ostrzeżenia (inna sekcja; zależność dopisana do `dependencies`).
- `dependencyConflicts` zwraca `[]` dla manifestu bez zależności.
- Plik modułu śledzony w gicie kitu, ale usunięty z dysku (ENOENT przy kopiowaniu drugiego pliku) → `add` rzuca
  błąd z kodem `ENOENT`; w projekcie nie istnieje żaden plik modułu ani nowy katalog modułu; `package.json` i
  `.wa/kit.json` są bajt w bajt jak przed wywołaniem; katalogi istniejące wcześniej zostają.
- Udane `add` bez zmian w zachowaniu (dotychczasowe testy).
- Sprzątanie robi kroki niezależnie i w kolejności: pliki modułów, utworzone katalogi od najgłębszego (pominięte, gdy
  nie istnieją), przywrócenie `package.json` tylko wtedy, gdy `add` go już nadpisał. Krok, który się nie uda, nie
  przerywa pozostałych; `add` loguje go jako `Nie udało się posprzątać: <ścieżka względna> (<kod błędu>)`
  i na końcu rzuca oryginalny błąd.
- `package.json` tylko do odczytu (`chmod 0o444`) → `add` rzuca błąd z kodem `EACCES`; nie istnieje żaden plik
  modułu ani `src/features/demo`; `package.json` i `.wa/kit.json` bajt w bajt jak przed; w logu brak linii
  `Nie udało się posprzątać`.
- Obcy plik w katalogu utworzonym przez `add` (np. `src/features/demo/i18n/obcy.txt` zapisany przez zamockowane
  `copyFiles`, które potem rzuca) → plik modułu znikają, obcy plik zostaje, log zawiera dokładnie
  `Nie udało się posprzątać: src/features/demo/i18n (ENOTEMPTY)` i `Nie udało się posprzątać: src/features/demo (ENOTEMPTY)`,
  w tej kolejności; oryginalny błąd jest rzucony.
- W dotychczasowych scenariuszach sprzątania (ENOENT, EACCES na `.wa/kit.json`) log nie zawiera `Nie udało się posprzątać`.

### Mutacje do zabicia

- usunięcie logowania konfliktów albo warunku `!==` (ostrzeżenie przy tej samej wersji).
- porównanie z inną sekcją projektu.
- usunięcie sprzątania plików / katalogów / przywracania `package.json`.
- sprzątanie tylko plików z ostatniego modułu (przy kilku modułach).
- połknięcie błędu zamiast ponownego rzucenia.
- usunięcie katalogu istniejącego przed `add`.
- przywracanie `package.json` jako pierwszy krok, który przy błędzie przerywa resztę sprzątania.
- przywracanie `package.json` także wtedy, gdy nie był nadpisany.
- pominięcie sprawdzenia, czy katalog istnieje (ENOENT trafia do logu).
- ciche połknięcie nieudanego kroku (brak linii w logu).

## Kolejność i proces

Dla każdego zadania: `test-writer` (testy z sekcji „Zachowania”, czerwony przebieg) → implementer przy
`.superpowers/phase` = `implement` → `test-reviewer` (`npm run test:mutation:task --prefix kit/cli -- <pliki>`) →
poprawki. Na końcu: `npm run build --prefix kit/cli`, commit `.wa/bin/wa.mjs`, bramki, recenzja końcowa, PR.
