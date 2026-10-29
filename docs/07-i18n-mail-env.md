# Tłumaczenia, maile i zmienne środowiskowe

Po przeczytaniu będziesz wiedzieć:

- jak next-intl ustala język strony, kiedy przekierowuje na `/en/...` i jak dodać tekst albo nowy język;
- jak teksty feature trafiają do własnego namespace i co się dzieje przy kolizji nazw;
- którędy aplikacja wysyła maile (SMTP, Resend albo tylko wpis w logu) i czego wymaga produkcja;
- jak `src/shared/lib/env.ts` sprawdza zmienne środowiskowe i które zmienne kod czyta z pominięciem tej walidacji;
- które zmienne poza schematem czytają kod aplikacji, Next.js, Docker i testy.

Zweryfikowano z kodem: f965e0a, 2026-10-29

Źródła:

- tłumaczenia: `src/i18n/config.ts`, `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/i18n/merge-messages.ts`, `src/i18n/__tests__/merge-messages.test.ts`, `src/proxy.ts`, `next.config.ts`, `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/app/messages/pl.json`, `src/app/messages/en.json`, `src/features/account/i18n/`, `src/features/auth/i18n/`, `src/features/dashboard/i18n/`, `src/features/organizations/i18n/`, `src/features/users/i18n/`, `src/features/organizations/components/organization-members.tsx`, `src/shared/components/service-mode/service-mode-banner.tsx`, `src/modules.generated.ts`, `kit/cli/src/generate/index.ts`, `kit/cli/src/generate/registry.ts`, `playwright.config.ts`;
- maile: `src/shared/lib/mailer.ts`, `src/shared/lib/__tests__/mailer.test.ts`, `src/app/emails/`, `src/shared/lib/auth/index.ts`, `src/shared/lib/auth/welcome-set-password.ts`, `src/features/users/services/commands/invite-user-command.ts`, `src/features/users/contracts/user-account.schemas.ts`, `src/app/[locale]/(app)/users/page.tsx`, `src/shared/utils/error-handling.ts`, `e2e/helpers.ts`;
- zmienne środowiskowe: `src/shared/lib/env.ts`, `src/shared/lib/__tests__/env.test.ts`, `.env.example`, `.wa/kit.json`, `src/shared/lib/prisma.ts`, `prisma.config.ts`, `scripts/admin-create.ts`, `src/shared/lib/logger.ts`, `src/instrumentation.ts`, `docker-compose.yml`, `Dockerfile`, `e2e/env.ts`, `src/test/integration/database-url.ts`;
- biblioteki (wersje w `package-lock.json`): `node_modules/next-intl/dist/esm/development/routing/config.js` (next-intl 4.14.9, `receiveRoutingConfig`), `node_modules/next-intl/dist/esm/development/middleware/resolveLocale.js`, `node_modules/next-intl/dist/esm/development/middleware/syncCookie.js`, `node_modules/@opentelemetry/otlp-exporter-base/build/src/configuration/otlp-node-http-env-configuration.js` (0.218.0), `node_modules/resend/dist/index.mjs` (resend 6.34.1, `logError`), `node_modules/next/dist/bin/next` (Next.js 16.3.8, opcje `-p` i `-H`).

Rozdział opisuje tłumaczenia, wysyłkę maili i zmienne środowiskowe, czyli infrastrukturę wspólną dla wszystkich feature. Logi, OpenTelemetry, nagłówki bezpieczeństwa i healthcheck opisuje [07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md). Pliki z `src/i18n/`, `src/shared/` i `src/app/` należą do modułu `core` (wzorce `src/i18n/**`, `src/shared/**` i `src/app/**` w `.wa/kit.json`). `src/proxy.ts`, `src/instrumentation.ts` i pliki konfiguracji w katalogu głównym, na przykład `next.config.ts`, nie pasują do żadnego wzorca manifestu; kompletności własności plików nic nie sprawdza ([D02](decyzje.md#d02)). Moduł korzysta z tych plików, ale ich nie edytuje ([D03](decyzje.md#d03)).

Oznaczenie „(sprawdzone)” znaczy, że zachowanie potwierdziło uruchomienie kodu z repozytorium: funkcji (`parseEnv`, `mergeMessages`, middleware next-intl, `createTranslator` z next-intl, `sendPasswordResetEmail`), kompilacji `tsc` pliku próbnego albo zbudowanego serwera (`.next/standalone/server.js`) na lokalnych portach, bez wysyłki czegokolwiek na zewnątrz.

<a id="i18n"></a>

## Tłumaczenia (next-intl)

Tłumaczenia obsługuje biblioteka next-intl. Język jest częścią adresu: trasy leżą w segmencie `src/app/[locale]/`, a wartość segmentu to `pl` albo `en`. Teksty są w plikach JSON, które `src/i18n/request.ts` scala w jeden obiekt. **Namespace** to grupa tekstów pod jednym kluczem najwyższego poziomu tego obiektu. Komponent kliencki prosi o nią przez `useTranslations("users")`, a komponent serwerowy przez `await getTranslations("users")`.

- W plikach rdzenia (`src/app/messages/<język>.json`) namespace to klucze najwyższego poziomu: `common`, `errors`, `sidebar` i `serviceMode`.
- Plik feature trafia w całości pod jeden namespace równy nazwie katalogu feature. Jego klucze najwyższego poziomu to więc już klucze tekstów: `title` z `src/features/users/i18n/pl.json` to `users.title`, a nie `users.users.title`.

| Plik | Rola |
| --- | --- |
| `src/i18n/config.ts` | Lista języków `["pl", "en"]` i język domyślny `pl`. |
| `src/i18n/routing.ts` | Konfiguracja routingu (`defineRouting`) oraz `Link`, `redirect`, `usePathname` i `useRouter` z `createNavigation`. Te wersje uwzględniają język: `Link`, `redirect` i `useRouter` dopisują prefiks, a `usePathname` zwraca ścieżkę bez prefiksu. Dlatego kod aplikacji importuje je stąd, a z `next/navigation` bierze tylko `notFound` i `useSearchParams`. |
| `src/proxy.ts` | Middleware next-intl, które ustala język żądania ([02-architektura.md](02-architektura.md#proxy)). |
| `src/i18n/request.ts` | `getRequestConfig`: dla każdego żądania ładuje teksty rdzenia i feature w ustalonym języku i scala je przez `mergeMessages`. Nieznany język zamienia na domyślny. |
| `src/i18n/merge-messages.ts` | `mergeMessages`: kładzie teksty każdego feature pod jego namespace i pilnuje, żeby nazwy się nie powtarzały. |
| `src/app/messages/{pl,en}.json` | Teksty rdzenia. |
| `src/features/<x>/i18n/{pl,en}.json` | Teksty feature `<x>`. |
| `src/app/[locale]/layout.tsx` | Zwraca 404 dla segmentu spoza listy języków, ustawia język (`setRequestLocale`) i przekazuje wszystkie teksty do `NextIntlClientProvider`. |
| `next.config.ts` | `createNextIntlPlugin("./src/i18n/request.ts")` wskazuje bibliotece plik konfiguracji żądania. |

Diagram pokazuje drogę żądania strony polskiej od proxy do komponentu, który czyta tekst:

```mermaid
flowchart TD
    req["Żądanie strony, np. /users"] --> proxy["src/proxy.ts<br/>middleware next-intl"]
    proxy -->|"język pl"| rw["rewrite na /pl/users"]
    proxy -->|"język en, adres bez /en"| redir["307 na /en/users"]
    rw --> layout["src/app/[locale]/layout.tsx<br/>setRequestLocale, getMessages()"]
    layout --> request["src/i18n/request.ts<br/>getRequestConfig"]
    request --> core["src/app/messages/pl.json"]
    request --> mods["moduleMessages.pl<br/>z src/modules.generated.ts"]
    core --> merge["mergeMessages"]
    mods --> merge
    merge --> provider["NextIntlClientProvider<br/>wszystkie teksty języka"]
    provider --> comp["useTranslations(namespace)"]
```

<a id="wykrywanie-jezyka"></a>

### Jak wybierany jest język

`src/i18n/routing.ts`

```ts
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});
```

`localePrefix: "as-needed"` oznacza, że język domyślny nie ma prefiksu w adresie: polska strona logowania to `/sign-in`, angielska `/en/sign-in`. Adres bez prefiksu proxy przepisuje wewnętrznie (**rewrite**: przeglądarka widzi ten sam adres, a Next.js renderuje `/pl/...`). Gdy wybranym językiem jest angielski, proxy odpowiada **przekierowaniem** 307 na adres z `/en`.

Konfiguracja nie ustawia opcji `localeDetection`, więc next-intl 4.14.9 przyjmuje `true` (`receiveRoutingConfig`). Język żądania wybiera wtedy w tej kolejności (`resolveLocaleFromPrefix`):

1. Prefiks w adresie (`/en/...`, `/pl/...`).
2. Ciasteczko `NEXT_LOCALE`, jeśli zawiera `pl` albo `en`. Inną wartość pomija.
3. Nagłówek `Accept-Language`, czyli lista języków, które przeglądarka wysyła według ustawień użytkownika. next-intl wybiera z niej pierwszy obsługiwany język. Gdy żaden nie pasuje, zostaje `pl`.
4. Język domyślny `pl`.

Wyniki dla typowych żądań (sprawdzone; pierwsze trzy i ostatni wiersz także na zbudowanym serwerze):

| Adres | `NEXT_LOCALE` w żądaniu | `Accept-Language` | Odpowiedź | `NEXT_LOCALE` w odpowiedzi |
| --- | --- | --- | --- | --- |
| `/sign-in` | brak | `pl-PL,pl;q=0.9` | rewrite na `/pl/sign-in`, strona polska | bez zmian |
| `/sign-in` | brak | `en-US,en;q=0.9` | 307 na `/en/sign-in` | bez zmian |
| `/pl/sign-in` | `en` | dowolny | 307 na `/sign-in` | `pl` |
| `/sign-in` | brak | `de-DE,de;q=0.9` | rewrite na `/pl/sign-in` | bez zmian |
| `/sign-in` | brak | `de-DE,de;q=0.9,en;q=0.8` | 307 na `/en/sign-in` | bez zmian |
| `/dashboard` | `en` | `pl` | 307 na `/en/dashboard` | bez zmian |
| `/dashboard` | `pl` | `en` | rewrite na `/pl/dashboard` | bez zmian |
| `/dashboard` | `de` | `en` | 307 na `/en/dashboard` | `en` |
| `/en/sign-in` | brak | `pl` | strona angielska | `en` |
| `/pl/sign-in` | brak | `pl` | 307 na `/sign-in` | bez zmian |
| `/de/sign-in` | brak | `pl` | rewrite na `/pl/de/sign-in`, czyli 404 | bez zmian |

next-intl zapisuje ciasteczko w odpowiedzi (`syncCookie`), gdy spełnione są oba warunki:

1. Żądanie ma nagłówek `sec-fetch-dest: document` albo nie ma go wcale. Przeglądarka wysyła `document` przy otwarciu strony, a inne wartości (na przykład `empty`) przy żądaniach w tle, takich jak prefetch routera Next.js. Żądania w tle nie zmieniają więc wybranego języka.
2. Zachodzi jeden z dwóch przypadków:
   - ciasteczko jest w żądaniu i ma inny język niż wybrany;
   - ciasteczka nie ma, a wybrany język różni się od języka, który next-intl wybrałby z `Accept-Language`. Brak tego nagłówka liczy się jako różnica.

Dlatego przeglądarka, która woli polski i otwiera tylko polskie adresy, ciasteczka nie dostaje. Ciasteczko ma `Path=/` i `SameSite=lax`, bez `Max-Age` i `Expires`, czyli jest sesyjne: przeglądarka usuwa je razem z końcem sesji.

Skutki dla dewelopera:

- Przy przeglądarce ustawionej na angielski proxy przekierowuje adresy bez prefiksu na `/en/...`, także zaraz po `npm run dev`.
- Jedno otwarcie strony `/en/...` zapisuje `NEXT_LOCALE=en`, więc kolejne adresy bez prefiksu przekierowują na `/en/...`.
- Wersję polską przywraca otwarcie dowolnego adresu `/pl/...`: proxy przekierowuje na adres bez prefiksu i zapisuje `NEXT_LOCALE=pl`. Na tym opiera się krok 8 w [01-uruchomienie.md](01-uruchomienie.md#pierwsze-uruchomienie).
- Testy e2e tego nie widzą: `playwright.config.ts` ustawia przeglądarce `locale: "pl"`, a żaden test nie otwiera `/en/...`.

To zachowanie domyślne biblioteki, a nie zapisana decyzja projektu ([D27](decyzje.md#d27)). Przy `localeDetection: false` next-intl pomija kroki 2 i 3, więc adres bez prefiksu zawsze daje stronę polską (sprawdzone). Decyzji o wykrywaniu języka nie zapisano; obejście i możliwe zmiany opisuje [znane-ograniczenia.md](znane-ograniczenia.md#wykrywanie-jezyka).

<a id="merge-messages"></a>

### Namespace i `mergeMessages`

`src/i18n/request.ts` ładuje teksty rdzenia, a teksty feature bierze z `moduleMessages` w rejestrze modułów. Generator wpisuje tam po jednym loaderze na feature i język, z polem `key` równym nazwie katalogu feature ([02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#rejestr-modulow)).

`src/i18n/request.ts`

```ts
  const core = (await import(`@/app/messages/${locale}.json`)).default;
  const modules = await Promise.all(
    moduleMessages[locale].map(async ({ key, load }) => ({
      key,
      messages: await load(),
    })),
  );

  return {
    locale,
    messages: mergeMessages(core, modules),
  };
```

`src/i18n/merge-messages.ts`

```ts
const NAMESPACE_KEY = /^[a-z][a-zA-Z0-9-]*$/;

export function mergeMessages(
  core: Record<string, unknown>,
  modules: ModuleMessages[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...core };
  for (const { key, messages } of modules) {
    if (!NAMESPACE_KEY.test(key)) {
      throw new Error(`Nieprawidłowy klucz namespace i18n: ${key}`);
    }
    if (Object.hasOwn(merged, key)) {
      throw new Error(`Kolizja namespace i18n: ${key}`);
    }
    merged[key] = messages;
  }
  return merged;
}
```

Jak to działa:

- Wynik to kopia tekstów rdzenia z dopisanymi namespace feature. Łączenie jest płytkie: teksty feature trafiają w całości pod jeden klucz, więc feature nie dopisze tekstu do `common` ani nie nadpisze tekstu rdzenia.
- Nazwa musi zaczynać się małą literą i może zawierać litery, cyfry i myślniki. `file-storage2` i `myFeature` przechodzą, a `my_feature`, `Notes`, `1x`, pusty napis i `__proto__` kończą się błędem `Nieprawidłowy klucz namespace i18n: <nazwa>`. Wzorzec odrzuca `__proto__`, bo przypisanie pod tę nazwę zmieniłoby prototyp obiektu zamiast dodać namespace.
- Nazwa zajęta przez rdzeń (`common`, `errors`, `sidebar`, `serviceMode`) albo przez wcześniejszy feature kończy się błędem `Kolizja namespace i18n: <nazwa>`. Sprawdzenie używa `Object.hasOwn`, więc nazwy z prototypu `Object`, na przykład `constructor`, nie są kolizją.
- Funkcja działa przy każdym żądaniu strony. Błąd przerywa ładowanie tekstów, więc żadna strona z `src/app/[locale]/` się nie wyrenderuje. Ten sam wymóg od strony nazwy katalogu feature opisuje [02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#rejestr-modulow).
- Menu boczne szuka etykiety pod `<key>.<labelKey>`, gdzie `key` pochodzi z definicji modułu, a nie z nazwy katalogu. Dlatego `key` w `module.ts` musi być równy nazwie katalogu ([D27](decyzje.md#d27)).

Wszystkie teksty bieżącego języka trafiają do przeglądarki. `src/app/[locale]/layout.tsx` przekazuje wynik `getMessages()` do `NextIntlClientProvider`, który jest komponentem klienckim, więc Next.js wysyła jego dane razem z HTML strony. Strona `/sign-in` zawiera na przykład teksty z `serviceMode`, `users` i `organizations` (sprawdzone). Nie umieszczaj więc w plikach tłumaczeń niczego, czego nie może zobaczyć niezalogowany użytkownik.

<a id="dodawanie-tekstu"></a>

### Dodawanie tekstu

1. Dopisz klucz do `src/features/<x>/i18n/pl.json` i do `en.json` tego samego feature. Klucze w rdzeniu są zapisane małymi literami z myślnikami, na przykład `toast-invite-mail-failed`. Teksty można grupować w obiekty: `organizations` ma obiekt `role` z kluczami `owner`, `admin` i `member`, a komponent czyta je ścieżką z kropką, `` t(`role.${member.role}`) `` w `organization-members.tsx`.
2. Użyj tekstu w komponencie: `useTranslations("<x>")` w komponencie klienckim, `await getTranslations("<x>")` w komponencie serwerowym. Wartości wstawiasz przez parametry w nawiasach klamrowych:

   `src/app/messages/pl.json`

   ```json
     "serviceMode": {
       "banner": "Tryb serwisowy: {name}",
   ```

   `src/shared/components/service-mode/service-mode-banner.tsx`

   ```tsx
     const t = useTranslations("serviceMode");
   // …
         <span>{t("banner", { name: organizationName })}</span>
   ```

3. Generator uruchamiasz tylko wtedy, gdy w feature pojawia się nowy plik `i18n/<locale>.json` (`npm run wa -- generate`). Rejestr importuje plik, a nie kopiuje jego treści, więc nowy klucz w istniejącym pliku generatora nie wymaga.

Tekstu wspólnego nie dopisuj do `src/app/messages/`: to pliki rdzenia, a moduł nie edytuje rdzenia ([D03](decyzje.md#d03)). Tekst feature trzymaj w jego namespace, nawet jeśli brzmi jak `common`. Jeśli tekst przyda się wszystkim projektom, zgłoś go jako poprawkę rdzenia do repozytorium kitu ([11-praca-z-kitem.md](11-praca-z-kitem.md)).

Brakujący klucz nie przerywa renderowania. next-intl zgłasza błąd `MISSING_MESSAGE` przez `console.error` i wyświetla ścieżkę klucza, na przykład `notes.missing`. Tak samo kończy się brak całego namespace, na przykład gdy feature ma tylko `pl.json`, a strona jest otwarta po angielsku (sprawdzone). TypeScript nie sprawdza kluczy, bo projekt nie deklaruje typu tekstów dla next-intl, a żaden test nie porównuje kluczy `pl.json` i `en.json`. Brak widać dopiero na stronie albo w konsoli.

<a id="dodawanie-jezyka"></a>

### Dodawanie języka

Lista języków jest zapisana w dwóch miejscach: w aplikacji i w generatorze rejestru.

1. Dopisz kod języka do `locales` w `src/i18n/config.ts`.
2. Utwórz `src/app/messages/<kod>.json` z namespace `common`, `errors`, `sidebar` i `serviceMode`.
3. Utwórz `src/features/<x>/i18n/<kod>.json` w każdym feature.
4. W CLI dopisz język do `localesSchema` w `kit/cli/src/manifest/schema.ts`, do `ALLOWED_LOCALES` i typu `Locale` w `kit/cli/src/args.ts` oraz do `kit/cli/src/generate/registry.ts`. Potem `npm run wa -- generate`.
5. `npm run verify`.

Bez kroku 4 rejestr nie ma loaderów nowego języka, a `npm run typecheck` zgłasza błąd TS7053 w `src/i18n/request.ts`, bo `moduleMessages` ma typ `Record<"pl" | "en", …>` (sprawdzone). Krok 4 zmienia kod kitu, więc taką poprawkę zgłoś do repozytorium kitu ([11-praca-z-kitem.md](11-praca-z-kitem.md)).

Nowy język od razu bierze udział w wykrywaniu z `Accept-Language`. Nie obejmuje jednak tekstów spoza plików tłumaczeń: maili, komunikatów komend i komunikatów Zod (następna sekcja).

<a id="teksty-poza-tlumaczeniami"></a>

### Teksty spoza plików tłumaczeń

Część tekstów, które widzi użytkownik, nie przechodzi przez next-intl:

| Tekst | Język | Skąd | Co widzi użytkownik wersji `en` |
| --- | --- | --- | --- |
| Temat i treść maili | polski | `src/app/emails/*.tsx`, tematy w `src/shared/lib/mailer.ts` | Ten sam polski mail. Szablony nie dostają języka. |
| Komunikaty komend (`result.error`) | polski | Napisy w kodzie komend, na przykład „Brak uprawnień”, „Potwierdź zmianę w trybie serwisowym” | Polski komunikat w toaście, bo komponenty pokazują `result.error` bez tłumaczenia. |
| Komunikaty walidacji Zod z serwera | angielski | `inviteUserCommand` zwraca pierwszy komunikat Zod (`parsed.error.issues[0]?.message`). To domyślny komunikat Zod 4, bo `inviteUserSchema` nie ma własnych, a kod nie ustawia `z.config` z innym słownikiem. | Na przykład „Too small: expected string to have >=1 characters” albo „Invalid email address”. Widać je rzadko, bo formularz sprawdza ten sam schemat przed wysłaniem i pokazuje teksty z plików tłumaczeń. |
| Komunikaty walidacji zmiennych środowiskowych | angielski z Zod, polski z `env.ts` | `parseEnv` | Nie dotyczy użytkownika; widzi je deweloper ([01-uruchomienie.md](01-uruchomienie.md#bledy-env)). |
| Wpisy `logger` | angielski z prefiksem obszaru, na przykład `[MAILER] …`; wyjątek: `handleCommandError` zapisuje polski komunikat domyślny komendy bez prefiksu, na przykład `Nie udało się zaprosić użytkownika` | Napisy w kodzie | Nie dotyczy użytkownika ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#referencja-logi)). |

Wynik komendy i jego wyświetlanie opisuje [06-wzorce-kodu.md](06-wzorce-kodu.md#wynik-i-bledy).

<a id="mail"></a>

## Maile

Aplikacja wysyła trzy rodzaje maili: reset hasła, powitanie z linkiem do ustawienia hasła i zaproszenie do organizacji. Wszystkie idą przez jedną prywatną funkcję `sendTransactionalEmail` w `src/shared/lib/mailer.ts`, która wybiera sposób wysyłki ([D18](decyzje.md#d18)).

<a id="transport"></a>

### Wybór sposobu wysyłki

`src/shared/lib/mailer.ts`

```ts
  const smtpUrl = env.SMTP_URL;
  const apiKey = env.RESEND_API_KEY;
  if (!smtpUrl && !apiKey) {
// …
    return { data: null };
  }
// …
    const delivery = smtpUrl
      ? await deliverViaSmtp(smtpUrl, message)
      : await deliverViaResend(apiKey as string, message);
```

| `SMTP_URL` | `RESEND_API_KEY` | Wysyłka | Wynik przy powodzeniu |
| --- | --- | --- | --- |
| ustawiony | dowolny | SMTP przez nodemailer. HTML powstaje z szablonu przez `render` z `@react-email/render`. | `{ data: { id: <messageId> } }` |
| brak | ustawiony | Żądanie `POST https://api.resend.com/emails`. Szablon jako `react` renderuje SDK Resend. | `{ data }` z odpowiedzi Resend |
| brak | brak | Brak. `logger.info("[MAILER] SMTP_URL and RESEND_API_KEY not set, email not sent", { to, subject })`. | `{ data: null }` |

„Brak” obejmuje pustą wartość, bo schemat zamienia pusty napis na brak zmiennej ([Reguły parsowania](#reguly-parsowania)). Wszystkie trzy wiersze są sprawdzone, z lokalnym serwerem SMTP i z podmienionym `fetch` zamiast API Resend.

Zachowanie wspólne dla obu sposobów wysyłki:

- Błąd wysyłki nie rzuca wyjątku. Wyjątek (na przykład `ECONNREFUSED`, gdy mailpit nie działa) i błąd zwrócony przez Resend kończą się wpisem `logger.error` z kontekstem, na przykład `[MAILER] Failed to send password reset email`, i wynikiem `{ error: <komunikat> }`, na przykład `{ error: "Nie udało się wysłać emaila z resetem hasła" }`. Wyjątek rzuca tylko odczyt `env.SMTP_URL` przed `try`, gdy zmienne środowiskowe są błędne.
- Wpis błędu nie zawiera pełnego adresu: `maskEmail` zostawia dwa pierwsze znaki części lokalnej, a resztę zastępuje gwiazdkami (`jan.kowalski@example.com` → `ja**********@example.com`).
- Mail ma tylko część HTML, bez wersji tekstowej. Nadawca to `EMAIL_FROM`.
- Klient SMTP i klient Resend powstają raz na proces, a `env` też jest odczytany raz ([Walidacja](#walidacja-env)). Po zmianie `SMTP_URL` albo `RESEND_API_KEY` zrestartuj serwer.

Kto obsługuje wynik:

- Reset hasła i zaproszenie do organizacji wysyła better-auth (`sendResetPassword` i `sendInvitationEmail` w `src/shared/lib/auth/index.ts`). Oba wywołania pomijają wynik, więc użytkownik widzi sukces także wtedy, gdy mail nie wyszedł.
- Mail powitalny wysyła `inviteUserCommand`. Przy `{ error }` zwraca sukces z `warning: "mail-failed"`, a okno zaproszenia pokazuje ostrzeżenie z prośbą o reset hasła. Bez `SMTP_URL` i `RESEND_API_KEY` wynik to `{ data: null }`, a nie błąd, więc zaproszenie kończy się sukcesem bez ostrzeżenia, chociaż mail nie wyszedł.

<a id="mail-produkcja"></a>

### Produkcja

`mailer.ts` nie sprawdza `NODE_ENV`. Wymóg produkcji jest w schemacie zmiennych:

`src/shared/lib/env.ts`

```ts
  .refine((value) => value.NODE_ENV !== "production" || value.RESEND_API_KEY, {
    path: ["RESEND_API_KEY"],
    message: "wymagana w produkcji",
  })
```

Skutki:

- Przy `NODE_ENV=production` brak `RESEND_API_KEY` (albo pusta wartość) kończy walidację błędem `RESEND_API_KEY: wymagana w produkcji`, także gdy ustawiono `SMTP_URL`.
- `SMTP_URL` wygrywa z Resend także na produkcji: przy obu zmiennych mail idzie przez SMTP (sprawdzone). Na produkcji zostaw `SMTP_URL` pusty, chyba że celowo wysyłasz przez własny serwer SMTP.
- Z tego korzystają testy e2e: serwery testowe działają z `NODE_ENV=production` i wysyłają do mailpit.

  `e2e/env.ts`

  ```ts
      // WHY: production mode requires RESEND_API_KEY; SMTP_URL takes precedence, so this key is never used.
      RESEND_API_KEY: "re_e2e_unused",
      SMTP_URL: process.env.SMTP_URL ?? `smtp://localhost:${mailpitSmtpPort}`,
  ```

- Na produkcji bez `OTEL_EXPORTER_OTLP_ENDPOINT` wpisy `[MAILER]`, także o nieudanej wysyłce, nigdzie nie trafiają ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#logger-cel)). SDK Resend wypisuje własny `[Resend API Error]` na konsolę tylko przy `NODE_ENV` innym niż `production`.

<a id="szablony"></a>

### Szablony

Szablony to komponenty React z biblioteki react-email w `src/app/emails/`. Wspólny układ daje `EmailLayout` (`src/app/emails/components/email-layout.tsx`): tekst podglądu w skrzynce, nagłówek i stopka z `project.name` i style Tailwind.

| Funkcja w `mailer.ts` | Szablon | Temat | Kto wysyła | Link w mailu |
| --- | --- | --- | --- | --- |
| `sendPasswordResetEmail` | `PasswordResetEmail` | „Zresetuj hasło” | better-auth, `sendResetPassword` | `resetUrl` z better-auth. Token ważny 48 godzin (`resetPasswordTokenExpiresIn: 60 * 60 * 48`), co mówi też treść maila. |
| `sendWelcomeSetPasswordEmail` | `WelcomeSetPasswordEmail` | „Witamy w WA App” (`project.name`) | `inviteUserCommand` | `createWelcomeSetPasswordUrl` z tym samym czasem ważności 48 godzin. |
| `sendOrganizationInvitationEmail` | `OrganizationInvitationEmail` | „Zaproszenie do `<nazwa organizacji>`” | plugin `organization` better-auth, `sendInvitationEmail` | `<APP_URL>/accept-invitation/<id>` ([D16](decyzje.md#d16)). |

Nowy rodzaj maila wymaga szablonu w `src/app/emails/` i eksportowanej funkcji w `mailer.ts`, bo `sendTransactionalEmail` nie jest eksportowana. Oba pliki należą do modułu `core`. W projekcie klienta to lokalna zmiana rdzenia, a moduł nie ma sposobu, żeby wysłać własny mail bez edycji rdzenia.

<a id="mailpit"></a>

### Podgląd w mailpit

Lokalnie maile zbiera mailpit z usługi `mail` w `docker-compose.yml` ([01-uruchomienie.md](01-uruchomienie.md#uslugi-compose)). `.env.example` ustawia `SMTP_URL=smtp://localhost:1025`, więc każdy mail aplikacji trafia do mailpit, a interfejs jest pod `http://localhost:8025` (inny port: [Zmiana portów](01-uruchomienie.md#zmiana-portow)).

Projekt nie ma osobnego serwera podglądu szablonów (w zależnościach nie ma CLI react-email ani skryptu do podglądu). Żeby zobaczyć szablon po zmianie, wywołaj akcję, która go wysyła:

- reset hasła: link „Zapomniałeś hasła?” na stronie logowania;
- powitanie: przycisk „Zaproś użytkownika” na stronie „Użytkownicy”, zalogowany jako administrator globalny (`admin` albo `superadmin`);
- zaproszenie do organizacji: formularz „Zaproś osobę” na stronie „Członkowie” przy `MULTI_ORG=true`, zalogowany kontem z rolą globalną `user`, które jest `owner` albo `admin` organizacji. Administrator globalny widzi pod tym samym adresem `/users` listę użytkowników, a nie formularz zaproszenia do organizacji ([04-auth-i-role.md](04-auth-i-role.md#zaproszenia)).

Testy e2e czytają maile przez API mailpit (`e2e/helpers.ts`, [08-testy.md](08-testy.md)). Gdy mail nie dociera, przejdź diagnozę z [01-uruchomienie.md](01-uruchomienie.md#typowe-problemy) („Maile nie docierają do mailpit”).

<a id="env"></a>

## Zmienne środowiskowe

<a id="walidacja-env"></a>

### Kiedy i jak działa walidacja

`src/shared/lib/env.ts` definiuje schemat Zod `coreEnvSchema`, łączy go ze schematami feature (`moduleEnvSchemas`) i eksportuje dwie rzeczy:

- `parseEnv(source)`: sprawdza podany obiekt i zwraca wynik albo rzuca jeden błąd `Nieprawidłowe zmienne środowiskowe: <ZMIENNA>: <komunikat>; <ZMIENNA>: <komunikat>`;
- `env`: obiekt, który sprawdza `process.env` przy pierwszym odczycie dowolnego pola i zapamiętuje wynik do końca działania procesu.

`src/shared/lib/env.ts`

```ts
let cachedEnv: CoreEnv | undefined;

// WHY: lazy, so importing env does not throw during `next build` or in tests without a full environment.
export const env = new Proxy({} as CoreEnv, {
  get(_target, key) {
    cachedEnv ??= parseEnv(process.env);
    return cachedEnv[key as keyof CoreEnv];
  },
});
```

Co z tego wynika dla dewelopera (kiedy pojawia się błąd, restart po zmianie `.env`, tabela komunikatów), opisuje [01-uruchomienie.md](01-uruchomienie.md#plik-env). Dwie rzeczy, których tam nie ma:

- Schematy zainstalowanych modułów (`moduleEnvSchemas`) są częścią tej samej walidacji: zła zmienna modułu, na przykład `API_KEY_PEPPER` z modułu `api-keys`, psuje `env` dla całej aplikacji, a nie tylko dla modułu ([12-moduly-kitu.md](12-moduly-kitu.md#api-keys)).
- Zmiennych spoza schematu wynik nie zawiera: `env.FOO` daje `undefined`, nawet gdy `FOO` jest w `process.env`.
- Dwa warunki produkcyjne (`RESEND_API_KEY` i sekret z `.env.example`) Zod sprawdza dopiero wtedy, gdy wszystkie pola przejdą podstawowe sprawdzenie. Przy `NODE_ENV=production`, braku `RESEND_API_KEY` i `MULTI_ORG=1` komunikat wymienia tylko `MULTI_ORG`, a błąd `RESEND_API_KEY` pojawia się po jego poprawieniu (sprawdzone).

<a id="reguly-parsowania"></a>

### Reguły parsowania

Flagi (`AUTH_PUBLIC_SIGNUP`, `MULTI_ORG`, `ADMIN_IMPERSONATION`) przechodzą przez `flag`:

`src/shared/lib/env.ts`

```ts
const flag = z
  .string()
  .optional()
  .transform((value) => value?.trim().toLowerCase() ?? "")
  .pipe(z.enum(["", "true", "false"]))
  .transform((value) => value === "true");
```

Wartość jest przycinana i zamieniana na małe litery, a potem musi być pusta, `true` albo `false`. Brak i pusta wartość dają `false`. Każda inna wartość (`1`, `yes`, `on`) jest błędem, a nie cichym `false`, żeby literówka w zmiennych produkcyjnych nie wyłączyła trybu bez śladu ([D17](decyzje.md#d17)).

Zmienne opcjonalne przechodzą przez `optionalString`:

`src/shared/lib/env.ts`

```ts
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
```

Pusta wartość znaczy to samo co brak zmiennej, dzięki czemu puste linie z `.env.example` nie włączają niczego. Każdy niepusty napis przechodzi bez zmian: schemat nie sprawdza formatu `SMTP_URL` ani `OTEL_EXPORTER_OTLP_ENDPOINT` i nie przycina spacji, więc `SMTP_URL=nie-url` przechodzi walidację i zawodzi dopiero przy wysyłce.

Pozostałe reguły (sekret, `APP_URL`, `NODE_ENV`, zmienne wymagane) są w [tabeli w Referencji](#referencja-env).

<a id="odczyt-z-pominieciem-env"></a>

### Zmienne czytane z pominięciem `env`

Walidacja chroni tylko odczyty przez `env`. Część zmiennych ze schematu kod czyta wprost z `process.env`:

| Zmienna | Kto czyta wprost | Skutek |
| --- | --- | --- |
| `DATABASE_URL` | `src/shared/lib/prisma.ts`, `prisma.config.ts` | Prisma łączy się bez walidacji pozostałych zmiennych. `env.DATABASE_URL` nie czyta żaden plik. |
| `NODE_ENV`, `OTEL_EXPORTER_OTLP_ENDPOINT` | `src/shared/lib/logger.ts` (przy imporcie), `src/instrumentation.ts` | Logger i eksport działają niezależnie od wyniku walidacji. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `scripts/admin-create.ts` (`values.password ?? process.env.ADMIN_PASSWORD`) | Pusta wartość `ADMIN_PASSWORD` działa jak brak: skrypt generuje hasło ([04-auth-i-role.md](04-auth-i-role.md#pusta-admin-password)). |

Skutek przy wdrożeniu: `/api/healthcheck` nie odczytuje `env`, więc odpowiada `200` także przy błędnych zmiennych. Błąd pojawi się dopiero przy pierwszym żądaniu, które czyta `env`, na przykład przy logowaniu, wejściu na `/dashboard` albo `/sign-up` ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#healthcheck)).

<a id="env-feature"></a>

### Zmienne feature

Feature może mieć plik `src/features/<x>/env.ts`, który eksportuje schemat Zod `envSchema`. Generator dopisuje go do `moduleEnvSchemas` w rejestrze ([02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#rejestr-modulow)), a `env.ts` łączy go ze schematem rdzenia przez `z.intersection`. Żaden feature rdzenia nie ma `env.ts`, więc `moduleEnvSchemas` jest pustą tablicą. Zachowanie połączonego schematu (sprawdzone z przykładowym schematem zmiennej `DEMO_TOKEN`):

- Wynik zawiera zmienne rdzenia i feature.
- Błędy obu schematów trafiają do jednego komunikatu, na przykład `MULTI_ORG: …; DEMO_TOKEN: Invalid input: expected string, received undefined`.
- `env` ma typ `CoreEnv`, więc odczyt `env.DEMO_TOKEN` kończy się błędem TypeScript TS2339, chociaż wartość jest w obiekcie. Kit nie ma gotowego sposobu odczytu zmiennych feature z typem.

Linie w regionie `# wa:modules:start` / `# wa:modules:end` w `.env.example` pochodzą z innego miejsca: z pola `env` manifestu modułu w `.wa/kit.json`, a nie z `env.ts` ([02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#regiony)). Generator nie porównuje tych dwóch list, więc zmienna sprawdzana przez `envSchema` może nie mieć linii w `.env.example`. Moduł `core` ma pustą listę `env`, a jego zmienne są wpisane w `.env.example` na stałe, poza regionem.

<a id="referencja"></a>

## Referencja

<a id="referencja-env"></a>

### Zmienne ze schematu `src/shared/lib/env.ts`

„Flaga” i `optionalString` opisuje [Reguły parsowania](#reguly-parsowania). „Czyta” wymienia kod aplikacji, który korzysta z wartości. `.env.example` zawiera wszystkie zmienne z tabeli poza `NODE_ENV`.

| Zmienna | Typ i parsowanie | Domyślna | Na produkcji | Czyta | Opis |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | jedna z `development`, `test`, `production` | `development` | ustawia ją `next start`, `server.js` z `output: "standalone"` i `Dockerfile` | warunki produkcyjne schematu; logger i `instrumentation.ts` czytają `process.env.NODE_ENV` | Tryb działania. Inna wartość jest błędem. |
| `DATABASE_URL` | napis, co najmniej 1 znak | brak | wymagana (zawsze) | `prisma.ts` i `prisma.config.ts` przez `process.env` | Adres PostgreSQL. |
| `BETTER_AUTH_SECRET` | napis, co najmniej 32 znaki po pominięciu spacji z brzegów; wartość nie jest przycinana | brak | wymagana (zawsze); nie może być wartością z `.env.example` | `auth` (`secret`) | Sekret better-auth do podpisywania sesji i tokenów ([D17](decyzje.md#d17)). |
| `APP_URL` | pełny adres z protokołem `http` albo `https` (`z.url`); spacje z brzegów są przycinane, a tabulatory i znaki nowej linii usuwane, ścieżka i końcowy ukośnik zostają (sprawdzone) | brak | wymagana (zawsze) | `auth` (`baseURL`), link zaproszenia | Publiczny adres aplikacji ([D16](decyzje.md#d16)). |
| `RESEND_API_KEY` | `optionalString` | brak | wymagana, także przy ustawionym `SMTP_URL` | `mailer.ts` | Klucz API Resend. Używany tylko bez `SMTP_URL`. |
| `SMTP_URL` | `optionalString`, format nie jest sprawdzany | brak | nie | `mailer.ts` | Adres serwera SMTP dla nodemailer. Ma pierwszeństwo przed Resend. |
| `EMAIL_FROM` | napis, co najmniej 1 znak, format nie jest sprawdzany | brak | wymagana (zawsze) | `mailer.ts` | Nadawca maili, na przykład `WA App <noreply@example.com>`. |
| `AUTH_PUBLIC_SIGNUP` | flaga | `false` | nie | hook `before` better-auth, strona `/sign-up` | `true`: rejestracja bez zaproszenia ([04-auth-i-role.md](04-auth-i-role.md#rejestracja)). |
| `MULTI_ORG` | flaga | `false` | nie | hook `before`, `allowUserToCreateOrganization`, `requireModuleAccess`, layout `(app)`, strona `no-organization` | `true`: wiele organizacji ([03-dane-i-organizacje.md](03-dane-i-organizacje.md#tryby-multi-org)). |
| `ADMIN_IMPERSONATION` | flaga | `false` | nie | `createAdminRoles`, hook `before`, strona użytkowników | `true`: `admin` może podszyć się pod `user` ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#impersonacja)). |
| `ADMIN_EMAIL` | `optionalString` | brak | nie | `scripts/admin-create.ts` przez `process.env` | Wartość domyślna `--email` dla `admin:create`. |
| `ADMIN_PASSWORD` | `optionalString` | brak | nie | `scripts/admin-create.ts` przez `process.env` | Wartość domyślna `--password`. Pusta wartość i same spacje znaczą brak hasła, więc skrypt je generuje ([04-auth-i-role.md](04-auth-i-role.md#pusta-admin-password)). |
| `LOG_LEVEL` | `optionalString`, dowolny napis | brak (`.env.example`: `info`) | nie | nic | Nie zmienia działania ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#log-level)). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `optionalString`, format nie jest sprawdzany | brak | schemat nie wymaga; bez niej wpisy `logger` znikają | `logger.ts` i `instrumentation.ts` przez `process.env` | Adres bazowy odbiornika OTLP przez HTTP, bez `/v1/logs` ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#otel)). |

<a id="referencja-env-poza-schematem"></a>

### Zmienne spoza schematu

Te zmienne czyta kod, konfiguracja albo biblioteki z pominięciem `env.ts`. Nie ma ich w `.env.example` i nie przechodzą walidacji.

| Zmienna | Kto czyta | Wartość domyślna i parsowanie | Opis |
| --- | --- | --- | --- |
| `DATABASE_POOL_MAX` | `src/shared/lib/prisma.ts` (`parsePoolMax`) | `parseInt`; gdy wynik nie jest dodatnią liczbą całkowitą (także przy braku zmiennej), 10 | Największa liczba połączeń w puli `pg` ([03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#schemat)). |
| `OTEL_SERVICE_NAME` | `src/instrumentation.ts` | przycinana; pusta albo brak daje `project.slug` (`wa-app`) | `service.name` w eksporcie logów. |
| `GIT_COMMIT_SHA` | `src/instrumentation.ts` | brak daje `dev`; pusta wartość zostaje pusta (`??`) | `service.version` w eksporcie logów. Nic w repozytorium jej nie ustawia: ani `Dockerfile`, ani `railway.toml`, ani workflow CI. |
| `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_EXPORTER_OTLP_LOGS_HEADERS` | eksporter OTLP (`@opentelemetry/otlp-exporter-base`) | `klucz=wartość` rozdzielone przecinkami; nagłówki z `…_LOGS_HEADERS` wygrywają | Nagłówki żądań do odbiornika logów, na przykład klucz dostępu. |
| `NEXT_RUNTIME` | `src/instrumentation.ts` | ustawia Next.js | `register()` działa tylko przy `nodejs`. |
| `PORT` | `next dev` i `next start` (opcja `-p`, domyślnie ze zmiennej `PORT`), `server.js` z `output: "standalone"` | 3000; `Dockerfile` ustawia `PORT=3000` | Port serwera. `PORT` wpisany do `.env` nie działa ([01-uruchomienie.md](01-uruchomienie.md#port-aplikacji)). |
| `HOSTNAME` | tylko `server.js` z `output: "standalone"`; `next dev` i `next start` biorą adres z opcji `-H` | `0.0.0.0`; `Dockerfile` ustawia `HOSTNAME="0.0.0.0"` | Adres, na którym serwer nasłuchuje. **Zostaw `0.0.0.0` albo `::`.** Działa też `localhost` (tak ustawiają serwery e2e w `e2e/env.ts`), ale serwer słucha wtedy tylko na loopbacku. Przy `127.0.0.1` polskie adresy bez prefiksu odpowiadają przekierowaniem 307 na ten sam adres, czyli pętlą, także za reverse proxy, a healthcheck tego nie wykryje (sprawdzone na zbudowanym serwerze). |
| `NEXT_TELEMETRY_DISABLED` | Next.js | `Dockerfile` ustawia `1` | Wyłącza telemetrię Next.js w obrazie. |
| `DB_PORT`, `MAILPIT_UI_PORT`, `MAILPIT_SMTP_PORT` | `docker-compose.yml` (z `.env` albo powłoki), `e2e/env.ts` (tylko z powłoki) | 5432, 8025, 1025 | Porty usług Dockera na komputerze. Zmiana wymaga też zmiany `DATABASE_URL` i `SMTP_URL` ([01-uruchomienie.md](01-uruchomienie.md#zmiana-portow)). |
| `INTEGRATION_DATABASE_URL` | `src/test/integration/database-url.ts` | `postgresql://postgres:postgres@localhost:5432/wa_app_test` | Baza testów integracyjnych. Nazwa musi kończyć się na `_test` ([08-testy.md](08-testy.md)). |
| `E2E_CORE_PORT`, `E2E_MULTI_ORG_PORT` | `e2e/env.ts` | 3000, 3001 | Porty dwóch serwerów e2e. |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | `e2e/env.ts` | wartości testowe zapisane w `e2e/env.ts` | Konto administratora zakładane przez `globalSetup`. |
| `MAILPIT_URL` | `e2e/env.ts` | `http://localhost:<MAILPIT_UI_PORT>` | Adres API mailpit, z którego testy czytają maile. |
| `CI` | `playwright.config.ts` | brak | Ustawiona: `forbidOnly` i raport HTML. |
