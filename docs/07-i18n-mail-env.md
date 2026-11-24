# Tłumaczenia, maile i zmienne środowiskowe

Po przeczytaniu będziesz wiedzieć:

- jak next-intl ustala język strony, kiedy przekierowuje na `/en/...` i jak dodać tekst albo nowy język;
- jak teksty feature trafiają do własnego namespace i co się dzieje przy kolizji nazw;
- którędy aplikacja wysyła maile (SMTP, Resend albo tylko wpis w logu) i czego wymaga produkcja;
- jak pakiet `@gatojs/env` (`packages/env/`) sprawdza zmienne środowiskowe przy starcie serwera i przy pierwszym odczycie `env` oraz które zmienne kod czyta z pominięciem tej walidacji;
- które zmienne poza schematem czytają kod aplikacji, Next.js, Docker i testy.

Zweryfikowano z kodem: 734391b, 2026-11-04

Źródła:

- tłumaczenia: `src/i18n/config.ts`, `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/i18n/merge-messages.ts`, `src/i18n/__tests__/merge-messages.test.ts`, `src/proxy.ts`, `next.config.ts`, `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/app/messages/pl.json`, `src/app/messages/en.json`, `src/features/account/i18n/`, `src/features/auth/i18n/`, `src/features/dashboard/i18n/`, `src/features/organizations/i18n/`, `src/features/users/i18n/`, `src/features/organizations/components/organization-members.tsx`, `src/shared/components/service-mode/service-mode-banner.tsx`, `src/modules.generated.ts`, `packages/gato-cli/src/generate/index.ts`, `packages/gato-cli/src/generate/registry.ts`, `playwright.config.ts`;
- maile: `src/shared/lib/mailer.ts`, `src/shared/lib/__tests__/mailer.test.ts`, `src/app/emails/`, `src/shared/lib/auth/index.ts`, `src/shared/lib/auth/welcome-set-password.ts`, `src/features/users/services/commands/invite-user-command.ts`, `src/features/users/contracts/user-account.schemas.ts`, `src/app/[locale]/(app)/users/page.tsx`, `src/shared/utils/error-handling.ts`, `e2e/helpers.ts`;
- zmienne środowiskowe: `packages/env/src/*.ts`, `packages/env/src/__tests__/*.test.ts`, `src/env.ts`, `src/modules.generated.ts`, `src/__tests__/env-example.test.ts`, `src/__tests__/instrumentation.test.ts`, `src/features/api-keys/env.ts`, `src/features/uploads/env.ts`, `src/features/uploads/services/storage-env.ts`, `.env.example`, `.wa/kit.json`, `src/shared/lib/prisma.ts`, `prisma.config.ts`, `scripts/admin-create.ts`, `src/shared/lib/logger.ts`, `src/instrumentation.ts`, `docker-compose.yml`, `Dockerfile`, `e2e/env.ts`, `src/test/integration/database-url.ts`;
- biblioteki (wersje w `package-lock.json`): `node_modules/next-intl/dist/esm/development/routing/config.js` (next-intl 4.14.9, `receiveRoutingConfig`), `node_modules/next-intl/dist/esm/development/middleware/resolveLocale.js`, `node_modules/next-intl/dist/esm/development/middleware/syncCookie.js`, `node_modules/@opentelemetry/otlp-exporter-base/build/src/configuration/otlp-node-http-env-configuration.js` (0.218.0), `node_modules/resend/dist/index.mjs` (resend 6.34.1, `logError`), `node_modules/next/dist/bin/next` (Next.js 16.3.8, opcje `-p` i `-H`), `node_modules/next/dist/build/index.js` i `node_modules/next/dist/shared/lib/constants.js` (Next.js 16.4.3, `NEXT_PHASE` i `PHASE_PRODUCTION_BUILD`).

Rozdział opisuje tłumaczenia, wysyłkę maili i zmienne środowiskowe, czyli infrastrukturę wspólną dla wszystkich feature. Logi, OpenTelemetry, nagłówki bezpieczeństwa i healthcheck opisuje [07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md). Pliki opisane w rozdziale należą do modułu `core`: wszystko w `src/i18n/` i `src/shared/`, pliki rdzenia w `src/app/` (między innymi `messages/`, `emails/` i layouty), a także `src/proxy.ts`, `src/instrumentation.ts` i pliki konfiguracji w katalogu głównym, na przykład `next.config.ts`, `Dockerfile` i `docker-compose.yml` (wzorce w manifeście `kit/modules/core.json` w repozytorium kitu, a w projekcie w kopii manifestu w `.wa/kit.json`). Strony i trasy modułów w `src/app/` należą do tych modułów. W repozytorium kitu test własności w bramce CLI pilnuje, żeby każdy plik z indeksu gita poza `kitOnly` i `generatedFiles` miał dokładnie jednego właściciela; w projekcie klienta tego testu nie ma ([D38](decyzje.md#d38)). Moduł korzysta z tych plików, ale ich nie edytuje ([D03](decyzje.md#d03)).

Oznaczenie „(sprawdzone)” znaczy, że zachowanie potwierdziło uruchomienie kodu z repozytorium: funkcji (`parseEnv`, `mergeMessages`, middleware next-intl, `createTranslator` z next-intl, `sendPasswordResetEmail`), kompilacji `tsc` pliku próbnego, `wa generate` i `tsc --noEmit` na kopii repozytorium (w [Dodawaniu języka](#dodawanie-jezyka)) albo serwera Next.js (zbudowanego `.next/standalone/server.js` albo `next dev`) na lokalnych portach, bez wysyłki czegokolwiek na zewnątrz.

<a id="i18n"></a>

## Tłumaczenia (next-intl)

Tłumaczenia obsługuje biblioteka next-intl. Język jest częścią adresu: trasy leżą w segmencie `src/app/[locale]/`, a wartość segmentu to jeden z języków projektu, w kicie `pl` albo `en` ([Dodawanie języka](#dodawanie-jezyka)). Teksty są w plikach JSON, które `src/i18n/request.ts` scala w jeden obiekt. **Namespace** to grupa tekstów pod jednym kluczem najwyższego poziomu tego obiektu. Komponent kliencki prosi o nią przez `useTranslations("users")`, a komponent serwerowy przez `await getTranslations("users")`.

- W plikach rdzenia (`src/app/messages/<język>.json`) namespace to klucze najwyższego poziomu: `common`, `errors`, `sidebar` i `serviceMode`.
- Plik feature trafia w całości pod jeden namespace równy nazwie katalogu feature. Jego klucze najwyższego poziomu to więc już klucze tekstów: `title` z `src/features/users/i18n/pl.json` to `users.title`, a nie `users.users.title`.

| Plik | Rola |
| --- | --- |
| `src/i18n/config.ts` | Eksportuje listę języków `locales` z `src/i18n/locales.generated.ts`, typ `Locale` i język domyślny `pl`. |
| `src/i18n/locales.generated.ts` | Plik generowany: lista języków projektu z pola `locales` w `.wa/kit.json`, w kicie `["pl", "en"]`. |
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

Języki projektu zapisuje pole `locales` w `.wa/kit.json`. Projekt wybiera je przy zakładaniu (`wa create --locales`, [16-cli-wa.md](16-cli-wa.md#create-opcje)), a bez tego pola schemat przyjmuje `["pl", "en"]`. `npm run wa -- generate` przepisuje listę do pliku generowanego, z którego importuje ją `src/i18n/config.ts` ([D33](decyzje.md#d33)):

`src/i18n/locales.generated.ts`

```ts
// generated by wa — nie edytuj. Uruchom: npm run wa -- generate
export const locales = ["pl", "en"] as const;
```

`src/i18n/config.ts`

```ts
import { locales } from "./locales.generated";

export { locales };
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pl";
```

Ten sam przebieg generatora układa `moduleMessages` w `src/modules.generated.ts`: dostaje on klucz dla każdego języka z `locales`, a w nim loader tylko tych feature, które mają plik `i18n/<język>.json`. Feature bez `en.json` nie ma więc loadera `en` (sprawdzone), a jego teksty po angielsku kończą się błędem `MISSING_MESSAGE` jak w [Dodawaniu tekstu](#dodawanie-tekstu). CLI dopuszcza tylko `pl` i `en`; `pl` jest wymagany, a języki nie mogą się powtarzać (`localesSchema` w `packages/gato-cli/src/manifest/schema.ts`).

**Wyłączenie albo włączenie `en`.** Języka nie dopisuj ręcznie w `src/i18n/locales.generated.ts`: to plik generowany, a CI porównuje go z wyjściem generatora ([D04](decyzje.md#d04)).

1. Zmień `locales` w `.wa/kit.json`, na przykład na `["pl"]` albo z powrotem na `["pl", "en"]`.
2. Przy włączaniu `en` sprawdź, że `src/app/messages/en.json` i pliki `i18n/en.json` feature istnieją. `wa create --locales pl` kopiuje je mimo to, bo kopiuje wszystkie pliki z manifestów modułów; własnym feature trzeba je dopisać.
3. `npm run wa -- generate`, potem `npm run verify`.

Przy `["pl"]` generator zmienia `src/i18n/locales.generated.ts` na `["pl"] as const` i usuwa z `src/modules.generated.ts` klucz `en` z loaderami; `tsc --noEmit` przechodzi, a pliki `en.json` zostają nieużywane. Powrót do `["pl", "en"]` przywraca oba pliki (sprawdzone).

**Trzeci język**, na przykład `de`, wymaga zmiany CLI, czyli kodu kitu. Ze zmienionym tylko `.wa/kit.json` `wa generate` kończy się kodem 1, wypisuje błąd walidacji Zod `Invalid option: expected one of "pl"|"en"` dla `locales` i nie zmienia żadnego pliku (sprawdzone). `locales` bez `pl` daje błąd `locales musi zawierać "pl"` (sprawdzone).

1. W kicie dopisz język do `localesSchema` w `packages/gato-cli/src/manifest/schema.ts`, do `ALLOWED_LOCALES` i typu `Locale` w `packages/gato-cli/src/args.ts` oraz do typów `("pl" | "en")[]` w `renderLocales` i `renderRegistry` w `packages/gato-cli/src/generate/registry.ts`. Przebuduj bundel `.wa/bin/wa.mjs` ([16b-rozwoj-kitu.md](16b-rozwoj-kitu.md#bundel)). W `packages/gato-cli/src/commands/kit-sync.ts` zmień wpisaną na stałe listę `["pl", "en"]`: `wa kit sync` zapisuje ją w `.wa/kit.json` kitu, więc bez tej zmiany cofnie dopisany tam język. Taką zmianę zgłaszasz do repozytorium kitu ([11-praca-z-kitem.md](11-praca-z-kitem.md)).
2. W projekcie z nowym bundlem dopisz język do `locales` w `.wa/kit.json`.
3. Utwórz `src/app/messages/<kod>.json` z namespace `common`, `errors`, `sidebar` i `serviceMode` oraz `src/features/<x>/i18n/<kod>.json` w każdym feature.
4. `npm run wa -- generate`, potem `npm run verify`.

Ścieżki trzeciego języka przebieg nie sprawdzał; kroki wynikają z kodu CLI wymienionego w kroku 1.

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

`sendTransactionalEmail` wywołuje `resolveMailConfig(env)` z `@gatojs/env` (`packages/env/src/mail.ts`, czysta funkcja) i dostaje jeden z wariantów `MailConfig` ([ADR-64](adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md)). Jawne `MAIL_PROVIDER` (`smtp`, `resend`, `console`; spacje z brzegów i wielkość liter bez znaczenia) wygrywa z wykrywaniem. Puste `MAIL_PROVIDER` wykrywa dostawcę z danych dostępowych:

| `MAIL_PROVIDER` | Dane | `MailConfig` | Wysyłka | Wynik przy powodzeniu |
| --- | --- | --- | --- | --- |
| puste albo `smtp` | `SMTP_URL` | `{ provider: "smtp", transport: "<SMTP_URL>" }` | SMTP przez nodemailer, `createTransport("<SMTP_URL>")`. HTML powstaje z szablonu przez `render` z `@react-email/render`. | `{ data: { id: <messageId> } }` |
| puste albo `smtp` | `SMTP_HOST` (bez `SMTP_URL`) | `{ provider: "smtp", transport: { host, port, secure, auth? } }` | SMTP przez nodemailer z opcjami: `SMTP_PORT` (domyślnie 587), `SMTP_SECURE` (domyślnie `false`), `auth: { user, pass }` tylko przy ustawionych `SMTP_USER` i `SMTP_PASS`. | `{ data: { id: <messageId> } }` |
| puste albo `resend` | `RESEND_API_KEY` (przy pustym `MAIL_PROVIDER` tylko bez `SMTP_URL` i `SMTP_HOST`) | `{ provider: "resend", apiKey }` | Żądanie `POST https://api.resend.com/emails`. Szablon jako `react` renderuje SDK Resend. | `{ data }` z odpowiedzi Resend |
| puste | brak | `{ provider: "console", explicit: false }` | Brak. `logger.info("[MAILER] mail provider is console, email not sent", { to, subject })`. Na produkcji start się nie uda ([Produkcja](#mail-produkcja)). | `{ data: null }` |
| `console` | dowolne | `{ provider: "console", explicit: true }` | Jak wyżej, także na produkcji i przy ustawionym `SMTP_HOST` albo kluczu Resend. | `{ data: null }` |

„Brak” obejmuje pustą wartość, bo schemat zamienia pusty napis na brak zmiennej ([Reguły parsowania](#reguly-parsowania)). Przy pustym `MAIL_PROVIDER` SMTP wygrywa z Resend, jak przed ADR-64. Reguły spójności (sprawdzane przy starcie w każdym `NODE_ENV`):

- `SMTP_URL` obok `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` albo `SMTP_SECURE` to błąd na tej zmiennej, na przykład `SMTP_HOST: SMTP_URL is set: drop SMTP_HOST, or drop SMTP_URL and use SMTP_HOST`. Ustawienia SMTP mają jedno źródło.
- `MAIL_PROVIDER=smtp` bez `SMTP_HOST` i `SMTP_URL` → `SMTP_HOST: SMTP_HOST or SMTP_URL is required when MAIL_PROVIDER is "smtp"`; `MAIL_PROVIDER=resend` bez klucza → `RESEND_API_KEY: RESEND_API_KEY is required when MAIL_PROVIDER is "resend"`.
- `SMTP_USER` i `SMTP_PASS` są ustawione obie albo żadna (`allOrNone`, komunikat `SMTP authentication is half-configured: …`).
- `SMTP_PORT` to liczba całkowita 1–65535; pusta wartość daje 587.

Zachowanie wspólne dla obu sposobów wysyłki:

- Błąd wysyłki nie rzuca wyjątku. Wyjątek (na przykład `ECONNREFUSED`, gdy mailpit nie działa) i błąd zwrócony przez Resend kończą się wpisem `logger.error` z kontekstem, na przykład `[MAILER] Failed to send password reset email`, i wynikiem `{ error: <komunikat> }`, na przykład `{ error: "Nie udało się wysłać emaila z resetem hasła" }`. Wyjątek rzuca tylko odczyt `env` w `resolveMailConfig(env)` przed `try`, gdy zmienne środowiskowe są błędne.
- Wpis błędu nie zawiera pełnego adresu: `maskEmail` zostawia dwa pierwsze znaki części lokalnej, a resztę zastępuje gwiazdkami (`jan.kowalski@example.com` → `ja**********@example.com`).
- Mail ma tylko część HTML, bez wersji tekstowej. Nadawca to `EMAIL_FROM`.
- Klient SMTP i klient Resend powstają raz na proces, a `env` też jest odczytany raz ([Walidacja](#walidacja-env)). Po zmianie zmiennych maili zrestartuj serwer.

Kto obsługuje wynik:

- Reset hasła i zaproszenie do organizacji wysyła better-auth (`sendResetPassword` i `sendInvitationEmail` w `src/shared/lib/auth/index.ts`). Oba wywołania pomijają wynik, więc użytkownik widzi sukces także wtedy, gdy mail nie wyszedł.
- Mail powitalny wysyła `inviteUserCommand`. Przy `{ error }` zwraca sukces z `warning: "mail-failed"`, a okno zaproszenia pokazuje ostrzeżenie z prośbą o reset hasła. Przy dostawcy `console` wynik to `{ data: null }`, a nie błąd, więc zaproszenie kończy się sukcesem bez ostrzeżenia, chociaż mail nie wyszedł.

<a id="mail-produkcja"></a>

### Produkcja

`mailer.ts` nie sprawdza `NODE_ENV`. Wymóg produkcji jest w `mailRules` (`packages/env/src/mail.ts`), które `coreEnvSchema` stosuje do surowych zmiennych ([ADR-64](adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md)).

Skutki:

- Przy `NODE_ENV=production` bez `MAIL_PROVIDER`, `SMTP_HOST`, `SMTP_URL` i `RESEND_API_KEY` start kończy się błędem `MAIL_PROVIDER: no mail provider configured for production: set SMTP_HOST, SMTP_URL or RESEND_API_KEY, or MAIL_PROVIDER=console to send no mail`. Operator nie traci po cichu zaproszeń i resetów hasła.
- Wystarczy jeden dostawca: własny serwer SMTP (`SMTP_HOST` albo `SMTP_URL`), sam `RESEND_API_KEY` (wdrożenia na Railway z kluczem startują jak wcześniej) albo jawne `MAIL_PROVIDER=console`, gdy instalacja nie wysyła maili.
- SMTP wygrywa z Resend także na produkcji, gdy `MAIL_PROVIDER` jest puste.
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

Warstwa zmiennych jest pakietem workspace `@gatojs/env` (`packages/env/`, własność `core`, [ADR-56](adrs/56-workspace-packages-replace-d29.md)). Pakiet nie zna rejestru modułów aplikacji, więc schematy feature (`moduleEnvSchemas`) dostaje jako argument. Eksportuje schemat Zod `coreEnvSchema` i:

- `checkEnv(source, moduleSchemas)`: sprawdza podany obiekt i zwraca `{ ok: true, env }` albo `{ ok: false, issues }`. Każdy problem ma `name`, czyli ścieżkę z Zod połączoną kropkami (na przykład `DATABASE_URL`), i `message`, czyli komunikat Zod. Problem bez ścieżki, który schemat feature zgłasza dla całego obiektu, ma nazwę `(env)`;
- `formatEnvReport(issues)`: składa z problemów raport startowy, opisany niżej;
- `parseEnv(source, moduleSchemas)`: woła `checkEnv` i zwraca wynik albo rzuca jeden błąd `Nieprawidłowe zmienne środowiskowe: <ZMIENNA>: <komunikat>; <ZMIENNA>: <komunikat>`;
- `verifyEnvOnStartup(source, io, moduleSchemas)`: sprawdzenie przy starcie procesu, opisane niżej;
- `processStartupIo`: obiekt `io` dla `verifyEnvOnStartup`, który przekazuje raport do `console.error`, a kod wyjścia do `process.exit`;
- `createEnv(moduleSchemas)`: zwraca obiekt `env`, który sprawdza `process.env` przy pierwszym odczycie dowolnego pola i zapamiętuje wynik do końca działania procesu;
- fragmenty `httpUrl()`, `blankAsUndefined(schema)`, `flag()` i reguły `allOrNone(names, label)`, `requiredForProvider(providerVar, value, names)` dla schematów feature ([Reguły parsowania](#reguly-parsowania)).

`wa generate` wiąże pakiet z rejestrem: `src/modules.generated.ts` kończy listy linią `export const env = createEnv(moduleEnvSchemas);`. Kod aplikacji importuje `env` (i typ `CoreEnv`) ze stałego pliku `src/env.ts`, czyli `import { env } from "@/env"`. `next.config.ts` ma `transpilePackages: ["@gatojs/env"]`, bo pakiet nie ma kroku build i eksportuje źródła TypeScript.

Serwer Next.js sprawdza zmienne przy starcie procesu, zanim obsłuży pierwsze żądanie ([D48](decyzje.md#d48)). Next.js wywołuje `register()` z `src/instrumentation.ts` przy starcie serwera (sprawdzone dla `next dev` i `server.js` z `output: "standalone"`). W Node.js (`NEXT_RUNTIME` równe `nodejs`), przed konfiguracją eksportu logów, `register()` woła:

`src/instrumentation.ts`

```ts
  const { verifyEnvOnStartup, processStartupIo } = await import("@gatojs/env");
  const { moduleEnvSchemas } = await import("@/modules.generated");
  verifyEnvOnStartup(process.env, processStartupIo, moduleEnvSchemas);
```

Import dynamiczny trzyma Zod i rejestr modułów poza paczką dla środowiska Edge, w której `register()` jest pustą funkcją (sprawdzone). Przy poprawnych zmiennych `verifyEnvOnStartup` niczego nie wypisuje. Przy błędzie wypisuje przez `console.error` raport ze wszystkimi problemami, a potem kończy proces kodem 1. Pierwsza linia raportu podaje liczbę problemów, a każda następna jeden problem w postaci `- <nazwa>: <komunikat>`. Zbudowany serwer uruchomiony bez żadnych zmiennych (`env -i PATH="$PATH" PORT=3998 node .next/standalone/server.js`) zakończył się sam po 0,43 s, bez żadnego żądania, z kodem 1, a na stderr wypisał (sprawdzone 2026-11-04):

```text
Nieprawidłowe zmienne środowiskowe (6):
- DATABASE_URL: Invalid input: expected string, received undefined
- BETTER_AUTH_SECRET: Invalid input: expected string, received undefined
- APP_URL: Invalid input: expected string, received undefined
- EMAIL_FROM: Invalid input: expected string, received undefined
- API_KEY_PEPPER: Invalid input: expected string, received undefined
- STORAGE_LOCAL_PATH: wymagana w produkcji przy STORAGE_PROVIDER=local: wskaż trwały katalog
```

Cztery pierwsze linie pochodzą ze schematu rdzenia, piąta z modułu `api-keys`, a ostatnia z modułu `uploads`: `server.js` działa z `NODE_ENV=production`, a provider `local`, domyślny bez `STORAGE_PROVIDER`, wymaga w produkcji poza Railway jawnego katalogu ([15-modul-uploads.md](15-modul-uploads.md#reguly-produkcyjne)).

`next dev` bez zmiennych kończy się tym samym raportem i kodem 1 (sprawdzone). W obu przypadkach Next.js wypisuje na stdout swój nagłówek z linią `✓ Ready` przed raportem, więc `Ready` nie znaczy, że zmienne są poprawne. Raport idzie na konsolę, a nie przez `logger`, bo na produkcji bez eksportu OTLP wpisy `logger` znikają ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#logger-cel)).

Sprawdzenia przy starcie nie ma w trzech sytuacjach:

- **Faza `next build`.** `npm run build` przechodzi bez pliku `.env` i bez zmiennych (sprawdzone), bo `next build` nie wywołuje `register()`: Next.js 16.4.3 ustawia workerom `next build` `NEXT_PHASE` równe `phase-production-build`, ale w tym projekcie żaden z nich nie wczytał `instrumentation.js` (sprawdzone). Przy tej wartości (w pakiecie stała napisowa, żeby pakiet nie zależał od `next`) `verifyEnvOnStartup` i tak wraca bez sprawdzania. To zabezpieczenie na wypadek, gdyby build kiedyś wywołał `register()`.
- **Środowisko Edge.** `register()` kończy się przed sprawdzeniem, gdy `NEXT_RUNTIME` nie jest równe `nodejs`.
- **Procesy bez serwera Next.js.** Testy Vitest, `npm run admin:create` i inne skrypty nie wywołują `register()`, więc ich zmienne sprawdza dopiero pierwszy odczyt `env`.

Obiekt `env` zostaje leniwy: sam import niczego nie sprawdza, więc nie przerywa `next build` ani testów bez pełnego środowiska.

`packages/env/src/create-env.ts`

```ts
// WHY: lazy, so importing env does not throw during `next build` or in tests without a full environment.
export function createEnv(moduleSchemas: readonly z.ZodType[]): CoreEnv {
  let cachedEnv: CoreEnv | undefined;
  return new Proxy({} as CoreEnv, {
    get(_target, key) {
      cachedEnv ??= parseEnv(process.env, moduleSchemas);
      return cachedEnv[key as keyof CoreEnv];
    },
  });
}
```

Test jednostkowy kodu, który czyta `env`, podmienia moduł `@/env` (`vi.mock("@/env", () => ({ env: { MULTI_ORG: false } }))`).

W serwerze oba sprawdzenia czytają `process.env` tym samym schematem. Restart po zmianie `.env` i tabelę komunikatów opisuje [01-uruchomienie.md](01-uruchomienie.md#plik-env). Rzeczy, których tam nie ma:

- Schematy zainstalowanych modułów (`moduleEnvSchemas`) są częścią tej samej walidacji: zła zmienna modułu, na przykład `API_KEY_PEPPER` z modułu `api-keys`, zatrzymuje start całej aplikacji, a nie tylko modułu ([14-modul-api-keys.md](14-modul-api-keys.md#pepper)).
- Zmiennych spoza schematu wynik nie zawiera: `env.FOO` daje `undefined`, nawet gdy `FOO` jest w `process.env`.
- Warunki produkcyjne Zod sprawdza dopiero wtedy, gdy przejdą podstawowe reguły tego samego schematu. W rdzeniu są to `RESEND_API_KEY` i sekret z `.env.example`, a w module `api-keys` pepper z `.env.example`. Moduł `uploads` sprawdza swoje reguły w `transform` schematu, którego pola są opcjonalnymi napisami, więc jego reguły produkcyjne raport wymienia od razu, obok braków rdzenia (sprawdzone 2026-11-04, raport wyżej). Raport i komunikat `parseEnv` nie wymieniają więc od razu wszystkiego: przy `NODE_ENV=production`, braku `RESEND_API_KEY` i `MULTI_ORG=1` wymieniają tylko `MULTI_ORG`, a błąd `RESEND_API_KEY` pojawia się po jego poprawieniu (sprawdzone). Schemat rdzenia i schematy modułów są sprawdzane niezależnie: zbudowany serwer bez `DATABASE_URL`, bez `RESEND_API_KEY` i z pepperem z `.env.example` wypisał w raporcie `DATABASE_URL` i `API_KEY_PEPPER: w produkcji nie może być wartością z .env.example`, ale nie `RESEND_API_KEY` (sprawdzone).

<a id="reguly-parsowania"></a>

### Reguły parsowania

Fragmenty są w `packages/env/src/fragments.ts`. Flagi (`AUTH_PUBLIC_SIGNUP`, `MULTI_ORG`, `ADMIN_IMPERSONATION`) przechodzą przez `flag()`:

`packages/env/src/fragments.ts`

```ts
export function flag() {
  return z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() ?? "")
    .pipe(z.enum(["", "true", "false"]))
    .transform((value) => value === "true");
}
```

Wartość jest przycinana i zamieniana na małe litery, a potem musi być pusta, `true` albo `false`. Brak i pusta wartość dają `false`. Każda inna wartość (`1`, `yes`, `on`) jest błędem, a nie cichym `false`, żeby literówka w zmiennych produkcyjnych nie wyłączyła trybu bez śladu ([D17](decyzje.md#d17)).

Zmienne opcjonalne przechodzą przez `blankAsUndefined(z.string().optional())` (w tabeli niżej: „opcjonalna”):

`packages/env/src/fragments.ts`

```ts
export function blankAsUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema,
  );
}
```

Pusta wartość i same białe znaki znaczą to samo co brak zmiennej, dzięki czemu puste linie z `.env.example` nie włączają niczego. Każdy inny napis przechodzi bez zmian i bez przycinania. Schemat nie sprawdza formatu `SMTP_URL`, więc `SMTP_URL=nie-url` przechodzi walidację i zawodzi dopiero przy wysyłce.

`httpUrl()` przyjmuje tylko pełny adres z protokołem `http` albo `https` (`z.url({ protocol: /^https?$/ })`, komunikat `Invalid URL`). Sam `z.url()` przyjmuje `localhost:4318`, bo czyta `localhost:` jako protokół; `httpUrl()` taki adres odrzuca. Używają go `APP_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT` i `S3_ENDPOINT` modułu `uploads`.

Reguły dla schematów feature (`packages/env/src/rules.ts`) zwracają funkcję dla `.superRefine(...)`. Wartość jest ustawiona, gdy jest napisem z co najmniej jednym znakiem innym niż biały:

- `allOrNone(names, label)`: gdy ustawiona jest część zmiennych z `names`, zgłasza jeden problem na pierwszej z nich: `<label> is half-configured: A, B must all be set or all be omitted (missing: B)`;
- `requiredForProvider(providerVar, value, names)`: gdy `providerVar` po przycięciu i zamianie na małe litery równa się `value`, zgłasza każdą nieustawioną zmienną z `names`: `S3_BUCKET is required when STORAGE_PROVIDER is "s3"`.

Pozostałe reguły (sekret, `APP_URL`, `NODE_ENV`, zmienne wymagane) są w [tabeli w Referencji](#referencja-env).

<a id="odczyt-z-pominieciem-env"></a>

### Zmienne czytane z pominięciem `env`

Poza serwerem Next.js, który sprawdza zmienne przy starcie, walidacja chroni tylko odczyty przez `env`. Część zmiennych ze schematu kod czyta wprost z `process.env`:

| Zmienna | Kto czyta wprost | Skutek |
| --- | --- | --- |
| `DATABASE_URL` | `src/shared/lib/prisma.ts`, `prisma.config.ts` | Prisma łączy się bez walidacji pozostałych zmiennych. `env.DATABASE_URL` nie czyta żaden plik. |
| `NODE_ENV`, `OTEL_EXPORTER_OTLP_ENDPOINT` | `src/shared/lib/logger.ts` (przy imporcie), `src/instrumentation.ts` | Logger czyta te zmienne wprost z `process.env`, bez walidacji. Start serwera i tak zależy od `verifyEnvOnStartup`: przy błędnym `env` `register()` kończy proces, zanim skonfiguruje eksport, więc serwer z błędnym `env` nie działa dalej. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `scripts/admin-create.ts` (`values.password ?? process.env.ADMIN_PASSWORD`) | Pusta wartość `ADMIN_PASSWORD` działa jak brak: skrypt generuje hasło ([04-auth-i-role.md](04-auth-i-role.md#pusta-admin-password)). |

Skutek przy wdrożeniu: `/api/healthcheck` nie odczytuje `env`, ale przy błędnych zmiennych nie odpowiada wcale, bo proces kończy się przy starcie ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#healthcheck), [10-wdrozenie.md](10-wdrozenie.md#blad-env)).

<a id="env-feature"></a>

### Zmienne feature

Feature może mieć plik `src/features/<x>/env.ts`, który eksportuje schemat Zod `envSchema`. Generator dopisuje go do `moduleEnvSchemas` w rejestrze ([02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#rejestr-modulow)), a `checkEnv` z `@gatojs/env` łączy go ze schematem rdzenia przez `z.intersection`. Żaden feature rdzenia nie ma `env.ts`, więc w projekcie z samym rdzeniem `moduleEnvSchemas` jest pustą tablicą. W kicie zawiera schematy modułów `api-keys` i `uploads` ([14b-modul-api-keys-uzycie.md](14b-modul-api-keys-uzycie.md#referencja-env), [15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md#referencja-env)). Zachowanie połączonego schematu (sprawdzone z przykładowym schematem zmiennej `DEMO_TOKEN`):

- Wynik zawiera zmienne rdzenia i feature.
- Błędy obu schematów trafiają do jednego komunikatu `parseEnv`, na przykład `MULTI_ORG: …; DEMO_TOKEN: Invalid input: expected string, received undefined`, i do jednego raportu startowego, po linii na problem.
- `env` ma typ `CoreEnv`, więc odczyt `env.DEMO_TOKEN` kończy się błędem TypeScript TS2339, chociaż wartość jest w obiekcie. Kit nie ma gotowego sposobu odczytu zmiennych feature z typem.

Linie w regionie `# wa:modules:start` / `# wa:modules:end` w `.env.example` pochodzą z innego miejsca: z pola `env` manifestu modułu w `.wa/kit.json`, a nie z `env.ts` ([02b-rejestr-i-generator.md](02b-rejestr-i-generator.md#regiony)). Generator nie porównuje tych dwóch list, więc zmienna sprawdzana przez `envSchema` może nie mieć linii w `.env.example`. Moduł `core` ma pustą listę `env`, a jego zmienne są wpisane w `.env.example` na stałe, poza regionem.

<a id="referencja"></a>

## Referencja

<a id="referencja-env"></a>

### Zmienne ze schematu `coreEnvSchema` (`@gatojs/env`)

„Flaga”, „opcjonalna” i `httpUrl()` opisuje [Reguły parsowania](#reguly-parsowania). „Czyta” wymienia kod aplikacji, który korzysta z wartości. `.env.example` zawiera wszystkie zmienne z tabeli poza `NODE_ENV`. Zmienne modułów, wpisane w region `wa:modules` w `.env.example`, opisują [14b-modul-api-keys-uzycie.md](14b-modul-api-keys-uzycie.md#referencja-env) (`API_KEY_PEPPER`) i [15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md#referencja-env) (zmienne `STORAGE_*` i `S3_*`).

| Zmienna | Typ i parsowanie | Domyślna | Na produkcji | Czyta | Opis |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | jedna z `development`, `test`, `production` | `development` | ustawia ją `next start`, `server.js` z `output: "standalone"` i `Dockerfile` | warunki produkcyjne schematu; logger i `instrumentation.ts` czytają `process.env.NODE_ENV` | Tryb działania. Inna wartość jest błędem. |
| `DATABASE_URL` | napis, co najmniej 1 znak | brak | wymagana (zawsze) | `prisma.ts` i `prisma.config.ts` przez `process.env` | Adres PostgreSQL. |
| `BETTER_AUTH_SECRET` | napis, co najmniej 32 znaki po pominięciu spacji z brzegów; wartość nie jest przycinana | brak | wymagana (zawsze); nie może być wartością z `.env.example` | `auth` (`secret`) | Sekret better-auth do podpisywania sesji i tokenów ([D17](decyzje.md#d17)). |
| `APP_URL` | `httpUrl()`: pełny adres z protokołem `http` albo `https`; spacje z brzegów są przycinane, a tabulatory i znaki nowej linii usuwane, ścieżka i końcowy ukośnik zostają (sprawdzone) | brak | wymagana (zawsze) | `auth` (`baseURL`), link zaproszenia | Publiczny adres aplikacji ([D16](decyzje.md#d16)). |
| `MAIL_PROVIDER` | opcjonalna; `smtp`, `resend` albo `console` po przycięciu spacji i zmianie na małe litery | brak (wykrywanie) | jeden dostawca maili albo `console` jest wymagany ([ADR-64](adrs/64-production-mail-needs-a-configured-provider-or-explicit-console.md)) | `mailer.ts` przez `resolveMailConfig` | Jawny wybór dostawcy maili ([Wybór sposobu wysyłki](#transport)). |
| `RESEND_API_KEY` | opcjonalna | brak | wymagana przy `MAIL_PROVIDER=resend` | `mailer.ts` | Klucz API Resend. Przy pustym `MAIL_PROVIDER` używany tylko bez `SMTP_URL` i `SMTP_HOST`. |
| `SMTP_URL` | opcjonalna, format nie jest sprawdzany | brak | nie | `mailer.ts` | Adres serwera SMTP dla nodemailer (dev i e2e: mailpit). Wyklucza `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` i `SMTP_SECURE`. |
| `SMTP_HOST` | opcjonalna | brak | nie | `mailer.ts` | Host serwera SMTP, na przykład firmowego relaya. |
| `SMTP_PORT` | liczba całkowita 1–65535 | 587 | nie | `mailer.ts` | Port serwera SMTP. |
| `SMTP_USER`, `SMTP_PASS` | opcjonalne, obie albo żadna | brak | nie | `mailer.ts` | Logowanie do serwera SMTP; bez nich połączenie bez uwierzytelnienia. |
| `SMTP_SECURE` | flaga | `false` | nie | `mailer.ts` | `true`: TLS od początku połączenia (zwykle port 465); `false`: STARTTLS, gdy serwer go oferuje. |
| `EMAIL_FROM` | napis, co najmniej 1 znak, format nie jest sprawdzany | brak | wymagana (zawsze) | `mailer.ts` | Nadawca maili, na przykład `WA App <noreply@example.com>`. |
| `AUTH_PUBLIC_SIGNUP` | flaga | `false` | nie | hook `before` better-auth, strona `/sign-up` | `true`: rejestracja bez zaproszenia ([04-auth-i-role.md](04-auth-i-role.md#rejestracja)). |
| `MULTI_ORG` | flaga | `false` | nie | hook `before`, `allowUserToCreateOrganization`, `requireModuleAccess`, layout `(app)`, strona `no-organization` | `true`: wiele organizacji ([03-dane-i-organizacje.md](03-dane-i-organizacje.md#tryby-multi-org)). |
| `ADMIN_IMPERSONATION` | flaga | `false` | nie | `createAdminRoles`, hook `before`, strona użytkowników | `true`: `admin` może podszyć się pod `user` ([04b-superadmin-i-tryb-serwisowy.md](04b-superadmin-i-tryb-serwisowy.md#impersonacja)). |
| `ADMIN_EMAIL` | opcjonalna | brak | nie | `scripts/admin-create.ts` przez `process.env` | Wartość domyślna `--email` dla `admin:create`. |
| `ADMIN_PASSWORD` | opcjonalna | brak | nie | `scripts/admin-create.ts` przez `process.env` | Wartość domyślna `--password`. Pusta wartość i same spacje znaczą brak hasła, więc skrypt je generuje ([04-auth-i-role.md](04-auth-i-role.md#pusta-admin-password)). |
| `LOG_LEVEL` | opcjonalna, dowolny napis | brak (`.env.example`: `info`) | nie | nic | Nie zmienia działania ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#log-level)). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | opcjonalna, `httpUrl()` (adres bez protokołu, na przykład `localhost:4318`, jest błędem) | brak | schemat nie wymaga; bez niej wpisy `logger` znikają | `logger.ts` i `instrumentation.ts` przez `process.env` | Adres bazowy odbiornika OTLP przez HTTP, bez `/v1/logs` ([07b-logi-naglowki-healthcheck.md](07b-logi-naglowki-healthcheck.md#otel)). |

<a id="referencja-env-poza-schematem"></a>

### Zmienne spoza schematu

Te zmienne czyta kod, konfiguracja albo biblioteki z pominięciem schematu z `env.ts`. Nie ma ich w `.env.example` i nie przechodzą walidacji.

| Zmienna | Kto czyta | Wartość domyślna i parsowanie | Opis |
| --- | --- | --- | --- |
| `DATABASE_POOL_MAX` | `src/shared/lib/prisma.ts` (`parsePoolMax`) | `parseInt`; gdy wynik nie jest dodatnią liczbą całkowitą (także przy braku zmiennej), 10 | Największa liczba połączeń w puli `pg` ([03b-schemat-i-migracje.md](03b-schemat-i-migracje.md#schemat)). |
| `OTEL_SERVICE_NAME` | `src/instrumentation.ts` | przycinana; pusta albo brak daje `project.slug` (`wa-app`) | `service.name` w eksporcie logów. |
| `GIT_COMMIT_SHA` | `src/instrumentation.ts` | brak daje `dev`; pusta wartość zostaje pusta (`??`) | `service.version` w eksporcie logów. Nic w repozytorium jej nie ustawia: ani `Dockerfile`, ani `railway.toml`, ani workflow CI. |
| `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_EXPORTER_OTLP_LOGS_HEADERS` | eksporter OTLP (`@opentelemetry/otlp-exporter-base`) | `klucz=wartość` rozdzielone przecinkami; nagłówki z `…_LOGS_HEADERS` wygrywają | Nagłówki żądań do odbiornika logów, na przykład klucz dostępu. |
| `NEXT_RUNTIME` | `src/instrumentation.ts` | ustawia Next.js | `register()` działa tylko przy `nodejs`. |
| `NEXT_PHASE` | `@gatojs/env` (`verifyEnvOnStartup`) | ustawia Next.js; `next build` daje `phase-production-build` | Przy `phase-production-build` sprawdzenie przy starcie jest pomijane ([Kiedy i jak działa walidacja](#walidacja-env)). |
| `PORT` | `next dev` i `next start` (opcja `-p`, domyślnie ze zmiennej `PORT`), `server.js` z `output: "standalone"` | 3000; `Dockerfile` ustawia `PORT=3000` | Port serwera. `PORT` wpisany do `.env` nie działa ([01-uruchomienie.md](01-uruchomienie.md#port-aplikacji)). |
| `HOSTNAME` | tylko `server.js` z `output: "standalone"`; `next dev` i `next start` biorą adres z opcji `-H` | `0.0.0.0`; `Dockerfile` ustawia `HOSTNAME="0.0.0.0"` | Adres, na którym serwer nasłuchuje. **Zostaw `0.0.0.0` albo `::`.** Działa też `localhost` (tak ustawiają serwery e2e w `e2e/env.ts`), ale serwer słucha wtedy tylko na loopbacku. Przy `127.0.0.1` polskie adresy bez prefiksu odpowiadają przekierowaniem 307 na ten sam adres, czyli pętlą, także za reverse proxy, a healthcheck tego nie wykryje (sprawdzone na zbudowanym serwerze). |
| `NEXT_TELEMETRY_DISABLED` | Next.js | `Dockerfile` ustawia `1` | Wyłącza telemetrię Next.js w obrazie. |
| `DB_PORT`, `MAILPIT_UI_PORT`, `MAILPIT_SMTP_PORT` | `docker-compose.yml` (z `.env` albo powłoki), `e2e/env.ts` (tylko z powłoki) | 5432, 8025, 1025 | Porty usług Dockera na komputerze. Zmiana wymaga też zmiany `DATABASE_URL` i `SMTP_URL` ([01-uruchomienie.md](01-uruchomienie.md#zmiana-portow)). |
| `INTEGRATION_DATABASE_URL` | `src/test/integration/database-url.ts` | `postgresql://postgres:postgres@localhost:5432/wa_app_test` | Baza testów integracyjnych. Nazwa musi kończyć się na `_test` ([08-testy.md](08-testy.md)). |
| `E2E_CORE_PORT`, `E2E_MULTI_ORG_PORT` | `e2e/env.ts` | 3000, 3001 | Porty dwóch serwerów e2e. |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | `e2e/env.ts` | wartości testowe zapisane w `e2e/env.ts` | Konto administratora zakładane przez `globalSetup`. |
| `MAILPIT_URL` | `e2e/env.ts` | `http://localhost:<MAILPIT_UI_PORT>` | Adres API mailpit, z którego testy czytają maile. |
| `CI` | `playwright.config.ts` | brak | Ustawiona: `forbidOnly` i raport HTML. |

Zmienne spoza schematu dla usług i testów modułu `uploads` (`MINIO_PORT`, `MINIO_CONSOLE_PORT`, `INTEGRATION_S3_ENDPOINT`, `INTEGRATION_S3_BUCKET`, a w testach e2e `E2E_UPLOADS_DIR` z powłoki) opisuje [15b-modul-uploads-uzycie.md](15b-modul-uploads-uzycie.md#referencja-env). Zmienne `RAILWAY_ENVIRONMENT_ID` i `RAILWAY_VOLUME_MOUNT_PATH` ustawia Railway, a czyta je schemat modułu `uploads` ([15-modul-uploads.md](15-modul-uploads.md#provider)).
