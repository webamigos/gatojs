# wa-kit CLI: lista wyboru modułów i języków w `wa create`

Gałąź `claude/quizzical-shtern-670676` od `main` (`077b809`). Zakres: `kit/cli`, bundel `.wa/bin/wa.mjs`, dokumentacja.
Bramka: `npm run verify --prefix kit/cli`, `npm run verify`, mutacje plików zadania.

Ustalenia z Jakubem (2026-11-03): moduły i języki wybiera się z listy (strzałki, spacja, Enter) jak w
`create-next-app`; lista pochodzi z zależności `@inquirer/checkbox` (zgoda Jakuba wymagana przez D28 jest).
Moje decyzje: `pl` zaznaczony na stałe z dopiskiem „(wymagany)”, Ctrl+C na liście daje błąd `Przerwano`,
pozostałe pytania (nazwa, email, setup) bez zmian.

## Zadanie 1. `Prompter.select` i `readlinePrompter.select`

Pliki: `kit/cli/src/process/prompter.ts`, `kit/cli/package.json`, `kit/cli/package-lock.json`.
Testy: `kit/cli/src/process/__tests__/prompter.test.ts` (mock `@inquirer/checkbox` jako I/O terminala).

Sygnatury:

```ts
export type SelectChoice = {
  value: string;
  label: string;
  checked?: boolean;
  locked?: boolean;
};

export type Prompter = {
  ask(question: string, fallback: string): Promise<string>;
  confirm(question: string, fallback: boolean): Promise<boolean>;
  select(question: string, choices: SelectChoice[]): Promise<string[]>;
};
```

`readlinePrompter.select(question, choices)` woła domyślny eksport `@inquirer/checkbox` z konfiguracją:

- `message: question`;
- `choices`: dla każdej pozycji `{ value, name: label, short: value, checked: checked ?? false, disabled: locked ? "(wymagany)" : false }`,
  w tej samej kolejności (`short` to tekst podsumowania po Enterze: sama nazwa, bez opisu);
- `theme.i18n.disabledError: "Tej pozycji nie można odznaczyć"`;
- `theme.style.keysHelpTip(keys)`: akcje `navigate`, `select`, `all`, `invert`, `submit` zamienione na
  `przesuń`, `zaznacz`, `wszystkie`, `odwróć`, `zatwierdź`, a klawisz `space` na `spacja`; para to `<klawisz> <akcja>`, pary łączy `" • "`
  (bez kolorów ANSI, żeby test mógł porównać literał).

Zwraca tablicę wartości zwróconą przez `checkbox`.

### Zachowania

- `process.stdin.isTTY` fałszywe → `select` rzuca `Brak terminala: użyj --yes` i nie woła `checkbox`.
- `select("Moduły", [{ value: "a", label: "a — opis" }, { value: "b", label: "b", checked: true }])` → `checkbox` dostaje
  `message: "Moduły"` i `choices` `[{ value: "a", name: "a — opis", short: "a", checked: false, disabled: false }, { value: "b", name: "b", short: "b", checked: true, disabled: false }]`.
- pozycja `{ value: "pl", label: "pl", checked: true, locked: true }` → `{ value: "pl", name: "pl", short: "pl", checked: true, disabled: "(wymagany)" }`.
- `checkbox` zwraca `["b"]` → `select` zwraca `["b"]`; zwraca `[]` → `[]`.
- `checkbox` rzuca błąd o `name === "ExitPromptError"` (Ctrl+C) → `select` rzuca `Error("Przerwano")`.
- `checkbox` rzuca inny błąd (`new Error("awaria")`) → `select` rzuca ten sam błąd.
- `theme.style.keysHelpTip([["↑↓", "navigate"], ["space", "select"], ["a", "all"], ["i", "invert"], ["⏎", "submit"]])` →
  `"↑↓ przesuń • spacja zaznacz • a wszystkie • i odwróć • ⏎ zatwierdź"`.
- `theme.i18n.disabledError` → `"Tej pozycji nie można odznaczyć"`.
- `ask` i `confirm` działają jak dziś (istniejące testy bez zmian).

### Mutacje do zabicia

- usunięcie sprawdzenia `isTTY` w `select`.
- `checked ?? false` → `true`; `locked ? … : false` → zawsze `false` albo zawsze `"(wymagany)"`.
- zgubienie `label` (np. `name: value`); `short` z etykietą zamiast wartości.
- brak tłumaczenia klawisza `space`.
- połknięcie albo przetłumaczenie na `Przerwano` każdego błędu, nie tylko `ExitPromptError`.
- brak tłumaczenia którejkolwiek akcji w `keysHelpTip`, zły separator.

## Zadanie 2. `collectAnswers` pyta listą

Pliki: `kit/cli/src/commands/create.ts`.
Testy: `kit/cli/src/commands/__tests__/create.test.ts`, fałszywy prompter w `kit/cli/src/__tests__/helpers.ts`
(dostaje `select`: zwraca wartości pozycji z `checked: true`).

- Moduły: gdy `options.modules === null` i nie `--yes`, `prompter.select("Moduły", choices)`, gdzie `choices` to manifesty
  bez `core`, w kolejności `readKitManifests`, każdy `{ value: name, label: "<name> — <description>" }` (bez `checked`, bez `locked`).
  Wynik trafia do `resolveModules` jak dziś (zależności modułów dochodzą same).
- Języki: gdy `options.locales === null` i nie `--yes`, `prompter.select("Języki", [{ value: "pl", label: "pl", checked: true, locked: true }, { value: "en", label: "en", checked: true }])`;
  wynik przechodzi przez `parseLocales(wynik.join(","))`.
- `--modules`, `--locales`, `--yes` pomijają odpowiednie pytanie, jak dziś. `prompter.ask` zostaje dla nazwy i emaila,
  `confirm` dla setupu. Kolejność pytań: moduły, języki, nazwa, email, setup.

### Zachowania

- `modules: null`, kit z modułami `demo` (opis `Demo`) i `needs-demo` → pierwsze wywołanie `select` ma pytanie `"Moduły"` i
  `choices` z pozycjami `demo — Demo` i `needs-demo — …` (literały z fixture), bez pozycji `core`.
- `select` dla modułów zwraca `["needs-demo"]` → w `.wa/kit.json` są `core`, `demo` i `needs-demo`.
- `select` dla modułów zwraca `[]` → tylko `core`.
- kit, którego `kit/modules` ma tylko `core.json` (lista modułów pusta), `modules: null`, bez `--yes` → `select` nie jest wołany dla modułów (pierwsze `select` to `"Języki"`), projekt powstaje z samym `core`. Powód: `@inquirer/checkbox` rzuca `No selectable choices` dla listy bez pozycji (uwaga z recenzji PR #23).
- `select` dla języków zwraca `["pl"]` → `locales` w `.wa/kit.json` to `["pl"]`; zwraca `["pl", "en"]` → `["pl", "en"]`.
- `select` dla języków zwraca `["en"]` (fałszywy prompter) → błąd `--locales: dozwolone pl,en; pl jest wymagany`.
- drugie wywołanie `select` ma pytanie `"Języki"` i dokładnie pozycje `pl` (`checked: true`, `locked: true`) i `en` (`checked: true`).
- `modules: ["demo"]` → `select` wołany tylko dla języków; `locales: ["pl"]` → tylko dla modułów; `yes: true` → `select` niewołany.
- `ask` nie dostaje już pytań o moduły ani języki: pytania `ask` to `Nazwa wyświetlana` i `Email admina (puste = pomiń)`.
- `readlinePrompter` bez terminala i `modules: null` → `Brak terminala: użyj --yes`, katalog projektu nie powstaje.

### Mutacje do zabicia

- usunięcie filtra `core` z listy modułów.
- zły `label` (sama nazwa, bez opisu).
- `pl` bez `locked` albo bez `checked`; `en` bez `checked`.
- pominięcie `parseLocales` (zła lista języków przechodzi).
- pytanie o moduły mimo `--modules` albo `--yes`.
- pytanie o moduły przy pustej liście modułów.

## Zadanie 3. Bundel, dokumentacja, `audit-logs.json`

- `npm run build --prefix kit/cli`, commit `.wa/bin/wa.mjs` z kodem.
- `docs/16-cli-wa.md` sekcja „Pytania” i `kit/README.md`: lista wyboru, `pl` wymagany, Ctrl+C → `Przerwano`.
- `docs/decyzje.md` D28: zależność `@inquirer/checkbox` w bundlu (zgoda Jakuba 2026-11-03).
- `kit/modules/audit-logs.json`: polskie znaki w `description`, podbicie `version`, `npm run wa -- kit sync`.
