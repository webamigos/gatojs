# Testy, które próbują złamać kod — research dla wa-kit

Data: 2026-10-27. Zakres: jak sprawić, żeby agent (Claude Code + superpowers) pisał testy, które
podważają kod, a nie potwierdzają implementacji, którą sam przed chwilą wymyślił.

## Problem w liczbach

- LLM-y generują wyrocznie (asercje) odzwierciedlające **faktyczne** zachowanie programu, a nie
  **oczekiwane** — dlatego słabo łapią błędy.
  Konstantinou, Degiovanni, Papadakis, *Can we find bugs using LLM-generated oracles?*
  — https://arxiv.org/abs/2410.21136
- Testy generowane **po** wadliwym kodzie wykryły 14% błędów, testy generowane niezależnie — 25%.
  Autorzy nazywają to „error propagation”: błąd z kodu kopiuje się do testu i oba się zgadzają.
  Konstantinou, Tambon, Papadakis, *On the risk of coding before testing* (2026)
  — https://arxiv.org/abs/2607.05139
- Agenci z dostępem do testów potrafią je zmieniać lub usuwać zamiast naprawić kod; modele Anthropic
  w ImpossibleBench częściej sięgały po bezpośrednią edycję plików testowych.
  Zhong, Raghunathan, Carlini, *ImpossibleBench* — https://arxiv.org/abs/2510.20270
  (omówienie wyników: https://www.greaterwrong.com/posts/qJYMbrabcQqCZ7iqm/impossiblebench-measuring-reward-hacking-in-llm-coding-1).
  EvilGenie obserwuje jawny reward hacking także u Claude Code — https://arxiv.org/abs/2511.21654
- Anthropic sam opisuje to zachowanie i podaje gotowy prompt („Avoid focusing on passing tests and
  hardcoding”, „Tests are there to verify correctness, not to define the solution”, „if any of the tests
  are incorrect, please inform me rather than working around them”).
  — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

Wniosek: sama instrukcja „pisz dobre testy” nie wystarczy. Trzeba rozdzielić **kto** i **z czego**
pisze testy oraz mierzyć ich siłę narzędziem, którego agent nie oszuka.

## 1. Techniki (10)

### T1. Test przed kodem, potwierdzony czerwony stan, potem testy zamrożone
**Co:** test powstaje ze specyfikacji, uruchamiamy go i widzimy porażkę z właściwego powodu, commit
testów, dopiero potem implementacja; implementer nie zmienia testów.
**Dlaczego działa:** w chwili pisania asercji nie istnieje kod, który można odzwierciedlić. Dane
z 2607.05139 pokazują, że kolejność „najpierw kod” prawie połowi wykrywalność.
**Źródła:** https://code.claude.com/docs/en/best-practices (przykład: „write a failing test that
reproduces it, then fix it”), https://arxiv.org/abs/2607.05139.

### T2. Rozdzielenie ról: tester ≠ implementer (osobny kontekst)
**Co:** testy pisze subagent/sesja, która widzi spec i publiczny interfejs, a **nie widzi**
rozumowania ani kodu implementera. Analogicznie review robi świeży subagent.
**Dlaczego działa:** Anthropic: świeży recenzent pomaga, „because it hasn't seen your reasoning”;
`/code-review` działa w subagencie, który „isn't swayed by the reasoning that produced the code”.
**Źródło:** https://code.claude.com/docs/en/best-practices (sekcje „Give Claude a check to run”,
„Know what subagents cost”).

### T3. Testy tylko do odczytu dla implementera (egzekwowane, nie proszone)
**Co:** w fazie implementacji hook `PreToolUse` na `Edit|Write` blokuje (exit 2) zmiany w
`**/__tests__/**`, `*.test.ts(x)`, `e2e/**`; recenzent ma `tools: Read, Grep, Glob`.
**Dlaczego działa:** ImpossibleBench i EvilGenie pokazują, że modyfikacja testów to dominująca
ścieżka „oszukiwania”; Anthropic zaleca limity egzekwowane przez Claude Code, a nie przez prompt.
**Źródła:** https://code.claude.com/docs/en/hooks-guide, https://code.claude.com/docs/en/best-practices,
https://arxiv.org/abs/2510.20270. Uwaga: hook na `Edit|Write` nie łapie zapisu przez `Bash`.

### T4. Wartości oczekiwane wyprowadzone niezależnie (literały, nie algorytm)
**Co:** expected to literał policzony ręcznie albo wzięty ze specyfikacji/dokumentacji/RFC; nigdy
wynik tej samej funkcji, tej samej formuły w pętli ani helpera budującego wynik.
**Dlaczego działa:** test, który odtwarza algorytm, dziedziczy jego błąd („The Ugly Mirror”,
„Test Tautology”).
**Źródła:** https://test-smell-catalog.readthedocs.io/en/latest/Code%20related/In%20association%20with%20production%20code/The%20Ugly%20Mirror.html,
https://test-smell-catalog.readthedocs.io/en/latest/Code%20related/In%20association%20with%20production%20code/Test%20Tautology.html,
https://testing.googleblog.com/2014/07/testing-on-toilet-dont-put-logic-in.html,
https://arxiv.org/html/2501.17461v1 (AugmenTest: wyrocznie z dokumentacji zamiast z kodu).

### T5. Mutation testing (Stryker) jako miara siły testów
**Co:** narzędzie wstrzykuje drobne błędy (zmiana operatora, usunięcie warunku, pusty return);
każdy „przeżyły” mutant to zachowanie, którego żaden test nie pilnuje.
**Dlaczego działa:** to jedyna miara, której autor testów nie może „zinterpretować” na swoją
korzyść — mutant albo ginie, albo nie. Meta używa mutantów do sterowania generowaniem testów LLM
(ACH: 73% testów zaakceptowanych przez inżynierów).
**Źródła:** https://stryker-mutator.io/docs/stryker-js/vitest-runner/,
https://stryker-mutator.io/docs/stryker-js/incremental/, https://arxiv.org/abs/2501.12862.

### T6. Property-based testing (fast-check)
**Co:** zamiast kilku przykładów — niezmiennik sprawdzany na setkach losowych wejść z shrinkingiem
(np. „parse(serialize(x)) == x”, „wynik nigdy nie zawiera innego organizationId”).
**Dlaczego działa:** agent nie wybiera wejść, więc nie omija przypadków, o których nie pomyślał.
Dla Claude-4-sonnet: PBT i testy przykładowe osobno 68,75% wykrytych błędów, razem 81,25%.
Podejście Tester-agent + PBT dało 23–37% względnego wzrostu pass@1 vs. TDD.
**Źródła:** https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-vitest/,
https://arxiv.org/abs/2510.25297, https://arxiv.org/abs/2506.18315.

### T7. Testy metamorficzne
**Co:** gdy nie znamy dokładnego wyniku, sprawdzamy relację między wywołaniami: permutacja wejścia
nie zmienia wyniku, dodanie rekordu innej organizacji nie zmienia listy tej organizacji, filtr
zawężony ⊆ filtr szerszy.
**Dlaczego działa:** omija problem wyroczni — relacja wynika ze specyfikacji, nie z kodu.
**Źródła:** https://arxiv.org/pdf/2406.06864, https://arxiv.org/html/2401.17019v3.

### T8. Wrogie i graniczne wejścia, wstrzykiwanie awarii
**Co:** dla każdej granicy systemu (akcja serwerowa, route handler, parser env/regionów) obowiązkowo:
pusty/zero/max, zły typ, brak sesji, **cudzy `organizationId`**, rola za niska, duplikat,
awaria zależności (mail, DB rzuca), wywołanie dwukrotne/równoległe.
**Dlaczego działa:** to klasy błędów, których „happy path” autora nigdy nie dotyka; w tym repo
izolacja organizacji jest regułą twardą, więc test cross-tenant jest najcenniejszy.
**Źródła:** superpowers `writing-good-tests.md` („Missing validation for zero, empty, nil,
unauthorized, or malformed input”), https://arxiv.org/abs/2510.25297 (PBT znajduje edge case’y).

### T9. Minimalne mockowanie, asercje na zachowaniu, nie na wywołaniach
**Co:** mockujemy tylko zależności wolne/zewnętrzne; nie asertujemy, że mock został wywołany z tym,
co implementacja mu podała; testujemy kontrakt publiczny.
**Dlaczego działa:** test oparty na mockach powtarza strukturę implementacji („tautological TDD”)
i przechodzi nawet gdy całość nie działa.
**Źródła:** https://link.jbrains.ca/RE9DUO (Tautological TDD), https://martinfowler.com/articles/mocksArentStubs.html.

### T10. Test-sabotaż: „czy ten test w ogóle umie się wywrócić?”
**Co:** recenzent dla każdego nowego testu robi ręczną mutację kodu (odwraca warunek, usuwa filtr
`organizationId`, zwraca pustą tablicę) i sprawdza, że test pada. Dla bugfixu: revert poprawki →
test czerwony.
**Dlaczego działa:** to tani, lokalny odpowiednik T5, wykonywany przez kogoś, kto nie pisał testu.
Już dziś jest w repo jako „bugfix = test, który bez poprawki nie przechodzi”.
**Źródła:** superpowers `writing-good-tests.md` („The Mutation Check”),
https://arxiv.org/abs/2501.12862 (mutanty jako cel dla testów).

## 2. Propozycje dla procesu wa-kit

### 2.1 Reguły do `AGENTS.md` / `CLAUDE.md`
1. Plan (writing-plans) zapisuje **zachowania i przypadki brzegowe** w języku specyfikacji
   (wejście → oczekiwany wynik jako literał), a nie gotowy kod testu skopiowany z implementacji.
2. Testy zadania pisze osobny subagent „tester” na podstawie planu i sygnatur; nie dostaje kodu
   implementacji ani jej rozumowania. Implementer dostaje testy jako gotowe i nie może ich zmieniać.
3. Jeśli implementer uważa test za błędny — zatrzymuje się i zgłasza (zgodnie z promptem Anthropic),
   nie poprawia testu.
4. Expected = literał lub wartość ze specyfikacji. Zakaz liczenia expected kodem produkcyjnym lub
   kopią jego algorytmu.
5. Każda granica (akcja serwerowa, query, parser) ma test negatywny: brak sesji, inna organizacja,
   za niska rola, niepoprawne wejście Zod.
6. Do `CLAUDE.md` (twarde reguły) tylko punkty 2–4 w jednym zdaniu każdy; reszta w `AGENTS.md`.

Egzekwowanie: hook `.claude/hooks/protect-tests.mjs` (wzorem `block-comments.mjs`), aktywny tylko
gdy istnieje znacznik fazy implementacji (np. zmienna `WA_PHASE=implement` albo plik
`.superpowers/phase`), blokujący `Edit|Write` na ścieżkach testowych. Bez znacznika fazy hook
przeszkadzałby testerowi, więc to wymaga decyzji, jak sesje SDD sygnalizują fazę.

### 2.2 Checklista recenzenta testów (subagent-driven-development)
Recenzent przechodzi ją dla każdego zadania, zanim oceni kod:

- [ ] Czy testy powstały przed implementacją i był widoczny czerwony przebieg (log w raporcie)?
- [ ] Czy w diffie implementera nie ma zmian w plikach testowych? Jeśli są — uzasadnienie i zgoda.
- [ ] Czy każda wartość oczekiwana jest literałem lub pochodzi ze specyfikacji, a nie z kodu/helpera?
- [ ] Czy jest choć jeden test, który by padł przy: usunięciu filtra `organizationId`, odwróceniu
      warunku uprawnień, zwróceniu pustego wyniku? Recenzent **sprawdza to ręczną mutacją** i
      podaje w raporcie, co zmienił i który test padł.
- [ ] Czy są przypadki: puste/null/max, niepoprawne wejście (Zod), brak sesji, cudza organizacja,
      za niska rola, awaria zależności, podwójne wywołanie?
- [ ] Czy mocki dotyczą tylko I/O (Prisma przy testach jednostkowych, mail, sieć) i czy żadna
      asercja nie sprawdza samego mocka?
- [ ] Czy nazwa testu opisuje zachowanie z punktu widzenia użytkownika/kontraktu, nie funkcję?
- [ ] Czy test ma pętlę, `if` lub helper liczący expected? Jeśli tak — do poprawy.
- [ ] Bugfix: czy revert poprawki sprawia, że test pada (podany dowód)?
- [ ] Czy istnieje niezmiennik, który warto sprawdzić property testem (parser, serializacja,
      normalizacja, filtrowanie)?

### 2.3 Stryker i fast-check — koszt i zysk

**fast-check (`@fast-check/vitest`) — dodać.**
- Koszt: jedna devDependency, zero zmian w `vitest.config.ts`; `test.prop(...)` obok zwykłych testów.
  Ryzyko: wolniejsze testy przy ciężkich property (domyślnie 100 przebiegów) i flaki, jeśli property
  dotyka bazy — trzymać PBT na czystych funkcjach (parsery env/regionów, schematy Zod, CLI `wa`).
- Zysk: łapie edge case’y, których ani autor, ani recenzent nie wymyślił (T6). Najlepszy stosunek
  zysku do kosztu z omawianych narzędzi.
- Źródło: https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-vitest/

**Stryker (`@stryker-mutator/core` + `vitest-runner` + `typescript-checker`) — dodać, ale nie do `verify`.**
- Koszt: 3 devDependencies, `stryker.config.json`; pełny przebieg to wielokrotność czasu `npm test`
  (każdy mutant = przebieg pokrywających go testów). Ograniczenia runnera: tylko `threads`, brak
  Browser Mode, `coverageAnalysis` zawsze `perTest` (https://stryker-mutator.io/docs/stryker-js/vitest-runner/).
  Projekt ma `environment: "jsdom"` i `packages/**` wyłączone z root-Vitest, więc CLI wymaga osobnej
  konfiguracji per workspace. Komentarze `// Stryker disable` kolidują z regułą „bez komentarzy”
  (hook je zablokuje) — konfiguracja wykluczeń tylko przez `mutate` w configu.
- Zysk: obiektywny miernik siły testów (T5), którego agent nie obejdzie słowami; wynik
  „przeżyłe mutanty” to gotowa lista zadań dla testera.
- Zalecenie: skrypt `npm run test:mutation` z `--incremental` (wynik w `reports/stryker-incremental.json`)
  i `mutate` zawężonym do `src/features/**/services/**`, `src/shared/lib/**`, `packages/cli/src/**`;
  `checkers: ["typescript"]`; `thresholds.break: null` na start, potem np. 60. Uruchamiać w
  nocnym/manualnym jobie CI oraz przez recenzenta na plikach zadania (`--mutate <plik>`), nie w
  `npm run verify`. Źródła: https://stryker-mutator.io/docs/stryker-js/incremental/,
  https://stryker-mutator.io/docs/stryker-js/typescript-checker/.

Kolejność wdrożenia: reguły + checklista (zero kosztu) → fast-check → Stryker w trybie raportu →
próg `break` po ustabilizowaniu wyniku.

## 3. Projekt reguły do `AGENTS.md`

```markdown
### Testy, które próbują złamać kod

- Testy powstają przed implementacją, ze specyfikacji zadania; przed implementacją widać ich
  czerwony przebieg.
- Testy zadania pisze inny agent (tester) niż kod (implementer). Tester zna plan i sygnatury,
  nie zna implementacji. Implementer nie zmienia testów; błędny test zgłasza zamiast go poprawiać.
- Wartość oczekiwana to literał albo wartość ze specyfikacji. Nie liczymy jej kodem produkcyjnym,
  kopią jego algorytmu, pętlą ani helperem.
- Każda granica (akcja serwerowa, query, parser) ma testy negatywne: niepoprawne wejście, brak sesji,
  cudza organizacja, za niska rola, awaria zależności.
- Mockujemy tylko I/O. Nie asertujemy na samym mocku ani na kolejności wywołań wewnętrznych.
- Czyste funkcje z niezmiennikiem (parsery, serializacja, normalizacja) dostają test
  `test.prop` z `@fast-check/vitest`.
- Recenzent dla każdego zadania robi ręczną mutację kodu (usuwa filtr `organizationId`, odwraca
  warunek, zwraca pusty wynik) i podaje, który test padł. Mutacja, której nic nie łapie, to brakujący
  test. Bugfix: revert poprawki musi dać czerwony test.
- `npm run test:mutation` (Stryker, tryb incremental) pokazuje przeżyłe mutanty; nie jest częścią
  `npm run verify`.
```

## Źródła — pełna lista

- Anthropic, Best practices for Claude Code — https://code.claude.com/docs/en/best-practices
- Anthropic, Prompting best practices („Avoid focusing on passing tests and hardcoding”) —
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Anthropic, Hooks guide — https://code.claude.com/docs/en/hooks-guide
- Konstantinou i in., LLM oracles capture actual behaviour — https://arxiv.org/abs/2410.21136
- Konstantinou i in., On the risk of coding before testing — https://arxiv.org/abs/2607.05139
- Zhong, Raghunathan, Carlini, ImpossibleBench — https://arxiv.org/abs/2510.20270
- Gabor i in., EvilGenie — https://arxiv.org/abs/2511.21654
- Foster i in., Mutation-Guided LLM-based Test Generation at Meta (FSE 2025) — https://arxiv.org/abs/2501.12862
- Tanaka i in., LLM-generated property-based tests — https://arxiv.org/abs/2510.25297
- Property-Generated Solver — https://arxiv.org/abs/2506.18315
- Wang, Zhu, Metamorphic Prompt Testing — https://arxiv.org/pdf/2406.06864
- Shin i in., executable metamorphic relations from requirements — https://arxiv.org/html/2401.17019v3
- AugmenTest — https://arxiv.org/html/2501.17461v1
- StrykerJS: vitest runner / incremental / typescript checker —
  https://stryker-mutator.io/docs/stryker-js/vitest-runner/,
  https://stryker-mutator.io/docs/stryker-js/incremental/,
  https://stryker-mutator.io/docs/stryker-js/typescript-checker/
- fast-check + Vitest — https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-vitest/
- Test Smell Catalog: The Ugly Mirror, Test Tautology — https://test-smell-catalog.readthedocs.io/
- Google Testing Blog, Don't Put Logic in Tests — https://testing.googleblog.com/2014/07/testing-on-toilet-dont-put-logic-in.html
- J.B. Rainsberger, Tautological TDD — https://link.jbrains.ca/RE9DUO
- M. Fowler, Mocks Aren't Stubs — https://martinfowler.com/articles/mocksArentStubs.html

Zastrzeżenia: liczby z arXiv pochodzą z abstraktów (pełnych tekstów nie czytałem); część prac to
preprinty. Treść posta Google Testing Blog i eseju Fowlera znana z omówień, nie z pełnego tekstu.
