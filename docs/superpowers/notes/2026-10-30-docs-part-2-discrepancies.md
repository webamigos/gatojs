# Rozbieżności i znaleziska z pisania dokumentacji wa-kit, część 2

Data: 2026-10-30 · Stan kodu: gałąź `docs/part-2`, start od `dcaac50` (na `main` `76ca2d7`)

Notatka zbiera rozbieżności między kodem a `AGENTS.md`, `CLAUDE.md`, `kit/CLAUDE.md`, `README.md`, `kit/README.md`, workflow CI i specami, które wyszły przy pisaniu części 2 dokumentacji.
Kod nie jest poprawiany. Dokumentacja opisuje to, co robi kod. Każdy wpis ma pola: Dokument, Kod, Propozycja, Status. Wpisy części 1 są w [notatce części 1](2026-10-27-docs-discrepancies.md).

## R1. `AGENTS.md` nie opisuje regionu `wa:ci-integration`, tablicy `auditSinks` ani pola `ciSteps`

- **Dokument:** `AGENTS.md`, sekcja „Moduły i pliki generowane”, wymienia jako miejsca łączenia `src/modules.generated.ts`, `src/modules.client.generated.ts` i regiony w `prisma/schema/auth.prisma`, `prisma/schema/organizations.prisma`, `.env.example` oraz `docker-compose.yml`. Wymienia też opcjonalne pliki feature (`env.ts`, `auth.ts`, `auth-client.ts`, `i18n/{pl,en}.json`).
- **Kod:** `.github/workflows/ci.yml` ma region `# wa:ci-integration:start/end` (linie 70 i 89), który generator wypełnia z pola `ciSteps` manifestów (`kit/cli/src/manifest/schema.ts`). Feature może mieć plik `audit-sink.ts`, z którego generator buduje tablicę `auditSinks` w `src/modules.generated.ts`. `grep` po `AGENTS.md`, `CLAUDE.md` i `kit/CLAUDE.md` nie znajduje żadnego z tych trzech haseł.
- **Propozycja:** dopisać do listy regionów `.github/workflows/ci.yml` (`# wa:ci-integration:start/end`), do listy plików feature `audit-sink.ts` (`auditSink`) i wspomnieć o `ciSteps` w manifeście.
- **Status:** otwarte.

## R2. `kit/README.md` opisuje bramkę CLI bez lintu

- **Dokument:** `kit/README.md`, sekcja „Rozwój kitu” (linia 64): bramka CLI to „typecheck, testy, build bundla”.
- **Kod:** `kit/cli/package.json`, skrypt `verify`: `npm run lint && npm run typecheck && npm test && npm run build`. `kit/CLAUDE.md` opisuje to poprawnie („lint → typecheck → testy → build bundla”).
- **Propozycja:** dopisać lint w `kit/README.md` (zmiana w Task 12 części 2).
- **Status:** otwarte, naprawia Task 12.

## R3. Krok „Bundle is up to date” w `kit.yml` nie może się nie udać

- **Dokument:** `kit/CLAUDE.md`, sekcja „Bundel CLI”: „CI sprawdza `git diff --exit-code -- .wa/bin/wa.mjs`: nieaktualny bundel zatrzymuje job”.
- **Kod:** `.github/workflows/kit.yml`, job `cli`. Krok „Verify CLI” uruchamia `npm run verify --prefix kit/cli`, który kończy się `npm run build`, czyli przebudowuje `.wa/bin/wa.mjs`. Następny krok „Kit state and generated files are up to date” robi `git diff --exit-code` na całym drzewie, więc nieaktualny bundel zatrzymuje job już w nim. Dopiero po nim idzie krok „Bundle is up to date” (`git diff --exit-code -- .wa/bin/wa.mjs`), który po udanym poprzednim kroku zawsze przechodzi. Pierwotne źródło: [notatka recenzji szkicu](2026-10-30-docs-part-2-draft-review.md), pkt 11.
- **Propozycja:** albo przenieść krok „Bundle is up to date” przed krok z `git diff --exit-code` na całym drzewie (od razu po „Verify CLI”), albo go usunąć jako zbędny. W obu wypadkach poprawić zdanie w `kit/CLAUDE.md`.
- **Status:** otwarte.
