# wa-kit CLI: znane ograniczenia z PR #4

Gałąź `fix/cli-known-limitations` od `main` (`c4fe512`), jeden PR do `webamigos/wa-kit`. Zakres: `kit/cli` i bundel `.wa/bin/wa.mjs`.
Źródło: sekcja „Znane ograniczenia” w opisie PR webamigos/wa-kit#4.
Bramka: `npm run verify`, `npm run verify --prefix kit/cli`, `npm run test:mutation:gate --prefix kit/cli`.

## Zadanie 1. `kit/cli/src/args.ts`: pusta wartość `--kit` i równoważne mutanty

Pliki: `kit/cli/src/args.ts`, test `kit/cli/src/__tests__/args.test.ts`.

- `--kit=` i `--kit ""` w `create`, `add`, `list` → błąd `Opcja --kit wymaga wartości`. Helper w `args.ts`
  `optionalValue(value: string | undefined, option: string): string | null` rzuca przy `""`, inaczej zwraca `value ?? null`.
  Tylko `--kit`: `--modules ""` jest udokumentowane jako „brak modułów” (`kit/README.md`), `--title`/`--admin-email` poza zakresem.
- Mapowanie błędów `parseArgs` bez gałęzi nieosiągalnych (4 przeżyłe mutanty: `?? ""` w linii 43, `error.code === …INVALID…` → `true`
  w 57, `?.type` i regex `/^--/` w 58):
  - nazwa opcji z komunikatu Node: `message.split("'")[1].split(" ")[0]` (zawsze jest cytat; `'--kit <value>'` → `--kit`), bez regexu i `??`;
  - `ERR_PARSE_ARGS_UNKNOWN_OPTION` → `Nieznana opcja: …`; każdy inny kod z `parseArgs` to `INVALID_OPTION_VALUE`
    (przy `allowPositionals: true` innych nie ma), więc bez drugiego `if` i końcowego `return error`;
  - „przyjmuje wartość”: `Object.entries(options).some(([name, config]) => \`--${name}\` === option && config.type === "string")`,
    bez `replace` i `?.`.
  - Strażnik `!(error instanceof Error) || !("code" in error)` zostaje (jego mutanty to dziś błędy kompilacji).

### Zachowania

- `parseAddArgs(["demo", "--kit="])` → `Opcja --kit wymaga wartości`; `parseAddArgs(["demo", "--kit", ""])` → to samo.
- `parseListArgs(["--kit="])` → `Opcja --kit wymaga wartości`; `parseCreateArgs(["acme", "--kit="])` → to samo.
- `parseAddArgs(["demo"])` → `kit: null`; `parseAddArgs(["demo", "--kit", "x"])` → `kit: "x"` (bez zmian).
- `parseCreateArgs(["acme", "--modules", ""]).modules` → `[]` (bez zmian).
- `parseAddArgs(["auth", "--foo=bar"])` → `Nieznana opcja: --foo`.
- `parseRemoveArgs(["auth", "--force=1"])` → `Opcja --force nie przyjmuje wartości`, także gdy w opcjach jest opcja typu string:
  `parseAddArgs(["auth", "--no-install=1"])` → `Opcja --no-install nie przyjmuje wartości`.
- `parseAddArgs(["auth", "--kit"])` i `["auth", "--kit", "--no-install"]` → `Opcja --kit wymaga wartości` (bez zmian).
- Dotychczasowe testy `args.test.ts` przechodzą bez zmian.

### Mutacje do zabicia

- `value === ""` → `false` / `true`; usunięcie wywołania `optionalValue` w `create`, `add` albo `list`.
- `some` → `every`; `&&` → `||`; `config.type === "string"` → `true`; `` `--${name}` `` → `""`.
- `error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION"` → `true` / `false`.
- separator `"'"` albo `" "` → `""` (zła nazwa opcji w komunikacie).
- `mutation.json` dla `src/args.ts`: zero mutantów `Survived` i `NoCoverage`.

## Zadanie 2. `add.ts`: kolizje przez `lstat`

Pliki: `kit/cli/src/commands/add.ts`, test `kit/cli/src/commands/__tests__/add.test.ts`.

- Kolizja = `lstat` ścieżki się udaje (plik, katalog, symlink, także wiszący). `ENOENT` i `ENOTDIR` = brak kolizji
  (jak dziś `existsSync`; `ENOTDIR`, gdy rodzic jest plikiem — obsługuje to zadanie 3). Inny błąd `lstat` → rzucony, projekt bez zmian.
- Stała `ABSENT_CODES = new Set(["ENOENT", "ENOTDIR"])` współdzielona z zadaniem 3.

### Zachowania

- Wiszący symlink `src/features/demo/module.ts` → `nowhere` (pomijane na Windows) → `add demo` rzuca
  `Pliki już istnieją, przerwano bez zmian:\n  src/features/demo/module.ts`; symlink zostaje (`readlink` → `nowhere`);
  `package.json`, `.wa/kit.json` bajt w bajt jak przed; `runner` niewołany.
- Symlink do istniejącego pliku na ścieżce modułu → ten sam błąd (bez zmian względem dziś).
- Dotychczasowe testy kolizji przechodzą bez zmian.

### Mutacje do zabicia

- powrót do `existsSync` (wiszący symlink przechodzi).
- `ABSENT_CODES` bez `ENOTDIR` (zadanie 3: błąd `ENOTDIR` z `lstat` zamiast `EEXIST` z kopiowania).
- ciche połknięcie innych błędów `lstat` (wynik `false` dla każdego błędu) — zabija test z `chmod 000` na `src/features/demo` (`EACCES`).

## Zadanie 3. `add.ts`: rollback po przerwanym zapisie, ciche brakujące pliki, log bez `code`

Pliki: `kit/cli/src/commands/add.ts`, `kit/cli/src/manifest/kit-state.ts` (eksport `KIT_STATE_PATH`),
testy `kit/cli/src/commands/__tests__/add.test.ts`, `kit/cli/src/commands/__tests__/add-rollback.test.ts` albo nowy plik z mockiem `node:fs/promises`.

- `add` czyta przed zmianami oryginalną treść `package.json` i `.wa/kit.json`. Sprzątanie ma kroki: pliki modułów,
  utworzone katalogi, przywrócenie `package.json`, przywrócenie `.wa/kit.json`.
- Przywrócenie pliku: odczyt bieżącej treści; zapis oryginału tylko, gdy treść się różni. Bez flag „nadpisano”:
  porównanie treści je zastępuje (plik niezmieniony = brak zapisu), a flaga obok porównania byłaby równoważnym mutantem.
  Zmiana względem briefu: flaga przed zapisem + porównanie ⇔ samo porównanie, poza wyścigiem z ręczną edycją pliku w trakcie `add`.
- Usuwanie pliku modułu: `rm` bez `force`; błąd o kodzie z `ABSENT_CODES` pomijany (plik nie powstał), inne logowane.
- Linia logu: `Nie udało się posprzątać: <ścieżka> (<code>)`, a dla błędu bez `code`: `(<message>)`.

### Zachowania

- `writeFile` `package.json` zapisuje połowę treści i rzuca błąd z `code: "ENOSPC"` (mock, tylko pierwsze wywołanie)
  → `add` rzuca ten błąd; `package.json` bajt w bajt jak przed; żaden plik modułu nie istnieje; brak linii `Nie udało się posprzątać`.
- To samo dla `.wa/kit.json` (połowa treści, `ENOSPC`) → `.wa/kit.json` i `package.json` bajt w bajt jak przed; brak linii sprzątania.
- `package.json` tylko do odczytu i `.wa/kit.json` tylko do odczytu (istniejące testy `EACCES`) → nadal brak linii sprzątania
  (porównanie pomija zapis niezmienionego pliku).
- Zwykły plik w miejscu katalogu `src/features/demo/i18n` → `add demo` rzuca błąd z `code: "EEXIST"` (z `mkdir` przy kopiowaniu);
  plik `src/features/demo/i18n` zostaje z tą samą treścią; pliki modułu spoza `i18n/` nie istnieją; `package.json`, `.wa/kit.json`
  bajt w bajt; brak linii `Nie udało się posprzątać` (dziś: `ENOTDIR` dla każdego pliku w `i18n/`).
- Brakujący w kicie drugi plik modułu (istniejący test `ENOENT`) → nadal brak linii sprzątania (dziś zapewnia to `force: true`).
- Usuwanie pliku modułu rzuca `new Error("dysk odłączony")` bez `code` (mock `rm`) → log zawiera dokładnie
  `Nie udało się posprzątać: src/features/demo/module.ts (dysk odłączony)`; oryginalny błąd rzucony.
- Usuwanie pliku rzuca błąd z `code: "EBUSY"` → linia `… (EBUSY)` (kod ma pierwszeństwo przed treścią).
- Test `add-rollback.test.ts` (obcy plik, `ENOTEMPTY`) przechodzi bez zmian.

### Mutacje do zabicia

- usunięcie kroku `.wa/kit.json` albo `package.json`; przywracanie zawsze (`!==` → `true`: linia `EACCES` w logu) albo nigdy (`false`).
- przywrócenie przed usunięciem plików, które przerywa resztę kroków.
- `ABSENT_CODES` bez `ENOENT` (linia przy brakującym pliku kitu) albo bez `ENOTDIR`; pomijanie każdego błędu `rm`.
- `code ?? message` → `code && message` / sam `code` (`(undefined)`) / sam `message`.
- `mutation.json` dla `src/commands/add.ts`: zero przeżyłych mutantów w zmienionych liniach; `test:mutation:gate` bez nowych wpisów.

## Review Focus

- Mock `node:fs/promises` obejmuje `kit-state.ts` i `copy.ts` — test musi uzbrajać awarię tylko dla konkretnej ścieżki i tylko raz.
- `lstat` na Windows: test symlinku pomijany na `win32`, jak testy `chmod`.
- Wiszący symlink jako katalog modułu (`src/features/demo` → nic): `missingDirectories` używa `existsSync`; po zmianie `add` kończy się
  `ENOENT` z `mkdir` bez linii sprzątania, symlink nietknięty (sprawdził recenzent skryptem) — test nie jest wymagany.

## Kolejność i proces

Zadania 1 → 2 → 3. Dla każdego: `test-writer` (czerwony przebieg) → implementer przy `.superpowers/phase` = `implement` →
`test-reviewer` (`npm run test:mutation:task --prefix kit/cli -- <pliki>`) → poprawki. Na końcu: `npm run build --prefix kit/cli`,
commit `.wa/bin/wa.mjs`, bramki, recenzja końcowa (Opus), PR. Subagenci na `sonnet`.
