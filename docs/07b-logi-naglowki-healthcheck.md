# Logi, nagłówki bezpieczeństwa i healthcheck

Po przeczytaniu będziesz wiedzieć:

- dokąd trafiają wpisy `logger` zależnie od `NODE_ENV` i `OTEL_EXPORTER_OTLP_ENDPOINT` i dlaczego na produkcji trzeba ustawić endpoint;
- skąd `logger` bierze typ błędu w atrybucie `<klucz>.type` i kiedy na produkcji jest w nim zminifikowana nazwa klasy;
- jak `src/instrumentation.ts` eksportuje logi protokołem OTLP i czego ten eksport nie obejmuje;
- dlaczego `LOG_LEVEL` niczego nie zmienia;
- jakie nagłówki bezpieczeństwa dostaje każda odpowiedź;
- co sprawdza `/api/healthcheck`, a czego nie.

Zweryfikowano z kodem: 8ce69e5, 2026-11-12 (dwa akapity o selektorze `unnamedErrorClass` w sekcji [Typ błędu w `<klucz>.type`](#logger-typ-bledu)); 219b6e7, 2026-11-12 (akapit o regule ESLint w tej sekcji); b3c4fc1, 2026-11-05 (pozostała część tej sekcji); pozostałe sekcje: 734391b, 2026-11-04

Źródła:

- logi: `src/shared/lib/logger.ts`, `src/shared/lib/__tests__/logger.test.ts`, `src/instrumentation.ts`, `src/__tests__/instrumentation.test.ts`, `src/shared/config/project.ts`, `src/shared/lib/env.ts`, `.env.example`, `e2e/env.ts`, `src/shared/utils/error-handling.ts`, `src/shared/utils/__tests__/error-handling.test.ts`, `src/shared/lib/auth/org-context.ts`, `src/shared/lib/auth/service-mode.ts`, `src/shared/lib/mailer.ts`, `src/features/users/services/commands/invite-user-command.ts`, `src/features/users/services/commands/impersonation-commands.ts`, `src/features/organizations/services/queries/default-organization-query.ts`, `src/app/[locale]/accept-invitation/[id]/page.tsx`, `src/features/api-keys/services/commands/api-key-commands.ts`, `src/features/uploads/services/commands/upload-commands.ts`, `src/features/uploads/services/commands/create-upload.ts`, `src/features/uploads/services/s3-storage.ts`, `eslint.config.mjs`;
- nagłówki i healthcheck: `src/shared/lib/security-headers.ts`, `next.config.ts`, `src/proxy.ts`, `src/app/api/healthcheck/route.ts`, `src/app/api/healthcheck/__tests__/route.test.ts`, `src/shared/lib/prisma.ts`, `railway.toml`, `Dockerfile`;
- biblioteki (wersje w `package-lock.json`): `node_modules/@opentelemetry/api-logs/build/src/api/logs.js` (0.218.0), `node_modules/@opentelemetry/sdk-logs/build/src/export/BatchLogRecordProcessorBase.js` (0.218.0), `node_modules/@opentelemetry/otlp-exporter-base/build/src/configuration/otlp-node-http-env-configuration.js` (0.218.0), `node_modules/next/dist/server/lib/start-server.js` (Next.js 16.3.8, `cleanup`), `node_modules/next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js`, `node_modules/@aws-sdk/client-s3/dist-cjs/index.js` (3.1159.0, `S3ServiceException`), `node_modules/@aws-sdk/core/dist-cjs/submodules/protocols/index.js` (3.978.7, `loadRestXmlErrorCode`, `getErrorSchemaOrThrowBaseException`), `node_modules/@smithy/core/dist-cjs/submodules/client/index.js` (3.37.0, `ServiceException`).

Rozdział opisuje to, co widać przy wdrożeniu i diagnozie: logi aplikacji, nagłówki bezpieczeństwa i healthcheck. Zmienne środowiskowe opisuje [07-i18n-mail-env.md](07-i18n-mail-env.md#referencja): `OTEL_EXPORTER_OTLP_ENDPOINT` i `LOG_LEVEL` są w [tabeli zmiennych ze schematu](07-i18n-mail-env.md#referencja-env), a `OTEL_SERVICE_NAME`, `GIT_COMMIT_SHA` i `OTEL_EXPORTER_OTLP_HEADERS` w [tabeli zmiennych spoza schematu](07-i18n-mail-env.md#referencja-env-poza-schematem). Wdrożenie na Railway [10-wdrozenie.md](10-wdrozenie.md).

Oznaczenie „(sprawdzone)” znaczy, że zachowanie potwierdziło uruchomienie kodu z repozytorium na lokalnych portach: `logger` i `register()` z lokalnym odbiornikiem HTTP albo zbudowany serwer (`.next/standalone/server.js`). Oznaczenie „(sprawdzone; wynik `npm run build`)” znaczy, że zachowanie potwierdziło sprawdzenie zbudowanego kodu: plików, które `npm run build` zapisuje w `.next/server`.

<a id="logger"></a>

## Logi i OpenTelemetry

`logger` z `src/shared/lib/logger.ts` ma metody `debug`, `info`, `warn` i `error` przyjmujące komunikat i opcjonalne atrybuty. Wpis idzie przez API logów OpenTelemetry (OTel, otwarty standard zbierania logów, metryk i śladów), a na konsolę tylko w jednym przypadku ([D15](decyzje.md#d15)):

`src/shared/lib/logger.ts`

```ts
const IS_DEV = process.env.NODE_ENV !== "production";
const HAS_OTEL = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
// …
  apiLogger.emit({
// …
  if (IS_DEV && !HAS_OTEL) {
// …
```

`emit` zawsze oddaje wpis do API logów (`apiLogger.emit`), a na konsolę pisze tylko przy obu warunkach naraz. Obie stałe powstają przy imporcie modułu, więc zmiana tych zmiennych wymaga restartu.

<a id="logger-cel"></a>

### Dokąd trafiają wpisy

| `NODE_ENV` | `OTEL_EXPORTER_OTLP_ENDPOINT` | Konsola | Eksport OTLP |
| --- | --- | --- | --- |
| inny niż `production` (`npm run dev`, `npm test`) | brak albo pusty | tak, na przykład `[INFO] [MAILER] …` z atrybutami | nie |
| inny niż `production` | ustawiony | nie | tak |
| `production` (`npm start`, obraz Docker, serwery e2e) | ustawiony | nie | tak |
| `production` | brak albo pusty | nie | nie: **wpisy znikają** |

Ostatni wiersz wynika z budowy OTel: `logger` oddaje wpis do API logów, a gdy nic nie zarejestrowało dostawcy logów, API przekazuje go do dostawcy, który niczego nie robi (`NoopLoggerProvider`). Dostawcę rejestruje tylko `register()` z `src/instrumentation.ts`, i tylko przy ustawionym endpoincie. Wszystkie cztery wiersze są sprawdzone.

**Na produkcji ustaw `OTEL_EXPORTER_OTLP_ENDPOINT`.** Bez niego nie zobaczysz w logach usługi żadnego wpisu aplikacji, w tym błędów komend z `handleCommandError` i nieudanych wysyłek maili. Na konsolę trafia wtedy tylko to, co Next.js i biblioteki wypisują same, z pominięciem `logger`.

Wyjątkiem od tej reguły jest raport startowy walidacji zmiennych środowiskowych. `register()` wypisuje go przez `console.error` niezależnie od `NODE_ENV` i endpointu, bo powstaje przed konfiguracją eksportu, a proces kończy się zaraz po nim ([07-i18n-mail-env.md](07-i18n-mail-env.md#walidacja-env)). Wyjątek od [D15](decyzje.md#d15) obejmuje tylko ten raport ([D48](decyzje.md#d48)); wpisy kodu aplikacji w czasie działania serwera idą przez `logger`.

Na konsoli wpis ma postać `[<POZIOM>] <komunikat>` i obiekt atrybutów bez zmian. Do eksportu atrybuty przechodzą przez `toAttrs`: błąd daje trzy atrybuty `<klucz>.type`, `<klucz>.message` i `<klucz>.stacktrace`, data napis ISO, obiekt napis JSON, a `null` i `undefined` są pomijane. Komunikaty rdzenia są po angielsku i zaczynają się od prefiksu obszaru (`[MAILER]`, `[USERS]`, `[AUTH]`, `[ORG]`). Wyjątkiem jest `handleCommandError`: zapisuje polski komunikat domyślny komendy bez prefiksu, na przykład `Nie udało się zaprosić użytkownika`. Pełna lista: [Referencja](#referencja-logi).

<a id="logger-typ-bledu"></a>

### Typ błędu w `<klucz>.type`

`toAttrs` bierze typ błędu z `name`, gdy jest niepuste i różne od `"Error"`. W przeciwnym razie bierze nazwę konstruktora, czyli klasy błędu, a gdy i ona jest pusta (klasa anonimowa), wpisuje `"Error"`:

`src/shared/lib/logger.ts`

```ts
      result[`${key}.type`] =
        value.name && value.name !== "Error"
          ? value.name
          : value.constructor.name || "Error";
```

`name` stoi na pierwszym miejscu z powodu minifikacji w buildzie produkcyjnym. `npm run build` minifikuje kod serwera: zastępuje nazwy klas krótkimi nazwami, a napisy zostawia. Napis wpisany do `name` zostaje więc w kodzie, a nazwa klasy znika: w plikach `.js` w `.next/server` napisy `NoOrganizationError` i `DomainError` występują tylko jako wartości wpisane do `name` (sprawdzone; wynik `npm run build`). W jednym z plików `.next/server/chunks/` klasa `NoOrganizationError` ma na przykład postać:

```js
class d extends Error{constructor(){super("Użytkownik nie należy do aktywnej organizacji"),this.name="NoOrganizationError"}}
```

`d` to przykład z jednego buildu, a nie stała nazwa: w dwóch innych plikach tego samego buildu ta klasa nazywa się `m`. Minifikację przetrwa tylko napis wpisany do `name` wprost w kodzie: przypisanie `this.name = this.constructor.name` albo `this.name = new.target.name` daje w buildzie produkcyjnym tę samą skróconą nazwę co klasa.

Klasa, która nie ustawia `name`, dostaje je od najbliższej klasy nadrzędnej, która je ustawia. Klasa dziedzicząca bezpośrednio po `Error` bez własnego `name` ma więc `name` równe `"Error"`, a `toAttrs` bierze wtedy nazwę konstruktora, na produkcji zminifikowaną. Podklasa `TypeError` ma za to w `<klucz>.type` `"TypeError"`, a podklasa klasy, która wpisuje do `name` napis, ma ten sam napis, w obu przypadkach także w `npm run dev`. Gdy klasa nadrzędna przypisuje `this.name = this.constructor.name` albo `this.name = new.target.name`, podklasa ma w `name` swoją nazwę, na produkcji zminifikowaną. Własna klasa błędu ma więc na produkcji w `<klucz>.type` swoją nazwę tylko wtedy, gdy sama wpisuje ją napisem do `name`, tak jak `NoOrganizationError` w konstruktorze albo `DomainError` w polu klasy.

`npm run lint` zatrzymuje zapisy, które biorą `name` z nazwy klasy. Reguła `no-restricted-syntax` w `eslint.config.mjs` zgłasza błąd, gdy przypisanie do `this.name` albo pole klasy `name` dostaje wartość `this.constructor.name` (także `<wyrażenie>.constructor.name`), `new.target.name` albo `<Nazwa>.name`, gdzie `<Nazwa>` zaczyna się wielką literą, jak nazwa klasy. Przypisanie `this.name = data.name` przechodzi, bo `data` zaczyna się małą literą. Ceną tego przybliżenia jest zgłoszenie odczytu ze stałej pisanej wielkimi literami, na przykład `this.name = CONFIG.name`; wtedy wpisz napis albo wyłącz regułę dla tej linii dyrektywą `// eslint-disable-next-line no-restricted-syntax -- <powód>`. Reguła rozpoznaje tylko te zapisy wprost, więc nie zatrzyma nazwy klasy podanej okrężnie, na przykład przez zmienną, w getterze `get name()`, zapisem `this["name"]` albo przez `Object.defineProperty(this, "name", { value: new.target.name })`.

`npm run lint` zatrzymuje też klasę, która dziedziczy wprost po `Error` i nie ma własnego `name`. Osobny selektor tej reguły, `unnamedErrorClass` w `eslint.config.mjs`, uznaje za własne `name` tylko pole klasy `name` z wartością, na przykład `name = "KeyLimitError"`, albo przypisanie `this.name = …` zapisane jako osobna instrukcja w treści konstruktora. Wartości nie sprawdza, bo nazwę klasy wpisaną w tych miejscach zatrzymuje selektor z poprzedniego akapitu. Liczy się tylko `name` samej klasy, ustawiane przy tworzeniu każdego jej obiektu. Dlatego nie wystarczy `name` klasy zagnieżdżonej ani przypisanie w zwykłej metodzie, w funkcji wewnątrz konstruktora albo w bloku `if`. Nie wystarczy też pole `name` bez wartości (na przykład `declare name`), klucz wyliczany (`[name]`, `this[name]`) ani prywatne `#name`. Selektor zgłasza więc również klasę, która ustawia `name` okrężnie: getterem `get name()`, zapisem `this["name"]` albo przez `Object.defineProperty`; wtedy wpisz napis w polu albo w konstruktorze. Przepuszcza natomiast nazwę klasy podaną przez zmienną (`const name = new.target.name; this.name = name`), której nie wykrywa żaden z selektorów.

Selektor obejmuje tylko klasy z `extends Error`. Podklasa `TypeError`, `DomainError` albo innej klasy z napisem w `name` dziedziczy ten napis, co opisuje akapit o klasie bez `name` wyżej. Pliki testów (katalogi `__tests__/` oraz pliki `*.test.*` i `*.spec.*` z rozszerzeniem kodu) i katalog `e2e/` są z selektora wyłączone. Nie trafiają do buildu, więc nazwy ich klas nie są minifikowane, a testy loggera i mocki w fabrykach `vi.mock`, na przykład `class NoOrganizationError extends Error {}`, celowo tworzą klasy bez `name`. Wyłączenie robi osobny obiekt konfiguracji dla tych plików, który powtarza listę `restrictedSyntax` bez `unnamedErrorClass`. Własne selektory `no-restricted-syntax` dopisuj więc do stałej `restrictedSyntax`; selektor dopisany tylko do listy w głównym obiekcie nie zadziała w testach.

W rdzeniu `name` ustawiają `NoOrganizationError` (`src/shared/lib/auth/org-context.ts`) i `ServiceModeConfirmationError` (`src/shared/lib/auth/service-mode.ts`) w konstruktorze oraz `DomainError` (`src/shared/utils/error-handling.ts`) w polu klasy `name = "DomainError"`. Napis z pola klasy też przetrwa minifikację: w buildzie `DomainError` ma na przykład postać `class c extends Error{name="DomainError"}` (sprawdzone; wynik `npm run build`). Wpis `warn` z `handleCommandError` dla błędu rzuconego wprost jako `DomainError` ma więc w `err.type` napis `DomainError`, także na produkcji. Rdzeń rzuca `DomainError` tylko jako `ServiceModeConfirmationError`; wprost rzucają go komendy modułów `api-keys` i `uploads`.

Klasa, która dziedziczy bezpośrednio po `DomainError` i nie ustawia `name`, dostaje `name` od `DomainError`, więc ma w `err.type` napis `DomainError` zamiast swojej nazwy, także w `npm run dev`. Moduł, który chce odróżniać swoje błędy w logach, ustawia w podklasie własny `name`, tak jak `ServiceModeConfirmationError`.

Błąd z biblioteki albo z Node.js, który ma w `name` niepusty napis inny niż `"Error"`, ma w `<klucz>.type` ten napis także wtedy, gdy różni się on od nazwy klasy: przerwane żądanie `fetch` daje błąd klasy `DOMException` z `name` równym `AbortError` albo `TimeoutError`. Błąd zwrócony przez S3, który moduł `uploads` zapisuje pod kluczem `err`, ma w `name` kod błędu z odpowiedzi S3, na przykład `SignatureDoesNotMatch`, także gdy jego klasą jest ogólne `S3ServiceException`, a gdy odpowiedź nie ma kodu, `NotFound` przy statusie 404 i `Unknown` przy innym statusie.

Regułę sprawdzają testy w `src/shared/lib/__tests__/logger.test.ts`, w tym przypadek klasy zminifikowanej do `d` z `name` ustawionym w konstruktorze. `name` klasy `DomainError` i jej podklasy bez własnego `name` oraz `err.type` we wpisie `warn` z `handleCommandError` sprawdzają testy w `src/shared/utils/__tests__/error-handling.test.ts`.

<a id="otel"></a>

### Eksport OTLP

Next.js wywołuje `register()` z `src/instrumentation.ts` raz przy starcie serwera, osobno dla każdego środowiska uruchomieniowego. Funkcja działa tylko w Node.js (`NEXT_RUNTIME` równe `nodejs`). Najpierw sprawdza zmienne środowiskowe i przy błędzie kończy proces kodem 1 ([07-i18n-mail-env.md](07-i18n-mail-env.md#walidacja-env)), a eksport logów konfiguruje tylko przy ustawionym endpoincie:

`src/instrumentation.ts`

```ts
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return;
  }

  const normalizedEndpoint = endpoint.replace(/\/$/, "");
// …
  const resource = resourceFromAttributes({
    "service.name": process.env.OTEL_SERVICE_NAME?.trim() || project.slug,
    "service.version": process.env.GIT_COMMIT_SHA ?? "dev",
    "deployment.environment.name": process.env.NODE_ENV ?? "development",
  });
// …
        new OTLPLogExporter({ url: `${normalizedEndpoint}/v1/logs` }),
```

Jak działa eksport (sprawdzone):

- Eksporter wysyła `POST <endpoint>/v1/logs` z treścią JSON (protokół OTLP przez HTTP). Podaj więc adres bazowy odbiornika bez `/v1/logs`; kod usuwa tylko jeden końcowy ukośnik.
- Każdy wpis ma zasób z `service.name` (`OTEL_SERVICE_NAME` albo `project.slug`, czyli `wa-app`), `service.version` (`GIT_COMMIT_SHA` albo `dev`) i `deployment.environment.name` (`NODE_ENV`).
- Nagłówki do odbiornika, na przykład klucz dostępu, eksporter bierze ze zmiennej `OTEL_EXPORTER_OTLP_HEADERS` w postaci `klucz=wartość,klucz2=wartość2`. Kod kitu jej nie czyta; robi to biblioteka.
- `logger` pobiera swój obiekt z API przy imporcie, ale wpisy trafiają do dostawcy zarejestrowanego później w `register()`.
- Wpisy idą paczkami co 5 sekund (domyślne `scheduledDelayMillis` w `BatchLogRecordProcessorBase`). Kod nie wywołuje `forceFlush()` ani `shutdown()` dostawcy, więc wpisy z ostatnich sekund przed zakończeniem procesu mogą nie dotrzeć: proces zakończony pół sekundy po wpisie nie wysłał niczego. Przy `SIGTERM` serwer Next.js zamyka połączenia i kończy proces przez `process.exit(143)` (`cleanup` w `start-server.js`), bez wywołania dostawcy logów.

Kit eksportuje tylko logi. Nie rejestruje śladów ani metryk.

<a id="log-level"></a>

### `LOG_LEVEL`

`LOG_LEVEL` jest w schemacie jako `optionalString`, więc przyjmuje dowolny niepusty napis (także `cokolwiek`). Nic poza schematem jej nie czyta, a `logger` nie filtruje po poziomie: wpisy `debug` trafiają na konsolę i do eksportu tak samo jak `error` (sprawdzone). Wartość `info` z `.env.example` i `warn` ustawiane serwerom e2e w `e2e/env.ts` niczego nie zmieniają ([D15](decyzje.md#d15), [znane-ograniczenia.md](znane-ograniczenia.md)).

<a id="naglowki"></a>

## Nagłówki bezpieczeństwa

`next.config.ts` dodaje nagłówki z tablicy `securityHeaders` w `src/shared/lib/security-headers.ts` do każdej odpowiedzi (`source: "/(.*)"`), także do endpointów `/api/*` i do przekierowań proxy (sprawdzone). Tabela podaje nazwy i wartości dokładnie tak, jak są w tablicy.

| Nagłówek | Działanie |
| --- | --- |
| `X-Content-Type-Options: nosniff` | Przeglądarka nie zgaduje typu pliku wbrew `Content-Type`. |
| `X-Frame-Options: DENY` | Żadna strona, także z tej samej domeny, nie osadzi aplikacji w ramce (ochrona przed clickjackingiem). |
| `Referrer-Policy: strict-origin-when-cross-origin` | Inna domena dostaje w nagłówku `Referer` tylko origin, bez ścieżki i parametrów. Token z adresu `/reset-password?token=…` nie wycieka więc do zewnętrznych zasobów strony. |
| `Permissions-Policy: camera=(), microphone=(), geolocation=()` | Strona nie dostanie dostępu do kamery, mikrofonu ani lokalizacji. Feature, który ich potrzebuje, wymaga zmiany tego pliku rdzenia. |
| `Strict-Transport-Security: max-age=63072000; includeSubDomains` | Przez dwa lata przeglądarka łączy się z domeną i jej subdomenami tylko przez HTTPS. Nagłówek otrzymany przez HTTP, na przykład z `http://localhost:3000`, przeglądarka pomija. |

Nie ma nagłówka `Content-Security-Policy`. Nagłówków nie sprawdza żaden test.

<a id="healthcheck"></a>

## Healthcheck

`src/app/api/healthcheck/route.ts`

```ts
import { prisma } from "@/shared/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "ok" });
  } catch {
    return Response.json({ status: "error", db: "error" }, { status: 503 });
  }
}
```

- `GET` i `HEAD` dają wynik z kodu: 200, gdy baza odpowiada, i 503, gdy nie. Dla `HEAD` Next.js wywołuje ten sam handler i odsyła sam status. `OPTIONS` zwraca 204 z nagłówkiem `Allow: GET, HEAD, OPTIONS`, a pozostałe metody 405 (sprawdzone; `auto-implement-methods.js` w Next.js).
- Railway używa tego adresu jako healthchecku wdrożenia (`healthcheckPath = "/api/healthcheck"` w `railway.toml` albo w ustawieniach usługi, bo nowa usługa nie czyta `railway.toml`, [10-wdrozenie.md](10-wdrozenie.md#config-as-code)).
- `dynamic = "force-dynamic"` każe Next.js wykonywać handler przy każdym żądaniu, a nie raz przy budowaniu.
- Endpoint jest publiczny: `matcher` proxy pomija ścieżkę `/api` i ścieżki pod `/api/` ([02-architektura.md](02-architektura.md#proxy)), a handler nie sprawdza sesji. Odpowiedź nie zawiera danych.
- Sprawdza tylko bazę: handler nie odczytuje `env`, a Prisma bierze adres bazy wprost z `process.env` ([07-i18n-mail-env.md](07-i18n-mail-env.md#odczyt-z-pominieciem-env)). Błędnych zmiennych handler nie wykrywa, ale serwer z błędnymi zmiennymi nie dochodzi do obsługi żądań: kończy się przy starcie kodem 1, więc healthcheck nie dostaje żadnej odpowiedzi (sprawdzone na zbudowanym serwerze bez zmiennych, [07-i18n-mail-env.md](07-i18n-mail-env.md#walidacja-env)). Ten sam serwer z poprawnymi zmiennymi i działającą bazą odpowiadał `{"status":"ok","db":"ok"}` (sprawdzone). Healthcheck nie wykryje też pętli przekierowań przy `HOSTNAME=127.0.0.1` ([07-i18n-mail-env.md](07-i18n-mail-env.md#referencja-env-poza-schematem)), bo jego ścieżka omija proxy.
- Błąd bazy nie trafia do logu: `catch` zwraca 503 bez wpisu, więc przyczynę trzeba ustalić poza endpointem, na przykład w logach bazy.
- Gdy port bazy jest zamknięty, 503 przychodzi od razu (sprawdzone). Gdy host bazy nie odpowiada, pula `pg` czeka na połączenie najwyżej 10 sekund (`connectionTimeoutMillis: 10_000` w `src/shared/lib/prisma.ts`).

Testy `src/app/api/healthcheck/__tests__/route.test.ts` sprawdzają oba wyniki `GET` z podmienionym `prisma.$queryRaw`.

<a id="referencja"></a>

## Referencja

<a id="referencja-logi"></a>

### Wpisy w logu rdzenia

| Komunikat | Poziom | Plik | Atrybuty |
| --- | --- | --- | --- |
| `[MAILER] SMTP_URL and RESEND_API_KEY not set, email not sent` | `info` | `src/shared/lib/mailer.ts` | `to`, `subject` |
| `[MAILER] Failed to send password reset email` | `error` | `src/shared/lib/mailer.ts` | `toMasked`, `err` |
| `[MAILER] Failed to send welcome/set-password email` | `error` | `src/shared/lib/mailer.ts` | `toMasked`, `err` |
| `[MAILER] Failed to send organization invitation email` | `error` | `src/shared/lib/mailer.ts` | `toMasked`, `err` |
| `[USERS] Welcome set-password email not delivered` | `error` | `src/features/users/services/commands/invite-user-command.ts` | `userId`, `err` |
| `[USERS] Failed to send set-password email` | `error` | `src/features/users/services/commands/invite-user-command.ts` | `userId`, `err` |
| `[USERS] Failed to discard invitation` | `error` | `src/features/users/services/commands/invite-user-command.ts` | `invitationId`, `err` |
| `[USERS] Impersonation started`, `[USERS] Impersonation stopped` | `info` | `src/features/users/services/commands/impersonation-commands.ts` | `impersonatorUserId`, `targetUserId` |
| `[AUTH] Failed to resolve active organization` | `error` | `src/features/organizations/services/queries/default-organization-query.ts` | `err` |
| `[ORG] Failed to accept invitation` | `error` | `src/app/[locale]/accept-invitation/[id]/page.tsx` | `id`, `err` |
| `[ORG] Failed to set active organization` | `error` | `src/app/[locale]/accept-invitation/[id]/page.tsx` | `organizationId`, `err` |
| komunikat domyślny komendy po polsku, bez prefiksu, na przykład `Nie udało się zaprosić użytkownika` | `warn` dla `DomainError`, `error` dla innych błędów | `src/shared/utils/error-handling.ts` (`handleCommandError`) | `err` |
| `trackAudit failed` | `error` | `src/shared/lib/audit.ts` (`trackAudit`, błąd ujścia zdarzeń; ujście ma w kicie tylko moduł `audit-logs`, więc bez niego tego wpisu nie ma) | `action`, `error` |

Wpisy w logu modułów opisują tabele komunikatów w [13b-modul-audit-logs-uzycie.md](13b-modul-audit-logs-uzycie.md#referencja-komunikaty), [14b-modul-api-keys-uzycie.md](14b-modul-api-keys-uzycie.md#referencja-komunikaty) i [15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md#referencja-komunikaty).
