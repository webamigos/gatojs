# wa-kit plan 3: moduły `audit-logs`, `api-keys`, `uploads`

Data: 2026-10-28. Burza mózgów z Jakubem. Źródła: spec [2026-10-26-wa-kit-design.md](2026-10-26-wa-kit-design.md) (sekcja „Moduły opcjonalne v1”, 4.3), plan 2 [2026-10-27-wa-kit-plan-2-cli.md](../plans/2026-10-27-wa-kit-plan-2-cli.md), przegląd kodu `_sources/company-dashboard-app`, `_sources/justnails-app` i 21 aplikacji webamigos na GitHubie.

Repozytoria źródłowe: `webamigos/company-dashboard-app` i `webamigos/justnails-app` (lokalnie w `_sources/`), `webamigos/pgm-elearning` (rejestr celów uploadu i `sharp`: `src/app/api/upload/route.ts`, `src/app/api/download/route.ts`, `src/shared/lib/s3.ts`).

## 1. Po co

Spec v1 obiecuje rdzeń plus pięć modułów. Rdzeń i CLI są gotowe, modułów nie ma. Żaden projekt klienta nie czeka dziś na kit, więc kolejność wynika z tego, co Jakub najczęściej przenosił ręcznie: `api-keys`, `audit-logs`, `uploads`, `worker`. `legal` jest najmniej pilny.

Ten plan obejmuje trzy moduły, które nie wnoszą osobnego procesu: `audit-logs`, `api-keys`, `uploads`. `worker` i `legal` dostaną osobną burzę mózgów (patrz 9).

## 2. Cele, nie-cele, anty-cele

**Cele**

- Trzy moduły kitu instalowane przez `wa create --modules` i `wa add`, przeniesione z działających repo (nie pisane od zera), bez logiki i nazw klientów.
- Szew audytu w rdzeniu: kod rdzenia, modułów i projektu woła `trackAudit()` bezwarunkowo; bez modułu `audit-logs` to no-op.
- Moduły projektu (np. magazyn w justnails) rozszerzają kit bez edycji plików kitu: własne akcje audytu z etykietami, własne scope'y kluczy, własne cele uploadu.
- Macierz `assemble` w `.github/workflows/kit.yml`: `core`, każdy moduł osobno, `all`.
- Bramka mutacji obejmuje logikę bezpieczeństwa nowych modułów.

**Nie-cele (w tym planie)**

- `worker`, `legal`.
- Retencja audytu (sprzątanie starszych niż 60 dni) i sprzątanie osieroconych plików S3. Dojdą razem z workerem; do tego czasu log i bucket rosną.
- Serwer MCP i OAuth dla MCP, rotacja kluczy z nakładką, rate limiting, statyczne sekrety (`CRON_SECRET`).
- Edytor WYSIWYG (tiptap). Kit daje endpoint i cel `editor-image`, nie edytor.
- IP i user-agent w audycie (nie ma ich w żadnym źródle).

**Anty-cele (porażka, nawet jeśli działa)**

- Dane jednej organizacji widoczne lub zmienialne z kontekstu innej: wpisy audytu, klucze, pliki prywatne.
- Klient może zapisać wpis audytu (np. `trackAudit` w pliku `"use server"`; tak jest w justnails).
- Zwykły członek organizacji czyta log przez akcję serwerową, bo zapytanie sprawdza tylko członkostwo (tak jest w company-dashboard).
- Klucz API odczytywalny z bazy albo pokazany drugi raz.
- Typ pliku ustalany z `file.type` od klienta albo rozszerzenie z nazwy pliku.
- Moduł edytuje pliki rdzenia albo projekt musi edytować plik modułu, żeby go rozszerzyć.

## 3. Ograniczenia

- Reguły `AGENTS.md` i `CLAUDE.md`: `getOrgContext()` i filtr `organizationId`, `requireModuleAccess`, kontrakt trybu serwisowego (`assertServiceModeConfirmed`, `useServiceModeAction().run`), brak komentarzy, Zod w `contracts/`, `OperationResult<T>`, test izolacji dwóch organizacji dla każdego query i komendy, test architektury `server-entrypoints-guard`.
- Proces testów: testy pisze `test-writer` przed implementacją, sekcje „Zachowania” i „Mutacje do zabicia” w każdym zadaniu, implementer nie zmienia testów, recenzent uruchamia mutacje. Wpisy `allowed` w `mutation-gate.json` dodaje tylko Jakub.
- Zmiany w `kit/cli/src` wymagają przebudowy i commita bundla `.wa/bin/wa.mjs`.
- Zmiana plików modułu = podbicie `version` w `kit/modules/<x>.json`, potem `npm run wa -- kit sync`.
- Test własności plików: każdy plik należy do dokładnie jednego manifestu.
- Wersje zależności zgodne z kitem (np. OTel `^0.218.0`), nie ze źródeł.

## 4. Kształt pracy (decyzja Jakuba)

Jeden projekt, osobny PR na moduł, w kolejności:

1. **`audit-logs`** razem ze szwem `trackAudit` w rdzeniu i zdarzeniami rdzenia.
2. **`api-keys`** (wpisy audytu z kanałem `API`).
3. **`uploads`** (MinIO w `docker-compose`).

Każdy PR dopisuje swój moduł do macierzy `assemble`; ostatni dopisuje `all`. Rozszerzenia rdzenia potrzebne modułowi (szew, pola `defineModule`, generator) wchodzą w PR tego modułu, który ich pierwszy potrzebuje.

## 5. `audit-logs`

**Po co (Jakub):** właściciel lub admin organizacji sprawdza, kto co zrobił. Szuka w obie strony: po osobie („co dziś robił magazynier X”) i po rzeczy („kto przyjął dostawę 123 i co zmienił”). Akcje dopisują głównie moduły projektu.

**Ustalone (zaakceptowane przez Jakuba):**

- **Szew w rdzeniu.** `src/shared/lib/audit.ts` (plik rdzenia) eksportuje `trackAudit(input)`. Bez modułu nic nie robi. Moduł `audit-logs` rejestruje implementację przez rejestr modułów. Plik nie ma `"use server"` i nie jest osiągalny jako akcja serwerowa. `trackAudit` nigdy nie rzuca (błąd zapisu tylko logowany) i jest wołane po udanym zapisie.
- **Wpis:** `organizationId` (wymagane, indeks złożony z `createdAt`), `userId` (opcjonalne; puste dla zdarzeń systemowych; relacja `onDelete: SetNull`, żeby usunięcie użytkownika nie kasowało śladu), `action` w formacie `encja.czasownik`, `entityType`, `entityId?`, `oldData?`/`newData?` (JSON, pola wrażliwe zamieniane rekurencyjnie na `"[REDACTED]"`), `createdAt`.
- **Akcje są otwarte.** `action` to dowolny string, kit nie trzyma zamkniętej listy. Etykieta pochodzi z i18n modułu, który akcję deklaruje; bez etykiety widok pokazuje surowy klucz.
- **Widok `/audit-log`:** tylko owner i admin organizacji (globalny `admin`/`superadmin` jak wszędzie). Uprawnienie sprawdzane w stronie i w samym query. Filtry: osoba, akcja, typ encji, id encji, zakres dat. Sortowanie i paginacja po stronie serwera (wzór: widok z justnails).
- **Historia rzeczy:** komponent `<AuditTrail entityType entityId />`, który moduł projektu wstawia na stronę szczegółów encji. Te same zasady dostępu co widok.
- **Zdarzenia rdzenia logowane od razu:** zaproszenia (wysłanie, anulowanie, przyjęcie), zmiana roli członka, usunięcie członka. (Zmiana ustawień organizacji wypadła: rdzeń nie ma takiej operacji, UI nie woła `updateOrganization`.)
- **Tryb serwisowy:** wpis zrobiony przez superadmina bez członkostwa jest oznaczony (kontekst ma `serviceMode: true`).
- **Kanał:** wpis ma `channel` (`WEB` domyślnie, `API` dla żądań uwierzytelnionych kluczem) i `credentialId?` (id klucza, bez FK, żeby ślad przeżył usunięcie klucza). Wzór: company-dashboard.

**Moje decyzje (do sprawdzenia przy czytaniu):**

- Źródła: model i `trackAudit` z company-dashboard (bez `Department`, MCP, `toolName`), widok z justnails (bez cookie rozmiaru strony, bez filtra impersonacji).
- `SENSITIVE_KEYS` generyczne: `password`, `passwordHash`, `secret`, `token`, `accessToken`, `refreshToken`, `apiKey`, `hashedKey`, `authorization`, `cookie` (porównanie bez wielkości liter).
- Wejście superadmina do organizacji (`enterOrganizationCommand`) też jest logowane, bo to zdarzenie bezpieczeństwa.
- Deklaracja akcji: pole w `defineModule` (dane, bez funkcji), np. `auditActions: { "delivery.received": "auditActions.deliveryReceived" }`, gdzie wartość to klucz i18n w namespace modułu. Kształt pola to decyzja wykonawcy, warunek: moduł projektu dodaje akcje bez edycji plików kitu.
- `<AuditTrail>` leży w module `audit-logs`, bez zastępczego komponentu w rdzeniu. Moduł projektu, który go używa, wymaga zainstalowanego `audit-logs` (opisane w dokumentacji modułu). Szwem rdzenia jest tylko `trackAudit`.
- Zaproszenia i role w rdzeniu idą przez plugin `organization` better-auth, nie przez komendy kitu. Zdarzenia rdzenia trzeba więc złapać hookami better-auth (`organizationHooks`/`databaseHooks`) albo w miejscu, gdzie rdzeń już przechwytuje te ścieżki. Wybór mechanizmu: wykonawca.

## 6. `api-keys`

**Po co (Jakub):** system zewnętrzny woła API aplikacji klienta: Claude przez MCP, agent browser use, integracja wokół KSeF. Kluczami zarządza owner lub admin organizacji. Klucz nie zastępuje logowania człowieka.

**Ustalone (Jakub zaakceptował zakres):**

- **Klucz należy do organizacji**, nie do osoby. `createdById` tylko do audytu (`SetNull`). Klucz działa po odejściu autora.
- **Scope'y:** moduły i kod projektu deklarują scope'y jako stringi (np. `deliveries:write`); admin zaznacza je przy tworzeniu klucza. Klucz bez scope'ów nic nie może. Nieznany scope (np. po odinstalowaniu modułu) jest ignorowany.
- **Trasa API** woła helper (roboczo `authenticateApiKey(request, scope)`) i dostaje kontekst `{ organizationId, apiKeyId, scopes }` zbudowany z rekordu w bazie. Brak lub zły klucz, klucz unieważniony albo wygasły → 401; brak scope'u → 403. Nagłówek `Authorization: Bearer <klucz>`.
- **Format:** `<projectSlug>_live_<32 bajty base64url>`. W bazie prefiks do wyświetlania i hash HMAC-SHA256 z pepperem `API_KEY_PEPPER` (env modułu). Pełny klucz widać raz, przy tworzeniu. Pola: `name`, `scopes String[]`, `lastUsedAt` (aktualizacja bez blokowania żądania), `expiresAt?`, `revokedAt?`, `organizationId` (wymagane, indeks).
- **Limit:** 10 aktywnych kluczy na organizację.
- **Audyt:** utworzenie i unieważnienie kluczy przez `trackAudit`, nigdy z kluczem ani hashem. Zapisy zrobione kluczem mają `channel: API` i `credentialId`.
- **Tryb serwisowy:** tworzenie i unieważnianie to komendy z kontraktem `assertServiceModeConfirmed`.
- **UI `/api-keys`:** lista, tworzenie (nazwa, scope'y, opcjonalne wygaśnięcie), jednorazowe pokazanie klucza z kopiowaniem, unieważnienie, usunięcie. Owner i admin organizacji.

**Moje decyzje:**

- Źródło: company-dashboard (org-scoping, HMAC, scope'y, limit), UI z justnails (tabela, i18n). Bez MCP, działów, faktur, bez legacy SHA-256 bez peppera.
- `API_KEY_PEPPER` wymagany w produkcji; zmiana peppera unieważnia wszystkie klucze (opisane w dokumentacji modułu). W dev/test przykładowa wartość w `.env.example`.
- Deklaracja scope'ów: pole w `defineModule`, np. `apiScopes: [{ key: "deliveries:write", labelKey: "..." }]`. Kształt: wykonawca, warunek jak przy akcjach audytu.
- Klucz nie daje `OrgContext` i nie przechodzi przez `getOrgContext()` (brak sesji). Trasy z kluczem filtrują jawnie po `organizationId` z kontekstu klucza. Lookup klucza czyta Prismę bez sesji: wykonawca umieszcza go tak, żeby test `server-entrypoints-guard` przeszedł bez osłabiania reguły, a jeśli wyjątek jest konieczny, wpis w `UNGUARDED_ALLOWED` z uzasadnieniem.
- Kit dostarcza jedną przykładową trasę z kluczem (np. `GET /api/v1/organization` ze scope'em `organization:read`), żeby pokazać wzorzec i mieć e2e/integrację na prawdziwej trasie. Wykonawca może wybrać inny przykład.
- Ochrona przed timingiem: porównanie hashy przez wyszukanie po unikalnym hashu (bez porównania w JS); jeśli wykonawca porównuje w JS, to `timingSafeEqual`.

## 7. `uploads`

**Po co (Jakub):** miniaturki (jak w pgm-elearning), obrazy i multimedia w edytorach WYSIWYG, załączniki do rzeczy.

**Ustalone (Jakub zaakceptował):**

- **Cele uploadu** (wzór: `UPLOAD_CONFIG` w pgm-elearning): moduł projektu deklaruje cel z dozwolonymi typami, limitem rozmiaru, widocznością (`public` albo `organization`) i opcjonalnym zmniejszeniem obrazu. Kit dostarcza jeden cel: `editor-image` (obraz, zmniejszany do szerokości 1200 px, JPEG).
- **Upload:** `POST /api/uploads` (multipart: `file`, `purpose`), wymaga sesji i organizacji. Typ sprawdzany po magic bytes, nie po `file.type`; rozszerzenie z typu, nie z nazwy. Limit rozmiaru z celu, odrzucenie pustego pliku. Klucz obiektu: `orgs/<organizationId>/<purpose>/<uuid>.<ext>`.
- **Rekord `Upload`:** `organizationId` (wymagane, indeks), `uploadedById` (`SetNull`), `purpose`, `key`, `fileName`, `mimeType`, `size`, `createdAt`. Dostęp sprawdzany po rekordzie, nie po ścieżce.
- **Role (Jakub):** wgrywa każdy członek organizacji. Usuwa autor pliku (`uploadedById`) albo owner/admin organizacji (globalny `admin`/`superadmin` jak wszędzie); `member` nie usuwa cudzego pliku.
- **Tryb serwisowy (Jakub):** upload superadmina w trybie serwisowym wymaga potwierdzenia jak komenda. Trasa przyjmuje potwierdzenie `{ serviceModeConfirmed, organizationId }` jako pole formularza i woła `assertServiceModeConfirmed` przed zapisem; bez niego zwraca ten sam błąd co komendy. `useServiceModeAction` dostaje wariant dla `fetch`, z którego korzysta `<FileUpload>`. To zmiana rdzenia (`src/shared/components/service-mode/`, ewentualnie `src/shared/lib/auth/service-mode.ts`) w PR `uploads`.
- **Pobieranie:** `GET /api/uploads/<id>`. `public`: bez logowania. `organization`: tylko gdy `getOrgContext()` zwraca organizację pliku (aktywna organizacja), inaczej 404, bez zdradzania istnienia. Członek kilku organizacji z inną aktywną dostaje 404; obrazy potrzebne szerzej mają cel `public`. (Moja decyzja: bez wyjątku od reguły `getOrgContext()`.) Poprawny `Content-Disposition` (RFC 6266, `filename*`). Przez serwer, z `Cache-Control` zależnym od widoczności.
- **Usuwanie:** komenda z filtrem `organizationId` i kontraktem trybu serwisowego; usuwa obiekt z bucketu i rekord. Wpis audytu.
- **UI:** `<FileUpload purpose>` z podglądem obrazu. Zwraca id/URL, który moduł projektu zapisuje w swojej encji.
- **Storage:** lokalnie MinIO w `docker-compose` (fragment modułu w regionie `wa:services`) z automatycznym utworzeniem bucketu; produkcja: Railway Bucket albo R2. Env modułu: endpoint, region, klucze, bucket, `forcePathStyle`.

**Moje decyzje:**

- Źródło: `s3.ts` i `storage-keys.ts` z company-dashboard (z flagami checksum `WHEN_REQUIRED`), rejestr celów i `sharp` z pgm-elearning. MinIO pisany od zera (brak w źródłach).
- Rollback: gdy zapis rekordu padnie, obiekt jest usuwany z bucketu (błąd usuwania logowany).
- Usunięcie rekordu, którego obiektu nie da się usunąć z bucketu: rekord znika, błąd logowany; sprzątanie osieroconych obiektów przyjdzie z workerem.
- Deklaracja celów: pole w `defineModule` (same dane), kształt: wykonawca. Warunek jak wyżej.
- Fragment `docker-compose` jest plikiem modułu w projekcie (generator czyta `compose` z katalogu projektu), np. `docker/uploads.compose.yml`. Ścieżka: wykonawca.
- Testy: klient S3 mockowany w testach jednostkowych; adapter S3 ma test integracyjny na prawdziwym MinIO. W CI GitHub Actions `services:` nie uruchomi `minio server` (brak `command`), więc MinIO startuje krokiem `docker run` albo obrazem bez komendy.
- **CI projektu (Jakub):** `.github/workflows/ci.yml` dostaje region markerów (np. `# wa:ci-steps:start/end` w jobie testów integracyjnych), który `wa generate` wypełnia krokami z manifestów modułów; `uploads` wnosi krok startu MinIO i utworzenia bucketu. To nowe pole manifestu i nowy cel regionu w `kit/cli/src/generate/targets.ts`, z testami CLI i przebudową bundla, w PR `uploads`. Projekt bez `uploads` ma pusty region i nie uruchamia MinIO. Czy region trafia też do `e2e.yml`: wykonawca (potrzebny, jeśli e2e dotyka uploadu).
- Limit rozmiaru ciała żądania dla trasy uploadu ustawiony tak, żeby największy cel przechodził; pliki ładowane do pamięci (bez streamingu) są akceptowane w v1.

## 8. Wspólne: rdzeń, generator, CI, bramka

- **Rozszerzenia `defineModule`:** opcjonalne pola danych dla akcji audytu, scope'ów i celów uploadu. Rdzeń nie zna treści, tylko typy. Rejestr klienta i serwera musi pozostać bezpieczny dla klienta (bez funkcji serwerowych w `module.ts`).
- **Implementacja audytu w rejestrze:** jak `env.ts`/`auth.ts`: opcjonalny plik modułu (np. `src/features/audit-logs/audit-sink.ts`) zbierany przez `wa generate` do `src/modules.generated.ts`. To zmiana generatora w `kit/cli/src/generate/registry.ts` z testami CLI i przebudową bundla. Nazwa pliku: wykonawca.
- **Pliki modułów** leżą w `src/features/<x>/**`, `src/app/[locale]/(app)/<trasa>/**`, `src/app/api/<trasa>/**`, `prisma/schema/<x>.prisma` i pliku compose. Moduły nie dodają plików do `src/shared/**`. Dzięki temu globy `core.json` (`src/shared/**`) nie wymagają zawężenia. Jeśli wykonawca musi jednak dodać plik modułu do `src/shared/lib`, zawęża glob rdzenia w tym samym PR (test własności tego pilnuje).
- **Relacje schematu:** pola zwrotne w `User`/`Organization` przez `schemaRelations` manifestu (regiony `wa:relations`).
- **Macierz `assemble`:** `core`, `audit-logs`, `api-keys`, `uploads`, `all`. Kombinacja z `uploads` uruchamia testy integracyjne z MinIO. `docker build` pozostaje dla `core` i dochodzi dla `all`.
- **Bramka mutacji (`critical`):** `src/shared/lib/audit.ts`, `src/features/audit-logs/services/`, `src/features/api-keys/services/` (hash, weryfikacja, scope'y, komendy), `src/features/uploads/services/` (walidacja typu i rozmiaru, kontrola dostępu przy pobieraniu, klucze obiektów) oraz trasy uploadu i pobierania, jeśli zawierają logikę dostępu. `mutation-gate.json` jest plikiem rdzenia: wykonawca sprawdza, że wpis `critical` dla nieobecnego modułu nie psuje bramki w projekcie bez niego (inaczej zmienia mechanizm, nie listę). Wpisy `allowed` dopisuje Jakub.
- **Dokumentacja:** `docs/05-moduly-rdzenia.md` lub nowy plik o modułach kitu, `kit/README.md`, `docs/09*` tam, gdzie opisują rozszerzanie (audyt, scope'y, cele uploadu w module projektu).

## 9. Zostawione na później

- **`worker`.** Do decyzji z Jakubem: cienki worker (bended-app, pgm-elearning: joby `email` i `cron-trigger` wołające `/api/cron/*`) czy gruby (company-dashboard: worker importuje `@/features`). Moja rekomendacja: cienki. Worker zmienia `Dockerfile`, `package.json`/lockfile (workspaces) i workflowy, na które dziś nie ma markerów. Retencja audytu i sprzątanie uploadów przyjdą tutaj.
- **`legal`.** Osobna burza mózgów.

## 10. Do decyzji wykonawcy

- Dokładne nazwy plików, funkcji i pól `defineModule`, o ile spełniają warunki z sekcji 5–8.
- Podział każdego PR na zadania planu.
- Mechanizm MinIO w CI i inicjalizacji bucketu.
- Wybór hooków better-auth dla zdarzeń rdzenia.
- Przykładowa trasa z kluczem API.
